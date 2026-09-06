import { useState } from 'react';
import { useData } from '../context/DataContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getAllClassSuggestions } from '../utils/classUtils';
import ClassInput from '../components/ClassInput';
import Icon from '../components/Icon';
import ImportModal from '../components/ImportModal';

const avatarColors = ['#059669', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#db2777', '#0ea5e9', '#ea580c', '#047857'];

function getInitials(name) {
  const cleaned = name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '');
  return cleaned
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

const emptyTeacher = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  qualification: '',
  experience: '',
  className: '',
  joiningDate: ''
};

function TeacherForm({ teacher, onSave, onCancel, classSuggestions, subjects = [] }) {
  const [form, setForm] = useState({ ...emptyTeacher, ...(teacher || {}) });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim()) {
      alert('Name and subject are required fields.');
      return;
    }
    onSave(form);
  };

  // Deduplicate subject names from DB for the dropdown
  const subjectOptions = [...new Set(subjects.map(s => s.name).filter(Boolean))].sort();

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label>Teacher Name *</label>
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
          <label>Email *</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="teacher@school.edu"
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
          <label>Subject *</label>
          <select name="subject" value={form.subject} onChange={handleChange} required>
            <option value="">Select subject</option>
            {subjectOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
            {/* Show the current value even if no longer in DB (e.g. subject was deleted) */}
            {form.subject && !subjectOptions.includes(form.subject) && (
              <option value={form.subject}>{form.subject}</option>
            )}
          </select>
        </div>
        <div className="form-group">
          <label>Qualification</label>
          <input
            type="text"
            name="qualification"
            value={form.qualification}
            onChange={handleChange}
            placeholder="e.g. M.Sc, M.Ed"
          />
        </div>
        <div className="form-group">
          <label>Experience</label>
          <input
            type="text"
            name="experience"
            value={form.experience}
            onChange={handleChange}
            placeholder="e.g. 10 years"
          />
        </div>
        <div className="form-group">
          <label>Assigned Class</label>
          <ClassInput
            id="teacher-class-suggestions"
            value={form.className}
            onChange={(e) => setForm(prev => ({ ...prev, className: e.target.value }))}
            suggestions={classSuggestions || []}
            placeholder="Type or select a class e.g. BSCS"
          />
        </div>
        <div className="form-group">
          <label>Joining Date</label>
          <input
            type="date"
            name="joiningDate"
            value={form.joiningDate}
            onChange={handleChange}
          />
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '20px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {teacher ? 'Update Teacher' : 'Add Teacher'}
        </button>
      </div>
    </form>
  );
}

