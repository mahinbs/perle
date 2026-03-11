import React from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { FaCheck } from "react-icons/fa";

export const UpgradeCard: React.FC = () => {
  const { navigateTo } = useRouterNavigation();

  const features = [
    "Access to all AI models — GPT-4o, Claude, Gemini, Grok & more",
    "20 messages of deep conversation memory (vs 5 on Free)",
    "Unlimited image generation (vs 3/day on Free)",
    "Video generation — up to 6 videos/day on Pro, 12/day on Max",
    "Longer search conversation history — 50 messages retained",
    "10 MB file uploads in chat & search (images, PDFs, docs)",
    "Unlimited saved Spaces & prompts",
    "Toggle auto-renewal anytime",
  ];

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

        {/* Features List */}
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

        {/* Restore Subscription Link */}
        <button
          className="btn-ghost"
          onClick={() => console.log("Restore subscription clicked")}
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
            cursor: "pointer",
          }}
        >
          Restore subscription
        </button>

        {/* Upgrade Button */}
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
