/**
 * api/_lib/proxy-url.js
 * Semua link download akhirnya lewat /api/media (bukan link CDN langsung),
 * karena TikTok/Instagram/Facebook/X memblokir hotlink tanpa
 * header Referer yang cocok. /api/media yang menambahkan Referer yang
 * benar per-platform dan memaksa file benar-benar ke-download.
 *
 * `type` (video/photo/audio) ikut dikirim sebagai hint — dipakai
 * /api/media sebagai fallback penentu ekstensi file kalau header
 * Content-Type dari CDN sumbernya ambigu/kosong.
 */
function toProxyUrl(directUrl, platform, filename, type, opts) {
  const params = new URLSearchParams({ url: directUrl, platform });
  if (filename) params.set('filename', filename);
  if (type) params.set('type', type);
  // dl=1 -> /api/media mengirim Content-Disposition: attachment (dipakai
  // tombol Download). Tanpa dl -> "inline", supaya bisa dipakai langsung
  // sebagai src <img> preview thumbnail.
  if (opts && opts.download) params.set('dl', '1');
  return `/api/media?${params.toString()}`;
}

module.exports = { toProxyUrl };
