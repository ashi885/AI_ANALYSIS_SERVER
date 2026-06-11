"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAccess = logAccess;
exports.getAccessLogsForDate = getAccessLogsForDate;
exports.getAccessLogDates = getAccessLogDates;
exports.accessLoggerMiddleware = accessLoggerMiddleware;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ip_utils_1 = require("./ip-utils");
const LOG_DIR = process.env.DATA_DIR
    ? path_1.default.join(process.env.DATA_DIR, 'logs')
    : path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(LOG_DIR)) {
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
}
function getAccessLogFilename(date = new Date()) {
    return `access-${date.toISOString().split('T')[0]}.log`;
}
function formatAccessEntry(entry) {
    const ts = entry.timestamp;
    const ua = entry.userAgent.replace(/"/g, '\\"');
    const parts = [
        `[${ts}]`,
        entry.method,
        entry.path,
        String(entry.statusCode),
        `${entry.durationMs}ms`,
        `ip=${entry.ip}`,
        `"${ua}"`,
    ];
    if (entry.clientId) {
        parts.push(`client=${entry.clientId}${entry.clientName ? `/${entry.clientName}` : ''}`);
    }
    if (entry.blocked) {
        parts.push(`BLOCKED=${entry.blocked}`);
    }
    return parts.join(' ') + '\n';
}
function logAccess(entry) {
    const logFile = path_1.default.join(LOG_DIR, getAccessLogFilename(new Date(entry.timestamp)));
    fs_1.default.appendFileSync(logFile, formatAccessEntry(entry));
}
function getAccessLogsForDate(date) {
    const logFile = path_1.default.join(LOG_DIR, `access-${date}.log`);
    if (!fs_1.default.existsSync(logFile))
        return [];
    const content = fs_1.default.readFileSync(logFile, 'utf-8');
    return content.split('\n').filter(l => l.trim()).map(parseAccessLine);
}
function parseAccessLine(line) {
    const entry = {
        timestamp: '',
        method: '',
        path: '',
        statusCode: 0,
        durationMs: 0,
        ip: '',
        userAgent: ''
    };
    const tsMatch = line.match(/^\[(.*?)\]\s+/);
    if (tsMatch) {
        entry.timestamp = tsMatch[1];
        line = line.slice(tsMatch[0].length);
    }
    const parts = line.split(/\s+/);
    entry.method = parts[0] || '';
    entry.path = parts[1] || '';
    entry.statusCode = parseInt(parts[2]) || 0;
    entry.durationMs = parseInt(parts[3]) || 0;
    for (const p of parts) {
        if (p.startsWith('ip='))
            entry.ip = p.slice(3);
        if (p.startsWith('client=')) {
            const val = p.slice(7);
            const [id, name] = val.split('/');
            entry.clientId = parseInt(id);
            entry.clientName = name;
        }
        if (p.startsWith('BLOCKED='))
            entry.blocked = p.slice(8);
    }
    const uaMatch = line.match(/"([^"]*)"/);
    if (uaMatch)
        entry.userAgent = uaMatch[1];
    return entry;
}
function getAccessLogDates() {
    if (!fs_1.default.existsSync(LOG_DIR))
        return [];
    return fs_1.default.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('access-') && f.endsWith('.log'))
        .map(f => f.replace('access-', '').replace('.log', ''))
        .sort()
        .reverse();
}
function accessLoggerMiddleware(req, res, next) {
    const start = Date.now();
    const ip = (0, ip_utils_1.getClientIp)(req);
    res.on('finish', () => {
        const duration = Date.now() - start;
        const client = req.client;
        const blocked = res.locals.accessBlocked;
        logAccess({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: duration,
            ip,
            clientId: client === null || client === void 0 ? void 0 : client.id,
            clientName: client === null || client === void 0 ? void 0 : client.name,
            userAgent: (req.headers['user-agent'] || '').slice(0, 200),
            blocked
        });
    });
    next();
}
