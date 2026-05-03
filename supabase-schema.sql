-- =====================================================
-- SUPABASE SCHEMA FOR CUEPOINT SERVER (server schema)
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create server schema if not exists
CREATE SCHEMA IF NOT EXISTS server;

-- =====================================================
-- MIGRATIONS (add missing columns to existing tables)
-- =====================================================
ALTER TABLE server.client_models ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE server.clients ADD COLUMN IF NOT EXISTS client_uuid UUID DEFAULT gen_random_uuid();

-- =====================================================
-- ADMIN USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.admin_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default admin (updated to match user request)
INSERT INTO server.admin_users (email, password, role) VALUES
    ('admin', 'cuepoint2025', 'admin')
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;

-- =====================================================
-- CLIENT SCHEMA (for application data)
-- =====================================================
CREATE SCHEMA IF NOT EXISTS client;

-- =====================================================
-- USERS TABLE (Application Users)
-- =====================================================
CREATE TABLE IF NOT EXISTS client.users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('ADMIN', 'USER')) NOT NULL DEFAULT 'USER',
    client_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default application user
INSERT INTO client.users (email, password, role) VALUES
    ('admin', 'cuepoint2025', 'ADMIN'),
    ('user@cuepoint.com', 'cuepoint-user', 'USER')
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;

-- =====================================================
-- PERMISSIONS
-- =====================================================
-- Grant usage on schemas
GRANT USAGE ON SCHEMA server TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA client TO anon, authenticated, service_role;

-- Grant access to all tables in these schemas
GRANT ALL ON ALL TABLES IN SCHEMA server TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA client TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA server TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA client TO anon, authenticated, service_role;

-- =====================================================
-- CLIENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.clients (
    id BIGSERIAL PRIMARY KEY,
    client_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    api_endpoint TEXT,
    billing_margin_flat REAL DEFAULT 0.5,
    billing_margin_percent REAL DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    contract_start DATE,
    contract_end DATE,
    setup_fee REAL DEFAULT 0,
    plan TEXT DEFAULT 'Professional',
    module_rates JSONB
);

-- Index on api_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_api_key ON server.clients(api_key);

-- =====================================================
-- CLIENT API KEYS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.client_api_keys (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES server.clients(id) ON DELETE CASCADE,
    provider TEXT CHECK(provider IN ('openai', 'openrouter')) NOT NULL,
    api_key TEXT NOT NULL,
    api_key_prefix TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, provider)
);

-- =====================================================
-- AVAILABLE MODELS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.available_models (
    id BIGSERIAL PRIMARY KEY,
    module_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(module_id, provider, model_id)
);

-- =====================================================
-- PROVIDER LABELS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.provider_labels (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default provider labels
INSERT INTO server.provider_labels (provider, label) VALUES
    ('openai', 'Cuepoint - Transcription'),
    ('openrouter', 'Cuepoint - AI Analysis')
ON CONFLICT (provider) DO NOTHING;

-- =====================================================
-- MODULE PRICING TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.module_pricing (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES server.clients(id) ON DELETE CASCADE,
    module_name TEXT NOT NULL,
    cost_per_job REAL NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, module_name, effective_from)
);

