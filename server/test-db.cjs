const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

console.log('SUPABASE_URL:', supabaseUrl);
console.log('SUPABASE_KEY exists:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error fetching user_profiles:', error);
    } else {
      console.log('Fetch success! Data length:', data.length);
      if (data.length > 0) {
        console.log('Columns in user_profiles:', Object.keys(data[0]));
      } else {
        console.log('No user profiles found. Let\'s check table structure by attempting an insert.');
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
