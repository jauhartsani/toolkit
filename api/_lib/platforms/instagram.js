/**
 * api/_lib/platforms/instagram.js
 * Urutan: halaman post publik (og:meta + JSON-LD) -> halaman embed publik
 * -> Cobalt. Tidak butuh cookies/login untuk konten publik biasa
 * (berbeda dari versi yt-dlp sebelumnya yang sering diblokir Instagram).
 */

const { fetchText } = require('../http');
const { cobaltExtract } = require('../cobalt');

function metaContent(html, property) {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

function extractFromHtml(html) {
  const videoUrl = metaContent(html, 'og:video') || metaContent(html, 'og:video:secure_url');
  const imageUrl = metaContent(html, 'og:image');
  const title = metaContent(html, 'og:title') || 'Post Instagram';
  const description = metaContent(html, 'og:description');

  const formats = [];
  if (videoUrl) {
    formats.push({ label: 'Video', url: videoUrl, filesize_approx: null });
  } else if (imageUrl) {
    formats.push({ label: 'Foto', url: imageUrl, filesize_approx: null });
  }
  if (!formats.length) return null;

  // Carousel: cari beberapa og:image tambahan kalau ada (best-effort)
  const allImages = [...html.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map(
    (m) => m[1]
  );
  if (allImages.length > 1 && !videoUrl) {
    allImages.forEach((imgUrl, i) => {
      if (i === 0) return; // sudah masuk di atas
      formats.push({ label: `Foto ${i + 1}`, url: imgUrl.replace(/&amp;/g, '&'), filesize_approx: null });
    });
  }

  return {
    title,
    thumbnail: imageUrl,
    duration: null,
    uploader: description ? description.split(' on ')[0].replace(/^"/, '') : null,
    formats,
  };
}

async function viaPublicPage(url) {
  const { ok, body } = await fetchText(url, {}, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman Instagram.');
  const result = extractFromHtml(body);
  if (!result) throw new Error('Media tidak ditemukan di halaman post (mungkin private/butuh login).');
  return result;
}

async function viaEmbedPage(url) {
  const embedUrl = url.replace(/\/?(\?.*)?$/, '/embed/captioned/');
  const { ok, body } = await fetchText(embedUrl, {}, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Instagram.');
  const result = extractFromHtml(body);
  if (!result) throw new Error('Media tidak ditemukan di halaman embed.');
  return result;
}

async function extractInstagram(url, { audioOnly } = {}) {
  const attempts = [() => viaPublicPage(url), () => viaEmbedPage(url), () => cobaltExtract(url, { audioOnly })];
  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Semua metode ekstraksi Instagram gagal.');
}

module.exports = { extractInstagram };
