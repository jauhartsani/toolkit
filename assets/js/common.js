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
  if (!blob) throw new Error('Unable to create the download file.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function generateQrCanvas(canvas, text, onSuccess, onFailure) {
  if (!window.QRCode) {
    if (window.toolkitQrFallbackLoading) return;
    window.toolkitQrFallbackLoading = true;
    const fallback = document.createElement('script');
    fallback.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    fallback.onload = () => { window.toolkitQrFallbackLoading = false; generateQrCanvas(canvas, text, onSuccess, onFailure); };
    fallback.onerror = () => { window.toolkitQrFallbackLoading = false; onFailure('QR library could not be loaded. Check your internet connection and try again.'); };
    document.head.appendChild(fallback);
    return;
  }
  try {
    if (typeof QRCode.toCanvas !== 'function') {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:260px;height:260px;';
      document.body.appendChild(holder);
      new QRCode(holder, { text, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.H });
      const render = () => {
        const source = holder.querySelector('canvas, img');
        if (!source) { holder.remove(); onFailure('Failed to generate QR code.'); return; }
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 260; canvas.height = 260;
        context.drawImage(source, 0, 0, 260, 260);
        holder.remove();
        onSuccess();
      };
      const image = holder.querySelector('img');
      if (image) image.onload = render;
      else setTimeout(render, 50);
      return;
    }
    QRCode.toCanvas(canvas, text, { width: 260, margin: 2, color: { dark: '#14171F', light: '#FFFFFF' } }, error => {
      if (error) onFailure('Failed to generate QR code.');
      else onSuccess();
    });
  } catch (error) {
    onFailure('Failed to generate QR code.');
  }
}

function downloadCanvas(canvas, filename, onFailure) {
  canvas.toBlob(blob => {
    if (!blob) { onFailure('Unable to create PNG download.'); return; }
    try { triggerDownload(blob, filename); } catch (error) { onFailure('Unable to download the QR code.'); }
  }, 'image/png');
}

/**
 * Simulated interstitial ad flow (placeholder monetization).
 * Shows a full-screen modal for ~3s ("Processing file... Please wait"),
 * then reveals a "Skip Ad & Download" button. Clicking it (or auto after
 * the timer, whichever the tool prefers) invokes `onComplete`.
 */
