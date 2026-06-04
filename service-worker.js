/* Hausbau Nacharbeit — Service Worker
 *
 * Strategie:
 *  - App-Shell (HTML/Manifest/Icons): Cache-first mit Network-Update
 *  - CDN-Libraries (esm.sh/jsdelivr/cdnjs): Cache-first, lange Lebensdauer
 *  - Supabase REST/Storage: Network-first, Cache-Fallback (Read-Only-Offline)
 *  - Writes auf Supabase: NICHT gecacht — schlägt offline fehl. Die App
 *    zeigt einen "Du bist offline"-Hinweis, der Nutzer kann später erneut
 *    speichern. (Echte Write-Queue ist eine separate Erweiterung.)
 */

const SW_VERSION = 'v1.22.1';
const APP_SHELL_CACHE = `hausbau-shell-${SW_VERSION}`;
const CDN_CACHE       = `hausbau-cdn-${SW_VERSION}`;
const DATA_CACHE      = `hausbau-data-${SW_VERSION}`;

// Files that must be cached for the app to load offline
const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];

// Allow up to N read responses to be cached for offline fallback per origin
const DATA_CACHE_MAX_ENTRIES = 200;

// CDN hosts whose responses we cache long-term
const CDN_HOSTS = [
  'esm.sh',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com'
];

// =============== INSTALL ===============
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    // Use {cache:'reload'} to bypass HTTP cache during precache
    await Promise.all(APP_SHELL_URLS.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res.clone());
      } catch (e) {
        console.warn('[SW] precache failed for', url, e);
      }
    }));
    // Activate immediately, don't wait for old SW to release clients
    await self.skipWaiting();
  })());
});

// =============== ACTIVATE ===============
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Cleanup old caches from previous SW versions
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => n.startsWith('hausbau-') && !n.endsWith(SW_VERSION))
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// =============== MESSAGE (manual update trigger from page) ===============
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// =============== FETCH ROUTING ===============
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET — POST/PUT/DELETE pass through to network
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) App shell (same origin, html/css/js/png/manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(handleAppShell(req));
    return;
  }

  // 2) CDN libraries — cache-first, long-lived
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(handleCDN(req));
    return;
  }

  // 3) Supabase REST API — network-first with cache fallback
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(handleSupabase(req));
    return;
  }

  // 4) Anything else — try network, no caching
  // (Don't intercept — let the browser handle normally)
});

// ---------------- App Shell: cache-first with background update -----------
async function handleAppShell(req) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  // For navigation requests, always try cache first (works offline)
  if (req.mode === 'navigate') {
    const indexCached = cached || await cache.match('./index.html');
    // Background-refresh: fetch new copy and update cache
    fetch(req).then(res => {
      if (res && res.ok) cache.put('./index.html', res.clone()).catch(()=>{});
    }).catch(()=>{});
    if (indexCached) return indexCached;
  }
  if (cached) {
    // Refresh in background
    fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    }).catch(()=>{});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  } catch (e) {
    // Last resort: return the cached index for navigations
    if (req.mode === 'navigate') {
      const idx = await cache.match('./index.html');
      if (idx) return idx;
    }
    throw e;
  }
}

// ---------------- CDN: cache-first ----------------------------------------
async function handleCDN(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).catch(()=>{});
    }
    return res;
  } catch (e) {
    // Fallback: any cached variant of this URL
    const fallback = await cache.match(req.url);
    if (fallback) return fallback;
    throw e;
  }
}

// ---------------- Supabase: network-first, fall back to cache -------------
async function handleSupabase(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    // Only cache successful read responses
    if (res && res.ok) {
      cache.put(req, res.clone()).catch(()=>{});
      trimCache(DATA_CACHE, DATA_CACHE_MAX_ENTRIES);
    }
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) {
      // Tag the response so the app can detect "served from offline cache"
      const clone = cached.clone();
      const headers = new Headers(clone.headers);
      headers.set('X-From-SW-Cache', '1');
      return new Response(await clone.blob(), {
        status: clone.status,
        statusText: clone.statusText,
        headers
      });
    }
    // Return a structured offline-error JSON so callers can detect it
    return new Response(
      JSON.stringify({ offline: true, message: 'Keine Verbindung — und kein Cache für diese Anfrage vorhanden.' }),
      { status: 503, statusText: 'Service Unavailable (offline)', headers: { 'Content-Type': 'application/json', 'X-Offline': '1' } }
    );
  }
}

// Keep DATA_CACHE from growing unbounded
async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const removeCount = keys.length - maxEntries;
  for (let i = 0; i < removeCount; i++) await cache.delete(keys[i]);
}
