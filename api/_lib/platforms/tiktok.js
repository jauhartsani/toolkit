/**
 * api/_lib/platforms/tiktok.js
 * Urutan: tikwm.com API (utama, paling stabil) -> scraping langsung
 * halaman TikTok (SIGI_STATE JSON) -> Cobalt (fallback terakhir).
 */

const { fetchJson, fetchText } = require('../http');
const { cobaltExtract } = require('../cobalt');

async function viaTikwm(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const { ok, data } = await fetchJson(api, {}, 12000);
  if (!ok || !data || data.code !== 0 || !data.data) {
    throw new Error('tikwm.com tidak mengembalikan data valid.');
  }
  const d = data.data;
  const formats = [];

  // Post foto (slideshow) tidak punya video, hanya array gambar
  if (Array.isArray(d.images) && d.images.length) {
    d.images.forEach((imgUrl, i) => {
      formats.push({ label: `Foto ${i + 1}`, url: imgUrl, filesize_approx: null });
    });
  } else {
    if (d.play) formats.push({ label: 'Video HD (tanpa watermark)', url: d.play, filesize_approx: d.size || null });
    if (d.hdplay && d.hdplay !== d.play) {
      formats.push({ label: 'Video HD Alt', url: d.hdplay, filesize_approx: d.hd_size || null });
    }
    if (d.wmplay) formats.push({ label: 'Video (dengan watermark)', url: d.wmplay, filesize_approx: null });
  }
  if (d.music) formats.push({ label: 'Audio (MP3)', url: d.music, filesize_approx: null });

  if (!formats.length) throw new Error('tikwm.com tidak punya link media untuk konten ini.');

  return {
    title: d.title || 'Video TikTok',
    thumbnail: d.cover || d.origin_cover || null,
    duration: d.duration || null,
    uploader: (d.author && (d.author.nickname || d.author.unique_id)) || null,
    formats,
  };
}

async function viaPageScrape(url) {
  const { ok, body } = await fetchText(url, {}, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman TikTok.');

  const match = body.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error('Struktur data TikTok tidak ditemukan di halaman.');

  let json;
  try {
    json = JSON.parse(match[1]);
  } catch {
    throw new Error('Gagal parse data TikTok.');
  }

  const itemStruct =
    json?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  if (!itemStruct) throw new Error('Detail video TikTok tidak ditemukan.');

  const video = itemStruct.video || {};
  const playUrl = (video.playAddr) || (video.downloadAddr) || null;
  if (!playUrl) throw new Error('Link video TikTok tidak ditemukan di halaman.');

  return {
    title: itemStruct.desc || 'Video TikTok',
    thumbnail: video.cover || video.originCover || null,
    duration: video.duration || null,
    uploader: itemStruct.author?.nickname || itemStruct.author?.uniqueId || null,
    formats: [{ label: 'Video', url: playUrl, filesize_approx: null }],
  };
}

async function extractTiktok(url, { audioOnly } = {}) {
  const attempts = [() => viaTikwm(url), () => viaPageScrape(url), () => cobaltExtract(url, { audioOnly })];
  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Semua metode ekstraksi TikTok gagal.');
}

module.exports = { extractTiktok };
