// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const { db, getOrCreateConversation } = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Persistence Config / 永続化設定 ---
// Use DATA_DIR for uploads and sessions / アップロードとセッションにDATA_DIRを使用
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Save sessions to DATA_DIR / セッションをDATA_DIRに保存
const sessionMiddleware = session({
  store: new SQLiteStore({ db: "sessions.db", dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
});
app.use(sessionMiddleware);

// --- Static Files ---
app.use(express.static(path.join(__dirname, "public")));
// Serve uploads from the persistent directory / 永続ディレクトリからアップロードファイルを配信
app.use('/uploads', express.static(UPLOAD_DIR));

// --- Upload Logic (Multer) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// --- Helpers ---
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Auth
app.post("/api/register", async (req, res) => {
  const { loginId, password, displayName } = req.body;
  const hash = await bcrypt.hash(password, 12);
  try {
    const info = db.prepare("INSERT INTO users (login_id, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)").run(loginId, displayName || loginId, hash, Date.now());
    req.session.user = { id: info.lastInsertRowid, loginId, displayName: displayName || loginId };
    res.json({ user: req.session.user });
  } catch(e) { res.status(409).json({ error: "User exists" }); }
});

app.post("/api/login", async (req, res) => {
  const { loginId, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE login_id=?").get(loginId);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid" });
  req.session.user = { id: user.id, loginId: user.login_id, displayName: user.display_name };
  res.json({ user: req.session.user });
});

app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

// Friends
app.get("/api/friends", requireAuth, (req, res) => {
  const myId = req.session.user.id;
  const friends = db.prepare(`SELECT u.id, u.login_id, u.display_name FROM friend_requests fr JOIN users u ON u.id = fr.to_user_id WHERE fr.from_user_id=? AND fr.status='accepted'`).all(myId);
  const incoming = db.prepare(`SELECT fr.id as requestId, u.id as fromUserId, u.login_id, u.display_name FROM friend_requests fr JOIN users u ON u.id = fr.from_user_id WHERE fr.to_user_id=? AND fr.status='pending'`).all(myId);
  res.json({ friends, incoming });
});

app.post("/api/friends/request", requireAuth, (req, res) => {
  const { toUserId } = req.body;
  const myId = req.session.user.id;
  db.prepare("INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)").run(myId, toUserId, Date.now(), Date.now());
  res.json({ ok: true });
});

app.post("/api/friends/respond", requireAuth, (req, res) => {
  const { requestId, accept } = req.body;
  const fr = db.prepare("SELECT * FROM friend_requests WHERE id=?").get(requestId);
  if (!fr) return res.status(404).json({ error: "Not found" });
  
  const status = accept ? 'accepted' : 'rejected';
  db.prepare("UPDATE friend_requests SET status=?, updated_at=? WHERE id=?").run(status, Date.now(), requestId);
  
  if (accept) {
    db.prepare("INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id, status, created_at, updated_at) VALUES (?, ?, 'accepted', ?, ?)").run(req.session.user.id, fr.from_user_id, Date.now(), Date.now());
    db.prepare("UPDATE friend_requests SET status='accepted' WHERE from_user_id=? AND to_user_id=?").run(req.session.user.id, fr.from_user_id);
  }
  res.json({ ok: true });
});

app.get("/api/users/search", requireAuth, (req, res) => {
  const q = `%${req.query.q}%`;
  const users = db.prepare("SELECT id, login_id, display_name FROM users WHERE login_id LIKE ? OR display_name LIKE ? LIMIT 10").all(q, q);
  res.json({ users });
});

// Chat & Upload
app.post("/api/conversations/open", requireAuth, (req, res) => {
  const conv = getOrCreateConversation(req.session.user.id, req.body.friendUserId);
  res.json({ conversationId: conv.id });
});

app.post("/api/upload", requireAuth, upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get("/api/messages", requireAuth, (req, res) => {
  const { conversationId, before } = req.query;
  const limit = 30;
  const timeLimit = before || Date.now() + 10000;
  
  const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id=? AND sent_at < ? 
    ORDER BY sent_at DESC LIMIT ?
  `).all(conversationId, timeLimit, limit);

  res.json({ messages: messages.map(m => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderUserId: m.sender_user_id,
    body: m.body,
    mediaUrl: m.media_url,
    msgType: m.msg_type,
    sentAt: m.sent_at
  })) });
});

// --- Socket.io ---
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

const onlineSockets = new Map(); // userId -> Set(socketId)

function notifyUser(userId, event, data) {
  const sockets = onlineSockets.get(userId);
  if (sockets) sockets.forEach(id => io.to(id).emit(event, data));
}

io.on("connection", (socket) => {
  const user = socket.request.session.user;
  if (!user) return socket.disconnect();

  const myId = user.id;
  if (!onlineSockets.has(myId)) onlineSockets.set(myId, new Set());
  onlineSockets.get(myId).add(socket.id);

  // Messaging
  socket.on("send_message", (data) => {
    const { conversationId, text, mediaUrl, msgType } = data;
    const now = Date.now();
    const type = msgType || 'text';
    
    // Find partner
    const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(conversationId);
    if (!conv) return;
    const otherId = (conv.user_a_id === myId) ? conv.user_b_id : conv.user_a_id;

    const info = db.prepare("INSERT INTO messages (conversation_id, sender_user_id, body, media_url, msg_type, sent_at) VALUES (?, ?, ?, ?, ?, ?)").run(conversationId, myId, text || '', mediaUrl || null, type, now);
    
    const msg = { id: info.lastInsertRowid, conversationId, senderUserId: myId, body: text, mediaUrl, msgType: type, sentAt: now };
    
    notifyUser(otherId, "message_received", msg);
    notifyUser(myId, "message_received", msg);
  });

  // WebRTC Video Call Signaling
  socket.on("call_user", ({ toUserId, offer }) => notifyUser(toUserId, "incoming_call", { fromUserId: myId, offer }));
  socket.on("call_answer", ({ toUserId, answer }) => notifyUser(toUserId, "call_answered", { fromUserId: myId, answer }));
  socket.on("ice_candidate", ({ toUserId, candidate }) => notifyUser(toUserId, "remote_ice_candidate", { fromUserId: myId, candidate }));
  socket.on("end_call", ({ toUserId }) => notifyUser(toUserId, "call_ended", { fromUserId: myId }));

  socket.on("disconnect", () => {
    const s = onlineSockets.get(myId);
    if (s) {
      s.delete(socket.id);
      if (s.size === 0) onlineSockets.delete(myId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
