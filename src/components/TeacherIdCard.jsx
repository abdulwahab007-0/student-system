function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const STATUS_META = {
  none: { label: 'No Photo', cls: 'id-card-status-none' },
  pending: { label: 'Pending Approval', cls: 'id-card-status-pending' },
  approved: { label: 'Approved', cls: 'id-card-status-approved' },
  rejected: { label: 'Photo Rejected', cls: 'id-card-status-rejected' },
};

/* Inline shield logo used inside the card header */
function ShieldLogo({ size = 32 }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" className="id-card-shield-logo">
      <defs>
        <clipPath id="shieldClipTeacher">
          <path d="M30 3 L57 14 L57 36 C57 54 30 69 30 69 C30 69 3 54 3 36 L3 14 Z"/>
        </clipPath>
      </defs>
      <path d="M30 3 L57 14 L57 36 C57 54 30 69 30 69 C30 69 3 54 3 36 L3 14 Z" fill="#ffffff" stroke="#1e293b" strokeWidth="2"/>
      <g clipPath="url(#shieldClipTeacher)">
        <rect x="3" y="14" width="11" height="11" fill="#059669"/>
        <rect x="14" y="14" width="11" height="11" fill="#7c3aed"/>
        <rect x="25" y="14" width="11" height="11" fill="#059669"/>
        <rect x="36" y="14" width="11" height="11" fill="#7c3aed"/>
        <rect x="47" y="14" width="11" height="11" fill="#059669"/>
        <rect x="3" y="25" width="11" height="11" fill="#7c3aed"/>
        <rect x="14" y="25" width="11" height="11" fill="#059669"/>
        <rect x="25" y="25" width="11" height="11" fill="#7c3aed"/>
        <rect x="36" y="25" width="11" height="11" fill="#059669"/>
        <rect x="47" y="25" width="11" height="11" fill="#7c3aed"/>
        <rect x="3" y="36" width="11" height="11" fill="#059669"/>
        <rect x="14" y="36" width="11" height="11" fill="#7c3aed"/>
        <rect x="25" y="36" width="11" height="11" fill="#059669"/>
        <rect x="36" y="36" width="11" height="11" fill="#7c3aed"/>
        <rect x="47" y="36" width="11" height="11" fill="#059669"/>
        <rect x="8" y="47" width="11" height="11" fill="#7c3aed"/>
        <rect x="19" y="47" width="11" height="11" fill="#059669"/>
        <rect x="30" y="47" width="11" height="11" fill="#7c3aed"/>
        <rect x="41" y="47" width="11" height="11" fill="#059669"/>
        <rect x="14" y="58" width="11" height="11" fill="#059669"/>
        <rect x="25" y="58" width="11" height="11" fill="#7c3aed"/>
        <rect x="36" y="58" width="11" height="11" fill="#059669"/>
      </g>
      <polygon points="30,22 33,31 42,31 35,36 37,45 30,40 23,45 25,36 18,31 27,31" fill="#ffffff" opacity="0.92"/>
      <polygon points="30,26 32,32 38,32 33,36 35,42 30,38 25,42 27,36 22,32 28,32" fill="#fbbf24"/>
    </svg>
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