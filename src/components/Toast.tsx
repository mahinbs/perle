import React, { useEffect, useState } from 'react';

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastProps extends ToastOptions {
  onClose: () => void;
}

/** Follow app `.dark` class — not OS prefers-color-scheme (that caused black toasts + invisible text). */
function useAppDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const TYPE_THEME = {
  success: {
    accent: '#4CAF50',
    light: { bg: '#eef8ee', text: '#1b5e20' },
    dark: { bg: '#1a2f1f', text: '#c8e6c9' },
  },
  error: {
    accent: '#F44336',
    light: { bg: '#fff0ef', text: '#b71c1c' },
    dark: { bg: '#2f1a1a', text: '#ffcdd2' },
  },
  info: {
    accent: '#c7a869',
    light: { bg: '#faf6ee', text: '#3d3420' },
    dark: { bg: '#1f1a12', text: '#f0e6cf' },
  },
} as const;

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  duration = 3000,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const isDark = useAppDarkMode();
  const theme = TYPE_THEME[type];
  const palette = isDark ? theme.dark : theme.light;

  useEffect(() => {
    setIsVisible(true);

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const toastStyles: React.CSSProperties = {
    background: palette.bg,
    color: palette.text,
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
    borderLeft: `4px solid ${theme.accent}`,
    borderRadius: 12,
    padding: '14px 16px',
    boxShadow: isDark
      ? '0 8px 24px rgba(0, 0, 0, 0.55)'
      : '0 8px 24px rgba(0, 0, 0, 0.14)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    minWidth: 260,
    maxWidth: 400,
    fontSize: 'var(--font-sm, 0.875rem)',
    lineHeight: 1.45,
    fontWeight: 500,
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    zIndex: 10000,
    position: 'relative',
    WebkitFontSmoothing: 'antialiased',
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      default:
        return 'ℹ';
    }
  };

  return (
    <div style={toastStyles} role="status" aria-live="polite">
      <div
        aria-hidden
        style={{
          fontSize: '1.125rem',
          fontWeight: 700,
          flexShrink: 0,
          color: theme.accent,
          lineHeight: 1.2,
          marginTop: 1,
        }}
      >
        {getIcon()}
      </div>
      <div style={{ flex: 1, color: palette.text, wordBreak: 'break-word' }}>
        {message}
      </div>
      <button
        type="button"
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          fontSize: '1.25rem',
          lineHeight: 1,
          color: palette.text,
          opacity: 0.65,
          flexShrink: 0,
        }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
};
