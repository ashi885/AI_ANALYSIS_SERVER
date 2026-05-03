
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'server' }
});

async function testLogin(email, password) {
    console.log(`Testing login for: ${email} ...`);
    const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();
    
    if (error) {
        console.log('Login failed:', error.message);
    } else {
        console.log('Login successful:', data);
    }
}

async function runTests() {
    // Test what I seeded
    await testLogin('admin@cuepoint.com', 'cuepoint-admin');
    
    // Test what the user wants
    await testLogin('admin', 'cuepoint2025');

    // Check what is actually there (trying to bypass RLS with more permissive query if possible, but service key should work)
    console.log('\nChecking all entries in admin_users:');
    const { data, error } = await supabase.from('admin_users').select('*');
    if (error) console.log('Error listing users:', error.message);
    else console.log('Users:', data);
}

runTests();
