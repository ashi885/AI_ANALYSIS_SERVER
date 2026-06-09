import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabase } from './sqlite';

const TOKEN_EXPIRY = '24h';
const REFRESH_EXPIRY = '30d';
const ALGORITHM = 'HS256';

function getJwtSecret(): string {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'jwt_secret'").get() as { value: string } | undefined;
    if (row) return row.value;

    const secret = 'jwt_' + crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('jwt_secret', ?, datetime('now'))").run(secret);
    console.log('[JWT] Generated and stored new JWT secret');
    return secret;
}

export interface TokenPayload {
    sub: number;
    cid: string;
    tid: string;
    type: 'access' | 'refresh';
}

export function signAccessToken(clientId: number, credentialId: string): { token: string; jti: string; expiresAt: Date } {
    const secret = getJwtSecret();
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const payload: TokenPayload = { sub: clientId, cid: credentialId, tid: jti, type: 'access' };
    const token = jwt.sign(payload, secret, { algorithm: ALGORITHM, expiresIn: TOKEN_EXPIRY, jwtid: jti });

    const db = getDatabase();
    db.prepare(`
        INSERT INTO auth_tokens (jti, client_id, credential_id, token_type, expires_at)
        VALUES (?, ?, ?, 'access', ?)
    `).run(jti, clientId, credentialId, expiresAt.toISOString());

    return { token, jti, expiresAt };
}

export function signRefreshToken(clientId: number, credentialId: string): { token: string; jti: string; expiresAt: Date } {
    const secret = getJwtSecret();
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const payload: TokenPayload = { sub: clientId, cid: credentialId, tid: jti, type: 'refresh' };
    const token = jwt.sign(payload, secret, { algorithm: ALGORITHM, expiresIn: REFRESH_EXPIRY, jwtid: jti });

    const db = getDatabase();
    db.prepare(`
        INSERT INTO auth_tokens (jti, client_id, credential_id, token_type, expires_at)
        VALUES (?, ?, ?, 'refresh', ?)
    `).run(jti, clientId, credentialId, expiresAt.toISOString());

    return { token, jti, expiresAt };
}

export function verifyToken(token: string): TokenPayload | null {
    try {
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] }) as unknown as TokenPayload;

        const db = getDatabase();
        const revoked = db.prepare('SELECT revoked_at FROM auth_tokens WHERE jti = ?').get(decoded.tid) as { revoked_at: string | null } | undefined;

        if (revoked?.revoked_at) return null;

        return decoded;
    } catch {
        return null;
    }
}

export function revokeToken(jti: string): boolean {
    try {
        const db = getDatabase();
        const result = db.prepare("UPDATE auth_tokens SET revoked_at = datetime('now') WHERE jti = ? AND revoked_at IS NULL").run(jti);
        return result.changes > 0;
    } catch {
        return false;
    }
}

export function revokeAllClientTokens(clientId: number, credentialId?: string): boolean {
    try {
        const db = getDatabase();
        if (credentialId) {
            db.prepare(`
                UPDATE auth_tokens SET revoked_at = datetime('now')
                WHERE client_id = ? AND credential_id = ? AND revoked_at IS NULL
            `).run(clientId, credentialId);
        } else {
            db.prepare(`
                UPDATE auth_tokens SET revoked_at = datetime('now')
                WHERE client_id = ? AND revoked_at IS NULL
            `).run(clientId);
        }
        return true;
    } catch {
        return false;
    }
}
