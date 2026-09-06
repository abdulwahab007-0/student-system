import { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';

function ChangePasswordModal({ open, onClose }) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (result.success) {
      setSuccess(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(onClose, 1200);
    } else {
      setError(result.message);
    }
  };

  return (
    <Modal title="🔒 Change Password" onClose={onClose}>
      {error && (
        <div className="auth-error" style={{ marginBottom: '14px' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="auth-success" style={{ marginBottom: '14px' }}>
          ✅ {success}
        </div>
      )}
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Current Password</label>
          <input
            type="password"
            className="auth-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="auth-field">
          <label>New Password</label>
          <input
            type="password"
            className="auth-input"
            placeholder="Min 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="auth-field">
          <label>Confirm New Password</label>
          <input
            type="password"
            className="auth-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Update Password
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ChangePasswordModal;