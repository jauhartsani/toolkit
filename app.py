"""
ToolkitMe Downloader API
------------------------
Backend nyata untuk endpoint /api/extract, memakai yt-dlp untuk mengekstrak
link video/audio langsung (bukan simulasi) dari TikTok, Instagram, Facebook,
X, dan YouTube.

Jalankan lokal:
    pip install -r requirements.txt
    uvicorn app:app --host 0.0.0.0 --port 8000

Endpoint:
    POST /api/extract   body: {"url": "https://www.tiktok.com/@user/video/123..."}

Catatan penting:
- Server ini butuh koneksi internet keluar ke TikTok/Instagram/Facebook/X/
  YouTube saat berjalan (tidak seperti sandbox pembuatan kode ini).
- yt-dlp perlu di-update berkala (`pip install -U yt-dlp`) karena platform
  sosial sering mengubah struktur halaman mereka.
- Untuk Instagram, sebagian konten (Story, akun privat) butuh cookie login;
  lihat opsi `cookiefile` di bawah kalau kamu ingin mendukung itu.
- Hormati Terms of Service tiap platform dan hanya proses konten publik.
"""

import re
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import yt_dlp

app = FastAPI(title="ToolkitMe Downloader API", version="1.0.0")

# Ganti "*" dengan domain aslimu di production, misal:
# allow_origins=["https://toolkitme.my.id", "https://www.toolkitme.my.id"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

PLATFORM_PATTERNS = {
    "tiktok": r"tiktok\.com",
    "instagram": r"instagram\.com",
    "facebook": r"facebook\.com|fb\.watch",
    "x": r"(?:twitter|x)\.com",
    "youtube": r"youtube\.com|youtu\.be",
}


class ExtractRequest(BaseModel):
    url: str = Field(..., description="Link video/post publik yang mau diunduh")
    audio_only: bool = Field(False, description="True untuk ambil audio saja (MP3)")


class FormatInfo(BaseModel):
    format_id: str
    ext: str
    resolution: Optional[str] = None
    filesize_approx: Optional[int] = None
    url: str
    label: str


class ExtractResponse(BaseModel):
    platform: str
    title: str
    thumbnail: Optional[str] = None
    duration: Optional[float] = None
    uploader: Optional[str] = None
    formats: list[FormatInfo]


def detect_platform(url: str) -> str:
    for name, pattern in PLATFORM_PATTERNS.items():
        if re.search(pattern, url, re.IGNORECASE):
            return name
    raise HTTPException(
        status_code=400,
        detail="Link tidak dikenali. Dukung: TikTok, Instagram, Facebook, X, YouTube.",
    )


def build_ydl_opts(audio_only: bool) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        # yt-dlp akan pilih klien web/anon secara default; untuk platform yang
        # butuh header khusus (Instagram/TikTok kadang butuh User-Agent mobile),
        # sesuaikan lebih lanjut sesuai kebutuhan produksi.
        "extract_flat": False,
    }
    if audio_only:
        opts["format"] = "bestaudio/best"
    else:
        opts["format"] = "best"
    return opts


@app.post("/api/extract", response_model=ExtractResponse)
def extract(payload: ExtractRequest):
    platform = detect_platform(payload.url)
    ydl_opts = build_ydl_opts(payload.audio_only)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(payload.url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Gagal memproses link. Pastikan kontennya publik dan link valid. ({e})",
        )

    if info is None:
        raise HTTPException(status_code=422, detail="Tidak ada data yang bisa diambil dari link ini.")

    # Beberapa link (mis. carousel/slideshow) mengembalikan beberapa entri
    if "entries" in info:
        info = info["entries"][0]

    raw_formats = info.get("formats") or [info]
    formats: list[FormatInfo] = []

    for f in raw_formats:
        direct_url = f.get("url")
        if not direct_url:
            continue
        if payload.audio_only and f.get("vcodec") not in (None, "none"):
            continue
        if not payload.audio_only and f.get("vcodec") in (None, "none"):
            continue

        height = f.get("height")
        label = f"{height}p" if height else f.get("format_note", f.get("ext", "file"))
        formats.append(
            FormatInfo(
                format_id=str(f.get("format_id", "")),
                ext=f.get("ext", "mp4" if not payload.audio_only else "mp3"),
                resolution=f"{f.get('width')}x{height}" if height else None,
                filesize_approx=f.get("filesize") or f.get("filesize_approx"),
                url=direct_url,
                label=label,
            )
        )

    if not formats and info.get("url"):
        formats.append(
            FormatInfo(
                format_id="direct",
                ext=info.get("ext", "mp4"),
                url=info["url"],
                label="Original",
            )
        )

    if not formats:
        raise HTTPException(status_code=422, detail="Tidak ditemukan format yang bisa diunduh untuk link ini.")

    return ExtractResponse(
        platform=platform,
        title=info.get("title") or "Tanpa judul",
        thumbnail=info.get("thumbnail"),
        duration=info.get("duration"),
        uploader=info.get("uploader") or info.get("channel"),
        formats=formats,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
