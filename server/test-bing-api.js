/**
 * Quick test script to verify Bing Search API key works
 * 
 * Run: node test-bing-api.js
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const apiKey = process.env.BING_SEARCH_API_KEY;
const endpoint = process.env.BING_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/search';

console.log('🧪 Testing Bing Search API...\n');
console.log('📝 Configuration:');
console.log(`   API Key: ${apiKey ? apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4) : 'NOT SET'}`);
console.log(`   Endpoint: ${endpoint}`);
console.log(`   Key Length: ${apiKey ? apiKey.length : 0} characters\n`);

if (!apiKey) {
  console.error('❌ BING_SEARCH_API_KEY is not set in .env file!');
  console.error('💡 Add it to server/.env:');
  console.error('   BING_SEARCH_API_KEY=your-key-here');
  process.exit(1);
}

// Test the API
async function testBingAPI() {
  try {
    console.log('🔍 Making test search request...');
    
    const response = await axios.get(endpoint, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey.trim()
      },
      params: {
        q: 'test',
        count: 1,
        mkt: 'en-US'
      },
      timeout: 10000,
      validateStatus: (status) => status < 500
    });
    
    if (response.status === 200) {
      console.log('✅ SUCCESS! API key is working correctly!\n');
      console.log('📊 Response Summary:');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Results: ${response.data?.webPages?.value?.length || 0} web pages found`);
      
      if (response.data?.webPages?.value?.[0]) {
        const firstResult = response.data.webPages.value[0];
        console.log(`\n📄 Sample Result:`);
        console.log(`   Title: ${firstResult.name}`);
        console.log(`   URL: ${firstResult.url}`);
        console.log(`   Snippet: ${firstResult.snippet?.substring(0, 100)}...`);
      }
      
      console.log('\n🎉 Your Bing Search API is configured correctly!');
      console.log('💡 You can now use web search in SyntraIQ');
      
    } else if (response.status === 401) {
      console.error('❌ 401 UNAUTHORIZED - API key is invalid or expired\n');
      console.error('💡 Possible causes:');
      console.error('   1. Key was just created (wait 5-10 minutes)');
      console.error('   2. Key was copied incorrectly');
      console.error('   3. Azure subscription is not active');
      console.error('\n🔧 Solutions:');
      console.error('   1. Wait 10 minutes if key was just created');
      console.error('   2. Go to Azure Portal → Your resource → "Keys and Endpoint"');
      console.error('   3. Copy KEY 1 again and update .env');
      console.error('   4. Make sure there are no extra spaces');
      
    } else if (response.status === 403) {
      console.error('❌ 403 FORBIDDEN - Access denied\n');
      console.error('💡 Possible causes:');
      console.error('   1. Subscription quota exceeded');
      console.error('   2. Subscription not active');
      console.error('   3. Resource is disabled');
      console.error('\n🔧 Solutions:');
      console.error('   1. Check Azure Portal → Your resource → "Usage + quotas"');
      console.error('   2. Verify subscription is active');
      console.error('   3. Check if you hit the free tier limit (1,000/month)');
      
    } else {
      console.error(`❌ Unexpected status: ${response.status} ${response.statusText}`);
      console.error('Response:', JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ ERROR: Failed to connect to Bing API\n');
    
    if (error.response) {
      console.error(`   Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`   Data:`, error.response.data);
    } else if (error.request) {
      console.error('   Network error - could not reach Bing API');
      console.error('   Check your internet connection');
    } else {
      console.error(`   Error: ${error.message}`);
    }
    
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your internet connection');
    console.error('   2. Verify BING_SEARCH_API_KEY in .env');
    console.error('   3. Make sure endpoint is correct');
    console.error('   4. Check Azure Portal for resource status');
    
    process.exit(1);
  }
}

// Run the test
testBingAPI();
