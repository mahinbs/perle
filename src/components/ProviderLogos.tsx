import {
  SiOpenai,
  SiGooglegemini,
  SiClaude,
  SiX,
  SiPerplexity,
  SiMeta,
} from "react-icons/si";
import syntraIcon from "../assets/syntra-icon.png";

/** Official Exa brand blue — https://exa.ai/brand */
export const EXA_BRAND_BLUE = "#1E40ED";

export function getProviderColor(provider?: string): string {
  switch (provider) {
    case "OpenAI":
      return "#10A37F";
    case "Anthropic":
      return "#D97706";
    case "Google":
      return "#4285F4";
    case "xAI":
      return "#000000";
    case "SyntraIQ":
      return "#FFFFFF";
    case "Exa":
      return EXA_BRAND_BLUE;
    case "Meta":
      return "#1877F2";
    case "Mistral AI":
      return "#7C3AED";
    case "DeepSeek":
      return "#3B5BFF";
    case "Moonshot":
      return "#111111";
    case "Perplexity":
      return "#20B8CD";
    default:
      return "#6B7280";
  }
}

/** SyntraIQ app icon — used for Auto / SyntraIQ-branded picks. */
export function SyntraIQLogomark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const radius = Math.max(5, Math.round(size * 0.22));
  return (
    <img
      src={syntraIcon}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "block",
        flexShrink: 0,
        objectFit: "cover",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}
    />
  );
}

/** Exa logomark — geometric hourglass per Exa brand guidelines. */
export function ExaLogomark({
  size = 14,
  color = "#fff",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color} aria-hidden>
      <path d="M7 4h18l-6.5 10 6.5 10H7l6.5-10L7 4zm3.2 3.4h11.6L17.2 14 22 24.6H10L14.8 14 10.2 7.4z" />
    </svg>
  );
}

export function ProviderBrandIcon({
  provider,
  size = 14,
  color = "#fff",
}: {
  provider: string;
  size?: number;
  color?: string;
}) {
  switch (provider) {
    case "OpenAI":
      return <SiOpenai size={size} color={color} />;
    case "Anthropic":
      return <SiClaude size={size} color={color} />;
    case "Google":
      return <SiGooglegemini size={size} color={color} />;
    case "xAI":
      return <SiX size={size} color={color} />;
    case "Perplexity":
      return <SiPerplexity size={size} color={color} />;
    case "Meta":
      return <SiMeta size={size} color={color} />;
    case "SyntraIQ":
      return <SyntraIQLogomark size={Math.round(size * 1.45)} />;
    case "Exa":
      return <ExaLogomark size={size} color={color} />;
    case "DeepSeek":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill={color} aria-hidden>
          <path d="M3 18c2-4 6-6 10-6 2 0 4 .5 5.5 1.5L23 11l-1.5 3.2c1 1.2 1.5 2.5 1.5 3.8 0 4-4 7-9 7-3 0-6-1.5-7.5-3.5L3 23v-5zm15-3.5a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
      );
    case "Moonshot":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill={color} aria-hidden>
          <path d="M22 6a12 12 0 100 20 10 10 0 010-20z" />
        </svg>
      );
    case "Mistral AI":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill={color} aria-hidden>
          <path d="M4 8h6v4H4zM12 8h6v4h-6zM20 8h6v4h-6zM4 14h6v4H4zM20 14h6v4h-6zM4 20h6v4H4zM12 20h6v4h-6zM20 20h6v4h-6z" />
        </svg>
      );
    default:
      return null;
  }
}

export function ProviderLogo({
  provider,
  modelId,
  size = 26,
}: {
  provider?: string;
  modelId?: string;
  size?: number;
}) {
  if (modelId === "auto" || provider === "SyntraIQ") {
    return <SyntraIQLogomark size={size} />;
  }

  const color = getProviderColor(provider);
  const iconColor = "#fff";
  const iconSize = Math.round(size * 0.62);
  const brandIcon = provider
    ? ProviderBrandIcon({ provider, size: iconSize, color: iconColor })
    : null;

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        backgroundColor: color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
        overflow: provider === "SyntraIQ" ? "hidden" : undefined,
      }}
    >
      {brandIcon ?? (
        <span style={{ color: iconColor, fontWeight: 700, fontSize: size * 0.5 }}>
          {(provider ?? "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}
