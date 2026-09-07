import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getAllClassSuggestions } from '../utils/classUtils';
import ClassInput from '../components/ClassInput';

function Register() {
  const { register } = useAuth();
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
          <p>Register for Student Management System</p>
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