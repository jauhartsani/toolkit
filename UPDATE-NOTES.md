# ToolkitMe — Update: Tools Dikembalikan + SEO (Agustus 2026)

## Kenapa update ini dibuat
Data Search Console (`Kueri.csv` & `Halaman.csv`) yang kamu upload menunjukkan
halaman-halaman lama seperti `/instagram/carousel.html` (239 impression!),
`/pdf/merge.html` (70 impression), `/compress/compress-jpg.html` (64 impression)
sudah pernah diindex Google dan mulai dapat traffic — tapi hilang saat situs
dipangkas jadi cuma 5 halaman downloader. Update ini **mengembalikan halaman
tersebut persis di URL yang sama**, supaya sinyal SEO yang sudah ada di Google
tidak hilang, sekaligus menambah fitur baru berdasarkan pola keyword di data.

## Fitur baru yang ditambahkan

### 1. Instagram — 6 halaman spesifik (reuse engine downloader yang sama)
- `/instagram/carousel.html` — target keyword "carousel downloader", "download carousel ig", dll (puluhan variasi di data)
- `/instagram/photo.html` — target "insta photo downloader", "instagram image download"
- `/instagram/story.html` — target "save story", "ig story downloader"
- `/instagram/igtv.html` — target "igtv downloader", "download igtv"
- `/instagram/reels.html` — target "reel free download", "ig reels download no watermark"
- `/instagram/viewer.html` — target "view instagram post with link"

Semua halaman ini pakai **form & JS yang sama persis** dengan `instagram-downloader.html`
(`assets/main.js` generic, hook ke `/api/extract`) — jadi tidak perlu ubah backend
sama sekali, cukup landing page dengan copy & FAQ yang ditarget ke keyword masing-masing.

### 2. Compress — pakai library **browser-image-compression** (client-side, web worker)
- `/compress/compress-jpg.html` — target "compress jpg", "kompres jpg gratis", dll (~30 variasi keyword)
- `/compress/compress-png.html`
- `/compress/compress-webp.html` — target "webp compressor", "webp compression"
- Bisa multi-file, slider kualitas, download satu-satu atau ZIP (pakai **JSZip**)

### 3. PDF Merge — pakai library **pdf-lib**
- `/pdf/merge.html` — target "satukan pdf", "combine pdf online", "pdf joiner", dll
- Upload banyak PDF, atur urutan (tombol naik/turun), gabung jadi 1 file

### 4. QR Generator — pakai library **qrcode** (soldair/node-qrcode)
- `/qr/index.html` — QR dari teks/link/WiFi
- `/qr/whatsapp.html` — target "qr code whatsapp", generate link `wa.me` + QR otomatis

### 5. Convert Gambar — pakai **Canvas API native** (tanpa library, browser sudah cukup)
- `/convert/index.html` — convert JPG ⇄ PNG ⇄ WebP
- `/convert/png-to-jpg.html` — landing page spesifik PNG→JPG

### 6. Text Tools & Kalkulator (vanilla JS, tanpa library)
- `/text/index.html` — hitung kata, ubah huruf besar/kecil, bersihkan teks, hapus baris duplikat
- `/calc/index.html` — kalkulator persentase, diskon, BMI

### 7. Hub baru
- `/tools.html` — halaman index semua tools
- `/compress/index.html`, `/pdf/index.html` — hub per kategori

## Kenapa library-library ini yang dipilih
| Kebutuhan | Library | Alasan |
|---|---|---|
| Compress gambar | `browser-image-compression` | Paling populer & aktif untuk kompresi client-side, jalan di Web Worker (tidak nge-freeze browser), otomatis handle EXIF orientation |
| Merge PDF | `pdf-lib` | Library JS PDF client-side paling matang, tidak butuh server |
| QR Code | `qrcode` (soldair) | Lebih aktif maintenance-nya dibanding qrcodejs lama, support canvas langsung |
| Convert gambar | Canvas API native | Browser modern sudah native support `canvas.toBlob('image/webp'|'image/jpeg'|'image/png')`, jadi tidak perlu tambahan dependency |
| ZIP multi-download | `jszip` | Standar de-facto untuk bikin ZIP di browser |

Semua library di-load lewat CDN (`cdn.jsdelivr.net`), **tidak nambah dependency
di `package.json`** — jadi build Vercel kamu tetap sama seperti sebelumnya
(`npm install` cuma `@vercel/functions` untuk middleware).

## SEO yang dikerjakan di semua halaman baru
- Title & meta description ditulis berdasarkan keyword persis dari `Kueri.csv`
- `canonical` URL per halaman
- JSON-LD: `SoftwareApplication`, `FAQPage`, `BreadcrumbList` di tiap halaman
- Breadcrumb HTML + schema selaras
- Internal linking: `instagram-downloader.html` sekarang link ke 6 fitur turunannya,
  navbar & footer semua halaman ID sudah ditambah menu **Tools**
- `sitemap.xml` sudah diperbarui — total 19 URL baru ditambahkan
- **PENTING**: `middleware.mjs` diperbaiki — sebelumnya semua halaman non-blog
  di-redirect otomatis ke `/en/...` berdasarkan geolocation IP. Karena
  halaman tools baru belum ada versi Inggrisnya, ini akan bikin 404 untuk
  visitor luar Indonesia kalau tidak dikecualikan. Sudah ditambahkan ke
  matcher exclusion, sama seperti `/blog/`.

## Langkah setelah deploy (biar Search Console cepat detect)
1. Deploy ke Vercel seperti biasa (`npm install` akan jalan otomatis untuk `@vercel/functions`).
2. Buka Google Search Console → **Sitemaps** → submit ulang `https://toolkitme.my.id/sitemap.xml`
   (kalau sudah pernah submit, GSC akan otomatis re-crawl karena isinya berubah,
   tapi submit ulang manual mempercepat).
3. Pakai fitur **URL Inspection** di GSC untuk 3–4 halaman prioritas dulu
   (`/instagram/carousel.html`, `/pdf/merge.html`, `/compress/compress-jpg.html`)
   dan klik "Request Indexing" — ini yang paling cepat bikin Google re-crawl.
2. Tunggu beberapa hari–minggu untuk lihat impression baru muncul di GSC
   (posisi lama sempat di ranking 30-70, dengan halaman balik + konten lebih
   lengkap dari sebelumnya, harusnya bisa naik posisi pelan-pelan).

## Yang belum dikerjakan (scope untuk nanti kalau perlu)
- Versi Inggris (`/en/...`) untuk halaman tools — saat ini semua tools baru ID-only
- Tools tambahan yang dulu ada tapi datanya minim di CSV (dev tools, random generator)
  tidak dikembalikan dulu supaya fokus ke yang terbukti ada demand
