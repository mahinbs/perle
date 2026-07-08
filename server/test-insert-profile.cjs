const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'temp-test-user-ins@example.com';
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

    const updates = {
      searchHistory: false,
      voiceSearch: false
    };

    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        user_id: userId,
        notifications: updates.notifications ?? true,
        dark_mode: updates.darkMode ?? false,
        search_history: updates.searchHistory ?? true,
        voice_search: updates.voiceSearch ?? true,
        display_picture_url: updates.displayPictureUrl ?? updates.dp ?? null,
        personality: updates.personality ?? null,
        gender: updates.gender ?? null,
        age: updates.age ?? null
      })
      .select()
      .single();

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
