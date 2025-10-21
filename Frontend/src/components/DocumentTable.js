"use client";

import { useState, useEffect } from "react";
import { StorageAPI } from "../utils/storage";

export default function DocumentTable({ onEdit }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // === Pagination & Filter ===
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const rowsPerPage = 5; // ubah sesuai kebutuhan

  // === Filter Data ===
  const filteredDocs = docs.filter((d) => {
    const kode = (d.kode_toko || d.KodeToko || "").toLowerCase();
    const nama = (d.nama_toko || d.NamaToko || "").toLowerCase();
    const term = searchTerm.toLowerCase();
    return kode.includes(term) || nama.includes(term);
  });

  const totalPages = Math.ceil(filteredDocs.length / rowsPerPage);
  const currentDocs = filteredDocs.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // === Notifikasi Toast ===
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 3000); // hilang otomatis setelah 3 detik
  }


  // === Ambil data dokumen dari backend (filter sesuai cabang user login) ===
  async function fetchDocs() {
    try {
      setLoading(true);

      // 🔹 Ambil data user dari localStorage
      const user = JSON.parse(localStorage.getItem("user"));
      const cabang = user?.cabang || "";
      const role = user?.role || "";

      // 🔹 Tentukan URL dengan filter cabang (HEAD OFFICE / admin bisa lihat semua)
      const url =
        role === "admin" || cabang.toLowerCase() === "head office"
          ? `${StorageAPI.BASE_URL}/documents`
          : `${StorageAPI.BASE_URL}/documents?cabang=${encodeURIComponent(cabang)}`;

      // 🔹 Fetch ke backend
      const res = await fetch(url);
      if (!res.ok) throw new Error("Gagal ambil data dokumen dari backend");

      const json = await res.json();
      if (json.ok && Array.isArray(json.items)) {
        setDocs(json.items);
      } else if (Array.isArray(json.items)) {
        setDocs(json.items);
      } else if (Array.isArray(json.data)) {
        setDocs(json.data);
      } else {
        setDocs([]);
      }
    } catch (err) {
      console.error("❌ Gagal ambil data:", err);
      alert("❌ Tidak bisa ambil data dari server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDocs();
  }, []);

  function formatDecimal(value) {
    if (!value) return "-";
    const str = value.toString().replace(/\D/g, "");
    if (str.length <= 2) return "0," + str.padStart(2, "0");
    const before = str.slice(0, -2);
    const after = str.slice(-2);
    return `${parseInt(before, 10)},${after}`;
  }


  // === Klik tombol Edit ===
  async function handleEdit(doc) {
    const kode = doc.KodeToko || doc.kode_toko;
    try {
      const res = await fetch(`https://dokumen-bnm-backend.onrender.com/documents/${kode}`);
      const json = await res.json();

      if (json.ok) {
        // 🔹 Tampilkan notifikasi custom
        showToast(`✅ Data ${json.data.kode_toko} berhasil dimuat ke form`);

        // 🔹 Kirim data ke App.js untuk pindah ke halaman form
        setTimeout(() => {
          onEdit && onEdit(json.data);
        }, 800); // sedikit delay supaya animasi toast terlihat
      } else {
        showToast("❌ Gagal memuat detail dokumen.");
      }
    } catch (err) {
      console.error("Gagal ambil detail:", err);
      showToast("❌ Terjadi kesalahan saat mengambil data.");
    }
  }


  // === UI tabel ===
  if (loading) return <div>⏳ Memuat data dokumen...</div>;

  return (
    <div className="table-card">
      {/* 🔍 Filter Search */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >

        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder="Cari kode atau nama toko..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          <button className="search-btn" type="button">
            🔍
          </button>
        </div>
      </div>


      {filteredDocs.length === 0 ? (
        <div className="empty">Belum ada dokumen, silahkan tambah dokumen.</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Cabang</th>
                <th>Luas Sales</th>
                <th>Luas Parkir</th>
                <th>Luas Gudang</th>
                <th>Folder Drive</th>
                {/* 👇 hanya tampilkan kolom Aksi jika bukan Head Office */}
                {user?.cabang?.toLowerCase() !== "head office" && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {currentDocs.map((d, i) => (
                <tr key={i}>
                  <td>{d.kode_toko || d.KodeToko || "-"}</td>
                  <td>{d.nama_toko || d.NamaToko || "-"}</td>
                  <td>{d.cabang || "-"}</td>
                  <td>{formatDecimal(d.luas_sales || d.LuasSales)} m²</td>
                  <td>{formatDecimal(d.luas_parkir || d.LuasParkir)} m²</td>
                  <td>{formatDecimal(d.luas_gudang || d.LuasGudang)} m²</td>
                  <td>
                    {d.folder_link ? (
                      <a
                        href={d.folder_link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        📂 Lihat Folder
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  {user?.cabang?.toLowerCase() !== "head office" && (
                  <td>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleEdit(d)}
                    >
                      ✏️ Edit
                    </button>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* === Pagination Controls === */}
          <div
            style={{
              marginTop: "14px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {/* Tombol Sebelumnya */}
            <button
              className="btn btn-sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                fontWeight: "700",
                lineHeight: "1",
                width: "34px",
                height: "34px",
                backgroundColor: "#d62828",
                color: "white",
                border: "none",
                borderRadius: "6px",
                opacity: currentPage === 1 ? 0.5 : 1,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                transition: "background 0.2s ease",
              }}
            >
              ‹
            </button>

            {/* Info Halaman */}
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              Halaman {currentPage} dari {totalPages || 1}
            </span>

            {/* Tombol Berikutnya */}
            <button
              className="btn btn-sm"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => p + 1)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                fontWeight: "700",
                lineHeight: "1",
                width: "34px",
                height: "34px",
                backgroundColor: "#d62828",
                color: "white",
                border: "none",
                borderRadius: "6px",
                opacity:
                  currentPage === totalPages || totalPages === 0 ? 0.5 : 1,
                cursor:
                  currentPage === totalPages || totalPages === 0
                    ? "not-allowed"
                    : "pointer",
                transition: "background 0.2s ease",
              }}
            >
              ›
            </button>
          </div>
        </>
      )}

      {/* 🔔 Toast Notification */}
      {toast && <div className="toast-popup">{toast}</div>}

    </div>
  );
}
