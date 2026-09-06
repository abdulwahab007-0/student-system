import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import api from '../services/api';
import StudentIdCard from '../components/StudentIdCard';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'none', label: 'No Photo' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function StudentCards() {
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();
  const [cards, setCards] = useState([]);
  const [myCard, setMyCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [uploadingId, setUploadingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const fileInputs = useRef({});

  const canUpload = hasPermission('upload_card_photos');
  const canApprove = hasPermission('approve_card_photos');
  const canUploadOwn = hasPermission('upload_own_card_photo');

  const loadCards = async () => {
    try {
      setLoading(true);
      setCards(await api.getStudentCards());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
    // The CR is also a student, so their own card is shown on top of the grid
    if (currentUser?.role === 'cr_admin') {
      api.getMyCard().then(setMyCard).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply an updated card record into the student list + "my card" section
  const applyCard = (studentId, card) => {
    setCards(prev => prev.map(c => {
      if (c.id !== studentId) return c;
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
    setMyCard(prev => (prev && prev.student && prev.student.id === studentId ? { ...prev, card } : prev));
  };

  const handleUpload = async (student, file) => {
    setUploadingId(student.id);
    try {
      const res = await api.uploadCardPhoto(student.id, file);
      applyCard(student.id, res.card);
      showToast(res.message || 'Photo uploaded.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadingId(null);
    }
  };

  const onPickFile = (student, e) => {
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
    handleUpload(student, file);
  };

  const handleApprove = async (student) => {
    if (!student.cardId) {
      showToast('This student has no photo yet.', 'info');
      return;
    }
    try {
      const res = await api.approveCardPhoto(student.cardId);
      applyCard(student.id, res.card);
      showToast(res.message || 'Card approved.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReject = async (student) => {
    if (!student.cardId) return;
    if (!rejectNote.trim()) {
      showToast('Please enter a reason for rejecting the photo.', 'error');
      return;
    }
    try {
      const res = await api.rejectCardPhoto(student.cardId, rejectNote.trim());
      applyCard(student.id, res.card);
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
        c.rollNo?.toLowerCase().includes(q) ||
        c.className?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' || c.cardStatus === filter;
      return matchesSearch && matchesFilter;
    });
  }, [cards, search, filter]);

  return (
    <div>
      <div className="page-header">
        <h1>Student Cards</h1>
        <p>Upload and verify student photos. A card can only be issued after the photo is approved.</p>
      </div>
      {/* CR (also a student) own card */}
      {myCard?.linked && (
        <div className="panel my-card-panel">
          <div className="panel-header">
            <h3><Icon name="idCard" size={18} /> Your Card — Class Representative</h3>
            <span className="badge badge-info">CR is also a student</span>
          </div>
          <div className="my-card-layout">
            <StudentIdCard
              student={myCard.student}
              photoUrl={myCard.card?.photoUrl}
              cardStatus={myCard.card?.cardStatus || 'none'}
              reviewNote={myCard.card?.reviewNote}
              issuedAt={myCard.card?.issuedAt}
            />
            {canUpload || (canUploadOwn && myCard.student?.id != null) ? (
              <div className="card-actions my-card-actions">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  ref={el => { fileInputs.current[`my-${myCard.student.id}`] = el; }}
                  onChange={e => onPickFile(myCard.student, e)}
                />
                <button className="btn btn-secondary" onClick={() => fileInputs.current[`my-${myCard.student.id}`]?.click()}>
                  <Icon name="plus" size={16} /> Upload / Replace Photo
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '18px' }}>
        <div className="stat-card"><h3>{stats.total}</h3><p>Total Students</p></div>
        <div className="stat-card"><h3>{stats.approved}</h3><p>Cards Ready to Issue</p></div>
        <div className="stat-card"><h3>{stats.pending}</h3><p>Pending Approval</p></div>
        <div className="stat-card"><h3>{stats.rejected}</h3><p>Rejected Photos</p></div>
        <div className="stat-card"><h3>{stats.none}</h3><p>No Photo</p></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          className="search-input"
          placeholder="Search by name, roll no, class or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '320px' }}
        />
        <select className="search-input" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: '200px' }}>
          {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="panel"><p style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>Loading student cards…</p></div>
      ) : filtered.length === 0 ? (
        <div className="panel"><p style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>No students match the current filters.</p></div>
      ) : (
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {filtered.map(student => (
            <div className="panel card-tile" key={student.id}>
              <StudentIdCard
                student={student}
                photoUrl={student.photoUrl}
                cardStatus={student.cardStatus || 'none'}
                reviewNote={student.reviewNote}
                issuedAt={student.issuedAt}
              />

              <div className="card-actions">
                {(canUpload || (currentUser?.role === 'cr_admin' && canUploadOwn && myCard?.student?.id === student.id)) && (
                  <>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      ref={el => { fileInputs.current[student.id] = el; }}
                      onChange={e => onPickFile(student, e)}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputs.current[student.id]?.click()}
                      disabled={uploadingId === student.id}
                    >
                      {uploadingId === student.id ? 'Uploading…' : (<><Icon name="plus" size={14} /> Upload Photo</>)}
                    </button>
                  </>
                )}

                {canApprove && student.cardId && student.cardStatus !== 'approved' && student.cardStatus !== 'none' && (
                  <button className="btn btn-success btn-sm" onClick={() => handleApprove(student)}>
                    <Icon name="check" size={14} /> Approve
                  </button>
                )}

                {canApprove && student.cardId && student.cardStatus !== 'rejected' && student.cardStatus !== 'none' && (
                  <button className="btn btn-danger btn-sm" onClick={() => { setRejectingId(student.id); setRejectNote(''); }}>
                    <Icon name="x" size={14} /> Reject
                  </button>
                )}
              </div>

              {rejectingId === student.id && (
                <div className="reject-form">
                  <textarea
                    placeholder="Reason for rejection (shown to the student)…"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    rows={2}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleReject(student)}>Confirm Reject</button>
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

export default StudentCards;
