
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const https = require('https');

const DB_PATH = path.resolve(__dirname, '../data/management.db');
const targetLocalJobId = 'CUP-260419-450D';
const languages = ['en', 'ko'];

if (!fs.existsSync(DB_PATH)) {
    console.error("Database not found at:", DB_PATH);
    process.exit(1);
}

const db = new Database(DB_PATH);

// Helper for partition logic (copied from job-processor.ts)
function partitionTranscript(segments, maxWindowSeconds = 900, maxChars = 30000) {
    if (!segments || segments.length === 0) return [];
    
    const chunks = [];
    let currentChunk = [];
    let currentText = '';
    let currentStart = segments[0].start;
    
    for (const seg of segments) {
        const timestamp = `[${seg.start.toFixed(2)}]`;
        const segmentLine = `${timestamp} ${seg.text}`;
        const potentialText = currentText + (currentText ? '\n' : '') + segmentLine;
        const potentialDuration = seg.end - currentStart;

        if (currentChunk.length > 0 && (potentialDuration > maxWindowSeconds || potentialText.length > maxChars)) {
            chunks.push({
                segments: currentChunk,
                text: currentText,
                start: currentStart,
                end: currentChunk[currentChunk.length - 1].end
            });
            currentChunk = [];
            currentText = '';
            currentStart = seg.start;
        }

        currentChunk.push(seg);
        currentText += (currentText ? '\n' : '') + segmentLine;
    }

    if (currentChunk.length > 0) {
        chunks.push({
            segments: currentChunk,
            text: currentText,
            start: currentStart,
            end: currentChunk[currentChunk.length - 1].end
        });
    }
    return chunks;
}

async function callOpenRouter(apiKey, messages, model) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.3,
            max_tokens: 4000,
            response_format: { type: "json_object" }
        });

        const req = https.request({
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://cuepoint.ai',
                'X-Title': 'Cuepoint Deep Repair'
            }
        }, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed.choices && parsed.choices[0]) {
                        resolve(parsed.choices[0].message.content);
                    } else {
                        reject(new Error(`OR Error: ${body}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function formatAsSRT(segments) {
    return segments.map((seg, i) => {
        const start = formatTimestamp(seg.start);
        const end = formatTimestamp(seg.end);
        return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    }).join('\n');
}

function formatTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

async function runRepair() {
    try {
        console.log(`[DEEP REPAIR] Fetching Job & API Key...`);
        const job = db.prepare('SELECT id, result_data, client_id FROM ai_jobs WHERE local_job_id = ?').get(targetLocalJobId);
        if (!job) throw new Error("Job not found.");

        const keyRow = db.prepare("SELECT value FROM settings WHERE client_id = ? AND key = 'api_key_openrouter'").get(job.client_id);
        if (!keyRow) throw new Error("API Key not found.");
        const apiKey = keyRow.value;

        const results = JSON.parse(job.result_data || '[]');
        const transcription = results.find(r => r.module_name === 'transcription');
        if (!transcription || !transcription.result_data.segments) throw new Error("Transcription segments missing.");

        const originalSegments = transcription.result_data.segments;
        const chunks = partitionTranscript(originalSegments, 600, 15000); // 10 min chunks, smaller for safety
        console.log(`[DEEP REPAIR] Partitioned into ${chunks.length} chunks.`);

        for (const lang of languages) {
            console.log(`[DEEP REPAIR] Starting translation for ${lang}...`);
            let allTranslatedSegments = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`  - Processing chunk ${i + 1}/${chunks.length} (${Math.round(chunk.start)}s - ${Math.round(chunk.end)}s)`);
                
                const systemPrompt = `You are a professional subtitle translator. 
Translate the provided timecoded segments into ${lang.toUpperCase()}.
CRITICAL RULES:
1. OUTPUT JSON ONLY.
2. Structure: { "segments": [ { "start": 0.0, "end": 2.0, "text": "Translated text" }, ... ] }
3. KEEP THE ORIGINAL TIMECODES EXACTLY.
4. MAXIMUM 50 CHARACTERS PER SEGMENT. If a segment is too long, split it into two segments with adjusted timings or condense the meaning.
5. Maintain professional tone and context.`;

                const content = await callOpenRouter(apiKey, [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: chunk.text }
                ], 'anthropic/claude-3.5-sonnet');

                const parsed = JSON.parse(content);
                const translated = parsed.segments || [];
                allTranslatedSegments.push(...translated);
                console.log(`    ✓ Recovered ${translated.length} segments.`);
            }

            // Update result_data in the array
            const type = `subtitle_${lang}`;
            const repairedEntry = {
                module_name: 'subtitle_translation',
                result_type: type,
                result_data: {
                    language: lang,
                    segments: allTranslatedSegments,
                    srt: formatAsSRT(allTranslatedSegments),
                    vtt: "REPAIRED"
                },
                processing_time_ms: 0,
                api_cost: 0,
                provider_cost: 0,
                repaired: true
            };

            const existingIdx = results.findIndex(r => r.result_type === type);
            if (existingIdx !== -1) results[existingIdx] = repairedEntry;
            else results.push(repairedEntry);

            console.log(`[DEEP REPAIR] Completed ${lang}. Total segments: ${allTranslatedSegments.length}`);
        }

        db.prepare("UPDATE ai_jobs SET result_data = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
            JSON.stringify(results), job.id
        );
        console.log(`\n✅ DEEP REPAIR SUCCESS: All translations recovered and batch-processed.`);

    } catch (err) {
        console.error('❌ DEEP REPAIR FAILED:', err.message);
    } finally {
        db.close();
    }
}

runRepair();
