/**
 * api/_lib/platforms/instagram.js
 * Urutan: halaman post publik (og:meta + JSON-LD + inline video URL) ->
 * halaman embed publik "/embed/captioned/" -> Cobalt.
 *
 * Disamakan dengan teknik yang sudah terbukti jalan di proyek toolkit
 * sebelumnya: Instagram semakin sering menampilkan anonymous "log in to
 * continue" wall (status 200, HTML asli — bukan error) ke request tanpa
 * cookie/JS, dan itu sekarang jadi penyebab #1 kegagalan, lebih sering
 * daripada post-nya beneran hilang. Kalau tidak dideteksi secara eksplisit,
 * halaman login itu bisa salah kebaca "berhasil" (og:image generik logo
 * Instagram) padahal bukan media post yang diminta.
 *
 * PENTING (bug Reels yang diperbaiki di sini): untuk Reels, Instagram
 * sering TIDAK menaruh tag <meta property="og:video"> di halaman utama
 * sama sekali — cuma og:image (thumbnail). Kalau extractor cuma ngecek
 * og:video lalu jatuh ke og:image begitu og:video kosong, hasilnya salah:
 * yang ke-download jadi FOTO thumbnail, padahal post-nya video. Untuk
 * menghindari ini, extractor sekarang eksplisit menentukan dulu apakah
 * post ini video (dari og:type, JSON-LD VideoObject, atau flag
 * "is_video") SEBELUM memutuskan format apa yang dikembalikan — kalau
 * kedeteksi video tapi link videonya tidak ketemu di halaman utama, dia
 * tidak menyerah ke foto, melainkan lanjut ke fallback halaman embed yang
 * punya kemungkinan lebih besar expose link video-nya.
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

// Menentukan apakah post ini video (Reel/IGTV/video biasa) berdasarkan
// beberapa sinyal independen — dipakai supaya kita tahu "ini seharusnya
// video" walaupun tag og:video-nya sendiri tidak ada di halaman.
function isVideoPost(html, pathname) {
  if (/\/(?:reel|reels|tv)\//i.test(pathname || '')) return true; // URL-nya sendiri sudah nunjukin Reel/IGTV
  if (/<meta[^>]+property=["']og:video["']/i.test(html)) return true;
  if (/<meta[^>]+property=["']og:type["'][^>]+content=["'][^"']*video[^"']*["']/i.test(html)) return true;
  if (/"@type"\s*:\s*"VideoObject"/i.test(html)) return true;
  if (/"is_video"\s*:\s*true/i.test(html)) return true;
  return false;
}

function extractJsonLdVideoUrl(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of scripts) {
    try {
      const data = JSON.parse(raw);
      if (data.video && data.video.contentUrl) return data.video.contentUrl;
      if (data['@type'] === 'VideoObject' && data.contentUrl) return data.contentUrl;
    } catch {
      /* ignore malformed blocks */
    }
  }
  return null;
}

function extractInlineVideoUrl(html) {
  const m = html.match(/"video_url":"([^"]+)"/);
  return m ? decodeEntities(m[1]) : null;
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

async function viaPublicPage(url, pathname) {
  const { ok, status, body } = await fetchInstagramHtml(url);
  if (!ok && status !== 200) throw new Error(`Instagram merespons status ${status}. Post mungkin private atau dihapus.`);
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');

  const title = metaContent(body, 'og:title') || 'Post Instagram';
  const description = metaContent(body, 'og:description');
  const imageUrl = metaContent(body, 'og:image');
  const uploader = description ? description.split(' on ')[0].replace(/^"/, '') : null;

  const videoLikely = isVideoPost(body, pathname);
  const videoUrl =
    metaContent(body, 'og:video') ||
    metaContent(body, 'og:video:secure_url') ||
    (videoLikely ? extractJsonLdVideoUrl(body) || extractInlineVideoUrl(body) : null);

  if (videoLikely && !videoUrl) {
    // Ini Reel/IGTV/video tapi halaman utama tidak expose link videonya
    // secara langsung — JANGAN jatuh ke foto thumbnail, lempar error
    // supaya lanjut ke fallback embed page yang biasanya lebih terbuka.
    throw new Error('Post ini video tapi link langsungnya tidak ada di halaman utama.');
  }

  if (videoUrl) {
    return { title, thumbnail: imageUrl, duration: null, uploader, formats: [{ label: 'Video', type: 'video', url: videoUrl, filesize_approx: null }] };
  }

  if (!imageUrl) throw new Error('Media tidak ditemukan di halaman post.');

  const carousel = extractCarouselFromJsonLd(body);
  const formats =
    carousel.length > 1
      ? carousel.map((u, i) => ({ label: `Foto ${i + 1}`, type: 'photo', url: u, filesize_approx: null }))
      : [{ label: 'Foto', type: 'photo', url: imageUrl, filesize_approx: null }];

  return { title, thumbnail: imageUrl, duration: null, uploader, formats };
}

// The /embed/captioned/ page is a lighter-weight public render Instagram
// exposes for embedding posts on third-party sites. For posts that are
// still public, it sometimes stays accessible even when the main page
// redirects anonymous requests to a login wall — and for Reels, it more
// often exposes a raw "video_url" in its inline JS than the main page does.
async function viaEmbedPage(url, shortcode) {
  const embedUrl = shortcode
    ? `https://www.instagram.com/p/${shortcode}/embed/captioned/`
    : url.replace(/\/?(\?.*)?$/, '/embed/captioned/');
  const { ok, body } = await fetchInstagramHtml(embedUrl, 'https://www.instagram.com/');
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Instagram.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');

  // Cek video dulu (raw JS "video_url"), baru gambar — supaya konten video
  // tidak kembali ketuker jadi foto pada fallback ini juga.
  const videoJsMatch = body.match(/"video_url":"([^"]+)"/);
  const videoMeta = metaContent(body, 'og:video') || metaContent(body, 'og:video:secure_url');
  const videoUrl = videoMeta || (videoJsMatch ? decodeEntities(videoJsMatch[1]) : null);

  const imageJsMatch = body.match(/"display_url":"([^"]+)"/);
  const imageUrl = metaContent(body, 'og:image') || (imageJsMatch ? decodeEntities(imageJsMatch[1]) : null);
  const title = metaContent(body, 'og:title') || 'Post Instagram';

  if (videoUrl) {
    return { title, thumbnail: imageUrl, duration: null, uploader: null, formats: [{ label: 'Video', type: 'video', url: videoUrl, filesize_approx: null }] };
  }
  if (imageUrl) {
    return { title, thumbnail: imageUrl, duration: null, uploader: null, formats: [{ label: 'Foto', type: 'photo', url: imageUrl, filesize_approx: null }] };
  }

  throw new Error('Media tidak ditemukan di halaman embed.');
}

async function extractInstagram(url, { audioOnly } = {}) {
  const { url: cleanUrl, pathname } = normalizeInstagramUrl(url);
  const shortcode = extractShortcode(pathname);

  let sawLoginWall = false;
  const attempts = [
    () => viaPublicPage(cleanUrl, pathname),
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
