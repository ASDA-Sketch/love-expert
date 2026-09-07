// Service Worker v19 - No-op (pass-through)
// 彻底清除所有旧缓存，不拦截任何请求，防止旧缓存导致页面闪烁
const CACHE_NAME = 'love-expert-v19';

// 安装：清除所有缓存 + 立即跳过等待
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      console.log('SW v19: All caches cleared on install');
    })
  );
  self.skipWaiting();
});

// 激活：再次清除所有缓存 + 立即接管所有客户端
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      console.log('SW v19: All caches cleared on activate');
    })
  );
  self.clients.claim();
});

// 不拦截任何 fetch 请求 —— 所有请求直接走网络
// 这确保浏览器永远从 GitHub Pages 获取最新文件，不会使用旧缓存
