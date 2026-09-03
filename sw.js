// Service Worker - 离线缓存
const CACHE_NAME = 'love-expert-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './prompts.js',
  './demo_data.js',
  './ai.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// 安装：预缓存所有静态资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('SW: 部分资源缓存失败', err);
      });
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// fetch：缓存优先，网络回退（离线时用缓存）
self.addEventListener('fetch', (e) => {
  // 只处理 GET 请求
  if (e.request.method !== 'GET') return;

  // API 请求不缓存（DeepSeek API）
  if (e.request.url.includes('api.deepseek.com') || e.request.url.includes('/chat/completions')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        // 有缓存就用缓存，同时后台更新
        fetch(e.request).then((resp) => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resp.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      // 没缓存就请求
      return fetch(e.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, respClone));
        }
        return resp;
      }).catch(() => {
        // 离线且无缓存
        return new Response('离线模式，此资源不可用', { status: 503 });
      });
    })
  );
});
