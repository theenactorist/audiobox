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
const { router: authRouter, authenticateToken } = require('./auth');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Handle CORS — allowlist approach for multi-origin architecture
// (same-origin app + cross-origin CDN HLS fetches)
const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://localhost:3001',
    'https://audiobox.wearethenew.org',
]);
// Add the production frontend URL(s) if configured
if (process.env.FRONTEND_URL) {
    ALLOWED_ORIGINS.add(process.env.FRONTEND_URL);
}
// Also allow the Railway-assigned URL if available
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    ALLOWED_ORIGINS.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        // No origin header = same-origin request or non-browser (curl, CDN pull, etc.)
        // Allow these through — they aren't subject to CORS anyway
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    // If origin is present but NOT in the allowlist, we intentionally
    // do NOT set the header, so the browser blocks the request.
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Mount auth routes
app.use('/api/auth', authRouter);

// Serve HLS files with CORS headers
// CDN pull-zone fetches these server-to-server (no Origin header),
// but browser direct-fetches also happen. Allow all origins for
// public audio content — no secrets here.
app.use('/hls', express.static(path.join(__dirname, 'hls'), {
    setHeaders: (res, filePath, stat) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

        // Prevent caching of m3u8 playlists for live streaming
        if (filePath.endsWith('.m3u8')) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.ts')) {
            // Aggressive caching for audio segments since they never change once created
            res.set('Cache-Control', 'public, max-age=60, s-maxage=120');
        }
    }
}));

// Serve stream history
app.get('/api/history', authenticateToken, (req, res) => {
    const userId = req.query.userId;

    // IDOR protection
    if (userId && userId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: Cannot access other users history' });
    }

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
    const hlsDir = path.join(__dirname, 'hls');
    const activeStreams = [];

    for (const [streamId, broadcaster] of Object.entries(broadcasters)) {
        const playlistFile = path.join(hlsDir, `${streamId}.m3u8`);

        // Only include streams that actually have HLS files (or fallback gracefully if just starting)
        if (fs.existsSync(playlistFile)) {
            activeStreams.push({
                streamId,
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime,
                listenerCount: broadcaster.currentListeners,
                hlsUrl: `https://audiobox-thenew.b-cdn.net/hls/${streamId}.m3u8`,
                userId: broadcaster.userId,
                hostPlatform: broadcaster.hostDevice ? broadcaster.hostDevice.platform : 'unknown'
            });
        }
        // CRITICAL BUG FIX: Removed the "else" block that deleted streams without an m3u8 file.
        // A GET API should never have aggressive side-effects like killing a stream.
        // Because FFmpeg takes ~4s to write the first .m3u8 file, querying this endpoint
        // within the first 4 seconds of a stream was instantly killing it.
    }

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
                listenerCount: broadcaster.currentListeners,
                isPublic: broadcaster.isPublic
            }
        });
    } else {
        res.json({ isLive: false });
    }
});

// Get the latest public broadcast for the Listen page offline state
app.get('/api/latest-public-broadcast', (req, res) => {
    try {
        const stmt = db.prepare('SELECT title, start_time FROM stream_history WHERE is_public = 1 ORDER BY start_time DESC LIMIT 1');
        const data = stmt.get();

        if (data) {
            res.json({
                hasBroadcast: true,
                title: data.title,
                startTime: data.start_time
            });
        } else {
            res.json({ hasBroadcast: false });
        }
    } catch (err) {
        console.error('Error fetching latest public broadcast:', err);
        res.status(500).json({ error: 'Failed to fetch latest public broadcast' });
    }
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || ALLOWED_ORIGINS.has(origin)) {
                callback(null, true);
            } else {
                callback(new Error('CORS not allowed'));
            }
        },
        methods: ["GET", "POST"]
    }
});

