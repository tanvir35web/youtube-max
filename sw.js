const CACHE_NAME = 'yt-max-v8-6';
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css?v=8.6',
  '/app.js?v=8.6',
  '/player.js?v=8.6',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_FILES).catch((err) => {
        console.warn('Pre-cache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-First strategy: Always fetch fresh code when online, fallback to cache when offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Pass-through for all API endpoints, video/audio streaming and local file downloads
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('googlevideo') ||
    url.hostname.includes('youtube') ||
    event.request.destination === 'video' ||
    event.request.destination === 'audio'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((fresh) => {
        if (fresh && fresh.status === 200 && event.request.method === 'GET') {
          const clone = fresh.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return fresh;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return null;
        });
      })
  );
});
