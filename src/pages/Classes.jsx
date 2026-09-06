import { useState } from 'react';
import { useData } from '../context/DataContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import ImportModal from '../components/ImportModal';

const classColors = ['#059669', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#db2777', '#0ea5e9', '#ea580c'];

function getClassColor(name) {
  const sum = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return classColors[sum % classColors.length];
}

const emptyClass = {
  name: '',
  code: '',
  description: '',
  semester: ''
};

function ClassForm({ cls, onSave, onCancel }) {
  const [form, setForm] = useState({ ...emptyClass, ...(cls || {}) });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      alert('Class name and code are required fields.');
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase()
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label>Program / Class Name *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. BSCS"
            required
          />
        </div>
        <div className="form-group">
          <label>Class Code *</label>
          <input
            type="text"
            name="code"
            value={form.code}
            onChange={handleChange}
            placeholder="e.g. BSCS"
            required
          />
        </div>
        <div className="form-group">
          <label>Semester</label>
          <select name="semester" value={form.semester} onChange={handleChange}>
            <option value="">Select semester</option>
            <option value="1st">1st Semester</option>
            <option value="2nd">2nd Semester</option>
            <option value="3rd">3rd Semester</option>
            <option value="4th">4th Semester</option>
            <option value="5th">5th Semester</option>
            <option value="6th">6th Semester</option>
            <option value="7th">7th Semester</option>
            <option value="8th">8th Semester</option>
          </select>
        </div>
        <div className="form-group full-width">
          <label>Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="e.g. Bachelor of Science in Computer Science"
            rows="2"
          />
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '20px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {cls ? 'Update Class' : 'Add Class'}
        </button>
      </div>
    </form>
  );
}

function Classes() {
  const { classes, students, subjects, teachers, addClass, updateClass, deleteClass } = useData();
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [deletingClass, setDeletingClass] = useState(null);

  // Stats per class
  const enrichedClasses = classes.map(cls => {
    const studentCount = students.filter(s => s.className === cls.name).length;
    const subjectCount = subjects.filter(s => (s.className || '').split(',').map(c => c.trim()).includes(cls.name)).length;
    return { ...cls, studentCount, subjectCount };
  });

  const filteredClasses = enrichedClasses.filter(cls => {
    const matchesSearch = !search ||
      cls.name.toLowerCase().includes(search.toLowerCase()) ||
      cls.code.toLowerCase().includes(search.toLowerCase()) ||
      (cls.description || '').toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const totalStudentsInClasses = enrichedClasses.reduce((sum, c) => sum + c.studentCount, 0);
  const totalSubjectsInClasses = enrichedClasses.reduce((sum, c) => sum + c.subjectCount, 0);

  const handleSave = async (formData) => {
    try {
      if (editingClass) {
        await updateClass(editingClass.id, formData);
        showToast('Class updated successfully!', 'success');
      } else {
        await addClass(formData);
        showToast('Class added successfully!', 'success');
      }
      setShowModal(false);
      setEditingClass(null);
    } catch (err) {
      showToast(err.message || 'Failed to save class.', 'error');
    }
  };

  const handleDelete = async () => {
    if (deletingClass) {
      await deleteClass(deletingClass.id);
      showToast('Class deleted successfully!', 'info');
      setDeletingClass(null);
    }
  };

  const linkedInfo = deletingClass ? {
    students: students.filter(s => s.className === deletingClass.name).length,
    subjects: subjects.filter(s => (s.className || '').split(',').map(c => c.trim()).includes(deletingClass.name)).length
  } : null;

  return (
    <div>
      <div className="page-header">
        <h1>Class Management</h1>
        <p>Manage programs/classes (BSCS, BSIT, BBA, etc.) that feed every class field across the system.</p>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">🏫</div>
          <div className="stat-info">
            <h3>{classes.length}</h3>
            <p>Total Classes</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">👨‍🎓</div>
          <div className="stat-info">
            <h3>{totalStudentsInClasses}</h3>
            <p>Students Enrolled</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">📚</div>
          <div className="stat-info">
            <h3>{totalSubjectsInClasses}</h3>
            <p>Linked Subjects</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">👩‍🏫</div>
          <div className="stat-info">
            <h3>{teachers.length}</h3>
            <p>Available Teachers</p>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search classes by name, code, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {hasPermission('add_classes') && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-add" onClick={() => setShowImport(true)}>
              <span className="add-icon"><Icon name="flag" size={16} /></span>
              <span className="add-text">Import Classes</span>
            </button>
            <button className="btn-add" onClick={() => {
              setEditingClass(null);
              setShowModal(true);
            }}>
              <span className="add-icon">+</span>
              <span className="add-text">Add New Class</span>
            </button>
          </div>
        )}
      </div>

      <div className="card-grid">
        {filteredClasses.map(cls => {
          const accent = getClassColor(cls.name);
          return (
            <div
              className="subject-card"
              key={cls.id}
              style={{ '--card-accent': accent, '--card-accent-bg': accent + '22' }}
            >
              <div className="subject-card-top">
                <div className="subject-avatar">{cls.name[0]}</div>
                <span className="subject-code-badge">{cls.code}</span>
              </div>
              <h4>{cls.name}</h4>
              <div className="subject-class-tag">{cls.semester || 'Semester not set'}</div>
              <div className="subject-meta">
                <div className="subject-meta-item">
                  <span className="subject-icon"><Icon name="book" size={13} /></span>
                  <span>Description: <span className="meta-value">{cls.description || '—'}</span></span>
                </div>
              </div>
              <div className="class-counts">
                <span className="count-chip">👨‍🎓 {cls.studentCount} Students</span>
                <span className="count-chip">📚 {cls.subjectCount} Subjects</span>
              </div>
              {(hasPermission('edit_classes') || hasPermission('delete_classes')) && (
                <div className="subject-actions">
                  {hasPermission('edit_classes') && (
                    <button className="btn-icon edit" title="Edit" onClick={() => {
                      setEditingClass(cls);
                      setShowModal(true);
                    }}><Icon name="edit" size={15} /></button>
                  )}
                  {hasPermission('delete_classes') && (
                    <button className="btn-icon delete" title="Delete" onClick={() => setDeletingClass(cls)}><Icon name="delete" size={15} /></button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredClasses.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="icon">🏫</div>
            <h3>No classes found</h3>
            <p>Try adjusting your search or add a new class.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editingClass ? 'Edit Class' : 'Add New Class'}
          onClose={() => { setShowModal(false); setEditingClass(null); }}
        >
          <ClassForm
            cls={editingClass}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditingClass(null); }}
          />
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deletingClass && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${deletingClass.name} (${deletingClass.code})?` +
            (linkedInfo && (linkedInfo.students > 0 || linkedInfo.subjects > 0)
              ? ` Note: ${linkedInfo.students} student(s) and ${linkedInfo.subjects} subject(s) are currently linked to this class.`
              : '')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingClass(null)}
        />
      )}

      {/* Bulk Import Modal */}
      {showImport && (
        <ImportModal
          type="class"
          onImport={addClass}
          onDone={() => showToast('Classes imported successfully!', 'success')}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

export default Classes;