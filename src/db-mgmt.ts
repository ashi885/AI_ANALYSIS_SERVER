import { getDatabase, initDatabase } from './sqlite';
export { getDatabase, initDatabase } from './sqlite';
import crypto from 'crypto';
import axios from 'axios';

const globalFetch = fetch;

let connectionStatus: 'connected' | 'disconnected' | 'checking' = 'checking';
let connectionError: string | null = null;

export async function checkConnection(): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('SELECT id FROM clients LIMIT 1').get();
        connectionStatus = 'connected';
        connectionError = null;
        return true;
    } catch (e: any) {
        connectionStatus = 'disconnected';
        connectionError = e.message || 'Failed to connect to database';
        return false;
    }
}

export function getConnectionStatus() {
    return { status: connectionStatus, error: connectionError };
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return text;
    }
}

export async function getClientApiKey(clientId: number, provider: 'openai' | 'openrouter' | 'ai_service_primary' | 'ai_service_secondary'): Promise<string | null> {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT api_key, is_active FROM client_api_keys WHERE client_id = ? AND provider = ? AND is_active = 1').get(clientId, provider) as { api_key: string; is_active: number } | undefined;

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
    } catch (e) {
        console.error('[DB] Error getting API key:', e);
        return null;
    }
}

export async function setClientApiKey(clientId: number, provider: 'openai' | 'openrouter' | 'ai_service_primary' | 'ai_service_secondary', apiKey: string): Promise<boolean> {
    try {
        const db = getDatabase();
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
    } catch (e: any) {
        console.error('[DB] Error setting API key:', e.message);
        return false;
    }
}

export async function getClientApiKeys(clientId: number) {
    const db = getDatabase();
    const rows = db.prepare('SELECT id, provider, api_key, api_key_prefix, is_active, created_at, updated_at FROM client_api_keys WHERE client_id = ?').all(clientId);
    console.log('[DB] getClientApiKeys: raw keys:', rows.map((r: any) => ({ provider: r.provider, hasKey: !!r.api_key, keyPrefix: r.api_key_prefix })));
    const decrypted = rows.map((row: any) => {
        const decryptedKey = row.api_key ? decrypt(row.api_key) : null;
        console.log('[DB] decrypt result for', row.provider, ':', decryptedKey?.substring(0, 10) + '...' || 'null');
        return {
            ...row,
            api_key: decryptedKey
        };
    });
    console.log('[DB] returning keys:', decrypted.map((r: any) => ({ provider: r.provider, is_active: r.is_active, hasKey: !!r.api_key })));
    return decrypted || [];
}

/**
 * Selection logic for tiered settings (e.g. ad break frequency based on duration)
 */
export function getTieredValue(config: any, duration: number): string | number {
    if (!config) return '';
    try {
        const parsed = typeof config === 'string' ? JSON.parse(config) : config;
        if (parsed && parsed.type === 'tiered' && Array.isArray(parsed.tiers)) {
            const sortedTiers = [...parsed.tiers].sort((a, b) => {
                const maxA = a.max_seconds === -1 ? Infinity : (a.max_seconds || 0);
                const maxB = b.max_seconds === -1 ? Infinity : (b.max_seconds || 0);
                return maxA - maxB;
            });

            const tier = sortedTiers.find((t: any) => {
                const max = t.max_seconds === -1 ? Infinity : (t.max_seconds || 0);
                return duration <= max;
            });

            if (tier) return tier.value;
        }
        return parsed?.value !== undefined ? parsed.value : parsed;
    } catch {
        return config;
    }
}

export async function deactivateApiKey(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('UPDATE client_api_keys SET is_active = 0 WHERE id = ?').run(id);
        return true;
    } catch {
        return false;
    }
}

export async function toggleApiKey(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT is_active FROM client_api_keys WHERE id = ?').get(id) as { is_active: number } | undefined;
        if (!row) return false;

        const newValue = row.is_active === 1 ? 0 : 1;
        db.prepare('UPDATE client_api_keys SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newValue, id);
        return true;
    } catch (e) {
        console.error('[DB] Error toggling API key:', e);
        return false;
    }
}

export async function deleteApiKey(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('DELETE FROM client_api_keys WHERE id = ?').run(id);
        return true;
    } catch {
        return false;
    }
}

export async function getSystemTimezone(): Promise<string> {
    try {
        const db = getDatabase();
        const row = db.prepare("SELECT value FROM system_settings WHERE key = 'system_timezone'").get() as { value: string } | undefined;
        return row?.value || 'UTC';
    } catch {
        return 'UTC';
    }
}

export async function setSystemTimezone(timezone: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('system_timezone', ?, datetime('now'))").run(timezone);
        return true;
    } catch (e: any) {
        console.error('[DB] Error setting system timezone:', e.message);
        return false;
    }
}

export async function getGlobalDefaultModel(): Promise<string> {
    try {
        const db = getDatabase();
        const row = db.prepare("SELECT value FROM system_settings WHERE key = 'default_ai_model'").get() as { value: string } | undefined;
        return row?.value || '';
    } catch {
        return '';
    }
}

export async function setGlobalDefaultModel(model: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('default_ai_model', ?, datetime('now'))").run(model);
        return true;
    } catch (e: any) {
        console.error('[DB] Error setting global default model:', e.message);
        return false;
    }
}

export async function getClientTimezone(clientId: number): Promise<string> {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT timezone FROM clients WHERE id = ?').get(clientId) as { timezone: string } | undefined;
        return row?.timezone || 'UTC';
    } catch {
        return 'UTC';
    }
}

