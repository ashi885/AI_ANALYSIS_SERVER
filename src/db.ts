import { getDatabase, initDatabase } from './sqlite';

let connectionStatus: 'connected' | 'disconnected' | 'checking' = 'checking';
let connectionError: string | null = null;

export function getRemoteClient(): any {
    return getDatabase();
}

export async function checkConnection(): Promise<boolean> {
    try {
        const db = getDatabase();
        db.prepare('SELECT id FROM users LIMIT 1').get();
        // Migration to rename email to username
        try {
            db.exec("ALTER TABLE users RENAME COLUMN email TO username;");
        } catch(e) {}

        // Disable Vision AI module globally
        try {
            db.exec("UPDATE analysis_modules SET is_enabled = 0 WHERE name = 'vision_ai';");
            // Also disable for all users
            const visionModuleId = db.prepare("SELECT id FROM analysis_modules WHERE name = 'vision_ai'").get()?.id;
            if (visionModuleId) {
                db.exec(`UPDATE user_analysis_settings SET is_enabled = 0 WHERE module_id = ${visionModuleId}`);
            }
        } catch(e: any) { console.error('[DB Migration] vision_ai disable failed:', e.message); }
        connectionStatus = 'connected';
        connectionError = null;
        return true;
    } catch (e: any) {
        connectionStatus = 'disconnected';
        connectionError = e.message || 'Failed to connect to database';
        return false;
    }
}

export function getConnectionStatus() {
    return { 
        client: { status: connectionStatus, error: connectionError },
        server: { status: connectionStatus, error: connectionError }
    };
}

class PreparedStatement {
    private sql: string;

    constructor(sql: string) {
        this.sql = sql;
    }

