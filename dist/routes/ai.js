"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const whisper_1 = require("../lib/ai/whisper");
const openrouter_1 = require("../lib/ai/openrouter");
const license_1 = require("../middleware/license");
const db_mgmt_1 = require("../db-mgmt");
const logger_1 = require("../logger");
const job_processor_1 = require("../lib/ai/job-processor");
const crypto_1 = __importDefault(require("crypto"));
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});
exports.aiRouter = (0, express_1.Router)();
// Proxy Whisper
exports.aiRouter.post('/whisper', license_1.licenseMiddleware, upload.single('audio'), async (req, res) => {
    var _a, _b, _c, _d;
    const startTime = Date.now();
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const clientName = (_b = req.client) === null || _b === void 0 ? void 0 : _b.name;
    logger_1.logger.info('AI', 'WHISPER_REQUEST', `Whisper transcription request from ${clientName}`, {
        clientId,
        clientName,
        hasFile: !!req.file
    });
    try {
        const file = req.file;
        const moduleName = req.header('X-Module-Name') || 'transcription';
        if (!file) {
            logger_1.logger.warn('AI', 'WHISPER_NO_FILE', 'No audio file provided', { clientId });
            return res.status(400).json({ error: 'No audio file provided' });
        }
        // Get client-specific API key
        const apiKey = await (0, db_mgmt_1.getClientApiKey)(clientId, 'openai');
        logger_1.logger.info('AI', 'WHISPER_API_KEY', `API key retrieved for client`, {
            clientId,
            hasKey: !!apiKey,
            keyPrefix: apiKey === null || apiKey === void 0 ? void 0 : apiKey.substring(0, 10)
        });
        if (!apiKey) {
            logger_1.logger.error('AI', 'WHISPER_NO_KEY', 'No OpenAI API key configured', undefined, { clientId });
            return res.status(500).json({ error: 'OpenAI API key not configured for this client. Please contact administrator.' });
        }
        // Lookup configured model for this client and module
        const models = await (0, license_1.getClientModels)(clientId);
        const config = models.find(m => m.module_name === moduleName);
        const model = (config === null || config === void 0 ? void 0 : config.api_model) || 'whisper-1';
        const client = new whisper_1.WhisperClient({ apiKey, model });
        // Log outgoing request to provider
        logger_1.logger.info('AI', 'WHISPER_PROV_REQ', `Sending audio to OpenAI Whisper`, {
            clientId,
            clientName,
            model,
            filePath: file.path,
            fileSize: file.size
        });
        // Make the actual transcription call
        const result = await client.transcribeWithRetry(file.path);
        // Log response from provider
        logger_1.logger.info('AI', 'WHISPER_PROV_RES', `Received response from OpenAI Whisper`, {
            clientId,
            clientName,
            durationMs: Date.now() - startTime,
            textLength: (_c = result.text) === null || _c === void 0 ? void 0 : _c.length,
            segmentsCount: (_d = result.segments) === null || _d === void 0 ? void 0 : _d.length,
            providerCost: result.cost
        });
        // Centralized Billing Lookup
        const duration = req.body.duration ? parseFloat(String(req.body.duration)) : result.duration;
        const pricing = await (0, db_mgmt_1.getModulePricing)(clientId, moduleName, duration);
        const moduleCost = (pricing === null || pricing === void 0 ? void 0 : pricing.cost_per_job) || 0;
        const jobId = (req.body.jobId || req.body.local_job_id || null);
        const userId = (req.body.user_id || req.body.userId || null);
        const requestId = result.requestId || `whisper_${Date.now()}`;
        // Log successful outgoing request (Audit trail)
        (0, db_mgmt_1.logApiRequest)({
            clientId: clientId,
            provider: 'whisper',
            endpoint: 'openai.audio.transcriptions',
            model: model,
            direction: 'outgoing',
            responseStatus: 200,
            responseBody: { segments: result.segments.length, duration: result.duration },
            tokensUsed: Math.ceil(result.duration / 60 * 150), // Estimated tokens
            costUsd: result.cost,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requestId: requestId
        });
        // --- NEW: LOG BILLING USAGE (Source of Truth) ---
        await (0, db_mgmt_1.logClientUsage)({
            clientId: clientId,
            jobId: jobId || undefined,
            userId: userId || undefined,
            moduleName: moduleName,
            provider: 'whisper',
            model: model,
            status: 'success',
            costUsd: moduleCost, // The centralized server price
            actualCostUsd: result.cost || 0, // The raw provider cost
            tokensUsed: Math.ceil(result.duration / 60 * 150),
            latencyMs: Date.now() - startTime,
            requestId: requestId
        });
        logger_1.logger.ai('WHISPER_SUCCESS', `Transcription complete`, {
            clientId,
            clientName,
            requestId,
            durationMs: Date.now() - startTime,
            cost: moduleCost,
            details: { duration: result.duration, segments: result.segments.length }
        });
        return res.json(Object.assign(Object.assign({}, result), { cost: moduleCost, requestId: requestId }));
    }
    catch (error) {
        logger_1.logger.error('AI', 'WHISPER_ERROR', `Transcription failed: ${error.message}`, error.stack, { clientId, clientName });
        (0, db_mgmt_1.logApiRequest)({
            clientId: clientId,
            provider: 'whisper',
            endpoint: '/api/ai/whisper',
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: 500,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        console.error('[Whisper Proxy Error]', error.message);
        return res.status(500).json({ error: error.message });
    }
});
// Proxy OpenRouter
exports.aiRouter.post('/openrouter', license_1.licenseMiddleware, async (req, res) => {
    var _a, _b;
    const startTime = Date.now();
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const clientName = (_b = req.client) === null || _b === void 0 ? void 0 : _b.name;
    try {
        const { messages, temperature, maxTokens } = req.body;
        const moduleName = req.header('X-Module-Name') || 'unknown';
        logger_1.logger.info('AI', 'OPENROUTER_REQUEST', `OpenRouter request for module ${moduleName}`, {
            clientId,
            clientName,
            moduleName
        });
        // Get client-specific API key
        const apiKey = await (0, db_mgmt_1.getClientApiKey)(clientId, 'openrouter');
        if (!apiKey) {
            logger_1.logger.error('AI', 'OPENROUTER_NO_KEY', 'No OpenRouter API key configured', undefined, { clientId, moduleName });
            return res.status(500).json({ error: 'OpenRouter API key not configured for this client. Please contact administrator.' });
        }
        // Lookup configured model for this client and module
        const models = await (0, license_1.getClientModels)(clientId);
        const config = models.find(m => m.module_name === moduleName);
        if (!config) {
            logger_1.logger.warn('AI', 'OPENROUTER_NO_CONFIG', `Module ${moduleName} not configured`, { clientId });
            return res.status(400).json({ error: `Module ${moduleName} not configured for this client` });
        }
        const client = new openrouter_1.OpenRouterClient({ apiKey });
        // Log outgoing request to provider
        logger_1.logger.info('AI', 'OPENROUTER_PROV_REQ', `Sending prompt to OpenRouter`, {
            clientId,
            clientName,
            moduleName,
            model: config.api_model,
            messagesCount: messages === null || messages === void 0 ? void 0 : messages.length,
            temperature,
            maxTokens
        });
        const result = await client.completeWithRetry({
            messages,
            model: config.api_model,
            temperature,
            maxTokens
        });
        const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        // Centralized Billing Lookup
        const duration = req.body.duration ? parseFloat(String(req.body.duration)) : undefined;
        const pricing = await (0, db_mgmt_1.getModulePricing)(clientId, moduleName, duration);
        const moduleCost = (pricing === null || pricing === void 0 ? void 0 : pricing.cost_per_job) || 0;
        const jobId = (req.body.jobId || req.body.local_job_id || null);
        const userId = (req.body.userId || req.body.user_id || null);
        const requestId = result.id || `openrouter_${Date.now()}`;
        // Log Audit trail
        (0, db_mgmt_1.logApiRequest)({
            clientId: clientId,
            provider: 'openrouter',
            endpoint: '/api/ai/openrouter',
            direction: 'outgoing',
            model: config.api_model,
            responseStatus: 200,
            tokensUsed: usage.totalTokens,
            costUsd: result.cost || 0,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requestId: requestId
        });
        // --- NEW: LOG BILLING USAGE (Source of Truth) ---
        await (0, db_mgmt_1.logClientUsage)({
            clientId: clientId,
            jobId: jobId || undefined,
            userId: userId || undefined,
            moduleName: moduleName,
            provider: 'openrouter',
            model: config.api_model,
            status: 'success',
            costUsd: moduleCost, // The centralized server price
            actualCostUsd: result.cost || 0, // The raw provider cost
            tokensUsed: usage.totalTokens,
            latencyMs: Date.now() - startTime,
            requestId: requestId
        });
        logger_1.logger.ai('OPENROUTER_SUCCESS', `Analysis complete for ${moduleName}`, {
            clientId,
            clientName,
            requestId,
            durationMs: Date.now() - startTime,
            cost: moduleCost,
            details: { model: config.api_model, tokens: usage.totalTokens }
        });
        return res.json(Object.assign(Object.assign({}, result), { cost: moduleCost, requestId: requestId }));
    }
    catch (error) {
        logger_1.logger.error('AI', 'OPENROUTER_ERROR', `OpenRouter failed: ${error.message}`, error.stack, { clientId, clientName });
        return res.status(500).json({ error: error.message });
    }
});
// Submit parallel AI job
exports.aiRouter.post('/job', license_1.licenseMiddleware, upload.single('audio'), async (req, res) => {
    var _a, _b;
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const clientName = (_b = req.client) === null || _b === void 0 ? void 0 : _b.name;
    try {
        const file = req.file;
        const modulesRaw = req.body.modules;
        if (!file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }
        let modulesRequested = [];
        try {
            modulesRequested = JSON.parse(modulesRaw);
        }
        catch (_c) {
            return res.status(400).json({ error: 'Invalid modules payload. Must be a JSON array of strings.' });
        }
        if (!Array.isArray(modulesRequested) || modulesRequested.length === 0) {
            return res.status(400).json({ error: 'Modules list cannot be empty' });
        }
        const jobId = crypto_1.default.randomUUID();
        const db = (0, db_mgmt_1.getDatabase)();
        // Accept optional tracing fields from the client
        const localJobId = req.body.local_job_id || null;
        const userId = req.body.user_id ? parseInt(req.body.user_id, 10) : null;
        const targetLanguagesRaw = req.body.target_languages || null;
        let targetLanguages = null;
        logger_1.logger.info('AI', 'JOB_INGESTION', `Incoming payload for job ${jobId}`, {
            localJobId,
            userId,
            modulesCount: modulesRequested.length,
            targetLanguagesRaw,
            body: req.body // Log full body for deep debugging
        });
        if (targetLanguagesRaw) {
            try {
                targetLanguages = typeof targetLanguagesRaw === 'string' ? JSON.parse(targetLanguagesRaw) : targetLanguagesRaw;
                logger_1.logger.info('AI', 'JOB_LANGS_PARSED', `Parsed target languages for job ${jobId}`, { targetLanguages });
            }
            catch (e) {
                logger_1.logger.warn('AI', 'JOB_SUBMIT_LANG_PARSE_ERROR', 'Failed to parse target_languages', { jobId, targetLanguagesRaw });
            }
        }
        db.prepare(`
            INSERT INTO ai_jobs (id, client_id, user_id, local_job_id, status, modules_requested, target_languages, audio_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(jobId, clientId, userId, localJobId, 'processing', JSON.stringify(modulesRequested), targetLanguages ? JSON.stringify(targetLanguages) : null, file.path);
        logger_1.logger.info('AI', 'JOB_SUBMITTED', `Parallel AI job ${jobId} submitted`, { clientId, userId, localJobId, modulesRequested, targetLanguages });
        const duration = req.body.duration ? parseFloat(String(req.body.duration)) : null;
        // Fire and forget
        (0, job_processor_1.processAiJob)(jobId, file.path, modulesRequested, clientId, clientName || 'Unknown', duration, targetLanguages || undefined).catch(err => {
            logger_1.logger.error('AI', 'JOB_PROCESSOR_CRASH', `Job processor crashed: ${err.message}`, err.stack, { jobId });
        });
        return res.json({ jobId });
    }
    catch (error) {
        logger_1.logger.error('AI', 'JOB_SUBMIT_ERROR', `Failed to submit job: ${error.message}`, error.stack, { clientId });
        return res.status(500).json({ error: error.message });
    }
});
// Get job status
exports.aiRouter.get('/job/:id', license_1.licenseMiddleware, async (req, res) => {
    var _a;
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const jobId = req.params.id;
    try {
        const db = (0, db_mgmt_1.getDatabase)();
        const job = db.prepare('SELECT * FROM ai_jobs WHERE id = ? AND client_id = ?').get(jobId, clientId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        return res.json({
            id: job.id,
            status: job.status,
            modules_requested: JSON.parse(job.modules_requested),
            result_data: job.result_data ? JSON.parse(job.result_data) : null,
            total_cost_usd: job.total_cost_usd,
            error_message: job.error_message,
            created_at: job.created_at,
            updated_at: job.updated_at
        });
    }
    catch (error) {
        logger_1.logger.error('AI', 'JOB_STATUS_ERROR', `Failed to get job status: ${error.message}`, error.stack, { clientId, jobId });
        return res.status(500).json({ error: error.message });
    }
});
