/**
 * api/_lib/platforms/tiktok.js
 * Urutan: tikwm.com API (utama, paling stabil, sekalian hilangkan
 * watermark) -> scraping langsung halaman TikTok -> Cobalt (fallback
 * terakhir).
 *
 * Scraping langsung disamakan dengan teknik yang sudah terbukti jalan di
 * proyek toolkit sebelumnya: resolve short-link (vt./vm.tiktok.com) dulu,
 * cek interstitial anti-bot ("verify to continue") sebelum parsing, dan
 * coba dua script tag berbeda (__UNIVERSAL_DATA_FOR_REHYDRATION__ lalu
 * SIGI_STATE) karena TikTok memakai keduanya tergantung wilayah/eksperimen.
 */

const { fetchJson, fetchText, resolveRedirect, browserHeaders } = require('../http');
const { cobaltExtract } = require('../cobalt');

async function resolveShortLink(url) {
  if (!/vt\.tiktok\.com|vm\.tiktok\.com/i.test(url)) return url;
  return resolveRedirect(url, { headers: browserHeaders('tiktok') }, 10000);
}

// TikTok's bot-check interstitial ("verify to continue" / captcha page)
// returns 200 with real HTML, so a status check alone won't catch it —
// it has to be detected from page content instead.
function looksLikeBotWall(html) {
  return /verify to continue|secsdk-captcha|captcha_verify_container|"statusCode":10201|__tea_cache_wait/i.test(html);
}

function extractUniversalData(html) {
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const scope = data?.__DEFAULT_SCOPE__ || {};
    const detail = scope['webapp.video-detail'] || scope['webapp.photo-detail'];
    return detail?.itemInfo?.itemStruct || null;
  } catch {
    return null;
  }
}

// Legacy/alternate embed used by some TikTok surfaces/regions.
function extractSigiState(html) {
  const match = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const modules = data?.ItemModule || {};
    const firstKey = Object.keys(modules)[0];
    return firstKey ? modules[firstKey] : null;
  } catch {
    return null;
  }
}

function itemToResult(item) {
  const formats = [];

  if (item.imagePost && Array.isArray(item.imagePost.images)) {
    item.imagePost.images.forEach((img, i) => {
      const src = img?.imageURL?.urlList?.[0];
      if (src) formats.push({ label: `Foto ${i + 1}`, type: 'photo', url: src, filesize_approx: null });
    });
  } else if (item.video) {
    const playUrl = item.video.playAddr || item.video.downloadAddr;
    if (playUrl) formats.push({ label: 'Video', type: 'video', url: playUrl, filesize_approx: null });
  }
  if (item.music && item.music.playUrl) {
    formats.push({ label: 'Audio (MP3)', type: 'audio', url: item.music.playUrl, filesize_approx: null });
  }
  if (!formats.length) throw new Error('Tidak ada media yang bisa diekstrak dari halaman TikTok.');

  return {
    title: item.desc || 'Video TikTok',
    thumbnail: item.video?.cover || item.video?.originCover || null,
    duration: item.video?.duration || null,
    uploader: item.author?.nickname || item.author?.uniqueId || null,
    formats,
  };
}

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
      formats.push({ label: `Foto ${i + 1}`, type: 'photo', url: imgUrl, filesize_approx: null });
    });
  } else {
    if (d.play) formats.push({ label: 'Video HD (tanpa watermark)', type: 'video', url: d.play, filesize_approx: d.size || null });
    if (d.hdplay && d.hdplay !== d.play) {
      formats.push({ label: 'Video HD Alt', type: 'video', url: d.hdplay, filesize_approx: d.hd_size || null });
    }
    if (d.wmplay) formats.push({ label: 'Video (dengan watermark)', type: 'video', url: d.wmplay, filesize_approx: null });
  }
  if (d.music) formats.push({ label: 'Audio (MP3)', type: 'audio', url: d.music, filesize_approx: null });

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
  const cleanUrl = await resolveShortLink(url);
  const { ok, body } = await fetchText(cleanUrl, { headers: browserHeaders('tiktok') }, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman TikTok.');

  if (looksLikeBotWall(body)) {
    throw new Error(
      'TikTok menampilkan halaman verifikasi anti-bot untuk request ini (lebih sering terjadi dari IP server/cloud) — bukan karena link-nya salah.'
    );
  }

  const item = extractUniversalData(body) || extractSigiState(body);
  if (!item) throw new Error('Struktur data video/foto TikTok tidak ditemukan di halaman.');

  return itemToResult(item);
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
