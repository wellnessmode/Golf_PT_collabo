const CACHE_NAME = 'golf-pt-v3.7';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app_core.js',
  './js/app_render.js',
  './js/app_handlers.js',
  './js/app_ai.js',
  './js/app_dashboard.js',
  './js/app_live.js',
  './js/exercises_data.js',
  './js/golf_lesson_data.js',
  './config.js',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
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
  if (url.indexOf('supabase') !== -1 || url.indexOf('workers.dev') !== -1 || url.indexOf('anthropic') !== -1) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});
