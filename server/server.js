const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
try {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
} catch (e) {
    // dotenv is optional in production
}
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const httpServer = createServer(async (req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve stream history
    if (req.url.startsWith('/api/history') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');

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

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formattedData));
        } catch (err) {
            console.error('Error fetching history:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to fetch history' }));
        }
        return;
    }

    // Check stream status (live/offline)
    if (req.url.startsWith('/api/stream-status/') && req.method === 'GET') {
        const streamId = req.url.split('/api/stream-status/')[1];
        const broadcaster = broadcasters[streamId];

        if (broadcaster) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                isLive: true,
                metadata: {
                    title: broadcaster.title,
                    description: broadcaster.description,
                    startTime: broadcaster.startTime,
                    listenerCount: broadcaster.currentListeners
                }
            }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ isLive: false }));
        }
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
    }
});

const broadcasters = {}; // streamId -> { socketId, startTime, title, description, peakListeners, currentListeners, userId }

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
