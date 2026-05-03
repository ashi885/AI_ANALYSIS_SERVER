
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'server' }
});

async function checkAdminUsers() {
    console.log('Checking server.admin_users...');
    const { data, error } = await supabase
        .from('admin_users')
        .select('*');
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Admin Users:', data);
    }
}

checkAdminUsers();
