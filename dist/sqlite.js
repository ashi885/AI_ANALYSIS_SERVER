"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = getDbPath;
exports.initDatabase = initDatabase;
exports.getDatabase = getDatabase;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let db = null;
function getDbPath() {
    // Priority 1: Full custom path
    if (process.env.DB_PATH) {
        return path_1.default.isAbsolute(process.env.DB_PATH)
            ? process.env.DB_PATH
            : path_1.default.join(process.cwd(), process.env.DB_PATH);
    }
    // Priority 2: Data directory
    if (process.env.DATA_DIR) {
        return path_1.default.join(process.env.DATA_DIR, 'management.db');
    }
    // Default: local data folder
    return path_1.default.join(process.cwd(), 'data', 'management.db');
}
function initDatabase() {
    if (db)
        return db;
    const dbPath = getDbPath();
    const dbDir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
    console.log('[SQLite] INITIALIZING DATABASE SOURCE OF TRUTH AT:', path_1.default.resolve(dbPath));
    db = new better_sqlite3_1.default(dbPath);
    db.pragma('journal_mode = WAL');
    createTables();
    return db;
}
function getDatabase() {
    if (!db) {
        return initDatabase();
    }
    return db;
}
function createTables() {
    if (!db)
        return;
    db.exec(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_uuid TEXT UNIQUE,
            name TEXT NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            api_endpoint TEXT,
            timezone TEXT DEFAULT 'UTC',
            billing_margin_flat REAL DEFAULT 0.5,
            billing_margin_percent REAL DEFAULT 20,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'active',
            contract_start DATE,
            contract_end DATE,
            setup_fee REAL DEFAULT 0,
            plan TEXT DEFAULT 'Professional',
            module_rates TEXT,
            billing_type TEXT DEFAULT 'PER_REQUEST',
            credits REAL DEFAULT 0,
            maintenance_mode INTEGER DEFAULT 0,
            short_code TEXT,
            description TEXT,
            provider_bal_openai REAL DEFAULT 0,
            provider_bal_openrouter REAL DEFAULT 0,
            provider_warn_threshold REAL DEFAULT 25.0,
            allow_rate_card_fetch INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS client_api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            provider TEXT NOT NULL CHECK(provider IN ('openai', 'openrouter', 'ai_service_primary', 'ai_service_secondary')),
            api_key TEXT NOT NULL,
            api_key_prefix TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
            UNIQUE(client_id, provider)
        );

        CREATE TABLE IF NOT EXISTS available_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            module_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            model_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(module_id, provider, model_id)
        );

        CREATE TABLE IF NOT EXISTS client_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            module_name TEXT NOT NULL,
            api_provider TEXT NOT NULL,
            api_model TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
            UNIQUE(client_id, module_name)
        );

        CREATE TABLE IF NOT EXISTS api_request_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            model TEXT,
            direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
            request_method TEXT,
            request_headers TEXT,
            request_body TEXT,
            response_status INTEGER,
            response_body TEXT,
            request_id TEXT,
            error_message TEXT,
            tokens_used INTEGER,
            cost_usd REAL,
            latency_ms INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            parent_job_id TEXT,
            billed_cost REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_api_logs_client_created ON api_request_logs(client_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_api_logs_direction ON api_request_logs(direction, created_at DESC);

        CREATE TABLE IF NOT EXISTS client_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            job_id TEXT,
            user_id INTEGER,
            module_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT,
            status TEXT CHECK(status IN ('success', 'error')) NOT NULL,
            cost_usd REAL NOT NULL,
            actual_cost_usd REAL,
            tokens_used INTEGER,
            latency_ms INTEGER,
            error_message TEXT,
            duration_seconds REAL DEFAULT 0,
            pricing_id INTEGER,
            request_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_client_usage_client_created ON client_usage(client_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS ai_jobs (
            id TEXT PRIMARY KEY,
            client_id INTEGER NOT NULL,
            user_id INTEGER,
            local_job_id TEXT,
            status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'error', 'partial')),
            modules_requested TEXT NOT NULL,
            target_languages TEXT,
            result_data TEXT,
            total_cost_usd REAL DEFAULT 0,
            provider_cost_usd REAL DEFAULT 0,
            error_message TEXT,
            audio_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );
    `);
    // Migration: Add target_languages to existing ai_jobs table
    const aiJobsInfo = db.prepare("PRAGMA table_info(ai_jobs)").all();
    const hasTargetLangs = aiJobsInfo.some(col => col.name === 'target_languages');
    if (!hasTargetLangs) {
        console.log('[SQLite] MIGRATION: Adding target_languages column to ai_jobs table...');
        try {
            db.prepare("ALTER TABLE ai_jobs ADD COLUMN target_languages TEXT").run();
            console.log('[SQLite] MIGRATION SUCCESS: target_languages column added.');
        }
        catch (err) {
            console.error('[SQLite] MIGRATION FAILED:', err.message);
        }
    }
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_jobs_client_created ON ai_jobs(client_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS module_pricing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
            module_name TEXT NOT NULL,
            cost_per_job REAL NOT NULL,
            effective_from DATE NOT NULL,
            effective_to DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(client_id, module_name, effective_from)
        );

        CREATE TABLE IF NOT EXISTS client_module_settings (
            client_id INTEGER NOT NULL,
            module_name TEXT NOT NULL,
            setting_key TEXT NOT NULL,
            setting_value TEXT NOT NULL,
            PRIMARY KEY (client_id, module_name, setting_key),
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS provider_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_job_queue (
            id TEXT PRIMARY KEY,
            client_id INTEGER NOT NULL,
            module_name TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
            sub_status TEXT,
            result TEXT,
            error TEXT,
            billed_cost REAL DEFAULT 0,
            provider_cost REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ai_job_queue_status ON ai_job_queue(status, created_at ASC);

        CREATE TABLE IF NOT EXISTS pending_sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_type TEXT NOT NULL,
            job_id INTEGER,
            module_name TEXT,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'failed')),
            retry_count INTEGER DEFAULT 0,
            last_attempt DATETIME,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            synced_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_pending_sync_status ON pending_sync_queue(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_pending_sync_job ON pending_sync_queue(job_id);

        CREATE TABLE IF NOT EXISTS job_completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT,
            license_key TEXT,
            local_job_id INTEGER,
            filename TEXT,
            user_id INTEGER,
            status TEXT NOT NULL,
            modules_completed TEXT,
            duration_seconds REAL,
            total_cost_usd REAL,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_job_completions_client ON job_completions(client_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_job_completions_local ON job_completions(local_job_id);

        CREATE TABLE IF NOT EXISTS smtp_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host TEXT NOT NULL,
            port INTEGER DEFAULT 587,
            secure INTEGER DEFAULT 0,
            username TEXT,
            password_encrypted TEXT,
            auth_type TEXT DEFAULT 'normal' CHECK(auth_type IN ('normal', 'none', 'oauth2')),
            from_email TEXT,
            from_name TEXT DEFAULT 'Cuepoint Support',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS email_notification_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL UNIQUE,
            event_label TEXT NOT NULL,
            description TEXT,
            is_enabled INTEGER DEFAULT 0,
            recipient_emails TEXT DEFAULT '[]',
            threshold_value INTEGER,
            threshold_unit TEXT,
            min_pending_age_hours INTEGER,
            is_active INTEGER DEFAULT 1,
            last_triggered DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS client_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER UNIQUE NOT NULL,
            supabase_url TEXT,
            supabase_anon_key TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
            client_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, key)
        );

        CREATE TABLE IF NOT EXISTS client_usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            job_id TEXT,
            user_id INTEGER,
            module_name TEXT,
            provider TEXT,
            model TEXT,
            direction TEXT DEFAULT 'incoming',
            endpoint TEXT,
            method TEXT,
            request_headers TEXT,
            request_body TEXT,
            response_status INTEGER,
            response_body TEXT,
            latency_ms INTEGER,
            cost_usd REAL,
            tokens_used INTEGER,
            duration_seconds REAL DEFAULT 0,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS export_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
            module_name TEXT NOT NULL,
            template_name TEXT NOT NULL,
            template_content TEXT NOT NULL,
            file_extension TEXT NOT NULL CHECK(file_extension IN ('xml', 'json', 'srt', 'vtt', 'txt')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    // Safe schema migrations for existing databases
    // (SQLite does not support IF NOT EXISTS for columns, so we try/catch each)
    const migrations = [
        `ALTER TABLE ai_jobs ADD COLUMN user_id INTEGER`,
        `ALTER TABLE ai_jobs ADD COLUMN local_job_id TEXT`,
        `ALTER TABLE client_usage ADD COLUMN local_job_id TEXT`,
        `ALTER TABLE api_request_logs ADD COLUMN request_id TEXT`,
        `ALTER TABLE clients ADD COLUMN billing_type TEXT DEFAULT 'PER_REQUEST'`,
        `ALTER TABLE clients ADD COLUMN credits REAL DEFAULT 0`,
        `ALTER TABLE clients ADD COLUMN maintenance_mode INTEGER DEFAULT 0`,
        `ALTER TABLE clients ADD COLUMN short_code TEXT`,
        `ALTER TABLE api_request_logs ADD COLUMN parent_job_id TEXT`,
        `ALTER TABLE ai_job_queue ADD COLUMN sub_status TEXT`,
        `ALTER TABLE ai_job_queue ADD COLUMN billed_cost REAL DEFAULT 0`,
        `ALTER TABLE ai_job_queue ADD COLUMN provider_cost REAL DEFAULT 0`,
        `ALTER TABLE clients ADD COLUMN description TEXT`,
        `ALTER TABLE ai_jobs ADD COLUMN provider_cost_usd REAL DEFAULT 0`,
        `ALTER TABLE clients ADD COLUMN provider_bal_openai REAL DEFAULT 0`,
        `ALTER TABLE clients ADD COLUMN provider_bal_openrouter REAL DEFAULT 0`,
        `ALTER TABLE clients ADD COLUMN provider_warn_threshold REAL DEFAULT 25.0`,
        `ALTER TABLE ai_jobs ADD COLUMN sub_status TEXT`,
        `ALTER TABLE clients ADD COLUMN allow_rate_card_fetch INTEGER DEFAULT 0`,
        `ALTER TABLE client_usage ADD COLUMN duration_seconds REAL DEFAULT 0`,
        `ALTER TABLE client_usage_logs ADD COLUMN duration_seconds REAL DEFAULT 0`,
        `ALTER TABLE ai_jobs ADD COLUMN file_duration REAL DEFAULT 0`,
        `ALTER TABLE ai_jobs ADD COLUMN queue_status TEXT DEFAULT 'pending'`,
        `ALTER TABLE ai_jobs ADD COLUMN priority INTEGER DEFAULT 0`
    ];
    for (const sql of migrations) {
        try {
            db.exec(sql);
        }
        catch (_) { /* column already exists */ }
    }
    try {
        db.exec("ALTER TABLE admin_users RENAME COLUMN email TO username;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE users RENAME COLUMN email TO username;");
    }
    catch (e) { }
    // Indices should be created AFTER migrations in case columns were just added
    const indices = [
        `CREATE INDEX IF NOT EXISTS idx_api_logs_request_id ON api_request_logs(request_id)`,
    ];
    for (const sql of indices) {
        try {
            db.exec(sql);
        }
        catch (_) { /* index already exists */ }
    }
    seedDefaultData();
}
function seedDefaultData() {
    if (!db)
        return;
    // Seed admin with cuepoint2025 password
    const adminExists = db.prepare('SELECT id FROM admin_users WHERE username = ? AND password = ?').get('admin', 'cuepoint2025');
    if (!adminExists) {
        db.prepare('INSERT OR REPLACE INTO admin_users (username, password, role) VALUES (?, ?, ?)').run('admin', 'cuepoint2025', 'admin');
    }
    // Seed admin with cuepoint-admin password to support unified credentials
    const adminAltExists = db.prepare('SELECT id FROM admin_users WHERE username = ? AND password = ?').get('admin', 'cuepoint-admin');
    if (!adminAltExists) {
        db.prepare('INSERT OR IGNORE INTO admin_users (username, password, role) VALUES (?, ?, ?)').run('admin', 'cuepoint-admin', 'admin');
    }
    // Seed cueadmin with cuepoint-admin
    const adminEmailExists = db.prepare('SELECT id FROM admin_users WHERE username = ? AND password = ?').get('cueadmin', 'cuepoint-admin');
    if (!adminEmailExists) {
        db.prepare('INSERT OR REPLACE INTO admin_users (username, password, role) VALUES (?, ?, ?)').run('cueadmin', 'cuepoint-admin', 'admin');
    }
    const userExists = db.prepare('SELECT id FROM users WHERE username = ?').get('cueadmin');
    if (!userExists) {
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('cueadmin', 'cuepoint-admin', 'ADMIN');
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('cueuser', 'cuepoint-user', 'USER');
    }
    // Create default client if none exists
    const clientExists = db.prepare('SELECT id FROM clients LIMIT 1').get();
    if (!clientExists) {
        const apiKey = 'CUE-' + require('crypto').randomBytes(8).toString('hex').toUpperCase();
        db.prepare(`
            INSERT INTO clients (name, api_key, status, plan, billing_margin_flat, billing_margin_percent)
            VALUES (?, ?, 'active', 'Professional', 0.50, 20.0)
        `).run('Default Client', apiKey);
        console.log('[DB] Created default client with API key:', apiKey);
    }
    const labelExists = db.prepare('SELECT id FROM provider_labels WHERE provider = ?').get('openai');
    if (!labelExists) {
        db.prepare('INSERT INTO provider_labels (provider, label) VALUES (?, ?)').run('openai', 'Cuepoint - Transcription');
        db.prepare('INSERT INTO provider_labels (provider, label) VALUES (?, ?)').run('openrouter', 'Cuepoint - AI Analysis');
        db.prepare('INSERT INTO provider_labels (provider, label) VALUES (?, ?)').run('ai_service_primary', 'AI Service (Primary)');
        db.prepare('INSERT INTO provider_labels (provider, label) VALUES (?, ?)').run('ai_service_secondary', 'AI Service (Secondary)');
    }
    const modelCount = db.prepare('SELECT COUNT(*) as count FROM available_models').get();
    if (modelCount.count === 0) {
        const models = [
            ['transcription', 'openai', 'whisper-1', 'Whisper-1'],
            ['subtitles', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
            ['subtitles', 'openrouter', 'openai/gpt-4o', 'GPT-4o'],
            ['metadata', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
            ['ad_breaks', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
            ['promo_breaks', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
            ['subtitle_translation', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
        ];
        const insertModel = db.prepare('INSERT INTO available_models (module_id, provider, model_id, display_name) VALUES (?, ?, ?, ?)');
        for (const model of models) {
            insertModel.run(...model);
        }
    }
    // Migrations
    try {
        db.prepare("ALTER TABLE api_request_logs ADD COLUMN billed_cost REAL DEFAULT 0").run();
        console.log('[SQLite] Added billed_cost column to api_request_logs');
    }
    catch (err) {
        // Column already exists, ignore
    }
    // Ensure subtitle_translation exists for existing databases
    try {
        const transExists = db.prepare('SELECT id FROM available_models WHERE module_id = ?').get('subtitle_translation');
        if (!transExists) {
            db.prepare('INSERT INTO available_models (module_id, provider, model_id, display_name) VALUES (?, ?, ?, ?)').run('subtitle_translation', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet');
        }
    }
    catch (e) { }
    // Ensure vision_ai exists for existing databases
    try {
        const visionExists = db.prepare('SELECT id FROM available_models WHERE module_id = ?').get('vision_ai');
        if (!visionExists) {
            db.prepare('INSERT INTO available_models (module_id, provider, model_id, display_name) VALUES (?, ?, ?, ?)').run('vision_ai', 'openrouter', 'google/gemini-2.5-flash', 'Gemini 2.5 Flash');
        }
    }
    catch (e) { }
    // Ensure default pricing for subtitle_translation for all clients
    try {
        db.prepare(`
            INSERT OR IGNORE INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
            SELECT id, 'subtitle_translation', 0.015, '2025-01-01' FROM clients
        `).run();
    }
    catch (e) { }
    // Ensure default pricing for vision_ai for all clients
    try {
        db.prepare(`
            INSERT OR IGNORE INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
            SELECT id, 'vision_ai', 0.030, '2025-01-01' FROM clients
        `).run();
    }
    catch (e) { }
    // Seed default export templates
    try {
        const templateCount = db.prepare("SELECT COUNT(*) as count FROM export_templates").get();
        if (templateCount.count === 0) {
            console.log('[SQLite] Seeding default export templates...');
            const defaultTemplates = [
                {
                    module_name: 'transcription',
                    template_name: 'Default Transcription SRT',
                    template_content: '{{#each subtitles}}\n{{addOne @index}}\n{{formatSrtTime start}} --> {{formatSrtTime end}}\n{{text}}\n\n{{/each}}',
                    file_extension: 'srt'
                },
                {
                    module_name: 'subtitles',
                    template_name: 'Default Subtitles SRT',
                    template_content: '{{#each subtitles}}\n{{addOne @index}}\n{{formatSrtTime start}} --> {{formatSrtTime end}}\n{{text}}\n\n{{/each}}',
                    file_extension: 'srt'
                },
                {
                    module_name: 'metadata',
                    template_name: 'Default Metadata XML',
                    template_content: '<?xml version="1.0" encoding="UTF-8"?>\n<metadata>\n    <content>\n        <title>{{title}}</title>\n        <description>{{description}}</description>\n        <summary>{{summary}}</summary>\n        <category>{{category}}</category>\n        <tags>\n            {{#each tags}}\n            <tag>{{this}}</tag>\n            {{/each}}\n        </tags>\n    </content>\n    <technical>\n        <duration>{{technical.duration}}</duration>\n        <fps>{{technical.fps}}</fps>\n        <resolution>{{technical.resolution}}</resolution>\n    </technical>\n</metadata>',
                    file_extension: 'xml'
                },
                {
                    module_name: 'ad_breaks',
                    template_name: 'Default Ad Breaks XML',
                    template_content: '<?xml version="1.0" encoding="UTF-8"?>\n<ad_breaks>\n    <breaks>\n        {{#each ad_breaks}}\n        <break index="{{addOne @index}}">\n            <timecode>{{timecode start}}</timecode>\n            <start>{{start}}</start>\n            <end>{{end}}</end>\n            <type>{{type}}</type>\n            <reason>{{reason}}</reason>\n            <confidence>{{confidence}}</confidence>\n        </break>\n        {{/each}}\n    </breaks>\n</ad_breaks>',
                    file_extension: 'xml'
                },
                {
                    module_name: 'promo_breaks',
                    template_name: 'Default Viral Highlights XML',
                    template_content: '<?xml version="1.0" encoding="UTF-8"?>\n<highlights>\n    <segments>\n        {{#each promo_breaks}}\n        <segment index="{{addOne @index}}">\n            <title>{{title}}</title>\n            <start_timecode>{{timecode start}}</start_timecode>\n            <end_timecode>{{timecode end}}</end_timecode>\n            <start>{{start}}</start>\n            <end>{{end}}</end>\n            <score>{{score}}</score>\n            <reason>{{reason}}</reason>\n            <social_hooks>\n                {{#each social_hooks}}\n                <hook>{{this}}</hook>\n                {{/each}}\n            </social_hooks>\n        </segment>\n        {{/each}}\n    </segments>\n</highlights>',
                    file_extension: 'xml'
                },
                {
                    module_name: 'subtitle_translation',
                    template_name: 'Default Translation SRT',
                    template_content: '{{#each subtitles}}\n{{addOne @index}}\n{{formatSrtTime start}} --> {{formatSrtTime end}}\n{{text}}\n\n{{/each}}',
                    file_extension: 'srt'
                }
            ];
            const insertStmt = db.prepare(`
                INSERT INTO export_templates (client_id, module_name, template_name, template_content, file_extension, is_active)
                VALUES (NULL, ?, ?, ?, ?, 1)
            `);
            for (const t of defaultTemplates) {
                insertStmt.run(t.module_name, t.template_name, t.template_content, t.file_extension);
            }
        }
    }
    catch (seedErr) {
        console.error('[SQLite] Failed to seed default export templates:', seedErr.message);
    }
    try {
        db.prepare("ALTER TABLE ai_jobs ADD COLUMN audio_path TEXT").run();
    }
    catch (err) { }
    // Migration for internal provider check constraint
    try {
        // Test if 'internal' is allowed
        db.prepare("INSERT INTO api_request_logs (client_id, provider, endpoint, direction, created_at) VALUES (1, 'internal', 'migration-test', 'outgoing', datetime('now'))").run();
        db.prepare("DELETE FROM api_request_logs WHERE provider = 'internal' AND endpoint = 'migration-test'").run();
    }
    catch (err) {
        console.log('[SQLite] api_request_logs does not allow "internal" provider. Migrating table layout...');
        try {
            db.transaction(() => {
                db.prepare("PRAGMA foreign_keys=OFF").run();
                db.prepare("ALTER TABLE api_request_logs RENAME TO api_request_logs_old").run();
                db.prepare(`
                    CREATE TABLE api_request_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        client_id INTEGER NOT NULL,
                        provider TEXT NOT NULL,
                        endpoint TEXT NOT NULL,
                        model TEXT,
                        direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
                        request_method TEXT,
                        request_headers TEXT,
                        request_body TEXT,
                        response_status INTEGER,
                        response_body TEXT,
                        request_id TEXT,
                        error_message TEXT,
                        tokens_used INTEGER,
                        cost_usd REAL,
                        latency_ms INTEGER,
                        ip_address TEXT,
                        user_agent TEXT,
                        parent_job_id TEXT,
                        billed_cost REAL DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
                    )
                `).run();
                // Copy data, mapping unknown columns if necessary (billed_cost might be missing in some very old ones but should be fine)
                db.prepare("INSERT INTO api_request_logs SELECT * FROM api_request_logs_old").run();
                db.prepare("DROP TABLE api_request_logs_old").run();
                db.prepare("PRAGMA foreign_keys=ON").run();
            })();
            console.log('[SQLite] api_request_logs migration successful.');
        }
        catch (migErr) {
            console.error('[SQLite] FATAL: api_request_logs migration failed:', migErr);
        }
    }
    // AI LEARNING LOOP TABLE
    db.exec(`
        CREATE TABLE IF NOT EXISTS client_ai_examples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            module_name TEXT NOT NULL,
            context_summary TEXT, -- Brief description of the input context
            preferred_output TEXT NOT NULL, -- The JSON output verified by humans
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
