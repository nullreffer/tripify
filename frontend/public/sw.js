const CACHE = 'azitrip-v1';
const TILE_CACHE = 'tripify-tiles-v1';
const TILE_MAX = 500;
const PRECACHE = ['/', '/index.html'];

// Hostname patterns for map tile providers used by the app
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'tile.opentopomap.org',
  'tiles.stadiamaps.com',
  'server.arcgisonline.com',
  'tile.thunderforest.com',
  'api.maptiler.com',
  'mt0.google.com',
  'mt1.google.com',
  'mt2.google.com',
  'mt3.google.com',
  'waymarkedtrails.org',
  'tile.waymarkedtrails.org',
];

function isTileRequest(url) {
  return TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Evict oldest entries when the tile cache exceeds TILE_MAX entries
async function evictTilesIfNeeded(cache) {
  const keys = await cache.keys();
  if (keys.length > TILE_MAX) {
    const toDelete = keys.slice(0, keys.length - TILE_MAX);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // ── Map tile caching (cache-first) ────────────────────────────────────────
  if (isTileRequest(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
            evictTilesIfNeeded(cache);
          }
          return response;
        } catch {
          return new Response('', { status: 503, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // Skip API and auth routes — let them fail naturally so offline fallback in
  // app code can kick in
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;

  // ── App shell caching (network-first, fallback to cache) ──────────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});

// ── Push notification handler ─────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? JSON.parse(event.data.text()) : {};
  } catch {
    data = { title: 'Tripify', body: event.data?.text() || 'You have a new notification.' };
  }

  const title = data.title || 'Tripify';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

