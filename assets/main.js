(function(){
  // language switcher
  function setupLanguageSwitcher() {
    var langSwitch = document.getElementById('langSwitch');
    var langSwitchMobile = document.getElementById('langSwitchMobile');
    var currentPath = window.location.pathname;
    var isEnglish = currentPath.startsWith('/en/');

    // Simpan pilihan bahasa manual ke cookie `lang` (1 tahun) supaya
    // middleware.mjs (auto-redirect berdasarkan geolocation) selalu
    // menghormati pilihan ini dan tidak menimpanya lagi di kunjungan
    // berikutnya.
    function setLangCookie(lang) {
      document.cookie = 'lang=' + lang + '; Path=/; Max-Age=31536000; SameSite=Lax';
    }

    if (langSwitch) {
      langSwitch.textContent = isEnglish ? 'Bahasa' : 'English';
      langSwitch.addEventListener('click', function() {
        if (isEnglish) {
          // Go to Indonesian version
          setLangCookie('id');
          var newPath = currentPath.replace('/en/', '/');
          window.location.href = newPath || '/';
        } else {
          // Go to English version
          setLangCookie('en');
          var newPath = '/en' + (currentPath === '/' ? '/' : currentPath);
          window.location.href = newPath;
        }
      });
    }

    if (langSwitchMobile) {
      langSwitchMobile.textContent = isEnglish ? 'Bahasa' : 'English';
      langSwitchMobile.addEventListener('click', function() {
        if (isEnglish) {
          setLangCookie('id');
          var newPath = currentPath.replace('/en/', '/');
          window.location.href = newPath || '/';
        } else {
          setLangCookie('en');
          var newPath = '/en' + (currentPath === '/' ? '/' : currentPath);
          window.location.href = newPath;
        }
      });
    }
  }
  setupLanguageSwitcher();

  // mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var mnav = document.getElementById('mobile-nav');
  toggle && toggle.addEventListener('click', function(){
    var open = mnav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.mobile-nav a, .mobile-nav button').forEach(function(a){
    a.addEventListener('click', function(){ mnav.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); });
  });

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // hero entrance: stagger elements marked [data-reveal] inside .hero on load
  var heroReveals = document.querySelectorAll('.hero [data-reveal]');
  heroReveals.forEach(function(el, i){
    setTimeout(function(){ el.classList.add('in'); }, reduceMotion ? 0 : 90 * i + 60);
  });

  // scroll reveal for the rest of the page
  var scrollTargets = document.querySelectorAll('[data-reveal]:not(.hero [data-reveal]), [data-reveal-scale]');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, {threshold:.15, rootMargin:'0px 0px -40px 0px'});
    scrollTargets.forEach(function(t){ io.observe(t); });
  } else {
    scrollTargets.forEach(function(t){ t.classList.add('in'); });
  }

  // rotating placeholder examples in the hero input
  var examples = [
    'tiktok.com/@user/video/7291...',
    'instagram.com/reel/C8f2x...',
    'facebook.com/watch/?v=1029...',
    'x.com/user/status/1837...'
  ];
  var input = document.getElementById('urlInput');
  var i = 0;
  var currentPath = window.location.pathname;
  var isEnglish = currentPath.startsWith('/en/');
  var placeholderPrefix = isEnglish ? 'example: ' : 'contoh: ';
  if(input && !reduceMotion){
    setInterval(function(){
      i = (i+1) % examples.length;
      if(document.activeElement !== input){
        input.setAttribute('placeholder', placeholderPrefix + examples[i]);
      }
    }, 2600);
  }

  // downloader form -> real API call
  var form = document.getElementById('demoDownloader');
  if(!form) return;

  var submitBtn = document.getElementById('submitBtn');
  var resultCard = document.getElementById('resultCard');
  var resultError = document.getElementById('resultError');

  function formatSize(bytes){
    if(!bytes) return '';
    var mb = bytes / (1024*1024);
    return mb >= 1 ? mb.toFixed(1) + ' MB' : (bytes/1024).toFixed(0) + ' KB';
  }

  function setLoading(isLoading){
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? '<span class="spinner"></span><span class="btn-plug-label">Memproses…</span>'
      : '<span class="btn-plug-label">Download</span>';
  }

  function showError(msg){
    resultCard.hidden = true;
    resultCard.classList.remove('in');
    resultError.hidden = false;
    resultError.textContent = msg;
  }

  // Placeholder abu-abu (data URI, tanpa request jaringan) dipasang kalau
  // sebuah thumbnail tetap gagal dimuat (mis. hotlink diblokir sumbernya),
  // supaya card tidak pernah tampil kosong/rusak sama sekali.
  var BROKEN_THUMB_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<rect width="200" height="200" fill="#1a1f27"/>' +
    '<path d="M60 130l30-38 22 26 18-22 30 34H60z" fill="#3a4250"/>' +
    '<circle cx="76" cy="76" r="12" fill="#3a4250"/></svg>'
  );

  function showResult(data){
    resultError.hidden = true;
    document.getElementById('resultPlatform').textContent = data.platform;
    document.getElementById('resultTitle').textContent = data.title;

    // Grid kartu download: 1 kartu = 1 thumbnail besar + 1 tombol download
    // di tengah bawahnya. Untuk carousel Instagram, satu kartu dibuat per
    // item carousel (bukan cuma item pertama).
    var previewGallery = document.getElementById('resultPreviewGallery');
    previewGallery.innerHTML = '';

    var metaBits = [];
    if(data.uploader) metaBits.push(data.uploader);
    if(data.duration) metaBits.push(Math.round(data.duration) + 's');
    document.getElementById('resultMeta').textContent = metaBits.join(' · ');

    var formats = data.formats || [];
    var isMulti = formats.length > 1;

    formats.forEach(function(f){
      var card = document.createElement('div');
      card.className = 'dl-card';

      var media = document.createElement('div');
      media.className = 'dl-card-media';
      var img = document.createElement('img');
      img.src = f.preview || data.thumbnail || BROKEN_THUMB_SVG;
      img.alt = f.label || data.title || '';
      img.loading = 'lazy';
      img.onerror = function(){ img.onerror = null; img.src = BROKEN_THUMB_SVG; };
      media.appendChild(img);
      card.appendChild(media);

      if(isMulti){
        var label = document.createElement('p');
        label.className = 'dl-card-label';
        label.textContent = f.label;
        card.appendChild(label);
      }

      var size = formatSize(f.filesize_approx);
      var downloadLink = document.createElement('a');
      downloadLink.href = f.url;
      downloadLink.target = '_blank';
      downloadLink.rel = 'noopener';
      downloadLink.download = '';
      downloadLink.className = 'dl-btn';
      downloadLink.textContent = 'Download' + (isMulti ? '' : ' ' + f.label) + (size ? ' (' + size + ')' : '');
      card.appendChild(downloadLink);

      previewGallery.appendChild(card);
    });

    resultCard.hidden = false;
    // restart the entrance animation
    resultCard.classList.remove('in');
    void resultCard.offsetWidth;
    resultCard.classList.add('in');
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var val = input.value.trim();
    if(!val){ input.focus(); return; }

    setLoading(true);
    resultCard.hidden = true;
    resultCard.classList.remove('in');
    resultError.hidden = true;

    fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: val, audio_only: false })
    })
      .then(function(res){
        return res.text().then(function(raw){
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; }
          catch(e) { data = null; }

          if(!res.ok){
            var msg = (data && data.detail)
              ? data.detail
              : (res.status === 504 || res.status === 502
                  ? 'Server kelamaan memproses link ini (timeout). Coba lagi, atau pakai link video yang lebih pendek.'
                  : 'Server mengembalikan error (kode ' + res.status + '). Coba lagi sebentar lagi.');
            throw new Error(msg);
          }
          if(!data){
            throw new Error('Server tidak mengembalikan data yang valid. Coba lagi.');
          }
          return data;
        });
      })
      .then(showResult)
      .catch(function(err){ showError(err.message || 'Terjadi kesalahan. Coba lagi.'); })
      .finally(function(){ setLoading(false); });
  });
})();
