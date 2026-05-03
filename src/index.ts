import dotenv from 'dotenv';
// Final restart: Enabling deep forensic logging for translation debugging [v4]
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { aiRouter } from './routes/ai';
import { analyzeRouter } from './routes/analyze';
import { mgmtRouter } from './routes/mgmt';
import { logsRouter } from './routes/logs';
import { logger } from './logger';
import { checkConnections, getConnectionStatus } from './supabase';
import { initializeLicenseCache, getLicenseCacheStats } from './license-cache';
import { initDatabase, getDbPath } from './sqlite';
import { initializeDatabase } from './db-mgmt';
import { initQueueWorker } from './ai-queue';

const app = express();
const port = process.env.PORT || 3001;

async function checkDatabaseConnections() {
    console.log('\n=== Database Connection Status ===');
    
    const results = await checkConnections();
    const status = getConnectionStatus();
    
    console.log(`Server DB: ${results.server ? 'Connected' : 'NOT CONNECTED'}`);
    if (status.server.error) console.log(`  Error: ${status.server.error}`);
    
    console.log(`Client DB: ${results.client ? 'Connected' : 'NOT CONNECTED'}`);
    if (status.client.error) console.log(`  Error: ${status.client.error}`);
    
    if (!results.client) {
        console.log('\n⚠️  WARNING: Client database not connected!');
        console.log('   Jobs and user data will not work properly.\n');
    }
}

// Middlewares
app.use(cors({
    origin: '*', // Allow all for management access
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Global request logging
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ai', analyzeRouter);
app.use('/api/mgmt', mgmtRouter);
app.use('/api/logs', logsRouter);

app.get('/health', (req: Request, res: Response) => {
    const status = getConnectionStatus();
    const cacheStats = getLicenseCacheStats();
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        database: {
            client: status.client.status,
            server: status.server.status
        },
        licenseCache: cacheStats
    });
});

// Static UI Hosting logic
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !fs.existsSync(path.join(__dirname, '../dist/client/index.html'));

if (!isDev) {
    // Serve Static Management UI in production
    app.use(express.static(path.join(__dirname, '../dist/client')));
    
    // SPA Fallback for production (using *splat for Express 5 compat)
    app.get('*splat', (req: Request, res: Response) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(__dirname, '../dist/client/index.html'));
        } else {
            res.status(404).json({ error: 'API endpoint not found' });
        }
    });
} else {
    // In development, provide a landing message for port 3001
    app.get('/', (req: Request, res: Response) => {
        res.send(`
            <div style="font-family: sans-serif; padding: 40px; text-align: center; background: #0a0a0f; color: white; height: 100vh;">
                <h1 style="color: #10b981;">Cuepoint Server (API Mode)</h1>
                <p>Backend is running on port ${port}.</p>
                <div style="margin: 20px; padding: 20px; border: 1px solid #333; border-radius: 8px; display: inline-block;">
                    <p>Looking for the <strong>Management UI</strong>?</p>
                    <a href="http://localhost:3003" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                        Go to Development Portal (Port 3003)
                    </a>
                </div>
                <p style="font-size: 12px; color: #666; margin-top: 40px;">Static serving is disabled in development mode.</p>
            </div>
        `);
    });
}

// Start Server
app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    
    // Log server startup to system logs (forces creation of today's file)
    logger.info('SYSTEM', 'BOOT', `Server started on port ${port} (v1.0.0)`);
    
    // Initialize SQLite database
    console.log('[SQLite] Initializing database...');
    try {
        initDatabase();
        console.log('[SQLite] Database initialized at:', getDbPath());
    } catch (err: any) {
        console.error('[SQLite] Failed to initialize database:', err.message);
    }
    
    await checkDatabaseConnections();
    await initializeLicenseCache();
    await initializeServerTables();
    await initQueueWorker();
});

async function initializeServerTables() {
    console.log('[DB] Server tables initialized');
}
