/* Static-only, scope-namespaced service worker. It never caches /api/. */
const CACHE_PREFIX = 'clinic-enquiry-desk-';
const CACHE = 'clinic-enquiry-desk-v3';
const LEGACY_CACHES = new Set(['clinic-mission-control-v2']);
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './upgrade.css',
  './theme.js',
  './rules.js',
  './config/clinic.js',
  './faq.js',
  './data/fixtures.js',
  './data/evaluation_fixtures.js',
  './docs/evaluation_metrics.js',
  './classifier.js',
  './knowledge.js',
  './extras.js',
  './views.js',
  './ruleslab.js',
  './safety-net.js',
  './app.js',
  './mission.js',
  './manifest.webmanifest',
  './icons/clinic-icon.svg',
  './icons/clinic-maskable.svg',
  './handover.html',
  './handover.js',
  './prompt-lab.html',
  './safety.html',
  './limits.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE
        && (key.startsWith(CACHE_PREFIX) || LEGACY_CACHES.has(key))).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  const fetchAndCache = () => fetch(request, { cache: 'no-cache' }).then(response => {
    if (!response.ok) return response;
    const copy = response.clone();
    return caches.open(CACHE)
      .then(cache => cache.put(request, copy).catch(() => {}))
      .then(() => response);
  });
  const cacheMatch = key => caches.open(CACHE).then(cache => cache.match(key));

  if (request.mode === 'navigate') {
    event.respondWith(
      fetchAndCache()
        .catch(() => cacheMatch(request).then(cached => cached || cacheMatch('./index.html')))
    );
    return;
  }

  event.respondWith(fetchAndCache().catch(() => cacheMatch(request)));
});
