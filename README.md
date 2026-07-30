# Toolkit — All-in-One Utility Web Tools

Website multi-page berisi 46 tools gratis. Tools kompresi/PDF/convert/QR/
text/dev/calc/random berjalan 100% di browser pengguna (client-side, tanpa
backend). Tools downloader media sosial (Instagram, TikTok, Facebook, X,
YouTube) butuh backend serverless (folder `api/`, format Vercel Functions)
karena platform-platform tersebut memblokir fetch langsung dari browser —
lihat bagian "Downloader Media Sosial" di bawah.

## Struktur Folder

```
toolkit-website/
├── index.html              ← Halaman utama (search + kategori)
├── sitemap.xml              ← Sitemap SEO (domain contoh: www.toolkitme.my.id)
├── robots.txt
├── favicon.ico               ← Favicon root (dipakai browser yang minta /favicon.ico langsung)
├── assets/
│   ├── favicon.svg           ← Favicon utama (semua halaman)
│   ├── apple-touch-icon.png  ← Ikon home-screen iOS
│   ├── css/style.css         ← Design system (dipakai semua halaman)
│   └── js/
│       ├── common.js         ← Helper bersama + simulasi iklan interstitial
│       └── downloader.js     ← Logika shared UI untuk semua halaman downloader
├── api/                     ← Vercel Serverless Functions (Node)
│   ├── instagram.js          ← GET /api/instagram?url=...
│   ├── tiktok.js              ← GET /api/tiktok?url=...
│   ├── facebook.js            ← GET /api/facebook?url=...
│   ├── twitter.js             ← GET /api/twitter?url=... (twitter.com & x.com)
│   ├── youtube.js             ← GET /api/youtube?url=...&type=video|audio
│   ├── media.js               ← GET /api/media?url=...&kind=... (proxy download, semua platform)
│   └── _lib/                  ← Helper bersama (cobalt.js, proxy.js) — bukan route sendiri
├── compress/                ← compress-jpg, compress-png, compress-webp, compress-pdf
├── pdf/                     ← add-text, sign, merge, split
├── convert/                 ← jpg-to-png, png-to-jpg, webp-to-jpg, jpg-to-webp,
│                               svg-to-png, heic-to-jpg, image-to-pdf
├── qr/                      ← text, url, whatsapp, wifi, vcard
├── text/                    ← word-counter, case-converter
├── dev/                     ← json-formatter, base64
├── calc/                    ← discount-tax, compound-interest
├── random/                  ← password, picker
├── instagram/                ← video, photo, reels, carousel, igtv, story, viewer
├── tiktok/                   ← video, mp3, photo
├── facebook/                 ← video, reel
├── x/                        ← video, photo
└── youtube/                  ← video, mp3, shorts
```

## Downloader Media Sosial — Cara Kerjanya

Setiap platform diberi beberapa metode ekstraksi berurutan (kalau metode
pertama gagal/diblokir, otomatis coba metode berikutnya):

- **TikTok** — tikwm.com API (utama, paling stabil) → scraping langsung
  halaman TikTok → Cobalt (fallback terakhir).
- **Instagram** — halaman post publik (og:meta + JSON-LD) → halaman embed
  publik → Cobalt.
- **Facebook** — halaman embed `plugins/video.php` → scraping halaman watch/
  reel langsung → Cobalt.
- **X (Twitter)** — vxtwitter.com API (utama) → Cobalt.
- **YouTube** — Cobalt (utama, karena halaman YouTube sendiri sangat sulit
  di-scrape tanpa autentikasi) + metadata judul/thumbnail dari YouTube
  oEmbed publik.

Semua link download akhirnya melewati `/api/media` — proxy yang menambahkan
header `Referer` yang benar per-CDN (TikTok/Instagram/Facebook/X/YouTube
semua memblokir hotlink tanpa referer yang cocok) dan memaksa file benar-benar
ke-download (bukan cuma kebuka di tab baru).

**Penting:** fitur downloader HANYA jalan kalau situs di-deploy sebagai
Vercel Functions (folder `api/` aktif) — dibuka lewat `python3 -m http.server`
atau hosting statis biasa, tombol download akan menampilkan pesan error yang
menjelaskan hal ini (bukan gagal diam-diam).

## Cara Menjalankan di Lokal

**Tools biasa (compress/PDF/convert/QR/text/dev/calc/random)** — semua
client-side, cukup local web server biasa (bukan dibuka langsung sebagai
`file://`, karena beberapa browser membatasi `fetch`/Web Worker pada
protokol file):

```bash
# Python (paling gampang, biasanya sudah terpasang)
cd toolkit-website
python3 -m http.server 8080
# lalu buka http://localhost:8080
```

Atau pakai Node: `npx serve toolkit-website`

**Tools downloader (Instagram/TikTok/Facebook/X/YouTube)** — butuh folder
`api/` berjalan sebagai Vercel Function, jadi pakai Vercel CLI:

```bash
npm install -g vercel
cd toolkit-website
vercel dev
# lalu buka http://localhost:3000
```

## Deploy ke Vercel (Gratis)

1. Push folder ini ke repo GitHub baru.
2. Buka https://vercel.com/new → Import repo tersebut.
3. Framework preset: pilih **Other** (tidak perlu build command,
   karena situs ini 100% file statis).
4. Klik Deploy — selesai dalam ~30 detik.

Atau tanpa GitHub, langsung drag-and-drop folder ini ke
https://vercel.com/new lewat opsi "Deploy without Git".

## Sebelum Live: Ganti Domain di sitemap.xml

`sitemap.xml` dan meta tag `canonical` di setiap halaman memakai domain
contoh `https://www.toolkitme.my.id`. Setelah domain asli Anda aktif, cari
dan ganti semua kemunculan string tersebut, misalnya:

```bash
grep -rl "www.toolkitme.my.id" . | xargs sed -i 's/www.toolkitme.my.id/domain-anda.com/g'
```

Lalu submit ulang `sitemap.xml` ke Google Search Console.

## Tentang Iklan (Monetisasi)

Setiap halaman tools punya dua jenis placeholder iklan:

- **Banner slot** — `<div id="adsense-banner-top">` dan
  `#adsense-banner-bottom"`, kotak abu-abu siap diisi kode AdSense/ad
  network pilihan Anda.
- **Interstitial** — saat tombol aksi utama (Compress/Convert/Generate/
  Download, dst) diklik, muncul modal "Processing file... Please wait"
  selama 3 detik sebelum tombol "Skip Ad & Download" muncul. Logikanya
  ada di `assets/js/common.js` fungsi `runWithAd()` — cukup ganti isi
  `.adm-canvas` di file itu dengan kode iklan sungguhan saat sudah
  punya akun ad network.

## Catatan Teknis

- Semua pemrosesan file (kompresi gambar/PDF, convert format, QR,
  gabung/pisah PDF, tanda tangan) berjalan penuh di browser lewat
  Canvas API, File API, dan library client-side (pdf-lib, pdf.js,
  qrcode.js, heic2any) yang dimuat dari CDN. Tidak ada file pengguna
  yang pernah dikirim ke server mana pun.
- Desain memakai Tailwind CSS (CDN) untuk utility layout, dikombinasi
  dengan `assets/css/style.css` untuk komponen & identitas visual
  (font Space Grotesk + Inter + JetBrains Mono, aksen warna signal
  blue #2F6FED).
- Favicon memakai file statis (`assets/favicon.svg` + `favicon.ico` +
  `assets/apple-touch-icon.png`), konsisten di ke-46 halaman — sebelumnya
  beberapa halaman index kategori tidak punya favicon sama sekali.
