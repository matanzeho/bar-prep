// Offline cache: the app works without a connection after the first visit.
const CACHE = 'barprep-v5';
const FILES = ['./', 'index.html', 'app.js', 'questions-base.js', 'questions-extra.js', 'explanations-official.js', 'register-sw.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // network first (so updates arrive), cache as fallback when offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
