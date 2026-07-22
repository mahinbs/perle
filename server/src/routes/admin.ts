import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import {
  listAiContentReports,
  updateAiContentReportStatus,
  type AiReportStatus,
} from '../utils/aiReportsStore.js';

const router = Router();

// Simple admin check - you can enhance this with proper role-based auth
// For now, we'll use an environment variable for admin user IDs
// Set ADMIN_USER_IDS in .env: ADMIN_USER_IDS=user-id-1,user-id-2,user-id-3
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);

// Admin panel credentials for /admin UI (override via env in production)
const PANEL_EMAIL = (
  process.env.ADMIN_PANEL_EMAIL || 'Syntraiq-admin@gmail.com'
).trim().toLowerCase();
const PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'syntraiq@admin';
const PANEL_SECRET =
  process.env.ADMIN_PANEL_SECRET ||
  process.env.JWT_SECRET ||
  'syntraiq-admin-panel-secret';

function signPanelToken(email: string): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000; // 12h
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', PANEL_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyPanelToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', PANEL_SECRET).update(payload).digest('base64url');
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    if (!data.email || data.email.toLowerCase() !== PANEL_EMAIL) return false;
    if (!data.exp || Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function requirePanelAuth(req: AuthRequest, res: any, next: any): void {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!verifyPanelToken(token)) {
    res.status(401).json({ error: 'Admin panel login required' });
    return;
  }
  next();
}

async function isAdmin(userId: string): Promise<boolean> {
  // Check if user is in admin list
  if (ADMIN_USER_IDS.includes(userId)) {
    return true;
  }
  
  // You can also check user metadata or a role field here
  // For example: check if user has admin role in Supabase Auth metadata
  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    if (user?.user_metadata?.role === 'admin') {
      return true;
    }
  } catch (error) {
    // Ignore errors
  }
  
  return false;
}

// Middleware to check admin access
async function requireAdmin(
  req: AuthRequest,
  res: any,
  next: any
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const hasAdminAccess = await isAdmin(req.userId);
  if (!hasAdminAccess) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

// Update user premium tier (admin only)
router.post('/admin/users/:userId/premium', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    const updateSchema = z.object({
      tier: z.enum(['free', 'pro', 'max']),
      subscriptionStatus: z.enum(['active', 'inactive', 'cancelled', 'expired', 'paused']).optional(),
      subscriptionEndDate: z.string().optional(), // ISO date string
      autoRenew: z.boolean().optional()
    });

    const parse = updateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: parse.error.flatten().fieldErrors 
      });
    }

    const { tier, subscriptionStatus, subscriptionEndDate, autoRenew } = parse.data;

    // Calculate dates
    const startDate = new Date();
    const endDate = subscriptionEndDate 
      ? new Date(subscriptionEndDate)
      : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days

    // Update user profile
    const updateData: any = {
      premium_tier: tier,
      is_premium: tier !== 'free',
      subscription_status: subscriptionStatus || (tier !== 'free' ? 'active' : 'inactive'),
      subscription_start_date: startDate.toISOString(),
      subscription_end_date: endDate.toISOString(),
      updated_at: new Date().toISOString()
    };

    if (autoRenew !== undefined) {
      updateData.auto_renew = autoRenew;
    }

    const { data: profile, error: updateError } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Update premium error:', updateError);
      return res.status(500).json({ error: 'Failed to update premium status' });
    }

    // Get user email for response
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);

    res.json({
      success: true,
      message: `User premium tier updated to ${tier}`,
      user: {
        id: userId,
        email: user?.email || 'Unknown',
        premium_tier: tier,
        is_premium: tier !== 'free',
        subscription_status: updateData.subscription_status,
        subscription_end_date: endDate.toISOString()
      }
    });
  } catch (error: any) {
    console.error('Admin update premium error:', error);
    res.status(500).json({ 
      error: 'Failed to update premium status',
      message: error.message 
    });
  }
});

// Get user premium status (admin only)
router.get('/admin/users/:userId/premium', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('premium_tier, is_premium, subscription_status, subscription_start_date, subscription_end_date, auto_renew')
      .eq('user_id', userId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get user email
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);

    res.json({
      user: {
        id: userId,
        email: user?.email || 'Unknown',
        premium_tier: (profile as any)?.premium_tier || 'free',
        is_premium: (profile as any)?.is_premium || false,
        subscription_status: (profile as any)?.subscription_status || 'inactive',
        subscription_start_date: (profile as any)?.subscription_start_date || null,
        subscription_end_date: (profile as any)?.subscription_end_date || null,
        auto_renew: (profile as any)?.auto_renew || false
      }
    });
  } catch (error: any) {
    console.error('Admin get premium error:', error);
    res.status(500).json({ 
      error: 'Failed to get premium status',
      message: error.message 
    });
  }
});

// List all premium users (admin only)
router.get('/admin/users/premium', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('user_id, premium_tier, is_premium, subscription_status, subscription_end_date')
      .in('premium_tier', ['pro', 'max'])
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch premium users' });
    }

    // Get user emails
    const usersWithEmails = await Promise.all(
      (profiles || []).map(async (profile: any) => {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(profile.user_id);
          return {
            id: profile.user_id,
            email: user?.email || 'Unknown',
            premium_tier: profile.premium_tier,
            is_premium: profile.is_premium,
            subscription_status: profile.subscription_status,
            subscription_end_date: profile.subscription_end_date
          };
        } catch {
          return {
            id: profile.user_id,
            email: 'Unknown',
            premium_tier: profile.premium_tier,
            is_premium: profile.is_premium,
            subscription_status: profile.subscription_status,
            subscription_end_date: profile.subscription_end_date
          };
        }
      })
    );

    res.json({
      count: usersWithEmails.length,
      users: usersWithEmails
    });
  } catch (error: any) {
    console.error('Admin list premium users error:', error);
    res.status(500).json({ 
      error: 'Failed to list premium users',
      message: error.message 
    });
  }
});

// ── Admin panel (AI reports moderation) ─────────────────────────────────────
// Dedicated email/password gate for /admin UI (Play Store AI content policy).

router.post('/admin/panel/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (email !== PANEL_EMAIL || password !== PANEL_PASSWORD) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signPanelToken(email);
    return res.json({
      ok: true,
      token,
      email: PANEL_EMAIL,
      expiresInHours: 12,
    });
  } catch (err) {
    console.error('Admin panel login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/admin/panel/reports', requirePanelAuth, async (req, res) => {
  try {
    const statusRaw = String(req.query.status || 'all');
    const status =
      statusRaw === 'pending' || statusRaw === 'reviewed' || statusRaw === 'dismissed'
        ? (statusRaw as AiReportStatus)
        : 'all';
    const reports = await listAiContentReports({ status, limit: 300 });
    return res.json({ count: reports.length, reports });
  } catch (err) {
    console.error('Admin panel list reports error:', err);
    return res.status(500).json({ error: 'Failed to load reports' });
  }
});

router.patch('/admin/panel/reports/:id', requirePanelAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const status = String(req.body?.status || '') as AiReportStatus;
    if (!['pending', 'reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const notes =
      typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.slice(0, 2000) : undefined;
    const updated = await updateAiContentReportStatus(id, status, notes);
    if (!updated) return res.status(404).json({ error: 'Report not found' });
    return res.json({ ok: true, report: updated });
  } catch (err) {
    console.error('Admin panel update report error:', err);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

export default router;

