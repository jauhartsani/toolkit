#!/usr/bin/env node
/**
 * scripts/build-blog.js
 *
 * "CMS" ToolkitMe: bukan CMS server + database (situs ini sengaja 100%
 * static + serverless function, tanpa backend/database — lihat
 * package.json). Menulis artikel baru = tambah 1 file Markdown di
 * content/blog/ (Indonesia) dan/atau content/blog-en/ (English), lalu
 * jalankan:
 *
 *   node scripts/build-blog.js
 *
 * Script ini akan, untuk MASING-MASING bahasa (id di content/blog/ ->
 * /blog/, en di content/blog-en/ -> /en/blog/):
 *  1. Baca semua *.md di folder content (frontmatter: title, description, date)
 *  2. Render tiap post jadi halaman statis
 *  3. Generate ulang index.html blog (daftar semua post, terbaru dulu)
 *  4. Generate ulang sitemap.xml gabungan (halaman statis id+en + semua post)
 *
 * Pasangan bahasa: post EN dan ID dianggap "pasangan terjemahan" kalau
 * NAMA FILE (slug) sama persis di kedua folder, mis.
 * content/blog/foo.md <-> content/blog-en/foo.md. Ini dipakai buat generate
 * link hreflang timbal-balik dan supaya tombol language-switch (yang cuma
 * swap prefix "/en/" <-> "/" — lihat assets/main.js) selalu mengarah ke
 * artikel yang benar. Post yang cuma ada di satu bahasa tetap jalan normal,
 * cuma tanpa link hreflang ke bahasa lainnya.
 *
 * Tidak ada dependency npm eksternal dipakai (parser frontmatter dan
 * markdown->HTML ditulis manual di bawah) — konsisten dengan
 * package.json project ini yang sengaja "tidak ada dependency npm
 * eksternal ... tidak perlu npm install saat deploy".
 *
 * Draft: post dengan `draft: true` di frontmatter tetap di-generate
 * halamannya (supaya bisa dicek previewnya) tapi TIDAK dimasukkan ke
 * index.html blog maupun sitemap.xml sampai draft dihapus/diset false.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://toolkitme.my.id';
const SITE_NAME = 'ToolkitMe';

// ---------------------------------------------------------------------
// 0) Konfigurasi per-bahasa: folder sumber, folder output, dan semua
//    string UI (nav/footer/breadcrumb/dst) supaya layout() tidak
//    hardcode Bahasa Indonesia.
// ---------------------------------------------------------------------
const LANGS = {
  id: {
    htmlLang: 'id',
    contentDir: path.join(ROOT, 'content', 'blog'),
    outDir: path.join(ROOT, 'blog'),
    blogPath: '/blog/',
    home: '/',
    ogLocale: 'id_ID',
    otherLang: 'en',
    t: {
      skipLink: 'Lewati ke konten utama',
      brandAria: 'ToolkitMe — beranda',
      mainNavAria: 'Navigasi utama',
      mobileNavAria: 'Navigasi mobile',
      openMenu: 'Buka menu',
      navHome: 'Beranda',
      navBlog: 'Blog',
      langSwitchLabel: 'English',
      langSwitchAria: 'Switch to English',
      breadcrumbHome: 'Beranda',
      blogEyebrow: 'BLOG TOOLKITME',
      blogTitle: 'Panduan &amp; tips seputar download konten media sosial',
      blogSub: 'Artikel praktis soal cara download, kualitas video, dan keamanan pakai tool downloader — ditulis oleh tim ToolkitMe.',
      blogIndexTitle: `Blog | ${SITE_NAME}`,
      blogIndexDescription: 'Panduan dan tips seputar download video, foto, dan Reels dari TikTok, Instagram, Facebook, dan X — ditulis oleh tim ToolkitMe.',
      readMore: 'Baca selengkapnya →',
      ctaText: 'Sudah siap coba sendiri?',
      ctaButton: 'Buka Instagram Downloader →',
      footerBrandDesc: 'ToolkitMe — download video TikTok, Instagram, Facebook, X tanpa watermark, gratis dan langsung dari browser.',
      footerDownloaderHeading: 'Downloader',
      footerToolkitHeading: 'ToolkitMe',
      footerCaraKerja: 'Cara Kerja',
      footerFaq: 'FAQ',
      footerBottom: (year) => `© ${year} ToolkitMe. Video diproses langsung dari sumber, tidak disimpan di server kami.`,
      postTitleSuffix: `| ${SITE_NAME} Blog`,
      formatDate: (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00Z');
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      },
    },
  },
  en: {
    htmlLang: 'en',
    contentDir: path.join(ROOT, 'content', 'blog-en'),
    outDir: path.join(ROOT, 'en', 'blog'),
    blogPath: '/en/blog/',
    home: '/en/',
    ogLocale: 'en_US',
    otherLang: 'id',
    t: {
      skipLink: 'Skip to main content',
      brandAria: 'ToolkitMe — home',
      mainNavAria: 'Main navigation',
      mobileNavAria: 'Mobile navigation',
      openMenu: 'Open menu',
      navHome: 'Home',
      navBlog: 'Blog',
      langSwitchLabel: 'Bahasa',
      langSwitchAria: 'Switch to Indonesian',
      breadcrumbHome: 'Home',
      blogEyebrow: 'TOOLKITME BLOG',
      blogTitle: 'Guides &amp; tips for downloading social media content',
      blogSub: 'Practical articles on how to download, video quality, and staying safe with downloader tools — written by the ToolkitMe team.',
      blogIndexTitle: `Blog | ${SITE_NAME}`,
      blogIndexDescription: 'Guides and tips for downloading videos, photos, and Reels from TikTok, Instagram, Facebook, and X — written by the ToolkitMe team.',
      readMore: 'Read more →',
      ctaText: 'Ready to try it yourself?',
      ctaButton: 'Open Instagram Downloader →',
      footerBrandDesc: 'ToolkitMe — download videos from TikTok, Instagram, Facebook, X without watermark, free and directly from your browser.',
      footerDownloaderHeading: 'Downloaders',
      footerToolkitHeading: 'ToolkitMe',
      footerCaraKerja: 'How It Works',
      footerFaq: 'FAQ',
      footerBottom: (year) => `© ${year} ToolkitMe. Videos are processed directly from the source, never stored on our servers.`,
      postTitleSuffix: `| ${SITE_NAME} Blog`,
      formatDate: (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00Z');
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      },
    },
  },
};

// ---------------------------------------------------------------------
// 1) Frontmatter parser (format sederhana: --- key: value --- lalu body)
// ---------------------------------------------------------------------
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error('Frontmatter tidak ditemukan (harus diawali "---").');
  const [, fmRaw, body] = m;
  const data = {};
  fmRaw.split(/\r?\n/).forEach((line) => {
    const mm = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!mm) return;
    let val = mm[2].trim();
    if (/^(true|false)$/i.test(val)) val = /^true$/i.test(val);
    else if (/^["'].*["']$/.test(val)) val = val.slice(1, -1);
    data[mm[1]] = val;
  });
  return { data, body: body.trim() };
}

// ---------------------------------------------------------------------
// 2) Markdown -> HTML (subset kecil yang cukup untuk artikel blog: h2/h3,
//    paragraf, **bold**, *italic*, [link](url), list "- item", blockquote)
// ---------------------------------------------------------------------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMd(text) {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const external = /^https?:\/\//.test(url);
    return `<a href="${url}"${external ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
  });
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let listBuffer = null; // { tag: 'ul'|'ol', items: [] }

  function flushList() {
    if (!listBuffer) return;
    html.push(`<${listBuffer.tag}>` + listBuffer.items.map((it) => `<li>${inlineMd(it)}</li>`).join('') + `</${listBuffer.tag}>`);
    listBuffer = null;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { flushList(); i++; continue; }

    let m;
    if ((m = line.match(/^###\s+(.*)/))) { flushList(); html.push(`<h3>${inlineMd(m[1])}</h3>`); i++; continue; }
    if ((m = line.match(/^##\s+(.*)/))) { flushList(); html.push(`<h2>${inlineMd(m[1])}</h2>`); i++; continue; }
    if ((m = line.match(/^-\s+(.*)/))) {
      if (!listBuffer || listBuffer.tag !== 'ul') { flushList(); listBuffer = { tag: 'ul', items: [] }; }
      listBuffer.items.push(m[1]);
      i++; continue;
    }
    if ((m = line.match(/^\d+\.\s+(.*)/))) {
      if (!listBuffer || listBuffer.tag !== 'ol') { flushList(); listBuffer = { tag: 'ol', items: [] }; }
      listBuffer.items.push(m[1]);
      i++; continue;
    }
    if ((m = line.match(/^>\s+(.*)/))) { flushList(); html.push(`<blockquote><p>${inlineMd(m[1])}</p></blockquote>`); i++; continue; }

    // paragraf: kumpulkan baris berurutan sampai baris kosong
    flushList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|-\s|\d+\.\s|>\s)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    html.push(`<p>${inlineMd(para.join(' '))}</p>`);
  }
  flushList();
  return html.join('\n');
}

// ---------------------------------------------------------------------
// 3) Template halaman (header/footer sama persis dengan halaman lain di
//    situs ini, nav "Blog" ditandai aktif). Sekarang parametrik per-bahasa
//    lewat objek `lang` (salah satu value dari LANGS).
// ---------------------------------------------------------------------
function layout(lang, { title, description, canonical, bodyHtml, jsonLd, hreflangPartnerUrl }) {
  const t = lang.t;
  const other = LANGS[lang.otherLang];

  const hreflangTags = hreflangPartnerUrl
    ? `<link rel="alternate" hreflang="${lang.htmlLang}" href="${canonical}">
<link rel="alternate" hreflang="${other.htmlLang}" href="${hreflangPartnerUrl}">
`
    : '';

  return `<!doctype html>
<html lang="${lang.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
${hreflangTags}<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${lang.ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0B0E12">
<meta name="robots" content="index, follow, max-image-preview:large">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` : ''}<script async src="https://www.googletagmanager.com/gtag/js?id=G-TZ9KBQQRV8"></script>
<script src="/assets/ga.js"></script>
</head>
<body>
<a class="skip-link" href="#main">${t.skipLink}</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a href="${lang.home}" class="brand" aria-label="${t.brandAria}">
      <span class="brand-mark" aria-hidden="true">TK</span>
      <span class="brand-name">ToolkitMe<span class="brand-dot">.</span></span>
    </a>
    <nav class="main-nav" aria-label="${t.mainNavAria}">
      <a href="${lang.home}">${t.navHome}</a>
      <a href="${lang.home}tiktok-downloader.html">TikTok</a>
      <a href="${lang.home}instagram-downloader.html">Instagram</a>
      <a href="${lang.home}facebook-downloader.html">Facebook</a>
      <a href="${lang.home}x-downloader.html">X (Twitter)</a>
      <a href="${lang.blogPath}" class="active">${t.navBlog}</a>
      <button class="lang-switch" id="langSwitch" aria-label="${t.langSwitchAria}" title="${t.langSwitchLabel}">
        <span>${t.langSwitchLabel}</span>
      </button>
    </nav>
    <button class="nav-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="${t.openMenu}">
      <span></span><span></span><span></span>
    </button>
  </div>
  <nav id="mobile-nav" class="mobile-nav" aria-label="${t.mobileNavAria}">
    <a href="${lang.home}">${t.navHome}</a>
    <a href="${lang.home}tiktok-downloader.html">TikTok</a>
    <a href="${lang.home}instagram-downloader.html">Instagram</a>
    <a href="${lang.home}facebook-downloader.html">Facebook</a>
    <a href="${lang.home}x-downloader.html">X (Twitter)</a>
    <a href="${lang.blogPath}" class="active">${t.navBlog}</a>
    <button class="lang-switch" id="langSwitchMobile" aria-label="${t.langSwitchAria}" title="${t.langSwitchLabel}">
      <span>${t.langSwitchLabel}</span>
    </button>
  </nav>
</header>
<main id="main">
${bodyHtml}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <span class="brand-mark" aria-hidden="true">TK</span>
      <p>${t.footerBrandDesc}</p>
    </div>
    <div class="footer-col">
      <h4>${t.footerDownloaderHeading}</h4>
      <a href="${lang.home}tiktok-downloader.html">TikTok</a>
      <a href="${lang.home}instagram-downloader.html">Instagram</a>
      <a href="${lang.home}facebook-downloader.html">Facebook</a>
      <a href="${lang.home}x-downloader.html">X (Twitter)</a>
    </div>
    <div class="footer-col">
      <h4>${t.footerToolkitHeading}</h4>
      <a href="${lang.blogPath}">${t.navBlog}</a>
      <a href="${lang.home}#cara-kerja">${t.footerCaraKerja}</a>
      <a href="${lang.home}#faq">${t.footerFaq}</a>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>${t.footerBottom(new Date().getFullYear())}</span>
  </div>
</footer>
<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------
// 4) Baca semua post untuk satu bahasa
// ---------------------------------------------------------------------
function loadPosts(lang) {
  if (!fs.existsSync(lang.contentDir)) return [];
  return fs.readdirSync(lang.contentDir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(lang.contentDir, file), 'utf8');
      const { data, body } = parseFrontmatter(raw);
      if (!data.title || !data.date) {
        throw new Error(`${file}: frontmatter wajib punya "title" dan "date".`);
      }
      return { slug, ...data, bodyHtml: mdToHtml(body) };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---------------------------------------------------------------------
// 5) Render halaman artikel
// ---------------------------------------------------------------------
function renderPostPage(lang, post, hasTranslation) {
  const t = lang.t;
  const canonical = `${SITE_URL}${lang.blogPath}${post.slug}.html`;
  const other = LANGS[lang.otherLang];
  const hreflangPartnerUrl = hasTranslation ? `${SITE_URL}${other.blogPath}${post.slug}.html` : null;

  const bodyHtml = `
  <nav class="wrap breadcrumb" aria-label="Breadcrumb"><a href="${lang.home}">${t.breadcrumbHome}</a><span>/</span><a href="${lang.blogPath}">${t.navBlog}</a><span>/</span>${escapeHtml(post.title)}</nav>
  <section class="section">
    <div class="wrap article">
      <time datetime="${post.date}">${t.formatDate(post.date)}</time>
      <h1>${escapeHtml(post.title)}</h1>
      <div class="article-body">
${post.bodyHtml}
      </div>
      <div class="article-cta">
        <p>${t.ctaText}</p>
        <a class="tool-card" style="display:inline-block" href="${lang.home}instagram-downloader.html">${t.ctaButton}</a>
      </div>
    </div>
  </section>`;

  return layout(lang, {
    title: `${post.title} ${t.postTitleSuffix}`,
    description: post.description || post.title,
    canonical,
    bodyHtml,
    hreflangPartnerUrl,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description || post.title,
      datePublished: post.date,
      inLanguage: lang.htmlLang,
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: { '@type': 'Organization', name: SITE_NAME },
      mainEntityOfPage: canonical,
    },
  });
}

// ---------------------------------------------------------------------
// 6) Render index blog
// ---------------------------------------------------------------------
function renderIndexPage(lang, posts, hasTranslationIndex) {
  const t = lang.t;
  const other = LANGS[lang.otherLang];

  const cards = posts.map((p) => `
        <a class="post-card" href="${lang.blogPath}${p.slug}.html">
          <time datetime="${p.date}">${t.formatDate(p.date)}</time>
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.description || '')}</p>
          <span class="read-more">${t.readMore}</span>
        </a>`).join('\n');

  const bodyHtml = `
  <nav class="wrap breadcrumb" aria-label="Breadcrumb"><a href="${lang.home}">${t.breadcrumbHome}</a><span>/</span>${t.navBlog}</nav>
  <section class="hero" style="padding-bottom:0">
    <div class="wrap hero-inner" style="text-align:left">
      <p class="eyebrow"><span class="eyebrow-dot"></span> ${t.blogEyebrow}</p>
      <h1 style="font-size:2.2rem">${t.blogTitle}</h1>
      <p class="hero-sub">${t.blogSub}</p>
    </div>
  </section>
  <section class="section">
    <div class="wrap">
      <div class="post-grid">${cards}
      </div>
    </div>
  </section>`;

  return layout(lang, {
    title: t.blogIndexTitle,
    description: t.blogIndexDescription,
    canonical: `${SITE_URL}${lang.blogPath}`,
    bodyHtml,
    hreflangPartnerUrl: hasTranslationIndex ? `${SITE_URL}${other.blogPath}` : null,
  });
}

// ---------------------------------------------------------------------
// 7) sitemap.xml (halaman statis id+en + semua post published id+en)
// ---------------------------------------------------------------------
const STATIC_URLS = [
  { loc: '/', priority: '1.0' },
  { loc: '/tiktok-downloader.html', priority: '0.9' },
  { loc: '/instagram-downloader.html', priority: '0.9' },
  { loc: '/facebook-downloader.html', priority: '0.8' },
  { loc: '/x-downloader.html', priority: '0.8' },
  { loc: '/blog/', priority: '0.7' },

  { loc: '/instagram/carousel.html', priority: '0.85' },
  { loc: '/instagram/photo.html', priority: '0.75' },
  { loc: '/instagram/story.html', priority: '0.75' },
  { loc: '/instagram/reels.html', priority: '0.75' },
  { loc: '/instagram/igtv.html', priority: '0.7' },
  { loc: '/instagram/viewer.html', priority: '0.65' },

  { loc: '/tools.html', priority: '0.8' },
  { loc: '/compress/index.html', priority: '0.7' },
  { loc: '/compress/compress-jpg.html', priority: '0.85' },
  { loc: '/compress/compress-png.html', priority: '0.7' },
  { loc: '/compress/compress-webp.html', priority: '0.75' },
  { loc: '/pdf/index.html', priority: '0.7' },
  { loc: '/pdf/merge.html', priority: '0.85' },
  { loc: '/qr/index.html', priority: '0.75' },
  { loc: '/qr/whatsapp.html', priority: '0.7' },
  { loc: '/convert/index.html', priority: '0.7' },
  { loc: '/convert/png-to-jpg.html', priority: '0.65' },
  { loc: '/text/index.html', priority: '0.65' },
  { loc: '/calc/index.html', priority: '0.65' },

  { loc: '/en/', priority: '1.0' },
  { loc: '/en/tiktok-downloader.html', priority: '0.9' },
  { loc: '/en/instagram-downloader.html', priority: '0.9' },
  { loc: '/en/facebook-downloader.html', priority: '0.8' },
  { loc: '/en/x-downloader.html', priority: '0.8' },
  { loc: '/en/blog/', priority: '0.7' },
];

function renderSitemap(postsByLang) {
  const urls = [
    ...STATIC_URLS.map((u) => `  <url><loc>${SITE_URL}${u.loc}</loc><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`),
    ...Object.entries(postsByLang).flatMap(([langKey, posts]) => {
      const lang = LANGS[langKey];
      return posts.map((p) => `  <url><loc>${SITE_URL}${lang.blogPath}${p.slug}.html</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
function main() {
  const publishedByLang = {};

  Object.entries(LANGS).forEach(([langKey, lang]) => {
    const allPosts = loadPosts(lang);
    const published = allPosts.filter((p) => !p.draft);
    const otherLang = LANGS[lang.otherLang];
    const otherSlugs = new Set(fs.existsSync(otherLang.contentDir) ? fs.readdirSync(otherLang.contentDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')) : []);

    fs.mkdirSync(lang.outDir, { recursive: true });

    allPosts.forEach((post) => {
      const outPath = path.join(lang.outDir, `${post.slug}.html`);
      const hasTranslation = otherSlugs.has(post.slug);
      fs.writeFileSync(outPath, renderPostPage(lang, post, hasTranslation), 'utf8');
      console.log(`  wrote ${lang.blogPath}${post.slug}.html${post.draft ? '  (draft — tidak masuk index/sitemap)' : ''}${hasTranslation ? '  [hreflang <-> ' + lang.otherLang + ']' : ''}`);
    });

    // Index dianggap punya "terjemahan" kalau bahasa lainnya juga punya
    // minimal satu post published (biar tidak link ke blog index kosong).
    const otherHasAnyPublished = fs.existsSync(otherLang.outDir) || otherSlugs.size > 0;
    fs.writeFileSync(path.join(lang.outDir, 'index.html'), renderIndexPage(lang, published, otherHasAnyPublished), 'utf8');
    console.log(`  wrote ${lang.blogPath}index.html`);

    publishedByLang[langKey] = published;
  });

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderSitemap(publishedByLang), 'utf8');
  console.log('  wrote sitemap.xml');

  const idCount = publishedByLang.id.length;
  const enCount = publishedByLang.en.length;
  console.log(`\nSelesai. ID: ${idCount} post published. EN: ${enCount} post published.`);
}

main();
