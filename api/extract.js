/**
 * api/extract.js — Vercel Node.js Serverless Function
 * POST /api/extract  { url, audio_only }
 *
 * Menggantikan versi Python (yt-dlp) sebelumnya. Sekarang setiap platform
 * punya beberapa metode ekstraksi berurutan (kalau metode pertama gagal,
 * otomatis coba metode berikutnya) — lihat api/_lib/platforms/*.js.
 * Kontrak request/response TIDAK berubah, jadi assets/main.js dan semua
 * halaman *-downloader.html tetap jalan tanpa modifikasi.
 */

const { extractTiktok } = require('./_lib/platforms/tiktok');
const { extractInstagram } = require('./_lib/platforms/instagram');
const { extractFacebook } = require('./_lib/platforms/facebook');
const { extractTwitter } = require('./_lib/platforms/twitter');
const { toProxyUrl } = require('./_lib/proxy-url');

const PLATFORM_PATTERNS = {
  tiktok: /tiktok\.com/i,
  instagram: /instagram\.com/i,
  facebook: /facebook\.com|fb\.watch/i,
  x: /(?:twitter|x)\.com/i,
};

const EXTRACTORS = {
  tiktok: extractTiktok,
  instagram: extractInstagram,
  facebook: extractFacebook,
  x: extractTwitter,
};

function detectPlatform(url) {
  for (const [name, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return name;
  }
  return null;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function friendlyError(platform, err) {
  const msg = (err && err.message) || String(err);
  // Extractor sudah kasih pesan lengkap & jelas (mis. login-wall/bot-wall
  // yang dideteksi eksplisit) — jangan dibungkus ulang jadi generik.
  if (msg.length > 60) return msg;
  return `Gagal memproses link. Pastikan kontennya publik dan link valid. (${msg})`;
}

// Ubah judul asli post/video jadi nama file yang aman & rapi, dipakai
// sebagai nama file download (bukan lagi "toolkitme-instagram-1" generik).
function slugify(text) {
  const slug = (text || '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'download';
}

function extFor(type) {
  return type === 'photo' ? 'jpg' : type === 'audio' ? 'mp3' : 'mp4';
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') {
    send(res, 200, { status: 'ok' });
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, { detail: 'Method tidak didukung.' });
    return;
  }

  let payload = {};
  try {
    payload = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
  } catch {
    payload = {};
  }

  const url = (payload.url || '').trim();
  const audioOnly = Boolean(payload.audio_only);

  if (!url) {
    send(res, 400, { detail: "Field 'url' wajib diisi." });
    return;
  }

  const platform = detectPlatform(url);
  if (!platform) {
    send(res, 400, { detail: 'Link tidak dikenali. Dukung: TikTok, Instagram, Facebook, X.' });
    return;
  }

  try {
    const result = await EXTRACTORS[platform](url, { audioOnly });

    let formats = result.formats || [];
    if (audioOnly) {
      const audioOnly_ = formats.filter((f) => f.type === 'audio' || /audio|mp3/i.test(f.label));
      if (audioOnly_.length) formats = audioOnly_;
    }
    if (!formats.length) {
      send(res, 422, { detail: 'Tidak ditemukan format yang bisa diunduh untuk link ini.' });
      return;
    }

    // Bungkus tiap link lewat /api/media supaya referer/hotlink-block
    // teratasi dan file benar-benar ke-download (bukan cuma kebuka di tab).
    // Nama file & ekstensi mengikuti judul asli dan JENIS media
    // sebenarnya (video/foto/audio) per format — bukan dipukul rata mp4,
    // supaya foto tidak pernah ke-download berekstensi .mp4 atau sebaliknya.
    const titleSlug = slugify(result.title);
    const wrappedFormats = formats.slice(0, 6).map((f, i) => {
      const type = f.type || (audioOnly ? 'audio' : 'video');
      const filenameBase = `${platform}-${titleSlug}${formats.length > 1 ? `-${i + 1}` : ''}`;
      return {
        format_id: String(i),
        ext: extFor(type),
        type,
        label: f.label,
        filesize_approx: f.filesize_approx || null,
        url: toProxyUrl(f.url, platform, filenameBase, type),
      };
    });

    send(res, 200, {
      platform,
      title: result.title || 'Tanpa judul',
      thumbnail: result.thumbnail || null,
      duration: result.duration || null,
      uploader: result.uploader || null,
      formats: wrappedFormats,
    });
  } catch (err) {
    send(res, 422, { detail: friendlyError(platform, err) });
  }
};
