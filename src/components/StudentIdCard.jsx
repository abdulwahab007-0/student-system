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
 * Reusable student ID card preview.
 * student   : { name, rollNo, className, gender, dateOfBirth, isCR }
 * cardStatus: 'none' | 'pending' | 'approved' | 'rejected'
 */
export default function StudentIdCard({
  student,
  photoUrl,
  cardStatus = 'none',
  reviewNote,
  issuedAt,
  compact = false,
}) {
  if (!student) return null;
  const meta = STATUS_META[cardStatus] || STATUS_META.none;
  const showReviewNote = cardStatus === 'rejected' && reviewNote;

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
          <span>{student.className || 'Main Campus'}</span>
          <span className={`id-card-status-pill ${meta.cls}`}>{meta.label}</span>
        </div>
      </div>

      {/* Card body — photo right, info left */}
      <div className="id-card-body">
        <div className="id-card-info">
          <div className="id-card-field">
            <span>Name</span>
            <strong title={student.name}>{student.name || '—'}</strong>
          </div>
          {student.gender && (
            <div className="id-card-field">
              <span>Gender</span>
              <strong>{student.gender}</strong>
            </div>
          )}
          <div className="id-card-field">
            <span>Roll No</span>
            <strong>{student.rollNo || '—'}</strong>
          </div>
          <div className="id-card-field">
            <span>Class / Campus</span>
            <strong>{student.className || '—'}</strong>
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
            <img src={photoUrl} alt={student.name} />
          ) : (
            <div className="id-card-photo-placeholder">{initials(student.name)}</div>
          )}
          {student.isCR ? <span className="id-card-cr-tag">CR</span> : null}
        </div>
      </div>

      {/* Rejection reason */}
      {showReviewNote && <div className="id-card-review-note">⚠ {reviewNote}</div>}
    </div>
  );
}