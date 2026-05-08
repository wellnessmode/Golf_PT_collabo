const CACHE_NAME = 'golf-pt-v3.1';
const ASSETS = [
  './',
  './index.html',
  './manual.html',
  './css/style.css',
  './js/app.js',
  './js/exercises_data.js',
  './config.js',
  './assets/logo.png',
  './manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // API/Supabase/R2 요청은 항상 네트워크
  if (url.indexOf('supabase') !== -1 || url.indexOf('workers.dev') !== -1 || url.indexOf('mediapipe') !== -1) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});
