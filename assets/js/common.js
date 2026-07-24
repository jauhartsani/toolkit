/* ==========================================================================
   TOOLKIT — shared runtime helpers (loaded on every page)
   - formatBytes / triggerDownload
   - runWithAd(): shows the 3s "Processing file..." interstitial, then reveals
     "Skip Ad & Download" which fires the real callback. Used by every tool's
     primary action button.
   - mobile nav toggle
   ========================================================================== */

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Simulated interstitial ad flow (placeholder monetization).
 * Shows a full-screen modal for ~3s ("Processing file... Please wait"),
 * then reveals a "Skip Ad & Download" button. Clicking it (or auto after
 * the timer, whichever the tool prefers) invokes `onComplete`.
 */
function runWithAd(onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'adm-overlay';
  overlay.innerHTML = `
    <div class="adm-box" role="dialog" aria-modal="true" aria-label="Advertisement">
      <div class="adm-canvas">
        <div class="adm-ring"></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.08em;">ADVERTISEMENT SLOT</div>
      </div>
      <div class="adm-body">
        <div class="adm-label">Processing file</div>
        <h4 id="adm-msg">Processing file... Please wait</h4>
        <p>Your download will be ready in a moment.</p>
        <button class="btn btn-primary btn-block" id="adm-skip" disabled>Please wait… (<span id="adm-count">3</span>s)</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let remaining = 3;
  const countEl = overlay.querySelector('#adm-count');
  const skipBtn = overlay.querySelector('#adm-skip');

  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      skipBtn.disabled = false;
      skipBtn.textContent = 'Skip Ad & Download';
      overlay.querySelector('#adm-msg').textContent = 'Your file is ready';
    } else {
      countEl.textContent = remaining;
    }
  }, 1000);

  skipBtn.addEventListener('click', () => {
    overlay.remove();
    onComplete();
  });
}

/* mobile nav */
document.addEventListener('DOMContentLoaded', () => {
  const categoryLinks = {
    Compress: 'compress/index.html',
    PDF: 'pdf/index.html',
    'PDF Tools': 'pdf/index.html',
    Convert: 'convert/index.html',
    'QR Code': 'qr/index.html',
    'QR Generator': 'qr/index.html',
    Text: 'text/index.html',
    'Text Tools': 'text/index.html',
    Dev: 'dev/index.html',
    'Dev Tools': 'dev/index.html',
    Calculator: 'calc/index.html',
    Random: 'random/index.html',
    'Random Generators': 'random/index.html'
  };
  const isInnerPage = document.querySelector('.tk-logo')?.getAttribute('href')?.startsWith('../');
  document.querySelectorAll('#tk-nav a').forEach(link => {
    const target = categoryLinks[link.textContent.trim()];
    if (target) link.href = `${isInnerPage ? '../' : ''}${target}`;
  });

  const breadcrumbCategory = document.querySelector('.tk-breadcrumb a:nth-of-type(2)');
  if (breadcrumbCategory) {
    const target = categoryLinks[breadcrumbCategory.textContent.trim()];
    if (target) breadcrumbCategory.href = `../${target}`;
  }

  const toggle = document.getElementById('tk-nav-toggle');
  const nav = document.getElementById('tk-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      nav.classList.toggle('tk-nav-open');
    });
  }
});
