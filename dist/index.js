"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Final restart: Enabling deep forensic logging for translation debugging [v4]
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_1 = require("./routes/auth");
const ai_1 = require("./routes/ai");
const analyze_1 = require("./routes/analyze");
const mgmt_1 = require("./routes/mgmt");
const logs_1 = require("./routes/logs");
const logger_1 = require("./logger");
const supabase_1 = require("./supabase");
const license_cache_1 = require("./license-cache");
const sqlite_1 = require("./sqlite");
const ai_queue_1 = require("./ai-queue");
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
async function checkDatabaseConnections() {
    console.log('\n=== Database Connection Status ===');
    const results = await (0, supabase_1.checkConnections)();
    const status = (0, supabase_1.getConnectionStatus)();
    console.log(`Server DB: ${results.server ? 'Connected' : 'NOT CONNECTED'}`);
    if (status.server.error)
        console.log(`  Error: ${status.server.error}`);
    console.log(`Client DB: ${results.client ? 'Connected' : 'NOT CONNECTED'}`);
    if (status.client.error)
        console.log(`  Error: ${status.client.error}`);
    if (!results.client) {
        console.log('\n⚠️  WARNING: Client database not connected!');
        console.log('   Jobs and user data will not work properly.\n');
    }
}
// Middlewares
app.use((0, cors_1.default)({
    origin: '*', // Allow all for management access
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Global request logging
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
});
// Routes
app.use('/api/auth', auth_1.authRouter);
app.use('/api/ai', ai_1.aiRouter);
app.use('/api/ai', analyze_1.analyzeRouter);
app.use('/api/mgmt', mgmt_1.mgmtRouter);
app.use('/api/logs', logs_1.logsRouter);
app.get('/health', (req, res) => {
    const status = (0, supabase_1.getConnectionStatus)();
    const cacheStats = (0, license_cache_1.getLicenseCacheStats)();
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
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !fs_1.default.existsSync(path_1.default.join(__dirname, '../dist/client/index.html'));
if (!isDev) {
    // Serve Static Management UI in production
    app.use(express_1.default.static(path_1.default.join(__dirname, '../dist/client')));
    // SPA Fallback for production (using *splat for Express 5 compat)
    app.get('*splat', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path_1.default.join(__dirname, '../dist/client/index.html'));
        }
        else {
            res.status(404).json({ error: 'API endpoint not found' });
        }
    });
}
else {
    // In development, provide a landing message for port 3001
    app.get('/', (req, res) => {
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
    logger_1.logger.info('SYSTEM', 'BOOT', `Server started on port ${port} (v1.0.0)`);
    // Initialize SQLite database
    console.log('[SQLite] Initializing database...');
    try {
        (0, sqlite_1.initDatabase)();
        console.log('[SQLite] Database initialized at:', (0, sqlite_1.getDbPath)());
    }
    catch (err) {
        console.error('[SQLite] Failed to initialize database:', err.message);
    }
    await checkDatabaseConnections();
    await (0, license_cache_1.initializeLicenseCache)();
    await initializeServerTables();
    await (0, ai_queue_1.initQueueWorker)();
});
async function initializeServerTables() {
    console.log('[DB] Server tables initialized');
}
