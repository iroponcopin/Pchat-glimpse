// db.js
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Persistence: Use provided DATA_DIR or default to current folder
// 永続化: 指定されたDATA_DIRを使用するか、現在のフォルダをデフォルトとします
const dataDir = process.env.DATA_DIR || ".";

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");
const db = new Database(dbPath);

// Schema Update / スキーマ更新
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
  status TEXT NOT NULL,
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
  body TEXT,
  media_url TEXT,            -- Path to image / 画像へのパス
  msg_type TEXT DEFAULT 'text', -- 'text' or 'image'
  sent_at INTEGER NOT NULL,
  read_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_sent ON messages(conversation_id, sent_at);
`);

// Migration helper (adds columns if they don't exist)
// マイグレーションヘルパー（カラムが存在しない場合に追加）
try {
  const info = db.prepare("PRAGMA table_info(messages)").all();
  if (!info.some(c => c.name === 'media_url')) {
    db.exec("ALTER TABLE messages ADD COLUMN media_url TEXT");
    db.exec("ALTER TABLE messages ADD COLUMN msg_type TEXT DEFAULT 'text'");
  }
} catch (e) {
  // Ignore if already exists
}

function normalisePair(a, b) {
  return a < b ? [a, b] : [b, a];
}

function getOrCreateConversation(userA, userB) {
  const [a, b] = normalisePair(userA, userB);
  const now = Date.now();
  const existing = db.prepare("SELECT * FROM conversations WHERE user_a_id=? AND user_b_id=?").get(a, b);
  if (existing) return existing;
  const info = db.prepare("INSERT INTO conversations (user_a_id, user_b_id, created_at, last_message_at) VALUES (?, ?, ?, ?)").run(a, b, now, now);
  return db.prepare("SELECT * FROM conversations WHERE id=?").get(info.lastInsertRowid);
}

module.exports = { db, getOrCreateConversation, normalisePair };
