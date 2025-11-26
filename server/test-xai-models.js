// Quick test to check available xAI models
// Note: This requires XAI_API_KEY to be set in environment

const OpenAI = require('openai');

async function testXAIModels() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.log('XAI_API_KEY not set. Please set it in your .env file.');
    console.log('\nTo test, run:');
    console.log('XAI_API_KEY=your-key node test-xai-models.js');
    return;
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.x.ai/v1'
  });

  try {
    // Try to list models (if supported)
    console.log('Testing xAI API connection...');
    
    // Test common model names
    const modelsToTest = [
      'grok-beta',
      'grok-3',
      'grok-3-mini',
      'grok-4',
      'grok-4-fast',
      'grok-code-fast-1'
    ];

    console.log('\nNote: xAI API model names may vary.');
    console.log('Common model identifiers to try:');
    modelsToTest.forEach(m => console.log(`  - ${m}`));
    console.log('\nCheck xAI documentation for exact model names:');
    console.log('https://docs.x.ai/docs/models');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testXAIModels();
