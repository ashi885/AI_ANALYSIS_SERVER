import { Router, Request, Response, NextFunction } from 'express';
import { logClientUsage } from '../supabase';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '../sqlite';
import { logger } from '../logger';
import {
    setClientApiKey, getClientApiKeys, deactivateApiKey,
    getApiLogs, getApiStats,
    getAvailableModels, addModel, toggleModel, deleteModel,
    getProviderLabels, setProviderLabel, setClientModelsBulk,
    toggleApiKey, deleteApiKey, updateWatcherHeartbeat,
    getClientModels, syncOpenRouterModelsToDb, addCredits, getCreditTransactions,
    getSystemTimezone, setSystemTimezone, getClientTimezone, setClientTimezone, getSystemSettings,
    getClientModuleSettings, saveClientModuleSetting,
    saveClientAIExample, getClientAIExamples,
    getClientCredentials, saveClientCredentials, getUserSetting
} from '../db-mgmt';
import { getLicenseFromCache, refreshLicenseInCache, invalidateLicenseInCache, getLicenseCacheDetails } from '../license-cache';
import { processAiJob } from '../lib/ai/job-processor';

export { logApiRequest, getClientApiKey } from '../db-mgmt';

// SMTP password encryption
const SMTP_ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const SMTP_IV_LENGTH = 16;

function encrypt(text: string): string {
    const iv = crypto.randomBytes(SMTP_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SMTP_ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) return text;
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SMTP_ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return text;
    }
}

export const mgmtRouter = Router();
export { requireAdminAuth };

// Balance alerts for dashboard notification
mgmtRouter.get('/status/balance-alerts', async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        // Check for specific client (if API key used) or all (if admin)
        let clientId: number | null = null;

        // 1. Check for X-Client-API-Key 
        const apiKey = req.header('X-Client-API-Key') || req.query.apiKey as string;
        if (apiKey) {
            const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey) as any;
            if (client) clientId = client.id;
        }

        // 2. Check for session (admin or user dashboard)
        const sessionCookie = req.cookies?.cuepoint_session;
        if (!clientId && sessionCookie) {
             const session = typeof sessionCookie === 'string' ? JSON.parse(sessionCookie) : sessionCookie;
             if (session.clientId) clientId = session.clientId;
             // If they are ADMIN and no specific clientId requested, return all warnings?
             // No, usually the dashboard is client-contextual.
        }

        if (!clientId && !(req as any).adminUser) {
             return res.json({ alerts: [] });
        }

        let sql = `
            SELECT id, name, provider_bal_openai, provider_bal_openrouter, provider_warn_threshold 
            FROM clients 
            WHERE status = 'active'
        `;
        const params: any[] = [];
        if (clientId) {
            sql += ' AND id = ?';
            params.push(clientId);
        }

        const clients = db.prepare(sql).all(...params) as any[];
        const alerts: any[] = [];

        for (const client of clients) {
            const threshold = client.provider_warn_threshold || 25.0;
            
            // Assume "initial" or "normal" top-up is a decent amount, e.g. $10 or $20.
            // If balance is < threshold % of something... 
            // Better: If balance is absolute low or % of 'recharge amount' 
            // since we don't track 'total cumulative top-ups' easily, we use a simple logic:
            // If balance is below $1 or below something... 
            // Actually, let's just use the USER'S suggestion: "when the amount is around 25 % left"
            // We need a 'total top-up' field? No, lets suggest a hard floor or just use the field as 'alert when below this value'.
            // Actually, the user says "around 25% left", which implies we know the total.
            // Let's add 'total_openai_recharge' or similar? 
            // Logic: Warn if balance is low. 
            // We use a safe floor of $2.50 or the configured threshold if available.
            const openaiBal = client.provider_bal_openai || 0;
            const routerBal = client.provider_bal_openrouter || 0;
            
            // Check OpenAI/Whisper
            if (openaiBal <= threshold) {
                alerts.push({
                    clientId: client.id,
                    clientName: client.name,
                    provider: 'OpenAI',
                    isExhausted: openaiBal <= 0,
                    message: apiKey 
                        ? (openaiBal <= 0 ? 'Service Suspended: Provider balance exhausted. Please contact support.' : `Your transcription service balance is low. Please contact support.`)
                        : `Low OpenAI balance for ${client.name} ($${openaiBal.toFixed(2)}).`
                });
            }
            
            // Check OpenRouter (Claude/Gemini)
            if (routerBal <= threshold) {
                alerts.push({
                    clientId: client.id,
                    clientName: client.name,
                    provider: 'OpenRouter',
                    isExhausted: routerBal <= 0,
                    message: apiKey 
                        ? (routerBal <= 0 ? 'Service Suspended: AI analysis balance exhausted. Please contact support.' : `Your AI analysis service balance is low. Please contact support.`)
                        : `Low OpenRouter balance for ${client.name} ($${routerBal.toFixed(2)}).`
                });
            }
        }

        res.json({ alerts });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Auth middleware for mgmt routes - Supports Admin session OR Client API Key
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    // 1. Check for X-Client-API-Key first (Internal Client calls)
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        try {
            const db = getDatabase();
            const client = db.prepare('SELECT id, name FROM clients WHERE api_key = ?').get(apiKey) as any;
            if (client) {
                (req as any).client = client;
                return next();
            }
        } catch (e) {
            console.error('[Mgmt Auth] API Key validation failed:', e);
        }
    }

    // 2. Check for session cookie (Admin Portal)
    const sessionCookie = req.cookies?.cuepoint_session;
    if (sessionCookie) {
        try {
            const session = typeof sessionCookie === 'string' ? JSON.parse(sessionCookie) : sessionCookie;
            if (session.email && session.role) {
                (req as any).adminUser = session;
                return next();
            }
        } catch (e) {
            console.log('[Mgmt Auth] Failed to parse session cookie:', e);
        }
    }

    // 3. Fall back to Basic Auth (Authorization header)
    const authHeader = req.headers.authorization;
    if (authHeader) {
        try {
            const auth = authHeader.split(' ')[1];
            if (auth) {
                const decoded = Buffer.from(auth, 'base64').toString();
                const [email, password] = decoded.split(':');
                const db = getDatabase();
                const user = db.prepare('SELECT * FROM admin_users WHERE email = ? AND password = ?').get(email, password) as any;
                if (user) {
                    (req as any).adminUser = user;
                    return next();
                }
            }
        } catch (err: any) {
            console.error('[Mgmt Auth] Authorization header check failed:', err.message);
        }
    }

    return res.status(401).json({ error: 'Authorization required' });
};

