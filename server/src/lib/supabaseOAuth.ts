import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { buildAuthResponseFromSession } from '../utils/authSessionResponse.js';
import { redisDel, redisGetJSON, redisSetJSON } from './redis.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

type PkceBucket = Record<string, string>;
const pkceBuckets = new Map<string, PkceBucket>();

type OAuthReturnState = { returnTo?: string; plan?: string };

type PendingOAuthPayload = {
  token: string;
  refreshToken: string;
  expiresAt: number;
  expiresIn: number;
  user: unknown;
  returnState?: OAuthReturnState;
  ts: number;
};

const pendingOAuthCodes = new Map<string, PendingOAuthPayload>();
const PKCE_TTL_SEC = 600;
const PENDING_OAUTH_TTL_MS = 2 * 60 * 1000;
const PKCE_REDIS_PREFIX = 'oauth:pkce:';
const PENDING_REDIS_PREFIX = 'oauth:pending:';

function prunePendingOAuth() {
  const now = Date.now();
  for (const [key, entry] of pendingOAuthCodes) {
    if (now - entry.ts > PENDING_OAUTH_TTL_MS) pendingOAuthCodes.delete(key);
  }
}

// ── Manual PKCE generation ───────────────────────────────────────────────
//
// supabase-js v2.39 with `flowType: 'pkce'` + `skipBrowserRedirect: true`
// generates the code verifier internally but doesn't reliably persist it
// to a custom storage adapter before returning the redirect URL. The
// callback then can't recover the verifier and the whole flow fails with
// "OAuth session expired".
//
// Workaround: generate the PKCE pair ourselves and pre-write the verifier
// to our bucket under the EXACT key Supabase looks for at callback time
// (`<storageKey>-code-verifier`). When `exchangeCodeForSession` runs in
// the callback handler, it reads from our storage and finds the verifier
// we put there. We also build the authorize URL manually using the same
// code_challenge so Google's side validates against our verifier.

/** RFC 7636 §4.1 — code_verifier is 43-128 chars, URL-safe base64 of 32 random bytes works. */
function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

/** RFC 7636 §4.2 — code_challenge = base64url(sha256(code_verifier)). */
function generateCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Derive the storage key Supabase uses for this project's auth token. The
 * SDK persists the PKCE verifier at `${storageKey}-code-verifier`. Without
 * a custom `storageKey` config option, it defaults to `sb-${projectRef}-auth-token`
 * where projectRef is the subdomain of SUPABASE_URL.
 */
function getSupabaseStorageKey(): string {
  try {
    const url = new URL(supabaseUrl || '');
    const projectRef = url.hostname.split('.')[0] || 'project';
    return `sb-${projectRef}-auth-token`;
  } catch {
    return 'sb-project-auth-token';
  }
}

function isCodeVerifierEntry(key: string, value: string): boolean {
  if (key === '__oauth_return__') return false;
  if (typeof value !== 'string' || value.length < 20) return false;
  return (
    key.includes('code-verifier') ||
    key.includes('code_verifier') ||
    key.includes('codeVerifier')
  );
}

function bucketHasCodeVerifier(bucket: PkceBucket | undefined | null): boolean {
  if (!bucket) return false;
  return Object.entries(bucket).some(([key, value]) => isCodeVerifierEntry(key, value));
}

function cookieSecure(): boolean {
  if (process.env.OAUTH_COOKIE_SECURE === 'false') return false;
  const base = (process.env.API_PUBLIC_URL || '').toLowerCase();
  return base.startsWith('https://') || process.env.NODE_ENV === 'production';
}

