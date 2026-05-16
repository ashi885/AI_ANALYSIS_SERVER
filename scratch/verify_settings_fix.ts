
import fetch from 'node-fetch';

async function verifySettingsSave() {
    console.log('--- Verifying AI Settings Save Fix ---');
    
    const clientId = 2; // EDM Client
    const serverUrl = 'http://localhost:3003';
    
    // Mock tiered strategy
    const tieredConfig = {
        ad_breaks: {
            target_frequency: {
                type: 'tiered',
                tiers: [
                    { max_seconds: 600, value: 2 }, // < 10m -> 2
                    { max_seconds: -1, value: 5 }   // Default -> 5
                ]
            }
        }
    };

    console.log('Sending tiered config to server...');
    const response = await fetch(`${serverUrl}/api/mgmt/clients/${clientId}/ai-settings`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Basic YWRtaW5AY3VlcG9pbnQucHJvZHVjdGlvbjpjdWVwb2ludDY5IQ==' // admin@cuepoint.production:cuepoint69!
        },
        body: JSON.stringify(tieredConfig)
    });

    if (response.ok) {
        console.log('Settings saved successfully.');
        
        // Use a slight delay to ensure DB write
        await new Promise(r => setTimeout(r, 1000));
        
        console.log('Double-checking database content...');
        const Database = require('better-sqlite3');
        const db = new Database('data/management.db');
        const row = db.prepare("SELECT setting_value FROM client_module_settings WHERE client_id = ? AND module_name = 'ad_breaks' AND setting_key = 'target_frequency'").get(clientId);
        
        console.log('Value in DB:', row.setting_value);
        
        if (row.setting_value.includes('[object Object]')) {
            console.error('FAILED: Still seeing [object Object]!');
        } else {
            console.log('SUCCESS: JSON object correctly stored.');
        }
        db.close();
    } else {
        console.error('Failed to save settings:', await response.json());
    }
}

verifySettingsSave().catch(console.error);
