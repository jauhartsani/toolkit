/**
 * GET /api/instagram?url=<instagram post/reel/igtv url>
 *
 * Fallback chain:
 *   1. Public post page — reads og:meta tags and JSON-LD (fast path for
 *      posts Instagram still serves without a login wall).
 *   2. The public "/embed/captioned/" page — a lighter render Instagram
 *      sometimes still serves without the login wall even when the main
 *      page is gated.
 *   3. Cobalt (public resolver, shared across all downloaders on this
 *      site) — re-extracts the post independently and is the most
 *      resilient fallback when Instagram blocks the request outright.
 *
 * Works for: public photo posts, video posts, Reels, IGTV, carousels.
 * Does NOT work for: Stories or private accounts — those require an
 * authenticated Instagram session, which this endpoint intentionally does
 * not implement (storing/using someone's IG login is a security/ToS risk).
 *
 * All returned media URLs point through /api/media so the download click
 * bypasses Instagram's hotlink-protected CDN instead of 403ing.
 */

const { tryCobalt } = require('./_lib/cobalt');
const { toProxyUrl } = require('./_lib/proxy');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizeInstagramUrl(raw) {
  const u = new URL(raw);
  if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) {
    throw new Error('That does not look like an Instagram link.');
  }
  return { url: `https://www.instagram.com${u.pathname}`, pathname: u.pathname };
}

function extractShortcode(pathname) {
  const match = pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function fetchHtml(url, referer) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

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

async function tryEmbedFallback(shortcode) {
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const { ok, body } = await fetchHtml(embedUrl, 'https://www.instagram.com/');
  if (!ok) return { media: [], blocked: false };
  if (looksLikeLoginWall(body)) return { media: [], blocked: true };

  const media = extractFromMeta(body);
  if (media.length) return { media, blocked: false };

  const videoJsMatch = body.match(/"video_url":"([^"]+)"/);
  const imageJsMatch = body.match(/"display_url":"([^"]+)"/);
  if (videoJsMatch) return { media: [{ type: 'video', url: decodeEntities(videoJsMatch[1]), thumbnail: imageJsMatch ? decodeEntities(imageJsMatch[1]) : null }], blocked: false };
  if (imageJsMatch) return { media: [{ type: 'photo', url: decodeEntities(imageJsMatch[1]) }], blocked: false };

  return { media: [], blocked: false };
}

function toProxiedMedia(rawMedia, label) {
  return rawMedia.map((m, i) => ({
    type: m.type,
    url: toProxyUrl(m.url, m.type === 'photo' ? 'image' : m.type, `${label}-${i + 1}`),
    thumbnail: m.thumbnail || null,
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    const { url: cleanUrl, pathname } = normalizeInstagramUrl(rawUrl);
    const shortcode = extractShortcode(pathname);

    const { ok, status, body: html } = await fetchHtml(cleanUrl);
    if (!ok && status !== 200 && !shortcode) {
      throw new Error(`Instagram returned status ${status}. The post may be private or removed.`);
    }

    const mainPageBlocked = looksLikeLoginWall(html || '');
    let media = mainPageBlocked ? [] : extractFromMeta(html || '');
    const carousel = mainPageBlocked ? [] : extractCarouselFromJsonLd(html || '');
    if (carousel.length > 1) media = carousel;

    let blockedEverywhere = mainPageBlocked;

    if (!media.length && shortcode) {
      const fallback = await tryEmbedFallback(shortcode).catch(() => ({ media: [], blocked: false }));
      if (fallback.media.length) media = fallback.media;
      blockedEverywhere = mainPageBlocked && fallback.blocked;
    }

    if (!media.length) {
      const cobalt = await tryCobalt(cleanUrl, 'video').catch(() => null);
      if (cobalt) media = cobalt.media;
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

    res.status(200).json({ success: true, media: toProxiedMedia(media, 'instagram') });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to process this link.' });
  }
};
