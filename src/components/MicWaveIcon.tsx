import React from 'react';

interface MicWaveIconProps {
	size?: number;
	color?: string;
	active?: boolean; // when true, animate side waves
}

const MicWaveIcon: React.FC<MicWaveIconProps> = ({ size = 24, color = 'currentColor', active = false }) => {
	const waveOpacity = active ? 1 : 0.35;
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 64 64"
			fill="none"
			aria-hidden
			focusable="false"
			style={{ display: 'block' }}
		>
			<style>
				{`
				@keyframes wavePulseL { 0%{transform:translateX(0) scale(1);opacity:.15} 50%{transform:translateX(-1px) scale(1.03);opacity:1} 100%{transform:translateX(0) scale(1);opacity:.15} }
				@keyframes wavePulseR { 0%{transform:translateX(0) scale(1);opacity:.15} 50%{transform:translateX(1px) scale(1.03);opacity:1} 100%{transform:translateX(0) scale(1);opacity:.15} }
				`}
			</style>
			{/* Mic body */}
			<g stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
				<rect x="26" y="12" width="12" height="24" rx="6" fill={color} opacity={0.95} />
				<path d="M16 32c0 8.837 7.163 16 16 16s16-7.163 16-16" />
				<path d="M32 48v8" />
				<path d="M24 56h16" />
			</g>
			{/* Side waves - left */}
			<g stroke={color} strokeWidth="3" strokeLinecap="round" opacity={waveOpacity} style={active ? { animation: 'wavePulseL 1.6s ease-in-out infinite' } : undefined}>
				<path d="M18 22 C14 24, 14 40, 18 42" />
				<path d="M12 18 C6 22, 6 42, 12 46" />
			</g>
			{/* Side waves - right */}
			<g stroke={color} strokeWidth="3" strokeLinecap="round" opacity={waveOpacity} style={active ? { animation: 'wavePulseR 1.6s ease-in-out infinite', animationDelay: '0.2s' } : undefined}>
				<path  d="M46 22 C50 24, 50 40, 46 42" />
				<path d="M52 18 C58 22, 58 42, 52 46" />
			</g>
		</svg>
	);
};

export default MicWaveIcon;