-- =====================================================
-- CLIENT USAGE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.client_usage (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES server.clients(id) ON DELETE CASCADE,
    job_id BIGINT,
    user_id BIGINT,
    module_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    status TEXT CHECK(status IN ('success', 'error')) NOT NULL,
    cost_usd REAL NOT NULL,
    actual_cost_usd REAL,
    tokens_used BIGINT,
    latency_ms BIGINT,
    error_message TEXT,
    pricing_id BIGINT,
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_usage_client_created ON server.client_usage(client_id, created_at DESC);

-- =====================================================
-- API REQUEST LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS server.api_request_logs (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES server.clients(id) ON DELETE CASCADE,
    provider TEXT CHECK(provider IN ('openai', 'openrouter', 'whisper')) NOT NULL,
    endpoint TEXT NOT NULL,
    model TEXT,
    direction TEXT CHECK(direction IN ('incoming', 'outgoing')) NOT NULL,
    request_method TEXT,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    tokens_used BIGINT,
    cost_usd REAL,
    latency_ms BIGINT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_client_created ON server.api_request_logs(client_id, created_at DESC);

-- =====================================================
-- SEED DEFAULT MODELS
-- =====================================================
INSERT INTO server.available_models (module_id, provider, model_id, display_name) VALUES
    -- Transcription
    ('transcription', 'openai', 'whisper-1', 'Whisper-1'),
    -- Subtitles
    ('subtitles', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'),
    ('subtitles', 'openrouter', 'anthropic/claude-3-opus', 'Claude 3 Opus'),
    ('subtitles', 'openrouter', 'openai/gpt-4o', 'GPT-4o'),
    ('subtitles', 'openrouter', 'openai/gpt-4-turbo', 'GPT-4 Turbo'),
    ('subtitles', 'openrouter', 'google/gemini-pro-1.5', 'Gemini Pro 1.5'),
    -- Metadata
    ('metadata', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'),
    ('metadata', 'openrouter', 'anthropic/claude-3-opus', 'Claude 3 Opus'),
    ('metadata', 'openrouter', 'openai/gpt-4o', 'GPT-4o'),
    ('metadata', 'openrouter', 'google/gemini-pro-1.5', 'Gemini Pro 1.5'),
    -- Ad Breaks
    ('ad_breaks', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'),
    ('ad_breaks', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'),
    ('ad_breaks', 'openrouter', 'openai/gpt-4o', 'GPT-4o'),
    -- Promo Breaks
    ('promo_breaks', 'openrouter', 'anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet'),
    ('promo_breaks', 'openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'),
    ('promo_breaks', 'openrouter', 'openai/gpt-4o', 'GPT-4o')
ON CONFLICT (module_id, provider, model_id) DO NOTHING;

-- =====================================================
-- CLIENT MODELS TABLE (per-client model configuration)
-- =====================================================
CREATE TABLE IF NOT EXISTS server.client_models (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES server.clients(id) ON DELETE CASCADE,
    module_name TEXT NOT NULL,
    api_provider TEXT NOT NULL,
    api_model TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, module_name)
);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE server.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.client_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.available_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.provider_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.module_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.client_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client.users ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (Allow all for service role)
-- =====================================================
CREATE POLICY "Allow all for clients" ON server.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for api_keys" ON server.client_api_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for models" ON server.available_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for labels" ON server.provider_labels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pricing" ON server.module_pricing FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for usage" ON server.client_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for logs" ON server.api_request_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for client_models" ON server.client_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for admin_users" ON server.admin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for users" ON client.users FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- VIEWS FOR AGGREGATE DATA
-- =====================================================
-- Client Usage Summary View
CREATE OR REPLACE VIEW server.usage_summary_by_module AS
SELECT
    client_id,
    module_name,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status = 'success') as successful_requests,
    COUNT(*) FILTER (WHERE status = 'error') as failed_requests,
    COALESCE(SUM(cost_usd) FILTER (WHERE status = 'success'), 0) as total_cost,
    SUM(tokens_used) as total_tokens,
    AVG(latency_ms) as avg_latency_ms
FROM server.client_usage
GROUP BY client_id, module_name;

-- Client Usage Totals View
CREATE OR REPLACE VIEW server.usage_totals AS
SELECT
    client_id,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status = 'success') as successful_requests,
    COUNT(*) FILTER (WHERE status = 'error') as failed_requests,
    COALESCE(SUM(cost_usd) FILTER (WHERE status = 'success'), 0) as total_cost,
    SUM(tokens_used) as total_tokens,
    AVG(latency_ms) as avg_latency_ms
FROM server.client_usage
GROUP BY client_id;

-- API Stats View
CREATE OR REPLACE VIEW server.api_stats AS
SELECT
    client_id,
    provider,
    direction,
    COUNT(*) as request_count,
    SUM(tokens_used) as total_tokens,
    SUM(cost_usd) as total_cost,
    AVG(latency_ms) as avg_latency_ms,
    COUNT(*) FILTER (WHERE response_status >= 400) as error_count
FROM server.api_request_logs
GROUP BY client_id, provider, direction;

-- =====================================================
-- PENDING SYNC QUEUE TABLE (for disaster recovery)
-- =====================================================
CREATE TABLE IF NOT EXISTS server.pending_sync_queue (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_type TEXT NOT NULL,
    job_id BIGINT,
    module_name TEXT,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'failed')),
    retry_count INTEGER DEFAULT 0,
    last_attempt TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_sync_status ON server.pending_sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_sync_job ON server.pending_sync_queue(job_id);

-- =====================================================
-- JOB COMPLETIONS TABLE (for disaster recovery audit)
-- =====================================================
CREATE TABLE IF NOT EXISTS server.job_completions (
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT,
    license_key TEXT,
    local_job_id BIGINT,
    filename TEXT,
    user_id BIGINT,
    status TEXT NOT NULL,
    modules_completed JSONB,
    duration_seconds REAL,
    total_cost_usd REAL,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_completions_client ON server.job_completions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_completions_local ON server.job_completions(local_job_id);

-- =====================================================
-- SMTP SETTINGS TABLE (server configuration)
-- =====================================================
CREATE TABLE IF NOT EXISTS server.smtp_settings (
    id BIGSERIAL PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 587,
    secure INTEGER DEFAULT 0,
    username TEXT,
    password_encrypted TEXT,
    auth_type TEXT DEFAULT 'normal' CHECK(auth_type IN ('normal', 'none', 'oauth2')),
    from_email TEXT,
    from_name TEXT DEFAULT 'Cuepoint Support',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EMAIL NOTIFICATION SETTINGS TABLE (per-event alerts)
-- =====================================================
CREATE TABLE IF NOT EXISTS server.email_notification_settings (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL UNIQUE,
    event_label TEXT NOT NULL,
    description TEXT,
    is_enabled INTEGER DEFAULT 0,
    recipient_emails JSONB DEFAULT '[]'::jsonb,
    threshold_value INTEGER,
    threshold_unit TEXT,
    min_pending_age_hours INTEGER,
    is_active INTEGER DEFAULT 1,
    last_triggered TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default notification settings
INSERT INTO server.email_notification_settings (event_type, event_label, description, is_enabled, recipient_emails, threshold_value, threshold_unit, min_pending_age_hours)
VALUES
    ('pending_queue_count', 'Pending Sync Queue', 'Alert when pending sync queue exceeds threshold', 0, '[]', 10, 'items', NULL),
    ('pending_queue_age', 'Pending Sync Age', 'Alert when pending items are older than threshold', 0, '[]', NULL, NULL, 24),
    ('sync_failures', 'Sync Failures', 'Alert on repeated sync failures', 0, '[]', 5, 'failures', NULL)
ON CONFLICT (event_type) DO NOTHING;

-- =====================================================
-- RLS POLICIES FOR NEW TABLES
-- =====================================================
ALTER TABLE server.pending_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.job_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.smtp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.email_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for pending_sync_queue" ON server.pending_sync_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for job_completions" ON server.job_completions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for smtp_settings" ON server.smtp_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for email_notification_settings" ON server.email_notification_settings FOR ALL USING (true) WITH CHECK (true);

SELECT 'Server and Client schemas updated successfully!' as result;
