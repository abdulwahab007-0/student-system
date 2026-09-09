import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../components/Toast';
import { useData } from '../context/DataContext';
import api from '../services/api';
import Icon from '../components/Icon';
import { exportCSV, exportExcel, exportImage } from '../utils/exportReport';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

const statusMeta = {
  present: { label: 'Present', cls: 'present', icon: 'check' },
  late: { label: 'Late', cls: 'late', icon: 'clock' },
  pending: { label: 'Pending', cls: 'pending', icon: 'clock' },
  approved: { label: 'Approved', cls: 'approved', icon: 'check' },
  rejected: { label: 'Rejected', cls: 'rejected', icon: 'x' },
  absent: { label: 'Absent', cls: 'absent', icon: 'x' },
};

const presenceMeta = {
  present: { label: 'Present', cls: 'present', icon: 'check' },
  late: { label: 'Late', cls: 'late', icon: 'clock' },
  absent: { label: 'Absent', cls: 'absent', icon: 'x' },
};

// Status filter offers only the approval workflow outcomes, not presence values.
// Presence (Present / Late / Absent) is a separate filter below.
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
];

const PRESENCE_OPTIONS = [
  { value: '', label: 'All Presence' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
];

const SA_HEADERS = ['Student Name', 'Roll No', 'Date', 'Class', 'Subject', 'Day', 'Period', 'Presence', 'Status', 'Marked At', 'Approved By'];

function toDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Admin/CR/Teacher view: pick any student and see their attendance with
// summary cards and Excel / CSV / image export of the filtered records.
function StudentAttendance() {
  const showToast = useToast();
  const { students } = useData();
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [student, setStudent] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('');
  const [presence, setPresence] = useState('');

  // Default to the last 30 days on first render
  useEffect(() => {
    if (!fromDate || !toDate) {
      setFromDate(toDateISO(new Date(Date.now() - 30 * 86400000)));
      setToDate(toDateISO(new Date()));
    }
  }, [fromDate, toDate]);

  // Auto-select the first student so the page is immediately useful
  useEffect(() => {
    if (!selectedId && students.length > 0) {
      setSelectedId(students[0].id);
    }
  }, [selectedId, students]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter(s =>
        !q ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.rollNo || '').toLowerCase().includes(q) ||
        (s.className || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, studentSearch]);

  // Load the selected student's records whenever student/date range changes
  useEffect(() => {
    if (!selectedId) {
      setRecords([]);
      setStudent(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Paint the previously loaded records instantly, then refresh in the background
    const cacheKey = `/attendance/student-records?studentId=${selectedId}`;
    const cached = api.getSwrCache(cacheKey);
    if (cached && Array.isArray(cached.records)) {
      setRecords(cached.records);
      setStudent(cached.student || null);
      setLoading(false);
    }
    api.getStudentAttendanceRecords(selectedId, fromDate, toDate)
      .then(data => {
        setRecords(data.records || []);
        setStudent(data.student || null);
      })
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [selectedId, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let rows = records;
    if (status) rows = rows.filter(r => r.status === status);
    if (presence) rows = rows.filter(r => r.presence === presence);
    return rows;
  }, [records, status, presence]);

  const summary = useMemo(() => {
    // Classify each record into exactly ONE bucket so the counts partition the
    // total and the attendance rate can never exceed 100%.
    const total = filtered.length;
    let present = 0, late = 0, absent = 0, pending = 0, approved = 0;
    filtered.forEach(r => {
      const presence = r.presence;
      const status = r.status;
      if (presence === 'absent' || status === 'absent' || status === 'rejected') {
        // Auto-generated absent slot, or the student was marked absent/rejected
        absent++;
      } else if (status === 'pending') {
        // Marked present but awaiting admin decision — still attended
        pending++;
        present++;
      } else if (presence === 'late') {
        late++;
      } else {
        // Approved (or physically present): presence present && status approved
        present++;
        if (status === 'approved') approved++;
      }
    });
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, pending, approved, rate };
  }, [filtered]);

  const exportRows = useMemo(() => filtered.map(r => [
    student?.name || '',
    student?.rollNo || '',
    r.scheduledDate,
    r.className || '',
    r.subject || '—',
    r.day || '',
    ORDINALS[r.periodIndex] || (r.periodIndex + 1) + 'th',
    presenceMeta[r.presence]?.label || 'Present',
    (r.status === 'absent' || r.presence === 'absent') ? '—' : (statusMeta[r.status]?.label || r.status),
    r.markedAt || '',
    r.approvedBy || '—',
  ]), [filtered, student]);

  const fileStem = `student_attendance_${(student?.name || 'student').replace(/[^a-zA-Z0-9_-]/g, '_')}_${fromDate}_${toDate}`;
  const footer = `Generated by NCBA & E Student Management System on ${new Date().toLocaleString()}`;

  const handleExport = (type) => {
    if (filtered.length === 0) { showToast('No data to export yet', 'info'); return; }
    try {
      if (type === 'csv') {
        exportCSV(`${fileStem}.csv`, SA_HEADERS, exportRows);
      } else if (type === 'excel') {
        exportExcel(`${fileStem}.xlsx`, SA_HEADERS, exportRows);
      } else {
        exportImage(`${fileStem}.png`, {
          title: `Student Attendance — ${student?.name || 'Student'}`,
          subtitle: `Roll No ${student?.rollNo || '—'} • Class ${student?.className || '—'} • ${fromDate} to ${toDate} • ${filtered.length} record(s)`,
          footer,
          headers: SA_HEADERS,
          rows: exportRows,
        });
      }
      showToast(`Attendance exported as ${type.toUpperCase()}.`);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  };
return (
    <div>
      <div className="page-header">
        <h1>Student Attendance</h1>
        <p>
          {student
            ? `${student.name} — Roll No ${student.rollNo || '—'} • Class ${student.className || 'Class not assigned'}`
            : 'Select a student to view their attendance history.'}
          {' '}View and export attendance for any student in the system.
        </p>
      </div>

      {/* Filters: student picker + date range + status */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Student</label>
            <input
              type="text"
              placeholder="Search by name, roll no, or class…"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Select Student ({filteredStudents.length})</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {filteredStudents.length === 0 && <option value="">No students found</option>}
              {filteredStudents.map(s => (
                <option key={s.id} value={s.id}>
                  {s.rollNo ? `${s.rollNo} — ` : ''}{s.name}{s.className ? ` (${s.className})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>From Date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To Date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Presence</label>
            <select value={presence} onChange={e => setPresence(e.target.value)}>
              {PRESENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>&nbsp;</label>
            <span style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>
              Showing {filtered.length} of {records.length} record(s).
            </span>
          </div>
        </div>
      </div>
{/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Records', value: summary.total, color: 'var(--primary)' },
          { label: 'Present', value: summary.present, color: 'var(--success)' },
          { label: 'Late', value: summary.late, color: 'var(--warning)' },
          { label: 'Absent', value: summary.absent, color: 'var(--danger)' },
          { label: 'Pending', value: summary.pending, color: 'var(--info)' },
          { label: 'Attendance', value: `${summary.rate}%`, color: 'var(--primary)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Export bar */}
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <h3><Icon name="document" size={18} /> Export Student Attendance</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => handleExport('excel')} style={{ padding: '8px 14px' }}>
              <Icon name="download" size={14} /> Excel
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('csv')} style={{ padding: '8px 14px' }}>
              <Icon name="download" size={14} /> CSV
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('image')} style={{ padding: '8px 14px' }}>
              <Icon name="download" size={14} /> Image
            </button>
          </div>
        </div>
      </div>

      {/* Records table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state" style={{ padding: '40px' }}>Loading attendance…</div>
          ) : !selectedId ? (
            <div className="empty-state" style={{ padding: '40px' }}>
              No students found. Add students first, then view their attendance here.
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>
              No attendance records found for {student?.name || 'this student'} between {fromDate} and {toDate}.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th className="hide-mobile">Date</th>
                  <th>Class</th>
                  <th className="hide-mobile">Subject</th>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Presence</th>
                  <th>Status</th>
                  <th className="hide-mobile">Marked At</th>
                  <th className="hide-mobile">Approved By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td><strong>{student?.name || '—'}</strong></td>
                    <td className="hide-mobile">{r.scheduledDate}</td>
                    <td><span className="badge primary">{r.className}</span></td>
                    <td className="hide-mobile">{r.subject || '—'}</td>
                    <td>{r.day}</td>
                    <td>{ORDINALS[r.periodIndex] || (r.periodIndex + 1) + 'th'}</td>
                    <td>
                      <span className={`badge badge-${presenceMeta[r.presence]?.cls || 'info'}`}>
                        {presenceMeta[r.presence]?.label || 'Present'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${statusMeta[r.status]?.cls || 'info'}`}>
                        {r.status === 'absent' || r.presence === 'absent' ? '—' : (statusMeta[r.status]?.label || r.status)}
                      </span>
                    </td>
                    <td className="hide-mobile" style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{r.markedAt}</td>
                    <td className="hide-mobile" style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{r.approvedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentAttendance;