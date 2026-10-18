/* Gilded service worker — precache the entire studio for offline use. */

const VERSION = 'gilded-v1.3.0';
const CACHE = VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/fonts.css',
  './css/artboard.css',
  './css/print.css',
  './css/app.css',
  './js/app.js',
  './js/editor.js',
  './js/model.js',
  './js/presets.js',
  './js/render.js',
  './js/frames.js',
  './js/export.js',
  './js/print.js',
  './js/db.js',
  './js/utils.js',
  './js/icons.js',
  './fonts/great-vibes-latin-400-normal.woff2',
  './fonts/parisienne-latin-400-normal.woff2',
  './fonts/pinyon-script-latin-400-normal.woff2',
  './fonts/cormorant-garamond-latin-400-normal.woff2',
  './fonts/cormorant-garamond-latin-500-normal.woff2',
  './fonts/cormorant-garamond-latin-600-normal.woff2',
  './fonts/cormorant-garamond-latin-400-italic.woff2',
  './fonts/playfair-display-latin-400-normal.woff2',
  './fonts/playfair-display-latin-500-normal.woff2',
  './fonts/playfair-display-latin-600-normal.woff2',
  './fonts/playfair-display-latin-400-italic.woff2',
  './fonts/montserrat-latin-400-normal.woff2',
  './fonts/montserrat-latin-500-normal.woff2',
  './fonts/montserrat-latin-600-normal.woff2',
  './fonts/jost-latin-400-normal.woff2',
  './fonts/jost-latin-500-normal.woff2',
  './fonts/jost-latin-600-normal.woff2',
  './icons/favicon.svg',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          const root = await caches.match('./');
          return root || new Response('Gilded is offline. Reopen the app to continue.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
