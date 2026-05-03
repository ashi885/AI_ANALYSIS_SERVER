import { getDatabase } from '../src/sqlite';

async function migrate() {
    console.log('Starting migration: Credit System');
    const db = getDatabase();

    try {
        // 1. Add columns to clients table
        console.log('Adding columns to clients table...');
        try {
            db.exec("ALTER TABLE clients ADD COLUMN billing_type TEXT DEFAULT 'PER_REQUEST'");
            console.log('Added billing_type column.');
        } catch (e: any) {
            console.log('billing_type column already exists or error:', e.message);
        }

        try {
            db.exec("ALTER TABLE clients ADD COLUMN credits REAL DEFAULT 0");
            console.log('Added credits column.');
        } catch (e: any) {
            console.log('credits column already exists or error:', e.message);
        }

        // 2. Create credit_transactions table
        console.log('Creating credit_transactions table...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('ADD', 'DEDUCT', 'REFUND')),
                reason TEXT,
                job_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
            );
        `);
        console.log('Created credit_transactions table.');

        console.log('Migration completed successfully.');
    } catch (error: any) {
        console.error('Migration failed:', error.message);
    }
}

migrate();
