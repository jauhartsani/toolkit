# Toolkit — All-in-One Utility Web Tools

Website multi-page berisi 29 tools gratis yang 100% berjalan di browser
pengguna (client-side). Tanpa backend, tanpa database — bisa langsung
di-deploy ke Vercel, Netlify, GitHub Pages, atau hosting statis apa pun.

## Struktur Folder

```
toolkit-website/
├── index.html              ← Halaman utama (search + kategori)
├── sitemap.xml              ← Sitemap SEO (domain contoh: www.toolkitme.my.id)
├── robots.txt
├── assets/
│   ├── css/style.css        ← Design system (dipakai semua halaman)
│   └── js/common.js         ← Helper bersama + simulasi iklan interstitial
├── compress/                ← compress-jpg, compress-png, compress-webp, compress-pdf
├── pdf/                     ← add-text, sign, merge, split
├── convert/                 ← jpg-to-png, png-to-jpg, webp-to-jpg, jpg-to-webp,
│                               svg-to-png, heic-to-jpg, image-to-pdf
├── qr/                      ← text, url, whatsapp, wifi, vcard
├── text/                    ← word-counter, case-converter
├── dev/                     ← json-formatter, base64
├── calc/                    ← discount-tax, compound-interest
└── random/                  ← password, picker
```

## Cara Menjalankan di Lokal

Karena semua file adalah HTML statis, cara termudah adalah lewat local
web server (bukan dibuka langsung sebagai `file://`, karena beberapa
browser membatasi `fetch`/Web Worker pada protokol file):

```bash
# Python (paling gampang, biasanya sudah terpasang)
cd toolkit-website
python3 -m http.server 8080
# lalu buka http://localhost:8080
```

Atau pakai Node:

```bash
npx serve toolkit-website
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
