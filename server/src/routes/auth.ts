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
          voice_search: true,
          is_premium: false
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
        voiceSearch: profile?.voice_search ?? true,
        isPremium: (profile as any)?.is_premium ?? false
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

    // Check subscription status and auto-downgrade if expired
    let premiumTier = (profile as any)?.premium_tier || 'free';
    let subscriptionStatus = (profile as any)?.subscription_status || 'inactive';
    let isPremium = false;
    const subscriptionEndDate = (profile as any)?.subscription_end_date;

    // Check if subscription is expired
    // Valid statuses: 'active', 'inactive', 'cancelled', 'expired', 'paused'
    if (subscriptionEndDate) {
      const endDate = new Date(subscriptionEndDate);
      const now = new Date();
      
      if (endDate < now) {
        // Subscription period has ended
        if (subscriptionStatus === 'active' || subscriptionStatus === 'cancelled' || subscriptionStatus === 'paused') {
          // Subscription expired - auto-downgrade to free
          subscriptionStatus = 'expired';
          premiumTier = 'free';
          isPremium = false;
          
          // Update database
          await supabase
            .from('user_profiles')
            .update({
              premium_tier: 'free',
              is_premium: false,
              subscription_status: 'expired'
            } as any)
            .eq('user_id', authData.user.id);
        } else if (subscriptionStatus === 'expired' || subscriptionStatus === 'inactive') {
          // Already expired or inactive
          isPremium = false;
          premiumTier = 'free';
        }
      } else {
        // Subscription period hasn't ended yet
        if (subscriptionStatus === 'active') {
          // Active subscription
          isPremium = premiumTier !== 'free';
        } else if (subscriptionStatus === 'cancelled' || subscriptionStatus === 'paused') {
          // Cancelled or paused but still has access until endDate
          isPremium = premiumTier !== 'free';
        } else {
          // Inactive or expired (but endDate hasn't passed - shouldn't happen, but handle it)
          isPremium = false;
          if (premiumTier !== 'free') {
            premiumTier = 'free';
          }
        }
      }
    } else {
      // No subscription end date
      if (subscriptionStatus === 'active') {
        // Active but no end date - treat as premium (edge case)
        isPremium = premiumTier !== 'free';
      } else {
        // Inactive, cancelled, expired, or paused without end date - treat as free
        isPremium = false;
        premiumTier = 'free';
      }
    }

    res.json({
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt: authData.session.expires_at,   // Unix timestamp (seconds)
      expiresIn: authData.session.expires_in,   // Seconds until expiry
      user: {
        id: authData.user.id,
        name: name,
        email: authData.user.email || normalizedEmail,
        notifications: profile?.notifications ?? true,
        darkMode: profile?.dark_mode ?? false,
        searchHistory: profile?.search_history ?? true,
        voiceSearch: profile?.voice_search ?? true,
        isPremium: isPremium,
        premiumTier: premiumTier,
        subscription: {
          status: subscriptionStatus,
          tier: premiumTier,
          endDate: subscriptionEndDate || null,
          autoRenew: (profile as any)?.auto_renew ?? false
        }
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

// ─── Refresh token — silent re-issue of access token ──────────────────────────
// Called automatically by the frontend when the access token is about to expire.
// Returns a fresh access_token + new refresh_token (Supabase rotates on use).
// No auth middleware here — the refresh_token IS the credential.
router.post('/auth/refresh', async (req, res) => {
  try {
    const refreshToken =
      req.body?.refreshToken ||
      req.body?.refresh_token ||
      req.headers['x-refresh-token'];

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Refresh token invalid or expired. Please log in again.' });
    }

    return res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      expiresIn: data.session.expires_in,
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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

    // Check subscription status and auto-downgrade if expired
    let premiumTier = (profile as any)?.premium_tier || 'free';
    let subscriptionStatus = (profile as any)?.subscription_status || 'inactive';
    let isPremium = false;
    const subscriptionEndDate = (profile as any)?.subscription_end_date;

    // Check if subscription is expired
    // Valid statuses: 'active', 'inactive', 'cancelled', 'expired', 'paused'
    if (subscriptionEndDate) {
      const endDate = new Date(subscriptionEndDate);
      const now = new Date();
      
      if (endDate < now) {
        // Subscription period has ended
        if (subscriptionStatus === 'active' || subscriptionStatus === 'cancelled' || subscriptionStatus === 'paused') {
          // Subscription expired - auto-downgrade to free
          subscriptionStatus = 'expired';
          premiumTier = 'free';
          isPremium = false;
          
          // Update database
          await supabase
            .from('user_profiles')
            .update({
              premium_tier: 'free',
              is_premium: false,
              subscription_status: 'expired'
            } as any)
            .eq('user_id', user.id);
        } else if (subscriptionStatus === 'expired' || subscriptionStatus === 'inactive') {
          // Already expired or inactive
          isPremium = false;
          premiumTier = 'free';
        }
      } else {
        // Subscription period hasn't ended yet
        if (subscriptionStatus === 'active') {
          // Active subscription
          isPremium = premiumTier !== 'free';
        } else if (subscriptionStatus === 'cancelled' || subscriptionStatus === 'paused') {
          // Cancelled or paused but still has access until endDate
          isPremium = premiumTier !== 'free';
        } else {
          // Inactive or expired (but endDate hasn't passed - shouldn't happen, but handle it)
          isPremium = false;
          if (premiumTier !== 'free') {
            premiumTier = 'free';
          }
        }
      }
    } else {
      // No subscription end date
      if (subscriptionStatus === 'active') {
        // Active but no end date - treat as premium (edge case)
        isPremium = premiumTier !== 'free';
      } else {
        // Inactive, cancelled, expired, or paused without end date - treat as free
        isPremium = false;
        premiumTier = 'free';
      }
    }

    res.json({
      user: {
        id: user.id,
        name: name,
        email: user.email || '',
        notifications: profile?.notifications ?? true,
        darkMode: profile?.dark_mode ?? false,
        searchHistory: profile?.search_history ?? true,
        voiceSearch: profile?.voice_search ?? true,
        isPremium: isPremium,
        premiumTier: premiumTier,
        subscription: {
          status: subscriptionStatus,
          tier: premiumTier,
          endDate: subscriptionEndDate || null,
          autoRenew: (profile as any)?.auto_renew ?? false
        }
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Helper: build user response from Supabase user + profile ────────────────
async function buildUserResponse(user: any, accessToken: string, refreshToken: string, expiresAt?: number, expiresIn?: number) {
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

  // Fetch or create profile
  let { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    await supabase.from('user_profiles').insert({
      user_id: user.id,
      notifications: true,
      dark_mode: false,
      search_history: true,
      voice_search: true,
      is_premium: false,
    });
    // Re-fetch after insert
    const { data: newProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    profile = newProfile;
  }

  const premiumTier = (profile as any)?.premium_tier || 'free';
  const isPremium = (profile as any)?.is_premium ?? false;

  return {
    token: accessToken,
    refreshToken,
    expiresAt,
    expiresIn,
    user: {
      id: user.id,
      name,
      email: user.email || '',
      notifications: (profile as any)?.notifications ?? true,
      darkMode: (profile as any)?.dark_mode ?? false,
      searchHistory: (profile as any)?.search_history ?? true,
      voiceSearch: (profile as any)?.voice_search ?? true,
      isPremium,
      premiumTier,
    },
  };
}

// ─── Google OAuth: Initiate ───────────────────────────────────────────────────
// Redirects the browser / Chrome Custom Tab / ASWebAuthenticationSession
// directly to Supabase's authorize endpoint.
//
// We do NOT use supabase.auth.signInWithOAuth() here because that generates a
// PKCE code_verifier server-side and stores it in the server's memory — there
// is no way to retrieve it when the exchange request arrives on a different
// request/instance. Instead we issue a plain redirect to the Supabase authorize
// URL without a code_challenge, which causes Supabase to use the implicit flow
// and return the tokens directly in the hash fragment of the redirect_to URL.
//
// Query params:
//   mobile=1, platform=android|ios, redirect_to=syntraiq://auth/callback
//   returnTo=<path>, plan=<plan>
router.get('/auth/google', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { platform, redirect_to, returnTo, plan, mobile } = req.query as Record<string, string>;

  const isNative = mobile === '1' || platform === 'android' || platform === 'ios';
  const redirectTo = isNative && redirect_to
    ? redirect_to
    : `${process.env.CORS_ORIGIN || 'https://syntraiq.ai'}/auth/callback`;

  const params = new URLSearchParams({ provider: 'google', redirect_to: redirectTo });
  // Pass through optional navigation state so the frontend can read it after auth
  if (returnTo) params.set('returnTo', returnTo);
  if (plan) params.set('plan', plan);

  return res.redirect(302, `${supabaseUrl}/auth/v1/authorize?${params.toString()}`);
});

// ─── Google OAuth: Token / Code exchange ──────────────────────────────────────
// Called by the mobile app after it intercepts the syntraiq://auth/callback URL.
//
// Supabase can return the session in two ways depending on its flow config:
//   1. Implicit flow → access_token + refresh_token in the hash fragment
//   2. PKCE flow    → code in the query string
//
// We accept either form in the request body and handle both.
router.post('/auth/google/exchange', async (req, res) => {
  try {
    const { code, access_token, refresh_token, expires_in } = req.body;

    // ── Implicit flow: access_token sent directly ──
    if (access_token && typeof access_token === 'string') {
      // Validate the token and get the user from Supabase
      const { data: { user }, error } = await supabase.auth.getUser(access_token);
      if (error || !user) {
        console.error('Google OAuth token validation error:', error);
        return res.status(401).json({ error: 'Invalid access token' });
      }

      const expiresAt = expires_in
        ? Math.floor(Date.now() / 1000) + Number(expires_in)
        : undefined;

      const response = await buildUserResponse(user, access_token, refresh_token || '', expiresAt, expires_in ? Number(expires_in) : undefined);
      return res.json(response);
    }

    // ── PKCE flow: authorization code exchange ──
    if (code && typeof code === 'string') {
      // exchangeCodeForSession requires the code_verifier that was generated
      // when the authorize URL was created. If the frontend used the Supabase
      // JS SDK to generate the URL (proper PKCE), the SDK stores the verifier
      // in localStorage and this call will succeed. If Supabase used implicit
      // flow despite us passing `code`, we reject and ask the client to retry.
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session || !data.user) {
        console.error('Code exchange error:', error);
        return res.status(400).json({ error: error?.message || 'Failed to exchange code — try signing in again' });
      }

      const { user, session } = data;
      const response = await buildUserResponse(
        user,
        session.access_token,
        session.refresh_token,
        session.expires_at,
        session.expires_in,
      );
      return res.json(response);
    }

    return res.status(400).json({ error: 'access_token or code is required' });
  } catch (err) {
    console.error('Google OAuth exchange error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── OAuth Redeem (alternate / legacy path) ───────────────────────────────────
// Mirrors /auth/google/exchange; kept as a separate route for forward-compat.
router.post('/auth/oauth/redeem', async (req, res) => {
  try {
    const { code, oauth_code, access_token, refresh_token, expires_in } = req.body;
    const theCode = code || oauth_code;

    // Implicit flow
    if (access_token && typeof access_token === 'string') {
      const { data: { user }, error } = await supabase.auth.getUser(access_token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid access token' });
      }
      const expiresAt = expires_in ? Math.floor(Date.now() / 1000) + Number(expires_in) : undefined;
      const response = await buildUserResponse(user, access_token, refresh_token || '', expiresAt, expires_in ? Number(expires_in) : undefined);
      return res.json(response);
    }

    // PKCE code exchange
    if (theCode && typeof theCode === 'string') {
      const { data, error } = await supabase.auth.exchangeCodeForSession(theCode);
      if (error || !data.session || !data.user) {
        return res.status(400).json({ error: error?.message || 'Failed to redeem OAuth code' });
      }
      const { user, session } = data;
      const response = await buildUserResponse(
        user,
        session.access_token,
        session.refresh_token,
        session.expires_at,
        session.expires_in,
      );
      return res.json(response);
    }

    return res.status(400).json({ error: 'access_token or code is required' });
  } catch (err) {
    console.error('OAuth redeem error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
