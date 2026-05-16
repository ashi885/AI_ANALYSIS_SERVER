const Database = require('better-sqlite3');
const db = new Database('data/management.db');

const tables = [
    { name: 'available_models', column: 'model_id' },
    { name: 'client_models', column: 'api_model' }
];

for (const table of tables) {
    const rows = db.prepare(`SELECT * FROM ${table.name}`).all();
    const matches = rows.filter(row => {
        const val = row[table.column];
        return val && val.includes('3.7');
    });
    
    if (matches.length > 0) {
        console.log(`Found ${matches.length} matches in ${table.name}:`);
        matches.forEach(m => console.log(`  ID: ${m.id}, Value: ${m[table.column]}`));
        
        // Update them to 3.5-sonnet
        console.log(`Updating ${matches.length} rows in ${table.name}...`);
        const updateStmt = db.prepare(`UPDATE ${table.name} SET ${table.column} = ? WHERE id = ?`);
        for (const m of matches) {
            const newValue = m[table.column].replace('3.7', '3.5');
            updateStmt.run(newValue, m.id);
            console.log(`  Updated ID ${m.id}: ${m[table.column]} -> ${newValue}`);
        }
    } else {
        console.log(`No matches found in ${table.name}.`);
    }
}
