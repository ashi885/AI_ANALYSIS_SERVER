-- Migration to add heartbeat and status tracking to the clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS watcher_status TEXT;
