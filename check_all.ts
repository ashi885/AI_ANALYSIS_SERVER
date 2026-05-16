import { getDatabase } from './src/sqlite';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function checkAll() {
    const db = getDatabase();
    
    const users = db.prepare('SELECT * FROM users').all();
    console.log('--- Users ---');
    console.log(JSON.stringify(users, null, 2));

    const settings = db.prepare('SELECT * FROM user_settings').all();
    console.log('--- User Settings ---');
    console.log(JSON.stringify(settings, null, 2));
    
    console.log('--- End ---');
}

checkAll();