import Modal from './Modal';

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <Modal
      title="Confirm Action"
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
        </>
      }
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--gray)' }}>{message}</p>
    </Modal>
  );
}

export default ConfirmDialog;