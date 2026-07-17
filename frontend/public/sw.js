// Blackbox BOM Service Worker — offline-first for static assets
const CACHE = 'bbox-v1';
const API_HOST = 'localhost:8001';

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(['/']);
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  const url = new URL(e.request.url);

  // API calls — network first, fall back to cache
  if (url.host.includes(API_HOST) || url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        return caches.open(CACHE).then(function(cache) {
          cache.put(e.request, resp.clone());
          return resp;
        });
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Same-origin assets — cache first, network update
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        const fetchPromise = fetch(e.request).then(function(resp) {
          return caches.open(CACHE).then(function(cache) {
            cache.put(e.request, resp.clone());
            return resp;
          });
        }).catch(function() {
          return cached;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cross-origin (fonts, etc.) — network only
  e.respondWith(fetch(e.request));
});
