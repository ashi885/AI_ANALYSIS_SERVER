"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.regenerateApiKey = exports.getClientModels = exports.licenseMiddleware = void 0;
const sqlite_1 = require("../sqlite");
const crypto_1 = __importDefault(require("crypto"));
const licenseMiddleware = async (req, res, next) => {
    const apiKey = req.header('X-Client-API-Key');
    if (!apiKey) {
        return res.status(401).json({ error: 'Client API Key missing (X-Client-API-Key)' });
    }
    try {
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare(`
            SELECT id, name, api_key, billing_margin_flat, billing_margin_percent, 
                   status, contract_start, contract_end
            FROM clients WHERE api_key = ?
        `).get(apiKey);
        if (!client) {
            return res.status(403).json({ error: 'Invalid API Key' });
        }
        // Check if contract has expired
        const today = new Date().toISOString().split('T')[0];
        if (client.contract_end && client.contract_end < today) {
            return res.status(403).json({ error: 'Contract expired. Please renew your subscription.' });
        }
        // Check explicit status
        if (client.status === 'inactive' || client.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Contact your administrator.' });
        }
        req.client = client;
        next();
    }
    catch (err) {
        console.error('License validation error:', err);
        res.status(500).json({ error: 'Internal license validation error' });
    }
};
exports.licenseMiddleware = licenseMiddleware;
const getClientModels = async (clientId) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const rows = db.prepare('SELECT module_name, api_provider, api_model FROM client_models WHERE client_id = ?').all(clientId);
        return rows || [];
    }
    catch (err) {
        console.error('[DB] Error fetching client models:', err);
        return [];
    }
};
exports.getClientModels = getClientModels;
const regenerateApiKey = async (clientId) => {
    const newKey = `CUE-${crypto_1.default.randomBytes(12).toString('hex').toUpperCase()}`;
    const db = (0, sqlite_1.getDatabase)();
    db.prepare("UPDATE clients SET api_key = ?, updated_at = datetime('now') WHERE id = ?").run(newKey, clientId);
    return newKey;
};
exports.regenerateApiKey = regenerateApiKey;
