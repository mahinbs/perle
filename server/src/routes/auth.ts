import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email format').max(255, 'Email too long'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

const verifyOTPSchema = z.object({
  email: z.string().email('Invalid email format'),
  otp: z.string().length(8, 'OTP must be 8 digits').regex(/^\d+$/, 'OTP must contain only numbers')
});

const resendOTPSchema = z.object({
  email: z.string().email('Invalid email format')
});

// Signup using Supabase Auth
router.post('/auth/signup', async (req, res) => {
  try {
    const parse = signupSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { name, email, password } = parse.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Use Supabase Auth to sign up
    // This will automatically send the verification email with OTP
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password,
      options: {
        data: {
          name: name.trim(),
        },
        emailRedirectTo: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/verify`
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(500).json({ error: 'Failed to create account' });
    }

    // Create user profile in our custom table
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: authData.user.id,
        notifications: true,
        dark_mode: false,
        search_history: true,
        voice_search: true
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    }

    // Supabase Auth sends the verification email automatically
    // Return response indicating verification is required
    res.status(201).json({
      requiresVerification: true,
      email: normalizedEmail,
      message: 'Please check your email for the 8-digit verification code'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP using Supabase Auth
router.post('/auth/verify-otp', async (req, res) => {
  try {
    const parse = verifyOTPSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { email, otp } = parse.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Verify OTP with Supabase Auth
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: 'signup'
    });

    if (verifyError || !verifyData.user) {
      return res.status(400).json({ 
        error: verifyError?.message || 'Invalid or expired verification code' 
      });
    }

    // Get user metadata
    const userMetadata = verifyData.user.user_metadata;
    const name = userMetadata?.name || 'User';

    // Get or create profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', verifyData.user.id)
      .single();

    if (!profile) {
      await supabase
        .from('user_profiles')
        .insert({
          user_id: verifyData.user.id,
          notifications: true,
          dark_mode: false,
          search_history: true,
          voice_search: true
        });
    }

    // Create session token (using Supabase session)
    const sessionToken = verifyData.session?.access_token || verifyData.user.id;

    res.json({
      token: sessionToken,
      user: {
        id: verifyData.user.id,
        name: name,
        email: verifyData.user.email || normalizedEmail,
        notifications: profile?.notifications ?? true,
        darkMode: profile?.dark_mode ?? false,
        searchHistory: profile?.search_history ?? true,
        voiceSearch: profile?.voice_search ?? true
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend OTP using Supabase Auth
router.post('/auth/resend-otp', async (req, res) => {
  try {
    const parse = resendOTPSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { email } = parse.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Resend OTP using Supabase Auth
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/verify`
      }
    });

    if (resendError) {
      return res.status(400).json({ error: resendError.message });
    }

    res.json({
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login using Supabase Auth
router.post('/auth/login', async (req, res) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { email, password } = parse.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Use Supabase Auth to sign in
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: password
    });

    if (authError) {
      if (authError.message.includes('Email not confirmed')) {
        return res.status(403).json({ 
          error: 'Email not verified', 
          requiresVerification: true,
          email: normalizedEmail
        });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!authData.user || !authData.session) {
      return res.status(401).json({ error: 'Login failed' });
    }

    // Get user metadata
    const userMetadata = authData.user.user_metadata;
    const name = userMetadata?.name || 'User';

    // Get profile settings
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', authData.user.id)
      .single();

    res.json({
      token: authData.session.access_token,
      user: {
        id: authData.user.id,
        name: name,
        email: authData.user.email || normalizedEmail,
        notifications: profile?.notifications ?? true,
        darkMode: profile?.dark_mode ?? false,
        searchHistory: profile?.search_history ?? true,
        voiceSearch: profile?.voice_search ?? true
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/auth/logout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      // Sign out from Supabase Auth
      await supabase.auth.signOut();
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token
router.get('/auth/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userMetadata = user.user_metadata;
    const name = userMetadata?.name || 'User';

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    res.json({
      user: {
        id: user.id,
        name: name,
        email: user.email || '',
        notifications: profile?.notifications ?? true,
        darkMode: profile?.dark_mode ?? false,
        searchHistory: profile?.search_history ?? true,
        voiceSearch: profile?.voice_search ?? true
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
