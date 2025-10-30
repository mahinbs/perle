import React from 'react';

interface HeadsetWaveIconProps {
  size?: number; // pixels
  color?: string; // css color, defaults to currentColor
  pulse?: boolean; // enable bar pulse animation
  title?: string; // accessible title
}

// SVG headset with animated waveform bars inside the earcups area
export const HeadsetWaveIcon: React.FC<HeadsetWaveIconProps> = ({
  size = 64,
  color = 'currentColor',
  pulse = true,
  title = 'Voice Assistant'
}) => {
  const barDelays = [0, 0.08, 0.16, 0.24, 0.32, 0.24, 0.16, 0.08];
  const barHeights = [10, 16, 24, 34, 40, 34, 24, 16];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      style={{ display: 'inline-block', verticalAlign: 'middle', color }}
    >
      <title>{title}</title>
      {/* Inline styles so we don't touch global CSS */}
      <style>
        {`
          @keyframes hw-pulse {
            0%, 100% { transform: scaleY(0.65); opacity: 0.7; }
            50%      { transform: scaleY(1);    opacity: 1;   }
          }
          .hw-bar { transform-origin: 90% 60%; }
          .hw-animate { animation: hw-pulse 1.2s ease-in-out infinite; }
        `}
      </style>

      {/* Headband */}
      <path
        d="M15 54a35 35 0 0 1 70 0"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* Earcups */}
      <rect x="14" y="50" width="14" height="26" rx="6" ry="6" fill={color} />
      <rect x="72" y="50" width="14" height="26" rx="6" ry="6" fill={color} />

      {/* Mic boom */}
      <path
        d="M78 80c-10 8-24 12-38 10"
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <circle cx="38" cy="89" r="5" fill={color} />

      {/* Waveform bars (centered) */}
      <g transform="translate(50,63)">
        {barHeights.map((h, i) => {
          const x = (i - (barHeights.length - 1) / 2) * 6; // spacing 6px
          const delay = barDelays[i % barDelays.length];
          return (
            <rect
              key={i}
              x={x - 1.5}
              y={-h / 2}
              width={3}
              height={h}
              rx={1.5}
              fill={color}
              className={`hw-bar ${pulse ? 'hw-animate' : ''}`}
              style={pulse ? { animationDelay: `${delay}s` } : undefined}
            />
          );
        })}
      </g>
    </svg>
  );
};

export default HeadsetWaveIcon;


