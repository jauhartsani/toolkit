/**
 * GET /api/facebook?url=<facebook video/reel/watch url>
 *
 * Fallback chain:
 *   1. facebook.com/plugins/video.php embed page — a public, login-free
 *      render Facebook exposes specifically for embedding videos on other
 *      sites; carries the same source JSON as the real page.
 *   2. Direct scrape of the resolved video/reel/watch page.
 *   3. Cobalt (public resolver, shared across all downloaders on this
 *      site) — last resort.
 *
 * Resolves fb.watch and /share/ short links via redirect-following first.
 * Returned media points through /api/media so the download bypasses
 * Facebook's hotlink protection.
 */

const { tryCobalt } = require('./_lib/cobalt');
const { toProxyUrl } = require('./_lib/proxy');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizeFacebookUrl(raw) {
  const u = new URL(raw);
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (!/(^|\.)facebook\.com$|^fb\.watch$/.test(host)) {
    throw new Error('That does not look like a Facebook link.');
  }
  return raw;
}

async function resolveRedirect(url) {
  if (!/fb\.watch|\/share\//.test(url)) return url;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
    return res.url || url;
  } catch {
    return url;
  }
}

function decodeFacebookString(raw) {
  return raw
    .replace(/\\u0025/g, '%')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u003F/gi, '?')
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\/g, '');
}

function metaContent(html, prop) {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? decodeEntities(m[1]) : '';
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

function parseFacebookHtml(html) {
  if (!html) return null;

  const pickUrl = (...keys) => {
    for (const key of keys) {
      const re = new RegExp(`"${key}":"(.*?)"(?:,|\\})`);
      const m = html.match(re);
      if (m && m[1]) {
        const decoded = decodeFacebookString(m[1]);
        if (decoded.startsWith('http')) return decoded;
      }
    }
    return '';
  };

  const downloadUrl = pickUrl(
    'browser_native_hd_url',
    'playable_url_quality_hd',
    'hd_src_no_ratelimit',
    'hd_src',
    'browser_native_sd_url',
    'playable_url',
    'sd_src_no_ratelimit',
    'sd_src',
  );

  if (!downloadUrl) return null;

  const thumbnail = metaContent(html, 'og:image');
  return { downloadUrl, thumbnail };
}

async function fetchHtml(url, extraHeaders) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  });
  return res.text();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    const cleanUrl = normalizeFacebookUrl(rawUrl);
    const resolvedUrl = await resolveRedirect(cleanUrl);

    let parsed = null;

    try {
      const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(resolvedUrl)}`;
      const html = await fetchHtml(embedUrl);
      parsed = parseFacebookHtml(html);
    } catch { /* try next method */ }

    if (!parsed) {
      try {
        const html = await fetchHtml(resolvedUrl, { 'Upgrade-Insecure-Requests': '1' });
        parsed = parseFacebookHtml(html);
      } catch { /* try next method */ }
    }

    let media = null;
    if (parsed) {
      media = [{ type: 'video', url: toProxyUrl(parsed.downloadUrl, 'video', 'facebook-video'), thumbnail: parsed.thumbnail || null }];
    } else {
      const cobalt = await tryCobalt(resolvedUrl, 'video').catch(() => null);
      if (cobalt) {
        media = cobalt.media.map((m, i) => ({ type: m.type, url: toProxyUrl(m.url, m.type, `facebook-${m.type}-${i + 1}`), thumbnail: m.thumbnail || null }));
      }
    }

    if (!media || !media.length) {
      res.status(422).json({
        success: false,
        error: 'Could not download this Facebook video. The post may be private, age-restricted, or unavailable.',
      });
      return;
    }

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
