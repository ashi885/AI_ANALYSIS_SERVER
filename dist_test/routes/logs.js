"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logsRouter = void 0;
const express_1 = require("express");
const logger_1 = require("../logger");
exports.logsRouter = (0, express_1.Router)();
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
    const keyword = req.query.keyword;
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const filters = {
        level,
        category,
        clientId,
        jobId,
        keyword
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
    let entries = [];
    if (date) {
        entries = (0, logger_1.getLogsForDate)(date, { clientId });
    }
    else {
        const dates = (0, logger_1.getAvailableLogDates)();
        for (const d of dates.slice(0, 7)) {
            entries = entries.concat((0, logger_1.getLogsForDate)(d, { clientId }));
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
