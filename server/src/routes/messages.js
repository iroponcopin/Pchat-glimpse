import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Configurable time windows (milliseconds)
const EDIT_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const UNDO_WINDOW_MS = 2 * 60 * 1000;   // 2 minutes
const MAX_BODY_LENGTH = 4000;

// POST /api/messages — send a message
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { conversationId, body, clientMessageId } = req.body;

        if (!conversationId || !body || !clientMessageId) {
            return res.status(400).json({ error: 'messages.fieldsRequired' });
        }

        if (body.length < 1 || body.length > MAX_BODY_LENGTH) {
            return res.status(400).json({ error: 'messages.bodyLength' });
        }

        // Verify membership
        const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conversation) return res.status(404).json({ error: 'conversations.notFound' });
        if (conversation.userAId !== req.user.id && conversation.userBId !== req.user.id) {
            return res.status(403).json({ error: 'conversations.notMember' });
        }

        // De-duplicate by clientMessageId
        const existing = await prisma.message.findUnique({
            where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
        });
        if (existing) {
            return res.json(existing); // idempotent: return existing message
        }

        const message = await prisma.message.create({
            data: {
                conversationId,
                senderId: req.user.id,
                body,
                clientMessageId,
            },
            include: {
                sender: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });

        // Update conversation lastMessageAt
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: message.createdAt },
        });

        // Emit via Socket.IO
        const payload = {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            sender: message.sender,
            body: message.body,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            deletedAt: message.deletedAt,
            clientMessageId: message.clientMessageId,
            isEdited: false,
            isDeleted: false,
        };

        if (req.io) {
            req.io.to(`conv:${conversationId}`).emit('message:new', payload);
            // Also emit conversation update for the list
            const otherUserId = conversation.userAId === req.user.id ? conversation.userBId : conversation.userAId;
            req.io.to(`user:${otherUserId}`).emit('conversation:updated', {
                conversationId,
                lastMessage: payload,
                lastMessageAt: message.createdAt,
            });
        }

        res.status(201).json(payload);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// PATCH /api/messages/:id — edit a message
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { body } = req.body;

        if (!body || body.length < 1 || body.length > MAX_BODY_LENGTH) {
            return res.status(400).json({ error: 'messages.bodyLength' });
        }

        const message = await prisma.message.findUnique({ where: { id } });
        if (!message) return res.status(404).json({ error: 'messages.notFound' });

        // Must be sender
        if (message.senderId !== req.user.id) {
            return res.status(403).json({ error: 'messages.notSender' });
        }

        // Cannot edit deleted messages
        if (message.deletedAt) {
            return res.status(400).json({ error: 'messages.alreadyDeleted' });
        }

        // Check 15-minute window
        const timeSince = Date.now() - new Date(message.createdAt).getTime();
        if (timeSince > EDIT_WINDOW_MS) {
            return res.status(400).json({ error: 'messages.editWindowExpired' });
        }

        const updated = await prisma.message.update({
            where: { id },
            data: { body },
            include: {
                sender: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });

        const payload = {
            id: updated.id,
            conversationId: updated.conversationId,
            senderId: updated.senderId,
            sender: updated.sender,
            body: updated.body,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            deletedAt: updated.deletedAt,
            clientMessageId: updated.clientMessageId,
            isEdited: true,
            isDeleted: false,
        };

        if (req.io) {
            req.io.to(`conv:${updated.conversationId}`).emit('message:updated', payload);
        }

        res.json(payload);
    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// POST /api/messages/:id/undo — unsend (soft delete)
router.post('/:id/undo', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const message = await prisma.message.findUnique({ where: { id } });
        if (!message) return res.status(404).json({ error: 'messages.notFound' });

        if (message.senderId !== req.user.id) {
            return res.status(403).json({ error: 'messages.notSender' });
        }

        if (message.deletedAt) {
            return res.status(400).json({ error: 'messages.alreadyDeleted' });
        }

        // Check 2-minute window
        const timeSince = Date.now() - new Date(message.createdAt).getTime();
        if (timeSince > UNDO_WINDOW_MS) {
            return res.status(400).json({ error: 'messages.undoWindowExpired' });
        }

        const updated = await prisma.message.update({
            where: { id },
            data: { deletedAt: new Date() },
            include: {
                sender: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });

        const payload = {
            id: updated.id,
            conversationId: updated.conversationId,
            senderId: updated.senderId,
            sender: updated.sender,
            body: null,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            deletedAt: updated.deletedAt,
            clientMessageId: updated.clientMessageId,
            isEdited: false,
            isDeleted: true,
        };

        if (req.io) {
            req.io.to(`conv:${updated.conversationId}`).emit('message:updated', payload);
        }

        res.json(payload);
    } catch (error) {
        console.error('Undo message error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

export default router;
