function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const STATUS_META = {
  none: { label: 'No Photo', cls: 'id-card-status-none' },
  pending: { label: 'Pending Approval', cls: 'id-card-status-pending' },
  approved: { label: 'Approved', cls: 'id-card-status-approved' },
  rejected: { label: 'Photo Rejected', cls: 'id-card-status-rejected' },
};

/* Shield logo used inside the card header */
function ShieldLogo({ size = 32 }) {
  return (
    <img
      src="/ncba-logo.webp"
      alt="NCBA&E Shield"
      className="id-card-shield-logo"
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }}
    />
  );
}

/**
 * Reusable teacher ID card preview.
 * teacher   : { name, subjects: [{name, code, className}] }
 * cardStatus: 'none' | 'pending' | 'approved' | 'rejected'
 */
export default function TeacherIdCard({
  teacher,
  photoUrl,
  cardStatus = 'none',
  reviewNote,
  issuedAt,
  compact = false,
}) {
  if (!teacher) return null;
  const meta = STATUS_META[cardStatus] || STATUS_META.none;
  const showReviewNote = cardStatus === 'rejected' && reviewNote;
  const subjectList = teacher.subjects || [];

  return (
    <div className={`id-card ${compact ? 'id-card-compact' : ''} id-card-${cardStatus}`}>
      {/* Card header — college name */}
      <div className="id-card-header">
        <div className="id-card-header-top">
          <ShieldLogo size={compact ? 24 : 32} />
          <div className="id-card-college-name">
            <span className="id-card-college-title">National College of Business Administration &amp; Economics</span>
          </div>
        </div>
        {/* Campus / type band */}
        <div className="id-card-campus-band">
          <span>{teacher.className || 'Faculty'}</span>
          <span className={`id-card-status-pill ${meta.cls}`}>{meta.label}</span>
        </div>
      </div>

      {/* Card body — photo right, info left */}
      <div className="id-card-body">
        <div className="id-card-info">
          <div className="id-card-field">
            <span>Name</span>
            <strong title={teacher.name}>{teacher.name || '—'}</strong>
          </div>
          <div className="id-card-field">
            <span>Class</span>
            <strong>{teacher.className || '—'}</strong>
          </div>
          <div className="id-card-field">
            <span>Subjects</span>
            <strong className="id-card-subjects">
              {subjectList.length > 0
                ? subjectList.map(s => s.name).join(' · ')
                : '—'}
            </strong>
          </div>
          {!compact && (
            <div className="id-card-field">
              <span>Issue Date</span>
              <strong>{issuedAt || 'Not issued yet'}</strong>
            </div>
          )}
        </div>
        <div className="id-card-photo">
          {photoUrl ? (
            <img src={photoUrl} alt={teacher.name} />
          ) : (
            <div className="id-card-photo-placeholder">{initials(teacher.name)}</div>
          )}
          <span className="id-card-cr-tag id-card-teacher-tag">T</span>
        </div>
      </div>

      {/* Rejection reason */}
      {showReviewNote && <div className="id-card-review-note">⚠ {reviewNote}</div>}
    </div>
  );
}