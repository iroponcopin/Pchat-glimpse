// db.js
const Database = require("better-sqlite3");

const db = new Database("app.db");

// --- Schema ---
db.exec(`
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  status TEXT NOT NULL, -- pending/accepted/rejected/blocked
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id INTEGER NOT NULL,
  user_b_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  read_at INTEGER, -- for 1:1 only
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_sent ON messages(conversation_id, sent_at);
`);

function normalisePair(a, b) {
  return a < b ? [a, b] : [b, a];
}

function getOrCreateConversation(userA, userB) {
  const [a, b] = normalisePair(userA, userB);
  const now = Date.now();

  const existing = db.prepare(
    "SELECT * FROM conversations WHERE user_a_id=? AND user_b_id=?"
  ).get(a, b);

  if (existing) return existing;

  const info = db.prepare(
    "INSERT INTO conversations (user_a_id, user_b_id, created_at, last_message_at) VALUES (?, ?, ?, ?)"
  ).run(a, b, now, now);

  return db.prepare("SELECT * FROM conversations WHERE id=?").get(info.lastInsertRowid);
}

module.exports = {
  db,
  getOrCreateConversation,
  normalisePair
};
