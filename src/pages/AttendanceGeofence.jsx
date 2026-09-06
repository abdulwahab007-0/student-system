import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import api from '../services/api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

// Fix default marker icon paths for bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [24.8607, 67.0011]; // Karachi (NCBA & E)
const DEFAULT_ZOOM = 14;

function CenteredMarker({ marker, onMove }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return marker ? <Marker position={marker} /> : null;
}

// Component to programmatically move the map when coordinates change via input
function MapUpdater({ center }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center[0], center[1]]);
  return null;
}

function GeofenceForm({ initial, classes, onSave, onCancel, defaultLat, defaultLng }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    country: initial?.country || '',
    province: initial?.province || '',
    city: initial?.city || '',
    radius: initial?.radius || 100,
    className: initial?.className || '',
  });
  const [marker, setMarker] = useState(initial ? [initial.latitude, initial.longitude] : [defaultLat, defaultLng]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [coordSource, setCoordSource] = useState('map'); // 'map' or 'input' — tracks who last updated coords

  const handleChange = (e) => { const { name, value } = e.target; setForm(prev => ({ ...prev, [name]: value })); };

  // Geocode country/province/city to center the map
  const geocodeLocation = async (country, province, city) => {
    const parts = [city, province, country].filter(Boolean);
    if (parts.length === 0) return;
    setGeoLoading(true);
    try {
      const query = encodeURIComponent(parts.join(', '));
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        setCoordSource('map');
        setMarker([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      }
    } catch { /* user can still click the map */ } finally { setGeoLoading(false); }
  };

  const handleLocationChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...form, [name]: value };
    setForm(prev => ({ ...prev, [name]: value }));
    if (name === 'city' && value.trim()) {
      clearTimeout(geocodeLocation._timer);
      geocodeLocation._timer = setTimeout(() => {
        geocodeLocation(updated.country, updated.province, updated.city);
      }, 600);
    }
  };

  const handleGeocodeSearch = () => geocodeLocation(form.country, form.province, form.city);

  // Handle manual coordinate input — update marker when user types lat/lng
  const handleCoordChange = (e) => {
    const { name, value } = e.target;
    const numVal = parseFloat(value);
    if (value === '' || value === '-' || value === '.' || isNaN(numVal)) {
      // Allow partial typing, don't update marker yet
      setForm(prev => ({ ...prev, [name]: value }));
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
    setCoordSource('input');
    if (name === 'latitude') {
      setMarker([numVal, marker[1]]);
    } else if (name === 'longitude') {
      setMarker([marker[0], numVal]);
    }
  };

  // When map click updates marker, sync back to coord inputs
  const handleMapMove = (lat, lng) => {
    setCoordSource('map');
    setMarker([lat, lng]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      country: form.country.trim() || null,
      province: form.province.trim() || null,
      city: form.city.trim() || null,
      latitude: marker[0],
      longitude: marker[1],
      radius: Number(form.radius) || 100,
      className: form.className || null,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '12px' }}>
        <label><strong>Click on the map or enter coordinates below to set the center point</strong></label>
        <div style={{ height: '300px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', marginTop: '8px' }}>
          <MapContainer center={marker} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater center={marker} />
            <CenteredMarker marker={marker} onMove={handleMapMove} />
            <Circle center={marker} radius={Number(form.radius) || 100} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 0.15 }} />
          </MapContainer>
        </div>
        {/* Coordinate inputs — sync with map bidirectionally */}
        <div className="form-grid" style={{ marginTop: '8px' }}>
          <div className="form-group">
            <label style={{ fontSize: '0.75rem' }}>Latitude *</label>
            <input type="number" name="latitude" step="any" value={coordSource === 'map' ? marker[0].toFixed(6) : form.latitude || marker[0].toFixed(6)}
              onChange={handleCoordChange} placeholder="e.g. 24.8607" required />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.75rem' }}>Longitude *</label>
            <input type="number" name="longitude" step="any" value={coordSource === 'map' ? marker[1].toFixed(6) : form.longitude || marker[1].toFixed(6)}
              onChange={handleCoordChange} placeholder="e.g. 67.0011" required />
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid var(--border)' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray)', display: 'block', marginBottom: '8px' }}>
          <Icon name="location" size={13} /> Location (to narrow down the map area)
        </label>
        <div className="form-grid" style={{ marginBottom: 0 }}>
          <div className="form-group">
            <label>Country</label>
            <input type="text" name="country" value={form.country} onChange={handleLocationChange} placeholder="e.g. Pakistan" />
          </div>
          <div className="form-group">
            <label>Province / State</label>
            <input type="text" name="province" value={form.province} onChange={handleLocationChange} placeholder="e.g. Sindh" />
          </div>
          <div className="form-group">
            <label>City</label>
            <input type="text" name="city" value={form.city} onChange={handleLocationChange} placeholder="e.g. Karachi" />
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={handleGeocodeSearch}
          disabled={geoLoading || (!form.country && !form.province && !form.city)}
          style={{ marginTop: '6px', fontSize: '0.75rem', padding: '4px 10px' }}>
          {geoLoading ? 'Searching…' : 'Locate on Map'}
        </button>
      </div>
      <div className="form-grid">
        <div className="form-group full-width">
          <label>Area Name *</label>
          <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Main Campus Building" required />
        </div>
        <div className="form-group">
          <label>Radius (meters) *</label>
          <input type="number" name="radius" value={form.radius} onChange={handleChange} min="10" max="5000" placeholder="100" required />
        </div>
        <div className="form-group">
          <label>Class (optional)</label>
          <select name="className" value={form.className} onChange={handleChange}>
            <option value="">All classes</option>
            {classes.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
          </select>
        </div>
      </div>
      <div className="modal-footer" style={{ padding: '16px 0 0', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save Area</button>
      </div>
    </form>
  );
}


function AttendanceGeofence() {
  const { classes } = useData();
  const { hasPermission } = useAuth();
  const showToast = useToast();
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadGeofences = async () => {
    try {
      const data = await api.getGeofences();
      setGeofences(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGeofences(); }, []);

  const defaultLat = DEFAULT_CENTER[0];
  const defaultLng = DEFAULT_CENTER[1];

  const handleSave = async (data) => {
    try {
      if (editing) {
        await api.updateGeofence(editing.id, data);
        showToast('Area updated successfully');
      } else {
        await api.createGeofence(data);
        showToast('Area created successfully');
      }
      setShowModal(false); setEditing(null);
      loadGeofences();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteGeofence(deleting.id);
      showToast('Area deleted');
      setDeleting(null);
      loadGeofences();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };


  return (
    <div>
      <div className="page-header">
        <h1>Attendance Areas</h1>
        <p>Define circular geographical areas around your campus. Students must be inside an area to mark attendance.</p>
      </div>

      <div className="toolbar">
        <div />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {hasPermission('manage_geofences') && (
            <button className="btn-add" onClick={() => { setEditing(null); setShowModal(true); }}>
              <span className="add-icon"><Icon name="plus" size={16} /></span>
              <span className="add-text">New Area</span>
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: '0' }}>
          {loading ? (
            <div className="loading" style={{ padding: '40px 20px' }}>Loading areas…</div>
          ) : geofences.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📍</div>
              <h3>No attendance areas defined yet</h3>
              <p>Create a geofence to define the allowed area for marking attendance.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Radius</th>
                    <th className="hide-mobile">Class</th>
                    <th className="hide-mobile">Location</th>
                    <th className="hide-mobile">Coordinates</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {geofences.map(f => (
                    <tr key={f.id}>
                      <td>
                        <div className="student-cell">
                          <div style={{ width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
                            <MapContainer center={[f.latitude, f.longitude]} zoom={15} scrollWheelZoom={false} dragging={false} style={{ height: '100%', width: '100%' }}>
                              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                              <Circle center={[f.latitude, f.longitude]} radius={f.radius} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 0.15 }} />
                            </MapContainer>
                          </div>
                          <div>
                            <div className="name"><Icon name="location" size={14} /> {f.name}</div>
                            <div className="sub">Created {new Date(f.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </td>
                      <td><strong>{f.radius} m</strong></td>
                      <td className="hide-mobile">
                        <span className={`badge ${f.className ? 'success' : 'info'}`}>
                          {f.className || 'All classes'}
                        </span>
                      </td>
                      <td className="hide-mobile" style={{ fontSize: '0.8rem' }}>
                        {[f.city, f.province, f.country].filter(Boolean).join(', ') || <span style={{ color: 'var(--gray)' }}>—</span>}
                      </td>
                      <td className="hide-mobile" style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                        {f.latitude.toFixed(5)}, {f.longitude.toFixed(5)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {hasPermission('manage_geofences') && (
                            <button className="btn-icon edit" title="Edit" onClick={() => { setEditing(f); setShowModal(true); }}>
                              <Icon name="edit" size={15} />
                            </button>
                          )}
                          {hasPermission('manage_geofences') && (
                            <button className="btn-icon delete" title="Delete" onClick={() => setDeleting(f)}>
                              <Icon name="delete" size={15} />
                            </button>
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

      {showModal && (
        <Modal title={editing ? 'Edit Area' : 'New Attendance Area'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <GeofenceForm initial={editing} classes={classes} defaultLat={defaultLat} defaultLng={defaultLng}
            onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog message={`Delete the area "${deleting.name}"? Students will no longer be able to mark attendance there.`}
          onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

export default AttendanceGeofence;