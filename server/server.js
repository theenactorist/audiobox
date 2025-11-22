const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { PassThrough } = require('stream');

try {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
} catch (e) {
    // dotenv is optional in production
}
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

// Parse JSON bodies
app.use(express.json());

// Handle CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve HLS files
app.use('/hls', express.static(path.join(__dirname, 'hls')));

// Serve stream history
app.get('/api/history', async (req, res) => {
    const userId = req.query.userId;

    try {
        let query = supabase
            .from('stream_history')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Map to camelCase for frontend
        const formattedData = data.map(item => ({
            streamId: item.stream_id,
            title: item.title,
            description: item.description,
            startTime: item.start_time,
            endTime: item.end_time,
            duration: item.duration,
            peakListeners: item.peak_listeners,
            userId: item.user_id
        }));

        res.json(formattedData);
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Get all active streams
app.get('/api/active-streams', (req, res) => {
    const activeStreams = Object.entries(broadcasters).map(([streamId, broadcaster]) => ({
        streamId,
        title: broadcaster.title,
        description: broadcaster.description,
        startTime: broadcaster.startTime,
        listenerCount: broadcaster.currentListeners,
        hlsUrl: `/hls/${streamId}.m3u8`
    }));

    res.json(activeStreams);
});

// Check stream status (live/offline)
app.get('/api/stream-status/:streamId', (req, res) => {
    const streamId = req.params.streamId;
    const broadcaster = broadcasters[streamId];

    if (broadcaster) {
        res.json({
            isLive: true,
            metadata: {
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime,
                listenerCount: broadcaster.currentListeners
            }
        });
    } else {
        res.json({ isLive: false });
    }
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
    }
});

const broadcasters = {}; // streamId -> { socketId, startTime, title, description, peakListeners, currentListeners, userId }
const hlsStreams = {}; // streamId -> { ffmpegProcess, inputStream }

// Add stream to history
async function addToHistory(streamData) {
    try {
        const { error } = await supabase
            .from('stream_history')
            .insert([{
                stream_id: streamData.streamId,
                title: streamData.title,
                description: streamData.description,
                start_time: streamData.startTime,
                end_time: streamData.endTime,
                duration: streamData.duration,
                peak_listeners: streamData.peakListeners,
                user_id: streamData.userId
            }]);

        if (error) {
            console.error('Error saving history to Supabase:', error);
        } else {
            console.log('Stream history saved to Supabase');
        }
    } catch (err) {
        console.error('Error in addToHistory:', err);
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Creator starts a stream with metadata
    socket.on('start-stream', (data) => {
        const { streamId, title, description, userId } = data;
        broadcasters[streamId] = {
            socketId: socket.id,
            startTime: new Date().toISOString(),
            title: title || 'Untitled Stream',
            description: description || '',
            currentListeners: 0,
            peakListeners: 0,
            userId: userId || 'anonymous'
        };
        socket.join(streamId);
        console.log(`Stream started: ${streamId} by ${socket.id} (User: ${userId})`);

        // Initialize HLS transcoding for this stream
        const hlsPath = path.join(__dirname, 'hls');
        const playlistPath = path.join(hlsPath, `${streamId}.m3u8`);

        // Create input stream
        const inputStream = new PassThrough();

        // Start FFmpeg process
        const ffmpegCommand = ffmpeg(inputStream)
            .inputFormat('webm')
            .audioCodec('aac')
            .audioBitrate('128k')
            .outputOptions([
                '-f hls',
                '-hls_time 2',              // 2 second segments
                '-hls_list_size 5',         // Keep last 5 segments in playlist
                '-hls_flags delete_segments', // Auto-delete old segments
                '-hls_segment_type mpegts'  // Use MPEG-TS for segments
            ])
            .output(playlistPath)
            .on('start', (cmd) => {
                console.log(`FFmpeg started for ${streamId}: ${cmd}`);
            })
            .on('error', (err) => {
                console.error(`FFmpeg error for ${streamId}:`, err.message);
                delete hlsStreams[streamId];
            })
            .on('end', () => {
                console.log(`FFmpeg ended for ${streamId}`);
                delete hlsStreams[streamId];
            });

        ffmpegCommand.run();

        hlsStreams[streamId] = {
            ffmpegProcess: ffmpegCommand,
            inputStream: inputStream
        };

        console.log(`HLS transcoding initialized for ${streamId}`);
    });

    // Handle audio chunks from broadcaster
    socket.on('audio-chunk', (data) => {
        const { streamId, chunk } = data;
        const hlsStream = hlsStreams[streamId];

        if (hlsStream && hlsStream.inputStream) {
            // Write chunk to FFmpeg input stream
            hlsStream.inputStream.write(Buffer.from(chunk));
        }
    });

    // Listener joins a stream
    socket.on('join-stream', (streamId) => {
        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            socket.join(streamId);

            // Update listener count
            broadcaster.currentListeners++;
            if (broadcaster.currentListeners > broadcaster.peakListeners) {
                broadcaster.peakListeners = broadcaster.currentListeners;
            }

            // Send stream metadata to the listener
            socket.emit('stream-metadata', {
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime
            });

            // Notify broadcaster about new listener
            io.to(broadcaster.socketId).emit('watcher', socket.id);
            console.log(`Listener ${socket.id} joined stream ${streamId}. Current: ${broadcaster.currentListeners}`);
        } else {
            socket.emit('stream-not-found', { streamId });
        }
    });

    // WebRTC Signaling
    socket.on('offer', (id, message) => {
        socket.to(id).emit('offer', socket.id, message);
    });

    socket.on('answer', (id, message) => {
        socket.to(id).emit('answer', socket.id, message);
    });

    socket.on('candidate', (id, message) => {
        socket.to(id).emit('candidate', socket.id, message);
    });

    // Handle explicit stream end (before disconnect)
    socket.on('end-stream', (data) => {
        const { streamId } = data;
        const broadcaster = broadcasters[streamId];

        if (broadcaster && broadcaster.socketId === socket.id) {
            const endTime = new Date().toISOString();
            const startTime = new Date(broadcaster.startTime);
            const duration = Math.floor((new Date(endTime) - startTime) / 1000); // seconds

            // Cleanup HLS stream
            const hlsStream = hlsStreams[streamId];
            if (hlsStream) {
                hlsStream.inputStream.end();
                hlsStream.ffmpegProcess.kill('SIGINT');
                delete hlsStreams[streamId];
                console.log(`HLS stream cleaned up for ${streamId}`);
            }

            // Save to history
            addToHistory({
                streamId,
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime,
                endTime,
                duration,
                peakListeners: broadcaster.peakListeners,
                userId: broadcaster.userId
            });

            delete broadcasters[streamId];
            io.to(streamId).emit('stream-ended');
            console.log(`Stream ended manually: ${streamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}`);
        }
    });

    // Update stream metadata without restarting
    socket.on('update-metadata', (data) => {
        const { streamId, title, description } = data;
        const broadcaster = broadcasters[streamId];
        if (broadcaster && broadcaster.socketId === socket.id) {
            broadcaster.title = title || broadcaster.title;
            broadcaster.description = description || broadcaster.description;

            // Broadcast updated metadata to all listeners
            io.to(streamId).emit('metadata-updated', {
                title: broadcaster.title,
                description: broadcaster.description
            });

            console.log(`Metadata updated for stream ${streamId}: ${title}`);
        }
    });

    socket.on('disconnect', () => {
        // Check if disconnecting socket was a listener
        for (const [streamId, broadcaster] of Object.entries(broadcasters)) {
            const room = io.sockets.adapter.rooms.get(streamId);
            if (room && room.has(socket.id) && socket.id !== broadcaster.socketId) {
                broadcaster.currentListeners = Math.max(0, broadcaster.currentListeners - 1);
                console.log(`Listener left ${streamId}. Current: ${broadcaster.currentListeners}`);
            }
        }

        // Handle broadcaster disconnect
        for (const [streamId, broadcaster] of Object.entries(broadcasters)) {
            if (broadcaster.socketId === socket.id) {
                const endTime = new Date().toISOString();
                const startTime = new Date(broadcaster.startTime);
                const duration = Math.floor((new Date(endTime) - startTime) / 1000); // seconds

                // Cleanup HLS stream
                const hlsStream = hlsStreams[streamId];
                if (hlsStream) {
                    hlsStream.inputStream.end();
                    hlsStream.ffmpegProcess.kill('SIGINT');
                    delete hlsStreams[streamId];
                    console.log(`HLS stream cleaned up for ${streamId}`);
                }

                // Save to history
                addToHistory({
                    streamId,
                    title: broadcaster.title,
                    description: broadcaster.description,
                    startTime: broadcaster.startTime,
                    endTime,
                    duration,
                    peakListeners: broadcaster.peakListeners,
                    userId: broadcaster.userId
                });

                delete broadcasters[streamId];
                io.to(streamId).emit('stream-ended');
                console.log(`Stream ended: ${streamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}`);
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
