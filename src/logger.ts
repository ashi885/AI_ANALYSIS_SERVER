import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.DATA_DIR 
    ? path.join(process.env.DATA_DIR, 'logs')
    : path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

let cachedSystemTimezone: string | null = null;
let lastTimezoneCheck = 0;

function getSystemTimezone(): string {
    const NOW = Date.now();
    if (cachedSystemTimezone && (NOW - lastTimezoneCheck < 60000)) {
        return cachedSystemTimezone;
    }

    try {
        const { getDatabase } = require('./sqlite');
        const db = getDatabase();
        const row = db.prepare("SELECT value FROM system_settings WHERE key = 'system_timezone'").get() as { value: string } | undefined;
        cachedSystemTimezone = row?.value || 'UTC';
        lastTimezoneCheck = NOW;
        return cachedSystemTimezone;
    } catch {
        return 'UTC';
    }
}

function formatTimestamp(date: Date = new Date()): string {
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
    } catch {
        return date.toISOString();
    }
}

export interface LogEntry {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    category: 'API' | 'JOB' | 'AUTH' | 'DB' | 'AI' | 'SYSTEM';
    clientId?: number;
    clientName?: string;
    userId?: number;
    jobId?: string | number;
    action: string;
    message: string;
    details?: any;
    durationMs?: number;
    statusCode?: number;
    requestId?: string;
    error?: string;
}

function getLogFilename(date: Date = new Date()): string {
    return `server-${date.toISOString().split('T')[0]}.log`;
}

function formatEntry(entry: LogEntry & { displayTimestamp?: string }, forConsole: boolean = false): string {
    const ts = entry.displayTimestamp || entry.timestamp;
    const base = `[${ts}] [${entry.level}] [${entry.category}]`;
    let extra = '';
    
    if (entry.clientId) extra += ` [Client:${entry.clientId}`;
    if (entry.clientName) extra += `/${entry.clientName}`;
    if (entry.clientId) extra += ']';
    
    if (entry.userId) extra += ` [User:${entry.userId}]`;
    if (entry.jobId) extra += ` [Job:${entry.jobId}]`;
    if (entry.durationMs) extra += ` [${entry.durationMs}ms]`;
    if (entry.statusCode) extra += ` [${entry.statusCode}]`;
    if (entry.requestId) extra += ` [ReqID:${entry.requestId}]`;
    
    let line = `${base}${extra} ${entry.action}: ${entry.message}`;
    
    if (entry.details) {
        const detailsStr = forConsole 
            ? JSON.stringify(entry.details, null, 2) 
            : JSON.stringify(entry.details);
        line += forConsole ? `\n--- DETAILS ---\n${detailsStr}\n---------------` : ` | Details: ${detailsStr}`;
    }
    
    if (entry.error) line += ` | Error: ${entry.error}`;
    
    return line + (forConsole ? '' : '\n');
}

function writeLog(entry: LogEntry) {
    // Convert UTC timestamp to display timestamp
    const displayTimestamp = formatTimestamp(new Date(entry.timestamp));
    const entryWithDisplay = { ...entry, displayTimestamp };
    
    // Automatically extract requestId from details if present to improve log consistency
    if (!entry.requestId && entry.details?.requestId) {
        entry.requestId = entry.details.requestId;
    }
    if (!entry.requestId && entry.details?.id && (entry.category === 'AI' || entry.category === 'API')) {
        entry.requestId = entry.details.id;
    }

    const logLineFile = formatEntry(entryWithDisplay, false);
    const logFile = path.join(LOG_DIR, getLogFilename(new Date(entry.timestamp)));
    
    fs.appendFileSync(logFile, logLineFile);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
        const logLineConsole = formatEntry(entry, true);
        console.log(logLineConsole.trim());
    }
}

export const logger = {
    info(category: LogEntry['category'], action: string, message: string, details?: any) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            category,
            action,
            message,
            details
        });
    },
    
    warn(category: LogEntry['category'], action: string, message: string, details?: any) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: 'WARN',
            category,
            action,
            message,
            details
        });
    },
    
    error(category: LogEntry['category'], action: string, message: string, error?: string, details?: any) {
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
    
    debug(category: LogEntry['category'], action: string, message: string, details?: any) {
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
    
    api(action: string, message: string, options: {
        clientId?: number;
        clientName?: string;
        userId?: number;
        jobId?: string | number;
        durationMs?: number;
        statusCode?: number;
        error?: string;
        details?: any;
    } = {}) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: options.error ? 'ERROR' : 'INFO',
            category: 'API',
            action,
            message,
            ...options
        });
    },
    
    job(action: string, message: string, options: {
        clientId?: number;
        userId?: number;
        jobId?: string | number;
        durationMs?: number;
        error?: string;
        details?: any;
    } = {}) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: options.error ? 'ERROR' : 'INFO',
            category: 'JOB',
            action,
            message,
            ...options
        });
    },
    
    ai(action: string, message: string, options: {
        clientId?: number;
        clientName?: string;
        userId?: number;
        jobId?: string | number;
        durationMs?: number;
        cost?: number;
        error?: string;
        details?: any;
    } = {}) {
        writeLog({
            timestamp: new Date().toISOString(),
            level: options.error ? 'ERROR' : 'INFO',
            category: 'AI',
            action,
            message,
            ...options
        });
    }
};