const broadcasters = {}; // streamId -> { socketId, startTime, title, description, peakListeners, currentListeners, userId, isPublic }
const hlsStreams = {}; // streamId -> { ffmpegProcess, inputStream }
const disconnectTimeouts = {}; // streamId -> timeoutId
const gracePeriodTimeouts = {}; // streamId -> timeoutId for end-stream grace period
const pendingChunks = {}; // streamId -> [Buffer]
const streamListeners = {}; // streamId -> Set<socketId> — tracks unique listeners
const socketStreams = {}; // socketId -> Set<streamId> — tracks which streams a socket joined
const lastChunkTime = {}; // streamId -> timestamp (ms) of last received audio chunk
const chunkGapState = {}; // streamId -> { inGap: boolean, gapStart: number } — tracks whether we're in a gap

// Add stream to history
function addToHistory(streamData) {
    try {
        db.prepare(`
            INSERT INTO stream_history (stream_id, title, description, start_time, end_time, duration, peak_listeners, user_id, is_public)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            streamData.streamId,
            streamData.title,
            streamData.description,
            streamData.startTime,
            streamData.endTime,
            streamData.duration,
            streamData.peakListeners,
            streamData.userId,
            streamData.isPublic ? 1 : 0
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

// Helper: Initialize FFmpeg for HLS transcoding of a stream.
// Called lazily when the first audio chunk arrives — NOT during start-stream.
// This guarantees FFmpeg's first bytes are always a valid WebM EBML header.
function initFFmpeg(streamId) {
    if (hlsStreams[streamId]) {
        console.warn(`initFFmpeg called but FFmpeg already exists for ${streamId}, skipping`);
        return hlsStreams[streamId];
    }

    const hlsPath = path.join(__dirname, 'hls');

    // Ensure HLS directory exists
    if (!fs.existsSync(hlsPath)) {
        try {
            fs.mkdirSync(hlsPath, { recursive: true });
            console.log(`Created HLS directory at ${hlsPath}`);
        } catch (err) {
            console.error(`Failed to create HLS directory: ${err.message}`);
            return null;
        }
    }

    // Clean up any old segments for this stream to prevent stale audio loops
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
        const inputStream = new PassThrough();

        const ffmpegCmd = ffmpeg(inputStream)
            .inputFormat('webm')
            .inputOptions([
                '-fflags +genpts',
                '-async 1'
            ])
            .audioCodec('aac')
            .audioBitrate('128k')
            .audioFrequency(48000)
            .outputOptions([
                '-f hls',
                '-hls_time 4',
                '-hls_list_size 10',
                '-hls_flags delete_segments+omit_endlist',
                '-hls_segment_type mpegts'
            ])
            .output(playlistPath)
            .on('start', (cmd) => {
                console.log(`FFmpeg started for ${streamId}: ${cmd}`);
            })
            .on('codecData', (data) => {
                console.log(`FFmpeg codec data for ${streamId}:`, data);
            })
            .on('progress', (progress) => {
                if (Math.random() < 0.05) console.log(`FFmpeg progress for ${streamId}:`, progress);
            })
            .on('error', (err, stdout, stderr) => {
                console.error(`FFmpeg error for ${streamId}:`, err.message);
                console.error(`FFmpeg stderr:`, stderr);
                // Only clean up if THIS instance is still the active one (prevents race conditions)
                if (hlsStreams[streamId] && hlsStreams[streamId].ffmpegProcess === ffmpegCmd) {
                    delete hlsStreams[streamId];
                }
            })
            .on('end', () => {
                console.log(`FFmpeg ended for ${streamId}`);
                if (hlsStreams[streamId] && hlsStreams[streamId].ffmpegProcess === ffmpegCmd) {
                    delete hlsStreams[streamId];
                }
            });

        console.log(`Attempting to run FFmpeg command for ${streamId}...`);
        ffmpegCmd.run();

        const entry = {
            ffmpegProcess: ffmpegCmd,
            inputStream: inputStream
        };
        hlsStreams[streamId] = entry;

        console.log(`HLS transcoding initialized for ${streamId}`);

        // Notify all listeners that the stream has restarted so they auto-reload HLS.
        // Delay by 8 seconds to let FFmpeg generate the first HLS segment.
        setTimeout(() => {
            io.to(streamId).emit('stream-restarted', { streamId });
            console.log(`Emitted stream-restarted to listeners of ${streamId}`);
        }, 8000);

        return entry;
    } catch (err) {
        console.error(`CRITICAL ERROR initializing FFmpeg for ${streamId}:`, err);
        return null;
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Creator starts a stream with metadata
    // NOTE: FFmpeg is NOT started here. It's initialized lazily in the audio-chunk handler
    // when the first chunk arrives. This guarantees FFmpeg's first bytes are a valid EBML header.
    socket.on('start-stream', (data) => {
        const { streamId, title, description, userId, isPublic, deviceInfo } = data;

        // Build device summary for logging
        const socketUA = socket.handshake?.headers?.['user-agent'] || 'unknown';
        const hostDevice = deviceInfo ? {
            platform: deviceInfo.platform,       // 'web' or 'app-android' or 'app-ios'
            userAgent: deviceInfo.userAgent || socketUA,
            screen: `${deviceInfo.screenWidth}x${deviceInfo.screenHeight}`,
        } : {
            platform: 'unknown (old client)',
            userAgent: socketUA,
            screen: 'unknown',
        };

        // Check if this is a resumption of an existing stream
        if (broadcasters[streamId]) {
            // Clear any pending disconnect timeout
            if (disconnectTimeouts[streamId]) {
                clearTimeout(disconnectTimeouts[streamId]);
                delete disconnectTimeouts[streamId];
                console.log(`Cleared disconnect timeout for ${streamId}`);
            }

            // CRITICAL: Clear any stale grace period timer from a previous end-stream.
            // Without this, going live again within 25s fires stream-ended into the room.
            if (gracePeriodTimeouts[streamId]) {
                clearTimeout(gracePeriodTimeouts[streamId]);
                delete gracePeriodTimeouts[streamId];
                console.log(`Cleared stale end-stream grace period for ${streamId}`);
            }

            // Update broadcaster socket ID
            broadcasters[streamId].socketId = socket.id;
            socket.join(streamId);

            // Kill old FFmpeg if it exists — the new MediaRecorder will produce a fresh
            // WebM container and FFmpeg will be re-created lazily on the first new chunk.
            if (hlsStreams[streamId]) {
                console.log(`Killing stale FFmpeg for ${streamId} — will restart lazily on first chunk`);
                try {
                    hlsStreams[streamId].inputStream.end();
                    hlsStreams[streamId].ffmpegProcess.kill('SIGINT');
                } catch (e) {
                    console.error(`Error killing old FFmpeg for ${streamId}:`, e);
                }
                delete hlsStreams[streamId];
            }

            // Clear pending chunks to ensure clean state
            pendingChunks[streamId] = [];
            console.log(`Resuming stream ${streamId} with new socket ${socket.id} [${hostDevice.platform}] — FFmpeg will start on first chunk`);
            return; // Don't overwrite broadcaster metadata on resumption
        }

        // New stream — register broadcaster
        // CRITICAL: Clear any stale grace period timer from a previous end-stream on this streamId.
        if (gracePeriodTimeouts[streamId]) {
            clearTimeout(gracePeriodTimeouts[streamId]);
            delete gracePeriodTimeouts[streamId];
            console.log(`Cleared stale end-stream grace period for ${streamId} (new stream)`);
        }
        broadcasters[streamId] = {
            socketId: socket.id,
            startTime: new Date().toISOString(),
            title: title || 'Untitled Stream',
            description: description || '',
            currentListeners: 0,
            peakListeners: 0,
            userId: userId || 'anonymous',
            isPublic: isPublic !== undefined ? isPublic : true,
            hostDevice: hostDevice
        };
        pendingChunks[streamId] = [];
        socket.join(streamId);
        console.log(`Stream started: ${streamId} by ${socket.id} (User: ${userId}) [Platform: ${hostDevice.platform}] [Screen: ${hostDevice.screen}] [UA: ${hostDevice.userAgent.substring(0, 80)}] — FFmpeg will start on first chunk`);
    });

    // Allow a monitoring device to take over the broadcast
    socket.on('takeover-broadcast', (data) => {
        const { streamId, userId } = data;

        if (!broadcasters[streamId]) {
            socket.emit('takeover-failed', { reason: 'No active stream to take over' });
            return;
        }

        const oldSocketId = broadcasters[streamId].socketId;

        // Don't takeover from yourself
        if (oldSocketId === socket.id) {
            socket.emit('takeover-failed', { reason: 'You are already broadcasting' });
            return;
        }

        console.log(`Broadcast takeover: ${streamId} from socket ${oldSocketId} to ${socket.id} (User: ${userId})`);

        // Notify the old broadcaster that they've been taken over
        io.to(oldSocketId).emit('broadcast-taken-over', {
            streamId,
            takenOverBy: userId || 'another device'
        });

        // Transfer broadcaster socket ID to the new device
        broadcasters[streamId].socketId = socket.id;
        socket.join(streamId);

        // CRITICAL: Cancel any pending disconnect grace period timer.
        // Without this, a crash → takeover will still kill the stream when the old timer fires.
        if (disconnectTimeouts[streamId]) {
            clearTimeout(disconnectTimeouts[streamId]);
            delete disconnectTimeouts[streamId];
            console.log(`Cleared disconnect timeout for ${streamId} (takeover)`);
        }

        // CRITICAL: Kill old FFmpeg so the new host's first chunk triggers lazy init
        // with a fresh EBML header. Without this, chunks go to the old FFmpeg which
        // can't parse a second EBML header, and stream-restarted never fires.
        if (hlsStreams[streamId]) {
            console.log(`Killing FFmpeg for ${streamId} (takeover) — will restart lazily on first chunk from new host`);
            try {
                hlsStreams[streamId].inputStream.end();
                hlsStreams[streamId].ffmpegProcess.kill('SIGINT');
            } catch (e) {
                console.error(`Error killing FFmpeg during takeover for ${streamId}:`, e);
            }
            delete hlsStreams[streamId];
        }

        // Clear pending chunks so new device can start with fresh EBML header
        pendingChunks[streamId] = [];

        // Notify the new broadcaster that takeover was successful
        socket.emit('takeover-success', {
            streamId,
            title: broadcasters[streamId].title,
            description: broadcasters[streamId].description,
            startTime: broadcasters[streamId].startTime
        });

        console.log(`Takeover complete for ${streamId}`);
    });

    // Handle audio chunks from broadcaster
    socket.on('audio-chunk', (data) => {
        const { streamId, chunk } = data;

        // CRITICAL: Prevent duplicate audio echoes from unauthorized sockets
        if (broadcasters[streamId] && broadcasters[streamId].socketId !== socket.id) {
            return;
        }

        const now = Date.now();
        const chunkBuffer = Buffer.from(chunk);

        // --- Chunk Gap Detection ---
        // Only log when gaps start/end to avoid flooding logs
        const GAP_THRESHOLD_MS = 10000; // 10 seconds = 2+ missed 4s chunks
        if (lastChunkTime[streamId]) {
            const delta = now - lastChunkTime[streamId];
            if (delta > GAP_THRESHOLD_MS) {
                if (!chunkGapState[streamId]?.inGap) {
                    // Gap just detected (on the chunk that arrives after the silence)
                    chunkGapState[streamId] = { inGap: true, gapStart: lastChunkTime[streamId] };
                }
                // Log the resume
                const gapSec = (delta / 1000).toFixed(1);
                console.log(`[Chunk Gap] Stream ${streamId}: Chunks resumed after ${gapSec}s gap (last chunk at ${new Date(lastChunkTime[streamId]).toISOString()})`);
                chunkGapState[streamId] = { inGap: false, gapStart: 0 };
            } else if (chunkGapState[streamId]?.inGap) {
                // Was in gap but now chunks are flowing normally
                chunkGapState[streamId] = { inGap: false, gapStart: 0 };
            }
        }
        lastChunkTime[streamId] = now;

        // LAZY FFMPEG INIT: Start FFmpeg on the FIRST audio chunk.
        // This guarantees the EBML header is the first thing FFmpeg reads.
        // No more race conditions, no more empty pipe crashes.
        let hlsStream = hlsStreams[streamId];
        if (!hlsStream) {
            console.log(`First audio chunk for ${streamId} — initializing FFmpeg lazily`);
            hlsStream = initFFmpeg(streamId);
            if (!hlsStream) {
                console.error(`Failed to initialize FFmpeg for ${streamId}, dropping chunk`);
                return;
            }
        }

        if (hlsStream && hlsStream.inputStream) {
            try {
                hlsStream.inputStream.write(chunkBuffer);
            } catch (e) {
                console.error(`Error writing chunk to FFmpeg for ${streamId}:`, e);
            }
        }
    });

    // Listener joins a stream (for metadata updates only)
    socket.on('join-stream', (streamId) => {
        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            socket.join(streamId);

            // Send stream metadata to the listener
            socket.emit('stream-metadata', {
                title: broadcaster.title,
                description: broadcaster.description,
                startTime: broadcaster.startTime
            });
        } else {
            socket.emit('stream-not-found', { streamId });
        }
    });

    // Listener actively starts hearing audio
    socket.on('start-listening', (streamId) => {
        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            if (!streamListeners[streamId]) streamListeners[streamId] = new Set();
            if (!socketStreams[socket.id]) socketStreams[socket.id] = new Set();

            const isNewListener = !streamListeners[streamId].has(socket.id);

            streamListeners[streamId].add(socket.id);
            socketStreams[socket.id].add(streamId);

            broadcaster.currentListeners = streamListeners[streamId].size;
            if (broadcaster.currentListeners > broadcaster.peakListeners) {
                broadcaster.peakListeners = broadcaster.currentListeners;
            }

            if (isNewListener) {
                io.to(broadcaster.socketId).emit('watcher', socket.id);
                // Broadcast updated count to ALL sockets in the room (listeners + broadcaster)
                io.to(streamId).emit('listener-count', { count: broadcaster.currentListeners });
                console.log(`Listener ${socket.id} started listening to stream ${streamId}. Current: ${broadcaster.currentListeners}`);
            }
        }
    });

    // Listener stops hearing audio (pauses or disconnects)
    socket.on('stop-listening', (streamId) => {
        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            if (streamListeners[streamId]) streamListeners[streamId].delete(socket.id);
            if (socketStreams[socket.id]) socketStreams[socket.id].delete(streamId);

            broadcaster.currentListeners = streamListeners[streamId] ? streamListeners[streamId].size : 0;
            io.to(broadcaster.socketId).emit('listener-left', socket.id);
            io.to(streamId).emit('listener-count', { count: broadcaster.currentListeners });
            console.log(`Listener ${socket.id} stopped listening to stream ${streamId}. Current: ${broadcaster.currentListeners}`);
        }
    });

    // Listener completely leaves the page/stream
    socket.on('leave-stream', (streamId) => {
        socket.leave(streamId);

        const broadcaster = broadcasters[streamId];
        if (broadcaster) {
            if (streamListeners[streamId]) streamListeners[streamId].delete(socket.id);
            if (socketStreams[socket.id]) socketStreams[socket.id].delete(streamId);

            broadcaster.currentListeners = streamListeners[streamId] ? streamListeners[streamId].size : 0;
            io.to(broadcaster.socketId).emit('listener-left', socket.id);
            io.to(streamId).emit('listener-count', { count: broadcaster.currentListeners });
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
        const { streamId, userId } = data;
        const broadcaster = broadcasters[streamId];

        // Allow end-stream from the broadcaster socket OR any socket with matching userId
        if (broadcaster && (broadcaster.socketId === socket.id || (userId && broadcaster.userId === userId))) {
            // Clear any pending timeout just in case
            if (disconnectTimeouts[streamId]) {
                clearTimeout(disconnectTimeouts[streamId]);
                delete disconnectTimeouts[streamId];
            }

            const endTime = new Date().toISOString();
            const startTime = new Date(broadcaster.startTime);
            const duration = Math.floor((new Date(endTime) - startTime) / 1000); // seconds

            // Step 1: Stop FFmpeg gracefully — write #EXT-X-ENDLIST to signal end of stream
            const hlsStream = hlsStreams[streamId];
            if (hlsStream) {
                hlsStream.inputStream.end(); // Stop sending audio data to FFmpeg
                // Send SIGINT (graceful stop) so FFmpeg writes the final segment + #EXT-X-ENDLIST
                hlsStream.ffmpegProcess.kill('SIGINT');
                delete hlsStreams[streamId];
                console.log(`HLS stream stopped gracefully for ${streamId} — final segments being written`);
            }

            // Save to history immediately
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

            // Remove broadcaster record immediately (prevents new listeners from joining)
            delete broadcasters[streamId];
            delete lastChunkTime[streamId];
            delete chunkGapState[streamId];

            // Step 2: Grace period — let listeners consume remaining buffered audio
            // HLS has ~16-20s latency, so listeners need time to hear the final segments.
            // We wait 25s before notifying listeners, giving them time to play through
            // all remaining audio. The HLS.js player will naturally stop when it hits
            // #EXT-X-ENDLIST in the playlist.
            const GRACE_PERIOD_MS = 25000; // 25 seconds
            console.log(`Stream ${streamId} ending in ${GRACE_PERIOD_MS / 1000}s (grace period for listeners)...`);

            // Store the timer so start-stream can cancel it if host re-goes live within 25s
            gracePeriodTimeouts[streamId] = setTimeout(() => {
                io.to(streamId).emit('stream-ended');
                delete streamListeners[streamId];
                delete gracePeriodTimeouts[streamId];
                const deviceLabel = broadcaster.hostDevice ? broadcaster.hostDevice.platform : 'unknown';
                console.log(`Stream ended (after grace period): ${streamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}, Host: ${deviceLabel}`);
            }, GRACE_PERIOD_MS);
        }
    });

    // Update stream metadata without restarting
    socket.on('update-metadata', (data) => {
        const { streamId, title, description, isPublic } = data;
        const broadcaster = broadcasters[streamId];
        if (broadcaster && broadcaster.socketId === socket.id) {
            broadcaster.title = title || broadcaster.title;
            broadcaster.description = description || broadcaster.description;
            if (isPublic !== undefined) broadcaster.isPublic = isPublic;

            // Broadcast updated metadata to all listeners
            io.to(streamId).emit('metadata-updated', {
                title: broadcaster.title,
                description: broadcaster.description
            });

            console.log(`Metadata updated for stream ${streamId}: ${title}`);
        }
    });

    socket.on('disconnect', () => {
        // Use our own tracking (socketStreams) since Socket.IO already removed the socket from rooms
        const streamsJoined = socketStreams[socket.id];
        if (streamsJoined) {
            for (const streamId of streamsJoined) {
                const broadcaster = broadcasters[streamId];
                if (broadcaster && socket.id !== broadcaster.socketId) {
                    // Remove from stream's listener set
                    if (streamListeners[streamId]) streamListeners[streamId].delete(socket.id);

                    // Update count from authoritative Set
                    broadcaster.currentListeners = streamListeners[streamId] ? streamListeners[streamId].size : 0;

                    // Notify broadcaster
                    io.to(broadcaster.socketId).emit('listener-left', socket.id);

                    console.log(`Listener ${socket.id} disconnected from ${streamId}. Current: ${broadcaster.currentListeners}`);
                }
            }
            delete socketStreams[socket.id];
        }

        // Handle broadcaster disconnect with GRACE PERIOD
        for (const [streamId, broadcaster] of Object.entries(broadcasters)) {
            if (broadcaster.socketId === socket.id) {
                console.log(`Broadcaster disconnected for ${streamId}. Starting 5-minute grace period...`);

                // Set a timeout to clean up if they don't reconnect
                // Increased to 5 minutes to handle iOS backgrounding where sockets drop
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
                    delete lastChunkTime[streamId];
                    delete chunkGapState[streamId];
                    delete streamListeners[streamId];
                    delete disconnectTimeouts[streamId];
                    io.to(streamId).emit('stream-ended');
                    console.log(`Stream ended after timeout: ${streamId}. Duration: ${duration}s, Peak: ${broadcaster.peakListeners}`);
                }, 300000); // 300 seconds (5 minutes)
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
