const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const API_URL = 'http://localhost:3333';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    // 1. Get the first active session
    console.log('Querying sessions table...');
    const { data: sessions, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (sessionError || !sessions || sessions.length === 0) {
      console.error('No active sessions found in database:', sessionError);
      return;
    }

    const session = sessions[0];
    console.log('Using session for user_id:', session.user_id);
    const token = session.token;

    // Call the PUT profile API
    console.log('Calling PUT /api/profile...');
    try {
      const response = await axios.put(`${API_URL}/api/profile`, 
        { searchHistory: false },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('API Success! Status:', response.status);
      console.log('Response body:', response.data);
    } catch (err) {
      console.error('API Failed! Status:', err.response?.status);
      console.error('Error Response body:', err.response?.data);
    }
  } catch (err) {
    console.error('Unexpected test error:', err);
  }
}

run();
