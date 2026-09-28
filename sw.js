const CACHE_NAME = 'golf-pt-v9.92';
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

self.addEventListener('message', function(e){ if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting(); });

// ---- 웹 푸시 (리포트 검토 독촉) — worker/golf-pt-push-worker.js 가 보낸 알림을 표시 ----
// 페이로드: { title, body, tag, url }. 같은 tag 는 새 알림이 이전 것을 덮어쓴다(쌓이지 않게).
self.addEventListener('push', function(e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { try { d = { body: e.data.text() }; } catch (__) {} }
  var title = d.title || '내셔널짐 Golf PT';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    tag: d.tag || 'golfpt',
    renotify: true,
    data: { url: d.url || './index.html' }
  }));
});
// 알림 탭 → 열려 있는 앱 창이 있으면 그 창으로(검토 창 열라고 신호), 없으면 새로 연다
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
    for (var i = 0; i < cs.length; i++) {
      if ('focus' in cs[i]) { try { cs[i].postMessage({ type: 'OPEN_REVIEW' }); } catch (_) {} return cs[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.indexOf('supabase') !== -1 || url.indexOf('workers.dev') !== -1 || url.indexOf('anthropic') !== -1) {
    return;
  }
  e.respondWith(
    fetch(e.request).then(function(res){
      // 정상 응답은 캐시에도 백업 (다음 오프라인 대비)
      if(res && res.ok && e.request.method === 'GET'){
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c){ try{ c.put(e.request, clone); }catch(_){} });
      }
      return res;
    }).catch(function() {
      // 네트워크 실패 → 캐시 fallback → 그것도 없으면 안내 페이지(흰 화면 방지)
      return caches.match(e.request).then(function(r){
        if(r) return r;
        if(e.request.mode === 'navigate'){
          return new Response('<!DOCTYPE html><meta charset=UTF-8><meta name=viewport content="width=device-width,initial-scale=1"><div style="font-family:-apple-system,sans-serif;padding:30vh 24px;text-align:center;color:#444"><div style="font-size:46px;margin-bottom:12px">📡</div><div style="font-size:16px;font-weight:700;margin-bottom:6px">네트워크 연결 없음</div><div style="font-size:13px;color:#888;margin-bottom:20px">잠시 후 다시 시도해주세요</div><button onclick="location.reload()" style="padding:11px 22px;background:#00b884;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px">다시 시도</button></div>',
            {status:200, headers:{'Content-Type':'text/html; charset=utf-8'}});
        }
        return new Response('', {status:504, statusText:'offline'});
      });
    })
  );
});
