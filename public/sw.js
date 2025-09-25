const CACHE_NAME = 'pos-system-v1.2';
const CACHE_URLS = [
    './',
    './manifest.json',
    'https://cdn.tailwindcss.com/3.3.0',
    'https://unpkg.com/react@18/umd/react.development.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
    'https://unpkg.com/@babel/standalone/babel.min.js',
    'https://unpkg.com/lucide-react@0.263.1/dist/umd/lucide-react.js',
    'https://unpkg.com/recharts@2.8.0/umd/Recharts.js'
];

// 安裝時緩存資源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// 激活時清理舊緩存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => 
                Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                )
            )
            .then(() => self.clients.claim())
    );
});

// 攔截請求實現離線功能
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
            .catch(() => {
                // 離線時的後備策略
                if (event.request.destination === 'document') {
                    return caches.match('./');
                }
            })
    );
});