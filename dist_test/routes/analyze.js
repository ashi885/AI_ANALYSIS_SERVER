"use strict";
/**
 * SERVER AI ROUTES - Unified endpoint for analysis modules
 *
 * Adds /api/ai/analyze and /api/ai/module/:moduleName endpoints
 * that wrap the OpenRouter proxy with a simpler interface.
 *
 * NEW FILE - Add to existing ai.ts routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRouter = void 0;
const express_1 = require("express");
const license_1 = require("../middleware/license");
const db_mgmt_1 = require("../db-mgmt");
const openrouter_1 = require("../lib/ai/openrouter");
exports.analyzeRouter = (0, express_1.Router)();
// Configuration constants
const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
const PROMPT_TEMPLATES = {
    subtitles: {
        system: "You are an expert subtitle editor. Generate accurate SRT/VTT subtitles from the provided transcript.",
        userTemplate: "Generate subtitles for:\n\n{{transcript}}"
    },
    metadata: {
        system: "You are an expert media analyst. Extract metadata (title, description, tags, category) from media transcripts.",
        userTemplate: "Extract metadata from:\n\n{{transcript}}"
    },
    ad_breaks: {
        system: "You are an expert at identifying natural ad break points in media content. Analyze the transcript and identify optimal ad placement timestamps.",
        userTemplate: "Identify ad break points in:\n\n{{transcript}}"
    },
    promo_breaks: {
        system: "You are an expert at identifying promo-worthy segments in media content. Analyze the transcript for compelling moments worth promoting.",
        userTemplate: "Identify promo-worthy segments in:\n\n{{transcript}}"
    }
};
// Helper: Normalize transcript input to string
function normalizeTranscript(input) {
    if (typeof input === 'string')
        return input;
    if (Array.isArray(input))
        return input.join(' ');
    if (input === null || input === undefined)
        return '';
    return JSON.stringify(input);
}
function buildPromptParts(moduleName, transcript) {
    const template = PROMPT_TEMPLATES[moduleName];
    if (!template) {
        // Fallback for unknown modules
        return {
            system: "You are a helpful assistant analyzing media content.",
            user: `Analyze the following content:\n\n${transcript}`
        };
    }
    return {
        system: template.system,
        user: template.userTemplate.replace('{{transcript}}', transcript)
    };
}
// Helper: Log AI request with consistent structure
function logAIRequest(params) {
    (0, db_mgmt_1.logApiRequest)({
        clientId: params.clientId,
        provider: 'openrouter',
        endpoint: params.endpoint,
        direction: params.direction,
        requestMethod: params.direction === 'incoming' ? 'POST' : undefined,
        requestBody: params.direction === 'incoming' ? {
            moduleName: params.moduleName,
            model: params.model,
            transcriptLength: params.transcriptLength
        } : undefined,
        model: params.model,
        errorMessage: params.errorMessage,
        responseStatus: params.responseStatus,
        tokensUsed: params.tokensUsed,
        costUsd: params.costUsd,
        latencyMs: params.latencyMs,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
    });
}
// Unified analysis endpoint for all AI modules
exports.analyzeRouter.post('/analyze', license_1.licenseMiddleware, async (req, res) => {
    var _a;
    const startTime = Date.now();
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    try {
        const body = req.body;
        const customPrompt = body.prompt;
        const transcript = body.transcript;
        const model = body.model;
        const moduleName = body.moduleName;
        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }
        const transcriptStr = normalizeTranscript(transcript);
        // Log incoming request
        logAIRequest({
            clientId: clientId,
            endpoint: '/api/ai/analyze',
            direction: 'incoming',
            moduleName,
            model,
            transcriptLength: transcriptStr.length,
            latencyMs: 0,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        // Get client-specific API key
        const apiKey = await (0, db_mgmt_1.getClientApiKey)(clientId, 'openrouter');
        if (!apiKey) {
            logAIRequest({
                clientId: clientId,
                endpoint: '/api/ai/analyze',
                direction: 'outgoing',
                errorMessage: 'No OpenRouter API key configured',
                responseStatus: 500,
                latencyMs: Date.now() - startTime,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
            return res.status(500).json({ error: 'AI service not configured. Please contact administrator.' });
        }
        // Determine model - use provided, module config, or default
        let targetModel = model;
        if (!targetModel && moduleName) {
            const models = await (0, license_1.getClientModels)(clientId);
            const config = models.find(m => m.module_name === moduleName);
            targetModel = config === null || config === void 0 ? void 0 : config.api_model;
        }
        targetModel = targetModel || DEFAULT_MODEL;
        // Build messages with proper role separation
        const { system: systemContent, user: userContent } = moduleName && PROMPT_TEMPLATES[moduleName]
            ? buildPromptParts(moduleName, transcriptStr)
            : {
                system: customPrompt || "You are a helpful assistant.",
                user: transcriptStr
            };
        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent }
        ];
        const client = new openrouter_1.OpenRouterClient({ apiKey });
        const result = await client.completeWithRetry({
            messages,
            model: targetModel,
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS
        });
        // Log successful request
        const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        logAIRequest({
            clientId: clientId,
            endpoint: '/api/ai/analyze',
            direction: 'outgoing',
            model: targetModel,
            responseStatus: 200,
            tokensUsed: (usage.promptTokens || 0) + (usage.completionTokens || 0),
            costUsd: result.cost || 0,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        return res.json({
            content: result.content,
            usage: result.usage,
            cost: result.cost
        });
    }
    catch (error) {
        logAIRequest({
            clientId: clientId,
            endpoint: '/api/ai/analyze',
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: 500,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        console.error('[AI Analyze Error]', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// Module-specific endpoint for cleaner URLs
exports.analyzeRouter.post('/module/:moduleName', license_1.licenseMiddleware, async (req, res) => {
    var _a;
    const startTime = Date.now();
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const moduleName = req.params.moduleName;
    try {
        // Validate module name against allowed templates
        if (!PROMPT_TEMPLATES.hasOwnProperty(moduleName)) {
            return res.status(400).json({
                error: `Invalid module '${moduleName}'. Allowed: ${Object.keys(PROMPT_TEMPLATES).join(', ')}`
            });
        }
        const body = req.body;
        let transcript = body.transcript;
        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }
        const transcriptStr = normalizeTranscript(transcript);
        // Build structured prompt parts for this module
        const { system: systemContent, user: userContent } = buildPromptParts(moduleName, transcriptStr);
        // Get model from client config or use default
        const models = await (0, license_1.getClientModels)(clientId);
        const config = models.find(m => m.module_name === moduleName);
        const model = (config === null || config === void 0 ? void 0 : config.api_model) || DEFAULT_MODEL;
        // Get API key
        const apiKey = await (0, db_mgmt_1.getClientApiKey)(clientId, 'openrouter');
        if (!apiKey) {
            logAIRequest({
                clientId: clientId,
                endpoint: `/api/ai/module/${moduleName}`,
                direction: 'outgoing',
                errorMessage: 'No OpenRouter API key configured',
                responseStatus: 500,
                latencyMs: Date.now() - startTime,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
            return res.status(500).json({ error: 'AI service not configured. Please contact administrator.' });
        }
        const client = new openrouter_1.OpenRouterClient({ apiKey });
        const result = await client.completeWithRetry({
            messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: userContent }
            ],
            model: model,
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS
        });
        // Log successful request
        const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        logAIRequest({
            clientId: clientId,
            endpoint: `/api/ai/module/${moduleName}`,
            direction: 'outgoing',
            model: model,
            responseStatus: 200,
            tokensUsed: (usage.promptTokens || 0) + (usage.completionTokens || 0),
            costUsd: result.cost || 0,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        return res.json({
            content: result.content,
            usage: result.usage,
            cost: result.cost
        });
    }
    catch (error) {
        // Log error consistently
        logAIRequest({
            clientId: clientId,
            endpoint: `/api/ai/module/${moduleName}`,
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: 500,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        console.error(`[AI Module ${moduleName} Error]`, error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
