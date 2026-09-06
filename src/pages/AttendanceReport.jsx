import { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import api from '../services/api';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import { exportCSV, exportExcel, exportImage } from '../utils/exportReport';

function toDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const REPORT_HEADERS = [
  'Roll No', 'Student Name', 'Class',
  'Approved Days', 'Late Days', 'Absent Days', 'Rejected Days', 'Pending Days',
  'Total Days', 'Attendance %',
  'Approved By', 'Rejected By',
];

const ROLE_LABELS = {
  super_admin: 'Admin',
  cr_admin: 'CR',
  teacher_admin: 'Teacher',
  student: 'Student',
};
const ROLE_BADGES = {
  super_admin: 'role-badge-admin',
  cr_admin: 'role-badge-cr',
  teacher_admin: 'role-badge-teacher',
};

// People who approved / rejected a student's records (table cell)
function renderActors(actors) {
  if (!actors || actors.length === 0) {
    return <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '120px' }}>
      {actors.map((a, i) => (
        <span key={i} style={{ fontSize: '0.76rem', lineHeight: '1.25' }}>
          {a.fullName || a.username}
          {a.role && ROLE_BADGES[a.role] ? (
            <span className={`badge ${ROLE_BADGES[a.role]}`} style={{ marginLeft: '5px', padding: '1px 6px', fontSize: '0.64rem' }}>
              {ROLE_LABELS[a.role] || a.role}
            </span>
          ) : null}
          {a.at ? <span style={{ color: 'var(--gray)' }}> • {a.at}</span> : null}
        </span>
      ))}
    </div>
  );
}

// People who approved / rejected a student's records (export text)
function actorsText(actors) {
  if (!actors || actors.length === 0) return '—';
  return actors.map(a => a.fullName || a.username).join('; ');
}

