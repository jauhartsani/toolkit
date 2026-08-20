/**
 * api/_lib/platforms/twitter.js
 * Urutan: vxtwitter.com API -> api.fxtwitter.com API (mirror/alternatif
 * dengan skema JSON serupa, fallback kalau vxtwitter down/rate-limit) ->
 * Cobalt.
 * Header disamakan dengan extractor lain (UA desktop + Accept eksplisit)
 * supaya konsisten diperlakukan sebagai request browser biasa, bukan cuma
 * header default generik.
 */

const { fetchJson, browserHeaders } = require('../http');
const { cobaltExtract } = require('../cobalt');

function mediaListFromVx(data) {
  const mediaList = data.media_extended || data.mediaURLs || [];
  return mediaList.map((m, i) => {
    if (typeof m === 'string') {
      return { label: `Media ${i + 1}`, type: 'video', url: m, filesize_approx: null };
    }
    const label = m.type === 'video' ? 'Video' : m.type === 'gif' ? 'GIF' : `Foto ${i + 1}`;
    const type = m.type === 'photo' ? 'photo' : 'video'; // GIF X disajikan sebagai file mp4
    return { label, type, url: m.url, filesize_approx: null };
  });
}

async function viaVxTwitter(url) {
  // vxtwitter.com punya bentuk URL sama seperti twitter.com/x.com, cukup
  // ganti hostnya.
  const api = url.replace(/https?:\/\/(www\.)?(twitter|x)\.com/i, 'https://api.vxtwitter.com');
  const { ok, status, data } = await fetchJson(api, { headers: browserHeaders('x') }, 12000);
  if (!ok) throw new Error(`vxtwitter.com merespons status ${status}.`);
  if (!data || data.error) {
    throw new Error((data && data.error) || 'vxtwitter.com tidak mengembalikan data valid.');
  }

  const formats = mediaListFromVx(data);
  if (!formats.length) throw new Error('Post ini tidak punya media (video/foto/GIF).');

  const mediaList = data.media_extended || data.mediaURLs || [];
  return {
    title: data.text || 'Post X (Twitter)',
    thumbnail: mediaList[0]?.thumbnail_url || null,
    duration: mediaList[0]?.duration_millis ? mediaList[0].duration_millis / 1000 : null,
    uploader: data.user_screen_name || data.user_name || null,
    formats,
  };
}

// api.fxtwitter.com — mirror dengan tujuan sama (perbaiki embed Discord/
// Telegram), skema respons beda dari vxtwitter (dibungkus di field
// "tweet"), tapi tetap punya media_extended dengan bentuk yang sama.
// Dipakai sebagai fallback independen: kalau vxtwitter.com sedang down
// atau kena rate-limit, ini instance yang beda tim & infra, jadi
// peluang keduanya down bersamaan jauh lebih kecil.
async function viaFxTwitter(url) {
  const api = url.replace(/https?:\/\/(www\.)?(twitter|x)\.com/i, 'https://api.fxtwitter.com');
  const { ok, status, data } = await fetchJson(api, { headers: browserHeaders('x') }, 12000);
  if (!ok || !data || data.code !== 200 || !data.tweet) {
    throw new Error(`api.fxtwitter.com merespons status ${status} tanpa data tweet yang valid.`);
  }

  const tweet = data.tweet;
  const mediaItems = tweet.media?.all || [];
  if (!mediaItems.length) throw new Error('Post ini tidak punya media (video/foto/GIF).');

  const formats = mediaItems.map((m, i) => {
    const isVideoLike = m.type === 'video' || m.type === 'gif';
    const label = m.type === 'video' ? 'Video' : m.type === 'gif' ? 'GIF' : `Foto ${i + 1}`;
    return { label, type: isVideoLike ? 'video' : 'photo', url: m.url, filesize_approx: null };
  });

  return {
    title: tweet.text || 'Post X (Twitter)',
    thumbnail: mediaItems[0]?.thumbnail_url || null,
    duration: mediaItems[0]?.duration ? mediaItems[0].duration : null,
    uploader: tweet.author?.screen_name || tweet.author?.name || null,
    formats,
  };
}

async function extractTwitter(url, { audioOnly } = {}) {
  const namedAttempts = [
    ['vxtwitter', () => viaVxTwitter(url)],
    ['fxtwitter', () => viaFxTwitter(url)],
    ['cobalt', () => cobaltExtract(url, { audioOnly })],
  ];

  const attemptErrors = [];
  for (const [name, attempt] of namedAttempts) {
    try {
      return await attempt();
    } catch (e) {
      attemptErrors.push(`[${name}] ${e.message}`);
    }
  }

  throw new Error(`Semua metode ekstraksi X (Twitter) gagal. Detail tiap metode: ${attemptErrors.join(' | ')}`);
}

module.exports = { extractTwitter };
