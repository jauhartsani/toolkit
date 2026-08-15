/**
 * api/_lib/platforms/facebook.js
 * Urutan: halaman embed plugins/video.php -> scraping halaman watch/reel
 * langsung -> Cobalt.
 *
 * Disamakan dengan pola yang terbukti jalan di scraper Instagram/TikTok
 * proyek toolkit sebelumnya: UA desktop + header browser lengkap (bukan UA
 * generik), resolve short-link fb.watch dulu sebelum di-scrape, dan deteksi
 * eksplisit halaman "log in to continue" Facebook (200 OK tapi bukan
 * konten videonya) supaya errornya jelas alih-alih "video tidak ditemukan".
 */

const { fetchText, resolveRedirect, browserHeaders } = require('../http');
const { cobaltExtract } = require('../cobalt');

function unescapeUnicode(str) {
  return str.replace(/\\u0025/g, '%').replace(/\\\//g, '/');
}

function findSrc(html, key) {
  const re = new RegExp(`"${key}":"([^"]+)"`);
  const m = html.match(re);
  return m ? unescapeUnicode(m[1]) : null;
}

function looksLikeLoginWall(html) {
  return /log in to (see|watch|continue)|You must log in|login_form/i.test(html);
}

async function resolveShortLink(url) {
  if (!/fb\.watch/i.test(url)) return url;
  return resolveRedirect(url, { headers: browserHeaders('facebook') }, 10000);
}

function buildResult(html) {
  const hd = findSrc(html, 'browser_native_hd_url') || findSrc(html, 'hd_src');
  const sd = findSrc(html, 'browser_native_sd_url') || findSrc(html, 'sd_src');
  const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  const thumbMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);

  const formats = [];
  if (hd) formats.push({ label: 'Video HD', type: 'video', url: hd, filesize_approx: null });
  if (sd && sd !== hd) formats.push({ label: 'Video SD', type: 'video', url: sd, filesize_approx: null });
  if (!formats.length) return null;

  return {
    title: titleMatch ? titleMatch[1] : 'Video Facebook',
    thumbnail: thumbMatch ? thumbMatch[1] : null,
    duration: null,
    uploader: null,
    formats,
  };
}

async function viaEmbed(url) {
  const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0`;
  const { ok, body } = await fetchText(embedUrl, { headers: browserHeaders('facebook', 'https://www.facebook.com/') }, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Facebook.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman embed.');
  return result;
}

async function viaDirectPage(url) {
  const cleanUrl = await resolveShortLink(url);
  const { ok, body } = await fetchText(cleanUrl, { headers: browserHeaders('facebook') }, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman Facebook.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman watch/reel.');
  return result;
}

async function extractFacebook(url, { audioOnly } = {}) {
  let sawLoginWall = false;
  const attempts = [() => viaEmbed(url), () => viaDirectPage(url), () => cobaltExtract(url, { audioOnly })];

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
      'Facebook menampilkan halaman "log in to continue" untuk video ini — video mungkin tidak sepenuhnya publik, atau Facebook membatasi akses tanpa login untuk konten ini.'
    );
  }
  throw lastErr || new Error('Semua metode ekstraksi Facebook gagal.');
}

module.exports = { extractFacebook };
