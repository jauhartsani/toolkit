/**
 * api/_lib/platforms/facebook.js
 * Urutan: halaman embed plugins/video.php -> scraping halaman watch/reel
 * langsung -> Cobalt.
 */

const { fetchText } = require('../http');
const { cobaltExtract } = require('../cobalt');

function unescapeUnicode(str) {
  return str.replace(/\\u0025/g, '%').replace(/\\\//g, '/');
}

function findSrc(html, key) {
  const re = new RegExp(`"${key}":"([^"]+)"`);
  const m = html.match(re);
  return m ? unescapeUnicode(m[1]) : null;
}

function buildResult(html) {
  const hd = findSrc(html, 'browser_native_hd_url') || findSrc(html, 'hd_src');
  const sd = findSrc(html, 'browser_native_sd_url') || findSrc(html, 'sd_src');
  const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  const thumbMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);

  const formats = [];
  if (hd) formats.push({ label: 'Video HD', url: hd, filesize_approx: null });
  if (sd && sd !== hd) formats.push({ label: 'Video SD', url: sd, filesize_approx: null });
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
  const { ok, body } = await fetchText(embedUrl, {}, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Facebook.');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman embed.');
  return result;
}

async function viaDirectPage(url) {
  const { ok, body } = await fetchText(url, {}, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman Facebook.');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman watch/reel.');
  return result;
}

async function extractFacebook(url, { audioOnly } = {}) {
  const attempts = [() => viaEmbed(url), () => viaDirectPage(url), () => cobaltExtract(url, { audioOnly })];
  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Semua metode ekstraksi Facebook gagal.');
}

module.exports = { extractFacebook };
