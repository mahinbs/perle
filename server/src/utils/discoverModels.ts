// Utility to discover available Gemini models
// Run this to see what models are actually available in your Google AI account

export async function listAvailableModels(): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FREE;
  
  if (!apiKey) {
    console.error('❌ No Google API key found in environment variables');
    return;
  }
  
  console.log('🔍 Discovering available Gemini models...\n');
  
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
      console.error('❌ Failed to list models:', response.status, errorText);
      return;
    }
    
    const data = await response.json();
    
    if (!data.models || data.models.length === 0) {
      console.log('⚠️ No models found');
      return;
    }
    
    console.log(`✅ Found ${data.models.length} models:\n`);
    
    // Filter and display image generation models
    console.log('📸 IMAGE GENERATION MODELS:');
    console.log('─'.repeat(60));
    const imageModels = data.models.filter((m: any) => 
      m.name.includes('imagen') && m.supportedGenerationMethods?.includes('generateImage')
    );
    
    if (imageModels.length > 0) {
      imageModels.forEach((model: any) => {
        console.log(`  ✓ ${model.name.replace('models/', '')}`);
        console.log(`    Methods: ${model.supportedGenerationMethods?.join(', ')}`);
        console.log(`    Description: ${model.description || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('  ⚠️ No image generation models found\n');
    }
    
    // Filter and display video generation models
    console.log('🎥 VIDEO GENERATION MODELS:');
    console.log('─'.repeat(60));
    const videoModels = data.models.filter((m: any) => 
      m.name.includes('veo') || m.supportedGenerationMethods?.includes('generateVideo')
    );
    
    if (videoModels.length > 0) {
      videoModels.forEach((model: any) => {
        console.log(`  ✓ ${model.name.replace('models/', '')}`);
        console.log(`    Methods: ${model.supportedGenerationMethods?.join(', ')}`);
        console.log(`    Description: ${model.description || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('  ⚠️ No video generation models found\n');
    }
    
    // Display all other models
    console.log('💬 TEXT GENERATION MODELS:');
    console.log('─'.repeat(60));
    const textModels = data.models.filter((m: any) => 
      m.supportedGenerationMethods?.includes('generateContent') &&
      !m.name.includes('imagen') && !m.name.includes('veo')
    );
    
    if (textModels.length > 0) {
      textModels.forEach((model: any) => {
        console.log(`  ✓ ${model.name.replace('models/', '')}`);
      });
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('💡 TIP: Use these exact model names in your code');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error discovering models:', error);
  }
}

// Run this if called directly
if (require.main === module) {
  listAvailableModels();
}

