const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { PassThrough } = require('stream');

// Explicitly set FFmpeg path for macOS (Apple Silicon) if not in PATH
const possibleFfmpegPaths = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg'
];

for (const p of possibleFfmpegPaths) {
    if (fs.existsSync(p)) {
        console.log(`Found FFmpeg at ${p}, setting path...`);
        ffmpeg.setFfmpegPath(p);
        break;
    }
}

try {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
} catch (e) {
    // dotenv is optional in production
}
const db = require('./db');
const { router: authRouter } = require('./auth');

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

// Mount auth routes
app.use('/api/auth', authRouter);

// Serve HLS files with CORS headers
// Serve HLS files with CORS headers
app.use('/hls', express.static(path.join(__dirname, 'hls'), {
    setHeaders: (res, filePath, stat) => {
        res.set('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

        // Prevent caching of m3u8 playlists for live streaming
        if (filePath.endsWith('.m3u8')) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Serve stream history
app.get('/api/history', (req, res) => {
    const userId = req.query.userId;

    try {
        let stmt;
        let data;

        if (userId) {
            stmt = db.prepare('SELECT * FROM stream_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
            data = stmt.all(userId);
        } else {
            stmt = db.prepare('SELECT * FROM stream_history ORDER BY created_at DESC LIMIT 50');
            data = stmt.all();
        }

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

// Debug heartbeat
setInterval(() => {
    const streamIds = Object.keys(hlsStreams);
    if (streamIds.length > 0) {
        console.log(`[Heartbeat] Active FFmpeg processes: ${streamIds.length} (${streamIds.join(', ')})`);
        streamIds.forEach(id => {
            const proc = hlsStreams[id].ffmpegProcess; // Access the ffmpegProcess property
            if (proc && proc.ffmpegProc) { // Check if ffmpegProc exists
                console.log(`  - Stream ${id}: PID=${proc.ffmpegProc.pid}, Killed=${proc.ffmpegProc.killed}`);
            } else {
                console.log(`  - Stream ${id}: FFmpeg process not fully initialized or missing.`);
            }
        });
    }
}, 5000);

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
const disconnectTimeouts = {}; // streamId -> timeoutId
const pendingChunks = {}; // streamId -> [Buffer]

// Add stream to history
function addToHistory(streamData) {
    try {
        db.prepare(`
            INSERT INTO stream_history (stream_id, title, description, start_time, end_time, duration, peak_listeners, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            streamData.streamId,
            streamData.title,
            streamData.description,
            streamData.startTime,
            streamData.endTime,
            streamData.duration,
            streamData.peakListeners,
            streamData.userId
        );
        console.log('Stream history saved to database');
    } catch (err) {
        console.error('Error in addToHistory:', err);
    }
}

// Check if FFmpeg is available
const { exec } = require('child_process');
// Use the path set in fluent-ffmpeg or default to 'ffmpeg'
// fluent-ffmpeg doesn't expose the set path easily in a sync way for exec, 
// so we'll just try the explicit paths again for this check or default to 'ffmpeg'
let ffmpegCommand = 'ffmpeg';
for (const p of possibleFfmpegPaths) {
    if (fs.existsSync(p)) {
        ffmpegCommand = p;
        break;
    }
}

exec(`${ffmpegCommand} -version`, (error, stdout, stderr) => {
    if (error) {
        console.error('CRITICAL: FFmpeg is NOT installed or not found in PATH:', error);
        console.error('Please install FFmpeg: brew install ffmpeg');
    } else {
        console.log('FFmpeg is installed and available:', stdout.split('\n')[0]);
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Creator starts a stream with metadata
    socket.on('start-stream', (data) => {
        const { streamId, title, description, userId } = data;

        // Check if this is a resumption of an existing stream
        if (broadcasters[streamId]) {
            // Check if the HLS process is actually running
            if (hlsStreams[streamId]) {
                console.log(`Resuming stream ${streamId} with new socket ${socket.id} and EXISTING FFmpeg process`);

                // Clear any pending disconnect timeout
                if (disconnectTimeouts[streamId]) {
                    clearTimeout(disconnectTimeouts[streamId]);
                    delete disconnectTimeouts[streamId];
                    console.log(`Cleared disconnect timeout for ${streamId}`);
                }

                // Update broadcaster socket ID
                broadcasters[streamId].socketId = socket.id;
                socket.join(streamId);
                return;
            } else {
                console.warn(`Resuming stream ${streamId} but FFmpeg process is MISSING. Restarting stream...`);
                // Fall through to create new FFmpeg process
            }
        }

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

        // Ensure HLS directory exists
        if (!fs.existsSync(hlsPath)) {
            try {
                fs.mkdirSync(hlsPath, { recursive: true });
                console.log(`Created HLS directory at ${hlsPath}`);
            } catch (err) {
                console.error(`Failed to create HLS directory: ${err.message}`);
                return;
            }
        }

        // Clean up any old segments for this stream to prevent loops
        try {
            const oldFiles = fs.readdirSync(hlsPath).filter(f => f.startsWith(streamId));
            oldFiles.forEach(f => {
                try {
                    fs.unlinkSync(path.join(hlsPath, f));
                    console.log(`Deleted old HLS file: ${f}`);
                } catch (e) {
                    console.warn(`Could not delete ${f}:`, e.message);
                }
            });
        } catch (e) {
            console.warn('Error cleaning old HLS files:', e.message);
        }

        const playlistPath = path.join(hlsPath, `${streamId}.m3u8`);

        try {
            // Create input stream
            const inputStream = new PassThrough();

            // Start FFmpeg process
            const ffmpegCommand = ffmpeg(inputStream)
                .inputFormat('webm')
                .audioCodec('aac')
                .audioBitrate('128k')
                .outputOptions([
                    '-f hls',
                    '-hls_time 4',              // 4 second segments
                    '-hls_list_size 10',        // Keep last 10 segments (40s buffer)
                    '-hls_flags delete_segments+omit_endlist', // Delete old, never mark as ended
                    '-hls_segment_type mpegts'  // Use MPEG-TS for segments
                ])
                .output(playlistPath)
                .on('start', (cmd) => {
                    console.log(`FFmpeg started for ${streamId}: ${cmd}`);
                })
                .on('codecData', (data) => {
                    console.log(`FFmpeg codec data for ${streamId}:`, data);
                })
                .on('progress', (progress) => {
                    // Log progress every few seconds to avoid spam
                    if (Math.random() < 0.05) console.log(`FFmpeg progress for ${streamId}:`, progress);
                })
                .on('error', (err, stdout, stderr) => {
                    console.error(`FFmpeg error for ${streamId}:`, err.message);
                    console.error(`FFmpeg stderr:`, stderr);
                    delete hlsStreams[streamId];
                })
                .on('end', () => {
                    console.log(`FFmpeg ended for ${streamId}`);
                    delete hlsStreams[streamId];
                });

            console.log(`Attempting to run FFmpeg command for ${streamId}...`);
            ffmpegCommand.run();

            hlsStreams[streamId] = {
                ffmpegProcess: ffmpegCommand,
                inputStream: inputStream
            };

            // Flush any buffered chunks
            if (pendingChunks[streamId] && pendingChunks[streamId].length > 0) {
                console.log(`Flushing ${pendingChunks[streamId].length} buffered chunks for ${streamId}`);
                pendingChunks[streamId].forEach(chunk => {
                    inputStream.write(chunk);
                });
                delete pendingChunks[streamId];
            }

            console.log(`HLS transcoding initialized for ${streamId}`);
        } catch (err) {
            console.error(`CRITICAL ERROR initializing FFmpeg for ${streamId}:`, err);
            // Clean up broadcaster state if FFmpeg fails to start
            delete broadcasters[streamId];
            socket.leave(streamId);
        }
    });

    // Handle audio chunks from broadcaster
    socket.on('audio-chunk', (data) => {
        const { streamId, chunk } = data;
        const hlsStream = hlsStreams[streamId];

        if (hlsStream && hlsStream.inputStream) {
            // Write chunk to FFmpeg input stream
            try {
                hlsStream.inputStream.write(Buffer.from(chunk));
            } catch (e) {
                console.error(`Error writing chunk to FFmpeg for ${streamId}:`, e);
            }
        } else {
            // Buffer chunks if stream is not yet initialized (to catch the WebM header)
            if (!pendingChunks[streamId]) {
                pendingChunks[streamId] = [];
            }
            pendingChunks[streamId].push(Buffer.from(chunk));

            // Limit buffer size to avoid memory leaks (e.g., 50 chunks)
            if (pendingChunks[streamId].length > 50) {
                pendingChunks[streamId].shift();
            }

            console.log(`Buffered chunk for ${streamId} (Total: ${pendingChunks[streamId].length}) - waiting for FFmpeg`);
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

    // Listener leaves a stream
    socket.on('leave-stream', (streamId) => {
        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            socket.leave(streamId);

            // Decrement listener count
            broadcaster.currentListeners = Math.max(0, broadcaster.currentListeners - 1);

            // Notify broadcaster
            io.to(broadcaster.socketId).emit('listener-left', socket.id);

            console.log(`Listener ${socket.id} left stream ${streamId}. Current: ${broadcaster.currentListeners}`);
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
            // Clear any pending timeout just in case
            if (disconnectTimeouts[streamId]) {
                clearTimeout(disconnectTimeouts[streamId]);
                delete disconnectTimeouts[streamId];
            }

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
            console.log(`Stream ended by user action: ${streamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}`);
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

                // Notify broadcaster
                io.to(broadcaster.socketId).emit('listener-left', socket.id);

                console.log(`Listener left ${streamId}. Current: ${broadcaster.currentListeners}`);
            }
        }

        // Handle broadcaster disconnect with GRACE PERIOD
        for (const [streamId, broadcaster] of Object.entries(broadcasters)) {
            if (broadcaster.socketId === socket.id) {
                console.log(`Broadcaster disconnected for ${streamId}. Starting 30s grace period...`);

                // Set a timeout to clean up if they don't reconnect
                disconnectTimeouts[streamId] = setTimeout(() => {
                    console.log(`Grace period expired for ${streamId}. Cleaning up...`);

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
                    delete disconnectTimeouts[streamId];
                    io.to(streamId).emit('stream-ended');
                    console.log(`Stream ended after timeout: ${streamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}`);
                }, 30000); // 30 seconds
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

// In production, serve the built client
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    // Catch-all for client-side routing (SPA)
    app.get('/{*path}', (req, res) => {
        // Don't catch API or HLS routes
        if (req.path.startsWith('/api') || req.path.startsWith('/hls') || req.path.startsWith('/socket.io')) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
    console.log('Serving built client from', clientDistPath);
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
