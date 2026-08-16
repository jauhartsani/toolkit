/**
 * api/_lib/platforms/instagram.js
 * Urutan: halaman post publik (og:meta + JSON-LD + inline video URL) ->
 * halaman embed publik "/embed/captioned/" -> Cobalt.
 *
 * Disamakan dengan teknik yang sudah terbukti jalan di proyek toolkit
 * sebelumnya: Instagram semakin sering menampilkan anonymous "log in to
 * continue" wall (status 200, HTML asli — bukan error) ke request tanpa
 * cookie/JS, dan itu sekarang jadi penyebab #1 kegagalan, lebih sering
 * daripada post-nya beneran hilang. Kalau tidak dideteksi secara eksplisit,
 * halaman login itu bisa salah kebaca "berhasil" (og:image generik logo
 * Instagram) padahal bukan media post yang diminta.
 *
 * PENTING (bug Reels yang diperbaiki di sini): untuk Reels, Instagram
 * sering TIDAK menaruh tag <meta property="og:video"> di halaman utama
 * sama sekali — cuma og:image (thumbnail). Kalau extractor cuma ngecek
 * og:video lalu jatuh ke og:image begitu og:video kosong, hasilnya salah:
 * yang ke-download jadi FOTO thumbnail, padahal post-nya video. Untuk
 * menghindari ini, extractor sekarang eksplisit menentukan dulu apakah
 * post ini video (dari og:type, JSON-LD VideoObject, atau flag
 * "is_video") SEBELUM memutuskan format apa yang dikembalikan — kalau
 * kedeteksi video tapi link videonya tidak ketemu di halaman utama, dia
 * tidak menyerah ke foto, melainkan lanjut ke fallback halaman embed yang
 * punya kemungkinan lebih besar expose link video-nya.
 */

const { fetchText, fetchJson, browserHeaders, FACEBOT_UA, UA_BY_PLATFORM } = require('../http');
const { cobaltExtract } = require('../cobalt');

// App ID publik yang dipakai web client instagram.com sendiri di browser
// (konstan, sudah lama tidak berubah, banyak dipakai proyek downloader
// lain). Bukan credential rahasia — cuma penanda "request dari web app
// resmi" yang diminta beberapa endpoint internal IG.
const IG_WEB_APP_ID = '936619743392459';

function selectBestImageCandidate(candidates) {
  // Instagram's image_versions2.candidates array contains multiple versions
  // of the same image (different sizes/aspect ratios). Find the one with the
  // largest dimensions (highest quality/original aspect ratio).
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  
  // Find candidate with largest area (width * height)
  let best = candidates[0];
  let bestArea = (best.width || 0) * (best.height || 0);
  
  for (let i = 1; i < candidates.length; i++) {
    const area = (candidates[i].width || 0) * (candidates[i].height || 0);
    if (area > bestArea) {
      bestArea = area;
      best = candidates[i];
    }
  }
  
  return best.url || null;
}

function normalizeInstagramUrl(raw) {
  const u = new URL(raw);
  if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) {
    throw new Error('Link ini bukan link Instagram.');
  }
  return { url: `https://www.instagram.com${u.pathname}`, pathname: u.pathname };
}

// /p/{code}/, /reel/{code}/, /reels/{code}/, /tv/{code}/ -> {code}
function extractShortcode(pathname) {
  const match = pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
  return match ? match[1] : null;
}

// Instagram's anonymous "log in to continue" wall has consistent markers
// regardless of exact copy/locale — detect it so we can report the real
// cause instead of a generic "no media found", and so we don't accidentally
// treat its generic logo image as a successful extraction.
function looksLikeLoginWall(html) {
  return /Log in to Instagram|loginForm|Log in \u2022 Instagram|"require_login"\s*:\s*true/i.test(html);
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\u0026/g, '&');
}

