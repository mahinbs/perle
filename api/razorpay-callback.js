/**
 * Vercel serverless handler for Razorpay callback_url POSTs to /payment/callback.
 * Static SPA hosting returns HTTP 405 for POST; this accepts POST/GET and
 * 303-redirects to /payment/complete (SPA) with query params as GET.
 *
 * Docs: https://razorpay.com/docs/payments/payment-gateway/callback-url/
 */
module.exports = (req, res) => {
  const params = new URLSearchParams();
  const sources = [req.body || {}, req.query || {}];

  for (const key of [
    'razorpay_payment_id',
    'razorpay_subscription_id',
    'razorpay_order_id',
    'razorpay_signature',
    'error',
    'error[code]',
    'error[description]',
  ]) {
    for (const src of sources) {
      const value = src[key];
      if (typeof value === 'string' && value.trim()) {
        params.set(key, value.trim());
        break;
      }
    }
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.syntraiq.ai';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const qs = params.toString();
  // Different path than /payment/callback so we don't loop through this function.
  const target = `${proto}://${host}/payment/complete${qs ? `?${qs}` : ''}`;

  res.statusCode = 303;
  res.setHeader('Location', target);
  res.end();
};