export async function setClientTimezone(clientId: number, timezone: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare("UPDATE clients SET timezone = ?, updated_at = datetime('now') WHERE id = ?").run(timezone, clientId);
        return true;
    } catch (e: any) {
        console.error('[DB] Error setting client timezone:', e.message);
        return false;
    }
}

export async function getSystemSettings(): Promise<Record<string, string>> {
    try {
        const db = getDatabase();
        const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string, value: string }[];
        const settings: Record<string, string> = {};
        rows.forEach(r => settings[r.key] = r.value);
        return settings;
    } catch {
        return { system_timezone: 'UTC' };
    }
}

export interface LogRequestParams {
    clientId: number;
    provider: 'openai' | 'openrouter' | 'whisper' | 'internal' | 'ai_service_primary' | 'ai_service_secondary';
    endpoint: string;
    model?: string;
    direction: 'incoming' | 'outgoing';
    requestMethod?: string;
    requestHeaders?: object;
    requestBody?: object;
    responseStatus?: number;
    responseBody?: object;
    requestId?: string;
    errorMessage?: string;
    tokensUsed?: number;
    costUsd?: number;
    latencyMs?: number;
    ipAddress?: string;
    userAgent?: string;
    parentJobId?: string;
    billedCost?: number;
}

export async function logApiRequest(params: LogRequestParams) {
    console.log(`[DB] Attempting to log AI ${params.direction} request for client ${params.clientId} (${params.provider})`);
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO api_request_logs (
                client_id, provider, endpoint, model, direction,
                request_method, request_headers, request_body,
                response_status, response_body, request_id, parent_job_id, billed_cost, error_message,
                tokens_used, cost_usd, latency_ms, ip_address, user_agent,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
            params.clientId,
            params.provider,
            params.endpoint,
            params.model || null,
            params.direction,
            params.requestMethod || null,
            params.requestHeaders ? JSON.stringify(params.requestHeaders).substring(0, 10000) : null,
            params.requestBody ? JSON.stringify(params.requestBody).substring(0, 100000) : null,
            params.responseStatus || null,
            params.responseBody ? JSON.stringify(params.responseBody).substring(0, 100000) : null,
            params.requestId || null,
            params.parentJobId || null,
            params.billedCost || 0,
            params.errorMessage || null,
            params.tokensUsed || 0,
            params.costUsd || 0,
            params.latencyMs || 0,
            params.ipAddress || null,
            params.userAgent || null
        );
    } catch (e) {
        console.error('[DB] CRITICAL: Failed to log API request:', e);
    }
}

export async function getApiLogs(options: {
    clientId?: number;
    provider?: string;
    direction?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    requestId?: string;
    parentJobId?: string;
}) {
    const db = getDatabase();
    let sql = `
        SELECT l.*, c.name as client_name
        FROM api_request_logs l
        LEFT JOIN clients c ON l.client_id = c.id
        WHERE 1=1
    `;
    const params: any[] = [];

    if (options.requestId) {
        sql += ' AND l.request_id = ?';
        params.push(options.requestId);
    }
    if (options.parentJobId) {
        sql += ' AND l.parent_job_id = ?';
        params.push(options.parentJobId);
    }

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
    } catch {
        return [];
    }
}

export async function getApiStats(clientId?: number, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    const db = getDatabase();
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
    const params: any[] = [startDateStr];

    if (clientId) {
        sql += ' AND client_id = ?';
        params.push(clientId);
    }

    sql += ' GROUP BY provider, direction';

    try {
        const rows = db.prepare(sql).all(...params);
        return { stats: rows || [], timeline: [] };
    } catch {
        return { stats: [], timeline: [] };
    }
}

export async function getAvailableModels() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM available_models ORDER BY module_id, display_name').all();
    return rows || [];
}
export async function fetchOpenRouterModels(apiKey: string): Promise<Array<{id: string, name: string, provider: string}>> {
    const headers: any = {
        'HTTP-Referer': 'https://cuepoint.production',
        'X-Title': 'Cuepoint AI Analysis'
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
        console.log('[DB] Fetching models from OpenRouter (Auth)...');
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            headers,
            timeout: 10000
        });
        
        const data = (response as any).data || {};
        let models = data.data || [];

        // Fallback: If for some reason the authenticated request returned empty data, 
        // try a public request as the models endpoint is generally public.
        if (models.length === 0) {
            console.log('[DB] Discovery returned 0 models, trying clean public fetch...');
            const publicRes = await axios.get('https://openrouter.ai/api/v1/models', {
                headers: {
                    'HTTP-Referer': 'https://cuepoint.production',
                    'X-Title': 'Cuepoint AI Analysis'
                },
                timeout: 10000
            });
            models = (publicRes as any).data?.data || [];
        }
        
        const filteredModels = models
            .filter((m: any) => {
                const id = m.id.toLowerCase();
                return !id.includes(':') && !id.includes('free');
            })
            .slice(0, 1000)
            .map((m: any) => ({
                id: m.id,
                name: m.name || m.id,
                provider: 'openrouter'
            }));

        console.log(`[DB] OpenRouter API returned ${models.length} raw models. Filtered to ${filteredModels.length}.`);
        return filteredModels;
    } catch (error: any) {
        console.error('[DB] OpenRouter Fetch Error:', error.response?.data || error.message);
        return [];
    }
}

export async function discoverOpenRouterModels(apiKey: string): Promise<any[]> {
    return await fetchOpenRouterModels(apiKey);
}

