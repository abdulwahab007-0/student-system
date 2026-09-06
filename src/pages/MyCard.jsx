import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import api from '../services/api';
import StudentIdCard from '../components/StudentIdCard';

function MyCard() {
  const { currentUser, hasPermission } = useAuth();
  const showToast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const canUploadOwn = hasPermission('upload_own_card_photo');

  const load = async () => {
    try {
      setLoading(true);
      setData(await api.getMyCard());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleUpload = async (file) => {
    if (!data?.student) return;
    setUploading(true);
    try {
      const res = await api.uploadCardPhoto(data.student.id, file);
      setData(prev => prev ? { ...prev, card: res.card } : prev);
      showToast(res.message || 'Photo uploaded.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = (e) => {
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
    handleUpload(file);
  };

  if (loading) {
    return <div className="panel"><p style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>Loading your card…</p></div>;
  }

  if (!data?.linked) {
    return (
      <div className="page-header">
        <h1>My ID Card</h1>
        <p>{data?.message || 'No student profile is linked to this account yet.'}</p>
      </div>
    );
  }

  const { student, card } = data;

  return (
    <div>
      <div className="page-header">
        <h1>My ID Card</h1>
        <p>
          {currentUser?.role === 'cr_admin'
            ? 'As a Class Representative you are also a student — this is your official ID card.'
            : 'This is your official student identification card.'}
        </p>
      </div>

      <div className="panel my-card-panel">
        <div className="my-card-layout my-card-layout-lg">
          <StudentIdCard
            student={student}
            photoUrl={card?.photoUrl}
            cardStatus={card?.cardStatus || 'none'}
            reviewNote={card?.reviewNote}
            issuedAt={card?.issuedAt}
          />

          <div className="my-card-side">
            {card?.cardStatus === 'approved' && (
              <div className="issued-box">
                <Icon name="check" size={18} />
                <div>
                  <strong>Card issued</strong>
                  <span>issued on {card.issuedAt}</span>
                </div>
              </div>
            )}
            {card?.cardStatus === 'pending' && (
              <div className="issued-box issued-box-warning">
                <Icon name="clock" size={18} />
                <div>
                  <strong>Photo awaiting approval</strong>
                  <span>An admin or teacher will verify your photo before issuing the card.</span>
                </div>
              </div>
            )}
            {card?.cardStatus === 'rejected' && (
              <div className="issued-box issued-box-danger">
                <Icon name="x" size={18} />
                <div>
                  <strong>Photo rejected</strong>
                  <span>{card.reviewNote || 'Please upload a clear photo of yourself.'}</span>
                </div>
              </div>
            )}
            {(!card?.cardStatus || card?.cardStatus === 'none') && (
              <div className="issued-box">
                <Icon name="idCard" size={18} />
                <div>
                  <strong>No photo yet</strong>
                  <span>Upload a clear, recent photo of yourself to get your ID card issued.</span>
                </div>
              </div>
            )}

            {canUploadOwn && (
              <div className="card-actions">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  ref={fileInput}
                  onChange={onPickFile}
                />
                <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  <Icon name="plus" size={16} /> {uploading ? 'Uploading…' : 'Upload / Replace My Photo'}
                </button>
                {card?.cardStatus === 'approved' && (
                  <span className="hint-text">Replacing the photo will reset the card to “pending approval” until it is re-verified.</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyCard;