const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../management.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    license_key TEXT UNIQUE NOT NULL,
    api_endpoint TEXT,
    billing_margin_flat REAL DEFAULT 0.50,
    billing_margin_percent REAL DEFAULT 20.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS client_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    module_name TEXT NOT NULL,
    api_provider TEXT NOT NULL,
    api_model TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  -- Add a default client for existing setup
  INSERT OR IGNORE INTO clients (id, name, license_key) VALUES (1, 'Default Client', 'CUE-DEFAULT-001');
  
  -- Default models for the default client
  INSERT OR IGNORE INTO client_models (client_id, module_name, api_provider, api_model) VALUES 
    (1, 'transcription', 'openai', 'whisper-1'),
    (1, 'subtitles', 'openrouter', 'anthropic/claude-3.5-sonnet'),
    (1, 'metadata', 'openrouter', 'anthropic/claude-3.5-sonnet'),
    (1, 'ad_breaks', 'openrouter', 'anthropic/claude-3.5-sonnet'),
    (1, 'promo_breaks', 'openrouter', 'anthropic/claude-3.5-sonnet');
`);

console.log('Management database initialized at:', dbPath);
