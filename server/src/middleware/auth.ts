import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  /** Set when the access token was silently refreshed — frontend should store the new tokens */
  newAccessToken?: string;
  newRefreshToken?: string;
  newExpiresAt?: number;
}

/** Try refreshing via Supabase if a refresh token header is present. */
async function tryRefresh(req: AuthRequest): Promise<boolean> {
  const rt = req.headers['x-refresh-token'];
  if (!rt || typeof rt !== 'string') return false;

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: rt });
  if (error || !data.session || !data.user) return false;

  req.userId        = data.user.id;
  req.userEmail     = data.user.email || undefined;
  req.newAccessToken  = data.session.access_token;
  req.newRefreshToken = data.session.refresh_token;
  req.newExpiresAt    = data.session.expires_at;
  return true;
}

/** Attach refreshed token info to response headers so frontend can silently store them. */
function attachNewTokenHeaders(req: AuthRequest, res: Response) {
  if (req.newAccessToken) {
    res.setHeader('X-New-Access-Token',  req.newAccessToken);
    res.setHeader('X-New-Refresh-Token', req.newRefreshToken || '');
    res.setHeader('X-New-Expires-At',    String(req.newExpiresAt || ''));
    res.setHeader('Access-Control-Expose-Headers',
      'X-New-Access-Token, X-New-Refresh-Token, X-New-Expires-At');
  }
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      // No access token — try refresh if client sent X-Refresh-Token
      const refreshed = await tryRefresh(req);
      if (refreshed) {
        attachNewTokenHeaders(req, res);
        next();
        return;
      }
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify access token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Access token expired — try silent refresh
      const refreshed = await tryRefresh(req);
      if (refreshed) {
        attachNewTokenHeaders(req, res);
        next();
        return;
      }
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }

    req.userId    = user.id;
    req.userEmail = user.email || undefined;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    // No access token — try refresh header silently
    const rt = req.headers['x-refresh-token'];
    if (rt && typeof rt === 'string') {
      const refreshed = await tryRefresh(req).catch(() => false);
      if (refreshed) attachNewTokenHeaders(req, res);
    }
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.userId    = user.id;
      req.userEmail = user.email || undefined;
    } else {
      // Expired — try silent refresh
      const refreshed = await tryRefresh(req).catch(() => false);
      if (refreshed) attachNewTokenHeaders(req, res);
    }
    next();
  } catch {
    next();
  }
}
