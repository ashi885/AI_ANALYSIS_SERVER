import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'logs')
    : path.join(process.cwd(), 'logs');

function logFile(): string {
    return path.join(LOG_DIR, `dev-${new Date().toISOString().split('T')[0]}.log`);
}

function write(level: string, jobId: string | undefined, message: string) {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const tag = jobId ? ` [Job:${jobId}]` : '';
    const line = `[${ts}] [${level}]${tag} ${message}\n`;
    fs.appendFileSync(logFile(), line);
}

function preview(data: any, maxLen: number = 200): string {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    return raw.length <= maxLen ? raw : raw.slice(0, maxLen) + '...';
}

export const devLogger = {
    info(jobId: string | undefined, message: string) { write('INFO', jobId, message); },
    warn(jobId: string | undefined, message: string) { write('WARN', jobId, message); },
    error(jobId: string | undefined, message: string) { write('ERROR', jobId, message); },
    preview
};