export async function syncOpenRouterModelsToDb(apiKey: string): Promise<number> {
    const models = await fetchOpenRouterModels(apiKey);
    if (models.length === 0) return 0;
    
    const db = getDatabase();
    let count = 0;
    
    for (const model of models) {
        // Map to existing modules (metadata, ad_breaks, promo_breaks, etc.)
        const modules = ['metadata', 'ad_breaks', 'promo_breaks', 'subtitles', 'subtitle_translation'];
        
        for (const moduleId of modules) {
            // Only sync popular/important models automatically to avoid clutter
            const isVeryPopular = model.id.includes('gpt-4o') || model.id.includes('claude-3-5') || model.id.includes('claude-3-7') || model.id.includes('gemini-1.5-pro');
            if (!isVeryPopular) continue;

            // Check if already exists
            const existing = db.prepare(
                'SELECT id FROM available_models WHERE module_id = ? AND model_id = ?'
            ).get(moduleId, model.id);
            
            if (!existing) {
                db.prepare(`
                    INSERT INTO available_models (module_id, provider, model_id, display_name, is_active)
                    VALUES (?, ?, ?, ?, 1)
                `).run(moduleId, 'openrouter', model.id, model.name);
                count++;
            }
        }
    }
    
    return count;
}

export async function getProviderLabels(): Promise<Record<string, string>> {
    const db = getDatabase();
    const rows = db.prepare('SELECT provider, label FROM provider_labels').all() as { provider: string; label: string }[];
    const labels: Record<string, string> = {};
    for (const row of rows) {
        labels[row.provider] = row.label;
    }
    return labels;
}

export async function setProviderLabel(provider: string, label: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO provider_labels (provider, label, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(provider) DO UPDATE SET label = excluded.label, updated_at = datetime('now')
        `).run(provider, label);
        return true;
    } catch {
        return false;
    }
}

export async function getModelsByModule(moduleId: string) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM available_models WHERE module_id = ? AND is_active = 1').all(moduleId);
    return rows || [];
}

export async function addModel(moduleId: string, provider: string, modelId: string, displayName: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO available_models (module_id, provider, model_id, display_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(module_id, provider, model_id) DO NOTHING
        `).run(moduleId, provider, modelId, displayName);
        return true;
    } catch {
        return false;
    }
}

export async function toggleModel(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT is_active FROM available_models WHERE id = ?').get(id) as { is_active: number } | undefined;
        if (!row) return false;

        const newValue = row.is_active === 1 ? 0 : 1;
        db.prepare('UPDATE available_models SET is_active = ? WHERE id = ?').run(newValue, id);
        return true;
    } catch {
        return false;
    }
}

export async function deleteModel(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('DELETE FROM available_models WHERE id = ?').run(id);
        return true;
    } catch {
        return false;
    }
}

export async function getModulePricing(clientId: number, moduleName: string, duration?: number, asOfDate?: string): Promise<{ cost_per_job: number; id: number } | null> {
    const db = getDatabase();
    const date = asOfDate || new Date().toISOString().split('T')[0];

    // --- Normalization & Mapping Logic ---
    // 1. Strip language suffixes for pricing lookup (e.g. subtitle_translation-en -> subtitle_translation)
    let lookupModule = moduleName.includes('-') ? moduleName.split('-')[0] : moduleName;

    // 1. PRIMARY: Read from clients.module_rates — this is what admin configures in the billing portal
    const clientRow = db.prepare('SELECT module_rates FROM clients WHERE id = ?').get(clientId) as { module_rates: string } | undefined;
    if (clientRow?.module_rates) {
        try {
            const rates = typeof clientRow.module_rates === 'string' ? JSON.parse(clientRow.module_rates) : clientRow.module_rates;
            
            // 2. Fetch rate with fallback mapping for translations
            let moduleRate = rates[lookupModule];
            if (moduleRate === undefined && lookupModule === 'subtitle_translation') {
                moduleRate = rates['subtitles'];
            }
            
            if (moduleRate !== undefined) {
                // Check for tiered pricing
                if (typeof moduleRate === 'object' && moduleRate.pricing_type === 'tiered' && Array.isArray(moduleRate.tiers)) {
                    const dur = duration || 0;
                    // Find matching tier (duration in seconds)
                    // Tiers should be sorted by max_seconds ascending
                    const sortedTiers = [...moduleRate.tiers].sort((a, b) => {
                        const maxA = a.max_seconds === -1 ? Infinity : (a.max_seconds || 0);
                        const maxB = b.max_seconds === -1 ? Infinity : (b.max_seconds || 0);
                        return maxA - maxB;
                    });

                    const tier = sortedTiers.find((t: any) => {
                        const max = t.max_seconds === -1 ? Infinity : (t.max_seconds || 0);
                        return dur <= max;
                    });

                    if (tier) {
                        return { id: -1, cost_per_job: Number(tier.cost) };
                    }
                }

                // Standard flat rate
                const cost = typeof moduleRate === 'object' ? moduleRate.cost_per_job : moduleRate;
                if (cost !== undefined && cost !== null) {
                    return { id: -1, cost_per_job: Number(cost) };
                }
            }
        } catch (err: any) { 
            console.error(`[Pricing] Error parsing rates for client ${clientId}:`, err.message);
            /* fall through */ 
        }
    }

    // 2. SECONDARY: module_pricing table (historical records with effective dates)
    const row = db.prepare(`
        SELECT id, cost_per_job FROM module_pricing 
        WHERE client_id = ? AND module_name = ? 
        AND effective_from <= ? 
        AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC LIMIT 1
    `).get(clientId, lookupModule, date, date) as { id: number; cost_per_job: number } | undefined;

    if (!row && lookupModule === 'subtitle_translation') {
        // Retry with subtitles if no translation rate found in module_pricing
        const fallbackRow = db.prepare(`
            SELECT id, cost_per_job FROM module_pricing 
            WHERE client_id = ? AND module_name = 'subtitles'
            AND effective_from <= ? 
            AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC LIMIT 1
        `).get(clientId, date, date) as { id: number; cost_per_job: number } | undefined;
        if (fallbackRow) return fallbackRow;
    }

    if (row) return row;

    // 3. Global default rate (client_id IS NULL)
    const globalRow = db.prepare(`
        SELECT id, cost_per_job FROM module_pricing 
        WHERE client_id IS NULL AND module_name = ? 
        AND effective_from <= ? 
        AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC LIMIT 1
    `).get(lookupModule, date, date) as { id: number; cost_per_job: number } | undefined;

    if (!globalRow && lookupModule === 'subtitle_translation') {
        const globalFallback = db.prepare(`
            SELECT id, cost_per_job FROM module_pricing 
            WHERE client_id IS NULL AND module_name = 'subtitles'
            AND effective_from <= ? 
            AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC LIMIT 1
        `).get(date, date) as { id: number; cost_per_job: number } | undefined;
        if (globalFallback) return globalFallback;
    }

    if (globalRow) return globalRow;

    // 4. Hardcoded safety defaults — billing never returns $0 silently
    const FALLBACK_RATES: Record<string, number> = {
        transcription: 0.006,
        subtitles:     0.015,
        metadata:      0.015,
        ad_breaks:     0.025,
        promo_breaks:  0.025,
    };
    const fallback = FALLBACK_RATES[lookupModule] || (lookupModule === 'subtitle_translation' ? FALLBACK_RATES['subtitles'] : undefined);
    if (fallback !== undefined) {
        return { id: -1, cost_per_job: fallback };
    }

    return null;
}

