import { useState } from 'react';
import { useData } from '../context/DataContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { getStudentAverage, getMarksTotals } from '../utils/scoreUtils';
import Icon from '../components/Icon';

function getGrade(marks) {
  if (marks >= 90) return { grade: 'A+', color: 'var(--success)' };
  if (marks >= 85) return { grade: 'A', color: 'var(--success)' };
  if (marks >= 80) return { grade: 'A-', color: 'var(--success)' };
  if (marks >= 75) return { grade: 'B+', color: 'var(--warning)' };
  if (marks >= 70) return { grade: 'B', color: 'var(--warning)' };
  if (marks >= 65) return { grade: 'B-', color: 'var(--warning)' };
  if (marks >= 60) return { grade: 'C+', color: 'var(--warning)' };
  if (marks >= 50) return { grade: 'C', color: 'var(--danger)' };
  if (marks >= 40) return { grade: 'D', color: 'var(--danger)' };
  return { grade: 'F', color: 'var(--danger)' };
}

function MarkForm({ markData, students, subjects, onSave, onCancel }) {
  const [form, setForm] = useState({
    studentId: markData?.studentId || '',
    studentName: markData?.studentName || '',
    subject: markData?.subject || '',
    marks: markData?.marks || '',
    grade: markData?.grade || '',
    examType: markData?.examType || 'Final'
  });

  const handleStudentChange = (e) => {
    const studentId = Number(e.target.value);
    const student = students.find(s => s.id === studentId);
    setForm(prev => ({
      ...prev,
      studentId,
      studentName: student ? student.name : ''
    }));
  };

  const handleMarksChange = (e) => {
    const value = Number(e.target.value);
    setForm(prev => ({
      ...prev,
      marks: e.target.value,
      grade: value >= 0 && value <= 100 ? getGrade(value).grade : ''
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.studentId || !form.subject || !form.marks) {
      alert('Student, subject, and marks are required.');
      return;
    }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label>Student *</label>
          <select
            name="studentId"
            value={form.studentId}
            onChange={handleStudentChange}
            required
          >
            <option value="">Select student</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name} - {s.rollNo}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Subject *</label>
          <select
            name="subject"
            value={form.subject}
            onChange={(e) => setForm(prev => ({ ...prev, subject: e.target.value }))}
            required
          >
            <option value="">Select subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Marks (0-100) *</label>
          <input
            type="number"
            name="marks"
            value={form.marks}
            onChange={handleMarksChange}
            min="0"
            max="100"
            required
          />
        </div>
        <div className="form-group">
          <label>Exam Type</label>
          <select
            name="examType"
            value={form.examType}
            onChange={(e) => setForm(prev => ({ ...prev, examType: e.target.value }))}
          >
            <option value="Final">Final Exam</option>
            <option value="Midterm">Midterm Exam</option>
            <option value="Quarterly">Quarterly Exam</option>
            <option value="Half Yearly">Half Yearly Exam</option>
            <option value="Unit Test">Unit Test</option>
          </select>
        </div>
        <div className="form-group">
          <label>Grade (Auto)</label>
          <input type="text" value={form.grade || '—'} disabled style={{ background: 'var(--light-gray)' }} />
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '20px 0 0', borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {markData ? 'Update Marks' : 'Add Marks'}
        </button>
      </div>
    </form>
  );
}

function StudentMarksSummary({ student, marks, onAddMark, onEditMark, readOnly }) {
  const studentMarks = marks.filter(m => m.studentId === student.id);
  const { total, maxPossible } = getMarksTotals(studentMarks);
  // Single consistent average calculation shared across all pages
  const averagePct = getStudentAverage(studentMarks);

  const avgColor = averagePct >= 85 ? 'var(--success)' : averagePct >= 70 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="subject-card">
      <div className="subject-card-top">
        <div className="subject-avatar">
          {student.name[0]}{student.name.split(' ')[1]?.[0] || ''}
        </div>
        <span className="subject-code-badge marks-average-badge">
          {averagePct > 0 ? `${averagePct}% avg` : 'No data'}
        </span>
      </div>
      <h4>{student.name}</h4>
      <div className="subject-class-tag">{student.rollNo} • {student.className}</div>

      {studentMarks.length > 0 ? (
        <div className="marks-list">
          {studentMarks.map(mark => {
            const gradeInfo = getGrade(mark.marks);
            return (
              <div key={mark.id} className="mark-row">
                <div className="mark-row-info">
                  <div className="mark-row-subject">{mark.subject}</div>
                  <div className="mark-row-type">{mark.examType}</div>
                </div>
                <div className="mark-row-value">
                  <span className="mark-score" style={{ color: gradeInfo.color }}>{mark.marks}</span>
                  <span className={`badge ${mark.marks >= 80 ? 'success' : mark.marks >= 60 ? 'warning' : 'danger'}`}>
                    {mark.grade}
                  </span>
                  {!readOnly && (
                    <button
                      className="btn-icon edit"
                      style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}
                      onClick={() => onEditMark(mark)}
                    ><Icon name="edit" size={14} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="marks-empty">
          No marks recorded yet.
        </div>
      )}

      <div className="marks-footer">
        <div className="marks-avg-line">
          <span style={{ color: avgColor, fontWeight: '700' }}>
            {averagePct > 0 ? `${averagePct}%` : '—'} average
          </span>
          <span className="progress-bar" style={{ flex: 1 }}>
            <div
              className="progress-fill"
              style={{
                width: `${averagePct}%`,
                background: averagePct >= 80 ? 'var(--success)' : averagePct >= 60 ? 'var(--warning)' : 'var(--danger)'
              }}
            />
          </span>
          <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>Total: {total}/{maxPossible}</span>
        </div>

        {!readOnly && (
          <button
            className="btn-add btn-add-sm"
            style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }}
            onClick={() => onAddMark(student)}
          >
            <span className="add-icon">+</span>
            <span className="add-text">Add Marks</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Marks() {
  const { marks, students, subjects, addMarks, updateMarks, deleteMark } = useData();
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewMarkForEdit, setViewMarkForEdit] = useState(null);
  const [addMarkForStudent, setAddMarkForStudent] = useState(null);
  const [deletingMark, setDeletingMark] = useState(null);
  const [selectedStudentMarks, setSelectedStudentMarks] = useState('all');

  // Role-based filtering
  const role = currentUser?.role;
  const userClass = currentUser?.className;

  // Determine visible students (for student role, only themselves; for CR, only their class)
  let roleVisibleStudents = students;
  if (role === 'student') {
    // The /students endpoint is off-limits to students (403), so build the
    // student's own profile from the logged-in portal account — exactly like
    // the Dashboard's synthetic record. This guarantees a student only ever
    // sees THEIR OWN record on the Marks page.
    roleVisibleStudents = currentUser?.fullName
      ? [{
          id: currentUser.linkedStudentId,
          name: currentUser.fullName,
          className: currentUser.className,
          rollNo: currentUser.rollNo || '',
          email: currentUser.email,
          status: 'Active',
        }]
      : [];
  } else if (role === 'cr_admin' && !currentUser?.manageAllClasses) {
    roleVisibleStudents = students.filter(s => s.className === userClass);
  }

  // Determine visible marks
  let roleVisibleMarks = marks;
  if (role === 'student') {
    // Match the student's own marks by linked student id or name. The server
    // already scopes /marks for students; this is a second safety layer.
    const myId = currentUser?.linkedStudentId != null ? Number(currentUser.linkedStudentId) : null;
    const myName = (currentUser?.fullName || '').trim().toLowerCase();
    roleVisibleMarks = marks.filter(m =>
      (myId != null && Number(m.studentId) === myId) ||
      (!!myName && String(m.studentName || '').trim().toLowerCase() === myName)
    );
  } else if (role === 'cr_admin') {
    const validStudentIds = roleVisibleStudents.map(s => s.id);
    roleVisibleMarks = marks.filter(m => validStudentIds.includes(m.studentId));
  } else if (role === 'teacher_admin') {
    // Only marks for subjects taught by this teacher
    const teacherSubjects = subjects.filter(s =>
      (s.teacher || '').includes(currentUser?.fullName || '')
    ).map(s => s.name);
    roleVisibleMarks = marks.filter(m => teacherSubjects.includes(m.subject));
  }

  const filteredStudents = roleVisibleStudents.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.rollNo.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMarks = roleVisibleMarks.filter(m => {
    const matchesSubject = !filterSubject || m.subject === filterSubject;
    const matchesExam = !filterExam || m.examType === filterExam;
    const matchesStudent = !selectedStudentMarks || selectedStudentMarks === 'all' || m.studentId === Number(selectedStudentMarks);
    return matchesSubject && matchesExam && matchesStudent;
  });

  const subjectList = role === 'teacher_admin'
    ? [...new Set(subjects.filter(s => (s.teacher || '').includes(currentUser?.fullName || '')).map(s => s.name))].sort()
    : [...new Set(subjects.map(s => s.name))].sort();
  const examTypes = [...new Set(roleVisibleMarks.map(m => m.examType))].sort();

  const handleSave = async (formData) => {
    try {
      if (viewMarkForEdit) {
        await updateMarks(viewMarkForEdit.id, formData);
        showToast('Marks updated successfully!', 'success');
      } else {
        await addMarks(formData);
        showToast('Marks added successfully!', 'success');
      }
      setShowModal(false);
      setViewMarkForEdit(null);
      setAddMarkForStudent(null);
    } catch (err) {
      showToast(err.message || 'Failed to save marks.', 'error');
    }
  };

  const handleDelete = async () => {
    if (deletingMark) {
      await deleteMark(deletingMark.id);
      showToast('Marks record deleted!', 'info');
      setDeletingMark(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Student Marks</h1>
        <p>Record, update, and manage student academic performance.</p>
      </div>

      {/* Summary stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">📝</div>
          <div className="stat-info">
            <h3>{roleVisibleMarks.length}</h3>
            <p>Marks Records</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">📊</div>
          <div className="stat-info">
            <h3>{new Set(roleVisibleMarks.map(m => m.studentId)).size}</h3>
            <p>Students Graded</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">📚</div>
          <div className="stat-info">
            <h3>{new Set(roleVisibleMarks.map(m => m.subject)).size}</h3>
            <p>Subjects Tested</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">🏆</div>
          <div className="stat-info">
            <h3>{roleVisibleMarks.filter(m => m.marks >= 90).length}</h3>
            <p>A+ Grades</p>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search students..."
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
          <select
            className="filter-select"
            value={filterExam}
            onChange={(e) => setFilterExam(e.target.value)}
          >
            <option value="">All Exams</option>
            {examTypes.map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={selectedStudentMarks}
            onChange={(e) => setSelectedStudentMarks(e.target.value)}
          >
            <option value="all">All Students</option>
            {roleVisibleStudents.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {hasPermission('record_marks') && (
          <button className="btn-add" onClick={() => {
            setViewMarkForEdit(null);
            setAddMarkForStudent(null);
            setShowModal(true);
          }}>
            <span className="add-icon">+</span>
            <span className="add-text">Add Marks</span>
          </button>
        )}
      </div>

      {/* Student marks cards */}
      <div className="page-header" style={{ marginBottom: '15px' }}>
        <h1 style={{ fontSize: '1.15rem' }}>Student Performance Overview</h1>
      </div>
      <div className="card-grid">
        {filteredStudents.map(student => (
          <StudentMarksSummary
            key={student.id}
            student={student}
            marks={roleVisibleMarks}
            readOnly={!hasPermission('record_marks')}
            onAddMark={(s) => {
              setAddMarkForStudent(s);
              setShowModal(true);
            }}
            onEditMark={(mark) => {
              setViewMarkForEdit(mark);
              setShowModal(true);
            }}
          />
        ))}
        {filteredStudents.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div className="icon">🔍</div>
            <h3>No students found</h3>
            <p>Try adjusting your search.</p>
          </div>
        )}
      </div>

      {/* All marks records */}
      <div className="page-header" style={{ marginBottom: '15px', marginTop: '30px' }}>
        <h1 style={{ fontSize: '1.15rem' }}>All Marks Records</h1>
      </div>
      <div className="panel">
        <div className="panel-body" style={{ padding: '0' }}>
          {filteredMarks.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Subject</th>
                    <th>Marks</th>
                    <th>Grade</th>
                    <th>Exam Type</th>
                    {(hasPermission('record_marks') || hasPermission('delete_marks')) && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredMarks.map(mark => {
                    const gradeInfo = getGrade(mark.marks);
                    return (
                      <tr key={mark.id}>
                        <td>
                          <div className="student-cell">
                            <div className="student-avatar">{mark.studentName[0]}{mark.studentName.split(' ')[1]?.[0] || ''}</div>
                            <div className="name">{mark.studentName}</div>
                          </div>
                        </td>
                        <td>{mark.subject}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="marks-cell" style={{ color: gradeInfo.color }}>
                              {mark.marks}
                            </span>
                            <div className="progress-bar" style={{ width: '100px' }}>
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${mark.marks}%`,
                                  background: gradeInfo.color
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${mark.marks >= 80 ? 'success' : mark.marks >= 60 ? 'warning' : 'danger'}`}>
                            {mark.grade}
                          </span>
                        </td>
                        <td>{mark.examType}</td>
                        {(hasPermission('record_marks') || hasPermission('delete_marks')) && (
                          <td>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              {hasPermission('record_marks') && (
                                <button className="btn-icon edit" title="Edit" onClick={() => {
                                  setViewMarkForEdit(mark);
                                  setShowModal(true);
                                }}><Icon name="edit" size={15} /></button>
                              )}
                              {hasPermission('delete_marks') && (
                                <button className="btn-icon delete" title="Delete" onClick={() => setDeletingMark(mark)}><Icon name="delete" size={15} /></button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="icon">📝</div>
              <h3>No marks records found</h3>
              <p>Try adjusting your filters or add new marks.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Mode Modal */}
      {showModal && (
        <Modal
          title={viewMarkForEdit ? 'Edit Marks' : 'Add Marks'}
          onClose={() => {
            setShowModal(false);
            setViewMarkForEdit(null);
            setAddMarkForStudent(null);
          }}
        >
          <MarkForm
            markData={viewMarkForEdit || (addMarkForStudent ? { studentId: addMarkForStudent.id, studentName: addMarkForStudent.name } : null)}
            students={students}
            subjects={subjects}
            onSave={handleSave}
            onCancel={() => {
              setShowModal(false);
              setViewMarkForEdit(null);
              setAddMarkForStudent(null);
            }}
          />
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deletingMark && (
        <ConfirmDialog
          message={`Are you sure you want to delete the ${deletingMark.subject} marks record for ${deletingMark.studentName}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMark(null)}
        />
      )}
    </div>
  );
}

export default Marks;