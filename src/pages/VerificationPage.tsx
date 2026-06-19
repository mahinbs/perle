import { useState, useRef, useEffect } from 'react';
import { useRouterNavigation } from '../contexts/RouterNavigationContext';
import { setAuthCredentials, setUserData, getPostAuthNavigation, login } from '../utils/auth';
import { getLocalItem, removeLocalItem, setLocalItem, STORAGE_KEYS } from '../utils/storage';
import { IoIosArrowBack } from 'react-icons/io';

// Use Vite's env access directly
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
if (import.meta.env.DEV) {
  // Debug only in development
  // eslint-disable-next-line no-console
  console.log('🔧 Verification API_URL:', API_URL || 'NOT SET');
}

export default function VerificationPage() {
  const { navigateTo, state } = useRouterNavigation();
  const [otp, setOtp] = useState(['', '', '', '', '', '', '', '']);
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Get email from navigation state or localStorage
    const savedEmail = state?.email || getLocalItem(STORAGE_KEYS.verificationEmail);
    if (savedEmail) {
      setEmail(savedEmail);
      setLocalItem(STORAGE_KEYS.verificationEmail, savedEmail);
    } else {
      // If no email, redirect to signup
      navigateTo('/profile');
    }

    // Save plan to localStorage if present in state
    if (state?.plan) {
      setLocalItem(STORAGE_KEYS.verificationPlan, state.plan);
    }

    // Focus first input
    inputRefs.current[0]?.focus();

    // Start countdown for resend
    setCountdown(60);
  }, [state, navigateTo]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only take last character
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 8 digits are entered
    if (newOtp.every(digit => digit !== '') && index === 7) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 8);
    if (/^\d+$/.test(pastedData)) {
      const newOtp = pastedData.split('').concat(Array(8 - pastedData.length).fill(''));
      setOtp(newOtp.slice(0, 8));
      if (pastedData.length === 8) {
        handleVerify(pastedData);
      } else {
        inputRefs.current[Math.min(pastedData.length, 7)]?.focus();
      }
    }
  };

  const handleVerify = async (otpCode?: string) => {
    const code = otpCode || otp.join('');
    
    if (code.length !== 8) {
      setError('Please enter all 8 digits');
      return;
    }

    if (!email || !API_URL) {
      setError('Email not found. Please sign up again.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid verification code');
        // Clear OTP on error
        setOtp(['', '', '', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      // Save initial token from OTP verify
      setAuthCredentials(data.token, data.refreshToken, data.expiresAt);
      setUserData(data.user);

      // If OTP verify didn't return a refreshToken, try to get a full session via login.
      // We store the password temporarily only in memory for this one-time call.
      if (!data.refreshToken) {
        const storedPassword = (window as any).__signupPassword as string | undefined;
        if (storedPassword && email) {
          try {
            await login(email, storedPassword);
          } catch {
            // Best-effort — continue even if login fails
          } finally {
            delete (window as any).__signupPassword;
          }
        }
      }

      // Clear verification email
      removeLocalItem(STORAGE_KEYS.verificationEmail);

      // Redirect to subscription page if plan is pending
      const redirectPlan = state?.plan || getLocalItem(STORAGE_KEYS.verificationPlan);
      if (redirectPlan) {
        removeLocalItem(STORAGE_KEYS.verificationPlan);
        const { path } = getPostAuthNavigation(data.user, { plan: redirectPlan });
        navigateTo(path);
      } else {
        navigateTo('/');
      }
    } catch (error: any) {
      setError('Verification failed. Please try again.');
      setOtp(['', '', '', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || !email || !API_URL) return;

    setIsResending(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to resend code');
        return;
      }

      // Show success message
      setError('');
      setCountdown(60);
      
      // In development only, log OTP to console (never show in production UI)
      if (import.meta.env.DEV && data.devOTP) {
        console.log('🔑 Development OTP:', data.devOTP);
      }
    } catch (error) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="h1">Verify Your Email</div>
        <button
          className="btn-ghost"
          onClick={() => navigateTo('/profile')}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
      </div>

      {/* Info Card */}
      <div className="card" style={{ padding: 24, marginBottom: 24, textAlign: 'center' }}>
        <div style={{ 
          width: 64, 
          height: 64, 
          borderRadius: '50%', 
          background: 'linear-gradient(135deg, var(--accent) 0%, #B8955A 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 32
        }}>
          ✉️
        </div>
        
        <div className="h3" style={{ marginBottom: 8 }}>
          Check Your Email
        </div>
        
          <div className="sub" style={{ marginBottom: 20, lineHeight: 1.6 }}>
          We've sent an 8-digit verification code to
        </div>
        
        <div style={{ 
          fontWeight: 600, 
          color: 'var(--text)', 
          marginBottom: 32,
          fontSize: 'var(--font-md)'
        }}>
          {email}
        </div>

        {/* OTP Input */}
        <div style={{ marginBottom: 24 }}>
          <div className="sub text-sm" style={{ marginBottom: 16 }}>
            Enter verification code
          </div>
          
          <div 
            className="row" 
            style={{ 
              gap: 12, 
              justifyContent: 'center',
              marginBottom: 16
            }}
            onPaste={handlePaste}
          >
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={isLoading}
                style={{
                  width: 56,
                  height: 64,
                  fontSize: 'var(--font-2xl)',
                  fontWeight: 600,
                  textAlign: 'center',
                  border: error ? '2px solid #ff4444' : '2px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(199, 168, 105, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            ))}
          </div>

          {error && (
            <div style={{ 
              color: '#ff4444', 
              fontSize: 'var(--font-sm)', 
              marginTop: 8,
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Verify Button */}
        <button
          className="btn"
          onClick={() => handleVerify()}
          disabled={isLoading || otp.some(d => !d)}
          style={{
            width: '100%',
            marginBottom: 16,
            opacity: (isLoading || otp.some(d => !d)) ? 0.6 : 1,
            cursor: (isLoading || otp.some(d => !d)) ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? 'Verifying...' : 'Verify Email'}
        </button>

        {/* Resend Code */}
        <div style={{ textAlign: 'center' }}>
          <div className="sub text-sm" style={{ marginBottom: 8 }}>
            Didn't receive the code?
          </div>
          <button
            className="btn-ghost"
            onClick={handleResend}
            disabled={isResending || countdown > 0}
            style={{
              fontSize: 'var(--font-sm)',
              opacity: (isResending || countdown > 0) ? 0.5 : 1,
              cursor: (isResending || countdown > 0) ? 'not-allowed' : 'pointer'
            }}
          >
            {countdown > 0 
              ? `Resend code in ${countdown}s`
              : isResending 
              ? 'Sending...' 
              : 'Resend verification code'
            }
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="card" style={{ padding: 16, background: 'var(--card)', opacity: 0.8 }}>
        <div className="sub text-sm" style={{ lineHeight: 1.6 }}>
          <strong>Tip:</strong> Enter the 8-digit code from your email. The code expires in 10 minutes. Check your spam folder if you don't see it in your inbox.
        </div>
      </div>

      <div className="spacer-40" />
    </div>
  );
}

