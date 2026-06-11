"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.devLogger = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_DIR = process.env.DATA_DIR
    ? path_1.default.join(process.env.DATA_DIR, 'logs')
    : path_1.default.join(process.cwd(), 'logs');
function logFile() {
    return path_1.default.join(LOG_DIR, `dev-${new Date().toISOString().split('T')[0]}.log`);
}
function write(level, jobId, message) {
    if (!fs_1.default.existsSync(LOG_DIR)) {
        fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
    }
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const tag = jobId ? ` [Job:${jobId}]` : '';
    const line = `[${ts}] [${level}]${tag} ${message}\n`;
    fs_1.default.appendFileSync(logFile(), line);
}
function preview(data, maxLen = 200) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    return raw.length <= maxLen ? raw : raw.slice(0, maxLen) + '...';
}
exports.devLogger = {
    info(jobId, message) { write('INFO', jobId, message); },
    warn(jobId, message) { write('WARN', jobId, message); },
    error(jobId, message) { write('ERROR', jobId, message); },
    preview
};
