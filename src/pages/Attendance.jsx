import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import api from '../services/api';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { MapContainer, TileLayer, Circle, Marker } from 'react-leaflet';
import { getGeolocation, isSecureContext } from '../utils/geo';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

const statusMeta = {
  present: { label: 'Present', cls: 'present', icon: 'check' },
  late: { label: 'Late', cls: 'late', icon: 'clock' },
  pending: { label: 'Pending', cls: 'pending', icon: 'clock' },
  approved: { label: 'Approved', cls: 'approved', icon: 'check' },
  rejected: { label: 'Rejected', cls: 'rejected', icon: 'x' },
  absent: { label: 'Absent', cls: 'absent', icon: 'x' },
};

function getTodayDateISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getTodayDayName() {
  return DAY_NAMES[new Date().getDay()];
}

// ── Student: Mark Attendance ──
function StudentMark({ student }) {
  const showToast = useToast();
  const { subjects } = useData();
  const [classSchedule, setClassSchedule] = useState(null);
  const [geofences, setGeofences] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState(null);
  const [myRecords, setMyRecords] = useState([]);

  const today = getTodayDateISO();
  const todayName = getTodayDayName();
  const todayPeriods = classSchedule?.structure?.days?.find(d => d.name === todayName)?.periods || [];

  const loadMyRecords = async () => {
    try {
      const recs = await api.getStudentAttendance(student.id);
      setMyRecords(recs);
    } catch {}
  };

  useEffect(() => {
    if (student?.className) setSelectedClass(student.className);
  }, [student]);

  useEffect(() => {
    if (!selectedClass) { setClassSchedule(null); return; }
    api.getClassSchedule(selectedClass).then(setClassSchedule).catch(() => setClassSchedule(null));
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClass) return;
    api.getGeofencesForClass(selectedClass).then(setGeofences).catch(() => setGeofences([]));
  }, [selectedClass]);

  useEffect(() => { loadMyRecords(); }, []);

  const alreadyMarked = (pi) => myRecords.some(r =>
    r.className === selectedClass && r.day === todayName && r.periodIndex === pi && r.scheduledDate === today);

  const getLocation = async () => {
    setLocating(true);
    setCoords(null);
    setResult(null);
    if (!isSecureContext()) {
      showToast('GPS is blocked here: this page must be opened over HTTPS (or localhost). You can tap the map at your spot to set your location instead.', 'error');
      setLocating(false);
      return;
    }
    try {
      const pos = await getGeolocation();
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLocating(false);
    }
  };

  const handleMark = async () => {
    if (selectedPeriod == null) return showToast('Select a period first', 'error');
    if (!coords) return showToast('Get your location first', 'error');
    setMarking(true);
    try {
      const data = await api.markAttendance({
        className: selectedClass,
        subject: selectedSubject || null,
        day: todayName,
        periodIndex: selectedPeriod,
        scheduledDate: today,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      setResult(data);
      setSelectedPeriod(null);
      setSelectedSubject('');
      setCoords(null);
      loadMyRecords();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMarking(false);
    }
  };

  const nearestGeofence = useMemo(() => {
    if (!coords || geofences.length === 0) return null;
    let best = null, bestDist = Infinity;
    for (const g of geofences) {
      const dLat = (coords.lat - g.latitude) * 111320;
      const dLng = (coords.lng - g.longitude) * 111320 * Math.cos((g.latitude * Math.PI) / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < bestDist) { bestDist = dist; best = { ...g, distance: Math.round(dist) }; }
    }
    return best;
  }, [coords, geofences]);

  const isInsideGeofence = nearestGeofence && nearestGeofence.distance <= nearestGeofence.radius;

  // Map centers on the user's fix when available, otherwise on the first geofence
  // so students can still see (and tap) the attendance area even when GPS is unavailable.
  const mapCenter = useMemo(() => (
    coords ? [coords.lat, coords.lng]
      : geofences.length ? [geofences[0].latitude, geofences[0].longitude]
        : [31.5497, 74.3436] // Lahore fallback
  ), [coords, geofences]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="attendance" size={22} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Mark Attendance</h2>
          <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.85rem' }}>
            {todayName}, {today} — Select your period and mark your presence.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total', value: myRecords.length, color: 'var(--primary)' },
          { label: 'Present', value: myRecords.filter(r => r.status === 'present' || r.status === 'approved').length, color: 'var(--success)' },
          { label: 'Late', value: myRecords.filter(r => r.status === 'late').length, color: 'var(--warning)' },
          { label: 'Rejected', value: myRecords.filter(r => r.status === 'rejected').length, color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Class</label>
            <input type="text" value={selectedClass} readOnly style={{ background: 'var(--gray-bg)' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Today</label>
            <input type="text" value={`${todayName}, ${today}`} readOnly style={{ background: 'var(--gray-bg)' }} />
          </div>
        </div>

        {todayPeriods.length > 0 ? (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.85rem' }}>Select Period</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {todayPeriods.map((p, i) => {
                const marked = alreadyMarked(i);
                return (
                  <button
                    key={i}
                    className={`btn ${selectedPeriod === i ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => !marked && setSelectedPeriod(i)}
                    disabled={marked}
                    style={{ opacity: marked ? 0.5 : 1, minWidth: '150px', justifyContent: 'center' }}
                  >
                    <Icon name={marked ? 'check' : 'clock'} size={14} />
                    <span><strong>{ORDINALS[i]}</strong> — {p}</span>
                    {marked && <span className="badge badge-present" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Marked</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '30px', textAlign: 'center' }}>
            <Icon name="calendar" size={32} style={{ color: 'var(--gray)', marginBottom: '8px' }} />
            <p style={{ margin: '4px 0', fontWeight: '600' }}>No classes scheduled for {todayName}</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--gray)' }}>Your next class day will show available periods here.</p>
          </div>
        )}

        {selectedPeriod != null && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Period</label>
                <input type="text" value={`${ORDINALS[selectedPeriod]} — ${todayPeriods[selectedPeriod]}`} readOnly style={{ background: 'var(--gray-bg)' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Subject (optional)</label>
                <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                  <option value="">Select subject...</option>
                  {subjects.filter(s => !selectedClass || s.className === selectedClass).map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button className="btn btn-primary" onClick={getLocation} disabled={locating}>
                <Icon name="location" size={16} /> {locating ? 'Getting location...' : 'Get My Location'}
              </button>
              {coords && (
                <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                  📍 {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </span>
              )}
            </div>

            {coords && nearestGeofence && (
              <div className="card" style={{
                padding: '12px 16px', marginBottom: '14px',
                borderLeft: `4px solid ${isInsideGeofence ? 'var(--success)' : 'var(--danger)'}`,
                background: isInsideGeofence ? 'var(--success-bg)' : 'var(--danger-bg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name={isInsideGeofence ? 'check' : 'x'} size={18} style={{ color: isInsideGeofence ? 'var(--success)' : 'var(--danger)' }} />
                  <div>
                    <strong style={{ color: isInsideGeofence ? 'var(--success)' : 'var(--danger)' }}>
                      {isInsideGeofence ? 'Inside geofence' : 'Outside geofence'}
                    </strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                      {nearestGeofence.name} — {nearestGeofence.distance}m away (radius: {nearestGeofence.radius}m)
                    </div>
                  </div>
                </div>
              </div>
            )}

            {coords && !nearestGeofence && (
              <div className="card" style={{ padding: '12px 16px', marginBottom: '14px', borderLeft: '4px solid var(--warning)', background: 'var(--warning-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="location" size={18} style={{ color: 'var(--warning)' }} />
                  <div>
                    <strong>No geofence defined for your class</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>You can still mark attendance — location is recorded for reference.</div>
                  </div>
                </div>
              </div>
            )}

            {geofences.length > 0 && (
              <div style={{ height: '260px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '14px' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={false}
                  eventHandlers={{ click: (e) => { setCoords({ lat: e.latlng.lat, lng: e.latlng.lng }); setResult(null); } }}
                >
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {coords && <Marker position={[coords.lat, coords.lng]} />}
                  {geofences.map(g => (
                    <Circle key={g.id} center={[g.latitude, g.longitude]} radius={g.radius}
                      pathOptions={{
                        color: isInsideGeofence && nearestGeofence?.id === g.id ? '#059669' : '#6b7280',
                        fillColor: isInsideGeofence && nearestGeofence?.id === g.id ? '#059669' : '#6b7280',
                        fillOpacity: 0.12,
                      }}
                    />
                  ))}
                </MapContainer>
                {!coords && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--danger)', padding: '8px 14px', background: 'var(--danger-bg)', borderTop: '1px solid var(--border)' }}>
                    GPS unavailable — press <strong>Get My Location</strong> or <strong>tap the map</strong> at your current spot.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" onClick={handleMark} disabled={marking} style={{ minWidth: '140px', justifyContent: 'center' }}>
                <Icon name="check" size={16} /> {marking ? 'Submitting...' : 'Mark Attendance'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setSelectedPeriod(null); setCoords(null); setResult(null); setSelectedSubject(''); }}>
                Cancel
              </button>
            </div>
            {result && (
              <div className={`alert ${result.status === 'late' ? 'alert-warning' : result.status === 'rejected' ? 'alert-danger' : 'alert-success'}`} style={{ marginTop: '12px' }}>
                Attendance marked as <strong>{statusMeta[result.status]?.label || result.status}</strong> at {result.markedAt}.
              </div>
            )}
          </div>
        )}
      </div>

      {myRecords.length > 0 && (
        <div className="panel" style={{ marginTop: '20px' }}>
          <div className="panel-header">
            <h3><Icon name="document" size={18} /> Your Attendance History</h3>
            <span className="manage-count">{myRecords.length} record(s)</span>
          </div>
          <div className="panel-body" style={{ padding: '0' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th className="hide-mobile">Subject</th>
                    <th>Day</th>
                    <th>Period</th>
                    <th className="hide-mobile">Date</th>
                    <th>Status</th>
                    <th className="hide-mobile">Marked At</th>
                  </tr>
                </thead>
                <tbody>
                  {myRecords.slice(0, 20).map(r => (
                    <tr key={r.id}>
                      <td><span className="badge primary">{r.className}</span></td>
                      <td className="hide-mobile">{r.subject || '—'}</td>
                      <td>{r.day}</td>
                      <td>{ORDINALS[r.periodIndex] || (r.periodIndex + 1) + 'th'}</td>
                      <td className="hide-mobile">{r.scheduledDate}</td>
                      <td>
                        <span className={`badge badge-${statusMeta[r.status]?.cls || 'secondary'}`}>
                          {r.status === 'absent' || r.presence === 'absent' ? '—' : (statusMeta[r.status]?.label || r.status)}
                        </span>
                      </td>
                      <td className="hide-mobile" style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{r.markedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail modal for a single attendance record ──
function RecordDetailModal({ record, onClose }) {
  if (!record) return null;
  const sm = statusMeta[record.status] || {};
  return (
    <Modal title="Attendance Record Details" onClose={onClose}>
      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span className={`badge badge-${sm.cls || 'secondary'}`} style={{ fontSize: '0.8rem' }}>
            <Icon name={sm.icon || 'check'} size={12} /> {sm.label || record.status}
          </span>
          {record.approvedBy && (
            <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
              by {record.approvedBy}
            </span>
          )}
        </div>
        {[
          ['Student', record.studentName],
          ['Class', record.className],
          ['Subject', record.subject || '—'],
          ['Day', record.day],
          ['Period', `${ORDINALS[record.periodIndex] || (record.periodIndex + 1) + 'th'}`],
          ['Date', record.scheduledDate],
          ['Marked At', record.markedAt],
          ['Distance', record.distanceFromCenter != null ? `${record.distanceFromCenter} m` : '—'],
          ['Latitude', record.latitude?.toFixed?.(6) || record.latitude],
          ['Longitude', record.longitude?.toFixed?.(6) || record.longitude],
          ['Approved At', record.approvedAt ? new Date(record.approvedAt).toLocaleString() : '—'],
          ['Created At', record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'],
          ['Notes', record.notes || '—'],
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

// ── Admin/CR/Teacher: Review & Approve ──
function AdminReview({ canApprove }) {
  const showToast = useToast();
  const { classes } = useData();
  const [records, setRecords] = useState([]);
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [viewDetails, setViewDetails] = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterClass) params.className = filterClass;
      if (filterStatus) params.status = filterStatus;
      if (filterDate) params.date = filterDate;
      const data = await api.getAttendanceRecords(params);
      setRecords(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filterClass, filterStatus, filterDate]);

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

  const handleBulkAction = async (action) => {
    if (selected.size === 0) return;
    try {
      await api.bulkAttendanceAction([...selected], action);
      showToast(`Updated ${selected.size} record(s)`);
      setSelected(new Set());
      loadRecords();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const summary = useMemo(() => ({
    present: records.filter(r => r.status === 'present' || r.status === 'approved').length,
    late: records.filter(r => r.status === 'late').length,
    pending: records.filter(r => r.status === 'pending').length,
    rejected: records.filter(r => r.status === 'rejected').length,
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
          { label: 'Present', value: summary.present, icon: 'check', color: 'green', key: 'present' },
          { label: 'Late', value: summary.late, icon: 'clock', color: 'orange', key: 'late' },
          { label: 'Pending', value: summary.pending, icon: 'clock', color: 'blue', key: 'pending' },
          { label: 'Rejected', value: summary.rejected, icon: 'x', color: 'red', key: 'rejected' },
        ].map(s => (
          <div
            key={s.label}
            className="stat-card"
            style={{
              cursor: filterStatus === s.key ? 'default' : 'pointer',
              opacity: filterStatus && filterStatus !== s.key ? 0.4 : 1,
              borderColor: filterStatus === s.key ? `var(--${s.color === 'green' ? 'success' : s.color === 'orange' ? 'warning' : s.color === 'blue' ? 'info' : 'danger'})` : undefined,
            }}
            onClick={() => setFilterStatus(prev => prev === s.key ? '' : s.key)}
          >
            <div className={`stat-icon ${s.color}`}>
              <Icon name={s.icon} size={22} />
            </div>
            <div className="stat-info">
              <h3>{s.value}</h3>
              <p>{s.label}</p>
            </div>
          </div>
        ))}
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
            <select className="filter-select" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
              <option value="">All Classes</option>
              {classes.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
            </select>
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.entries(statusMeta).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
            </select>
            <input type="date" className="filter-select" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            {(filterClass || filterStatus || filterDate) && (
              <button className="btn-add" onClick={() => { setFilterClass(''); setFilterStatus(''); setFilterDate(''); }}>
                <span className="add-icon"><Icon name="x" size={16} /></span>
                <span className="add-text">Clear Filters</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {canApprove && selected.size > 0 && (
              <>
                <button className="btn-add" onClick={() => handleBulkAction('approve')}>
                  <span className="add-icon"><Icon name="check" size={16} /></span>
                  <span className="add-text">Approve ({selected.size})</span>
                </button>
                <button className="btn-add" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => handleBulkAction('reject')}>
                  <span className="add-icon"><Icon name="x" size={16} /></span>
                  <span className="add-text">Reject ({selected.size})</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="panel-body" style={{ padding: '0' }}>
          {/* Records table */}
          {loading ? (
            <div className="loading">Loading records…</div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <div className="icon">
                <Icon name="attendance" size={48} />
              </div>
              <h3>No attendance records found</h3>
              <p>{filterClass ? `No records for ${filterClass}` : 'No records match your filters.'} Try adjusting your filters.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {canApprove && (
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input type="checkbox" checked={records.length > 0 && selected.size === records.length} onChange={toggleSelectAll} />
                      </th>
                    )}
                    <th>Student</th>
                    <th>Class</th>
                    <th className="hide-mobile">Subject</th>
                    <th>Day / Period</th>
                    <th className="hide-mobile">Date</th>
                    <th>Status</th>
                    <th className="hide-mobile">Marked At</th>
                    <th className="hide-mobile">Distance</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      {canApprove && (
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                        </td>
                      )}
                      <td>
                        <div className="student-cell">
                          <div>
                            <div className="name">{r.studentName}</div>
                            <div className="sub">{r.scheduledDate}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="badge primary">{r.className}</span></td>
                      <td className="hide-mobile">{r.subject || '—'}</td>
                      <td>{r.day} · {ORDINALS[r.periodIndex] || (r.periodIndex + 1) + 'th'}</td>
                      <td className="hide-mobile">{r.scheduledDate}</td>
                      <td>
                        <span className={`badge ${statusMeta[r.status]?.cls || 'info'}`}>
                          {r.status === 'absent' || r.presence === 'absent' ? '—' : (statusMeta[r.status]?.label || r.status)}
                        </span>
                      </td>
                      <td className="hide-mobile">{r.markedAt}</td>
                      <td className="hide-mobile">{r.distanceFromCenter != null ? `${r.distanceFromCenter} m` : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon view" title="View Details" onClick={() => setViewDetails(r)}>
                            <Icon name="view" size={15} />
                          </button>
                          {canApprove && (
                            <>
                              <button className="btn-icon edit" title="Approve" onClick={() => handleAction(r.id, 'approve')}>
                                <Icon name="check" size={15} />
                              </button>
                              <button className="btn-icon delete" title="Reject" onClick={() => handleAction(r.id, 'reject')}>
                                <Icon name="x" size={15} />
                              </button>
                            </>
                          )}
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
    </div>
  );
}

// ── Main Attendance component — role-based routing ──
function Attendance() {
  const { currentUser, hasPermission } = useAuth();
  const isStudent = currentUser?.role === 'student';
  const { students } = useData();

  const student = useMemo(() => {
    if (!isStudent) return null;
    // 1. Try explicit linkedStudentId
    if (currentUser?.linkedStudentId) {
      const found = students.find(s => s.id === currentUser.linkedStudentId);
      if (found) return found;
    }
    // 2. Try reverse link via linkedUserId
    const byReverse = students.find(s => s.linkedUserId === currentUser?.id);
    if (byReverse) return byReverse;
    // 3. Fallback: match by className
    if (currentUser?.className) {
      const byClass = students.find(s => s.className === currentUser.className);
      if (byClass) return byClass;
    }
    // 4. Last resort: synthetic student object from user data
    return {
      id: currentUser.id,
      name: currentUser.fullName || currentUser.username,
      className: currentUser.className || '',
      email: currentUser.email,
      linkedUserId: currentUser.id,
    };
  }, [isStudent, currentUser, students]);

  if (isStudent) {
    return <StudentMark student={student} />;
  }

  const canApprove = hasPermission('approve_attendance');
  return <AdminReview canApprove={canApprove} />;
}

export default Attendance;
