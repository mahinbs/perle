import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { verifyGooglePlaySubscription } from '../utils/googlePlayVerification.js';

const router = Router();

async function verifyReceiptWithApple(receipt: string): Promise<any> {
  const secret = process.env.APPLE_IAP_SHARED_SECRET;
  const payload = {
    'receipt-data': receipt,
    ...(secret ? { password: secret } : {})
  };

  console.log('Sending receipt to Apple Production Verification...');
  let response = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Apple Production API error: ${response.statusText}`);
  }

  let data = await response.json();

  if (data.status === 21007) {
    console.log('Sandbox receipt detected (21007). Re-verifying with Apple Sandbox...');
    response = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Apple Sandbox API error: ${response.statusText}`);
    }

    data = await response.json();
  }

  return data;
}

async function activateSubscription(
  userId: string,
  plan: 'pro' | 'max',
  startDate: string,
  endDate: string | null,
  transactionId: string
) {
  const { error: dbError } = await supabase
    .from('user_profiles')
    .update({
      premium_tier: plan,
      is_premium: true,
      subscription_status: 'active',
      subscription_start_date: startDate,
      subscription_end_date: endDate,
      subscription_id: transactionId,
      updated_at: new Date().toISOString()
    } as any)
    .eq('user_id', userId);

  if (dbError) {
    throw new Error('Failed to update user subscription in database');
  }
}

router.post('/payment/iap/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const iapSchema = z.object({
      receipt: z.string(),
      productId: z.string(),
      plan: z.enum(['pro', 'max']),
      transactionId: z.string().optional(),
      platform: z.enum(['ios', 'android']).optional()
    });

    const parseResult = iapSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: parseResult.error.flatten().fieldErrors
      });
    }

    const { receipt, productId, plan, transactionId, platform = 'ios' } = parseResult.data;

    if (platform === 'android') {
      console.log(`Verifying Google Play purchase for user: ${req.userId}, product: ${productId}, plan: ${plan}`);

      const googleResult = await verifyGooglePlaySubscription(receipt, productId);

      if (!googleResult.isActive) {
        return res.status(400).json({
          error: 'Subscription has expired',
          expiredAt: googleResult.endDate
        });
      }

      await activateSubscription(
        req.userId,
        plan,
        googleResult.startDate,
        googleResult.endDate,
        googleResult.transactionId || transactionId || `gplay_${Date.now()}`
      );

      console.log(`Google Play IAP verified successfully for user ${req.userId}. Upgraded to tier ${plan}`);

      return res.json({
        success: true,
        message: 'Google Play purchase verified and subscription activated successfully',
        tier: plan,
        subscriptionEndDate: googleResult.endDate
      });
    }

    console.log(`Verifying Apple receipt for user: ${req.userId}, product: ${productId}, plan: ${plan}`);

    const appleResponse = await verifyReceiptWithApple(receipt);

    if (appleResponse.status !== 0) {
      console.error(`Apple receipt verification failed. Status code: ${appleResponse.status}`);
      return res.status(400).json({
        error: `Receipt verification failed. Apple status code: ${appleResponse.status}`
      });
    }

    const latestReceiptInfo = appleResponse.latest_receipt_info || appleResponse.receipt?.in_app;

    if (!latestReceiptInfo || !Array.isArray(latestReceiptInfo) || latestReceiptInfo.length === 0) {
      return res.status(400).json({ error: 'No transaction history found in receipt' });
    }

    const productTransactions = latestReceiptInfo.filter(
      (tx: any) => tx.product_id === productId
    );

    if (productTransactions.length === 0) {
      return res.status(400).json({
        error: `No transaction found in receipt matching product ID: ${productId}`
      });
    }

    const latestTx = productTransactions.sort((a: any, b: any) => {
      const timeA = parseInt(a.expires_date_ms || '0');
      const timeB = parseInt(b.expires_date_ms || '0');
      return timeB - timeA;
    })[0];

    const purchaseDateMs = parseInt(latestTx.purchase_date_ms);
    const expiresDateMs = parseInt(latestTx.expires_date_ms || '0');
    const nowMs = Date.now();
    const isActive = expiresDateMs === 0 || expiresDateMs > nowMs;

    if (!isActive) {
      return res.status(400).json({
        error: 'Subscription has expired',
        expiredAt: new Date(expiresDateMs).toISOString()
      });
    }

    const startDate = new Date(purchaseDateMs).toISOString();
    const endDate = expiresDateMs > 0 ? new Date(expiresDateMs).toISOString() : null;
    const finalTransactionId = latestTx.transaction_id || transactionId || `iap_${Date.now()}`;

    await activateSubscription(req.userId, plan, startDate, endDate, finalTransactionId);

    console.log(`IAP verified successfully for user ${req.userId}. Upgraded to tier ${plan}`);

    res.json({
      success: true,
      message: 'In-App Purchase verified and subscription activated successfully',
      tier: plan,
      subscriptionEndDate: endDate
    });

  } catch (error: any) {
    console.error('IAP verification exception:', error);
    res.status(500).json({
      error: 'Receipt verification failed due to an internal server error',
      message: error.message
    });
  }
});

export default router;
