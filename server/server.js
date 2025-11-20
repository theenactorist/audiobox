const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "*", // Restrict in production
        methods: ["GET", "POST"]
    }
});

const broadcasters = {}; // streamId -> socketId

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Creator starts a stream
    socket.on('start-stream', (streamId) => {
        broadcasters[streamId] = socket.id;
        socket.join(streamId);
        console.log(`Stream started: ${streamId} by ${socket.id}`);
    });

    // Listener joins a stream
    socket.on('join-stream', (streamId) => {
        const broadcasterId = broadcasters[streamId];
        if (broadcasterId) {
            socket.join(streamId);
            // Notify broadcaster about new listener
            io.to(broadcasterId).emit('watcher', socket.id);
            console.log(`Listener ${socket.id} joined stream ${streamId}`);
        } else {
            socket.emit('error', 'Stream not found');
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
        // Handle broadcaster disconnect
        // Find if this socket was a broadcaster
        for (const [streamId, socketId] of Object.entries(broadcasters)) {
            if (socketId === socket.id) {
                delete broadcasters[streamId];
                io.to(streamId).emit('stream-ended');
                console.log(`Stream ended: ${streamId}`);
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
