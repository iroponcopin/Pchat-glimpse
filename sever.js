// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { Server } = require("socket.io");
const { db, getOrCreateConversation, normalisePair } = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  store: new SQLiteStore({ db: "sessions.db" }),
  secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false // set true if behind HTTPS only (Render uses HTTPS; keep lax for simplicity)
  }
});

app.use(sessionMiddleware);

// Serve front-end
app.use(express.static(path.join(__dirname, "public")));

// --- Auth helpers ---
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}

function safeUser(u) {
  return { id: u.id, loginId: u.login_id, displayName: u.display_name };
}

// --- REST: Register ---
app.post("/api/register", async (req, res) => {
  const { loginId, password, displayName } = req.body;

  if (!loginId || !password) {
    return res.status(400).json({ error: "loginId and password required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const name = (displayName && String(displayName).trim()) || loginId;

  const exists = db.prepare("SELECT id FROM users WHERE login_id=?").get(loginId);
  if (exists) return res.status(409).json({ error: "loginId already exists" });

  const hash = await bcrypt.hash(password, 12);
  const now = Date.now();

  const info = db.prepare(
    "INSERT INTO users (login_id, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(loginId, name, hash, now);

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  req.session.user = safeUser(user);

  res.json({ user: req.session.user });
});

// --- REST: Login ---
app.post("/api/login", async (req, res) => {
  const { loginId, password } = req.body;
  if (!loginId || !password) return res.status(400).json({ error: "Missing fields" });

  const user = db.prepare("SELECT * FROM users WHERE login_id=?").get(loginId);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  req.session.user = safeUser(user);
  res.json({ user: req.session.user });
});

// --- REST: Logout ---
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --- REST: Me ---
app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// --- REST: Search users ---
app.get("/api/users/search", requireAuth, (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ users: [] });

  const users = db.prepare(
    `SELECT id, login_id, display_name
     FROM users
     WHERE (login_id LIKE ? OR display_name LIKE ?)
       AND id != ?
     LIMIT 20`
  ).all(`%${q}%`, `%${q}%`, req.session.user.id);

  res.json({
    users: users.map(u => ({ id: u.id, loginId: u.login_id, displayName: u.display_name }))
  });
});

// --- REST: Friend request send ---
app.post("/api/friends/request", requireAuth, (req, res) => {
  const { toUserId } = req.body;
  const fromId = req.session.user.id;
  const toId = Number(toUserId);

  if (!toId || toId === fromId) return res.status(400).json({ error: "Invalid target" });

  const target = db.prepare("SELECT id FROM users WHERE id=?").get(toId);
  if (!target) return res.status(404).json({ error: "User not found" });

  const now = Date.now();
  // Insert or update
  const existing = db.prepare(
    "SELECT * FROM friend_requests WHERE from_user_id=? AND to_user_id=?"
  ).get(fromId, toId);

  if (existing) {
    if (existing.status === "accepted") return res.status(409).json({ error: "Already friends" });
    db.prepare(
      "UPDATE friend_requests SET status='pending', updated_at=? WHERE id=?"
    ).run(now, existing.id);
  } else {
    db.prepare(
      "INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)"
    ).run(fromId, toId, now, now);
  }

  // Notify target if online (via Socket.IO)
  notifyUser(toId, "friend_request_update", {});

  res.json({ ok: true });
});

// --- REST: Friend request respond ---
app.post("/api/friends/respond", requireAuth, (req, res) => {
  const { requestId, accept } = req.body;
  const myId = req.session.user.id;
  const now = Date.now();

  const fr = db.prepare("SELECT * FROM friend_requests WHERE id=?").get(Number(requestId));
  if (!fr) return res.status(404).json({ error: "Request not found" });
  if (fr.to_user_id !== myId) return res.status(403).json({ error: "Not allowed" });

  const newStatus = accept ? "accepted" : "rejected";
  db.prepare("UPDATE friend_requests SET status=?, updated_at=? WHERE id=?").run(newStatus, now, fr.id);

  // If accepted, also ensure reciprocal relationship exists (optional but handy)
  if (accept) {
    const reciprocal = db.prepare(
      "SELECT * FROM friend_requests WHERE from_user_id=? AND to_user_id=?"
    ).get(myId, fr.from_user_id);

    if (!reciprocal) {
      db.prepare(
        "INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at, updated_at) VALUES (?, ?, 'accepted', ?, ?)"
      ).run(myId, fr.from_user_id, now, now);
    } else if (reciprocal.status !== "accepted") {
      db.prepare(
        "UPDATE friend_requests SET status='accepted', updated_at=? WHERE id=?"
      ).run(now, reciprocal.id);
    }
  }

  notifyUser(fr.from_user_id, "friend_request_update", {});
  res.json({ ok: true });
});

// --- REST: Get friend list + pending requests ---
app.get("/api/friends", requireAuth, (req, res) => {
  const myId = req.session.user.id;

  const friends = db.prepare(
    `SELECT u.id, u.login_id, u.display_name
     FROM friend_requests fr
     JOIN users u ON u.id = fr.to_user_id
     WHERE fr.from_user_id=? AND fr.status='accepted'`
  ).all(myId);

  const incoming = db.prepare(
    `SELECT fr.id as requestId, u.id as fromUserId, u.login_id, u.display_name, fr.created_at
     FROM friend_requests fr
     JOIN users u ON u.id = fr.from_user_id
     WHERE fr.to_user_id=? AND fr.status='pending'
     ORDER BY fr.created_at DESC`
  ).all(myId);

  res.json({
    friends: friends.map(u => ({ id: u.id, loginId: u.login_id, displayName: u.display_name })),
    incoming: incoming.map(r => ({
      requestId: r.requestId,
      fromUserId: r.fromUserId,
      loginId: r.login_id,
      displayName: r.display_name,
      createdAt: r.created_at
    }))
  });
});

// --- REST: Open conversation with friend (create if needed) ---
app.post("/api/conversations/open", requireAuth, (req, res) => {
  const myId = req.session.user.id;
  const { friendUserId } = req.body;
  const friendId = Number(friendUserId);

  // Must be accepted friend
  const isFriend = db.prepare(
    "SELECT 1 FROM friend_requests WHERE from_user_id=? AND to_user_id=? AND status='accepted'"
  ).get(myId, friendId);

  if (!isFriend) return res.status(403).json({ error: "Not friends" });

  const conv = getOrCreateConversation(myId, friendId);
  res.json({ conversationId: conv.id });
});

// --- REST: Load messages (paged) ---
app.get("/api/messages", requireAuth, (req, res) => {
  const myId = req.session.user.id;
  const conversationId = Number(req.query.conversationId);
  const before = Number(req.query.before || Date.now());
  const limit = Math.min(Number(req.query.limit || 50), 100);

  // Ensure membership
  const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(conversationId);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });

  const [a, b] = [conv.user_a_id, conv.user_b_id];
  if (myId !== a && myId !== b) return res.status(403).json({ error: "Not allowed" });

  const rows = db.prepare(
    `SELECT id, conversation_id, sender_user_id, body, sent_at, read_at, deleted
     FROM messages
     WHERE conversation_id=? AND sent_at < ?
     ORDER BY sent_at DESC
     LIMIT ?`
  ).all(conversationId, before, limit);

  res.json({ messages: rows.reverse() });
});

