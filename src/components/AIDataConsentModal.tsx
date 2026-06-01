import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

const CONSENT_KEY = "syntraiq_ai_consent_v1";

export function hasAIConsent(): boolean {
  return localStorage.getItem(CONSENT_KEY) === "granted";
}

export function grantAIConsent(): void {
  localStorage.setItem(CONSENT_KEY, "granted");
}

interface AIDataConsentModalProps {
  onAccept: () => void;
}

export function AIDataConsentModal({ onAccept }: AIDataConsentModalProps) {
  const { navigateTo } = useRouterNavigation();
  const [accepting, setAccepting] = useState(false);

  const handleAccept = () => {
    setAccepting(true);
    grantAIConsent();
    setTimeout(() => {
      onAccept();
    }, 300);
  };

  return (
    <div
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
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          maxWidth: "480px",
          width: "100%",
          padding: "32px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "16px",
            background: "rgba(199,168,105,0.12)",
            border: "1px solid rgba(199,168,105,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            marginBottom: 20,
          }}
        >
          🔒
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: "var(--font-xl)",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          Before You Chat with AI
        </h2>
        <p
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--sub)",
            marginBottom: 24,
            lineHeight: 1.6,
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
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: "var(--font-sm)",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
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
              gap: 6,
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
                  fontSize: "var(--font-sm)",
                  color: "var(--text-secondary, var(--sub))",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--accent)", marginTop: 1 }}>✓</span>
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
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: "var(--font-sm)",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🏢 Third-party AI providers who receive your data
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
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
                  gap: 12,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "var(--font-sm)",
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {provider.name}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
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
                    fontSize: "11px",
                    color: "var(--accent)",
                    textDecoration: "underline",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Privacy Policy ↗
                </a>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: "11px",
              color: "var(--sub)",
              marginTop: 12,
              lineHeight: 1.5,
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
          disabled={accepting}
          style={{
            width: "100%",
            padding: "14px 24px",
            borderRadius: "12px",
            background: accepting
              ? "rgba(199,168,105,0.5)"
              : "var(--accent)",
            color: "#111",
            fontWeight: 700,
            fontSize: "var(--font-md)",
            border: "none",
            cursor: accepting ? "not-allowed" : "pointer",
            marginBottom: 12,
            transition: "all 0.2s ease",
          }}
        >
          {accepting ? "Saving your preference…" : "I Understand & Agree to Continue"}
        </button>

        {/* Learn more link */}
        <p
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "var(--sub)",
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
              fontSize: "12px",
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
      `}</style>
    </div>
  );
}
