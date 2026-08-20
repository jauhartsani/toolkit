/**
 * api/_lib/platforms/facebook.js
 *
 * Urutan (5 attempt, dari yang paling ringan/paling sering lolos sampai
 * yang paling berat): halaman embed plugins/video.php -> mbasic.facebook.com
 * (versi HTML lama tanpa JS, sering tidak kena login-wall yang sama dengan
 * www.facebook.com) -> halaman watch/reel/video langsung -> halaman
 * watch/reel langsung dengan UA crawler preview-link Meta ("Facebot") ->
 * Cobalt.
 *
 * KENAPA FACEBOOK LEBIH SERING GAGAL DIBANDING INSTAGRAM (meski satu
 * perusahaan): domain-nya beda kebijakan. www.facebook.com jauh lebih
 * agresif menyodorkan login-wall ke request tanpa cookie session
 * dibanding www.instagram.com, terutama untuk Reels/Watch (video),
 * sementara foto/link post biasa kadang masih lolos. Karena itu
 * extractor ini disamakan dengan pola yang sudah terbukti jalan di
 * instagram.js: banyak attempt bernama + kumpulkan pesan error tiap
 * attempt (bukan cuma yang terakhir) supaya kalau semuanya gagal, jelas
 * PERSIS attempt mana yang mentok di login-wall vs yang mentok karena
 * sebab lain (link invalid, video privat, dst) — jauh lebih mudah
 * di-debug daripada satu pesan generik "video tidak ditemukan".
 */

const { fetchText, resolveRedirect, browserHeaders, FACEBOT_UA } = require('../http');
const { cobaltExtract } = require('../cobalt');

function unescapeUnicode(str) {
  return str.replace(/\\u0025/g, '%').replace(/\\\//g, '/').replace(/\\u0026/g, '&');
}

// Facebook menaruh link video mentah di beberapa key JSON berbeda
// tergantung jenis halaman (watch/reel/video/plugin embed) dan sudah
// beberapa kali berubah nama field-nya seiring waktu — cek semuanya,
// pakai yang pertama ketemu.
const HD_KEYS = ['playable_url_quality_hd', 'browser_native_hd_url', 'hd_src_no_ratelimit', 'hd_src'];
const SD_KEYS = ['playable_url', 'browser_native_sd_url', 'sd_src_no_ratelimit', 'sd_src', 'video_url'];

function findSrc(html, keys) {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
    const m = html.match(re);
    if (m) return unescapeUnicode(m[1]);
  }
  return null;
}

function looksLikeLoginWall(html) {
  return /log in to (see|watch|continue)|You must log in|login_form|id="login_form"|Lupa kata sandi\?|You'll need to log in/i.test(html);
}

// URL /share/r/{code}/ dan /share/v/{code}/ adalah format share-link baru
// Facebook (menggantikan sebagian pola lama) — sama seperti fb.watch,
// perlu di-resolve dulu ke URL watch/reel/video aslinya sebelum discrape,
// karena halaman /share/ itu sendiri cuma interstitial, bukan konten video.
function needsRedirectResolve(url) {
  return /fb\.watch/i.test(url) || /\/share\/(r|v)\//i.test(url);
}

async function resolveShortLink(url) {
  if (!needsRedirectResolve(url)) return url;
  return resolveRedirect(url, { headers: browserHeaders('facebook') }, 10000);
}

// Ambil isi meta tag Open Graph TANPA asumsi urutan attribute — beberapa
// halaman Facebook (terutama mbasic/embed) render sebagai
// `content="..." property="og:image"` (content DULUAN), bukan urutan
// "normal" `property="..." content="..."`. Regex lama cuma cek satu
// urutan, jadi og:image sering ke-skip diam-diam dan thumbnail jadi
// kosong padahal videonya sendiri berhasil ketemu — inilah penyebab
// utama "video ke-download tapi thumbnail-nya nggak keluar".
function metaContent(html, property) {
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? unescapeUnicode(m[1]) : null;
}

// Fallback kalau og:image sama sekali tidak ada di halaman (umum terjadi
// di mbasic.facebook.com, yang HTML-nya minim dan jarang menaruh meta
// Open Graph sama sekali karena memang tidak didesain untuk link
// preview). Beberapa halaman FB tetap menaruh cover image di data JSON
// inline dengan salah satu key ini.
const THUMB_JSON_KEYS = ['thumbnailImage', 'preferred_thumbnail', 'thumbnailUrl', 'preview_image'];
function findThumbInJson(html) {
  for (const key of THUMB_JSON_KEYS) {
    // Cocokkan baik bentuk "key":"https://..." maupun "key":{"uri":"https://..."}
    const direct = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    if (direct) return unescapeUnicode(direct[1]);
    const nested = html.match(new RegExp(`"${key}"\\s*:\\s*\\{[^}]*"uri"\\s*:\\s*"([^"]+)"`));
    if (nested) return unescapeUnicode(nested[1]);
  }
  return null;
}

