from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
from datetime import datetime
import gspread
import base64
import io
import json
import traceback
import os
import mimetypes
import time
import re
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request
from fastapi.responses import Response

# =========================
# KONFIGURASI GOOGLE (dari environment)
# =========================
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
SHEET_NAME = os.getenv("SHEET_NAME")
DRIVE_ROOT_ID = os.getenv("DRIVE_ROOT_ID")

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

# =========================
# UTIL AUTH OAUTH
# =========================
def load_credentials():
    if not os.path.exists("token.json"):
        raise Exception("❌ token.json tidak ditemukan. Jalankan dulu auth_google.py untuk login.")

    with open("token.json", "r") as token_file:
        creds_data = json.load(token_file)

    creds = Credentials.from_authorized_user_info(creds_data, SCOPES)

    # Refresh token jika expired
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        with open("token.json", "w") as token_file:
            token_file.write(creds.to_json())

    return creds


def get_services():
    creds = load_credentials()
    # cache_discovery=False untuk menghindari warning cache di beberapa environment
    drive_service = build("drive", "v3", credentials=creds, cache_discovery=False)
    gspread_client = gspread.authorize(creds)
    sheet_ws = gspread_client.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)
    return drive_service, sheet_ws


# =========================
# FASTAPI APP
# =========================
app = FastAPI(title="Backend Alfamart (OAuth Multi-Upload Stable)")

# ============================
# ✅ CORS FIX KHUSUS UNTUK RENDER
# ============================

# 1️⃣ Tambahkan middleware standar
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://penyimpanan-dokumen.vercel.app",
        "http://localhost:3000",
    ],
    allow_origin_regex="https://.*\\.vercel\\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2️⃣ Tambahkan middleware paksa untuk semua response
@app.middleware("http")
async def ensure_cors_headers(request: Request, call_next):
    # Jika ini adalah preflight request (OPTIONS)
    if request.method == "OPTIONS":
        return JSONResponse(
            content={"ok": True},
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "https://penyimpanan-dokumen.vercel.app",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type",
                "Access-Control-Allow-Credentials": "true",
            },
        )

    # Untuk semua response lain
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "https://penyimpanan-dokumen.vercel.app"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# =========================
# HELPERS
# =========================
def _escape_name_for_query(name: str) -> str:
    # Escape tanda petik tunggal untuk query Drive
    return name.replace("'", "\\'")


