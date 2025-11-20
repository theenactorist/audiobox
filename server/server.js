const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs').promises;
const path = require('path');

const httpServer = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/api/history' && req.method === 'GET') {
        loadHistory()
            .then(history => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(history));
            })
            .catch(err => {
                console.error('Error loading history:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to load history' }));
            });
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

const broadcasters = {};
const HISTORY_FILE = path.join(__dirname, 'stream-history.json');
const MAX_HISTORY_ENTRIES = 50;

async function loadHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Error loading history:', err);
        }
        return [];
    }
}

async function saveHistory(history) {
    try {
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (err) {
        console.error('Error saving history:', err);
    }
}

async function addToHistory(streamData) {
    try {
        const history = await loadHistory();
        history.unshift(streamData);
        await saveHistory(history.slice(0, MAX_HISTORY_ENTRIES));
    } catch (err) {
        console.error('Error adding to history:', err);
    }
}

function validateStreamData(data) {
    return data && typeof data === 'object' && 'streamId' in data;
}

function validateListenerId(id) {
    return typeof id === 'string' && id.length > 0;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('start-stream', (data) => {
        if (!validateStreamData(data)) {
            console.warn('Invalid start-stream data from', socket.id);
            return;
        }

        const { streamId, title, description } = data;

        if (broadcasters[streamId]) {
            socket.emit('stream-exists');
            return;
        }

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

    socket.on('join-stream', (streamId) => {
        if (!validateListenerId(streamId)) {
            console.warn('Invalid join-stream data from', socket.id);
            return;
        }

        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            socket.join(streamId);

            broadcaster.currentListeners++;
            if (broadcaster.currentListeners > broadcaster.peakListeners) {
                broadcaster.peakListeners = broadcaster.currentListeners;
            }

            socket.emit('stream-metadata', {
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime
            });

            io.to(broadcaster.socketId).emit('watcher', socket.id);
            console.log(`Listener ${socket.id} joined stream ${streamId}. Current: ${broadcaster.currentListeners}`);
        } else {
            socket.emit('stream-not-found', { streamId });
        }
    });

    socket.on('offer', (id, message) => {
        if (validateListenerId(id) && message) {
            socket.to(id).emit('offer', socket.id, message);
        }
    });

    socket.on('answer', (id, message) => {
        if (validateListenerId(id) && message) {
            socket.to(id).emit('answer', socket.id, message);
        }
    });

    socket.on('candidate', (id, message) => {
        if (validateListenerId(id) && message) {
            socket.to(id).emit('candidate', socket.id, message);
        }
    });

    socket.on('disconnect', () => {
        let broadcasterStreamId = null;

        for (const [streamId, broadcaster] of Object.entries(broadcasters)) {
            const room = io.sockets.adapter.rooms.get(streamId);
            if (room && room.has(socket.id)) {
                if (socket.id === broadcaster.socketId) {
                    broadcasterStreamId = streamId;
                } else {
                    broadcaster.currentListeners = Math.max(0, broadcaster.currentListeners - 1);
                    console.log(`Listener left ${streamId}. Current: ${broadcaster.currentListeners}`);
                }
            }
        }

        if (broadcasterStreamId) {
            const broadcaster = broadcasters[broadcasterStreamId];
            const endTime = new Date().toISOString();
            const startTime = new Date(broadcaster.startTime);
            const duration = Math.floor((new Date(endTime) - startTime) / 1000);

            addToHistory({
                streamId: broadcasterStreamId,
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime,
                endTime,
                duration,
                peakListeners: broadcaster.peakListeners
            });

            delete broadcasters[broadcasterStreamId];
            io.to(broadcasterStreamId).emit('stream-ended');
            console.log(`Stream ended: ${broadcasterStreamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}`);
        }

        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
