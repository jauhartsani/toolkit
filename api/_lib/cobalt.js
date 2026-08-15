/**
 * api/_lib/cobalt.js
 * Fallback terakhir untuk semua platform: instance publik Cobalt
 * (https://github.com/imputnet/cobalt). Dipakai kalau metode utama
 * (tikwm/vxtwitter/embed-scraping/dst) gagal atau diblokir.
 *
 * PENTING: instance publik Cobalt kadang berganti alamat/butuh API key
 * seiring waktu (mereka sempat migrasi dari co.wuk.sh ke api.cobalt.tools
 * dengan skema auth baru). Kalau fallback ini mulai gagal terus, cek
 * https://github.com/imputnet/cobalt/blob/main/docs/api.md untuk instance
 * publik terbaru dan sesuaikan COBALT_API_URL di bawah (atau self-host
 * instance sendiri dan ganti URL-nya di sini / lewat env var COBALT_API_URL).
 */

const { fetchJson } = require('./http');

const COBALT_API_URL = process.env.COBALT_API_URL || 'https://api.cobalt.tools/api/json';

async function cobaltExtract(url, { audioOnly = false } = {}) {
  const { ok, status, data } = await fetchJson(
    COBALT_API_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        url,
        vCodec: 'h264',
        vQuality: '1080',
        aFormat: 'mp3',
        isAudioOnly: audioOnly,
        filenamePattern: 'basic',
        disableMetadata: true,
      }),
    },
    15000
  );

  if (!ok || !data) {
    throw new Error(`Cobalt merespons status ${status} tanpa data.`);
  }
  if (data.status === 'error') {
    throw new Error(data.text || 'Cobalt gagal memproses link ini.');
  }
  // status: "stream" | "redirect" -> data.url siap pakai
  if ((data.status === 'stream' || data.status === 'redirect') && data.url) {
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
  // status: "picker" -> beberapa pilihan media (mis. carousel/foto)
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
