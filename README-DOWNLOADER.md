# ToolkitMe — Teknologi Downloader (v2, ganti dari yt-dlp)

## Apa yang berubah

Sebelumnya `api/extract.py` pakai `yt-dlp` (Python) satu library untuk semua
platform. Instagram hampir selalu gagal karena Instagram menutup akses
konten (bahkan publik) untuk request tanpa login, dan yt-dlp minta cookies
supaya bisa jalan.

Sekarang diganti `api/extract.js` (Node.js) yang meniru pendekatan proyek
lama kamu: **setiap platform punya beberapa metode ekstraksi berurutan** —
kalau metode pertama gagal/diblokir, otomatis coba metode berikutnya.
Tidak ada halaman atau fitur baru — 5 downloader (TikTok, Instagram,
Facebook, X, YouTube) + index tetap sama persis, hanya mesin di baliknya
yang diganti.

## Urutan metode per platform

- **TikTok** — `tikwm.com` API (utama, paling stabil, sekalian hilangkan
  watermark) → scraping langsung halaman TikTok → Cobalt (fallback
  terakhir).
- **Instagram** — halaman post publik (`og:video`/`og:image` meta) →
  halaman embed publik (`/embed/captioned/`) → Cobalt. **Tidak butuh
  cookies/login lagi** untuk konten publik biasa.
- **Facebook** — halaman embed `plugins/video.php` → scraping halaman
  watch/reel langsung → Cobalt.
- **X (Twitter)** — `vxtwitter.com` API (utama) → Cobalt.
- **YouTube** — Cobalt (utama, karena halaman YouTube sendiri sulit
  di-scrape tanpa autentikasi) + metadata judul/thumbnail dari YouTube
  oEmbed publik.

Semua link download akhirnya melewati `/api/media` — proxy yang menambahkan
header `Referer` yang benar per-CDN (kelimanya memblokir hotlink tanpa
referer yang cocok) dan memaksa file benar-benar ke-download.

## File yang berubah

```
api/
├── extract.js          ← orchestrator (ganti extract.py), kontrak
│                          request/response SAMA seperti sebelumnya
├── media.js             ← proxy download baru (referer + force-download)
└── _lib/
    ├── http.js           ← helper fetch + timeout
    ├── proxy-url.js       ← helper bikin URL /api/media
    ├── cobalt.js           ← fallback terakhir (Cobalt API)
    └── platforms/
        ├── tiktok.js
        ├── instagram.js
        ├── facebook.js
        ├── twitter.js
        └── youtube.js
```

`requirements.txt` dan `README-INSTAGRAM.md` (setup cookies) sudah tidak
relevan dan dihapus — tidak ada lagi dependency Python/yt-dlp.

## Catatan penting soal Cobalt

Fallback terakhir tiap platform (dan metode utama untuk YouTube) memanggil
instance publik Cobalt lewat `COBALT_API_URL` (default
`https://api.cobalt.tools/api/json`). Instance publik Cobalt kadang
berganti alamat atau kebijakan (butuh API key, dsb.) seiring waktu — kalau
fallback ini mulai gagal terus:

1. Cek instance publik terbaru di
   https://github.com/imputnet/cobalt/blob/main/docs/api.md
2. Set environment variable `COBALT_API_URL` di Vercel ke instance baru
   (Settings → Environment Variables), atau self-host instance Cobalt
   sendiri.

`tikwm.com` dan `vxtwitter.com` (metode utama TikTok & X) adalah API publik
gratis yang sudah lama stabil, jadi kemungkinan besar tidak perlu utak-atik
apa pun untuk kedua platform itu.

## Testing

Karena scraping/API pihak ketiga berubah dari waktu ke waktu, coba tiap
platform langsung setelah deploy:

```bash
curl -X POST https://<domain-kamu>/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"<link-tiktok-publik>","audio_only":false}'
```

Ulangi untuk Instagram/Facebook/X/YouTube. Kalau salah satu metode di suatu
platform mulai sering gagal (situs sumber ganti struktur HTML/API), edit
file yang sesuai di `api/_lib/platforms/` — urutan fallback tetap jalan
otomatis selama minimal satu metode berhasil.
