import { useState } from 'react';
import { GoogleIcon } from '../assets/icons/GoogleIcon';

interface SignupFormProps {
  onSignup: (name: string, email: string, password: string) => void;
  onSwitchToLogin: () => void;
  onGoogleSignup?: () => void;
  isLoading?: boolean;
  error?: string;
}

export const SignupForm: React.FC<SignupFormProps> = ({ 
  onSignup, 
  onSwitchToLogin,
  onGoogleSignup, 
  isLoading = false, 
  error 
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return;
    }
    if (name && email && password && acceptTerms) {
      onSignup(name, email, password);
    }
  };

  const isPasswordMatch = password && confirmPassword && password === confirmPassword;
  const isPasswordMismatch = password && confirmPassword && password !== confirmPassword;

  return (
    <div className="auth-form">
      <div className="card" style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
        <div className="h2" style={{ textAlign: 'center', marginBottom: 8 }}>
          Create Account
        </div>
        <div className="sub" style={{ textAlign: 'center', marginBottom: 24 }}>
          Join Syntra<span className="text-gold">IQ</span>  and start exploring
        </div>

        {error && (
          <div 
            className="error-message" 
            style={{ 
              padding: 12, 
              marginBottom: 16, 
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ff4444',
              color: '#ff4444',
              fontSize: 'var(--font-md)'
            }}
          >
            {error}
          </div>
        )}

        {onGoogleSignup && (
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={onGoogleSignup}
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
              Sign up with Google
            </button>
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
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label 
              htmlFor="name" 
              style={{ 
                display: 'block', 
                marginBottom: 6, 
                fontWeight: 500,
                color: 'var(--text)'
              }}
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              required
              className="input"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--card)',
                fontSize: 'var(--font-md)'
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label 
              htmlFor="email" 
              style={{ 
                display: 'block', 
                marginBottom: 6, 
                fontWeight: 500,
                color: 'var(--text)'
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="input"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--card)',
                fontSize: 'var(--font-md)'
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label 
              htmlFor="password" 
              style={{ 
                display: 'block', 
                marginBottom: 6, 
                fontWeight: 500,
                color: 'var(--text)'
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                required
                className="input"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  paddingRight: '48px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--card)',
                fontSize: 'var(--font-md)'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                fontSize: 'var(--font-lg)',
                  color: 'var(--sub)',
                  padding: 4
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {password && (
              <div className="sub text-sm" style={{ marginTop: 4 }}>
                Password strength: {password.length < 6 ? 'Weak' : password.length < 10 ? 'Medium' : 'Strong'}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label 
              htmlFor="confirmPassword" 
              style={{ 
                display: 'block', 
                marginBottom: 6, 
                fontWeight: 500,
                color: 'var(--text)'
              }}
            >
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                className="input"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  paddingRight: '48px',
                  border: `1px solid ${isPasswordMismatch ? '#ff4444' : isPasswordMatch ? '#10B981' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--card)',
                fontSize: 'var(--font-md)'
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                fontSize: 'var(--font-lg)',
                  color: 'var(--sub)',
                  padding: 4
                }}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {confirmPassword && (
              <div 
                className="text-sm" 
                style={{ 
                  marginTop: 4,
                  color: isPasswordMismatch ? '#ff4444' : isPasswordMatch ? '#10B981' : 'var(--sub)'
                }}
              >
                {isPasswordMismatch ? 'Passwords do not match' : isPasswordMatch ? 'Passwords match ✓' : ''}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span className="sub text-sm">
                I agree to the{' '}
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Terms of Service
                </button>
                {' '}and{' '}
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Privacy Policy
                </button>
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="btn"
            disabled={isLoading || !name || !email || !password || !confirmPassword || !acceptTerms || !!isPasswordMismatch}
            style={{ width: '100%', marginBottom: 16 }}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <span className="sub">Already have an account? </span>
          <button
            onClick={onSwitchToLogin}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 600,
              textDecoration: 'underline'
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
};
