/**
 * api/_lib/proxy-url.js
 * Semua link download akhirnya lewat /api/media (bukan link CDN langsung),
 * karena TikTok/Instagram/Facebook/X/YouTube memblokir hotlink tanpa
 * header Referer yang cocok. /api/media yang menambahkan Referer yang
 * benar per-platform dan memaksa file benar-benar ke-download.
 */
function toProxyUrl(directUrl, platform, filename) {
  const params = new URLSearchParams({ url: directUrl, platform });
  if (filename) params.set('filename', filename);
  return `/api/media?${params.toString()}`;
}

module.exports = { toProxyUrl };