export async function getModulePricingHistory(clientId: number) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM module_pricing WHERE client_id = ? ORDER BY effective_from DESC').all(clientId);
    return rows || [];
}

export async function setModulePricing(clientId: number, moduleName: string, costPerJob: number, effectiveFrom?: string): Promise<boolean> {
    try {
        const db = getDatabase();
        const date = effectiveFrom || new Date().toISOString().split('T')[0];
        db.prepare(`
            INSERT INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
            VALUES (?, ?, ?, ?)
        `).run(clientId, moduleName, costPerJob, date);
        return true;
    } catch {
        return false;
    }
}

export interface LogClientUsageParams {
    clientId: number;
    jobId?: string | number;
    userId?: number;
    moduleName: string;
    provider: string;
    model?: string;
    status: 'success' | 'error';
    costUsd: number;
    actualCostUsd?: number;
    tokensUsed?: number;
    latencyMs?: number;
    errorMessage?: string;
    pricingId?: number;
    requestId?: string;
    durationSeconds?: number;
}

export async function logClientUsage(params: LogClientUsageParams): Promise<number> {
    try {
        const db = getDatabase();
        const result = db.prepare(`
            INSERT INTO client_usage (
                client_id, job_id, user_id, module_name, provider, model,
                status, cost_usd, actual_cost_usd, tokens_used, latency_ms,
                error_message, pricing_id, request_id, duration_seconds
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            params.clientId,
            params.jobId || null,
            params.userId || null,
            params.moduleName,
            params.provider,
            params.model || null,
            params.status,
            params.costUsd,
            params.actualCostUsd || null,
            params.tokensUsed || null,
            params.latencyMs || null,
            params.errorMessage || null,
            params.pricingId || null,
            params.requestId || null,
            params.durationSeconds || 0
        );

        // --- AUTOMATIC CREDIT DEDUCTION (Client Billing) ---
        if (params.status === 'success' && params.costUsd > 0) {
            await deductCredits(
                params.clientId, 
                params.costUsd, 
                `AI Module: ${params.moduleName}`, 
                params.jobId?.toString()
            );
        }

        // --- AUTOMATIC PROVIDER BALANCE DEDUCTION (Internal Tracking) ---
        if (params.status === 'success' && (params.actualCostUsd || 0) > 0) {
            let balanceCol = '';
            const prov = params.provider.toLowerCase();
            if (prov === 'openai' || prov === 'whisper') {
                balanceCol = 'provider_bal_openai';
            } else if (prov === 'openrouter') {
                balanceCol = 'provider_bal_openrouter';
            }

            if (balanceCol) {
                try {
                    db.prepare(`UPDATE clients SET ${balanceCol} = ${balanceCol} - ?, updated_at = datetime('now') WHERE id = ?`)
                      .run(params.actualCostUsd, params.clientId);
                } catch (err: any) {
                    console.error(`[DB] Error deducting provider balance (${balanceCol}):`, err.message);
                }
            }
        }

        return result.lastInsertRowid as number;
    } catch (e) {
        console.error('[DB] Error logging client usage:', e);
        return 0;
    }
}

export async function getClientUsage(options: {
    clientId?: number;
    moduleName?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}) {
    const db = getDatabase();
    let sql = 'SELECT * FROM client_usage WHERE 1=1';
    const params: any[] = [];

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
    } catch {
        return [];
    }
}

export async function getUsageSummary(clientId: number, startDate?: string, endDate?: string) {
    const db = getDatabase();
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
    const params: any[] = [clientId];

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
    } catch {
        return [];
    }
}

export async function setClientModelsBulk(clientId: number, models: Array<{moduleName: string, provider: string, model: string}>): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('DELETE FROM client_models WHERE client_id = ?').run(clientId);

        const insert = db.prepare(`
            INSERT INTO client_models (client_id, module_name, api_provider, api_model)
            VALUES (?, ?, ?, ?)
        `);

        for (const m of models) {
            insert.run(clientId, m.moduleName, m.provider, m.model);
        }
        return true;
    } catch {
        return false;
    }
}

export async function updateWatcherHeartbeat(clientId: number, status: string): Promise<boolean> {
    return true;
}

export async function getClientByApiKey(apiKey: string) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM clients WHERE api_key = ?').get(apiKey) as any;
    return row || null;
}

export async function getClientById(id: number) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    return row || null;
}

export async function createClient(data: { name: string; apiKey: string; apiEndpoint?: string }) {
    const db = getDatabase();
    const result = db.prepare(`
        INSERT INTO clients (name, api_key, api_endpoint)
        VALUES (?, ?, ?)
    `).run(data.name, data.apiKey, data.apiEndpoint || null);
    return result.lastInsertRowid as number;
}

export async function updateClient(id: number, data: Partial<{ 
    name: string; 
    api_endpoint: string; 
    status: string; 
    plan: string; 
    billing_type: string; 
    credits: number;
    provider_bal_openai: number;
    provider_bal_openrouter: number;
    provider_warn_threshold: number;
}>) {
    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];

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
    if (data.billing_type !== undefined) {
        updates.push('billing_type = ?');
        params.push(data.billing_type);
    }
    if (data.credits !== undefined) {
        updates.push('credits = ?');
        params.push(data.credits);
    }
    if (data.provider_bal_openai !== undefined) {
        updates.push('provider_bal_openai = ?');
        params.push(data.provider_bal_openai);
    }
    if (data.provider_bal_openrouter !== undefined) {
        updates.push('provider_bal_openrouter = ?');
        params.push(data.provider_bal_openrouter);
    }
    if (data.provider_warn_threshold !== undefined) {
        updates.push('provider_warn_threshold = ?');
        params.push(data.provider_warn_threshold);
    }

    if (updates.length === 0) return false;

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return true;
}

export async function deleteClient(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('DELETE FROM clients WHERE id = ?').run(id);
        return true;
    } catch {
        return false;
    }
}

export async function getAllClients() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
    return rows || [];
}

export async function addJobCompletion(data: {
    clientId?: string;
    licenseKey?: string;
    localJobId?: number;
    filename?: string;
    userId?: number;
    status: string;
    modulesCompleted?: string;
    durationSeconds?: number;
    totalCostUsd?: number;
}) {
    const db = getDatabase();
    const result = db.prepare(`
        INSERT INTO job_completions (client_id, license_key, local_job_id, filename, user_id, status, modules_completed, duration_seconds, total_cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.clientId || null,
        data.licenseKey || null,
        data.localJobId || null,
        data.filename || null,
        data.userId || null,
        data.status,
        data.modulesCompleted || null,
        data.durationSeconds || null,
        data.totalCostUsd || null
    );
    return result.lastInsertRowid as number;
}

export async function getPendingSyncQueue(status?: string, limit?: number) {
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
        params.push(limit);
    }

    return db.prepare(sql).all(...params);
}

export async function updateSyncQueueItem(id: number, data: { status?: string; error_message?: string; retry_count?: number }) {
    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];

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

    if (updates.length === 0) return false;

    params.push(id);
    db.prepare(`UPDATE pending_sync_queue SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return true;
}

export async function addToSyncQueue(data: {
    tableName: string;
    recordType: string;
    jobId?: number;
    moduleName?: string;
    payload: string;
}) {
    const db = getDatabase();
    const result = db.prepare(`
        INSERT INTO pending_sync_queue (table_name, record_type, job_id, module_name, payload)
        VALUES (?, ?, ?, ?, ?)
    `).run(data.tableName, data.recordType, data.jobId || null, data.moduleName || null, data.payload);
    return result.lastInsertRowid as number;
}

export async function getSmtpSettings() {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM smtp_settings WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    return row || null;
}

export async function saveSmtpSettings(data: {
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
    fromEmail?: string;
    fromName?: string;
}) {
    const db = getDatabase();
    const encrypted = data.password ? encrypt(data.password) : null;

    db.prepare(`
        INSERT INTO smtp_settings (host, port, secure, username, password_encrypted, from_email, from_name, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(data.host, data.port, data.secure ? 1 : 0, data.username || null, encrypted, data.fromEmail || null, data.fromName || 'Cuepoint Support');

    return true;
}

export async function addCredits(clientId: number, amount: number, reason: string, jobId?: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.transaction(() => {
            // 1. Update client balance
            db.prepare('UPDATE clients SET credits = credits + ?, updated_at = datetime(\'now\') WHERE id = ?').run(amount, clientId);
            
            // 2. Log transaction
            db.prepare(`
                INSERT INTO credit_transactions (client_id, amount, type, reason, job_id)
                VALUES (?, ?, 'ADD', ?, ?)
            `).run(clientId, amount, reason, jobId || null);
        })();
        return true;
    } catch (e) {
        console.error('[DB] Error adding credits:', e);
        return false;
    }
}

export async function deductCredits(clientId: number, amount: number, reason: string, jobId?: string): Promise<{ success: boolean; balance?: number; error?: string }> {
    try {
        const db = getDatabase();
        return db.transaction(() => {
            const client = db.prepare('SELECT credits, billing_type FROM clients WHERE id = ?').get(clientId) as { credits: number; billing_type: string } | undefined;
            
            if (!client) return { success: false, error: 'Client not found' };
            
            // Only enforce balance if in CREDIT mode
            if (client.billing_type === 'CREDIT' && client.credits < amount) {
                return { success: false, error: 'Insufficient credits', balance: client.credits };
            }

            // 1. Update client balance
            db.prepare('UPDATE clients SET credits = credits - ?, updated_at = datetime(\'now\') WHERE id = ?').run(amount, clientId);
            
            // 2. Log transaction
            db.prepare(`
                INSERT INTO credit_transactions (client_id, amount, type, reason, job_id)
                VALUES (?, ?, 'DEDUCT', ?, ?)
            `).run(clientId, amount, reason, jobId || null);
            
            return { success: true, balance: client.credits - amount };
        })();
    } catch (e: any) {
        console.error('[DB] Error deducting credits:', e);
        return { success: false, error: e.message };
    }
}

export async function getCreditTransactions(clientId: number, limit: number = 50) {
    try {
        const db = getDatabase();
        const rows = db.prepare('SELECT * FROM credit_transactions WHERE client_id = ? ORDER BY created_at DESC LIMIT ?').all(clientId, limit);
        return rows || [];
    } catch {
        return [];
    }
}

export async function getNotificationSettings() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM email_notification_settings').all();
    return rows || [];
}

