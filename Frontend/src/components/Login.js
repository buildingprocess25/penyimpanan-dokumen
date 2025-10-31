"use client";
import { useState } from "react";
import { StorageAPI } from "../utils/storage";

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");      // 🔹 pesan info jam kerja
  const [isAllowed, setIsAllowed] = useState(true); // 🔹 boleh login atau tidak

  // --- cek jam kerja saat halaman dibuka ---
  useEffect(() => {
    checkOperationalHours();
    // interval opsional agar update tiap menit
    const timer = setInterval(checkOperationalHours, 60000);
    return () => clearInterval(timer);
  }, []);

  const checkOperationalHours = () => {
    const now = new Date();

    // 🔹 Konversi ke UTC+07:00 (WIB)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000; // ubah ke UTC murni
    const wib = new Date(utc + 7 * 60 * 60000); // tambahkan 7 jam → WIB

    const hour = wib.getHours();
    const minute = wib.getMinutes();

    // 🔹 Atur batas jam operasional (06:00–18:00 WIB)
    if (hour < 6 || hour >= 18) {
      setIsAllowed(false);
      setInfo(
        `⏰ Login hanya dapat dilakukan pada jam operasional 06.00–18.00 WIB.
        Sekarang pukul ${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`
      );
    } else {
      setIsAllowed(true);
      setInfo("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      // ✅ panggil API login yang benar
      const res = await StorageAPI.login(username, password);

      if (res?.ok) {
        onSuccess?.(res.user); // panggil callback ke parent
      } else {
        throw new Error(res?.message || "Login gagal");
      }
    } catch (e) {
      console.error("Login gagal:", e);
      setErr(e.message || "Gagal login, coba lagi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,.1)",
          padding: "24px",
        }}
      >
        {/* Logo Alfamart */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <img
            src="/logoalfamart.png"
            alt="Alfamart Logo"
            style={{ height: 30, objectFit: "contain" }}
          />
        </div>

        <h2 style={{ textAlign: "center", margin: "4px 0", color: "#111" }}>
          Building & Maintenance
        </h2>
        <p style={{ textAlign: "center", margin: "0 0 25px", color: "#6b7280" }}>
          Penyimpanan Dokumen Toko
        </p>
        
        {info && (
          <div
            style={{
              background: "#fff7ed",
              color: "#b45309",
              border: "1px solid #fcd34d",
              padding: "8px 10px",
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 14,
            }}
          >
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Username </label>
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Masukkan username"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Password </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              required
            />
          </div>

          {err && (
            <div
              style={{
                background: "#fee2e2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                padding: "8px 10px",
                borderRadius: 8,
                marginBottom: 12,
                fontSize: 14,
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary-login"
            disabled={busy || !isAllowed}
            style={{
              width: "100%",
              opacity: isAllowed ? 1 : 0.6,
              cursor: isAllowed ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Memproses..." : "Login"}
          </button>

        </form>
      </div>
    </div>
  );
}
