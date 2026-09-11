import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';

function getInitials(name) {
  return name
    ?.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function ManageTeacher() {
  const { getTeacherAccounts, grantTeacherAccount, resetPassword, reset2FA, enable2FA, revokeAccount, hasPermission } = useAuth();
  const showToast = useToast();

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [twoFATarget, setTwoFATarget] = useState(null);
  const [requireTarget, setRequireTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const data = await getTeacherAccounts();
    setTeachers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = teachers.filter(t =>
    !search ||
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.subject?.toLowerCase().includes(search.toLowerCase()) ||
    t.className?.toLowerCase().includes(search.toLowerCase())
  );

  const withAccount = teachers.filter(t => t.account);
  const withoutAccount = teachers.filter(t => !t.account);

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

  const handleGrant = async (t) => {
    const result = await grantTeacherAccount(t.id);
    if (result.success) {
      await load();
      if (result.created) {
        setCredentials({
          name: result.account?.fullName || t.name,
          username: result.account?.username,
          password: result.account?.password,
        });
        setCopied(false);
      } else {
        showToast(`${result.account?.fullName || t.name} already has a login account.`, 'info');
      }
    } else {
      showToast(result.message || 'Could not grant account. Please try again.', 'error');
    }
  };

  const handleReset = async (t) => {
    const result = await resetPassword(t.account.id);
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
    const res = await revokeAccount(revokeTarget.account.id);
    if (res.success) {
      await load();
      setRevokeTarget(null);
      showToast(`Access revoked for ${revokeTarget.name}.`, 'info');
    } else {
      showToast(res.message || 'Could not revoke account.', 'error');
    }
  };

  const handleReset2FA = async () => {
    if (!twoFATarget?.account) return;
    const result = await reset2FA(twoFATarget.account.id);
    if (result.success) {
      await load();
      showToast(`${result.user.fullName}'s two-factor authentication has been removed. They can now sign in with a single-step login.`, 'success');
    } else {
      showToast(result.message || 'Could not reset 2FA.', 'error');
    }
    setTwoFATarget(null);
  };

  const handleEnable2FA = async () => {
    if (!requireTarget?.account) return;
    const result = await enable2FA(requireTarget.account.id);
    if (result.success) {
      await load();
      showToast(`${result.user.fullName}'s two-factor authentication is now required.`, 'success');
    } else {
      showToast(result.message || 'Could not enable 2FA.', 'error');
    }
    setRequireTarget(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Manage Teacher Accounts</h1>
        <p>
          Grant system login accounts to teachers. Each teacher gets an approved{' '}
          <strong>Teacher Admin</strong> account so they can sign in and manage the portal.
          You can grant, reset the password, or revoke access for any teacher below.
        </p>
      </div>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">👨🏫</div>
          <div className="stat-info">
            <h3>{teachers.length}</h3>
            <p>Total Teachers</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div className="stat-info">
            <h3>{withAccount.length}</h3>
            <p>With Account</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">🔑</div>
          <div className="stat-info">
            <h3>{withoutAccount.length}</h3>
            <p>Without Account</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">👥</div>
          <div className="stat-info">
            <h3>{withAccount.length ? Math.round((withAccount.length / (teachers.length || 1)) * 100) : 0}%</h3>
            <p>Account Coverage</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="manage-search-bar">
        <div className="search-box">
          <span className="search-icon"><Icon name="search" size={16} /></span>
          <input
            type="text"
            placeholder="Search by name, subject or class..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} title="Clear search">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <span className="manage-count">{filtered.length} of {teachers.length}</span>
      </div>

      {/* Teacher cards */}
      {loading ? (
        <div className="panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--gray)' }}>
          Loading teachers…
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--gray)' }}>
          {teachers.length === 0
            ? 'No teachers found. Add teachers from the Teachers page first.'
            : 'No teachers match your search.'}
        </div>
      ) : (
        <div className="account-list">
          {filtered.map(t => (
            <div
              key={t.id}
              className="account-card"
              style={{ borderLeft: t.account ? '4px solid var(--success)' : '4px solid var(--border)' }}
            >
              <div className="account-card-main">
                <div className="schedule-stat-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                  {getInitials(t.name)}
                </div>
                <div className="account-card-info">
                  <div className="account-card-name">
                    {t.name}
                    {t.account
                      ? <span className="role-pill role-badge-teacher">Teacher Admin</span>
                      : <span className="role-pill role-badge-student">No Account</span>}
                    {hasPermission('view_2fa_status') && t.account && (
                      <span
                        className="role-pill"
                        style={t.account.twoFactorEnabled
                          ? t.account.twoFactorSetUp
                            ? { background: 'var(--success-bg)', color: 'var(--success)' }
                            : { background: 'var(--warning-bg)', color: 'var(--warning)' }
                          : { background: 'var(--secondary-bg)', color: 'var(--gray)' }}
                      >
                        {t.account.twoFactorEnabled ? (t.account.twoFactorSetUp ? '2FA On' : '2FA Required') : '2FA Off'}
                      </span>
                    )}
                  </div>
                  <div className="account-card-sub">
                    {[t.subject, t.className].filter(Boolean).join(' • ') || '—'}
                  </div>
                  {t.account ? (
                    <div className="account-card-meta">
                      Login: <strong>@{t.account.username}</strong>
                    </div>
                  ) : (
                    <div className="account-card-meta" style={{ color: 'var(--gray)' }}>
                      Grant an account to let this teacher sign in.
                    </div>
                  )}
                </div>
              </div>
              <div className="account-card-actions">
                {t.account ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleReset(t)}>
                      <Icon name="key" size={14} /> Reset Password
                    </button>
                    {hasPermission('reset_2fa') && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!t.account.twoFactorEnabled}
                      title={t.account.twoFactorEnabled
                        ? 'Remove two-factor authentication and allow a simple single-step login'
                        : 'Two-factor authentication is not active'}
                      onClick={() => setTwoFATarget(t)}
                    >
                      <Icon name="key" size={14} /> Reset 2FA
                    </button>
                    )}
                    {hasPermission('manage_2fa') && !t.account.twoFactorEnabled && (
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Require two-factor authentication at their next login"
                      onClick={() => setRequireTarget(t)}
                    >
                      <Icon name="key" size={14} /> Require 2FA
                    </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => setRevokeTarget(t)}>
                      <Icon name="delete" size={14} /> Revoke
                    </button>
                  </>
                ) : (
                  <button className="btn-add btn-add-sm" onClick={() => handleGrant(t)}>
                    <span className="add-icon">+</span>
                    <span className="add-text">Grant Account</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Credentials modal */}
      {credentials && (
        <Modal title={credentials.reset ? 'Password Reset' : 'Account Created'} onClose={() => setCredentials(null)}>
          <div className="auth-success" style={{ marginBottom: '14px' }}>
            {credentials.reset
              ? `✅ ${credentials.name}'s password has been reset.`
              : `✅ ${credentials.name} now has a login account!`}
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
          message={`Revoke access for ${revokeTarget.name}? Their Teacher Admin account will be demoted to a regular student role and they will no longer be able to sign in as a teacher.`}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}

      {/* 2FA reset confirmation */}
      {twoFATarget && (
        <ConfirmDialog
          message={`Reset two-factor authentication for ${twoFATarget.name}? Their authenticator app will be unlinked and 2FA turned off — their next login will be a normal single-step login.`}
          onConfirm={handleReset2FA}
          onCancel={() => setTwoFATarget(null)}
        />
      )}

      {/* Require 2FA confirmation */}
      {requireTarget && (
        <ConfirmDialog
          message={`Require two-factor authentication for ${requireTarget.name}? At their next login they will be asked to scan a QR code with an authenticator app before they can sign in.`}
          onConfirm={handleEnable2FA}
          onCancel={() => setRequireTarget(null)}
        />
      )}
    </div>
  );
}

export default ManageTeacher;