// Aliases for readability if needed
const requireAdminAuth = requireAuth;

// Login endpoint
mgmtRouter.post('/auth/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        console.log(`[Login] Attempt: email="${email}"`);
        
        const db = getDatabase();
        const user = db.prepare('SELECT * FROM admin_users WHERE email = ? AND password = ?').get(email, password) as any;

        if (!user) {
            console.log(`[Login] No user found for "${email}"`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log(`[Login] Success for: ${email}`);
        res.json({ success: true, role: user.role });
    } catch (err: any) {
        console.error('[Login] Exception:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ===== Client Management =====

mgmtRouter.get('/clients', requireAdminAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
        res.json(clients || []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.post('/clients', requireAdminAuth, async (req, res) => {
    try {
        const { 
            name, billing_margin_flat, billing_margin_percent, 
            contract_start, contract_end, setup_fee, plan, 
            module_rates, billing_type, credits, description,
            provider_bal_openai, provider_bal_openrouter, provider_warn_threshold
        } = req.body;
        if (!name) return res.status(400).json({ error: 'Client name is required' });

        const apiKey = `CUE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
        const shortCode = req.body.short_code || name.substring(0, 3).toUpperCase();
        const today = new Date().toISOString().split('T')[0];
        const clientUuid = crypto.randomUUID();

        const moduleRatesStr = module_rates ? JSON.stringify(module_rates) : null;

        const db = getDatabase();
        const result = db.prepare(`
            INSERT INTO clients (
                client_uuid, name, api_key, billing_margin_flat, billing_margin_percent, 
                contract_start, contract_end, setup_fee, plan, status, 
                module_rates, billing_type, credits, short_code, description,
                provider_bal_openai, provider_bal_openrouter, provider_warn_threshold
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            clientUuid, name, apiKey, billing_margin_flat || 0.50, billing_margin_percent || 20.0, 
            contract_start || today, contract_end || null, setup_fee || 0, plan || 'Professional', 
            moduleRatesStr, billing_type || 'PER_REQUEST', credits || 0, shortCode, description || null,
            provider_bal_openai || 0, provider_bal_openrouter || 0, provider_warn_threshold || 25.0
        );

        const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid) as any;
        if (newClient && typeof newClient.module_rates === 'string') {
            newClient.module_rates = JSON.parse(newClient.module_rates);
        }
        logger.info('SYSTEM', 'CLIENT_CREATED', `New client ${name} created`, { clientId: newClient.id, clientUuid: clientUuid, plan });
        res.json(newClient);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.put('/clients/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { 
            name, billing_margin_flat, billing_margin_percent, 
            contract_start, contract_end, setup_fee, plan, status, 
            module_rates, billing_type, credits, short_code, description,
            provider_bal_openai, provider_bal_openrouter, provider_warn_threshold
        } = req.body;
        const clientId = parseInt(String(req.params.id));
        
        const moduleRatesStr = module_rates ? JSON.stringify(module_rates) : null;
        
        const db = getDatabase();
        db.prepare(`
            UPDATE clients SET 
                name = ?, billing_margin_flat = ?, billing_margin_percent = ?,
                contract_start = ?, contract_end = ?, setup_fee = ?, plan = ?,
                status = ?, module_rates = ?, billing_type = ?, credits = ?, 
                short_code = ?, description = ?, 
                provider_bal_openai = ?, provider_bal_openrouter = ?, provider_warn_threshold = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            name, billing_margin_flat, billing_margin_percent, 
            contract_start, contract_end || null, setup_fee, plan, 
            status, moduleRatesStr, billing_type, credits, 
            short_code, description, 
            provider_bal_openai, provider_bal_openrouter, provider_warn_threshold,
            clientId
        );

        // Auto-sync module_rates → module_pricing so getModulePricing() always returns correct rates
        if (module_rates && typeof module_rates === 'object') {
            const today = new Date().toISOString().split('T')[0];
            const upsert = db.prepare(`
                INSERT INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(client_id, module_name, effective_from) DO UPDATE SET cost_per_job = excluded.cost_per_job
            `);
            for (const [moduleName, rateInfo] of Object.entries(module_rates as Record<string, any>)) {
                const cost = typeof rateInfo === 'object' ? rateInfo.cost_per_job : rateInfo;
                if (cost !== undefined && cost !== null) {
                    upsert.run(clientId, moduleName, Number(cost), today);
                }
            }
            logger.info('SYSTEM', 'MODULE_PRICING_SYNCED', `Synced ${Object.keys(module_rates).length} module rates to pricing table for client ${clientId}`);
        }

        logger.info('SYSTEM', 'CLIENT_UPDATED', `Client ${name} updated`, { clientId, status, plan });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.delete('/clients/:id', requireAdminAuth, async (req: Request, res: Response) => {
    const clientId = parseInt(String(req.params.id));
    const db = getDatabase();
    logger.warn('SYSTEM', 'CLIENT_DELETED', `Client ${clientId} deleted`);
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
    res.json({ success: true });
});

mgmtRouter.post('/clients/:id/regenerate-key', requireAdminAuth, async (req: Request, res: Response) => {
    const clientId = parseInt(String(req.params.id));
    const newApiKey = `CUE-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
    const db = getDatabase();
    db.prepare('UPDATE clients SET api_key = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newApiKey, clientId);
    logger.info('SYSTEM', 'CLIENT_API_KEY_REGENERATED', `API key regenerated for client ${clientId}`);
    res.json({ apiKey: newApiKey });
});

mgmtRouter.post('/clients/:id/toggle-status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const db = getDatabase();
        const client = db.prepare('SELECT api_key, status FROM clients WHERE id = ?').get(clientId) as any;
        
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        db.prepare('UPDATE clients SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, clientId);

        await refreshLicenseInCache(clientId, client.api_key);
        logger.info('SYSTEM', 'CLIENT_STATUS_TOGGLED', `Client ${clientId} status changed to ${newStatus}`);
        res.json({ status: newStatus });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Manage Credits
mgmtRouter.post('/clients/:id/credits', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const { amount, reason } = req.body;
        
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }
        
        const success = await addCredits(clientId, amount, reason || 'Manual adjustment');
        res.json({ success });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.get('/clients/:id/credit-transactions', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const transactions = await getCreditTransactions(clientId);
        res.json(transactions);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get client credentials
mgmtRouter.get('/clients/:id/credentials', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.params.id));
        console.log('[Credentials] GET for client:', clientId);
        
        const db = getDatabase();
        const data = db.prepare('SELECT * FROM client_credentials WHERE client_id = ?').get(clientId) as any;

        console.log('[Credentials] GET result:', { data });

        res.json({
            clientId,
            supabaseUrl: data?.supabase_url || '',
            supabaseAnonKey: data?.supabase_anon_key || ''
        });
    } catch (err: any) {
        console.error('[Credentials] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update client credentials
mgmtRouter.put('/clients/:id/credentials', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const { supabaseUrl, supabaseAnonKey } = req.body;
        console.log('[Credentials] PUT for client:', clientId, { supabaseUrl: supabaseUrl?.substring(0, 20) + '...' });

        if (!supabaseUrl || !supabaseAnonKey) {
            return res.status(400).json({ error: 'supabaseUrl and supabaseAnonKey are required' });
        }

        // Validate URL format
        try {
            new URL(supabaseUrl);
        } catch {
            return res.status(400).json({ error: 'Invalid supabaseUrl format' });
        }

        const db = getDatabase();
        // Check if exists
        const existing = db.prepare('SELECT id FROM client_credentials WHERE client_id = ?').get(clientId);
        
        if (existing) {
            db.prepare('UPDATE client_credentials SET supabase_url = ?, supabase_anon_key = ? WHERE client_id = ?')
                .run(supabaseUrl, supabaseAnonKey, clientId);
        } else {
            db.prepare('INSERT INTO client_credentials (client_id, supabase_url, supabase_anon_key) VALUES (?, ?, ?)')
                .run(clientId, supabaseUrl, supabaseAnonKey);
        }

        console.log('[Credentials] PUT result: success');

        // Refresh cache for this client
        const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId) as any;
        if (client) {
            await refreshLicenseInCache(clientId, client.api_key);
        }

        logger.info('SYSTEM', 'CLIENT_CREDENTIALS_UPDATED', `Supabase credentials updated for client ${clientId}`);
        res.json({ success: true });
    } catch (err: any) {
        console.error('[Credentials] PUT error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===== Management Summary =====

mgmtRouter.get('/billing/summary', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        
        // 1. Total Setup Fees (all-time)
        const setupFees = db.prepare("SELECT SUM(setup_fee) as setup_fee_total FROM clients").get() as { setup_fee_total: number };
        
        // 2. Active Clients
        const activeClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'active'").get() as { count: number };
        
        // 3. Monthly Revenue (Current Month)
        // Current month filter: DATE(created_at) >= DATE('now', 'start of month')
        const revenueCurMonth = db.prepare(`
            SELECT COALESCE(SUM(cost_usd), 0) as total 
            FROM client_usage 
            WHERE created_at >= date('now', 'start of month')
        `).get() as { total: number };

        // 4. Per-Client Usage Breakdown
        const clientSummaries = db.prepare(`
            SELECT 
                c.id, c.name, c.billing_type, c.credits, c.setup_fee,
                (SELECT COUNT(*) FROM ai_jobs WHERE client_id = c.id AND created_at >= date('now', 'start of month')) as jobs_this_month,
                (SELECT COALESCE(SUM(cost_usd), 0) FROM client_usage WHERE client_id = c.id AND created_at >= date('now', 'start of month')) as revenue_this_month
            FROM clients c
        `).all() as any[];

        // 5. Module specific breakdown for the selected period (optional or just all time)
        // We'll calculate this on the fly if needed, or return a list
        const moduleUsage = db.prepare(`
            SELECT client_id, module_name, COUNT(*) as count, COALESCE(SUM(cost_usd), 0) as billed_total
            FROM client_usage
            GROUP BY client_id, module_name
        `).all() as any[];

        res.json({
            totalSetupFees: setupFees?.setup_fee_total || 0,
            activeClientsCount: activeClients?.count || 0,
            monthlyRevenue: revenueCurMonth?.total || 0,
            clientSummaries: clientSummaries.map(s => ({
                ...s,
                moduleUsage: moduleUsage.filter(m => m.client_id === s.id)
            }))
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.get('/summary', requireAdminAuth, async (req: Request, res: Response) => {
    console.log('[Mgmt] GET /summary');
    try {
        const db = getDatabase();
        const today = new Date().toISOString().split('T')[0];
        
        const totalClients = (db.prepare('SELECT COUNT(*) as count FROM clients').get() as any).count;
        
        const activeClients = (db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'active' OR status IS NULL").get() as any).count;
        
        const configuredEndpoints = (db.prepare("SELECT COUNT(*) as count FROM clients WHERE api_endpoint IS NOT NULL AND api_endpoint != ''").get() as any).count;
        
        const modulesConfigured = (db.prepare('SELECT COUNT(*) as count FROM client_models').get() as any).count;

        const result = {
            totalClients: totalClients || 0,
            activeClients: activeClients || 0,
            configuredEndpoints: configuredEndpoints || 0,
            modulesConfigured: modulesConfigured || 0,
            moduleBreakdown: []
        };
        console.log('[Mgmt] Summary result:', result);
        res.json(result);
    } catch (err: any) {
        console.error('[Mgmt] Summary crash:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===== API Keys & Config =====

mgmtRouter.get('/clients/:id/api-keys', requireAdminAuth, async (req: Request, res: Response) => {
    const keys = await getClientApiKeys(parseInt(String(req.params.id)));
    res.json(keys);
});

mgmtRouter.get('/clients/:id/models', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const db = getDatabase();
        const models = db.prepare('SELECT * FROM client_models WHERE client_id = ?').all(clientId);
        res.json(models || []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.post('/api-keys/:id/toggle', requireAdminAuth, async (req: Request, res: Response) => {
    const apiKeyId = parseInt(String(req.params.id));
    const db = getDatabase();
    const apiKey = db.prepare('SELECT client_id, api_key FROM client_api_keys WHERE id = ?').get(apiKeyId) as any;
    const success = await toggleApiKey(apiKeyId);
    if (success && apiKey?.api_key) {
        await refreshLicenseInCache(apiKey.client_id, apiKey.api_key);
    }
    res.json({ success });
});

mgmtRouter.delete('/api-keys/:id', requireAdminAuth, async (req: Request, res: Response) => {
    const apiKeyId = parseInt(String(req.params.id));
    const db = getDatabase();
    const apiKey = db.prepare('SELECT client_id, api_key FROM client_api_keys WHERE id = ?').get(apiKeyId) as any;
    const success = await deleteApiKey(apiKeyId);
    if (success && apiKey?.api_key) {
        await refreshLicenseInCache(apiKey.client_id, apiKey.api_key);
    }
    res.json({ success });
});

mgmtRouter.post('/clients/:id/api-keys', requireAdminAuth, async (req: Request, res: Response) => {
    const clientId = parseInt(String(req.params.id));
    const provider = String(req.body.provider);
    const { api_key } = req.body;
    if (!provider || !api_key) return res.status(400).json({ error: 'Provider and api_key are required' });
    const db = getDatabase();
    const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId) as any;
    const success = await setClientApiKey(clientId, provider as any, api_key);
    if (success && client?.api_key) {
        await refreshLicenseInCache(clientId, client.api_key);
    }
    res.json({ success });
});

mgmtRouter.post('/clients/:id/models', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientIdentifier = String(req.params.id);
        const db = getDatabase();
        
        // Check if it's a UUID or numeric ID
        let clientId: number;
        let clientUUID: string;
        
        if (clientIdentifier.includes('-') && clientIdentifier.length > 10) {
            // It's a UUID
            const clientByUUID = db.prepare('SELECT id, api_key, client_uuid FROM clients WHERE client_uuid = ?').get(clientIdentifier) as any;
            
            if (!clientByUUID) {
                return res.status(404).json({ error: 'Client not found' });
            }
            clientId = clientByUUID.id;
            clientUUID = clientByUUID.client_uuid;
        } else {
            // It's a numeric ID
            clientId = parseInt(clientIdentifier);
            const clientById = db.prepare('SELECT id, api_key, client_uuid FROM clients WHERE id = ?').get(clientId) as any;
            
            if (!clientById) {
                return res.status(404).json({ error: 'Client not found' });
            }
            clientUUID = clientById.client_uuid;
        }
        
        const { models } = req.body;
        if (!models || !Array.isArray(models)) {
            return res.status(400).json({ error: 'models array is required' });
        }
        
        const success = await setClientModelsBulk(clientId, models);
        
        if (success) {
            const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId) as any;
            if (client?.api_key) {
                await refreshLicenseInCache(clientId, client.api_key);
            }
        }
        
        res.json({ success });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// AI Module Settings Management
mgmtRouter.get('/clients/:id/ai-settings', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(req.params.id as string);
        const settings = await getClientModuleSettings(clientId);
        res.json({ settings });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.post('/clients/:id/ai-settings', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(req.params.id as string);
        const settings = req.body;
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Valid settings object is required' });
        }
        
        let success = true;
        for (const [moduleName, moduleSettings] of Object.entries(settings)) {
            if (typeof moduleSettings === 'object' && moduleSettings !== null) {
                for (const [key, value] of Object.entries(moduleSettings)) {
                    // Correctly handle object values (tiered settings) by stringifying them
                    const finalValue = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
                    const ok = await saveClientModuleSetting(clientId, moduleName, key, finalValue);
                    if (!ok) success = false;
                }
            }
        }
        
        res.json({ success });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * AI LEARNING LOOP: Promote a result to a client example
 */
mgmtRouter.post('/clients/:id/promote-to-example', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const clientId = parseInt(req.params.id as string);
        const { moduleName, context, output } = req.body;
        
        if (!moduleName || !output) {
            return res.status(400).json({ error: 'moduleName and output are required' });
        }
        
        const success = await saveClientAIExample(clientId, moduleName, context || '', output);
        res.json({ success });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.get('/clients/config', async (req: Request, res: Response) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey) return res.status(400).json({ error: 'API key required' });

        const cached = getLicenseFromCache(apiKey);
        
        if (cached) {
            const today = new Date().toISOString().split('T')[0];
            const isExpired = cached.contractEnd && cached.contractEnd < today;
            const isActive = cached.status === 'active' && !isExpired;

            if (!isActive) {
                const errorMsg = isExpired ? 'Subscription contract has expired.' : `Subscription is currently ${cached.status || 'inactive'}.`;
                return res.json({ 
                    valid: false, 
                    status: isExpired ? 'expired' : (cached.status || 'inactive'),
                    error: errorMsg
                });
            }

            return res.json({
                valid: true,
                status: 'active',
                clientId: cached.clientUuid,
                clientName: cached.name,
                shortCode: (cached as any).shortCode || cached.name.substring(0, 3).toUpperCase(),
                _cached: true
            });
        }

        const db = getDatabase();
        const client = db.prepare('SELECT * FROM clients WHERE api_key = ?').get(apiKey) as any;
        if (!client) return res.status(404).json({ valid: false, error: 'Client not found' });

        const today = new Date().toISOString().split('T')[0];
        const isExpired = client.contract_end && client.contract_end < today;
        const isActive = client.status === 'active' && !isExpired;

        if (!isActive) {
            const errorMsg = isExpired ? 'Subscription contract has expired.' : `Subscription is currently ${client.status || 'inactive'}.`;
            return res.json({ 
                valid: false, 
                status: isExpired ? 'expired' : (client.status || 'inactive'),
                error: errorMsg
            });
        }

        res.json({
            valid: true,
            status: 'active',
            clientId: client.client_uuid,
            clientName: client.name,
            shortCode: client.short_code || client.name.substring(0, 3).toUpperCase(),
            billingType: client.billing_type || 'PER_REQUEST',
            credits: client.credits || 0,
            timezone: client.timezone || 'UTC'
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get client credentials (separate endpoint for fetching sensitive data)
mgmtRouter.get('/clients/credentials', async (req: Request, res: Response) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey) return res.status(400).json({ error: 'API key required' });

        // Get client from license key - use SQLite
        const db = getDatabase();
        const client = db.prepare('SELECT * FROM clients WHERE api_key = ?').get(apiKey) as any;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        // Get credentials from clients table
        const creds = {
            supabase_url: client.supabase_url || null,
            supabase_anon_key: client.supabase_anon_key || null
        };

        // Get API keys for client
        const keys = await getClientApiKeys(client.id);
        const modelsRow = db.prepare('SELECT * FROM client_models WHERE client_id = ?').all(client.id);
        const models = modelsRow || [];
        const rawProviderLabels = await getProviderLabels();

        const genericProviderLabels: Record<string, string> = {
            'openai': 'ai_service_primary',
            'openrouter': 'ai_service_secondary'
        };

        const sanitizedApiKeys: Record<string, string> = {};
        keys.forEach((k: any) => {
            if (k.is_active) {
                const genericProvider = genericProviderLabels[k.provider] || k.provider;
                sanitizedApiKeys[genericProvider] = k.api_key;
            }
        });

        // Sanitize providerLabels keys
        const sanitizedProviderLabels: Record<string, string> = {};
        Object.entries(rawProviderLabels || {}).forEach(([provider, label]) => {
            const genericProvider = genericProviderLabels[provider] || provider;
            sanitizedProviderLabels[genericProvider] = label as string;
        });

        // Parse module_rates from client
        let moduleRates: Record<string, any> = {};
        if (client.module_rates) {
            try {
                moduleRates = typeof client.module_rates === 'string' ? JSON.parse(client.module_rates) : client.module_rates;
            } catch (e) {
                moduleRates = {};
            }
        }

        // Sanitize models array (handle both old array format and new table format)
        const sanitizedModels: any[] = [];
        if (Array.isArray(models)) {
            models.forEach((m: any) => {
                if (m.models && Array.isArray(m.models)) {
                    // Old format with models JSON column
                    m.models.forEach((mm: any) => {
                        const genericProvider = genericProviderLabels[mm.api_provider] || mm.api_provider;
                        sanitizedModels.push({
                            module_name: mm.module_name,
                            api_provider: genericProvider,
                            api_model: mm.api_model
                        });
                    });
                } else {
                    // New table format
                    const genericProvider = genericProviderLabels[m.api_provider] || m.api_provider;
                    sanitizedModels.push({
                        module_name: m.module_name,
                        api_provider: genericProvider,
                        api_model: m.api_model
                    });
                }
            });
        }

        res.json({
            apiKeys: sanitizedApiKeys,
            maskedApiKeys: keys.reduce((acc: any, k: any) => { 
                if (k.is_active) {
                    const genericProvider = genericProviderLabels[k.provider] || k.provider;
                    acc[genericProvider] = k.api_key_prefix; 
                }
                return acc; 
            }, {}),
            configuredModels: sanitizedModels,
            providerLabels: sanitizedProviderLabels,
            moduleRates,
            supabaseUrl: creds?.supabase_url || null,
            supabaseAnonKey: creds?.supabase_anon_key || null
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get module pricing for a client
mgmtRouter.get('/clients/pricing', async (req: Request, res: Response) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey) return res.status(400).json({ error: 'API key required' });

        let clientId: number | null = null;
        const cached = getLicenseFromCache(apiKey);
        console.log('[Config] Looking up cache for key:', apiKey);
        console.log('[Config] Cached result:', cached);
        
        if (cached) {
            clientId = cached.clientId;
        } else {
            const db = getDatabase();
            const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey) as any;
            if (!client) return res.status(404).json({ error: 'Client not found' });
            clientId = client.id;
        }

        if (!clientId) return res.status(404).json({ error: 'Client not found' });

        const db = getDatabase();
        const pricing = db.prepare(`
            SELECT id, module_name, cost_per_job, effective_from, effective_to 
            FROM module_pricing 
            WHERE client_id = ?
            ORDER BY module_name ASC, effective_from DESC
        `).all(clientId);

        res.json(pricing || []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Lightweight license validation - just checks if key is valid/active (no full config)
mgmtRouter.get('/clients/validate', async (req: Request, res: Response) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey) return res.status(400).json({ valid: false, error: 'API key required' });

        const cached = getLicenseFromCache(apiKey);
        
        if (cached) {
            const today = new Date().toISOString().split('T')[0];
            const isExpired = cached.contractEnd && cached.contractEnd < today;
            const isActive = cached.status === 'active' && !isExpired;

            return res.json({
                valid: isActive,
                status: isActive ? 'active' : (isExpired ? 'expired' : (cached.status || 'inactive')),
                error: isActive ? null : (isExpired ? 'Subscription contract has expired.' : `Subscription is currently ${cached.status || 'inactive'}.`)
            });
        }

        const db = getDatabase();
        const client = db.prepare('SELECT status, contract_end FROM clients WHERE api_key = ?').get(apiKey) as any;
        if (!client) return res.status(404).json({ valid: false, error: 'Client not found' });

        const today = new Date().toISOString().split('T')[0];
        const isExpired = client.contract_end && client.contract_end < today;
        const isActive = client.status === 'active' && !isExpired;

        return res.json({
            valid: isActive,
            status: isActive ? 'active' : (isExpired ? 'expired' : (client.status || 'inactive')),
            error: isActive ? null : (isExpired ? 'Subscription contract has expired.' : `Subscription is currently ${client.status || 'inactive'}.`)
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Usage & Logs =====

mgmtRouter.get('/logs', requireAdminAuth, async (req: Request, res: Response) => {
    const { clientId, provider, direction, startDate, endDate, limit, offset, requestId, parentJobId } = req.query;
    const logs = await getApiLogs({
        clientId: clientId ? parseInt(String(clientId)) : undefined,
        provider: provider ? String(provider) : undefined,
        direction: direction ? String(direction) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined,
        requestId: requestId ? String(requestId) : undefined,
        parentJobId: parentJobId ? String(parentJobId) : undefined
    });
    res.json(logs);
});

mgmtRouter.get('/logs/stats', requireAdminAuth, async (req: Request, res: Response) => {
    const days = req.query.days ? parseInt(String(req.query.days)) : 30;
    const stats = await getApiStats(undefined, days);
    res.json(stats);
});

// ===== Available Models =====

mgmtRouter.get('/available-models', async (req: Request, res: Response) => {
    const models = await getAvailableModels();
    res.json(models);
});

mgmtRouter.post('/available-models', requireAdminAuth, async (req: Request, res: Response) => {
    const { module_id, provider, model_id, display_name } = req.body;
    const success = await addModel(module_id, provider, model_id, display_name);
    res.json({ success });
});

mgmtRouter.post('/available-models/sync-openrouter', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        
        // Get the first available OpenRouter API key
        const apiKeyRow = db.prepare(`
            SELECT ak.api_key FROM client_api_keys ak
            JOIN clients c ON ak.client_id = c.id
            WHERE ak.provider = 'openrouter' AND ak.is_active = 1
            LIMIT 1
        `).get() as { api_key: string } | undefined;
        
        if (!apiKeyRow?.api_key) {
            return res.status(400).json({ error: 'No OpenRouter API key found. Add an API key to any client first.' });
        }
        
        const count = await syncOpenRouterModelsToDb(apiKeyRow.api_key);
        res.json({ success: true, added: count, message: `Synced ${count} models from OpenRouter` });
    } catch (error: any) {
        console.error('[Sync] Failed to sync models:', error);
        res.status(500).json({ error: error.message });
    }
});

mgmtRouter.post('/available-models/:id/toggle', requireAdminAuth, async (req: Request, res: Response) => {
    const success = await toggleModel(parseInt(String(req.params.id)));
    res.json({ success });
});

mgmtRouter.delete('/available-models/:id', requireAdminAuth, async (req: Request, res: Response) => {
    const success = await deleteModel(parseInt(String(req.params.id)));
    res.json({ success });
});

// ===== Provider Labels =====

mgmtRouter.get('/provider-labels', async (req: Request, res: Response) => {
    const labels = await getProviderLabels();
    res.json(labels);
});

mgmtRouter.put('/provider-labels/:provider', requireAdminAuth, async (req: Request, res: Response) => {
    const success = await setProviderLabel(String(req.params.provider), String(req.body.label));
    res.json({ success });
});

// ===== Watcher Heartbeat =====
mgmtRouter.post('/clients/heartbeat', async (req: Request, res: Response) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey) return res.status(400).json({ error: 'API key required' });

        const db = getDatabase();
        const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey) as any;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const success = await updateWatcherHeartbeat(client.id, String(status));
        res.json({ success });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Usage Logging =====

// Get client usage logs
mgmtRouter.get('/client-usage-logs', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { clientId, limit } = req.query;
        const db = getDatabase();
        
        let sql = `
            SELECT l.*, c.name as client_name 
            FROM api_request_logs l
            JOIN clients c ON l.client_id = c.id
            WHERE 1=1
        `;
        const params: any[] = [];
        
        if (clientId) {
            sql += ' AND l.client_id = ?';
            params.push(parseInt(String(clientId)));
        }
        
        sql += ' ORDER BY l.created_at DESC';
        
        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(String(limit)));
        }
        
        const logs = db.prepare(sql).all(...params);
        res.json(logs || []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.post('/clients/usage', async (req: Request, res: Response) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey) return res.status(400).json({ error: 'API key required' });

        // Get client from license key - use SQLite
        const db = getDatabase();
        const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey) as any;
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const { 
            jobId, module, provider, model, status, costUsd, tokensUsed, latencyMs, pricingId, errorMessage, userId 
        } = req.body;

        // Insert into Supabase using existing function
        const id = await logClientUsage({
            clientId: client.id,
            jobId,
            userId,
            moduleName: module,
            provider,
            model,
            status,
            costUsd,
            tokensUsed,
            latencyMs,
            pricingId,
            errorMessage
        });

        res.json({ success: true, id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== License Cache Management =====

// GET /clients/cache - Get cache stats for all clients
mgmtRouter.get('/clients/cache', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        // Get all clients from database (including UUID)
        const db = getDatabase();
        const clients = db.prepare('SELECT id, client_uuid, api_key, name, status, updated_at FROM clients').all() as any[];
        
        // Get cache details
        const cacheDetails = getLicenseCacheDetails();
        const cacheMap = new Map(cacheDetails.map((d: any) => [d.clientId, d]));

        res.json({
            cacheStats: {
                totalClients: clients?.length || 0,
                cachedClients: cacheDetails.length,
            },
            clients: clients?.map((c: any) => {
                const cached = cacheMap.get(c.id);
                return {
                    id: c.id,
                    uuid: c.client_uuid,
                    name: c.name,
                    apiKeyPrefix: c.api_key.substring(0, 8) + '...',
                    status: c.status,
                    inCache: !!cached,
                    cachedAt: cached?.cachedAt || null,
                    isExpired: cached?.isExpired || false,
                    dbUpdatedAt: c.updated_at
                };
            }) || []
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /clients/cache/refresh - Force refresh cache for a client
mgmtRouter.post('/clients/cache/refresh', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { clientId } = req.body;
        
        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }

        // Get the client's API key and UUID - use SQLite
        const db = getDatabase();
        const client = db.prepare('SELECT api_key, client_uuid FROM clients WHERE id = ?').get(clientId) as any;

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        // Invalidate and refresh
        invalidateLicenseInCache(client.api_key);
        await refreshLicenseInCache(clientId, client.api_key, client.client_uuid);

        res.json({ success: true, message: 'Cache refreshed for client' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /clients/cache - Clear cache for a client
mgmtRouter.delete('/clients/cache', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { clientId, apiKey } = req.body;
        
        if (!clientId && !apiKey) {
            return res.status(400).json({ error: 'clientId or apiKey is required' });
        }

        let keyToInvalidate = apiKey;
        
        if (clientId && !apiKey) {
            const db = getDatabase();
            const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId) as any;
            
            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }
            keyToInvalidate = client.api_key;
        }

        invalidateLicenseInCache(keyToInvalidate);

        res.json({ success: true, message: 'Cache cleared' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== SMTP Settings =====

// Get SMTP settings
mgmtRouter.get('/smtp/settings', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const data = db.prepare('SELECT * FROM smtp_settings LIMIT 1').get() as any;

        // Don't expose encrypted password
        const response = data ? {
            id: data.id,
            host: data.host,
            port: data.port,
            secure: data.secure,
            auth_type: data.auth_type,
            username: data.username || '',
            has_password: !!data.password_encrypted,
            from_email: data.from_email,
            from_name: data.from_name,
            is_active: data.is_active
        } : null;

        res.json(response);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Save SMTP settings
mgmtRouter.post('/smtp/settings', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { host, port, secure, username, password, auth_type, from_email, from_name, is_active } = req.body;

        if (!host) {
            return res.status(400).json({ error: 'SMTP host is required' });
        }

        // Check if password was provided (we don't store it, just mark it exists)
        const db = getDatabase();
        const existing = db.prepare('SELECT password_encrypted FROM smtp_settings LIMIT 1').get() as any;
        const passwordEncrypted = password ? encrypt(password) : (existing?.password_encrypted || null);

        // Check if settings exist
        const existingSettings = db.prepare('SELECT id FROM smtp_settings LIMIT 1').get() as any;
        
        if (existingSettings) {
            // Update
            db.prepare(`
                UPDATE smtp_settings SET 
                    host = ?, port = ?, secure = ?, auth_type = ?, username = ?,
                    password_encrypted = ?, from_email = ?, from_name = ?, is_active = ?,
                    updated_at = datetime('now')
            `).run(host, port || 587, secure ? 1 : 0, auth_type || 'normal', username || null, passwordEncrypted, from_email || null, from_name || 'Cuepoint Support', is_active ? 1 : 0);
            res.json({ success: true, id: existingSettings.id });
        } else {
            // Insert
            const result = db.prepare(`
                INSERT INTO smtp_settings (host, port, secure, auth_type, username, password_encrypted, from_email, from_name, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(host, port || 587, secure ? 1 : 0, auth_type || 'normal', username || null, passwordEncrypted, from_email || null, from_name || 'Cuepoint Support', is_active ? 1 : 0);
            res.json({ success: true, id: result.lastInsertRowid });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Test SMTP connection
mgmtRouter.post('/smtp/test', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { host, port, secure, username, password, auth_type, from_email } = req.body;

        if (!host || !from_email) {
            return res.status(400).json({ error: 'Host and from_email are required' });
        }

        // Dynamic import nodemailer for testing
        const nodemailer = await import('nodemailer');
        
        const transporter = nodemailer.createTransport({
            host,
            port: port || 587,
            secure: !!secure,
            auth: auth_type === 'normal' && username && password ? {
                user: username,
                pass: password
            } : undefined
        });

        await transporter.verify();
        res.json({ success: true, message: 'SMTP connection successful' });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'SMTP test failed' });
    }
});

// Send test email
mgmtRouter.post('/smtp/send-test', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { test_email } = req.body;
        if (!test_email) {
            return res.status(400).json({ error: 'test_email is required' });
        }

        const db = getDatabase();
        const smtpData = db.prepare('SELECT * FROM smtp_settings LIMIT 1').get() as any;

        if (!smtpData || smtpData.host !== req.body.host) {
            return res.status(400).json({ error: 'Please save SMTP settings first' });
        }

        const nodemailer = await import('nodemailer');
        const password = req.body.password ? decrypt(req.body.password) : null;

        const transporter = nodemailer.createTransport({
            host: smtpData.host,
            port: smtpData.port,
            secure: !!smtpData.secure,
            auth: smtpData.auth_type === 'normal' && smtpData.username && password ? {
                user: smtpData.username,
                pass: password
            } : undefined
        });

        await transporter.sendMail({
            from: `"${smtpData.from_name || 'Cuepoint'}" <${smtpData.from_email}>`,
            to: test_email,
            subject: 'Cuepoint Support - Test Email',
            text: 'This is a test email from Cuepoint Support Portal.',
            html: '<p>This is a <strong>test email</strong> from Cuepoint Support Portal.</p>'
        });

        res.json({ success: true, message: 'Test email sent successfully' });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to send test email' });
    }
});

// ===== Email Notification Settings =====

// Get email notification settings
mgmtRouter.get('/notifications/settings', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const data = db.prepare('SELECT * FROM email_notification_settings ORDER BY id').all();
        res.json(data || []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Update email notification setting
mgmtRouter.put('/notifications/settings/:eventType', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { eventType } = req.params;
        const { is_enabled, recipient_emails, threshold_value, threshold_unit, min_pending_age_hours } = req.body;

        const db = getDatabase();
        db.prepare(`
            UPDATE email_notification_settings SET 
                is_enabled = ?, recipient_emails = ?, threshold_value = ?,
                threshold_unit = ?, min_pending_age_hours = ?, updated_at = datetime('now')
            WHERE event_type = ?
        `).run(is_enabled ? 1 : 0, JSON.stringify(recipient_emails || []), threshold_value || null, threshold_unit || null, min_pending_age_hours || null, eventType);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get pending sync queue status (for notifications)
mgmtRouter.get('/notifications/pending-status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const pending = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'pending'").get() as any;
        const oldestPending = db.prepare("SELECT created_at FROM pending_sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1").get() as any;
        const failed = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'failed'").get() as any;

        res.json({
            pendingCount: pending?.count || 0,
            oldestPendingAt: oldestPending?.created_at || null,
            failedCount: failed?.count || 0
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== AI Audit Logs (Diagnostic View) =====

// Get all AI audit logs
mgmtRouter.get('/ai-logs', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { limit = 100, clientId, moduleId } = req.query;
        const db = getDatabase();
        
        let sql = 'SELECT * FROM api_request_logs';
        const params: any[] = [];
        const conditions: string[] = [];

        if (clientId) {
            conditions.push('client_id = ?');
            params.push(clientId);
        }
        if (moduleId) {
            conditions.push('module_id = ?');
            params.push(moduleId);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(String(limit)));

        const items = db.prepare(sql).all(...params) as any[];

        // Pulse the JSON payloads (use actual DB column names: request_body, response_body)
        const parsedItems = (items || []).map(item => ({
            ...item,
            request_body: typeof item.request_body === 'string' ? JSON.parse(item.request_body) : item.request_body,
            response_body: typeof item.response_body === 'string' ? JSON.parse(item.response_body) : item.response_body
        }));

        res.json(parsedItems);
    } catch (err: any) {
        console.error('[MGMT] Error fetching AI logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===== Pending Sync Queue (Admin View) =====

// Get pending sync queue
mgmtRouter.get('/sync-queue', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { status, limit } = req.query;
        
        const db = getDatabase();
        let sql = 'SELECT * FROM pending_sync_queue';
        const params: any[] = [];

        if (status) {
            sql += ' WHERE status = ?';
            params.push(status);
        }

        sql += ' ORDER BY created_at ASC';

        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(String(limit)));
        }

        const items = db.prepare(sql).all(...params) as any[];

        // Parse payload JSON
        const parsedItems = (items || []).map(item => ({
            ...item,
            payload: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload
        }));

        res.json(parsedItems);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Retry a specific sync item
mgmtRouter.post('/sync-queue/:id/retry', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        db.prepare(`
            UPDATE pending_sync_queue SET 
                status = 'pending', retry_count = 0, error_message = NULL
            WHERE id = ?
        `).run(id);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a sync item
mgmtRouter.delete('/sync-queue/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        db.prepare('DELETE FROM pending_sync_queue WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get sync queue stats
mgmtRouter.get('/sync-queue/stats', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const db = getDatabase();
        const pending = db.prepare("SELECT status, created_at FROM pending_sync_queue WHERE status = 'pending'").all() as any[];
        const synced = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'synced'").get() as any;
        const failed = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'failed'").get() as any;

        const pendingAges = (pending || []).map(p => {
            const created = new Date(p.created_at);
            return (Date.now() - created.getTime()) / (1000 * 60 * 60); // hours
        });

        const oldestPendingHours = pendingAges.length > 0 ? Math.max(...pendingAges) : 0;

        res.json({
            pendingCount: (pending || []).length,
            syncedCount: synced?.count || 0,
            failedCount: failed?.count || 0,
            oldestPendingHours: Math.round(oldestPendingHours * 10) / 10
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Global System Settings =====

// GET Global settings
mgmtRouter.get('/settings/system', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const settings = await getSystemSettings();
        res.json(settings);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST Global settings
mgmtRouter.post('/settings/system', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { system_timezone, system_name } = req.body;
        
        if (system_timezone) {
            await setSystemTimezone(system_timezone);
        }
        
        if (system_name) {
            getDatabase().prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('system_name', ?, datetime('now'))").run(system_name);
        }
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ===== AI Job Queue Management =====

mgmtRouter.get('/ai-queue/stats', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query;
        const db = getDatabase();
        
        let filter = "";
        const params: any[] = [];
        if (clientId) {
            filter = " AND client_id = ?";
            params.push(clientId);
        }

        const processing = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE status = 'processing'${filter}`).get(...params) as any;
        const completed = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE status = 'completed' AND DATE(created_at) = DATE('now')${filter}`).get(...params) as any;
        const failed = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE status IN ('error', 'partial')${filter}`).get(...params) as any;
        const total = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE 1=1${filter}`).get(...params) as any;

        res.json({
            pendingCount: 0,
            processingCount: processing?.count || 0,
            completedToday: completed?.count || 0,
            failedCount: failed?.count || 0,
            totalCount: total?.count || 0
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.get('/ai-queue', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { status, clientId, limit } = req.query;
        
        const db = getDatabase();
        let sql = `SELECT 
            j.id, j.client_id, j.status, j.modules_requested, j.total_cost_usd, j.provider_cost_usd,
            j.error_message, j.local_job_id, j.user_id,
            j.created_at, j.updated_at,
            c.name as client_name
        FROM ai_jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        WHERE 1=1`;
        const params: any[] = [];

        if (status && status !== 'all') {
            sql += ' AND j.status = ?';
            params.push(status);
        }
        
        if (clientId) {
            sql += ' AND j.client_id = ?';
            params.push(clientId);
        }

        sql += ' ORDER BY j.created_at DESC';

        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(String(limit)));
        } else {
            sql += ' LIMIT 200';
        }

        const items = db.prepare(sql).all(...params) as any[];

        res.json(items);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

mgmtRouter.delete('/ai-queue/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getDatabase();
        db.prepare('DELETE FROM ai_jobs WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Retry a failed or partial ai_job (Enhanced for surgical retries)
mgmtRouter.post('/ai-queue/:id/retry', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { targetModules, targetLanguages } = req.body;
        const db = getDatabase();

        // NEW: Enforce Admin-only rerun control as requested (Optimized: Check server session directly)
        const adminUser = (req as any).adminUser;
        
        if (adminUser?.role !== 'ADMIN') {
            return res.status(403).json({ error: "Manual recovery requires administrator approval. Please contact support." });
        }
        
        // 1. Get job info
        const job = db.prepare(`
            SELECT j.*, c.name as client_name 
            FROM ai_jobs j 
            JOIN clients c ON j.client_id = c.id
            WHERE j.id = ?
        `).get(id) as any;

        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        // 2. Determine what to run
        // If targetModules provided, use those. Otherwise default to all requested modules (Smart Skip logic in processor will handle the rest)
        const modulesToRun = (targetModules && Array.isArray(targetModules) && targetModules.length > 0)
            ? targetModules
            : JSON.parse(job.modules_requested || '[]');

        // If targetLanguages provided, use those. Otherwise default to job's target_languages
        const languagesToRun = (targetLanguages && Array.isArray(targetLanguages) && targetLanguages.length > 0)
            ? targetLanguages
            : (job.target_languages ? JSON.parse(job.target_languages) : undefined);

        // 3. Clear error message and set to processing
        db.prepare(`
            UPDATE ai_jobs SET 
                status = 'processing', error_message = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(id);

        // 4. Trigger processing in background
        logger.info('AI', 'JOB_RETRY_TRIGGERED', `Retry initiated for Job ${id}`, { 
            targetModules: modulesToRun, 
            targetLanguages: languagesToRun 
        });

        // Use a background call so the UI doesn't time out
        processAiJob(job.id, job.audio_path, modulesToRun, job.client_id, job.client_name, null, languagesToRun)
          .catch(err => logger.error('AI', 'JOB_RETRY_FAILED', `Background retry failed for job ${id}: ${err.message}`));

        res.json({ success: true, message: 'Processing restarted surgically' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


/**
 * Universal Export Result Endpoint
 * Handles subtitles, ad_breaks, promo_breaks, metadata
 */
mgmtRouter.post('/jobs/:id/export-result', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { moduleName, data } = req.body;
        const db = getDatabase();
        
        const job = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id) as any;
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        const outputDir = getUserSetting(job.user_id, 'output_directory');
        if (!outputDir || !fs.existsSync(outputDir)) {
            return res.status(400).json({ error: 'Output directory not configured' });
        }

        let content: string;
        let ext = 'json';
        let suffix = `_${moduleName}`;

        if (moduleName === 'subtitles') {
            const formatAsSRT = (subs: any[]) => {
                return subs.map((s, i) => {
                    const formatTime = (sec: number) => {
                        const hrs = Math.floor(sec / 3600);
                        const mins = Math.floor((sec % 3600) / 60);
                        const secs = Math.floor(sec % 60);
                        const ms = Math.floor((sec % 1) * 1000);
                        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
                    };
                    return `${i + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}\n`;
                }).join('\n');
            };
            content = formatAsSRT(data.subtitles || []);
            ext = 'srt';
            suffix = '';
        } else {
            content = JSON.stringify(data, null, 2);
            if (moduleName === 'ad_breaks') suffix = '_adbreak';
            if (moduleName === 'promo_breaks') suffix = '_promo';
            if (moduleName === 'metadata') suffix = '_metadata';
        }

        const baseName = job.filename.includes('.') ? job.filename.substring(0, job.filename.lastIndexOf('.')) : job.filename;
        const fullPath = path.join(outputDir, `${baseName}${suffix}.${ext}`);
        
        fs.writeFileSync(fullPath, content);
        res.json({ success: true, path: fullPath });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Universal Download Result Endpoint
 * returns raw content for browser download
 */
mgmtRouter.post('/jobs/:id/download-result', requireAuth, async (req: Request, res: Response) => {
    try {
        const { moduleName, data } = req.body;
        let content: string;
        let contentType: string;

        if (moduleName === 'subtitles') {
            const formatAsSRT = (subs: any[]) => {
                return subs.map((s, i) => {
                    const formatTime = (sec: number) => {
                        const hrs = Math.floor(sec / 3600);
                        const mins = Math.floor((sec % 3600) / 60);
                        const secs = Math.floor(sec % 60);
                        const ms = Math.floor((sec % 1) * 1000);
                        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
                    };
                    return `${i + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}\n`;
                }).join('\n');
            };
            content = formatAsSRT(data.subtitles || []);
            contentType = 'text/plain';
        } else {
            content = JSON.stringify(data, null, 2);
            contentType = 'application/json';
        }

        res.setHeader('Content-Type', contentType);
        res.send(content);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

