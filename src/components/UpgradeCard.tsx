import React, { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { FaCheck } from "react-icons/fa";
import { Capacitor } from "@capacitor/core";
import { isAuthenticated, verifyToken } from "../utils/auth";
import { useToast } from "../contexts/ToastContext";
import { restoreRazorpaySubscription } from "../services/razorpayService";
import { IAPService } from "../services/iapService";

const usesRazorpay = () => {
  if (!Capacitor.isNativePlatform()) return true;
  return Capacitor.getPlatform() === "android";
};

const isIOSIAPPlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

export const UpgradeCard: React.FC = () => {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const [restoring, setRestoring] = useState(false);

  const features = [
    "Access to all AI models — GPT-4o, Claude, Gemini, Grok & more",
    "20 messages of deep conversation memory (vs 5 on Free)",
    "Unlimited image generation (vs 3/day on Free)",
    "Video generation — up to 6 videos/day on Pro, 12/day on Max",
    "Longer search conversation history — 50 messages retained",
    "20 MB file uploads in chat & search (images, PDFs, docs)",
    "Unlimited saved Spaces & prompts",
    "Toggle auto-renewal anytime",
  ];

  const handleRestore = async () => {
    if (!isAuthenticated()) {
      showToast({
        message: "Please log in to restore your subscription.",
        type: "info",
        duration: 4000,
      });
      navigateTo("/profile", { mode: "login", returnTo: "/subscription" });
      return;
    }

    setRestoring(true);
    try {
      if (isIOSIAPPlatform()) {
        const iap = IAPService.getInstance();
        await iap.initialize();
        const txs = await iap.restorePurchases();
        if (!txs?.length) {
          showToast({ message: "No active subscription found.", type: "info" });
          return;
        }
        await verifyToken();
        showToast({ message: "Subscription restored!", type: "success" });
        return;
      }

      if (usesRazorpay()) {
        const status = await restoreRazorpaySubscription();
        await verifyToken();
        if (status.isPremium) {
          showToast({ message: "Subscription restored!", type: "success" });
        } else {
          showToast({ message: "No active subscription found.", type: "info" });
        }
        return;
      }

      showToast({ message: "Restore is not available on this platform.", type: "info" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Restore failed";
      showToast({ message, type: "error" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "var(--font-lg)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Upgrade to{" "}
            <span style={{ color: "var(--accent)" }}>SyntraIQ Pro</span> or{" "}
            <span style={{ color: "var(--accent)" }}>Max</span>
          </div>
          <div className="sub" style={{ fontSize: "var(--font-sm)" }}>
            Unlock the full power of SyntraIQ
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {features.map((feature, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                fontSize: "var(--font-sm)",
                color: "var(--text)",
              }}
            >
              <FaCheck
                size={14}
                style={{
                  color: "var(--accent)",
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
              <span style={{ lineHeight: 1.5 }}>{feature}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn-ghost"
          onClick={() => void handleRestore()}
          disabled={restoring}
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--sub)",
            textDecoration: "underline",
            fontSize: "var(--font-sm)",
            fontWeight: 400,
            justifyContent: "flex-start",
            minHeight: "auto",
            cursor: restoring ? "wait" : "pointer",
            opacity: restoring ? 0.7 : 1,
          }}
        >
          {restoring ? "Restoring…" : "Restore subscription"}
        </button>

        <button
          className="btn btn-strong"
          onClick={() => navigateTo("/subscription")}
          style={{
            width: "100%",
            background: "#111111",
            color: "#FFFFFF",
            padding: "16px 24px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-md)",
            border: "none",
            cursor: "pointer",
            transition: "all 0.2s ease",
            minHeight: "var(--touch-target)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#2A2A2A";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#111111";
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "scale(0.98)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          View Plans
        </button>
      </div>
    </div>
  );
};
