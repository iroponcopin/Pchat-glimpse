import { Router } from 'express';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/users/search?q=...
router.get('/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length === 0) return res.json([]);

    try {
        const users = await prisma.user.findMany({
            where: {
                displayName: { contains: q },
                NOT: { id: req.user.id },
            },
            select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                email: true,
            },
            take: 20,
        });
        res.json(users);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'errors.searchFailed' });
    }
});

export default router;
