"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkConnections = checkConnections;
exports.getConnectionStatus = getConnectionStatus;
exports.getClientApiKey = getClientApiKey;
exports.setClientApiKey = setClientApiKey;
exports.getClientApiKeys = getClientApiKeys;
exports.deactivateApiKey = deactivateApiKey;
exports.logApiRequest = logApiRequest;
exports.getApiLogs = getApiLogs;
exports.getApiStats = getApiStats;
exports.getAvailableModels = getAvailableModels;
exports.getProviderLabels = getProviderLabels;
exports.setProviderLabel = setProviderLabel;
exports.getModelsByModule = getModelsByModule;
exports.addModel = addModel;
exports.toggleModel = toggleModel;
exports.deleteModel = deleteModel;
exports.getModulePricing = getModulePricing;
exports.getModulePricingHistory = getModulePricingHistory;
exports.setModulePricing = setModulePricing;
exports.logClientUsage = logClientUsage;
exports.getClientUsage = getClientUsage;
exports.getUsageSummary = getUsageSummary;
const sqlite_1 = require("./sqlite");
const crypto_1 = __importDefault(require("crypto"));
console.log('[SQLite] Using local SQLite database');
let serverConnection = { status: 'checking', error: null };
async function checkConnections() {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('SELECT id FROM clients LIMIT 1').get();
        serverConnection = { status: 'connected', error: null };
    }
    catch (e) {
        serverConnection = { status: 'disconnected', error: e.message };
    }
    return { server: serverConnection.status === 'connected', client: serverConnection.status === 'connected' };
}
function getConnectionStatus() {
    return {
        server: serverConnection,
        client: serverConnection
    };
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto_1.default.randomBytes(32).toString('hex');
const IV_LENGTH = 16;
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(text) {
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (_a) {
        return text;
    }
}
async function getClientApiKey(clientId, provider) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const row = db.prepare('SELECT api_key, is_active FROM client_api_keys WHERE client_id = ? AND provider = ? AND is_active = 1').get(clientId, provider);
        if (!row) {
            const envKey = provider === 'openai' ? process.env.OPENAI_API_KEY :
                provider === 'openrouter' ? process.env.OPENROUTER_API_KEY :
                    provider === 'ai_service_primary' ? process.env.AI_SERVICE_PRIMARY_KEY :
                        process.env.AI_SERVICE_SECONDARY_KEY;
            if (envKey && envKey.length > 10 && envKey !== 'ollama') {
                return envKey;
            }
            return null;
        }
        return decrypt(row.api_key);
    }
    catch (e) {
        console.error('[DB] Error getting API key:', e);
        return null;
    }
}
async function setClientApiKey(clientId, provider, apiKey) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const prefix = apiKey.substring(0, Math.min(10, apiKey.length)) + '...';
        const encryptedKey = encrypt(apiKey);
        db.prepare(`
            INSERT INTO client_api_keys (client_id, provider, api_key, api_key_prefix, is_active, updated_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'))
            ON CONFLICT(client_id, provider) DO UPDATE SET
                api_key = excluded.api_key,
                api_key_prefix = excluded.api_key_prefix,
                is_active = 1,
                updated_at = datetime('now')
        `).run(clientId, provider, encryptedKey, prefix);
        return true;
    }
    catch (e) {
        console.error('[DB] Error setting API key:', e.message);
        return false;
    }
}
async function getClientApiKeys(clientId) {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT id, provider, api_key_prefix, is_active, created_at, updated_at FROM client_api_keys WHERE client_id = ?').all(clientId);
    return rows || [];
}
async function deactivateApiKey(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('UPDATE client_api_keys SET is_active = 0 WHERE id = ?').run(id);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function logApiRequest(params) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare(`
            INSERT INTO api_request_logs (
                client_id, provider, endpoint, model, direction,
                request_method, request_headers, request_body,
                response_status, response_body, error_message,
                tokens_used, cost_usd, latency_ms, ip_address, user_agent, request_id, parent_job_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(params.clientId, params.provider, params.endpoint, params.model || null, params.direction, params.requestMethod || null, params.requestHeaders ? JSON.stringify(params.requestHeaders).substring(0, 1000) : null, params.requestBody ? JSON.stringify(params.requestBody).substring(0, 5000) : null, params.responseStatus || null, params.responseBody ? JSON.stringify(params.responseBody).substring(0, 10000) : null, params.errorMessage || null, params.tokensUsed || null, params.costUsd || null, params.latencyMs || null, params.ipAddress || null, params.userAgent || null, params.requestId || null, params.parentJobId || null);
    }
    catch (e) {
        console.error('[DB] Error logging API request:', e);
    }
}
async function getApiLogs(options) {
    const db = (0, sqlite_1.getDatabase)();
    let sql = 'SELECT * FROM api_request_logs WHERE 1=1';
    const params = [];
    if (options.clientId) {
        sql += ' AND client_id = ?';
        params.push(options.clientId);
    }
    if (options.provider) {
        sql += ' AND provider = ?';
        params.push(options.provider);
    }
    if (options.direction) {
        sql += ' AND direction = ?';
        params.push(options.direction);
    }
    if (options.startDate) {
        sql += ' AND created_at >= ?';
        params.push(options.startDate);
    }
    if (options.endDate) {
        sql += ' AND created_at <= ?';
        params.push(options.endDate);
    }
    if (options.requestId) {
        sql += ' AND request_id = ?';
        params.push(options.requestId);
    }
    if (options.parentJobId) {
        sql += ' AND parent_job_id = ?';
        params.push(options.parentJobId);
    }
    sql += ' ORDER BY created_at DESC';
    if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
    }
    if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
    }
    try {
        const rows = db.prepare(sql).all(...params);
        return rows || [];
    }
    catch (_a) {
        return [];
    }
}
async function getApiStats(clientId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();
    const db = (0, sqlite_1.getDatabase)();
    let sql = `
        SELECT provider, direction, 
               COUNT(*) as request_count,
               SUM(tokens_used) as total_tokens,
               SUM(cost_usd) as total_cost,
               AVG(latency_ms) as avg_latency_ms,
               COUNT(*) FILTER (WHERE response_status >= 400) as error_count
        FROM api_request_logs
        WHERE created_at >= ?
    `;
    const params = [startDateStr];
    if (clientId) {
        sql += ' AND client_id = ?';
        params.push(clientId);
    }
    sql += ' GROUP BY provider, direction';
    try {
        const rows = db.prepare(sql).all(...params);
        return { stats: rows || [], timeline: [] };
    }
    catch (_a) {
        return { stats: [], timeline: [] };
    }
}
async function getAvailableModels() {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT * FROM available_models ORDER BY module_id, display_name').all();
    return rows || [];
}
async function getProviderLabels() {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT provider, label FROM provider_labels').all();
    const labels = {};
    for (const row of rows) {
        labels[row.provider] = row.label;
    }
    return labels;
}
async function setProviderLabel(provider, label) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare(`
            INSERT INTO provider_labels (provider, label, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(provider) DO UPDATE SET label = excluded.label, updated_at = datetime('now')
        `).run(provider, label);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function getModelsByModule(moduleId) {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT * FROM available_models WHERE module_id = ? AND is_active = 1').all(moduleId);
    return rows || [];
}
async function addModel(moduleId, provider, modelId, displayName) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare(`
            INSERT INTO available_models (module_id, provider, model_id, display_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(module_id, provider, model_id) DO NOTHING
        `).run(moduleId, provider, modelId, displayName);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function toggleModel(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const row = db.prepare('SELECT is_active FROM available_models WHERE id = ?').get(id);
        if (!row)
            return false;
        const newValue = row.is_active === 1 ? 0 : 1;
        db.prepare('UPDATE available_models SET is_active = ? WHERE id = ?').run(newValue, id);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function deleteModel(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM available_models WHERE id = ?').run(id);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function getModulePricing(clientId, moduleName, asOfDate) {
    const db = (0, sqlite_1.getDatabase)();
    const date = asOfDate || new Date().toISOString().split('T')[0];
    const row = db.prepare(`
        SELECT id, cost_per_job FROM module_pricing 
        WHERE client_id = ? AND module_name = ? 
        AND effective_from <= ? 
        AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC LIMIT 1
    `).get(clientId, moduleName, date, date);
    return row || null;
}
async function getModulePricingHistory(clientId) {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT * FROM module_pricing WHERE client_id = ? ORDER BY effective_from DESC').all(clientId);
    return rows || [];
}
async function setModulePricing(clientId, moduleName, costPerJob, effectiveFrom) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const date = effectiveFrom || new Date().toISOString().split('T')[0];
        db.prepare(`
            INSERT INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
            VALUES (?, ?, ?, ?)
        `).run(clientId, moduleName, costPerJob, date);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function logClientUsage(params) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const result = db.prepare(`
            INSERT INTO client_usage (
                client_id, job_id, user_id, module_name, provider, model,
                status, cost_usd, actual_cost_usd, tokens_used, latency_ms,
                error_message, pricing_id, request_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(params.clientId, params.jobId || null, params.userId || null, params.moduleName, params.provider, params.model || null, params.status, params.costUsd, params.actualCostUsd || null, params.tokensUsed || null, params.latencyMs || null, params.errorMessage || null, params.pricingId || null, params.requestId || null);
        return result.lastInsertRowid;
    }
    catch (e) {
        console.error('[DB] Error logging client usage:', e);
        return 0;
    }
}
async function getClientUsage(options) {
    const db = (0, sqlite_1.getDatabase)();
    let sql = 'SELECT * FROM client_usage WHERE 1=1';
    const params = [];
    if (options.clientId) {
        sql += ' AND client_id = ?';
        params.push(options.clientId);
    }
    if (options.userId) {
        sql += ' AND user_id = ?';
        params.push(options.userId);
    }
    if (options.moduleName) {
        sql += ' AND module_name = ?';
        params.push(options.moduleName);
    }
    if (options.status) {
        sql += ' AND status = ?';
        params.push(options.status);
    }
    if (options.startDate) {
        sql += ' AND created_at >= ?';
        params.push(options.startDate);
    }
    if (options.endDate) {
        sql += ' AND created_at <= ?';
        params.push(options.endDate);
    }
    sql += ' ORDER BY created_at DESC';
    if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
    }
    try {
        const rows = db.prepare(sql).all(...params);
        return rows || [];
    }
    catch (_a) {
        return [];
    }
}
async function getUsageSummary(clientId, startDate, endDate) {
    const db = (0, sqlite_1.getDatabase)();
    let sql = `
        SELECT module_name,
               COUNT(*) as total_requests,
               COUNT(*) FILTER (WHERE status = 'success') as successful_requests,
               COUNT(*) FILTER (WHERE status = 'error') as failed_requests,
               COALESCE(SUM(cost_usd) FILTER (WHERE status = 'success'), 0) as total_cost,
               SUM(tokens_used) as total_tokens,
               AVG(latency_ms) as avg_latency_ms
        FROM client_usage
        WHERE client_id = ?
    `;
    const params = [clientId];
    if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
    }
    if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
    }
    sql += ' GROUP BY module_name';
    try {
        const rows = db.prepare(sql).all(...params);
        return {
            byModule: rows || [],
            totals: null
        };
    }
    catch (_a) {
        return { byModule: [], totals: null };
    }
}