function buildResult(html) {
  const hd = findSrc(html, HD_KEYS);
  const sd = findSrc(html, SD_KEYS);
  const title = metaContent(html, 'og:title');
  const thumbnail = metaContent(html, 'og:image') || findThumbInJson(html);

  const formats = [];
  if (hd) formats.push({ label: 'Video HD', type: 'video', url: hd, filesize_approx: null });
  if (sd && sd !== hd) formats.push({ label: 'Video SD', type: 'video', url: sd, filesize_approx: null });
  if (!formats.length) return null;

  return {
    title: title || 'Video Facebook',
    thumbnail,
    duration: null,
    uploader: null,
    formats,
  };
}

async function viaEmbed(url) {
  const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0`;
  const { ok, body } = await fetchText(embedUrl, { headers: browserHeaders('facebook', 'https://www.facebook.com/') }, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Facebook.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman embed.');
  return result;
}

// mbasic.facebook.com adalah versi Facebook super ringan (HTML lama,
// nyaris tanpa JS) yang aslinya dibuat untuk koneksi lambat/HP jadul.
// Karena rendernya server-side murni (bukan React app seperti
// www.facebook.com), dia kadang tetap menyodorkan halaman videonya apa
// adanya ke request anonim yang di www.facebook.com sudah kena
// login-wall. Perlu diganti dulu hostname-nya sebelum discrape.
async function viaMbasic(url) {
  let mbasicUrl;
  try {
    const u = new URL(url);
    u.hostname = 'mbasic.facebook.com';
    mbasicUrl = u.toString();
  } catch {
    throw new Error('URL Facebook tidak valid untuk dikonversi ke mbasic.');
  }

  const { ok, body } = await fetchText(mbasicUrl, { headers: browserHeaders('facebook', 'https://mbasic.facebook.com/') }, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman mbasic Facebook.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman mbasic.');
  return result;
}

async function viaDirectPage(url, uaOverride) {
  const cleanUrl = await resolveShortLink(url);
  const { ok, body } = await fetchText(cleanUrl, { headers: browserHeaders('facebook', undefined, uaOverride) }, 12000);
  if (!ok || !body) throw new Error('Gagal mengambil halaman Facebook.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');
  const result = buildResult(body);
  if (!result) throw new Error('Video tidak ditemukan di halaman watch/reel.');
  return result;
}

// Sama seperti trik yang dipakai di instagram.js: UA crawler preview-link
// resmi Meta ("Facebot") kadang tetap disodorkan halaman apa adanya
// (bukan login-wall) karena Facebook butuh og:meta yang benar supaya
// preview link di Messenger/WhatsApp/dll tetap muncul. Best-effort, bisa
// berhenti jalan kapan saja kalau Facebook ubah kebijakannya.
async function viaDirectPageAsFacebot(url) {
  return viaDirectPage(url, FACEBOT_UA);
}

async function extractFacebook(url, { audioOnly } = {}) {
  const namedAttempts = [
    ['halaman-embed', () => viaEmbed(url)],
    ['mbasic', () => viaMbasic(url)],
    ['halaman-langsung', () => viaDirectPage(url)],
    ['halaman-langsung+facebot-ua', () => viaDirectPageAsFacebot(url)],
    ['cobalt', () => cobaltExtract(url, { audioOnly })],
  ];

  let sawLoginWall = false;
  const attemptErrors = [];
  for (const [name, attempt] of namedAttempts) {
    try {
      return await attempt();
    } catch (e) {
      if (e.message === 'LOGIN_WALL') sawLoginWall = true;
      attemptErrors.push(`[${name}] ${e.message === 'LOGIN_WALL' ? 'halaman menampilkan login-wall' : e.message}`);
    }
  }

  const detail = attemptErrors.join(' | ');

  if (sawLoginWall) {
    throw new Error(
      `Facebook menampilkan halaman "log in to continue" untuk video ini di beberapa metode — video mungkin tidak sepenuhnya publik, atau Facebook membatasi akses tanpa login untuk konten ini. Detail tiap metode: ${detail}`
    );
  }
  throw new Error(`Semua metode ekstraksi Facebook gagal. Detail tiap metode: ${detail}`);
}

module.exports = { extractFacebook };
