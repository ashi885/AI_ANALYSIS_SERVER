import OpenAI, { toFile } from 'openai';
import fs from 'fs';
import path from 'path';

export interface WhisperConfig {
    apiKey: string;
    model?: string;
}

export interface TranscriptionSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface TranscriptionResult {
    text: string;
    segments: TranscriptionSegment[];
    language: string;
    duration: number;
    cost: number;
    requestId?: string;
}

export class WhisperClient {
    private client: OpenAI;
    private model: string;

    constructor(config: WhisperConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey
        });
        this.model = config.model || 'whisper-1';
    }

    async transcribe(audioPath: string): Promise<TranscriptionResult> {
        try {
            console.log(`[Whisper API] Transcribing: ${audioPath}`);

            // Check file size (Whisper has 25MB limit)
            const stats = fs.statSync(audioPath);
            const fileSizeMB = stats.size / (1024 * 1024);

            if (fileSizeMB > 25) {
                throw new Error(`Audio file too large (${fileSizeMB.toFixed(2)}MB). Max 25MB. Consider chunking.`);
            }

            const filename = path.basename(audioPath).includes('.') ? path.basename(audioPath) : `${path.basename(audioPath)}.mp3`;
            const response = await this.client.audio.transcriptions.create({
                file: await toFile(fs.createReadStream(audioPath), filename, { type: 'audio/mpeg' }),
                model: this.model,
                response_format: 'verbose_json',
                timestamp_granularities: ['segment']
            });

            // Calculate cost: $0.006 per minute
            const durationMinutes = (response.duration || 0) / 60;
            const cost = durationMinutes * 0.006;

            const segments: TranscriptionSegment[] = (response.segments || []).map((seg: any, idx: number) => ({
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
                cost,
                requestId: (response as any).id || `whisper_${Date.now()}`
            };
        } catch (error: any) {
            console.error('[Whisper API] Transcription Error:', error.message);
            throw new Error(`Whisper transcription failed: ${error.message}`);
        }
    }

    async transcribeWithRetry(audioPath: string, maxRetries = 3): Promise<TranscriptionResult> {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.transcribe(audioPath);
            } catch (error: any) {
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
