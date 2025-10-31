"use client";
import React from "react";

export default function AutoLogoutModal({ title, message, onClose }) {
  if (!message) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box warning">
        {/* ⚠️ Ikon tanda seru */}
        <div className="icon-circle warning-icon">!</div>

        <h3 style={{ color: "#b67a00", fontWeight: 700, marginBottom: "6px" }}>
          {title || "Warning"}
        </h3>

        <p
          style={{
            color: "#5a4b00",
            fontSize: "0.95rem",
            textAlign: "center",
            marginBottom: "10px",
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </p>

        <button
          className="btn-warning-close"
          onClick={onClose}
          style={{
            marginTop: "14px",
            background: "#f4b400",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "6px 16px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          OK
        </button>
        
      </div>
    </div>
  );
}
