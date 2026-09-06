import { useState } from 'react';
import { useData } from '../context/DataContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getStudentAverage as calculateAvgScore } from '../utils/scoreUtils';
import { getAllClassSuggestions } from '../utils/classUtils';
import ClassInput from '../components/ClassInput';
import CredentialPopup from '../components/CredentialPopup';
import Icon from '../components/Icon';
import ImportModal from '../components/ImportModal';
import api from '../services/api';

const avatarColors = ['#059669', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#db2777', '#0ea5e9', '#ea580c', '#047857'];

function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getAvatarColor(name) {
  const sum = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return avatarColors[sum % avatarColors.length];
}

const emptyStudent = {
  name: '',
  email: '',
  phone: '',
  rollNo: '',
  className: 'BSCS',
  gender: 'Male',
  address: '',
  dateOfBirth: '',
  admissionDate: '',
  status: 'Active'
};

function StudentForm({ student, onSave, onCancel, classSuggestions }) {
  const [form, setForm] = useState({
    ...emptyStudent,
    ...(student || {}),
    rollNo: student?.rollNo || `STU-${String(Date.now()).slice(-3)}`
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      alert('Name and email are required fields.');
      return;
    }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label>Student Name *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Full name"
            required
          />
        </div>
        <div className="form-group">
          <label>Roll Number *</label>
          <input
            type="text"
            name="rollNo"
            value={form.rollNo}
            onChange={handleChange}
            placeholder="e.g. STU-011"
            required
          />
        </div>
        <div className="form-group">
          <label>Email *</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="student@school.edu"
            required
          />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+91 98765 43210"
          />
        </div>
        <div className="form-group">
          <label>Class</label>
          <ClassInput
            id="student-class-suggestions"
            value={form.className}
            onChange={(e) => setForm(prev => ({ ...prev, className: e.target.value }))}
            suggestions={classSuggestions || []}
          />
        </div>
        <div className="form-group">
          <label>Gender</label>
          <select name="gender" value={form.gender} onChange={handleChange}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label>Date of Birth</label>
          <input
            type="date"
            name="dateOfBirth"
            value={form.dateOfBirth}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Admission Date</label>
          <input
            type="date"
            name="admissionDate"
            value={form.admissionDate}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Status</label>
          <select name="status" value={form.status} onChange={handleChange}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Graduated">Graduated</option>
          </select>
        </div>
        <div className="form-group full-width">
          <label>Address</label>
          <textarea
            name="address"
            value={form.address}
            onChange={handleChange}
            placeholder="Full address"
          />
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '20px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {student ? 'Update Student' : 'Add Student'}
        </button>
      </div>
    </form>
  );
}

function StudentDetails({ student, onClose, onEdit }) {
  const color = getAvatarColor(student.name);
  return (
    <Modal
      title="Student Details"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => onEdit(student)}>Edit</button>
        </>
      }
    >
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div
          className="student-avatar-large"
          style={{ background: color, margin: '0 auto 12px', width: '90px', height: '90px', fontSize: '2rem' }}
        >
          {getInitials(student.name)}
        </div>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '3px' }}>{student.name}</h3>
        <span className={`badge ${student.status === 'Active' ? 'success' : 'danger'}`}>{student.status}</span>
        {student.isCR && (
          <span className="role-pill role-badge-cr" style={{ marginLeft: '8px' }}>CR</span>
        )}
      </div>
      <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div className="detail-item">
          <span className="label">Roll Number</span>
          <span className="value">{student.rollNo}</span>
        </div>
        <div className="detail-item">
          <span className="label">Class</span>
          <span className="value">{student.className}</span>
        </div>
        <div className="detail-item">
          <span className="label">Email</span>
          <span className="value">{student.email}</span>
        </div>
        <div className="detail-item">
          <span className="label">Phone</span>
          <span className="value">{student.phone || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Gender</span>
          <span className="value">{student.gender}</span>
        </div>
        <div className="detail-item">
          <span className="label">Date of Birth</span>
          <span className="value">{student.dateOfBirth || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Admission Date</span>
          <span className="value">{student.admissionDate || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Address</span>
          <span className="value">{student.address || '—'}</span>
        </div>
      </div>
    </Modal>
  );
}

function Students() {
  const { students, teachers, subjects, classes, addStudent, updateStudent, deleteStudent, bulkDeleteStudents, marks, resetData } = useData();
  const { currentUser, canManageStudents, users, createAccount, resetPassword, defaultPasswordFor, hasPermission } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [viewingStudent, setViewingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [createdAccount, setCreatedAccount] = useState(null); // credentials for newly added student
  const [resettingStudent, setResettingStudent] = useState(null); // student whose password will be reset
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Filter students based on role
  const role = currentUser?.role;
  const userClass = currentUser?.className;
  const visibleStudents = role === 'cr_admin' && !currentUser?.manageAllClasses
    ? students.filter(s => s.className === userClass)
    : students;

  const filteredStudents = visibleStudents.filter(s => {
    const matchesSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNo.toLowerCase().includes(search.toLowerCase());
    const matchesClass = !filterClass || s.className === filterClass;
    return matchesSearch && matchesClass;
  });

  const filterClassOptions = [...new Set(visibleStudents.map(s => s.className))].sort();
  const classSuggestions = getAllClassSuggestions(classes, students, teachers, subjects);

  const handleSave = async (formData) => {
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, formData);
        showToast('Student updated successfully!', 'success');
      } else {
        const newId = await addStudent(formData);
        const result = await createAccount({
          fullName: formData.name,
          email: formData.email,
          role: 'student',
          className: formData.className,
          linkedStudentId: newId
        });
        showToast('Student added successfully!', 'success');
        if (result.success) {
          setCreatedAccount(result.account);
        }
      }
      setShowModal(false);
      setEditingStudent(null);
    } catch (err) {
      showToast(err.message || 'Failed to save student.', 'error');
    }
  };

  // Find the login account linked to a student
  const findStudentAccount = (student) => {
    return users.find(u =>
      (u.linkedStudentId && u.linkedStudentId === student.id) ||
      (u.email && student.email && u.email.toLowerCase() === student.email.toLowerCase()) ||
      (u.fullName && u.fullName.toLowerCase() === student.name.toLowerCase())
    ) || null;
  };

  const handleResetPassword = async () => {
    if (!resettingStudent) return;
    const account = findStudentAccount(resettingStudent);
    if (!account) {
      showToast('No login account found for this student. Add them again or register manually.', 'warning');
      setResettingStudent(null);
      return;
    }
    const result = await resetPassword(account.id);
    if (result.success) {
      showToast(`Password reset to default for ${resettingStudent.name}.`, 'info');
    }
    setResettingStudent(null);
  };

  const handleEdit = (student) => {
    setViewingStudent(null);
    setEditingStudent(student);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (deletingStudent) {
      await deleteStudent(deletingStudent.id);
      showToast('Student deleted successfully!', 'info');
      setDeletingStudent(null);
    }
  };

  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map(s => s.id));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    try {
      const count = selectedIds.length;
      await bulkDeleteStudents(selectedIds);
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      showToast(`${count} student${count !== 1 ? 's' : ''} deleted successfully!`, 'info');
    } catch (err) {
      showToast(err.message || 'Failed to delete students.', 'error');
    }
  };

  const getStudentAverage = (studentId) => {
    const studentMarks = marks.filter(m => m.studentId === studentId);
    const avg = calculateAvgScore(studentMarks);
    return avg > 0 ? avg : null;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Student Management</h1>
        <p>Add, edit, and manage student records.</p>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, or roll no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
          >
            <option value="">All Classes</option>
            {filterClassOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {hasPermission('delete_students') && selectedIds.length > 0 && (
            <button
              className="btn-add"
              style={{ background: 'var(--danger)', color: '#fff' }}
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              <span className="add-icon"><Icon name="delete" size={16} /></span>
              <span className="add-text">Remove Selected ({selectedIds.length})</span>
            </button>
          )}
          {hasPermission('add_students') && (
            <>
              <button className="btn-add" onClick={() => setShowImport(true)}>
                <span className="add-icon"><Icon name="flag" size={16} /></span>
                <span className="add-text">Import Students</span>
              </button>
              <button className="btn-add" onClick={() => {
                setEditingStudent(null);
                setShowModal(true);
              }}>
                <span className="add-icon">+</span>
                <span className="add-text">Add New Student</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: '0' }}>
          {filteredStudents.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {hasPermission('delete_students') && (
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          style={{ cursor: 'pointer', accentColor: 'var(--danger)' }}
                        />
                      </th>
                    )}
                    <th>Student</th>
                    <th>Roll No</th>
                    <th>Class</th>
                    <th>Phone</th>
                    <th>Avg Score</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(student => {
                    const avg = getStudentAverage(student.id);
                    return (
                      <tr key={student.id} style={selectedIds.includes(student.id) ? { background: 'var(--danger-bg, #fef2f2)' } : undefined}>
                        {hasPermission('delete_students') && (
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(student.id)}
                              onChange={() => toggleSelectOne(student.id)}
                              style={{ cursor: 'pointer', accentColor: 'var(--danger)' }}
                            />
                          </td>
                        )}
                        <td>
                          <div className="student-cell">
                            <div
                              className="student-avatar"
                              style={{ background: getAvatarColor(student.name) + '22', color: getAvatarColor(student.name) }}
                            >
                              {getInitials(student.name)}
                            </div>
                            <div>
                              <div className="name">
                                {student.name}
                                {student.isCR && (
                                  <span className="role-pill role-badge-cr" style={{ marginLeft: '8px', fontSize: '0.6rem' }}>
                                    CR
                                  </span>
                                )}
                              </div>
                              <div className="sub">{student.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{student.rollNo}</td>
                        <td>{student.className}</td>
                        <td className="hide-mobile">{student.phone || '—'}</td>
                        <td>
                          {avg !== null ? (
                            <span
                              style={{
                                fontWeight: '700',
                                color: avg >= 85 ? 'var(--success)' : avg >= 70 ? 'var(--warning)' : 'var(--danger)'
                              }}
                            >
                              {avg}%
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <span className={`badge ${student.status === 'Active' ? 'success' : student.status === 'Inactive' ? 'warning' : 'info'}`}>
                            {student.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-icon view" title="View" onClick={() => setViewingStudent(student)}><Icon name="view" size={16} /></button>
                            {hasPermission('edit_students') && (
                              <button className="btn-icon edit" title="Edit" onClick={() => handleEdit(student)}><Icon name="edit" size={15} /></button>
                            )}
                            {hasPermission('delete_students') && (
                              <button className="btn-icon delete" title="Delete" onClick={() => setDeletingStudent(student)}><Icon name="delete" size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <h3>No students found</h3>
              <p>Try adjusting your search or filters, or add a new student.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editingStudent ? 'Edit Student' : 'Add New Student'}
          onClose={() => { setShowModal(false); setEditingStudent(null); }}
        >
          <StudentForm
            student={editingStudent}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditingStudent(null); }}
            classSuggestions={classSuggestions}
          />
        </Modal>
      )}

      {/* View Details Modal */}
      {viewingStudent && (
        <StudentDetails
          student={viewingStudent}
          onClose={() => setViewingStudent(null)}
          onEdit={handleEdit}
        />
      )}

      {/* Delete Confirmation */}
      {deletingStudent && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${deletingStudent.name}? This will also remove their marks records. This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingStudent(null)}
        />
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${selectedIds.length} selected student${selectedIds.length !== 1 ? 's' : ''}? This will also remove their marks records. This action cannot be undone.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {/* Newly created account credentials */}
      {createdAccount && (
        <CredentialPopup
          account={createdAccount}
          title="New Student Login Credentials"
          message={`${createdAccount.fullName}'s account has been created successfully!`}
          onClose={() => setCreatedAccount(null)}
        />
      )}

      {/* Bulk Import Modal */}
      {showImport && (
        <ImportModal
          type="student"
          onImport={addStudent}
          onBulkImport={async (preparedRows) => {
            const result = await api.importStudents(preparedRows);
            // The bulk endpoint writes students (and auto-creates any new classes)
            // directly on the server, bypassing the DataContext state, so refresh
            // the data to show the newly imported students/classes immediately.
            if (result && Array.isArray(result.students) && result.students.length > 0) {
              try { await resetData(); } catch {}
            }
            return result;
          }}
          onCreateAccount={createAccount}
          onDone={() => showToast('Students imported successfully!', 'success')}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

export default Students;