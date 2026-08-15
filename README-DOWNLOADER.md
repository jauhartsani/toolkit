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
  halaman post publik dengan UA crawler preview-link Meta ("Facebot",
  sering lolos dari login wall) → halaman embed publik
  (`/embed/captioned/`) → web info API internal instagram.com
  (`X-IG-App-ID`) → **`parth-dl`** (library Python pihak ketiga, lihat di
  bawah) → Cobalt. **Tidak butuh cookies/login lagi** untuk konten
  publik biasa.

### Metode baru: `api/instagram.py` (pakai library `parth-dl`)

Reels & carousel makin sering gagal di 4 metode scraping statis di atas
(Instagram tidak lagi menaruh link video di HTML mentah). Daripada terus
menebak teknik baru, ditambahkan **satu function Python terpisah**
(`api/instagram.py`, Vercel mendukung Node.js + Python berdampingan dalam
1 project) yang membungkus library open-source
[`parth-dl`](https://github.com/parthmax2/parth-dl) (MIT, aktif
di-maintain) — dia yang mengurus scraping/GraphQL Instagram-nya, kita
tinggal pakai. `api/_lib/platforms/instagram.js` (Node) memanggil endpoint
ini lewat HTTP internal sebagai attempt sebelum Cobalt.

**Belum pernah dijalankan live** (ditulis tanpa akses jaringan buat
verifikasi), jadi `api/instagram.py` sengaja defensif: kalau struktur
dict hasil `parth_dl.get_info()` tidak cocok dengan yang diperkirakan,
response tetap 200 tapi isinya `{ "parse_error": "...", "raw": {...} }` —
`raw` inilah JSON asli dari parth-dl apa adanya. Kalau kamu lihat pesan
error yang menyertakan `Raw: {...}` setelah deploy & testing, **paste ke
saya** — dari situ saya bisa langsung perbaiki fungsi `_normalize()` di
`api/instagram.py` (baris field-mapping-nya saja, tanpa perlu menebak
struktur dari nol lagi).
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

## Catatan penting soal Cobalt (WAJIB DIBACA — beda dari draf pertama)

**Update:** instance publik `api.cobalt.tools` sekarang **menolak semua
request API dari luar** (bot protection + wajib API key/Turnstile) — ini
kebijakan resmi tim Cobalt sejak akhir 2024, bukan bug di kode kita:
> "hosted api instances (such as `api.cobalt.tools`) use bot protection and
> are **not** intended to be used in other projects without explicit
> permission." — https://github.com/imputnet/cobalt/blob/main/docs/api.md

Ini penyebab error `Cobalt merespons status 400 tanpa data` yang mungkin
kamu lihat. Skema request/response Cobalt juga sudah berubah total dari
versi lama (field `vCodec`/`isAudioOnly` sudah tidak berlaku, diganti
`videoQuality`/`downloadMode`/dst) — sudah aku sesuaikan di
`api/_lib/cobalt.js`, tapi endpoint publiknya tetap tidak bisa dipakai.

**Konsekuensi:** fallback Cobalt (dipakai TikTok/Instagram/Facebook/X kalau
metode utama gagal, dan satu-satunya metode untuk **YouTube**) butuh
`COBALT_API_URL` menunjuk ke **instance Cobalt milikmu sendiri**. Kalau
env var ini kosong, fungsinya sekarang gagal dengan pesan jelas (bukan
diam-diam coba `api.cobalt.tools` dan dapat 400 seperti sebelumnya).

### Cara self-host Cobalt (gratis, ~5 menit, butuh VPS/server kecil)

Cobalt jalan sebagai container Docker, jadi bisa di-deploy di VPS murah
(mis. Oracle Cloud free tier, Contabo) atau platform container gratis lain
— **tidak bisa** di Vercel karena Vercel Functions tidak mendukung
long-running Docker service.

```bash
mkdir cobalt && cd cobalt
curl -O https://raw.githubusercontent.com/imputnet/cobalt/main/docker-compose.example.yml
mv docker-compose.example.yml docker-compose.yml
# edit docker-compose.yml: isi API_URL dengan domain/IP publik server kamu
docker compose up -d
```

Detail lengkap: https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md

Setelah instance jalan (mis. `https://cobalt.domainmu.com`), set di Vercel:

- Settings → Environment Variables → `COBALT_API_URL` = `https://cobalt.domainmu.com`
- Redeploy project ToolkitMe.

### Kalau tidak mau self-host

- **TikTok, Instagram, Facebook, X** tetap bisa jalan tanpa Cobalt sama
  sekali — mereka punya metode utama sendiri (`tikwm.com`, scraping
  og-meta/embed, `vxtwitter.com`) yang tidak bergantung ke Cobalt. Cobalt
  di sini cuma fallback kalau metode utama gagal.
- Khusus **Instagram**, sekarang ada 4 metode sebelum Cobalt (lihat di
  atas). Reels yang sebelumnya langsung jatuh ke Cobalt karena halaman
  utama & embed sama-sama kena login wall, sekarang punya 2 kesempatan
  tambahan (UA Facebot, lalu web info API internal) sebelum benar-benar
  butuh Cobalt. **Belum ditest langsung ke Instagram** (dikembangkan
  tanpa akses jaringan) — kalau salah satu dari dua metode baru ini mulai
  gagal terus (IG bisa berubah kapan saja), aman dihapus dari array
  `attempts` di `api/_lib/platforms/instagram.js` tanpa mempengaruhi
  metode lain.
- **YouTube downloader akan selalu gagal** tanpa `COBALT_API_URL` terisi,
  karena YouTube tidak punya metode scraping publik yang stabil tanpa
  autentikasi. Kalau tidak butuh YouTube downloader jalan, biarkan saja —
  4 downloader lain tidak terpengaruh.

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
