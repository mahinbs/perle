import { GoogleIcon } from '../assets/icons/GoogleIcon';
import { AppleIcon } from '../assets/icons/AppleIcon';
import { isAppleSignInAvailable } from '../utils/auth';

interface SocialAuthButtonsProps {
  onAppleSignIn?: () => void;
  onGoogleSignIn?: () => void;
  isLoading?: boolean;
  appleLabel?: string;
  googleLabel?: string;
}

export function SocialAuthButtons({
  onAppleSignIn,
  onGoogleSignIn,
  isLoading = false,
  appleLabel = 'Continue with Apple',
  googleLabel = 'Continue with Google',
}: SocialAuthButtonsProps) {
  const showApple = Boolean(onAppleSignIn) && isAppleSignInAvailable();
  const showGoogle = Boolean(onGoogleSignIn);

  if (!showApple && !showGoogle) return null;

  return (
    <>
      {showApple && (
        <button
          type="button"
          className="btn-ghost"
          onClick={onAppleSignIn}
          disabled={isLoading}
          style={{
            width: '100%',
            marginBottom: showGoogle ? 12 : 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontWeight: 600,
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            background: 'var(--text)',
            color: 'var(--bg)',
            border: '1px solid var(--text)',
          }}
        >
          <AppleIcon width={20} height={20} />
          {appleLabel}
        </button>
      )}

      {showGoogle && (
        <button
          type="button"
          className="btn-ghost"
          onClick={onGoogleSignIn}
          disabled={isLoading}
          style={{
            width: '100%',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontWeight: 600,
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          <GoogleIcon width={22} height={22} />
          {googleLabel}
        </button>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span
          className="sub"
          style={{
            fontSize: 'var(--font-sm)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          or
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
    </>
  );
}
