/**
 * GET /api/tiktok?url=<tiktok video url>
 *
 * Fallback chain (each tried in order until one returns real media):
 *   1. tikwm.com public API — fast, reliable, gives HD + watermark-free
 *      video, the MP3 soundtrack, and full photo-carousel (slideshow) sets.
 *      This is the primary method: it does the extraction work on tikwm's
 *      own servers, so it isn't affected by TikTok blocking datacenter IPs
 *      (the #1 reason a direct-scrape approach fails when deployed on
 *      Vercel).
 *   2. Direct scraping of TikTok's own page JSON — kept as a fallback for
 *      when tikwm is down; frequently blocked by TikTok's bot-check for
 *      server IPs, so it is not relied on as the primary method.
 *   3. Cobalt (public resolver, shared across all downloaders on this site)
 *      — last resort.
 *
 * All returned media URLs point through /api/media so the actual download
 * click bypasses TikTok's hotlink protection and behaves like a real file
 * download instead of just opening in a new tab.
 */

const { tryCobalt } = require('./_lib/cobalt');
const { toProxyUrl } = require('./_lib/proxy');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

function normalizeTikTokUrl(raw) {
  const u = new URL(raw);
  const host = u.hostname.replace(/^www\./, '');
  if (!/tiktok\.com$/.test(host)) throw new Error('That does not look like a TikTok link.');
  return raw;
}

async function resolveShortLink(url) {
  if (!/vt\.tiktok\.com|vm\.tiktok\.com|tiktok\.com\/t\//.test(url)) return url;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
    return res.url || url;
  } catch {
    return url;
  }
}

function absoluteTikwmUrl(path) {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `https://www.tikwm.com${path}`;
}

async function tryTikwm(url) {
  const res = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.tikwm.com',
      Referer: 'https://www.tikwm.com/',
    },
    body: JSON.stringify({ url, hd: 1 }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => null);
  if (!json || json.code !== 0 || !json.data) return null;
  const data = json.data;

  const isPhotoCarousel = Array.isArray(data.images) && data.images.length > 0;
  const media = [];

  if (isPhotoCarousel) {
    data.images.forEach((img, i) => {
      media.push({ type: 'photo', url: toProxyUrl(img, 'image', `tiktok-photo-${i + 1}`), thumbnail: img });
    });
  } else {
    const hdplay = absoluteTikwmUrl(data.hdplay);
    const play = absoluteTikwmUrl(data.play);
    const wmplay = absoluteTikwmUrl(data.wmplay);
    const best = hdplay || play || wmplay;
    if (best) {
      media.push({ type: 'video', url: toProxyUrl(best, 'video', 'tiktok-video'), thumbnail: absoluteTikwmUrl(data.origin_cover) || absoluteTikwmUrl(data.cover) });
    }
  }

  const musicUrl = absoluteTikwmUrl(data.music_info?.play) || absoluteTikwmUrl(data.music);
  if (musicUrl) {
    media.push({ type: 'audio', url: toProxyUrl(musicUrl, 'audio', 'tiktok-audio') });
  }

  if (!media.length) return null;
  return media;
}

function looksLikeBotWall(html) {
  return /verify to continue|secsdk-captcha|captcha_verify_container|"statusCode":10201|__tea_cache_wait/i.test(html);
}

async function tryDirectScrape(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  });
  const html = await res.text();
  if (looksLikeBotWall(html)) throw new Error('bot-wall');

  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const scope = data?.__DEFAULT_SCOPE__ || {};
    const detail = scope['webapp.video-detail'];
    const item = detail?.itemInfo?.itemStruct;
    if (!item) return null;
    const media = [];
    if (item.video) {
      const playUrl = item.video.playAddr || item.video.downloadAddr;
      if (playUrl) media.push({ type: 'video', url: toProxyUrl(playUrl, 'video', 'tiktok-video'), thumbnail: item.video.cover || item.video.originCover });
    }
    if (item.music?.playUrl) {
      media.push({ type: 'audio', url: toProxyUrl(item.music.playUrl, 'audio', 'tiktok-audio') });
    }
    return media.length ? media : null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    let cleanUrl = normalizeTikTokUrl(rawUrl);
    cleanUrl = await resolveShortLink(cleanUrl);

    let media = null;
    let lastError = null;

    try {
      media = await tryTikwm(cleanUrl);
    } catch (e) {
      lastError = e;
    }

    if (!media) {
      try {
        media = await tryDirectScrape(cleanUrl);
      } catch (e) {
        lastError = e;
      }
    }

    if (!media) {
      const cobalt = await tryCobalt(cleanUrl, 'video').catch(() => null);
      if (cobalt) {
        media = cobalt.media.map((m, i) => ({
          type: m.type,
          url: toProxyUrl(m.url, m.type === 'photo' ? 'image' : m.type, `tiktok-${m.type}-${i + 1}`),
          thumbnail: m.thumbnail || null,
        }));
      }
    }

    if (!media || !media.length) {
      const isBotWall = lastError && /bot-wall/.test(String(lastError.message));
      res.status(422).json({
        success: false,
        error: isBotWall
          ? 'TikTok showed an anti-bot check for this request instead of the real page. Please try again in a moment.'
          : 'Could not extract media from this link. Double-check the link is public and try again.',
      });
      return;
    }

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
