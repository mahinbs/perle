const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const API_URL = 'http://localhost:3333';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const email = 'temp-test-user-' + Math.random().toString(36).substring(7) + '@example.com';
  const password = 'Password123!';
  let userId;

  try {
    console.log('1. Creating temp user:', email);
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
    console.log('User created with ID:', userId);

    console.log('2. Signing in to get token...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.session) {
      console.error('Failed to sign in:', authError);
      return;
    }

    const token = authData.session.access_token;
    console.log('Token acquired successfully.');

    console.log('3. Fetching profile GET...');
    const getRes = await axios.get(`${API_URL}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('GET profile status:', getRes.status);

    console.log('4. Performing PUT updates...');
    const putBody = {
      searchHistory: false,
      voiceSearch: false
    };
    try {
      const response = await axios.put(`${API_URL}/api/profile`, putBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('PUT Success! Status:', response.status);
      console.log('Response body:', response.data);
    } catch (err) {
      console.error('PUT Failed! Status:', err.response?.status);
      console.error('Error Response body:', err.response?.data);
    }

  } catch (err) {
    console.error('Unexpected test error:', err);
  } finally {
    if (userId) {
      console.log('Cleaning up: deleting temp user...');
      await supabase.auth.admin.deleteUser(userId);
      console.log('Temp user deleted.');
    }
  }
}

run();
