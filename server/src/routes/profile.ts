import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();

// Configure multer for profile picture uploads (2MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notifications: z.boolean().optional(),
  darkMode: z.boolean().optional(),
  searchHistory: z.boolean().optional(),
  voiceSearch: z.boolean().optional(),
  displayPictureUrl: z.string().url().optional().nullable(),
  dp: z.string().url().optional().nullable(), // Alias for displayPictureUrl (frontend uses 'dp')
  personality: z.string().max(500).optional().nullable(),
  gender: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']).optional().nullable(),
  age: z.number().int().min(1).max(150).optional().nullable()
});

// Get user profile
router.get('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user info from Supabase Auth
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user metadata (name is stored here)
    const userMetadata = user.user_metadata;
    const name = userMetadata?.name || 'User';

    // Get profile settings
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Profile fetch error:', profileError);
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    // If profile doesn't exist, create default one
    if (!profile) {
      const { data: newProfile, error: createError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: req.userId,
          notifications: true,
          dark_mode: false,
          search_history: true,
          voice_search: true,
          is_premium: false
        } as any)
        .select()
        .single();

      if (createError) {
        console.error('Profile creation error:', createError);
        // Don't fail if profile creation fails, just return defaults
        return res.json({
          id: user.id,
          name: name,
          email: user.email || '',
          notifications: true,
          darkMode: false,
          searchHistory: true,
          voiceSearch: true,
          displayPictureUrl: null,
          dp: null,
          personality: null,
          gender: null,
          age: null,
          isPremium: false,
          premiumTier: 'free',
          subscription: {
            status: 'inactive',
            tier: 'free',
            startDate: null,
            endDate: null,
            autoRenew: false,
            razorpaySubscriptionId: null
          }
        });
      }

      const premiumTier = (newProfile as any).premium_tier || 'free';

      return res.json({
        id: user.id,
        name: name,
        email: user.email || '',
        notifications: (newProfile as any).notifications,
        darkMode: (newProfile as any).dark_mode,
        searchHistory: (newProfile as any).search_history,
        voiceSearch: (newProfile as any).voice_search,
        displayPictureUrl: (newProfile as any).display_picture_url || null,
        dp: (newProfile as any).display_picture_url || null,
        personality: (newProfile as any).personality || null,
        gender: (newProfile as any).gender || null,
        age: (newProfile as any).age || null,
        isPremium: false,
        premiumTier: premiumTier,
        subscription: {
          status: 'inactive',
          tier: 'free',
          startDate: null,
          endDate: null,
          autoRenew: false,
          razorpaySubscriptionId: null
        }
      });
    }

    // Check if subscription is active
    const subscriptionEndDate = (profile as any).subscription_end_date;
    const isSubscriptionActive = (profile as any).subscription_status === 'active' && 
      subscriptionEndDate && 
      new Date(subscriptionEndDate) > new Date();
    
    const premiumTier = (profile as any).premium_tier || 'free';
    const isPremium = premiumTier !== 'free' && isSubscriptionActive;

    res.json({
      id: user.id,
      name: name,
      email: user.email || '',
      notifications: (profile as any).notifications,
      darkMode: (profile as any).dark_mode,
      searchHistory: (profile as any).search_history,
      voiceSearch: (profile as any).voice_search,
      displayPictureUrl: (profile as any).display_picture_url || null,
      dp: (profile as any).display_picture_url || null, // Alias for frontend compatibility
      personality: (profile as any).personality || null,
      gender: (profile as any).gender || null,
      age: (profile as any).age || null,
      isPremium: isPremium,
      premiumTier: premiumTier, // 'free', 'pro', or 'max'
      subscription: {
        status: (profile as any).subscription_status || 'inactive',
        tier: premiumTier,
        startDate: (profile as any).subscription_start_date || null,
        endDate: (profile as any).subscription_end_date || null,
        autoRenew: (profile as any).auto_renew ?? false,
        razorpaySubscriptionId: (profile as any).razorpay_subscription_id || null
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parse = profileUpdateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const updates = parse.data;

    // Update user name if provided (update in Supabase Auth metadata)
    if (updates.name) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      if (token) {
        const { error: updateError } = await supabase.auth.updateUser({
          data: { name: updates.name.trim() }
        });

        if (updateError) {
          console.error('Update user name error:', updateError);
          // Don't fail, just log it
        }
      }
    }

    // Update or create profile settings
    const profileUpdates: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.notifications !== undefined) {
      profileUpdates.notifications = updates.notifications;
    }
    if (updates.darkMode !== undefined) {
      profileUpdates.dark_mode = updates.darkMode;
    }
    if (updates.searchHistory !== undefined) {
      profileUpdates.search_history = updates.searchHistory;
    }
    if (updates.voiceSearch !== undefined) {
      profileUpdates.voice_search = updates.voiceSearch;
    }
    // Handle display picture (support both 'displayPictureUrl' and 'dp' for frontend compatibility)
    if (updates.displayPictureUrl !== undefined || updates.dp !== undefined) {
      profileUpdates.display_picture_url = updates.displayPictureUrl ?? updates.dp ?? null;
    }
    if (updates.personality !== undefined) {
      profileUpdates.personality = updates.personality;
    }
    if (updates.gender !== undefined) {
      profileUpdates.gender = updates.gender;
    }
    if (updates.age !== undefined) {
      profileUpdates.age = updates.age;
    }

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', req.userId)
      .single();

    let profileResult;
    if (existingProfile) {
      // Update existing profile
      const { data, error } = await (supabase
        .from('user_profiles') as any)
        .update(profileUpdates)
        .eq('user_id', req.userId)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      profileResult = data;
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          user_id: req.userId,
          notifications: updates.notifications ?? true,
          dark_mode: updates.darkMode ?? false,
          search_history: updates.searchHistory ?? true,
          voice_search: updates.voiceSearch ?? true,
          display_picture_url: updates.displayPictureUrl ?? updates.dp ?? null,
          personality: updates.personality ?? null,
          gender: updates.gender ?? null,
          age: updates.age ?? null
        } as any)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create profile' });
      }
      profileResult = data;
    }

    // Get updated user info from Supabase Auth
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    let name = 'User';
    let email = '';
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        name = user.user_metadata?.name || 'User';
        email = user.email || '';
      }
    }

    const premiumTier = (profileResult as any).premium_tier || 'free';
    const subscriptionEndDate = (profileResult as any).subscription_end_date;
    const isSubscriptionActive = (profileResult as any).subscription_status === 'active' && 
      subscriptionEndDate && 
      new Date(subscriptionEndDate) > new Date();
    const isPremium = premiumTier !== 'free' && isSubscriptionActive;

    res.json({
      id: req.userId,
      name: name,
      email: email,
      notifications: (profileResult as any).notifications,
      darkMode: (profileResult as any).dark_mode,
      searchHistory: (profileResult as any).search_history,
      voiceSearch: (profileResult as any).voice_search,
      displayPictureUrl: (profileResult as any).display_picture_url || null,
      dp: (profileResult as any).display_picture_url || null, // Alias for frontend compatibility
      personality: (profileResult as any).personality || null,
      gender: (profileResult as any).gender || null,
      age: (profileResult as any).age || null,
      isPremium: isPremium,
      premiumTier: premiumTier,
      subscription: {
        status: (profileResult as any).subscription_status || 'inactive',
        tier: premiumTier,
        startDate: (profileResult as any).subscription_start_date || null,
        endDate: (profileResult as any).subscription_end_date || null,
        autoRenew: (profileResult as any).auto_renew ?? false,
        razorpaySubscriptionId: (profileResult as any).razorpay_subscription_id || null
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload profile picture
router.post('/profile/upload-picture', authenticateToken, upload.single('picture'), async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Check file size (2MB limit)
    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 2MB limit' });
    }

    // Generate unique filename: {userId}/{timestamp}-{random}.{ext}
    const fileExt = req.file.originalname.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${req.userId}/${fileName}`;

    console.log(`📤 Uploading profile picture to profile-pics bucket: ${filePath}`);

    // Upload to Supabase Storage bucket 'profile-pics'
    const { data, error } = await supabase.storage
      .from('profile-pics')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('❌ Storage upload error:', error);
      return res.status(500).json({ 
        error: 'Failed to upload profile picture',
        details: error.message 
      });
    }

    console.log('✅ Profile picture uploaded successfully:', data?.path);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-pics')
      .getPublicUrl(filePath);
    
    console.log('🔗 Public URL:', urlData.publicUrl);

    // Update user profile with the new picture URL
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, display_picture_url')
      .eq('user_id', req.userId)
      .single();

    // Delete old profile picture if it exists and is from profile-pics bucket
    if (existingProfile?.display_picture_url && existingProfile.display_picture_url.includes('profile-pics')) {
      try {
        const oldUrlParts = existingProfile.display_picture_url.split('/profile-pics/');
        if (oldUrlParts.length > 1) {
          const oldFilePath = oldUrlParts[1];
          console.log(`🗑️ Deleting old profile picture: ${oldFilePath}`);
          await supabase.storage
            .from('profile-pics')
            .remove([oldFilePath]);
        }
      } catch (deleteError) {
        console.warn('Failed to delete old profile picture:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Update or create profile with new picture URL
    const profileUpdates: any = {
      display_picture_url: urlData.publicUrl,
      updated_at: new Date().toISOString()
    };

    if (existingProfile) {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(profileUpdates)
        .eq('user_id', req.userId);

      if (updateError) {
        console.error('Failed to update profile:', updateError);
        return res.status(500).json({ error: 'Failed to update profile' });
      }
    } else {
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: req.userId,
          display_picture_url: urlData.publicUrl,
          notifications: true,
          dark_mode: false,
          search_history: true,
          voice_search: true
        } as any);

      if (insertError) {
        console.error('Failed to create profile:', insertError);
        return res.status(500).json({ error: 'Failed to create profile' });
      }
    }

    res.json({ 
      url: urlData.publicUrl,
      path: filePath,
      bucket: 'profile-pics'
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user account
router.delete('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Require password confirmation
    const PasswordSchema = z.object({
      password: z.string().min(6, 'Password is required')
    });
    const parsed = PasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Password confirmation required',
        details: parsed.error.flatten().fieldErrors
      });
    }

    // Re-authenticate user with Supabase Auth using email + password
    const email = req.userEmail;
    if (!email) {
      return res.status(400).json({ error: 'Email not found for user' });
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.password
    });
    if (signInError) {
      return res.status(403).json({ error: 'Invalid password' });
    }

    // Delete all user data (cascade should handle related records)
    // Delete in order: sessions, library items, search history, profile
    await supabase.from('sessions').delete().eq('user_id', req.userId);
    await supabase.from('library_items').delete().eq('user_id', req.userId);
    await supabase.from('search_history').delete().eq('user_id', req.userId);
    await supabase.from('user_profiles').delete().eq('user_id', req.userId);
    
    // Delete user from Supabase Auth using Admin API (requires service role key)
    // Since we're using service role key, we can delete the user
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(req.userId);
    
    if (deleteUserError) {
      console.error('Failed to delete user from Supabase Auth:', deleteUserError);
      // Still return success since all data is deleted
      // The user account in auth.users will be orphaned but can't log in
      return res.json({ 
        message: 'Account data deleted successfully. Note: User may still exist in auth system.',
        warning: deleteUserError.message 
      });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export user data
router.get('/profile/export', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user info from Supabase Auth
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    let userData: any = { id: req.userId };
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userData = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || 'User',
          createdAt: user.created_at
        };
      }
    }

    // Get profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    // Get search history
    const { data: searchHistory } = await supabase
      .from('search_history')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    // Get library items
    const { data: libraryItems } = await supabase
      .from('library_items')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    const exportData = {
      user: userData,
      profile: profile || null,
      searchHistory: searchHistory || [],
      libraryItems: libraryItems || [],
      exportedAt: new Date().toISOString()
    };

    res.json(exportData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
