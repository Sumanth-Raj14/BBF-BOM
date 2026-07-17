/* global Response, fetch, self, caches, URL */
// Blackbox BOM Service Worker v2 — offline-first with API caching
const CACHE = 'bbox-v2';
const API_CACHE = 'bbox-api-v1';
const API_HOST = 'localhost:8001';
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC_CACHE_URLS);
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE && k !== API_CACHE) return caches.delete(k);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  const url = new URL(e.request.url);

  // Backend API calls — network first, cache with 60s freshness
  if (url.host.includes(API_HOST) || url.pathname.startsWith('/api/')) {
    if (e.request.method === 'GET') {
      e.respondWith(
        fetch(e.request).then(function(resp) {
          const clone = resp.clone();
          caches.open(API_CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
          return resp;
        }).catch(function() {
          return caches.match(e.request).then(function(cached) {
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
      );
    } else {
      // Mutations — network only (no offline writes)
      e.respondWith(fetch(e.request).catch(function() {
        return new Response(JSON.stringify({ error: 'offline', message: 'You are offline. Please try again when connected.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }));
    }
    return;
  }

  // Static assets — cache first, network update
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        const fetchPromise = fetch(e.request).then(function(resp) {
          if (resp.ok) {
            caches.open(CACHE).then(function(cache) {
              cache.put(e.request, resp.clone());
            });
          }
          return resp;
        }).catch(function() {
          return cached;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cross-origin — network only
  e.respondWith(fetch(e.request));
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'CACHE_UPDATED') {
    caches.open(CACHE).then(function(cache) {
      cache.addAll(STATIC_CACHE_URLS);
    });
  }
});
