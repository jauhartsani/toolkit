# Blog ToolkitMe — cara nambah artikel

Situs ini sengaja 100% static + serverless function (lihat `package.json`:
"Tidak ada dependency npm eksternal"), jadi blog-nya **bukan** CMS
server+database seperti WordPress. Ini CMS berbasis file: tulis artikel
dalam Markdown, jalankan satu perintah, dapat halaman HTML statis siap
deploy — tetap konsisten dengan arsitektur situs (gratis di-hosting di
Vercel, tanpa DB).

## Nambah artikel baru

1. Buat file baru di `content/blog/nama-slug-artikel.md`. Nama file jadi
   URL-nya, misalnya `content/blog/tips-download-hd.md` -> `/blog/tips-download-hd.html`.

2. Isi dengan format ini:

   ```md
   ---
   title: Judul Artikel Kamu
   description: Deskripsi 1-2 kalimat untuk meta tag & preview kartu blog.
   date: 2026-08-20
   ---

   Paragraf pembuka...

   ## Sub-judul

   Isi paragraf. Bisa **bold**, *italic*, [link](https://contoh.com),
   dan list:

   - Poin satu
   - Poin dua
   ```

   Field frontmatter yang didukung: `title`, `description`, `date`
   (format `YYYY-MM-DD`), dan opsional `draft: true` (draft tetap
   di-generate halamannya untuk dicek, tapi tidak muncul di `/blog/`
   atau `sitemap.xml` sampai dihapus/diset `false`).

3. Generate halamannya:

   ```bash
   node scripts/build-blog.js
   ```

   Ini otomatis:
   - Menulis `/blog/nama-slug-artikel.html`
   - Menulis ulang `/blog/index.html` (daftar semua artikel, terbaru dulu)
   - Menulis ulang `/sitemap.xml` (halaman utama + semua artikel published)

4. Deploy seperti biasa (push ke Vercel) — semua file yang dihasilkan
   sudah HTML statis biasa, tidak butuh build step di sisi Vercel.

## Edit atau hapus artikel

- **Edit**: ubah file `.md`-nya, jalankan lagi `node scripts/build-blog.js`.
- **Hapus**: hapus file `.md`-nya (dan file `.html` lama di `/blog/` kalau
  masih ada), lalu jalankan lagi `node scripts/build-blog.js` supaya index
  & sitemap ikut ter-update.

## Batasan sengaja (biar tetap simpel & sesuai arsitektur situs)

- Markdown yang didukung cuma subset umum: heading `##`/`###`, paragraf,
  `**bold**`, `*italic*`, `[link](url)`, list `- item` / `1. item`, dan
  `> quote`. Cukup untuk artikel panduan/how-to, bukan buat markdown
  kompleks (tabel, gambar embed, dll — bisa ditambah nanti kalau perlu).
- Blog ini baru versi Bahasa Indonesia saja. Nav "Blog" di halaman `/en/`
  saat ini juga mengarah ke blog Indonesia yang sama. Kalau nanti mau
  versi Inggris, tinggal duplikasi pola yang sama ke folder
  `content/blog-en/` + output `en/blog/` (butuh sedikit penyesuaian di
  `scripts/build-blog.js`, bukan infrastruktur baru).
- Tidak ada editor visual/WYSIWYG atau login admin — nambah artikel = commit
  file Markdown baru. Ini pilihan sadar supaya tidak perlu backend/database
  sama sekali (sesuai requirement awal situs ini tetap 100% static).
