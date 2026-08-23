const CACHE_NAME = 'chhota-school-v16';

// Install Service Worker - Skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate Service Worker - Purge all old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          console.log('Purging cache:', cache);
          return caches.delete(cache);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events - Network first (no stale asset caching)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  // Let network handle all GET requests directly for maximum freshness
});
