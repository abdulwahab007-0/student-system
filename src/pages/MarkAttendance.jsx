import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import api from '../services/api';
import Icon from '../components/Icon';
import { getGeolocation, isSecureContext } from '../utils/geo';
import { MapContainer, TileLayer, Circle, Marker } from 'react-leaflet';
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

// Parse a period's "HH:mm - HH:mm" range into { start, end } minutes-of-day.
// Returns null when the range isn't parseable (callers fall back to allowing).
function parseTimeRange(timeRange) {
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(timeRange || '');
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
// Overall time-window state for a given period's range, based on the current time.
// Returns 'before' | 'during' | 'after' | null (null = undetermined, allow it).
function periodWindowState(timeRange) {
  const win = parseTimeRange(timeRange);
  if (!win) return null;
  const now = nowMinutes();
  if (now < win.start) return 'before';
  if (now > win.end) return 'after';
  return 'during';
}

// Mark Attendance component (for students & CR)
function MarkAttendance() {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const { students } = useData();
  const [classSchedule, setClassSchedule] = useState(null);
  const [geofences, setGeofences] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState(null);
  const [myRecords, setMyRecords] = useState([]);

  const today = getTodayDateISO();
  const todayName = getTodayDayName();
  const todayPeriods = classSchedule?.structure?.days?.find(d => d.name === todayName)?.periods || [];
  // Subject is auto-derived from the class schedule for the selected period —
  // students cannot change it when marking attendance.
  const scheduleSubject = (selectedPeriod != null)
    ? (classSchedule?.slots?.[`${todayName}_${selectedPeriod}`]?.subject || '')
    : '';

  // Resolve the student record for the current user (works for both students and CR)
  const student = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser?.linkedStudentId) {
      const found = students.find(s => s.id === currentUser.linkedStudentId);
      if (found) return found;
    }
    const byReverse = students.find(s => s.linkedUserId === currentUser?.id);
    if (byReverse) return byReverse;
    if (currentUser?.className) {
      const byClass = students.find(s => s.className === currentUser.className);
      if (byClass) return byClass;
    }
    return {
      id: currentUser.id,
      name: currentUser.fullName || currentUser.username,
      className: currentUser.className || '',
      email: currentUser.email,
      linkedUserId: currentUser.id,
    };
  }, [currentUser, students]);

  const loadMyRecords = async () => {
    if (!student) return;
    try {
      // Paint the previous records instantly, then revalidate in the background
      const cached = api.getSwrCache(`/attendance/student/${student.id}`);
      if (cached && Array.isArray(cached)) setMyRecords(cached);
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

  useEffect(() => { if (student) loadMyRecords(); }, [student]);

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

    // Enforce the lecture-time window in the UI too (server enforces as well).
    const range = todayPeriods[selectedPeriod];
    const state = periodWindowState(range);
    if (state === 'before') {
      return showToast('You cannot mark attendance before the lecture time', 'error');
    }
    if (state === 'after') {
      return showToast('You cannot mark attendance after the lecture time', 'error');
    }

    setMarking(true);
    try {
      const data = await api.markAttendance({
        className: selectedClass,
        subject: scheduleSubject || null,
        day: todayName,
        periodIndex: selectedPeriod,
        scheduledDate: today,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      setResult(data);
      setSelectedPeriod(null);
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
                const winState = periodWindowState(p); // 'before' | 'during' | 'after' | null
                const locked = marked || winState === 'before' || winState === 'after';
                return (
                  <button
                    key={i}
                    title={locked && !marked ? (winState === 'before' ? 'You cannot mark attendance before the lecture time' : winState === 'after' ? 'You cannot mark attendance after the lecture time' : '') : ''}
                    className={`btn ${selectedPeriod === i ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => !locked && setSelectedPeriod(i)}
                    disabled={locked}
                    style={{ opacity: locked ? 0.5 : 1, minWidth: '170px', justifyContent: 'center' }}
                  >
                    <Icon name={marked ? 'check' : winState === 'after' ? 'x' : winState === 'before' ? 'clock' : 'clock'} size={14} />
                    <span><strong>{ORDINALS[i]}</strong> — {p}</span>
                    {marked
                      ? <span className="badge badge-present" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Marked</span>
                      : winState === 'after'
                        ? <span className="badge badge-absent" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Absent</span>
                        : winState === 'before'
                          ? <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Not open yet</span>
                          : <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Open</span>}
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
                <input type="text" value={`${ORDINALS[selectedPeriod]} \u2014 ${todayPeriods[selectedPeriod]}`} readOnly style={{ background: 'var(--gray-bg)' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Subject</label>
                <input
                  type="text"
                  value={scheduleSubject || 'No subject scheduled for this period'}
                  readOnly
                  disabled
                  style={{ background: 'var(--gray-bg)' }}
                  title="This subject is set by the class schedule and cannot be changed."
                />
              </div>
            </div>

            {(() => {
              const range = todayPeriods[selectedPeriod];
              const winStateSel = periodWindowState(range);
              if (winStateSel === 'before') {
                return (
                  <div className="card" style={{ padding: '12px 16px', marginBottom: '14px', borderLeft: '4px solid var(--warning)', background: 'var(--warning-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="clock" size={18} style={{ color: 'var(--warning)' }} />
                      <div>
                        <strong style={{ color: 'var(--warning)' }}>You cannot mark attendance before the lecture time</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>This period ({range}) has not begun yet. The mark will open at the lecture start time.</div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (winStateSel === 'after') {
                return (
                  <div className="card" style={{ padding: '12px 16px', marginBottom: '14px', borderLeft: '4px solid var(--danger)', background: 'var(--danger-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="x" size={18} style={{ color: 'var(--danger)' }} />
                      <div>
                        <strong style={{ color: 'var(--danger)' }}>You cannot mark attendance after the lecture time</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>This period ({range}) has ended — you are marked absent for it.</div>
                      </div>
                    </div>
                  </div>
                );
              }
              return winStateSel === 'during'
                ? (
                  <div className="card" style={{ padding: '12px 16px', marginBottom: '14px', borderLeft: '4px solid var(--success)', background: 'var(--success-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="check" size={18} style={{ color: 'var(--success)' }} />
                      <div>
                        <strong style={{ color: 'var(--success)' }}>Lecture is in session ({range})</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>You can mark attendance now.</div>
                      </div>
                    </div>
                  </div>
                )
                : null;
            })()}

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
                  <Icon name="clock" size={18} style={{ color: 'var(--warning)' }} />
                  <div>
                    <strong style={{ color: 'var(--warning)' }}>No geofence defined</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Your location will be recorded but not checked against a geofence.</div>
                  </div>
                </div>
              </div>
            )}

            {geofences.length > 0 && (
              <div className="card" style={{ height: '260px', marginBottom: '14px', overflow: 'hidden' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={false}
                  eventHandlers={{ click: (e) => { setCoords({ lat: e.latlng.lat, lng: e.latlng.lng }); setResult(null); } }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
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
              <button className="btn btn-primary" onClick={handleMark} disabled={marking || periodWindowState(todayPeriods[selectedPeriod]) === 'before' || periodWindowState(todayPeriods[selectedPeriod]) === 'after'} style={{ minWidth: '140px', justifyContent: 'center' }}>
                <Icon name="check" size={16} /> {marking ? 'Submitting...' : 'Mark Attendance'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setSelectedPeriod(null); setCoords(null); setResult(null); }}>
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
                      <td className="hide-mobile">{r.subject || '---'}</td>
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

export default MarkAttendance;
