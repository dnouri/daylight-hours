const CACHE_NAME = 'daylight-hours-v1';

// Get the base path dynamically
const basePath = self.location.pathname.replace(/\/js\/sw\.js$/, '');

const urlsToCache = [
  basePath + '/',
  basePath + '/index.html',
  basePath + '/css/style.css',
  basePath + '/js/app.js',
  basePath + '/js/locations.js',
  basePath + '/js/keyboard.js',
  basePath + '/js/errors.js',
  basePath + '/js/sw.js',
  'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.min.js',
  'https://d3js.org/d3.v7.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }

      // Clone the request
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest)
        .then((response) => {
          // Check if valid response
          if (
            !response ||
            response.status !== 200 ||
            response.type !== 'basic'
          ) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/index.html');
        });
    })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
