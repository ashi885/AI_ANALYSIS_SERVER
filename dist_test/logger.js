"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.getLogsForDate = getLogsForDate;
exports.getAvailableLogDates = getAvailableLogDates;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_DIR = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(LOG_DIR)) {
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
}
function getLogFilename(date = new Date()) {
    return `server-${date.toISOString().split('T')[0]}.log`;
}
function formatEntry(entry) {
    const base = `[${entry.timestamp}] [${entry.level}] [${entry.category}]`;
    let extra = '';
    if (entry.clientId)
        extra += ` [Client:${entry.clientId}`;
    if (entry.clientName)
        extra += `/${entry.clientName}`;
    if (entry.clientId)
        extra += ']';
    if (entry.userId)
        extra += ` [User:${entry.userId}]`;
    if (entry.jobId)
        extra += ` [Job:${entry.jobId}]`;
    if (entry.durationMs)
        extra += ` [${entry.durationMs}ms]`;
    if (entry.statusCode)
        extra += ` [${entry.statusCode}]`;
    let line = `${base}${extra} ${entry.action}: ${entry.message}`;
    if (entry.details)
        line += ` | Details: ${JSON.stringify(entry.details)}`;
    if (entry.error)
        line += ` | Error: ${entry.error}`;
    return line + '\n';
}
function writeLog(entry) {
    const logLine = formatEntry(entry);
    const logFile = path_1.default.join(LOG_DIR, getLogFilename(new Date(entry.timestamp)));
    fs_1.default.appendFileSync(logFile, logLine);
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
        console.log(logLine.trim());
    }
}
exports.logger = {
    info(category, action, message, details) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            category,
            action,
            message,
            details
        });
    },
    warn(category, action, message, details) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: 'WARN',
            category,
            action,
            message,
            details
        });
    },
    error(category, action, message, error, details) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            category,
            action,
            message,
            error,
            details
        });
    },
    debug(category, action, message, details) {
        if (process.env.DEBUG === 'true') {
            writeLog({
                timestamp: new Date().toISOString(),
                level: 'DEBUG',
                category,
                action,
                message,
                details
            });
        }
    },
    api(action, message, options = {}) {
        writeLog(Object.assign({ timestamp: new Date().toISOString(), level: options.error ? 'ERROR' : 'INFO', category: 'API', action,
            message }, options));
    },
    job(action, message, options = {}) {
        writeLog(Object.assign({ timestamp: new Date().toISOString(), level: options.error ? 'ERROR' : 'INFO', category: 'JOB', action,
            message }, options));
    },
    ai(action, message, options = {}) {
        writeLog(Object.assign({ timestamp: new Date().toISOString(), level: options.error ? 'ERROR' : 'INFO', category: 'AI', action,
            message }, options));
    }
};
function getLogsForDate(date, filters) {
    var _a;
    const logFile = path_1.default.join(LOG_DIR, `server-${date}.log`);
    if (!fs_1.default.existsSync(logFile)) {
        return [];
    }
    const content = fs_1.default.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const entries = [];
    for (const line of lines) {
        try {
            const entry = parseLogLine(line);
            if (!entry)
                continue;
            if (filters) {
                if (filters.level && entry.level !== filters.level)
                    continue;
                if (filters.category && entry.category !== filters.category)
                    continue;
                if (filters.clientId && entry.clientId !== filters.clientId)
                    continue;
                if (filters.jobId && entry.jobId !== filters.jobId)
                    continue;
                if (filters.keyword) {
                    const kw = filters.keyword.toLowerCase();
                    if (!entry.message.toLowerCase().includes(kw) &&
                        !entry.action.toLowerCase().includes(kw) &&
                        !((_a = entry.error) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(kw))) {
                        continue;
                    }
                }
            }
            entries.push(entry);
        }
        catch (e) {
            // Skip unparseable lines
        }
    }
    return entries;
}
function parseLogLine(line) {
    const match = line.match(/^\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*?)$/);
    if (!match)
        return null;
    const [, timestamp, level, category, rest] = match;
    const entry = {
        timestamp,
        level: level,
        category: category,
        action: '',
        message: ''
    };
    const clientMatch = rest.match(/\[Client:(\d+)(?:\/([^\\]]+))?\]/);
    if (clientMatch) {
        entry.clientId = parseInt(clientMatch[1]);
        entry.clientName = clientMatch[2];
    }
    const userMatch = rest.match(/\[User:(\d+)\]/);
    if (userMatch)
        entry.userId = parseInt(userMatch[1]);
    const jobMatch = rest.match(/\[Job:(\d+)\]/);
    if (jobMatch)
        entry.jobId = parseInt(jobMatch[1]);
    const durationMatch = rest.match(/\[(\d+)ms\]/);
    if (durationMatch)
        entry.durationMs = parseInt(durationMatch[1]);
    const statusMatch = rest.match(/\[(\d{3})\]/);
    if (statusMatch)
        entry.statusCode = parseInt(statusMatch[1]);
    const parts = rest.split(/: (.+)$/);
    if (parts.length >= 2) {
        entry.action = parts[0].replace(/\[.*?\]/g, '').trim();
        entry.message = parts.slice(1).join(': ').replace(/ \|.*$/, '');
        const errorMatch = rest.match(/Error: (.+?)(?: \||$)/);
        if (errorMatch)
            entry.error = errorMatch[1];
    }
    return entry;
}
function getAvailableLogDates() {
    if (!fs_1.default.existsSync(LOG_DIR))
        return [];
    return fs_1.default.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('server-') && f.endsWith('.log'))
        .map(f => f.replace('server-', '').replace('.log', ''))
        .sort()
        .reverse();
}
