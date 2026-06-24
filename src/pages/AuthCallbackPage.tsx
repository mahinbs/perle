import { useEffect, useState } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import {
  completeGoogleOAuth,
  getPostAuthNavigation,
  readOAuthReturnState,
} from '../utils/auth';

export default function AuthCallbackPage() {
  const { navigateTo } = useRouterNavigation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await completeGoogleOAuth();
        const navState = readOAuthReturnState();
        const { path, useAuthRedirect } = getPostAuthNavigation(response.user, navState);
        if (useAuthRedirect) {
          navigateTo(path, { fromAuthRedirect: true }, { replace: true });
        } else {
          navigateTo(path, undefined, { replace: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Google sign-in failed');
      }
    };
    void run();
  }, [navigateTo]);

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: 24, maxWidth: 420, margin: '0 auto' }}>
          <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>
          <button className="btn" onClick={() => navigateTo('/profile')}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2px solid var(--accent)',
          borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <div className="sub">Completing Google sign-in…</div>
    </div>
  );
}
