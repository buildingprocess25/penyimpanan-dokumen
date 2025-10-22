"use client";
import React from "react";

export default function ErrorModal({ title, message, onClose }) {
  if (!message) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box error">
        {/* 🔸 Ikon tanda seru */}
        <div className="icon-circle error-icon">!</div>

        <h3 style={{ color: "#d62828", fontWeight: 700, marginBottom: "6px" }}>
          {title || "Error"}
        </h3>
        <p style={{ color: "#444", fontSize: "0.95rem", textAlign: "center" }}>
          {message}
        </p>

        <button
          className="btn-error-close"
          onClick={onClose}
          style={{
            marginTop: "14px",
            background: "#d62828",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "6px 16px",
            cursor: "pointer",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
