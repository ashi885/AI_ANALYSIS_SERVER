import { Router, Request, Response } from 'express';
import multer from 'multer';
import { WhisperClient } from '../lib/ai/whisper';
import { OpenRouterClient } from '../lib/ai/openrouter';
import { licenseMiddleware, LicensedRequest, getClientModels } from '../middleware/license';
import { getClientApiKey, logApiRequest, getDatabase, getModulePricing, logClientUsage, getClientById } from '../db-mgmt';
import { logger } from '../logger';
import { processAiJob } from '../lib/ai/job-processor';
import crypto from 'crypto';

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

export const aiRouter = Router();

// Proxy Whisper
aiRouter.post('/whisper', licenseMiddleware, upload.single('audio'), async (req: LicensedRequest, res: Response) => {
    const startTime = Date.now();
    const clientId = req.client?.id;
    const clientName = req.client?.name;

    logger.info('AI', 'WHISPER_REQUEST', `Whisper transcription request from ${clientName}`, { 
        clientId, 
        clientName,
        hasFile: !!req.file 
    });
    
    try {
        const file = req.file;
        const moduleName = req.header('X-Module-Name') || 'transcription';

        if (!file) {
            logger.warn('AI', 'WHISPER_NO_FILE', 'No audio file provided', { clientId });
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Get client-specific API key
        const apiKey = await getClientApiKey(clientId!, 'openai');
        
        logger.info('AI', 'WHISPER_API_KEY', `API key retrieved for client`, { 
            clientId,
            hasKey: !!apiKey,
            keyPrefix: apiKey?.substring(0, 10)
        });
        
        if (!apiKey) {
            logger.error('AI', 'WHISPER_NO_KEY', 'No OpenAI API key configured', undefined, { clientId });
            return res.status(500).json({ error: 'OpenAI API key not configured for this client. Please contact administrator.' });
        }

        // Lookup configured model for this client and module
        const models = await getClientModels(clientId!);
        const config = models.find(m => m.module_name === moduleName);
        const model = config?.api_model || 'whisper-1';

        const client = new WhisperClient({ apiKey, model });
        
        // Log outgoing request to provider
        logger.info('AI', 'WHISPER_PROV_REQ', `Sending audio to OpenAI Whisper`, {
            clientId,
            clientName,
            model,
            filePath: file.path,
            fileSize: file.size
        });

        // Make the actual transcription call
        const result = await client.transcribeWithRetry(file.path);

        // Log response from provider
        logger.info('AI', 'WHISPER_PROV_RES', `Received response from OpenAI Whisper`, {
            clientId,
            clientName,
            durationMs: Date.now() - startTime,
            textLength: result.text?.length,
            segmentsCount: result.segments?.length,
            providerCost: result.cost
        });

        // Centralized Billing Lookup
        const duration = req.body.duration ? parseFloat(String(req.body.duration)) : result.duration;
        const pricing = await getModulePricing(clientId!, moduleName, duration);
        const moduleCost = pricing?.cost_per_job || 0;
        const jobId = (req.body.jobId || req.body.local_job_id || null) as string | number | null;
        const userId = (req.body.user_id || req.body.userId || null) as number | null;
        const requestId = result.requestId || `whisper_${Date.now()}`;

        // Log successful outgoing request (Audit trail)
        logApiRequest({
            clientId: clientId!,
            provider: 'whisper',
            endpoint: 'openai.audio.transcriptions',
            model: model,
            direction: 'outgoing',
            responseStatus: 200,
            responseBody: { segments: result.segments.length, duration: result.duration },
            tokensUsed: Math.ceil(result.duration / 60 * 150), // Estimated tokens
            costUsd: result.cost,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requestId: requestId
        });

        // --- NEW: LOG BILLING USAGE (Source of Truth) ---
        await logClientUsage({
            clientId: clientId!,
            jobId: jobId || undefined,
            userId: userId || undefined,
            moduleName: moduleName,
            provider: 'whisper',
            model: model,
            status: 'success',
            costUsd: moduleCost, // The centralized server price
            actualCostUsd: result.cost || 0, // The raw provider cost
            tokensUsed: Math.ceil(result.duration / 60 * 150),
            latencyMs: Date.now() - startTime,
            requestId: requestId
        });

        logger.ai('WHISPER_SUCCESS', `Transcription complete`, {
            clientId,
            clientName,
            requestId,
            durationMs: Date.now() - startTime,
            cost: moduleCost,
            details: { duration: result.duration, segments: result.segments.length }
        });

        return res.json({
            ...result,
            cost: moduleCost,
            requestId: requestId
        });
    } catch (error: any) {
        logger.error('AI', 'WHISPER_ERROR', `Transcription failed: ${error.message}`, error.stack, { clientId, clientName });

        logApiRequest({
            clientId: clientId!,
            provider: 'whisper',
            endpoint: '/api/ai/whisper',
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: 500,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        console.error('[Whisper Proxy Error]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

// Proxy OpenRouter
aiRouter.post('/openrouter', licenseMiddleware, async (req: LicensedRequest, res: Response) => {
    const startTime = Date.now();
    const clientId = req.client?.id;
    const clientName = req.client?.name;
    
    try {
        const { messages, temperature, maxTokens } = req.body;
        const moduleName = req.header('X-Module-Name') || 'unknown';

        logger.info('AI', 'OPENROUTER_REQUEST', `OpenRouter request for module ${moduleName}`, { 
            clientId, 
            clientName,
            moduleName
        });

        // Get client-specific API key
        const apiKey = await getClientApiKey(clientId!, 'openrouter');
        
        if (!apiKey) {
            logger.error('AI', 'OPENROUTER_NO_KEY', 'No OpenRouter API key configured', undefined, { clientId, moduleName });
            return res.status(500).json({ error: 'OpenRouter API key not configured for this client. Please contact administrator.' });
        }

        // Lookup configured model for this client and module
        const models = await getClientModels(clientId!);
        const config = models.find(m => m.module_name === moduleName);

        if (!config) {
            logger.warn('AI', 'OPENROUTER_NO_CONFIG', `Module ${moduleName} not configured`, { clientId });
            return res.status(400).json({ error: `Module ${moduleName} not configured for this client` });
        }

        const client = new OpenRouterClient({ apiKey });
        
        // Log outgoing request to provider
        logger.info('AI', 'OPENROUTER_PROV_REQ', `Sending prompt to OpenRouter`, {
            clientId,
            clientName,
            moduleName,
            model: config.api_model,
            messagesCount: messages?.length,
            temperature,
            maxTokens
        });

        const result = await client.completeWithRetry({
            messages,
            model: config.api_model,
            temperature,
            maxTokens
        });

        const usage = (result.usage as any) || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        // Centralized Billing Lookup
        const duration = req.body.duration ? parseFloat(String(req.body.duration)) : undefined;
        const pricing = await getModulePricing(clientId!, moduleName, duration);
        const moduleCost = pricing?.cost_per_job || 0;
        const jobId = (req.body.jobId || req.body.local_job_id || null) as string | number | null;
        const userId = (req.body.userId || req.body.user_id || null) as number | null;
        const requestId = result.id || `openrouter_${Date.now()}`;

        // Log Audit trail
        logApiRequest({
            clientId: clientId!,
            provider: 'openrouter',
            endpoint: '/api/ai/openrouter',
            direction: 'outgoing',
            model: config.api_model,
            responseStatus: 200,
            tokensUsed: usage.totalTokens,
            costUsd: result.cost || 0,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requestId: requestId
        });

        // --- NEW: LOG BILLING USAGE (Source of Truth) ---
        await logClientUsage({
            clientId: clientId!,
            jobId: jobId || undefined,
            userId: userId || undefined,
            moduleName: moduleName,
            provider: 'openrouter',
            model: config.api_model,
            status: 'success',
            costUsd: moduleCost, // The centralized server price
            actualCostUsd: result.cost || 0, // The raw provider cost
            tokensUsed: usage.totalTokens,
            latencyMs: Date.now() - startTime,
            requestId: requestId
        });

        logger.ai('OPENROUTER_SUCCESS', `Analysis complete for ${moduleName}`, {
            clientId,
            clientName,
            requestId,
            durationMs: Date.now() - startTime,
            cost: moduleCost,
            details: { model: config.api_model, tokens: usage.totalTokens }
        });

        return res.json({
            ...result,
            cost: moduleCost,
            requestId: requestId
        });
    } catch (error: any) {
        logger.error('AI', 'OPENROUTER_ERROR', `OpenRouter failed: ${error.message}`, error.stack, { clientId, clientName });
        
        let statusCode = 500;
        const statusMatch = error.message?.match(/\b(400|401|403|429|500|503)\b/);
        if (statusMatch) {
            statusCode = parseInt(statusMatch[1]);
        }

        logApiRequest({
            clientId: clientId!,
            provider: 'openrouter',
            endpoint: '/api/ai/openrouter',
            direction: 'outgoing',
            errorMessage: error.message,
            responseStatus: statusCode,
            latencyMs: Date.now() - startTime,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        return res.status(500).json({ error: error.message });
    }
});

// Submit parallel AI job
aiRouter.post('/job', licenseMiddleware, upload.single('audio'), async (req: LicensedRequest, res: Response) => {
    const clientId = req.client?.id;
    const clientName = req.client?.name;

    try {
        const file = req.file;
        const modulesRaw = req.body.modules;
        
        if (!file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        let modulesRequested: string[] = [];
        try {
            modulesRequested = JSON.parse(modulesRaw);
        } catch {
            return res.status(400).json({ error: 'Invalid modules payload. Must be a JSON array of strings.' });
        }

        if (!Array.isArray(modulesRequested) || modulesRequested.length === 0) {
            return res.status(400).json({ error: 'Modules list cannot be empty' });
        }

        // ── CREDIT SYSTEM CHECK ──
        const clientInfo = await getClientById(clientId!);
        const billingType = clientInfo?.billing_type || 'PER_REQUEST';
        const duration = req.body.duration ? parseFloat(String(req.body.duration)) : 0;

        if (billingType === 'CREDIT') {
            let totalEstimated = 0;
            for (const mod of modulesRequested) {
                const pricing = await getModulePricing(clientId!, mod, duration);
                totalEstimated += pricing?.cost_per_job || 0;
            }
            if ((clientInfo?.credits || 0) < totalEstimated) {
                return res.status(402).json({
                    error: 'Insufficient credits. Please top up your account.',
                    balance: clientInfo?.credits || 0,
                    required: totalEstimated
                });
            }
        }
        // ──────────────────────────

        const jobId = crypto.randomUUID();
        const db = getDatabase();

        // Accept optional tracing fields from the client
        const localJobId = req.body.local_job_id || null;
        const userId = req.body.user_id ? parseInt(req.body.user_id, 10) : null;
        const targetLanguagesRaw = req.body.target_languages || null;
        let targetLanguages: string[] | null = null;
        
        logger.info('AI', 'JOB_INGESTION', `Incoming payload for job ${jobId}`, { 
            localJobId, 
            userId, 
            modulesCount: modulesRequested.length,
            targetLanguagesRaw,
            body: req.body // Log full body for deep debugging
        });

        if (targetLanguagesRaw) {
            try {
                targetLanguages = typeof targetLanguagesRaw === 'string' ? JSON.parse(targetLanguagesRaw) : targetLanguagesRaw;
                logger.info('AI', 'JOB_LANGS_PARSED', `Parsed target languages for job ${jobId}`, { targetLanguages });
            } catch (e) {
                logger.warn('AI', 'JOB_SUBMIT_LANG_PARSE_ERROR', 'Failed to parse target_languages', { jobId, targetLanguagesRaw });
            }
        }

        db.prepare(`
            INSERT INTO ai_jobs (id, client_id, user_id, local_job_id, status, modules_requested, target_languages, audio_path, file_duration, queue_status, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
        `).run(jobId, clientId, userId, localJobId, 'processing', JSON.stringify(modulesRequested), targetLanguages ? JSON.stringify(targetLanguages) : null, file.path, duration);

        logger.info('AI', 'JOB_SUBMITTED', `Parallel AI job ${jobId} added to queue`, { clientId, userId, localJobId, modulesRequested, targetLanguages, duration });
        
        // Calculate ETA for the client
        const pendingCount = db.prepare(`SELECT COUNT(*) as count FROM ai_jobs WHERE queue_status = 'pending'`).get() as { count: number };
        // Estimate: ~4 minutes per job in queue as a generic baseline
        const etaMinutes = pendingCount.count * 4;

        return res.json({ 
            jobId,
            status: 'pending',
            queue_position: pendingCount.count,
            eta_minutes: etaMinutes
        });

    } catch (error: any) {
        logger.error('AI', 'JOB_SUBMIT_ERROR', `Failed to submit job: ${error.message}`, error.stack, { clientId });
        return res.status(500).json({ error: error.message });
    }
});

// Get job status
aiRouter.get('/job/:id', licenseMiddleware, async (req: LicensedRequest, res: Response) => {
    const clientId = req.client?.id;
    const jobId = req.params.id;

    try {
        const db = getDatabase();
        let job = db.prepare('SELECT * FROM ai_jobs WHERE id = ? AND client_id = ?').get(jobId, clientId) as any;
        if (!job) {
            job = db.prepare('SELECT * FROM ai_jobs WHERE local_job_id = ? AND client_id = ?').get(jobId, clientId) as any;
        }

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        let queuePosition = null;
        let etaMinutes = null;
        if (job.queue_status === 'pending') {
            const posRow = db.prepare(`
                SELECT COUNT(*) as count 
                FROM ai_jobs 
                WHERE queue_status = 'pending' AND created_at <= ?
            `).get(job.created_at) as { count: number };
            queuePosition = posRow.count;
            etaMinutes = queuePosition * 4;
        }

        return res.json({
            id: job.id,
            status: job.queue_status === 'pending' ? 'pending' : job.status,
            queue_status: job.queue_status,
            sub_status: job.sub_status,
            queue_position: queuePosition,
            eta_minutes: etaMinutes,
            modules_requested: JSON.parse(job.modules_requested),
            result_data: job.result_data ? JSON.parse(job.result_data) : null,
            total_cost_usd: job.total_cost_usd,
            file_duration: job.file_duration,
            error_message: job.error_message,
            created_at: job.created_at,
            updated_at: job.updated_at
        });
    } catch (error: any) {
        logger.error('AI', 'JOB_STATUS_ERROR', `Failed to get job status: ${error.message}`, error.stack, { clientId, jobId });
        return res.status(500).json({ error: error.message });
    }
});
