"""
api/instagram.py — Vercel Python Serverless Function (runtime terpisah dari
Node.js api/*.js). Membungkus `instaloader` (github.com/instaloader/instaloader,
MIT, 13.000+ stars, aktif di-maintain — commit terakhir Jul 2026) untuk
Instagram Reels/Post/Carousel tanpa login.

KENAPA GANTI DARI `parth-dl` KE `instaloader`:
`parth-dl` (proyek kecil, 24 stars) strukturnya tidak terdokumentasi dan
kami tidak bisa verifikasi bentuk return dict-nya tanpa akses jaringan.
`instaloader` jauh lebih matang dan API class `Post`-nya (is_video,
video_url, url, typename, get_sidecar_nodes(), owner_username, dst) sudah
stabil bertahun-tahun dan terdokumentasi resmi — jauh lebih kecil
kemungkinan salah tebak nama field.

CATATAN PENTING — RATE LIMIT ANONIM DARI IP CLOUD:
Instagram membatasi akses tanpa login jauh lebih ketat untuk request yang
datang dari IP cloud/VPS/serverless (persis kondisi Vercel function ini)
dibanding dari IP rumahan biasa — bisa kena HTTP 429 walau cuma beberapa
request. Ini BUKAN bug di kode ini; ini karakteristik Instagram sendiri.
Kalau ini jadi masalah nyata di produksi (429 sering muncul), solusi yang
tersedia:
  1. Retry dengan jeda (sudah ada sedikit di bawah, tapi tidak menjamin).
  2. Login pakai session file (env var IG_SESSION_* ), yang menurut
     dokumentasi instaloader tidak kena limit seketat mode anonim — tapi
     ini butuh akun IG terpisah yang disiapkan khusus untuk ini (ada
     risiko akun kena flag Instagram, jadi sebaiknya bukan akun utama).
  3. Cobalt (fallback terakhir di urutan attempts) tetap ada sebagai
     pilihan kalau instaloader juga gagal.

KONTRAK RESPONSE (dipakai instagram.js sisi Node):
Sukses -> 200 { title, thumbnail, duration, uploader, formats: [{type, url, label}] }
Gagal  -> 4xx/5xx { error: "pesan" }
"""

import json
import re
from http.server import BaseHTTPRequestHandler

try:
    import instaloader
    IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - hanya kalau requirements.txt gagal install
    instaloader = None
    IMPORT_ERROR = str(exc)

SHORTCODE_RE = re.compile(r"/(?:p|reel|reels|tv)/([^/?#]+)")


def extract_shortcode(url):
    m = SHORTCODE_RE.search(url)
    if not m:
        raise ValueError("Tidak bisa menemukan shortcode dari URL Instagram ini.")
    return m.group(1)


def build_context():
    # quiet=True supaya tidak print ke stdout (Vercel function log jadi bersih).
    # sleep=True (default) tetap dibiarkan aktif — instaloader punya rate
    # limiter internalnya sendiri, jangan dimatikan supaya tidak makin
    # gampang kena block.
    return instaloader.InstaloaderContext(sleep=True, quiet=True, user_agent=None)


def post_to_formats(post):
    formats = []
    if post.typename == "GraphSidecar":
        # Carousel: banyak media (foto/video campur), iterasi tiap slide.
        for i, node in enumerate(post.get_sidecar_nodes()):
            if node.is_video:
                formats.append({"type": "video", "url": node.video_url, "label": f"Video {i + 1}"})
            else:
                formats.append({"type": "photo", "url": node.display_url, "label": f"Foto {i + 1}"})
    elif post.is_video:
        formats.append({"type": "video", "url": post.video_url, "label": "Video"})
    else:
        formats.append({"type": "photo", "url": post.url, "label": "Foto"})
    return formats


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
        if instaloader is None:
            self._send(500, {"error": f"Library instaloader gagal di-import: {IMPORT_ERROR}"})
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
            shortcode = extract_shortcode(url)
        except ValueError as exc:
            self._send(400, {"error": str(exc)})
            return

        try:
            context = build_context()
            post = instaloader.Post.from_shortcode(context, shortcode)
            formats = post_to_formats(post)

            if not formats:
                self._send(422, {"error": "instaloader tidak menemukan media pada post ini."})
                return

            self._send(200, {
                "title": (post.caption or "Post Instagram")[:150],
                "thumbnail": post.url,
                "duration": getattr(post, "video_duration", None) if post.is_video else None,
                "uploader": post.owner_username,
                "formats": formats,
            })
        except instaloader.exceptions.LoginRequiredException:
            self._send(422, {"error": "Instagram meminta login untuk post ini (kemungkinan akun private)."})
        except instaloader.exceptions.PrivateProfileNotFollowedException:
            self._send(422, {"error": "Akun ini private."})
        except instaloader.exceptions.ConnectionException as exc:
            msg = str(exc)
            if "429" in msg or "Too many" in msg.lower() or "please wait" in msg.lower():
                self._send(429, {"error": f"Instagram membatasi rate request anonim (429) dari server ini: {msg}"})
            else:
                self._send(502, {"error": f"instaloader gagal konek ke Instagram: {msg}"})
        except Exception as exc:
            self._send(422, {"error": f"instaloader gagal mengekstrak: {exc}"})