// -------------------- Socket.IO with session auth --------------------

// Share express-session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

const onlineSockets = new Map(); // userId -> Set(socket.id)

function addOnline(userId, socketId) {
  if (!onlineSockets.has(userId)) onlineSockets.set(userId, new Set());
  onlineSockets.get(userId).add(socketId);
}

function removeOnline(userId, socketId) {
  const set = onlineSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) onlineSockets.delete(userId);
}

function isOnline(userId) {
  return onlineSockets.has(userId);
}

function notifyUser(userId, event, payload) {
  const set = onlineSockets.get(userId);
  if (!set) return;
  for (const sid of set) {
    io.to(sid).emit(event, payload);
  }
}

function emitPresenceToFriends(userId) {
  // Send presence updates only to accepted friends
  const friends = db.prepare(
    `SELECT to_user_id AS fid
     FROM friend_requests
     WHERE from_user_id=? AND status='accepted'`
  ).all(userId);

  for (const f of friends) {
    notifyUser(f.fid, "presence_update", {
      userId,
      online: isOnline(userId),
      lastSeenAt: isOnline(userId) ? null : Date.now()
    });
  }
}

io.on("connection", (socket) => {
  const sess = socket.request.session;
  const user = sess && sess.user;

  if (!user) {
    // Not authenticated; disconnect to keep it simple
    socket.disconnect(true);
    return;
  }

  const myId = user.id;
  addOnline(myId, socket.id);

  // Inform friends I am online
  emitPresenceToFriends(myId);

  socket.on("typing", (data) => {
    const { conversationId, isTyping } = data || {};
    if (!conversationId) return;

    const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(Number(conversationId));
    if (!conv) return;
    if (myId !== conv.user_a_id && myId !== conv.user_b_id) return;

    const otherId = myId === conv.user_a_id ? conv.user_b_id : conv.user_a_id;
    notifyUser(otherId, "typing_update", {
      conversationId: Number(conversationId),
      userId: myId,
      isTyping: !!isTyping
    });
  });

  socket.on("send_message", (data) => {
    const { conversationId, text } = data || {};
    const body = String(text || "").trim();
    if (!conversationId || !body) return;
    if (body.length > 2000) return;

    const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(Number(conversationId));
    if (!conv) return;
    if (myId !== conv.user_a_id && myId !== conv.user_b_id) return;

    const now = Date.now();
    const info = db.prepare(
      "INSERT INTO messages (conversation_id, sender_user_id, body, sent_at) VALUES (?, ?, ?, ?)"
    ).run(Number(conversationId), myId, body, now);

    db.prepare("UPDATE conversations SET last_message_at=? WHERE id=?").run(now, Number(conversationId));

    const message = {
      id: info.lastInsertRowid,
      conversationId: Number(conversationId),
      senderUserId: myId,
      body,
      sentAt: now,
      readAt: null,
      deleted: 0
    };

    const otherId = myId === conv.user_a_id ? conv.user_b_id : conv.user_a_id;

    // Real-time to both parties
    notifyUser(otherId, "message_received", message);
    notifyUser(myId, "message_received", message);
  });

  socket.on("mark_read", (data) => {
    const { conversationId, upToMessageId } = data || {};
    if (!conversationId || !upToMessageId) return;

    const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(Number(conversationId));
    if (!conv) return;
    if (myId !== conv.user_a_id && myId !== conv.user_b_id) return;

    const otherId = myId === conv.user_a_id ? conv.user_b_id : conv.user_a_id;
    const now = Date.now();

    // Mark messages as read where sender is the other user (only 1:1)
    db.prepare(
      `UPDATE messages
       SET read_at=?
       WHERE conversation_id=?
         AND id <= ?
         AND sender_user_id = ?
         AND read_at IS NULL`
    ).run(now, Number(conversationId), Number(upToMessageId), otherId);

    notifyUser(otherId, "read_receipt_update", {
      conversationId: Number(conversationId),
      readAt: now,
      upToMessageId: Number(upToMessageId)
    });
  });

  socket.on("disconnect", () => {
    removeOnline(myId, socket.id);
    // Inform friends I am offline if no sockets remain
    emitPresenceToFriends(myId);
  });
});

// --- Render port ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING on :${PORT}`);
});
