import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import api from '../services/api';
import TeacherIdCard from '../components/TeacherIdCard';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'none', label: 'No Photo' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function TeacherCards() {
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();
  const [cards, setCards] = useState([]);
  const [myCard, setMyCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [uploadingName, setUploadingName] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const fileInputs = useRef({});

  const canUpload = hasPermission('upload_teacher_card_photos');
  const canApprove = hasPermission('approve_teacher_card_photos');
  const canUploadOwn = hasPermission('upload_own_teacher_card_photo');

  const loadCards = async () => {
    try {
      // Paint cached copy instantly (no spinner) before background refresh
      const cached = api.getSwrCache('/teacher-cards');
      if (cached) { setCards(cached); setLoading(false); }
      else setLoading(true);
      setCards(await api.getTeacherCards());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
    // A teacher_admin account sees their own card pinned on top
    if (currentUser?.role === 'teacher_admin') {
      api.getMyTeacherCard().then(setMyCard).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
// Apply an updated card record into the teacher list + "my card" section
  const applyCard = (name, card) => {
    setCards(prev => prev.map(c => {
      if (c.name !== name) return c;
      return {
        ...c,
        cardId: card.id,
        photoUrl: card.photoUrl,
        photoMime: card.photoMime,
        cardStatus: card.cardStatus,
        reviewNote: card.reviewNote,
        reviewedBy: card.reviewedBy,
        issuedAt: card.issuedAt,
      };
    }));
    setMyCard(prev => (prev && prev.teacher && prev.teacher.name === name ? { ...prev, card } : prev));
  };

  const handleUpload = async (teacher, file) => {
    setUploadingName(teacher.name);
    try {
      const res = await api.uploadTeacherCardPhoto(teacher.name, file);
      applyCard(teacher.name, res.card);
      showToast(res.message || 'Photo uploaded.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadingName(null);
    }
  };

  const onPickFile = (teacher, e) => {
    const file = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Please choose a JPG, PNG or WebP image.', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('Photo is too large (max 8 MB).', 'error');
      return;
    }
    handleUpload(teacher, file);
  };

  const handleApprove = async (teacher) => {
    if (!teacher.cardId) {
      showToast('This teacher has no photo yet.', 'info');
      return;
    }
    try {
      const res = await api.approveTeacherCardPhoto(teacher.cardId);
      applyCard(teacher.name, res.card);
      showToast(res.message || 'Card approved.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReject = async (teacher) => {
    if (!teacher.cardId) return;
    if (!rejectNote.trim()) {
      showToast('Please enter a reason for rejecting the photo.', 'error');
      return;
    }
    try {
      const res = await api.rejectTeacherCardPhoto(teacher.cardId, rejectNote.trim());
      applyCard(teacher.name, res.card);
      setRejectingId(null);
      setRejectNote('');
      showToast(res.message || 'Photo rejected.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const stats = useMemo(() => {
    const s = { none: 0, pending: 0, approved: 0, rejected: 0 };
    cards.forEach(c => { if (s[c.cardStatus] !== undefined) s[c.cardStatus] += 1; });
    return { total: cards.length, ...s };
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter(c => {
      const matchesSearch = !q ||
        c.name?.toLowerCase().includes(q) ||
        (c.subjects || []).some(s => (s.name || '').toLowerCase().includes(q)) ||
        c.className?.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' || c.cardStatus === filter;
      return matchesSearch && matchesFilter;
    });
  }, [cards, search, filter]);

  const isMyTeacher = (name) =>
    currentUser?.role === 'teacher_admin' &&
    myCard?.teacher?.name === name;

  return (
    <div>
      <div className="page-header">
        <h1>Teacher Cards</h1>
        <p>Upload and verify teacher photos. Teacher list is kept in sync with the teachers assigned to subjects.</p>
      </div>
{/* Teacher own card */}
      {myCard?.linked && (
        <div className="panel my-card-panel">
          <div className="panel-header">
            <h3><Icon name="idCard" size={18} /> Your Card — Teacher</h3>
            <span className="badge badge-info">Linked to your account</span>
          </div>
          <div className="my-card-layout">
            <TeacherIdCard
              teacher={myCard.teacher}
              photoUrl={myCard.card?.photoUrl}
              cardStatus={myCard.card?.cardStatus || 'none'}
              reviewNote={myCard.card?.reviewNote}
              issuedAt={myCard.card?.issuedAt}
            />
            {canUpload || canUploadOwn ? (
              <div className="card-actions my-card-actions">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  ref={el => { fileInputs.current[`my-${myCard.teacher.name}`] = el; }}
                  onChange={e => onPickFile(myCard.teacher, e)}
                />
                <button className="btn btn-secondary" onClick={() => fileInputs.current[`my-${myCard.teacher.name}`]?.click()}>
                  <Icon name="plus" size={16} /> Upload / Replace Photo
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '18px' }}>
        <div className="stat-card"><h3>{stats.total}</h3><p>Total Teachers</p></div>
        <div className="stat-card"><h3>{stats.approved}</h3><p>Cards Ready to Issue</p></div>
        <div className="stat-card"><h3>{stats.pending}</h3><p>Pending Approval</p></div>
        <div className="stat-card"><h3>{stats.rejected}</h3><p>Rejected Photos</p></div>
        <div className="stat-card"><h3>{stats.none}</h3><p>No Photo</p></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="text"
          placeholder="Search by teacher, subject or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--white)' }}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--white)' }}>
          {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>
{/* Grid */}
      {loading ? (
        <div className="panel"><p style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>Loading teacher cards…</p></div>
      ) : filtered.length === 0 ? (
        <div className="panel"><p style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>No teachers match the current filters. Add a teacher when adding or editing a subject.</p></div>
      ) : (
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {filtered.map(teacher => (
            <div className="panel card-tile" key={teacher.name}>
              <TeacherIdCard
                teacher={teacher}
                photoUrl={teacher.photoUrl}
                cardStatus={teacher.cardStatus || 'none'}
                reviewNote={teacher.reviewNote}
                issuedAt={teacher.issuedAt}
              />

              <div className="card-actions">
                {(canUpload || (currentUser?.role === 'teacher_admin' && canUploadOwn && isMyTeacher(teacher.name))) && (
                  <>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      ref={el => { fileInputs.current[teacher.name] = el; }}
                      onChange={e => onPickFile(teacher, e)}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputs.current[teacher.name]?.click()}
                      disabled={uploadingName === teacher.name}
                    >
                      {uploadingName === teacher.name ? 'Uploading…' : (<><Icon name="plus" size={14} /> Upload Photo</>)}
                    </button>
                  </>
                )}

                {canApprove && teacher.cardId && teacher.cardStatus !== 'approved' && teacher.cardStatus !== 'none' && (
                  <button className="btn btn-success btn-sm" onClick={() => handleApprove(teacher)}>
                    <Icon name="check" size={14} /> Approve
                  </button>
                )}

                {canApprove && teacher.cardId && teacher.cardStatus !== 'rejected' && teacher.cardStatus !== 'none' && (
                  <button className="btn btn-danger btn-sm" onClick={() => { setRejectingId(teacher.cardId); setRejectNote(''); }}>
                    <Icon name="x" size={14} /> Reject
                  </button>
                )}
              </div>

              {rejectingId === teacher.cardId && (
                <div className="reject-form">
                  <textarea
                    placeholder="Reason for rejection (shown to the teacher)…"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    rows={2}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleReject(teacher)}>Confirm Reject</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setRejectingId(null); setRejectNote(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TeacherCards;
