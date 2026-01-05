/**
 * Script to set up Supabase Storage policies for AI Friend logos
 * Run this with: node server/scripts/setup-storage-policies.js
 * 
 * Requires:
 * - SUPABASE_URL in .env
 * - SUPABASE_SERVICE_ROLE_KEY in .env (for admin access)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Use service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setupStoragePolicies() {
  console.log('🔧 Setting up storage policies for ai-friend-logos bucket...\n');

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return;
    }

    const bucketExists = buckets?.some(b => b.name === 'ai-friend-logos');
    
    if (!bucketExists) {
      console.log('📦 Creating ai-friend-logos bucket...');
      const { data: bucket, error: createError } = await supabase.storage.createBucket('ai-friend-logos', {
        public: true,
        fileSizeLimit: 2 * 1024 * 1024, // 2 MB
        allowedMimeTypes: ['image/*']
      });

      if (createError) {
        console.error('❌ Error creating bucket:', createError);
        return;
      }
      console.log('✅ Bucket created successfully\n');
    } else {
      console.log('✅ Bucket already exists\n');
    }

    // Note: Storage policies in Supabase are typically managed via:
    // 1. Supabase Dashboard (Storage → Policies)
    // 2. SQL with owner permissions
    // 3. Supabase Management API (limited support)
    
    // Since we can't create policies programmatically via the JS client,
    // we'll provide the SQL that needs to be run manually
    
    console.log('📋 Storage policies need to be created manually via Supabase Dashboard:');
    console.log('\n1. Go to Supabase Dashboard → Storage → Policies');
    console.log('2. Select the "ai-friend-logos" bucket');
    console.log('3. Create the following policies:\n');
    
    console.log('Policy 1: "Users can upload their own logos"');
    console.log('  - Operation: INSERT');
    console.log('  - Roles: authenticated');
    console.log('  - WITH CHECK: bucket_id = \'ai-friend-logos\' AND (storage.foldername(name))[1] = auth.uid()::text\n');
    
    console.log('Policy 2: "Users can read their own logos"');
    console.log('  - Operation: SELECT');
    console.log('  - Roles: authenticated');
    console.log('  - USING: bucket_id = \'ai-friend-logos\' AND (storage.foldername(name))[1] = auth.uid()::text\n');
    
    console.log('Policy 3: "Users can delete their own logos"');
    console.log('  - Operation: DELETE');
    console.log('  - Roles: authenticated');
    console.log('  - USING: bucket_id = \'ai-friend-logos\' AND (storage.foldername(name))[1] = auth.uid()::text\n');
    
    console.log('Policy 4: "Public can read logos"');
    console.log('  - Operation: SELECT');
    console.log('  - Roles: public');
    console.log('  - USING: bucket_id = \'ai-friend-logos\'\n');
    
    console.log('✅ Setup instructions provided. Please create policies via Dashboard.\n');

  } catch (error) {
    console.error('❌ Error setting up storage:', error);
  }
}

setupStoragePolicies();


