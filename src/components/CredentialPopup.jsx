import { useState } from 'react';
import Modal from './Modal';
import { useToast } from './Toast';

/**
 * Modal that displays newly-created login credentials (username + password)
 * with a copy-to-clipboard button.
 */
function CredentialPopup({ account, title = 'New Login Credentials', message = 'Account created successfully!', onClose }) {
  const showToast = useToast();
  const [copied, setCopied] = useState(false);

  const copyCredentials = () => {
    if (!account) return;
    try {
      navigator.clipboard.writeText(`Username: ${account.username}\nPassword: ${account.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy. Please note the credentials manually.', 'warning');
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="auth-success" style={{ marginBottom: '14px' }}>
        ✅ {message}
      </div>
      <div
        style={{
          background: 'var(--secondary-bg)',
          border: '1px solid var(--secondary-light)',
          borderRadius: '10px',
          padding: '16px 18px',
          marginBottom: '8px'
        }}
      >
        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>
          🔑 {title} (share with the user)
        </div>
        <div style={{ fontSize: '0.92rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span><strong>Name:</strong> {account?.fullName}</span>
          <span><strong>Username:</strong> {account?.username}</span>
          <span><strong>Password:</strong> {account?.password}</span>
          <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>
            Sign in with this username (without the @) and password. They can change the password after their first login via the Change Password option.
          </span>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: '10px' }}
          onClick={copyCredentials}
        >
          {copied ? '✓ Copied!' : '📋 Copy Credentials'}
        </button>
      </div>
      <div className="modal-footer" style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

export default CredentialPopup;