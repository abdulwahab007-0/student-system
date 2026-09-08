import { useState, useEffect, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

// Default weekly structure: 1 period on Friday, 3 on Saturday, 3 on Sunday.
// Admins can add / remove days and periods per day via the "Structure" editor.
const DEFAULT_STRUCTURE = {
  days: [
    { name: 'Friday', periods: ['08:00 - 09:30'] },
    { name: 'Saturday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
    { name: 'Sunday', periods: ['08:00 - 09:30', '09:30 - 11:00', '11:00 - 12:30'] },
  ],
};
const DEFAULT_PERIOD = '08:00 - 09:30';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const slotColors = ['#059669', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#a21caf', '#ea580c', '#4f46e5'];
const dayColors = ['#047857', '#0369a1', '#15803d', '#b45309', '#6d28d9', '#b91c1c', '#0e7490', '#86198f', '#c2410c', '#4338ca'];

const ordinalLabel = (i) => ORDINALS[i] || `${i + 1}th`;
const emptyStructure = () => ({
  days: DEFAULT_STRUCTURE.days.map(d => ({ name: d.name, periods: [...d.periods] })),
});
const maxPeriods = (structure) => (structure?.days || []).reduce((m, d) => Math.max(m, d.periods.length), 0);

function ScheduleForm({ slot, subjects, onSave, onCancel, existingSlot }) {
  const [form, setForm] = useState({
    subject: slot?.subject || '', teacher: slot?.teacher || '', room: slot?.room || '',
  });
  const handleChange = (e) => { const { name, value } = e.target; setForm(prev => ({ ...prev, [name]: value })); };
  const handleSubjectChange = (e) => {
    const subjectName = e.target.value;
    const subject = subjects.find(s => s.name === subjectName);
    setForm(prev => ({ ...prev, subject: subjectName, teacher: subject?.teacher || prev.teacher }));
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.subject.trim()) return;
    onSave({ subject: form.subject.trim(), teacher: form.teacher.trim(), room: form.room.trim() });
  };
  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group full-width">
          <label>Subject *</label>
          <select name="subject" value={form.subject} onChange={handleSubjectChange} required>
            <option value="">Select subject</option>
            {subjects.map(s => (<option key={s.id} value={s.name}>{s.name} ({s.code})</option>))}
          </select>
        </div>
        <div className="form-group">
          <label>Teacher</label>
          <input type="text" name="teacher" value={form.teacher} onChange={handleChange} placeholder="e.g. Dr. Smith" />
        </div>
        <div className="form-group">
          <label>Room</label>
          <input type="text" name="room" value={form.room} onChange={handleChange} placeholder="e.g. Room 201" />
        </div>
      </div>
      {existingSlot && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--light-gray)', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '12px' }}>
          This slot already has a class. Saving will replace it.
        </div>
      )}
      <div className="modal-footer" style={{ padding: '16px 0 0', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          <Icon name={existingSlot ? 'edit' : 'plus'} size={16} style={{ marginRight: '6px' }} />
          {existingSlot ? 'Update Slot' : 'Add Class'}
        </button>
      </div>
    </form>
  );
}

// Modal editor to configure which days the timetable has and how many time periods
// each day contains. Each day has its own list of (editable) time labels.
function StructureEditor({ structure, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => ({
    days: structure?.days?.map(d => ({ name: d.name, periods: [...(d.periods || [])] })) || [],
  }));

  const updateDay = (di, patch) => {
    setDraft(prev => {
      const days = prev.days.map((d, i) => (i === di ? { ...d, ...patch } : d));
      return { ...prev, days };
    });
  };
  const addDay = () => {
    setDraft(prev => ({ ...prev, days: [...prev.days, { name: '', periods: [DEFAULT_PERIOD] }] }));
  };
  const removeDay = (di) => {
    setDraft(prev => ({ ...prev, days: prev.days.filter((_, i) => i !== di) }));
  };
  const addPeriod = (di) => {
    updateDay(di, { periods: [...draft.days[di].periods, DEFAULT_PERIOD] });
  };
  const removePeriod = (di, pi) => {
    updateDay(di, { periods: draft.days[di].periods.filter((_, i) => i !== pi) });
  };
  const renamePeriod = (di, pi, value) => {
    updateDay(di, { periods: draft.days[di].periods.map((p, i) => (i === pi ? value : p)) });
  };

  const handleSave = () => {
    // Keep only days with a name; keep non-empty period labels.
    const cleaned = draft.days
      .filter(d => d.name.trim())
      .map(d => ({ name: d.name.trim(), periods: d.periods.map(p => p.trim()).filter(Boolean) }));
    onSave({ days: cleaned });
  };

  const inputStyle = {
    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'var(--white)', fontSize: '0.8rem', color: 'var(--dark)',
  };

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--gray)', marginBottom: '14px' }}>
        Add or remove days and time periods. Each day can have its own number of periods —
        use + / − to adjust. Any saved classes on a removed day or period are kept but hidden.
      </p>
      {draft.days.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--gray)', fontStyle: 'italic' }}>No days yet — add one below.</p>
      )}
      {draft.days.map((day, di) => (
        <div key={di} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', marginBottom: '12px', background: 'var(--white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <input
              type="text" value={day.name} placeholder="Day name (e.g. Saturday)"
              onChange={(e) => updateDay(di, { name: e.target.value })} style={{ ...inputStyle, flex: 1, fontWeight: '600' }}
            />
            <button className="btn-icon delete" title="Remove day" onClick={() => removeDay(di)}>
              <Icon name="delete" size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {day.periods.map((period, pi) => (
              <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '40px', fontSize: '0.72rem', fontWeight: '600', color: slotColors[pi % slotColors.length] }}>
                  {ordinalLabel(pi)}
                </span>
                <input
                  type="text" value={period} placeholder="e.g. 08:00 - 09:30"
                  onChange={(e) => renamePeriod(di, pi, e.target.value)} style={{ ...inputStyle, flex: 1 }}
                />
                <button className="btn-icon delete" title="Remove period" onClick={() => removePeriod(di, pi)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px', marginTop: '10px' }} onClick={() => addPeriod(di)}>
            <Icon name="plus" size={13} style={{ marginRight: '4px' }} />Add Period
          </button>
        </div>
      ))}
      <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={addDay}>
        <Icon name="plus" size={14} style={{ marginRight: '5px' }} />Add Day
      </button>
      <div className="modal-footer" style={{ padding: '16px 0 0', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          <Icon name="check" size={16} style={{ marginRight: '6px' }} />Save Structure
        </button>
      </div>
    </div>
  );
}

function ClassSchedule() {
  const { currentUser, hasPermission } = useAuth();
  const { subjects, classes } = useData();
  const canManage = hasPermission('edit_class_schedule');
  const isStudent = currentUser?.role === 'student';
  const userClassName = (currentUser?.className || '').trim();
  const [selectedClass, setSelectedClass] = useState('');
  const [schedule, setSchedule] = useState({ structure: emptyStructure(), slots: {} });
  const [showModal, setShowModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [deletingSlot, setDeletingSlot] = useState(null);
  const [showStructure, setShowStructure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Pick the active class: student's own class (locked), else first available class.
  useEffect(() => {
    const candidate = userClassName || (classes.length > 0 ? classes[0].name : '');
    if (candidate) {
      const target = isStudent ? userClassName : candidate;
      setSelectedClass(prev => (prev === target ? prev : target));
    }
  }, [userClassName, classes, isStudent]);

  // Load the schedule from the server whenever the selected class changes.
  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    api.getClassSchedule(selectedClass)
      .then(data => setSchedule({ structure: data.structure || emptyStructure(), slots: data.slots || {} }))
      .catch(err => {
        console.error('Failed to load schedule:', err);
        setSchedule({ structure: emptyStructure(), slots: {} });
        showToast('Failed to load schedule', 'error');
      })
      .finally(() => setLoading(false));
  }, [selectedClass, showToast]);

  const persistSchedule = useCallback(async (newSchedule) => {
    try {
      await api.saveClassSchedule(selectedClass, newSchedule);
      showToast('Schedule saved');
    } catch (err) {
      console.error('Failed to save schedule:', err);
      showToast('Failed to save schedule', 'error');
    }
  }, [selectedClass, showToast]);

  const handleSelectClass = (name) => {
    setSelectedClass(name);
  };

  const classSubjects = subjects.filter(s => (s.className || '').split(',').map(c => c.trim()).includes(selectedClass));
  const displaySubjects = classSubjects.length > 0 ? classSubjects : subjects;
  // For students the /classes endpoint returns 403 (view_classes is admin-only),
  // so `classes` is empty here. Inject a synthetic entry for the student's own
  // class so the class selector shows e.g. "BSCS" instead of being blank and
  // "No Class Selected".
  const visibleClasses = isStudent
    ? classes.some(c => c.name === userClassName)
      ? classes.filter(c => c.name === userClassName)
      : userClassName
        ? [{ id: `own-${userClassName}`, name: userClassName, code: userClassName.toUpperCase() }]
        : []
    : classes;
  const structure = schedule.structure || emptyStructure();
  const days = structure.days || [];
  const slots = schedule.slots || {};

  const getSlot = (day, timeIdx) => slots[`${day}_${timeIdx}`] || null;
  // Only count slots that are actually visible in the current structure.
  const visibleSlotIds = new Set(
    days.flatMap(d => d.periods.map((_, i) => `${d.name}_${i}`))
  );
  const totalSlots = Object.entries(slots).filter(([k]) => visibleSlotIds.has(k)).length;

  const openAddSlot = (day, timeIdx) => {
    setEditingSlot({ day, timeIndex: timeIdx, existing: getSlot(day, timeIdx) });
    setShowModal(true);
  };
  const handleSaveSlot = (data) => {
    const key = `${editingSlot.day}_${editingSlot.timeIndex}`;
    const next = { ...schedule, slots: { ...schedule.slots, [key]: data } };
    setSchedule(next);
    persistSchedule(next);
    setShowModal(false); setEditingSlot(null);
  };
  const handleDeleteSlot = () => {
    const key = `${deletingSlot.day}_${deletingSlot.timeIndex}`;
    const next = { ...schedule, slots: { ...schedule.slots } };
    delete next.slots[key];
    setSchedule(next);
    persistSchedule(next);
    setDeletingSlot(null);
  };
  const clearAll = () => {
    if (window.confirm('Clear the entire schedule for this class?')) {
      const next = { ...schedule, slots: {} };
      setSchedule(next);
      persistSchedule(next);
    }
  };
  const handleSaveStructure = (newStructure) => {
    const next = { structure: newStructure, slots: schedule.slots || {} };
    setSchedule(next);
    persistSchedule(next);
    setShowStructure(false);
  };

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '500',
          background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: toast.type === 'error' ? '#dc2626' : '#16a34a',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {toast.type === 'error' ? '✕' : '✓'} {toast.msg}
        </div>
      )}
      <div className="page-header">
        <h1>Class Schedule</h1>
        <p>Weekly timetable for classes — {isStudent ? 'view your schedule' : 'manage class schedules'}.</p>
      </div>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray)', fontSize: '0.85rem' }}>
          <Icon name="calendar" size={24} style={{ marginBottom: '8px', animation: 'spin 1s linear infinite' }} />
          <div>Loading schedule...</div>
        </div>
      )}
      {!loading && (<>
        <div className="schedule-stats">
          <div className="schedule-stat schedule-stat-total">
            <div className="schedule-stat-icon schedule-stat-icon-total"><Icon name="calendar" size={22} /></div>
            <div className="schedule-stat-body">
              <span className="schedule-stat-value">{totalSlots}</span>
              <span className="schedule-stat-label">Scheduled / Week</span>
              <div className="schedule-stat-bar"><span style={{ width: '100%' }}></span></div>
            </div>
          </div>
          <div className="schedule-stat schedule-stat-days">
            <div className="schedule-stat-icon schedule-stat-icon-days"><Icon name="book" size={22} /></div>
            <div className="schedule-stat-body">
              <span className="schedule-stat-value">{days.length}</span>
              <span className="schedule-stat-label">Days / Week</span>
              <div className="schedule-stat-bar"><span style={{ width: `${days.length > 0 ? (days.length / 7) * 100 : 0}%` }}></span></div>
            </div>
          </div>
          <div className="schedule-stat schedule-stat-periods">
            <div className="schedule-stat-icon schedule-stat-icon-periods"><Icon name="clock" size={22} /></div>
            <div className="schedule-stat-body">
              <span className="schedule-stat-value">{days.reduce((m, d) => m + d.periods.length, 0)}</span>
              <span className="schedule-stat-label">Periods / Week</span>
              <div className="schedule-stat-bar"><span style={{ width: `${days.length > 0 ? (days.reduce((m, d) => m + d.periods.length, 0) / (days.length * 8)) * 100 : 0}%` }}></span></div>
            </div>
                    </div>
        </div>

        <div className="schedule-controls">
          <label className="schedule-controls-label">Class:</label>
          <select value={selectedClass} disabled={isStudent} onChange={(e) => handleSelectClass(e.target.value)}
            className="schedule-controls-select">
            {visibleClasses.map(c => (<option key={c.id || c.name} value={c.name}>{c.name} ({c.code})</option>))}
          </select>
          {canManage && (
            <button className="btn btn-secondary" onClick={() => setShowStructure(true)}>
              <Icon name="calendar" size={14} style={{ marginRight: '4px' }} />Structure
            </button>
          )}
          {canManage && totalSlots > 0 && (
            <button className="btn btn-secondary" onClick={clearAll}>
              <Icon name="delete" size={14} style={{ marginRight: '4px' }} />Clear All
            </button>
          )}
        </div>

        <div className="panel">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="calendar" size={18} />Weekly Timetable — {selectedClass || 'No Class Selected'}
          </h3>
        </div>
        {days.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
            No days configured yet.{canManage ? ' Click "Structure" to add days and periods.' : ''}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: '700px' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '600', color: 'var(--gray)', borderBottom: '2px solid var(--border)', width: '130px', background: 'var(--light-gray)' }}>Day</th>
                {Array.from({ length: maxPeriods(structure) || 1 }, (_, pi) => (
                  <th key={pi} style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '600', color: slotColors[pi % slotColors.length], borderBottom: `2px solid ${slotColors[pi % slotColors.length]}30`, background: `${slotColors[pi % slotColors.length]}08`, fontSize: '0.8rem' }}>{ordinalLabel(pi)} Period</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, di) => (
                <tr key={`${day.name}_${di}`}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--light-gray)', fontWeight: '600', color: dayColors[di % dayColors.length] }}>
                    {day.name}
                  </td>
                  {day.periods.map((timeLabel, pi) => {
                    const slot = getSlot(day.name, pi);
                    const color = slotColors[pi % slotColors.length];
                    return (
                      <td key={`${day.name}_${pi}`} style={{ padding: '8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', verticalAlign: 'top' }}>
                        <div style={{ fontSize: '0.66rem', color, fontWeight: '600', marginBottom: '4px' }}>{timeLabel}</div>
                        {slot ? (
                          <div style={{ padding: '8px 10px', borderRadius: '8px', background: `${color}12`, border: `1px solid ${color}25`, cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && openAddSlot(day.name, pi)}>
                            <div style={{ fontWeight: '600', fontSize: '0.8rem', color: 'var(--dark)', marginBottom: '3px' }}>{slot.subject}</div>
                            {slot.teacher && <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{slot.teacher}</div>}
                            {slot.room && <div style={{ fontSize: '0.68rem', color, fontWeight: '500' }}>{slot.room}</div>}
                            {canManage && (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                                <button className="btn-icon edit" style={{ width: '24px', height: '24px' }} title="Edit" onClick={(e) => { e.stopPropagation(); openAddSlot(day.name, pi); }}><Icon name="edit" size={12} /></button>
                                <button className="btn-icon delete" style={{ width: '24px', height: '24px' }} title="Delete" onClick={(e) => { e.stopPropagation(); setDeletingSlot({ day: day.name, timeIndex: pi }); }}><Icon name="delete" size={12} /></button>
                              </div>
                            )}
                          </div>
                        ) : canManage ? (
                          <button onClick={() => openAddSlot(day.name, pi)} style={{ width: '100%', padding: '12px 8px', border: '2px dashed var(--border)', borderRadius: '8px', background: 'transparent', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <Icon name="plus" size={14} /> Add
                          </button>
                        ) : (
                          <div style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--border)', fontSize: '0.72rem', fontStyle: 'italic' }}>—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>)}

      {showModal && (
        <Modal title={editingSlot?.existing ? 'Edit Schedule Slot' : 'Add Schedule Slot'}
          onClose={() => { setShowModal(false); setEditingSlot(null); }}>
          <ScheduleForm slot={editingSlot?.existing} subjects={displaySubjects} onSave={handleSaveSlot}
            onCancel={() => { setShowModal(false); setEditingSlot(null); }} existingSlot={editingSlot?.existing} />
        </Modal>
      )}
      {deletingSlot && (
        <ConfirmDialog
          message={`Remove ${getSlot(deletingSlot.day, deletingSlot.timeIndex)?.subject || 'this class'} from ${deletingSlot.day}?`}
          onConfirm={handleDeleteSlot} onCancel={() => setDeletingSlot(null)} />
      )}
      {showStructure && (
        <Modal title="Edit Timetable Structure" onClose={() => setShowStructure(false)}>
          <StructureEditor structure={structure} onCancel={() => setShowStructure(false)} onSave={handleSaveStructure} />
        </Modal>
      )}
    </div>
  );
}

export default ClassSchedule;
