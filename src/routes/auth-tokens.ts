import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDatabase } from '../sqlite';
import { signAccessToken, signRefreshToken, verifyToken, revokeToken, revokeAllClientTokens } from '../jwt-utils';
import { requireAdminAuth } from '../middleware/auth';
import { getClientIp, checkIpAccess } from '../utils/ip-utils';

export const authTokenRouter = Router();

authTokenRouter.post('/token', async (req: Request, res: Response) => {
    try {
        const { client_id, client_secret } = req.body;
        if (!client_id || !client_secret) {
            return res.status(400).json({ error: 'client_id and client_secret are required' });
        }

        const db = getDatabase();
        const cred = db.prepare(`
            SELECT cac.id, cac.client_id, cac.credential_secret_hash, c.status, c.contract_end
            FROM client_auth_credentials cac
            JOIN clients c ON c.id = cac.client_id
            WHERE cac.credential_id = ? AND cac.is_active = 1
        `).get(client_id) as any;

        if (!cred) return res.status(401).json({ error: 'Invalid client_id' });

        const valid = await bcrypt.compare(client_secret, cred.credential_secret_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid client_secret' });

        const today = new Date().toISOString().split('T')[0];
        const isExpired = cred.contract_end && cred.contract_end < today;
        if (cred.status !== 'active' || isExpired) {
            return res.status(403).json({ error: 'Client subscription is not active' });
        }

        const ip = getClientIp(req);
        const clientRow = db.prepare('SELECT allowed_ips, blocked_ips FROM clients WHERE id = ?').get(cred.client_id) as { allowed_ips: string | null; blocked_ips: string | null };
        if (clientRow) {
            const ipResult = checkIpAccess(ip, clientRow.allowed_ips, clientRow.blocked_ips);
            if (!ipResult.allowed) {
                return res.status(403).json({ error: 'Access denied from this IP', clientIp: ip });
            }
        }

        db.prepare("UPDATE client_auth_credentials SET last_used_at = datetime('now') WHERE id = ?").run(cred.id);

        const access = signAccessToken(cred.client_id, String(cred.id));
        const refresh = signRefreshToken(cred.client_id, String(cred.id));

        res.json({
            access_token: access.token,
            refresh_token: refresh.token,
            expires_in: 86400,
            token_type: 'Bearer'
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

authTokenRouter.post('/token/refresh', async (req: Request, res: Response) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

        const payload = verifyToken(refresh_token);
        if (!payload || payload.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }

        const db = getDatabase();
        const cred = db.prepare(`
            SELECT cac.id, cac.client_id, cac.is_active, c.status
            FROM client_auth_credentials cac
            JOIN clients c ON c.id = cac.client_id
            WHERE cac.id = ?
        `).get(payload.cid) as any;

        if (!cred || !cred.is_active || cred.status !== 'active') {
            return res.status(403).json({ error: 'Credentials no longer active' });
        }

        revokeToken(payload.tid);

        const access = signAccessToken(cred.client_id, String(cred.id));
        const refresh = signRefreshToken(cred.client_id, String(cred.id));

        res.json({
            access_token: access.token,
            refresh_token: refresh.token,
            expires_in: 86400,
            token_type: 'Bearer'
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

authTokenRouter.post('/token/revoke', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Bearer token required' });
        }

        const token = authHeader.slice(7);
        const payload = verifyToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid token' });

        const ok = revokeToken(payload.tid);
        res.json({ revoked: ok });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

authTokenRouter.post('/token/credentials/generate', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { clientId, description } = req.body;
        if (!clientId) return res.status(400).json({ error: 'clientId is required' });

        const db = getDatabase();
        const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId) as any;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const credentialId = 'cp_' + crypto.randomBytes(12).toString('hex');
        const clientSecret = crypto.randomBytes(24).toString('hex');
        const secretHash = await bcrypt.hash(clientSecret, 10);

        db.prepare(`
            INSERT INTO client_auth_credentials (client_id, credential_id, credential_secret_hash, description)
            VALUES (?, ?, ?, ?)
        `).run(clientId, credentialId, secretHash, description || 'API Credentials');

        res.json({
            client_id: credentialId,
            client_secret: clientSecret,
            description: description || 'API Credentials',
            warning: 'Save the client_secret — it will not be shown again.'
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

authTokenRouter.get('/token/credentials', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query;
        const db = getDatabase();

        let sql = 'SELECT id, client_id, credential_id, description, is_active, last_used_at, created_at FROM client_auth_credentials';
        const params: any[] = [];

        if (clientId) {
            sql += ' WHERE client_id = ?';
            params.push(parseInt(String(clientId)));
        }

        sql += ' ORDER BY created_at DESC';
        const creds = db.prepare(sql).all(...params);
        res.json(creds || []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

authTokenRouter.post('/token/credentials/:id/revoke', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const cred = db.prepare('SELECT id, client_id FROM client_auth_credentials WHERE id = ?').get(req.params.id) as any;
        if (!cred) return res.status(404).json({ error: 'Credential not found' });

        db.prepare("UPDATE client_auth_credentials SET is_active = 0 WHERE id = ?").run(cred.id);
        revokeAllClientTokens(cred.client_id, String(cred.id));

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