function runWithAd(onComplete) {
  armPopunder();
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

/* ==========================================================================
   Ad placements (toolkitme.my.id ad tags)
   - loadSocialBar(): floating bar, loaded once per page.
   - loadNativeBanner(): inline banner container, inserted just above the
     footer on every page (below the fold, out of the way of the tools).
   - armPopunder(): loads the popunder script lazily, the first time a user
     actually triggers a tool action (via runWithAd), not on page load —
     keeps it tied to real engagement instead of firing on every pageview.
   ========================================================================== */
function loadSocialBar() {
  if (window.__tkSocialBarLoaded) return;
  window.__tkSocialBarLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://pl30569172.effectivecpmnetwork.com/39/87/4b/39874b9e5e5c989ccd18f2970e3a93ee.js';
  document.body.appendChild(s);
}

function loadNativeBanner() {
  const containerId = 'container-e500dd269ce4ebc1690c57fbe4fbf948';
  if (document.getElementById(containerId)) return;
  const footer = document.querySelector('.tk-footer');
  const container = document.createElement('div');
  container.id = containerId;
  container.style.cssText = 'max-width:960px;margin:32px auto;padding:0 16px;';
  if (footer && footer.parentNode) {
    footer.parentNode.insertBefore(container, footer);
  } else {
    document.body.appendChild(container);
  }
  const s = document.createElement('script');
  s.async = true;
  s.setAttribute('data-cfasync', 'false');
  s.src = 'https://pl30569173.effectivecpmnetwork.com/e500dd269ce4ebc1690c57fbe4fbf948/invoke.js';
  document.body.appendChild(s);
}

function armPopunder() {
  if (window.__tkPopunderLoaded) return;
  window.__tkPopunderLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://pl30569171.effectivecpmnetwork.com/75/ac/f1/75acf15cd5a545892e2b511c0d1136ea.js';
  document.body.appendChild(s);
}

function setupTheme() {
  const saved = localStorage.getItem('toolkit-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  const headerInner = document.querySelector('.tk-header-inner');
  if (!headerInner || document.querySelector('.tk-theme-toggle')) return;
  const actions = document.createElement('div');
  actions.className = 'tk-header-actions';
  actions.innerHTML = '<button class="tk-theme-toggle" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"></button><button class="tk-nav-toggle" id="tk-nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>';
  headerInner.appendChild(actions);
  const themeButton = actions.querySelector('.tk-theme-toggle');
  const updateThemeButton = () => { themeButton.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾'; };
  themeButton.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('toolkit-theme', next);
    updateThemeButton();
  });
  updateThemeButton();
}

function translatePageToEnglish() {
  document.documentElement.lang = 'en';
  const replacements = [
    ['Semua tools yang Anda butuhkan,', 'All the tools you need,'],
    ['berjalan di browser Anda sendiri.', 'running in your own browser.'],
    ['Kompres gambar & PDF, edit dokumen, convert format, generator QR, kalkulator, dan lainnya — tanpa install, tanpa upload ke server, dan gratis.', 'Compress images and PDFs, edit documents, convert formats, generate QR codes, calculate values, and more — no installation, no server uploads, and completely free.'],
    ['Tidak ada tools yang cocok dengan pencarian Anda.', 'No tools match your search.'],
    ['Cari tools', 'Search tools'], ['misal:', 'for example:'],
    ['Perkecil ukuran', 'Reduce the size'], ['Kompresi', 'Compression'], ['tetap terjaga', 'preserved'], ['Hemat ukuran', 'Reduce file size'],
    ['Klik di halaman untuk menambahkan', 'Click the page to add'], ['Gambar & tempelkan tanda tangan', 'Draw and place a signature'],
    ['Gabungkan', 'Combine'], ['Pisahkan', 'Split'], ['Ubah', 'Convert'], ['Susun', 'Combine'], ['menjadi', 'to'],
    ['Hitung', 'Calculate'], ['Simulasi', 'Simulate'], ['Acak', 'Random'], ['Alat acak', 'Random tool'],
    ['teks biasa', 'plain text'], ['link website', 'website link'], ['pesan otomatis', 'automatic message'], ['langsung menghubungkan ke WiFi', 'connect directly to WiFi'],
    ['kartu nama digital siap simpan', 'digital business card ready to save'], ['waktu baca', 'reading time'], ['harga akhir setelah diskon & pajak', 'final price after discount and tax'],
    ['pertumbuhan investasi berbunga', 'investment growth with compound interest'], ['password acak aman', 'secure random password'], ['sistem undian', 'drawings'],
    ['Beautify, minify, dan validasi', 'Beautify, minify, and validate'], ['dua arah', 'in both directions'],
    ['Hasil', 'Result'], ['Pajak', 'Tax'], ['Bunga Majemuk', 'Compound Interest'], ['Kata sandi', 'Password'], ['Tanpa duplikat', 'No duplicates'],
    ['Acak Sekarang', 'Pick Now'], ['Rapikan', 'Beautify'], ['kecilkan', 'Minify'], ['validasi', 'Validate'], ['Pisahkan PDF', 'Split PDF'],
    ['Gabungkan PDF', 'Merge PDF'], ['Tanda tangan', 'Signature'], ['Ketik atau tempel', 'Type or paste'],
    ['Generator QR Code', 'QR Code Generator'], ['Generator', 'Generator'], ['Gratis', 'Free'], ['Online', 'Online'],
    ['Buat QR Code', 'Generate QR Code'], ['Download QR', 'Download QR'], ['Gagal membuat QR', 'Failed to generate QR code'],
    ['Nama Lengkap', 'Full Name'], ['Nomor HP', 'Phone Number'], ['Nama Anda', 'Your name'], ['Nomor WhatsApp', 'WhatsApp Number'],
    ['format internasional, tanpa +', 'international format, without +'], ['Pesan Otomatis (opsional)', 'Prefilled Message (optional)'],
    ['Halo, saya ingin bertanya', 'Hello, I would like to ask'], ['Nama WiFi', 'WiFi Name'], ['Kata sandi WiFi', 'WiFi password'],
    ['Jenis Keamanan', 'Security Type'], ['Tanpa Password', 'No Password'], ['Teks', 'Text'], ['Ketik teks', 'Type text'],
    ['Kumpulan tools online', 'Collection of online tools'], ['berjalan langsung di browser Anda', 'run directly in your browser'], ['Gratis & Client-Side', 'Free & Client-Side']
  ];
  const replace = value => replacements.reduce((result, pair) => result.split(pair[0]).join(pair[1]), value);
  document.querySelectorAll('body *').forEach(element => {
    element.childNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE) node.nodeValue = replace(node.nodeValue); });
    ['placeholder', 'title', 'aria-label', 'content', 'data-name'].forEach(attribute => {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, replace(element.getAttribute(attribute)));
    });
  });
  document.title = replace(document.title);
}

/* mobile nav */
document.addEventListener('DOMContentLoaded', () => {
  translatePageToEnglish();
  setupTheme();
  loadSocialBar();
  loadNativeBanner();
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
    'Random Generators': 'random/index.html',
    Instagram: 'instagram/index.html',
    'Instagram Downloader': 'instagram/index.html',
    TikTok: 'tiktok/index.html',
    'TikTok Downloader': 'tiktok/index.html'
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
      toggle.setAttribute('aria-expanded', nav.classList.contains('tk-nav-open') ? 'true' : 'false');
    });
  }
});