function metaContent(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

// Menentukan apakah post ini video (Reel/IGTV/video biasa) berdasarkan
// beberapa sinyal independen — dipakai supaya kita tahu "ini seharusnya
// video" walaupun tag og:video-nya sendiri tidak ada di halaman.
function isVideoPost(html, pathname) {
  if (/\/(?:reel|reels|tv)\//i.test(pathname || '')) return true; // URL-nya sendiri sudah nunjukin Reel/IGTV
  if (/<meta[^>]+property=["']og:video["']/i.test(html)) return true;
  if (/<meta[^>]+property=["']og:type["'][^>]+content=["'][^"']*video[^"']*["']/i.test(html)) return true;
  if (/"@type"\s*:\s*"VideoObject"/i.test(html)) return true;
  if (/"is_video"\s*:\s*true/i.test(html)) return true;
  return false;
}

function extractJsonLdVideoUrl(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of scripts) {
    try {
      const data = JSON.parse(raw);
      if (data.video && data.video.contentUrl) return data.video.contentUrl;
      if (data['@type'] === 'VideoObject' && data.contentUrl) return data.contentUrl;
    } catch {
      /* ignore malformed blocks */
    }
  }
  return null;
}

function extractInlineVideoUrl(html) {
  const m = html.match(/"video_url":"([^"]+)"/);
  return m ? decodeEntities(m[1]) : null;
}

function extractCarouselFromJsonLd(html) {
  const media = [];
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of scripts) {
    try {
      const data = JSON.parse(raw);
      const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
      images.forEach((img) => media.push(typeof img === 'string' ? img : img.url));
    } catch {
      /* ignore malformed blocks */
    }
  }
  return media;
}

async function fetchInstagramHtml(url, referer, uaOverride) {
  return fetchText(url, { headers: browserHeaders('instagram', referer, uaOverride) }, 12000);
}

async function viaPublicPage(url, pathname, uaOverride) {
  const { ok, status, body } = await fetchInstagramHtml(url, undefined, uaOverride);
  if (!ok && status !== 200) throw new Error(`Instagram merespons status ${status}. Post mungkin private atau dihapus.`);
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');

  const title = metaContent(body, 'og:title') || 'Post Instagram';
  const description = metaContent(body, 'og:description');
  const imageUrl = metaContent(body, 'og:image');
  const uploader = description ? description.split(' on ')[0].replace(/^"/, '') : null;

  const videoLikely = isVideoPost(body, pathname);
  const videoUrl =
    metaContent(body, 'og:video') ||
    metaContent(body, 'og:video:secure_url') ||
    (videoLikely ? extractJsonLdVideoUrl(body) || extractInlineVideoUrl(body) : null);

  if (videoLikely && !videoUrl) {
    // Ini Reel/IGTV/video tapi halaman utama tidak expose link videonya
    // secara langsung — JANGAN jatuh ke foto thumbnail, lempar error
    // supaya lanjut ke fallback embed page yang biasanya lebih terbuka.
    throw new Error('Post ini video tapi link langsungnya tidak ada di halaman utama.');
  }

  if (videoUrl) {
    return { title, thumbnail: imageUrl, duration: null, uploader, formats: [{ label: 'Video', type: 'video', url: videoUrl, filesize_approx: null }] };
  }

  if (!imageUrl) throw new Error('Media tidak ditemukan di halaman post.');

  const carousel = extractCarouselFromJsonLd(body);
  const formats =
    carousel.length > 1
      ? carousel.map((u, i) => ({ label: `Foto ${i + 1}`, type: 'photo', url: u, filesize_approx: null }))
      : [{ label: 'Foto', type: 'photo', url: imageUrl, filesize_approx: null }];

  return { title, thumbnail: imageUrl, duration: null, uploader, formats };
}

// The /embed/captioned/ page is a lighter-weight public render Instagram
// exposes for embedding posts on third-party sites. For posts that are
// still public, it sometimes stays accessible even when the main page
// redirects anonymous requests to a login wall — and for Reels, it more
// often exposes a raw "video_url" in its inline JS than the main page does.
async function viaEmbedPage(url, shortcode) {
  const embedUrl = shortcode
    ? `https://www.instagram.com/p/${shortcode}/embed/captioned/`
    : url.replace(/\/?(\?.*)?$/, '/embed/captioned/');
  const { ok, body } = await fetchInstagramHtml(embedUrl, 'https://www.instagram.com/');
  if (!ok || !body) throw new Error('Gagal mengambil halaman embed Instagram.');
  if (looksLikeLoginWall(body)) throw new Error('LOGIN_WALL');

  // Cek video dulu (raw JS "video_url"), baru gambar — supaya konten video
  // tidak kembali ketuker jadi foto pada fallback ini juga.
  const videoJsMatch = body.match(/"video_url":"([^"]+)"/);
  const videoMeta = metaContent(body, 'og:video') || metaContent(body, 'og:video:secure_url');
  const videoUrl = videoMeta || (videoJsMatch ? decodeEntities(videoJsMatch[1]) : null);

  const imageJsMatch = body.match(/"display_url":"([^"]+)"/);
  const imageUrl = metaContent(body, 'og:image') || (imageJsMatch ? decodeEntities(imageJsMatch[1]) : null);
  const title = metaContent(body, 'og:title') || 'Post Instagram';

  if (videoUrl) {
    return { title, thumbnail: imageUrl, duration: null, uploader: null, formats: [{ label: 'Video', type: 'video', url: videoUrl, filesize_approx: null }] };
  }
  if (imageUrl) {
    return { title, thumbnail: imageUrl, duration: null, uploader: null, formats: [{ label: 'Foto', type: 'photo', url: imageUrl, filesize_approx: null }] };
  }

  throw new Error('Media tidak ditemukan di halaman embed.');
}

