import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';

function getInitials(name) {
  return name
    ?.split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function ManageSystemAdmin() {
  const { getAdminAccounts, createAdminAccount, resetPassword, revokeAccount, currentUser } = useAuth();
  const showToast = useToast();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '' });
  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const data = await getAdminAccounts();
    setAdmins(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = admins.filter(a =>
    !search ||
    a.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    a.username?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  // Protect the seeded primary admin ("admin") and the currently logged-in user
  const isProtected = (a) =>
    a.id === currentUser?.id || a.username === 'admin';

  const copyCredentials = () => {
    if (!credentials) return;
    try {
      navigator.clipboard.writeText(
        `Username: ${credentials.username}\nPassword: ${credentials.password}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy. Please note the credentials manually.', 'warning');
    }
  };

  const handleAdd = async () => {
    if (!form.fullName.trim()) {
      showToast('Full name is required.', 'warning');
      return;
    }
    const result = await createAdminAccount({ fullName: form.fullName.trim(), email: form.email.trim() });
    if (result.success) {
      await load();
      setShowAdd(false);
      setForm({ fullName: '', email: '' });
      if (result.created) {
        setCredentials({
          name: result.account?.fullName,
          username: result.account?.username,
          password: result.account?.password,
        });
        setCopied(false);
      } else {
        showToast(result.account?.fullName + ' is now a System Administrator.', 'success');
      }
    } else {
      showToast(result.message || 'Could not create administrator.', 'error');
    }
  };

  const handleReset = async (a) => {
    const result = await resetPassword(a.id);
    if (result.success) {
      setCredentials({
        name: result.user.fullName,
        username: result.user.username,
        password: result.newPassword,
        reset: true,
      });
      setCopied(false);
    } else {
      showToast(result.message || 'Could not reset password.', 'error');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const res = await revokeAccount(revokeTarget.id);
    if (res.success) {
      await load();
      setRevokeTarget(null);
      showToast(`Administrator access revoked for ${revokeTarget.fullName}.`, 'info');
    } else {
      showToast(res.message || 'Could not revoke account.', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Manage System Administrators</h1>
        <p>
          Manage the <strong>Super Admin</strong> accounts that have full control of the portal.
          Add new administrators, reset their passwords, or revoke their access. The primary
          administrator account cannot be revoked.
        </p>
      </div>

      {/* Header actions */}
      <div className="manage-toolbar">
        <div className="search-box">
          <span className="search-icon"><Icon name="search" size={16} /></span>
          <input
            type="text"
            placeholder="Search administrators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} title="Clear search">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <button className="btn-add" onClick={() => setShowAdd(true)}>
          <span className="add-icon">+</span>
          <span className="add-text">Add Administrator</span>
        </button>
      </div>
      {/* Admin cards */}
      {loading ? (
        <div className="panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--gray)' }}>
          Loading administrators…
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--gray)' }}>
          {admins.length === 0
            ? 'No administrators found.'
            : 'No administrators match your search.'}
        </div>
      ) : (
        <div className="account-list">
          {filtered.map(a => {
            const protectedItem = isProtected(a);
            return (
              <div
                key={a.id}
                className="account-card"
                style={{ borderLeft: '4px solid var(--info)' }}
              >
                <div className="account-card-main">
                  <div className="schedule-stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                    {getInitials(a.fullName)}
                  </div>
                  <div className="account-card-info">
                    <div className="account-card-name">
                      {a.fullName}
                      <span className="role-pill role-badge-admin">Super Admin</span>
                      {a.id === currentUser?.id && (
                        <span className="role-pill" style={{ background: 'var(--primary-bg)', color: 'var(--primary)' }}>You</span>
                      )}
                      {a.username === 'admin' && (
                        <span className="role-pill" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>Primary</span>
                      )}
                    </div>
                    <div className="account-card-sub">@{a.username}</div>
                    <div className="account-card-meta">
                      {a.email} • Joined {a.registrationDate || '—'}
                    </div>
                  </div>
                </div>
                <div className="account-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleReset(a)}>
                    <Icon name="key" size={14} /> Reset Password
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={protectedItem}
                    title={protectedItem ? 'This administrator cannot be revoked.' : 'Revoke admin access'}
                    onClick={() => setRevokeTarget(a)}
                  >
                    <Icon name="delete" size={14} /> Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add administrator modal */}
      {showAdd && (
        <Modal title="Add System Administrator" onClose={() => setShowAdd(false)}>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginBottom: '14px' }}>
            Enter the details for the new Super Admin. A login account will be created with full control of the portal.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd}>
              <Icon name="plus" size={15} /> Create Administrator
            </button>
          </div>
        </Modal>
      )}

      {/* Credentials modal */}
      {credentials && (
        <Modal title={credentials.reset ? 'Password Reset' : 'Administrator Created'} onClose={() => setCredentials(null)}>
          <div className="auth-success" style={{ marginBottom: '14px' }}>
            {credentials.reset
              ? `✅ ${credentials.name}'s password has been reset.`
              : `✅ ${credentials.name} is now a System Administrator!`}
          </div>
          <div
            style={{
              background: 'var(--secondary-bg)',
              border: '1px solid var(--secondary-light)',
              borderRadius: '10px',
              padding: '16px 18px',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>
              🔑 Login Credentials
            </div>
            <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span><strong>Username:</strong> {credentials.username}</span>
              <span><strong>Password:</strong> {credentials.password}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>
                They can change this password after their first login.
              </span>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '10px' }} onClick={copyCredentials}>
              {copied ? <><Icon name="check" size={14} /> Copied!</> : 'Copy Credentials'}
            </button>
          </div>
          <div className="modal-footer" style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={() => setCredentials(null)}>Done</button>
          </div>
        </Modal>
      )}

      {/* Revoke confirmation */}
      {revokeTarget && (
        <ConfirmDialog
          message={`Revoke administrator access for ${revokeTarget.fullName}? Their Super Admin account will be demoted and they will lose full control of the portal.`}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}

export default ManageSystemAdmin;

