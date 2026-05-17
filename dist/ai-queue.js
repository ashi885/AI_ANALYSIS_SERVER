"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeJobControllers = void 0;
exports.initQueueWorker = initQueueWorker;
exports.abortJob = abortJob;
exports.enqueueAIJob = enqueueAIJob;
exports.getAIJob = getAIJob;
const db_mgmt_1 = require("./db-mgmt");
const license_1 = require("./middleware/license");
const analyze_1 = require("./routes/analyze");
const utils_1 = require("./lib/ai/utils");
const openrouter_1 = require("./lib/ai/openrouter");
const job_processor_1 = require("./lib/ai/job-processor");
const crypto_1 = __importDefault(require("crypto"));
// Configuration constants (Default model now loaded dynamically from DB)
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
let workerInterval = null;
let isProcessing = false;
// Initialize the queue worker on server boot
async function initQueueWorker() {
    console.log('[AI Queue] Initializing AI Background Worker...');
    const db = (0, db_mgmt_1.getDatabase)();
    const isDev = process.env.NODE_ENV === 'development' || process.env.TS_NODE_DEV === 'true' || !process.env.NODE_ENV;
    if (isDev) {
        // Move stuck jobs to failed to protect balance from Nodemon/development restart loops
        const act = db.prepare(`
            UPDATE ai_job_queue 
            SET status = 'failed', error = 'Server restarted in development mode. Stopped execution to protect balance.' 
            WHERE status = 'processing'
        `).run();
        if (act.changes > 0) {
            console.log(`[AI Queue] [DEV-PROTECT] Marked ${act.changes} stuck sub-jobs as failed to prevent Nodemon infinite loops.`);
        }
        const actMain = db.prepare(`
            UPDATE ai_jobs 
            SET queue_status = 'failed', status = 'error', error_message = 'Server restarted in development mode. Stopped execution to protect balance.' 
            WHERE queue_status = 'processing'
        `).run();
        if (actMain.changes > 0) {
            console.log(`[AI Pipeline] [DEV-PROTECT] Marked ${actMain.changes} stuck main jobs as failed to prevent Nodemon infinite loops.`);
        }
    }
    else {
        // Safety check: Move any stuck jobs (processing during a crash) back to pending
        const act = db.prepare(`UPDATE ai_job_queue SET status = 'pending' WHERE status = 'processing'`).run();
        if (act.changes > 0) {
            console.log(`[AI Queue] Recovered ${act.changes} sub-jobs stuck in processing state.`);
        }
        const actMain = db.prepare(`UPDATE ai_jobs SET queue_status = 'pending' WHERE queue_status = 'processing'`).run();
        if (actMain.changes > 0) {
            console.log(`[AI Pipeline] Recovered ${actMain.changes} main jobs stuck in processing state.`);
        }
    }
    // Start background loop (polls every 3 seconds)
    workerInterval = setInterval(processQueue, 3000);
    setInterval(processMainPipeline, 5000);
}
// MAIN PIPELINE LOGIC (Fair-Share Concurrency)
const MAX_GLOBAL_CONCURRENT = 5;
const MAX_PER_CLIENT_CONCURRENT = 2;
exports.activeJobControllers = new Map();
let isPipelineProcessing = false;
function abortJob(jobId) {
    const controller = exports.activeJobControllers.get(jobId);
    if (controller) {
        controller.abort();
        exports.activeJobControllers.delete(jobId);
        return true;
    }
    return false;
}
async function processMainPipeline() {
    if (isPipelineProcessing)
        return;
    isPipelineProcessing = true;
    try {
        const db = (0, db_mgmt_1.getDatabase)();
        // 1. Check current running jobs
        const activeJobs = db.prepare(`SELECT client_id FROM ai_jobs WHERE queue_status = 'processing'`).all();
        if (activeJobs.length >= MAX_GLOBAL_CONCURRENT)
            return; // Full
        const activePerClient = activeJobs.reduce((acc, job) => {
            acc[job.client_id] = (acc[job.client_id] || 0) + 1;
            return acc;
        }, {});
        // 2. Get pending jobs, ordered by priority DESC, then oldest first
        const pendingJobs = db.prepare(`SELECT * FROM ai_jobs WHERE queue_status = 'pending' ORDER BY priority DESC, created_at ASC`).all();
        for (const job of pendingJobs) {
            if (activeJobs.length >= MAX_GLOBAL_CONCURRENT)
                break;
            if ((activePerClient[job.client_id] || 0) >= MAX_PER_CLIENT_CONCURRENT)
                continue;
            // Start this job
            db.prepare(`UPDATE ai_jobs SET queue_status = 'processing', sub_status = 'Initializing pipeline', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
            activeJobs.push(job);
            activePerClient[job.client_id] = (activePerClient[job.client_id] || 0) + 1;
            const abortController = new AbortController();
            exports.activeJobControllers.set(job.id, abortController);
            const clientInfo = db.prepare(`SELECT name FROM clients WHERE id = ?`).get(job.client_id);
            const clientName = (clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.name) || 'Unknown';
            const modulesRequested = JSON.parse(job.modules_requested);
            const targetLanguages = job.target_languages ? JSON.parse(job.target_languages) : undefined;
            console.log(`[AI Pipeline] Launching Job ${job.id} for client ${clientName}`);
            // Fire and forget the main pipeline
            (0, job_processor_1.processAiJob)(job.id, job.audio_path, modulesRequested, job.client_id, clientName, job.file_duration, targetLanguages, abortController.signal).then(() => {
                db.prepare(`UPDATE ai_jobs SET queue_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND queue_status != 'failed'`).run(job.id);
            }).catch(err => {
                if (err.name === 'AbortError' || err.message === 'AbortError') {
                    db.prepare(`UPDATE ai_jobs SET queue_status = 'failed', status = 'error', error_message = 'Job was manually aborted by support staff', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
                }
                else {
                    db.prepare(`UPDATE ai_jobs SET queue_status = 'failed', status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(err.message, job.id);
                }
            }).finally(() => {
                exports.activeJobControllers.delete(job.id);
                setImmediate(processMainPipeline); // Trigger next immediately
            });
        }
    }
    catch (err) {
        console.error('[AI Pipeline] Error in worker loop:', err.message);
    }
    finally {
        isPipelineProcessing = false;
    }
}
// Enqueue a new async job
async function enqueueAIJob(clientId, moduleName, payload) {
    const db = (0, db_mgmt_1.getDatabase)();
    const jobId = `job_${crypto_1.default.randomUUID().replace(/-/g, '')}`;
    db.prepare(`
        INSERT INTO ai_job_queue (id, client_id, module_name, payload, status)
        VALUES (?, ?, ?, ?, 'pending')
    `).run(jobId, clientId, moduleName, JSON.stringify(payload));
    return jobId;
}
// Retrieve job status
function getAIJob(id) {
    const db = (0, db_mgmt_1.getDatabase)();
    const row = db.prepare(`SELECT * FROM ai_job_queue WHERE id = ?`).get(id);
    if (!row)
        return null;
    return Object.assign(Object.assign({}, row), { payload: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null, error: row.error ? JSON.parse(row.error) : null });
}
// The core worker loop
async function processQueue() {
    if (isProcessing)
        return; // Prevent overlapping runs
    const db = (0, db_mgmt_1.getDatabase)();
    const nextJob = db.prepare(`SELECT * FROM ai_job_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`).get();
    if (!nextJob)
        return;
    isProcessing = true;
    try {
        // Mark as processing
        db.prepare(`UPDATE ai_job_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(nextJob.id);
        console.log(`[AI Queue] Processing job ${nextJob.id} for module ${nextJob.module_name}`);
        const payload = JSON.parse(nextJob.payload);
        const result = await runAILogic(nextJob.client_id, nextJob.module_name, payload, nextJob.id);
        // Mark as completed - store both billed and provider costs for internal auditing
        db.prepare(`
            UPDATE ai_job_queue 
            SET status = 'completed', 
                sub_status = 'Success',
                result = ?, 
                billed_cost = ?,
                provider_cost = ?,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(JSON.stringify(result), result.cost || 0, result.provider_cost || 0, nextJob.id);
        // SYNC COST TO PARENT JOB: If this sub-task is part of a larger job, update the parent's total cost
        if (payload.jobId) {
            try {
                // Sum up all billed_cost from ai_job_queue for this parent_job_id
                // Note: We might also want to include the initial cost from job-processor.ts if it exists.
                // For now, let's assume we want to keep ai_jobs.total_cost_usd in sync with the actuals.
                const parentId = payload.jobId;
                // 1. Get current result_data from parent to see if it has internal costs (from job-processor.ts)
                const parentJob = db.prepare('SELECT result_data FROM ai_jobs WHERE id = ?').get(parentId);
                let baseBilledCost = 0;
                let baseProviderCost = 0;
                if (parentJob === null || parentJob === void 0 ? void 0 : parentJob.result_data) {
                    const results = JSON.parse(parentJob.result_data);
                    baseBilledCost = results.reduce((sum, r) => sum + (r.apiCost || 0), 0);
                    baseProviderCost = results.reduce((sum, r) => sum + (r.providerCost || 0), 0);
                }
                // 2. Add costs from all ASYNC sub-tasks in ai_job_queue that are linked to this parent
                const queueCosts = db.prepare(`
                    SELECT SUM(billed_cost) as total_billed, SUM(provider_cost) as total_provider
                    FROM ai_job_queue 
                    WHERE status = 'completed' AND json_extract(payload, '$.jobId') = ?
                `).get(parentId);
                const finalBilledTotal = baseBilledCost + ((queueCosts === null || queueCosts === void 0 ? void 0 : queueCosts.total_billed) || 0);
                const finalProviderTotal = baseProviderCost + ((queueCosts === null || queueCosts === void 0 ? void 0 : queueCosts.total_provider) || 0);
                db.prepare('UPDATE ai_jobs SET total_cost_usd = ?, provider_cost_usd = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(finalBilledTotal, finalProviderTotal, parentId);
                console.log(`[AI Queue] Synced parent job ${parentId}: Billed=$${finalBilledTotal.toFixed(3)}, Provider=$${finalProviderTotal.toFixed(4)}`);
            }
            catch (syncErr) {
                console.error(`[AI Queue] Failed to sync cost to parent job:`, syncErr.message);
            }
        }
    }
    catch (err) {
        console.error(`[AI Queue] Job ${nextJob.id} failed:`, err.message);
        // Mark as failed - sanitize error for client view
        const sanitized = (0, utils_1.sanitizeAIError)(err.message || 'Unknown queue error');
        db.prepare(`UPDATE ai_job_queue SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(JSON.stringify({ message: sanitized }), nextJob.id);
    }
    finally {
        isProcessing = false;
        // Immediately try processing the next one in the queue
        setImmediate(processQueue);
    }
}
// Pulled logic from analyze.ts
async function runAILogic(clientId, moduleName, payload, queueJobId) {
    var _a, _b, _c;
    const startTime = Date.now();
    const customPrompt = payload.prompt;
    const rawTranscript = payload.transcript;
    const transcriptStr = typeof rawTranscript === 'string' ? rawTranscript :
        Array.isArray(rawTranscript) ? rawTranscript.join(' ') :
            rawTranscript ? JSON.stringify(rawTranscript) : '';
    if (!transcriptStr) {
        throw new Error('Transcript is required');
    }
    // Get API key
    const apiKey = await (0, db_mgmt_1.getClientApiKey)(clientId, 'openrouter');
    if (!apiKey)
        throw new Error('AI service not configured. No OpenRouter API key.');
    // --- CREDIT SYSTEM CHECK ---
    const db = (0, db_mgmt_1.getDatabase)();
    const clientInfo = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    const billingType = (clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.billing_type) || 'PER_REQUEST';
    // Support for duration-based tiered pricing in async jobs
    const duration = Number(payload.duration) || 0;
    const pricing = await (0, db_mgmt_1.getModulePricing)(clientId, moduleName, duration);
    const moduleCost = (pricing === null || pricing === void 0 ? void 0 : pricing.cost_per_job) || 0;
    if (billingType === 'CREDIT' && ((clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.credits) || 0) < moduleCost) {
        db.prepare(`UPDATE ai_job_queue SET sub_status = 'Insufficient Credits', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(queueJobId);
        throw new Error('Insufficient credits. Please top up your account.');
    }
    db.prepare(`UPDATE ai_job_queue SET sub_status = 'Initializing AI models...', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(queueJobId);
    // Determine model
    let targetModel = payload.model;
    if (!targetModel && moduleName) {
        const models = await (0, license_1.getClientModels)(clientId);
        const config = models.find((m) => m.module_name === moduleName);
        targetModel = config === null || config === void 0 ? void 0 : config.api_model;
    }
    targetModel = targetModel || await (0, db_mgmt_1.getGlobalDefaultModel)();
    if (!targetModel) {
        throw new Error('No AI model configured for this module and no global fallback set.');
    }
    const aiClient = new openrouter_1.OpenRouterClient({ apiKey });
    // Special handling for Subtitle Translation (supports multiple languages)
    if (moduleName === 'subtitle_translation') {
        const rawLangs = payload.target_language || 'es';
        const languages = Array.isArray(rawLangs)
            ? rawLangs
            : (typeof rawLangs === 'string' ? rawLangs.split(',').map(l => l.trim()) : [rawLangs]);
        const translationResults = [];
        for (const lang of languages) {
            db.prepare(`UPDATE ai_job_queue SET sub_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(`Translating to ${lang}...`, queueJobId);
            const { system, user } = (0, analyze_1.buildPromptParts)(moduleName, transcriptStr, Object.assign(Object.assign({}, payload), { target_language: lang }));
            const suffixedModuleName = `subtitle_translation-${lang.toLowerCase()}`;
            let result;
            try {
                result = await aiClient.completeWithRetry({
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                    model: targetModel, temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS
                });
            }
            catch (err) {
                const latency = Date.now() - startTime;
                let statusCode = 500;
                const statusMatch = (_a = err.message) === null || _a === void 0 ? void 0 : _a.match(/\b(400|401|403|429|500|503)\b/);
                if (statusMatch) {
                    statusCode = parseInt(statusMatch[1]);
                }
                await (0, db_mgmt_1.logApiRequest)({
                    clientId, provider: 'openrouter', endpoint: `/api/ai/job/${suffixedModuleName}`,
                    model: targetModel, direction: 'outgoing', responseStatus: statusCode, latencyMs: latency,
                    requestId: 'err_' + Date.now(), parentJobId: payload.jobId, billedCost: 0,
                    costUsd: 0, tokensUsed: 0, errorMessage: err.message,
                    requestBody: { system, user }, responseBody: { error: err.message }
                });
                throw err;
            }
            const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            const requestId = result.id || `req_${Date.now()}`;
            // Log usage for each language
            await (0, db_mgmt_1.logClientUsage)({
                clientId, jobId: payload.jobId, userId: payload.userId,
                moduleName: suffixedModuleName, provider: 'openrouter',
                model: targetModel, status: 'success', costUsd: translationResults.length === 0 ? moduleCost : 0,
                actualCostUsd: result.cost || 0, tokensUsed: usage.totalTokens, latencyMs: Date.now() - startTime,
                requestId,
                durationSeconds: duration
            });
            // Log API request for visibility in Job Queue details UI
            await (0, db_mgmt_1.logApiRequest)({
                clientId, provider: 'openrouter', endpoint: `/api/ai/job/${suffixedModuleName}`,
                model: targetModel, direction: 'outgoing', responseStatus: 200, latencyMs: Date.now() - startTime,
                requestId, parentJobId: payload.jobId, billedCost: translationResults.length === 0 ? moduleCost : 0,
                costUsd: result.cost || 0, tokensUsed: usage.totalTokens
            });
            // Parse and format
            let parsed;
            try {
                parsed = JSON.parse(result.content.trim());
            }
            catch ( /* extraction logic as before if needed */_d) { /* extraction logic as before if needed */ }
            const translatedSegments = (parsed === null || parsed === void 0 ? void 0 : parsed.segments) || (Array.isArray(parsed) ? parsed : []);
            translationResults.push({
                moduleName: 'subtitle_translation',
                resultType: `subtitle_${lang.toLowerCase()}`,
                resultData: {
                    language: lang,
                    segments: translatedSegments,
                    srt: formatAsSRT(translatedSegments),
                    vtt: formatAsVTT(translatedSegments)
                },
                content: result.content, // Backward compatibility
                requestId
            });
        }
        return {
            isMultiResult: true,
            results: translationResults,
            cost: moduleCost,
            provider_cost: translationResults.reduce((sum, r) => sum + (r.provider_cost || 0), 0)
        };
    }
    const { system: systemContent, user: userContent } = (0, analyze_1.buildPromptParts)(moduleName, transcriptStr, payload);
    db.prepare(`UPDATE ai_job_queue SET sub_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run('Processing analysis...', queueJobId);
    let result;
    try {
        result = await aiClient.completeWithRetry({
            messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: userContent }
            ],
            model: targetModel,
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS
        });
    }
    catch (err) {
        const latency = Date.now() - startTime;
        let statusCode = 500;
        const statusMatch = (_b = err.message) === null || _b === void 0 ? void 0 : _b.match(/\b(400|401|403|429|500|503)\b/);
        if (statusMatch) {
            statusCode = parseInt(statusMatch[1]);
        }
        await (0, db_mgmt_1.logApiRequest)({
            clientId, provider: 'openrouter', endpoint: `/api/ai/job/${moduleName}`,
            model: targetModel, direction: 'outgoing', responseStatus: statusCode, latencyMs: latency,
            requestId: 'err_' + Date.now(), parentJobId: payload.jobId, billedCost: 0,
            costUsd: 0, tokensUsed: 0, errorMessage: err.message,
            requestBody: { system: systemContent, user: userContent }, responseBody: { error: err.message }
        });
        throw err;
    }
    const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const requestId = result.id || `req_${Date.now()}`;
    // Log outgoing request (Audit trail)
    await (0, db_mgmt_1.logApiRequest)({
        clientId: clientId,
        provider: 'openrouter',
        endpoint: `/api/ai/job/${moduleName}`,
        model: targetModel,
        direction: 'outgoing',
        responseStatus: 200,
        latencyMs: Date.now() - startTime,
        requestId: requestId,
        parentJobId: payload.jobId,
        billedCost: moduleCost,
        costUsd: result.cost || 0,
        tokensUsed: usage.totalTokens || (usage.promptTokens + usage.completionTokens) || 0,
        requestBody: { system: systemContent, user: userContent },
        responseBody: { content: (_c = result.content) === null || _c === void 0 ? void 0 : _c.substring(0, 50000) }
    });
    // --- LOG BILLING USAGE ---
    await (0, db_mgmt_1.logClientUsage)({
        clientId: clientId,
        jobId: payload.jobId || undefined,
        userId: payload.userId || undefined,
        moduleName: moduleName,
        provider: 'openrouter',
        model: targetModel,
        status: 'success',
        costUsd: moduleCost,
        actualCostUsd: result.cost || 0,
        tokensUsed: usage.totalTokens || (usage.promptTokens + usage.completionTokens) || 0,
        latencyMs: Date.now() - startTime,
        requestId: requestId,
        durationSeconds: duration
    });
    db.prepare(`UPDATE ai_job_queue SET sub_status = 'Finalizing results', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(queueJobId);
    // --- CREDIT DEDUCTION ---
    let lowCreditWarning = null;
    if (billingType === 'CREDIT' && moduleCost > 0) {
        const deduction = await (0, db_mgmt_1.deductCredits)(clientId, moduleCost, `Execution of module: ${moduleName} (Async)`, payload.jobId);
        if (deduction.success && deduction.balance !== undefined && deduction.balance < 5.0) {
            lowCreditWarning = `Low credit balance: $${deduction.balance.toFixed(2)}. Please top up soon.`;
        }
    }
    // Return final result layout for the client (Removing targetModel to prevent client-side leak)
    return {
        content: result.content,
        usage: result.usage,
        cost: moduleCost,
        provider_cost: result.cost || 0,
        requestId: requestId,
        warning: lowCreditWarning
    };
}
// Subtitle Formatting Helpers
function formatTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
function formatAsSRT(segments) {
    if (!Array.isArray(segments))
        return '';
    return segments.map((s, i) => {
        return `${i + 1}\n${formatTimestamp(s.start)} --> ${formatTimestamp(s.end)}\n${s.text}\n`;
    }).join('\n');
}
function formatAsVTT(segments) {
    if (!Array.isArray(segments))
        return '';
    return 'WEBVTT\n\n' + segments.map((s, i) => {
        return `${formatTimestamp(s.start).replace(',', '.')} --> ${formatTimestamp(s.end).replace(',', '.')}\n${s.text}\n`;
    }).join('\n');
}
