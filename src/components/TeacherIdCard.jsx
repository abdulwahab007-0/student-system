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
      {/* Card header */}
      <div className="id-card-header">
        <div className="id-card-brand">
          <Icon name="academic" size={compact ? 16 : 20} />
          <div className="id-card-brand-text">
            <strong>NCBA &amp; E</strong>
            <span>Teacher Identification Card</span>
          </div>
        </div>
        <span className={meta.badge}>{meta.label}</span>
      </div>

      {/* Card body */}
      <div className="id-card-body">
        <div className="id-card-photo">
          {photoUrl ? (
            <img src={photoUrl} alt={teacher.name} />
          ) : (
            <div className="id-card-photo-placeholder">{initials(teacher.name)}</div>
          )}
          <span className="id-card-cr-tag id-card-teacher-tag">T</span>
        </div>
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
      </div>

      {/* Rejection reason */}
      {showReviewNote && <div className="id-card-review-note">⚠ {reviewNote}</div>}
    </div>
  );
}