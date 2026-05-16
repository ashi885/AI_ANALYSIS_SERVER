const Database = require('better-sqlite3');
const db = new Database('data/management.db');
try {
    const r1 = db.prepare("UPDATE client_models SET api_model = 'anthropic/claude-3.5-sonnet' WHERE api_model = 'anthropic/claude-3.7-sonnet'").run();
    const r2 = db.prepare("UPDATE available_models SET model_id = 'anthropic/claude-3.5-sonnet', display_name = 'Claude 3.5 Sonnet' WHERE model_id = 'anthropic/claude-3.7-sonnet'").run();
    console.log(`Updated ${r1.changes} client models and ${r2.changes} available models.`);
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