export async function updateNotificationSettings(id: number, data: {
    isEnabled?: boolean;
    recipientEmails?: string;
    thresholdValue?: number;
    thresholdUnit?: string;
    minPendingAgeHours?: number;
}) {
    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];

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

    if (updates.length === 0) return false;

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE email_notification_settings SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return true;
}

export function initializeDatabase() {
    initDatabase();
}

export async function deleteSyncQueueItem(id: number): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('DELETE FROM pending_sync_queue WHERE id = ?').run(id);
        return true;
    } catch {
        return false;
    }
}

export async function getClientModels(clientId: number) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM client_models WHERE client_id = ?').all(clientId);
    return rows || [];
}

class QueryBuilder {
    private table: string;
    private conditions: Record<string, any> = {};
    private orderBy: string | null = null;
    private orderDir: 'asc' | 'desc' = 'desc';
    private limitVal: number | null = null;
    private selectCols: string = '*';

    constructor(table: string) {
        this.table = table;
    }

    select(cols: string): this {
        this.selectCols = cols;
        return this;
    }

    eq(column: string, value: any): this {
        this.conditions[column] = value;
        return this;
    }

    gte(column: string, value: any): this {
        this.conditions[column + '_gte'] = { gte: value };
        return this;
    }

    lte(column: string, value: any): this {
        this.conditions[column + '_lte'] = { lte: value };
        return this;
    }

