"use strict";
/**
 * @deprecated This file is kept for reference.
 *
 * IN-MEMORY LICENSE CACHE - COMMENTED OUT
 *
 * This approach was replaced with file-based caching in file-cache.ts
 * Reasons:
 * - Cache was lost on server restart
 * - No transparency/debugging capability
 * - Cache invalidation was unclear
 *
 * To re-enable this approach, uncomment all code below.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeLicenseCache = exports.getLicenseCacheDetails = exports.getLicenseCacheStats = exports.invalidateLicenseInCache = exports.refreshLicenseInCache = exports.getLicenseFromCache = void 0;
// /* ============== IN-MEMORY CACHE (COMMENTED OUT) ==============
// import { supabase } from './supabase';
// interface ClientLicenseState {
//     clientId: number;
//     apiKey: string;
//     status: string | null;
//     contractEnd: string | null;
//     name: string;
//     apiKeys: Array<{ provider: string; api_key: string; api_key_prefix: string; is_active: boolean }>;
//     configuredModels: Array<{ module_name: string; api_provider: string; api_model: string }>;
//     moduleRates: Record<string, any>;
//     loadedAt: number;
//     // Credentials for client app
//     supabaseUrl: string | null;
//     supabaseAnonKey: string | null;
// }
// const licenseCache = new Map<string, ClientLicenseState>();
// const CACHE_TTL = 15 * 60 * 1000;
// export async function initializeLicenseCache(): Promise<void> {
//     console.log('[LicenseCache] Initializing license cache from Supabase...');
//     try {
//         const { data: clients, error } = await supabase
//             .from('clients')
//             .select('id, api_key, status, contract_end, name, module_rates');
//         if (error) throw error;
//         if (!clients) {
//             console.log('[LicenseCache] No clients found');
//             return;
//         }
//         for (const client of clients) {
//             const apiKeys = await getClientApiKeysInternal(client.id);
//             const { data: models } = await supabase
//                 .from('client_models')
//                 .select('module_name, api_provider, api_model')
//                 .eq('client_id', client.id);
//             // Get credentials for client
//             const credentials = await getClientCredentialsInternal(client.id);
//             // Parse module_rates
//             let moduleRates: Record<string, any> = {};
//             if (client.module_rates) {
//                 try {
//                     moduleRates = typeof client.module_rates === 'string' ? JSON.parse(client.module_rates) : client.module_rates;
//                 } catch (e) {
//                     moduleRates = {};
//                 }
//             }
//             licenseCache.set(client.api_key, {
//                 clientId: client.id,
//                 apiKey: client.api_key,
//                 status: client.status,
//                 contractEnd: client.contract_end,
//                 name: client.name,
//                 apiKeys: apiKeys,
//                 configuredModels: models || [],
//                 moduleRates,
//                 loadedAt: Date.now(),
//                 supabaseUrl: credentials?.supabase_url || null,
//                 supabaseAnonKey: credentials?.supabase_anon_key || null
//             });
//         }
//         console.log(`[LicenseCache] Loaded ${licenseCache.size} client license states`);
//     } catch (err) {
//         console.error('[LicenseCache] Failed to initialize cache:', err);
//     }
// }
// async function getClientApiKeysInternal(clientId: number) {
//     // Need to decrypt the API keys
//     const { data: keys, error } = await supabase
//         .from('client_api_keys')
//         .select('provider, api_key_prefix, api_key, is_active')
//         .eq('client_id', clientId)
//         .eq('is_active', true);
//     if (error) {
//         console.log('[LicenseCache] Error fetching API keys:', error.message);
//     }
//     if (!keys || keys.length === 0) return [];
//     // Decrypt API keys
//     const decryptedKeys = await Promise.all(keys.map(async (k: any) => {
//         let actualKey = k.api_key_prefix; // fallback
//         try {
//             // Try to decrypt - if it's not encrypted, use as is
//             actualKey = k.api_key || k.api_key_prefix;
//         } catch (e) {
//             console.log('[LicenseCache] Key not encrypted, using prefix');
//         }
//         return {
//             provider: k.provider,
//             api_key: actualKey,
//             api_key_prefix: k.api_key_prefix,
//             is_active: k.is_active
//         };
//     }));
//     return decryptedKeys;
// }
// interface ClientCredentials {
//     supabase_url: string | null;
//     supabase_anon_key: string | null;
// }
// async function getClientCredentialsInternal(clientId: number): Promise<ClientCredentials | null> {
//     try {
//         const { data, error } = await supabase
//             .from('client_credentials')
//             .select('supabase_url, supabase_anon_key')
//             .eq('client_id', clientId)
//             .single();
//         if (error || !data) {
//             return null;
//         }
//         return {
//             supabase_url: data.supabase_url,
//             supabase_anon_key: data.supabase_anon_key
//         };
//     } catch (e) {
//         console.error('[LicenseCache] Error fetching credentials:', e);
//         return null;
//     }
// }
// export function getLicenseFromCache(apiKey: string): ClientLicenseState | null {
//     const cached = licenseCache.get(apiKey);
//     if (!cached) return null;
//     if (Date.now() - cached.loadedAt > CACHE_TTL) {
//         licenseCache.delete(apiKey);
//         return null;
//     }
//     return cached;
// }
// export async function refreshLicenseInCache(clientId: number, apiKey: string): Promise<void> {
//     try {
//         const { data: client } = await supabase
//             .from('clients')
//             .select('id, api_key, status, contract_end, name, module_rates')
//             .eq('id', clientId)
//             .single();
//         if (!client) return;
//         const apiKeys = await getClientApiKeysInternal(clientId);
//         const { data: models } = await supabase
//             .from('client_models')
//             .select('module_name, api_provider, api_model')
//             .eq('client_id', clientId);
//         // Get credentials for client
//         const credentials = await getClientCredentialsInternal(clientId);
//         // Parse module_rates
//         let moduleRates: Record<string, any> = {};
//         if (client.module_rates) {
//             try {
//                 moduleRates = typeof client.module_rates === 'string' ? JSON.parse(client.module_rates) : client.module_rates;
//             } catch (e) {
//                 moduleRates = {};
//             }
//         }
//         licenseCache.set(apiKey, {
//             clientId: client.id,
//             apiKey: client.api_key,
//             status: client.status,
//             contractEnd: client.contract_end,
//             name: client.name,
//             apiKeys: apiKeys,
//             configuredModels: models || [],
//             moduleRates,
//             loadedAt: Date.now(),
//             supabaseUrl: credentials?.supabase_url || null,
//             supabaseAnonKey: credentials?.supabase_anon_key || null
//         });
//         console.log(`[LicenseCache] Refreshed cache for client ${clientId}`);
//     } catch (err) {
//         console.error('[LicenseCache] Failed to refresh cache:', err);
//     }
// }
// export function invalidateLicenseInCache(apiKey: string): void {
//     licenseCache.delete(apiKey);
//     console.log(`[LicenseCache] Invalidated cache for API key ${apiKey.substring(0, 8)}...`);
// }
// export function getLicenseCacheStats() {
//     return {
//         size: licenseCache.size,
//         entries: Array.from(licenseCache.keys()).map(k => k.substring(0, 8) + '...')
//     };
// }
// export function getLicenseCacheDetails() {
//     const details: Array<{
//         apiKey: string;
//         clientId: number;
//         loadedAt: number;
//         cachedAt: string;
//         isExpired: boolean;
//     }> = [];
//     for (const [apiKey, state] of licenseCache.entries()) {
//         details.push({
//             apiKey,
//             clientId: state.clientId,
//             loadedAt: state.loadedAt,
//             cachedAt: new Date(state.loadedAt).toISOString(),
//             isExpired: Date.now() - state.loadedAt > CACHE_TTL
//         });
//     }
//     return details;
// }
// ============== END IN-MEMORY CACHE ============== */
// Re-export file cache functions for backwards compatibility
var file_cache_1 = require("./file-cache");
Object.defineProperty(exports, "getLicenseFromCache", { enumerable: true, get: function () { return file_cache_1.getLicenseFromFileCache; } });
Object.defineProperty(exports, "refreshLicenseInCache", { enumerable: true, get: function () { return file_cache_1.refreshClientInFileCache; } });
Object.defineProperty(exports, "invalidateLicenseInCache", { enumerable: true, get: function () { return file_cache_1.invalidateClientInFileCache; } });
Object.defineProperty(exports, "getLicenseCacheStats", { enumerable: true, get: function () { return file_cache_1.getFileCacheStats; } });
Object.defineProperty(exports, "getLicenseCacheDetails", { enumerable: true, get: function () { return file_cache_1.getFileCacheDetails; } });
Object.defineProperty(exports, "initializeLicenseCache", { enumerable: true, get: function () { return file_cache_1.initializeFileCache; } });
