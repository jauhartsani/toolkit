/**
 * api/_lib/platforms/twitter.js
 * Urutan: vxtwitter.com API (utama) -> Cobalt.
 * Header disamakan dengan extractor lain (UA desktop + Accept eksplisit)
 * supaya konsisten diperlakukan sebagai request browser biasa oleh
 * vxtwitter.com, bukan cuma header default generik.
 */

const { fetchJson, browserHeaders } = require('../http');
const { cobaltExtract } = require('../cobalt');

async function viaVxTwitter(url) {
  // vxtwitter.com punya bentuk URL sama seperti twitter.com/x.com, cukup
  // ganti hostnya.
  const api = url.replace(/https?:\/\/(www\.)?(twitter|x)\.com/i, 'https://api.vxtwitter.com');
  const { ok, status, data } = await fetchJson(api, { headers: browserHeaders('x') }, 12000);
  if (!ok) throw new Error(`vxtwitter.com merespons status ${status}.`);
  if (!data || data.error) {
    throw new Error((data && data.error) || 'vxtwitter.com tidak mengembalikan data valid.');
  }

  const mediaList = data.media_extended || data.mediaURLs || [];
  if (!mediaList.length) throw new Error('Post ini tidak punya media (video/foto/GIF).');

  const formats = mediaList.map((m, i) => {
    if (typeof m === 'string') {
      return { label: `Media ${i + 1}`, url: m, filesize_approx: null };
    }
    const label = m.type === 'video' ? 'Video' : m.type === 'gif' ? 'GIF' : `Foto ${i + 1}`;
    return { label, url: m.url, filesize_approx: null };
  });

  return {
    title: data.text || 'Post X (Twitter)',
    thumbnail: mediaList[0]?.thumbnail_url || null,
    duration: mediaList[0]?.duration_millis ? mediaList[0].duration_millis / 1000 : null,
    uploader: data.user_screen_name || data.user_name || null,
    formats,
  };
}

async function extractTwitter(url, { audioOnly } = {}) {
  const attempts = [() => viaVxTwitter(url), () => cobaltExtract(url, { audioOnly })];
  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Semua metode ekstraksi X (Twitter) gagal.');
}

module.exports = { extractTwitter };
