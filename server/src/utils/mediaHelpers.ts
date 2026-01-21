import { supabase } from '../lib/supabase.js';

/**
 * Check if a prompt is asking to edit/modify existing media
 */
export function isEditRequest(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase().trim();
  
  const editKeywords = [
    'edit', 'change', 'modify', 'update', 'alter', 'adjust',
    'different', 'another', 'new version', 'remake', 'redo',
    'improve', 'enhance', 'refine', 'tweak', 'revise',
    'make it', 'turn it', 'convert', 'transform',
    'add to', 'remove from', 'replace', 'swap',
    'same but', 'similar but', 'like the last', 'like before',
    'that image', 'that video', 'the image', 'the video',
    'previous', 'last one', 'earlier'
  ];
  
  return editKeywords.some(keyword => lowerPrompt.includes(keyword));
}

/**
 * Get the most recent generated image for a user
 */
export async function getLastGeneratedImage(userId: string): Promise<{url: string; prompt: string} | null> {
  try {
    // First try to get from conversation_history (most recent context)
    const { data: historyData } = await supabase
      .from('conversation_history')
      .select('generated_image_url, media_prompt')
      .eq('user_id', userId)
      .not('generated_image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (historyData && historyData.generated_image_url) {
      console.log('📸 Found last generated image in conversation history');
      return {
        url: historyData.generated_image_url,
        prompt: historyData.media_prompt || ''
      };
    }
    
    // Fallback to generated_media table
    const { data: mediaData } = await supabase
      .from('generated_media')
      .select('url, prompt')
      .eq('user_id', userId)
      .eq('media_type', 'image')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (mediaData) {
      console.log('📸 Found last generated image in generated_media table');
      return {
        url: mediaData.url,
        prompt: mediaData.prompt || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching last generated image:', error);
    return null;
  }
}

/**
 * Get the most recent generated video for a user
 */
export async function getLastGeneratedVideo(userId: string): Promise<{url: string; prompt: string} | null> {
  try {
    // First try to get from conversation_history (most recent context)
    const { data: historyData } = await supabase
      .from('conversation_history')
      .select('generated_video_url, media_prompt')
      .eq('user_id', userId)
      .not('generated_video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (historyData && historyData.generated_video_url) {
      console.log('🎥 Found last generated video in conversation history');
      return {
        url: historyData.generated_video_url,
        prompt: historyData.media_prompt || ''
      };
    }
    
    // Fallback to generated_media table
    const { data: mediaData } = await supabase
      .from('generated_media')
      .select('url, prompt')
      .eq('user_id', userId)
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (mediaData) {
      console.log('🎥 Found last generated video in generated_media table');
      return {
        url: mediaData.url,
        prompt: mediaData.prompt || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching last generated video:', error);
    return null;
  }
}

/**
 * Save generated media to conversation history
 */
export async function saveMediaToConversationHistory(
  userId: string,
  imageUrl: string | null,
  videoUrl: string | null,
  prompt: string,
  chatMode: string = 'normal'
): Promise<void> {
  try {
    const insertData: any = {
      user_id: userId,
      query: prompt,
      answer: imageUrl ? 'Generated image' : 'Generated video',
      mode: 'Ask',
      model: 'gemini-lite',
      chat_mode: chatMode,
      generated_image_url: imageUrl,
      generated_video_url: videoUrl,
      media_prompt: prompt
    };
    
    const { error } = await supabase
      .from('conversation_history')
      .insert(insertData);
    
    if (error) {
      console.error('Failed to save media to conversation history:', error);
    } else {
      console.log('✅ Media saved to conversation history for future editing context');
    }
  } catch (error) {
    console.error('Error saving media to conversation history:', error);
  }
}

/**
 * Download image from URL and convert to data URL (for passing to AI as reference)
 */
export async function downloadImageAsDataUrl(imageUrl: string): Promise<string | null> {
  try {
    console.log(`📥 Downloading image from: ${imageUrl.substring(0, 100)}...`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    console.log(`✅ Image downloaded and converted to data URL (${(base64.length / 1024).toFixed(2)}KB)`);
    return dataUrl;
  } catch (error) {
    console.error('Error downloading image:', error);
    return null;
  }
}
