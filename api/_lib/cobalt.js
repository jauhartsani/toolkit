/**
 * Shared last-resort fallback for every downloader endpoint (TikTok,
 * Instagram, Facebook, X, YouTube).
 *
 * Cobalt (https://github.com/imputnet/cobalt) is an open-source media
 * resolver. Public instances accept a URL for almost any major platform and
 * hand back a direct, playable stream — it re-extracts the clip itself, so
 * it keeps working even when a platform's own page structure changes or
 * blocks datacenter IPs (a common failure mode for TikTok/Instagram when
 * called from serverless functions).
 *
 * Kept underscore-prefixed (api/_lib) so Vercel does not deploy it as its
 * own route — it's a plain module other /api/*.js files import.
 */

// Multiple public instances are tried in order; if the first is down/rate
// limited, the next is used automatically.
const COBALT_INSTANCES = [
  'https://co.otomir23.me/',
  'https://cobalt-api.kwiatekmiki.pl/',
  'https://dl.khyza.my.id/',
];

async function tryCobaltInstance(baseUrl, url, mode) {
  const body = mode === 'audio'
    ? { url, downloadMode: 'audio', audioFormat: 'mp3', filenameStyle: 'basic' }
    : { url, videoQuality: 'max', filenameStyle: 'basic' };

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json().catch(() => null);
  if (!data) return null;

  if (data.status === 'error') {
    throw new Error(`Cobalt error: ${data.error?.code || 'unknown'}`);
  }

  if (data.status === 'tunnel' || data.status === 'redirect') {
    return {
      media: [{
        type: mode === 'audio' ? 'audio' : 'video',
        url: data.url,
        thumbnail: null,
      }],
      title: (data.filename || '').replace(/\.[^.]+$/, '') || null,
    };
  }

  if (data.status === 'picker' && Array.isArray(data.picker)) {
    const media = data.picker.map((item) => ({
      type: item.type === 'video' ? 'video' : 'photo',
      url: item.url,
      thumbnail: item.thumb || item.url,
    }));
    if (!media.length) return null;
    return { media, title: (data.filename || '').replace(/\.[^.]+$/, '') || null };
  }

  return null;
}

// Tries every configured instance in order; returns { media, title } or null
// if all instances fail / can't resolve this URL.
async function tryCobalt(url, mode = 'video') {
  for (const instance of COBALT_INSTANCES) {
    try {
      const result = await tryCobaltInstance(instance, url, mode);
      if (result && result.media && result.media.length) return result;
    } catch {
      // try next instance
    }
  }
  return null;
}

module.exports = { tryCobalt };
