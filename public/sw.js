const CACHE_NAME = 'tunagaru-v2.4.0'; // バージョンを上げて強制更新
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  console.log('Service Worker installing...', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching files:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
  );
  // 新しいService Workerを即座にアクティブにする
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker activating...', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          console.log('Checking cache:', cacheName);
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('Service Worker activated, claiming clients');
      // すべてのクライアントを即座に制御下に置く
      return self.clients.claim();
    }).then(() => {
      // クライアントに更新完了を通知
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_NAME
          });
        });
      });
    })
  );
});

// メッセージハンドラー
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'FORCE_UPDATE') {
    console.log('Force update requested');
    // 新しいService Workerをインストール
    self.skipWaiting();
  }
});
