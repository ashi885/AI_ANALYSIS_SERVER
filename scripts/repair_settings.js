
/**
 * REPAIR SETTINGS
 * Cleans up corrupted "[object Object]" entries in the client_module_settings table.
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/management.db');
const db = new Database(dbPath);

console.log('--- Repairing Corrupted Settings ---');

try {
    // 1. Find corrupted entries
    const corrupted = db.prepare("SELECT * FROM client_module_settings WHERE setting_value = '[object Object]'").all();
    console.log(`Found ${corrupted.length} corrupted entries.`);

    if (corrupted.length > 0) {
        // 2. Delete corrupted entries
        const result = db.prepare("DELETE FROM client_module_settings WHERE setting_value = '[object Object]'").run();
        console.log(`Successfully deleted ${result.changes} corrupted entries.`);
    }

    console.log('--- Repair Complete ---');
    console.log('Note: Administrators should re-save their Tiered configurations in the Admin UI.');
} catch (err) {
    console.error('Repair failed:', err.message);
} finally {
    db.close();
}
