/**
 * api/_lib/cobalt.js
 * Fallback terakhir untuk semua platform.
 * Dipakai kalau metode utama (tikwm/vxtwitter/embed-scraping/dst) gagal.
 *
 * PENTING — DUA HAL BERUBAH DARI VERSI SEBELUMNYA:
 *
 * 1. Skema API Cobalt berubah total. Versi lama (`/api/json` dengan field
 *    `vCodec`/`isAudioOnly`/`filenamePattern`) sudah DIMATIKAN sejak
 *    November 2024. Sekarang endpoint-nya `POST /` (root) dengan field
 *    `downloadMode`/`audioFormat`/`videoQuality`/`filenameStyle`, dan
 *    status respons jadi `tunnel` / `local-processing` / `redirect` /
 *    `picker` / `error` (bukan lagi `stream`). Kode di bawah sudah
 *    disesuaikan ke skema baru ini.
 *
 * 2. Instance publik `api.cobalt.tools` SEKARANG MEMBLOKIR pemakaian dari
 *    luar (bot protection + wajib API key/Turnstile) — ini kebijakan
 *    resmi tim Cobalt, bukan bug di kode kita:
 *    https://github.com/imputnet/cobalt/blob/main/docs/api.md
 *    ("hosted api instances ... are not intended to be used in other
 *    projects without explicit permission").
 *
 *    Konsekuensinya: fallback ini TIDAK akan jalan sampai kamu set env
 *    var COBALT_API_URL ke instance Cobalt milikmu sendiri (self-host
 *    via Docker — lihat README-DOWNLOADER.md) atau instance komunitas
 *    yang secara eksplisit mengizinkan pemakaian API dari luar. Tanpa
 *    itu, fungsi ini akan langsung gagal dengan pesan yang jelas
 *    (bukan diam-diam mencoba api.cobalt.tools dan dapat 400).
 */

const { fetchJson } = require('./http');

const COBALT_API_URL = process.env.COBALT_API_URL; // wajib diisi sendiri, lihat catatan di atas

async function cobaltExtract(url, { audioOnly = false } = {}) {
  if (!COBALT_API_URL) {
    throw new Error(
      'Fallback Cobalt belum aktif: env var COBALT_API_URL belum diset. ' +
        'Instance publik api.cobalt.tools sekarang menolak request dari luar, ' +
        'jadi wajib pakai instance Cobalt sendiri — lihat README-DOWNLOADER.md.'
    );
  }

  const endpoint = COBALT_API_URL.replace(/\/+$/, ''); // buang trailing slash, endpoint utama = root "/"

  const { ok, status, data } = await fetchJson(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        url,
        downloadMode: audioOnly ? 'audio' : 'auto',
        audioFormat: 'mp3',
        videoQuality: '1080',
        filenameStyle: 'basic',
        disableMetadata: true,
      }),
    },
    15000
  );

  if (!data) {
    throw new Error(`Cobalt merespons status ${status} tanpa data yang bisa dibaca.`);
  }
  if (data.status === 'error') {
    const code = data.error?.code || 'unknown';
    throw new Error(`Cobalt menolak link ini (kode: ${code}).`);
  }
  if (!ok) {
    throw new Error(`Cobalt merespons status ${status}.`);
  }

  // tunnel/redirect -> satu URL siap pakai
  if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
    return {
      formats: [
        {
          label: audioOnly ? 'Audio' : 'Video (via Cobalt)',
          url: data.url,
          filesize_approx: null,
        },
      ],
    };
  }

  // local-processing -> array tunnel URL (biasanya video+audio terpisah,
  // ambil yang pertama karena frontend kita cuma butuh satu link download)
  if (data.status === 'local-processing' && Array.isArray(data.tunnel) && data.tunnel.length) {
    return {
      formats: data.tunnel.map((tunnelUrl, i) => ({
        label: i === 0 ? (audioOnly ? 'Audio' : 'Video (via Cobalt)') : `Media ${i + 1}`,
        url: tunnelUrl,
        filesize_approx: null,
      })),
    };
  }

  // picker -> beberapa pilihan media (mis. carousel/foto/slideshow)
  if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length) {
    return {
      formats: data.picker.map((item, i) => ({
        label: item.type === 'photo' ? `Foto ${i + 1}` : `Media ${i + 1}`,
        url: item.url,
        filesize_approx: null,
      })),
    };
  }

  throw new Error('Cobalt tidak mengembalikan link media yang bisa dipakai.');
}

module.exports = { cobaltExtract };
