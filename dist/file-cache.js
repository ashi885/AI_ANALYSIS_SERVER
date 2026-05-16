"use strict";
/**
 * FILE-BASED LICENSE CACHE
 *
 * This module replaces the in-memory license cache with file-based caching.
 * Cache data is stored in JSON files for transparency and persistence.
 *
 * Structure:
 * data/cache/
 *   ├── clients/
 *   │   ├── {client_uuid}.json
 *   │   └── ...
 *   └── index.json (client UUID -> API key mapping)
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeFileCache = initializeFileCache;
exports.getLicenseFromFileCache = getLicenseFromFileCache;
exports.refreshClientInFileCache = refreshClientInFileCache;
exports.invalidateClientInFileCache = invalidateClientInFileCache;
exports.getFileCacheStats = getFileCacheStats;
exports.getFileCacheDetails = getFileCacheDetails;
exports.printFileCacheContents = printFileCacheContents;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const sqlite_1 = require("./sqlite");
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
function decrypt(text) {
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (_a) {
        return text;
    }
}
// Cache directory path - use DATA_DIR env var if set
const CACHE_DIR = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'cache')
    : path.join(process.cwd(), 'data', 'cache');
const CLIENTS_DIR = path.join(CACHE_DIR, 'clients');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Ensure cache directories exist
function ensureCacheDirs() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log('[FileCache] Created cache directory:', CACHE_DIR);
    }
    if (!fs.existsSync(CLIENTS_DIR)) {
        fs.mkdirSync(CLIENTS_DIR, { recursive: true });
        console.log('[FileCache] Created clients directory:', CLIENTS_DIR);
    }
}
// Read cache index
function readIndex() {
    ensureCacheDirs();
    if (!fs.existsSync(INDEX_FILE)) {
        return { apiKeyToUuid: {}, uuidToApiKey: {}, lastUpdated: new Date().toISOString() };
    }
    try {
        const data = fs.readFileSync(INDEX_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (e) {
        console.error('[FileCache] Error reading index:', e);
        return { apiKeyToUuid: {}, uuidToApiKey: {}, lastUpdated: new Date().toISOString() };
    }
}
// Write cache index
function writeIndex(index) {
    ensureCacheDirs();
    index.lastUpdated = new Date().toISOString();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    console.log('[FileCache] Updated index');
}
// Read client cache file
function readClientCache(uuid) {
    const filePath = path.join(CLIENTS_DIR, `${uuid}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const state = JSON.parse(data);
        // Check if expired
        const expiresAt = new Date(state.expiresAt);
        if (Date.now() > expiresAt.getTime()) {
            console.log(`[FileCache] Client cache expired: ${uuid}`);
            fs.unlinkSync(filePath); // Delete expired cache
            return null;
        }
        return state;
    }
    catch (e) {
        console.error('[FileCache] Error reading client cache:', e);
        return null;
    }
}
// Write client cache file
function writeClientCache(state) {
    const filePath = path.join(CLIENTS_DIR, `${state.clientUuid}.json`);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    console.log(`[FileCache] Wrote cache for client: ${state.name} (${state.clientUuid})`);
}
// Delete client cache file
function deleteClientCache(uuid) {
    const filePath = path.join(CLIENTS_DIR, `${uuid}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[FileCache] Deleted cache for client: ${uuid}`);
    }
}
// Get client API keys from database
async function getClientApiKeysFromDb(clientId) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const keys = db.prepare('SELECT provider, api_key_prefix, api_key, is_active FROM client_api_keys WHERE client_id = ? AND is_active = 1').all(clientId);
        return (keys || []).map((k) => (Object.assign(Object.assign({}, k), { api_key: k.api_key ? decrypt(k.api_key) : null })));
    }
    catch (e) {
        console.error('[FileCache] Error fetching API keys:', e);
        return [];
    }
}
// Get client credentials from database (now stored in clients table)
async function getClientCredentialsFromDb(clientId) {
    try {
        const db = (0, sqlite_1.getDatabase)();
        const row = db.prepare('SELECT supabase_url, supabase_anon_key FROM clients WHERE id = ?').get(clientId);
        if (!row) {
            return { supabase_url: null, supabase_anon_key: null };
        }
        return {
            supabase_url: row.supabase_url || null,
            supabase_anon_key: row.supabase_anon_key || null
        };
    }
    catch (e) {
        console.error('[FileCache] Error fetching credentials:', e);
        return { supabase_url: null, supabase_anon_key: null };
    }
}
// Initialize cache from database
async function initializeFileCache() {
    console.log('[FileCache] Initializing file-based license cache...');
    ensureCacheDirs();
    try {
        // Check if there's existing cache - if not, load from database
        const index = readIndex();
        const existingUuids = Object.keys(index.uuidToApiKey);
        if (existingUuids.length > 0) {
            console.log(`[FileCache] Found ${existingUuids.length} cached clients`);
            return;
        }
        console.log('[FileCache] No existing cache, loading from database...');
        const db = (0, sqlite_1.getDatabase)();
        const clients = db.prepare('SELECT id, client_uuid, api_key, status, contract_end, name, module_rates FROM clients').all();
        if (!clients || clients.length === 0) {
            console.log('[FileCache] No clients found in database');
            return;
        }
        // Build index and cache files
        const newIndex = { apiKeyToUuid: {}, uuidToApiKey: {}, lastUpdated: new Date().toISOString() };
        for (const client of clients) {
            // Build full client state
            const apiKeys = await getClientApiKeysFromDb(client.id);
            const credentials = await getClientCredentialsFromDb(client.id);
            // Parse module_rates
            let moduleRates = {};
            if (client.module_rates) {
                try {
                    moduleRates = typeof client.module_rates === 'string'
                        ? JSON.parse(client.module_rates)
                        : client.module_rates;
                }
                catch (e) {
                    moduleRates = {};
                }
            }
            const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
            const state = {
                clientUuid: client.client_uuid,
                clientId: client.id,
                apiKey: client.api_key,
                status: client.status,
                contractEnd: client.contract_end,
                name: client.name,
                apiKeys,
                configuredModels: [], // Will be populated on demand
                moduleRates,
                supabaseUrl: credentials.supabase_url,
                supabaseAnonKey: credentials.supabase_anon_key,
                cachedAt: new Date().toISOString(),
                expiresAt
            };
            // Write cache file
            writeClientCache(state);
            // Update index
            newIndex.apiKeyToUuid[client.api_key] = client.client_uuid;
            newIndex.uuidToApiKey[client.client_uuid] = client.api_key;
        }
        writeIndex(newIndex);
        console.log(`[FileCache] Loaded ${clients.length} clients into cache`);
    }
    catch (err) {
        console.error('[FileCache] Failed to initialize cache:', err);
    }
}
// Get license from file cache
function getLicenseFromFileCache(apiKey) {
    const index = readIndex();
    const uuid = index.apiKeyToUuid[apiKey];
    if (!uuid) {
        console.log(`[FileCache] No cache entry found for API key: ${apiKey.substring(0, 8)}...`);
        return null;
    }
    const state = readClientCache(uuid);
    if (!state) {
        // Remove from index if cache file doesn't exist
        delete index.apiKeyToUuid[apiKey];
        delete index.uuidToApiKey[uuid];
        writeIndex(index);
        return null;
    }
    return state;
}
// Refresh specific client cache
async function refreshClientInFileCache(clientId, apiKey, clientUuid) {
    try {
        // If UUID not provided, fetch it from DB
        let uuid = clientUuid;
        let clientData;
        if (!uuid) {
            const db = (0, sqlite_1.getDatabase)();
            clientData = db.prepare('SELECT id, client_uuid, api_key, status, contract_end, name, module_rates FROM clients WHERE id = ?').get(clientId);
            if (!clientData) {
                console.log(`[FileCache] Client not found: ${clientId}`);
                return;
            }
            uuid = clientData.client_uuid;
        }
        // If still no UUID, generate one (shouldn't happen with proper schema)
        if (!uuid) {
            console.log(`[FileCache] Warning: No UUID for client ${clientId}, using ID as fallback`);
            uuid = `temp-${clientId}`;
        }
        // Fetch fresh client data if not already fetched
        if (!clientData) {
            const db = (0, sqlite_1.getDatabase)();
            clientData = db.prepare('SELECT id, client_uuid, api_key, status, contract_end, name, module_rates FROM clients WHERE id = ?').get(clientId);
            if (!clientData) {
                console.log(`[FileCache] Client not found: ${clientId}`);
                return;
            }
            uuid = clientData.client_uuid || uuid;
        }
        const apiKeys = await getClientApiKeysFromDb(clientId);
        const credentials = await getClientCredentialsFromDb(clientId);
        // Parse module_rates
        let moduleRates = {};
        if (clientData.module_rates) {
            try {
                moduleRates = typeof clientData.module_rates === 'string'
                    ? JSON.parse(clientData.module_rates)
                    : clientData.module_rates;
            }
            catch (e) {
                moduleRates = {};
            }
        }
        const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
        const state = {
            clientUuid: uuid,
            clientId: clientData.id,
            apiKey: clientData.api_key,
            status: clientData.status,
            contractEnd: clientData.contract_end,
            name: clientData.name,
            apiKeys,
            configuredModels: [],
            moduleRates,
            supabaseUrl: credentials.supabase_url,
            supabaseAnonKey: credentials.supabase_anon_key,
            cachedAt: new Date().toISOString(),
            expiresAt
        };
        writeClientCache(state);
        // Update index
        const index = readIndex();
        index.apiKeyToUuid[clientData.api_key] = uuid;
        index.uuidToApiKey[uuid] = clientData.api_key;
        writeIndex(index);
        console.log(`[FileCache] Refreshed cache for client: ${clientData.name} (${uuid})`);
    }
    catch (err) {
        console.error('[FileCache] Failed to refresh cache:', err);
    }
}
// Invalidate client cache
function invalidateClientInFileCache(apiKey) {
    const index = readIndex();
    const uuid = index.apiKeyToUuid[apiKey];
    if (uuid) {
        deleteClientCache(uuid);
        delete index.apiKeyToUuid[apiKey];
        delete index.uuidToApiKey[uuid];
        writeIndex(index);
    }
    console.log(`[FileCache] Invalidated cache for API key: ${apiKey.substring(0, 8)}...`);
}
// Get cache stats
function getFileCacheStats() {
    const index = readIndex();
    const files = fs.existsSync(CLIENTS_DIR)
        ? fs.readdirSync(CLIENTS_DIR).filter(f => f.endsWith('.json'))
        : [];
    return {
        totalClients: Object.keys(index.uuidToApiKey).length,
        cachedClients: files.length,
        cacheDir: CACHE_DIR,
        files
    };
}
// Get detailed cache info
function getFileCacheDetails() {
    const index = readIndex();
    const details = [];
    for (const [uuid, apiKey] of Object.entries(index.uuidToApiKey)) {
        const state = readClientCache(uuid);
        if (state) {
            details.push({
                uuid,
                apiKeyPrefix: apiKey.substring(0, 8) + '...',
                name: state.name,
                status: state.status || 'unknown',
                cachedAt: state.cachedAt,
                expiresAt: state.expiresAt,
                isExpired: Date.now() > new Date(state.expiresAt).getTime()
            });
        }
    }
    return details;
}
// Debug: Print cache contents
function printFileCacheContents() {
    console.log('\n========== FILE CACHE CONTENTS ==========');
    const index = readIndex();
    console.log('Index:', JSON.stringify(index, null, 2));
    const stats = getFileCacheStats();
    console.log('\nStats:', JSON.stringify(stats, null, 2));
    console.log('\nClient Cache Files:');
    for (const uuid of Object.keys(index.uuidToApiKey)) {
        const state = readClientCache(uuid);
        if (state) {
            console.log(`  ${state.name} (${uuid}):`);
            console.log(`    Status: ${state.status}`);
            console.log(`    Cached: ${state.cachedAt}`);
            console.log(`    Expires: ${state.expiresAt}`);
        }
    }
    console.log('=========================================\n');
}
