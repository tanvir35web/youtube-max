const CACHE_NAME = 'yt-max-v7';

self.addEventListener('install', (event) => {
  self.skipWaiting();
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

  // Pass-through for video media streaming
  if (
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
        return caches.match(event.request);
      })
  );
});
