// Service Worker - 离线缓存 v8
// 策略：network-first（JS/CSS/HTML），cache-first（图片/字体）
const CACHE_NAME = 'love-expert-v8';
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

// 激活：清理旧缓存 + 立即接管
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

// 监听 skipWaiting 消息
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// fetch：network-first for JS/CSS/HTML, cache-first for others
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // API 请求不缓存
  if (e.request.url.includes('api.deepseek.com') || e.request.url.includes('/chat/completions')) {
    return;
  }

  var url = new URL(e.request.url);
  var isCodeFile = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '';

  if (isCodeFile) {
    // Network-first for code files: always get latest from network
    e.respondWith(
      fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          var respClone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, respClone));
        }
        return resp;
      }).catch(() => {
        // Network failed: fall back to cache
        return caches.match(e.request).then((cached) => {
          return cached || new Response('离线模式，此资源不可用', { status: 503 });
        });
      })
    );
  } else {
    // Cache-first for images and other assets
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) {
          // Background update
          fetch(e.request).then((resp) => {
            if (resp && resp.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resp.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(e.request).then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            var respClone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, respClone));
          }
          return resp;
        }).catch(() => {
          return new Response('离线模式，此资源不可用', { status: 503 });
        });
      })
    );
  }
});