    not(column: string, op: string, value: any): this {
        if (op === 'is' && value === null) {
            this.conditions[column + '_not_null'] = false;
        } else if (op === 'neq') {
            this.conditions[column + '_neq'] = value;
        }
        return this;
    }

    neq(column: string, value: any): this {
        this.conditions[column + '_neq'] = value;
        return this;
    }

    order(column: string, options?: { ascending?: boolean }): this {
        this.orderBy = column;
        this.orderDir = options?.ascending ? 'asc' : 'desc';
        return this;
    }

    limit(n: number): this {
        this.limitVal = n;
        return this;
    }

    async then<TResult1 = any[], TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | Promise<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | Promise<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
        try {
            const db = getDatabase();
            let sql = `SELECT ${this.selectCols} FROM ${this.table}`;
            const params: any[] = [];
            const whereParts: string[] = [];

            for (const [col, val] of Object.entries(this.conditions)) {
                if (col.endsWith('_not_null')) {
                    if (!val) whereParts.push(`${col.replace('_not_null', '')} IS NOT NULL`);
                    else whereParts.push(`${col.replace('_not_null', '')} IS NULL`);
                } else if (col.endsWith('_gte')) {
                    whereParts.push(`${col.replace('_gte', ' >= ?')}`);
                    params.push(val.gte);
                } else if (col.endsWith('_lte')) {
                    whereParts.push(`${col.replace('_lte', ' <= ?')}`);
                    params.push(val.lte);
                } else if (col.endsWith('_neq')) {
                    whereParts.push(`${col.replace('_neq', ' != ?')}`);
                    params.push(val);
                } else {
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
            return ({ data: rows, error: null, count: rows.length }) as any;
        } catch (error: any) {
            return ({ data: null, error, count: 0 }) as any;
        }
    }

    async single() {
        this.limitVal = 1;
        const result: any = await this.then();
        return { data: result.data?.[0] || null, error: result.error };
    }

    async delete() {
        try {
            const db = getDatabase();
            const whereParts: string[] = [];
            const params: any[] = [];

            for (const [col, val] of Object.entries(this.conditions)) {
                whereParts.push(`${col} = ?`);
                params.push(val);
            }

            if (whereParts.length === 0) return { error: 'No conditions' };

            const sql = `DELETE FROM ${this.table} WHERE ${whereParts.join(' AND ')}`;
            const result = db.prepare(sql).run(...params);
            return { error: null };
        } catch (error: any) {
            return { error };
        }
    }

    async update(data: Record<string, any>) {
        try {
            const db = getDatabase();
            const setParts: string[] = [];
            const params: any[] = [];

            for (const [col, val] of Object.entries(data)) {
                setParts.push(`${col} = ?`);
                params.push(val);
            }

            const whereParts: string[] = [];
            for (const [col, val] of Object.entries(this.conditions)) {
                whereParts.push(`${col} = ?`);
                params.push(val);
            }

            if (setParts.length === 0 || whereParts.length === 0) return { error: 'Invalid update' };

            const sql = `UPDATE ${this.table} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`;
            const result = db.prepare(sql).run(...params);
            return { error: null };
        } catch (error: any) {
            return { error };
        }
    }

    async insert(data: Record<string, any>) {
        try {
            const db = getDatabase();
            const cols = Object.keys(data);
            const placeholders = cols.map(() => '?').join(', ');
            const sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES (${placeholders})`;
            const result = db.prepare(sql).run(...Object.values(data));
            return { data: [{ id: result.lastInsertRowid }], error: null };
        } catch (error: any) {
            return { data: null, error };
        }
    }
}

export const supabase = {
    from: (table: string) => new QueryBuilder(table)
};

/**
 * AI Module Settings Helpers
 */
export async function getClientModuleSettings(clientId: number, moduleName?: string): Promise<Record<string, any>> {
    try {
        const db = getDatabase();
        let query = 'SELECT module_name, setting_key, setting_value FROM client_module_settings WHERE client_id = ?';
        const params: any[] = [clientId];
        
        if (moduleName) {
            query += ' AND module_name = ?';
            params.push(moduleName);
        }
        
        const rows = db.prepare(query).all(...params) as { module_name: string; setting_key: string; setting_value: string }[];
        
        const settings: Record<string, any> = {};
        for (const row of rows) {
            if (!settings[row.module_name]) settings[row.module_name] = {};
            
            let val: any = row.setting_value;
            // Attempt to parse tiered JSON settings
            if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                try {
                    const parsed = JSON.parse(val);
                    // If it's a tiered setting, auto-resolve it if possible (requires duration context which we don't have here yet)
                    // For now, we return the whole object, and callers can resolve it.
                    val = parsed;
                } catch { /* use as string */ }
            }
            
            settings[row.module_name][row.setting_key] = val;
        }
        
        return moduleName ? (settings[moduleName] || {}) : settings;
    } catch (e) {
        console.error('[DB] Error getting module settings:', e);
        return {};
    }
}

export async function saveClientModuleSetting(clientId: number, moduleName: string, key: string, value: string): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO client_module_settings (client_id, module_name, setting_key, setting_value)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(client_id, module_name, setting_key) DO UPDATE SET
                setting_value = excluded.setting_value
        `).run(clientId, moduleName, key, value);
        return true;
    } catch (e) {
        console.error('[DB] Error saving module setting:', e);
        return false;
    }
}

export async function saveClientAIExample(clientId: number, moduleName: string, context: string, output: any): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO client_ai_examples (client_id, module_name, context_summary, preferred_output)
            VALUES (?, ?, ?, ?)
        `).run(clientId, moduleName, context, JSON.stringify(output));
        return true;
    } catch (e) {
        console.error('[DB] Error saving AI example:', e);
        return false;
    }
}

export async function getClientAIExamples(clientId: number, moduleName: string, limit = 3): Promise<any[]> {
    try {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT context_summary, preferred_output 
            FROM client_ai_examples 
            WHERE client_id = ? AND module_name = ? AND is_active = 1
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(clientId, moduleName, limit);
        return rows || [];
    } catch (e) {
        console.error('[DB] Error getting AI examples:', e);
        return [];
    }
}

/**
 * Get a specific user setting from the user_settings table
 */
export function getUserSetting(userId: number, key: string): string | null {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key) as { value: string } | undefined;
        return row?.value || null;
    } catch (e) {
        console.error(`[DB] Error getting user setting ${key} for user ${userId}:`, e);
        return null;
    }
}

/**
 * Get full job details from ai_jobs table
 */
/**
 * Get full job details from ai_jobs table
 */
export function getAiJob(jobId: string): any | null {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(jobId);
        return row || null;
    } catch (e) {
        console.error(`[DB] Error getting AI job ${jobId}:`, e);
        return null;
    }
}

/**
 * Get client credentials (Supabase integration)
 */
export async function getClientCredentials(clientId: number) {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT supabase_url, supabase_anon_key FROM client_credentials WHERE client_id = ?').get(clientId) as any;
        return row || null;
    } catch (e) {
        console.error('[DB] Error getting client credentials:', e);
        return null;
    }
}

/**
 * Save client credentials (Supabase integration)
 */
export async function saveClientCredentials(clientId: number, credentials: { supabase_url?: string; supabase_anon_key?: string }) {
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO client_credentials (client_id, supabase_url, supabase_anon_key, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(client_id) DO UPDATE SET
                supabase_url = excluded.supabase_url,
                supabase_anon_key = excluded.supabase_anon_key,
                updated_at = datetime('now')
        `).run(clientId, credentials.supabase_url || null, credentials.supabase_anon_key || null);
        return true;
    } catch (e) {
        console.error('[DB] Error saving client credentials:', e);
        return false;
    }
}

