/* Slack Water service worker. Precache list and version are injected by scripts/postbuild.mjs. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `shell-${VERSION}`;
const TIDES = 'tides-v1';
// The month view's 34-day responses live apart, so they never replace the week that
// today's screen falls back to offline.
const MONTH = 'tides-month-v1';
const WEEK_RANGE_HOURS = 264;
const NOAA = 'api.tidesandcurrents.noaa.gov';
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('index.html', SCOPE).href;
const NETWORK_TIMEOUT_MS = 4000;
const MAX_TIDE_ENTRIES = 20;
const MAX_MONTH_ENTRIES = 6;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === NOAA) {
    event.respondWith(tides(req, url));
  } else if (req.mode === 'navigate' && url.pathname.startsWith(SCOPE.pathname)) {
    // Any /app/?station=…&day=… navigation gets the cached shell.
    event.respondWith(caches.match(INDEX).then((hit) => hit || fetch(req)));
  } else if (url.origin === SCOPE.origin) {
    event.respondWith(sameOrigin(req));
  }
});

/** Cache-first; anything not precached (the lazy station index) is cached on first use. */
async function sameOrigin(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && new URL(req.url).pathname.startsWith(SCOPE.pathname)) {
    const copy = res.clone();
    caches.open(SHELL).then((c) => c.put(req, copy));
  }
  return res;
}

const isMonth = (url) => Number(url.searchParams.get('range')) > WEEK_RANGE_HOURS;

/** One cache entry per station and time basis, so yesterday's data still serves offline today. */
function tideKey(url) {
  const p = url.searchParams;
  return new URL(`${isMonth(url) ? '__month' : '__tides'}/${p.get('station')}/${p.get('time_zone')}`, SCOPE).href;
}

async function tides(req, url) {
  const month = isMonth(url);
  const cache = await caches.open(month ? MONTH : TIDES);
  const key = tideKey(url);
  const cached = await cache.match(key);

  const network = fetch(req).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.clone().text();
    // NOAA reports bad stations as HTTP 200 + {"error":…}; don't let that overwrite good data.
    if (!body.includes('"error"')) {
      const headers = new Headers(res.headers);
      headers.set('x-sw-fetched-at', String(Date.now()));
      headers.set('access-control-expose-headers', 'x-sw-stale, x-sw-fetched-at');
      await cache.put(key, new Response(body, { status: 200, headers }));
      await trim(cache, month ? MAX_MONTH_ENTRIES : MAX_TIDE_ENTRIES);
    }
    return res;
  });

  if (!cached) return network;
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
  } catch {
    network.catch(() => undefined);
    const headers = new Headers(cached.headers);
    headers.set('x-sw-stale', '1');
    headers.set('access-control-expose-headers', 'x-sw-stale, x-sw-fetched-at');
    return new Response(await cached.text(), { status: 200, headers });
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}
