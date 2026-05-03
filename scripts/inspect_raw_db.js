
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/management.db');
const targetLocalJobId = 'CUP-260419-450D';

const db = new Database(DB_PATH);

try {
    const job = db.prepare('SELECT id, modules_requested, result_data FROM ai_jobs WHERE local_job_id = ?').get(targetLocalJobId);
    
    if (!job) {
        console.log("Job not found.");
    } else {
        console.log(`Job ID: ${job.id}`);
        console.log(`Raw modules_requested: "${job.modules_requested}"`);
        console.log(`Raw result_data: ${job.result_data ? job.result_data.substring(0, 500) : 'null'}...`);
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    db.close();
}
