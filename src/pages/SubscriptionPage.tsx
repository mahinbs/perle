import { useState, useEffect } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { useToast } from '../contexts/ToastContext';
import { getUserData, getAuthHeaders } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SubscriptionPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    tier: string;
    status: string;
    isActive: boolean;
    subscriptionEndDate: string | null;
    autoRenew: boolean;
    subscriptionId: string | null;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);

  useEffect(() => {
    const user = getUserData();
    setIsAuthenticated(!!user);
    
    if (user) {
      loadSubscriptionStatus();
    }

    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    // Check if plan is specified in URL
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    if (planParam === 'pro' || planParam === 'max') {
      // Auto-trigger subscription for the specified plan after a short delay
      setTimeout(() => {
        handleSubscribe(planParam as 'pro' | 'max');
      }, 1000);
    }

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const loadSubscriptionStatus = async () => {
    if (!API_URL) {
      console.error('API_URL is not configured');
      return;
    }
    
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_URL}/api/payment/subscription`, {
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      } else {
        // If not authenticated or no subscription, that's okay
        if (response.status !== 401 && response.status !== 404) {
          console.error('Failed to load subscription status:', response.status);
        }
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  };

  const handleSubscribe = async (plan: 'pro' | 'max') => {
    if (!isAuthenticated) {
      showToast({
        message: 'Please login to subscribe',
        type: 'error',
        duration: 3000
      });
      navigateTo('/profile');
      return;
    }

    if (!API_URL) {
      showToast({
        message: 'API URL not configured. Please set VITE_API_URL in your .env file.',
        type: 'error',
        duration: 5000
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      
      // Create subscription (with auto-renewal)
      const subscriptionResponse = await fetch(`${API_URL}/api/payment/create-subscription`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          plan,
          autoRenew: autoRenew
        })
      });

      if (!subscriptionResponse.ok) {
        throw new Error('Failed to create subscription');
      }

      const subscriptionData = await subscriptionResponse.json();

      // Show proration info if applicable
      if (subscriptionData.proratedAmount && subscriptionData.unusedLowerPlanValue) {
        showToast({
          message: `Upgrade: You'll be charged ₹${(subscriptionData.amount / 100).toFixed(2)}. A refund of ₹${(subscriptionData.unusedLowerPlanValue / 100).toFixed(2)} (unused lower plan value) will be processed.`,
          type: 'info',
          duration: 8000
        });
      }

      // Function to open subscription checkout
      const openSubscriptionCheckout = () => {
        // Initialize Razorpay checkout for subscription
        const options = {
          key: subscriptionData.keyId,
          subscription_id: subscriptionData.subscriptionId,
          name: 'Perlé',
          description: plan === 'pro' ? 'IQ Pro Monthly Subscription' : 'IQ Max Monthly Subscription',
          handler: async function (response: any) {
          // Verify subscription payment
          try {
            const verifyResponse = await fetch(`${API_URL}/api/payment/verify-subscription`, {
              method: 'POST',
              headers: {
                ...headers,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            if (verifyResponse.ok) {
              showToast({
                message: `Subscription activated successfully! ${autoRenew ? 'Auto-renewal is enabled.' : 'Auto-renewal is disabled.'}`,
                type: 'success',
                duration: 5000
              });
              await loadSubscriptionStatus();
              // Refresh user data
              window.location.reload();
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (error) {
            console.error('Payment verification error:', error);
            showToast({
              message: 'Payment verification failed. Please contact support.',
              type: 'error',
              duration: 5000
            });
          }
        },
        prefill: {
          email: getUserData()?.email || '',
          name: getUserData()?.name || ''
        },
        theme: {
          color: '#C7A869'
        },
        modal: {
          ondismiss: function() {
            setIsLoading(false);
          }
        }
      };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
        razorpay.on('payment.failed', function (_response: any) {
          showToast({
            message: 'Payment failed. Please try again.',
            type: 'error',
            duration: 5000
          });
          setIsLoading(false);
        });
      };

      // Open subscription checkout
      openSubscriptionCheckout();
    } catch (error: any) {
      console.error('Subscription error:', error);
      showToast({
        message: error.message || 'Failed to initiate payment',
        type: 'error',
        duration: 5000
      });
      setIsLoading(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!subscriptionStatus?.isActive) {
      showToast({
        message: 'No active subscription to update',
        type: 'error',
        duration: 3000
      });
      return;
    }

    const newAutoRenew = !subscriptionStatus.autoRenew;
    setIsLoading(true);

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_URL}/api/payment/toggle-auto-renew`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ autoRenew: newAutoRenew })
      });

      if (response.ok) {
        showToast({
          message: `Auto-renewal ${newAutoRenew ? 'enabled' : 'disabled'}`,
          type: 'success',
          duration: 3000
        });
        await loadSubscriptionStatus();
      } else {
        throw new Error('Failed to update auto-renewal');
      }
    } catch (error: any) {
      showToast({
        message: error.message || 'Failed to update auto-renewal setting',
        type: 'error',
        duration: 3000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const plans = [
    {
      id: 'pro' as const,
      name: 'IQ Pro',
      price: '₹399',
      period: '/mo',
      description: 'Perfect for creators and strategists who need faster answers, longer conversations, and richer exports.',
      features: [
        'Priority access to all AI models',
        'Unlimited saved Spaces and prompts',
        'Advanced file analysis up to 200 MB',
        'All premium AI models (GPT, Grok, Gemini)',
        '5 file uploads per search',
        'Extended conversation history'
      ],
      popular: false
    },
    {
      id: 'max' as const,
      name: 'IQ Max',
      price: '₹899',
      period: '/mo',
      description: 'Built for teams running mission-critical workflows with the highest limits and premium support.',
      features: [
        'Everything in IQ Pro, plus:',
        'Highest message and upload limits',
        'Real-time collaboration in shared Spaces',
        'White-glove onboarding & priority support',
        'Advanced analytics and insights',
        'Custom integrations available',
        'Dedicated account manager'
      ],
      popular: true
    }
  ];

  if (!isAuthenticated) {
    return (
      <div style={{ padding: '24px', maxWidth: 600, margin: '0 auto' }}>
        <button
          className="btn-ghost"
          onClick={() => navigateTo('/')}
          style={{ marginBottom: 24 }}
        >
          ← Back
        </button>
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>Login Required</h2>
          <p style={{ marginBottom: 24, color: 'var(--sub)' }}>
            Please login to view subscription plans
          </p>
          <button
            className="btn"
            onClick={() => navigateTo('/profile')}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <button
        className="btn-ghost"
        onClick={() => navigateTo('/')}
        style={{ marginBottom: 24 }}
      >
        ← Back
      </button>

      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1 style={{ marginBottom: 12 }}>Choose your plan</h1>
        <p style={{ color: 'var(--sub)', fontSize: 'var(--font-md)' }}>
          Unlock more power with Perlé. Pick the plan that matches your pace today—change or cancel anytime.
        </p>
      </div>

      {subscriptionStatus?.isActive && (
        <div className="card" style={{ padding: 16, marginBottom: 24, background: 'var(--accent)', color: '#111' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>Active Subscription: {subscriptionStatus.tier === 'pro' ? 'IQ Pro' : 'IQ Max'}</strong>
                {subscriptionStatus.subscriptionEndDate && (
                  <div style={{ fontSize: 'var(--font-sm)', marginTop: 4 }}>
                    {subscriptionStatus.autoRenew 
                      ? `Next billing: ${new Date(subscriptionStatus.subscriptionEndDate).toLocaleDateString()}`
                      : `Expires on: ${new Date(subscriptionStatus.subscriptionEndDate).toLocaleDateString()}`}
                  </div>
                )}
              </div>
              <button
                className="btn-ghost"
                onClick={async () => {
                  if (confirm('Are you sure you want to cancel your subscription?')) {
                    try {
                      const headers = getAuthHeaders();
                      const response = await fetch(`${API_URL}/api/payment/cancel`, {
                        method: 'POST',
                        headers
                      });
                      if (response.ok) {
                        showToast({
                          message: 'Subscription cancelled',
                          type: 'success',
                          duration: 3000
                        });
                        await loadSubscriptionStatus();
                        window.location.reload();
                      }
                    } catch (error) {
                      showToast({
                        message: 'Failed to cancel subscription',
                        type: 'error',
                        duration: 3000
                      });
                    }
                  }
                }}
                style={{ color: '#111' }}
              >
                Cancel
              </button>
            </div>
            
            {/* Auto-renewal Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 4, color: '#111' }}>Auto-renewal</div>
                <div style={{ fontSize: 'var(--font-sm)', opacity: 0.8, color: '#111' }}>
                  {subscriptionStatus.autoRenew 
                    ? 'Your subscription will automatically renew each month'
                    : 'Your subscription will expire at the end of the current period'}
                </div>
              </div>
              <button
                className={`pill ${subscriptionStatus.autoRenew ? 'active' : ''}`}
                onClick={handleToggleAutoRenew}
                disabled={isLoading}
                style={{
                  minWidth: 60,
                  opacity: isLoading ? 0.6 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  marginLeft: 16
                }}
              >
                {isLoading ? '...' : subscriptionStatus.autoRenew ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="card"
            style={{
              padding: 24,
              paddingTop: plan.popular ? 36 : 24,
              position: 'relative',
              border: plan.popular ? '2px solid var(--accent)' : '1px solid var(--border)',
              overflow: 'visible'
            }}
          >
            {plan.popular && (
              <div
                style={{
                  position: 'absolute',
                  top: -12,
                  right: 24,
                  background: 'var(--accent)',
                  color: '#111',
                  padding: '6px 14px',
                  borderRadius: 12,
                  fontSize: 'var(--font-xs)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  boxShadow: '0 2px 8px rgba(199, 168, 105, 0.3)'
                }}
              >
                Most Popular
              </div>
            )}

            <h2 style={{ marginBottom: 8 }}>{plan.name}</h2>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 'var(--font-2xl)', fontWeight: 700 }}>
                {plan.price}
              </span>
              <span style={{ color: 'var(--sub)', marginLeft: 4 }}>{plan.period}</span>
            </div>
            <p style={{ color: 'var(--sub)', marginBottom: 24, fontSize: 'var(--font-sm)' }}>
              {plan.description}
            </p>

            {/* Auto-renewal toggle (only show for users without active subscription) */}
            {!subscriptionStatus?.isActive && (
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 2, fontSize: 'var(--font-sm)' }}>
                      Auto-renewal
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--sub)' }}>
                      {autoRenew 
                        ? 'Automatically charge each month'
                        : 'One-time payment, expires after billing period'}
                    </div>
                  </div>
                  <button
                    className={`pill ${autoRenew ? 'active' : ''}`}
                    onClick={() => setAutoRenew(!autoRenew)}
                    style={{
                      minWidth: 60,
                      marginLeft: 12
                    }}
                  >
                    {autoRenew ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            )}

            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
              {plan.features.map((feature, index) => (
                <li
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 12,
                    fontSize: 'var(--font-sm)'
                  }}
                >
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className="btn"
              onClick={() => handleSubscribe(plan.id)}
              disabled={isLoading || (subscriptionStatus?.isActive && subscriptionStatus.tier === plan.id)}
              style={{
                width: '100%',
                background: plan.popular ? 'var(--accent)' : 'var(--card)',
                color: plan.popular ? '#111' : 'var(--text)',
                border: plan.popular ? 'none' : '1px solid var(--border)'
              }}
            >
              {isLoading
                ? 'Processing...'
                : subscriptionStatus?.isActive && subscriptionStatus.tier === plan.id
                ? 'Current Plan'
                : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

