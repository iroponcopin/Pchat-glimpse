const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Database Setup (SQLite) ---
const db = new sqlite3.Database('./messenger.db');

db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        loginId TEXT UNIQUE,
        passwordHash TEXT,
        displayName TEXT,
        status TEXT DEFAULT 'offline',
        lastSeenAt INTEGER
    )`);

    // Friendships Table
    db.run(`CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        requesterId TEXT,
        addresseeId TEXT,
        status TEXT, -- 'pending', 'accepted', 'blocked'
        UNIQUE(requesterId, addresseeId)
    )`);

    // Messages Table (Persistent History)
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        senderId TEXT,
        recipientId TEXT,
        content TEXT,
        sentAt INTEGER,
        readAt INTEGER
    )`);
});

// --- Helper Functions ---
const generateUUID = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// --- API Routes (Auth & Data) ---

// Register
app.post('/api/register', async (req, res) => {
    const { loginId, password, displayName } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const userId = generateUUID();

    db.run(`INSERT INTO users (id, loginId, passwordHash, displayName, status, lastSeenAt) VALUES (?, ?, ?, ?, 'offline', ?)`,
        [userId, loginId, hash, displayName, Date.now()],
        (err) => {
            if (err) return res.status(400).json({ error: 'User already exists' });
            res.json({ success: true, userId });
        }
    );
});

// Login
app.post('/api/login', (req, res) => {
    const { loginId, password } = req.body;
    db.get(`SELECT * FROM users WHERE loginId = ?`, [loginId], async (err, user) => {
        if (!user) return res.status(400).json({ error: 'User not found' });
        
        const match = await bcrypt.compare(password, user.passwordHash);
        if (match) {
            res.json({ success: true, user: { id: user.id, displayName: user.displayName, loginId: user.loginId } });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    });
});

// Search Users
app.get('/api/users/search', (req, res) => {
    const query = req.query.q;
    const currentUserId = req.query.userId;
    db.all(`SELECT id, displayName, loginId FROM users WHERE loginId LIKE ? AND id != ?`, [`%${query}%`, currentUserId], (err, rows) => {
        res.json(rows);
    });
});

// Get Friends
app.get('/api/friends', (req, res) => {
    const userId = req.query.userId;
    const sql = `
        SELECT u.id, u.displayName, u.status, u.lastSeenAt, f.status as friendStatus, f.requesterId
        FROM friendships f
        JOIN users u ON (u.id = f.requesterId OR u.id = f.addresseeId)
        WHERE (f.requesterId = ? OR f.addresseeId = ?) AND u.id != ? AND f.status != 'blocked'
    `;
    db.all(sql, [userId, userId, userId], (err, rows) => {
        res.json(rows);
    });
});

// Get Messages (History)
app.get('/api/messages', (req, res) => {
    const { userId, friendId } = req.query;
    db.all(`SELECT * FROM messages 
            WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
            ORDER BY sentAt ASC`, 
            [userId, friendId, friendId, userId], 
            (err, rows) => {
                res.json(rows);
            });
});

// --- Socket.IO (Real-time) ---
const connectedUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
    
    socket.on('join', (userId) => {
        connectedUsers.set(userId, socket.id);
        socket.userId = userId;
        
        // Update Status to Online
        db.run(`UPDATE users SET status = 'online', lastSeenAt = ? WHERE id = ?`, [Date.now(), userId]);
        io.emit('presence_update', { userId, status: 'online' });
    });

    socket.on('friend_request_send', ({ fromId, toLoginId }) => {
        db.get(`SELECT id FROM users WHERE loginId = ?`, [toLoginId], (err, targetUser) => {
            if (!targetUser) return;
            const friendshipId = generateUUID();
            db.run(`INSERT INTO friendships (id, requesterId, addresseeId, status) VALUES (?, ?, ?, 'pending')`,
                [friendshipId, fromId, targetUser.id], (err) => {
                    if (!err) {
                        const targetSocket = connectedUsers.get(targetUser.id);
                        if (targetSocket) io.to(targetSocket).emit('friend_request_received', { fromId });
                    }
                });
        });
    });

    socket.on('friend_request_respond', ({ requestId, action, userId, friendId }) => { // simplified for MVP
        // In a real app, use requestId. Here we update by IDs for simplicity
        const status = action === 'accept' ? 'accepted' : 'blocked'; // or delete for reject
        db.run(`UPDATE friendships SET status = ? WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)`,
            [status, friendId, userId, userId, friendId], () => {
                const targetSocket = connectedUsers.get(friendId);
                if (targetSocket) io.to(targetSocket).emit('friend_list_update');
                socket.emit('friend_list_update');
            });
    });

    socket.on('message_send', ({ fromId, toId, content }) => {
        const msgId = generateUUID();
        const now = Date.now();
        db.run(`INSERT INTO messages (id, senderId, recipientId, content, sentAt) VALUES (?, ?, ?, ?, ?)`,
            [msgId, fromId, toId, content, now], () => {
                const msgData = { id: msgId, senderId: fromId, content, sentAt: now };
                
                // Send to recipient
                const targetSocket = connectedUsers.get(toId);
                if (targetSocket) {
                    io.to(targetSocket).emit('message_received', msgData);
                }
                // Send back to sender (confirmation)
                socket.emit('message_sent', msgData);
            });
    });

    socket.on('typing', ({ fromId, toId, isTyping }) => {
        const targetSocket = connectedUsers.get(toId);
        if (targetSocket) {
            io.to(targetSocket).emit('typing_update', { userId: fromId, isTyping });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            const now = Date.now();
            db.run(`UPDATE users SET status = 'offline', lastSeenAt = ? WHERE id = ?`, [now, socket.userId]);
            io.emit('presence_update', { userId: socket.userId, status: 'offline', lastSeenAt: now });
            connectedUsers.delete(socket.userId);
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
