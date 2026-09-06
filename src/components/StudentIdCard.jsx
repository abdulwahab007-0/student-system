import Icon from './Icon';

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const STATUS_META = {
  none: { label: 'No Photo', badge: 'badge badge-info' },
  pending: { label: 'Pending Approval', badge: 'badge badge-warning' },
  approved: { label: 'Approved · Ready to Issue', badge: 'badge badge-success' },
  rejected: { label: 'Photo Rejected', badge: 'badge badge-danger' },
};

/**
 * Reusable student ID card preview.
 * student   : { name, rollNo, className, isCR }
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
      {/* Card header */}
      <div className="id-card-header">
        <div className="id-card-brand">
          <Icon name="academic" size={compact ? 16 : 20} />
          <div className="id-card-brand-text">
            <strong>NCBA &amp; E</strong>
            <span>Student Identification Card</span>
          </div>
        </div>
        <span className={meta.badge}>{meta.label}</span>
      </div>

      {/* Card body */}
      <div className="id-card-body">
        <div className="id-card-photo">
          {photoUrl ? (
            <img src={photoUrl} alt={student.name} />
          ) : (
            <div className="id-card-photo-placeholder">{initials(student.name)}</div>
          )}
          {student.isCR ? <span className="id-card-cr-tag">CR</span> : null}
        </div>
        <div className="id-card-info">
          <div className="id-card-field">
            <span>Name</span>
            <strong title={student.name}>{student.name || '—'}</strong>
          </div>
          <div className="id-card-field">
            <span>Roll No</span>
            <strong>{student.rollNo || '—'}</strong>
          </div>
          <div className="id-card-field">
            <span>Class</span>
            <strong>{student.className || '—'}</strong>
          </div>
          {!compact && (
            <div className="id-card-field">
              <span>Issue Date</span>
              <strong>{issuedAt || 'Not issued yet'}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Rejection reason */}
      {showReviewNote && <div className="id-card-review-note">⚠ {reviewNote}</div>}
    </div>
  );
}