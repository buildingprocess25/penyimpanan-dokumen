"use client";
export default function LogoutModal({ show, onConfirm, onCancel }) {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>Yakin ingin logout?</h3>
        <div className="modal-actions">
          <button className="btn-confirm" onClick={onConfirm}>
            Ya, Logout
          </button>
          <button className="btn-cancel" onClick={onCancel}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
