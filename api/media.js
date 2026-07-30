/**
 * GET /api/media?url=<encoded media url>&kind=video|audio|image&name=<filename>
 *
 * Every downloader on this site (TikTok, Instagram, Facebook, X, YouTube)
 * returns media URLs that point through THIS endpoint instead of linking to
 * the platform's CDN directly. Two problems this solves:
 *
 * 1. Hotlink protection. TikTok/Instagram/Facebook/Twitter/YouTube CDNs
 *    reject cross-site requests unless the `Referer` header matches their
 *    own site. A browser never sends that referer when a user clicks a link
 *    on our domain, so a direct CDN link 403s. This endpoint fetches the
 *    file server-side with the correct Referer, then re-streams it to the
 *    browser from our own origin.
 * 2. The HTML `download` attribute is silently ignored by browsers for
 *    cross-origin links — it just opens the file/tab instead of saving it.
 *    Serving through our own origin with `Content-Disposition: attachment`
 *    makes the download actually happen, with a sane filename.
 *
 * Also passes through Range requests so <video>/<audio> previews can seek
 * before the user commits to downloading.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Some CDNs gate hotlinking by Referer. Returns the right one, or '' if none is needed.
function getMediaReferer(url) {
  if (/googlevideo\.com|youtube\.com|ytimg\.com/.test(url)) return 'https://www.youtube.com/';
  if (/tiktok\.com|tiktokcdn|tiktokv\.com/.test(url)) return 'https://www.tiktok.com/';
  if (/tikwm\.com/.test(url)) return 'https://www.tikwm.com/';
  if (/twimg\.com|twitter\.com|x\.com/.test(url)) return 'https://x.com/';
  if (/facebook\.com|fb\.watch|fbcdn.*video/.test(url)) return 'https://www.facebook.com/';
  if (/cdninstagram\.com|fbcdn\.net|instagram\.com/.test(url)) return 'https://www.instagram.com/';
  return '';
}

function contentTypeFor(kind) {
  if (kind === 'audio') return 'audio/mpeg';
  if (kind === 'image') return 'image/jpeg';
  return 'video/mp4';
}

function safeFilename(name, kind) {
  const ext = kind === 'audio' ? 'mp3' : kind === 'image' ? 'jpg' : 'mp4';
  const base = (name || 'download').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'download';
  return `${base}.${ext}`;
}

module.exports = async function handler(req, res) {
  const rawUrl = req.query.url;
  const kind = (req.query.kind || 'video').toString();
  const name = (req.query.name || '').toString();

  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  let target;
  try {
    target = new URL(rawUrl);
    if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
  } catch {
    res.status(400).json({ success: false, error: 'Invalid media URL.' });
    return;
  }

  const referer = getMediaReferer(target.href);
  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
  };
  if (referer) headers.Referer = referer;
  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await fetch(target.href, { headers, redirect: 'follow' });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(502).json({ success: false, error: `Upstream returned status ${upstream.status}. The link may have expired — try downloading again.` });
      return;
    }

    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || contentTypeFor(kind));
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(name, kind)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');

    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);

    if (!upstream.body) { res.end(); return; }
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.status(502).json({ success: false, error: 'Could not fetch this media file. Please try again.' });
  }
};
