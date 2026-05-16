"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.getLogsForDate = getLogsForDate;
exports.getAvailableLogDates = getAvailableLogDates;
exports.searchAllLogs = searchAllLogs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_DIR = process.env.DATA_DIR
    ? path_1.default.join(process.env.DATA_DIR, 'logs')
    : path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(LOG_DIR)) {
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
}
let cachedSystemTimezone = null;
let lastTimezoneCheck = 0;
function getSystemTimezone() {
    const NOW = Date.now();
    if (cachedSystemTimezone && (NOW - lastTimezoneCheck < 60000)) {
        return cachedSystemTimezone;
    }
    try {
        const { getDatabase } = require('./sqlite');
        const db = getDatabase();
        const row = db.prepare("SELECT value FROM system_settings WHERE key = 'system_timezone'").get();
        cachedSystemTimezone = (row === null || row === void 0 ? void 0 : row.value) || 'UTC';
        lastTimezoneCheck = NOW;
        return cachedSystemTimezone;
    }
    catch (_a) {
        return 'UTC';
    }
}
function formatTimestamp(date = new Date()) {
    const tz = getSystemTimezone();
    try {
        return new Intl.DateTimeFormat('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: tz,
            timeZoneName: 'short'
        }).format(date).replace(',', '');
    }
    catch (_a) {
        return date.toISOString();
    }
}
function getLogFilename(date = new Date()) {
    return `server-${date.toISOString().split('T')[0]}.log`;
}
function formatEntry(entry, forConsole = false) {
    const ts = entry.displayTimestamp || entry.timestamp;
    const base = `[${ts}] [${entry.level}] [${entry.category}]`;
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
    if (entry.requestId)
        extra += ` [ReqID:${entry.requestId}]`;
    let line = `${base}${extra} ${entry.action}: ${entry.message}`;
    if (entry.details) {
        const detailsStr = forConsole
            ? JSON.stringify(entry.details, null, 2)
            : JSON.stringify(entry.details);
        line += forConsole ? `\n--- DETAILS ---\n${detailsStr}\n---------------` : ` | Details: ${detailsStr}`;
    }
    if (entry.error)
        line += ` | Error: ${entry.error}`;
    return line + (forConsole ? '' : '\n');
}
function writeLog(entry) {
    var _a, _b;
    // Convert UTC timestamp to display timestamp
    const displayTimestamp = formatTimestamp(new Date(entry.timestamp));
    const entryWithDisplay = Object.assign(Object.assign({}, entry), { displayTimestamp });
    // Automatically extract requestId from details if present to improve log consistency
    if (!entry.requestId && ((_a = entry.details) === null || _a === void 0 ? void 0 : _a.requestId)) {
        entry.requestId = entry.details.requestId;
    }
    if (!entry.requestId && ((_b = entry.details) === null || _b === void 0 ? void 0 : _b.id) && (entry.category === 'AI' || entry.category === 'API')) {
        entry.requestId = entry.details.id;
    }
    const logLineFile = formatEntry(entryWithDisplay, false);
    const logFile = path_1.default.join(LOG_DIR, getLogFilename(new Date(entry.timestamp)));
    fs_1.default.appendFileSync(logFile, logLineFile);
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
        const logLineConsole = formatEntry(entry, true);
        console.log(logLineConsole.trim());
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
    var _a, _b;
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
                if (filters.requestId && !((_a = entry.requestId) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(filters.requestId.toLowerCase())))
                    continue;
                if (filters.keyword) {
                    const kw = filters.keyword.toLowerCase();
                    if (!entry.message.toLowerCase().includes(kw) &&
                        !entry.action.toLowerCase().includes(kw) &&
                        !((_b = entry.error) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(kw))) {
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
    return entries.reverse();
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
    const reqIdMatch = rest.match(/\[ReqID:(.+?)\]/);
    if (reqIdMatch)
        entry.requestId = reqIdMatch[1];
    const parts = rest.split(/: (.+)$/);
    if (parts.length >= 2) {
        entry.action = parts[0].replace(/\[.*?\]/g, '').trim();
        entry.message = parts.slice(1).join(': ').replace(/ \|.*$/, '');
        const errorMatch = rest.match(/Error: (.+?)(?: \||$)/);
        if (errorMatch)
            entry.error = errorMatch[1];
        const detailsMatch = rest.match(/\| Details: ({.+})$/);
        if (detailsMatch) {
            try {
                entry.details = JSON.parse(detailsMatch[1]);
                // If we didn't get a requestId from the [ReqID:...] tag, try details
                if (!entry.requestId && entry.details.requestId) {
                    entry.requestId = entry.details.requestId;
                }
            }
            catch (e) {
                // Ignore parse errors
            }
        }
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
function searchAllLogs(filters) {
    const dates = getAvailableLogDates();
    let allEntries = [];
    const limit = filters.limit || 1000;
    for (const date of dates) {
        const entries = getLogsForDate(date, filters);
        allEntries = allEntries.concat(entries);
        if (allEntries.length >= limit) {
            allEntries = allEntries.slice(0, limit);
            break;
        }
    }
    return allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
