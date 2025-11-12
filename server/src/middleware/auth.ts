import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
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
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify token with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.userId = user.id;
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
  // Try to authenticate, but don't fail if no token or invalid token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  // If token exists, try to verify it (but don't fail if invalid)
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (!error && user) {
      // Token is valid - set user info
      req.userId = user.id;
      req.userEmail = user.email || undefined;
    }
    // If token is invalid/expired, just continue without user (optional auth)
    next();
  } catch (error) {
    // If verification fails, continue without user (optional auth)
    console.warn('Optional auth verification failed:', error);
    next();
  }
}
