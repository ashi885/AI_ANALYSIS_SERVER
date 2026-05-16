"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const sqlite_1 = require("../sqlite");
exports.authRouter = (0, express_1.Router)();
// Login - validate against users table
exports.authRouter.post('/login', async (req, res) => {
    try {
        const { email, password, clientId } = req.body;
        console.log('[Login] Attempt:', { email, clientId });
        const db = (0, sqlite_1.getDatabase)();
        let query = 'SELECT * FROM users WHERE email = ?';
        const params = [email];
        if (clientId) {
            query += ' AND client_id = ?';
            params.push(clientId);
        }
        const user = db.prepare(query).get(...params);
        console.log('[Login] User found:', user ? { id: user.id, email: user.email, role: user.role } : 'none');
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Verify password (stored as hashed in production)
        // For now, simple comparison - you should use bcrypt in production
        if (user.password !== password) {
            console.log('[Login] Password mismatch');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        console.log('[Login] Success for:', user.email);
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
    }
    catch (error) {
        console.error("[Login] Error:", error);
        return res.status(500).json({ error: 'Server error' });
    }
});
// Logout
exports.authRouter.post('/logout', (req, res) => {
    res.clearCookie('cuepoint_session', { path: '/' });
    return res.json({ success: true });
});
// Me (Session info)
exports.authRouter.get('/me', (req, res) => {
    var _a;
    const sessionCookie = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.cuepoint_session;
    if (!sessionCookie) {
        return res.json({ authenticated: false });
    }
    try {
        const session = JSON.parse(sessionCookie);
        return res.json(Object.assign(Object.assign({}, session), { authenticated: true }));
    }
    catch (e) {
        return res.json({ authenticated: false });
    }
});
