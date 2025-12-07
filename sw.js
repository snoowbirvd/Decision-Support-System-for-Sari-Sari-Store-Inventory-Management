const CACHE_NAME = 'tindatech-v2'; // Updated version for Phase 1

const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/theme.css',
    '/tindatech_phase1_complete.js', // NEW: Phase 1 JS file
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/maskable-192.png',
    '/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;

            return fetch(req)
                .then((res) => {
                    const resClone = res.clone();
                    if (res.ok && new URL(req.url).origin === self.location.origin) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    }
                    return res;
                })
                .catch(() => {
                    if (req.mode === 'navigate') return caches.match('/index.html');
                });
        })
    );
});
