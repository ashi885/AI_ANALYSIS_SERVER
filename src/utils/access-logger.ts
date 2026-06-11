import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { getClientIp } from './ip-utils';

const LOG_DIR = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'logs')
    : path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface AccessEntry {
    timestamp: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    ip: string;
    clientId?: number;
    clientName?: string;
    userAgent: string;
    blocked?: string;
}

function getAccessLogFilename(date: Date = new Date()): string {
    return `access-${date.toISOString().split('T')[0]}.log`;
}

function formatAccessEntry(entry: AccessEntry): string {
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

export function logAccess(entry: AccessEntry) {
    const logFile = path.join(LOG_DIR, getAccessLogFilename(new Date(entry.timestamp)));
    fs.appendFileSync(logFile, formatAccessEntry(entry));
}

export function getAccessLogsForDate(date: string): AccessEntry[] {
    const logFile = path.join(LOG_DIR, `access-${date}.log`);
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf-8');
    return content.split('\n').filter(l => l.trim()).map(parseAccessLine);
}

function parseAccessLine(line: string): AccessEntry {
    const entry: AccessEntry = {
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
        if (p.startsWith('ip=')) entry.ip = p.slice(3);
        if (p.startsWith('client=')) {
            const val = p.slice(7);
            const [id, name] = val.split('/');
            entry.clientId = parseInt(id);
            entry.clientName = name;
        }
        if (p.startsWith('BLOCKED=')) entry.blocked = p.slice(8);
    }
    const uaMatch = line.match(/"([^"]*)"/);
    if (uaMatch) entry.userAgent = uaMatch[1];
    return entry;
}

export function getAccessLogDates(): string[] {
    if (!fs.existsSync(LOG_DIR)) return [];
    return fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('access-') && f.endsWith('.log'))
        .map(f => f.replace('access-', '').replace('.log', ''))
        .sort()
        .reverse();
}

export function accessLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const ip = getClientIp(req);

    res.on('finish', () => {
        const duration = Date.now() - start;
        const client = (req as any).client;
        const blocked = res.locals.accessBlocked as string | undefined;

        logAccess({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: duration,
            ip,
            clientId: client?.id,
            clientName: client?.name,
            userAgent: (req.headers['user-agent'] || '').slice(0, 200),
            blocked
        });
    });

    next();
}
