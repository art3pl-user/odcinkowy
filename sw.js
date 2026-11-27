// Działanie offline. Najpierw sieć (świeże pliki), a bez zasięgu — pamięć podręczna.
const CACHE = 'odcinkowy-v3';
const FILES = [
  './',
  'index.html',
  'style.css',
  'tracker.js',
  'route.js',
  'sections.js',
  'alerts.js',
  'database.js',
  'data/odcinki-osm.json',
  'data/odcinki-wlasne.json',
  'storage.js',
  'ui.js',
  'measure.js',
  'history.js',
  'app.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('odcinkowy-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    // no-cache: zawsze sprawdzamy u serwera, żeby nie mieszać starych i nowych plików
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || Response.error()))
  );
});
