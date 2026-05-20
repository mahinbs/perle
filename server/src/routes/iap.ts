import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

async function verifyReceiptWithApple(receipt: string): Promise<any> {
  const secret = process.env.APPLE_IAP_SHARED_SECRET;
  const payload = {
    'receipt-data': receipt,
    ...(secret ? { password: secret } : {})
  };

  console.log('Sending receipt to Apple Production Verification...');
  // Try production first
  let response = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Apple Production API error: ${response.statusText}`);
  }

  let data = await response.json();

  // If status is 21007, it's a sandbox receipt sent to production, try sandbox
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

router.post('/payment/iap/verify', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const iapSchema = z.object({
      receipt: z.string(),
      productId: z.string(),
      plan: z.enum(['pro', 'max']),
      transactionId: z.string().optional()
    });

    const parseResult = iapSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: parseResult.error.flatten().fieldErrors
      });
    }

    const { receipt, productId, plan, transactionId } = parseResult.data;

    console.log(`Verifying Apple receipt for user: ${req.userId}, product: ${productId}, plan: ${plan}`);

    // Verify receipt with Apple
    const appleResponse = await verifyReceiptWithApple(receipt);

    if (appleResponse.status !== 0) {
      console.error(`Apple receipt verification failed. Status code: ${appleResponse.status}`);
      return res.status(400).json({
        error: `Receipt verification failed. Apple status code: ${appleResponse.status}`
      });
    }

    // Parse receipt and find matching/active transactions
    // latest_receipt_info holds auto-renewable subscription transaction details
    const latestReceiptInfo = appleResponse.latest_receipt_info || appleResponse.receipt?.in_app;

    if (!latestReceiptInfo || !Array.isArray(latestReceiptInfo) || latestReceiptInfo.length === 0) {
      return res.status(400).json({ error: 'No transaction history found in receipt' });
    }

    // Filter transactions for this specific product ID
    const productTransactions = latestReceiptInfo.filter(
      (tx: any) => tx.product_id === productId
    );

    if (productTransactions.length === 0) {
      return res.status(400).json({
        error: `No transaction found in receipt matching product ID: ${productId}`
      });
    }

    // Sort by expires_date_ms descending to find the latest transaction
    const latestTx = productTransactions.sort((a: any, b: any) => {
      const timeA = parseInt(a.expires_date_ms || '0');
      const timeB = parseInt(b.expires_date_ms || '0');
      return timeB - timeA;
    })[0];

    const purchaseDateMs = parseInt(latestTx.purchase_date_ms);
    const expiresDateMs = parseInt(latestTx.expires_date_ms || '0');
    const nowMs = Date.now();

    // Check if the subscription is still active (not expired)
    // If expiresDateMs is 0 (non-consumable) or expiresDateMs > nowMs, it's active.
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

    // Update user profile in database using the generic fields
    const { error: dbError } = await supabase
      .from('user_profiles')
      .update({
        premium_tier: plan,
        is_premium: true,
        subscription_status: 'active',
        subscription_start_date: startDate,
        subscription_end_date: endDate,
        subscription_id: finalTransactionId,
        updated_at: new Date().toISOString()
      } as any)
      .eq('user_id', req.userId);

    if (dbError) {
      console.error('Database update error during IAP verification:', dbError);
      return res.status(500).json({ error: 'Failed to update user subscription in database' });
    }

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
