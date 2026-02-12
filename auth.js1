import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
    try {
        const { username, password, displayName, avatarUrl } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                avatarUrl: avatarUrl || `https://ui-avatars.com/api/?name=${username}`,
            },
        });

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({ id: user.id, username: user.username, avatarUrl: user.avatarUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ id: user.id, username: user.username, avatarUrl: user.avatarUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.sendStatus(404);
        res.json({ id: user.id, username: user.username, avatarUrl: user.avatarUrl });
    } catch (error) {
        res.sendStatus(500);
    }
});

router.get('/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);

    try {
        const users = await prisma.user.findMany({
            where: {
                username: {
                    contains: q
                },
                NOT: {
                    id: req.user.id
                }
            },
            select: {
                id: true,
                username: true,
                avatarUrl: true
            },
            take: 10
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

export default router;
