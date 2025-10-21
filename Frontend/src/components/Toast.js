"use client";
import { useEffect } from "react";

export default function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose?.(), 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast-overlay`}>
      <div className={`toast-box ${type}`}>
        {message}
      </div>
    </div>
  );
}
