"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminAuth = exports.mgmtRouter = exports.getClientApiKey = exports.logApiRequest = void 0;
const express_1 = require("express");
const supabase_1 = require("../supabase");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sqlite_1 = require("../sqlite");
const logger_1 = require("../logger");
const db_mgmt_1 = require("../db-mgmt");
const license_cache_1 = require("../license-cache");
const job_processor_1 = require("../lib/ai/job-processor");
var db_mgmt_2 = require("../db-mgmt");
Object.defineProperty(exports, "logApiRequest", { enumerable: true, get: function () { return db_mgmt_2.logApiRequest; } });
Object.defineProperty(exports, "getClientApiKey", { enumerable: true, get: function () { return db_mgmt_2.getClientApiKey; } });
// SMTP password encryption
const SMTP_ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || crypto_1.default.randomBytes(32).toString('hex');
const SMTP_IV_LENGTH = 16;
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(SMTP_IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', Buffer.from(SMTP_ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(text) {
    try {
        const parts = text.split(':');
        if (parts.length !== 2)
            return text;
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', Buffer.from(SMTP_ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (_a) {
        return text;
    }
}
exports.mgmtRouter = (0, express_1.Router)();
// Auth middleware for mgmt routes - Supports Admin session OR Client API Key
const requireAuth = async (req, res, next) => {
    var _a;
    // 1. Check for X-Client-API-Key first (Internal Client calls)
    const apiKey = req.header('X-Client-API-Key');
    if (apiKey) {
        try {
            const db = (0, sqlite_1.getDatabase)();
            const client = db.prepare('SELECT id, name FROM clients WHERE api_key = ?').get(apiKey);
            if (client) {
                req.client = client;
                return next();
            }
        }
        catch (e) {
            console.error('[Mgmt Auth] API Key validation failed:', e);
        }
    }
    // 2. Check for session cookie (Admin Portal)
    const sessionCookie = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.cuepoint_session;
    if (sessionCookie) {
        try {
            const session = typeof sessionCookie === 'string' ? JSON.parse(sessionCookie) : sessionCookie;
            if (session.email && session.role) {
                req.adminUser = session;
                return next();
            }
        }
        catch (e) {
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
                const db = (0, sqlite_1.getDatabase)();
                const user = db.prepare('SELECT * FROM admin_users WHERE email = ? AND password = ?').get(email, password);
                if (user) {
                    req.adminUser = user;
                    return next();
                }
            }
        }
        catch (err) {
            console.error('[Mgmt Auth] Authorization header check failed:', err.message);
        }
    }
    return res.status(401).json({ error: 'Authorization required' });
};
// Aliases for readability if needed
const requireAdminAuth = requireAuth;
exports.requireAdminAuth = requireAdminAuth;
// Balance alerts for dashboard notification - staff only
exports.mgmtRouter.get('/status/balance-alerts', requireAdminAuth, async (req, res) => {
    try {
        // Ensure only admin/staff can access this
        if (!req.adminUser) {
            return res.status(403).json({ error: 'Access denied: Staff only' });
        }
        const db = (0, sqlite_1.getDatabase)();
        const clients = db.prepare(`
            SELECT id, name, provider_bal_openai, provider_bal_openrouter, provider_warn_threshold 
            FROM clients 
            WHERE status = 'active'
        `).all();
        const alerts = [];
        for (const client of clients) {
            const threshold = client.provider_warn_threshold || 25.0;
            const openaiBal = client.provider_bal_openai || 0;
            const routerBal = client.provider_bal_openrouter || 0;
            // Check OpenAI/Whisper
            if (openaiBal <= threshold) {
                alerts.push({
                    clientId: client.id,
                    clientName: client.name,
                    client_name: client.name,
                    provider: 'OpenAI',
                    balance: openaiBal,
                    isExhausted: openaiBal <= 0,
                    message: `Low OpenAI balance for ${client.name} ($${openaiBal.toFixed(2)}).`
                });
            }
            // Check OpenRouter (Claude/Gemini)
            if (routerBal <= threshold) {
                alerts.push({
                    clientId: client.id,
                    clientName: client.name,
                    client_name: client.name,
                    provider: 'OpenRouter',
                    balance: routerBal,
                    isExhausted: routerBal <= 0,
                    message: `Low OpenRouter balance for ${client.name} ($${routerBal.toFixed(2)}).`
                });
            }
        }
        res.json(alerts);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Login endpoint
exports.mgmtRouter.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[Login] Attempt: email="${email}"`);
        const db = (0, sqlite_1.getDatabase)();
        const user = db.prepare('SELECT * FROM admin_users WHERE email = ? AND password = ?').get(email, password);
        if (!user) {
            console.log(`[Login] No user found for "${email}"`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        console.log(`[Login] Success for: ${email}`);
        res.json({ success: true, role: user.role });
    }
    catch (err) {
        console.error('[Login] Exception:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ===== Client Management =====
exports.mgmtRouter.get('/clients', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
        res.json(clients || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/clients', requireAdminAuth, async (req, res) => {
    try {
        const { name, billing_margin_flat, billing_margin_percent, contract_start, contract_end, setup_fee, plan, module_rates, billing_type, credits, description, provider_bal_openai, provider_bal_openrouter, provider_warn_threshold, allow_rate_card_fetch } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Client name is required' });
        const apiKey = `CUE-${crypto_1.default.randomBytes(12).toString('hex').toUpperCase()}`;
        const shortCode = req.body.short_code || name.substring(0, 3).toUpperCase();
        const today = new Date().toISOString().split('T')[0];
        const clientUuid = crypto_1.default.randomUUID();
        const moduleRatesStr = module_rates ? JSON.stringify(module_rates) : null;
        const db = (0, sqlite_1.getDatabase)();
        const result = db.prepare(`
            INSERT INTO clients (
                client_uuid, name, api_key, billing_margin_flat, billing_margin_percent, 
                contract_start, contract_end, setup_fee, plan, status, 
                module_rates, billing_type, credits, short_code, description,
                provider_bal_openai, provider_bal_openrouter, provider_warn_threshold,
                allow_rate_card_fetch
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(clientUuid, name, apiKey, billing_margin_flat || 0.50, billing_margin_percent || 20.0, contract_start || today, contract_end || null, setup_fee || 0, plan || 'Professional', moduleRatesStr, billing_type || 'PER_REQUEST', credits || 0, shortCode, description || null, provider_bal_openai || 0, provider_bal_openrouter || 0, provider_warn_threshold || 25.0, allow_rate_card_fetch ? 1 : 0);
        const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
        if (newClient && typeof newClient.module_rates === 'string') {
            newClient.module_rates = JSON.parse(newClient.module_rates);
        }
        logger_1.logger.info('SYSTEM', 'CLIENT_CREATED', `New client ${name} created`, { clientId: newClient.id, clientUuid: clientUuid, plan });
        res.json(newClient);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.put('/clients/:id', requireAdminAuth, async (req, res) => {
    try {
        const { name, billing_margin_flat, billing_margin_percent, contract_start, contract_end, setup_fee, plan, status, module_rates, billing_type, credits, short_code, description, provider_bal_openai, provider_bal_openrouter, provider_warn_threshold, allow_rate_card_fetch } = req.body;
        const clientId = parseInt(String(req.params.id));
        const moduleRatesStr = module_rates ? JSON.stringify(module_rates) : null;
        const db = (0, sqlite_1.getDatabase)();
        db.prepare(`
            UPDATE clients SET 
                name = ?, billing_margin_flat = ?, billing_margin_percent = ?,
                contract_start = ?, contract_end = ?, setup_fee = ?, plan = ?,
                status = ?, module_rates = ?, billing_type = ?, credits = ?, 
                short_code = ?, description = ?, 
                provider_bal_openai = ?, provider_bal_openrouter = ?, provider_warn_threshold = ?,
                allow_rate_card_fetch = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, billing_margin_flat, billing_margin_percent, contract_start, contract_end || null, setup_fee, plan, status, moduleRatesStr, billing_type, credits, short_code, description, provider_bal_openai, provider_bal_openrouter, provider_warn_threshold, allow_rate_card_fetch ? 1 : 0, clientId);
        // Auto-sync module_rates → module_pricing so getModulePricing() always returns correct rates
        if (module_rates && typeof module_rates === 'object') {
            const today = new Date().toISOString().split('T')[0];
            const upsert = db.prepare(`
                INSERT INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(client_id, module_name, effective_from) DO UPDATE SET cost_per_job = excluded.cost_per_job
            `);
            for (const [moduleName, rateInfo] of Object.entries(module_rates)) {
                const cost = typeof rateInfo === 'object' ? rateInfo.cost_per_job : rateInfo;
                if (cost !== undefined && cost !== null) {
                    upsert.run(clientId, moduleName, Number(cost), today);
                }
            }
            logger_1.logger.info('SYSTEM', 'MODULE_PRICING_SYNCED', `Synced ${Object.keys(module_rates).length} module rates to pricing table for client ${clientId}`);
        }
        const updatedClient = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
        if (updatedClient) {
            (0, license_cache_1.invalidateLicenseInCache)(updatedClient.api_key);
        }
        logger_1.logger.info('SYSTEM', 'CLIENT_UPDATED', `Client ${name} updated`, { clientId, status, plan });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.delete('/clients/:id', requireAdminAuth, async (req, res) => {
    const clientId = parseInt(String(req.params.id));
    const db = (0, sqlite_1.getDatabase)();
    logger_1.logger.warn('SYSTEM', 'CLIENT_DELETED', `Client ${clientId} deleted`);
    const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
    if (client) {
        (0, license_cache_1.invalidateLicenseInCache)(client.api_key);
    }
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
    res.json({ success: true });
});
exports.mgmtRouter.post('/clients/:id/regenerate-key', requireAdminAuth, async (req, res) => {
    const clientId = parseInt(String(req.params.id));
    const newApiKey = `CUE-${crypto_1.default.randomBytes(12).toString('hex').toUpperCase()}`;
    const db = (0, sqlite_1.getDatabase)();
    const oldClient = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
    if (oldClient) {
        (0, license_cache_1.invalidateLicenseInCache)(oldClient.api_key);
    }
    db.prepare('UPDATE clients SET api_key = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newApiKey, clientId);
    logger_1.logger.info('SYSTEM', 'CLIENT_API_KEY_REGENERATED', `API key regenerated for client ${clientId}`);
    res.json({ apiKey: newApiKey });
});
exports.mgmtRouter.post('/clients/:id/toggle-status', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT api_key, status FROM clients WHERE id = ?').get(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        db.prepare('UPDATE clients SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, clientId);
        await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
        logger_1.logger.info('SYSTEM', 'CLIENT_STATUS_TOGGLED', `Client ${clientId} status changed to ${newStatus}`);
        res.json({ status: newStatus });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Manage Credits
exports.mgmtRouter.post('/clients/:id/credits', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const { amount, reason } = req.body;
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }
        const success = await (0, db_mgmt_1.addCredits)(clientId, amount, reason || 'Manual adjustment');
        res.json({ success });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.get('/clients/:id/credit-transactions', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const transactions = await (0, db_mgmt_1.getCreditTransactions)(clientId);
        res.json(transactions);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get client credentials
exports.mgmtRouter.get('/clients/:id/credentials', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.id));
        console.log('[Credentials] GET for client:', clientId);
        const db = (0, sqlite_1.getDatabase)();
        const data = db.prepare('SELECT * FROM client_credentials WHERE client_id = ?').get(clientId);
        console.log('[Credentials] GET result:', { data });
        res.json({
            clientId,
            supabaseUrl: (data === null || data === void 0 ? void 0 : data.supabase_url) || '',
            supabaseAnonKey: (data === null || data === void 0 ? void 0 : data.supabase_anon_key) || ''
        });
    }
    catch (err) {
        console.error('[Credentials] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});
// Update client credentials
exports.mgmtRouter.put('/clients/:id/credentials', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const { supabaseUrl, supabaseAnonKey } = req.body;
        console.log('[Credentials] PUT for client:', clientId, { supabaseUrl: (supabaseUrl === null || supabaseUrl === void 0 ? void 0 : supabaseUrl.substring(0, 20)) + '...' });
        if (!supabaseUrl || !supabaseAnonKey) {
            return res.status(400).json({ error: 'supabaseUrl and supabaseAnonKey are required' });
        }
        // Validate URL format
        try {
            new URL(supabaseUrl);
        }
        catch (_a) {
            return res.status(400).json({ error: 'Invalid supabaseUrl format' });
        }
        const db = (0, sqlite_1.getDatabase)();
        // Check if exists
        const existing = db.prepare('SELECT id FROM client_credentials WHERE client_id = ?').get(clientId);
        if (existing) {
            db.prepare('UPDATE client_credentials SET supabase_url = ?, supabase_anon_key = ? WHERE client_id = ?')
                .run(supabaseUrl, supabaseAnonKey, clientId);
        }
        else {
            db.prepare('INSERT INTO client_credentials (client_id, supabase_url, supabase_anon_key) VALUES (?, ?, ?)')
                .run(clientId, supabaseUrl, supabaseAnonKey);
        }
        console.log('[Credentials] PUT result: success');
        // Refresh cache for this client
        const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
        if (client) {
            await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
        }
        logger_1.logger.info('SYSTEM', 'CLIENT_CREDENTIALS_UPDATED', `Supabase credentials updated for client ${clientId}`);
        res.json({ success: true });
    }
    catch (err) {
        console.error('[Credentials] PUT error:', err);
        res.status(500).json({ error: err.message });
    }
});
// ===== Management Summary =====
exports.mgmtRouter.get('/billing/summary', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        // 1. Total Setup Fees (all-time)
        const setupFees = db.prepare("SELECT SUM(setup_fee) as setup_fee_total FROM clients").get();
        // 2. Active Clients
        const activeClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'active'").get();
        // 3. Monthly Revenue (Current Month)
        // Current month filter: DATE(created_at) >= DATE('now', 'start of month')
        const revenueCurMonth = db.prepare(`
            SELECT COALESCE(SUM(cost_usd), 0) as total 
            FROM client_usage 
            WHERE created_at >= date('now', 'start of month')
        `).get();
        // 4. Per-Client Usage Breakdown
        const clientSummaries = db.prepare(`
            SELECT 
                c.id, c.name, c.billing_type, c.credits, c.setup_fee,
                (SELECT COUNT(*) FROM ai_jobs WHERE client_id = c.id AND created_at >= date('now', 'start of month')) as jobs_this_month,
                (SELECT COALESCE(SUM(cost_usd), 0) FROM client_usage WHERE client_id = c.id AND created_at >= date('now', 'start of month')) as revenue_this_month
            FROM clients c
        `).all();
        // 5. Module specific breakdown for the selected period (optional or just all time)
        // We'll calculate this on the fly if needed, or return a list
        const moduleUsage = db.prepare(`
            SELECT client_id, module_name, COUNT(*) as count, COALESCE(SUM(cost_usd), 0) as billed_total
            FROM client_usage
            GROUP BY client_id, module_name
        `).all();
        res.json({
            totalSetupFees: (setupFees === null || setupFees === void 0 ? void 0 : setupFees.setup_fee_total) || 0,
            activeClientsCount: (activeClients === null || activeClients === void 0 ? void 0 : activeClients.count) || 0,
            monthlyRevenue: (revenueCurMonth === null || revenueCurMonth === void 0 ? void 0 : revenueCurMonth.total) || 0,
            clientSummaries: clientSummaries.map(s => (Object.assign(Object.assign({}, s), { moduleUsage: moduleUsage.filter(m => m.client_id === s.id) })))
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.get('/summary', requireAdminAuth, async (req, res) => {
    console.log('[Mgmt] GET /summary');
    try {
        const db = (0, sqlite_1.getDatabase)();
        const today = new Date().toISOString().split('T')[0];
        const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
        const activeClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'active' OR status IS NULL").get().count;
        const configuredEndpoints = db.prepare("SELECT COUNT(*) as count FROM clients WHERE api_endpoint IS NOT NULL AND api_endpoint != ''").get().count;
        const modulesConfigured = db.prepare('SELECT COUNT(*) as count FROM client_models').get().count;
        // Get recent AI request logs for the dashboard
        const recentLogs = db.prepare(`
            SELECT l.*, c.name as client_name 
            FROM api_request_logs l
            JOIN clients c ON l.client_id = c.id
            ORDER BY l.created_at DESC 
            LIMIT 5
        `).all();
        const result = {
            totalClients: totalClients || 0,
            activeClients: activeClients || 0,
            configuredEndpoints: configuredEndpoints || 0,
            modulesConfigured: modulesConfigured || 0,
            moduleBreakdown: [],
            recentLogs: recentLogs || []
        };
        res.json(result);
    }
    catch (err) {
        console.error('[Mgmt] Summary crash:', err);
        res.status(500).json({ error: err.message });
    }
});
// ===== API Keys & Config =====
exports.mgmtRouter.get('/clients/:id/api-keys', requireAdminAuth, async (req, res) => {
    const keys = await (0, db_mgmt_1.getClientApiKeys)(parseInt(String(req.params.id)));
    res.json(keys);
});
exports.mgmtRouter.get('/clients/:id/models', requireAdminAuth, async (req, res) => {
    try {
        const clientIdentifier = String(req.params.id);
        const db = (0, sqlite_1.getDatabase)();
        let clientId;
        const isNumericId = /^\d+$/.test(clientIdentifier) && clientIdentifier.length < 20;
        if (!isNumericId) {
            const client = db.prepare('SELECT id FROM clients WHERE client_uuid = ?').get(clientIdentifier);
            if (!client)
                return res.status(404).json({ error: 'Client not found' });
            clientId = client.id;
        }
        else {
            clientId = parseInt(clientIdentifier);
        }
        const models = db.prepare('SELECT * FROM client_models WHERE client_id = ?').all(clientId);
        res.json(models || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/api-keys/:id/toggle', requireAdminAuth, async (req, res) => {
    const apiKeyId = parseInt(String(req.params.id));
    const db = (0, sqlite_1.getDatabase)();
    const apiKey = db.prepare('SELECT client_id, api_key FROM client_api_keys WHERE id = ?').get(apiKeyId);
    const success = await (0, db_mgmt_1.toggleApiKey)(apiKeyId);
    if (success && (apiKey === null || apiKey === void 0 ? void 0 : apiKey.api_key)) {
        await (0, license_cache_1.refreshLicenseInCache)(apiKey.client_id, apiKey.api_key);
    }
    res.json({ success });
});
exports.mgmtRouter.delete('/api-keys/:id', requireAdminAuth, async (req, res) => {
    const apiKeyId = parseInt(String(req.params.id));
    const db = (0, sqlite_1.getDatabase)();
    const apiKey = db.prepare('SELECT client_id, api_key FROM client_api_keys WHERE id = ?').get(apiKeyId);
    const success = await (0, db_mgmt_1.deleteApiKey)(apiKeyId);
    if (success && (apiKey === null || apiKey === void 0 ? void 0 : apiKey.api_key)) {
        await (0, license_cache_1.refreshLicenseInCache)(apiKey.client_id, apiKey.api_key);
    }
    res.json({ success });
});
exports.mgmtRouter.post('/clients/:id/api-keys', requireAdminAuth, async (req, res) => {
    const clientId = parseInt(String(req.params.id));
    const provider = String(req.body.provider);
    const { api_key } = req.body;
    if (!provider || !api_key)
        return res.status(400).json({ error: 'Provider and api_key are required' });
    const db = (0, sqlite_1.getDatabase)();
    const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
    const success = await (0, db_mgmt_1.setClientApiKey)(clientId, provider, api_key);
    if (success && (client === null || client === void 0 ? void 0 : client.api_key)) {
        await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
    }
    res.json({ success });
});
exports.mgmtRouter.post('/clients/:id/models', requireAdminAuth, async (req, res) => {
    try {
        const clientIdentifier = String(req.params.id);
        const db = (0, sqlite_1.getDatabase)();
        // Check if it's a UUID or numeric ID
        let clientId;
        let clientUUID;
        const isNumericId = /^\d+$/.test(clientIdentifier) && clientIdentifier.length < 20;
        if (!isNumericId) {
            // It's a UUID
            const clientByUUID = db.prepare('SELECT id, api_key, client_uuid FROM clients WHERE client_uuid = ?').get(clientIdentifier);
            if (!clientByUUID) {
                return res.status(404).json({ error: 'Client not found' });
            }
            clientId = clientByUUID.id;
            clientUUID = clientByUUID.client_uuid;
        }
        else {
            // It's a numeric ID
            clientId = parseInt(clientIdentifier);
            const clientById = db.prepare('SELECT id, api_key, client_uuid FROM clients WHERE id = ?').get(clientId);
            if (!clientById) {
                return res.status(404).json({ error: 'Client not found' });
            }
            clientUUID = clientById.client_uuid;
        }
        const { models } = req.body;
        if (!models || !Array.isArray(models)) {
            return res.status(400).json({ error: 'models array is required' });
        }
        const success = await (0, db_mgmt_1.setClientModelsBulk)(clientId, models);
        if (success) {
            const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
            if (client === null || client === void 0 ? void 0 : client.api_key) {
                await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
            }
        }
        res.json({ success });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// AI Module Settings Management
exports.mgmtRouter.get('/clients/:id/ai-settings', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const settings = await (0, db_mgmt_1.getClientModuleSettings)(clientId);
        res.json({ settings });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/clients/:id/ai-settings', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
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
                    const ok = await (0, db_mgmt_1.saveClientModuleSetting)(clientId, moduleName, key, finalValue);
                    if (!ok)
                        success = false;
                }
            }
        }
        res.json({ success });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * AI LEARNING LOOP: Promote a result to a client example
 */
exports.mgmtRouter.post('/clients/:id/promote-to-example', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const { moduleName, context, output } = req.body;
        if (!moduleName || !output) {
            return res.status(400).json({ error: 'moduleName and output are required' });
        }
        const success = await (0, db_mgmt_1.saveClientAIExample)(clientId, moduleName, context || '', output);
        res.json({ success });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.get('/clients/config', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        console.log(`[MgmtConfig] Request received. API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING'}`);
        if (!apiKey) {
            console.warn('[MgmtConfig] Rejecting request: API key required');
            return res.status(400).json({ error: 'API key required' });
        }
        const cached = (0, license_cache_1.getLicenseFromCache)(apiKey);
        const today = new Date().toISOString().split('T')[0];
        if (cached) {
            console.log(`[MgmtConfig] Serving from cache for client: ${cached.name}. allowRateCardFetch: ${!!cached.allowRateCardFetch}`);
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
                shortCode: cached.shortCode || cached.name.substring(0, 3).toUpperCase(),
                moduleRates: cached.allowRateCardFetch ? cached.moduleRates : null,
                allowRateCardFetch: !!cached.allowRateCardFetch,
                _cached: true
            });
        }
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT * FROM clients WHERE api_key = ?').get(apiKey);
        if (!client) {
            console.warn(`[MgmtConfig] Client not found for key: ${apiKey.substring(0, 10)}...`);
            return res.status(404).json({ valid: false, error: 'Client not found' });
        }
        console.log(`[MgmtConfig] Found in DB: ${client.name}. allow_rate_card_fetch: ${client.allow_rate_card_fetch}`);
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
            timezone: client.timezone || 'UTC',
            moduleRates: client.allow_rate_card_fetch ? (typeof client.module_rates === 'string' ? JSON.parse(client.module_rates) : client.module_rates) : null,
            allowRateCardFetch: !!client.allow_rate_card_fetch
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get client credentials (separate endpoint for fetching sensitive data)
exports.mgmtRouter.get('/clients/credentials', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ error: 'API key required' });
        // Get client from license key - use SQLite
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT * FROM clients WHERE api_key = ?').get(apiKey);
        if (!client)
            return res.status(404).json({ error: 'Client not found' });
        // Get credentials from clients table
        const creds = {
            supabase_url: client.supabase_url || null,
            supabase_anon_key: client.supabase_anon_key || null
        };
        // Get API keys for client
        const keys = await (0, db_mgmt_1.getClientApiKeys)(client.id);
        const modelsRow = db.prepare('SELECT * FROM client_models WHERE client_id = ?').all(client.id);
        const models = modelsRow || [];
        const rawProviderLabels = await (0, db_mgmt_1.getProviderLabels)();
        const genericProviderLabels = {
            'openai': 'ai_service_primary',
            'openrouter': 'ai_service_secondary'
        };
        const sanitizedApiKeys = {};
        keys.forEach((k) => {
            if (k.is_active) {
                const genericProvider = genericProviderLabels[k.provider] || k.provider;
                sanitizedApiKeys[genericProvider] = k.api_key;
            }
        });
        // Sanitize providerLabels keys
        const sanitizedProviderLabels = {};
        Object.entries(rawProviderLabels || {}).forEach(([provider, label]) => {
            const genericProvider = genericProviderLabels[provider] || provider;
            sanitizedProviderLabels[genericProvider] = label;
        });
        // Parse module_rates from client (only if fetching is allowed)
        let moduleRates = {};
        if (client.module_rates && client.allow_rate_card_fetch) {
            try {
                moduleRates = typeof client.module_rates === 'string' ? JSON.parse(client.module_rates) : client.module_rates;
            }
            catch (e) {
                moduleRates = {};
            }
        }
        // Sanitize models array (handle both old array format and new table format)
        const sanitizedModels = [];
        if (Array.isArray(models)) {
            models.forEach((m) => {
                if (m.models && Array.isArray(m.models)) {
                    // Old format with models JSON column
                    m.models.forEach((mm) => {
                        const genericProvider = genericProviderLabels[mm.api_provider] || mm.api_provider;
                        sanitizedModels.push({
                            module_name: mm.module_name,
                            api_provider: genericProvider,
                            api_model: mm.api_model
                        });
                    });
                }
                else {
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
            maskedApiKeys: keys.reduce((acc, k) => {
                if (k.is_active) {
                    const genericProvider = genericProviderLabels[k.provider] || k.provider;
                    acc[genericProvider] = k.api_key_prefix;
                }
                return acc;
            }, {}),
            configuredModels: sanitizedModels,
            providerLabels: sanitizedProviderLabels,
            moduleRates,
            supabaseUrl: (creds === null || creds === void 0 ? void 0 : creds.supabase_url) || null,
            supabaseAnonKey: (creds === null || creds === void 0 ? void 0 : creds.supabase_anon_key) || null
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get module pricing for a client
exports.mgmtRouter.get('/clients/pricing', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ error: 'API key required' });
        let clientId = null;
        const cached = (0, license_cache_1.getLicenseFromCache)(apiKey);
        console.log('[Config] Looking up cache for key:', apiKey);
        console.log('[Config] Cached result:', cached);
        if (cached) {
            clientId = cached.clientId;
        }
        else {
            const db = (0, sqlite_1.getDatabase)();
            const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey);
            if (!client)
                return res.status(404).json({ error: 'Client not found' });
            clientId = client.id;
        }
        if (!clientId)
            return res.status(404).json({ error: 'Client not found' });
        const db = (0, sqlite_1.getDatabase)();
        const pricing = db.prepare(`
            SELECT id, module_name, cost_per_job, effective_from, effective_to 
            FROM module_pricing 
            WHERE client_id = ?
            ORDER BY module_name ASC, effective_from DESC
        `).all(clientId);
        res.json(pricing || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Lightweight license validation - just checks if key is valid/active (no full config)
exports.mgmtRouter.get('/clients/validate', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ valid: false, error: 'API key required' });
        const cached = (0, license_cache_1.getLicenseFromCache)(apiKey);
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
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT status, contract_end FROM clients WHERE api_key = ?').get(apiKey);
        if (!client)
            return res.status(404).json({ valid: false, error: 'Client not found' });
        const today = new Date().toISOString().split('T')[0];
        const isExpired = client.contract_end && client.contract_end < today;
        const isActive = client.status === 'active' && !isExpired;
        return res.json({
            valid: isActive,
            status: isActive ? 'active' : (isExpired ? 'expired' : (client.status || 'inactive')),
            error: isActive ? null : (isExpired ? 'Subscription contract has expired.' : `Subscription is currently ${client.status || 'inactive'}.`)
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== Usage & Logs =====
exports.mgmtRouter.get('/logs', requireAdminAuth, async (req, res) => {
    const { clientId, provider, direction, startDate, endDate, limit, offset, requestId, parentJobId } = req.query;
    const logs = await (0, db_mgmt_1.getApiLogs)({
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
exports.mgmtRouter.get('/logs/stats', requireAdminAuth, async (req, res) => {
    const days = req.query.days ? parseInt(String(req.query.days)) : 30;
    const stats = await (0, db_mgmt_1.getApiStats)(undefined, days);
    res.json(stats);
});
// ===== Available Models =====
exports.mgmtRouter.get('/available-models', async (req, res) => {
    const models = await (0, db_mgmt_1.getAvailableModels)();
    res.json(models);
});
exports.mgmtRouter.post('/available-models', requireAdminAuth, async (req, res) => {
    const { module_id, provider, model_id, display_name } = req.body;
    const success = await (0, db_mgmt_1.addModel)(module_id, provider, model_id, display_name);
    res.json({ success });
});
exports.mgmtRouter.get('/available-models/discover-openrouter', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const apiKeyRow = db.prepare(`
            SELECT ak.api_key FROM client_api_keys ak
            JOIN clients c ON ak.client_id = c.id
            WHERE ak.provider = 'openrouter' AND ak.is_active = 1
            LIMIT 1
        `).get();
        const models = await (0, db_mgmt_1.discoverOpenRouterModels)((apiKeyRow === null || apiKeyRow === void 0 ? void 0 : apiKeyRow.api_key) || '');
        console.log(`[MGMT] Discovered ${models.length} models for OpenRouter discovery request`);
        res.json({ success: true, models });
    }
    catch (error) {
        console.error('[Discovery] Failed to fetch models:', error);
        res.status(500).json({ error: 'Failed to discover models' });
    }
});
/**
 * GET /api/mgmt/provider-billing
 * Fetch billing/credits info from external providers
 */
exports.mgmtRouter.get('/provider-billing', requireAdminAuth, async (req, res) => {
    try {
        const result = await (0, db_mgmt_1.getProviderBilling)();
        res.json(Object.assign({ success: true }, result));
    }
    catch (error) {
        console.error('[Billing] Failed to fetch provider billing:', error);
        res.status(500).json({ error: 'Failed to fetch provider billing' });
    }
});
/**
 * GET /api/mgmt/system-settings
 * Return all system settings (values masked for security)
 */
exports.mgmtRouter.get('/system-settings', requireAdminAuth, (req, res) => {
    const settings = (0, db_mgmt_1.getAllSystemSettings)();
    // Mask sensitive values before sending
    const masked = {};
    for (const [k, v] of Object.entries(settings)) {
        if (k.includes('key') || k.includes('secret') || k.includes('token')) {
            masked[k] = v ? `${v.substring(0, 12)}...${v.slice(-4)}` : '';
        }
        else {
            masked[k] = v;
        }
    }
    res.json({ success: true, settings: masked });
});
/**
 * POST /api/mgmt/system-settings
 * Save a system setting (key/value pair)
 */
exports.mgmtRouter.post('/system-settings', requireAdminAuth, (req, res) => {
    const { key, value } = req.body;
    if (!key || typeof value === 'undefined') {
        return res.status(400).json({ error: 'key and value are required' });
    }
    const ok = (0, db_mgmt_1.setSystemSetting)(key, value);
    if (ok) {
        res.json({ success: true, message: `Setting '${key}' saved` });
    }
    else {
        res.status(500).json({ error: 'Failed to save setting' });
    }
});
exports.mgmtRouter.post('/available-models/sync-openrouter', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        // Get the first available OpenRouter API key
        const apiKeyRow = db.prepare(`
            SELECT ak.api_key FROM client_api_keys ak
            JOIN clients c ON ak.client_id = c.id
            WHERE ak.provider = 'openrouter' AND ak.is_active = 1
            LIMIT 1
        `).get();
        if (!(apiKeyRow === null || apiKeyRow === void 0 ? void 0 : apiKeyRow.api_key)) {
            return res.status(400).json({ error: 'No OpenRouter API key found. Add an API key to any client first.' });
        }
        const count = await (0, db_mgmt_1.syncOpenRouterModelsToDb)(apiKeyRow.api_key);
        res.json({ success: true, added: count, message: `Synced ${count} models from OpenRouter` });
    }
    catch (error) {
        console.error('[Sync] Failed to sync models:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.mgmtRouter.post('/available-models/:id/toggle', requireAdminAuth, async (req, res) => {
    const success = await (0, db_mgmt_1.toggleModel)(parseInt(String(req.params.id)));
    res.json({ success });
});
exports.mgmtRouter.delete('/available-models/:id', requireAdminAuth, async (req, res) => {
    const success = await (0, db_mgmt_1.deleteModel)(parseInt(String(req.params.id)));
    res.json({ success });
});
// ===== Provider Labels =====
exports.mgmtRouter.get('/provider-labels', async (req, res) => {
    const labels = await (0, db_mgmt_1.getProviderLabels)();
    res.json(labels);
});
exports.mgmtRouter.put('/provider-labels/:provider', requireAdminAuth, async (req, res) => {
    const success = await (0, db_mgmt_1.setProviderLabel)(String(req.params.provider), String(req.body.label));
    res.json({ success });
});
// ===== Watcher Heartbeat =====
exports.mgmtRouter.post('/clients/heartbeat', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ error: 'API key required' });
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey);
        if (!client)
            return res.status(404).json({ error: 'Client not found' });
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ error: 'Status is required' });
        const success = await (0, db_mgmt_1.updateWatcherHeartbeat)(client.id, String(status));
        res.json({ success });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== Usage Logging =====
// Get client usage logs
exports.mgmtRouter.get('/client-usage-logs', requireAdminAuth, async (req, res) => {
    try {
        const { clientId, limit } = req.query;
        const db = (0, sqlite_1.getDatabase)();
        let sql = `
            SELECT l.*, c.name as client_name 
            FROM api_request_logs l
            JOIN clients c ON l.client_id = c.id
            WHERE 1=1
        `;
        const params = [];
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/clients/usage', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ error: 'API key required' });
        // Get client from license key - use SQLite
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT id FROM clients WHERE api_key = ?').get(apiKey);
        if (!client)
            return res.status(404).json({ error: 'Client not found' });
        const { jobId, module, provider, model, status, costUsd, tokensUsed, latencyMs, pricingId, errorMessage, userId } = req.body;
        // Insert into Supabase using existing function
        const id = await (0, supabase_1.logClientUsage)({
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== License Cache Management =====
// GET /clients/cache - Get cache stats for all clients
exports.mgmtRouter.get('/clients/cache', requireAdminAuth, async (req, res) => {
    try {
        // Get all clients from database (including UUID)
        const db = (0, sqlite_1.getDatabase)();
        const clients = db.prepare('SELECT id, client_uuid, api_key, name, status, updated_at FROM clients').all();
        // Get cache details
        const cacheDetails = (0, license_cache_1.getLicenseCacheDetails)();
        const cacheMap = new Map(cacheDetails.map((d) => [d.clientId, d]));
        res.json({
            cacheStats: {
                totalClients: (clients === null || clients === void 0 ? void 0 : clients.length) || 0,
                cachedClients: cacheDetails.length,
            },
            clients: (clients === null || clients === void 0 ? void 0 : clients.map((c) => {
                const cached = cacheMap.get(c.id);
                return {
                    id: c.id,
                    uuid: c.client_uuid,
                    name: c.name,
                    apiKeyPrefix: c.api_key.substring(0, 8) + '...',
                    status: c.status,
                    inCache: !!cached,
                    cachedAt: (cached === null || cached === void 0 ? void 0 : cached.cachedAt) || null,
                    isExpired: (cached === null || cached === void 0 ? void 0 : cached.isExpired) || false,
                    dbUpdatedAt: c.updated_at
                };
            })) || []
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST /clients/cache/refresh - Force refresh cache for a client
exports.mgmtRouter.post('/clients/cache/refresh', requireAdminAuth, async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }
        // Get the client's API key and UUID - use SQLite
        const db = (0, sqlite_1.getDatabase)();
        const client = db.prepare('SELECT api_key, client_uuid FROM clients WHERE id = ?').get(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }
        // Invalidate and refresh
        (0, license_cache_1.invalidateLicenseInCache)(client.api_key);
        await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key, client.client_uuid);
        res.json({ success: true, message: 'Cache refreshed for client' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// DELETE /clients/cache - Clear cache for a client
exports.mgmtRouter.delete('/clients/cache', requireAdminAuth, async (req, res) => {
    try {
        const { clientId, apiKey } = req.body;
        if (!clientId && !apiKey) {
            return res.status(400).json({ error: 'clientId or apiKey is required' });
        }
        let keyToInvalidate = apiKey;
        if (clientId && !apiKey) {
            const db = (0, sqlite_1.getDatabase)();
            const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId);
            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }
            keyToInvalidate = client.api_key;
        }
        (0, license_cache_1.invalidateLicenseInCache)(keyToInvalidate);
        res.json({ success: true, message: 'Cache cleared' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== SMTP Settings =====
// Get SMTP settings
exports.mgmtRouter.get('/smtp/settings', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const data = db.prepare('SELECT * FROM smtp_settings LIMIT 1').get();
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Save SMTP settings
exports.mgmtRouter.post('/smtp/settings', requireAdminAuth, async (req, res) => {
    try {
        const { host, port, secure, username, password, auth_type, from_email, from_name, is_active } = req.body;
        if (!host) {
            return res.status(400).json({ error: 'SMTP host is required' });
        }
        // Check if password was provided (we don't store it, just mark it exists)
        const db = (0, sqlite_1.getDatabase)();
        const existing = db.prepare('SELECT password_encrypted FROM smtp_settings LIMIT 1').get();
        const passwordEncrypted = password ? encrypt(password) : ((existing === null || existing === void 0 ? void 0 : existing.password_encrypted) || null);
        // Check if settings exist
        const existingSettings = db.prepare('SELECT id FROM smtp_settings LIMIT 1').get();
        if (existingSettings) {
            // Update
            db.prepare(`
                UPDATE smtp_settings SET 
                    host = ?, port = ?, secure = ?, auth_type = ?, username = ?,
                    password_encrypted = ?, from_email = ?, from_name = ?, is_active = ?,
                    updated_at = datetime('now')
            `).run(host, port || 587, secure ? 1 : 0, auth_type || 'normal', username || null, passwordEncrypted, from_email || null, from_name || 'Cuepoint Support', is_active ? 1 : 0);
            res.json({ success: true, id: existingSettings.id });
        }
        else {
            // Insert
            const result = db.prepare(`
                INSERT INTO smtp_settings (host, port, secure, auth_type, username, password_encrypted, from_email, from_name, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(host, port || 587, secure ? 1 : 0, auth_type || 'normal', username || null, passwordEncrypted, from_email || null, from_name || 'Cuepoint Support', is_active ? 1 : 0);
            res.json({ success: true, id: result.lastInsertRowid });
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Test SMTP connection
exports.mgmtRouter.post('/smtp/test', requireAdminAuth, async (req, res) => {
    try {
        const { host, port, secure, username, password, auth_type, from_email } = req.body;
        if (!host || !from_email) {
            return res.status(400).json({ error: 'Host and from_email are required' });
        }
        // Dynamic import nodemailer for testing
        const nodemailer = await Promise.resolve().then(() => __importStar(require('nodemailer')));
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
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'SMTP test failed' });
    }
});
// Send test email
exports.mgmtRouter.post('/smtp/send-test', requireAdminAuth, async (req, res) => {
    try {
        const { test_email } = req.body;
        if (!test_email) {
            return res.status(400).json({ error: 'test_email is required' });
        }
        const db = (0, sqlite_1.getDatabase)();
        const smtpData = db.prepare('SELECT * FROM smtp_settings LIMIT 1').get();
        if (!smtpData || smtpData.host !== req.body.host) {
            return res.status(400).json({ error: 'Please save SMTP settings first' });
        }
        const nodemailer = await Promise.resolve().then(() => __importStar(require('nodemailer')));
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
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to send test email' });
    }
});
// ===== Email Notification Settings =====
// Get email notification settings
exports.mgmtRouter.get('/notifications/settings', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const data = db.prepare('SELECT * FROM email_notification_settings ORDER BY id').all();
        res.json(data || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Update email notification setting
exports.mgmtRouter.put('/notifications/settings/:eventType', requireAdminAuth, async (req, res) => {
    try {
        const { eventType } = req.params;
        const { is_enabled, recipient_emails, threshold_value, threshold_unit, min_pending_age_hours } = req.body;
        const db = (0, sqlite_1.getDatabase)();
        db.prepare(`
            UPDATE email_notification_settings SET 
                is_enabled = ?, recipient_emails = ?, threshold_value = ?,
                threshold_unit = ?, min_pending_age_hours = ?, updated_at = datetime('now')
            WHERE event_type = ?
        `).run(is_enabled ? 1 : 0, JSON.stringify(recipient_emails || []), threshold_value || null, threshold_unit || null, min_pending_age_hours || null, eventType);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get pending sync queue status (for notifications)
exports.mgmtRouter.get('/notifications/pending-status', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const pending = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'pending'").get();
        const oldestPending = db.prepare("SELECT created_at FROM pending_sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1").get();
        const failed = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'failed'").get();
        res.json({
            pendingCount: (pending === null || pending === void 0 ? void 0 : pending.count) || 0,
            oldestPendingAt: (oldestPending === null || oldestPending === void 0 ? void 0 : oldestPending.created_at) || null,
            failedCount: (failed === null || failed === void 0 ? void 0 : failed.count) || 0
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== AI Audit Logs (Diagnostic View) =====
// Get all AI audit logs
exports.mgmtRouter.get('/api-logs', requireAdminAuth, async (req, res) => {
    try {
        const { limit = 100, clientId, moduleId } = req.query;
        const db = (0, sqlite_1.getDatabase)();
        let sql = 'SELECT * FROM api_request_logs';
        const params = [];
        const conditions = [];
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
        const items = db.prepare(sql).all(...params);
        // Pulse the JSON payloads (use actual DB column names: request_body, response_body)
        const parsedItems = (items || []).map(item => (Object.assign(Object.assign({}, item), { request_body: typeof item.request_body === 'string' ? JSON.parse(item.request_body) : item.request_body, response_body: typeof item.response_body === 'string' ? JSON.parse(item.response_body) : item.response_body })));
        res.json(parsedItems);
    }
    catch (err) {
        console.error('[MGMT] Error fetching AI logs:', err);
        res.status(500).json({ error: err.message });
    }
});
// ===== Pending Sync Queue (Admin View) =====
// Get pending sync queue
exports.mgmtRouter.get('/sync-queue', requireAdminAuth, async (req, res) => {
    try {
        const { status, limit } = req.query;
        const db = (0, sqlite_1.getDatabase)();
        let sql = 'SELECT * FROM pending_sync_queue';
        const params = [];
        if (status) {
            sql += ' WHERE status = ?';
            params.push(status);
        }
        sql += ' ORDER BY created_at ASC';
        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(String(limit)));
        }
        const items = db.prepare(sql).all(...params);
        // Parse payload JSON
        const parsedItems = (items || []).map(item => (Object.assign(Object.assign({}, item), { payload: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload })));
        res.json(parsedItems);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Retry a specific sync item
exports.mgmtRouter.post('/sync-queue/:id/retry', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const db = (0, sqlite_1.getDatabase)();
        db.prepare(`
            UPDATE pending_sync_queue SET 
                status = 'pending', retry_count = 0, error_message = NULL
            WHERE id = ?
        `).run(id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete a sync item
exports.mgmtRouter.delete('/sync-queue/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM pending_sync_queue WHERE id = ?').run(id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get sync queue stats
exports.mgmtRouter.get('/sync-queue/stats', requireAdminAuth, async (req, res) => {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const pending = db.prepare("SELECT status, created_at FROM pending_sync_queue WHERE status = 'pending'").all();
        const synced = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'synced'").get();
        const failed = db.prepare("SELECT COUNT(*) as count FROM pending_sync_queue WHERE status = 'failed'").get();
        const pendingAges = (pending || []).map(p => {
            const created = new Date(p.created_at);
            return (Date.now() - created.getTime()) / (1000 * 60 * 60); // hours
        });
        const oldestPendingHours = pendingAges.length > 0 ? Math.max(...pendingAges) : 0;
        res.json({
            pendingCount: (pending || []).length,
            syncedCount: (synced === null || synced === void 0 ? void 0 : synced.count) || 0,
            failedCount: (failed === null || failed === void 0 ? void 0 : failed.count) || 0,
            oldestPendingHours: Math.round(oldestPendingHours * 10) / 10
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== Global System Settings =====
// GET Global settings
exports.mgmtRouter.get('/settings/system', requireAdminAuth, async (req, res) => {
    try {
        const settings = await (0, db_mgmt_1.getAllSystemSettings)();
        res.json(settings);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST Global settings
exports.mgmtRouter.post('/settings/system', requireAdminAuth, async (req, res) => {
    try {
        const { system_timezone, system_name } = req.body;
        if (system_timezone) {
            await (0, db_mgmt_1.setSystemTimezone)(system_timezone);
        }
        if (system_name) {
            (0, sqlite_1.getDatabase)().prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('system_name', ?, datetime('now'))").run(system_name);
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== AI Job Queue Management =====
exports.mgmtRouter.get('/ai-queue/stats', requireAdminAuth, async (req, res) => {
    try {
        const { clientId } = req.query;
        const db = (0, sqlite_1.getDatabase)();
        let filter = "";
        const params = [];
        if (clientId) {
            filter = " AND client_id = ?";
            params.push(clientId);
        }
        const processing = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE status = 'processing'${filter}`).get(...params);
        const completed = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE status = 'completed' AND DATE(created_at) = DATE('now')${filter}`).get(...params);
        const failed = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE status IN ('error', 'partial')${filter}`).get(...params);
        const total = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE 1=1${filter}`).get(...params);
        res.json({
            pendingCount: 0,
            processingCount: (processing === null || processing === void 0 ? void 0 : processing.count) || 0,
            completedToday: (completed === null || completed === void 0 ? void 0 : completed.count) || 0,
            failedCount: (failed === null || failed === void 0 ? void 0 : failed.count) || 0,
            totalCount: (total === null || total === void 0 ? void 0 : total.count) || 0
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.get('/ai-queue', requireAdminAuth, async (req, res) => {
    try {
        const { status, clientId, limit } = req.query;
        const db = (0, sqlite_1.getDatabase)();
        let sql = `SELECT 
            j.id, j.client_id, j.status, j.queue_status, j.priority, j.sub_status, j.modules_requested, j.total_cost_usd, j.provider_cost_usd,
            j.error_message, j.local_job_id, j.user_id, j.audio_path, j.result_data,
            j.created_at, j.updated_at,
            c.name as client_name
        FROM ai_jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        WHERE 1=1`;
        const params = [];
        if (status && status !== 'all') {
            sql += ' AND j.status = ?';
            params.push(status);
        }
        if (clientId) {
            sql += ' AND j.client_id = ?';
            params.push(clientId);
        }
        if (status === 'pending') {
            sql += ' ORDER BY j.priority DESC, j.created_at ASC';
        }
        else {
            sql += ' ORDER BY j.created_at DESC';
        }
        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(String(limit)));
        }
        else {
            sql += ' LIMIT 200';
        }
        const items = db.prepare(sql).all(...params);
        res.json(items);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.delete('/ai-queue/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM ai_jobs WHERE id = ?').run(id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Change Priority
exports.mgmtRouter.post('/ai-queue/:id/priority', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { priority } = req.body;
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('UPDATE ai_jobs SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(priority || 0, id);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Free Resource (Abort Processing)
exports.mgmtRouter.post('/ai-queue/:id/free', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { abortJob } = await Promise.resolve().then(() => __importStar(require('../ai-queue')));
        const db = (0, sqlite_1.getDatabase)();
        // Mark as failed in DB
        db.prepare(`UPDATE ai_jobs SET queue_status = 'failed', status = 'error', error_message = 'Job manually aborted to free resources', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
        // Attempt to kill running process
        abortJob(id);
        logger_1.logger.warn('AI', 'JOB_RESOURCE_FREED', `Job ${id} forcefully aborted by support staff`);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Retry a failed or partial ai_job (Enhanced for surgical retries)
exports.mgmtRouter.post('/ai-queue/:id/retry', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { targetModules, targetLanguages } = req.body;
        const db = (0, sqlite_1.getDatabase)();
        // NEW: Enforce Admin-only rerun control as requested (Optimized: Check server session directly)
        const adminUser = req.adminUser;
        if ((adminUser === null || adminUser === void 0 ? void 0 : adminUser.role) !== 'ADMIN') {
            return res.status(403).json({ error: "Manual recovery requires administrator approval. Please contact support." });
        }
        // 1. Get job info
        const job = db.prepare(`
            SELECT j.*, c.name as client_name 
            FROM ai_jobs j 
            JOIN clients c ON j.client_id = c.id
            WHERE j.id = ?
        `).get(id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
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
        logger_1.logger.info('AI', 'JOB_RETRY_TRIGGERED', `Retry initiated for Job ${id}`, {
            targetModules: modulesToRun,
            targetLanguages: languagesToRun
        });
        // Use a background call so the UI doesn't time out
        (0, job_processor_1.processAiJob)(job.id, job.audio_path, modulesToRun, job.client_id, job.client_name, null, languagesToRun)
            .catch(err => logger_1.logger.error('AI', 'JOB_RETRY_FAILED', `Background retry failed for job ${id}: ${err.message}`));
        res.json({ success: true, message: 'Processing restarted surgically' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * Universal Export Result Endpoint
 * Handles subtitles, ad_breaks, promo_breaks, metadata
 */
exports.mgmtRouter.post('/jobs/:id/export-result', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { moduleName, data } = req.body;
        const db = (0, sqlite_1.getDatabase)();
        const job = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        const outputDir = (0, db_mgmt_1.getUserSetting)(job.user_id, 'output_directory');
        if (!outputDir || !fs_1.default.existsSync(outputDir)) {
            return res.status(400).json({ error: 'Output directory not configured' });
        }
        const { renderTemplate } = await Promise.resolve().then(() => __importStar(require('../utils/template-engine')));
        const { content, extension } = await renderTemplate(moduleName, data, job.client_id);
        let suffix = `_${moduleName}`;
        if (moduleName === 'ad_breaks')
            suffix = '_adbreak';
        if (moduleName === 'promo_breaks')
            suffix = '_promo';
        if (moduleName === 'metadata')
            suffix = '_metadata';
        const baseName = job.filename.includes('.') ? job.filename.substring(0, job.filename.lastIndexOf('.')) : job.filename;
        const fullPath = path_1.default.join(outputDir, `${baseName}${suffix}.${extension}`);
        fs_1.default.writeFileSync(fullPath, content);
        res.json({ success: true, path: fullPath });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/**
 * Universal Download Result Endpoint
 * returns raw content for browser download
 */
exports.mgmtRouter.post('/jobs/:id/download-result', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { moduleName, data } = req.body;
        const db = (0, sqlite_1.getDatabase)();
        const job = db.prepare('SELECT client_id FROM ai_jobs WHERE id = ?').get(id);
        const { renderTemplate } = await Promise.resolve().then(() => __importStar(require('../utils/template-engine')));
        const { content, extension } = await renderTemplate(moduleName, data, (job === null || job === void 0 ? void 0 : job.client_id) || 1);
        let contentType = 'application/json';
        if (extension === 'xml')
            contentType = 'application/xml';
        if (extension === 'srt' || extension === 'txt')
            contentType = 'text/plain';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="result.${extension}"`);
        res.send(content);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== Global AI Fallback Settings =====
exports.mgmtRouter.get('/settings/global-fallback', requireAdminAuth, async (req, res) => {
    try {
        const { getGlobalDefaultModel } = await Promise.resolve().then(() => __importStar(require('../db-mgmt')));
        const model = await getGlobalDefaultModel();
        res.json({ model });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/settings/global-fallback', requireAdminAuth, async (req, res) => {
    try {
        const { model } = req.body;
        const { setGlobalDefaultModel } = await Promise.resolve().then(() => __importStar(require('../db-mgmt')));
        await setGlobalDefaultModel(model);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
