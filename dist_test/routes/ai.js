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
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});
exports.aiRouter = (0, express_1.Router)();
// Proxy Whisper
exports.aiRouter.post('/whisper', license_1.licenseMiddleware, upload.single('audio'), async (req, res) => {
    var _a, _b;
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
        // Make the actual transcription call
        const result = await client.transcribeWithRetry(file.path);
        // Log successful outgoing request
        (0, db_mgmt_1.logApiRequest)({
            clientId: clientId,
            provider: 'whisper',
            endpoint: 'openai.audio.transcriptions',
            model: model,
            direction: 'outgoing',
            responseStatus: 200,
            responseBody: { text: result.text, segments: result.segments.length, duration: result.duration },
            tokensUsed: Math.ceil(result.duration / 60 * 150), // Estimated tokens
            costUsd: result.cost,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        logger_1.logger.ai('WHISPER_SUCCESS', `Transcription complete`, {
            clientId,
            clientName,
            durationMs: Date.now() - startTime,
            cost: result.cost,
            details: { duration: result.duration, segments: result.segments.length }
        });
        return res.json(result);
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
        const result = await client.completeWithRetry({
            messages,
            model: config.api_model,
            temperature,
            maxTokens
        });
        const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
        logger_1.logger.ai('OPENROUTER_SUCCESS', `Analysis complete for ${moduleName}`, {
            clientId,
            clientName,
            durationMs: Date.now() - startTime,
            cost: result.cost,
            details: { model: config.api_model, tokens: usage.totalTokens }
        });
        return res.json(result);
    }
    catch (error) {
        logger_1.logger.error('AI', 'OPENROUTER_ERROR', `OpenRouter failed: ${error.message}`, error.stack, { clientId, clientName });
        return res.status(500).json({ error: error.message });
    }
});
