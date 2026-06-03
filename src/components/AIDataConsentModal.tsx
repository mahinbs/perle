import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const CONSENT_KEY = "syntraiq_ai_consent_v1";
const CONSENT_SKIPPED_KEY = "syntraiq_ai_consent_skipped_v1";

export function hasAIConsent(): boolean {
  return (
    localStorage.getItem(CONSENT_KEY) === "granted" ||
    localStorage.getItem(CONSENT_SKIPPED_KEY) === "true"
  );
}

export function grantAIConsent(): void {
  localStorage.setItem(CONSENT_KEY, "granted");
}

export function skipAIConsent(): void {
  localStorage.setItem(CONSENT_SKIPPED_KEY, "true");
}

interface AIDataConsentModalProps {
  onAccept: () => void;
}

export function AIDataConsentModal({ onAccept }: AIDataConsentModalProps) {
  const { navigateTo } = useRouterNavigation();
  const [accepting, setAccepting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const handleAccept = () => {
    setAccepting(true);
    grantAIConsent();
    setTimeout(() => {
      onAccept();
    }, 300);
  };

  const handleSkip = () => {
    setSkipping(true);
    skipAIConsent();
    setTimeout(() => {
      onAccept();
    }, 200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "env(safe-area-inset-top, 16px) env(safe-area-inset-right, 24px) env(safe-area-inset-bottom, 16px) env(safe-area-inset-left, 24px)",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "24px",
          /* Responsive width: full on small screens, capped on large screens */
          width: "min(560px, calc(100vw - 48px))",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          padding: "clamp(20px, 4vw, 40px)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          animation: "slideUp 0.25s ease",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "0px",
        }}
      >
        {/* Header row: icon + skip button */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "clamp(12px, 2vw, 20px)",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: "clamp(44px, 8vw, 56px)",
              height: "clamp(44px, 8vw, 56px)",
              borderRadius: "14px",
              background: "rgba(199,168,105,0.12)",
              border: "1px solid rgba(199,168,105,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "clamp(22px, 4vw, 28px)",
              flexShrink: 0,
            }}
          >
            🔒
          </div>

          {/* Skip button — top-right — fixes Apple guideline 2.1(a) */}
          <button
            id="ai-consent-skip-btn"
            onClick={handleSkip}
            disabled={skipping || accepting}
            aria-label="Skip consent screen"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              color: "var(--sub)",
              cursor: "pointer",
              fontSize: "clamp(12px, 2vw, 14px)",
              fontWeight: 600,
              padding: "8px 16px",
              minHeight: "40px",
              minWidth: "64px",
              transition: "all 0.15s ease",
              flexShrink: 0,
              alignSelf: "center",
            }}
          >
            {skipping ? "…" : "Skip"}
          </button>
        </div>

        {/* Title */}
        <h2
          id="consent-modal-title"
          style={{
            fontSize: "clamp(18px, 3.5vw, 24px)",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: "clamp(6px, 1vw, 10px)",
            lineHeight: 1.3,
            margin: "0 0 clamp(6px, 1vw, 10px) 0",
          }}
        >
          Before You Chat with AI
        </h2>

        <p
          style={{
            fontSize: "clamp(13px, 2vw, 15px)",
            color: "var(--sub)",
            marginBottom: "clamp(16px, 2.5vw, 24px)",
            lineHeight: 1.65,
            margin: "0 0 clamp(16px, 2.5vw, 24px) 0",
          }}
        >
          SyntraIQ uses third-party AI services to generate responses. Please
          review how your data is used before continuing.
        </p>

        {/* What data is sent */}
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            padding: "clamp(12px, 2.5vw, 18px) clamp(14px, 2.5vw, 20px)",
            marginBottom: "clamp(10px, 1.5vw, 16px)",
          }}
        >
          <p
            style={{
              fontSize: "clamp(12px, 2vw, 14px)",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: "clamp(8px, 1.5vw, 12px)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "0 0 clamp(8px, 1.5vw, 12px) 0",
            }}
          >
            📤 What data is sent
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "clamp(4px, 1vw, 8px)",
            }}
          >
            {[
              "Your messages and questions",
              "Conversation history (for context)",
              "Files or images you attach",
              "Basic context preferences you've set",
            ].map((item) => (
              <li
                key={item}
                style={{
                  fontSize: "clamp(12px, 2vw, 14px)",
                  color: "var(--text-secondary, var(--sub))",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Who receives it */}
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            padding: "clamp(12px, 2.5vw, 18px) clamp(14px, 2.5vw, 20px)",
            marginBottom: "clamp(16px, 2.5vw, 24px)",
          }}
        >
          <p
            style={{
              fontSize: "clamp(12px, 2vw, 14px)",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: "clamp(8px, 1.5vw, 12px)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              margin: "0 0 clamp(8px, 1.5vw, 12px) 0",
            }}
          >
            🏢 Third-party AI providers who receive your data
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "clamp(8px, 1.5vw, 12px)",
            }}
          >
            {[
              { name: "OpenAI", model: "GPT-4o & GPT-4 Turbo", url: "https://openai.com/privacy" },
              { name: "Anthropic", model: "Claude 3.5 Sonnet & Haiku", url: "https://www.anthropic.com/privacy" },
              { name: "Google", model: "Gemini 1.5 Pro & Flash", url: "https://policies.google.com/privacy" },
              { name: "xAI", model: "Grok", url: "https://x.ai/legal/privacy-policy" },
            ].map((provider) => (
              <div
                key={provider.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "clamp(8px, 2vw, 16px)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "clamp(12px, 2vw, 14px)",
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {provider.name}
                  </span>
                  <span
                    style={{
                      fontSize: "clamp(11px, 1.8vw, 13px)",
                      color: "var(--sub)",
                      marginLeft: 6,
                    }}
                  >
                    · {provider.model}
                  </span>
                </div>
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "clamp(11px, 1.8vw, 13px)",
                    color: "var(--accent)",
                    textDecoration: "underline",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    minHeight: "44px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  Privacy Policy ↗
                </a>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: "clamp(11px, 1.8vw, 12px)",
              color: "var(--sub)",
              marginTop: "clamp(10px, 1.5vw, 14px)",
              lineHeight: 1.55,
              margin: "clamp(10px, 1.5vw, 14px) 0 0 0",
            }}
          >
            ℹ️ SyntraIQ does not sell your data or use it to train AI models.
            Each provider processes data per their own privacy policy.
          </p>
        </div>

        {/* Accept button */}
        <button
          id="ai-consent-accept-btn"
          onClick={handleAccept}
          disabled={accepting || skipping}
          style={{
            width: "100%",
            padding: "clamp(13px, 2vw, 16px) 24px",
            borderRadius: "14px",
            background: accepting
              ? "rgba(199,168,105,0.5)"
              : "var(--accent)",
            color: "#111",
            fontWeight: 700,
            fontSize: "clamp(14px, 2.2vw, 16px)",
            border: "none",
            cursor: accepting || skipping ? "not-allowed" : "pointer",
            marginBottom: "clamp(8px, 1.5vw, 12px)",
            transition: "all 0.2s ease",
            minHeight: "52px",
          }}
        >
          {accepting ? "Saving your preference…" : "I Understand & Agree to Continue"}
        </button>

        {/* Learn more link */}
        <p
          style={{
            textAlign: "center",
            fontSize: "clamp(11px, 1.8vw, 13px)",
            color: "var(--sub)",
            margin: 0,
          }}
        >
          Read our full{" "}
          <button
            onClick={() => navigateTo("/privacy")}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: "clamp(11px, 1.8vw, 13px)",
              padding: 0,
            }}
          >
            Privacy Policy
          </button>
          {" "}to learn more about how your data is used.
        </p>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        #ai-consent-skip-btn:hover:not(:disabled) {
          background: var(--bg) !important;
          color: var(--text) !important;
          border-color: var(--text) !important;
        }
        #ai-consent-accept-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
