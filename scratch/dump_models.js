const Database = require('better-sqlite3');
const dbPath = 'c:\\GOOGLE_AntiGravity\\cuepoint-server\\data\\management.db';
const db = new Database(dbPath);

console.log('--- client_models (Client 2) ---');
const clientModels = db.prepare('SELECT * FROM client_models WHERE client_id = 2').all();
console.log(JSON.stringify(clientModels, null, 2));

console.log('\n--- available_models ---');
const availableModels = db.prepare('SELECT * FROM available_models').all();
console.log(JSON.stringify(availableModels, null, 2));
