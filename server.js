const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- MEMORY STORAGE (MVP) ---
// In a production app, replace this with Redis.
// Structure: { "room_hash": [ { id, user, text, timestamp, expiresAt } ] }
const chatStore = {}; 

const RETENTION_MS = 72 * 60 * 60 * 1000; // 3 Days
// const RETENTION_MS = 10 * 1000; // Debug: Set to 10 seconds to test deletion quickly

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- HELPER: SECURITY ---
function getRoomId(password) {
    // 7.1 Key derivation (Hash) - Password never used as raw key
    return crypto.createHash('sha256').update(password).digest('hex');
}

// --- HELPER: CLEANUP WORKER ---
// 6.3 Automatic Deletion Worker
setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;

    for (const roomId in chatStore) {
        const initialLength = chatStore[roomId].length;
        // Filter out messages where expiry time has passed
        chatStore[roomId] = chatStore[roomId].filter(msg => msg.expiresAt > now);
        
        if (chatStore[roomId].length < initialLength) {
            deletedCount += (initialLength - chatStore[roomId].length);
            // Notify room of deletion (Real-time update)
            io.to(roomId).emit('sync_history', chatStore[roomId]);
        }

        // 6.2 Room Retention: Cleanup empty rooms
        if (chatStore[roomId].length === 0) {
            delete chatStore[roomId];
        }
    }
    if (deletedCount > 0) console.log(`[System] Auto-deleted ${deletedCount} expired messages.`);
}, 5000); // Check every 5 seconds

io.on('connection', (socket) => {
    // 4.1 Enter Room
    socket.on('join_room', ({ password, username }) => {
        if (!password) return;
        
        const roomId = getRoomId(password);
        socket.join(roomId);
        
        // Initialize room if not exists
        if (!chatStore[roomId]) chatStore[roomId] = [];

        // Send history
        socket.emit('sync_history', chatStore[roomId]);
        
        // Notify others (Optional)
        // socket.to(roomId).emit('system_msg', `${username} joined.`);
    });

    // 4.2 Send Message
    socket.on('send_message', ({ password, username, text }) => {
        if (!password || !text) return;
        if (text.length > 1000) return; // Basic rate limit/spam prevention

        const roomId = getRoomId(password);
        
        const newMessage = {
            id: Date.now() + Math.random().toString(16).slice(2),
            user: username || "Anonymous",
            text: text,
            timestamp: Date.now(),
            expiresAt: Date.now() + RETENTION_MS // 6.1 Retention Rule
        };

        if (!chatStore[roomId]) chatStore[roomId] = [];
        chatStore[roomId].push(newMessage);

        // Broadcast to everyone in the room (including sender)
        io.to(roomId).emit('receive_message', newMessage);
    });
    
    // 4.3 Delete (Undo) - Option A "Delete for everyone"
    socket.on('delete_message', ({ password, messageId }) => {
        const roomId = getRoomId(password);
        if (chatStore[roomId]) {
            const index = chatStore[roomId].findIndex(m => m.id === messageId);
            if (index !== -1) {
                chatStore[roomId].splice(index, 1);
                io.to(roomId).emit('sync_history', chatStore[roomId]);
            }
        }
    });
});

server.listen(3000, () => {
  console.log('SERVER RUNNING ON http://localhost:3000');
  console.log(`RETENTION POLICY: ${RETENTION_MS / 1000 / 60 / 60} hours`);
});
