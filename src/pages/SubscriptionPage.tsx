import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { IoClose } from "react-icons/io5";
import { FaCheck, FaTimes } from "react-icons/fa";
import { Capacitor } from "@capacitor/core";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { authenticatedFetch, getAuthHeaders, getUserData, verifyToken, isAuthenticated } from "../utils/auth";
import { useToast } from "../contexts/ToastContext";
import { IAPService, IAP_PRODUCT_IDS, type IAPPlanId } from "../services/iapService";
import { startRazorpaySubscription, restoreRazorpaySubscription, toggleRazorpayAutoRenew, cancelRazorpaySubscription, type RazorpayPlanId } from "../services/razorpayService";

const plans = [
  {
    id: "pro",
    name: "Upgrade to IQ Pro",
    shortName: "IQ Pro",
    price: "₹399/mo",
    description:
      "For creators and power users who need faster answers, more memory, and richer content creation.",
    perks: [
      { text: "All AI models — GPT-4o, Claude, Gemini, Grok & more", included: true },
      { text: "20 messages of deep conversation memory", included: true },
      { text: "Unlimited image generation", included: true },
      { text: "Video generation — up to 6 videos/day", included: true },
      { text: "Unlimited saved Spaces & prompts", included: true },
      { text: "20 MB file uploads (images, PDFs, docs)", included: true },
      { text: "50 messages retained per search conversation", included: true },
      { text: "Toggle auto-renewal anytime", included: true },
    ],
    cta: "Get IQ Pro",
    highlighted: false,
    tier: 'pro'
  },
  {
    id: "max",
    name: "Upgrade to IQ Max",
    shortName: "IQ Max",
    price: "₹899/mo",
    description:
      "Built for teams and power users who demand the absolute highest limits and premium support.",
    perks: [
      { text: "Everything in IQ Pro", included: true },
      { text: "All AI models — including latest releases", included: true },
      { text: "Unlimited image generation", included: true },
      { text: "Video generation — up to 12 videos/day (2× Pro)", included: true },
      { text: "Unlimited saved Spaces & prompts", included: true },
      { text: "20 MB file uploads (images, PDFs, docs)", included: true },
      { text: "50 messages retained per search conversation", included: true },
      { text: "Priority access & support", included: true },
    ],
    cta: "Get IQ Max",
    highlighted: true,
    tier: 'max'
  },
];

const isIOSIAPPlatform = () => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
};

const usesRazorpay = () => {
  if (!Capacitor.isNativePlatform()) return true;
  return Capacitor.getPlatform() === 'android';
};

