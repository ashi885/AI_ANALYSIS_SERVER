
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const POSSIBLE_PATHS = [
    path.join(__dirname, '..', 'data', 'management.db'),
    path.join(__dirname, '..', 'management.db'),
    'C:\\GOOGLE_AntiGravity\\cuepoint-server\\data\\management.db',
    'C:\\GOOGLE_AntiGravity\\cuepoint-server\\management.db'
];

let dbPath = POSSIBLE_PATHS.find(p => fs.existsSync(p));

if (!dbPath) {
    console.error('Could not find management.db in server directory.');
    process.exit(1);
}

const targetLocalJobId = 'CUP-260419-450D';
const tempDbPath = dbPath + '.temp';

console.log('Using database at:', dbPath);

// 1. Create a consistent backup (including WAL data) to bypass locks
const sourceDb = new Database(dbPath, { readonly: true });
console.log('Creating consistent shadow copy via Backup API...');

sourceDb.backup(tempDbPath)
    .then(() => {
        console.log('Backup complete.');
        sourceDb.close();
        runRepair();
    })
    .catch(err => {
        console.error('Backup failed (is the database locked for reading?):', err.message);
        process.exit(1);
    });

function runRepair() {
    const db = new Database(tempDbPath, { timeout: 10000 });
    try {
        // 1. Find the job
        const job = db.prepare('SELECT id, result_data FROM ai_jobs WHERE local_job_id = ?').get(targetLocalJobId);
        if (!job) {
            console.error('Job not found in server DB even after backup. Are you sure about the ID?');
            process.exit(1);
        }

        let resultData = JSON.parse(job.result_data || '[]');
        console.log(`Original result count: ${resultData.length}`);

        // 2. Find successful translation logs in api_request_logs
        const logs = db.prepare(`
            SELECT endpoint, response_body 
            FROM api_request_logs 
            WHERE parent_job_id = ? 
            AND endpoint LIKE '%subtitle_translation-%' 
            AND response_status = 200
        `).all(job.id);

        console.log(`Found ${logs.length} translation log entries.`);

        let repairedCount = 0;
        for (const log of logs) {
            const langCode = log.endpoint.split('-').pop();
            const response = JSON.parse(log.response_body);
            const content = response.content || response.data || JSON.stringify(response);
            
            console.log(`Analyzing content for ${langCode} (${content.length} chars)...`);

            // Robust extraction logic
            let parsed;
            try {
                parsed = typeof content === 'string' ? JSON.parse(content) : content;
            } catch (e) {
                const arrayStartIdx = content.indexOf('[');
                const arrayEndIdx = content.lastIndexOf(']');
                
                if (arrayStartIdx !== -1) {
                    const lastBrace = content.lastIndexOf('}');
                    let candidate = "";
                    if (arrayEndIdx > arrayStartIdx) {
                        candidate = content.substring(arrayStartIdx, arrayEndIdx + 1);
                    } else if (lastBrace > arrayStartIdx) {
                        candidate = content.substring(arrayStartIdx, lastBrace + 1) + ']';
                    }

                    if (candidate) {
                        try {
                            const result = JSON.parse(candidate);
                            parsed = { segments: Array.isArray(result) ? result : [result] };
                        } catch (pe) {
                            const lastComma = candidate.lastIndexOf('},');
                            if (lastComma !== -1) {
                                try {
                                    const fixed = candidate.substring(0, lastComma + 1) + ']';
                                    parsed = { segments: JSON.parse(fixed) };
                                } catch (de) {}
                            }
                        }
                    }
                }
            }

            const segments = parsed?.segments || (Array.isArray(parsed) ? parsed : []);
            if (segments.length > 0) {
                console.log(`✅ Successfully recovered ${segments.length} segments for ${langCode}`);
                
                const resultType = `subtitle_${langCode}`;
                const existingIdx = resultData.findIndex(r => (r.result_type || r.resultType) === resultType);
                
                const repairedEntry = {
                    module_name: 'subtitle_translation',
                    result_type: resultType,
                    result_data: {
                        language: langCode,
                        segments: segments,
                        srt: "REPAIRED",
                        vtt: "REPAIRED"
                    },
                    processing_time_ms: 0,
                    api_cost: 0,
                    repaired: true
                };

                if (existingIdx !== -1) resultData[existingIdx] = repairedEntry;
                else resultData.push(repairedEntry);
                repairedCount++;
            } else {
                console.log(`❌ No segments recovered for ${langCode}`);
            }
        }

        if (repairedCount > 0) {
            db.prepare("UPDATE ai_jobs SET result_data = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
                JSON.stringify(resultData), job.id
            );
            console.log(`SUCCESS: Repaired ${repairedCount} tracks for job ${targetLocalJobId}`);
        } else {
            console.log('No tracks could be repaired from logs.');
        }

    } catch (err) {
        console.error('Error during repair:', err.message);
    } finally {
        db.close();
        
        try {
            if (fs.existsSync(tempDbPath)) {
                console.log('Committing shadow changes back to main database...');
                fs.copyFileSync(tempDbPath, dbPath);
                fs.unlinkSync(tempDbPath);
                console.log('Shadow Sync Complete. Original database updated.');
            }
        } catch (err) {
            console.error('Final commit failed (is the server running?):', err.message);
        }
    }
}
