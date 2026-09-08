// Service Worker v30 - No-op (pass-through)
const CACHE_NAME = 'love-expert-v30';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      console.log('SW v30: All caches cleared on install');
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      console.log('SW v30: All caches cleared on activate');
    })
  );
  self.clients.claim();
});

// 不拦截任何 fetch 请求 —— 所有请求直接走网络
// 这确保浏览器永远从 GitHub Pages 获取最新文件，不会使用旧缓存
