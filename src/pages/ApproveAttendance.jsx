import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

function toDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = toDateISO(new Date());

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

// Approval status filter — only approval-related statuses are selectable
const STATUS_FILTER_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

// Detail modal for a single attendance record
function RecordDetailModal({ record, onClose }) {
  if (!record) return null;
  const sm = statusMeta[record.status] || {};
  const pm = presenceMeta[record.presence] || {};
  return (
    <Modal title="Attendance Record Details" onClose={onClose}>
      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span className={`badge badge-${sm.cls || 'secondary'}`} style={{ fontSize: '0.8rem' }}>
            <Icon name={sm.icon || 'check'} size={12} /> {record.status === 'absent' || record.presence === 'absent' ? '—' : (sm.label || record.status)}
          </span>
          {record.presence && (
            <span className={`badge badge-${pm.cls || 'info'}`} style={{ fontSize: '0.8rem' }}>
              <Icon name={pm.icon || 'clock'} size={12} /> {pm.label || record.presence}
            </span>
          )}
          {record.approvedBy && (
            <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
              by {record.approvedBy}
            </span>
          )}
        </div>
        {[
          ['Student', record.studentName],
          ['Class', record.className],
          ['Subject', record.subject || '---'],
          ['Day', record.day],
          ['Period', `${ORDINALS[record.periodIndex] || (record.periodIndex + 1) + 'th'}`],
          ['Date', record.scheduledDate],
          ['Presence', pm.label || record.presence],
          ['Marked At', record.markedAt],
          ['Distance', record.distanceFromCenter != null ? `${record.distanceFromCenter} m` : '---'],
          ['Latitude', record.latitude?.toFixed?.(6) || record.latitude],
          ['Longitude', record.longitude?.toFixed?.(6) || record.longitude],
          ['Approved At', record.approvedAt ? new Date(record.approvedAt).toLocaleString() : '---'],
          ['Created At', record.createdAt ? new Date(record.createdAt).toLocaleString() : '---'],
          ['Notes', record.notes || '---'],
        ].filter(([, v]) => v !== undefined).map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px', fontSize: '0.88rem' }}>
            <span style={{ color: 'var(--gray)', fontWeight: '500' }}>{label}</span>
            <span style={{ fontWeight: '600' }}>{value}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// Admin/CR/Teacher: Review & Approve
function ApproveAttendance() {
  const showToast = useToast();
  const { classes } = useData();
  const { currentUser } = useAuth();
  // CR and Teacher may only work with the default Pending queue — the Status
  // filter (Pending / Approved / Rejected) is reserved for the Super Admin.
  const canFilterStatus = currentUser?.role === 'super_admin';
  const [records, setRecords] = useState([]);
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterPresence, setFilterPresence] = useState('');
  const [filterDate, setFilterDate] = useState(TODAY);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [viewDetails, setViewDetails] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // single record to delete
  const [bulkDelete, setBulkDelete] = useState(false);    // confirm bulk delete

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterClass) params.className = filterClass;
      if (filterStatus) params.status = filterStatus;
      if (filterPresence) params.presence = filterPresence;
      if (filterDate) params.date = filterDate;
      if (debouncedSearch) params.search = debouncedSearch;
      const data = await api.getAttendanceRecords(params);
      setRecords(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filterClass, filterStatus, filterPresence, filterDate, debouncedSearch]);

  // Live-search debounce: reload from the server shortly after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(prev => {
      if (prev.size === records.length) return new Set();
      return new Set(records.map(r => r.id));
    });
  };

  const handleAction = async (id, action) => {
    try {
      await api.approveAttendance(id, action);
      showToast(action === 'reject' ? 'Attendance rejected' : 'Attendance approved');
      loadRecords();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handlePresence = async (id, presence) => {
    try {
      await api.updateAttendancePresence(id, presence);
      showToast('Presence updated');
      loadRecords();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleBulkAction = async (action) => {
    if (selected.size === 0) return;
    try {
      await api.bulkAttendanceAction([...selected], action);
      showToast(`Updated ${selected.size} record(s)`);
      setSelected(new Set());
      loadRecords();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteAttendanceRecord(id);
      showToast('Attendance record deleted');
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteTarget(null);
      loadRecords();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    let failed = 0;
    for (const id of ids) {
      try {
        await api.deleteAttendanceRecord(id);
      } catch {
        failed++;
      }
    }
    setSelected(new Set());
    setBulkDelete(false);
    showToast(failed === 0 ? `Deleted ${ids.length} record(s)` : `Deleted ${ids.length - failed} record(s), ${failed} failed`);
    loadRecords();
  };

  const summary = useMemo(() => ({
    present: records.filter(r => r.presence === 'present').length,
    late: records.filter(r => r.presence === 'late').length,
    absent: records.filter(r => r.presence === 'absent').length,
    pending: records.filter(r => r.status === 'pending').length,
  }), [records]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1>Attendance Review</h1>
        <p>Review, approve, or reject student attendance records.</p>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Present', value: summary.present, icon: 'check', color: 'green', filterKey: 'filterPresence', filterVal: 'present' },
          { label: 'Late', value: summary.late, icon: 'clock', color: 'orange', filterKey: 'filterPresence', filterVal: 'late' },
          { label: 'Absent', value: summary.absent, icon: 'x', color: 'red', filterKey: 'filterPresence', filterVal: 'absent' },
          { label: 'Pending Approval', value: summary.pending, icon: 'clock', color: 'blue', filterKey: 'filterStatus', filterVal: 'pending' },
        ].map(s => {
          const active = s.filterKey === 'filterPresence' ? filterPresence === s.filterVal : filterStatus === s.filterVal;
          const statusLocked = s.filterKey === 'filterStatus' && !canFilterStatus;
          return (
            <div
              key={s.label}
              className="stat-card"
              style={{
                cursor: statusLocked ? 'default' : 'pointer',
                opacity: active || statusLocked ? 1 : 0.85,
                borderColor: active ? `var(--${s.color === 'green' ? 'success' : s.color === 'orange' ? 'warning' : s.color === 'blue' ? 'info' : 'danger'})` : undefined,
              }}
              onClick={() => {
                if (s.filterKey === 'filterPresence') {
                  setFilterPresence(prev => prev === s.filterVal ? '' : s.filterVal);
                  if (canFilterStatus) setFilterStatus('');
                } else if (canFilterStatus) {
                  // Status filtering is reserved for the Super Admin; CR/Teacher
                  // stay locked on the Pending queue.
                  setFilterStatus(prev => prev === s.filterVal ? '' : s.filterVal);
                  setFilterPresence('');
                }
              }}
            >
              <div className={`stat-icon ${s.color}`}>
                <Icon name={s.icon} size={22} />
              </div>
              <div className="stat-info">
                <h3>{s.value}</h3>
                <p>{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main panel */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Attendance Records</h2>
            <p>{records.length} record(s)</p>
          </div>
        </div>

        {/* Toolbar with filters */}
        <div className="toolbar">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="search"
              className="filter-select"
              style={{ flex: 1, minWidth: '220px' }}
              placeholder="Live search — student, class, subject…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="filter-select" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
              <option value="">All Classes</option>
              {classes.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
            </select>
            <select className="filter-select" value={filterPresence} onChange={(e) => setFilterPresence(e.target.value)}>
              <option value="">All Presence</option>
              {Object.entries(presenceMeta).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
            </select>
            <select
              className="filter-select"
              value={canFilterStatus ? filterStatus : 'pending'}
              onChange={(e) => { if (canFilterStatus) setFilterStatus(e.target.value); }}
              disabled={!canFilterStatus}
              title={canFilterStatus ? 'Filter by approval status' : 'Status filtering is only available to the Super Admin'}
            >
              <option value="">All Statuses</option>
              {STATUS_FILTER_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
            <input
              type="date"
              className="filter-select"
              value={filterDate}
              min={TODAY}
              onChange={(e) => {
                const val = e.target.value;
                if (val && val < TODAY) {
                  setFilterDate(TODAY);
                  showToast('Only today\'s attendance can be approved', 'info');
                } else {
                  setFilterDate(val);
                }
              }}
            />
            {(filterClass || filterStatus !== 'pending' || filterPresence || filterDate !== TODAY || search) && (
              <button className="btn-add" onClick={() => { setFilterClass(''); setFilterStatus('pending'); setFilterPresence(''); setFilterDate(TODAY); setSearch(''); }}>
                <span className="add-icon"><Icon name="x" size={16} /></span>
                Clear Filters
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{selected.size} selected</span>
              <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '6px 12px' }} onClick={() => handleBulkAction('approve')}>
                <Icon name="check" size={14} /> Approve All
              </button>
              <button className="btn btn-danger" style={{ fontSize: '0.78rem', padding: '6px 12px' }} onClick={() => handleBulkAction('reject')}>
                <Icon name="x" size={14} /> Reject All
              </button>
              <button className="btn btn-danger" style={{ fontSize: '0.78rem', padding: '6px 12px' }} onClick={() => setBulkDelete(true)}>
                <Icon name="delete" size={14} /> Delete All
              </button>
            </div>
          )}
        </div>

        <div className="panel-body" style={{ padding: '0' }}>
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <Icon name="attendance" size={48} />
              <h3>No records found</h3>
              <p>No students have marked attendance for today yet. Only today's marked attendance can be approved.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input type="checkbox" checked={selected.size === records.length && records.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <th>Student</th>
                    <th>Class</th>
                    <th className="hide-mobile">Subject</th>
                    <th>Day . Period</th>
                    <th className="hide-mobile">Date</th>
                    <th>Presence</th>
                    <th>Status</th>
                    <th className="hide-mobile">Marked At</th>
                    <th className="hide-mobile">Distance</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} style={{ opacity: selected.size > 0 && !selected.has(r.id) ? 0.5 : 1 }}>
                      <td>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                      </td>
                      <td><strong>{r.studentName}</strong></td>
                      <td><span className="badge primary">{r.className}</span></td>
                      <td className="hide-mobile">{r.subject || '---'}</td>
                      <td>{r.day} . {ORDINALS[r.periodIndex] || (r.periodIndex + 1) + 'th'}</td>
                      <td className="hide-mobile">{r.scheduledDate}</td>
                      <td>
                        <select
                          className="filter-select"
                          style={{ padding: '3px 6px', fontSize: '0.78rem', minWidth: '96px' }}
                          value={r.presence || 'present'}
                          onChange={(e) => handlePresence(r.id, e.target.value)}
                          title="Change presence"
                        >
                          {Object.entries(presenceMeta).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${statusMeta[r.status]?.cls || 'info'}`}>
                          {r.status === 'absent' || r.presence === 'absent' ? '—' : (statusMeta[r.status]?.label || r.status)}
                        </span>
                      </td>
                      <td className="hide-mobile">{r.markedAt || '---'}</td>
                      <td className="hide-mobile">{r.distanceFromCenter != null ? `${r.distanceFromCenter} m` : '---'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon view" title="View Details" onClick={() => setViewDetails(r)}>
                            <Icon name="view" size={15} />
                          </button>
                          <button className="btn-icon edit" title="Approve" onClick={() => handleAction(r.id, 'approve')}>
                            <Icon name="check" size={15} />
                          </button>
                          <button className="btn-icon delete" title="Reject" onClick={() => handleAction(r.id, 'reject')}>
                            <Icon name="x" size={15} />
                          </button>
                          <button className="btn-icon delete" title="Delete Record" onClick={() => setDeleteTarget(r)}>
                            <Icon name="delete" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* View details modal */}
      {viewDetails && <RecordDetailModal record={viewDetails} onClose={() => setViewDetails(null)} />}

      {/* Confirm single delete */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete the ${deleteTarget.presence === 'absent' ? 'absent' : 'attendance'} record for ${deleteTarget.studentName} on ${deleteTarget.scheduledDate} (${deleteTarget.day} • ${ORDINALS[deleteTarget.periodIndex] || (deleteTarget.periodIndex + 1) + 'th'} period)? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Confirm bulk delete */}
      {bulkDelete && (
        <ConfirmDialog
          message={`Delete ${selected.size} selected attendance record(s)? This cannot be undone.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDelete(false)}
        />
      )}
    </div>
  );
}

export default ApproveAttendance;
