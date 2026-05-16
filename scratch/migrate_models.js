const Database = require('better-sqlite3');
const path = require('path');
const dbPath = 'c:\\GOOGLE_AntiGravity\\cuepoint-server\\data\\management.db';
const db = new Database(dbPath);

console.log('Starting migration: replacing retired Claude 3.7 with Claude 3.5 Sonnet...');

// 1. Update available_models
const amUpdate = db.prepare(`
    UPDATE available_models 
    SET model_id = 'anthropic/claude-3.5-sonnet', display_name = 'Claude 3.5 Sonnet' 
    WHERE model_id = 'anthropic/claude-3.7-sonnet'
`).run();
console.log(`Updated ${amUpdate.changes} rows in available_models.`);

// 2. Update client_models
const cmUpdate = db.prepare(`
    UPDATE client_models 
    SET api_model = 'anthropic/claude-3.5-sonnet' 
    WHERE api_model = 'anthropic/claude-3.7-sonnet'
`).run();
console.log(`Updated ${cmUpdate.changes} rows in client_models.`);

console.log('Migration complete.');
db.close();