// Meta's own link-preview crawler (dipakai buat generate preview link di
// Messenger/WhatsApp/FB post, dll) kadang tetap disajikan halaman post apa
// adanya alih-alih login wall, karena IG butuh og:meta yang benar supaya
// preview-nya jalan. Coba UA ini sebagai varian dari halaman publik biasa
// SEBELUM masuk ke fallback yang lebih berat (embed page/Cobalt). Tidak
// dijamin selalu berhasil — IG bisa ubah kebijakan ini kapan saja tanpa
// pemberitahuan, jadi kalau attempt ini mulai konsisten gagal, aman untuk
// dihapus dari urutan `attempts` di bawah tanpa mempengaruhi metode lain.
async function viaPublicPageAsFacebot(url, pathname) {
  return viaPublicPage(url, pathname, FACEBOT_UA);
}

// Endpoint internal yang dipakai web client instagram.com sendiri buat
// fetch data post lewat XHR (bukan endpoint publik yang didokumentasikan
// resmi). Masih sering bisa diakses tanpa login untuk post PUBLIK selama
// dikirim header X-IG-App-ID yang benar + terlihat seperti XHR dari
// instagram.com. Ini best-effort tambahan: kalau IG ubah struktur response
// atau mulai mewajibkan cookie session di endpoint ini, attempt akan
// gagal dengan bersih dan lanjut ke attempt berikutnya (tidak bikin
// extractor lain ikut rusak).
async function viaWebInfoApi(url, shortcode) {
  if (!shortcode) throw new Error('Tidak ada shortcode untuk dipakai di web info API.');

  const apiUrl = `https://www.instagram.com/api/v1/media/web_info/?media_shortcode=${encodeURIComponent(shortcode)}`;
  const { ok, status, data } = await fetchJson(
    apiUrl,
    {
      headers: {
        'User-Agent': UA_BY_PLATFORM.instagram,
        Accept: '*/*',
        'X-IG-App-ID': IG_WEB_APP_ID,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: url,
      },
    },
    12000
  );

  if (!ok || !data) throw new Error(`Web info API Instagram merespons status ${status} tanpa data.`);

  const item = data.items && data.items[0];
  if (!item) throw new Error('Web info API tidak mengembalikan item media.');

  const title = item.caption?.text?.slice(0, 100) || 'Post Instagram';
  const uploader = item.user?.username || null;

  if (item.video_versions && item.video_versions.length) {
    const best = item.video_versions[0]; // sudah urut dari kualitas tertinggi
    const thumbnail = selectBestImageCandidate(item.image_versions2?.candidates || []);
    return { title, thumbnail, duration: item.video_duration || null, uploader, formats: [{ label: 'Video', type: 'video', url: best.url, filesize_approx: null }] };
  }

  if (item.carousel_media && item.carousel_media.length) {
    const formats = item.carousel_media.map((m, i) => {
      if (m.video_versions && m.video_versions.length) {
        // Video di dalam carousel juga selalu punya cover image sendiri
        // (image_versions2) — dipakai sebagai thumbnail preview-nya,
        // karena file video itu sendiri tidak bisa ditampilkan di <img>.
        const cover = selectBestImageCandidate(m.image_versions2?.candidates || []);
        return { label: `Video ${i + 1}`, type: 'video', url: m.video_versions[0].url, thumbnail: cover, filesize_approx: null };
      }
      // Select highest-quality candidate (largest dimensions = original aspect ratio)
      const img = selectBestImageCandidate(m.image_versions2?.candidates || []);
      return { label: `Foto ${i + 1}`, type: 'photo', url: img, filesize_approx: null };
    }).filter((f) => f.url);
    if (formats.length) return { title, thumbnail: formats[0].url, duration: null, uploader, formats };
  }

  // Select highest-quality candidate (largest dimensions = original aspect ratio)
  const image = selectBestImageCandidate(item.image_versions2?.candidates || []);
  if (image) {
    return { title, thumbnail: image, duration: null, uploader, formats: [{ label: 'Foto', type: 'photo', url: image, filesize_approx: null }] };
  }

  throw new Error('Web info API tidak punya media yang bisa dipakai di response-nya.');
}

