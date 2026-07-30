/**
 * GET /api/youtube?url=<youtube video/shorts url>&type=video|audio
 *
 * YouTube's own page no longer exposes a stable, unauthenticated direct
 * stream URL worth scraping (its player config rotates constantly and is
 * one of the most aggressively protected of any platform this site
 * touches). So this endpoint uses Cobalt (the same public resolver used as
 * a fallback everywhere else on this site) as the PRIMARY extraction
 * method here, and enriches the result with real title/author/thumbnail
 * from YouTube's public oEmbed endpoint (no key required).
 *
 * type=video (default) returns an MP4 download; type=audio returns an
 * MP3-only extraction. Both go through /api/media so the download works
 * from our own origin.
 */

const { tryCobalt } = require('./_lib/cobalt');
const { toProxyUrl } = require('./_lib/proxy');

function normalizeYouTubeUrl(raw) {
  const u = new URL(raw);
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (!/^(youtube\.com|youtu\.be)$/.test(host)) {
    throw new Error('That does not look like a YouTube link.');
  }
  return raw;
}

async function fetchOEmbedMeta(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  const type = req.query.type === 'audio' ? 'audio' : 'video';
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    const cleanUrl = normalizeYouTubeUrl(rawUrl);

    const [cobalt, meta] = await Promise.all([
      tryCobalt(cleanUrl, type).catch(() => null),
      fetchOEmbedMeta(cleanUrl),
    ]);

    if (!cobalt || !cobalt.media.length) {
      res.status(422).json({
        success: false,
        error: 'Could not fetch this video. It may be age-restricted, region-locked, members-only, or unavailable.',
      });
      return;
    }

    const filenameBase = (meta?.title || `youtube-${type}`).slice(0, 60);
    const media = cobalt.media.map((m) => ({
      type: m.type,
      url: toProxyUrl(m.url, m.type, filenameBase),
      thumbnail: meta?.thumbnail_url || m.thumbnail || null,
      title: meta?.title || null,
      author: meta?.author_name || null,
    }));

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
