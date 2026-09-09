import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';

function Approvals() {
  const { pendingUsers, approveUser, rejectUser, users, roleLabel, hasPermission } = useAuth();
  const { students, addStudent } = useData();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [rejectUserData, setRejectUserData] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const filteredPending = pendingUsers.filter(u => {
    const matchesSearch = !search ||
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !filterRole || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const roles = [...new Set(pendingUsers.map(u => u.role))];

  const handleReject = async () => {
    if (rejectUserData) {
      await rejectUser(rejectUserData.id);
      setRejectUserData(null);
      setSelectedUser(null);
    }
  };

  // Approve and also create student record if role is student
  const handleApprove = async (user) => {
    try {
      // Create student record for approved student
      if (user.role === 'student') {
        const studentExists = students.some(
          s => s.email.toLowerCase() === user.email.toLowerCase() ||
               s.name.toLowerCase() === user.fullName.toLowerCase()
        );
        if (!studentExists) {
          await addStudent({
            name: user.fullName,
            email: user.email,
            phone: '',
            rollNo: `STU-${String(students.length + 1).padStart(3, '0')}`,
            className: user.className || 'BSCS',
            gender: 'Male',
            address: '',
            dateOfBirth: '',
            admissionDate: new Date().toISOString().slice(0, 10),
            status: 'Active'
          });
        }
      }
      await approveUser(user.id);
      setSelectedUser(null);
    } catch (err) {
      showToast(err.message || 'Failed to approve user.', 'error');
    }
  };

  const getRoleBadgeClass = (role) => {
    const classes = {
      super_admin: 'role-badge-admin',
      cr_admin: 'role-badge-cr',
      teacher_admin: 'role-badge-teacher',
      student: 'role-badge-student'
    };
    return `badge ${classes[role] || 'primary'}`;
  };

  const getRoleAvatarClass = (role) => {
    const classes = {
      super_admin: 'avatar-admin',
      cr_admin: 'avatar-cr',
      teacher_admin: 'avatar-teacher',
      student: 'avatar-student'
    };
    return classes[role] || 'avatar-student';
  };

  return (
    <div>
      <div className="page-header">
        <h1>Registration Approvals</h1>
        <p>Review and approve new user registrations for NCBA&E.</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon orange">⏳</div>
          <div className="stat-info">
            <h3>{pendingUsers.length}</h3>
            <p>Pending Approvals</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✓</div>
          <div className="stat-info">
            <h3>{users.filter(u => u.status === 'approved').length}</h3>
            <p>Approved Users</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">✗</div>
          <div className="stat-info">
            <h3>{users.filter(u => u.status === 'rejected').length}</h3>
            <p>Rejected Users</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">👥</div>
          <div className="stat-info">
            <h3>{pendingUsers.filter(u => u.role === 'student').length}</h3>
            <p>Pending Students</p>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search pending registrations..."
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
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>⏳ Pending Registration Requests</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            {filteredPending.length} request(s) awaiting review
          </span>
        </div>
        <div className="panel-body" style={{ padding: '0' }}>
          {filteredPending.length > 0 ? (
            <div>
              {filteredPending.map(user => (
                <div className="approval-item" key={user.id}>
                  <div className="approval-user">
                    <div
                      className={`student-avatar ${getRoleAvatarClass(user.role)}`}
                      style={{
                        width: '46px',
                        height: '46px',
                        fontSize: '1rem',
                      }}
                    >
                      {user.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.92rem' }}>
                        {user.fullName}
                        <span className={getRoleBadgeClass(user.role)} style={{ marginLeft: '8px' }}>
                          {roleLabel(user.role)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                        @{user.username} • {user.email}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--gray)', marginTop: '2px' }}>
                        {user.className ? `Class: ${user.className}` : ''}
                        {user.className ? ' • ' : ''}Registered: {user.registrationDate}
                      </div>
                    </div>
                  </div>
                  <div className="approval-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUser(user)}>
                      <Icon name="view" size={15} /> Review
                    </button>
                    {hasPermission('approve_users') && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleApprove(user)}
                      >
                        <Icon name="check" size={15} /> Approve
                      </button>
                    )}
                    {hasPermission('approve_users') && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setRejectUserData(user)}
                      >
                        <Icon name="x" size={15} /> Reject
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="icon">✅</div>
              <h3>No pending registrations</h3>
              <p>All registration requests have been reviewed.</p>
            </div>
          )}
        </div>
      </div>

      {/* Approved Users List */}
      <div className="panel">
        <div className="panel-header">
          <h3>✓ Registered Users</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            {users.length} total users
          </span>
        </div>
        <div className="panel-body" style={{ padding: '0' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="student-cell">
                        <div className={`student-avatar ${getRoleAvatarClass(user.role)}`}>
                          {user.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="name">{user.fullName}</div>
                          <div className="sub">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>@{user.username}</td>
                    <td>
                      <span className={getRoleBadgeClass(user.role)}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${user.status === 'approved' ? 'success' : 'danger'}`}>
                        {user.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td>{user.registrationDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registration Details</h3>
              <button className="modal-close" onClick={() => setSelectedUser(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div
                  className={`student-avatar-large ${getRoleAvatarClass(selectedUser.role)}`}
                  style={{ margin: '0 auto 10px', width: '80px', height: '80px', fontSize: '1.8rem' }}
                >
                  {selectedUser.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <h3 style={{ fontSize: '1.1rem' }}>{selectedUser.fullName}</h3>
                <span className={getRoleBadgeClass(selectedUser.role)}>
                  {roleLabel(selectedUser.role)}
                </span>
              </div>
              <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div className="detail-item">
                  <span className="label">Username</span>
                  <span className="value">@{selectedUser.username}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Email</span>
                  <span className="value">{selectedUser.email}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Role</span>
                  <span className="value">{roleLabel(selectedUser.role)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Class</span>
                  <span className="value">{selectedUser.className || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Registered</span>
                  <span className="value">{selectedUser.registrationDate}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedUser(null)}>Close</button>
              {hasPermission('approve_users') && (
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    setRejectUserData(selectedUser);
                    setSelectedUser(null);
                  }}
                >
                  <Icon name="x" size={15} /> Reject
                </button>
              )}
              {hasPermission('approve_users') && (
                <button
                  className="btn btn-success"
                  onClick={() => {
                    handleApprove(selectedUser);
                  }}
                >
                  <Icon name="check" size={15} /> Approve
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation */}
      {rejectUserData && (
        <ConfirmDialog
          message={`Are you sure you want to reject the registration of ${rejectUserData.fullName}? They will not be able to log in.`}
          onConfirm={handleReject}
          onCancel={() => setRejectUserData(null)}
        />
      )}
    </div>
  );
}

export default Approvals;