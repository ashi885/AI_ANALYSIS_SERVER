"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logsRouter = void 0;
const express_1 = require("express");
const logger_1 = require("../logger");
const auth_1 = require("../middleware/auth");
const access_logger_1 = require("../utils/access-logger");
exports.logsRouter = (0, express_1.Router)();
// All log endpoints require admin authentication
exports.logsRouter.use(auth_1.requireAdminAuth);
exports.logsRouter.get('/search-all', (req, res) => {
    const level = req.query.level;
    const category = req.query.category;
    const keyword = req.query.keyword;
    const requestId = req.query.requestId;
    const clientId = req.query.clientId ? parseInt(req.query.clientId) : undefined;
    const jobId = req.query.jobId ? parseInt(req.query.jobId) : undefined;
    const filters = {
        level: level !== 'ALL' ? level : undefined,
        category: category !== 'ALL' ? category : undefined,
        keyword: keyword || undefined,
        clientId,
        jobId,
        requestId
    };
    const entries = (0, logger_1.searchAllLogs)(filters);
    res.json({
        total: entries.length,
        filters,
        entries
    });
});
exports.logsRouter.get('/dates', (req, res) => {
    const dates = (0, logger_1.getAvailableLogDates)();
    res.json({ dates });
});
exports.logsRouter.get('/', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const level = req.query.level;
    const category = req.query.category;
    const clientId = req.query.clientId ? parseInt(req.query.clientId) : undefined;
    const jobId = req.query.jobId ? parseInt(req.query.jobId) : undefined;
    const requestId = req.query.requestId;
    const keyword = req.query.keyword;
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const filters = {
        level,
        category,
        clientId,
        jobId,
        keyword,
        requestId
    };
    const entries = (0, logger_1.getLogsForDate)(date, filters);
    const paginated = entries.slice(offset, offset + limit);
    res.json({
        date,
        total: entries.length,
        limit,
        offset,
        filters,
        entries: paginated
    });
});
exports.logsRouter.get('/job/:jobId', (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const entries = (0, logger_1.getLogsForDate)(date, { jobId });
    res.json({
        jobId,
        date,
        total: entries.length,
        entries
    });
});
exports.logsRouter.get('/client/:clientId', (req, res) => {
    const clientId = parseInt(req.params.clientId);
    const date = req.query.date;
    const requestId = req.query.requestId;
    let entries = [];
    if (date) {
        entries = (0, logger_1.getLogsForDate)(date, { clientId, requestId });
    }
    else {
        const dates = (0, logger_1.getAvailableLogDates)();
        for (const d of dates.slice(0, 7)) {
            entries = entries.concat((0, logger_1.getLogsForDate)(d, { clientId, requestId }));
        }
    }
    res.json({
        clientId,
        total: entries.length,
        entries: entries.slice(0, 100)
    });
});
exports.logsRouter.get('/stats', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const entries = (0, logger_1.getLogsForDate)(date);
    const stats = {
        total: entries.length,
        byLevel: {},
        byCategory: {},
        byClient: {},
        errors: entries.filter(e => e.level === 'ERROR'),
        recentErrors: entries.filter(e => e.level === 'ERROR').slice(-10)
    };
    for (const entry of entries) {
        stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
        if (entry.clientId) {
            stats.byClient[entry.clientId] = (stats.byClient[entry.clientId] || 0) + 1;
        }
    }
    res.json({ date, stats });
});
// Access log endpoints (separate from app logs)
exports.logsRouter.get('/access/dates', (req, res) => {
    const dates = (0, access_logger_1.getAccessLogDates)();
    res.json({ dates });
});
exports.logsRouter.get('/access', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const ip = req.query.ip;
    const blocked = req.query.blocked;
    const statusFilter = req.query.status;
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;
    let entries = (0, access_logger_1.getAccessLogsForDate)(date);
    if (ip)
        entries = entries.filter(e => e.ip.includes(ip));
    if (blocked !== undefined)
        entries = entries.filter(e => blocked === 'true' ? !!e.blocked : !e.blocked);
    if (statusFilter)
        entries = entries.filter(e => String(e.statusCode) === statusFilter);
    const paginated = entries.slice(offset, offset + limit);
    res.json({
        date,
        total: entries.length,
        limit,
        offset,
        entries: paginated
    });
});
