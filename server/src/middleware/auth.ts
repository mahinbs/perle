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

export function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  // Try to authenticate, but don't fail if no token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  // If token exists, try to authenticate
  authenticateToken(req, res, next).catch(() => {
    // If auth fails, continue without user (optional auth)
    next();
  });
}
