import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticateToken, async (req, res) => {
    const { conversationId, content } = req.body;

    if (!conversationId || !content) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        // Verify participation
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                participants: {
                    some: { id: req.user.id }
                }
            },
            include: {
                participants: true
            }
        });

        if (!conversation) return res.sendStatus(403);

        const message = await prisma.message.create({
            data: {
                content,
                conversationId,
                senderId: req.user.id
            },
            include: {
                sender: {
                    select: { id: true, username: true, avatarUrl: true }
                }
            }
        });

        // Update conversation updated_at
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() }
        });

        // Emit socket event (TODO: Import io instance or use a singleton)
        // For now we'll handle socket emission in the controller or pass io to routes?
        // Better: In index.js, we can attach io to req, or export a function to get io.
        // Simplifying: We'll require the socket.js export here if possible, or just ignore for now and pollling?
        // No, requirement is realtime.
        // Let's attach io to req in index.js middleware.

        if (req.io) {
            req.io.to(conversationId).emit('message:new', message);
        }

        res.status(201).json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router;
