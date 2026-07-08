const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'temp-test-user-err@example.com';
  const password = 'Password123!';
  let userId;

  try {
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createError || !userData.user) {
      console.error('Failed to create user:', createError);
      return;
    }

    userId = userData.user.id;
    console.log('User created:', userId);

    // Attempt to insert and inspect error
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        user_id: userId,
        notifications: true,
        dark_mode: false,
        search_history: true,
        voice_search: true
      });

    if (error) {
      console.error('DATABASE INSERT ERROR DETAILS:');
      console.error('Message:', error.message);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      console.error('Code:', error.code);
    } else {
      console.log('Insert success! Data:', data);
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    if (userId) {
      await supabase.auth.admin.deleteUser(userId);
      console.log('Cleaned up user.');
    }
  }
}

run();
