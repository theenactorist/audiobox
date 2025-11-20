const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const httpServer = createServer((req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        res.writeHead(200);
        res.end();
        return;
    }

    // Parse JSON body helper
    const parseBody = (req) => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });

    // Auth Endpoints
    if (req.url === '/api/auth/register' && req.method === 'POST') {
        parseBody(req).then(data => {
            const { email, password, securityQuestion, securityAnswer } = data;
            if (!email || !password || !securityQuestion || !securityAnswer) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing fields' }));
                return;
            }

            const users = loadUsers();
            if (users.find(u => u.email === email)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'User already exists' }));
                return;
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            const hashedAnswer = bcrypt.hashSync(securityAnswer.toLowerCase(), 10);
            const newUser = {
                id: Date.now().toString(),
                email,
                password: hashedPassword,
                securityQuestion,
                securityAnswer: hashedAnswer
            };

            users.push(newUser);
            saveUsers(users);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ user: { id: newUser.id, email: newUser.email } }));
        });
        return;
    }

    if (req.url === '/api/auth/login' && req.method === 'POST') {
        parseBody(req).then(data => {
            const { email, password } = data;
            const users = loadUsers();
            const user = users.find(u => u.email === email);

            if (!user || !bcrypt.compareSync(password, user.password)) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Invalid credentials' }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ user: { id: user.id, email: user.email } }));
        });
        return;
    }

    if (req.url === '/api/auth/recover' && req.method === 'POST') {
        parseBody(req).then(data => {
            const { email, securityAnswer, newPassword } = data;
            const users = loadUsers();
            const user = users.find(u => u.email === email);

            if (!user) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'User not found' }));
                return;
            }

            if (!bcrypt.compareSync(securityAnswer.toLowerCase(), user.securityAnswer)) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Incorrect security answer' }));
                return;
            }

            user.password = bcrypt.hashSync(newPassword, 10);
            saveUsers(users);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    // Get Security Question
    if (req.url.startsWith('/api/auth/question') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const email = url.searchParams.get('email');
        const users = loadUsers();
        const user = users.find(u => u.email === email);

        if (!user) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'User not found' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ question: user.securityQuestion }));
        return;
    }

    // Serve stream history
    if (req.url.startsWith('/api/history') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');

        let history = loadHistory();
        if (userId) {
            history = history.filter(h => h.userId === userId);
        }

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

const broadcasters = {}; // streamId -> { socketId, startTime, title, description, peakListeners, currentListeners, userId }
const HISTORY_FILE = path.join(__dirname, 'stream-history.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// User Management
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading users:', err);
    }
    return [];
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Error saving users:', err);
    }
}

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
