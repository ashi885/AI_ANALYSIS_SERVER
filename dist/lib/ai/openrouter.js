"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterClient = void 0;
exports.getOpenRouterModels = getOpenRouterModels;
const openai_1 = __importDefault(require("openai"));
async function getOpenRouterModels(apiKey) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://cuepoint.production',
                'X-Title': 'Cuepoint AI Analysis'
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`);
        }
        const data = await response.json();
        const models = data.data || [];
        // Filter to popular models and format them
        const popularProviders = ['anthropic', 'openai', 'google', 'meta', 'mistralai'];
        return models
            .filter((m) => {
            // Filter to well-known providers and chat models
            const provider = m.id.split('/')[0];
            return popularProviders.includes(provider) && m.id.includes('chat');
        })
            .slice(0, 50) // Limit to 50 models
            .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            provider: m.id.split('/')[0]
        }));
    }
    catch (error) {
        console.error('[OpenRouter] Failed to fetch models:', error.message);
        return [];
    }
}
class OpenRouterClient {
    constructor(config) {
        this.client = new openai_1.default({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
            defaultHeaders: {
                'HTTP-Referer': 'https://cuepoint.production',
                'X-Title': 'Cuepoint AI Analysis'
            }
        });
        this.defaultModel = (config === null || config === void 0 ? void 0 : config.api_model) || config.model || 'anthropic/claude-3.5-sonnet';
    }
    async complete(request) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        try {
            const response = await this.client.chat.completions.create({
                model: request.model || this.defaultModel,
                messages: request.messages,
                temperature: request.temperature || 0.7,
                max_tokens: request.maxTokens || 4096
            }); // Cast for OpenRouter specific fields
            const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
            const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            // Get OpenRouter generation ID
            const id = response.id;
            // OpenRouter pricing (approximate, varies by model)
            const inputCostPer1k = 0.003; // $3 per 1M tokens
            const outputCostPer1k = 0.015; // $15 per 1M tokens
            const cost = (usage.prompt_tokens / 1000 * inputCostPer1k) +
                (usage.completion_tokens / 1000 * outputCostPer1k);
            return {
                id,
                content,
                usage: {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens,
                    totalTokens: usage.total_tokens
                },
                cost
            };
        }
        catch (error) {
            // Log detailed error for debugging
            const errorMessage = ((_e = (_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || error.message;
            const errorCode = (_h = (_g = (_f = error.response) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.error) === null || _h === void 0 ? void 0 : _h.code;
            console.error('[OpenRouter] Detailed API Error:', {
                message: errorMessage,
                code: errorCode,
                status: (_j = error.response) === null || _j === void 0 ? void 0 : _j.status,
                data: (_k = error.response) === null || _k === void 0 ? void 0 : _k.data
            });
            throw new Error(`OpenRouter API failed: ${errorMessage}`);
        }
    }
    async completeWithRetry(request, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.complete(request);
            }
            catch (error) {
                lastError = error;
                console.log(`[OpenRouter] Retry ${attempt}/${maxRetries} after error:`, error.message);
                // Don't retry on certain errors
                if (error.message.includes('400') || error.message.includes('Invalid model')) {
                    console.log('[OpenRouter] Non-retryable error, giving up');
                    break;
                }
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        throw lastError || new Error('OpenRouter request failed after retries');
    }
}
exports.OpenRouterClient = OpenRouterClient;
