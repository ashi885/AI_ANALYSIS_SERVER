import { getDatabase } from './src/sqlite';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function checkUserSettings() {
    const db = getDatabase();
    const settings = db.prepare('SELECT key, value FROM user_settings').all();
    
    console.log('--- User Settings ---');
    console.log(JSON.stringify(settings, null, 2));
    console.log('--- End ---');
}

checkUserSettings();