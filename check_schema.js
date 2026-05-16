const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'management.db');
const db = new sqlite3(dbPath);

try {
    const info = db.prepare("PRAGMA table_info(ai_jobs)").all();
    console.log(JSON.stringify(info, null, 2));
} catch (e) {
    console.error(e);
}
db.close();
