const { getSystemSetting, setSystemSetting, getAllSystemSettings, getProviderBilling } = require('./src/db-mgmt');
const { initDatabase } = require('./src/sqlite');

// Initialize DB
initDatabase();

async function test() {
    console.log('--- Testing System Settings ---');
    const testKey = 'test_setting_key';
    const testValue = 'test_value_' + Date.now();
    
    const saveOk = setSystemSetting(testKey, testValue);
    console.log('Save result:', saveOk);
    
    const fetchedValue = getSystemSetting(testKey);
    console.log('Fetched value:', fetchedValue);
    console.log('Match:', fetchedValue === testValue);
    
    const all = getAllSystemSettings();
    console.log('All settings keys:', Object.keys(all));
    
    console.log('\n--- Testing Provider Billing Logic ---');
    // We can't easily test the actual API call without a real key, 
    // but we can check if it tries to use the key.
    
    try {
        const billing = await getProviderBilling();
        console.log('Billing results count:', billing.length);
        if (billing.length > 0) {
            console.log('First result source:', billing[0].source);
        }
    } catch (err) {
        console.error('Billing test error:', err.message);
    }
}

test();
