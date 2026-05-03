
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../data/management.db');
const targetLocalJobId = 'CUP-260419-450D';

if (!fs.existsSync(DB_PATH)) {
    console.error("Database not found at:", DB_PATH);
    process.exit(1);
}

const db = new Database(DB_PATH);

try {
    console.log(`[DOCTOR] Inspecting job ${targetLocalJobId}...`);
    const job = db.prepare('SELECT id, modules_requested, result_data FROM ai_jobs WHERE local_job_id = ?').get(targetLocalJobId);
    
    if (!job) {
        throw new Error("Job not found on server.");
    }

    // 1. Fix modules_requested (MUST be a JSON array of strings)
    let modulesRaw = job.modules_requested;
    let modulesFixed = '["transcription", "subtitles", "metadata", "ad_breaks", "promo_breaks", "subtitle_translation"]';
    
    // 2. Fix result_data (MUST be a JSON array of module objects)
    let results = [];
    try {
        results = JSON.parse(job.result_data || '[]');
        if (!Array.isArray(results)) results = [];
    } catch (e) {
        results = [];
    }

    console.log(`[DOCTOR] Job currently has ${results.length} results. Ensuring segments are wrapped correctly...`);

    // Ensure all translation results have the { segments: [] } wrapper
    results = results.map(r => {
        if (r.module_name === 'subtitle_translation') {
            const data = r.result_data || r.resultData;
            const segments = data?.segments || (Array.isArray(data) ? data : []);
            return {
                ...r,
                result_data: {
                    language: data?.language || r.result_type?.split('_').pop() || 'en',
                    segments: segments,
                    srt: "REPAIRED",
                    vtt: "REPAIRED"
                }
            };
        }
        return r;
    });

    // 3. APPLY FIX
    console.log(`[DOCTOR] Applying fixes to database...`);
    db.prepare("UPDATE ai_jobs SET modules_requested = ?, result_data = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        modulesFixed,
        JSON.stringify(results),
        job.id
    );

    console.log(`\n✅ DOCTOR SUCCESS: Job ${targetLocalJobId} is now surgically repaired.`);
    console.log(`You can now run the final sync script!`);

} catch (err) {
    console.error('❌ DOCTOR FAILED:', err.message);
} finally {
    db.close();
}
