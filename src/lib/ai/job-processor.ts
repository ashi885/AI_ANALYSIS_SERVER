import fs from 'fs';
import path from 'path';
import { WhisperClient } from './whisper';
import { OpenRouterClient } from './openrouter';
import { 
    getClientApiKey, logApiRequest, getDatabase, getModulePricing, 
    logClientUsage, getClientModuleSettings, getClientAIExamples, 
    getTieredValue, getUserSetting, getAiJob, getGlobalDefaultModel
} from '../../db-mgmt';
import { getClientModels } from '../../middleware/license';
import { buildPromptParts } from '../../routes/analyze';
import { logger } from '../../logger';

// Job Processor logic
export async function processAiJob(jobId: string, audioPath: string, modulesRequested: string[], clientId: number, clientName: string, durationRequested: number | null = null, targetLanguages?: string[], abortSignal?: AbortSignal) {
    const db = getDatabase();
    let totalCost = 0;
    let billedTotalCost = 0;
    const resultData: any[] = [];
    const failedModules: string[] = [];
    const successfulModules: string[] = [];

    // Fetch job details for output naming/path purposes
    const job = getAiJob(jobId);
    const userId = job?.user_id;
    const originalFilename = job?.filename || 'job_result';
    const outputDir = userId ? getUserSetting(userId, 'output_directory') : null;

    if (outputDir) {
        logger.info('AI', 'AUTO_OUTPUT_ENABLED', `Job ${jobId} will output results to ${outputDir}`, { originalFilename });
    }

    // Helper to safely write to output directory using templates
    const saveToOutput = async (moduleName: string, data: any, extension: string = 'json', customSuffix?: string) => {
        if (!outputDir || !fs.existsSync(outputDir)) return;
        
        try {
            const { renderTemplate } = await import('../../utils/template-engine');
            const { content, extension: finalExt } = await renderTemplate(moduleName, data, clientId);

            const baseName = originalFilename.includes('.') 
                ? originalFilename.substring(0, originalFilename.lastIndexOf('.')) 
                : originalFilename;
            
            const suffix = customSuffix || (moduleName === 'subtitles' ? '' : `_${moduleName}`);
            const fileName = `${baseName}${suffix}.${finalExt}`;
            const fullPath = path.join(outputDir, fileName);
            
            fs.writeFileSync(fullPath, content);
            logger.info('AI', 'AUTO_OUTPUT_SAVED', `Saved ${moduleName} output to ${fullPath} (Template: ${finalExt})`);
        } catch (e: any) {
            logger.error('AI', 'AUTO_OUTPUT_FAILED', `Failed to save ${moduleName} output: ${e.message}`);
        }
    };

    try {
        // Check for existing results - useful for partial reruns
        const existingJob = db.prepare('SELECT result_data FROM ai_jobs WHERE id = ?').get(jobId) as { result_data: string } | undefined;
        const existingResults = existingJob?.result_data ? JSON.parse(existingJob.result_data) : [];
        
        // Build a map of existing results by unique result type for granular lookup
        const existingResultsMap: Record<string, any> = {};
        for (const r of existingResults) {
            const key = r.result_type || r.resultType || r.module_name || r.moduleName;
            if (r.result_data && !r.result_data.error) {
                existingResultsMap[key] = r.result_data;
            } else if (r.resultData && !r.resultData.error) {
                existingResultsMap[key] = r.resultData;
            }
        }

        const globalFallback = await getGlobalDefaultModel();

        // Helper to update job status
        const updateSubStatus = (status: string) => {
            if (abortSignal?.aborted) throw new Error('AbortError');
            db.prepare('UPDATE ai_jobs SET sub_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, jobId);
            logger.info('AI', 'JOB_STATUS_UPDATE', `Job ${jobId}: ${status}`);
        };

        const whisperApiKey = await getClientApiKey(clientId, 'openai');
        if (!whisperApiKey) throw new Error('OpenAI API key missing for transcription');

        const openRouterApiKey = await getClientApiKey(clientId, 'openrouter');
        const hasOpenRouter = !!openRouterApiKey && modulesRequested.some((m: string) => m !== 'transcription');
        if (hasOpenRouter && !openRouterApiKey) {
            throw new Error('OpenRouter API key missing for analysis modules');
        }

        const configuredModels = await getClientModels(clientId);

        // 1. Transcription (Blocking - needed for other modules) - skip if already exists
        let transcriptionResult = null;
        
        if (modulesRequested.includes('transcription') && !existingResultsMap['transcription']) {
            updateSubStatus('Transcribing audio...');
            const whisperModel = configuredModels.find((m: any) => m.module_name === 'transcription')?.api_model || 'whisper-1';
            const pricingTranscription = await getModulePricing(clientId, 'transcription', durationRequested || 0);
            const billablePriceTranscription = pricingTranscription?.cost_per_job || 0;
            
            const transcriber = new WhisperClient({ apiKey: whisperApiKey, model: whisperModel });

            logger.ai('AI_TRANSCRIPTION_REQUEST', `Job ${jobId} transcribing audio`, { 
                clientId, 
                clientName, 
                details: {
                    model: whisperModel,
                    billedRate: billablePriceTranscription
                }
            });

            const startTimeTranscription = Date.now();
            let processingTimeTranscription = 0;
            let actualTranscriptionCost = 0;
            try {
                transcriptionResult = await transcriber.transcribeWithRetry(audioPath);
                processingTimeTranscription = Date.now() - startTimeTranscription;

                actualTranscriptionCost = transcriptionResult.cost || 0;
                billedTotalCost += billablePriceTranscription;

                logger.ai('AI_TRANSCRIPTION_RESPONSE', `Job ${jobId} transcription complete`, {
                    clientId,
                    jobId,
                    details: {
                        model: whisperModel,
                        latencyMs: processingTimeTranscription,
                        actualCost: actualTranscriptionCost,
                        billedToClient: billablePriceTranscription,
                        textSample: transcriptionResult.text?.substring(0, 500) + '...'
                    }
                });

                logApiRequest({
                    clientId, provider: 'whisper', endpoint: 'openai.audio.transcriptions', model: whisperModel, direction: 'outgoing',
                    responseStatus: 200, costUsd: actualTranscriptionCost, latencyMs: processingTimeTranscription,
                    tokensUsed: Math.ceil((transcriptionResult.duration || 0) / 60 * 150),
                    billedCost: billablePriceTranscription,
                    parentJobId: jobId, requestId: 'whisper-' + Date.now(),
                    requestBody: { audioPath },
                    responseBody: { text: transcriptionResult.text?.substring(0, 50000) }
                });
            } catch (transcribeErr: any) {
                const processingTimeTranscription = Date.now() - startTimeTranscription;
                let statusCode = 500;
                const statusMatch = transcribeErr.message?.match(/\b(400|401|403|429|500|503)\b/);
                if (statusMatch) {
                    statusCode = parseInt(statusMatch[1]);
                }

                logApiRequest({
                    clientId, provider: 'whisper', endpoint: 'openai.audio.transcriptions', model: whisperModel, direction: 'outgoing',
                    responseStatus: statusCode, costUsd: 0, latencyMs: processingTimeTranscription,
                    tokensUsed: 0, billedCost: 0, parentJobId: jobId, requestId: 'whisper-' + Date.now(),
                    requestBody: { audioPath },
                    responseBody: { error: transcribeErr.message },
                    errorMessage: transcribeErr.message
                });
                throw transcribeErr;
            }

            await logClientUsage({
                clientId, 
                jobId: jobId,
                moduleName: 'transcription',
                provider: 'openai',
                model: whisperModel,
                status: 'success',
                costUsd: billablePriceTranscription,
                actualCostUsd: actualTranscriptionCost,
                latencyMs: processingTimeTranscription,
                pricingId: pricingTranscription?.id,
                requestId: 'whisper-' + Date.now(),
                durationSeconds: transcriptionResult.duration || 0
            });

            resultData.push({
                moduleName: 'transcription',
                module_name: 'transcription',
                resultData: {
                    text: transcriptionResult.text,
                    segments: transcriptionResult.segments,
                    language: transcriptionResult.language || 'en',
                    duration: transcriptionResult.duration || 0,
                    srt: formatAsSRT(transcriptionResult.segments || []),
                    vtt: formatAsVTT(transcriptionResult.segments || [])
                },
                result_data: {
                    text: transcriptionResult.text,
                    segments: transcriptionResult.segments,
                    language: transcriptionResult.language || 'en',
                    duration: transcriptionResult.duration || 0,
                    srt: formatAsSRT(transcriptionResult.segments || []),
                    vtt: formatAsVTT(transcriptionResult.segments || [])
                },
                processingTimeMs: processingTimeTranscription,
                processing_time_ms: processingTimeTranscription,
                apiCost: billablePriceTranscription,
                api_cost: billablePriceTranscription,
                providerCost: actualTranscriptionCost,
                provider_cost: actualTranscriptionCost
            });
            successfulModules.push('transcription');
            
            // Auto-output transcription
            await saveToOutput('transcription', transcriptionResult.text, 'txt');

            // ✅ Sync progress after transcription
            db.prepare('UPDATE ai_jobs SET result_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
                JSON.stringify(resultData), jobId
            );
            logger.info('AI', 'JOB_PROGRESS_SYNC', `Synced transcription for Job ${jobId}`);
        } else if (existingResultsMap['transcription']) {
            logger.ai('AI_TRANSCRIPTION_SKIPPED', `Job ${jobId} using existing transcription`, { clientId, jobId });
            resultData.push({
                moduleName: 'transcription',
                module_name: 'transcription',
                resultData: existingResultsMap['transcription'],
                result_data: existingResultsMap['transcription'],
                processingTimeMs: 0,
                processing_time_ms: 0,
                apiCost: 0,
                api_cost: 0,
                providerCost: 0,
                provider_cost: 0,
                reused: true
            });
            successfulModules.push('transcription');
            // Get transcription from existing results for other modules
            transcriptionResult = existingResultsMap['transcription'];
        }

        // Get transcription text for other modules
        if (!transcriptionResult && modulesRequested.some((m: string) => m !== 'transcription')) {
            // Priority 1: Check existing results within the current job 
            if (existingResultsMap['transcription']) {
                transcriptionResult = existingResultsMap['transcription'];
            } 
            // Priority 2: Fallback - Check siblings (other jobs for the same asset)
            else if (job?.local_job_id) {
                const localId = job.local_job_id;
                logger.info('AI', 'TRANSCRIPTION_FALLBACK', `Searching for existing transcription for asset ${localId}`);
                
                try {
                    const siblingJob = db.prepare(`
                        SELECT result_data FROM ai_jobs 
                        WHERE local_job_id = ? 
                        AND status IN ('completed', 'partial')
                        AND result_data LIKE '%"moduleName":"transcription"%'
                        AND id != ?
                        ORDER BY created_at DESC LIMIT 1
                    `).get(localId, jobId) as { result_data: string } | undefined;

                    if (siblingJob?.result_data) {
                        const siblingResults = JSON.parse(siblingJob.result_data);
                        const sibTranscription = siblingResults.find((r: any) => r.moduleName === 'transcription');
                        
                        if (sibTranscription) {
                            transcriptionResult = sibTranscription.resultData;
                            logger.info('AI', 'TRANSCRIPTION_RECOVERED', `Found transcription from sibling job for ${localId}`);
                            
                            // Re-inject into resultData so it shows up in this job's output
                            resultData.push({
                                moduleName: 'transcription',
                                resultData: transcriptionResult,
                                processingTimeMs: 0,
                                apiCost: 0,
                                providerCost: 0,
                                reused: true
                            });
                            successfulModules.push('transcription');
                        }
                    }
                } catch (e: any) {
                    logger.error('AI', 'TRANSCRIPTION_FALLBACK_FAILED', `Error looking up sibling transcription: ${e.message}`);
                }
            }

            // Final check
            if (!transcriptionResult) {
                throw new Error('Transcription required but not available. Please run transcription first.');
            }
        }

        // Dynamically update file_duration column if it is currently 0 or null
        const activeDuration = transcriptionResult?.duration || durationRequested || 0;
        if (activeDuration > 0) {
            durationRequested = activeDuration;
            try {
                const currentJob = db.prepare('SELECT file_duration FROM ai_jobs WHERE id = ?').get(jobId) as { file_duration: number } | undefined;
                if (!currentJob || !currentJob.file_duration || currentJob.file_duration === 0) {
                    db.prepare('UPDATE ai_jobs SET file_duration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(activeDuration, jobId);
                    logger.info('AI', 'DURATION_UPDATED', `Updated file_duration for Job ${jobId} to ${activeDuration} seconds`);
                }
            } catch (err: any) {
                logger.error('AI', 'DURATION_UPDATE_FAILED', `Failed to update file_duration in DB: ${err.message}`);
            }
        }

        // Add subtitles - skip if already exists
        if (modulesRequested.includes('subtitles') && !existingResultsMap['subtitles']) {
            updateSubStatus('Generating subtitles...');
            const model = configuredModels.find((m: any) => m.module_name === 'subtitles')?.api_model || globalFallback;
            if (!model) {
                throw new Error('No AI model configured for subtitles and no global fallback set. Please configure an AI model.');
            }
            const pricingSubs = await getModulePricing(clientId, 'subtitles', transcriptionResult?.duration || durationRequested || 0);
            const billablePriceSubs = pricingSubs?.cost_per_job || 0;
            billedTotalCost += billablePriceSubs;

            await logClientUsage({
                clientId, 
                jobId: jobId,
                moduleName: 'subtitles',
                provider: 'internal',
                model: 'cuepoint-formatter',
                status: 'success',
                costUsd: billablePriceSubs,
                actualCostUsd: 0,
                latencyMs: 10,
                pricingId: pricingSubs?.id,
                durationSeconds: transcriptionResult?.duration || durationRequested || 0
            });

            logApiRequest({
                clientId, provider: 'internal', endpoint: '/api/ai/job/subtitles', model: 'cuepoint-formatter', direction: 'outgoing',
                responseStatus: 200, costUsd: 0, latencyMs: 10,
                billedCost: billablePriceSubs,
                parentJobId: jobId, requestId: 'subtitles-' + Date.now(),
                requestBody: { transcriptSample: transcriptionResult?.text?.substring(0, 5000) },
                responseBody: { 
                    srt: formatAsSRT(transcriptionResult?.segments || []).substring(0, 50000),
                    segmentsCount: transcriptionResult?.segments?.length || 0 
                }
            });

            resultData.push({
                moduleName: 'subtitles',
                module_name: 'subtitles',
                resultData: {
                    segments: transcriptionResult?.segments || [],
                    srt: formatAsSRT(transcriptionResult?.segments || []),
                    vtt: formatAsVTT(transcriptionResult?.segments || []),
                    language: transcriptionResult?.language || 'en'
                },
                result_data: {
                    segments: transcriptionResult?.segments || [],
                    srt: formatAsSRT(transcriptionResult?.segments || []),
                    vtt: formatAsVTT(transcriptionResult?.segments || []),
                    language: transcriptionResult?.language || 'en'
                },
                processingTimeMs: 0,
                processing_time_ms: 0,
                apiCost: billablePriceSubs,
                api_cost: billablePriceSubs,
                providerCost: 0,
                provider_cost: 0
            });
            successfulModules.push('subtitles');

            // Auto-output subtitles (SRT)
            if (resultData[resultData.length - 1].resultData.srt) {
                await saveToOutput('subtitles', resultData[resultData.length - 1].resultData.srt, 'srt');
            }

            // ✅ Sync progress after subtitles
            db.prepare('UPDATE ai_jobs SET result_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
                JSON.stringify(resultData), jobId
            );
            logger.info('AI', 'JOB_PROGRESS_SYNC', `Synced subtitles for Job ${jobId}`);
        } else if (existingResultsMap['subtitles']) {
            resultData.push({
                moduleName: 'subtitles',
                module_name: 'subtitles',
                resultData: existingResultsMap['subtitles'],
                result_data: existingResultsMap['subtitles'],
                processingTimeMs: 0,
                processing_time_ms: 0,
                apiCost: 0,
                api_cost: 0,
                providerCost: 0,
                provider_cost: 0,
                reused: true
            });
            successfulModules.push('subtitles');
        }

        // 2. Run selected OpenRouter modules - skip existing successful ones
        const otherModules = modulesRequested.filter((m: string) => m !== 'transcription' && m !== 'subtitles');
        
        if (otherModules.length > 0 && openRouterApiKey) {
            const orClient = new OpenRouterClient({ apiKey: openRouterApiKey });

            // Filter out modules that already have successful results
            const modulesToProcess = otherModules.filter((m: string) => !existingResultsMap[m]);
            
            if (modulesToProcess.length === 0) {
                logger.ai('AI_ALL_MODULES_SKIPPED', `Job ${jobId} all modules already completed`, { clientId, jobId });
            } else {
                const clientSettings = await getClientModuleSettings(clientId);
                const globalGuidelines = clientSettings.global?.guidelines || '';

                const openRouterApiKey = await getClientApiKey(clientId, 'openrouter');
                const orClient = new OpenRouterClient({ apiKey: openRouterApiKey! });

                const modulePromises = modulesToProcess.map(async (moduleName: string) => {
                    let model = configuredModels.find((m: any) => m.module_name === moduleName)?.api_model;
                    if (!model) {
                        model = globalFallback;
                        if (!model) {
                            logger.warn('AI', 'NO_MODEL_CONFIGURED', `No model configured for module ${moduleName} and no global fallback set. Skipping module.`, { clientId, moduleName });
                            return null;
                        }
                        logger.warn('AI', 'USING_GLOBAL_FALLBACK', `No model configured for module ${moduleName}, defaulting to global setting: ${model}`, { clientId, moduleName });
                    }

                    const duration = durationRequested || transcriptionResult?.duration || 0;
                    const pricing = await getModulePricing(clientId, moduleName, duration);
                    const billablePrice = pricing?.cost_per_job || 0;
                    const settings = clientSettings[moduleName] || {};
                    const transcriptionModule = resultData.find(r => r.module_name === 'transcription' || r.moduleName === 'transcription');
                    const transcriptSegments = transcriptionModule?.result_data?.segments || transcriptionModule?.resultData?.segments || transcriptionResult?.segments || [];
                    const transcriptText = transcriptionResult?.text || '';

                    // Helper for a single AI request
                    const callAI = async (mName: string, transcript: string, params: Record<string, any> = {}) => {
                        if (abortSignal?.aborted) throw new Error('AbortError');
                        
                        // Fetch verified examples for this module (Learning Loop)
                        const examples = await getClientAIExamples(clientId, mName);
                        
                        const { system, user } = buildPromptParts(mName, transcript, {
                            ...params,
                            guidelines: globalGuidelines,
                            examples
                        });
                        
                        const startTime = Date.now();
                        try {
                            const result = await orClient.completeWithRetry({
                                messages: [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }],
                                model: model!, temperature: 0.7, maxTokens: 8192
                            });
                            const latency = Date.now() - startTime;
                            const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
                            const tokens = (usage.promptTokens || 0) + (usage.completionTokens || 0);

                            // Track billing on first request for visibility in Audit Logs (Child Card)
                            const billedCostForLog = params._isFirstCall ? params._billablePrice : 0;

                            logApiRequest({
                                clientId, provider: 'openrouter', endpoint: `/api/ai/job/${mName}`, model: model!, direction: 'outgoing',
                                responseStatus: 200, costUsd: result.cost || 0, latencyMs: latency, tokensUsed: tokens, requestId: result.id, parentJobId: jobId,
                                billedCost: Number(billedCostForLog) || 0,
                                requestBody: { system, user }, responseBody: { content: result.content?.substring(0, 50000) }
                            });

                            // Robust parsing for AI responses that might include markdown blocks or hallucinated trailing text
                            let parsed: any;
                            const content = result.content?.trim() || '';
                            try {
                                parsed = JSON.parse(content);
                            } catch {
                                try {
                                    // Try extracting from markdown blocks first
                                    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                                    let jsonFragment = match ? match[1].trim() : content;
                                    
                                    try {
                                        parsed = JSON.parse(jsonFragment);
                                    } catch (innerErr) {
                                        // REPAIR ATTEMPT: If it's a translation chunk, try to salvage partial segments
                                        if (mName.startsWith('subtitle_translation')) {
                                            logger.ai('AI_JSON_REPAIR_TRIGGERED', `Attempting to salvage truncated JSON for ${mName}`);
                                            const lastBrace = jsonFragment.lastIndexOf('}');
                                            if (lastBrace !== -1) {
                                                // Look for the last complete object in the segments array
                                                const salvaged = jsonFragment.substring(0, lastBrace + 1) + ']}';
                                                try {
                                                    parsed = JSON.parse(salvaged);
                                                    logger.info('AI', 'JSON_REPAIRED', `Successfully salvaged segments from truncated response`);
                                                } catch (e) {
                                                    // If that failed, maybe it's just a raw array
                                                    try {
                                                        parsed = JSON.parse(jsonFragment.substring(0, lastBrace + 1) + ']');
                                                    } catch (e2) {}
                                                }
                                            }
                                        }

                                        if (!parsed) {
                                            // Try finding the largest JSON object or array structure
                                            const startBracket = content.indexOf('[');
                                            const startBrace = content.indexOf('{');
                                            let start = (startBracket !== -1 && startBrace !== -1) ? Math.min(startBracket, startBrace) : (startBracket !== -1 ? startBracket : startBrace);
                                            
                                            if (start !== -1) {
                                                const end = content.lastIndexOf(content[start] === '[' ? ']' : '}');
                                                if (end > start) {
                                                    jsonFragment = content.substring(start, end + 1).trim();
                                                    parsed = JSON.parse(jsonFragment);
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    logger.warn('AI', 'PARSE_RECOVERY_FAILED', `Failed to recover JSON from response: ${e.message}`);
                                }
                            }
                            return { data: parsed || { raw: content }, cost: result.cost || 0, tokens, latency };
                        } catch (err: any) {
                            const latency = Date.now() - startTime;
                            let statusCode = 500;
                            const statusMatch = err.message?.match(/\b(400|401|403|429|500|503)\b/);
                            if (statusMatch) {
                                statusCode = parseInt(statusMatch[1]);
                            }

                            logApiRequest({
                                clientId, provider: 'openrouter', endpoint: `/api/ai/job/${mName}`, model: model!, direction: 'outgoing',
                                responseStatus: statusCode, costUsd: 0, latencyMs: latency, tokensUsed: 0, parentJobId: jobId,
                                requestBody: { system, user }, responseBody: { error: err.message },
                                errorMessage: err.message
                            });
                            throw err;
                        }
                    };

                    // Special handling for Subtitle Translation (supports multiple languages)
                    if (moduleName === 'subtitle_translation') {
                        const rawLangs = targetLanguages || settings.target_language || 'es';
                        const languages = Array.isArray(rawLangs) 
                            ? rawLangs 
                            : (typeof rawLangs === 'string' ? rawLangs.split(',').map(l => l.trim()) : [rawLangs]);

                        const translationResults: any[] = [];
                        
                        const langMap: Record<string, string> = {
                            'english': 'en', 'eng': 'en', 'chinese': 'zh', 'chi': 'zh', 'zho': 'zh',
                            'korean': 'ko', 'kor': 'ko', 'spanish': 'es', 'esp': 'es',
                            'french': 'fr', 'fra': 'fr', 'german': 'de', 'deu': 'de',
                            'japanese': 'ja', 'jpn': 'ja'
                        };

                        const rawDetected = (transcriptionResult?.language || 'en').toLowerCase();
                        const sourceLanguage = langMap[rawDetected] || rawDetected;

                        for (const lang of languages) {
                            const targetLang = lang.toLowerCase();
                            const normalizedTarget = langMap[targetLang] || targetLang;
                            
                            updateSubStatus(`Translating to ${lang}...`);

                            if (normalizedTarget === sourceLanguage || (sourceLanguage === 'en' && normalizedTarget === 'eng')) {
                                continue;
                            }

                            const targetKey = `subtitle_${normalizedTarget}`;
                            
                            // Check if we already have a successful result for this language
                            if (existingResultsMap[targetKey] && !existingResultsMap[targetKey].partial) {
                                logger.ai('AI_TRANSLATION_SKIPPED', `Job ${jobId} using existing ${lang} translation`, { clientId, jobId });
                                translationResults.push({
                                    module_name: 'subtitle_translation',
                                    result_type: targetKey,
                                    result_data: existingResultsMap[targetKey],
                                    processing_time_ms: 0, api_cost: 0, provider_cost: 0, reused: true
                                });
                                continue;
                            }

                            const suffixedModuleName = `subtitle_translation-${normalizedTarget}`;
                            const transcriptionModule = resultData.find(r => r.module_name === 'transcription' || r.moduleName === 'transcription');
                            const transcriptSegments = transcriptionModule?.result_data?.segments || transcriptionModule?.resultData?.segments || transcriptionResult?.segments || [];
                            
                            const existingData = existingResultsMap[targetKey];
                            const existingCount = (existingData?.segments || []).length;
                            
                            const allChunks = partitionTranscript(transcriptSegments, 600, 15000); 
                            
                            let chunksToProcess = allChunks;
                            let allTranslatedSegments: any[] = [...(existingData?.segments || [])];
                            let totalCost = 0;
                            let totalTokens = 0;
                            let totalLatency = 0;

                            try {
                                if (existingCount > 0) {
                                    const segmentsPerChunk = transcriptSegments.length / allChunks.length;
                                    const completedChunksCount = Math.floor(existingCount / segmentsPerChunk);
                                    if (completedChunksCount > 0 && completedChunksCount < allChunks.length) {
                                        logger.ai('AI_TRANSLATION_RESUMING', `Resuming ${lang} for Job ${jobId} from chunk ${completedChunksCount}`, { clientId, jobId });
                                        chunksToProcess = allChunks.slice(completedChunksCount);
                                    }
                                }

                                logger.ai('AI_TRANSLATION_BATCHING', `Translating ${lang} in ${chunksToProcess.length} batches for Job ${jobId}`);

                                for (let i = 0; i < chunksToProcess.length; i++) {
                                    const chunk = chunksToProcess[i];
                                    const result = await callAI(suffixedModuleName, chunk.text, {
                                        target_language: lang,
                                        _isFirstCall: i === 0,
                                        _billablePrice: billablePrice,
                                        formatting_instructions: "MAXIMUM 50 CHARACTERS PER SEGMENT. Splitting segments if necessary to fit."
                                    });

                                    const dataActual = result.data;
                                    let translatedSegments = dataActual?.segments || (Array.isArray(dataActual) ? dataActual : []);

                                    if (translatedSegments.length === 0 && dataActual?.raw) {
                                        try {
                                            const match = dataActual.raw.match(/\"segments\"\s*:\s*(\[[\s\S]*?\])/);
                                            if (match) translatedSegments = JSON.parse(match[1]);
                                        } catch (e) {}
                                    }

                                    allTranslatedSegments.push(...translatedSegments);
                                    totalCost += result.cost;
                                    totalTokens += result.tokens;
                                    totalLatency += result.latency;
                                }

                                translationResults.push({
                                    module_name: 'subtitle_translation',
                                    moduleName: 'subtitle_translation',
                                    result_type: `subtitle_${normalizedTarget}`,
                                    resultType: `subtitle_${normalizedTarget}`,
                                    result_data: {
                                        language: lang,
                                        segments: allTranslatedSegments,
                                        srt: formatAsSRT(allTranslatedSegments),
                                        vtt: formatAsVTT(allTranslatedSegments)
                                    },
                                    resultData: {
                                        language: lang,
                                        segments: allTranslatedSegments,
                                        srt: formatAsSRT(allTranslatedSegments),
                                        vtt: formatAsVTT(allTranslatedSegments)
                                    },
                                    model: model!,
                                    processing_time_ms: totalLatency,
                                    processingTimeMs: totalLatency,
                                    api_cost: billablePrice,
                                    apiCost: billablePrice,
                                    provider_cost: totalCost,
                                    providerCost: totalCost
                                });

                                if (!successfulModules.includes('subtitle_translation')) {
                                    successfulModules.push('subtitle_translation');
                                }

                                await logClientUsage({
                                    clientId, jobId, moduleName: suffixedModuleName, provider: 'openrouter', model: model!, status: 'success',
                                    costUsd: billablePrice, actualCostUsd: totalCost, tokensUsed: totalTokens, latencyMs: totalLatency,
                                    pricingId: pricing?.id, requestId: `trans_${lang}_${Date.now()}`,
                                    durationSeconds: duration
                                });

                                if (allTranslatedSegments.length > 0) {
                                    await saveToOutput('subtitle_translation', formatAsSRT(allTranslatedSegments), 'srt', `_${normalizedTarget}`);
                                    await saveToOutput('subtitle_translation', formatAsVTT(allTranslatedSegments), 'vtt', `_${normalizedTarget}`);
                                }

                            } catch (langErr: any) {
                                logger.error('AI', 'TRANSLATION_LANG_FAILED', `Translation to ${lang} failed for job ${jobId}: ${langErr.message}`);
                                
                                translationResults.push({
                                    module_name: 'subtitle_translation',
                                    moduleName: 'subtitle_translation',
                                    result_type: `subtitle_${normalizedTarget}`,
                                    resultType: `subtitle_${normalizedTarget}`,
                                    result_data: {
                                        language: lang,
                                        segments: allTranslatedSegments,
                                        error: langErr.message,
                                        partial: true
                                    },
                                    resultData: {
                                        language: lang,
                                        segments: allTranslatedSegments,
                                        error: langErr.message,
                                        partial: true
                                    },
                                    model: model!,
                                    processing_time_ms: totalLatency,
                                    processingTimeMs: totalLatency,
                                    api_cost: 0, 
                                    apiCost: 0, 
                                    provider_cost: totalCost,
                                    providerCost: totalCost
                                });
                                if (!failedModules.includes('subtitle_translation')) {
                                    failedModules.push('subtitle_translation');
                                }
                            }
                        }
                        return translationResults;
                    }

                    try {
                        updateSubStatus(`Analyzing ${moduleName}...`);
                        let finalResultData: any;
                        let totalModuleProviderCost = 0;
                        let totalModuleTokens = 0;
                        let totalModuleLatency = 0;

                        // DECIDE: Chunked or Single Pass
                        const shouldChunk = duration > 900 && (moduleName === 'ad_breaks' || moduleName === 'promo_breaks' || moduleName === 'metadata' || moduleName === 'subtitles');

                        if (shouldChunk) {
                            const chunks = partitionTranscript(transcriptSegments);
                            logger.ai('AI_CHUNKED_PROCESS', `Processing ${moduleName} in ${chunks.length} chunks`, { jobId, details: { duration } });

                            if (moduleName === 'ad_breaks' || moduleName === 'promo_breaks') {
                                // 1. Strategy Calculation: Request more candidates for the synthesis phase
                                const candidatesPerChunk = 3; 
                                
                                // 2. Parallel Candidate Extraction (Pass 1)
                                const chunkResults = await Promise.all(chunks.map((c, i) => callAI(moduleName, c.text, { 
                                    target_count: candidatesPerChunk,
                                    chunk_start: Math.round(c.start),
                                    chunk_end: Math.round(c.end),
                                    _isFirstCall: i === 0,
                                    _billablePrice: billablePrice
                                })));
                                
                                // 3. Master Synthesis (Pass 2)
                                const allCandidates = chunkResults.flatMap(r => (moduleName === 'ad_breaks' ? (r.data.ad_breaks || []) : (r.data.promo_breaks || [])));
                                
                                if (chunks.length > 1) {
                                    logger.ai('AI_SYNTHESIS_START', `Synthesizing ${allCandidates.length} candidates for ${moduleName}`, { jobId });
                                    const synthesis = await callAI(`${moduleName}_synthesis`, '', {
                                        global_target: parseInt(String(getTieredValue(settings.target_frequency || (moduleName === 'ad_breaks' ? '4' : '6'), duration))),
                                        candidates: JSON.stringify(allCandidates),
                                        _isFirstCall: false
                                    });
                                    finalResultData = synthesis.data;
                                    
                                    [...chunkResults, synthesis].forEach(r => {
                                        totalModuleProviderCost += r.cost;
                                        totalModuleTokens += r.tokens;
                                        totalModuleLatency += r.latency;
                                    });
                                } else {
                                    // For single chunks, just use the candidates (but filtered to target if necessary)
                                    // Calculate a sensible default based on duration (approx 1 per 15 mins, min 2)
                                    const sensibleDefault = duration < 600 ? 2 : (duration < 1800 ? 3 : 6);
                                    const targetCount = parseInt(String(getTieredValue(settings.target_frequency, duration) || sensibleDefault));
                                    finalResultData = { [moduleName]: allCandidates.slice(0, targetCount) };
                                    chunkResults.forEach(r => {
                                        totalModuleProviderCost += r.cost;
                                        totalModuleTokens += r.tokens;
                                        totalModuleLatency += r.latency;
                                    });
                                }
                            } else if (moduleName === 'metadata') {
                                // 2-PASS Synthesis
                                // Pass 1: Local Summaries
                                const chunkResults = await Promise.all(chunks.map((c, i) => callAI('metadata_chunk', c.text, {
                                    chunk_start: Math.round(c.start),
                                    chunk_end: Math.round(c.end),
                                    _isFirstCall: i === 0,
                                    _billablePrice: billablePrice
                                })));
                                const summaries = chunkResults.map((r, i) => `--- SEGMENT ${i+1} (${Math.round(chunks[i].start)}s - ${Math.round(chunks[i].end)}s) ---\n${JSON.stringify(r.data)}`).join('\n\n');
                                
                                // Pass 2: Master Synthesis (Billed at 0 as it's part of the same module)
                                const synthesis = await callAI('metadata_synthesis', summaries, { 
                                    rating_country: settings.rating_country || 'US',
                                    _isFirstCall: false
                                });
                                finalResultData = synthesis.data;
                                
                                [...chunkResults, synthesis].forEach(r => {
                                    totalModuleProviderCost += r.cost;
                                    totalModuleTokens += r.tokens;
                                    totalModuleLatency += r.latency;
                                });
                            } else if (moduleName === 'subtitles') {
                                // 1-Pass Chunked Subtitles
                                const chunkResults = await Promise.all(chunks.map((c, i) => callAI(moduleName, c.text, {
                                    _isFirstCall: i === 0,
                                    _billablePrice: billablePrice,
                                    formatting_instructions: "MAXIMUM 50 CHARACTERS PER SEGMENT. Splitting if necessary."
                                })));

                                const allSegments = chunkResults.flatMap(r => (r.data.segments || (Array.isArray(r.data) ? r.data : [])));
                                finalResultData = {
                                    segments: allSegments,
                                    srt: formatAsSRT(allSegments),
                                    vtt: formatAsVTT(allSegments)
                                };

                                chunkResults.forEach(r => {
                                    totalModuleProviderCost += r.cost;
                                    totalModuleTokens += r.tokens;
                                    totalModuleLatency += r.latency;
                                });
                            }
                        } else {
                            // Standard Single Pass
                            const result = await callAI(moduleName, transcriptionResult?.text || '', { 
                                target_count: getTieredValue(settings.target_frequency || '3-5', duration),
                                rating_country: settings.rating_country || 'US',
                                chunk_start: 0,
                                chunk_end: Math.round(duration),
                                _isFirstCall: true,
                                _billablePrice: billablePrice
                            });
                            finalResultData = result.data;
                            totalModuleProviderCost = result.cost;
                            totalModuleTokens = result.tokens;
                            totalModuleLatency = result.latency;
                        }

                        // Final Step: Log Client Usage (Single Billed Charge)
                        await logClientUsage({
                            clientId, jobId, moduleName, provider: 'openrouter', model: model!, status: 'success',
                            costUsd: billablePrice, actualCostUsd: totalModuleProviderCost, tokensUsed: totalModuleTokens, latencyMs: totalModuleLatency,
                            pricingId: pricing?.id,
                            durationSeconds: duration
                        });

                        successfulModules.push(moduleName);

                        // Auto-output other AI modules
                        const moduleSuffixMap: Record<string, string> = {
                            'ad_breaks': '_adbreak',
                            'promo_breaks': '_promo',
                            'metadata': '_metadata',
                            'summary': '_summary'
                        };
                        await saveToOutput(moduleName, finalResultData, 'json', moduleSuffixMap[moduleName]);

                        return {
                            module_name: moduleName,
                            moduleName: moduleName,
                            result_type: moduleName,
                            resultType: moduleName,
                            result_data: finalResultData,
                            resultData: finalResultData,
                            model: model!,
                            processing_time_ms: totalModuleLatency,
                            processingTimeMs: totalModuleLatency,
                            api_cost: billablePrice,
                            apiCost: billablePrice,
                            provider_cost: totalModuleProviderCost,
                            providerCost: totalModuleProviderCost
                        };
                        } catch (err: any) {
                            const rawError = err.message || 'AI processing error';
                            logger.error('AI', 'MODULE_FAILED', `Module ${moduleName} failed: ${rawError}`, err.stack, { clientId });
                            
                            // Sanitize for client view
                            const sanitizedError = sanitizeAIError(rawError);
                            
                            failedModules.push(moduleName);
                            return {
                                module_name: moduleName,
                                moduleName: moduleName, 
                                result_data: { error: sanitizedError }, 
                                resultData: { error: sanitizedError }, 
                                processing_time_ms: 0, 
                                processingTimeMs: 0, 
                                api_cost: 0, 
                                apiCost: 0, 
                                provider_cost: 0,
                                providerCost: 0
                            };
                        }
                });

                const orResults = await Promise.all(modulePromises);
                
                const flattenedResults = orResults.flat() as any[];
                resultData.push(...flattenedResults);
            }
            
            // Add ALL existing successful results that weren't just re-processed
            for (const [key, data] of Object.entries(existingResultsMap)) {
                // Check if this result (by its unique key) is already in the new resultData
                const alreadyInResult = resultData.some(r => {
                    const rKey = r.result_type || r.resultType || r.module_name || r.moduleName;
                    return rKey === key;
                });
                
                if (!alreadyInResult) {
                    // This is a previously successful result that we didn't rerun (or the rerun failed)
                    // We preserve it so the job's result_data remains complete
                    const isSubtitle = key.startsWith('subtitle_');
                    resultData.push({
                        module_name: isSubtitle ? 'subtitle_translation' : key,
                        moduleName: isSubtitle ? 'subtitle_translation' : key,
                        result_type: isSubtitle ? key : key,
                        resultType: isSubtitle ? key : key,
                        result_data: data,
                        resultData: data,
                        processing_time_ms: 0,
                        processingTimeMs: 0,
                        api_cost: 0,
                        apiCost: 0,
                        provider_cost: 0,
                        providerCost: 0,
                        reused: true
                    });
                }
            }

            // --- SYNC INCREMENTAL RESULTS ---
            // Update the database with whatever we have so far
            // This allows the client to see progress mid-job
            const currentBilled = resultData.reduce((sum, r) => sum + (r.api_cost ?? r.apiCost ?? 0), 0);
            const currentProvider = resultData.reduce((sum, r) => sum + (r.provider_cost ?? r.providerCost ?? 0), 0);
            
            db.prepare('UPDATE ai_jobs SET result_data = ?, total_cost_usd = ?, provider_cost_usd = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
                JSON.stringify(resultData), currentBilled, currentProvider, jobId
            );
            logger.info('AI', 'JOB_PROGRESS_SYNC', `Synced incremental results for Job ${jobId} (${resultData.length} modules completed)`);
        }

        const finalStatus = failedModules.length > 0 ? (successfulModules.length > 0 ? 'partial' : 'error') : 'completed';
        const errorMessage = failedModules.length > 0 ? `Failed modules: ${failedModules.join(', ')}` : null;

        // Ensure we don't accidentally wipe out costs from a previous partial run if this was a rerun
        // by calculating the final billed cost as a sum of all current result items
        // ALSO: sync with ai_job_queue to include any async modules
        let absoluteTotalBilled = resultData.reduce((sum, r) => sum + (r.api_cost ?? r.apiCost ?? 0), 0);
        let absoluteTotalProvider = resultData.reduce((sum, r) => sum + (r.provider_cost ?? r.providerCost ?? 0), 0);

        try {
            const queueCosts = db.prepare(`
                SELECT SUM(billed_cost) as total_billed, SUM(provider_cost) as total_provider
                FROM ai_job_queue 
                WHERE status = 'completed' AND json_extract(payload, '$.jobId') = ?
            `).get(jobId) as { total_billed: number, total_provider: number };
            
            if (queueCosts) {
                absoluteTotalBilled += (queueCosts.total_billed || 0);
                absoluteTotalProvider += (queueCosts.total_provider || 0);
            }
        } catch (qErr) {
            logger.error('AI', 'QUEUE_SYNC_ERROR', `Failed to sync queue costs for job ${jobId}`, qErr);
        }

        db.prepare('UPDATE ai_jobs SET status = ?, result_data = ?, total_cost_usd = ?, provider_cost_usd = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
            finalStatus, JSON.stringify(resultData), absoluteTotalBilled, absoluteTotalProvider, errorMessage, jobId
        );

        const resultTypes = resultData.map(r => r.resultType || r.moduleName);
        logger.info('AI', 'JOB_PROCESSOR_DONE', `Job ${jobId} finished with status: ${finalStatus}`, { 
            clientId, 
            billedTotalCost,
            successfulModules,
            failedModules,
            resultTypes,
            totalResults: resultData.length
        });

        // Cleanup audio only if all modules succeeded - keep it for failed module retries
        if (failedModules.length === 0 && fs.existsSync(audioPath)) {
            try { fs.unlinkSync(audioPath); } catch {}
        } else if (failedModules.length > 0) {
            logger.ai('AI_AUDIO_RETAINED', `Job ${jobId} audio retained for rerunning failed modules: ${failedModules.join(', ')}`, { clientId });
        }

    } catch (error: any) {
        const rawMessage = error.message || 'Unknown processing error';
        logger.error('AI', 'JOB_PROCESSOR_ERROR', `Job ${jobId} failed: ${rawMessage}`, error.stack, { clientId });
        
        // Always sanitize before saving to ai_jobs (client-facing)
        const sanitized = sanitizeAIError(rawMessage);
        
        db.prepare('UPDATE ai_jobs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
            'error', sanitized, jobId
        );
    }
}

// Format helpers
function formatTimestamp(seconds: number, sep = ','): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}${sep}${ms.toString().padStart(3, '0')}`;
}

function splitLongSegments(segments: any[], maxChars = 50): any[] {
    if (!segments) return [];
    const result: any[] = [];
    for (const seg of segments) {
        if (!seg.text || seg.text.length <= maxChars) {
            result.push(seg);
            continue;
        }
        const words = seg.text.split(' ');
        let currentText = '';
        const duration = seg.end - seg.start;
        const totalChars = seg.text.length;
        let localStart = seg.start;
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if ((currentText + (currentText ? ' ' : '') + word).length > maxChars && currentText) {
                const ratio = currentText.length / totalChars;
                const localEnd = localStart + (duration * ratio);
                result.push({ start: localStart, end: localEnd, text: currentText });
                currentText = word;
                localStart = localEnd;
            } else {
                currentText += (currentText ? ' ' : '') + word;
            }
        }
        if (currentText) result.push({ start: localStart, end: seg.end, text: currentText });
    }
    return result;
}

function formatAsSRT(segments: any[]): string {
    const cleaned = splitLongSegments(segments);
    return cleaned.map((seg, i) => {
        const start = formatTimestamp(seg.start);
        const end = formatTimestamp(seg.end);
        return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    }).join('\n');
}

function formatAsVTT(segments: any[]): string {
    const cleaned = splitLongSegments(segments);
    const header = 'WEBVTT\n\n';
    return header + cleaned.map((seg, i) => {
        const start = formatTimestamp(seg.start, '.');
        const end = formatTimestamp(seg.end, '.');
        return `${start} --> ${end}\n${seg.text}\n`;
    }).join('\n');
}

/**
 * Universal AI Error Sanitizer
 * Strips all provider, model, and sensitive API information from error messages.
 * Maps technical API failures to generic, client-safe branding-neutral messages.
 */
function sanitizeAIError(message: string): string {
    if (!message) return 'Internal AI analysis error. Please try again.';
    
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

/**
 * Robust Transcript Partitioning
 * Splits segments into chunks based on time and density.
 */
export function partitionTranscript(segments: any[], maxWindowSeconds = 900, maxChars = 35000) {
    if (!segments || segments.length === 0) return [];
    
    const chunks: { segments: any[]; text: string; start: number; end: number }[] = [];
    let currentChunk: any[] = [];
    let currentText = '';
    let currentStart = segments[0].start;
    for (const seg of segments) {
        const timestamp = `[${seg.start.toFixed(2)}]`;
        const potentialText = currentText + (currentText ? '\n' : '') + timestamp + ' ' + seg.text;
        const potentialDuration = seg.end - currentStart;

        // If adding this segment exceeds either time or char limit, cap the current chunk
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
        const segmentLine = `[${seg.start.toFixed(2)} - ${seg.end.toFixed(2)}] ${seg.text}`;
        currentText += (currentText ? '\n' : '') + segmentLine;
    }

    // Add final chunk
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

