const db = require('better-sqlite3')('./data/management.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Find module-related tables
const moduleTables = tables.filter(t => t.name.includes('module'));
console.log('\nModule-related tables:', moduleTables.map(t => t.name).join(', '));

// Check client_modules or similar
for (const t of moduleTables) {
    try {
        const rows = db.prepare('SELECT * FROM ' + t.name + ' LIMIT 20').all();
        console.log('\n--- Table:', t.name, '---');
        console.log(JSON.stringify(rows, null, 2));
    } catch(e) {
        console.log('Error reading', t.name, e.message);
    }
}