    private parseSQL(sql: string): { table: string; columns: string[]; whereClause: string | null; orderBy: string | null } {
        const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+$)/i);
        const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s+$)/i);

        const table = selectMatch ? selectMatch[2] : '';
        const columns = selectMatch ? selectMatch[1].split(',').map((c: string) => c.trim()) : [];
        
        return {
            table,
            columns,
            whereClause: whereMatch ? whereMatch[1] : null,
            orderBy: orderMatch ? orderMatch[1] : null
        };
    }

    private buildWhereClause(whereClause: string, params: any[]): Record<string, any> {
        const conditions: Record<string, any> = {};
        const parts = whereClause.split(/\s+AND\s+/i);
        
        let paramIndex = 0;
        for (const part of parts) {
            const match = part.match(/(\w+)\s*(=|>=|<=|>|<|!=)\s*\?/);
            if (match) {
                const [, col, op] = match;
                if (op === '=') {
                    conditions[col] = params[paramIndex];
                } else if (op === '>=') {
                    conditions[col] = { gte: params[paramIndex] };
                } else if (op === '<=') {
                    conditions[col] = { lte: params[paramIndex] };
                } else if (op === '>') {
                    conditions[col] = { gt: params[paramIndex] };
                } else if (op === '<') {
                    conditions[col] = { lt: params[paramIndex] };
                } else if (op === '!=') {
                    conditions[col] = { neq: params[paramIndex] };
                }
                paramIndex++;
            }
        }
        return conditions;
    }

    all(params: any[] = []): any[] {
        const db = getDatabase();
        const parsed = this.parseSQL(this.sql);
        if (!parsed.table) return [];

        let sql = `SELECT ${parsed.columns.includes('*') ? '*' : parsed.columns.join(',')} FROM ${parsed.table}`;
        const queryParams: any[] = [];

        if (parsed.whereClause) {
            const conditions = this.buildWhereClause(parsed.whereClause, params);
            const whereParts: string[] = [];
            for (const [col, val] of Object.entries(conditions)) {
                if (val && typeof val === 'object' && 'gte' in val) {
                    whereParts.push(`${col} >= ?`);
                    queryParams.push(val.gte);
                } else if (val && typeof val === 'object' && 'lte' in val) {
                    whereParts.push(`${col} <= ?`);
                    queryParams.push(val.lte);
                } else if (val && typeof val === 'object' && 'gt' in val) {
                    whereParts.push(`${col} > ?`);
                    queryParams.push(val.gt);
                } else if (val && typeof val === 'object' && 'lt' in val) {
                    whereParts.push(`${col} < ?`);
                    queryParams.push(val.lt);
                } else if (val && typeof val === 'object' && 'neq' in val) {
                    whereParts.push(`${col} != ?`);
                    queryParams.push(val.neq);
                } else {
                    whereParts.push(`${col} = ?`);
                    queryParams.push(val);
                }
            }
            if (whereParts.length > 0) {
                sql += ' WHERE ' + whereParts.join(' AND ');
            }
        }

        if (parsed.orderBy) {
            mgmtRouter.post('/clients/:id/api-keys', requireAdminAuth, async (req: Request, res: Response) => {
                const clientId = parseInt(String(req.params.id));
                const provider = String(req.body.provider);
                const { api_key } = req.body;
                // Disallow Vision AI API key configuration - feature coming soon
                if (provider === 'vision_ai') {
                    return res.status(403).json({ error: 'Vision AI module is currently disabled (coming soon)' });
                }
                if (!provider || !api_key) return res.status(400).json({ error: 'Provider and api_key are required' });
                const db = getDatabase();
                const client = db.prepare('SELECT api_key FROM clients WHERE id = ?').get(clientId) as any;
                const success = await setClientApiKey(clientId, provider as any, api_key);
                if (success && client?.api_key) {
                    await refreshLicenseInCache(clientId, client.api_key);
                }
                res.json({ success });
            });
            const orderParts = parsed.orderBy.split(/\s+/);
            const orderCol = orderParts[0];
            const orderDir = orderParts[1]?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            sql += ` ORDER BY ${orderCol} ${orderDir}`;
        }

        try {
            const rows = db.prepare(sql).all(...queryParams);
            return rows || [];
        } catch (e) {
            console.error('[DB] Query error:', e);
            return [];
        }
    }

    get(params: any[] = []): any {
        const results = this.all(params);
        return results[0] || null;
    }

    run(...params: any[]): { changes: number; lastInsertRowid: number } {
        const db = getDatabase();
        const parsed = this.parseSQL(this.sql);
        if (!parsed.table) return { changes: 0, lastInsertRowid: 0 };

        const isInsert = /INSERT\s+INTO/i.test(this.sql);
        const isUpdate = /UPDATE\s+\w+/i.test(this.sql);
        const isDelete = /DELETE\s+FROM/i.test(this.sql);

        if (isInsert) {
            const insertMatch = this.sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s*RETURNING\s+(\w+))?/i);
            if (insertMatch) {
                const [, table, colsStr] = insertMatch;
                const cols = colsStr.split(',').map((c: string) => c.trim());
                const values: Record<string, any> = {};
                
                for (let i = 0; i < cols.length; i++) {
                    const val = params[i];
                    if (val !== undefined) {
                        if (typeof val === 'string') {
                            try {
                                values[cols[i]] = (val.startsWith('{') || val.startsWith('[')) ? JSON.parse(val) : val;
                            } catch {
                                values[cols[i]] = val;
                            }
                        } else {
                            values[cols[i]] = val;
                        }
                    }
                }

                const colNames = Object.keys(values);
                const placeholders = colNames.map(() => '?').join(', ');
                const sql = `INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders})`;
                
                try {
                    const result = db.prepare(sql).run(...Object.values(values));
                    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid as number };
                } catch (e) {
                    console.error('[DB] Insert error:', e);
                    return { changes: 0, lastInsertRowid: 0 };
                }
            }
        }

        if (isUpdate) {
            const updateMatch = this.sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
            if (updateMatch) {
                const [, table, setPart, wherePart] = updateMatch;
                const setCols = setPart.split(',').map((s: string) => s.trim());
                const updateData: Record<string, any> = {};
                
                let paramIndex = 0;
                for (const col of setCols) {
                    const [key] = col.split('=').map((s: string) => s.trim());
                    const val = params[paramIndex++];
                    if (val !== undefined) {
                        if (typeof val === 'string') {
                            try {
                                updateData[key] = (val.startsWith('{') || val.startsWith('[')) ? JSON.parse(val) : val;
                            } catch {
                                updateData[key] = val;
                            }
                        } else {
                            updateData[key] = val;
                        }
                    }
                }

                const whereConditions = this.buildWhereClause(wherePart, params.slice(paramIndex));
                const setParts: string[] = [];
                const setValues: any[] = [];
                for (const [key, val] of Object.entries(updateData)) {
                    setParts.push(`${key} = ?`);
                    setValues.push(val);
                }

                const whereParts: string[] = [];
                const whereValues: any[] = [];
                for (const [col, val] of Object.entries(whereConditions)) {
                    whereParts.push(`${col} = ?`);
                    whereValues.push(val);
                }

                const sql = `UPDATE ${table} SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`;
                
                try {
                    const result = db.prepare(sql).run(...setValues, ...whereValues);
                    return { changes: result.changes, lastInsertRowid: 0 };
                } catch (e) {
                    console.error('[DB] Update error:', e);
                    return { changes: 0, lastInsertRowid: 0 };
                }
            }
        }

        if (isDelete) {
            const deleteMatch = this.sql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)/i);
            if (deleteMatch) {
                const [, table, wherePart] = deleteMatch;
                const whereConditions = this.buildWhereClause(wherePart, params);
                const whereParts: string[] = [];
                const whereValues: any[] = [];
                for (const [col, val] of Object.entries(whereConditions)) {
                    whereParts.push(`${col} = ?`);
                    whereValues.push(val);
                }

                const sql = `DELETE FROM ${table} WHERE ${whereParts.join(' AND ')}`;
                
                try {
                    const result = db.prepare(sql).run(...whereValues);
                    return { changes: result.changes, lastInsertRowid: 0 };
                } catch (e) {
                    console.error('[DB] Delete error:', e);
                    return { changes: 0, lastInsertRowid: 0 };
                }
            }
        }

        return { changes: 0, lastInsertRowid: 0 };
    }
}

const db: any = {
    prepare(sql: string): PreparedStatement {
        return new PreparedStatement(sql);
    }
};

export { db };
export default db;
