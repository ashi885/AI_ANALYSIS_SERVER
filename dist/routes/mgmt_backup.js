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
exports.mgmtRouter = exports.getClientApiKey = exports.logApiRequest = void 0;
const express_1 = require("express");
const supabase_1 = require("../supabase");
const crypto_1 = __importDefault(require("crypto"));
const db_mgmt_1 = require("../db-mgmt");
const license_cache_1 = require("../license-cache");
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
// Auth middleware for mgmt routes
const requireAdminAuth = async (req, res, next) => {
    var _a;
    // Check for session cookie first
    const sessionCookie = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.cuepoint_session;
    if (sessionCookie) {
        try {
            const session = typeof sessionCookie === 'string' ? JSON.parse(sessionCookie) : sessionCookie;
            if (session.email && session.role) {
                console.log('[Mgmt Auth] Cookie session found for:', session.email);
                req.adminUser = session;
                return next();
            }
        }
        catch (e) {
            console.log('[Mgmt Auth] Failed to parse session cookie:', e);
        }
    }
    // Fall back to Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.log('[Mgmt Auth] No auth header or cookie present');
        return res.status(401).json({ error: 'Authorization required' });
    }
    try {
        const auth = authHeader.split(' ')[1];
        if (!auth) {
            console.log('[Mgmt Auth] Auth found but malformed:', authHeader);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const decoded = Buffer.from(auth, 'base64').toString();
        const [email, password] = decoded.split(':');
        console.log(`[Mgmt Auth] Attempting auth for user: "${email}" with password length: ${(password === null || password === void 0 ? void 0 : password.length) || 0}`);
        const { data: user, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();
        if (error) {
            console.log(`[Mgmt Auth] DB Error for "${email}":`, error.message);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (!user) {
            console.log(`[Mgmt Auth] No user found matching "${email}" and provided password`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        console.log('[Mgmt Auth] Auth successful for:', email);
        req.adminUser = user;
        next();
    }
    catch (err) {
        console.error('[Mgmt Auth] Exception in middleware:', err.message);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
};
// Login endpoint
exports.mgmtRouter.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[Login] Attempt: email="${email}"`);
        const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('email', email)
            .eq('password', password);
        if (error) {
            console.error(`[Login] Supabase Error:`, error.message);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = data && data.length > 0 ? data[0] : null;
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
    console.log('[Mgmt] GET /clients');
    try {
        const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('[Mgmt] Error fetching clients:', error.message);
            return res.status(500).json({ error: error.message });
        }
        console.log('[Mgmt] Returned clients count:', (data || []).length);
        res.json(data || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/clients', requireAdminAuth, async (req, res) => {
    try {
        const { name, billing_margin_flat, billing_margin_percent, contract_start, contract_end, setup_fee, plan, module_rates } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Client name is required' });
        const apiKey = `CUE-${crypto_1.default.randomBytes(12).toString('hex').toUpperCase()}`;
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('clients')
            .insert({
            name,
            api_key: apiKey,
            billing_margin_flat: billing_margin_flat || 0.50,
            billing_margin_percent: billing_margin_percent || 20.0,
            contract_start: contract_start || today,
            contract_end: contract_end || null,
            setup_fee: setup_fee || 0,
            plan: plan || 'Professional',
            status: 'active',
            module_rates: module_rates || null
        })
            .select()
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.put('/clients/:id', requireAdminAuth, async (req, res) => {
    try {
        const { name, billing_margin_flat, billing_margin_percent, contract_start, contract_end, setup_fee, plan, status, module_rates } = req.body;
        const { error } = await supabase
            .from('clients')
            .update({
            name,
            billing_margin_flat,
            billing_margin_percent,
            contract_start,
            contract_end: contract_end || null,
            setup_fee,
            plan,
            status,
            module_rates: module_rates || null,
            updated_at: new Date().toISOString()
        })
            .eq('id', req.params.id);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.delete('/clients/:id', requireAdminAuth, async (req, res) => {
    const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ success: true });
});
exports.mgmtRouter.post('/clients/:id/regenerate-key', requireAdminAuth, async (req, res) => {
    const newApiKey = `CUE-${crypto_1.default.randomBytes(12).toString('hex').toUpperCase()}`;
    const { error } = await supabase
        .from('clients')
        .update({ api_key: newApiKey, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ apiKey: newApiKey });
});
exports.mgmtRouter.post('/clients/:id/toggle-status', requireAdminAuth, async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.id));
        const { data: client, error: fetchError } = await supabase.from('clients').select('api_key, status').eq('id', clientId).single();
        if (fetchError || !client)
            throw fetchError || new Error('Client not found');
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        const { error: updateError } = await supabase.from('clients').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', clientId);
        if (updateError)
            throw updateError;
        await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
        res.json({ status: newStatus });
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
        const { data, error } = await supabase
            .from('client_credentials')
            .select('*')
            .eq('client_id', clientId)
            .single();
        console.log('[Credentials] GET result:', { data, error });
        if (error && error.code !== 'PGRST116') {
            return res.status(500).json({ error: error.message });
        }
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
        const { error } = await supabase
            .from('client_credentials')
            .upsert({
            client_id: clientId,
            supabase_url: supabaseUrl,
            supabase_anon_key: supabaseAnonKey
        }, { onConflict: 'client_id' });
        console.log('[Credentials] PUT upsert result:', { error });
        if (error)
            return res.status(500).json({ error: error.message });
        // Refresh cache for this client
        const { data: client } = await supabase.from('clients').select('api_key').eq('id', clientId).single();
        if (client) {
            await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('[Credentials] PUT error:', err);
        res.status(500).json({ error: err.message });
    }
});
// ===== Management Summary =====
exports.mgmtRouter.get('/summary', requireAdminAuth, async (req, res) => {
    console.log('[Mgmt] GET /summary');
    try {
        const today = new Date().toISOString().split('T')[0];
        const { count: totalClients, error: err1 } = await supabase.from('clients').select('*', { count: 'exact', head: true });
        if (err1)
            console.error('[Mgmt] Summary error 1:', err1);
        const { count: activeClients, error: err2 } = await supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .or(`status.eq.active,status.is.null`)
            .or(`contract_end.is.null,contract_end.gte.${today}`);
        if (err2)
            console.error('[Mgmt] Summary error 2:', err2);
        const { count: configuredEndpoints, error: err3 } = await supabase.from('clients').select('*', { count: 'exact', head: true }).not('api_endpoint', 'is', null).neq('api_endpoint', '');
        if (err3)
            console.error('[Mgmt] Summary error 3:', err3);
        const { count: modulesConfigured, error: err4 } = await supabase.from('client_models').select('*', { count: 'exact', head: true });
        if (err4)
            console.error('[Mgmt] Summary error 4:', err4);
        const { data: moduleBreakdownData, error: err5 } = await supabase.from('client_models').select('models');
        if (err5)
            console.error('[Mgmt] Summary error 5:', err5);
        const breakdown = (moduleBreakdownData || []).reduce((acc, curr) => {
            const models = curr.models || [];
            models.forEach((m) => {
                const existing = acc.find(a => a.module_name === m.module_name);
                if (existing)
                    existing.clients++;
                else
                    acc.push({ module_name: m.module_name, clients: 1 });
            });
            return acc;
        }, []);
        const result = {
            totalClients: totalClients || 0,
            activeClients: activeClients || 0,
            configuredEndpoints: configuredEndpoints || 0,
            modulesConfigured: modulesConfigured || 0,
            moduleBreakdown: breakdown
        };
        console.log('[Mgmt] Summary result:', result);
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
        const clientId = parseInt(String(req.params.id));
        const { data, error } = await supabase
            .from('client_models')
            .select('models')
            .eq('client_id', clientId)
            .single();
        if (error && error.code !== 'PGRST116')
            throw error;
        res.json((data === null || data === void 0 ? void 0 : data.models) || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.mgmtRouter.post('/api-keys/:id/toggle', requireAdminAuth, async (req, res) => {
    const apiKeyId = parseInt(String(req.params.id));
    const { data: apiKey } = await supabase.from('client_api_keys').select('client_id, api_key').eq('id', apiKeyId).single();
    const success = await (0, db_mgmt_1.toggleApiKey)(apiKeyId);
    if (success && (apiKey === null || apiKey === void 0 ? void 0 : apiKey.api_key)) {
        await (0, license_cache_1.refreshLicenseInCache)(apiKey.client_id, apiKey.api_key);
    }
    res.json({ success });
});
exports.mgmtRouter.delete('/api-keys/:id', requireAdminAuth, async (req, res) => {
    const apiKeyId = parseInt(String(req.params.id));
    const { data: apiKey } = await supabase.from('client_api_keys').select('client_id, api_key').eq('id', apiKeyId).single();
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
    const { data: client } = await supabase.from('clients').select('api_key').eq('id', clientId).single();
    const success = await (0, db_mgmt_1.setClientApiKey)(clientId, provider, api_key);
    if (success && (client === null || client === void 0 ? void 0 : client.api_key)) {
        await (0, license_cache_1.refreshLicenseInCache)(clientId, client.api_key);
    }
    res.json({ success });
});
exports.mgmtRouter.post('/clients/:id/models', requireAdminAuth, async (req, res) => {
    try {
        const clientIdentifier = String(req.params.id);
        // Check if it's a UUID or numeric ID
        let clientId;
        let clientUUID;
        if (clientIdentifier.includes('-') && clientIdentifier.length > 10) {
            // It's a UUID
            const { data: clientByUUID } = await supabase
                .from('clients')
                .select('id, api_key, client_uuid')
                .eq('client_uuid', clientIdentifier)
                .single();
            if (!clientByUUID) {
                return res.status(404).json({ error: 'Client not found' });
            }
            clientId = clientByUUID.id;
            clientUUID = clientByUUID.client_uuid;
        }
        else {
            // It's a numeric ID
            clientId = parseInt(clientIdentifier);
            const { data: clientById } = await supabase
                .from('clients')
                .select('id, api_key, client_uuid')
                .eq('id', clientId)
                .single();
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
            const { data: client } = await supabase.from('clients').select('api_key').eq('id', clientId).single();
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
exports.mgmtRouter.get('/clients/config', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ error: 'API key required' });
        const cached = (0, license_cache_1.getLicenseFromCache)(apiKey);
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
            const rawProviderLabels = await (0, db_mgmt_1.getProviderLabels)();
            // Map provider names to generic labels
            const genericProviderLabels = {
                'openai': 'ai_service_primary',
                'openrouter': 'ai_service_secondary'
            };
            // Sanitize providerLabels keys (hide raw provider names)
            const sanitizedProviderLabels = {};
            Object.entries(rawProviderLabels || {}).forEach(([provider, label]) => {
                const genericProvider = genericProviderLabels[provider] || provider;
                sanitizedProviderLabels[genericProvider] = label;
            });
            // Sanitize apiKeys with generic provider names
            const sanitizedApiKeys = {};
            cached.apiKeys.forEach((k) => {
                if (k.is_active) {
                    const genericProvider = genericProviderLabels[k.provider] || k.provider;
                    sanitizedApiKeys[genericProvider] = k.api_key;
                }
            });
            // Sanitize maskedApiKeys
            const sanitizedMaskedApiKeys = {};
            cached.apiKeys.forEach((k) => {
                if (k.is_active) {
                    const genericProvider = genericProviderLabels[k.provider] || k.provider;
                    sanitizedMaskedApiKeys[genericProvider] = k.api_key_prefix;
                }
            });
            // Fetch fresh configuredModels from database
            const { data: freshModelsRow } = await supabase
                .from('client_models')
                .select('models')
                .eq('client_id', cached.clientId)
                .single();
            const rawModels = (freshModelsRow === null || freshModelsRow === void 0 ? void 0 : freshModelsRow.models) || [];
            // Sanitize configuredModels
            const sanitizedConfiguredModels = rawModels.map((m) => ({
                module_name: m.module_name,
                api_provider: genericProviderLabels[m.api_provider] || m.api_provider,
                api_model: m.api_model
            }));
            return res.json({
                valid: true,
                status: 'active',
                clientId: cached.clientUuid,
                clientName: cached.name,
                _cached: true
            });
        }
        const { data: client, error } = await supabase.from('clients').select('*').eq('api_key', apiKey).single();
        if (error || !client)
            return res.status(404).json({ valid: false, error: 'Client not found' });
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
            clientName: client.name
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
        // Get client from license key
        const { data: client } = await supabase.from('clients').select('*').eq('api_key', apiKey).single();
        if (!client)
            return res.status(404).json({ error: 'Client not found' });
        // Get Supabase credentials for client
        const { data: creds } = await supabase
            .from('client_credentials')
            .select('supabase_url, supabase_anon_key')
            .eq('client_id', client.id)
            .single();
        // Get API keys for client
        const keys = await (0, db_mgmt_1.getClientApiKeys)(client.id);
        const { data: modelsRow } = await supabase.from('client_models').select('models').eq('client_id', client.id).single();
        const models = (modelsRow === null || modelsRow === void 0 ? void 0 : modelsRow.models) || [];
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
        // Parse module_rates from client
        let moduleRates = {};
        if (client.module_rates) {
            try {
                moduleRates = typeof client.module_rates === 'string' ? JSON.parse(client.module_rates) : client.module_rates;
            }
            catch (e) {
                moduleRates = {};
            }
        }
        // Sanitize models array
        const sanitizedModels = [];
        if (models) {
            models.forEach((m) => {
                const genericProvider = genericProviderLabels[m.api_provider] || m.api_provider;
                sanitizedModels.push({
                    module_name: m.module_name,
                    api_provider: genericProvider,
                    api_model: m.api_model
                });
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
            const { data: client } = await supabase.from('clients').select('id').eq('api_key', apiKey).single();
            if (!client)
                return res.status(404).json({ error: 'Client not found' });
            clientId = client.id;
        }
        if (!clientId)
            return res.status(404).json({ error: 'Client not found' });
        const { data: pricing } = await supabase
            .from('module_pricing')
            .select('id, module_name, cost_per_job, effective_from, effective_to')
            .eq('client_id', clientId)
            .order('module_name', { ascending: true })
            .order('effective_from', { ascending: false });
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
        const { data: client, error } = await supabase.from('clients').select('status, contract_end').eq('api_key', apiKey).single();
        if (error || !client)
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
    const { clientId, provider, direction, startDate, endDate, limit, offset } = req.query;
    const logs = await (0, db_mgmt_1.getApiLogs)({
        clientId: clientId ? parseInt(String(clientId)) : undefined,
        provider: provider ? String(provider) : undefined,
        direction: direction ? String(direction) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined
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
        const { data: client } = await supabase.from('clients').select('id').eq('api_key', apiKey).single();
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
exports.mgmtRouter.post('/clients/usage', async (req, res) => {
    try {
        const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
        if (!apiKey)
            return res.status(400).json({ error: 'API key required' });
        // Get client from license key
        const { data: client } = await supabase.from('clients').select('id').eq('api_key', apiKey).single();
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
        const { data: clients } = await supabase
            .from('clients')
            .select('id, client_uuid, api_key, name, status, updated_at');
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
        // Get the client's API key and UUID
        const { data: client } = await supabase
            .from('clients')
            .select('api_key, client_uuid')
            .eq('id', clientId)
            .single();
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
            const { data: client } = await supabase
                .from('clients')
                .select('api_key')
                .eq('id', clientId)
                .single();
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
        const { data, error } = await supabase
            .from('smtp_settings')
            .select('*')
            .limit(1)
            .single();
        if (error && error.code !== 'PGRST116') {
            return res.status(500).json({ error: error.message });
        }
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
    var _a;
    try {
        const { host, port, secure, username, password, auth_type, from_email, from_name, is_active } = req.body;
        if (!host) {
            return res.status(400).json({ error: 'SMTP host is required' });
        }
        // Check if password was provided (we don't store it, just mark it exists)
        const existing = await supabase.from('smtp_settings').select('password_encrypted').limit(1).single();
        const passwordEncrypted = password ? encrypt(password) : (((_a = existing === null || existing === void 0 ? void 0 : existing.data) === null || _a === void 0 ? void 0 : _a.password_encrypted) || null);
        const { data, error } = await supabase
            .from('smtp_settings')
            .upsert({
            host,
            port: port || 587,
            secure: secure ? 1 : 0,
            auth_type: auth_type || 'normal',
            username: username || null,
            password_encrypted: passwordEncrypted,
            from_email: from_email || null,
            from_name: from_name || 'Cuepoint Support',
            is_active: is_active ? 1 : 0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
            .select()
            .single();
        if (error)
            throw error;
        res.json({ success: true, id: data === null || data === void 0 ? void 0 : data.id });
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
        const { data: smtpData } = await supabase
            .from('smtp_settings')
            .select('*')
            .limit(1)
            .single();
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
        const { data, error } = await supabase
            .from('email_notification_settings')
            .select('*')
            .order('id');
        if (error)
            throw error;
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
        const { error } = await supabase
            .from('email_notification_settings')
            .update({
            is_enabled: is_enabled ? 1 : 0,
            recipient_emails: JSON.stringify(recipient_emails || []),
            threshold_value: threshold_value || null,
            threshold_unit: threshold_unit || null,
            min_pending_age_hours: min_pending_age_hours || null,
            updated_at: new Date().toISOString()
        })
            .eq('event_type', eventType);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get pending sync queue status (for notifications)
exports.mgmtRouter.get('/notifications/pending-status', requireAdminAuth, async (req, res) => {
    try {
        const { data: pendingCount } = await supabase
            .from('pending_sync_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        const { data: oldestPending } = await supabase
            .from('pending_sync_queue')
            .select('created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
        const { data: failedCount } = await supabase
            .from('pending_sync_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'failed');
        res.json({
            pendingCount: pendingCount || 0,
            oldestPendingAt: (oldestPending === null || oldestPending === void 0 ? void 0 : oldestPending.created_at) || null,
            failedCount: failedCount || 0
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ===== Pending Sync Queue (Admin View) =====
// Get pending sync queue
exports.mgmtRouter.get('/sync-queue', requireAdminAuth, async (req, res) => {
    try {
        const { status, limit } = req.query;
        let query = supabase
            .from('pending_sync_queue')
            .select('*')
            .order('created_at', { ascending: true });
        if (status) {
            query = query.eq('status', String(status));
        }
        if (limit) {
            query = query.limit(parseInt(String(limit)));
        }
        const { data, error } = await query;
        if (error)
            throw error;
        // Parse payload JSON
        const items = (data || []).map(item => (Object.assign(Object.assign({}, item), { payload: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload })));
        res.json(items);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Retry a specific sync item
exports.mgmtRouter.post('/sync-queue/:id/retry', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('pending_sync_queue')
            .update({
            status: 'pending',
            retry_count: 0,
            error_message: null
        })
            .eq('id', id);
        if (error)
            throw error;
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
        const { error } = await supabase.from('pending_sync_queue').delete().eq('id', id);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get sync queue stats
exports.mgmtRouter.get('/sync-queue/stats', requireAdminAuth, async (req, res) => {
    try {
        const { data: pending } = await supabase
            .from('pending_sync_queue')
            .select('status, created_at')
            .eq('status', 'pending');
        const { data: synced } = await supabase
            .from('pending_sync_queue')
            .select('status', { count: 'exact', head: true })
            .eq('status', 'synced');
        const { data: failed } = await supabase
            .from('pending_sync_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'failed');
        const pendingAges = (pending || []).map(p => {
            const created = new Date(p.created_at);
            return (Date.now() - created.getTime()) / (1000 * 60 * 60); // hours
        });
        const oldestPendingHours = pendingAges.length > 0 ? Math.max(...pendingAges) : 0;
        res.json({
            pendingCount: (pending || []).length,
            syncedCount: (synced === null || synced === void 0 ? void 0 : synced.length) || 0,
            failedCount: failed || 0,
            oldestPendingHours: Math.round(oldestPendingHours * 10) / 10
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
