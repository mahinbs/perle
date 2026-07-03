import { useEffect, useState } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { verifyRazorpaySubscription } from '../services/razorpayService';
import { verifyToken } from '../utils/auth';

export default function PaymentCallbackPage() {
  const { navigateTo } = useRouterNavigation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const razorpay_payment_id = params.get('razorpay_payment_id');
        const razorpay_subscription_id = params.get('razorpay_subscription_id');
        const razorpay_signature = params.get('razorpay_signature');

        if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
          throw new Error('Payment was not completed. Please try again.');
        }

        await verifyRazorpaySubscription({
          razorpay_payment_id,
          razorpay_subscription_id,
          razorpay_signature,
        });

        await verifyToken();
        navigateTo('/subscription?success=1', undefined, { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Payment verification failed');
      }
    };

    void run();
  }, [navigateTo]);

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: 24, maxWidth: 420, margin: '0 auto' }}>
          <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>
          <button className="btn" type="button" onClick={() => navigateTo('/subscription')}>
            Back to subscription
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2px solid var(--accent)',
          borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <div className="sub">Confirming your payment…</div>
    </div>
  );
}
