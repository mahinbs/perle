/**
 * Razorpay credentials — production and test sets live in .env.
 * Active set is chosen via RAZORPAY_MODE=live|test (default: live).
 */

export type RazorpayMode = 'live' | 'test';

export type RazorpayCredentials = {
  mode: RazorpayMode;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  planIds: {
    pro: string;
    max: string;
  };
};

export function getRazorpayMode(): RazorpayMode {
  const mode = (process.env.RAZORPAY_MODE || 'live').toLowerCase();
  return mode === 'test' ? 'test' : 'live';
}

export function getRazorpayCredentials(): RazorpayCredentials {
  const mode = getRazorpayMode();

  if (mode === 'test') {
    return {
      mode,
      keyId: process.env.RAZORPAY_TEST_KEY_ID || '',
      keySecret: process.env.RAZORPAY_TEST_KEY_SECRET || '',
      webhookSecret:
        process.env.RAZORPAY_TEST_WEBHOOK_SECRET ||
        process.env.RAZORPAY_WEBHOOK_SECRET ||
        '',
      planIds: {
        pro: process.env.RAZORPAY_TEST_PLAN_ID_PRO || '',
        max: process.env.RAZORPAY_TEST_PLAN_ID_MAX || '',
      },
    };
  }

  return {
    mode: 'live',
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    planIds: {
      pro: process.env.RAZORPAY_PLAN_ID_PRO || '',
      max: process.env.RAZORPAY_PLAN_ID_MAX || '',
    },
  };
}

export function getRazorpayPlanIds() {
  return getRazorpayCredentials().planIds;
}
