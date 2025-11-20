const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const httpServer = createServer((req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve stream history
    if (req.url === '/api/history' && req.method === 'GET') {
        const history = loadHistory();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(history));
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

const broadcasters = {}; // streamId -> { socketId, startTime, title, description, peakListeners, currentListeners }
const HISTORY_FILE = path.join(__dirname, 'stream-history.json');

// Load existing history
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading history:', err);
    }
    return [];
}

// Save history
function saveHistory(history) {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (err) {
        console.error('Error saving history:', err);
    }
}

// Add stream to history
function addToHistory(streamData) {
    const history = loadHistory();
    history.unshift(streamData); // Add to beginning
    saveHistory(history.slice(0, 50)); // Keep last 50 streams
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Creator starts a stream with metadata
    socket.on('start-stream', (data) => {
        const { streamId, title, description } = data;
        broadcasters[streamId] = {
            socketId: socket.id,
            startTime: new Date().toISOString(),
            title: title || 'Untitled Stream',
            description: description || '',
            currentListeners: 0,
            peakListeners: 0
        };
        socket.join(streamId);
        console.log(`Stream started: ${streamId} by ${socket.id}`);
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
                    peakListeners: broadcaster.peakListeners
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
