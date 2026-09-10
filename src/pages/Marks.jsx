import { useState, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
  EXAM_SCHEME, SCHEME_KEYS, SCHEME_TOTAL,
  normalizeExamType, getStudentAverage
} from '../utils/scoreUtils';
import Icon from '../components/Icon';

// Helpers
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

function emptyCells() {
  const c = {};
  EXAM_SCHEME.forEach(e => { c[e.key] = { value: '', id: null }; });
  return c;
}

function numOrZero(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Match a subject's comma-separated className list to a student's class. */
function subjectMatchesClass(subject, studentClass) {
  if (!studentClass) return false;
  const tags = (subject.className || '').split(',').map(c => c.trim().toLowerCase());
  return tags.includes(String(studentClass).trim().toLowerCase());
}

// Main
function Marks() {
  const { students, marks, subjects, addMarks, updateMarks, deleteMark } = useData();
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [subjectPickerStudentId, setSubjectPickerStudentId] = useState(null);

  const canEdit = hasPermission('record_marks') || hasPermission('delete_marks');
  const role = currentUser?.role;
  const userClass = currentUser?.className;

  // Role-based student filtering
  let roleVisibleStudents = students;
  if (role === 'student') {
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

  // Role-based marks filtering
  let roleVisibleMarks = marks;
  if (role === 'student') {
    const myId = currentUser?.linkedStudentId != null ? Number(currentUser.linkedStudentId) : null;
    const myName = (currentUser?.fullName || '').trim().toLowerCase();
    roleVisibleMarks = marks.filter(m =>
      (myId != null && Number(m.studentId) === myId) ||
      (!!myName && String(m.studentName || '').trim().toLowerCase() === myName)
    );
  } else if (role === 'cr_admin') {
    const ids = roleVisibleStudents.map(s => s.id);
    roleVisibleMarks = marks.filter(m => ids.includes(m.studentId));
  } else if (role === 'teacher_admin') {
    const tSubs = subjects.filter(s =>
      (s.teacher || '').includes(currentUser?.fullName || '')
    ).map(s => s.name);
    roleVisibleMarks = marks.filter(m => tSubs.includes(m.subject));
  }

  const filteredStudents = roleVisibleStudents.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    String(s.rollNo).toLowerCase().includes(search.toLowerCase())
  );

  const marksByStudent = useMemo(() => {
    const map = {};
    roleVisibleMarks.forEach(m => {
      if (!map[m.studentId]) map[m.studentId] = [];
      map[m.studentId].push(m);
    });
    return map;
  }, [roleVisibleMarks]);

  const buildDraft = useCallback((studentId) => {
    const list = marksByStudent[studentId] || [];
    const cells = {};
    const order = [];
    list.forEach(m => {
      const key = normalizeExamType(m.examType);
      if (!SCHEME_KEYS.has(key)) return;
      if (!cells[m.subject]) { cells[m.subject] = emptyCells(); order.push(m.subject); }
      const cell = cells[m.subject][key];
      if (cell && cell.id == null) {
        cell.value = String(m.marks ?? '');
        cell.id = m.id;
      }
    });
    return { order, cells, newSubjects: {} };
  }, [marksByStudent]);

  const toggleExpand = (studentId) => {
    setExpandedId(prev => {
      if (prev === studentId) return null;
      setDrafts(d => (d[studentId] ? d : { ...d, [studentId]: buildDraft(studentId) }));
      return studentId;
    });
  };

  const handleCellChange = (studentId, subject, compKey, raw) => {
    setDrafts(prev => {
      const draft = prev[studentId];
      if (!draft) return prev;
      const cells = { ...draft.cells, [subject]: { ...draft.cells[subject] } };
      cells[subject][compKey] = { ...cells[subject][compKey], value: raw };
      return { ...prev, [studentId]: { ...draft, cells } };
    });
  };

  /** Get class-appropriate subjects for a student (not already in draft). */
  const getClassSubjects = useCallback((studentId) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return [];
    const draft = drafts[studentId];
    const existingNames = new Set(draft?.order || []);
    return subjects.filter(s =>
      subjectMatchesClass(s, student.className) && !existingNames.has(s.name)
    );
  }, [students, subjects, drafts]);

  const handleAddSubject = (studentId) => {
    setSubjectPickerStudentId(studentId);
  };

  const handlePickSubject = (studentId, subjectName) => {
    setSubjectPickerStudentId(null);
    if (!subjectName) return;
    setDrafts(prev => {
      const draft = prev[studentId];
      if (!draft) return prev;
      if (draft.cells[subjectName]) return prev; // already exists
      return {
        ...prev,
        [studentId]: {
          ...draft,
          order: [...draft.order, subjectName],
          cells: { ...draft.cells, [subjectName]: emptyCells() },
          newSubjects: { ...(draft.newSubjects || {}), [subjectName]: true },
        },
      };
    });
  };

  const handleAddCustomSubject = (studentId) => {
    setSubjectPickerStudentId(null);
    setDrafts(prev => {
      const draft = prev[studentId];
      if (!draft) return prev;
      const base = 'New Subject';
      let name = base;
      let i = 2;
      while (draft.cells[name] != null) { name = base + ' ' + i++; }
      return {
        ...prev,
        [studentId]: {
          ...draft,
          order: [...draft.order, name],
          cells: { ...draft.cells, [name]: emptyCells() },
          newSubjects: { ...(draft.newSubjects || {}), [name]: true },
        },
      };
    });
  };

  const handleRenameSubject = (studentId, oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setDrafts(prev => {
      const draft = prev[studentId];
      if (!draft || draft.cells[trimmed]) return prev;
      const cells = { ...draft.cells };
      cells[trimmed] = cells[oldName];
      delete cells[oldName];
      const order = draft.order.map(o => o === oldName ? trimmed : o);
      const ns = { ...(draft.newSubjects || {}) };
      delete ns[oldName];
      ns[trimmed] = true;
      return { ...prev, [studentId]: { ...draft, cells, order, newSubjects: ns } };
    });
  };

  const handleDeleteSubject = async () => {
    const { studentId, subject } = deleteTarget;
    try {
      const records = (marksByStudent[studentId] || []).filter(m => m.subject === subject);
      for (const rec of records) await deleteMark(rec.id);
      setDrafts(prev => {
        const draft = prev[studentId];
        if (!draft) return prev;
        const cells = { ...draft.cells };
        delete cells[subject];
        const order = draft.order.filter(o => o !== subject);
        const ns = { ...(draft.newSubjects || {}) };
        delete ns[subject];
        return { ...prev, [studentId]: { ...draft, cells, order, newSubjects: ns } };
      });
      showToast('Subject marks removed.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to remove subject.', 'error');
    }
    setDeleteTarget(null);
  };

  const handleSave = async (studentId) => {
    const draft = drafts[studentId];
    const student = roleVisibleStudents.find(s => s.id === studentId);
    if (!draft || !student) return;

    // Validate all cells
    for (const [subject, cells] of Object.entries(draft.cells)) {
      for (const comp of EXAM_SCHEME) {
        const raw = cells[comp.key]?.value;
        if (raw === '' || raw == null) continue;
        const num = Number(raw);
        if (isNaN(num) || num < 0 || num > comp.max) {
          showToast(subject + ' \u2014 ' + comp.key + ' must be 0\u2013' + comp.max + '.', 'error');
          return;
        }
      }
    }

    setSavingId(studentId);
    const idUpdates = {};

    try {
      for (const [subject, cells] of Object.entries(draft.cells)) {
        const records = (marksByStudent[studentId] || []).filter(m => m.subject === subject);
        const total = EXAM_SCHEME.reduce((a, c) => a + numOrZero(cells[c.key]?.value), 0);
        const grade = total >= 0 ? getGrade(total).grade : '';

        for (const comp of EXAM_SCHEME) {
          const raw = cells[comp.key]?.value;
          const num = raw === '' || raw == null ? null : Number(raw);
          const matches = records.filter(r => normalizeExamType(r.examType) === comp.key);
          const cellKey = subject + '||' + comp.key;

          if (num != null && !isNaN(num) && num >= 0 && num <= comp.max) {
            const payload = {
              studentId,
              studentName: student.name,
              subject,
              marks: num,
              grade,
              examType: comp.key,
            };
            if (matches.length > 0) {
              await updateMarks(matches[0].id, payload);
              for (const extra of matches.slice(1)) await deleteMark(extra.id);
              idUpdates[cellKey] = matches[0].id;
            } else {
              const newId = await addMarks(payload);
              idUpdates[cellKey] = newId;
            }
          } else if (matches.length > 0) {
            for (const rec of matches) await deleteMark(rec.id);
            idUpdates[cellKey] = null;
          }
        }

        // Remove any legacy extras not matching scheme
        const legacyExtras = records.filter(r => !SCHEME_KEYS.has(normalizeExamType(r.examType)));
        for (const rec of legacyExtras) await deleteMark(rec.id);
      }

      // Rebuild draft with updated ids
      setDrafts(prev => {
        const draft = prev[studentId];
        if (!draft) return prev;
        const cells = {};
        Object.entries(draft.cells).forEach(([subject, c]) => {
          const nc = {};
          EXAM_SCHEME.forEach(comp => {
            const k = subject + '||' + comp.key;
            nc[comp.key] = {
              value: c[comp.key]?.value || '',
              id: Object.prototype.hasOwnProperty.call(idUpdates, k)
                ? idUpdates[k]
                : (c[comp.key]?.id ?? null),
            };
          });
          cells[subject] = nc;
        });
        return { ...prev, [studentId]: { ...draft, cells } };
      });

      showToast('Saved ' + Object.keys(draft.cells).length + ' subject(s) for ' + student.name + '.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save marks.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const totalSubjects = new Set(roleVisibleMarks.map(m => m.subject)).size;
  const totalGraded = new Set(roleVisibleMarks.map(m => m.studentId)).size;

  return (
    <div>
      <div className="page-header">
        <h1>Student Marks</h1>
        <p>Record, update, and manage student academic performance.</p>
      </div>

      {/* Summary stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">{'\u{1F4DD}'}</div>
          <div className="stat-info">
            <h3>{roleVisibleMarks.length}</h3>
            <p>Marks Records</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">{'\u{1F4CA}'}</div>
          <div className="stat-info">
            <h3>{totalGraded}</h3>
            <p>Students Graded</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">{'\u{1F4DA}'}</div>
          <div className="stat-info">
            <h3>{totalSubjects}</h3>
            <p>Subjects Tested</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">{'\u{1F3C6}'}</div>
          <div className="stat-info">
            <h3>{roleVisibleMarks.filter(m => (Number(m.marks) || 0) >= 90).length}</h3>
            <p>A+ Grades</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="toolbar">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or roll no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Scheme legend */}
      <div className="scheme-legend">
        <span className="scheme-legend-title">Semester Marking Scheme</span>
        {EXAM_SCHEME.map(e => (
          <span key={e.key} className="scheme-legend-chip">
            {e.key} <span className="scheme-legend-max">/{e.max}</span>
          </span>
        ))}
        <span className="scheme-legend-total">Total: {SCHEME_TOTAL}</span>
      </div>

      {/* Student Accordion */}
      <div className="mark-accordion">
        {filteredStudents.map(student => {
          const isOpen = expandedId === student.id;
          const studentMarks = marksByStudent[student.id] || [];
          const avg = getStudentAverage(studentMarks);
          const avgColor = avg >= 85 ? 'var(--success)' : avg >= 70 ? 'var(--warning)' : 'var(--danger)';
          const subjectCount = new Set(studentMarks.map(m => m.subject)).size;
          const draft = drafts[student.id];

          return (
            <div key={student.id} className={'mark-accordion-item' + (isOpen ? ' open' : '')}>
              <button className="mark-accordion-head" onClick={() => toggleExpand(student.id)}>
                <div className="accordion-avatar">
                  {student.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="accordion-info">
                  <span className="accordion-name">{student.name}</span>
                  <span className="accordion-sub">
                    {student.rollNo} {'\u00B7'} {student.className}
                    {subjectCount > 0 && (' \u00B7 ' + subjectCount + ' subject' + (subjectCount !== 1 ? 's' : ''))}
                  </span>
                </div>
                <div className="accordion-avg">
                  <span className="accordion-avg-badge" style={{ color: avgColor, background: avgColor + '18' }}>
                    {avg > 0 ? avg + '%' : 'N/A'}
                  </span>
                </div>
                <Icon
                  name="view"
                  size={18}
                  style={{
                    color: 'var(--gray)',
                    transition: 'transform .25s ease',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(90deg)',
                  }}
                />
              </button>

              {isOpen && draft && (
                <div className="mark-accordion-body">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="scheme-table">
                      <thead>
                        <tr className="scheme-head-primary">
                          <th rowSpan="2" className="col-subject">Subject</th>
                          <th colSpan="3" className="col-sessional">Sessional Marks</th>
                          <th className="col-mid">Mid Term</th>
                          <th className="col-final">Final Term</th>
                          <th rowSpan="2" className="col-total">Total</th>
                          <th rowSpan="2" className="col-grade">Grade</th>
                          {canEdit && <th rowSpan="2" className="col-actions"></th>}
                        </tr>
                        <tr className="scheme-head-secondary">
                          {EXAM_SCHEME.map(e => (
                            <th key={e.key} className={'scheme-sub ' + (e.group === 'Sessional' ? 'sess' : e.key === 'Mid' ? 'mid' : 'fin')}>
                              {e.short}<span className="max-tag">/{e.max}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {draft.order.map(subject => {
                          const cells = draft.cells[subject];
                          if (!cells) return null;
                          const total = EXAM_SCHEME.reduce((a, c) => a + numOrZero(cells[c.key]?.value), 0);
                          const gradeInfo = total > 0 ? getGrade(total) : null;
                          const isNew = draft.newSubjects?.[subject];
                          const hasSavedMarks = (marksByStudent[student.id] || []).some(m => m.subject === subject);

                          return (
                            <tr key={subject} className="scheme-row">
                              <td className="col-subject">
                                {isNew ? (
                                  <input
                                    className="subject-rename-input"
                                    value={subject}
                                    onChange={(e) => handleRenameSubject(student.id, subject, e.target.value)}
                                    placeholder="Subject name"
                                  />
                                ) : (
                                  <span className="subject-label">{subject}</span>
                                )}
                              </td>
                              {EXAM_SCHEME.map(comp => {
                                const raw = cells[comp.key]?.value || '';
                                const num = raw === '' ? null : Number(raw);
                                const invalid = raw !== '' && (num === null || isNaN(num) || num < 0 || num > comp.max);
                                return (
                                  <td key={comp.key} className="col-mark">
                                    {canEdit ? (
                                      <input
                                        className={'scheme-input' + (invalid ? ' invalid' : '') + (raw !== '' ? ' has-value' : '')}
                                        type="text"
                                        inputMode="decimal"
                                        value={raw}
                                        placeholder={'\u2014'}
                                        onChange={(e) => handleCellChange(student.id, subject, comp.key, e.target.value)}
                                      />
                                    ) : (
                                      <span className="scheme-readonly">
                                        {raw !== '' ? numOrZero(raw) : '\u2014'}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="col-total">
                                <span className="scheme-total" style={{ color: gradeInfo?.color }}>
                                  {total > 0 ? total : '\u2014'}
                                </span>
                                <span className="scheme-total-max">/{SCHEME_TOTAL}</span>
                              </td>
                              <td className="col-grade">
                                {gradeInfo ? (
                                  <span className={'badge ' + (total >= 80 ? 'success' : total >= 60 ? 'warning' : 'danger')}>
                                    {gradeInfo.grade}
                                  </span>
                                ) : (
                                  <span className="badge">{'\u2014'}</span>
                                )}
                              </td>
                              {canEdit && (
                                <td className="col-actions">
                                  <button
                                    className="btn-icon delete"
                                    title="Remove this subject"
                                    onClick={() => {
                                      if (hasSavedMarks) {
                                        setDeleteTarget({ studentId: student.id, subject });
                                      } else {
                                        setDrafts(prev => {
                                          const d = prev[student.id];
                                          if (!d) return prev;
                                          const c2 = { ...d.cells };
                                          delete c2[subject];
                                          const o = d.order.filter(x => x !== subject);
                                          const ns = { ...(d.newSubjects || {}) };
                                          delete ns[subject];
                                          return { ...prev, [student.id]: { ...d, cells: c2, order: o, newSubjects: ns } };
                                        });
                                      }
                                    }}
                                  >
                                    <Icon name="delete" size={14} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}

                        {draft.order.length === 0 && (
                          <tr>
                            <td colSpan={EXAM_SCHEME.length + 3 + (canEdit ? 1 : 0)} className="scheme-empty">
                              No marks recorded yet. Click "+ Add Subject" below to get started.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {canEdit && (
                    <div className="scheme-footer">
                      <button className="btn btn-sm btn-secondary" onClick={() => handleAddSubject(student.id)}>
                        <Icon name="plus" size={14} style={{ marginRight: '4px' }} /> Add Subject
                      </button>
                      <div className="scheme-footer-right">
                        <span className="scheme-footer-hint">
                          {'Sessional(' + EXAM_SCHEME.filter(e => e.group === 'Sessional').reduce((a, e) => a + e.max, 0) + ') + Mid(' + EXAM_SCHEME.find(e => e.key === 'Mid').max + ') + Final(' + EXAM_SCHEME.find(e => e.key === 'Final').max + ') = ' + SCHEME_TOTAL}
                        </span>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={savingId === student.id}
                          onClick={() => handleSave(student.id)}
                        >
                          {savingId === student.id ? 'Saving\u2026' : 'Save Marks'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredStudents.length === 0 && (
          <div className="empty-state">
            <div className="icon">{'\u{1F50D}'}</div>
            <h3>No students found</h3>
            <p>Try adjusting your search.</p>
          </div>
        )}
      </div>

      {/* Delete subject confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          message={'Remove all marks for "' + deleteTarget.subject + '"? This will delete the subject\'s saved records.'}
          onConfirm={handleDeleteSubject}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Subject picker dropdown */}
      {subjectPickerStudentId && (() => {
        const pickerStudent = students.find(s => s.id === subjectPickerStudentId);
        const classSubjects = getClassSubjects(subjectPickerStudentId);
        const studentClass = pickerStudent?.className || '';
        return (
          <div className="subject-picker-overlay" onClick={() => setSubjectPickerStudentId(null)}>
            <div className="subject-picker-panel" onClick={(e) => e.stopPropagation()}>
              <div className="subject-picker-header">
                <h3>Add Subject{pickerStudent ? ' — ' + pickerStudent.name : ''}</h3>
                <span className="subject-picker-class-tag">{studentClass}</span>
                <button className="subject-picker-close" onClick={() => setSubjectPickerStudentId(null)}>
                  <Icon name="delete" size={16} />
                </button>
              </div>

              {classSubjects.length > 0 ? (
                <div className="subject-picker-list">
                  {classSubjects.map(s => (
                    <button
                      key={s.id || s.name}
                      className="subject-picker-item"
                      onClick={() => handlePickSubject(subjectPickerStudentId, s.name)}
                    >
                      <span className="subject-picker-name">{s.name}</span>
                      <span className="subject-picker-code">{s.code}</span>
                      {s.teacher && <span className="subject-picker-teacher">{s.teacher}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="subject-picker-empty">
                  No additional subjects configured for class <strong>{studentClass}</strong>.
                </div>
              )}

              <div className="subject-picker-footer">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleAddCustomSubject(subjectPickerStudentId)}
                >
                  <Icon name="plus" size={14} style={{ marginRight: '4px' }} /> Add Custom Subject
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Marks;
