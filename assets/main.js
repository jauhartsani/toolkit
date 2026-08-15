(function(){
  // language switcher
  function setupLanguageSwitcher() {
    var langSwitch = document.getElementById('langSwitch');
    var langSwitchMobile = document.getElementById('langSwitchMobile');
    var currentPath = window.location.pathname;
    var isEnglish = currentPath.startsWith('/en/');

    if (langSwitch) {
      langSwitch.textContent = isEnglish ? 'Bahasa' : 'English';
      langSwitch.addEventListener('click', function() {
        if (isEnglish) {
          // Go to Indonesian version
          var newPath = currentPath.replace('/en/', '/');
          window.location.href = newPath || '/';
        } else {
          // Go to English version
          var newPath = '/en' + (currentPath === '/' ? '/' : currentPath);
          window.location.href = newPath;
        }
      });
    }

    if (langSwitchMobile) {
      langSwitchMobile.textContent = isEnglish ? 'Bahasa' : 'English';
      langSwitchMobile.addEventListener('click', function() {
        if (isEnglish) {
          var newPath = currentPath.replace('/en/', '/');
          window.location.href = newPath || '/';
        } else {
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
      : '<span class="btn-plug-label">Ambil Video</span>';
  }

  function showError(msg){
    resultCard.hidden = true;
    resultCard.classList.remove('in');
    resultError.hidden = false;
    resultError.textContent = msg;
  }

  function showResult(data){
    resultError.hidden = true;
    document.getElementById('resultPlatform').textContent = data.platform;
    document.getElementById('resultTitle').textContent = data.title;
    
    // Render preview gallery (thumbnail + semua formats)
    var previewGallery = document.getElementById('resultPreviewGallery');
    previewGallery.innerHTML = '';
    var previewItems = [];
    
    // Tambah thumbnail sebagai item pertama
    if(data.thumbnail){
      var thumbContainer = document.createElement('div');
      thumbContainer.className = 'preview-item active';
      var thumbImg = document.createElement('img');
      thumbImg.src = data.thumbnail;
      thumbImg.alt = 'Preview';
      thumbContainer.appendChild(thumbImg);
      previewGallery.appendChild(thumbContainer);
      previewItems.push(thumbContainer);
    }
    
    // Tambah preview dari tiap format (misal carousel images)
    if(data.formats && data.formats.length > 0){
      // Jika format punya preview URL, gunakan itu
      data.formats.forEach(function(f, idx){
        if(f.preview || f.url){
          var item = document.createElement('div');
          item.className = 'preview-item';
          var img = document.createElement('img');
          img.src = f.preview || f.url;
          img.alt = 'Preview ' + (idx + 1);
          img.dataset.formatIdx = idx;
          item.appendChild(img);
          previewGallery.appendChild(item);
          previewItems.push(item);
        }
      });
    }
    
    // Buat carousel navigation jika ada lebih dari 1 item
    if(previewItems.length > 1){
      var nav = document.createElement('div');
      nav.className = 'preview-nav';
      previewItems.forEach(function(item, idx){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Preview ' + (idx + 1));
        if(idx === 0) btn.className = 'active';
        btn.addEventListener('click', function(){
          // Tampilkan item yang dipilih
          previewItems.forEach(function(p){ p.classList.remove('active'); });
          document.querySelectorAll('.preview-nav button').forEach(function(b){ b.classList.remove('active'); });
          item.classList.add('active');
          btn.classList.add('active');
        });
        nav.appendChild(btn);
      });
      previewGallery.appendChild(nav);
    }
    
    var metaBits = [];
    if(data.uploader) metaBits.push(data.uploader);
    if(data.duration) metaBits.push(Math.round(data.duration) + 's');
    document.getElementById('resultMeta').textContent = metaBits.join(' · ');

    var actions = document.getElementById('resultActions');
    actions.innerHTML = '';
    // Render semua format (carousel bisa punya banyak item), bukan cuma 3
    data.formats.forEach(function(f, idx){
      var a = document.createElement('a');
      a.href = f.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = '';
      if(idx > 0) a.className = 'secondary';
      var size = formatSize(f.filesize_approx);
      a.textContent = 'Download ' + f.label + (size ? ' (' + size + ')' : '');
      actions.appendChild(a);
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
