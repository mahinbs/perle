#!/usr/bin/env node
/**
 * Generate Apple OAuth client secret (JWT) for Supabase.
 *
 * iOS native-only apps usually do NOT need this — leave Secret Key empty in
 * Supabase and only add your bundle ID under Client IDs.
 *
 * Use this only if your Supabase dashboard refuses to save without a JWT
 * (web/Android OAuth), or you add Apple web sign-in later.
 *
 * Usage:
 *   APPLE_TEAM_ID=Q4AU696B7H \
 *   APPLE_KEY_ID=YOUR_KEY_ID \
 *   APPLE_CLIENT_ID=com.syntraiq.com \
 *   APPLE_P8_PATH=/path/to/AuthKey_XXXXX.p8 \
 *   node scripts/generate-apple-client-secret.mjs
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const TEAM_ID = process.env.APPLE_TEAM_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const CLIENT_ID = process.env.APPLE_CLIENT_ID || 'com.syntraiq.com';
const P8_PATH = process.env.APPLE_P8_PATH;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function missing(name) {
  console.error(`Missing ${name}. Set the env var and run again.`);
  process.exit(1);
}

if (!TEAM_ID) missing('APPLE_TEAM_ID');
if (!KEY_ID) missing('APPLE_KEY_ID');
if (!P8_PATH) missing('APPLE_P8_PATH');

if (!fs.existsSync(P8_PATH)) {
  console.error(`P8 file not found: ${P8_PATH}`);
  process.exit(1);
}

const privateKey = fs.readFileSync(P8_PATH, 'utf8');
const now = Math.floor(Date.now() / 1000);
// Apple allows max ~6 months; regenerate before expiry.
const exp = now + 86400 * 180;

const header = { alg: 'ES256', kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
};

const encodedHeader = base64Url(JSON.stringify(header));
const encodedPayload = base64Url(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;

const signature = crypto.sign('sha256', Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
});

const jwt = `${signingInput}.${base64Url(signature)}`;

console.log('\nApple client secret (JWT) — paste into Supabase → Auth → Apple → Secret Key:\n');
console.log(jwt);
console.log('\nExpires (unix):', exp, '— regenerate in ~6 months if you use OAuth.\n');
console.log('For iOS native-only: prefer leaving Secret Key empty and only set Client IDs.\n');
