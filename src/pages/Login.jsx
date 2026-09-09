import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/* ─────────────────────── Inline SVG icons (no extra deps) ─────────────────────── */

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const SunIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 37.4 44 31.2 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.365 1.43c0 1.14-.42 2.2-1.25 3.17-.96 1.13-2.44 1.94-3.56 1.89-.13-1.1.35-2.28 1.18-3.2.89-.99 2.44-1.78 3.63-1.86zM21.44 17.28c-.58 1.3-1.29 2.56-2.3 3.85-1.2 1.53-2.66 3.06-4.59 3.1-1.55.03-2.29-.9-4.27-.9-1.98 0-2.77.87-4.42.91-1.71.05-3.13-1.06-4.35-2.6-2.4-3.14-4.19-8.6-1.28-12.49 1.47-1.97 3.69-3.13 5.8-3.13 1.59 0 3.29.79 4.34.95.15.02.3.04.45.05.94 0 3.87-1.1 5.47-.45 2.03.8 3.22 3.4 3.22 3.4.15.29-.27.45-.59.99-.6 1.04-1.31 2.15-1.31 3.48-.01 1.33.59 2.54 1.2 3.6.56 1.02 1.38 2.29 1.4 1.54.57v.02z" />
  </svg>
);

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073c0 5.992 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.065 24 12.073z" />
  </svg>
);

function Login() {
  const { login } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    setTimeout(async () => {
      const result = await login(username, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message);
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="auth-container">
      {/* Decorative abstract background (Gratafy-style) */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-orb auth-orb-4" />
      <div className="auth-ring auth-ring-1" />
      <div className="auth-ring auth-ring-2" />
      <div className="auth-ring auth-ring-3" />

      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle theme"
      >
        {darkMode ? <SunIcon /> : <MoonIcon />}
      </button>

      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <img src="/ncba-logo.webp" alt="NCBA&F Logo" />
          </div>
          <h1>NCBA <span>&amp;</span> E</h1>
          <p>Student Management System</p>
        </div>

        <div className="auth-heading">
          <h2>Welcome back</h2>
          <p>Sign in to continue to your dashboard</p>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {info && (
          <div className="auth-info-box" style={{ marginBottom: '16px' }}>
            ℹ️ {info}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Username or Email</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon"><UserIcon /></span>
              <input
                type="text"
                className="auth-input"
                placeholder="Enter your username or email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label>Password</label>
              <button
                type="button"
                className="auth-forgot"
                onClick={() => setInfo('Contact your administrator to reset your password.')}
              >
                Forgot password?
              </button>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-icon"><LockIcon /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">Or continue with</div>

        <div className="auth-social">
          <button
            className="auth-social-btn"
            title="Sign in with Google"
            onClick={() => setInfo('Social sign-in is not enabled — use your username & password.')}
          >
            <GoogleIcon />
          </button>
          <button
            className="auth-social-btn"
            title="Sign in with Apple"
            onClick={() => setInfo('Social sign-in is not enabled — use your username & password.')}
          >
            <AppleIcon />
          </button>
          <button
            className="auth-social-btn"
            title="Sign in with Facebook"
            onClick={() => setInfo('Social sign-in is not enabled — use your username & password.')}
          >
            <FacebookIcon />
          </button>
        </div>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <a onClick={() => navigate('/register')}>Sign up</a>
        </div>
      </div>
    </div>
  );
}

export default Login;