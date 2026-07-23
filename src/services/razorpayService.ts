import { Capacitor } from '@capacitor/core';
import { authenticatedFetch, getAuthHeaders, getUserData } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

export type RazorpayPlanId = 'pro' | 'max';

interface CreateSubscriptionResponse {
  subscriptionId: string;
  planId: string;
  amount: number;
  currency: string;
  keyId: string;
  autoRenew: boolean;
  switchType?: string;
  proratedAmount?: number | null;
  message?: string;
}

export interface RazorpayPaymentResponse {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  image?: string;
  callback_url?: string;
  redirect?: boolean;
  /** Required for UPI Intent inside Android/iOS WebView checkout */
  webview_intent?: boolean;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler?: (response: RazorpayPaymentResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  config?: {
    display?: {
      blocks?: Record<string, unknown>;
      sequence?: string[];
      preferences?: { show_default_blocks?: boolean };
    };
  };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on: (event: string, handler: (response: { error: { description: string } }) => void) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

async function createSubscription(plan: RazorpayPlanId, autoRenew = true): Promise<CreateSubscriptionResponse> {
  const response = await authenticatedFetch(`${API_URL}/api/payment/create-subscription`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ plan, autoRenew }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to create subscription');
  }

  return response.json();
}

export async function toggleRazorpayAutoRenew(autoRenew: boolean): Promise<{
  success: boolean;
  autoRenew: boolean;
  message?: string;
}> {
  const response = await authenticatedFetch(`${API_URL}/api/payment/toggle-auto-renew`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ autoRenew }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string; message?: string }).error ||
        (data as { message?: string }).message ||
        'Failed to update auto-renew'
    );
  }
  return data as { success: boolean; autoRenew: boolean; message?: string };
}

export async function cancelRazorpaySubscription(): Promise<{
  success: boolean;
  message?: string;
}> {
  const response = await authenticatedFetch(`${API_URL}/api/payment/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string; message?: string }).error ||
        (data as { message?: string }).message ||
        'Failed to cancel subscription'
    );
  }
  return data as { success: boolean; message?: string };
}

export async function verifyRazorpaySubscription(payment: RazorpayPaymentResponse) {
  const response = await authenticatedFetch(`${API_URL}/api/payment/verify-subscription`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      razorpay_subscription_id: payment.razorpay_subscription_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Payment verification failed');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Verification failed');
  }

  return data as {
    success: boolean;
    message: string;
    tier: 'pro' | 'max';
    plan?: 'pro' | 'max';
    subscriptionEndDate?: string;
    autoRenew?: boolean;
  };
}

const PLAN_LABELS: Record<RazorpayPlanId, string> = {
  pro: 'IQ Pro',
  max: 'IQ Max',
};

export interface RazorpayCheckoutResult {
  success: boolean;
  userCancelled?: boolean;
  error?: string;
  /** Assigned tier after successful verify */
  tier?: 'pro' | 'max';
  /** Page is navigating to Razorpay hosted checkout */
  redirecting?: boolean;
}

function getCallbackUrl(): string {
  // Razorpay POSTs to callback_url. Static SPA hosts return HTTP 405 on POST,
  // so we hit the API which 303-redirects to /payment/callback as GET.
  const apiBase = API_URL.replace(/\/+$/, '');
  const returnTo = encodeURIComponent(window.location.origin);
  return `${apiBase}/api/payment/callback?return_to=${returnTo}`;
}

/** In-app handler for Capacitor (Android). iOS uses App Store IAP instead. */
function shouldUseInAppRazorpayHandler(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Web: full-page Razorpay redirect avoids the embedded modal QR blur bug.
 * Android app: in-app checkout handler keeps the user inside the WebView.
 */
export async function startRazorpaySubscription(plan: RazorpayPlanId): Promise<RazorpayCheckoutResult> {
  await loadRazorpayScript();

  const subscription = await createSubscription(plan);
  const user = getUserData();

  if (!subscription.keyId || !subscription.subscriptionId) {
    throw new Error('Invalid subscription response from server');
  }

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is not available');
  }

  if (shouldUseInAppRazorpayHandler()) {
    const Razorpay = window.Razorpay;
    // Mark body so CSS can pad Razorpay overlay above system nav buttons.
    document.documentElement.classList.add('razorpay-checkout-open');
    document.body.classList.add('razorpay-checkout-open');

    return new Promise((resolve) => {
      const finish = (result: RazorpayCheckoutResult) => {
        document.documentElement.classList.remove('razorpay-checkout-open');
        document.body.classList.remove('razorpay-checkout-open');
        resolve(result);
      };

      const rzp = new Razorpay({
        key: subscription.keyId,
        subscription_id: subscription.subscriptionId,
        name: 'SyntraIQ',
        description: `${PLAN_LABELS[plan]} Subscription`,
        image: `${window.location.origin}/app-icon.png`,
        // Enable UPI Intent flow inside Capacitor WebView (Android).
        // https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-android/
        webview_intent: true,
        prefill: {
          name: user?.name || undefined,
          email: user?.email || undefined,
        },
        theme: {
          color: '#C7A869',
        },
        handler: async (response: RazorpayPaymentResponse) => {
          try {
            const verified = await verifyRazorpaySubscription(response);
            finish({
              success: true,
              tier: verified.tier === 'max' ? 'max' : 'pro',
            });
          } catch (err) {
            // Payment may have succeeded — try server sync (covers race / transient verify errors)
            try {
              const status = await restoreRazorpaySubscription();
              if (status.isPremium) {
                finish({
                  success: true,
                  tier: status.tier === 'max' ? 'max' : 'pro',
                });
                return;
              }
            } catch {
              // fall through to original error
            }
            finish({
              success: false,
              error: err instanceof Error ? err.message : 'Payment verification failed',
            });
          }
        },
        modal: {
          ondismiss: () => finish({ success: false, userCancelled: true }),
        },
      });

      rzp.on('payment.failed', (response) => {
        finish({
          success: false,
          error: response.error?.description || 'Payment failed',
        });
      });

      rzp.open();
    });
  }

  const rzp = new window.Razorpay({
    key: subscription.keyId,
    subscription_id: subscription.subscriptionId,
    name: 'SyntraIQ',
    description: `${PLAN_LABELS[plan]} Subscription`,
    image: `${window.location.origin}/app-icon.png`,
    callback_url: getCallbackUrl(),
    redirect: true,
    prefill: {
      name: user?.name || undefined,
      email: user?.email || undefined,
    },
    theme: {
      color: '#C7A869',
    },
  });

  rzp.open();
  return { success: false, redirecting: true };
}

export async function restoreRazorpaySubscription(): Promise<{
  isPremium: boolean;
  tier?: string;
  autoRenew?: boolean;
  subscriptionEndDate?: string | null;
  isCancelled?: boolean;
  subscriptionId?: string | null;
}> {
  const response = await authenticatedFetch(`${API_URL}/api/payment/subscription`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch subscription status');
  }

  const data = await response.json();
  const tier = data.tier === 'max' || data.tier === 'pro' ? data.tier : undefined;
  return {
    isPremium: data.isActive === true && (tier === 'pro' || tier === 'max'),
    tier,
    autoRenew: data.autoRenew === true,
    subscriptionEndDate: data.subscriptionEndDate ?? null,
    isCancelled: data.isCancelled === true,
    subscriptionId: data.subscriptionId ?? null,
  };
}
