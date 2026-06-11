"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminOrClientAuth = exports.requireClientAuth = exports.requireAdminAuth = void 0;
const sqlite_1 = require("../sqlite");
const jwt_utils_1 = require("../jwt-utils");
const ip_utils_1 = require("../utils/ip-utils");
function authenticateClient(apiKey) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        return db.prepare('SELECT id, name, status FROM clients WHERE api_key = ?').get(apiKey);
    }
    catch (_a) {
        return null;
    }
}
function authenticateSession(sessionCookie) {
    try {
        const session = typeof sessionCookie === 'string' ? JSON.parse(sessionCookie) : sessionCookie;
        if (session.username && session.role) {
            return session;
        }
    }
    catch (_a) { }
    return null;
}
function authenticateBasic(authHeader) {
    try {
        const auth = authHeader.split(' ')[1];
        if (!auth)
            return null;
        const decoded = Buffer.from(auth, 'base64').toString();
        const [username, password] = decoded.split(':');
        const db = (0, sqlite_1.getDatabase)();
        return db.prepare('SELECT * FROM admin_users WHERE username = ? AND password = ?').get(username, password);
    }
    catch (_a) {
        return null;
    }
}
const requireAdminAuth = async (req, res, next) => {
    var _a;
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        const client = authenticateClient(apiKey);
        if (client) {
            if (!enforceIp(req, client.id, res))
                return;
            req.client = client;
            return next();
        }
    }
    const sessionCookie = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.cuepoint_session;
    if (sessionCookie) {
        const session = authenticateSession(sessionCookie);
        if (session) {
            req.adminUser = session;
            return next();
        }
    }
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const user = authenticateBasic(authHeader);
        if (user) {
            req.adminUser = user;
            return next();
        }
    }
    return res.status(401).json({ error: 'Authorization required' });
};
exports.requireAdminAuth = requireAdminAuth;
function enforceIp(req, clientId, res) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const row = db.prepare('SELECT allowed_ips, blocked_ips FROM clients WHERE id = ?').get(clientId);
        if (!row)
            return true;
        const ip = (0, ip_utils_1.getClientIp)(req);
        const result = (0, ip_utils_1.checkIpAccess)(ip, row.allowed_ips, row.blocked_ips);
        if (!result.allowed) {
            const reason = result.blockingRule === 'blocked'
                ? 'Access denied: your IP is blocked'
                : 'Access denied: your IP is not in the allowed list';
            res.locals.accessBlocked = reason;
            res.status(403).json({ error: reason, clientIp: ip });
            return false;
        }
    }
    catch (_a) { }
    return true;
}
const requireClientAuth = async (req, res, next) => {
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        const client = authenticateClient(apiKey);
        if (client) {
            if (!enforceIp(req, client.id, res))
                return;
            req.client = client;
            return next();
        }
        return res.status(403).json({ error: 'Invalid API Key' });
    }
    const authHeader = req.headers.authorization;
    if (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = (0, jwt_utils_1.verifyToken)(token);
        if (!payload)
            return res.status(401).json({ error: 'Invalid or expired token' });
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT id, name, status FROM clients WHERE id = ?').get(payload.sub);
        if (!client || client.status !== 'active') {
            return res.status(403).json({ error: 'Client not found or inactive' });
        }
        if (!enforceIp(req, client.id, res))
            return;
        req.client = { id: client.id, name: client.name };
        req.tokenPayload = payload;
        return next();
    }
    return res.status(401).json({ error: 'Client API Key or Bearer token required' });
};
exports.requireClientAuth = requireClientAuth;
const requireAdminOrClientAuth = async (req, res, next) => {
    var _a;
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        const client = authenticateClient(apiKey);
        if (client) {
            if (!enforceIp(req, client.id, res))
                return;
            req.client = client;
            return next();
        }
    }
    const sessionCookie = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.cuepoint_session;
    if (sessionCookie) {
        const session = authenticateSession(sessionCookie);
        if (session) {
            req.adminUser = session;
            return next();
        }
    }
    const authHeader = req.headers.authorization;
    if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const payload = (0, jwt_utils_1.verifyToken)(token);
            if (payload) {
                const db = (0, sqlite_1.getDatabase)();
                const client = db.prepare('SELECT id, name, status FROM clients WHERE id = ?').get(payload.sub);
                if (client && client.status === 'active') {
                    if (!enforceIp(req, client.id, res))
                        return;
                    req.client = { id: client.id, name: client.name };
                    req.tokenPayload = payload;
                    return next();
                }
            }
        }
        else {
            const user = authenticateBasic(authHeader);
            if (user) {
                req.adminUser = user;
                return next();
            }
        }
    }
    return res.status(401).json({ error: 'Authorization required' });
};
exports.requireAdminOrClientAuth = requireAdminOrClientAuth;