def get_or_create_folder(name: str, parent_id: str, drive_service):
    """Cek folder (by name+parent). Jika belum ada, buat baru."""
    safe_name = _escape_name_for_query(name)
    query = (
        f"name='{safe_name}' and '{parent_id}' in parents and "
        f"mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    res = drive_service.files().list(q=query, fields="files(id)").execute()
    items = res.get("files", [])
    if items:
        return items[0]["id"]

    folder_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = drive_service.files().create(body=folder_metadata, fields="id").execute()
    return folder["id"]


# MIME khusus (DWG/DXF/HEIC)
CUSTOM_MIME_MAP = {
    ".dwg": "application/acad",   # AutoCAD DWG
    ".dxf": "application/dxf",    # AutoCAD DXF
    ".heic": "image/heic",
}

def guess_mime(filename: str, provided: str | None) -> str:
    if provided:
        return provided
    ext = os.path.splitext(filename.lower())[1]
    if ext in CUSTOM_MIME_MAP:
        return CUSTOM_MIME_MAP[ext]
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


_DATA_URL_RE = re.compile(r"^data:.*?;base64,", re.IGNORECASE)

def decode_base64_maybe_with_prefix(b64_str: str) -> bytes:
    """
    Menerima base64 murni atau data URL (data:...;base64,xxxx).
    Mengembalikan raw bytes.
    """
    if not isinstance(b64_str, str):
        raise ValueError("base64 data bukan string")
    # buang prefix data URL jika ada
    cleaned = _DATA_URL_RE.sub("", b64_str.strip())
    return base64.b64decode(cleaned, validate=False)


def upload_one_file(
    drive_service,
    folder_id: str,
    filename: str,
    mime_type: str,
    raw_bytes: bytes,
    max_retry: int = 2
) -> dict:
    """
    Upload satu file (non-resumable) dengan retry ringan.
    Mengembalikan dict {'id': ..., 'webViewLink': ...}
    """
    for attempt in range(max_retry + 1):
        try:
            stream = io.BytesIO(raw_bytes)
            stream.seek(0)  # pastikan dari awal
            media = MediaIoBaseUpload(stream, mimetype=mime_type, resumable=False)
            metadata = {"name": filename, "parents": [folder_id]}

            uploaded = drive_service.files().create(
                body=metadata,
                media_body=media,
                fields="id, webViewLink, thumbnailLink, name, mimeType"
            ).execute()

            return uploaded
        except HttpError as e:
            status = getattr(e, "status_code", None)
            # Retry jika error 429 / 5xx
            if status in (429, 500, 502, 503, 504) and attempt < max_retry:
                time.sleep(0.8 * (attempt + 1))
                continue
            raise
        finally:
            # jeda kecil antar upload untuk stabilitas batch
            time.sleep(0.25)


# =========================
# ROUTES
# =========================
@app.get("/")
def root():
    return {"message": "✅ Backend Alfamart (OAuth Multi-Upload) aktif!"}


@app.post("/auth/login")
async def login(request: Request):
    """
    Login berdasarkan EMAIL_SAT (username) dan CABANG (password)
    Hanya jabatan tertentu yang diizinkan login.
    """
    try:
        data = await request.json()
        username = data.get("username", "").strip().lower()
        password = data.get("password", "").strip().upper()

        # === Validasi awal ===
        if not username or not password:
            return JSONResponse(
                {"ok": False, "detail": "Username dan password wajib diisi."},
                status_code=400,
                headers={"Access-Control-Allow-Origin": "*"},
            )

        # === Ambil data dari Sheet "Cabang" ===
        drive_service, _ = get_services()
        gc = gspread.authorize(load_credentials())
        ws = gc.open_by_key(SPREADSHEET_ID).worksheet("Cabang")
        records = ws.get_all_records()

        allowed_roles = [
            "BRANCH BUILDING SUPPORT",
            "BRANCH BUILDING COORDINATOR",
        ]

        # === Proses autentikasi ===
        for row in records:
            email = str(row.get("EMAIL_SAT", "")).strip().lower()
            jabatan = str(row.get("JABATAN", "")).strip().upper()
            cabang = str(row.get("CABANG", "")).strip().upper()
            nama = str(row.get("NAMA LENGKAP", "")).strip()

            if email == username and password == cabang:
                if jabatan in allowed_roles:
                    return JSONResponse(
                        {
                            "ok": True,
                            "user": {
                                "email": email,
                                "nama": nama,
                                "jabatan": jabatan,
                                "cabang": cabang,
                            },
                        },
                        headers={"Access-Control-Allow-Origin": "*"},
                    )
                else:
                    return JSONResponse(
                        {"ok": False, "detail": "Jabatan tidak diizinkan."},
                        status_code=403,
                        headers={"Access-Control-Allow-Origin": "*"},
                    )

        # === Jika tidak ditemukan ===
        return JSONResponse(
            {"ok": False, "detail": "Email atau password salah."},
            status_code=401,
            headers={"Access-Control-Allow-Origin": "*"},
        )

    except Exception as e:
        # Tangkap semua error tak terduga
        print(f"⚠️ Error login: {e}")
        return JSONResponse(
            {"ok": False, "detail": f"Terjadi kesalahan server: {e}"},
            status_code=500,
            headers={"Access-Control-Allow-Origin": "*"},
        )


@app.get("/documents")
def list_documents(cabang: Optional[str] = Query(None)):
    try:
        _, SHEET = get_services()
        data = SHEET.get_all_records()

        # Normalisasi kolom agar tidak masalah dengan kapitalisasi
        for row in data:
            # ubah key-key yang ada menjadi lowercase semua
            for k in list(row.keys()):
                row[k.lower()] = row.pop(k)

        # Jika user kirim filter cabang
        if cabang:
            cabang_lower = cabang.strip().lower()
            filtered = [r for r in data if r.get("cabang", "").strip().lower() == cabang_lower]
        else:
            filtered = data

        return {"ok": True, "items": filtered}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membaca spreadsheet: {e}")


@app.post("/save-document-base64/")
async def save_document_base64(request: Request):
    """
    Payload JSON:
    {
      "kode_toko": "N13L",
      "nama_toko": "SUNGAI",
      "cabang": "HEAD OFFICE",
      "luas_sales": "120,5",
      "luas_parkir": "30,5",
      "luas_gudang": "20,5",
      "files": [
        { "category": "fotoAsal", "filename": "foto1.jpg", "type": "image/jpeg", "data": "<base64>" },
        ...
      ]
    }
    """
    try:
        payload = await request.json()

        kode_toko = payload.get("kode_toko")
        nama_toko = payload.get("nama_toko")
        cabang = payload.get("cabang")
        luas_sales = payload.get("luas_sales", "")
        luas_parkir = payload.get("luas_parkir", "")
        luas_gudang = payload.get("luas_gudang", "")
        files = payload.get("files", [])

        if not all([kode_toko, nama_toko, cabang]):
            raise HTTPException(status_code=400, detail="Data toko belum lengkap.")

        # === 1️⃣ Ambil layanan Drive & Sheet ===
        drive_service, SHEET = get_services()

        # === 2️⃣ Validasi kode_toko unik sebelum proses upload ===
        try:
            existing_records = SHEET.get_all_records()
            for row in existing_records:
                existing_code = str(row.get("kode_toko") or row.get("KodeToko") or "").strip().upper()
                if existing_code == kode_toko.strip().upper():
                    raise HTTPException(
                        status_code=400,
                        detail=f"Kode toko '{kode_toko}' sudah terdaftar."
                    )
        except HTTPException:
            raise
        except Exception as e:
            print(f"⚠️ Gagal membaca spreadsheet untuk validasi duplikat: {e}")

        # === 3️⃣ Lanjutkan proses upload ke Drive ===
        cabang_folder = get_or_create_folder(cabang, DRIVE_ROOT_ID, drive_service)
        toko_folder_name = f"{kode_toko}_{nama_toko}".replace("/", "-")
        toko_folder = get_or_create_folder(toko_folder_name, cabang_folder, drive_service)

        category_folders: dict[str, str] = {}
        file_links: list[str] = []
        kategori_log: dict[str, dict] = {}

        for idx, f in enumerate(files, start=1):
            category = (f.get("category") or "lainnya").strip() or "lainnya"
            if category not in category_folders:
                category_folders[category] = get_or_create_folder(category, toko_folder, drive_service)
                kategori_log[category] = {"total": 0, "sukses": 0}
            kategori_log[category]["total"] += 1

            category_folder_id = category_folders[category]
            filename = f.get("filename") or f"file_{idx}"
            mime_type = guess_mime(filename, f.get("type"))

            # Decode base64
            try:
                raw = decode_base64_maybe_with_prefix(f.get("data") or "")
            except Exception as e:
                print(f"⚠️ Gagal decode base64 untuk {filename}: {e}")
                continue

            try:
                uploaded = upload_one_file(
                    drive_service=drive_service,
                    folder_id=category_folder_id,
                    filename=filename,
                    mime_type=mime_type,
                    raw_bytes=raw,
                    max_retry=2
                )

                file_id = uploaded.get("id")
                link = uploaded.get("webViewLink")
                thumb = uploaded.get("thumbnailLink")

                # Set permission publik
                if file_id:
                    try:
                        drive_service.permissions().create(
                            fileId=file_id,
                            body={"type": "anyone", "role": "reader"},
                            fields="id"
                        ).execute()
                    except Exception as perm_err:
                        print(f"⚠️ Tidak bisa set permission publik untuk {filename}: {perm_err}")

                # Bentuk direct link
                direct_link = ""
                if link:
                    fid = link.split("/d/")[-1].split("/")[0]
                    direct_link = f"https://drive.google.com/uc?export=view&id={fid}"
                elif thumb:
                    direct_link = thumb

                if direct_link:
                    file_links.append(f"{category}|{filename}|{direct_link}")
                    kategori_log[category]["sukses"] += 1
                    print(f"✅ Uploaded: {filename} → {category}")
                else:
                    print(f"⚠️ {filename} diunggah tetapi tidak memiliki link valid.")
            except Exception as e:
                print(f"❌ Gagal upload {filename} → {category}: {e}")

        print("\n========== HASIL UPLOAD ==========")
        for cat, info in kategori_log.items():
            print(f"📂 {cat}: {info['sukses']}/{info['total']} sukses")
        print("=================================\n")

        # === 4️⃣ Simpan metadata ke Sheet ===
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        SHEET.append_row([
            kode_toko,
            nama_toko,
            cabang,
            luas_sales,
            luas_parkir,
            luas_gudang,
            f"https://drive.google.com/drive/folders/{toko_folder}",
            ", ".join(file_links),
            now,
        ])

        return {
            "ok": True,
            "message": f"✅ {len(file_links)} file berhasil diunggah ke Google Drive",
            "folder_link": f"https://drive.google.com/drive/folders/{toko_folder}",
            "files_uploaded": len(file_links),
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        print("=== ERROR DETAIL ===")
        traceback.print_exc()
        print("====================")
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan dokumen: {e}")


@app.put("/document/{kode_toko}")
async def update_document(kode_toko: str, request: Request):
    """
    Update data toko + file baru ke folder yang sama di Google Drive.
    - Jika `files` dikirim kosong → hanya update data teks (nama, luas, dsb).
    - Jika `files` berisi file baru → file lama dihapus dan diganti di Drive.
    """
    try:
        data = await request.json()
        files = data.get("files", [])

        drive_service, SHEET = get_services()

        # Cari baris data toko di spreadsheet
        records = SHEET.get_all_records()
        row_index = next(
            (i + 2 for i, r in enumerate(records)
             if str(r.get("kode_toko", "")).strip() == str(kode_toko).strip()),
            None
        )
        if not row_index:
            raise HTTPException(status_code=404, detail="Data tidak ditemukan di spreadsheet.")

        # Ambil link folder lama dari sheet
        old_folder_link = records[row_index - 2].get("folder_link")
        if not old_folder_link or "folders/" not in old_folder_link:
            raise HTTPException(status_code=400, detail="Folder Drive lama tidak ditemukan.")
        toko_folder_id = old_folder_link.split("folders/")[-1]

        # ============ 🔹 Hapus file lama yang tidak ada lagi di data.files ============
        # Dapatkan semua file di folder toko
        existing_files = drive_service.files().list(
            q=f"'{toko_folder_id}' in parents and trashed = false",
            fields="files(id, name, parents)"
        ).execute().get("files", [])

        existing_names = {f["name"] for f in existing_files}
        new_names = {f.get("filename") for f in files if f.get("filename")}

        # Hapus file yang tidak ada di files[] (berarti dihapus oleh user)
        to_delete = [f for f in existing_files if f["name"] not in new_names]

        for f in to_delete:
            try:
                drive_service.files().delete(fileId=f["id"]).execute()
                print(f"🗑️ Hapus file lama: {f['name']}")
            except Exception as del_err:
                print(f"⚠️ Gagal hapus {f['name']}: {del_err}")

        # ============ 🔹 Upload file baru (jika ada) ============
        file_links = []  # format: kategori|nama|link
        kategori_log = {}
        category_folders = {}

        for idx, f in enumerate(files, start=1):
            category = (f.get("category") or "pendukung").strip() or "pendukung"
            if category not in category_folders:
                category_folders[category] = get_or_create_folder(category, toko_folder_id, drive_service)
                kategori_log[category] = {"total": 0, "sukses": 0}
            kategori_log[category]["total"] += 1

            filename = f.get("filename") or f"file_{idx}"
            mime_type = guess_mime(filename, f.get("type"))

            # Decode base64
            try:
                raw = decode_base64_maybe_with_prefix(f.get("data") or "")
            except Exception as e:
                print(f"⚠️ Gagal decode base64 untuk {filename}: {e}")
                continue

            try:
                uploaded = upload_one_file(
                    drive_service=drive_service,
                    folder_id=category_folders[category],
                    filename=filename,
                    mime_type=mime_type,
                    raw_bytes=raw,
                    max_retry=2
                )

                # Ambil ID file dan link
                file_id = uploaded.get("id")
                link = uploaded.get("webViewLink")
                thumb = uploaded.get("thumbnailLink")

                # Ubah ke direct link untuk <img>
                direct_link = ""
                if link:
                    file_id = link.split("/d/")[-1].split("/")[0]
                    direct_link = f"https://drive.google.com/uc?export=view&id={file_id}"
                elif thumb:
                    direct_link = thumb

                # Coba ubah permission jadi publik
                if file_id:
                    try:
                        drive_service.permissions().create(
                            fileId=file_id,
                            body={"type": "anyone", "role": "reader"},
                            fields="id"
                        ).execute()
                    except Exception as perm_err:
                        print(f"⚠️ Gagal set permission publik untuk {filename}: {perm_err}")

                # Simpan hasil ke list
                if direct_link:
                    file_links.append(f"{category}|{filename}|{direct_link}")
                    kategori_log[category]["sukses"] += 1
                    print(f"✅ Uploaded: {filename} → {category}")
                else:
                    print(f"⚠️ Tidak ada link untuk {filename}")

            except Exception as e:
                print(f"❌ Gagal upload {filename} → {category}: {e}")

        # ===== Log upload hasil =====
        if kategori_log:
            print("\n========== HASIL UPLOAD (UPDATE) ==========")
            for cat, info in kategori_log.items():
                print(f"📂 {cat}: {info['sukses']}/{info['total']} sukses")
            print("===========================================\n")

        # ===== Update baris spreadsheet =====
        final_file_links = ", ".join(file_links) if file_links else ""
        SHEET.update(
            f"A{row_index}:I{row_index}",
            [[
                data.get("kode_toko", ""),
                data.get("nama_toko", ""),
                data.get("cabang", ""),
                data.get("luas_sales", ""),
                data.get("luas_parkir", ""),
                data.get("luas_gudang", ""),
                old_folder_link,
                final_file_links,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ]]
        )

        return {
            "ok": True,
            "message": "✅ Dokumen & file berhasil diperbarui di Drive.",
            "folder_link": old_folder_link,
            "files_uploaded": len(file_links),
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gagal update dokumen: {e}")


@app.delete("/document/{kode_toko}")
async def delete_document(kode_toko: str):
    try:
        drive_service, SHEET = get_services()
        records = SHEET.get_all_records()
        row_index = next(
            (i + 2 for i, r in enumerate(records) if str(r.get("kode_toko", "")).strip() == str(kode_toko).strip()),
            None
        )
        if not row_index:
            raise HTTPException(status_code=404, detail="Data tidak ditemukan.")

        # hapus folder di Drive jika ada
        folder_link = records[row_index - 2].get("folder_link")
        if folder_link and "folders/" in folder_link:
            folder_id = folder_link.split("folders/")[-1]
            try:
                drive_service.files().delete(fileId=folder_id).execute()
            except Exception as e:
                print("⚠️ Gagal hapus folder di Drive:", e)

        SHEET.delete_rows(row_index)
        return {"ok": True, "message": "🗑️ Dokumen berhasil dihapus."}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gagal hapus: {e}")


@app.get("/documents/{kode_toko}")
def get_documents(kode_toko: str):
    try:
        _, SHEET = get_services()
        records = SHEET.get_all_records()
        found = next(
            (r for r in records if str(r.get("kode_toko", "")).strip() == str(kode_toko).strip()),
            None
        )
        if not found:
            raise HTTPException(status_code=404, detail="Data tidak ditemukan.")
        return {"ok": True, "data": found}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal ambil data: {e}")