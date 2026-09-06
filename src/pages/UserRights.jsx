import { Fragment, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

// Permission matrix: which roles have each right.
// Right objects group the system's actual capabilities by module.
const rightsData = [
  {
    module: 'Dashboard',
    icon: '📊',
    rights: [
      { key: 'view_dashboard', label: 'View Dashboard', roles: ['super_admin', 'cr_admin', 'teacher_admin', 'student'] },
    ],
  },
  {
    module: 'Students',
    icon: '👨‍🎓',
    rights: [
      { key: 'view_students', label: 'View Student List', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'add_students', label: 'Add Student', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'edit_students', label: 'Edit Student', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'delete_students', label: 'Delete Student', roles: ['super_admin'] },
    ],
  },
  {
    module: 'Teachers',
    icon: '👩‍🏫',
    rights: [
      { key: 'view_teachers', label: 'View Teacher List', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'add_teachers', label: 'Add Teacher', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'edit_teachers', label: 'Edit Teacher', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'delete_teachers', label: 'Delete Teacher', roles: ['super_admin'] },
    ],
  },
  {
    module: 'Subjects',
    icon: '📚',
    rights: [
      { key: 'view_subjects', label: 'View Subjects', roles: ['super_admin', 'cr_admin', 'teacher_admin', 'student'] },
      { key: 'add_subjects', label: 'Add Subject', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'edit_subjects', label: 'Edit Subject', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'delete_subjects', label: 'Delete Subject', roles: ['super_admin'] },
    ],
  },
  {
    module: 'Classes',
    icon: '🏫',
    rights: [
      { key: 'view_classes', label: 'View Classes', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'add_classes', label: 'Add Class', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'edit_classes', label: 'Edit Class', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'delete_classes', label: 'Delete Class', roles: ['super_admin'] },
    ],
  },
  {
    module: 'Student Marks',
    icon: '📝',
    rights: [
      { key: 'view_marks', label: 'View Marks', roles: ['super_admin', 'cr_admin', 'teacher_admin', 'student'] },
      { key: 'record_marks', label: 'Record / Edit Marks', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'delete_marks', label: 'Delete Marks', roles: ['super_admin'] },
    ],
  },
  {
    module: 'Approvals',
    icon: '✅',
    rights: [
      { key: 'approve_users', label: 'Approve / Reject Registrations', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
    ],
  },
  {
    module: 'User Management',
    icon: '🔑',
    rights: [
      { key: 'view_users', label: 'View All Users', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'reset_passwords', label: 'Reset Passwords', roles: ['super_admin'] },
      { key: 'create_accounts', label: 'Create User Accounts', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'remove_users', label: 'Remove User Accounts', roles: ['super_admin'] },
    ],
  },
  {
    module: 'CR Management',
    icon: '👥',
    rights: [
      { key: 'assign_cr', label: 'Assign / Remove CR', roles: ['super_admin', 'cr_admin'] },
    ],
  },
  {
    module: 'Todo List',
    icon: '📋',
    rights: [
      { key: 'view_todo_list', label: 'View Todo List', roles: ['super_admin', 'cr_admin', 'student'] },
      { key: 'manage_todo_list', label: 'Manage Todo List (Add / Edit / Delete)', roles: ['super_admin', 'cr_admin', 'student'] },
    ],
  },
  {
    module: 'Class Schedule',
    icon: '🗓️',
    rights: [
      { key: 'view_class_schedule', label: 'View Class Schedule', roles: ['super_admin', 'cr_admin', 'teacher_admin', 'student'] },
      { key: 'edit_class_schedule', label: 'Edit Class Schedule', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
    ],
  },
  {
    module: 'Student Cards',
    icon: '🪪',
    rights: [
      { key: 'view_student_cards', label: 'View Student Cards (All)', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'upload_card_photos', label: 'Upload Card Photos for Students', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'approve_card_photos', label: 'Approve / Reject Card Photo (Issue Card)', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'view_own_card', label: 'View My ID Card', roles: ['student', 'cr_admin'] },
      { key: 'upload_own_card_photo', label: 'Upload My Own Card Photo', roles: ['student', 'cr_admin'] },
    ],
  },
  {
    module: 'Teacher Cards',
    icon: '🧑‍🏫',
    rights: [
      { key: 'view_teacher_cards', label: 'View Teacher Cards (All)', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'upload_teacher_card_photos', label: 'Upload Card Photos for Teachers', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'approve_teacher_card_photos', label: 'Approve / Reject Teacher Card Photo', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'view_own_teacher_card', label: 'View My Teacher ID Card', roles: ['teacher_admin'] },
      { key: 'upload_own_teacher_card_photo', label: 'Upload My Own Teacher Card Photo', roles: ['teacher_admin'] },
    ],
  },
  {
    module: 'Attendance',
    icon: '📍',
    rights: [
      { key: 'view_attendance', label: 'View Attendance', roles: ['super_admin', 'cr_admin', 'teacher_admin', 'student'] },
      { key: 'mark_attendance', label: 'Mark Attendance', roles: ['super_admin', 'student'] },
      { key: 'manage_geofences', label: 'Manage Geofences (Map Areas)', roles: ['super_admin', 'cr_admin'] },
      { key: 'approve_attendance', label: 'Approve / Reject Attendance', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'view_attendance_report', label: 'View Attendance Report & Export', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
      { key: 'view_own_attendance', label: 'View My Attendance (Self)', roles: ['super_admin', 'student'] },
    ],
  },
  {
    module: 'Chat',
    icon: '💬',
    rights: [
      { key: 'use_chat', label: 'Access Chat', roles: ['super_admin', 'cr_admin', 'teacher_admin', 'student'] },
      { key: 'post_announcements', label: 'Post Announcements', roles: ['super_admin', 'cr_admin', 'teacher_admin'] },
    ],
  },
];

// Role display config: title, icon, color used for the summary + matrix columns
const roleConfig = {
  super_admin: { label: 'Super Admin', icon: '👑', cls: 'avatar-admin' },
  cr_admin: { label: 'CR Admin', icon: '🤝', cls: 'avatar-cr' },
  teacher_admin: { label: 'Teacher Admin', icon: '👩🏫', cls: 'avatar-teacher' },
  student: { label: 'Student', icon: '🎓', cls: 'avatar-student' },
};

function UserRights() {
  const {
    currentUser,
    users,
    isSuperAdmin,
    roleLabel,
    roleHasRight,
    hasPermission,
    setRolePermission,
    resetRolePermissions,
    userPermissions,
    setUserPermission,
    resetUserPermissions,
  } = useAuth();
  const showToast = useToast();
  const isAdminUser = isSuperAdmin();

  // ── Role-level state ──
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [draft, setDraft] = useState({});

  const hasRight = (right, role) => roleHasRight(role, right.key);
  const cellValue = (right, role) => {
    const key = `${right.key}:${role}`;
    return key in draft ? draft[key] : hasRight(right, role);
  };
  const isCellDirty = (right, role) => {
    const key = `${right.key}:${role}`;
    return key in draft && draft[key] !== hasRight(right, role);
  };
  const toggleDraft = (right, role, granted) => {
    const key = `${right.key}:${role}`;
    setDraft(prev => {
      const next = { ...prev };
      if (granted === hasRight(right, role)) delete next[key];
      else next[key] = granted;
      return next;
    });
  };
  const handleSave = async () => {
    const entries = Object.entries(draft);
    if (entries.length === 0) { showToast('No changes to save.', 'info'); return; }
    for (const [key, granted] of entries) {
      const [rightKey, role] = key.split(':');
      await setRolePermission(role, rightKey, granted);
    }
    setDraft({});
    showToast('Permission changes saved successfully!', 'success');
  };
  const handleDiscard = () => {
    if (Object.keys(draft).length === 0) return;
    setDraft({});
    showToast('Changes discarded.', 'info');
  };
  const isDirty = Object.keys(draft).length > 0;
  const totalRights = role =>
    rightsData.flatMap(m => m.rights).filter(r => roleHasRight(role, r.key)).length;

  // ── Per-user state ──
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userDraft, setUserDraft] = useState({});
  const [userRoleFilter, setUserRoleFilter] = useState('');

  const selectedUser = users.find(u => u.id === selectedUserId);

  // Effective value for a per-user cell: user override → role default
  const userCellValue = (right, userObj) => {
    const key = `${right.key}:${userObj.id}`;
    if (key in userDraft) return userDraft[key];
    const userOverride = userPermissions?.[userObj.id]?.[right.key];
    if (userOverride !== undefined) return userOverride;
    return roleHasRight(userObj.role, right.key);
  };
  const isUserCellDirty = (right, userObj) => {
    const key = `${right.key}:${userObj.id}`;
    if (!(key in userDraft)) return false;
    const userOverride = userPermissions?.[userObj.id]?.[right.key];
    const effective = userOverride !== undefined ? userOverride : roleHasRight(userObj.role, right.key);
    return userDraft[key] !== effective;
  };
  const isUserCellOverridden = (right, userObj) => {
    const userOverride = userPermissions?.[userObj.id]?.[right.key];
    return userOverride !== undefined;
  };
  const toggleUserDraft = (right, userObj, granted) => {
    const key = `${right.key}:${userObj.id}`;
    setUserDraft(prev => {
      const next = { ...prev };
      const userOverride = userPermissions?.[userObj.id]?.[right.key];
      const effective = userOverride !== undefined ? userOverride : roleHasRight(userObj.role, right.key);
      if (granted === effective) delete next[key];
      else next[key] = granted;
      return next;
    });
  };
  const handleUserSave = async () => {
    if (!selectedUserId) return;
    const entries = Object.entries(userDraft);
    if (entries.length === 0) { showToast('No user-level changes to save.', 'info'); return; }
    for (const [key, granted] of entries) {
      const [rightKey, userId] = key.split(':');
      await setUserPermission(Number(userId), rightKey, granted);
    }
    setUserDraft({});
    showToast(`Permissions updated for ${selectedUser?.fullName || 'user'}.`, 'success');
  };
  const handleUserDiscard = () => {
    if (Object.keys(userDraft).length === 0) return;
    setUserDraft({});
    showToast('User changes discarded.', 'info');
  };
  const isUserDirty = Object.keys(userDraft).length > 0;

  const filteredUsers = users.filter(u => {
    const matchesSearch = !userSearch ||
      u.fullName?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username?.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = !userRoleFilter || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const roles = ['super_admin', 'cr_admin', 'teacher_admin', 'student'];

  // Right groups filtered by the active search term
  const filteredRights = rightsData
    .map(group => ({
      ...group,
      rights: group.rights.filter(
        r =>
          !searchTerm ||
          r.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.key.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    }))
    .filter(group => group.rights.length > 0);

  return (
    <div>
      <div className="page-header">
        <h1>User Rights Management</h1>
        <p>Overview of the access rights assigned to each role — CR vs Teacher comparison.</p>
        {isAdminUser && (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Search bar */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="search-input"
                placeholder="Search by right name, e.g. 'View Student List' or 'students'…"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setSearchTerm(e.target.value);
                }}
                style={{ maxWidth: '340px' }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSearchTerm(searchInput)}
                title="Filter the matrix to matching rights"
              >
                🔍 Search
              </button>
              {searchTerm && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSearchTerm('');
                    setSearchInput('');
                  }}
                  title="Clear the search filter"
                >
                  ✕ Clear
                </button>
              )}
              <span className="badge warning" style={{ padding: '6px 14px', fontSize: '0.75rem' }}>
                ✏️ Tick the boxes then click <strong>Save Changes</strong> to apply.
              </span>
            </div>

            {/* Save / discard action row */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {isDirty && (
                <span className="badge info" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  ⏳ {Object.keys(draft).length} unsaved change{Object.keys(draft).length === 1 ? '' : 's'}
                </span>
              )}
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
                💾 Save Changes
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleDiscard}
                disabled={!isDirty}
              >
                ↩ Discard
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  resetRolePermissions();
                  setDraft({});
                  showToast('All rights reset to defaults.', 'success');
                }}
              >
                ↺ Reset to Defaults
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary comparison cards: how many rights per role */}
      <div className="stats-grid">
        {roles.map(role => {
          const cfg = roleConfig[role];
          const count = totalRights(role);
          return (
            <div className="stat-card" key={role}>
              <div className="stat-icon" style={{ background: 'var(--primary-bg)', color: 'var(--primary)' }}>
                {cfg.icon}
              </div>
              <div className="stat-info">
                <h3>{count} rights</h3>
                <p>{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Header highlight: CR vs Teacher totals */}
      <div className="panel" style={{ marginBottom: '25px' }}>
        <div className="panel-header">
          <h3>⚖️ CR Admin vs Teacher Admin</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            Rights comparison for the two main admin roles
          </span>
        </div>
        <div className="panel-body" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: 'var(--secondary-bg)', borderRadius: '12px' }}>
            <div className="student-avatar avatar-cr" style={{ width: '52px', height: '52px', fontSize: '1.3rem' }}>🤝</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--secondary)' }}>CR Admin</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{totalRights('cr_admin')} access rights</div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--secondary)' }}>{totalRights('cr_admin')}</div>
          </div>

          <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: 'var(--accent-bg)', borderRadius: '12px' }}>
            <div className="student-avatar avatar-teacher" style={{ width: '52px', height: '52px', fontSize: '1.3rem' }}>👩‍🏫</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--accent)' }}>Teacher Admin</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{totalRights('teacher_admin')} access rights</div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--accent)' }}>{totalRights('teacher_admin')}</div>
          </div>
        </div>
      </div>

      {/* Full rights table */}
      <div className="panel">
        <div className="panel-header">
          <h3>📋 Complete Permission Matrix</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            {isAdminUser ? 'Tick the boxes, then click Save Changes to apply' : '✓ = right granted'}
          </span>
        </div>
        <div className="panel-body" style={{ padding: '0' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Right</th>
                  {roles.map(role => (
                    <th key={role} style={{ textAlign: 'center' }}>
                      {roleConfig[role] ? roleConfig[role].icon + ' ' + roleConfig[role].label : roleLabel(role)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRights.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--gray)' }}>
                      No rights match "<strong>{searchTerm}</strong>". Try a different search or click <strong>Clear</strong>.
                    </td>
                  </tr>
                )}
                {filteredRights.map(group => (
                  <Fragment key={group.module}>
                    <tr style={{ background: 'var(--light-gray)' }}>
                      <td colSpan={5} style={{ fontWeight: '700', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--dark)' }}>
                        {group.icon} {group.module}
                      </td>
                    </tr>
                    {group.rights.map(right => (
                      <tr key={right.key}>
                        <td>{right.label}</td>
                        {roles.map(role => {
                          const granted = cellValue(right, role);
                          const dirty = isCellDirty(right, role);
                          const editable = isAdminUser;
                          return (
                            <td
                              key={role}
                              style={{
                                textAlign: 'center',
                                background: dirty ? 'rgba(22, 163, 74, 0.12)' : 'transparent',
                                borderRadius: dirty ? '8px' : '0',
                              }}
                              title={dirty ? 'Unsaved change' : undefined}
                            >
                              {editable ? (
                                <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }} title={granted ? 'Click to remove this right' : 'Click to grant this right'}>
                                  <input
                                    type="checkbox"
                                    checked={granted}
                                    onChange={() => toggleDraft(right, role, !granted)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--success)' }}
                                  />
                                </label>
                              ) : granted ? (
                                <span style={{ color: 'var(--success)', fontWeight: '700', fontSize: '1.05rem' }}>✓</span>
                              ) : (
                                <span style={{ color: 'var(--gray)', fontSize: '1rem' }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══ Per-User Permission Overrides ═══ */}
      {isAdminUser && (
        <PerUserRightsSection
          users={users}
          roles={roles}
          rightsData={rightsData}
          roleLabel={roleLabel}
          roleHasRight={roleHasRight}
          userPermissions={userPermissions}
          setUserPermission={setUserPermission}
          resetUserPermissions={resetUserPermissions}
        />
      )}

      {/* Note for non-super-admins */}
      {!isAdminUser && (
        <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--gray)' }}>
          You are viewing the rights matrix as <strong>{roleLabel(currentUser?.role)}</strong>. Only the Super Admin
          can edit rights. Ticked changes are applied when the Super Admin clicks <strong>Save Changes</strong>.
        </p>
      )}
    </div>
  );
}

// ── Per-User Permission Overrides ──
function PerUserRightsSection({ users, roles, rightsData, roleLabel, roleHasRight, userPermissions, setUserPermission, resetUserPermissions }) {
  const showToast = useToast();
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userDraft, setUserDraft] = useState({});
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [rightSearchInput, setRightSearchInput] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const selUser = users.find(u => u.id === selectedUserId);

  const uVal = (r, u) => {
    const k = `${r.key}:${u.id}`;
    if (k in userDraft) return userDraft[k];
    const ov = userPermissions?.[u.id]?.[r.key];
    return ov !== undefined ? ov : roleHasRight(u.role, r.key);
  };
  const uDirty = (r, u) => {
    const k = `${r.key}:${u.id}`;
    if (!(k in userDraft)) return false;
    const ov = userPermissions?.[u.id]?.[r.key];
    return userDraft[k] !== (ov !== undefined ? ov : roleHasRight(u.role, r.key));
  };
  const uOv = (r, u) => userPermissions?.[u.id]?.[r.key] !== undefined;
  const toggleU = (r, u, g) => {
    const k = `${r.key}:${u.id}`;
    setUserDraft(p => {
      const n = { ...p };
      const ov = userPermissions?.[u.id]?.[r.key];
      const eff = ov !== undefined ? ov : roleHasRight(u.role, r.key);
      if (g === eff) delete n[k]; else n[k] = g;
      return n;
    });
  };
  const saveU = async () => {
    if (!selectedUserId) return;
    const e = Object.entries(userDraft);
    if (!e.length) { showToast('No changes to save.', 'info'); return; }
    for (const [k, g] of e) { const [rk, uid] = k.split(':'); await setUserPermission(Number(uid), rk, g); }
    setUserDraft({});
    showToast(`Permissions updated for ${selUser?.fullName}.`, 'success');
  };
  const unsavedCount = Object.keys(userDraft).length;
  const filtU = users.filter(u => {
    const ms = !userSearch || u.fullName?.toLowerCase().includes(userSearch.toLowerCase()) || u.username?.toLowerCase().includes(userSearch.toLowerCase());
    return ms && (!userRoleFilter || u.role === userRoleFilter);
  });

  // Filter rights by search term for the per-user permission table
  const filteredRightsForUser = rightsData
    .map(group => ({
      ...group,
      rights: group.rights.filter(
        r =>
          !rightSearch ||
          r.label.toLowerCase().includes(rightSearch.toLowerCase()) ||
          r.key.toLowerCase().includes(rightSearch.toLowerCase())
      ),
    }))
    .filter(group => group.rights.length > 0);

  const roleColorMap = {
    super_admin:    { bg: 'var(--primary-bg)', fg: 'var(--primary)' },
    cr_admin:       { bg: 'var(--role-cr-admin-bg)', fg: 'var(--role-cr-admin-fg)' },
    teacher_admin:  { bg: 'var(--role-teacher-admin-bg)', fg: 'var(--role-teacher-admin-fg)' },
    student:        { bg: 'var(--success-bg)', fg: 'var(--success)' },
  };

  return (
    <div style={{ marginTop: '32px' }}>
      <div className="panel">
        <div className="panel-header">
          <h3>👤 Per-User Permission Overrides</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            Override specific permissions for individual users beyond their role defaults
          </span>
        </div>

        <div className="panel-body">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search users by name or username…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              style={{ flex: '1 1 240px', maxWidth: '340px' }}
            />
            <select
              className="filter-select"
              value={userRoleFilter}
              onChange={e => setUserRoleFilter(e.target.value)}
              style={{ minWidth: '160px' }}
            >
              <option value="">All Roles</option>
              {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>

          {/* User Chips */}
          <div style={{
            display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px',
            maxHeight: '160px', overflowY: 'auto', padding: '4px 0',
          }}>
            {filtU.length === 0 && (
              <div style={{
                width: '100%', textAlign: 'center', padding: '16px',
                color: 'var(--gray)', fontSize: '0.82rem',
                background: 'var(--light-gray)', borderRadius: '10px',
              }}>
                No users match your search.
              </div>
            )}
            {filtU.map(u => {
              const isS = selectedUserId === u.id;
              const oc = userPermissions?.[u.id] ? Object.keys(userPermissions[u.id]).length : 0;
              const rc = roleColorMap[u.role] || roleColorMap.student;
              return (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUserId(u.id); setUserDraft({}); setRightSearch(''); setRightSearchInput(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', borderRadius: '12px',
                    border: `2px solid ${isS ? 'var(--primary)' : 'var(--border)'}`,
                    background: isS ? 'var(--primary-bg)' : 'var(--white)',
                    color: 'var(--dark)',
                    cursor: 'pointer', fontSize: '0.82rem',
                    fontWeight: isS ? '700' : '500', transition: 'all 0.2s ease',
                    boxShadow: isS ? '0 0 0 3px var(--selection-ring)' : 'var(--shadow-sm)',
                  }}
                >
                  <span style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: rc.bg, color: rc.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: '700', flexShrink: 0,
                  }}>
                    {u.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span style={{ lineHeight: 1.2 }}>{u.fullName}</span>
                  <span style={{
                    fontSize: '0.68rem', color: rc.fg, background: rc.bg,
                    padding: '2px 8px', borderRadius: '12px', fontWeight: '600',
                    textTransform: 'capitalize',
                  }}>
                    {roleLabel(u.role)}
                  </span>
                  {oc > 0 && (
                    <span className="badge warning" style={{ padding: '2px 8px', fontSize: '0.65rem' }}>
                      {oc} override{oc > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected User Content */}
          {selUser ? (
            <>
              {/* User Info Header Bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 18px', background: 'var(--light-gray)',
                borderRadius: '10px', marginBottom: '16px', flexWrap: 'wrap',
              }}>
                <span style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  background: (roleColorMap[selUser.role] || roleColorMap.student).bg,
                  color: (roleColorMap[selUser.role] || roleColorMap.student).fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.82rem', fontWeight: '700', flexShrink: 0,
                }}>
                  {selUser.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--dark)' }}>
                    {selUser.fullName}
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                    {roleLabel(selUser.role)} — Overrides role defaults for this user only.
                  </span>
                </div>
                <span style={{
                  fontSize: '0.72rem', color: 'var(--gray)',
                  background: 'var(--white)', padding: '4px 10px',
                  borderRadius: '8px', border: '1px solid var(--border)',
                }}>
                  {Object.keys(userPermissions?.[selUser.id] || {}).length} active override{Object.keys(userPermissions?.[selUser.id] || {}).length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Action Bar (unsaved changes) */}
              {unsavedCount > 0 && (
                <div style={{
                  display: 'flex', gap: '10px', alignItems: 'center',
                  padding: '12px 16px', marginBottom: '16px',
                  background: 'var(--info-bg)', borderRadius: '10px',
                  border: '1px solid var(--info-bar-border)',
                }}>
                  <span className="badge info" style={{ padding: '5px 14px', fontSize: '0.75rem' }}>
                    ⏳ {unsavedCount} unsaved override{unsavedCount > 1 ? 's' : ''}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary btn-sm" onClick={saveU}>💾 Save Overrides</button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setUserDraft({}); showToast('Discarded.', 'info'); }}
                    >
                      ↩ Discard
                    </button>
                  </div>
                </div>
              )}

              {/* Rights Search */}
              <div style={{
                display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
                marginBottom: '14px',
              }}>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search permissions, e.g. 'View Students' or 'todo'…"
                  value={rightSearchInput}
                  onChange={e => {
                    setRightSearchInput(e.target.value);
                    setRightSearch(e.target.value);
                  }}
                  style={{ flex: '1 1 240px', maxWidth: '380px' }}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRightSearch(rightSearchInput)}
                  title="Filter permissions to matching rights"
                >
                  🔍 Search
                </button>
                {rightSearch && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setRightSearch(''); setRightSearchInput(''); }}
                    title="Clear the permission search filter"
                  >
                    ✕ Clear
                  </button>
                )}
                {rightSearch && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                    Showing {filteredRightsForUser.reduce((n, g) => n + g.rights.length, 0)} of {rightsData.reduce((n, g) => n + g.rights.length, 0)} permissions
                  </span>
                )}
              </div>

              {/* Permission Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '200px' }}>Permission</th>
                      <th style={{ textAlign: 'center', width: '110px' }}>Role Default</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Override</th>
                      <th style={{ textAlign: 'center', width: '110px' }}>Effective</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRightsForUser.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--gray)' }}>
                          No permissions match "<strong>{rightSearch}</strong>". Try a different search or click <strong>Clear</strong>.
                        </td>
                      </tr>
                    )}
                    {filteredRightsForUser.map(g => (
                      <Fragment key={g.module}>
                        <tr style={{ background: 'var(--light-gray)' }}>
                          <td colSpan={4} style={{
                            fontWeight: '700', fontSize: '0.78rem', textTransform: 'uppercase',
                            letterSpacing: '0.4px', color: 'var(--dark)', padding: '10px 16px',
                          }}>
                            {g.icon} {g.module}
                          </td>
                        </tr>
                        {g.rights.map(right => {
                          const rd = roleHasRight(selUser.role, right.key);
                          const ov = userPermissions?.[selUser.id]?.[right.key];
                          const eff = uVal(right, selUser);
                          const dr = uDirty(right, selUser);
                          const isOv = uOv(right, selUser);
                          return (
                            <tr key={right.key} style={dr ? { background: 'var(--dirty-row-bg)' } : undefined}>
                              <td style={{ fontWeight: '500' }}>{right.label}</td>
                              <td style={{ textAlign: 'center' }}>
                                {rd
                                  ? <span className="badge success" style={{ fontSize: '0.68rem', padding: '3px 10px' }}>✓ Yes</span>
                                  : <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>
                                }
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {isOv ? (
                                  <span
                                    className={`badge ${ov ? 'success' : 'danger'}`}
                                    style={{ fontSize: '0.68rem', padding: '3px 10px', fontWeight: '700' }}
                                  >
                                    {ov ? '✓ GRANTED' : '✕ REVOKED'}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>
                                )}
                              </td>
                              <td style={{
                                textAlign: 'center',
                                background: dr ? 'var(--dirty-cell-bg)' : 'transparent',
                                borderRadius: dr ? '8px' : '0',
                                position: 'relative',
                              }} title={dr ? 'Unsaved change' : undefined}>
                                <label style={{
                                  cursor: 'pointer', display: 'inline-flex',
                                  width: '34px', height: '34px', alignItems: 'center',
                                  justifyContent: 'center', borderRadius: '8px',
                                  background: dr ? 'var(--dirty-cell-bg)' : 'transparent',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={eff}
                                    onChange={() => toggleU(right, selUser, !eff)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--success)' }}
                                  />
                                </label>
                                {dr && (
                                  <span style={{
                                    position: 'absolute', top: '4px', right: '8px',
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: 'var(--warning)',
                                  }} title="Unsaved" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Reset Button */}
              <div style={{
                marginTop: '16px', padding: '14px 18px',
                background: 'var(--light-gray)', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                  Remove all individual overrides for this user and revert to role defaults.
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { resetUserPermissions(); setUserDraft({}); showToast('All user overrides reset.', 'success'); }}
                >
                  ↺ Reset All User Overrides
                </button>
              </div>
            </>
          ) : (
            /* Empty State */
            <div style={{
              textAlign: 'center', padding: '48px 24px', color: 'var(--gray)',
              background: 'var(--light-gray)', borderRadius: '12px',
              border: '2px dashed var(--border)',
            }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}>👆</span>
              <span style={{ fontSize: '0.92rem', fontWeight: '600', display: 'block', marginBottom: '4px', color: 'var(--dark)' }}>
                Select a user to manage permissions
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                Choose a user from the list above to view and override their individual permissions.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserRights;

