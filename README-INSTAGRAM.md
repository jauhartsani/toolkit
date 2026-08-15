# ToolkitMe — Catatan Penting soal Instagram

## Kenapa Instagram sering gagal, padahal TikTok/YouTube kadang berhasil?

Instagram, beda dari TikTok dan YouTube, sekarang **hampir selalu** menutup akses
konten (bahkan yang publik) untuk permintaan yang tidak login. Ini bukan bug di
kode ToolkitMe — ini kebijakan Instagram sendiri, dan pesan error dari `yt-dlp`
("Instagram sent an empty media response... use --cookies") secara eksplisit
bilang solusinya cuma satu: pakai cookies dari akun yang sudah login.

## Cara aktifkan login lewat cookies (opsional)

**Peringatan dulu:**
- Pakai akun Instagram kedua/cadangan, **jangan** akun pribadi utamamu — akun
  yang dipakai buat automated request seperti ini berisiko kena rate-limit
  atau restriksi dari Instagram.
- Cookies ini disimpan sebagai *environment variable* di Vercel (bukan
  di-commit ke GitHub), supaya tidak ada yang bisa lihat isinya di repo publik.
- Cookies akan expired (biasanya beberapa minggu/bulan) dan perlu diganti ulang
  kalau Instagram minta login ulang.

**Langkah-langkah:**

1. Install ekstensi browser **"Get cookies.txt LOCALLY"** (Chrome/Firefox).
2. Login ke instagram.com pakai akun cadangan tadi.
3. Klik ekstensinya di halaman instagram.com, export cookies dalam format
   Netscape (`cookies.txt`).
4. Encode file itu ke base64. Di Windows PowerShell:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt")) | Set-Clipboard
   ```
   Hasilnya otomatis ke-copy ke clipboard.
5. Buka project Vercel kamu → **Settings → Environment Variables** → tambah:
   - Name: `COOKIES_INSTAGRAM`
   - Value: paste hasil base64 tadi
   - Environment: Production
6. Redeploy project (Vercel → Deployments → tombol "Redeploy").

Setelah ini, endpoint `/api/extract` otomatis pakai cookies tersebut khusus
untuk link Instagram. TikTok, YouTube, Facebook, X tidak butuh ini (kalaupun
suatu saat butuh, caranya sama: tinggal buat `COOKIES_TIKTOK`, dst).

## Kalau tidak mau setup cookies

Nggak masalah — biarkan Instagram downloader tetap ada di web sebagai fitur,
tapi kasih catatan kecil di halaman itu ("beberapa post mungkin butuh coba
lagi nanti") supaya user tidak bingung saat sesekali gagal. TikTok, YouTube,
Facebook, dan X seharusnya jauh lebih stabil tanpa cookies.
