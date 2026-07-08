const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    // 1. Get a user profile
    const { data: profiles, error: selectError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1);

    if (selectError) {
      console.error('Select error:', selectError);
      return;
    }

    if (profiles.length === 0) {
      console.log('No user profiles found to test update.');
      return;
    }

    const profile = profiles[0];
    console.log('Testing update on user_id:', profile.user_id);

    // 2. Try updating search_history
    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        search_history: !profile.search_history,
        voice_search: !profile.voice_search,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', profile.user_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('Update success! Updated profile:', updated);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
