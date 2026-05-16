"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = exports.initDatabase = exports.getDatabase = void 0;
exports.checkConnection = checkConnection;
exports.getConnectionStatus = getConnectionStatus;
exports.getClientApiKey = getClientApiKey;
exports.setClientApiKey = setClientApiKey;
exports.getClientApiKeys = getClientApiKeys;
exports.deactivateApiKey = deactivateApiKey;
exports.toggleApiKey = toggleApiKey;
exports.deleteApiKey = deleteApiKey;
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
exports.setClientModelsBulk = setClientModelsBulk;
exports.updateWatcherHeartbeat = updateWatcherHeartbeat;
exports.getClientByApiKey = getClientByApiKey;
exports.getClientById = getClientById;
exports.createClient = createClient;
exports.updateClient = updateClient;
exports.deleteClient = deleteClient;
exports.getAllClients = getAllClients;
exports.addJobCompletion = addJobCompletion;
exports.getPendingSyncQueue = getPendingSyncQueue;
exports.updateSyncQueueItem = updateSyncQueueItem;
exports.addToSyncQueue = addToSyncQueue;
exports.getSmtpSettings = getSmtpSettings;
exports.saveSmtpSettings = saveSmtpSettings;
exports.getNotificationSettings = getNotificationSettings;
exports.updateNotificationSettings = updateNotificationSettings;
exports.initializeDatabase = initializeDatabase;
exports.deleteSyncQueueItem = deleteSyncQueueItem;
exports.getClientModels = getClientModels;
const sqlite_1 = require("./sqlite");
var sqlite_2 = require("./sqlite");
Object.defineProperty(exports, "getDatabase", { enumerable: true, get: function () { return sqlite_2.getDatabase; } });
Object.defineProperty(exports, "initDatabase", { enumerable: true, get: function () { return sqlite_2.initDatabase; } });
const crypto_1 = __importDefault(require("crypto"));
let connectionStatus = 'checking';
let connectionError = null;
async function checkConnection() {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('SELECT id FROM clients LIMIT 1').get();
        connectionStatus = 'connected';
        connectionError = null;
        return true;
    }
    catch (e) {
        connectionStatus = 'disconnected';
        connectionError = e.message || 'Failed to connect to database';
        return false;
    }
}
function getConnectionStatus() {
    return { status: connectionStatus, error: connectionError };
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
    const rows = db.prepare('SELECT id, provider, api_key, api_key_prefix, is_active, created_at, updated_at FROM client_api_keys WHERE client_id = ?').all(clientId);
    console.log('[DB] getClientApiKeys: raw keys:', rows.map((r) => ({ provider: r.provider, hasKey: !!r.api_key, keyPrefix: r.api_key_prefix })));
    const decrypted = rows.map((row) => {
        const decryptedKey = row.api_key ? decrypt(row.api_key) : null;
        console.log('[DB] decrypt result for', row.provider, ':', (decryptedKey === null || decryptedKey === void 0 ? void 0 : decryptedKey.substring(0, 10)) + '...' || 'null');
        return Object.assign(Object.assign({}, row), { api_key: decryptedKey });
    });
    console.log('[DB] returning keys:', decrypted.map((r) => ({ provider: r.provider, is_active: r.is_active, hasKey: !!r.api_key })));
    return decrypted || [];
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
async function toggleApiKey(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const row = db.prepare('SELECT is_active FROM client_api_keys WHERE id = ?').get(id);
        if (!row)
            return false;
        const newValue = row.is_active === 1 ? 0 : 1;
        db.prepare('UPDATE client_api_keys SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newValue, id);
        return true;
    }
    catch (e) {
        console.error('[DB] Error toggling API key:', e);
        return false;
    }
}
async function deleteApiKey(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM client_api_keys WHERE id = ?').run(id);
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
                tokens_used, cost_usd, latency_ms, ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(params.clientId, params.provider, params.endpoint, params.model || null, params.direction, params.requestMethod || null, params.requestHeaders ? JSON.stringify(params.requestHeaders).substring(0, 1000) : null, params.requestBody ? JSON.stringify(params.requestBody).substring(0, 5000) : null, params.responseStatus || null, params.responseBody ? JSON.stringify(params.responseBody).substring(0, 10000) : null, params.errorMessage || null, params.tokensUsed || null, params.costUsd || null, params.latencyMs || null, params.ipAddress || null, params.userAgent || null);
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
    if (options.moduleName) {
        sql += ' AND module_name = ?';
        params.push(options.moduleName);
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
        return rows || [];
    }
    catch (_a) {
        return [];
    }
}
async function setClientModelsBulk(clientId, models) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM client_models WHERE client_id = ?').run(clientId);
        const insert = db.prepare(`
            INSERT INTO client_models (client_id, module_name, api_provider, api_model)
            VALUES (?, ?, ?, ?)
        `);
        for (const m of models) {
            insert.run(clientId, m.moduleName, m.provider, m.model);
        }
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function updateWatcherHeartbeat(clientId, status) {
    return true;
}
async function getClientByApiKey(apiKey) {
    const db = (0, sqlite_1.getDatabase)();
    const row = db.prepare('SELECT * FROM clients WHERE api_key = ?').get(apiKey);
    return row || null;
}
async function getClientById(id) {
    const db = (0, sqlite_1.getDatabase)();
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    return row || null;
}
async function createClient(data) {
    const db = (0, sqlite_1.getDatabase)();
    const result = db.prepare(`
        INSERT INTO clients (name, api_key, api_endpoint)
        VALUES (?, ?, ?)
    `).run(data.name, data.apiKey, data.apiEndpoint || null);
    return result.lastInsertRowid;
}
async function updateClient(id, data) {
    const db = (0, sqlite_1.getDatabase)();
    const updates = [];
    const params = [];
    if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
    }
    if (data.api_endpoint !== undefined) {
        updates.push('api_endpoint = ?');
        params.push(data.api_endpoint);
    }
    if (data.status !== undefined) {
        updates.push('status = ?');
        params.push(data.status);
    }
    if (data.plan !== undefined) {
        updates.push('plan = ?');
        params.push(data.plan);
    }
    if (updates.length === 0)
        return false;
    updates.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return true;
}
async function deleteClient(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM clients WHERE id = ?').run(id);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function getAllClients() {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
    return rows || [];
}
async function addJobCompletion(data) {
    const db = (0, sqlite_1.getDatabase)();
    const result = db.prepare(`
        INSERT INTO job_completions (client_id, license_key, local_job_id, filename, user_id, status, modules_completed, duration_seconds, total_cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.clientId || null, data.licenseKey || null, data.localJobId || null, data.filename || null, data.userId || null, data.status, data.modulesCompleted || null, data.durationSeconds || null, data.totalCostUsd || null);
    return result.lastInsertRowid;
}
async function getPendingSyncQueue(status, limit) {
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
        params.push(limit);
    }
    return db.prepare(sql).all(...params);
}
async function updateSyncQueueItem(id, data) {
    const db = (0, sqlite_1.getDatabase)();
    const updates = [];
    const params = [];
    if (data.status) {
        updates.push('status = ?');
        params.push(data.status);
        if (data.status === 'synced') {
            updates.push("synced_at = datetime('now')");
        }
    }
    if (data.error_message) {
        updates.push('error_message = ?');
        params.push(data.error_message);
    }
    if (data.retry_count !== undefined) {
        updates.push('retry_count = ?');
        params.push(data.retry_count);
    }
    if (updates.length === 0)
        return false;
    params.push(id);
    db.prepare(`UPDATE pending_sync_queue SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return true;
}
async function addToSyncQueue(data) {
    const db = (0, sqlite_1.getDatabase)();
    const result = db.prepare(`
        INSERT INTO pending_sync_queue (table_name, record_type, job_id, module_name, payload)
        VALUES (?, ?, ?, ?, ?)
    `).run(data.tableName, data.recordType, data.jobId || null, data.moduleName || null, data.payload);
    return result.lastInsertRowid;
}
async function getSmtpSettings() {
    const db = (0, sqlite_1.getDatabase)();
    const row = db.prepare('SELECT * FROM smtp_settings WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    return row || null;
}
async function saveSmtpSettings(data) {
    const db = (0, sqlite_1.getDatabase)();
    const encrypted = data.password ? encrypt(data.password) : null;
    db.prepare(`
        INSERT INTO smtp_settings (host, port, secure, username, password_encrypted, from_email, from_name, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(data.host, data.port, data.secure ? 1 : 0, data.username || null, encrypted, data.fromEmail || null, data.fromName || 'Cuepoint Support');
    return true;
}
async function getNotificationSettings() {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT * FROM email_notification_settings').all();
    return rows || [];
}
async function updateNotificationSettings(id, data) {
    const db = (0, sqlite_1.getDatabase)();
    const updates = [];
    const params = [];
    if (data.isEnabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(data.isEnabled ? 1 : 0);
    }
    if (data.recipientEmails) {
        updates.push('recipient_emails = ?');
        params.push(data.recipientEmails);
    }
    if (data.thresholdValue !== undefined) {
        updates.push('threshold_value = ?');
        params.push(data.thresholdValue);
    }
    if (data.thresholdUnit) {
        updates.push('threshold_unit = ?');
        params.push(data.thresholdUnit);
    }
    if (data.minPendingAgeHours !== undefined) {
        updates.push('min_pending_age_hours = ?');
        params.push(data.minPendingAgeHours);
    }
    if (updates.length === 0)
        return false;
    updates.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE email_notification_settings SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return true;
}
function initializeDatabase() {
    (0, sqlite_1.initDatabase)();
}
async function deleteSyncQueueItem(id) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        db.prepare('DELETE FROM pending_sync_queue WHERE id = ?').run(id);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function getClientModels(clientId) {
    const db = (0, sqlite_1.getDatabase)();
    const rows = db.prepare('SELECT * FROM client_models WHERE client_id = ?').all(clientId);
    return rows || [];
}
class QueryBuilder {
    constructor(table) {
        this.conditions = {};
        this.orderBy = null;
        this.orderDir = 'desc';
        this.limitVal = null;
        this.selectCols = '*';
        this.table = table;
    }
    select(cols) {
        this.selectCols = cols;
        return this;
    }
    eq(column, value) {
        this.conditions[column] = value;
        return this;
    }
    gte(column, value) {
        this.conditions[column + '_gte'] = { gte: value };
        return this;
    }
    lte(column, value) {
        this.conditions[column + '_lte'] = { lte: value };
        return this;
    }
    not(column, op, value) {
        if (op === 'is' && value === null) {
            this.conditions[column + '_not_null'] = false;
        }
        else if (op === 'neq') {
            this.conditions[column + '_neq'] = value;
        }
        return this;
    }
    neq(column, value) {
        this.conditions[column + '_neq'] = value;
        return this;
    }
    order(column, options) {
        this.orderBy = column;
        this.orderDir = (options === null || options === void 0 ? void 0 : options.ascending) ? 'asc' : 'desc';
        return this;
    }
    limit(n) {
        this.limitVal = n;
        return this;
    }
    async then(onfulfilled, onrejected) {
        try {
            const db = (0, sqlite_1.getDatabase)();
            let sql = `SELECT ${this.selectCols} FROM ${this.table}`;
            const params = [];
            const whereParts = [];
            for (const [col, val] of Object.entries(this.conditions)) {
                if (col.endsWith('_not_null')) {
                    if (!val)
                        whereParts.push(`${col.replace('_not_null', '')} IS NOT NULL`);
                    else
                        whereParts.push(`${col.replace('_not_null', '')} IS NULL`);
                }
                else if (col.endsWith('_gte')) {
                    whereParts.push(`${col.replace('_gte', ' >= ?')}`);
                    params.push(val.gte);
                }
                else if (col.endsWith('_lte')) {
                    whereParts.push(`${col.replace('_lte', ' <= ?')}`);
                    params.push(val.lte);
                }
                else if (col.endsWith('_neq')) {
                    whereParts.push(`${col.replace('_neq', ' != ?')}`);
                    params.push(val);
                }
                else {
                    whereParts.push(`${col} = ?`);
                    params.push(val);
                }
            }
            if (whereParts.length > 0) {
                sql += ' WHERE ' + whereParts.join(' AND ');
            }
            if (this.orderBy) {
                sql += ` ORDER BY ${this.orderBy} ${this.orderDir.toUpperCase()}`;
            }
            if (this.limitVal) {
                sql += ` LIMIT ${this.limitVal}`;
            }
            const rows = db.prepare(sql).all(...params);
            return ({ data: rows, error: null, count: rows.length });
        }
        catch (error) {
            return ({ data: null, error, count: 0 });
        }
    }
    async single() {
        var _a;
        this.limitVal = 1;
        const result = await this.then();
        return { data: ((_a = result.data) === null || _a === void 0 ? void 0 : _a[0]) || null, error: result.error };
    }
    async delete() {
        try {
            const db = (0, sqlite_1.getDatabase)();
            const whereParts = [];
            const params = [];
            for (const [col, val] of Object.entries(this.conditions)) {
                whereParts.push(`${col} = ?`);
                params.push(val);
            }
            if (whereParts.length === 0)
                return { error: 'No conditions' };
            const sql = `DELETE FROM ${this.table} WHERE ${whereParts.join(' AND ')}`;
            const result = db.prepare(sql).run(...params);
            return { error: null };
        }
        catch (error) {
            return { error };
        }
    }
    async update(data) {
        try {
            const db = (0, sqlite_1.getDatabase)();
            const setParts = [];
            const params = [];
            for (const [col, val] of Object.entries(data)) {
                setParts.push(`${col} = ?`);
                params.push(val);
            }
            const whereParts = [];
            for (const [col, val] of Object.entries(this.conditions)) {
                whereParts.push(`${col} = ?`);
                params.push(val);
            }
            if (setParts.length === 0 || whereParts.length === 0)
                return { error: 'Invalid update' };
            const sql = `UPDATE ${this.table} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`;
            const result = db.prepare(sql).run(...params);
            return { error: null };
        }
        catch (error) {
            return { error };
        }
    }
    async insert(data) {
        try {
            const db = (0, sqlite_1.getDatabase)();
            const cols = Object.keys(data);
            const placeholders = cols.map(() => '?').join(', ');
            const sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES (${placeholders})`;
            const result = db.prepare(sql).run(...Object.values(data));
            return { data: [{ id: result.lastInsertRowid }], error: null };
        }
        catch (error) {
            return { data: null, error };
        }
    }
}
exports.supabase = {
    from: (table) => new QueryBuilder(table)
};
