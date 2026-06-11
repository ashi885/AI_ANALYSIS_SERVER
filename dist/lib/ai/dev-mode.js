"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delay = delay;
exports.getDevModeData = getDevModeData;
exports.calculateDevCost = calculateDevCost;
exports.textToTranscriptionJson = textToTranscriptionJson;
exports.getSeedTemplates = getSeedTemplates;
const sqlite_1 = require("../../sqlite");
const dev_logger_1 = require("./dev-logger");
const DEFAULT_DELAY_MS = 5000;
async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function findMatchingTemplate(templates, duration) {
    return templates.find(t => (t.duration_max === 0 || duration <= t.duration_max) &&
        duration >= t.duration_min) || null;
}
async function getDevModeData(moduleName, duration, clientId) {
    const db = (0, sqlite_1.getDatabase)();
    const searchNames = moduleName.startsWith('subtitle_translation_')
        ? [moduleName, 'subtitle_translation']
        : [moduleName];
    dev_logger_1.devLogger.info(undefined, `getDevModeData(moduleName=${moduleName}, duration=${duration}, clientId=${clientId})`);
    for (const searchName of searchNames) {
        const clientSpecific = db.prepare(`
            SELECT dt.* FROM dev_templates dt
            JOIN dev_template_clients dtc ON dt.id = dtc.template_id
            WHERE dt.module_name = ? AND dtc.client_id = ?
            ORDER BY dt.duration_min ASC
        `).all(searchName, clientId);
        const globalTemplates = db.prepare(`
            SELECT * FROM dev_templates
            WHERE module_name = ?
              AND id NOT IN (SELECT template_id FROM dev_template_clients)
            ORDER BY duration_min ASC
        `).all(searchName);
        dev_logger_1.devLogger.info(undefined, `  searchName=${searchName}: ${clientSpecific.length} client-specific, ${globalTemplates.length} global templates`);
        const clientMatch = findMatchingTemplate(clientSpecific, duration);
        const globalMatch = clientMatch ? null : findMatchingTemplate(globalTemplates, duration);
        const match = clientMatch || globalMatch;
        const matchSource = clientMatch ? 'client-specific' : (globalMatch ? 'global' : null);
        if (match) {
            dev_logger_1.devLogger.info(undefined, `  => matched ${matchSource} template #${match.id} "${match.label}" (module=${match.module_name}, min=${match.duration_min}, max=${match.duration_max})`);
            const parsed = JSON.parse(match.template_data);
            if (typeof parsed === 'string') {
                if (searchName === 'transcription' || searchName === 'whisper') {
                    dev_logger_1.devLogger.info(undefined, `  => returning textToTranscriptionJson (string data, duration=${duration})`);
                    return textToTranscriptionJson(parsed, duration);
                }
                dev_logger_1.devLogger.info(undefined, `  => string data but not transcription, breaking to fallback`);
                break;
            }
            if (searchName === 'subtitle_translation' && moduleName.startsWith('subtitle_translation_')) {
                dev_logger_1.devLogger.info(undefined, `  => generic translation template matched but specific language needed, breaking to fallback`);
                break;
            }
            const result = Object.assign(Object.assign({}, parsed), { requestId: `${searchName}_${Date.now()}` });
            if (searchName === 'subtitle_translation' && !result.isMultiResult) {
                const lang = moduleName.startsWith('subtitle_translation_')
                    ? moduleName.replace('subtitle_translation_', '')
                    : 'ko';
                dev_logger_1.devLogger.info(undefined, `  => returning single-language translation result for ${lang}`);
                return {
                    isMultiResult: true,
                    results: [{
                            moduleName: 'subtitle_translation',
                            resultType: `subtitle_${lang}`,
                            resultData: result,
                            content: JSON.stringify(result),
                            requestId: result.requestId
                        }],
                    cost: 0,
                    provider_cost: 0
                };
            }
            dev_logger_1.devLogger.info(undefined, `  => returning template result: ${dev_logger_1.devLogger.preview(result)}`);
            return result;
        }
    }
    dev_logger_1.devLogger.info(undefined, `  => no template match, using fallback for ${moduleName}`);
    return generateFallbackDummy(moduleName, duration);
}
function calculateDevCost(clientModuleRates, moduleName) {
    var _a;
    if (!clientModuleRates)
        return 0;
    try {
        const rates = typeof clientModuleRates === 'string' ? JSON.parse(clientModuleRates) : clientModuleRates;
        return ((_a = rates[moduleName]) === null || _a === void 0 ? void 0 : _a.cost_per_job) || 0;
    }
    catch (_b) {
        return 0;
    }
}
function textToTranscriptionJson(text, duration) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordsPerSegment = Math.max(5, Math.ceil(words.length / Math.max(2, Math.floor((duration || 30) / 15))));
    const segments = [];
    const segmentLen = (duration || 30) / Math.max(1, Math.ceil(words.length / wordsPerSegment));
    for (let i = 0; i < words.length; i += wordsPerSegment) {
        const chunk = words.slice(i, i + wordsPerSegment).join(' ');
        const start = Math.round((i / words.length) * (duration || 30) * 100) / 100;
        const end = Math.round(((i + wordsPerSegment) / words.length) * (duration || 30) * 100) / 100;
        segments.push({ id: segments.length, start, end, text: chunk });
    }
    return {
        text,
        segments,
        language: 'en',
        duration: duration || 30,
        cost: 0,
        requestId: `dummy_whisper_${Date.now()}`
    };
}
function generateSingleTranslation(lang, duration) {
    const count = Math.max(2, Math.min(10, Math.floor(duration / 30)));
    const segments = [];
    for (let i = 0; i < count; i++) {
        const start = (duration / count) * i;
        const end = (duration / count) * (i + 1);
        segments.push({
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            text: dummyTexts[i % dummyTexts.length]
        });
    }
    const langLabels = { ko: 'KO', zh: 'CN', en: 'EN' };
    const langPrefixes = { ko: '[Korean]', zh: '[Chinese]', en: '[English]' };
    const label = langLabels[lang] || lang.toUpperCase();
    const prefix = langPrefixes[lang] || `[${lang.toUpperCase()}]`;
    return {
        content: JSON.stringify({
            language: lang,
            segments: segments.map(s => (Object.assign(Object.assign({}, s), { text: `${prefix} ${s.text}` }))),
            srt: segments.map((s, i) => `${i + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n[${label}] ${s.text}\n`).join('\n'),
            vtt: 'WEBVTT\n\n' + segments.map((s, i) => `${formatTime(s.start).replace(',', '.')} --> ${formatTime(s.end).replace(',', '.')}\n[${label}] ${s.text}\n`).join('\n')
        }),
        usage: { promptTokens: 50, completionTokens: 200, totalTokens: 250 },
        cost: 0,
        requestId: `dummy_trans_${lang}_${Date.now()}`
    };
}
function generateFallbackDummy(moduleName, duration) {
    dev_logger_1.devLogger.info(undefined, `    generateFallbackDummy(moduleName=${moduleName}, duration=${duration})`);
    if (moduleName.startsWith('subtitle_translation_')) {
        const lang = moduleName.replace('subtitle_translation_', '');
        dev_logger_1.devLogger.info(undefined, `    → generateSingleTranslation(lang=${lang})`);
        return generateSingleTranslation(lang, duration);
    }
    switch (moduleName) {
        case 'transcription':
        case 'whisper':
            dev_logger_1.devLogger.info(undefined, `    → generateDummyTranscription`);
            return generateDummyTranscription(duration);
        case 'subtitles':
            dev_logger_1.devLogger.info(undefined, `    → generateDummySubtitles`);
            return generateDummySubtitles(duration);
        case 'metadata':
            dev_logger_1.devLogger.info(undefined, `    → generateDummyMetadata`);
            return generateDummyMetadata(duration);
        case 'ad_breaks':
            dev_logger_1.devLogger.info(undefined, `    → generateDummyAdBreaks`);
            return generateDummyAdBreaks(duration);
        case 'promo_breaks':
            dev_logger_1.devLogger.info(undefined, `    → generateDummyPromoBreaks`);
            return generateDummyPromoBreaks(duration);
        case 'subtitle_translation':
            dev_logger_1.devLogger.info(undefined, `    → generateDummyTranslation`);
            return generateDummyTranslation(duration);
        case 'vision_ai':
            dev_logger_1.devLogger.info(undefined, `    → generateDummyVisionAI`);
            return generateDummyVisionAI();
        default:
            dev_logger_1.devLogger.info(undefined, `    → generic fallback for ${moduleName}`);
            return { content: JSON.stringify({ note: `Dummy data for ${moduleName}` }), usage: { totalTokens: 10 }, cost: 0, requestId: `dummy_${Date.now()}` };
    }
}
function generateDummySegments(duration, count) {
    const segmentDuration = duration / count;
    const segments = [];
    for (let i = 0; i < count; i++) {
        const start = i * segmentDuration;
        const end = (i + 1) * segmentDuration;
        segments.push({
            id: i,
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            text: dummyTexts[i % dummyTexts.length]
        });
    }
    return segments;
}
const dummyTexts = [
    "Welcome to today's presentation on innovative solutions.",
    "We're excited to share our latest developments with you.",
    "This technology represents a significant breakthrough in the field.",
    "Our team has been working tirelessly to bring this to market.",
    "Let me walk you through the key features and benefits.",
    "As you can see, the results speak for themselves.",
    "We've received overwhelmingly positive feedback from early adopters.",
    "Now let's discuss the implementation strategy going forward.",
    "The integration process is straightforward and well-documented.",
    "We're committed to providing ongoing support and updates.",
    "This is just the beginning of what we have planned.",
    "Thank you for your attention and we welcome your questions.",
];
function generateDummyTranscription(duration) {
    const count = Math.max(2, Math.min(20, Math.floor(duration / 15)));
    const segments = generateDummySegments(duration, count);
    const fullText = segments.map((s) => s.text).join(' ');
    return {
        text: fullText,
        segments,
        language: 'en',
        duration,
        cost: 0,
        requestId: `dummy_whisper_${Date.now()}`
    };
}
function generateDummySubtitles(duration) {
    const count = Math.max(2, Math.min(20, Math.floor(duration / 15)));
    const segments = generateDummySegments(duration, count);
    return {
        content: JSON.stringify({ segments }),
        usage: { promptTokens: 50, completionTokens: 200, totalTokens: 250 },
        cost: 0,
        requestId: `dummy_subtitles_${Date.now()}`
    };
}
function generateDummyMetadata(duration) {
    const isShort = duration < 60;
    const isMedium = duration < 1800;
    return {
        content: JSON.stringify({
            title: isShort ? 'Short Clip' : isMedium ? 'Training Video' : 'Full Presentation',
            description: isShort
                ? 'A brief video segment demonstrating key concepts.'
                : isMedium
                    ? 'A comprehensive training module covering essential topics and practical applications.'
                    : 'An in-depth presentation covering advanced topics, case studies, and expert insights.',
            story_synopsis: isShort
                ? 'Quick overview of main points.'
                : isMedium
                    ? 'Structured walkthrough of concepts with examples.'
                    : 'Complete narrative from introduction through advanced topics to conclusion.',
            story_arcs: isShort
                ? ['Introduction']
                : ['Introduction', 'Main Content', 'Summary'],
            themes: ['Innovation', 'Technology', 'Education'],
            emotional_tones: ['Professional', 'Informative', 'Engaging'],
            genre: 'Educational',
            sub_genres: ['Technology', 'Training'],
            content_rating: 'G',
            advisory: [],
            target_audience: 'General audience',
            tags: ['technology', 'training', 'demonstration'],
            language: 'en',
            key_moments: [
                { timecode: 5, description: 'Opening remarks' },
                { timecode: duration / 2, description: 'Main discussion point' },
                { timecode: duration - 5, description: 'Closing summary' }
            ],
            overall_sentiment: 'Positive',
            production_style: 'Studio recording',
            duration_category: isShort ? 'Short-form' : isMedium ? 'Mid-length' : 'Feature-length',
            speakers: ['Presenter'],
            format: 'Presentation',
            key_quotes: [dummyTexts[0], dummyTexts[5]]
        }),
        usage: { promptTokens: 60, completionTokens: 400, totalTokens: 460 },
        cost: 0,
        requestId: `dummy_metadata_${Date.now()}`
    };
}
function generateDummyAdBreaks(duration) {
    const count = Math.max(1, Math.min(5, Math.floor(duration / 300)));
    const breakSpacing = duration / (count + 1);
    const breaks = [];
    for (let i = 1; i <= count; i++) {
        const timecode = Math.round(breakSpacing * i * 100) / 100;
        breaks.push({
            start: timecode - 5,
            end: timecode + 5,
            timecode,
            reason: `Natural break point after segment ${i}`,
            confidence: 0.85 + Math.random() * 0.15,
            preview_label: `Break ${i}`
        });
    }
    return {
        content: JSON.stringify({ ad_breaks: breaks }),
        usage: { promptTokens: 70, completionTokens: 150, totalTokens: 220 },
        cost: 0,
        requestId: `dummy_adbreaks_${Date.now()}`
    };
}
function generateDummyPromoBreaks(duration) {
    const count = Math.max(1, Math.min(5, Math.floor(duration / 300)));
    const breakSpacing = duration / (count + 1);
    const highlights = [];
    for (let i = 1; i <= count; i++) {
        const start = Math.round(breakSpacing * i * 100) / 100;
        const end = Math.round((breakSpacing * i + 15) * 100) / 100;
        highlights.push({
            start,
            end,
            text: dummyTexts[i % dummyTexts.length],
            hook: `Amazing moment #${i}`,
            description: `Highlight segment ${i} - engaging content that captures viewer attention`,
            sentiment: 'Positive',
            viral_score: 0.7 + Math.random() * 0.3,
            confidence: 0.8 + Math.random() * 0.2
        });
    }
    return {
        content: JSON.stringify({ promo_breaks: highlights }),
        usage: { promptTokens: 70, completionTokens: 200, totalTokens: 270 },
        cost: 0,
        requestId: `dummy_promo_${Date.now()}`
    };
}
function generateDummyTranslation(duration) {
    const count = Math.max(2, Math.min(10, Math.floor(duration / 30)));
    const segments = [];
    for (let i = 0; i < count; i++) {
        const start = (duration / count) * i;
        const end = (duration / count) * (i + 1);
        segments.push({
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            text: dummyTexts[i % dummyTexts.length]
        });
    }
    const makeResults = (lang, prefix, label) => ({
        moduleName: 'subtitle_translation',
        resultType: `subtitle_${lang}`,
        resultData: {
            language: lang,
            segments: segments.map(s => (Object.assign(Object.assign({}, s), { text: `${prefix} ${s.text}` }))),
            srt: segments.map((s, i) => `${i + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n[${label}] ${s.text}\n`).join('\n'),
            vtt: 'WEBVTT\n\n' + segments.map((s, i) => `${formatTime(s.start).replace(',', '.')} --> ${formatTime(s.end).replace(',', '.')}\n[${label}] ${s.text}\n`).join('\n')
        },
        content: JSON.stringify(segments),
        requestId: `dummy_trans_${lang}_${Date.now()}`
    });
    return {
        isMultiResult: true,
        results: [
            makeResults('ko', '[Korean translation]', 'KO'),
            makeResults('zh', '[Chinese translation]', 'CN'),
            makeResults('en', '[English translation]', 'EN'),
        ],
        cost: 0,
        provider_cost: 0
    };
}
function generateDummyVisionAI() {
    return {
        content: JSON.stringify({
            visual_narrative: "A professionally produced video with consistent lighting and camera work. The visual style is clean and modern, suitable for corporate training content.",
            scene_breakdown: [
                {
                    start: 0,
                    end: 30,
                    setting: "Well-lit studio or office environment with professional backdrop",
                    on_screen_text: "",
                    visual_description: "Presenter speaking directly to camera with occasional cutaways to slides"
                },
                {
                    start: 30,
                    end: 60,
                    setting: "Screen recording or slide presentation",
                    on_screen_text: "Key bullet points and diagrams",
                    visual_description: "Demonstration of software interface with mouse cursor movement"
                }
            ],
            branding_and_graphics: [
                {
                    timecode: 0,
                    type: "logo",
                    description: "Company logo displayed in top corner throughout"
                }
            ],
            visual_anomalies: [],
            production_aesthetics: {
                color_palette: ["Professional blue", "Clean white", "Dark gray"],
                lighting_style: "Naturalistic studio lighting",
                camera_techniques: ["Talking head", "Screen recording overlay"]
            }
        }),
        usage: { promptTokens: 200, completionTokens: 350, totalTokens: 550 },
        cost: 0,
        requestId: `dummy_vision_${Date.now()}`
    };
}
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
const SEED_TEMPLATES = [
    // Transcription
    {
        label: 'Transcription < 1 min',
        module_name: 'transcription',
        duration_min: 0,
        duration_max: 60,
        template_data: generateDummyTranscription(30)
    },
    {
        label: 'Transcription < 30 min',
        module_name: 'transcription',
        duration_min: 60,
        duration_max: 1800,
        template_data: generateDummyTranscription(600)
    },
    {
        label: 'Transcription ≥ 30 min',
        module_name: 'transcription',
        duration_min: 1800,
        duration_max: 0,
        template_data: generateDummyTranscription(3600)
    },
    // Subtitles
    {
        label: 'Subtitles < 1 min',
        module_name: 'subtitles',
        duration_min: 0,
        duration_max: 60,
        template_data: generateDummySubtitles(30)
    },
    {
        label: 'Subtitles < 30 min',
        module_name: 'subtitles',
        duration_min: 60,
        duration_max: 1800,
        template_data: generateDummySubtitles(600)
    },
    {
        label: 'Subtitles ≥ 30 min',
        module_name: 'subtitles',
        duration_min: 1800,
        duration_max: 0,
        template_data: generateDummySubtitles(3600)
    },
    // Metadata
    {
        label: 'Metadata < 1 min',
        module_name: 'metadata',
        duration_min: 0,
        duration_max: 60,
        template_data: generateDummyMetadata(30)
    },
    {
        label: 'Metadata < 30 min',
        module_name: 'metadata',
        duration_min: 60,
        duration_max: 1800,
        template_data: generateDummyMetadata(600)
    },
    {
        label: 'Metadata ≥ 30 min',
        module_name: 'metadata',
        duration_min: 1800,
        duration_max: 0,
        template_data: generateDummyMetadata(3600)
    },
    // Ad Breaks
    {
        label: 'Ad Breaks < 1 min',
        module_name: 'ad_breaks',
        duration_min: 0,
        duration_max: 60,
        template_data: generateDummyAdBreaks(30)
    },
    {
        label: 'Ad Breaks < 30 min',
        module_name: 'ad_breaks',
        duration_min: 60,
        duration_max: 1800,
        template_data: generateDummyAdBreaks(600)
    },
    {
        label: 'Ad Breaks ≥ 30 min',
        module_name: 'ad_breaks',
        duration_min: 1800,
        duration_max: 0,
        template_data: generateDummyAdBreaks(3600)
    },
    // Promo Breaks
    {
        label: 'Viral Highlights < 1 min',
        module_name: 'promo_breaks',
        duration_min: 0,
        duration_max: 60,
        template_data: generateDummyPromoBreaks(30)
    },
    {
        label: 'Viral Highlights < 30 min',
        module_name: 'promo_breaks',
        duration_min: 60,
        duration_max: 1800,
        template_data: generateDummyPromoBreaks(600)
    },
    {
        label: 'Viral Highlights ≥ 30 min',
        module_name: 'promo_breaks',
        duration_min: 1800,
        duration_max: 0,
        template_data: generateDummyPromoBreaks(3600)
    },
    // Translation
    {
        label: 'Translation < 1 min',
        module_name: 'subtitle_translation',
        duration_min: 0,
        duration_max: 60,
        template_data: generateDummyTranslation(30)
    },
    {
        label: 'Translation < 30 min',
        module_name: 'subtitle_translation',
        duration_min: 60,
        duration_max: 1800,
        template_data: generateDummyTranslation(600)
    },
    {
        label: 'Translation ≥ 30 min',
        module_name: 'subtitle_translation',
        duration_min: 1800,
        duration_max: 0,
        template_data: generateDummyTranslation(3600)
    },
    // Vision AI
    {
        label: 'Vision Analysis',
        module_name: 'vision_ai',
        duration_min: 0,
        duration_max: 0,
        template_data: generateDummyVisionAI()
    },
];
function getSeedTemplates() {
    return SEED_TEMPLATES;
}
