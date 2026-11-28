/* オフライン用。コードだけをキャッシュする（コンテンツは IndexedDB にあり、ここでは扱わない）。
   保存済みがあればすぐ返し、裏でネットから取り直す。コードを更新して公開するときは VERSION を上げる。 */
var VERSION = 'v8';
var CACHE = 'kasenbu-' + VERSION;
var SHELL = ['./', 'index.html', 'js/app.js', 'js/logic.js', 'js/db.js', 'js/lessons.js', 'js/sensei.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  // 中に置いた eitango（初回からオフラインで開けるように。開いたあとは eitango 自身の sw.js が受け持つ）
  'eitango/', 'eitango/index.html', '../eitango/cards.json', 'eitango/words.json', 'eitango/sensei-samples.json',
  'eitango/icons/icon-192.png', 'eitango/icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('kasenbu-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
      if (hit) { e.waitUntil(net.then(function () {}, function () {})); return hit; }
      return net;
    });
  }));
});
