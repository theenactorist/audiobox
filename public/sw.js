// Service Worker for background audio support and PWA functionality
const CACHE_NAME = 'audio-livestream-v1';
const urlsToCache = [
    '/',
    '/studio',
    '/login',
    '/signup',
];

// Install Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - cache-first strategy for static assets
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request).then((response) => {
                // Only cache successful responses
                if (response && response.status === 200) {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                }
                return response;
            }).catch(() => {
                return caches.match(event.request);
            });
        })
    );
});

// Handle background sync for future features
self.addEventListener('sync', (event) => {
    console.log('Background sync event:', event.tag);
});

// Keep service worker alive for background audio
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'KEEP_ALIVE') {
        // Service worker stays active
        console.log('Keep alive ping received');
    }
});
