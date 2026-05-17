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
exports.PROMPT_TEMPLATES = exports.analyzeRouter = void 0;
exports.normalizeTranscript = normalizeTranscript;
exports.buildPromptParts = buildPromptParts;
const express_1 = require("express");
const license_1 = require("../middleware/license");
const db_mgmt_1 = require("../db-mgmt");
const openrouter_1 = require("../lib/ai/openrouter");
const ai_queue_1 = require("../ai-queue");
const logger_1 = require("../logger");
exports.analyzeRouter = (0, express_1.Router)();
// Configuration constants
// Configuration constants (Default model now loaded dynamically from DB)
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
exports.PROMPT_TEMPLATES = {
    subtitles: {
        system: "You are an expert subtitle editor. Generate accurate SRT/VTT subtitles from the provided transcript. Return ONLY valid JSON.",
        userTemplate: "Generate subtitles for:\n\n{{transcript}}"
    },
    subtitle_translation: {
        system: `You are a world-class subtitle translator and localization expert.
Your task is to translate the provided transcript into natural, accurate {{target_language}} subtitles.

CRITICAL LINGUISTIC RULES:
1. TARGET LANGUAGE: Your output MUST be in {{target_language}}. 
2. NO SKIPPING: Every input segment MUST have a corresponding translated segment in the output. If the source looks like credits or status messages, translate them. NEVER ignore segments as this breaks timecode alignment.
3. FORBIDDEN: Do NOT return the source text.
4. TIMINGS: Every subtitle must maintain the exact [start] and [end] times provided in the source brackets, e.g., if you see [12.50 - 15.00], the output segment MUST have "start": 12.50 and "end": 15.00.

{{formatting_instructions}}

IMPORTANT: If the dialogue is very long and you encounter token limits, ensure you close the JSON array and object exactly at a segment boundary before ending your response (e.g., end with ]}).

Return ONLY a JSON object with a 'segments' key containing an array of translated segments:
{
  "segments": [
    { "start": 12.50, "end": 15.00, "text": "Translated text in {{target_language}}" }
  ]
}`,
        userTemplate: "Translate the following transcript into high-quality {{target_language}} subtitles. Ensure EVERY line is converted to {{target_language}}:\n\n{{transcript}}"
    },
    metadata: {
        system: `You are a comprehensive media content analyst. Extract detailed structured metadata from transcriptions.
Return ONLY valid JSON with this exact schema:
{
  "title": "Descriptive title",
  "description": "Comprehensive summary (max 500 chars)",
  "story_synopsis": "Brief synopsis of the story/plot",
  "story_arcs": ["Main narrative arc points"],
  "themes": ["Central themes"],
  "emotional_tones": ["Dominant emotional qualities"],
  "genre": "Primary genre",
  "sub_genres": ["Secondary genres"],
  "content_rating": "Maturity rating (e.g. G, PG, R) based on {{rating_country}} standard",
  "advisory": ["Content advisories"],
  "target_audience": "Target demographic",
  "tags": ["Searchable tags"],
  "language": "Detected language",
  "key_moments": ["Key moments with descriptions"],
  "overall_sentiment": "Positive, neutral, negative, or mixed",
  "production_style": "Style (e.g., interview, cinematic)",
  "duration_category": "Short-form, Mid-length, or Feature-length",
  "speakers": ["List of detected speakers"],
  "format": "Content format (e.g., news, narrative)",
  "key_quotes": ["Memorable quotes"]
}`,
        userTemplate: "Analyze this transcription and extract comprehensive metadata:\n\n{{transcript}}"
    },
    metadata_chunk: {
        system: `You are a media analyst focusing on a specific segment of a larger video. 
This segment covers the range from {{chunk_start}}s to {{chunk_end}}s.
Summarize this segment and extract key narrative beats, themes, and quotes. 
Return ONLY JSON with this format:
{
  "summary": "Brief summary of this section",
  "narrative_beats": ["Key plot/topic movements in this section"],
  "local_themes": ["Themes specific to this section"],
  "memorable_quotes": ["Memorable lines from this section"]
}`,
        userTemplate: "Analyze this segment ({{chunk_start}}s - {{chunk_end}}s) of the full video:\n\n{{transcript}}"
    },
    metadata_synthesis: {
        system: `You are a master editor for a professional OTT platform and Media Asset Management (MAM) system. 
You are given several summaries of 15-minute segments of a long video.
Your task is to synthesize these into a single, cohesive global metadata record that serves both distribution and marketing teams.

Return ONLY valid JSON with this exact schema:
{
  "title": "A single compelling title for the whole video",
  "logline": "A single-sentence 'hook' for the video (max 150 chars)",
  "description": "A global summary (max 500 chars)",
  "story_synopsis": "Full synopsis covering all segments",
  "story_arcs": ["Major narrative movements across the whole video"],
  "themes": ["Primary global themes"],
  "emotional_tones": ["Dominant emotional qualities"],
  "mood_profile": ["3-5 dominant 'vibe' descriptors (e.g. Gritty, Heartwarming)"],
  "genre": "Primary genre",
  "sub_genres": ["Secondary genres"],
  "content_rating": "Global maturity rating (e.g. G, PG, R) based on {{rating_country}} standard",
  "advisory": ["Comprehensive content advisories"],
  "compliance_brief": "A brief assessment of potential distribution risks (e.g. Political sensitivity, explicit language depth, nudity levels)",
  "target_audience": "Target demographic",
  "marketing_hooks": ["3-4 compelling angles for social media distribution or trailers"],
  "tags": ["Searchable tags for the entire video"],
  "language": "Primary language",
  "key_moments": ["The 5-7 most important moments/events from the entire video"],
  "overall_sentiment": "Global sentiment",
  "production_style": "Overall style",
  "visual_style": "Description of production aesthetics (e.g. Handheld, Cinematic, Neon-lit, High-contrast)",
  "duration_category": "Feature-length, Short, or Series",
  "speakers": ["All notable speakers/figures across segments"],
  "characters": ["Major characters, personalities, or subjects featured"],
  "key_entities": ["Notable People, Places, and Organizations mentioned"],
  "format": "Overall format",
  "key_quotes": ["The most impactful quotes from all segments"]
}`,
        userTemplate: "Synthesize these segment summaries into a single global metadata record for a professional OTT catalog:\n\n{{transcript}}"
    },
    ad_breaks: {
        system: `You are an advertising placement specialist. Identify optimal ad break points.
Target: Find approximately {{target_count}} natural breaks in this segment.
SEGMENT CONTEXT: This segment covers the video range from {{chunk_start}}s to {{chunk_end}}s.

CRITICAL TIMECODE RULES:
1. Every 'timecode' MUST be between {{chunk_start}} and {{chunk_end}}.
2. The transcript provided has absolute timestamps in brackets like [915.20]. YOU MUST USE THESE EXACT NUMBERS.
3. DO NOT restart from zero. DO NOT provide relative offsets.
4. If a break occurs at the very start of this segment, its timecode is {{chunk_start}}, NOT 0.

Each break must have a 'timecode' (seconds), a 'reason' (detailed justification), a 'confidence' score (0.0-1.0), and a 'preview_label' (short title).
Return ONLY a JSON object with an 'ad_breaks' key containing an array:
{"ad_breaks": [{"timecode": 120.5, "reason": "...", "confidence": 0.98, "preview_label": "..."}]}`,
        userTemplate: "Identify optimal ad break points in the following segment ({{chunk_start}}s - {{chunk_end}}s). Align your timecodes exactly with the absolute timestamps provided in the transcript:\n\n{{transcript}}"
    },
    promo_breaks: {
        system: `You are a promotional content specialist. Identify high-impact, engaging highlights for social media teasers and trailers.
Target: Find approximately {{target_count}} highlights in this segment.
SEGMENT CONTEXT: This segment covers the video range from {{chunk_start}}s to {{chunk_end}}s.

CRITICAL TIMECODE RULES:
1. Every 'start' and 'end' timecode MUST be between {{chunk_start}} and {{chunk_end}}.
2. The transcript has absolute timestamps in brackets like [1050.45]. YOU MUST USE THESE EXACT NUMBERS.
3. DO NOT restart from zero. DO NOT use relative times.

CRITICAL LINGUISTIC RULE:
- All creative metadata fields ('hook', 'description', 'sentiment') MUST be written in ENGLISH, even if the 'text' (transcript) is in another language.

Each highlight segment must have:
- 'start' and 'end' (seconds)
- 'text' (the key quote or dialogue - keep in original language)
- 'hook' (a short, compelling clickbait-style title in ENGLISH)
- 'description' (why this segment is good for promotion, in ENGLISH)
- 'sentiment' (e.g., Positive, Intense, Emotional, Funny, in ENGLISH)
- 'viral_score' (A number between 0.0-1.0)
- 'confidence' score (0.0-1.0)

Return ONLY a JSON object with a 'promo_breaks' key containing an array of these highlights:
{"promo_breaks": [{"start": 45.0, "end": 60.0, "text": "...", "hook": "...", "description": "...", "sentiment": "...", "viral_score": 0.95, "confidence": 0.92}]}`,
        userTemplate: "Identify the most viral-worthy highlights in this segment ({{chunk_start}}s - {{chunk_end}}s). Ensure timings match the absolute timestamps in the transcript:\n\n{{transcript}}"
    },
    ad_breaks_synthesis: {
        system: `You are the Lead Editor. You have been given a list of candidate ad break points from several segments of a video. 
Your goal is to select EXACTLY {{global_target}} optimal ad breaks for the entire video.

CRITERIA:
1. SPACING: Ensure breaks are logically distributed (e.g., if target is 4 for 1 hour, approx 15 mins apart). Avoid clusters.
2. QUALITY: Pick breaks with the highest 'confidence' and most logical 'reason'.
3. ACCURACY: Preserve the exact 'timecode' and 'preview_label' from the candidates.

Return ONLY a JSON object with an 'ad_breaks' key containing the final selected array of {{global_target}} items.`,
        userTemplate: "Total Target: {{global_target}} breaks.\n\nCandidates List:\n{{candidates}}"
    },
    promo_breaks_synthesis: {
        system: `You are the Lead Content Strategist. You have a list of candidate highlights from several segments of a video.
Your goal is to select EXACTLY {{global_target}} high-impact highlights for the entire video.

CRITERIA:
1. IMPACT: Select the most engaging, narrative-driving, or shocking moments.
2. VARIETY: Ensure the selection covers different parts of the entire content.
3. LINGUISTIC CONSISTENCY: Ensure all 'hook', 'description', and 'sentiment' fields are in ENGLISH. If any candidates are in another language, translate these metadata fields to English during synthesis.
4. PRESERVATION: You MUST preserve ALL fields from the selected candidates including: 'start', 'end', 'text', 'hook', 'description', 'sentiment', and 'viral_score'. DO NOT drop any metadata.

Return ONLY a JSON object with a 'promo_breaks' key containing the final selected array of {{global_target}} items.`,
        userTemplate: "Select the top {{global_target}} highlights for the final edit from this list of candidates:\n\n{{candidates}}"
    },
    vision_ai: {
        system: `You are an advanced Multi-Modal Visual Intelligence Assistant.
Your task is to analyze the sequence of keyframe screenshots from a video along with their corresponding timecodes (seconds) and the dialogue transcript.
Synthesize the visual progression, key events, shot changes, graphical inserts/text overlays, scene transitions, color palettes, and overall visual narrative.
Return ONLY valid JSON matching this schema:
{
  "visual_narrative": "A detailed paragraph summarizing the visual storytelling, art style, editing rhythm, and pacing.",
  "scene_breakdown": [
    {
      "start": 0.0,
      "end": 30.0,
      "setting": "Detailed description of the setting, lighting, camera angles, and atmosphere.",
      "on_screen_text": "Any readable graphics, burned-in text, lower-thirds, or logos.",
      "visual_description": "Comprehensive description of what physically happens and visual elements."
    }
  ],
  "branding_and_graphics": [
    {
      "timecode": 5.2,
      "type": "logo",
      "description": "Details of the graphic, including colors, text content, placement on screen, and size."
    }
  ],
  "visual_anomalies": [
    {
      "timecode": 45.0,
      "type": "black-frame",
      "severity": "low",
      "description": "Description of the visual defect or anomaly."
    }
  ],
  "production_aesthetics": {
    "color_palette": ["Vibrant blue", "Warm amber", "Low contrast"],
    "lighting_style": "Dramatic chiaroscuro / high-key / naturalistic",
    "camera_techniques": ["Shallow depth of field", "Drone establishment shot", "Close-up cutaway"]
  }
}`,
        userTemplate: "Analyze the following visual keyframes and transcript to generate a complete visual timeline:\n\nTranscript dialogue:\n{{transcript}}"
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
function buildPromptParts(moduleName, transcript, params = {}) {
    // Normalize module name (strip suffixes like -en) for template lookup
    const lookupName = moduleName.includes('-') ? moduleName.split('-')[0] : moduleName;
    const template = exports.PROMPT_TEMPLATES[lookupName];
    if (!template) {
        // Fallback for unknown modules
        return {
            system: "You are a helpful assistant analyzing media content.",
            user: `Analyze the following content:\n\n${transcript}`
        };
    }
    let system = template.system;
    let user = template.userTemplate.replace('{{transcript}}', transcript);
    // 1. Inject Guidelines (Learning Loop Part 1)
    if (params.guidelines) {
        system = `CLIENT BEHAVIOR GUIDELINES:\n${params.guidelines}\n\n${system}`;
    }
    // 2. Inject Examples (Learning Loop Part 2)
    if (params.examples && Array.isArray(params.examples) && params.examples.length > 0) {
        const examplesText = params.examples.map((ex, i) => {
            return `[PREFERENCE EXAMPLE ${i + 1}]\nContext: ${ex.context_summary}\nOutput: ${ex.preferred_output}`;
        }).join('\n\n');
        system = `${system}\n\nSTRICT REFERENCE EXAMPLES (FOLLOW THIS STYLE):\n${examplesText}`;
    }
    // 3. Dynamic variable replacement
    Object.entries(params).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        system = system.replace(regex, String(value));
        user = user.replace(regex, String(value));
    });
    // Clean up any remaining placeholders with defaults
    system = system.replace(/{{rating_country}}/g, 'US');
    system = system.replace(/{{target_count}}/g, '3-5');
    return { system, user };
}
// Helper: Log AI request with consistent structure
function logAIRequest(params) {
    (0, db_mgmt_1.logApiRequest)({
        clientId: params.clientId,
        provider: 'openrouter',
        endpoint: params.endpoint,
        direction: params.direction,
        requestMethod: params.direction === 'incoming' ? 'POST' : undefined,
        requestBody: params.requestBody || (params.direction === 'incoming' ? {
            moduleName: params.moduleName,
            model: params.model,
            transcriptLength: params.transcriptLength
        } : undefined),
        responseBody: params.responseBody,
        requestId: params.requestId,
        model: params.model,
        errorMessage: params.errorMessage,
        responseStatus: params.responseStatus,
        tokensUsed: params.tokensUsed,
        costUsd: params.costUsd,
        latencyMs: params.latencyMs,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
    });
    // Also log to system console/file
    logger_1.logger.api(params.direction === 'incoming' ? 'REQ_IN' : 'REQ_OUT', `${params.endpoint} [${params.moduleName || 'direct'}]`, {
        clientId: params.clientId,
        requestId: params.requestId,
        model: params.model,
        durationMs: params.latencyMs,
        statusCode: params.responseStatus,
        error: params.errorMessage,
        details: params.requestBody || params.responseBody
    });
}
/// Unified analysis endpoint for all AI modules
exports.analyzeRouter.post('/analyze', license_1.licenseMiddleware, async (req, res) => {
    var _a, _b;
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
        // --- CREDIT SYSTEM CHECK ---
        const clientInfo = await (0, db_mgmt_1.getClientById)(clientId);
        const billingType = (clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.billing_type) || 'PER_REQUEST';
        const duration = Number(body.duration) || 0;
        const pricing = moduleName ? await (0, db_mgmt_1.getModulePricing)(clientId, moduleName, duration) : null;
        const moduleCost = (pricing === null || pricing === void 0 ? void 0 : pricing.cost_per_job) || 0;
        if (billingType === 'CREDIT' && ((clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.credits) || 0) < moduleCost) {
            return res.status(402).json({
                error: 'Insufficient credits. Please top up your account.',
                balance: (clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.credits) || 0,
                required: moduleCost
            });
        }
        // ---------------------------
        // Determine model - use provided, module config, or default
        let targetModel = model;
        if (!targetModel && moduleName) {
            const models = await (0, license_1.getClientModels)(clientId);
            const config = models.find(m => m.module_name === moduleName);
            targetModel = config === null || config === void 0 ? void 0 : config.api_model;
        }
        targetModel = targetModel || await (0, db_mgmt_1.getGlobalDefaultModel)();
        if (!targetModel) {
            return res.status(400).json({ error: 'No AI model configured and no global fallback set.' });
        }
        // Build messages with proper role separation
        const { system: systemContent, user: userContent } = moduleName && exports.PROMPT_TEMPLATES[moduleName]
            ? buildPromptParts(moduleName, transcriptStr, body)
            : {
                system: customPrompt || "You are a helpful assistant.",
                user: transcriptStr
            };
        let userMessageContent = userContent;
        if (moduleName === 'vision_ai' || (body.images && Array.isArray(body.images))) {
            const imageContents = body.images || [];
            userMessageContent = [
                { type: 'text', text: userContent }
            ];
            for (const img of imageContents) {
                if (img.base64) {
                    userMessageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: img.base64.startsWith('data:') ? img.base64 : `data:image/jpeg;base64,${img.base64}`
                        }
                    });
                }
            }
        }
        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: userMessageContent }
        ];
        const aiClient = new openrouter_1.OpenRouterClient({ apiKey });
        const result = await aiClient.completeWithRetry({
            messages,
            model: targetModel,
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS
        });
        // Log successful request with full details
        const usage = result.usage || {};
        const totalTokens = usage.totalTokens || ((usage.promptTokens || 0) + (usage.completionTokens || 0));
        logAIRequest({
            clientId: clientId,
            endpoint: '/api/ai/analyze',
            direction: 'outgoing',
            model: targetModel,
            moduleName,
            requestBody: { system: systemContent, user: userContent },
            responseBody: { content: result.content },
            requestId: result.id,
            responseStatus: 200,
            tokensUsed: totalTokens,
            costUsd: result.cost || 0,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        // --- CREDIT SYSTEM DEDUCTION ---
        let lowCreditWarning = null;
        if (billingType === 'CREDIT' && moduleCost > 0) {
            const deduction = await (0, db_mgmt_1.deductCredits)(clientId, moduleCost, `Execution of module: ${moduleName || 'custom'}`, body.jobId || undefined);
            if (deduction.success && deduction.balance !== undefined && deduction.balance < 5.0) {
                lowCreditWarning = `Low credit balance: $${deduction.balance.toFixed(2)}. Please top up soon.`;
            }
        }
        // -------------------------------
        return res.json({
            id: result.id,
            content: result.content,
            usage: result.usage,
            cost: moduleCost,
            model: targetModel,
            warning: lowCreditWarning
        });
    }
    catch (error) {
        let statusCode = 500;
        const statusMatch = (_b = error.message) === null || _b === void 0 ? void 0 : _b.match(/\b(400|401|403|429|500|503)\b/);
        if (statusMatch) {
            statusCode = parseInt(statusMatch[1]);
        }
        logAIRequest({
            clientId: clientId,
            endpoint: '/api/ai/analyze',
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: statusCode,
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
    var _a, _b;
    const startTime = Date.now();
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const moduleName = req.params.moduleName;
    try {
        // Validate module name against allowed templates
        if (!exports.PROMPT_TEMPLATES.hasOwnProperty(moduleName)) {
            return res.status(400).json({
                error: `Invalid module '${moduleName}'. Allowed: ${Object.keys(exports.PROMPT_TEMPLATES).join(', ')}`
            });
        }
        const body = req.body;
        let transcript = body.transcript;
        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }
        const transcriptStr = normalizeTranscript(transcript);
        // Build structured prompt parts for this module
        // Build messages with proper role separation
        const { system: systemContent, user: userContent } = buildPromptParts(moduleName, transcriptStr, body);
        // Get model from client config or use default
        const models = await (0, license_1.getClientModels)(clientId);
        const config = models.find(m => m.module_name === moduleName);
        const model = (config === null || config === void 0 ? void 0 : config.api_model) || await (0, db_mgmt_1.getGlobalDefaultModel)();
        if (!model) {
            return res.status(400).json({ error: 'No AI model configured for this module and no global fallback set.' });
        }
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
        // --- CREDIT SYSTEM CHECK ---
        const clientInfo = await (0, db_mgmt_1.getClientById)(clientId);
        const billingType = (clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.billing_type) || 'PER_REQUEST';
        const duration = Number(body.duration) || 0;
        const pricing = await (0, db_mgmt_1.getModulePricing)(clientId, moduleName, duration);
        const moduleCost = (pricing === null || pricing === void 0 ? void 0 : pricing.cost_per_job) || 0;
        if (billingType === 'CREDIT' && ((clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.credits) || 0) < moduleCost) {
            return res.status(402).json({
                error: 'Insufficient credits. Please top up your account.',
                balance: (clientInfo === null || clientInfo === void 0 ? void 0 : clientInfo.credits) || 0,
                required: moduleCost
            });
        }
        // ---------------------------
        let userMessageContent = userContent;
        if (moduleName === 'vision_ai' || (body.images && Array.isArray(body.images))) {
            const imageContents = body.images || [];
            userMessageContent = [
                { type: 'text', text: userContent }
            ];
            for (const img of imageContents) {
                if (img.base64) {
                    userMessageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: img.base64.startsWith('data:') ? img.base64 : `data:image/jpeg;base64,${img.base64}`
                        }
                    });
                }
            }
        }
        const aiClient = new openrouter_1.OpenRouterClient({ apiKey });
        const result = await aiClient.completeWithRetry({
            messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: userMessageContent }
            ],
            model: model,
            temperature: DEFAULT_TEMPERATURE,
            maxTokens: DEFAULT_MAX_TOKENS
        });
        const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalTokensIn: 0, totalTokensOut: 0 };
        const requestId = result.id || `req_${Date.now()}`;
        const jobId = (body.jobId || body.local_job_id || null);
        const userId = (body.userId || body.user_id || null);
        // Log Audit Log (Audit trail)
        (0, db_mgmt_1.logApiRequest)({
            clientId: clientId,
            provider: 'openrouter',
            endpoint: `/api/ai/module/${moduleName}`,
            direction: 'outgoing',
            model: model,
            responseStatus: 200,
            tokensUsed: usage.totalTokens || (usage.promptTokens + usage.completionTokens) || 0,
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
            model: model,
            status: 'success',
            costUsd: moduleCost, // The centralized server price
            actualCostUsd: result.cost || 0, // The raw provider cost
            tokensUsed: usage.totalTokens || (usage.promptTokens + usage.completionTokens) || 0,
            latencyMs: Date.now() - startTime,
            requestId: requestId,
            durationSeconds: duration
        });
        // --- CREDIT SYSTEM DEDUCTION ---
        let lowCreditWarning = null;
        if (billingType === 'CREDIT' && moduleCost > 0) {
            const deduction = await (0, db_mgmt_1.deductCredits)(clientId, moduleCost, `Execution of module: ${moduleName}`, body.jobId || undefined);
            if (deduction.success && deduction.balance !== undefined && deduction.balance < 5.0) {
                lowCreditWarning = `Low credit balance: $${deduction.balance.toFixed(2)}. Please top up soon.`;
            }
        }
        // -------------------------------
        return res.json({
            content: result.content,
            usage: result.usage,
            cost: moduleCost, // Return the server-set cost, not the raw cost
            model: model,
            requestId: requestId,
            warning: lowCreditWarning
        });
    }
    catch (error) {
        // Log error consistently
        let statusCode = 500;
        const statusMatch = (_b = error.message) === null || _b === void 0 ? void 0 : _b.match(/\b(400|401|403|429|500|503)\b/);
        if (statusMatch) {
            statusCode = parseInt(statusMatch[1]);
        }
        logAIRequest({
            clientId: clientId,
            endpoint: `/api/ai/module/${moduleName}`,
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: statusCode,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        console.error(`[AI Module ${moduleName} Error]`, error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// Async endpoint for modules (returns a Job ID to poll)
exports.analyzeRouter.post('/module/:moduleName/async', license_1.licenseMiddleware, async (req, res) => {
    var _a;
    const clientId = (_a = req.client) === null || _a === void 0 ? void 0 : _a.id;
    const moduleName = req.params.moduleName;
    try {
        if (!exports.PROMPT_TEMPLATES.hasOwnProperty(moduleName)) {
            return res.status(400).json({
                error: `Invalid module '${moduleName}'. Allowed: ${Object.keys(exports.PROMPT_TEMPLATES).join(', ')}`
            });
        }
        const body = req.body;
        if (!body.transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }
        const jobId = await (0, ai_queue_1.enqueueAIJob)(clientId, moduleName, body);
        return res.status(202).json({
            jobId: jobId,
            status: 'pending',
            message: 'AI Job queued successfully'
        });
    }
    catch (error) {
        console.error(`[AI Async Submit Error]`, error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// Polling endpoint for checking job status
exports.analyzeRouter.get('/job/:jobId', license_1.licenseMiddleware, async (req, res) => {
    var _a;
    const jobId = req.params.jobId;
    try {
        const job = (0, ai_queue_1.getAIJob)(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        // Security check: ensure client owns the job
        if (job.client_id !== ((_a = req.client) === null || _a === void 0 ? void 0 : _a.id)) {
            return res.status(403).json({ error: 'Unauthorized to view this job' });
        }
        // Mask model/provider names using configured labels
        const providerLabels = await (0, db_mgmt_1.getProviderLabels)();
        let displayModel = job.result ? JSON.parse(job.result).model : null;
        if (displayModel) {
            // Find if any provider label matches a prefix of the model
            const providers = Object.keys(providerLabels);
            providers.sort((a, b) => b.length - a.length); // Longest first for better matching
            const matchingProvider = providers.find(p => displayModel.toLowerCase().startsWith(p.toLowerCase()));
            if (matchingProvider) {
                displayModel = providerLabels[matchingProvider];
            }
            else if (displayModel.includes('/')) {
                // Generically mask if it's a provider/model format (e.g. anthropic/claude -> Cuepoint AI Analysis)
                displayModel = 'Cuepoint AI Analysis';
            }
        }
        return res.json({
            id: job.id,
            status: job.status, // 'pending', 'processing', 'completed', 'failed'
            sub_status: job.sub_status || (job.status === 'processing' ? 'Processing...' : null),
            result: job.result ? JSON.parse(job.result) : null,
            cost: job.billed_cost || 0, // ONLY send the billed amount (client rate)
            model: displayModel, // Anonymized model name
            error: job.error ? JSON.parse(job.error) : null,
            created_at: job.created_at,
            updated_at: job.updated_at
        });
    }
    catch (error) {
        console.error(`[AI Job Poll Error]`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
