// Quick script to discover available Gemini models
// Run: node server/discover-models.js

import dotenv from 'dotenv';
dotenv.config();

async function listAvailableModels() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE;
  
  if (!apiKey) {
    console.error('❌ No Google API key found in .env file');
    console.error('   Add GOOGLE_API_KEY=your_key_here to your .env file');
    return;
  }
  
  console.log('🔍 Discovering available Gemini models...\n');
  console.log(`Using API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}\n`);
  
  try {
    // List all available models
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to list models:', response.status);
      console.error('Error:', errorText);
      
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        console.error('\n⚠️  API KEY ISSUE:');
        console.error('   Your API key might be:');
        console.error('   - Expired');
        console.error('   - Invalid');
        console.error('   - Missing permissions');
        console.error('\n   Solutions:');
        console.error('   1. Go to: https://aistudio.google.com/apikey');
        console.error('   2. Create a new API key or refresh the existing one');
        console.error('   3. Update your .env file with the new key');
      }
      return;
    }
    
    const data = await response.json();
    
    if (!data.models || data.models.length === 0) {
      console.log('⚠️ No models found');
      return;
    }
    
    console.log(`✅ Found ${data.models.length} models:\n`);
    
    // Filter and display image generation models
    console.log('═'.repeat(70));
    console.log('📸 IMAGE GENERATION MODELS:');
    console.log('═'.repeat(70));
    const imageModels = data.models.filter((m) => 
      m.name.toLowerCase().includes('imagen')
    );
    
    if (imageModels.length > 0) {
      imageModels.forEach((model) => {
        const modelName = model.name.replace('models/', '');
        console.log(`\n  ✅ ${modelName}`);
        console.log(`     Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
        console.log(`     Input token limit: ${model.inputTokenLimit || 'N/A'}`);
        console.log(`     Output token limit: ${model.outputTokenLimit || 'N/A'}`);
        if (model.description) {
          console.log(`     Description: ${model.description}`);
        }
      });
      console.log('');
    } else {
      console.log('  ⚠️ No image generation models found');
      console.log('     You may need to enable Imagen API in your Google Cloud project\n');
    }
    
    // Filter and display video generation models
    console.log('═'.repeat(70));
    console.log('🎥 VIDEO GENERATION MODELS:');
    console.log('═'.repeat(70));
    const videoModels = data.models.filter((m) => 
      m.name.toLowerCase().includes('veo')
    );
    
    if (videoModels.length > 0) {
      videoModels.forEach((model) => {
        const modelName = model.name.replace('models/', '');
        console.log(`\n  ✅ ${modelName}`);
        console.log(`     Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
        console.log(`     Input token limit: ${model.inputTokenLimit || 'N/A'}`);
        console.log(`     Output token limit: ${model.outputTokenLimit || 'N/A'}`);
        if (model.description) {
          console.log(`     Description: ${model.description}`);
        }
      });
      console.log('');
    } else {
      console.log('  ⚠️ No video generation models found');
      console.log('     Veo models might not be available in your region or account tier\n');
    }
    
    // Display text generation models (Gemini)
    console.log('═'.repeat(70));
    console.log('💬 TEXT GENERATION MODELS (Gemini):');
    console.log('═'.repeat(70));
    const textModels = data.models.filter((m) => 
      m.supportedGenerationMethods?.includes('generateContent') &&
      !m.name.toLowerCase().includes('imagen') && 
      !m.name.toLowerCase().includes('veo')
    );
    
    if (textModels.length > 0) {
      console.log('');
      textModels.forEach((model) => {
        const modelName = model.name.replace('models/', '');
        console.log(`  ✓ ${modelName}`);
      });
      console.log('');
    }
    
    console.log('═'.repeat(70));
    console.log('💡 NEXT STEPS:');
    console.log('═'.repeat(70));
    console.log('1. Copy the EXACT model names above (without "models/" prefix)');
    console.log('2. Update server/src/utils/imageGeneration.ts with correct Imagen model');
    console.log('3. Update server/src/utils/videoGeneration.ts with correct Veo model');
    console.log('4. Rebuild: cd server && npm run build');
    console.log('5. Restart your server');
    console.log('═'.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error discovering models:', error.message || error);
  }
}

// Run the function
listAvailableModels().catch(console.error);

