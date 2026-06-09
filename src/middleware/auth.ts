import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../sqlite';
import { verifyToken } from '../jwt-utils';
import { getClientIp, checkIpAccess } from '../utils/ip-utils';

function authenticateClient(apiKey: string): any {
    try {
        const db = getDatabase();
        return db.prepare('SELECT id, name, status FROM clients WHERE api_key = ?').get(apiKey);
    } catch {
        return null;
    }
}

function authenticateSession(sessionCookie: string): any {
    try {
        const session = typeof sessionCookie === 'string' ? JSON.parse(sessionCookie) : sessionCookie;
        if (session.username && session.role) {
            return session;
        }
    } catch {}
    return null;
}

function authenticateBasic(authHeader: string): any {
    try {
        const auth = authHeader.split(' ')[1];
        if (!auth) return null;
        const decoded = Buffer.from(auth, 'base64').toString();
        const [username, password] = decoded.split(':');
        const db = getDatabase();
        return db.prepare('SELECT * FROM admin_users WHERE username = ? AND password = ?').get(username, password);
    } catch {
        return null;
    }
}

export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        const client = authenticateClient(apiKey);
        if (client) {
            (req as any).client = client;
            return next();
        }
    }

    const sessionCookie = req.cookies?.cuepoint_session;
    if (sessionCookie) {
        const session = authenticateSession(sessionCookie);
        if (session) {
            (req as any).adminUser = session;
            return next();
        }
    }

    const authHeader = req.headers.authorization;
    if (authHeader) {
        const user = authenticateBasic(authHeader);
        if (user) {
            (req as any).adminUser = user;
            return next();
        }
    }

    return res.status(401).json({ error: 'Authorization required' });
};

function enforceIp(req: Request, clientId: number, res: Response): boolean {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT allowed_ips, blocked_ips FROM clients WHERE id = ?').get(clientId) as { allowed_ips: string | null; blocked_ips: string | null } | undefined;
        if (!row) return true;
        const ip = getClientIp(req);
        const result = checkIpAccess(ip, row.allowed_ips, row.blocked_ips);
        if (!result.allowed) {
            const reason = result.blockingRule === 'blocked'
                ? 'Access denied: your IP is blocked'
                : 'Access denied: your IP is not in the allowed list';
            res.status(403).json({ error: reason, clientIp: ip });
            return false;
        }
    } catch { }
    return true;
}

export const requireClientAuth = async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        const client = authenticateClient(apiKey);
        if (client) {
            if (!enforceIp(req, client.id, res)) return;
            (req as any).client = client;
            return next();
        }
        return res.status(403).json({ error: 'Invalid API Key' });
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = verifyToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

        const db = getDatabase();
        const client = db.prepare('SELECT id, name, status FROM clients WHERE id = ?').get(payload.sub) as any;
        if (!client || client.status !== 'active') {
            return res.status(403).json({ error: 'Client not found or inactive' });
        }

        if (!enforceIp(req, client.id, res)) return;
        (req as any).client = { id: client.id, name: client.name };
        (req as any).tokenPayload = payload;
        return next();
    }

    return res.status(401).json({ error: 'Client API Key or Bearer token required' });
};
