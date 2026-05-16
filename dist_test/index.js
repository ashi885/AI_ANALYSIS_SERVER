"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_1 = require("./routes/auth");
const ai_1 = require("./routes/ai");
const analyze_1 = require("./routes/analyze");
const mgmt_1 = require("./routes/mgmt");
const logs_1 = require("./routes/logs");
const supabase_1 = require("./supabase");
const license_cache_1 = require("./license-cache");
const sqlite_1 = require("./sqlite");
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
// Serve Static Management UI (after build)
app.use(express_1.default.static(path_1.default.join(__dirname, '../dist/client')));
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
// Debug endpoint - test client credentials directly
app.get('/api/debug/credentials/:clientId', async (req, res) => {
    try {
        const clientId = parseInt(String(req.params.clientId));
        const { getClientApiKeys } = await Promise.resolve().then(() => __importStar(require('./db-mgmt')));
        const keys = await getClientApiKeys(clientId);
        res.json({ clientId, keys });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Global SPA Fallback for Management Portal
app.use((req, res) => {
    if (req.method === 'GET') {
        res.sendFile(path_1.default.join(__dirname, '../dist/client/index.html'));
    }
    else {
        res.status(405).json({ error: 'Method not allowed' });
    }
});
// Start Server
app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
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
});
async function initializeServerTables() {
    console.log('[DB] Server tables initialized');
}