function TeacherDetails({ teacher, onClose, onEdit }) {
  const color = getAvatarColor(teacher.name);
  return (
    <Modal
      title="Teacher Details"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => onEdit(teacher)}>Edit</button>
        </>
      }
    >
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div
          className="student-avatar-large"
          style={{ background: color, margin: '0 auto 12px', width: '90px', height: '90px', fontSize: '2rem' }}
        >
          {getInitials(teacher.name)}
        </div>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '3px' }}>{teacher.name}</h3>
        <span className="badge primary">{teacher.subject}</span>
      </div>
      <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div className="detail-item">
          <span className="label">Email</span>
          <span className="value">{teacher.email}</span>
        </div>
        <div className="detail-item">
          <span className="label">Phone</span>
          <span className="value">{teacher.phone || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Qualification</span>
          <span className="value">{teacher.qualification || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Experience</span>
          <span className="value">{teacher.experience || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Assigned Class</span>
          <span className="value">{teacher.className || '—'}</span>
        </div>
        <div className="detail-item">
          <span className="label">Joining Date</span>
          <span className="value">{teacher.joiningDate || '—'}</span>
        </div>
      </div>
    </Modal>
  );
}

function Teachers() {
  const { teachers, students, subjects, classes, addTeacher, updateTeacher, deleteTeacher } = useData();
  const { hasPermission } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [viewingTeacher, setViewingTeacher] = useState(null);
  const [deletingTeacher, setDeletingTeacher] = useState(null);

  const filteredTeachers = teachers.filter(t => {
    const matchesSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !filterSubject || t.subject === filterSubject;
    return matchesSearch && matchesSubject;
  });

  const subjectList = [...new Set(teachers.map(t => t.subject))].sort();
  const classSuggestions = getAllClassSuggestions(classes, students, teachers, subjects, { officialOnly: true });

  const handleSave = async (formData) => {
    try {
      if (editingTeacher) {
        await updateTeacher(editingTeacher.id, formData);
        showToast('Teacher updated successfully!', 'success');
      } else {
        await addTeacher(formData);
        showToast('Teacher added successfully!', 'success');
      }
      setShowModal(false);
      setEditingTeacher(null);
    } catch (err) {
      showToast(err.message || 'Failed to save teacher.', 'error');
    }
  };

  const handleEdit = (teacher) => {
    setViewingTeacher(null);
    setEditingTeacher(teacher);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (deletingTeacher) {
      await deleteTeacher(deletingTeacher.id);
      showToast('Teacher deleted successfully!', 'info');
      setDeletingTeacher(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Teacher Management</h1>
        <p>Manage teacher details, assignments, and qualifications.</p>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, email, or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
          >
            <option value="">All Subjects</option>
            {subjectList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {hasPermission('add_teachers') ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-add" onClick={() => setShowImport(true)}>
              <span className="add-icon"><Icon name="flag" size={16} /></span>
              <span className="add-text">Import Teachers</span>
            </button>
            <button className="btn-add" onClick={() => {
              setEditingTeacher(null);
              setShowModal(true);
            }}>
              <span className="add-icon">+</span>
              <span className="add-text">Add New Teacher</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="card-grid">
        {filteredTeachers.map(teacher => {
          const accent = getAvatarColor(teacher.name);
          const matched = subjects.find(s => s.name === teacher.subject);
          const subjectCode = matched ? matched.code : teacher.subject;
          return (
            <div
              className="subject-card"
              key={teacher.id}
              style={{ '--card-accent': accent, '--card-accent-bg': accent + '22' }}
            >
              <div className="subject-card-top">
                <div className="subject-avatar">{getInitials(teacher.name)}</div>
                <span className="subject-code-badge">{subjectCode}</span>
              </div>
              <h4>{teacher.name}</h4>
              <div className="subject-class-tag">{teacher.subject || 'Subject not set'}</div>
              <div className="subject-meta">
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="academic" size={13} /></span>
                  <span>Qualification: <span className="meta-value">{teacher.qualification || '—'}</span></span>
                </div>
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="building" size={13} /></span>
                  <span>Class: <span className="meta-value">{teacher.className || '—'}</span></span>
                </div>
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="calendar" size={13} /></span>
                  <span>Experience: <span className="meta-value">{teacher.experience || '—'}</span></span>
                </div>
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="users" size={13} /></span>
                  <span>Email: <span className="meta-value">{teacher.email}</span></span>
                </div>
              </div>
              <div className="subject-actions">
                <button className="btn-icon view" title="View" onClick={() => setViewingTeacher(teacher)}><Icon name="view" size={16} /></button>
                {hasPermission('edit_teachers') && (
                  <button className="btn-icon edit" title="Edit" onClick={() => handleEdit(teacher)}><Icon name="edit" size={15} /></button>
                )}
                {hasPermission('delete_teachers') && (
                  <button className="btn-icon delete" title="Delete" onClick={() => setDeletingTeacher(teacher)}><Icon name="delete" size={15} /></button>
                )}
              </div>
            </div>
          );
        })}
        {filteredTeachers.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="icon">👩🏫</div>
            <h3>No teachers found</h3>
            <p>Try adjusting your search or filters, or add a new teacher.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
          onClose={() => { setShowModal(false); setEditingTeacher(null); }}
        >
          <TeacherForm
            teacher={editingTeacher}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditingTeacher(null); }}
            classSuggestions={classSuggestions}
            subjects={subjects}
          />
        </Modal>
      )}

      {/* View Details */}
      {viewingTeacher && (
        <TeacherDetails
          teacher={viewingTeacher}
          onClose={() => setViewingTeacher(null)}
          onEdit={handleEdit}
        />
      )}

      {/* Delete Confirmation */}
      {deletingTeacher && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${deletingTeacher.name}? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingTeacher(null)}
        />
      )}

      {/* Bulk Import Modal */}
      {showImport && (
        <ImportModal
          type="teacher"
          onImport={addTeacher}
          onDone={() => showToast('Teachers imported successfully!', 'success')}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

export default Teachers;