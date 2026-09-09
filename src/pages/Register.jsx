import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { getAllClassSuggestions } from '../utils/classUtils';
import ClassInput from '../components/ClassInput';

const MoonIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
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

function Register() {
  const { register } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { students, teachers, subjects, classes } = useData();
  const classSuggestions = getAllClassSuggestions(classes, students, teachers, subjects);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: 'student',
    className: 'BSCS'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (!form.fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    setLoading(true);

    setTimeout(async () => {
      const result = await register({
        username: form.username,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        className: (form.role === 'student' || form.role === 'cr_admin') ? form.className : null
      });

      if (result.success) {
        setSuccess(result.message);
        setForm({
          username: '',
          email: '',
          password: '',
          confirmPassword: '',
          fullName: '',
          role: 'student',
          className: 'BSCS',
        });
      } else {
        setError(result.message);
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="auth-container">
      {/* Decorative abstract background (matches Login) */}
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
          <h2>Create your account</h2>
          <p>Fill in your details to get started</p>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="auth-success" style={{ marginBottom: '16px' }}>
            ✅ {success}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Full Name *</label>
            <input
              type="text"
              name="fullName"
              className="auth-input"
              placeholder="Enter your full name"
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label>Username *</label>
            <input
              type="text"
              name="username"
              className="auth-input"
              placeholder="Choose a username"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label>Email *</label>
            <input
              type="email"
              name="email"
              className="auth-input"
              placeholder="your@email.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label>Password *</label>
            <input
              type="password"
              name="password"
              className="auth-input"
              placeholder="Min 6 characters"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label>Confirm Password *</label>
            <input
              type="password"
              name="confirmPassword"
              className="auth-input"
              placeholder="Re-enter password"
              value={form.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label>Register As *</label>
            <select name="role" className="auth-select" value={form.role} onChange={handleChange}>
              <option value="student">Student</option>
              <option value="cr_admin">Class Representative (CR)</option>
              <option value="teacher_admin">Teacher</option>
            </select>
          </div>

          {(form.role === 'student' || form.role === 'cr_admin') && (
            <div className="auth-field">
              <label>{form.role === 'cr_admin' ? 'Class You Represent *' : 'Class *'}</label>
              <ClassInput
                id="register-class-suggestions"
                value={form.className}
                onChange={(e) => setForm(prev => ({ ...prev, className: e.target.value }))}
                suggestions={classSuggestions}
                placeholder="Type or select your class e.g. BSCS"
                required
                style={{ width: '100%', padding: '12px 16px', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.9rem', outline: 'none', background: 'var(--white)', color: 'var(--dark)' }}
              />
            </div>
          )}

          <div className="auth-info-box">
            ℹ️ Your registration will be reviewed and approved by an administrator (Super Admin, CR, or Teacher) before you can log in.
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Submitting...' : 'Register'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <a onClick={() => navigate('/login')}>Sign in</a>
        </div>
      </div>
    </div>
  );
}

export default Register;