"""
api/instagram.py — Vercel Python Serverless Function (runtime terpisah dari
Node.js). Membungkus library `parth-dl` (https://github.com/parthmax2/parth-dl,
MIT, aktif di-maintain per Okt 2025) yang punya multi-layer extraction khusus
Instagram (Reels/Post/Carousel) tanpa login.

KENAPA PYTHON TERPISAH, BUKAN DI-PORT KE JS:
extract.js (Node) tidak tahu detail internal teknik scraping parth-dl (kami
tidak punya akses baca source-nya secara langsung dari sini) — daripada
menebak dan menulis ulang logikanya di JS (yang berisiko salah), endpoint
ini memanggil library aslinya apa adanya. api/_lib/platforms/instagram.js
(Node) memanggil endpoint INI lewat HTTP sebagai salah satu attempt sebelum
Cobalt — lihat comment di sana.

KONTRAK RESPONSE (dipakai instagram.js sisi Node):
Sukses -> 200 { title, thumbnail, duration, uploader, formats: [{type, url, label}] }
Gagal  -> 4xx/5xx { error: "pesan" }

CATATAN PENTING — BELUM PERNAH DIJALANKAN LIVE:
Kode ini ditulis tanpa akses jaringan untuk verifikasi langsung, karena kami
tidak tahu PERSIS struktur dict yang dikembalikan `parth_dl.get_info()` atau
`InstagramDownloader.get_info()`. Untuk itu handler ini SENGAJA defensif:
- Kalau parsing "shape yang diharapkan" gagal, response tetap 200 tapi
  menyertakan field `raw` (dict asli dari parth-dl apa adanya) sekaligus
  field `parse_error` yang menjelaskan kenapa auto-mapping gagal — supaya
  begitu di-test sekali, kita langsung tahu nama key yang benar dari
  `raw` dan tinggal sesuaikan fungsi `_normalize()` di bawah tanpa
  perlu menebak lagi dari nol.
- best-effort mengecek beberapa kemungkinan nama field umum (title/caption,
  thumbnail/thumbnail_url/cover, formats/media/urls, url/download_url/src,
  dst) sebelum menyerah ke mode `raw`.
"""

import json
from http.server import BaseHTTPRequestHandler

try:
    from parth_dl import InstagramDownloader
    IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - hanya kalau requirements.txt gagal install
    InstagramDownloader = None
    IMPORT_ERROR = str(exc)


def _first(d, keys, default=None):
    """Ambil value pertama yang ketemu dari beberapa kemungkinan nama key."""
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] not in (None, ""):
            return d[k]
    return default


def _guess_type(item):
    t = _first(item, ["type", "kind", "media_type"])
    if t:
        t = str(t).lower()
        if "video" in t:
            return "video"
        if "audio" in t:
            return "audio"
        if "image" in t or "photo" in t:
            return "photo"
    url = _first(item, ["url", "download_url", "src", "video_url", "image_url"]) or ""
    if any(ext in url.lower() for ext in [".mp4", ".mov", ".m4v"]):
        return "video"
    if any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
        return "photo"
    return "video"


def _normalize(info):
    """
    Coba petakan dict hasil parth-dl ke kontrak {title, thumbnail, duration,
    uploader, formats}. Mengembalikan (result, error) — error diisi kalau
    mapping gagal total (formats kosong), supaya caller bisa fallback ke
    mode `raw`.
    """
    if not isinstance(info, dict):
        return None, f"get_info() tidak mengembalikan dict, tapi {type(info).__name__}."

    title = _first(info, ["title", "caption", "text", "description"], "Post Instagram")
    thumbnail = _first(info, ["thumbnail", "thumbnail_url", "cover", "cover_url", "poster"])
    duration = _first(info, ["duration", "video_duration", "length"])
    uploader = _first(info, ["uploader", "username", "author", "owner"])

    # Carousel/multi-media: cari list di beberapa kemungkinan key.
    media_list = _first(info, ["formats", "media", "medias", "items", "resources", "urls"])

    formats = []
    if isinstance(media_list, list) and media_list:
        for i, item in enumerate(media_list):
            if isinstance(item, str):
                formats.append({"type": _guess_type({"url": item}), "url": item, "label": f"Media {i + 1}"})
                continue
            if not isinstance(item, dict):
                continue
            url = _first(item, ["url", "download_url", "src", "video_url", "image_url"])
            if not url:
                continue
            formats.append({"type": _guess_type(item), "url": url, "label": _first(item, ["label", "quality", "resolution"], f"Media {i + 1}")})
    else:
        # Bukan carousel — mungkin field url langsung di root dict.
        url = _first(info, ["url", "download_url", "src", "video_url", "image_url"])
        if url:
            formats.append({"type": _guess_type(info), "url": url, "label": "Media"})

    if not formats:
        return None, "Tidak ketemu field media/url yang dikenal di dict hasil get_info()."

    return {
        "title": title,
        "thumbnail": thumbnail,
        "duration": duration,
        "uploader": uploader,
        "formats": formats,
    }, None


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if InstagramDownloader is None:
            self._send(500, {"error": f"Library parth-dl gagal di-import: {IMPORT_ERROR}"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw_body or b"{}")
        except Exception as exc:
            self._send(400, {"error": f"Body request tidak valid: {exc}"})
            return

        url = (payload.get("url") or "").strip()
        if not url:
            self._send(400, {"error": "Field 'url' wajib diisi."})
            return

        try:
            dl = InstagramDownloader(verbose=False)
            info = dl.get_info(url)
        except Exception as exc:
            self._send(422, {"error": f"parth-dl gagal mengekstrak: {exc}"})
            return

        result, err = _normalize(info)
        if result is None:
            # Mapping gagal — kirim raw dict-nya supaya bisa langsung
            # ketahuan nama field yang benar begitu di-test sekali.
            self._send(200, {"parse_error": err, "raw": info})
            return

        self._send(200, result)
