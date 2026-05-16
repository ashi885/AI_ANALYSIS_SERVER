
import { getModulePricing, getTieredValue } from '../src/db-mgmt';

async function testTiering() {
    console.log('--- Testing Tiered Configuration Logic ---');
    
    // 1. Test getTieredValue (Ad Frequency logic)
    const mockAdFreqConfig = {
        type: 'tiered',
        tiers: [
            { max_seconds: 1200, value: 4 }, // < 20m: 4 breaks
            { max_seconds: 3600, value: 8 }, // < 1h: 8 breaks
            { max_seconds: -1, value: 12 }   // 1h+: 12 breaks
        ]
    };

    console.log('Short (5m  = 300s):', getTieredValue(mockAdFreqConfig, 300), 'EXPECTED: 4');
    console.log('Medium (35m = 2100s):', getTieredValue(mockAdFreqConfig, 2100), 'EXPECTED: 8');
    console.log('Long (90m = 5400s):', getTieredValue(mockAdFreqConfig, 5400), 'EXPECTED: 12');

    // 2. Pricing Logic Test (Manual Check of Data Structure handling)
    // Note: getModulePricing fetches from DB, so we'll just check if it correctly handles inputs
    console.log('\n--- Testing Database Pricing Function ---');
    const mockClientId = 1;
    const priceShort = await getModulePricing(mockClientId, 'metadata', 300);
    console.log('Metadata Price (5m):', priceShort);
    
    console.log('--- End of Test ---');
}

testTiering().catch(console.error);
