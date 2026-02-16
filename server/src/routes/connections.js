import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/connections/request
router.post('/request', authenticateToken, async (req, res) => {
    try {
        const { recipientId } = req.body;
        if (!recipientId) return res.status(400).json({ error: 'connections.recipientRequired' });
        if (recipientId === req.user.id) return res.status(400).json({ error: 'connections.cannotSelfConnect' });

        // Check if connection already exists in either direction
        const existing = await prisma.connection.findFirst({
            where: {
                OR: [
                    { requesterId: req.user.id, recipientId },
                    { requesterId: recipientId, recipientId: req.user.id },
                ],
            },
        });

        if (existing) {
            if (existing.status === 'accepted') {
                return res.status(409).json({ error: 'connections.alreadyConnected' });
            }
            if (existing.status === 'pending') {
                return res.status(409).json({ error: 'connections.requestPending' });
            }
            // If rejected, allow re-requesting by updating
            if (existing.status === 'rejected') {
                const updated = await prisma.connection.update({
                    where: { id: existing.id },
                    data: { requesterId: req.user.id, recipientId, status: 'pending' },
                    include: { requester: { select: { id: true, displayName: true, avatarUrl: true } } },
                });
                return res.json(updated);
            }
        }

        const connection = await prisma.connection.create({
            data: { requesterId: req.user.id, recipientId },
            include: {
                requester: { select: { id: true, displayName: true, avatarUrl: true } },
                recipient: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });

        // Notify the recipient via socket if online
        if (req.io) {
            req.io.to(`user:${recipientId}`).emit('connection:request', connection);
        }

        res.status(201).json(connection);
    } catch (error) {
        console.error('Connection request error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// POST /api/connections/respond  { connectionId, action: 'accept' | 'reject' }
router.post('/respond', authenticateToken, async (req, res) => {
    try {
        const { connectionId, action } = req.body;
        if (!connectionId || !['accept', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'connections.invalidResponse' });
        }

        const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
        if (!connection) return res.status(404).json({ error: 'connections.notFound' });
        if (connection.recipientId !== req.user.id) {
            return res.status(403).json({ error: 'connections.notRecipient' });
        }
        if (connection.status !== 'pending') {
            return res.status(400).json({ error: 'connections.alreadyResponded' });
        }

        const updated = await prisma.connection.update({
            where: { id: connectionId },
            data: { status: action === 'accept' ? 'accepted' : 'rejected' },
            include: {
                requester: { select: { id: true, displayName: true, avatarUrl: true } },
                recipient: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });

        // Notify the requester via socket
        if (req.io) {
            req.io.to(`user:${connection.requesterId}`).emit('connection:response', updated);
        }

        res.json(updated);
    } catch (error) {
        console.error('Connection respond error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// GET /api/connections — list accepted connections
router.get('/', authenticateToken, async (req, res) => {
    try {
        const connections = await prisma.connection.findMany({
            where: {
                status: 'accepted',
                OR: [
                    { requesterId: req.user.id },
                    { recipientId: req.user.id },
                ],
            },
            include: {
                requester: { select: { id: true, displayName: true, avatarUrl: true } },
                recipient: { select: { id: true, displayName: true, avatarUrl: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(connections);
    } catch (error) {
        console.error('List connections error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// GET /api/connections/pending — list pending incoming requests
router.get('/pending', authenticateToken, async (req, res) => {
    try {
        const pending = await prisma.connection.findMany({
            where: {
                recipientId: req.user.id,
                status: 'pending',
            },
            include: {
                requester: { select: { id: true, displayName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(pending);
    } catch (error) {
        console.error('Pending connections error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

export default router;
