/**
 * api/_lib/http.js
 * Helper fetch bersama: header mirip browser + timeout, dipakai semua
 * extractor platform supaya tidak gampang diblokir sebagai bot dan tidak
 * pernah menggantung sampai Vercel memotong paksa function-nya.
 *
 * PENTING: satu User-Agent generik untuk semua platform ternyata tidak
 * cukup — Instagram dan TikTok merespons berbeda tergantung device yang
 * "terlihat" mengakses (mis. Instagram lebih sering menampilkan halaman
 * post apa adanya untuk UA desktop, sementara TikTok konsisten dengan UA
 * mobile Safari). UA per platform di bawah ini disamakan dengan yang
 * sudah terbukti jalan di proyek toolkit sebelumnya.
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const UA_BY_PLATFORM = {
  tiktok: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  facebook: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  x: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

/** Header "mirip browser sungguhan" untuk scraping HTML (bukan API JSON pihak ketiga). */
function browserHeaders(platform, referer) {
  return {
    'User-Agent': UA_BY_PLATFORM[platform] || DEFAULT_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    ...(referer ? { Referer: referer } : {}),
  };
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** GET lalu parse sebagai teks (dipakai buat scraping HTML). */
async function fetchText(url, opts = {}, timeoutMs = 12000) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, finalUrl: res.url || url };
}

/** GET/POST lalu parse sebagai JSON (dipakai buat API pihak ketiga). */
async function fetchJson(url, opts = {}, timeoutMs = 12000) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Follow redirect dari short-link (vt.tiktok.com, vm.tiktok.com, fb.watch,
 * dll) sebelum di-scrape — kalau tidak, halaman redirect-nya sendiri yang
 * ke-scrape dan tidak akan ada data video di situ.
 */
async function resolveRedirect(url, opts = {}, timeoutMs = 10000) {
  try {
    const res = await fetchWithTimeout(url, { ...opts, redirect: 'follow' }, timeoutMs);
    return res.url || url;
  } catch {
    return url;
  }
}

module.exports = { DEFAULT_UA, UA_BY_PLATFORM, browserHeaders, fetchWithTimeout, fetchText, fetchJson, resolveRedirect };