function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(res: Response, name: string, value: string, maxAgeSec: number) {
  const secure = cookieSecure();
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`,
  );
}

function clearCookie(res: Response, name: string) {
  const secure = cookieSecure();
  res.append(
    'Set-Cookie',
    `${name}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`,
  );
}

function clearOAuthCookies(res: Response) {
  clearCookie(res, 'oauth_pkce');
  clearCookie(res, 'oauth_pkce_data');
  clearCookie(res, 'oauth_cv_k');
  clearCookie(res, 'oauth_cv_v');
}

function readPkceBucketFromCookie(req: Request): PkceBucket | null {
  const raw = getCookie(req, 'oauth_pkce_data');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as PkceBucket;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writePkceBucketToCookie(res: Response, bucket: PkceBucket) {
  try {
    const payload = Buffer.from(JSON.stringify(bucket)).toString('base64url');
    if (payload.length > 3600) return;
    setCookie(res, 'oauth_pkce_data', payload, PKCE_TTL_SEC);
  } catch {
    // best-effort
  }
}

/** Small dedicated cookies — survives multi-worker deploys when JSON blob cookie fails. */
function writeVerifierCookies(res: Response, bucket: PkceBucket) {
  for (const [key, value] of Object.entries(bucket)) {
    if (!isCodeVerifierEntry(key, value)) continue;
    setCookie(res, 'oauth_cv_k', key, PKCE_TTL_SEC);
    setCookie(res, 'oauth_cv_v', value, PKCE_TTL_SEC);
    return;
  }
}

function mergeVerifierFromDedicatedCookies(req: Request, bucket: PkceBucket): PkceBucket {
  const key = getCookie(req, 'oauth_cv_k');
  const value = getCookie(req, 'oauth_cv_v');
  if (key && value) {
    return { ...bucket, [key]: value };
  }
  return bucket;
}

function persistPkceBucketSync(bucketId: string, bucket: PkceBucket, res?: Response) {
  pkceBuckets.set(bucketId, bucket);
  if (res) {
    writePkceBucketToCookie(res, bucket);
    writeVerifierCookies(res, bucket);
  }
  void redisSetJSON(`${PKCE_REDIS_PREFIX}${bucketId}`, bucket, PKCE_TTL_SEC);
}

async function loadPkceBucket(bucketId: string, req?: Request): Promise<PkceBucket | null> {
  let bucket: PkceBucket | null = null;

  if (req) {
    bucket = readPkceBucketFromCookie(req);
    if (bucket) bucket = mergeVerifierFromDedicatedCookies(req, bucket);
  }

  if (!bucketHasCodeVerifier(bucket)) {
    const fromRedis = await redisGetJSON<PkceBucket>(`${PKCE_REDIS_PREFIX}${bucketId}`);
    if (fromRedis) bucket = fromRedis;
  }

  if (!bucketHasCodeVerifier(bucket)) {
    const inMemory = pkceBuckets.get(bucketId);
    if (inMemory) bucket = inMemory;
  }

  if (req && bucket) {
    bucket = mergeVerifierFromDedicatedCookies(req, bucket);
  }

  if (bucket) {
    pkceBuckets.set(bucketId, bucket);
    if (bucketHasCodeVerifier(bucket)) {
      void redisSetJSON(`${PKCE_REDIS_PREFIX}${bucketId}`, bucket, PKCE_TTL_SEC);
    }
  }

  return bucket;
}

async function deletePkceBucket(bucketId: string, res?: Response) {
  pkceBuckets.delete(bucketId);
  await redisDel(`${PKCE_REDIS_PREFIX}${bucketId}`);
  if (res) clearOAuthCookies(res);
}

function createPkceStorage(bucketId: string, res?: Response) {
  return {
    getItem: (key: string) => {
      return pkceBuckets.get(bucketId)?.[key] ?? null;
    },
    // Sync writes — Supabase may not await async storage; verifier must exist before redirect.
    setItem: (key: string, value: string) => {
      const bucket = { ...(pkceBuckets.get(bucketId) || {}), [key]: value };
      persistPkceBucketSync(bucketId, bucket, res);
    },
    removeItem: (key: string) => {
      const bucket = pkceBuckets.get(bucketId);
      if (!bucket) return;
      delete bucket[key];
      if (Object.keys(bucket).length === 0) {
        pkceBuckets.delete(bucketId);
        void redisDel(`${PKCE_REDIS_PREFIX}${bucketId}`);
      } else {
        persistPkceBucketSync(bucketId, bucket, res);
      }
    },
  };
}

function createOAuthClient(bucketId: string, res?: Response): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for Google OAuth');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: false,
      autoRefreshToken: false,
      storage: createPkceStorage(bucketId, res),
    },
  });
}

export function getApiPublicBase(req: Request): string {
  if (process.env.API_PUBLIC_URL) {
    return process.env.API_PUBLIC_URL.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

export function getFrontendOrigin(): string {
  const raw = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173';
  const origins = raw.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  const preferred =
    origins.find((o) => /syntraiq\.ai$/i.test(o.replace(/^https?:\/\//, ''))) ||
    origins.find((o) => o.startsWith('https://')) ||
    origins[0];
  return preferred || 'http://localhost:5173';
}

export async function handleGoogleOAuthStart(req: Request, res: Response) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      error: 'Google sign-in is not configured on the server (missing SUPABASE_ANON_KEY).',
    });
  }

  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
  const plan = typeof req.query.plan === 'string' ? req.query.plan : undefined;
  const bucketId = randomBytes(16).toString('hex');

  // Manual PKCE generation — see the helper docs above for why we don't
  // delegate this to supabase-js v2.39 (it doesn't reliably persist the
  // verifier to a custom storage when skipBrowserRedirect:true is set).
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const storageKey = getSupabaseStorageKey();

  // Pre-populate the bucket with BOTH the user's return state AND the
  // PKCE verifier. We write the verifier under MULTIPLE key variants
  // because supabase-js has changed its lookup format across minor
  // versions and we don't want a future bump to silently break OAuth.
  // The callback's `exchangeCodeForSession` will find a match against
  // whichever key the SDK is using on the deployed version.
  const verifierBucket: PkceBucket = {
    __oauth_return__: JSON.stringify({ returnTo, plan }),
    [`${storageKey}-code-verifier`]: codeVerifier,          // v2.39+ default
    [`${storageKey}.code_verifier`]: codeVerifier,           // older style
    [`${storageKey}-codeVerifier`]: codeVerifier,            // camelCase variant
    code_verifier: codeVerifier,                              // bare fallback
  };
  persistPkceBucketSync(bucketId, verifierBucket, res);

  setCookie(res, 'oauth_pkce', bucketId, PKCE_TTL_SEC);

  const callbackUrl = `${getApiPublicBase(req)}/api/auth/google/callback`;

  // Build Supabase's `/auth/v1/authorize` URL ourselves. This is the
  // endpoint signInWithOAuth would have redirected us to anyway — we just
  // attach our own code_challenge so we own the verifier.
  const authorizeUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', callbackUrl);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  // Hint Google to show the account picker and grant offline access so
  // we get a refresh token — matches the original behaviour.
  authorizeUrl.searchParams.set('access_type', 'offline');
  authorizeUrl.searchParams.set('prompt', 'select_account');

  return res.redirect(authorizeUrl.toString());
}

export async function handleGoogleOAuthCallback(req: Request, res: Response) {
  const frontend = getFrontendOrigin();
  const fail = (message: string) =>
    res.redirect(`${frontend}/auth/callback?error=${encodeURIComponent(message)}`);

  const oauthError =
    typeof req.query.error_description === 'string'
      ? req.query.error_description
      : typeof req.query.error === 'string'
        ? req.query.error
        : null;
  if (oauthError) return fail(oauthError);

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) return fail('Missing OAuth code');

  const bucketId = getCookie(req, 'oauth_pkce');
  if (!bucketId) {
    console.error('Google OAuth callback: missing oauth_pkce cookie');
    return fail('OAuth session expired. Please try again.');
  }

  const bucket = await loadPkceBucket(bucketId, req);
  if (!bucketHasCodeVerifier(bucket)) {
    console.error('Google OAuth callback: missing PKCE verifier', {
      bucketId: bucketId.slice(0, 8),
      hasDataCookie: Boolean(getCookie(req, 'oauth_pkce_data')),
      hasVerifierCookie: Boolean(getCookie(req, 'oauth_cv_v')),
    });
    return fail('OAuth session expired. Please try Google sign-in again.');
  }

  let returnState: OAuthReturnState | undefined;
  try {
    const raw = bucket?.__oauth_return__;
    returnState = raw ? JSON.parse(raw) : undefined;
  } catch {
    returnState = undefined;
  }

  try {
    // Pluck the verifier out of the bucket ourselves. We wrote it under
    // four key variants when starting the flow (see handleGoogleOAuthStart);
    // pick whichever made it through cookies / Redis / memory back to us.
    let codeVerifier = '';
    for (const [k, v] of Object.entries(bucket || {})) {
      if (isCodeVerifierEntry(k, v)) { codeVerifier = v; break; }
    }
    if (!codeVerifier) {
      console.error('Google OAuth callback: bucket has verifier-like key but value is empty');
      return fail('OAuth session expired. Please try Google sign-in again.');
    }

    // Bypass supabase-js's exchangeCodeForSession — its internal storage
    // lookups have proven unreliable across SDK versions when the verifier
    // wasn't written by the SDK itself (we generated it ourselves). Hit
    // Supabase's token endpoint directly with apikey + JSON body. This is
    // the exact HTTP call the SDK would make if it found the verifier.
    if (!supabaseUrl || !supabaseAnonKey) {
      return fail('Supabase auth is not configured on the server.');
    }
    const tokenUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=pkce`;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
    });
    const tokenJson: any = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenJson?.access_token) {
      const errMsg = tokenJson?.error_description || tokenJson?.error || tokenJson?.msg || `Token exchange failed (HTTP ${tokenRes.status})`;
      console.error('Google OAuth direct exchange failed:', errMsg, tokenJson);
      return fail(errMsg);
    }

    // Shape the response so buildAuthResponseFromSession sees the same
    // structure it would from supabase-js. The token endpoint already
    // returns access_token, refresh_token, expires_in, expires_at, user —
    // matching Supabase's session contract.
    const session = { 
      access_token: tokenJson.access_token as string,
      refresh_token: tokenJson.refresh_token as string,
      expires_in: tokenJson.expires_in as number,
      expires_at: tokenJson.expires_at as number,
      token_type: tokenJson.token_type || 'bearer',
      user: tokenJson.user,
    };

    const payload = await buildAuthResponseFromSession(session as any);
    prunePendingOAuth();

    const oneTimeCode = randomBytes(24).toString('hex');
    const pending: PendingOAuthPayload = {
      ...payload,
      expiresAt: payload.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
      returnState,
      ts: Date.now(),
    };
    pendingOAuthCodes.set(oneTimeCode, pending);
    await redisSetJSON(`${PENDING_REDIS_PREFIX}${oneTimeCode}`, pending, Math.floor(PENDING_OAUTH_TTL_MS / 1000));

    clearCookie(res, 'oauth_pkce');
    await deletePkceBucket(bucketId, res);

    const params = new URLSearchParams({ oauth_code: oneTimeCode });
    return res.redirect(`${frontend}/auth/callback?${params.toString()}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return fail(err instanceof Error ? err.message : 'Google sign-in failed');
  } finally {
    pkceBuckets.delete(bucketId);
    await redisDel(`${PKCE_REDIS_PREFIX}${bucketId}`);
  }
}

export async function redeemOAuthCode(code: string) {
  prunePendingOAuth();

  const fromMemory = pendingOAuthCodes.get(code);
  if (fromMemory) {
    pendingOAuthCodes.delete(code);
    await redisDel(`${PENDING_REDIS_PREFIX}${code}`);
    if (Date.now() - fromMemory.ts > PENDING_OAUTH_TTL_MS) return null;
    return fromMemory;
  }

  const fromRedis = await redisGetJSON<PendingOAuthPayload>(`${PENDING_REDIS_PREFIX}${code}`);
  if (!fromRedis) return null;
  await redisDel(`${PENDING_REDIS_PREFIX}${code}`);
  if (Date.now() - fromRedis.ts > PENDING_OAUTH_TTL_MS) return null;
  return fromRedis;
}