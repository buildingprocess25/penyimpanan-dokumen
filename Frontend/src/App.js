"use client";
import { useState, useEffect } from "react";
import "./App.css";
import StoreForm from "./components/StoreForm";
import DocumentTable from "./components/DocumentTable";
import Login from "./components/Login";
import Toast from "./components/Toast";
import SuccessModal from "./components/SuccessModal";
import ErrorModal from "./components/ErrorModal";
import WarningModal from "./components/WarningModal";
import AutoLogoutModal from "./components/AutoLogoutModal";

// 🔹 Komponen modal logout modern
function LogoutModal({ show, onConfirm, onCancel }) {
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>Yakin ingin logout?</h3>
        <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "20px" }}>
          Kamu akan keluar dari akun saat ini.
        </p>
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

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("list"); // "list" | "form"
  const [editingDoc, setEditingDoc] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [docs, setDocs] = useState([]);
  const [showLogout, setShowLogout] = useState(false);
  const [toast, setToast] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [warningMsg, setWarningMsg] = useState(null);

  // === Ambil daftar dokumen dari backend (filter sesuai cabang user) ===
  useEffect(() => {
    async function fetchDocs() {
      if (!user?.cabang) return; // pastikan user sudah login dan punya cabang

      try {
        // 🔹 Kirim parameter cabang ke backend
        const url = `https://penyimpanan-dokumen-s8p6.onrender.com/documents?cabang=${encodeURIComponent(user.cabang)}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.ok && Array.isArray(json.items)) {
          setDocs(json.items); // pakai json.items karena di backend kita pakai key ini
        } else {
          setDocs([]);
        }
      } catch (err) {
        console.error("❌ Gagal ambil dokumen:", err);
        setDocs([]);
      }
    }

    fetchDocs();
  }, [refreshKey, user]);

  
  // === Load user dari localStorage ===
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // 🧹 Reset halaman jika user berubah (misal dari logout lalu login user lain)
  useEffect(() => {
    if (!user) {
      setPage("list");
      setEditingDoc(null);
    }
  }, [user]);


  useEffect(() => {
    const onToast = (e) => setToast(e.detail);
    window.addEventListener("show-toast", onToast);
    return () => window.removeEventListener("show-toast", onToast);
  }, []);

  useEffect(() => {
    const onShowSuccess = (e) => {
      // ✅ hanya tampilkan notifikasi jika masih di halaman form
      if (page === "form") {
        setSuccessMsg({
          title: "Success",
          message: e.detail,
        });
        // tunggu 8 detik lalu balik ke list
        setTimeout(() => {
          setEditingDoc(null);
          setRefreshKey((k) => k + 1);
          setPage("list");
        }, 3000);
      }
    };
    window.addEventListener("show-success", onShowSuccess);
    return () => window.removeEventListener("show-success", onShowSuccess);
  }, [page]);


  useEffect(() => {
    const onShowError = (e) => {
      setErrorMsg({
        title: "Error",
        message: e.detail,
      });
    };
    window.addEventListener("show-error", onShowError);
    return () => window.removeEventListener("show-error", onShowError);
  }, []);


  useEffect(() => {
    const onShowWarning = (e) => {
      setWarningMsg({
        title: "Warning",
        message: e.detail,
      });
    };
    window.addEventListener("show-warning", onShowWarning);
    return () => window.removeEventListener("show-warning", onShowWarning);
  }, []);


  // === Logout Modal Handler ===
  const handleLogoutClick = () => setShowLogout(true);
  const confirmLogout = () => {
    // 🔹 Hapus data login
    localStorage.removeItem("user");

    // 🔹 Reset semua state agar data user lama tidak terbawa
    setUser(null);
    setPage("list");
    setEditingDoc(null);
    setDocs([]);
    setRefreshKey((k) => k + 1);

    // 🔹 Tutup modal
    setShowLogout(false);

    // 🔹 Optional: Bersihkan form dari event sebelumnya
    window.dispatchEvent(new Event("clear-previews"));
  };
  const cancelLogout = () => setShowLogout(false);

  // === Login sukses ===
  const handleLoginSuccess = () => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  };

  // === Handler dokumen tersimpan ===
  const handleSaved = () => {
    setTimeout(() => {
      setEditingDoc(null);
      setRefreshKey((k) => k + 1);
      setPage("list");
    }, 3000);
  };

  // === Handler klik edit dari tabel ===
  const handleEdit = async (doc) => {
    const kode = doc.KodeToko || doc.kode_toko;
    try {
      const res = await fetch(`https://penyimpanan-dokumen-s8p6.onrender.com/documents/${kode}`);
      const json = await res.json();

      if (json.ok) {
        setEditingDoc(json.data);
        // 🧠 Tunggu sebentar supaya state terset dulu
        setTimeout(() => setPage("form"), 100);
      } else {
        alert("❌ Gagal memuat detail dokumen.");
      }
    } catch (err) {
      console.error("❌ Gagal ambil detail:", err);
      alert("❌ Terjadi kesalahan saat mengambil data.");
    }
  };


  // === Tambah dokumen baru ===
  const handleAddNew = () => {
    setEditingDoc(null);
    setPage("form");
  };

  // === Jika belum login ===
  if (!user) return <Login onSuccess={handleLoginSuccess} />;


  // AUTO LOGOUT JIKA SUDAH LEWAT JAM 18:00 WIB
  useEffect(() => {
    if (!user) return;

    const checkSessionTimeout = () => {
      const now = new Date();

      // Ubah waktu lokal ke WIB (UTC+7)
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const wib = new Date(utc + 7 * 60 * 60000);

      const hour = wib.getHours();
      const minute = wib.getMinutes();

      // Jika sudah jam 18:00 WIB atau lebih → logout otomatis
      if (hour >= 10) {
        const currentTime = `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`;
        setWarningMsg(
          `Sesi Anda telah berakhir.\nLogin hanya dapat dilakukan pada jam operasional 06.00–18.00 WIB.\nSekarang pukul ${currentTime} WIB.`
        );
      }
    };

    // Cek langsung saat login dan tiap 1 menit sekali
    checkSessionTimeout();
    const interval = setInterval(checkSessionTimeout, 60000);
    return () => clearInterval(interval);
  }, [user]);


  // === Tampilan utama ===
  return (
    <div className="App">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-top">
          <h1>PENYIMPANAN DOKUMEN TOKO ALFAMART</h1>
        </div>
        <div className="header-bottom">
          <span className="header-left">
            Building & Maintenance —{" "}
            <strong>{user?.nama || user?.email}</strong>
          </span>
          <span className="header-center"></span>
          <button className="btn-logout" onClick={handleLogoutClick}>
            Logout
          </button>
        </div>
      </header>

      {/* HALAMAN UTAMA */}
      <main className="main-content">
        {page === "list" && (
          <section className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <h2>Daftar Dokumen</h2>
              {/* 🚫 Hanya tampilkan tombol Tambah jika bukan Head Office */}
              {user?.cabang?.toLowerCase() !== "head office" && (
              <button className="btn btn-primary add-btn" onClick={handleAddNew}>
                <img src="/plus.png" alt="Tambah" className="btn-icon" />
                Tambah Dokumen
              </button>
              )}
            </div>

            {/* ✅ Beri data & handler edit ke tabel */}
            <DocumentTable
              docs={docs}
              onEdit={handleEdit}
            />
          </section>
        )}

        {page === "form" && user && (
          <section className="card">
            <button
              className="btn btn-outline"
              onClick={() => setPage("list")}
              style={{ marginBottom: "10px" }}
            >
              ← Kembali ke Daftar
            </button>
            <StoreForm
              key={editingDoc ? editingDoc.kode_toko : "new"}
              initialData={editingDoc}
              onSaved={handleSaved}
            />
          </section>
        )}
      </main>

      {/* 🔹 Modal Logout */}
      <LogoutModal
        show={showLogout}
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />

      {toast && (
        <Toast
          message={toast}
          type="success"
          onClose={() => setToast(null)}
        />
      )}

      {successMsg && (
        <SuccessModal
          title={successMsg.title}
          message={successMsg.message}
          onClose={() => setSuccessMsg(null)}
        />
      )}

      {errorMsg && (
        <ErrorModal
          title={errorMsg.title}
          message={errorMsg.message}
          onClose={() => setErrorMsg(null)}
        />
      )}

      {warningMsg && (
        <WarningModal
          title={warningMsg.title}
          message={warningMsg.message}
          onClose={() => setWarningMsg(null)}
        />
      )}

      {/* ⚠️ Modal muncul otomatis saat jam operasional berakhir */}
      {warningMsg && (
        <AutoLogoutModal
          title={warningMsg.title}
          message={warningMsg.message}
          onClose={handleLogoutNow}
        />
      )}

    </div>
  );
}
