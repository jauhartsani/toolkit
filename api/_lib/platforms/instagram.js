/**
 * api/_lib/platforms/instagram.js
 * Urutan: halaman post publik (og:meta + JSON-LD carousel) -> halaman
 * embed publik "/embed/captioned/" -> Cobalt.
 *
 * Disamakan dengan teknik yang sudah terbukti jalan di proyek toolkit
 * sebelumnya: Instagram semakin sering menampilkan anonymous "log in to
 * continue" wall (status 200, HTML asli — bukan error) ke request tanpa
 * cookie/JS, dan itu sekarang jadi penyebab #1 kegagalan, lebih sering
 * daripada post-nya beneran hilang. Kalau tidak dideteksi secara eksplisit,
 * halaman login itu bisa salah kebaca "berhasil" (og:image generik logo
 * Instagram) padahal bukan media post yang diminta.
 */

const { fetchText, browserHeaders } = require('../http');
const { cobaltExtract } = require('../cobalt');

function normalizeInstagramUrl(raw) {
  const u = new URL(raw);
  if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) {
    throw new Error('Link ini bukan link Instagram.');
  }
  return { url: `https://www.instagram.com${u.pathname}`, pathname: u.pathname };
}

// /p/{code}/, /reel/{code}/, /reels/{code}/, /tv/{code}/ -> {code}
function extractShortcode(pathname) {
  const match = pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

// Instagram's anonymous "log in to continue" wall has consistent markers
// regardless of exact copy/locale — detect it so we can report the real
// cause instead of a generic "no media found", and so we don't accidentally
// treat its generic logo image as a successful extraction.
function looksLikeLoginWall(html) {
  return /Log in to Instagram|loginForm|Log in \u2022 Instagram|"require_login"\s*:\s*true/i.test(html);
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\u0026/g, '&');
}

function metaContent(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

function extractFromMeta(html) {
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

  // Carousel: cari og:image tambahan kalau ada (best-effort)
  if (!videoUrl) {
    const allImages = [...html.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map((m) => decodeEntities(m[1]));
    if (allImages.length > 1) {
      allImages.forEach((imgUrl, i) => {
        if (i === 0) return; // sudah masuk di atas
        formats.push({ label: `Foto ${i + 1}`, url: imgUrl, filesize_approx: null });
      });
    }
  }

  return {
    title,
    thumbnail: imageUrl,
    duration: null,
    uploader: description ? description.split(' on ')[0].replace(/^"/, '') : null,
    formats,
  };
}

function extractCarouselFromJsonLd(html) {
  const media = [];
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of scripts) {
    try {
      const data = JSON.parse(raw);
      const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
      images.forEach((img) => media.push(typeof img === 'string' ? img : img.url));
    } catch {
      /* ignore malformed blocks */
    }
  }
  return media;
}

async function fetchInstagramHtml(url, referer) {
  return fetchText(url, { headers: browserHeaders('instagram', referer) }, 12000);
}

async function viaPublicPage(url) {
  const { ok, status, body } = await fetchInstagramHtml(url);
  if (!ok && status !== 200) throw new Error(`Instagram merespons status ${status}. Post mungkin private atau dihapus.`);

  if (looksLikeLoginWall(body)) {
    throw new Error('LOGIN_WALL');
  }

  const result = extractFromMeta(body);
  if (!result) throw new Error('Media tidak ditemukan di halaman post.');

  const carousel = extractCarouselFromJsonLd(body);
  if (carousel.length > 1 && !result.formats.some((f) => f.label === 'Video')) {
    result.formats = carousel.map((u, i) => ({ label: `Foto ${i + 1}`, url: u, filesize_approx: null }));
  }
  return result;
}

// The /embed/captioned/ page is a lighter-weight public render Instagram
// exposes for embedding posts on third-party sites. For posts that are
// still public, it sometimes stays accessible even when the main page
// redirects anonymous requests to a login wall.
async function viaEmbedPage(url, shortcode) {
  const embedUrl = shortcode
    ? `https://www.instagram.com/p/${shortcode}/embed/captioned/`
    : url.replace(/\/?(\?.*)?$/, '/embed/captioned/');
  const { ok, body } = await fetchInstagramHtml(embedUrl, 'https://www.instagram.com/');
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Instagram.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');

  const fromMeta = extractFromMeta(body);
  if (fromMeta) return fromMeta;

  // Fallback: beberapa embed page cuma taruh URL media di inline JS
  // sebagai raw string, bukan og: tag.
  const videoJsMatch = body.match(/"video_url":"([^"]+)"/);
  const imageJsMatch = body.match(/"display_url":"([^"]+)"/);
  if (videoJsMatch) {
    return {
      title: 'Post Instagram',
      thumbnail: imageJsMatch ? decodeEntities(imageJsMatch[1]) : null,
      duration: null,
      uploader: null,
      formats: [{ label: 'Video', url: decodeEntities(videoJsMatch[1]), filesize_approx: null }],
    };
  }
  if (imageJsMatch) {
    return {
      title: 'Post Instagram',
      thumbnail: null,
      duration: null,
      uploader: null,
      formats: [{ label: 'Foto', url: decodeEntities(imageJsMatch[1]), filesize_approx: null }],
    };
  }

  throw new Error('Media tidak ditemukan di halaman embed.');
}

async function extractInstagram(url, { audioOnly } = {}) {
  const { url: cleanUrl, pathname } = normalizeInstagramUrl(url);
  const shortcode = extractShortcode(pathname);

  let sawLoginWall = false;
  const attempts = [
    () => viaPublicPage(cleanUrl),
    () => viaEmbedPage(cleanUrl, shortcode),
    () => cobaltExtract(cleanUrl, { audioOnly }),
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      if (e.message === 'LOGIN_WALL') sawLoginWall = true;
      lastErr = e;
    }
  }

  if (sawLoginWall) {
    throw new Error(
      'Instagram menampilkan halaman "log in to continue" untuk link ini alih-alih post aslinya — ini kebijakan Instagram sendiri (makin sering terjadi untuk request tanpa login) dan bukan berarti link-nya salah/private.'
    );
  }
  throw lastErr || new Error('Semua metode ekstraksi Instagram gagal.');
}

module.exports = { extractInstagram };
