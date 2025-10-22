"use client";
import { useState, useEffect } from "react";
import UploadSection from "./UploadSection";

export default function StoreForm({ initialData = null, onSaved = () => {} }) {
  const [form, setForm] = useState({
    kodeToko: "",
    namaToko: "",
    luasSales: "",
    luasParkir: "",
    luasGudang: "",
    isEditing: false,
  });

  const [errors, setErrors] = useState({});
  const [files, setFiles] = useState({
    fotoAsal: [],
    fotoRenovasi: [],
    me: [],
    sipil: [],
    sketsaAwal: [],
    pendukung: [],
  });
  const [existingFiles, setExistingFiles] = useState([]); // 🔹 Simpan file lama (Drive)
  const [saving, setSaving] = useState(false);

  // 🔹 Format angka 10000 → 100,00
  function formatDecimal(value) {
    if (!value) return "";
    const str = value.toString().replace(/\D/g, ""); // hapus non-digit
    if (str.length <= 2) return "0," + str.padStart(2, "0");
    const before = str.slice(0, -2);
    const after = str.slice(-2);
    return `${parseInt(before, 10)},${after}`;
  }


  // 🧠 Load data awal dari props (mode edit)
  useEffect(() => {
    if (initialData) {
      // === 1️⃣ Isi form dasar ===
      setForm({
        kodeToko: initialData.kode_toko || "",
        namaToko: initialData.nama_toko || "",
        luasSales: formatDecimal(initialData.luas_sales),
        luasParkir: formatDecimal(initialData.luas_parkir),
        luasGudang: formatDecimal(initialData.luas_gudang),
        isEditing: true,
      });

      // === 2️⃣ Bersihkan preview lama & tampilkan file lama ===
      window.dispatchEvent(new Event("clear-previews"));

      const fileLinks = initialData.file_links;
      if (fileLinks) {
        const entries = fileLinks.split(",").map(s => s.trim()).filter(Boolean);
        const buckets = {
          fotoAsal: [],
          fotoRenovasi: [],
          me: [],
          sipil: [],
          sketsaAwal: [],
          pendukung: [],
        };
        const oldFiles = [];

        entries.forEach((entry) => {
          const parts = entry.split("|");
          let category = "pendukung", name = "", url = "";
          if (parts.length === 3) [category, name, url] = parts;
          else if (parts.length === 2) [name, url] = parts;
          else url = entry;

          category = (category || "").trim();
          name = (name || "").trim();
          url = (url || "").trim();
          if (!buckets[category]) category = "pendukung";

          const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(name);
          const fileData = {
            category,
            name: name || url.split("/").pop(),
            url,
            type: isImage ? "image" : "file",
          };

          buckets[category].push(fileData);
          oldFiles.push({ category, name: fileData.name, url }); // simpan di state
        });

        setExistingFiles(oldFiles);

        // === Kirim preview lama ke UploadSection ===
        Object.entries(buckets).forEach(([cat, files]) => {
          if (files.length) {
            window.dispatchEvent(
              new CustomEvent("load-existing-previews", {
                detail: { category: cat, files },
              })
            );
          }
        });
      }
    }
  }, [initialData]);

  // 🔹 User info
  const user = JSON.parse(localStorage.getItem("user")) || {};

  // 🔹 Helper update field
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // 🔹 Format input angka (xxx,xx)
  const formatLuasInput = (value) => {
    let cleanValue = value.replace(/[^0-9,]/g, "");
    const parts = cleanValue.split(",");
    let integerPart = parts[0].slice(0, 3);
    if (parts.length > 1) {
      let decimalPart = parts[1].slice(0, 2);
      return `${integerPart},${decimalPart}`;
    }
    return integerPart;
  };

  // 🔹 Validasi
  const validate = () => {
    const e = {};
    const luasRegex = /^\d{1,3},\d{2}$/;

    if (!/^[A-Za-z0-9]{4}$/.test(form.kodeToko))
      e.kodeToko = "Kode toko harus 4 digit alfanumerik";
    if (!/^[A-Za-z0-9\s]+$/.test(form.namaToko))
      e.namaToko = "Nama toko hanya huruf/angka/spasi";
    if (!luasRegex.test(form.luasSales))
      e.luasSales = "Contoh: 120,50 / 80,00 / 1,00";
    if (!luasRegex.test(form.luasParkir))
      e.luasParkir = "Contoh: 120,50 / 80,00 / 1,00";
    if (!luasRegex.test(form.luasGudang))
      e.luasGudang = "Contoh: 120,50 / 80,00 / 1,00";

    return e;
  };

  // 🔹 Hapus file baru dari preview
  useEffect(() => {
    const onDelete = (e) => {
      const { category, index, file } = e.detail || {};
      if (!category || index == null) return;

      // Hapus file baru
      setFiles((prev) => {
        const arr = [...(prev[category] || [])];
        arr.splice(index, 1);
        return { ...prev, [category]: arr };
      });

      // Hapus file lama
      setExistingFiles((prev) => {
        if (!file?.name && !file?.url) return prev; // tidak tahu file mana
        return prev.filter(
          (f) =>
            !(
              f.category === category &&
              (f.name === file.name || f.url === file.url)
            )
        );
      });
    };

    window.addEventListener("delete-file", onDelete);
    return () => window.removeEventListener("delete-file", onDelete);
  }, []);


  // 🔹 Submit utama
  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const errorsFound = validate();
    setErrors(errorsFound);
    if (Object.keys(errorsFound).length > 0) {
      window.dispatchEvent(
        new CustomEvent("show-error", {
          detail: "⚠️ Periksa kembali inputan yang belum valid.",
        })
      );
      setSaving(false);
      return;
    }

    try {
      // === 1️⃣ Gabungkan file lama + file baru (agar tidak kehilangan file size di Drive) ===
      let allFiles = [];

      for (const [category, fileArr] of Object.entries(files)) {
        const converted = await Promise.all(
          fileArr.map(async (file) => {
            // ✅ Jika file lama (sudah punya url & bukan file baru)
            if (file.url && !file.data) {
              return {
                category,
                filename: file.name || file.url.split("/").pop(),
                url: file.url,
                keepExisting: true, // tandai sebagai file lama
              };
            }

            // ✅ Jika file baru — ubah ke base64
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  category,
                  filename: file.name,
                  type: file.type,
                  data: reader.result.split(",")[1],
                });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          })
        );

        allFiles = allFiles.concat(converted);
      }

      // ✅ Tambahkan file lama dari existingFiles (yang sudah tersimpan sebelumnya)
      const mergedFiles = [
        ...existingFiles.map((f) => ({
          category: f.category,
          filename: f.name,
          url: f.url,
          keepExisting: true,
        })),
        ...allFiles,
      ];

      // === 2️⃣ Siapkan payload lengkap ===
      const payload = {
        kode_toko: form.kodeToko,
        nama_toko: form.namaToko,
        cabang: user?.cabang || "UNKNOWN",
        luas_sales: form.luasSales,
        luas_parkir: form.luasParkir,
        luas_gudang: form.luasGudang,
        files: mergedFiles,
      };

      // === 3️⃣ Endpoint Render ===
      const BASE_URL =
        process.env.NEXT_PUBLIC_API_URL ||
        "https://penyimpanan-dokumen-s8p6.onrender.com";

      const url = form.isEditing
        ? `${BASE_URL}/document/${form.kodeToko}`
        : `${BASE_URL}/save-document-base64/`;

      const method = form.isEditing ? "PUT" : "POST";

      console.log(`📤 ${method} ke ${url}`, payload);

      // === 4️⃣ Kirim ke backend ===
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      console.log("📥 Response:", json);

      // === 5️⃣ Hasil ===
      if (json?.ok) {
        const msg = form.isEditing
          ? json.message || "✅ Dokumen berhasil diperbarui!"
          : json.message || "✅ Dokumen berhasil disimpan!";

        // ✅ Notifikasi sukses
        window.dispatchEvent(new CustomEvent("show-success", { detail: msg }));

        // ✅ Reset form & preview
        window.dispatchEvent(new Event("clear-previews"));
        setForm({
          kodeToko: "",
          namaToko: "",
          luasSales: "",
          luasParkir: "",
          luasGudang: "",
          isEditing: false,
        });
        setFiles({
          fotoAsal: [],
          fotoRenovasi: [],
          me: [],
          sipil: [],
          sketsaAwal: [],
          pendukung: [],
        });
        setExistingFiles([]);
        setErrors({});
        onSaved(json);
      } else {
        // 🔹 Tampilkan pesan error dari backend (contoh: file duplikat)
        const msg =
          json?.message ||
          "❌ Gagal menyimpan dokumen (kode toko mungkin sudah terdaftar).";

        // 🔹 Ganti alert dengan modal error
        window.dispatchEvent(new CustomEvent("show-error", { detail: msg }));
      }
    } catch (err) {
      console.error("🔥 Error saat upload:", err);
      window.dispatchEvent(
        new CustomEvent("show-error", { detail: "❌ Gagal menghubungi server!" })
      );
    } finally {
      setSaving(false);
    }
  };


  const ErrMsg = (key) =>
    errors[key] ? <div className="error">{errors[key]}</div> : null;

  return (
    <form className="store-form" onSubmit={onSubmit} noValidate>
      <h3 className="section-title">
        {form.isEditing ? "Edit Data Toko" : "Data Toko"}
      </h3>
      <div className="grid">
        <div className="field">
          <label>Cabang</label>
          <input
            type="text"
            className="input"
            value={user?.cabang || ""}
            readOnly
          />
        </div>

        <div className="field">
          <label>Kode Toko</label>
          <input
            className="input"
            type="text"
            maxLength={4}
            placeholder="AB12"
            value={form.kodeToko}
            onChange={(e) =>
              setField(
                "kodeToko",
                e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
              )
            }
            readOnly={form.isEditing}
          />
          {ErrMsg("kodeToko")}
        </div>

        <div className="field">
          <label>Nama Toko</label>
          <input
            className="input"
            type="text"
            placeholder="ALFAMART SUDIRMAN"
            value={form.namaToko}
            onChange={(e) =>
              setField(
                "namaToko",
                e.target.value.toUpperCase().replace(/[^A-Z0-9\s]/g, "")
              )
            }
          />
          {ErrMsg("namaToko")}
        </div>

        <div className="field">
          <label>Sales (m²)</label>
          <input
            className="input"
            value={form.luasSales}
            onChange={(e) =>
              setField("luasSales", formatLuasInput(e.target.value))
            }
            placeholder="120,50"
          />
          {ErrMsg("luasSales")}
        </div>

        <div className="field">
          <label>Parkir (m²)</label>
          <input
            className="input"
            value={form.luasParkir}
            onChange={(e) =>
              setField("luasParkir", formatLuasInput(e.target.value))
            }
            placeholder="80,00"
          />
          {ErrMsg("luasParkir")}
        </div>

        <div className="field">
          <label>Gudang (m²)</label>
          <input
            className="input"
            value={form.luasGudang}
            onChange={(e) =>
              setField("luasGudang", formatLuasInput(e.target.value))
            }
            placeholder="30,25"
          />
          {ErrMsg("luasGudang")}
        </div>
      </div>

      <h3 className="section-title">
        {form.isEditing
          ? "Tambah Dokumen Baru (opsional)"
          : "Upload Dokumen & Foto"}
      </h3>
      <UploadSection
        onFilesChange={(cat, fileList) => {
          const arr = Array.from(fileList || []);
          setFiles((prev) => ({
            ...prev,
            [cat]: [...(prev[cat] || []), ...arr],
          }));
        }}
      />

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving
            ? "Menyimpan..."
            : form.isEditing
            ? "Perbarui Dokumen"
            : "Simpan Dokumen"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setForm({
              kodeToko: "",
              namaToko: "",
              luasSales: "",
              luasParkir: "",
              luasGudang: "",
              isEditing: false,
            });
            setFiles({
              fotoAsal: [],
              fotoRenovasi: [],
              me: [],
              sipil: [],
              sketsaAwal: [],
              pendukung: [],
            });
            setExistingFiles([]);
            setErrors({});
            window.dispatchEvent(new Event("clear-previews"));
          }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
