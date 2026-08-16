// middleware.mjs — Vercel Routing Middleware
//
// Auto-redirect visitor ke versi bahasa yang sesuai berdasarkan negara asal
// (geolocation dari IP, disediakan gratis oleh Vercel — tidak perlu servis
// pihak ketiga). Visitor dari Indonesia -> halaman ID (root). Visitor dari
// luar Indonesia -> halaman /en/.
//
// Kalau visitor pernah klik tombol ganti bahasa manual (lihat assets/main.js
// setupLanguageSwitcher), pilihan itu disimpan di cookie `lang` dan SELALU
// dihormati — middleware ini tidak akan menimpa pilihan manual tsb.
//
// /blog/* sengaja TIDAK disentuh karena kontennya cuma ada versi Indonesia
// (belum ada /en/blog/), jadi tidak ada halaman EN untuk dialihkan.

import { geolocation, next } from '@vercel/functions';

export const config = {
  // Jalan di semua path KECUALI: api routes, assets statis, blog, dan file
  // infra (favicon/robots/sitemap).
  matcher: ['/((?!api/|assets/|blog/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)'],
};

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const { pathname } = url;
  const isEnPath = pathname === '/en' || pathname.startsWith('/en/');

  const cookieLang = getCookie(request, 'lang'); // 'id' | 'en' | null

  let targetLang = cookieLang;
  if (!targetLang) {
    const { country } = geolocation(request);
    // country undefined biasanya cuma pas dev lokal (vercel dev) — kalau
    // gitu jangan redirect, biarin apa adanya.
    if (!country) return next();
    targetLang = country === 'ID' ? 'id' : 'en';
  }

  const shouldBeEn = targetLang === 'en';
  if (shouldBeEn === isEnPath) return next(); // sudah di bahasa yang tepat

  url.pathname = shouldBeEn ? '/en' + pathname : (pathname.replace(/^\/en/, '') || '/');

  const res = Response.redirect(url, 307);
  if (!cookieLang) {
    // Simpan hasil deteksi geo supaya kunjungan berikutnya konsisten walau
    // IP berubah dikit (mis. pindah wifi/data), dan supaya middleware tidak
    // perlu geolocation lookup di setiap request.
    res.headers.append(
      'Set-Cookie',
      `lang=${targetLang}; Path=/; Max-Age=31536000; SameSite=Lax`
    );
  }
  return res;
}
