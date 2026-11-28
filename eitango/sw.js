/* オフライン用。アプリ本体とデータは先に保存し、開くたびに裏で新しいものに入れ替える。
   中身を更新して公開するときは VERSION を上げる。 */
var VERSION = 'v14';
var CACHE = 'ktango-' + VERSION;   // 下線部の中の版。元の eitango（'eitango-'）と分ける
var SHELL = [
  './',
  'index.html',
  '../../eitango/cards.json',   // 元の eitango の公開分（下線部のリポジトリには入れない）
  'words.json',
  'sensei-samples.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf('ktango-')===0 && k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* 保存済みがあればすぐ返し、裏でネットから取り直して保存を更新する（フォントも同じ扱い） */
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;
  var font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if(!same && !font) return;

  e.respondWith(
    caches.open(CACHE).then(function(cache){
      return cache.match(req, { ignoreSearch: same }).then(function(hit){
        var net = fetch(req).then(function(res){
          if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(function(){ return hit; });
        if(hit) e.waitUntil(net.then(function(){}, function(){}));
        return hit || net;
      });
    })
  );
});
