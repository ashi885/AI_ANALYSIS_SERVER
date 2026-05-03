
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/management.db');
const targetLocalJobId = 'CUP-260419-450D';

const db = new Database(DB_PATH);

try {
    const job = db.prepare('SELECT id, status, result_data FROM ai_jobs WHERE local_job_id = ?').get(targetLocalJobId);
    
    if (!job) {
        console.log("Job not found on server.");
    } else {
        console.log(`Job ID: ${job.id}`);
        console.log(`Status: ${job.status}`);
        
        const results = JSON.parse(job.result_data || '[]');
        console.log(`Modules found: ${results.length}`);
        
        results.forEach(m => {
            const data = m.result_data || m.resultData;
            const segments = data?.segments || (Array.isArray(data) ? data : []);
            console.log(`  - Module: ${m.module_name} (${m.result_type}): ${segments.length} segments`);
        });
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    db.close();
}
