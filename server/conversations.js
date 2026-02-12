import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// List conversations
router.get('/', authenticateToken, async (req, res) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: {
                participants: {
                    some: {
                        id: req.user.id
                    }
                }
            },
            include: {
                participants: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true
                    }
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        // Format for client: calculate other Participant
        const formatted = conversations.map(c => {
            const otherParticipant = c.participants.find(p => p.id !== req.user.id);
            return {
                id: c.id,
                otherParticipant,
                lastMessage: c.messages[0]
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Start conversation
router.post('/', authenticateToken, async (req, res) => {
    const { recipientId } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'Recipient ID required' });

    try {
        // Check if conversation already exists
        const existing = await prisma.conversation.findFirst({
            where: {
                AND: [
                    { participants: { some: { id: req.user.id } } },
                    { participants: { some: { id: recipientId } } }
                ]
            },
            include: {
                participants: true
            }
        });

        if (existing) {
            return res.json({ id: existing.id, isNew: false });
        }

        const conversation = await prisma.conversation.create({
            data: {
                participants: {
                    connect: [
                        { id: req.user.id },
                        { id: recipientId }
                    ]
                }
            },
            include: {
                participants: true
            }
        });

        res.status(201).json({ id: conversation.id, isNew: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// Get messages
router.get('/:id/messages', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // Verify participation
        const conversation = await prisma.conversation.findFirst({
            where: {
                id,
                participants: {
                    some: { id: req.user.id }
                }
            }
        });

        if (!conversation) return res.sendStatus(403);

        const messages = await prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: {
                    select: { id: true, username: true, avatarUrl: true }
                }
            }
        });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

export default router;
