import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../sqlite';
import crypto from 'crypto';

export interface LicensedRequest extends Request {
    client?: {
        id: number;
        name: string;
        api_key: string;
        billing_margin_flat: number;
        billing_margin_percent: number;
        status: string;
    };
}

export const licenseMiddleware = async (req: LicensedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.header('X-Client-API-Key');

    if (!apiKey) {
        return res.status(401).json({ error: 'Client API Key missing (X-Client-API-Key)' });
    }

    try {
        const db = getDatabase();
        const client = db.prepare(`
            SELECT id, name, api_key, billing_margin_flat, billing_margin_percent, 
                   status, contract_start, contract_end, maintenance_mode
            FROM clients WHERE api_key = ?
        `).get(apiKey) as any;

        if (!client) {
            return res.status(403).json({ error: 'Invalid API Key' });
        }

        // Check if maintenance mode is enabled
        if (client.maintenance_mode === 1) {
            return res.status(503).json({ 
                error: 'Client is in maintenance mode. Please try again later.',
                maintenance: true 
            });
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
    } catch (err) {
        console.error('License validation error:', err);
        res.status(500).json({ error: 'Internal license validation error' });
    }
};

export const getClientModels = async (clientId: number) => {
    try {
        const db = getDatabase();
        const rows = db.prepare('SELECT module_name, api_provider, api_model FROM client_models WHERE client_id = ?').all(clientId) as any[];
        return rows || [];
    } catch (err) {
        console.error('[DB] Error fetching client models:', err);
        return [];
    }
};

export const regenerateApiKey = async (clientId: number): Promise<string> => {
    const newKey = `CUE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    const db = getDatabase();
    db.prepare("UPDATE clients SET api_key = ?, updated_at = datetime('now') WHERE id = ?").run(newKey, clientId);
    return newKey;
};
