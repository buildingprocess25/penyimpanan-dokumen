"use client";
import { useEffect } from "react";

export default function SuccessModal({ title = "Success", message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="success-overlay">
      <div className="success-modal">
        <div className="success-icon">✔</div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}
