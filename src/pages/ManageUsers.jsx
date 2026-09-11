import { useState } from 'react';
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

function ManageUsers() {
  const { users, currentUser, resetPassword, reset2FA, refreshUsers, roleLabel, hasPermission, removeUser } = useAuth();
  const showToast = useToast();

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [twoFATarget, setTwoFATarget] = useState(null);
  const [newCredentials, setNewCredentials] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState([]);
  const [removeAction, setRemoveAction] = useState(null); // { type:'single', user } | { type:'bulk' }

  const getRoleBadgeClass = (role) => {
    const classes = {
      super_admin: 'role-badge-admin',
      cr_admin: 'role-badge-cr',
      teacher_admin: 'role-badge-teacher',
      student: 'role-badge-student',
    };
    return classes[role] || 'primary';
  };

  const getRoleAvatarStyle = (role) => {
    const styles = {
      super_admin: { background: 'var(--info-bg)', color: 'var(--info)' },
      cr_admin: { background: 'var(--secondary-bg)', color: 'var(--secondary)' },
      teacher_admin: { background: 'var(--accent-bg)', color: 'var(--accent)' },
      student: { background: 'var(--primary-bg)', color: 'var(--primary)' },
    };
    return styles[role] || { background: 'var(--primary-bg)', color: 'var(--primary)' };
  };

  const roles = ['super_admin', 'cr_admin', 'teacher_admin', 'student'];
  // Only admin-role logins are forced through TOTP 2FA, so 2FA actions only apply to them.
  const adminRole = (role) => ['super_admin', 'cr_admin', 'teacher_admin'].includes(role);

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search ||
      u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !filterRole || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  // Role counts for stats
  const roleCounts = roles.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {});

  const handleReset = async () => {
    if (!resetTarget) return;
    const result = await resetPassword(resetTarget.id);
    if (result.success) {
      setNewCredentials(result.user);
      setCopied(false);
    }
    setResetTarget(null);
  };

  const handleReset2FA = async () => {
    if (!twoFATarget) return;
    const result = await reset2FA(twoFATarget.id);
    if (result.success) {
      showToast(
        `${result.user.fullName}'s two-factor authentication has been reset. They will be prompted to set it up again at their next login.`,
        'success'
      );
      refreshUsers(); // flip the 2FA badge to Off right away
    } else {
      showToast(result.message || 'Could not reset 2FA.', 'error');
    }
    setTwoFATarget(null);
  };

  const copyCredentials = () => {
    if (!newCredentials) return;
    try {
      navigator.clipboard.writeText(
        `Username: ${newCredentials.username}\nPassword: ${newCredentials.password}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy. Please note the credentials manually.', 'warning');
    }
  };

  // ---- Bulk selection helpers ----
  const removable = (u) => u.username !== 'admin' && currentUser?.id !== u.id;
  const selectedSet = new Set(selected);
  const toggleSelect = (id) => {
    setSelected(prev => selectedSet.has(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedSet.has(u.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const keepIds = new Set(filteredUsers.map(u => u.id));
      setSelected(prev => prev.filter(id => !keepIds.has(id)));
    } else {
      const newIds = filteredUsers.filter(u => !selectedSet.has(u.id)).map(u => u.id);
      setSelected(prev => [...prev, ...newIds]);
    }
  };
  const selectedRemovableUsers = selected
    .map(id => users.find(u => u.id === id))
    .filter(u => u && removable(u));

  // ---- Removal handlers ----
  const handleRemove = async () => {
    if (!removeAction) return;
    let failedName = null;
    if (removeAction.type === 'single') {
      const res = await removeUser(removeAction.user.id);
      if (res.success) {
        showToast(`Removed ${removeAction.user.fullName}'s account.`, 'success');
        setSelected(prev => prev.filter(id => id !== removeAction.user.id));
      } else {
        failedName = res.message;
      }
    } else {
      // Bulk remove
      const targets = selectedRemovableUsers;
      if (targets.length === 0) {
        showToast('The selected accounts cannot be removed.', 'warning');
        setRemoveAction(null);
        return;
      }
      let removedCount = 0;
      for (const u of targets) {
        const res = await removeUser(u.id);
        if (res.success) {
          removedCount++;
          setSelected(prev => prev.filter(id => id !== u.id));
        } else if (!failedName) {
          failedName = res.message;
        }
      }
      if (removedCount > 0) {
        showToast(`Removed ${removedCount} account${removedCount > 1 ? 's' : ''}.`, 'success');
      }
    }
    if (failedName) showToast(failedName, 'error');
    setRemoveAction(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1>User Management</h1>
        <p>View all accounts and reset passwords for any user.</p>
      </div>

      {/* Stats Row */}
      <div className="stats-grid">
        {roles.map(r => (
          <div className="stat-card" key={r}>
            <div className="stat-icon" style={{
              background: getRoleAvatarStyle(r).background,
              color: getRoleAvatarStyle(r).color,
              fontSize: '1.2rem',
            }}>
              {r === 'super_admin' ? '👑' : r === 'cr_admin' ? '🏅' : r === 'teacher_admin' ? '👩‍🏫' : '👨‍🎓'}
            </div>
            <div className="stat-info">
              <h3>{roleCounts[r]}</h3>
              <p>{roleLabel(r)}s</p>
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, username or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">All Roles</option>
            {roles.map(r => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
          {hasPermission('remove_users') && selected.length > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setRemoveAction({ type: 'bulk' })}
              disabled={selectedRemovableUsers.length === 0}
              title={selectedRemovableUsers.length === 0 ? 'The selected accounts cannot be removed.' : undefined}
              style={{ alignSelf: 'center' }}
            >
              <Icon name="delete" size={15} /> Remove Selected ({selectedRemovableUsers.length})
            </button>
          )}
        </div>
      </div>


      <div className="panel">
        <div className="panel-header" style={{ gap: '10px' }}>
          {hasPermission('remove_users') && (
            <label className="bulk-check" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                style={{ marginRight: '4px' }}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>All</span>
            </label>
          )}
          <h3>👥 All Users</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            {filteredUsers.length} of {users.length} users
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {filteredUsers.length > 0 ? (
            filteredUsers.map(user => (
              <div
                className="approval-item"
                key={user.id}
                style={{ padding: '14px 20px' }}
              >
                <div className="approval-user">
                  {hasPermission('remove_users') && (
                  <input
                    type="checkbox"
                    checked={selectedSet.has(user.id)}
                    disabled={!removable(user)}
                    onChange={() => toggleSelect(user.id)}
                    title={removable(user) ? 'Select for removal' : 'This account cannot be removed'}
                    style={{ marginRight: '10px', cursor: removable(user) ? 'pointer' : 'not-allowed' }}
                  />
                  )}
                  <div
                    className="student-avatar"
                    style={{
                      width: '44px',
                      height: '44px',
                      fontSize: '0.92rem',
                      ...getRoleAvatarStyle(user.role),
                    }}
                  >
                    {getInitials(user.fullName)}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.92rem' }}>
                      {user.fullName}
                      <span
                        className={getRoleBadgeClass(user.role)}
                        style={{ marginLeft: '8px', verticalAlign: 'middle' }}
                      >
                        {roleLabel(user.role)}
                      </span>
                      {adminRole(user.role) && (
                        <span
                          className={`badge ${user.twoFactorEnabled ? 'success' : 'info'}`}
                          style={{ marginLeft: '6px', fontSize: '0.62rem', padding: '2px 8px', verticalAlign: 'middle' }}
                          title={user.twoFactorEnabled
                            ? 'Two-factor authentication (TOTP) is active for this login'
                            : 'Two-factor authentication is not active for this login'}
                        >
                          {user.twoFactorEnabled ? '2FA On' : '2FA Off'}
                        </span>
                      )}
                      {currentUser?.id === user.id && (
                        <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--primary)', fontWeight: '500' }}>
                          (You)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '2px' }}>
                      {user.username} • {user.email}
                      {user.className ? ` • Class: ${user.className}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {hasPermission('reset_passwords') && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setResetTarget(user)}
                >
                  🔑 Reset
                </button>
                )}
                {hasPermission('reset_2fa') && adminRole(user.role) && (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!user.twoFactorEnabled}
                  title={user.twoFactorEnabled
                    ? "Reset this user's 2FA so they can set it up again on their next login"
                    : 'Two-factor authentication is not active for this user'}
                  onClick={() => setTwoFATarget(user)}
                >
                  🛡️ Reset 2FA
                </button>
                )}
                {hasPermission('remove_users') && removable(user) && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setRemoveAction({ type: 'single', user })}
                >
                  <Icon name="delete" size={15} /> Remove
                </button>
                )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <h3>No users found</h3>
              <p>Try a different search or role filter.</p>
            </div>
          )}
        </div>
      </div>


      {/* Reset confirmation */}
      {resetTarget && (
        <ConfirmDialog
          message={`Reset the password for ${resetTarget.fullName} (@${resetTarget.username})? They will need to sign in with the new default password shown next.`}
          onConfirm={handleReset}
          onCancel={() => setResetTarget(null)}
        />
      )}

      {/* 2FA reset confirmation */}
      {twoFATarget && (
        <ConfirmDialog
          message={`Reset two-factor authentication for ${twoFATarget.fullName} (@${twoFATarget.username})? Their authenticator app will be unlinked and they will be asked to scan a new QR code at their next login.`}
          onConfirm={handleReset2FA}
          onCancel={() => setTwoFATarget(null)}
        />
      )}

      {/* Remove confirmation (single or bulk) */}
      {removeAction && (
        <ConfirmDialog
          message={
            removeAction.type === 'single'
              ? `Remove ${removeAction.user.fullName} (@${removeAction.user.username}) from the system? This permanently deletes their login account and cannot be undone. Students and teachers linked to this account will not be deleted, but they will no longer be able to sign in.`
              : `Remove ${selectedRemovableUsers.length} selected account${selectedRemovableUsers.length === 1 ? '' : 's'} from the system? This permanently deletes their login accounts and cannot be undone. Linked students/teachers will not be deleted, but they will lose access.`
          }
          onConfirm={handleRemove}
          onCancel={() => setRemoveAction(null)}
        />
      )}

      {/* New credentials modal */}
      {newCredentials && (
        <Modal title="Password Reset" onClose={() => setNewCredentials(null)}>
          <div className="auth-success" style={{ marginBottom: '14px' }}>
            ✅ Password reset successful!
          </div>
          <div
            style={{
              background: 'var(--secondary-bg)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '16px 18px',
              marginBottom: '8px',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>
              🔑 New login credentials (share with the user)
            </div>
            <div style={{ fontSize: '0.92rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span><strong>Name:</strong> {newCredentials.fullName}</span>
              <span><strong>Username:</strong> {newCredentials.username}</span>
              <span><strong>Password:</strong> {newCredentials.password}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>
                Sign in with this username (without the @) and password. They can change it after login.
              </span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '10px' }}
              onClick={copyCredentials}
            >
              {copied ? <><Icon name="check" size={14} /> Copied!</> : 'Copy Credentials'}
            </button>
          </div>
          <div className="modal-footer" style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={() => setNewCredentials(null)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ManageUsers;

