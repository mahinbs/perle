import React from "react";

interface MicWaveIconProps {
  size?: number;
  color?: string;
  active?: boolean; // when true, animate side waves
}

const MicWaveIcon: React.FC<MicWaveIconProps> = ({
  size = 24,
  color = "currentColor",
  active = false,
}) => {
  const waveOpacity = active ? 1 : 0.35;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      focusable="false"
      style={{ display: "block" }}
    >
      <style>
        {`
				@keyframes wavePulseL { 0%{transform:translateX(0) scale(1);opacity:.15} 50%{transform:translateX(-1px) scale(1.03);opacity:1} 100%{transform:translateX(0) scale(1);opacity:.15} }
				@keyframes wavePulseR { 0%{transform:translateX(0) scale(1);opacity:.15} 50%{transform:translateX(1px) scale(1.03);opacity:1} 100%{transform:translateX(0) scale(1);opacity:.15} }
				`}
      </style>
      {/* Mic body */}
      <g
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect
          x="26"
          y="12"
          width="12"
          height="24"
          rx="6"
          fill={color}
          opacity={0.95}
        />
        <path d="M18 32c0 6 5 12 14 12s14-6 14-12" />
        <path d="M32 46v8" />
        <path d="M24 56h16" />
      </g>
      {/* Side waves - left */}
      <g
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        opacity={waveOpacity}
        style={
          active
            ? { animation: "wavePulseL 1.6s ease-in-out infinite" }
            : undefined
        }
      >
        <path d="M16 22 C11 24, 11 40, 16 42" />
        <path d="M9 18 C2 22, 2 42, 9 46" />
      </g>
      {/* Side waves - right */}
      <g
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        opacity={waveOpacity}
        style={
          active
            ? {
                animation: "wavePulseR 1.6s ease-in-out infinite",
                animationDelay: "0.2s",
              }
            : undefined
        }
      >
        <path d="M48 22 C53 24, 53 40, 48 42" />
        <path d="M55 18 C62 22, 62 42, 55 46" />
      </g>
    </svg>
  );
};

export default MicWaveIcon;
