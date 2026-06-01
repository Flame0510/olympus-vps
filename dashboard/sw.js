const CACHE = 'olympus-v2';
const SHELL = ['/', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API calls always go to network
  if (url.pathname.startsWith('/api/')) return;

  // HTML/navigation: prefer network to avoid stale dashboard UI after deploys.
  const isNavigation = e.request.mode === 'navigate' || e.request.destination === 'document';
  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const cloned = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, cloned)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(resp => {
          const cloned = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, cloned)).catch(() => {});
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
