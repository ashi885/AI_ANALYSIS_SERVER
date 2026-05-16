const Database = require('better-sqlite3');
const path = require('path');
const dbPath = 'c:\\GOOGLE_AntiGravity\\cuepoint-server\\data\\management.db';
const db = new Database(dbPath);

console.log('--- client_models ---');
const clientModels = db.prepare('SELECT * FROM client_models').all();
console.log(JSON.stringify(clientModels, null, 2));

console.log('\n--- available_models ---');
const availableModels = db.prepare('SELECT * FROM available_models').all();
console.log(JSON.stringify(availableModels, null, 2));

console.log('\n--- api_request_logs (last 5) ---');
const logs = db.prepare('SELECT * FROM api_request_logs ORDER BY created_at DESC LIMIT 5').all();
console.log(JSON.stringify(logs, null, 2));
