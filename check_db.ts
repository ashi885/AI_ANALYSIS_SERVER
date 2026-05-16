import { getDatabase } from './src/sqlite';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function checkClient() {
    const db = getDatabase();
    const rows = db.prepare('SELECT id, name, api_key, status, contract_end FROM clients').all();
    
    console.log('--- Clients ---');
    console.log(JSON.stringify(rows, null, 2));
    console.log('--- End ---');
}

checkClient();
