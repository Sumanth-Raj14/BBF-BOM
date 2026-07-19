// Blackbox BOM Service Worker — network-first app shell, cache only immutable assets.
//
// Why this shape: the previous version pre-cached "/" and served ALL same-origin
// requests cache-first under a never-changing cache name ("bbox-v1"). That pinned
// the built index.html + JS bundle in the cache forever, so after any new build the
// browser kept replaying the STALE old bundle (symptom: "Cannot access 'X' before
// initialization" from an old chunk graph even though a fixed build was served).
//
// Fixes:
//  - Cache version bumped -> `activate` deletes ALL old caches, self-healing any
//    browser that got stranded on the old bundle.
//  - index.html / navigations / API: NETWORK-FIRST, so a fresh build always loads
//    (offline falls back to cache only if we happen to have it).
//  - Only content-hashed /assets/* files are cached (their hash changes when the
//    content changes, so cache-first is safe and never serves stale code).
const CACHE = 'bbox-v2';

self.addEventListener('install', function () {
  // Take over immediately; do NOT pre-cache "/" (that is what pinned the stale shell).
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  const isAppShell =
    e.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html');

  // App shell + API: network-first so a new build (and live data) always wins;
  // fall back to any cached copy only when offline.
  if (isAppShell || url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(function () { return caches.match(e.request); }));
    return;
  }

  // Same-origin, content-hashed static assets: cache-first (immutable by hash).
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        return (
          cached ||
          fetch(e.request).then(function (resp) {
            const clone = resp.clone();
            caches.open(CACHE).then(function (cache) { cache.put(e.request, clone); });
            return resp;
          })
        );
      })
    );
    return;
  }

  // Cross-origin (fonts, etc.): network only.
  e.respondWith(fetch(e.request));
});
