const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'data', 'management.db');
console.log('Checking DB at:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found!');
    process.exit(1);
}

const db = new Database(dbPath);

try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'").get();
    console.log('Table system_settings exists:', !!tableExists);

    if (tableExists) {
        const rows = db.prepare("SELECT * FROM system_settings").all();
        console.log('System Settings rows:', rows);
    } else {
        console.log('Creating table system_settings manually for fix...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table created.');
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    db.close();
}
