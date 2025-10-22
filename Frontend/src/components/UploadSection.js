"use client";
import { useState, useEffect } from "react";

export default function UploadSection({ onFilesChange = () => {} }) {
  const [previews, setPreviews] = useState({});

  // === Listener: load file lama dari Drive ===
  useEffect(() => {
    const loadExisting = (e) => {
      const { category, files, reset } = e.detail || {};
      if (!category || !files) return;

      // 🧹 Jika reset=true → hapus semua preview lama sebelum load baru
      setPreviews((prev) => {
        if (reset) {
          return {
            [category]: mapFilesToPreview(files),
          };
        }

        // 🚀 Jika tidak reset, tambahkan ke kategori lama (misal tambah dokumen)
        return {
          ...prev,
          [category]: [...(prev[category] || []), ...mapFilesToPreview(files)],
        };
      });
    };

    // 🔧 Helper function untuk mapping file → preview format
    const mapFilesToPreview = (files) => {
      return files.map((f) => {
        // Ambil nama file dari objek atau URL
        const fileName =
          f.name?.replace(/\?.*$/, "") ||
          decodeURIComponent(f.url.split("/").pop().split("?")[0]);

        // Coba ambil ID Drive (jika link Google Drive)
        let fileId = null;
        const match = f.url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
        if (match && match[1]) fileId = match[1];

        // 🔗 Bentuk direct link (prioritas uc?export=view)
        let directUrl = f.thumbnail || f.url;
        if (fileId) directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

        // Deteksi apakah file ini gambar
        const ext = fileName.split(".").pop().toLowerCase();
        const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext);

        return {
          name: fileName,
          type: isImage ? "image" : "file",
          url: directUrl,
        };
      });
    };

    // Listener event global
    window.addEventListener("load-existing-previews", loadExisting);
    return () => window.removeEventListener("load-existing-previews", loadExisting);
  }, []);

  
  // === Reset preview saat form direset ===
  useEffect(() => {
    const clear = () => setPreviews({});
    window.addEventListener("clear-previews", clear);
    return () => window.removeEventListener("clear-previews", clear);
  }, []);


  // === Handle Upload Baru ===
  const handleFiles = async (category, files) => {
    const arr = Array.from(files || []);

    // === 🚫 Deteksi duplikat berdasarkan nama file di kategori yang sama ===
    setPreviews((prev) => {
      const existingNames = (prev[category] || []).map((f) => f.name.toLowerCase());
      const duplicates = arr.filter((f) => existingNames.includes(f.name.toLowerCase()));

      if (duplicates.length > 0) {
        // 🔔 Tampilkan notifikasi
        window.dispatchEvent(
          new CustomEvent("show-toast", {
            detail: "⚠️ Tidak boleh upload file duplikat pada kategori ini!",
          })
        );
        return prev; // ❌ Tidak lanjut update preview
      }

      // === Lanjutkan hanya jika tidak ada duplikat ===
      const imageFiles = arr.filter((f) => f.type.startsWith("image/"));
      const otherFiles = arr.filter((f) => !f.type.startsWith("image/"));

      const previewPromises = imageFiles.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                type: "image",
                url: reader.result,
              });
            reader.readAsDataURL(file);
          })
      );

      // Tambahkan file non-image
      return (async () => {
        const previewUrls = await Promise.all(previewPromises);
        const nonImagePreviews = otherFiles.map((f) => ({
          name: f.name,
          type: "file",
          url: "",
        }));

        // Gabungkan file baru ke kategori
        const updated = {
          ...prev,
          [category]: [...(prev[category] || []), ...previewUrls, ...nonImagePreviews],
        };

        // Beritahu parent (misal StoreForm) bahwa file berubah
        onFilesChange(category, arr);
        return updated;
      })();
    });
  };

  // === Hapus File ===
  const handleDelete = (category, idx) => {
    setPreviews((prev) => {
      const updated = { ...prev };
      const deletedFile = prev[category][idx]; // ambil file yang dihapus
      updated[category] = prev[category].filter((_, i) => i !== idx);

      // Kirim event ke StoreForm agar sinkron
      window.dispatchEvent(
        new CustomEvent("delete-file", {
          detail: { category, index: idx, file: deletedFile },
        })
      );

      return updated;
    });
  };


  // === Baris Upload per Kategori ===
  const FileRow = ({ label, category, accept, note }) => (
    <div className="file-row" style={{ marginBottom: "16px" }}>
      <label className="file-label" style={{ fontWeight: 600 }}>
        {label}
      </label>
      <input
        className="file-input"
        type="file"
        accept={accept}
        multiple
        onChange={(e) => handleFiles(category, e.target.files)}
      />
      {note && <div className="helper-text">{note}</div>}

      {/* === Preview Dokumen === */}
      {previews[category] && previews[category].length > 0 && (
        <div
          className="preview-grid"
          style={{
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {previews[category].map((item, idx) => {
            // 🔹 Deteksi file lama dari Drive
            const isDriveLink =
              item.url?.startsWith("https://drive.google.com/") ||
              item.url?.includes("folders/");

            // 🔹 Deteksi file gambar dari ekstensi
            const ext = item.name?.split(".").pop()?.toLowerCase() || "";
            const isImageExt = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext);

            return (
              <div
                key={idx}
                className="preview-thumb-container"
                style={{ position: "relative", textAlign: "center" }}
              >
                {/* Tombol Hapus */}
                <button
                  onClick={() => handleDelete(category, idx)}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    background: "#d62828",
                    color: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: "18px",
                  }}
                  title="Hapus file ini"
                >
                  ✕
                </button>

                {/* Kondisi: 
                    - File baru upload (base64) => tampil gambar preview
                    - File lama (Drive link) => tampil icon picture
                */}
                {item.type === "image" && !isDriveLink ? (
                  <>
                    <img
                      src={item.url}
                      alt={item.name}
                      style={{
                        width: 100,
                        height: 100,
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "0.8em",
                        color: "#555",
                        marginTop: 4,
                        width: 100,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </div>
                  </>
                ) : (
                  // 🔸 Mode edit: tampilkan icon sesuai jenis file
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      border: "1px dashed #aaa",
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#f9f9f9",
                    }}
                  >
                    {/* Ganti icon 📄 → 📷 jika gambar */}
                    <span style={{ fontSize: "1.5em" }}>
                      {isImageExt ? "📷" : "📄"}
                    </span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginTop: 4,
                        fontSize: "0.75em",
                        color: "#007bff",
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "90px",
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );

  return (
    <div className="upload-section">
      {/* === BAGIAN FOTO === */}
      <div
        className={`subpanel foto-panel`}
        tabIndex={0} // agar bisa fokus saat diklik/tab
        onFocus={(e) => e.currentTarget.classList.add("focused")}
        onBlur={(e) => e.currentTarget.classList.remove("focused")}
      >
        <div className="subpanel-title">a) Foto</div>
        <FileRow
          label="Foto dokumentasi ASAL (JPEG/PNG)"
          category="fotoAsal"
          accept=".jpeg,.jpg,.png"
          note="Upload beberapa foto kondisi awal toko"
        />
        <FileRow
          label="Foto dokumentasi RENOVASI (JPEG/PNG)"
          category="fotoRenovasi"
          accept=".jpeg,.jpg,.png"
          note="Upload beberapa foto kondisi renovasi"
        />
      </div>

      {/* === BAGIAN GAMBAR === */}
      <div
        className={`subpanel gambar-panel`}
        tabIndex={0}
        onFocus={(e) => e.currentTarget.classList.add("focused")}
        onBlur={(e) => e.currentTarget.classList.remove("focused")}
      >
        <div className="subpanel-title">b) Gambar</div>
        <FileRow
          label="ME (PDF, AutoCAD, JPEG)"
          category="me"
          accept=".pdf,.dwg,.dxf,.jpeg,.jpg,.png"
        />
        <FileRow
          label="Sipil (PDF, AutoCAD, JPEG)"
          category="sipil"
          accept=".pdf,.dwg,.dxf,.jpeg,.jpg,.png"
        />
        <FileRow
          label="Sketsa Awal (PDF, AutoCAD, JPEG)"
          category="sketsaAwal"
          accept=".pdf,.dwg,.dxf,.jpeg,.jpg,.png"
        />
      </div>

      {/* === BAGIAN DOKUMEN PENDUKUNG === */}
      <div
        className={`subpanel dokumen-panel`}
        tabIndex={0}
        onFocus={(e) => e.currentTarget.classList.add("focused")}
        onBlur={(e) => e.currentTarget.classList.remove("focused")}
      >
        <div className="subpanel-title">
          c) Dokumen Pendukung (NIOI, SLO, dll.)
        </div>
        <FileRow
          label="Dokumen Pendukung (PDF/JPEG/PNG)"
          category="pendukung"
          accept=".pdf,.jpeg,.jpg,.png"
          note="Upload beberapa dokumen tambahan (misal sertifikat, SLO, NIOI)"
        />
      </div>
    </div>
  );
}
