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
 * NOTE: Instagram frequently changes its markup. This uses two fallback
 * strategies (og: meta tags, then embedded JSON-LD) and may need updates if
 * Instagram changes their public page structure.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizeInstagramUrl(raw) {
  const u = new URL(raw);
  if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, '')) ) {
    throw new Error('That does not look like an Instagram link.');
  }
  return `https://www.instagram.com${u.pathname}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Instagram returned status ${res.status}. The post may be private or removed.`);
  return res.text();
}

function extractFromMeta(html) {
  const media = [];
  const videoMatch = html.match(/<meta property="og:video(?::secure_url)?" content="([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (videoMatch) {
    media.push({ type: 'video', url: videoMatch[1].replace(/&amp;/g, '&'), thumbnail: imageMatch ? imageMatch[1].replace(/&amp;/g, '&') : null });
  } else if (imageMatch) {
    media.push({ type: 'photo', url: imageMatch[1].replace(/&amp;/g, '&') });
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = req.query.url;
  if (!rawUrl) { res.status(400).json({ success: false, error: 'Missing "url" parameter.' }); return; }

  try {
    const cleanUrl = normalizeInstagramUrl(rawUrl);
    const html = await fetchHtml(cleanUrl);

    let media = extractFromMeta(html);
    const carousel = extractCarouselFromJsonLd(html);
    if (carousel.length > 1) media = carousel; // prefer full carousel set when available

    if (!media.length) {
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