// Panggil api/instagram.py (runtime Python Vercel terpisah) yang membungkus
// `instaloader` (github.com/instaloader/instaloader, MIT, 13.000+ stars,
// aktif di-maintain) — library scraping Instagram paling matang yang ada,
// dipakai lewat Python karena API class Post-nya sudah stabil &
// terdokumentasi resmi (jauh lebih pasti daripada menebak struktur
// endpoint scraping sendiri di JS). Lihat komentar lengkap di
// api/instagram.py, termasuk soal rate-limit anonim dari IP cloud.
//
// `baseUrl` WAJIB diisi oleh caller (extract.js, yang tahu host request
// masuk) supaya internal fetch ke "/api/instagram" tahu domain yang benar
// — function ini sendiri tidak tahu domain deployment-nya.
async function viaInstaloader(url, baseUrl, { audioOnly } = {}) {
  if (!baseUrl) throw new Error('viaInstaloader butuh baseUrl (dari request masuk), tapi tidak diisi.');

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/instagram`;
  const { ok, status, data } = await fetchJson(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url, audio_only: !!audioOnly }),
    },
    25000
  );

  if (!data) throw new Error(`api/instagram.py merespons status ${status} tanpa data.`);
  if (data.error) throw new Error(`instaloader: ${data.error}`);
  if (!ok || !data.formats || !data.formats.length) {
    throw new Error(`instaloader tidak mengembalikan format media yang bisa dipakai (status ${status}).`);
  }

  return {
    title: data.title || 'Post Instagram',
    thumbnail: data.thumbnail || null,
    duration: data.duration || null,
    uploader: data.uploader || null,
    formats: data.formats,
  };
}

async function extractInstagram(url, { audioOnly, baseUrl } = {}) {
  const { url: cleanUrl, pathname } = normalizeInstagramUrl(url);
  const shortcode = extractShortcode(pathname);

  let sawLoginWall = false;
  
  // Instagram carousel posts sering tidak expose semua carousel items di public page
  // JSON-LD — lebih reliable gunakan instaloader Python yang specifically designed untuk ini.
  // Cek dulu: kalau URL-nya /p/{code}/, likely carousel (vs /reel/ yang biasanya single video)
  const likelyCarousel = /\/p\//.test(pathname);
  
  const namedAttempts = likelyCarousel
    ? [
        ['instaloader', () => viaInstaloader(cleanUrl, baseUrl, { audioOnly })],  // Prioritas: carousel
        ['halaman-publik', () => viaPublicPage(cleanUrl, pathname)],
        ['halaman-publik+facebot-ua', () => viaPublicPageAsFacebot(cleanUrl, pathname)],
        ['web-info-api', () => viaWebInfoApi(cleanUrl, shortcode)],
        ['halaman-embed', () => viaEmbedPage(cleanUrl, shortcode)],
        ['cobalt', () => cobaltExtract(cleanUrl, { audioOnly })],
      ]
    : [
        ['halaman-publik', () => viaPublicPage(cleanUrl, pathname)],  // Non-carousel: try fast method first
        ['halaman-publik+facebot-ua', () => viaPublicPageAsFacebot(cleanUrl, pathname)],
        ['web-info-api', () => viaWebInfoApi(cleanUrl, shortcode)],
        ['halaman-embed', () => viaEmbedPage(cleanUrl, shortcode)],
        ['instaloader', () => viaInstaloader(cleanUrl, baseUrl, { audioOnly })],
        ['cobalt', () => cobaltExtract(cleanUrl, { audioOnly })],
      ];

  // Kumpulkan pesan error tiap attempt (bukan cuma yang terakhir) supaya
  // kalau semuanya gagal, kita tahu PERSIS kenapa masing-masing gagal —
  // ini jauh lebih berguna buat debugging daripada cuma lihat pesan error
  // Cobalt di paling akhir (yang seringkali cuma gejala, bukan akar
  // masalahnya — akar masalahnya ada di salah satu dari 4 metode sebelum
  // Cobalt yang seharusnya sudah cukup tanpa perlu sampai ke Cobalt sama
  // sekali untuk konten publik).
  const attemptErrors = [];
  for (const [name, attempt] of namedAttempts) {
    try {
      return await attempt();
    } catch (e) {
      if (e.message === 'LOGIN_WALL') sawLoginWall = true;
      attemptErrors.push(`[${name}] ${e.message}`);
    }
  }

  const detail = attemptErrors.join(' | ');

  if (sawLoginWall) {
    throw new Error(
      `Instagram menampilkan halaman "log in to continue" untuk link ini di beberapa metode alih-alih post aslinya. Detail tiap metode: ${detail}`
    );
  }
  throw new Error(`Semua metode ekstraksi Instagram gagal. Detail tiap metode: ${detail}`);
}

module.exports = { extractInstagram };
