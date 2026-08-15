/**
 * api/_lib/http.js
 * Helper fetch bersama: header mirip browser + timeout, dipakai semua
 * extractor platform supaya tidak gampang diblokir sebagai bot dan tidak
 * pernah menggantung sampai Vercel memotong paksa function-nya.
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

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
  return { ok: res.ok, status: res.status, body };
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

module.exports = { DEFAULT_UA, fetchWithTimeout, fetchText, fetchJson };
