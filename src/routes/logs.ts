import { Router, Request, Response } from 'express';
import { logger, getLogsForDate, getAvailableLogDates, searchAllLogs, LogEntry } from '../logger';

export const logsRouter = Router();

logsRouter.get('/search-all', (req: Request, res: Response) => {
    const level = req.query.level as string;
    const category = req.query.category as string;
    const keyword = req.query.keyword as string;
    const requestId = req.query.requestId as string;
    const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
    const jobId = req.query.jobId ? parseInt(req.query.jobId as string) : undefined;

    const filters = {
        level: level !== 'ALL' ? level : undefined,
        category: category !== 'ALL' ? category : undefined,
        keyword: keyword || undefined,
        clientId,
        jobId,
        requestId
    };

    const entries = searchAllLogs(filters);
    res.json({ 
        total: entries.length,
        filters,
        entries 
    });
});

logsRouter.get('/dates', (req: Request, res: Response) => {
    const dates = getAvailableLogDates();
    res.json({ dates });
});

logsRouter.get('/', (req: Request, res: Response) => {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];
    const level = req.query.level as string;
    const category = req.query.category as string;
    const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
    const jobId = req.query.jobId ? parseInt(req.query.jobId as string) : undefined;
    const requestId = req.query.requestId as string;
    const keyword = req.query.keyword as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const filters = {
        level,
        category,
        clientId,
        jobId,
        keyword,
        requestId
    };
    
    const entries = getLogsForDate(date, filters);
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

logsRouter.get('/job/:jobId', (req: Request, res: Response) => {
    const jobId = parseInt(req.params.jobId as string);
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    
    const entries = getLogsForDate(date, { jobId });
    
    res.json({
        jobId,
        date,
        total: entries.length,
        entries
    });
});

logsRouter.get('/client/:clientId', (req: Request, res: Response) => {
    const clientId = parseInt(req.params.clientId as string);
    const date = req.query.date as string;
    const requestId = req.query.requestId as string;
    
    let entries: LogEntry[] = [];
    
    if (date) {
        entries = getLogsForDate(date, { clientId, requestId });
    } else {
        const dates = getAvailableLogDates();
        for (const d of dates.slice(0, 7)) {
            entries = entries.concat(getLogsForDate(d, { clientId, requestId }));
        }
    }
    
    res.json({
        clientId,
        total: entries.length,
        entries: entries.slice(0, 100)
    });
});

logsRouter.get('/stats', (req: Request, res: Response) => {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];
    const entries = getLogsForDate(date);
    
    const stats = {
        total: entries.length,
        byLevel: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
        byClient: {} as Record<number, number>,
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
