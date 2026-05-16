"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeAIError = sanitizeAIError;
/**
 * Universal AI Error Sanitizer
 * Strips all provider, model, and sensitive API information from error messages.
 * Maps technical API failures to generic, client-safe branding-neutral messages.
 */
function sanitizeAIError(message) {
    if (!message)
        return 'Internal AI analysis error. Please try again.';
    // 1. Check for specific status codes or patterns
    if (message.includes('403') || message.includes('401') || message.includes('Key limit') || message.includes('API key')) {
        return 'AI service authorization error. Please contact support.';
    }
    if (message.includes('429') || message.includes('Rate limit') || message.includes('too many requests')) {
        return 'AI engine is currently at capacity. Please try again in 5-10 minutes.';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('Bad Gateway') || message.includes('Service Unavailable')) {
        return 'AI analysis service is temporarily unavailable. Please try again later.';
    }
    if (message.includes('context_length_exceeded') || message.includes('content_filter')) {
        return 'The content exceeded AI processing limits or safety protocols.';
    }
    // 2. Aggressive scrubbing of branding and technical leaks
    let clean = message;
    // Provider names
    const providers = [/OpenRouter/gi, /OpenAI/gi, /Anthropic/gi, /Google/gi, /DeepSeek/gi, /Meta/gi, /Mistral/gi, /Groq/gi, /Perplexity/gi];
    providers.forEach(p => { clean = clean.replace(p, 'AI Service'); });
    // Model names (common patterns)
    const models = [/Claude/gi, /GPT-[0-9a-z.-]+/gi, /Gemini/gi, /Llama/gi, /Sonnet/gi, /Haiku/gi, /Opus/gi, /Whisper/gi];
    models.forEach(m => { clean = clean.replace(m, 'AI Engine'); });
    // Technical leaks (URLs, API keys, paths)
    clean = clean.replace(/https?:\/\/[^\s]+/g, '(internal link)');
    clean = clean.replace(/sk-[a-zA-Z0-9]{20,}/g, '****');
    clean = clean.replace(/[a-zA-Z0-9_-]{32,}/g, '****'); // General hash/key scrub
    // 3. Final polish - if it's still too technical, give it a generic wrapper
    if (clean.length > 200 || clean.includes('{') || clean.includes('[')) {
        return 'A technical error occurred during AI analysis. Processing will be retried automatically if possible.';
    }
    return clean;
}
