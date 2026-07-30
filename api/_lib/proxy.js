// Wraps a raw CDN media URL as a link through /api/media so the browser
// downloads it from our own origin (correct Referer added server-side,
// Content-Disposition forces a real save instead of the `download`
// attribute being silently ignored on cross-origin links).
function toProxyUrl(rawUrl, kind, name) {
  const params = new URLSearchParams({ url: rawUrl, kind: kind || 'video' });
  if (name) params.set('name', name);
  return `/api/media?${params.toString()}`;
}

module.exports = { toProxyUrl };
