# ToolkitMe — Downloader yang beneran jalan

## Struktur
- `index.html` — homepage. Form di hero sekarang **fetch ke API asli**, bukan simulasi.
- `backend/app.py` — API FastAPI + yt-dlp yang benar-benar mengekstrak link video/audio.
- `backend/requirements.txt`, `backend/Dockerfile` — buat deploy backend.
- `robots.txt`, `sitemap.xml` — untuk SEO.

## Kenapa butuh backend terpisah
Browser tidak bisa langsung minta video dari TikTok/Instagram/dll (kena CORS,
dan butuh proses ekstraksi seperti yang dilakukan `yt-dlp`). Jadi alurnya:

```
Browser (index.html) --fetch--> Backend API (yt-dlp) --request--> TikTok/IG/FB/X/YouTube
```

## Jalankan backend

**Lokal (buat testing):**
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
Test cepat:
```bash
curl -X POST http://localhost:8000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@user/video/123456"}'
```

**Deploy production** — pilih salah satu, semuanya support Docker:
- **Railway / Render / Fly.io** — paling gampang, tinggal connect repo yang isi folder `backend/`, mereka baca `Dockerfile` otomatis. Dapat URL publik seperti `https://toolkitme-api.up.railway.app`.
- **VPS sendiri (misal DigitalOcean/Biznet)** — `docker build -t toolkitme-api . && docker run -d -p 8000:8000 toolkitme-api`, lalu taruh di belakang Nginx + subdomain `api.toolkitme.my.id` dengan SSL (certbot).

## Sambungkan frontend ke backend
Di `index.html`, sebelum `</body>`, set base URL API kamu:
```html
<script>window.TOOLKITME_API_BASE = 'https://api.toolkitme.my.id';</script>
```
Taruh baris itu **sebelum** `<script>` besar yang berisi `API_BASE` di bagian bawah file — atau langsung edit nilai default di file itu.

## Hal yang perlu kamu tahu
- **CORS**: di `app.py`, ganti `allow_origins=["*"]` jadi domain aslimu saja saat production.
- **yt-dlp perlu di-update rutin** (`pip install -U yt-dlp`) — TikTok/Instagram sering ubah struktur, kalau tidak diupdate downloader bisa berhenti berfungsi.
- **Instagram Story / akun privat** butuh cookie login, tidak didukung di versi ini (sengaja, karena itu masuk area privat/butuh otorisasi).
- **Rate limit**: kalau trafiknya besar, tambahkan rate limiting per-IP di backend supaya IP server tidak diblokir platform sumber.
- Saya tidak bisa uji coba ekstraksi langsung dari sandbox ini karena jaringannya dibatasi (tidak bisa akses tiktok.com/instagram.com dari sini) — jadi wajib kamu tes sendiri setelah deploy.
