/**
 * GET /api/tiktok?url=<tiktok video url>&type=video|audio|photo
 *
 * Fetches the public TikTok video page server-side and extracts the direct
 * media URL(s) from TikTok's own embedded page-state JSON. TikTok has used
 * two different script tags for this over time:
 *   - `__UNIVERSAL_DATA_FOR_REHYDRATION__` (current)
 *   - `SIGI_STATE` (older, some regions/experiments still serve it)
 * Both are checked. This endpoint also detects TikTok's anti-bot "verify"
 * / captcha interstitial, which is a common cause of failures that look
 * like "not a playable post" but are actually TikTok blocking the request
 * before any real page data loads (frequent for requests coming from
 * datacenter/serverless IP ranges, e.g. Vercel) — the error message now
 * distinguishes that case from an actually-missing post.
 *
 * Accepts both full links (tiktok.com/@user/video/123...) and short share
 * links (vt.tiktok.com/xxxx, vm.tiktok.com/xxxx) — short links are resolved
 * by following their redirect first.
 *
 * NOTE: the video URL TikTok exposes in this public page JSON is generally
 * the same version shown in the app preview and commonly includes the TikTok
 * watermark. A fully watermark-free download typically requires TikTok's
 * internal signed API, which changes often and is outside what a public page
 * fetch can reliably provide. This endpoint returns the best available direct
 * link and is transparent with an error if extraction fails.
 */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

async function resolveShortLink(url) {
  if (!/vt\.tiktok\.com|vm\.tiktok\.com/.test(url)) return url;
  const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA } });
  return res.url || url;
}

function normalizeTikTokUrl(raw) {
  const u = new URL(raw);
  if (!/tiktok\.com$/.test(u.hostname.replace(/^www\./, '').replace(/^vt\./, '').replace(/^vm\./, ''))) {
    throw new Error('That does not look like a TikTok link.');
  }
  return raw;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`TikTok returned status ${res.status}. The video may be private, region-locked, or removed.`);
  return res.text();
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

// Legacy/alternate embed used by some TikTok surfaces.
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

function itemToMedia(item) {
  const media = [];
  if (item.imagePost && Array.isArray(item.imagePost.images)) {
    item.imagePost.images.forEach((img) => {
      const src = img?.imageURL?.urlList?.[0];
      if (src) media.push({ type: 'photo', url: src });
    });
  } else if (item.video) {
    const playUrl = item.video.playAddr || item.video.downloadAddr;
    if (playUrl) media.push({ type: 'video', url: playUrl, thumbnail: item.video.cover || item.video.originCover });
  }
  if (item.music && item.music.playUrl) {
    media.push({ type: 'audio', url: item.music.playUrl });
  }
  return media;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    let cleanUrl = normalizeTikTokUrl(rawUrl);
    cleanUrl = await resolveShortLink(cleanUrl);
    const html = await fetchHtml(cleanUrl);

    if (looksLikeBotWall(html)) {
      res.status(422).json({
        success: false,
        error: 'TikTok showed an anti-bot "verify to continue" check for this request instead of the real page — this happens on TikTok\'s side (it\'s more aggressive for requests from cloud/server IPs) and isn\'t caused by this specific link.',
      });
      return;
    }

    const item = extractUniversalData(html) || extractSigiState(html);
    if (!item) {
      throw new Error('This link does not point to a playable TikTok video or photo post.');
    }

    const media = itemToMedia(item);
    if (!media.length) {
      res.status(422).json({
        success: false,
        error: 'Could not extract downloadable media from this link. Double-check the link is public and try again.',
      });
      return;
    }

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
