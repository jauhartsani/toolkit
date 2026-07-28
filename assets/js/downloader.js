/* ==========================================================================
   Shared downloader logic used by /instagram/*.html and /tiktok/*.html
   Calls the serverless API (/api/instagram or /api/tiktok), then renders
   result cards with a direct download link per media item.
   ========================================================================== */

function dlSetStatus(statusId, msg, isError) {
  const el = document.getElementById(statusId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : 'var(--slate-soft)';
}

function dlRenderResults(resultId, mediaList) {
  const el = document.getElementById(resultId);
  el.innerHTML = '';
  el.style.display = 'grid';
  mediaList.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'dl-result-card';
    const isVideo = m.type === 'video';
    const label = isVideo ? 'Download Video' : (m.type === 'audio' ? 'Download Audio (MP3)' : 'Download Photo');
    card.innerHTML =
      (isVideo
        ? `<video src="${m.url}" controls playsinline class="dl-thumb"></video>`
        : (m.type === 'audio'
            ? `<div class="dl-thumb" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;">Audio Track</div>`
            : `<img src="${m.thumbnail || m.url}" class="dl-thumb" alt="Downloaded media preview" loading="lazy">`)) +
      `<a href="${m.url}" download target="_blank" rel="noopener" class="btn btn-primary btn-block" style="margin-top:10px;">${label}${mediaList.length > 1 ? ' #' + (i + 1) : ''}</a>`;
    el.appendChild(card);
  });
}

async function dlRun(apiEndpoint, inputId, resultId, statusId, btnId) {
  const input = document.getElementById(inputId);
  const url = (input.value || '').trim();
  const resultEl = document.getElementById(resultId);
  const btn = document.getElementById(btnId);
  resultEl.style.display = 'none';
  resultEl.innerHTML = '';

  if (!url) { dlSetStatus(statusId, 'Tempel link terlebih dahulu.', true); return; }
  try { new URL(url); } catch { dlSetStatus(statusId, 'Link tidak valid.', true); return; }

  btn.disabled = true;
  dlSetStatus(statusId, 'Memproses link…', false);

  runWithAd(async () => {
    try {
      const res = await fetch(`${apiEndpoint}?url=${encodeURIComponent(url)}`);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // This happens when /api/* isn't actually running as a serverless
        // function (e.g. the site is opened as plain static files, hosted
        // on a static-only host, or run via a basic local file server) —
        // the request falls through to a 404/HTML page instead of the API.
        throw new Error('Fitur ini butuh backend serverless (mis. Vercel) yang aktif. Endpoint API tidak merespons dengan JSON — pastikan situs di-deploy ke Vercel (bukan hosting statis biasa) atau jalankan "vercel dev" saat mencoba secara lokal.');
      }
      const data = await res.json();
      if (!res.ok || !data.success || !data.media || !data.media.length) {
        throw new Error(data.error || 'Gagal mengambil media. Pastikan link publik dan valid.');
      }
      dlRenderResults(resultId, data.media);
      dlSetStatus(statusId, `Ditemukan ${data.media.length} file.`, false);
    } catch (err) {
      dlSetStatus(statusId, err.message || 'Terjadi kesalahan. Coba lagi.', true);
    } finally {
      btn.disabled = false;
    }
  });
}

function dlSetupPaste(pasteBtnId, inputId) {
  const pasteBtn = document.getElementById(pasteBtnId);
  if (!pasteBtn) return;
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById(inputId).value = text;
    } catch {
      document.getElementById(inputId).focus();
    }
  });
}
