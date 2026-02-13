const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(__dirname, 'audiobox.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stream_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT NOT NULL,
        title TEXT,
        description TEXT,
        start_time TEXT,
        end_time TEXT,
        duration INTEGER,
        peak_listeners INTEGER DEFAULT 0,
        user_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

// Seed admin account on startup
const ADMIN_EMAIL = 'livestream.thenew@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wearethenewvoiceAI09';

(async () => {
    try {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
        if (!existing) {
            const id = crypto.randomUUID();
            const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
            db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, ADMIN_EMAIL, passwordHash);
            console.log(`Admin account created: ${ADMIN_EMAIL}`);
        } else {
            // Update password hash in case ADMIN_PASSWORD env var changed
            const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
            db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(passwordHash, ADMIN_EMAIL);
            console.log(`Admin account exists: ${ADMIN_EMAIL} (password synced)`);
        }
    } catch (err) {
        console.error('Error seeding admin account:', err);
    }
})();

console.log('SQLite database initialized at', DB_PATH);

module.exports = db;