// Admin / CR / Teacher — attendance summary for a selected number of days
// (approved / rejected / pending per student) with Excel, CSV & image export.
function AttendanceReport() {
  const showToast = useToast();
  const { classes } = useData();

  const [className, setClassName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    if (classes.length > 0 && !className) setClassName(classes[0].name);
  }, [classes, className]);

  useEffect(() => {
    if (!fromDate || !toDate) {
      setFromDate(toDateISO(new Date(Date.now() - 30 * 86400000)));
      setToDate(toDateISO(new Date()));
    }
  }, [fromDate, toDate]);

  const loadReport = async (cls) => {
    const target = cls ?? className;
    if (!target) { showToast('Select a class first', 'error'); return; }
    if (!fromDate || !toDate) { showToast('Set the date range first', 'error'); return; }
    setLoading(true);
    try {
      const data = await api.getAttendanceReport({ className: target, from: fromDate, to: toDate });
      setRows(data.rows || []);
    } catch (err) {
      showToast(err.message, 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Live client-side search by student name or roll number
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.studentName || '').toLowerCase().includes(q) ||
      (String(r.rollNo ?? '')).toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Approve / reject a student's pending records inside the current date range
  const handleReportAction = async (studentId, studentName, action, pendingCount) => {
    if (!fromDate || !toDate) return;
    setActingId(studentId);
    try {
      const data = await api.reportAttendanceAction(studentId, fromDate, toDate, action);
      showToast(
        `${action === 'reject' ? 'Rejected' : 'Approved'} ${data.updated ?? pendingCount} pending record(s) for ${studentName}.`
      );
      loadReport(className);
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setActingId(null);
      setConfirmAction(null);
    }
  };

  // Auto-run whenever the class or date range changes
  useEffect(() => {
    if (className && fromDate && toDate) loadReport(className);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [className, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalRecords = rows.reduce((a, r) => a + Number(r.totalDays || 0), 0);
    const approved = rows.reduce((a, r) => a + Number(r.approvedDays || 0) + Number(r.lateDays || 0), 0);
    const absent = rows.reduce((a, r) => a + Number(r.absentDays || 0), 0);
    const rejected = rows.reduce((a, r) => a + Number(r.rejectedDays || 0), 0);
    const pending = rows.reduce((a, r) => a + Number(r.pendingDays || 0), 0);
    const rates = rows.map(r => (Number(r.totalDays) > 0 ? (Number(r.approvedDays) + Number(r.lateDays)) / Number(r.totalDays) * 100 : 0));
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    return { students: rows.length, totalRecords, approved, absent, rejected, pending, avgRate };
  }, [rows]);

  const exportRows = useMemo(() =>
    filteredRows.map(r => [
      r.rollNo || '—',
      r.studentName,
      r.className,
      Number(r.approvedDays || 0),
      Number(r.lateDays || 0),
      Number(r.absentDays || 0),
      Number(r.rejectedDays || 0),
      Number(r.pendingDays || 0),
      Number(r.totalDays || 0),
      Number(r.totalDays) > 0 ? `${Math.round((Number(r.approvedDays) + Number(r.lateDays)) / Number(r.totalDays) * 100)}%` : '0%',
      actorsText(r.approvers),
      actorsText(r.rejecters),
    ]), [filteredRows]);

  const fileStem = `attendance_report_${(className || 'all').replace(/[^a-zA-Z0-9_-]/g, '_')}_${fromDate}_${toDate}`;
  const title = `Attendance Report  —  ${className || 'All Classes'}`;
  const subtitle = `Date range: ${fromDate} to ${toDate}  •  ${filteredRows.length} student(s)`;
  const footer = `Generated by NCBA & E Student Management System on ${new Date().toLocaleString()}`;

  const handleExport = (type) => {
    if (rows.length === 0) { showToast('No data to export yet', 'info'); return; }
    try {
      if (type === 'csv') {
        exportCSV(`${fileStem}.csv`, REPORT_HEADERS, exportRows);
      } else if (type === 'excel') {
        exportExcel(`${fileStem}.xlsx`, REPORT_HEADERS, exportRows);
      } else {
        exportImage(`${fileStem}.png`, {
          title,
          subtitle,
          footer,
          headers: REPORT_HEADERS,
          rows: exportRows,
        });
      }
      showToast(`Report exported as ${type.toUpperCase()}.`);
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  };
return (
    <div>
      <div className="page-header">
        <h1>Attendance Report</h1>
        <p>View approved / rejected / pending attendance per student for a selected number of days, then export as Excel, CSV or image.</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Search Student</label>
            <input
              type="search"
              placeholder="Live search by name or roll no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={{ fontSize: '0.76rem', color: 'var(--gray)', marginTop: '4px' }}>
              {search ? `Showing ${filteredRows.length} of ${rows.length} student(s)` : `${rows.length} student(s) in report`}
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Class</label>
            <select value={className} onChange={e => setClassName(e.target.value)}>
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={() => loadReport()} disabled={loading} style={{ justifyContent: 'center', flex: 1 }}>
              <Icon name="search" size={15} /> {loading ? 'Loading…' : 'View Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Students', value: summary.students, color: 'var(--primary)' },
          { label: 'Total Records', value: summary.totalRecords, color: 'var(--primary)' },
          { label: 'Approved', value: summary.approved, color: 'var(--success)' },
          { label: 'Absent', value: summary.absent, color: 'var(--danger)' },
          { label: 'Rejected', value: summary.rejected, color: 'var(--warning)' },
          { label: 'Pending', value: summary.pending, color: 'var(--info)' },
          { label: 'Avg Attendance', value: `${summary.avgRate}%`, color: 'var(--primary)' },
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
          <h3><Icon name="document" size={18} /> Export Report</h3>
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

      {/* Report table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state" style={{ padding: '40px' }}>Loading report…</div>
          ) : filteredRows.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>
              {rows.length === 0
                ? `No attendance records found for ${className} between ${fromDate} and ${toDate}.`
                : `No students match your search "${search}".`}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Student Name</th>
                  <th>Class</th>
                  <th style={{ color: 'var(--success)' }}>Approved</th>
                  <th style={{ color: 'var(--warning)' }}>Late</th>
                  <th style={{ color: 'var(--danger)' }}>Absent</th>
                  <th style={{ color: 'var(--gray)' }}>Rejected</th>
                  <th style={{ color: 'var(--info)' }}>Pending</th>
                  <th>Total Days</th>
                  <th>Attendance %</th>
                  <th>Approved By</th>
                  <th>Rejected By</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => {
                  const pct = Number(r.totalDays) > 0
                    ? Math.round((Number(r.approvedDays) + Number(r.lateDays)) / Number(r.totalDays) * 100)
                    : 0;
                  return (
                    <tr key={r.studentId}>
                      <td>{r.rollNo || '—'}</td>
                      <td><strong>{r.studentName}</strong></td>
                      <td><span className="badge primary">{r.className}</span></td>
                      <td>{Number(r.approvedDays || 0)}</td>
                      <td>{Number(r.lateDays || 0)}</td>
                      <td>{Number(r.absentDays || 0)}</td>
                      <td>{Number(r.rejectedDays || 0)}</td>
                      <td>{Number(r.pendingDays || 0)}</td>
                      <td>{Number(r.totalDays || 0)}</td>
                      <td>
                        <span className={`badge ${pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger'}`}>{pct}%</span>
                      </td>
                      <td>{renderActors(r.approvers)}</td>
                      <td>{renderActors(r.rejecters)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {Number(r.pendingDays || 0) > 0 ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              className="btn-icon edit"
                              title={`Approve ${r.pendingDays} pending record(s)`}
                              disabled={actingId === r.studentId}
                              onClick={() => setConfirmAction({ studentId: r.studentId, studentName: r.studentName, pending: Number(r.pendingDays || 0), action: 'approve' })}
                            >
                              <Icon name="check" size={15} />
                            </button>
                            <button
                              className="btn-icon delete"
                              title={`Reject ${r.pendingDays} pending record(s)`}
                              disabled={actingId === r.studentId}
                              onClick={() => setConfirmAction({ studentId: r.studentId, studentName: r.studentName, pending: Number(r.pendingDays || 0), action: 'reject' })}
                            >
                              <Icon name="x" size={15} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Approve / reject a student's pending records from the report */}
      {confirmAction && (
        <ConfirmDialog
          message={`${confirmAction.action === 'reject' ? 'Reject' : 'Approve'} ${confirmAction.pending} pending attendance record(s) for ${confirmAction.studentName} between ${fromDate} and ${toDate}?`}
          onConfirm={() => handleReportAction(confirmAction.studentId, confirmAction.studentName, confirmAction.action, confirmAction.pending)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

export default AttendanceReport;