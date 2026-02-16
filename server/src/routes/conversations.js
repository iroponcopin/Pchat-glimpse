import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Helper: get canonical user pair (always sorted)
function canonicalPair(idA, idB) {
    return idA < idB ? [idA, idB] : [idB, idA];
}

// GET /api/conversations — list conversations sorted by latest activity
router.get('/', authenticateToken, async (req, res) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { userAId: req.user.id },
                    { userBId: req.user.id },
                ],
            },
            include: {
                userA: { select: { id: true, displayName: true, avatarUrl: true } },
                userB: { select: { id: true, displayName: true, avatarUrl: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        body: true,
                        senderId: true,
                        createdAt: true,
                        deletedAt: true,
                    },
                },
            },
            orderBy: { lastMessageAt: 'desc' },
        });

        // Format the response
        const formatted = conversations.map((conv) => {
            const otherUser = conv.userAId === req.user.id ? conv.userB : conv.userA;
            const lastMessage = conv.messages[0] || null;
            return {
                id: conv.id,
                otherUser,
                lastMessage: lastMessage
                    ? {
                        id: lastMessage.id,
                        body: lastMessage.deletedAt ? null : lastMessage.body,
                        senderId: lastMessage.senderId,
                        createdAt: lastMessage.createdAt,
                        isDeleted: !!lastMessage.deletedAt,
                    }
                    : null,
                lastMessageAt: conv.lastMessageAt,
                updatedAt: conv.updatedAt,
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('List conversations error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// POST /api/conversations — create or return existing 1:1 conversation
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { otherUserId } = req.body;
        if (!otherUserId) return res.status(400).json({ error: 'conversations.otherUserRequired' });
        if (otherUserId === req.user.id) return res.status(400).json({ error: 'conversations.cannotChatSelf' });

        // Check connection (must be accepted)
        const connection = await prisma.connection.findFirst({
            where: {
                status: 'accepted',
                OR: [
                    { requesterId: req.user.id, recipientId: otherUserId },
                    { requesterId: otherUserId, recipientId: req.user.id },
                ],
            },
        });

        if (!connection) {
            return res.status(403).json({ error: 'conversations.notConnected' });
        }

        const [userAId, userBId] = canonicalPair(req.user.id, otherUserId);

        // Find or create
        let conversation = await prisma.conversation.findUnique({
            where: { userAId_userBId: { userAId, userBId } },
            include: {
                userA: { select: { id: true, displayName: true, avatarUrl: true } },
                userB: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { userAId, userBId },
                include: {
                    userA: { select: { id: true, displayName: true, avatarUrl: true } },
                    userB: { select: { id: true, displayName: true, avatarUrl: true } },
                },
            });
        }

        const otherUser = conversation.userAId === req.user.id ? conversation.userB : conversation.userA;

        res.json({
            id: conversation.id,
            otherUser,
            lastMessage: null,
            lastMessageAt: conversation.lastMessageAt,
        });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// GET /api/conversations/:id/messages?cursor=&limit=
router.get('/:id/messages', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { cursor, limit = '20' } = req.query;
        const take = Math.min(parseInt(limit) || 20, 50);

        // Verify membership
        const conversation = await prisma.conversation.findUnique({ where: { id } });
        if (!conversation) return res.status(404).json({ error: 'conversations.notFound' });
        if (conversation.userAId !== req.user.id && conversation.userBId !== req.user.id) {
            return res.status(403).json({ error: 'conversations.notMember' });
        }

        const queryOptions = {
            where: { conversationId: id },
            orderBy: { createdAt: 'desc' },
            take: take + 1, // fetch one extra to determine hasMore
            include: {
                sender: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        };

        if (cursor) {
            queryOptions.cursor = { id: cursor };
            queryOptions.skip = 1; // skip the cursor itself
        }

        const messages = await prisma.message.findMany(queryOptions);

        const hasMore = messages.length > take;
        if (hasMore) messages.pop();

        // Return in chronological order
        messages.reverse();

        res.json({
            messages: messages.map((m) => ({
                id: m.id,
                conversationId: m.conversationId,
                senderId: m.senderId,
                sender: m.sender,
                body: m.deletedAt ? null : m.body,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
                deletedAt: m.deletedAt,
                clientMessageId: m.clientMessageId,
                isEdited: m.updatedAt > m.createdAt && !m.deletedAt,
                isDeleted: !!m.deletedAt,
            })),
            hasMore,
            nextCursor: hasMore ? messages[0]?.id : null,
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

export default router;
