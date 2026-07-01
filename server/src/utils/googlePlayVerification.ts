import crypto from 'crypto';

interface GooglePlaySubscription {
  subscriptionState: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
  }>;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Google Play service account credentials are not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const base64url = (value: object | string) =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

  const unsigned = `${base64url(header)}.${base64url(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to obtain Google access token: ${errorText}`);
  }

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Google access token response missing access_token');
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return data.access_token;
}

export async function verifyGooglePlaySubscription(
  purchaseToken: string,
  expectedProductId: string
): Promise<{
  isActive: boolean;
  productId: string;
  transactionId: string;
  startDate: string;
  endDate: string | null;
}> {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.syntraiq.com';
  const accessToken = await getGoogleAccessToken();

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Play verification failed: ${errorText}`);
  }

  const subscription = await response.json() as GooglePlaySubscription;
  const activeStates = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  ]);

  const isActive = activeStates.has(subscription.subscriptionState);
  const lineItems = subscription.lineItems ?? [];
  const matchingLineItem = lineItems.find(item => item.productId === expectedProductId) ?? lineItems[0];

  if (!matchingLineItem?.productId) {
    throw new Error(`No subscription line item found for product ID: ${expectedProductId}`);
  }

  const expiryTime = matchingLineItem.expiryTime ? new Date(matchingLineItem.expiryTime) : null;
  const now = new Date();

  if (expiryTime && expiryTime <= now) {
    return {
      isActive: false,
      productId: matchingLineItem.productId,
      transactionId: matchingLineItem.latestSuccessfulOrderId || purchaseToken,
      startDate: now.toISOString(),
      endDate: expiryTime.toISOString(),
    };
  }

  return {
    isActive: isActive && (!expiryTime || expiryTime > now),
    productId: matchingLineItem.productId,
    transactionId: matchingLineItem.latestSuccessfulOrderId || purchaseToken,
    startDate: now.toISOString(),
    endDate: expiryTime ? expiryTime.toISOString() : null,
  };
}
