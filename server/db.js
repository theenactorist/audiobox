const Database = require('better-sqlite3');
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

console.log('SQLite database initialized at', DB_PATH);

module.exports = db;
