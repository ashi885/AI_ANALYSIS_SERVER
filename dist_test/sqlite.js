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
    // Use DATA_DIR env var, or default to ./data in server directory
    const dataDir = process.env.DATA_DIR || path_1.default.join(__dirname, '..', 'data');
    return path_1.default.join(dataDir, 'management.db');
}
function initDatabase() {
    if (db)
        return db;
    const dbPath = getDbPath();
    const dbDir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
    console.log('[SQLite] Initializing database at:', dbPath);
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
            billing_margin_flat REAL DEFAULT 0.5,
            billing_margin_percent REAL DEFAULT 20,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'active',
            contract_start DATE,
            contract_end DATE,
            setup_fee REAL DEFAULT 0,
            plan TEXT DEFAULT 'Professional',
            module_rates TEXT
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
            provider TEXT NOT NULL CHECK(provider IN ('openai', 'openrouter', 'whisper', 'ai_service_primary', 'ai_service_secondary')),
            endpoint TEXT NOT NULL,
            model TEXT,
            direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
            request_method TEXT,
            request_headers TEXT,
            request_body TEXT,
            response_status INTEGER,
            response_body TEXT,
            error_message TEXT,
            tokens_used INTEGER,
            cost_usd REAL,
            latency_ms INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_api_logs_client_created ON api_request_logs(client_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_api_logs_direction ON api_request_logs(direction, created_at DESC);

        CREATE TABLE IF NOT EXISTS client_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            job_id INTEGER,
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

        CREATE TABLE IF NOT EXISTS provider_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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
    `);
    seedDefaultData();
}
function seedDefaultData() {
    if (!db)
        return;
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
    const modelCount = db.prepare('SELECT COUNT(*) as count FROM available_models').get();
    if (modelCount.count === 0) {
        const models = [
            ['transcription', 'openai', 'whisper-1', 'Whisper-1'],
            ['subtitles', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
            ['subtitles', 'openrouter', 'openai/gpt-4o', 'GPT-4o'],
            ['metadata', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
            ['ad_breaks', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
            ['promo_breaks', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
        ];
        const insertModel = db.prepare('INSERT INTO available_models (module_id, provider, model_id, display_name) VALUES (?, ?, ?, ?)');
        for (const model of models) {
            insertModel.run(...model);
        }
    }
}
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
