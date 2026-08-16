#!/usr/bin/env node
/**
 * scripts/build-blog.js
 *
 * "CMS" ToolkitMe: bukan CMS server + database (situs ini sengaja 100%
 * static + serverless function, tanpa backend/database — lihat
 * package.json). Menulis artikel baru = tambah 1 file Markdown di
 * content/blog/, lalu jalankan:
 *
 *   node scripts/build-blog.js
 *
 * Script ini akan:
 *  1. Baca semua *.md di content/blog/ (frontmatter: title, description, date)
 *  2. Render tiap post jadi halaman statis di /blog/<slug>.html
 *  3. Generate ulang /blog/index.html (daftar semua post, terbaru dulu)
 *  4. Generate ulang sitemap.xml (halaman statis + semua post blog)
 *
 * Tidak ada dependency npm eksternal dipakai (parser frontmatter dan
 * markdown->HTML ditulis manual di bawah) — konsisten dengan
 * package.json project ini yang sengaja "tidak ada dependency npm
 * eksternal ... tidak perlu npm install saat deploy".
 *
 * Draft: post dengan `draft: true` di frontmatter tetap di-generate
 * halamannya (supaya bisa dicek previewnya) tapi TIDAK dimasukkan ke
 * /blog/index.html maupun sitemap.xml sampai draft dihapus/diset false.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const OUT_DIR = path.join(ROOT, 'blog');
const SITE_URL = 'https://toolkitme.my.id';
const SITE_NAME = 'ToolkitMe';

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
//    situs ini, nav "Blog" ditandai aktif)
// ---------------------------------------------------------------------
function layout({ title, description, canonical, bodyHtml, jsonLd }) {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="id_ID">
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
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` : ''}</head>
<body>
<a class="skip-link" href="#main">Lewati ke konten utama</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a href="/" class="brand" aria-label="ToolkitMe — beranda">
      <span class="brand-mark" aria-hidden="true">TK</span>
      <span class="brand-name">ToolkitMe<span class="brand-dot">.</span></span>
    </a>
    <nav class="main-nav" aria-label="Navigasi utama">
      <a href="/">Beranda</a>
      <a href="/tiktok-downloader.html">TikTok</a>
      <a href="/instagram-downloader.html">Instagram</a>
      <a href="/facebook-downloader.html">Facebook</a>
      <a href="/x-downloader.html">X (Twitter)</a>
      <a href="/blog/" class="active">Blog</a>
    </nav>
    <button class="nav-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Buka menu">
      <span></span><span></span><span></span>
    </button>
  </div>
  <nav id="mobile-nav" class="mobile-nav" aria-label="Navigasi mobile">
    <a href="/">Beranda</a>
    <a href="/tiktok-downloader.html">TikTok</a>
    <a href="/instagram-downloader.html">Instagram</a>
    <a href="/facebook-downloader.html">Facebook</a>
    <a href="/x-downloader.html">X (Twitter)</a>
    <a href="/blog/" class="active">Blog</a>
  </nav>
</header>
<main id="main">
${bodyHtml}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <span class="brand-mark" aria-hidden="true">TK</span>
      <p>ToolkitMe — download video TikTok, Instagram, Facebook, X tanpa watermark, gratis dan langsung dari browser.</p>
    </div>
    <div class="footer-col">
      <h4>Downloader</h4>
      <a href="/tiktok-downloader.html">TikTok</a>
      <a href="/instagram-downloader.html">Instagram</a>
      <a href="/facebook-downloader.html">Facebook</a>
      <a href="/x-downloader.html">X (Twitter)</a>
    </div>
    <div class="footer-col">
      <h4>ToolkitMe</h4>
      <a href="/blog/">Blog</a>
      <a href="/#cara-kerja">Cara Kerja</a>
      <a href="/#faq">FAQ</a>
      <a href="/sitemap.xml">Sitemap</a>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} ToolkitMe. Video diproses langsung dari sumber, tidak disimpan di server kami.</span>
  </div>
</footer>
<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

function formatDateId(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------
// 4) Baca semua post
// ---------------------------------------------------------------------
function loadPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs.readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
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
function renderPostPage(post) {
  const canonical = `${SITE_URL}/blog/${post.slug}.html`;
  const bodyHtml = `
  <nav class="wrap breadcrumb" aria-label="Breadcrumb"><a href="/">Beranda</a><span>/</span><a href="/blog/">Blog</a><span>/</span>${escapeHtml(post.title)}</nav>
  <section class="section">
    <div class="wrap article">
      <time datetime="${post.date}">${formatDateId(post.date)}</time>
      <h1>${escapeHtml(post.title)}</h1>
      <div class="article-body">
${post.bodyHtml}
      </div>
      <div class="article-cta">
        <p>Sudah siap coba sendiri?</p>
        <a class="tool-card" style="display:inline-block" href="/instagram-downloader.html">Buka Instagram Downloader →</a>
      </div>
    </div>
  </section>`;

  return layout({
    title: `${post.title} | ${SITE_NAME} Blog`,
    description: post.description || post.title,
    canonical,
    bodyHtml,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description || post.title,
      datePublished: post.date,
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: { '@type': 'Organization', name: SITE_NAME },
      mainEntityOfPage: canonical,
    },
  });
}

// ---------------------------------------------------------------------
// 6) Render index blog
// ---------------------------------------------------------------------
function renderIndexPage(posts) {
  const cards = posts.map((p) => `
        <a class="post-card" href="/blog/${p.slug}.html">
          <time datetime="${p.date}">${formatDateId(p.date)}</time>
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.description || '')}</p>
          <span class="read-more">Baca selengkapnya →</span>
        </a>`).join('\n');

  const bodyHtml = `
  <nav class="wrap breadcrumb" aria-label="Breadcrumb"><a href="/">Beranda</a><span>/</span>Blog</nav>
  <section class="hero" style="padding-bottom:0">
    <div class="wrap hero-inner" style="text-align:left">
      <p class="eyebrow"><span class="eyebrow-dot"></span> BLOG TOOLKITME</p>
      <h1 style="font-size:2.2rem">Panduan &amp; tips seputar download konten media sosial</h1>
      <p class="hero-sub">Artikel praktis soal cara download, kualitas video, dan keamanan pakai tool downloader — ditulis oleh tim ToolkitMe.</p>
    </div>
  </section>
  <section class="section">
    <div class="wrap">
      <div class="post-grid">${cards}
      </div>
    </div>
  </section>`;

  return layout({
    title: `Blog | ${SITE_NAME}`,
    description: 'Panduan dan tips seputar download video, foto, dan Reels dari TikTok, Instagram, Facebook, dan X — ditulis oleh tim ToolkitMe.',
    canonical: `${SITE_URL}/blog/`,
    bodyHtml,
  });
}

// ---------------------------------------------------------------------
// 7) sitemap.xml (halaman statis + semua post published)
// ---------------------------------------------------------------------
const STATIC_URLS = [
  { loc: '/', priority: '1.0' },
  { loc: '/tiktok-downloader.html', priority: '0.9' },
  { loc: '/instagram-downloader.html', priority: '0.9' },
  { loc: '/facebook-downloader.html', priority: '0.8' },
  { loc: '/x-downloader.html', priority: '0.8' },
  { loc: '/blog/', priority: '0.7' },
  { loc: '/en/', priority: '1.0' },
  { loc: '/en/tiktok-downloader.html', priority: '0.9' },
  { loc: '/en/instagram-downloader.html', priority: '0.9' },
  { loc: '/en/facebook-downloader.html', priority: '0.8' },
  { loc: '/en/x-downloader.html', priority: '0.8' },
];

function renderSitemap(posts) {
  const urls = [
    ...STATIC_URLS.map((u) => `  <url><loc>${SITE_URL}${u.loc}</loc><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`),
    ...posts.map((p) => `  <url><loc>${SITE_URL}/blog/${p.slug}.html</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
function main() {
  const allPosts = loadPosts();
  const published = allPosts.filter((p) => !p.draft);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  allPosts.forEach((post) => {
    const outPath = path.join(OUT_DIR, `${post.slug}.html`);
    fs.writeFileSync(outPath, renderPostPage(post), 'utf8');
    console.log(`  wrote blog/${post.slug}.html${post.draft ? '  (draft — tidak masuk index/sitemap)' : ''}`);
  });

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndexPage(published), 'utf8');
  console.log('  wrote blog/index.html');

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderSitemap(published), 'utf8');
  console.log('  wrote sitemap.xml');

  console.log(`\nSelesai. ${published.length} post published, ${allPosts.length - published.length} draft.`);
}

main();
