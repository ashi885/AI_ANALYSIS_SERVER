import { Router, Request, Response } from 'express';
import { getDatabase } from '../sqlite';
import { logger } from '../logger';

export const authRouter = Router();

// Login - validate against users table
authRouter.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password, clientId } = req.body;
        
        console.log('[Login] Attempt:', { email, clientId });

        const db = getDatabase();
        let query = 'SELECT * FROM users WHERE email = ?';
        const params: any[] = [email];

        if (clientId) {
            query += ' AND client_id = ?';
            params.push(clientId);
        }

        const user = db.prepare(query).get(...params) as any;

        console.log('[Login] User found:', user ? { id: user.id, email: user.email, role: user.role } : 'none');

        if (!user) {
            logger.warn('AUTH', 'LOGIN_FAILED', `User not found: ${email}`, { clientId });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password (stored as hashed in production)
        // For now, simple comparison - you should use bcrypt in production
        if (user.password !== password) {
            console.log('[Login] Password mismatch');
            logger.warn('AUTH', 'LOGIN_FAILED', `Password mismatch for user ${email}`, { clientId });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('[Login] Success for:', user.email);
        logger.info('AUTH', 'LOGIN_SUCCESS', `User ${email} logged in successfully`, {
            userId: user.id,
            email: user.email,
            clientId: user.client_id
        });

        // Set session cookies
        const sessionData = JSON.stringify({
            id: user.id,
            email: user.email,
            role: user.role,
            client_id: user.client_id
        });

        res.cookie('cuepoint_session', sessionData, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 * 7 * 1000, // 1 week in ms
            path: '/',
        });

        return res.json({
            success: true,
            role: user.role,
            user: { id: user.id, email: user.email, client_id: user.client_id }
        });
    } catch (error) {
        console.error("[Login] Error:", error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Logout
authRouter.post('/logout', (req: Request, res: Response) => {
    const sessionCookie = req.cookies?.cuepoint_session;
    let userId = 'unknown';
    if (sessionCookie) {
        try {
            const session = JSON.parse(sessionCookie);
            userId = session.id;
        } catch (e) {}
    }

    logger.info('AUTH', 'LOGOUT', `User ${userId} logged out`);
    res.clearCookie('cuepoint_session', { path: '/' });
    return res.json({ success: true });
});

// Me (Session info)
authRouter.get('/me', (req: Request, res: Response) => {
    const sessionCookie = req.cookies?.cuepoint_session;
    if (!sessionCookie) {
        return res.json({ authenticated: false });
    }

    try {
        const session = JSON.parse(sessionCookie);
        return res.json({ ...session, authenticated: true });
    } catch (e) {
        return res.json({ authenticated: false });
    }
});
