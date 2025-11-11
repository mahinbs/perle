import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function generateOTP(): string {
  // Generate 6-digit OTP
  return crypto.randomInt(100000, 999999).toString();
}

export async function createOTP(userId: string, email: string): Promise<string> {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate any existing OTPs for this user
  await supabase
    .from('email_otps')
    .update({ verified: true })
    .eq('user_id', userId)
    .eq('verified', false);

  // Create new OTP
  const { error } = await supabase
    .from('email_otps')
    .insert({
      user_id: userId,
      email: email.toLowerCase().trim(),
      otp_code: otp,
      expires_at: expiresAt
    });

  if (error) {
    throw new Error('Failed to create OTP');
  }

  return otp;
}

export async function verifyOTP(email: string, otp: string): Promise<{ valid: boolean; userId?: string; message?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Find valid OTP
  const { data: otpData, error } = await supabase
    .from('email_otps')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('otp_code', otp)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !otpData) {
    return { valid: false, message: 'Invalid OTP code' };
  }

  // Check if expired
  if (new Date(otpData.expires_at) < new Date()) {
    return { valid: false, message: 'OTP has expired' };
  }

  // Check attempts
  if (otpData.attempts >= MAX_ATTEMPTS) {
    return { valid: false, message: 'Too many attempts. Please request a new OTP' };
  }

  // Mark as verified
  await supabase
    .from('email_otps')
    .update({ verified: true })
    .eq('id', otpData.id);

  // Mark user email as verified
  await supabase
    .from('users')
    .update({ email_verified: true })
    .eq('id', otpData.user_id);

  return { valid: true, userId: otpData.user_id };
}

export async function incrementOTPAttempts(email: string, otp: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  // Get current attempts
  const { data: otpData } = await supabase
    .from('email_otps')
    .select('attempts')
    .eq('email', normalizedEmail)
    .eq('otp_code', otp)
    .eq('verified', false)
    .single();

  if (otpData) {
    await supabase
      .from('email_otps')
      .update({ attempts: (otpData.attempts || 0) + 1 })
      .eq('email', normalizedEmail)
      .eq('otp_code', otp)
      .eq('verified', false);
  }
}

export async function cleanupExpiredOTPs(): Promise<void> {
  await supabase
    .from('email_otps')
    .delete()
    .lt('expires_at', new Date().toISOString());
}

