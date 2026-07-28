/**
 * GET /api/instagram?url=<instagram post/reel/igtv url>
 *
 * Fetches the public post page server-side (browsers can't do this directly —
 * Instagram blocks cross-origin requests) and extracts the direct media URL(s)
 * from the page's own meta tags / embedded JSON.
 *
 * Works for: public photo posts, video posts, Reels, IGTV.
 * Does NOT work for: Stories or full profile browsing — those require an
 * authenticated Instagram session, which this endpoint intentionally does not
 * implement (storing/using someone's IG login is a security and ToS risk).
 *
 * NOTE: Instagram frequently changes its markup, and increasingly serves an
 * anonymous "log in to continue" wall instead of the real post to server-side
 * requests (no cookies, no JS) — that wall is now the #1 cause of extraction
 * failures, more often than the post itself being missing/removed. This file
 * uses three fallback strategies in order:
 *   1. og: meta tags on the normal post page
 *   2. JSON-LD carousel data on the normal post page
 *   3. the public oEmbed-style "/embed/captioned/" page, which Instagram
 *      sometimes still serves without a login wall for public posts even
 *      when the main page is gated
 * and explicitly tells the caller when the failure looks like a login wall,
 * rather than reporting a generic "no media found".
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizeInstagramUrl(raw) {
  const u = new URL(raw);
  if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) {
    throw new Error('That does not look like an Instagram link.');
  }
  return { url: `https://www.instagram.com${u.pathname}`, pathname: u.pathname };
}

// /p/{code}/, /reel/{code}/, /reels/{code}/, /tv/{code}/ -> {code}
function extractShortcode(pathname) {
  const match = pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function fetchHtml(url, referer) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
      ...(referer ? { Referer: referer } : {}),
    },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// Instagram's anonymous "log in to continue" wall has consistent markers
// regardless of exact copy/locale — detect it so we can report the real
// cause instead of a generic "no media found".
function looksLikeLoginWall(html) {
  return /Log in to Instagram|loginForm|Log in \u2022 Instagram|"require_login"\s*:\s*true/i.test(html);
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\u0026/g, '&');
}

function extractFromMeta(html) {
  const media = [];
  const videoMatch = html.match(/<meta property="og:video(?::secure_url)?" content="([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (videoMatch) {
    media.push({ type: 'video', url: decodeEntities(videoMatch[1]), thumbnail: imageMatch ? decodeEntities(imageMatch[1]) : null });
  } else if (imageMatch) {
    media.push({ type: 'photo', url: decodeEntities(imageMatch[1]) });
  }
  return media;
}

function extractCarouselFromJsonLd(html) {
  const media = [];
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of scripts) {
    try {
      const data = JSON.parse(raw);
      const images = Array.isArray(data.image) ? data.image : (data.image ? [data.image] : []);
      images.forEach((img) => media.push({ type: 'photo', url: typeof img === 'string' ? img : img.url }));
    } catch { /* ignore malformed blocks */ }
  }
  return media;
}

// The /embed/captioned/ page is a lighter-weight public render Instagram
// exposes for embedding posts on third-party sites. For posts that are
// still public, it sometimes stays accessible even when the main page
// redirects anonymous requests to a login wall.
async function tryEmbedFallback(shortcode) {
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const { ok, status, body } = await fetchHtml(embedUrl, 'https://www.instagram.com/');
  if (!ok) return { media: [], blocked: false, status };
  if (looksLikeLoginWall(body)) return { media: [], blocked: true, status };

  const media = extractFromMeta(body);
  if (media.length) return { media, blocked: false, status };

  // Fallback: some embed pages carry the media URL only inside inline JS
  // as a raw string rather than an og: tag.
  const videoJsMatch = body.match(/"video_url":"([^"]+)"/);
  const imageJsMatch = body.match(/"display_url":"([^"]+)"/);
  if (videoJsMatch) return { media: [{ type: 'video', url: decodeEntities(videoJsMatch[1]), thumbnail: imageJsMatch ? decodeEntities(imageJsMatch[1]) : null }], blocked: false, status };
  if (imageJsMatch) return { media: [{ type: 'photo', url: decodeEntities(imageJsMatch[1]) }], blocked: false, status };

  return { media: [], blocked: false, status };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    const { url: cleanUrl, pathname } = normalizeInstagramUrl(rawUrl);
    const shortcode = extractShortcode(pathname);

    const { ok, status, body: html } = await fetchHtml(cleanUrl);
    if (!ok && status !== 200) {
      // Instagram returns non-200 for some gated posts even before the
      // login-wall HTML loads; don't give up yet if we have a shortcode
      // to try the embed fallback with.
      if (!shortcode) throw new Error(`Instagram returned status ${status}. The post may be private or removed.`);
    }

    const mainPageBlocked = looksLikeLoginWall(html);
    let media = mainPageBlocked ? [] : extractFromMeta(html);
    const carousel = mainPageBlocked ? [] : extractCarouselFromJsonLd(html);
    if (carousel.length > 1) media = carousel; // prefer full carousel set when available

    let blockedEverywhere = mainPageBlocked;

    if (!media.length && shortcode) {
      const fallback = await tryEmbedFallback(shortcode);
      if (fallback.media.length) media = fallback.media;
      blockedEverywhere = mainPageBlocked && fallback.blocked;
    }

    if (!media.length) {
      if (blockedEverywhere) {
        res.status(422).json({
          success: false,
          error: 'Instagram is showing a login wall for this link instead of the post itself — this happens on Instagram\'s side for some posts/accounts and isn\'t something a public-page fetch can get around without signing in.',
        });
        return;
      }
      res.status(422).json({
        success: false,
        error: 'Could not extract media from this link. The post may be private, age-restricted, or Instagram has changed its page structure.',
      });
      return;
    }

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
