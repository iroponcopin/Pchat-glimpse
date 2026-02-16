import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import prisma from './prisma.js';

export const setupSocket = (io) => {
    // Authenticate socket connections via cookie
    io.use((socket, next) => {
        try {
            const cookieHeader = socket.handshake.headers.cookie;
            if (!cookieHeader) return next(new Error('auth.unauthorised'));

            const cookies = cookie.parse(cookieHeader);
            const token = cookies.token;
            if (!token) return next(new Error('auth.unauthorised'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            next();
        } catch {
            next(new Error('auth.tokenInvalid'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`Socket connected: ${userId} (${socket.id})`);

        // Join personal room for notifications
        socket.join(`user:${userId}`);

        // Join all conversation rooms for this user
        try {
            const conversations = await prisma.conversation.findMany({
                where: {
                    OR: [{ userAId: userId }, { userBId: userId }],
                },
                select: { id: true },
            });

            for (const conv of conversations) {
                socket.join(`conv:${conv.id}`);
            }
        } catch (error) {
            console.error('Socket room join error:', error);
        }

        // Handle joining a new conversation room (when a new conversation is created)
        socket.on('conversation:join', (conversationId) => {
            socket.join(`conv:${conversationId}`);
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${userId} (${socket.id})`);
        });
    });
};
