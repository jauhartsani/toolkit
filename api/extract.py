"""
api/extract.py — Vercel Python Serverless Function

Vercel otomatis mengubah file ini jadi endpoint: POST /api/extract
Tidak perlu server terpisah, tidak perlu Railway — jalan di project
Vercel yang sama dengan index.html.
"""

import json
import re
from http.server import BaseHTTPRequestHandler

import yt_dlp

PLATFORM_PATTERNS = {
    "tiktok": r"tiktok\.com",
    "instagram": r"instagram\.com",
    "facebook": r"facebook\.com|fb\.watch",
    "x": r"(?:twitter|x)\.com",
    "youtube": r"youtube\.com|youtu\.be",
}


def detect_platform(url: str):
    for name, pattern in PLATFORM_PATTERNS.items():
        if re.search(pattern, url, re.IGNORECASE):
            return name
    return None


def build_ydl_opts(audio_only: bool) -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "format": "bestaudio/best" if audio_only else "best",
    }


def run_extract(url: str, audio_only: bool):
    platform = detect_platform(url)
    if not platform:
        return 400, {"detail": "Link tidak dikenali. Dukung: TikTok, Instagram, Facebook, X, YouTube."}

    try:
        with yt_dlp.YoutubeDL(build_ydl_opts(audio_only)) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        return 422, {"detail": f"Gagal memproses link. Pastikan kontennya publik dan link valid. ({e})"}
    except Exception as e:
        return 500, {"detail": f"Kesalahan server: {e}"}

    if info is None:
        return 422, {"detail": "Tidak ada data yang bisa diambil dari link ini."}

    if "entries" in info:
        info = info["entries"][0]

    raw_formats = info.get("formats") or [info]
    formats = []
    for f in raw_formats:
        direct_url = f.get("url")
        if not direct_url:
            continue
        if audio_only and f.get("vcodec") not in (None, "none"):
            continue
        if not audio_only and f.get("vcodec") in (None, "none"):
            continue
        height = f.get("height")
        formats.append({
            "format_id": str(f.get("format_id", "")),
            "ext": f.get("ext", "mp4" if not audio_only else "mp3"),
            "label": f"{height}p" if height else f.get("format_note", f.get("ext", "file")),
            "filesize_approx": f.get("filesize") or f.get("filesize_approx"),
            "url": direct_url,
        })

    if not formats and info.get("url"):
        formats.append({
            "format_id": "direct",
            "ext": info.get("ext", "mp4"),
            "label": "Original",
            "filesize_approx": None,
            "url": info["url"],
        })

    if not formats:
        return 422, {"detail": "Tidak ditemukan format yang bisa diunduh untuk link ini."}

    return 200, {
        "platform": platform,
        "title": info.get("title") or "Tanpa judul",
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel"),
        "formats": formats,
    }


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            payload = {}

        url = (payload.get("url") or "").strip()
        audio_only = bool(payload.get("audio_only", False))

        if not url:
            status, body = 400, {"detail": "Field 'url' wajib diisi."}
        else:
            status, body = run_extract(url, audio_only)

        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
