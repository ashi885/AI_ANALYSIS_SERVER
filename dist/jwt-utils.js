"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyToken = verifyToken;
exports.revokeToken = revokeToken;
exports.revokeAllClientTokens = revokeAllClientTokens;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const sqlite_1 = require("./sqlite");
const TOKEN_EXPIRY = '24h';
const REFRESH_EXPIRY = '30d';
const ALGORITHM = 'HS256';
function getJwtSecret() {
    const db = (0, sqlite_1.getDatabase)();
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'jwt_secret'").get();
    if (row)
        return row.value;
    const secret = 'jwt_' + crypto_1.default.randomBytes(32).toString('hex');
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('jwt_secret', ?, datetime('now'))").run(secret);
    console.log('[JWT] Generated and stored new JWT secret');
    return secret;
}
function signAccessToken(clientId, credentialId) {
    const secret = getJwtSecret();
    const jti = crypto_1.default.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const payload = { sub: clientId, cid: credentialId, tid: jti, type: 'access' };
    const token = jsonwebtoken_1.default.sign(payload, secret, { algorithm: ALGORITHM, expiresIn: TOKEN_EXPIRY, jwtid: jti });
    const db = (0, sqlite_1.getDatabase)();
    db.prepare(`
        INSERT INTO auth_tokens (jti, client_id, credential_id, token_type, expires_at)
        VALUES (?, ?, ?, 'access', ?)
    `).run(jti, clientId, credentialId, expiresAt.toISOString());
    return { token, jti, expiresAt };
}
function signRefreshToken(clientId, credentialId) {
    const secret = getJwtSecret();
    const jti = crypto_1.default.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const payload = { sub: clientId, cid: credentialId, tid: jti, type: 'refresh' };
    const token = jsonwebtoken_1.default.sign(payload, secret, { algorithm: ALGORITHM, expiresIn: REFRESH_EXPIRY, jwtid: jti });
    const db = (0, sqlite_1.getDatabase)();
    db.prepare(`
        INSERT INTO auth_tokens (jti, client_id, credential_id, token_type, expires_at)
        VALUES (?, ?, ?, 'refresh', ?)
    `).run(jti, clientId, credentialId, expiresAt.toISOString());
    return { token, jti, expiresAt };
}
function verifyToken(token) {
    try {
        const secret = getJwtSecret();
        const decoded = jsonwebtoken_1.default.verify(token, secret, { algorithms: [ALGORITHM] });
        const db = (0, sqlite_1.getDatabase)();
        const revoked = db.prepare('SELECT revoked_at FROM auth_tokens WHERE jti = ?').get(decoded.tid);
        if (revoked === null || revoked === void 0 ? void 0 : revoked.revoked_at)
            return null;
        return decoded;
    }
    catch (_a) {
        return null;
    }
}
function revokeToken(jti) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const result = db.prepare("UPDATE auth_tokens SET revoked_at = datetime('now') WHERE jti = ? AND revoked_at IS NULL").run(jti);
        return result.changes > 0;
    }
    catch (_a) {
        return false;
    }
}
function revokeAllClientTokens(clientId, credentialId) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        if (credentialId) {
            db.prepare(`
                UPDATE auth_tokens SET revoked_at = datetime('now')
                WHERE client_id = ? AND credential_id = ? AND revoked_at IS NULL
            `).run(clientId, credentialId);
        }
        else {
            db.prepare(`
                UPDATE auth_tokens SET revoked_at = datetime('now')
                WHERE client_id = ? AND revoked_at IS NULL
            `).run(clientId);
        }
        return true;
    }
    catch (_a) {
        return false;
    }
}
