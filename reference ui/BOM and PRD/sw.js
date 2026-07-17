const CACHE_NAME = 'blackbox-bom-v1';
const STATIC_ASSETS = ['/', '/index.html', '/styles.css', '/react.development.js', '/react-dom.development.js', '/babel.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache JSX files or API calls - always network
  if (url.pathname.endsWith('.jsx') || url.pathname.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Cache first for static assets only
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