export function getLogsForDate(date: string, filters?: {
    level?: string;
    category?: string;
    clientId?: number;
    jobId?: number;
    keyword?: string;
    requestId?: string;
}): LogEntry[] {
    const logFile = path.join(LOG_DIR, `server-${date}.log`);
    
    if (!fs.existsSync(logFile)) {
        return [];
    }
    
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    const entries: LogEntry[] = [];
    
    for (const line of lines) {
        try {
            const entry = parseLogLine(line);
            if (!entry) continue;
            
            if (filters) {
                if (filters.level && entry.level !== filters.level) continue;
                if (filters.category && entry.category !== filters.category) continue;
                if (filters.clientId && entry.clientId !== filters.clientId) continue;
                if (filters.jobId && entry.jobId !== filters.jobId) continue;
                if (filters.requestId && !entry.requestId?.toLowerCase().includes(filters.requestId.toLowerCase())) continue;
                if (filters.keyword) {
                    const kw = filters.keyword.toLowerCase();
                    if (!entry.message.toLowerCase().includes(kw) && 
                        !entry.action.toLowerCase().includes(kw) &&
                        !entry.error?.toLowerCase().includes(kw)) {
                        continue;
                    }
                }
            }
            
            entries.push(entry);
        } catch (e) {
            // Skip unparseable lines
        }
    }
    
    return entries.reverse();
}

function parseLogLine(line: string): LogEntry | null {
    const match = line.match(/^\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*?)$/);
    if (!match) return null;
    
    const [, timestamp, level, category, rest] = match;
    
    const entry: LogEntry = {
        timestamp,
        level: level as LogEntry['level'],
        category: category as LogEntry['category'],
        action: '',
        message: ''
    };
    
    const clientMatch = rest.match(/\[Client:(\d+)(?:\/([^\\]]+))?\]/);
    if (clientMatch) {
        entry.clientId = parseInt(clientMatch[1]);
        entry.clientName = clientMatch[2];
    }
    
    const userMatch = rest.match(/\[User:(\d+)\]/);
    if (userMatch) entry.userId = parseInt(userMatch[1]);
    
    const jobMatch = rest.match(/\[Job:(\d+)\]/);
    if (jobMatch) entry.jobId = parseInt(jobMatch[1]);
    
    const durationMatch = rest.match(/\[(\d+)ms\]/);
    if (durationMatch) entry.durationMs = parseInt(durationMatch[1]);
    
    const statusMatch = rest.match(/\[(\d{3})\]/);
    if (statusMatch) entry.statusCode = parseInt(statusMatch[1]);

    const reqIdMatch = rest.match(/\[ReqID:(.+?)\]/);
    if (reqIdMatch) entry.requestId = reqIdMatch[1];
    
    const parts = rest.split(/: (.+)$/);
    if (parts.length >= 2) {
        entry.action = parts[0].replace(/\[.*?\]/g, '').trim();
        entry.message = parts.slice(1).join(': ').replace(/ \|.*$/, '');
        
        const errorMatch = rest.match(/Error: (.+?)(?: \||$)/);
        if (errorMatch) entry.error = errorMatch[1];

        const detailsMatch = rest.match(/\| Details: ({.+})$/);
        if (detailsMatch) {
            try {
                entry.details = JSON.parse(detailsMatch[1]);
                // If we didn't get a requestId from the [ReqID:...] tag, try details
                if (!entry.requestId && entry.details.requestId) {
                    entry.requestId = entry.details.requestId;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }
    
    return entry;
}

export function getAvailableLogDates(): string[] {
    if (!fs.existsSync(LOG_DIR)) return [];
    
    return fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('server-') && f.endsWith('.log'))
        .map(f => f.replace('server-', '').replace('.log', ''))
        .sort()
        .reverse();
}

export function searchAllLogs(filters: {
    level?: string;
    category?: string;
    keyword?: string;
    clientId?: number;
    jobId?: number;
    requestId?: string;
    limit?: number;
}): LogEntry[] {
    const dates = getAvailableLogDates();
    let allEntries: LogEntry[] = [];
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
