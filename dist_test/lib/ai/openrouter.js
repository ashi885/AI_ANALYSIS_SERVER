"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterClient = void 0;
const openai_1 = __importDefault(require("openai"));
class OpenRouterClient {
    constructor(config) {
        this.client = new openai_1.default({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
            defaultHeaders: {
                'HTTP-Referer': 'https://cuepoint.app',
                'X-Title': 'Cuepoint Media Analysis'
            }
        });
        this.defaultModel = config.model || 'anthropic/claude-3.5-sonnet';
    }
    async complete(request) {
        var _a, _b;
        try {
            const response = await this.client.chat.completions.create({
                model: request.model || this.defaultModel,
                messages: request.messages,
                temperature: request.temperature || 0.7,
                max_tokens: request.maxTokens || 4096
            });
            const content = ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
            const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            // OpenRouter pricing (approximate, varies by model)
            const inputCostPer1k = 0.003; // $3 per 1M tokens
            const outputCostPer1k = 0.015; // $15 per 1M tokens
            const cost = (usage.prompt_tokens / 1000 * inputCostPer1k) +
                (usage.completion_tokens / 1000 * outputCostPer1k);
            return {
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
            console.error('[OpenRouter] API Error:', error.message);
            throw new Error(`OpenRouter API failed: ${error.message}`);
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
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        throw lastError || new Error('OpenRouter request failed after retries');
    }
}
exports.OpenRouterClient = OpenRouterClient;
