import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        if (!email || !password || !displayName) {
            return res.status(400).json({ error: 'auth.fieldsRequired' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'auth.passwordTooShort' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'auth.emailTaken' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                displayName,
                avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=007AFF&color=fff`,
            },
        });

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            locale: user.locale,
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'auth.fieldsRequired' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'auth.invalidCredentials' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'auth.invalidCredentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            locale: user.locale,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ error: 'auth.userNotFound' });
        res.json({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            locale: user.locale,
        });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: 'errors.internal' });
    }
});

export default router;
