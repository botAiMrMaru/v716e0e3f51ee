/* App-shell cache only. The sealed vault and live feeds are never cached. */
const V = 'vanta-v4';
const SHELL = ['./', 'index.html', 'vanta.css', 'config.js', 'vault.js', 'world.js', 'live.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'fonts/geist.woff2', 'fonts/geistmono.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;           // vault + feeds: network only
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
