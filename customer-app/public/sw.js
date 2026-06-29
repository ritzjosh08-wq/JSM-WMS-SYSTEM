// JSM Customer Portal - service worker
// Network-first strategy: always fetch live data and modules when online (so
// HMR in dev and fresh WMS data always win), cache a copy in the background,
// and fall back to the cache only when offline (offline support + installable).

var VERSION = 'jsm-portal-v1';
var SHELL_CACHE = VERSION + '-shell';
var API_CACHE = VERSION + '-api';

var SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/jsm-logo.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) { return c.addAll(SHELL_ASSETS); }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.indexOf(VERSION) !== 0; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var isApi = url.port === '5001' || url.pathname.indexOf('/api') === 0;
  var cacheName = isApi ? API_CACHE : SHELL_CACHE;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        var copy = res.clone();
        caches.open(cacheName).then(function (c) { c.put(req, copy); }).catch(function () {});
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('/index.html');
          return Response.error();
        });
      })
  );
});
