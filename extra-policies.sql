-- =====================================================
-- COMPLETE FIX FOR ANON KEY ACCESS
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. First, grant usage on server schema to anon role
GRANT USAGE ON SCHEMA server TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA server TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA server TO anon;

-- 2. Ensure tables exist and have proper permissions
SELECT table_name FROM information_schema.tables WHERE table_schema = 'server';

-- 3. If tables exist, grant permissions
GRANT SELECT ON ALL TABLES IN SCHEMA server TO anon;
GRANT INSERT ON ALL TABLES IN SCHEMA server TO anon;
GRANT UPDATE ON ALL TABLES IN SCHEMA server TO anon;
GRANT DELETE ON ALL TABLES IN SCHEMA server TO anon;

-- 4. Make sure RLS policies allow access
ALTER TABLE server.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE server.client_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for clients" ON server.clients;
DROP POLICY IF EXISTS "Allow all for usage" ON server.client_usage;

CREATE POLICY "clients_access_for_anon" ON server.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "usage_access_for_anon" ON server.client_usage FOR ALL USING (true) WITH CHECK (true);

-- 5. Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