async function verifyIAPPurchase(
  transaction: { receipt: string; productId: string; transactionId: string },
  planId: IAPPlanId
) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
  const response = await authenticatedFetch(`${API_URL}/api/payment/iap/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      receipt: transaction.receipt,
      productId: transaction.productId,
      plan: planId,
      transactionId: transaction.transactionId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Server receipt verification failed');
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Verification failed');
  }

  return data;
}

export default function SubscriptionPage() {
  const { goBack, state: navState, navigateTo } = useRouterNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPlanId = searchParams.get("plan") || plans[0].id;
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();
  const [authUser, setAuthUser] = useState(getUserData());
  const [autoRenew, setAutoRenew] = useState(true);
  const [managing, setManaging] = useState(false);
  const [hasRazorpaySub, setHasRazorpaySub] = useState(false);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const isCurrentPlan = authUser?.premiumTier === selectedPlan.tier;
  const isPremiumUser = Boolean(authUser?.isPremium && authUser?.premiumTier && authUser.premiumTier !== "free");

  const [displayPrices, setDisplayPrices] = useState<Record<string, string>>({
    pro: "₹399/mo",
    max: "₹899/mo"
  });

  useEffect(() => {
    if (!isAuthenticated()) {
      setAuthUser(null);
      return;
    }
    void verifyToken().then((user) => {
      if (user) setAuthUser(user);
    });
    if (usesRazorpay()) {
      void restoreRazorpaySubscription()
        .then((status) => {
          setAutoRenew(status.autoRenew !== false);
          setHasRazorpaySub(Boolean(status.subscriptionId) || status.isPremium);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }, []);

  useEffect(() => {
    if (isIOSIAPPlatform()) {
      const iapService = IAPService.getInstance();
      iapService.initialize().then(canPay => {
        if (canPay) {
          iapService.loadProducts([IAP_PRODUCT_IDS.pro, IAP_PRODUCT_IDS.max])
            .then(products => {
              const prices: Record<string, string> = {};
              products.forEach(p => {
                const key = p.id.includes('max') ? 'max' : 'pro';
                prices[key] = `${p.displayPrice}/mo`;
              });
              if (Object.keys(prices).length > 0) {
                setDisplayPrices(prev => ({ ...prev, ...prices }));
              }
            })
            .catch(err => {
              console.error('Error loading App Store products:', err);
            });
        }
      });
    }
  }, []);

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success) {
      verifyToken().then((user) => {
        if (user) setAuthUser(user);
        const tierLabel =
          user?.premiumTier === 'max'
            ? 'IQ Max'
            : user?.premiumTier === 'pro'
              ? 'IQ Pro'
              : 'premium';
        showToast({
          message: `Subscription successful! Welcome to ${tierLabel}.`,
          type: "success",
          duration: 5000
        });
      });
      setSearchParams({}, { replace: true });
    }

    if (canceled) {
      showToast({
        message: "Subscription canceled. No charges were made.",
        type: "info",
        duration: 5000
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, showToast, setSearchParams]);

  const handleUpgrade = async () => {
    if (isCurrentPlan) return;

    if (!isAuthenticated()) {
      showToast({
        message: "Please log in to purchase a subscription.",
        type: "info",
        duration: 4000,
      });
      navigateTo("/profile", { mode: "login", returnTo: "/subscription" }, { replace: true });
      return;
    }

    try {
      setIsLoading(true);

      if (isIOSIAPPlatform()) {
        const iapService = IAPService.getInstance();
        const planId = selectedPlanId as IAPPlanId;
        const productId = iapService.getProductIdForPlan(planId);

        showToast({ message: 'Initiating App Store purchase...', type: "info" });
        const result = await iapService.purchase(productId);

        if (result.success && result.transaction) {
          showToast({ message: 'Verifying purchase with App Store...', type: "info" });
          await verifyIAPPurchase(result.transaction, planId);

          showToast({
            message: "Subscription successful! Welcome to premium.",
            type: "success",
            duration: 5000
          });
          await verifyToken().then((user) => {
            if (user) setAuthUser(user);
          });
        } else if (result.userCancelled) {
          showToast({ message: "Purchase cancelled.", type: "info" });
        } else if (result.pending) {
          showToast({ message: "Purchase is pending approval.", type: "info" });
        } else {
          throw new Error(result.error?.message || 'Purchase failed');
        }
      } else if (usesRazorpay()) {
        const result = await startRazorpaySubscription(selectedPlanId as RazorpayPlanId);

        if (result.redirecting) {
          // Full-page redirect to Razorpay — leave loading state until navigation completes
          return;
        }

        if (result.success) {
          const tierLabel =
            result.tier === 'max'
              ? 'IQ Max'
              : result.tier === 'pro'
                ? 'IQ Pro'
                : selectedPlan.shortName;
          showToast({
            message: `Subscription successful! Welcome to ${tierLabel}.`,
            type: "success",
            duration: 5000
          });
          await verifyToken().then((user) => {
            if (user) setAuthUser(user);
          });
        } else if (result.userCancelled) {
          showToast({ message: "Payment cancelled.", type: "info" });
        } else {
          throw new Error(result.error || 'Payment failed');
        }
      }
    } catch (error: any) {
      console.error('Upgrade error:', error);
      showToast({
        message: error.message || 'An error occurred during upgrade. Please try again.',
        type: "error",
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    showToast({ message: "Checking for active subscriptions...", type: "info" });

    if (isIOSIAPPlatform()) {
      try {
        const iapService = IAPService.getInstance();
        const transactions = await iapService.restorePurchases();

        if (transactions && transactions.length > 0) {
          const latestTx = transactions.sort((a, b) => b.purchaseDate - a.purchaseDate)[0];
          const plan: IAPPlanId = latestTx.productId.includes('max') ? 'max' : 'pro';

          showToast({ message: "Syncing purchase with server...", type: "info" });
          await verifyIAPPurchase(latestTx, plan);

          showToast({ message: "Subscription restored successfully!", type: "success" });
          await verifyToken().then((user) => {
            if (user) setAuthUser(user);
          });
          return;
        }

        showToast({ message: "No active App Store subscription found.", type: "info" });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Restore failed';
        console.error('Restore error:', e);
        showToast({ message: `Restore failed: ${message}`, type: "error" });
      }
      return;
    }

    if (usesRazorpay()) {
      try {
        const status = await restoreRazorpaySubscription();
        await verifyToken().then((user) => {
          if (user) setAuthUser(user);
        });
        if (status.isPremium) {
          showToast({ message: "Subscription restored!", type: "success" });
        } else {
          showToast({ message: "No active subscription found.", type: "info" });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Restore failed';
        console.error('Restore error:', e);
        showToast({ message: `Restore failed: ${message}`, type: "error" });
      }
      return;
    }

    verifyToken().then((updatedUser) => {
      if (updatedUser) setAuthUser(updatedUser);
      if (updatedUser?.isPremium) {
        showToast({ message: "Subscription restored!", type: "success" });
      } else {
        showToast({ message: "No active subscription found.", type: "info" });
      }
    });
  };

  const handleToggleAutoRenew = async () => {
    if (!usesRazorpay() || !isPremiumUser) return;
    const next = !autoRenew;
    setManaging(true);
    try {
      const result = await toggleRazorpayAutoRenew(next);
      setAutoRenew(result.autoRenew);
      showToast({
        message: next
          ? "Auto-renewal enabled."
          : "Auto-renewal paused. Access continues until the period ends.",
        type: "success",
      });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed to update auto-renew",
        type: "error",
      });
    } finally {
      setManaging(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!usesRazorpay() || !isPremiumUser) return;
    const ok = window.confirm(
      "Cancel your subscription? You’ll keep premium until the current period ends, then it won’t renew."
    );
    if (!ok) return;
    setManaging(true);
    try {
      await cancelRazorpaySubscription();
      setAutoRenew(false);
      await verifyToken().then((user) => {
        if (user) setAuthUser(user);
      });
      showToast({
        message: "Subscription cancelled. Access continues until the end of the billing period.",
        type: "success",
        duration: 5000,
      });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Failed to cancel subscription",
        type: "error",
      });
    } finally {
      setManaging(false);
    }
  };

  const handleClose = () => {
    if (navState?.fromAuthRedirect) {
      navigateTo("/app", undefined, { replace: true });
      return;
    }

    if (navState?.returnTo) {
      navigateTo(navState.returnTo, undefined, { replace: true });
      return;
    }

    if (navState?.limitReached) {
      navigateTo("/app", undefined, { replace: true });
      return;
    }

    goBack();
  };

  return (
    <div className="fixed inset-0 bg-[var(--bg)] text-[var(--text)] z-50 flex flex-col p-4 pt-[calc(16px+var(--safe-area-top))] pb-[calc(16px+var(--safe-area-bottom))]">
      {/* Top Bar */}
      <div className="flex justify-start mb-6">
        <button
          onClick={handleClose}
          className="bg-transparent border-none text-[var(--text)] cursor-pointer p-0"
        >
          <IoClose size={28} />
        </button>
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        {navState?.limitReached && (
          <div
            className="glass-card border border-[var(--accent)] rounded-xl p-4 mb-4 text-sm"
            style={{ color: "var(--text)" }}
          >
            {navState.message ||
              "You have reached your free limit. Upgrade to IQ Pro or IQ Max to continue."}
          </div>
        )}
        <h1 className="h1 justify-center mb-3 text-[40px] tracking-[-1px]">
          Syntra<span className="text-gold">IQ</span>
        </h1>
        <p className="sub text-[var(--font-md)] font-medium leading-[1.4]">
          {selectedPlan.description}
        </p>
      </div>

      {/* Features List — Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-2 pb-[280px]">
          {selectedPlan.perks.map((perk, index) => (
            <div key={index} className="flex items-start gap-4 text-[var(--font-md)]">
              {perk.included ? (
                <FaCheck
                  size={16}
                  className="min-w-[16px] mt-[3px]"
                  style={{ color: "var(--accent)", flexShrink: 0 }}
                />
              ) : (
                <FaTimes
                  size={16}
                  className="min-w-[16px] mt-[3px]"
                  style={{ color: "var(--border)", flexShrink: 0 }}
                />
              )}
              <span
                style={{
                  lineHeight: 1.5,
                  color: perk.included ? "var(--text)" : "var(--sub)",
                }}
              >
                {perk.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Actions Sheet */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-6 pb-[calc(16px+var(--safe-area-bottom))] bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent z-10 flex flex-col gap-4">
        {/* Plan Selector */}
        <div className="grid grid-cols-2 gap-2">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            const isUserPlan = authUser?.premiumTier === plan.tier;

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`flex-none w-full border rounded-[18px] p-4 cursor-pointer flex flex-col justify-between h-[130px] transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.05)] ${isSelected
                  ? "border-2 !border-[var(--text)] bg-[var(--card)]"
                  : "border border-[var(--border)] bg-[var(--card)]"
                  }`}
              >
                <div className="flex flex-col">
                  <div className="font-bold text-[var(--font-lg)] leading-[1.2]">
                    {plan.shortName}
                  </div>
                  {isUserPlan && (
                    <span className="text-[10px] text-gold font-bold uppercase tracking-wider mt-1">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className="text-[var(--font-md)] opacity-80 font-medium">
                  {displayPrices[plan.id] || plan.price}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <button
          className="btn w-full rounded-full h-14 text-[var(--font-lg)] shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
          onClick={handleUpgrade}
          disabled={isLoading || isCurrentPlan}
          style={{
            background: isCurrentPlan ? "var(--card)" : "var(--text)",
            color: isCurrentPlan ? "var(--sub)" : "var(--bg)",
            cursor: (isLoading || isCurrentPlan) ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.7 : 1,
            border: isCurrentPlan ? "1px solid var(--border)" : "none",
          }}
        >
          {isLoading ? "Processing..." : isCurrentPlan ? "Current Plan" : selectedPlan.cta}
        </button>

        {/* Manage Razorpay subscription (web / Android) */}
        {usesRazorpay() && isPremiumUser && hasRazorpaySub && (
          <div
            className="glass-card"
            style={{
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              borderRadius: 14,
            }}
          >
            <div className="sub text-sm" style={{ textAlign: "center" }}>
              Manage subscription
            </div>
            <button
              type="button"
              className="btn-ghost glass-button"
              disabled={managing}
              onClick={() => void handleToggleAutoRenew()}
              style={{
                minHeight: 44,
                borderRadius: 999,
                opacity: managing ? 0.7 : 1,
              }}
            >
              {autoRenew ? "Pause auto-renewal" : "Enable auto-renewal"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={managing}
              onClick={() => void handleCancelSubscription()}
              style={{
                minHeight: 44,
                borderRadius: 999,
                color: "#c0392b",
                opacity: managing ? 0.7 : 1,
              }}
            >
              Cancel subscription
            </button>
          </div>
        )}

        {/* Restore link */}
        <button
          className="text-center text-[var(--sub)] underline text-[var(--font-sm)] bg-transparent border-none cursor-pointer"
          onClick={handleRestore}
          disabled={isLoading || managing}
        >
          Restore subscription
        </button>
      </div>
    </div>
  );
}
