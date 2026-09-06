import { useState } from 'react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useData } from '../context/DataContext';
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

function ManageCR() {
  const { students, updateStudent } = useData();
  const { users, assignCR, removeCR } = useAuth();
  const showToast = useToast();

  const [assigningClass, setAssigningClass] = useState(null); // class being assigned
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null); // student to demote
  const [createdAccount, setCreatedAccount] = useState(null); // newly created credentials
  const [copied, setCopied] = useState(false);
  const [assigningHead, setAssigningHead] = useState(false); // head CR modal open
  const [headStudentId, setHeadStudentId] = useState(null); // selected student in head CR modal

  // Group students by class
  const classGroups = students.reduce((acc, s) => {
    if (!acc[s.className]) acc[s.className] = [];
    acc[s.className].push(s);
    return acc;
  }, {});

  const classNames = Object.keys(classGroups).sort();

  // Current CRs (students flagged as isCR)
  const crStudents = students.filter(s => s.isCR);
  const crByClass = {};
  crStudents.forEach(s => { crByClass[s.className] = s; });

  // Head CR (manages ALL classes)
  const headCRUser = users.find(u => u.role === 'cr_admin' && !!u.manageAllClasses);
  const headCRStudent = headCRUser
    ? students.find(s => s.id === headCRUser.linkedStudentId ||
        (headCRUser.fullName && s.name.toLowerCase() === headCRUser.fullName.toLowerCase()))
    : null;

  // Find linked user account for a student
  const findAccount = (student) => users.find(u =>
    u.linkedStudentId === student.id ||
    (student.email && u.email && u.email.toLowerCase() === student.email.toLowerCase())
  );

  const openAssign = (className) => {
    setAssigningClass(className);
    setSelectedStudentId(null);
    setCreatedAccount(null);
  };

  const handleAssign = async () => {
    const chosen = (classGroups[assigningClass] || []).find(s => s.id === selectedStudentId);
    if (!chosen) return;

    try {
      // Demote previous CR of that class
      const prevCR = crByClass[assigningClass];
      if (prevCR && prevCR.id !== chosen.id) {
        await updateStudent(prevCR.id, { isCR: false });
      }

      const result = await assignCR(chosen);

      if (result.success) {
        await updateStudent(chosen.id, { isCR: true });
        if (result.created) {
          setCreatedAccount(result.account);
          setCopied(false);
        } else {
          showToast(`${chosen.name} is now the Class Representative of ${assigningClass}.`, 'success');
          setAssigningClass(null);
        }
      } else {
        showToast(result.message || 'Could not assign CR. Please try again.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'An error occurred while assigning CR.', 'error');
    }
  };

  const openAssignHead = () => {
    setAssigningHead(true);
    setHeadStudentId(null);
    setCreatedAccount(null);
  };

  const handleAssignHead = async () => {
    const chosen = students.find(s => s.id === headStudentId);
    if (!chosen) return;

    try {
      // Demote the previous head CR if different
      if (headCRStudent && headCRStudent.id !== chosen.id) {
        await updateStudent(headCRStudent.id, { isCR: false });
      }

      const result = await assignCR(chosen, { manageAllClasses: true });

      if (result.success) {
        await updateStudent(chosen.id, { isCR: true });
        if (result.created) {
          setCreatedAccount(result.account);
          setCopied(false);
        } else {
          showToast(`${chosen.name} is now the Head CR managing all classes.`, 'success');
          setAssigningHead(false);
        }
      } else {
        showToast(result.message || 'Could not assign Head CR. Please try again.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'An error occurred while assigning Head CR.', 'error');
    }
  };

  const copyCredentials = () => {
    if (!createdAccount) return;
    try {
      navigator.clipboard.writeText(
        `Username: ${createdAccount.username}\nPassword: ${createdAccount.password}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy. Please note the credentials manually.', 'warning');
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await updateStudent(removeTarget.id, { isCR: false });
      await removeCR(removeTarget);
      setRemoveTarget(null);
    } catch (err) {
      showToast(err.message || 'An error occurred while removing CR.', 'error');
    }
  };

  const totalCRs = crStudents.length;
  const classesWithCR = Object.keys(crByClass).length;

  return (
    <div>
      <div className="page-header">
        <h1>CR Management</h1>
        <p>
          Assign a Class Representative (CR) for each class. The selected student gets an
          auto-approved <strong>CR Admin</strong> account with manage access to their class.
          You can also assign one <strong>Head CR</strong> who manages all classes.
        </p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">🏫</div>
          <div className="stat-info">
            <h3>{classNames.length}</h3>
            <p>Total Classes</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">👥</div>
          <div className="stat-info">
            <h3>{totalCRs}</h3>
            <p>CRs Assigned</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">✅</div>
          <div className="stat-info">
            <h3>{classesWithCR}/{classNames.length}</h3>
            <p>Classes With CR</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">📋</div>
          <div className="stat-info">
            <h3>{classNames.length - classesWithCR}</h3>
            <p>Classes Without CR</p>
          </div>
        </div>
      </div>

      {/* Head CR panel */}
      <div
        className="panel"
        style={{ borderLeft: headCRStudent ? '4px solid var(--secondary)' : '4px solid var(--border)', marginBottom: '22px' }}
      >
        <div className="panel-header">
          <h3>⭐ Head CR <span className="role-pill role-badge-cr">Manages All Classes</span></h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
            The Head CR oversees every class's CR
          </span>
        </div>
        <div className="panel-body">
          <div
            style={{
              background: 'var(--secondary-bg)',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '14px'
            }}
          >
            {headCRStudent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="student-avatar" style={{ background: 'var(--secondary)', color: '#fff' }}>
                  {getInitials(headCRStudent.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>
                    {headCRStudent.name} <span className="role-pill role-badge-cr">Head CR</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                    Class: {headCRStudent.className} • Roll: {headCRStudent.rollNo}
                  </div>
                  {headCRUser && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                      Account: <strong>@{headCRUser.username}</strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🚫</span> No Head CR assigned. Assign a student who will manage all classes.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn-add btn-add-sm" onClick={openAssignHead}>
              <span className="add-icon">+</span>
              <span className="add-text">{headCRStudent ? 'Change Head CR' : 'Assign Head CR'}</span>
            </button>
            {headCRStudent && headCRUser && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setRemoveTarget({
                    ...headCRStudent,
                    className: 'All Classes',
                  });
                }}
              >
                <Icon name="delete" size={14} /> Remove Head CR
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Class list */}
      <div className="detail-grid">
        {classNames.map(className => {
          const classStudents = classGroups[className];
          const crStudent = crByClass[className];
          const crAccount = crStudent ? findAccount(crStudent) : null;

          return (
            <div
              className="panel"
              key={className}
              style={{ borderLeft: crStudent ? '4px solid var(--success)' : '4px solid var(--border)' }}
            >
              <div className="panel-header">
                <h3>🏫 {className}</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                  {classStudents.length} students
                </span>
              </div>
              <div className="panel-body">
                <div
                  style={{
                    background: 'var(--light-gray)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '14px'
                  }}
                >
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Current Class Representative
                  </div>
                  {crStudent ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        className="student-avatar"
                        style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                      >
                        {getInitials(crStudent.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>{crStudent.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                          Roll: {crStudent.rollNo}
                        </div>
                        {crAccount && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                            Account: <strong>@{crAccount.username}</strong> <span className="role-pill role-badge-cr">CR Admin</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🚫</span> No CR assigned yet
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="btn-add btn-add-sm" onClick={() => openAssign(className)}>
                    <span className="add-icon">+</span>
                    <span className="add-text">{crStudent ? 'Change CR' : 'Assign CR'}</span>
                  </button>
                  {crStudent && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setRemoveTarget(crStudent)}
                    >
                      <Icon name="delete" size={14} /> Remove CR
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assign CR Modal */}
      {assigningClass && (
        <Modal
          title={`Assign CR - ${assigningClass}`}
          onClose={() => setAssigningClass(null)}
        >
          {createdAccount ? (
            <div>
              <div className="auth-success" style={{ marginBottom: '14px' }}>
                ✅ {createdAccount.fullName} is now the Class Representative!
              </div>
              <div
                style={{
                  background: 'var(--secondary-bg)',
                  border: '1px solid var(--secondary-light)',
                  borderRadius: '10px',
                  padding: '16px 18px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>
                  🔑 New Login Credentials (share with the student)
                </div>
                <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span><strong>Username:</strong> {createdAccount.username}</span>
                  <span><strong>Password:</strong> {createdAccount.password}</span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>
                    Sign in with this username (without the @) and password. They can change this password after their first login.
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
                <button className="btn btn-primary" onClick={() => setAssigningClass(null)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginBottom: '14px' }}>
                Select the student who will represent this class as Class Representative.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {classGroups[assigningClass].map(s => {
                  const isCurrent = crByClass[assigningClass]?.id === s.id;
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 14px',
                        border: `1.5px solid ${selectedStudentId === s.id ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: selectedStudentId === s.id ? 'var(--primary-bg)' : 'var(--white)'
                      }}
                    >
                      <input
                        type="radio"
                        name="cr-student"
                        value={s.id}
                        checked={selectedStudentId === s.id}
                        onChange={() => setSelectedStudentId(s.id)}
                      />
                      <div className="student-avatar">{getInitials(s.name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>
                          {s.name} {isCurrent && <span className="role-pill role-badge-cr">Current CR</span>}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>{s.rollNo} • {s.email}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-secondary" onClick={() => setAssigningClass(null)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={!selectedStudentId}
                  onClick={handleAssign}
                >
                  <Icon name="check" size={15} /> Make Class Representative
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Assign Head CR Modal */}
      {assigningHead && (
        <Modal
          title="Assign Head CR"
          onClose={() => setAssigningHead(false)}
        >
          {createdAccount ? (
            <div>
              <div className="auth-success" style={{ marginBottom: '14px' }}>
                ✅ {createdAccount.fullName} is now the Head CR managing all classes!
              </div>
              <div
                style={{
                  background: 'var(--secondary-bg)',
                  border: '1px solid var(--secondary-light)',
                  borderRadius: '10px',
                  padding: '16px 18px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--secondary)', marginBottom: '8px' }}>
                  🔑 New Login Credentials (share with the student)
                </div>
                <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span><strong>Username:</strong> {createdAccount.username}</span>
                  <span><strong>Password:</strong> {createdAccount.password}</span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>
                    They can sign in with this CR Admin account to manage CRs across all classes.
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
                <button className="btn btn-primary" onClick={() => setAssigningHead(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginBottom: '14px' }}>
                Select the student who will be the Head CR and manage all classes across the system.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {students.map(s => {
                  const isCurrent = headCRStudent?.id === s.id;
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 14px',
                        border: `1.5px solid ${headStudentId === s.id ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: headStudentId === s.id ? 'var(--primary-bg)' : 'var(--white)'
                      }}
                    >
                      <input
                        type="radio"
                        name="head-cr-student"
                        value={s.id}
                        checked={headStudentId === s.id}
                        onChange={() => setHeadStudentId(s.id)}
                      />
                      <div className="student-avatar">{getInitials(s.name)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>
                          {s.name} {isCurrent && <span className="role-pill role-badge-cr">Current Head CR</span>}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--gray)' }}>{s.rollNo} • {s.className}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-secondary" onClick={() => setAssigningHead(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={!headStudentId}
                  onClick={handleAssignHead}
                >
                  <Icon name="check" size={15} /> Make Head CR
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Remove CR confirmation */}
      {removeTarget && (
        <ConfirmDialog
          message={
            removeTarget.className === 'All Classes'
              ? `Remove ${removeTarget.name} as Head CR? They will no longer manage all classes and their account will be demoted to a regular student role.`
              : `Remove ${removeTarget.name} as Class Representative of ${removeTarget.className}? Their account will be demoted to a regular student role.`
          }
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

export default ManageCR;