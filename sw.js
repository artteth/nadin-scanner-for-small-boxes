// v150: кэш-фёрст для фото изделий в CacheStorage (на диске).
// Решает проблему: Google Drive/googleusercontent отдают
// Cache-Control: private/no-store — браузерный HTTP-кэш их не хранит,
// и фото перезагружаются при каждом открытии «Все изделия».
// CacheStorage не зависит от Cache-Control и хранит ответы (включая opaque)
// до явного удаления или вытеснения квоты браузером.
//
// v153: внешний .catch() → если CacheStorage недоступна (MDM, квота),
// фото грузятся напрямую из сети вместо провала всего запроса.

var PHOTO_CACHE = 'photos-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k.indexOf('photos-') === 0 && k !== PHOTO_CACHE) {
          return caches.delete(k);
        }
      }));
    })
  ]));
});

function isImageRequest(req) {
  if (req.destination === 'image') return true;
  return /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(req.url || '');
}

// Сообщения от страницы (очистка кэша по кнопке в настройках)
self.addEventListener('message', function(e) {
  var data = e.data || {};
  if (data.type === 'clearPhotoCache') {
    e.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(keys
          .filter(function(k) { return k.indexOf('photos-') === 0; })
          .map(function(k) { return caches.delete(k); })
        );
      }).then(function() {
        if (e.source && e.source.postMessage) {
          e.source.postMessage({ type: 'photoCacheCleared' });
        }
      })
    );
  }
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // Фото: cache-first, кладём в долгоживущий кэш на диске.
  if (isImageRequest(req)) {
    e.respondWith(
      caches.open(PHOTO_CACHE).then(function(cache) {
        return cache.match(req).then(function(cached) {
          if (cached) return cached;
          return fetch(req).then(function(resp) {
            // Кэшируем 200 OK и opaque (cross-origin no-cors <img>).
            // Не кладём ошибки (404/5xx) — пусть в следующий раз попробует снова.
            if (resp && (resp.status === 200 || resp.type === 'opaque')) {
              cache.put(req, resp.clone()).catch(function() {});
            }
            return resp;
          }).catch(function() {
            return new Response('', { status: 504, statusText: 'Offline' });
          });
        });
      }).catch(function() {
        // CacheStorage недоступна (квота исчерпана, MDM-блокировка, etc.) —
        // пропускаем кэш и грузим напрямую из сети, иначе e.respondWith()
        // получит rejected promise и запрос упадёт полностью.
        return fetch(req);
      })
    );
    return;
  }

  // Всё остальное: network-first, фолбэк в кэш при оффлайне.
  e.respondWith(
    fetch(req).catch(function() { return caches.match(req); })
  );
});
