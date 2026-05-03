import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDbPath(): string {
    // Priority 1: Full custom path
    if (process.env.DB_PATH) {
        return path.isAbsolute(process.env.DB_PATH) 
            ? process.env.DB_PATH 
            : path.join(process.cwd(), process.env.DB_PATH);
    }
    // Priority 2: Data directory
    if (process.env.DATA_DIR) {
        return path.join(process.env.DATA_DIR, 'management.db');
    }
    // Default: local data folder
    return path.join(process.cwd(), 'data', 'management.db');
}

export function initDatabase(): Database.Database {
    if (db) return db;

    const dbPath = getDbPath();
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    console.log('[SQLite] INITIALIZING DATABASE SOURCE OF TRUTH AT:', path.resolve(dbPath));
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    createTables();

    return db;
}

export function getDatabase(): Database.Database {
    if (!db) {
        return initDatabase();
    }
    return db;
}

function createTables() {
    if (!db) return;

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
            provider_warn_threshold REAL DEFAULT 25.0
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

        // Migration: Add target_languages to existing ai_jobs table
        const aiJobsInfo = db.prepare("PRAGMA table_info(ai_jobs)").all() as any[];
        const hasTargetLangs = aiJobsInfo.some(col => col.name === 'target_languages');
        
        if (!hasTargetLangs) {
            console.log('[SQLite] MIGRATION: Adding target_languages column to ai_jobs table...');
            try {
                db.prepare("ALTER TABLE ai_jobs ADD COLUMN target_languages TEXT").run();
                console.log('[SQLite] MIGRATION SUCCESS: target_languages column added.');
            } catch (err: any) {
                console.error('[SQLite] MIGRATION FAILED:', err.message);
            }
        } else {
            console.log('[SQLite] Migration check: target_languages column already exists.');
        }

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
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
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
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
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
    ];
    for (const sql of migrations) {
        try { db.exec(sql); } catch (_) { /* column already exists */ }
    }

    // Indices should be created AFTER migrations in case columns were just added
    const indices = [
        `CREATE INDEX IF NOT EXISTS idx_api_logs_request_id ON api_request_logs(request_id)`,
    ];
    for (const sql of indices) {
        try { db.exec(sql); } catch (_) { /* index already exists */ }
    }

    seedDefaultData();
}

function seedDefaultData() {
    if (!db) return;

    const adminExists = db.prepare('SELECT id FROM admin_users WHERE email = ?').get('admin');
    if (!adminExists) {
        db.prepare('INSERT INTO admin_users (email, password, role) VALUES (?, ?, ?)').run('admin', 'cuepoint2025', 'admin');
    }

    const userExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin');
    if (!userExists) {
        db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('admin', 'cuepoint2025', 'ADMIN');
        db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('user@cuepoint.com', 'cuepoint-user', 'USER');
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

    const modelCount = db.prepare('SELECT COUNT(*) as count FROM available_models').get() as { count: number };
    if (modelCount.count === 0) {
        const models = [
            ['transcription', 'openai', 'whisper-1', 'Whisper-1'],
            ['subtitles', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
            ['subtitles', 'openrouter', 'openai/gpt-4o', 'GPT-4o'],
            ['metadata', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
            ['ad_breaks', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
            ['promo_breaks', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
            ['subtitle_translation', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
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
    } catch (err) {
        // Column already exists, ignore
    }

    // Ensure subtitle_translation exists for existing databases
    try {
        const transExists = db.prepare('SELECT id FROM available_models WHERE module_id = ?').get('subtitle_translation');
        if (!transExists) {
            db.prepare('INSERT INTO available_models (module_id, provider, model_id, display_name) VALUES (?, ?, ?, ?)').run(
                'subtitle_translation', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'
            );
        }
    } catch (e) {}

    // Ensure default pricing for subtitle_translation for all clients
    try {
        db.prepare(`
            INSERT OR IGNORE INTO module_pricing (client_id, module_name, cost_per_job, effective_from)
            SELECT id, 'subtitle_translation', 0.015, '2025-01-01' FROM clients
        `).run();
    } catch (e) {}

    try {
        db.prepare("ALTER TABLE ai_jobs ADD COLUMN audio_path TEXT").run();
    } catch (err) {}

    // Migration for internal provider check constraint
    try {
        // Test if 'internal' is allowed
        db.prepare("INSERT INTO api_request_logs (client_id, provider, endpoint, direction, created_at) VALUES (1, 'internal', 'migration-test', 'outgoing', datetime('now'))").run();
        db.prepare("DELETE FROM api_request_logs WHERE provider = 'internal' AND endpoint = 'migration-test'").run();
    } catch (err) {
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
        } catch (migErr) {
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
    `);
}

export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
