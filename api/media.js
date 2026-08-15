/**
 * api/media.js — Vercel Node.js Serverless Function
 * GET /api/media?url=<direct-cdn-url>&platform=<name>&filename=<name>
 *
 * Proxy yang menambahkan header Referer yang benar per-CDN (TikTok/
 * Instagram/Facebook/X semua memblokir hotlink tanpa referer
 * yang cocok) dan memaksa file benar-benar ke-download lewat header
 * Content-Disposition (bukan cuma kebuka di tab baru).
 */

const { Readable } = require('stream');
const { DEFAULT_UA } = require('./_lib/http');

const REFERER_BY_PLATFORM = {
  tiktok: 'https://www.tiktok.com/',
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  x: 'https://twitter.com/',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { url, platform, filename } = req.query || {};
  if (!url) {
    res.status(400).json({ detail: "Query param 'url' wajib diisi." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Referer: REFERER_BY_PLATFORM[platform] || '',
      },
    });
  } catch (e) {
    res.status(502).json({ detail: `Gagal mengambil file dari sumber. (${e.message})` });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    res.status(502).json({ detail: `Sumber file merespons status ${upstream.status}.` });
    return;
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const ext = contentType.includes('audio')
    ? 'mp3'
    : contentType.includes('image')
    ? 'jpg'
    : 'mp4';
  const safeName = (filename || 'toolkitme-download').replace(/[^a-z0-9_-]/gi, '_');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
  const len = upstream.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);

  Readable.fromWeb(upstream.body).pipe(res);
};
