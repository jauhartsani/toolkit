/**
 * api/media.js — Vercel Node.js Serverless Function
 * GET /api/media?url=<direct-cdn-url>&platform=<name>&filename=<name>&type=<video|photo|audio>
 *
 * Proxy yang menambahkan header Referer yang benar per-CDN (TikTok/
 * Instagram/Facebook/X semua memblokir hotlink tanpa referer
 * yang cocok) dan memaksa file benar-benar ke-download lewat header
 * Content-Disposition (bukan cuma kebuka di tab baru).
 *
 * Ekstensi file ditentukan dari Content-Type respons CDN sumber; kalau itu
 * ambigu/kosong (mis. application/octet-stream — sering terjadi di CDN
 * TikTok/Instagram), jatuh ke `type` hint yang dikirim extractor
 * (video/photo/audio) supaya foto tidak pernah ke-download dengan nama
 * .mp4 atau sebaliknya.
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

  const { url, platform, filename, type } = req.query || {};
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

  const contentType = upstream.headers.get('content-type') || '';
  const typeHint = type === 'photo' ? 'jpg' : type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : null;
  const ext = contentType.includes('audio')
    ? 'mp3'
    : contentType.includes('image')
    ? 'jpg'
    : contentType.includes('video')
    ? 'mp4'
    : typeHint || 'mp4';
  const safeName = (filename || 'toolkitme-download').replace(/[^a-z0-9_-]/gi, '_');

  res.setHeader('Content-Type', contentType || (ext === 'jpg' ? 'image/jpeg' : ext === 'mp3' ? 'audio/mpeg' : 'video/mp4'));
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
  const len = upstream.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);

  Readable.fromWeb(upstream.body).pipe(res);
};
