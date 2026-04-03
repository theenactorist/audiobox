const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = '7d';

const ADMIN_EMAIL = 'livestream.thenew@gmail.com';

// Generate a JWT for a user
function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Middleware: authenticate JWT from Authorization header
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Rate Limiter for Login (5 attempts per 15 mins)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// POST /api/auth/login — admin only
router.post('/login', async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        // 1. Check rate limit
        const attempt = loginAttempts.get(ip);
        if (attempt && attempt.count >= MAX_ATTEMPTS) {
            if (Date.now() - attempt.lastAttempt < LOCKOUT_MS) {
                const minutesLeft = Math.ceil((LOCKOUT_MS - (Date.now() - attempt.lastAttempt)) / 60000);
                return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minutes.` });
            } else {
                loginAttempts.delete(ip); // Lockout expired
            }
        }

        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        // Only allow login for the admin account
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL);
        if (!user) {
            return res.status(401).json({ error: 'Admin account not configured.' });
        }

        // Verify password
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            const currentAttempt = loginAttempts.get(ip) || { count: 0, lastAttempt: Date.now() };
            loginAttempts.set(ip, { count: currentAttempt.count + 1, lastAttempt: Date.now() });
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Successful login — reset limiter
        loginAttempts.delete(ip);

        const userData = { id: user.id, email: user.email };
        const token = generateToken(userData);

        console.log(`Admin logged in: ${ADMIN_EMAIL}`);
        res.json({ user: userData, token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me — validate token and return user data
router.get('/me', authenticateToken, (req, res) => {
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: { id: user.id, email: user.email } });
});

module.exports = { router, authenticateToken };
