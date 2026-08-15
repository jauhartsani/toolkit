/**
 * api/_lib/platforms/youtube.js
 * Urutan: Cobalt (utama, karena halaman YouTube sendiri sangat sulit
 * di-scrape tanpa autentikasi) + metadata judul/thumbnail dari YouTube
 * oEmbed publik (tidak butuh API key).
 */

const { fetchJson } = require('../http');
const { cobaltExtract } = require('../cobalt');

async function getOembedMeta(url) {
  const api = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const { ok, data } = await fetchJson(api, {}, 8000);
  if (!ok || !data) return { title: 'Video YouTube', thumbnail: null, uploader: null };
  return {
    title: data.title || 'Video YouTube',
    thumbnail: data.thumbnail_url || null,
    uploader: data.author_name || null,
  };
}

async function extractYoutube(url, { audioOnly } = {}) {
  const [meta, media] = await Promise.all([
    getOembedMeta(url).catch(() => ({ title: 'Video YouTube', thumbnail: null, uploader: null })),
    cobaltExtract(url, { audioOnly }),
  ]);

  return {
    title: meta.title,
    thumbnail: meta.thumbnail,
    duration: null,
    uploader: meta.uploader,
    formats: media.formats,
  };
}

module.exports = { extractYoutube };
