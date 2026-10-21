const CACHE_NAME = 'suixin-v18';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js', './companion.js', './share.js', './bootstrap.js', './social.js', './together.js', './sync.js', './daily.js',
  './assets/pets/cat.webp', './assets/pets/dog.webp', './assets/pets/rabbit.webp', './assets/pets/redpanda.webp', './pet-studio.js',
  './assets/pets/hoodie.webp', './assets/pets/glasses.webp',
  './manifest.json',
  './icon.svg', './icons/icon-192.png', './icons/icon-512.png', './privacy.html', './open-pet.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('suixin-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).origin !== self.location.origin) return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => cache.match(event.request, {ignoreSearch:true})).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
