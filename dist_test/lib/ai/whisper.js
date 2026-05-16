"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperClient = void 0;
const openai_1 = __importStar(require("openai"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class WhisperClient {
    constructor(config) {
        this.client = new openai_1.default({
            apiKey: config.apiKey
        });
        this.model = config.model || 'whisper-1';
    }
    async transcribe(audioPath) {
        try {
            console.log(`[Whisper API] Transcribing: ${audioPath}`);
            // Check file size (Whisper has 25MB limit)
            const stats = fs_1.default.statSync(audioPath);
            const fileSizeMB = stats.size / (1024 * 1024);
            if (fileSizeMB > 25) {
                throw new Error(`Audio file too large (${fileSizeMB.toFixed(2)}MB). Max 25MB. Consider chunking.`);
            }
            const filename = path_1.default.basename(audioPath).includes('.') ? path_1.default.basename(audioPath) : `${path_1.default.basename(audioPath)}.mp3`;
            const response = await this.client.audio.transcriptions.create({
                file: await (0, openai_1.toFile)(fs_1.default.createReadStream(audioPath), filename, { type: 'audio/mpeg' }),
                model: this.model,
                response_format: 'verbose_json',
                timestamp_granularities: ['segment']
            });
            // Calculate cost: $0.006 per minute
            const durationMinutes = (response.duration || 0) / 60;
            const cost = durationMinutes * 0.006;
            const segments = (response.segments || []).map((seg, idx) => ({
                id: idx,
                start: seg.start,
                end: seg.end,
                text: seg.text.trim()
            }));
            console.log(`[Whisper API] Transcription complete: ${segments.length} segments, ${durationMinutes.toFixed(2)} mins, $${cost.toFixed(4)}`);
            return {
                text: response.text,
                segments,
                language: response.language || 'en',
                duration: response.duration || 0,
                cost
            };
        }
        catch (error) {
            console.error('[Whisper API] Transcription Error:', error.message);
            throw new Error(`Whisper transcription failed: ${error.message}`);
        }
    }
    async transcribeWithRetry(audioPath, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.transcribe(audioPath);
            }
            catch (error) {
                lastError = error;
                console.log(`[Whisper API] Retry ${attempt}/${maxRetries} after error:`, error.message);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                }
            }
        }
        throw lastError || new Error('Whisper transcription failed after retries');
    }
}
exports.WhisperClient = WhisperClient;
