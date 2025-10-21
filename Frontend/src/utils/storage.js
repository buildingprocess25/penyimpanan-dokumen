// ============================
// 🌐 BACKEND CONNECTION
// ============================

export const BASE_URL = "http://127.0.0.1:8000"; // 🔹 ganti ke URL Render saat deploy

export const StorageAPI = {
   BASE_URL,
   
  // === Login ===
  async login(username, password) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, { // ubah juga route ke huruf kecil
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail || "Login gagal");

      // Simpan data user di localStorage
      localStorage.setItem("user", JSON.stringify(json.user));
      return json; // balikan full response, bukan cuma user
    } catch (err) {
      console.error("❌ Error login:", err);
      throw err;
    }
  },


  // === Ambil semua dokumen (filter cabang) ===
  async getDocuments(cabang) {
    try {
      const url = cabang
        ? `${BASE_URL}/documents?cabang=${encodeURIComponent(cabang)}`
        : `${BASE_URL}/documents`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Gagal ambil data dokumen dari backend");
      return await res.json();
    } catch (err) {
      console.error("❌ Error getDocuments:", err);
      throw err;
    }
  },
  

  // === Simpan dokumen baru (POST base64) ===
  async saveDocumentBase64(payload) {
    try {
      const res = await fetch(`${BASE_URL}/save-document-base64/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal simpan dokumen (POST)");
      return await res.json();
    } catch (err) {
      console.error("❌ Error saveDocumentBase64:", err);
      throw err;
    }
  },

  // === Ambil detail 1 dokumen (GET) ===
  async getDocumentByKode(kodeToko) {
    try {
      const res = await fetch(`${BASE_URL}/document/${kodeToko}`);
      if (!res.ok) throw new Error("Dokumen tidak ditemukan");
      return await res.json();
    } catch (err) {
      console.error("❌ Error getDocumentByKode:", err);
      throw err;
    }
  },

  // === Update dokumen (PUT base64) ===
  async updateDocument(kodeToko, payload) {
    try {
      const res = await fetch(`${BASE_URL}/document/${kodeToko}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal update dokumen");
      return await res.json();
    } catch (err) {
      console.error("❌ Error updateDocument:", err);
      throw err;
    }
  },

  // === Hapus dokumen ===
  async deleteDocument(kodeToko) {
    try {
      const res = await fetch(`${BASE_URL}/document/${kodeToko}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal hapus dokumen");
      return await res.json();
    } catch (err) {
      console.error("❌ Error deleteDocument:", err);
      throw err;
    }
  },
};
