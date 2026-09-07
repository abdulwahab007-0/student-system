import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
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
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="44" height="52" viewBox="0 0 60 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M30 3 L57 14 L57 36 C57 54 30 69 30 69 C30 69 3 54 3 36 L3 14 Z" fill="#ffffff" stroke="#059669" strokeWidth="2.5"/>
              <rect x="3" y="14" width="11" height="11" fill="#059669"/>
              <rect x="14" y="14" width="11" height="11" fill="#7c3aed"/>
              <rect x="25" y="14" width="11" height="11" fill="#059669"/>
              <rect x="36" y="14" width="11" height="11" fill="#7c3aed"/>
              <rect x="47" y="14" width="11" height="11" fill="#059669"/>
              <rect x="3" y="25" width="11" height="11" fill="#7c3aed"/>
              <rect x="14" y="25" width="11" height="11" fill="#059669"/>
              <rect x="25" y="25" width="11" height="11" fill="#7c3aed"/>
              <rect x="36" y="25" width="11" height="11" fill="#059669"/>
              <rect x="47" y="25" width="11" height="11" fill="#7c3aed"/>
              <rect x="3" y="36" width="11" height="11" fill="#059669"/>
              <rect x="14" y="36" width="11" height="11" fill="#7c3aed"/>
              <rect x="25" y="36" width="11" height="11" fill="#059669"/>
              <rect x="36" y="36" width="11" height="11" fill="#7c3aed"/>
              <rect x="47" y="36" width="11" height="11" fill="#059669"/>
              <rect x="8" y="47" width="11" height="11" fill="#7c3aed"/>
              <rect x="19" y="47" width="11" height="11" fill="#059669"/>
              <rect x="30" y="47" width="11" height="11" fill="#7c3aed"/>
              <rect x="41" y="47" width="11" height="11" fill="#059669"/>
              <rect x="14" y="58" width="11" height="11" fill="#059669"/>
              <rect x="25" y="58" width="11" height="11" fill="#7c3aed"/>
              <rect x="36" y="58" width="11" height="11" fill="#059669"/>
              <polygon points="30,22 33,31 42,31 35,36 37,45 30,40 23,45 25,36 18,31 27,31" fill="#ffffff" opacity="0.92"/>
              <polygon points="30,26 32,32 38,32 33,36 35,42 30,38 25,42 27,36 22,32 28,32" fill="#fbbf24"/>
            </svg>
          </div>
          <h1>NCBA <span>&amp;</span> E</h1>
          <p>Student Management System</p>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Username or Email</label>
            <input
              type="text"
              className="auth-input"
              placeholder="Enter your username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              className="auth-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">OR</div>

        <div className="auth-footer">
          New to NCBA & E?{' '}
          <a onClick={() => navigate('/register')}>Create an account</a>
        </div>
      </div>
    </div>
  );
}

export default Login;