// Działanie offline i aktualizacje. Każda wersja ma własny komplet plików,
// więc aplikacja nigdy nie miesza starych i nowych.
const VERSION = '2.2.0';
const CACHE = 'odcinkowy-' + VERSION;
const FILES = [
  './',
  'index.html',
  'style.css',
  'version.js',
  'sun.js',
  'theme.js',
  'startup.js',
  'tracker.js',
  'route.js',
  'sections.js',
  'storage.js',
  'ui.js',
  'alerts.js',
  'database.js',
  'measure.js',
  'videostore.js',
  'recorder.js',
  'recordings.js',
  'impact.js',
  'motion.js',
  'history.js',
  'sheet.js',
  'app.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'data/odcinki-osm.json',
  'data/odcinki-wlasne.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const DATA = /\/data\/[^/]+\.json$/;     // baza odcinków: zawsze najpierw z sieci
const OLD_SCHEME = /^odcinkowy-v\d+$/;   // pamięć wersji sprzed ekranu aktualizacji

async function report(done) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const page of pages) page.postMessage({ type: 'precache', version: VERSION, done, total: FILES.length });
}

async function install() {
  const upgradeFromOld = (await caches.keys()).some((key) => OLD_SCHEME.test(key));
  const cache = await caches.open(CACHE);
  try {
    let done = 0;
    // Po kolei, żeby pasek postępu pokazywał prawdziwy stan pobierania
    for (const file of FILES) {
      // ?v= omija nieaktualne kopie na serwerach pośredniczących
      const response = await fetch(new Request(file + '?v=' + VERSION, { cache: 'reload' }));
      if (!response.ok) throw new Error(file + ': ' + response.status);
      await cache.put(file, response);
      await report(++done);
    }
  } catch (err) {
    await caches.delete(CACHE);
    throw err;
  }
  // Stare wydania nie umieją poprosić o przełączenie, więc robimy to sami
  if (upgradeFromOld) await self.skipWaiting();
}

self.addEventListener('install', (event) => event.waitUntil(install()));

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('odcinkowy-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'version') event.ports[0]?.postMessage(VERSION);
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;   // sprawdzanie wersji tylko z sieci

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (DATA.test(url.pathname)) {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) event.waitUntil(cache.put(url.pathname, response.clone()));
        return response;
      } catch (e) {
        return (await cache.match(request, { ignoreSearch: true })) || Response.error();
      }
    }
    return (await cache.match(request, { ignoreSearch: true })) || fetch(request);
  })());
});
