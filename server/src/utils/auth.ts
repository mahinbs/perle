import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  const { error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt
    });

  if (error) {
    throw new Error('Failed to create session');
  }

  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await supabase
    .from('sessions')
    .delete()
    .eq('token', token);
}

export async function cleanupExpiredSessions(): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', now);
}

