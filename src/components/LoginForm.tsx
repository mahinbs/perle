import { useState } from 'react';

interface LoginFormProps {
  onLogin: (email: string, password: string) => void;
  onSwitchToSignup: () => void;
  isLoading?: boolean;
  error?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ 
  onLogin, 
  onSwitchToSignup, 
  isLoading = false, 
  error 
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onLogin(email, password);
    }
  };

  return (
    <div className="auth-form">
      <div className="card" style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
        <div className="h2" style={{ textAlign: 'center', marginBottom: 8 }}>
          Welcome Back
        </div>
        <div className="sub" style={{ textAlign: 'center', marginBottom: 24 }}>
          Sign in to your account
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

        <form onSubmit={handleSubmit}>
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

          <div style={{ marginBottom: 20 }}>
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
                placeholder="Enter your password"
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
          </div>

          <button
            type="submit"
            className="btn"
            disabled={isLoading || !email || !password}
            style={{ width: '100%', marginBottom: 16 }}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <span className="sub">Don't have an account? </span>
          <button
            onClick={onSwitchToSignup}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 600,
              textDecoration: 'underline'
            }}
          >
            Sign up
          </button>
        </div>

        {/* Demo credentials */}
        <div 
          className="demo-credentials"
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-sm)',
            color: 'var(--sub)',
            textAlign: 'center'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Demo Credentials:</div>
          <div>Email: demo@perle.com</div>
          <div>Password: demo123</div>
        </div>
      </div>
    </div>
  );
};
