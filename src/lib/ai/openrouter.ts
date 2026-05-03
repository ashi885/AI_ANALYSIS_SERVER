import OpenAI from 'openai';

export interface OpenRouterConfig {
    apiKey: string;
    model?: string;
    baseURL?: string;
}

export interface CompletionRequest {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface CompletionResponse {
    id?: string; // OpenRouter generation ID
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    cost: number;
}

export interface AvailableModel {
    id: string;
    name: string;
    provider: string;
}

export async function getOpenRouterModels(apiKey: string): Promise<AvailableModel[]> {
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
        
        const data = await response.json() as any;
        const models = data.data || [];
        
        // Filter to popular models and format them
        const popularProviders = ['anthropic', 'openai', 'google', 'meta', 'mistralai'];
        
        return models
            .filter((m: any) => {
                // Filter to well-known providers and chat models
                const provider = m.id.split('/')[0];
                return popularProviders.includes(provider) && m.id.includes('chat');
            })
            .slice(0, 50) // Limit to 50 models
            .map((m: any) => ({
                id: m.id,
                name: m.name || m.id,
                provider: m.id.split('/')[0]
            }));
    } catch (error: any) {
        console.error('[OpenRouter] Failed to fetch models:', error.message);
        return [];
    }
}

export class OpenRouterClient {
    private client: OpenAI;
    private defaultModel: string;

    constructor(config: OpenRouterConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
            defaultHeaders: {
                'HTTP-Referer': 'https://cuepoint.production',
                'X-Title': 'Cuepoint AI Analysis'
            }
        });
        this.defaultModel = (config as any)?.api_model || config.model || 'anthropic/claude-3.5-sonnet';
    }

    async complete(request: CompletionRequest): Promise<CompletionResponse> {
        try {
            const response = await this.client.chat.completions.create({
                model: request.model || this.defaultModel,
                messages: request.messages,
                temperature: request.temperature || 0.7,
                max_tokens: request.maxTokens || 4096
            }) as any; // Cast for OpenRouter specific fields

            const content = response.choices[0]?.message?.content || '';
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
        } catch (error: any) {
            // Log detailed error for debugging
            const errorMessage = error.response?.data?.error?.message || error.message;
            const errorCode = error.response?.data?.error?.code;
            console.error('[OpenRouter] Detailed API Error:', {
                message: errorMessage,
                code: errorCode,
                status: error.response?.status,
                data: error.response?.data
            });
            throw new Error(`OpenRouter API failed: ${errorMessage}`);
        }
    }

    async completeWithRetry(request: CompletionRequest, maxRetries = 3): Promise<CompletionResponse> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.complete(request);
            } catch (error: any) {
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
