import { useState } from 'react';
import { useData } from '../context/DataContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getAllClassSuggestions } from '../utils/classUtils';
import Icon from '../components/Icon';
import ImportModal from '../components/ImportModal';

const subjectColors = {
  'Mathematics': '#059669',
  'Physics': '#0284c7',
  'Chemistry': '#16a34a',
  'Biology': '#d97706',
  'English': '#7c3aed',
  'Computer Science': '#dc2626',
  'History': '#db2777',
  'Geography': '#0ea5e9',
  'Economics': '#ea580c'
};

function getSubjectColor(name) {
  return subjectColors[name] || '#059669';
}

const emptySubject = {
  name: '',
  code: '',
  teacher: '',
  credits: 3,
  className: ''
};

function SubjectForm({ subject, teachers, onSave, onCancel, classSuggestions, classes = [] }) {
  const [form, setForm] = useState({ ...emptySubject, ...(subject || {}) });

  // Parse comma-separated className into a Set of selected class names
  const initialSelected = new Set(
    (form.className || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  const [selectedClasses, setSelectedClasses] = useState(initialSelected);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleClassToggle = (className) => {
    setSelectedClasses(prev => {
      const next = new Set(prev);
      if (next.has(className)) {
        next.delete(className);
      } else {
        next.add(className);
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      alert('Subject name and code are required fields.');
      return;
    }
    // Build comma-separated className from selected checkboxes
    const classNameStr = [...selectedClasses].join(', ');
    onSave({ ...form, className: classNameStr });
  };

  // Get available class names from the classes table, fallback to suggestions
  const availableClasses = classes.length > 0
    ? classes.map(c => c.name || c.className).filter(Boolean).sort()
    : (classSuggestions || []).sort();

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label>Subject Name *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Mathematics"
            required
          />
        </div>
        <div className="form-group">
          <label>Subject Code *</label>
          <input
            type="text"
            name="code"
            value={form.code}
            onChange={handleChange}
            placeholder="e.g. MATH-101"
            required
          />
        </div>
        <div className="form-group">
          <label>Assigned Teacher</label>
          <select name="teacher" value={form.teacher} onChange={handleChange}>
            <option value="">Select teacher</option>
            {teachers.map(t => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Credits</label>
          <input
            type="number"
            name="credits"
            value={form.credits}
            onChange={handleChange}
            min="1"
            max="10"
          />
        </div>
        <div className="form-group full-width">
          <label>Assign to Classes</label>
          {availableClasses.length > 0 ? (
            <div className="checkbox-group" style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--secondary-bg)',
              minHeight: '42px'
            }}>
              {availableClasses.map(className => (
                <label key={className} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: selectedClasses.has(className) ? 'var(--primary-bg)' : 'transparent',
                  border: `1px solid ${selectedClasses.has(className) ? 'var(--primary)' : 'var(--border)'}`,
                  color: selectedClasses.has(className) ? 'var(--primary)' : 'var(--text)',
                  transition: 'all 0.15s ease'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedClasses.has(className)}
                    onChange={() => handleClassToggle(className)}
                    style={{ accentColor: 'var(--primary)', width: '14px', height: '14px' }}
                  />
                  {className}
                </label>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--gray)', margin: '4px 0' }}>
              No classes available. Please create classes first.
            </p>
          )}
          {selectedClasses.size > 0 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--gray)', margin: '6px 0 0' }}>
              Selected: {[...selectedClasses].join(', ')}
            </p>
          )}
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '20px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {subject ? 'Update Subject' : 'Add Subject'}
        </button>
      </div>
    </form>
  );
}

function Subjects() {
  const { subjects, teachers, students, classes, addSubject, updateSubject, deleteSubject } = useData();
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  // For students, pre-select their own class (e.g. BSCS) instead of showing the
  // generic "All Classes" option. This guarantees a BSCS student sees BSCS
  // subjects (and the matching BSCS option) on first load even though the
  // /classes endpoint (view_classes) is off-limits to the student role.
  const studentClass = (currentUser?.className || '').trim();
  const [filterClass, setFilterClass] = useState(() =>
    currentUser?.role === 'student' ? studentClass : ''
  );
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [deletingSubject, setDeletingSubject] = useState(null);

  // Role-based filtering
  const visibleSubjects = currentUser?.role === 'teacher_admin'
    ? subjects.filter(s => (s.teacher || '').includes(currentUser?.fullName || ''))
    : currentUser?.role === 'student'
      ? subjects.filter(s => (s.className || '').split(',').map(c => c.trim()).includes(studentClass))
      : subjects;

  const filteredSubjects = visibleSubjects.filter(s => {
    const matchesSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.teacher.toLowerCase().includes(search.toLowerCase());
    const matchesClass = !filterClass || (s.className || '').split(',').map(c => c.trim()).includes(filterClass);
    return matchesSearch && matchesClass;
  });

  const filterClassOptions = [...new Set(
    visibleSubjects.flatMap(s => (s.className || '').split(',').map(c => c.trim()).filter(Boolean))
  )].sort();
  const classSuggestions = getAllClassSuggestions(classes, students, teachers, subjects);

  const handleSave = async (formData) => {
    try {
      if (editingSubject) {
        await updateSubject(editingSubject.id, formData);
        showToast('Subject updated successfully!', 'success');
      } else {
        await addSubject(formData);
        showToast('Subject added successfully!', 'success');
      }
      setShowModal(false);
      setEditingSubject(null);
    } catch (err) {
      showToast(err.message || 'Failed to save subject.', 'error');
    }
  };

  const handleDelete = async () => {
    if (deletingSubject) {
      await deleteSubject(deletingSubject.id);
      showToast('Subject deleted successfully!', 'info');
      setDeletingSubject(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Subject Management</h1>
        <p>Manage subjects, codes, and teacher assignments.</p>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search subjects by name, code, or teacher..."
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
        {hasPermission('add_subjects') && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-add" onClick={() => setShowImport(true)}>
              <span className="add-icon"><Icon name="flag" size={16} /></span>
              <span className="add-text">Import Subjects</span>
            </button>
            <button className="btn-add" onClick={() => {
              setEditingSubject(null);
              setShowModal(true);
            }}>
              <span className="add-icon">+</span>
              <span className="add-text">Add New Subject</span>
            </button>
          </div>
        )}
      </div>

      <div className="card-grid">
        {filteredSubjects.map(subject => {
          const accent = getSubjectColor(subject.name);
          return (
            <div
              className="subject-card"
              key={subject.id}
              style={{ '--card-accent': accent, '--card-accent-bg': accent + '22' }}
            >
              <div className="subject-card-top">
                <div className="subject-avatar">{subject.name[0]}</div>
                <span className="subject-code-badge">{subject.code}</span>
              </div>
              <h4>{subject.name}</h4>
              <div className="subject-class-tag">{subject.className || 'All Classes'}</div>
              <div className="subject-meta">
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="academic" size={13} /></span>
                  <span>Teacher: <span className="meta-value">{subject.teacher || 'Unassigned'}</span></span>
                </div>
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="building" size={13} /></span>
                  <span>Class: <span className="meta-value">{subject.className || 'All Classes'}</span></span>
                </div>
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="document" size={13} /></span>
                  <span>Credits: <span className="meta-value">{subject.credits}</span></span>
                </div>
              </div>
              {hasPermission('edit_subjects') || hasPermission('delete_subjects') ? (
                <div className="subject-actions">
                  {hasPermission('edit_subjects') && (
                    <button className="btn-icon edit" title="Edit" onClick={() => {
                      setEditingSubject(subject);
                      setShowModal(true);
                    }}><Icon name="edit" size={15} /></button>
                  )}
                  {hasPermission('delete_subjects') && (
                    <button className="btn-icon delete" title="Delete" onClick={() => setDeletingSubject(subject)}><Icon name="delete" size={15} /></button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {filteredSubjects.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="icon">📚</div>
            <h3>No subjects found</h3>
            <p>Try adjusting your search or filters, or add a new subject.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editingSubject ? 'Edit Subject' : 'Add New Subject'}
          onClose={() => { setShowModal(false); setEditingSubject(null); }}
        >
          <SubjectForm
            subject={editingSubject}
            teachers={teachers}
            classes={classes}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditingSubject(null); }}
            classSuggestions={classSuggestions}
          />
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deletingSubject && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${deletingSubject.name} (${deletingSubject.code})? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingSubject(null)}
        />
      )}

      {/* Bulk Import Modal */}
      {showImport && (
        <ImportModal
          type="subject"
          onImport={addSubject}
          onDone={() => showToast('Subjects imported successfully!', 'success')}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

export default Subjects;