/**
 * Get provider billing information (balances, credits, etc.)
 */

// ===== System Settings =====

export function getSystemSetting(key: string): string | null {
    try {
        const db = getDatabase();
        const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
        return row?.value ?? null;
    } catch (e) {
        return null;
    }
}

export function setSystemSetting(key: string, value: string): boolean {
    try {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `).run(key, value);
        return true;
    } catch (e: any) {
        console.error('[DB] Error saving system setting:', e.message);
        return false;
    }
}

export function getAllSystemSettings(): Record<string, string> {
    try {
        const db = getDatabase();
        const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
        return Object.fromEntries(rows.map(r => [r.key, r.value]));
    } catch (e) {
        return {};
    }
}

// ===== Provider Billing (Management Key-based) =====

export async function getProviderBilling() {
    try {
        const db = getDatabase();
        const results: any[] = [];

        // ── OpenRouter via Management Key ──────────────────────────────────
        const mgmtKey = getSystemSetting('openrouter_management_key');

        if (mgmtKey) {
            try {
                const res = await axios.get('https://openrouter.ai/api/v1/keys', {
                    headers: { 'Authorization': `Bearer ${mgmtKey}` },
                    timeout: 8000
                });

                const subKeys: any[] = (res as any).data?.data || [];

                // Build a lookup map: client name (upper) -> client DB record
                const allClients = db.prepare('SELECT id, name FROM clients').all() as { id: number; name: string }[];
                const clientLookup = new Map<string, any>();
                for (const c of allClients) {
                    clientLookup.set(c.name.toUpperCase().replace(/[^A-Z0-9]/g, ''), c);
                }

                // Also fetch account-level credit from a sub-key (for overall balance)
                let accountBalance: number | null = null;
                try {
                    const firstKey = db.prepare(`
                        SELECT api_key FROM client_api_keys 
                        WHERE provider = 'openrouter' AND is_active = 1 
                        LIMIT 1
                    `).get() as { api_key: string } | undefined;

                    if (firstKey?.api_key || mgmtKey) {
                        const targetKey = mgmtKey || (firstKey?.api_key ? decrypt(firstKey.api_key) : '');
                        const creditRes = await axios.get('https://openrouter.ai/api/v1/credits', {
                            headers: { 'Authorization': `Bearer ${targetKey}` },
                            timeout: 5000
                        });
                        const data = (creditRes as any).data?.data || (creditRes as any).data;
                        if (data && typeof data.total_credits !== 'undefined') {
                            const usage = data.total_usage ?? data.usage ?? 0;
                            accountBalance = data.total_credits - usage;
                        }
                    }
                } catch (e) { /* balance fetch failed, non-critical */ }

                for (const sk of subKeys) {
                    // Match sub-key name to a client in our DB
                    const normalizedName = (sk.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const matchedClient = clientLookup.get(normalizedName);

                    // Fetch local MTD cost from our logs for matched client
                    let localMtd = 0;
                    if (matchedClient) {
                        const usage = db.prepare(`
                            SELECT SUM(cost_usd) as total_cost 
                            FROM api_request_logs 
                            WHERE client_id = ? AND provider = 'openrouter'
                            AND created_at >= date('now', 'start of month')
                        `).get(matchedClient.id) as any;
                        localMtd = usage?.total_cost || 0;
                    }

                    results.push({
                        provider: 'openrouter',
                        source: 'management_key',
                        client_id: matchedClient?.id ?? null,
                        client_name: sk.name,
                        matched_client: matchedClient?.name ?? null,
                        api_key_label: sk.label,
                        api_key_hash: sk.hash,
                        disabled: sk.disabled,
                        limit: sk.limit,
                        limit_remaining: sk.limit_remaining,
                        usage_total: sk.usage,
                        usage_daily: sk.usage_daily,
                        usage_weekly: sk.usage_weekly,
                        usage_monthly: sk.usage_monthly,
                        local_mtd: localMtd,
                        created_at: sk.created_at,
                        expires_at: sk.expires_at,
                        account_balance: accountBalance,
                        last_updated: new Date().toISOString()
                    });
                }

            } catch (e: any) {
                results.push({
                    provider: 'openrouter',
                    source: 'management_key',
                    error: e.response?.data?.error || e.message,
                    last_updated: new Date().toISOString()
                });
            }
        } else {
            // Fallback: individual key approach if no management key set
            const orKeys = db.prepare(`
                SELECT ak.*, c.name as client_name 
                FROM client_api_keys ak
                JOIN clients c ON ak.client_id = c.id
                WHERE ak.provider = 'openrouter' AND ak.is_active = 1
            `).all() as any[];

            for (const key of orKeys) {
                try {
                    const decryptedKey = decrypt(key.api_key);
                    const res = await axios.get('https://openrouter.ai/api/v1/credits', {
                        headers: { 'Authorization': `Bearer ${decryptedKey}` },
                        timeout: 5000
                    });
                    const extData = (res as any).data?.data || (res as any).data;
                    const usage = db.prepare(`
                        SELECT SUM(cost_usd) as total_cost 
                        FROM api_request_logs 
                        WHERE client_id = ? AND provider = 'openrouter'
                        AND created_at >= date('now', 'start of month')
                    `).get(key.client_id) as any;

                    results.push({
                        provider: 'openrouter',
                        source: 'individual_key',
                        client_id: key.client_id,
                        client_name: key.client_name,
                        api_key_label: key.api_key_prefix,
                        limit: extData?.limit ?? null,
                        limit_remaining: extData?.limit_remaining ?? null,
                        usage_total: extData?.usage ?? 0,
                        local_mtd: usage?.total_cost || 0,
                        last_updated: new Date().toISOString()
                    });
                } catch (e: any) {
                    results.push({
                        provider: 'openrouter',
                        source: 'individual_key',
                        client_id: key.client_id,
                        client_name: key.client_name,
                        error: e.message,
                        last_updated: new Date().toISOString()
                    });
                }
            }
        }

        // ── OpenAI ─────────────────────────────────────────────────────────
        const openaiKeys = db.prepare(`
            SELECT ak.*, c.name as client_name 
            FROM client_api_keys ak
            JOIN clients c ON ak.client_id = c.id
            WHERE ak.provider = 'openai' AND ak.is_active = 1
        `).all() as any[];

        let openaiTotalMtd = 0;
        for (const key of openaiKeys) {
            const usage = db.prepare(`
                SELECT SUM(cost_usd) as total_cost 
                FROM api_request_logs 
                WHERE client_id = ? AND provider = 'openai'
                AND created_at >= date('now', 'start of month')
            `).get(key.client_id) as any;
            
            const cost = usage?.total_cost || 0;
            openaiTotalMtd += cost;

            results.push({
                provider: 'openai',
                source: 'individual_key',
                client_id: key.client_id,
                client_name: key.client_name,
                api_key_label: key.api_key_prefix,
                local_mtd: cost,
                last_updated: new Date().toISOString()
            });
        }

        return {
            billing: results,
            openai_total_mtd: openaiTotalMtd
        };
    } catch (e) {
        console.error('[DB] Error getting provider billing:', e);
        return { billing: [], openai_total_mtd: 0 };
    }
}
