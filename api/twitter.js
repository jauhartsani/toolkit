/**
 * GET /api/twitter?url=<twitter.com or x.com status url>
 *
 * Fallback chain:
 *   1. vxtwitter.com API — an open-source, no-auth-required JSON mirror of
 *      a tweet's media (video/GIF/photos). Simple, fast, reliable — this is
 *      the primary method.
 *   2. Cobalt (public resolver, shared across all downloaders on this
 *      site) — last resort.
 *
 * Returned media points through /api/media so the download bypasses
 * Twitter/X's CDN hotlink protection.
 */

const { tryCobalt } = require('./_lib/cobalt');
const { toProxyUrl } = require('./_lib/proxy');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function parseTweet(raw) {
  const u = new URL(raw);
  const host = u.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
  if (!/^(twitter\.com|x\.com)$/.test(host)) throw new Error('That does not look like an X (Twitter) link.');
  const match = u.pathname.match(/\/([^/]+)\/status\/(\d+)/);
  if (!match) throw new Error('Could not find a status/tweet id in this link.');
  return { username: match[1], tweetId: match[2] };
}

async function tryVxTwitter(username, tweetId) {
  const res = await fetch(`https://api.vxtwitter.com/${username}/status/${tweetId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;

  const items = data.media_extended || data.media || [];
  const videoItem = items.find((m) => m.type === 'video' || m.type === 'gif');
  const photoItems = items.filter((m) => m.type === 'image');

  const media = [];
  if (videoItem) {
    media.push({ type: 'video', url: toProxyUrl(videoItem.url, 'video', 'x-video'), thumbnail: videoItem.thumbnail_url || null });
  }
  photoItems.forEach((img, i) => {
    media.push({ type: 'photo', url: toProxyUrl(img.url, 'image', `x-photo-${i + 1}`), thumbnail: img.url });
  });

  return media.length ? media : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    const { username, tweetId } = parseTweet(rawUrl);

    let media = await tryVxTwitter(username, tweetId).catch(() => null);

    if (!media) {
      const cobalt = await tryCobalt(rawUrl, 'video').catch(() => null);
      if (cobalt) {
        media = cobalt.media.map((m, i) => ({ type: m.type, url: toProxyUrl(m.url, m.type === 'photo' ? 'image' : m.type, `x-${m.type}-${i + 1}`), thumbnail: m.thumbnail || null }));
      }
    }

    if (!media || !media.length) {
      res.status(422).json({
        success: false,
        error: 'No downloadable video or photo was found in this post. It may be text-only, private, or deleted.',
      });
      return;
    }

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
