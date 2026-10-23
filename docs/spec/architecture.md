# Architecture: Slack Water app

See [ADR 0001](../adr/0001-app-platform-vanilla-ts-web-components-pwa.md) for the platform decision and [PRD](PRD.md) for requirements.

## Layout

```
app/
  index.html                 Static shell: critical markup, inline critical CSS, SVG sprite
  public/
    manifest.webmanifest
    sw.js                    Service worker (hand-written, no Workbox)
    icons/                   PNG + maskable icons rendered from the brand mark
    stations.json            Compact station index, lazy-loaded
  scripts/
    build-stations.mjs       Regenerates public/stations.json from NOAA mdapi
                             (stations.json?type=tidepredictions, ~3,500 R+S stations) as
                             compact tuples [id, name, state, lat, lng] (3 dp): ~66 KB gz measured
    postbuild.mjs            Post-build: injects precache list + cache version into dist/app/sw.js,
                             copies the brand board into dist/
  src/
    main.ts                  Boot: register elements, read URL, wire store → views
    styles/
      app.css                Layout and app glue (tokens and sw- components come from
                             ../design/tokens.css and ../design/components.css)
    domain/                  Pure TS. No DOM. Unit-tested.
      types.ts               TideEvent, Station, DayView, LoadState (discriminated union)
      tide-math.ts           Cosine interpolation, next turn, day slicing, countdown
      geo.ts                 Haversine nearest-station
      search.ts              Station ranking
    data/
      noaa.ts                Fetch gmt + lst_ldt hi/lo pairs, merge, validate
      stations.ts            Lazy index loader (cached promise)
      prefs.ts               localStorage (station, recents) with try/catch
    state/
      store.ts               Tiny observable store (get/set/subscribe), URL sync
    components/
      tide-next.ts           <tide-next>    hero: next turn + countdown
      tide-chart.ts          <tide-chart>   SVG curve, flood fill, now marker
      tide-list.ts           <tide-list>    <ol> of the day's turns
    month/                   Month screen (?view=month), its own lazy chunk + CSS:
      month-view.ts          Screen controller: own header/main, 34-day fetch, offline fallback
      tide-month.ts          <tide-month>   30-day table, one row per station-local day
      tide-days.ts           <tide-days>    radio-group day picker
      tide-station-search.ts <tide-station-search> dialog + combobox
  tests/
    unit/*.test.ts           Vitest, domain + data
    e2e/*.spec.ts            Playwright + axe against `vite preview` (built output, SW active),
                             NOAA mocked via context.route() — page.route() does not see SW-originated fetches
```

## Data flow

```
URL (?station, ?day) ──► store ◄── prefs (localStorage)
                          │
                          ▼
                 noaa.fetchWeek(station)  ──►  SW cache (network-first, 4 s timeout)
                          │
                          ▼
            LoadState: idle | loading | ready{events, fetchedAt, offline} | error
                          │
     ┌──────────────┬─────┴──────┬──────────────┐
     ▼              ▼            ▼              ▼
 <tide-next>   <tide-chart>  <tide-list>   <tide-days>
```

- **Single store, explicit subscriptions.** Components receive plain data via properties (`el.data = …`), never read globals. Each component renders in `connectedCallback` and on property set, batched with `requestAnimationFrame`.
- **Light DOM, not Shadow DOM.** Global tokens and one stylesheet keep CSS small and let the design-system thread own the look. Components scope their CSS by tag name.
- **No `innerHTML` with data.** Station names come from a remote API, so all text goes through `textContent`. Static SVG structure is built with `createElementNS`.

## Tide data

- One request pair per station per load: `product=predictions`, `interval=hilo`, `datum=MLLW`, `units=metric`, `format=json`, `application=slack-water`, once with `time_zone=gmt` (absolute instants) and once with `time_zone=lst_ldt` (station wall clock). hilo predictions allow ranges far beyond what we need (the 1-year cap applies to 6-min/hourly), so window size is not a constraint.
- **`begin_date` is interpreted in the requested `time_zone`**, so the two responses cover *different* windows and do not line up by index (verified 2026-10-23: 9415020, `begin_date=20261031&range=216` returns 34 events for gmt and 35 for lst_ldt; gmt[i+1] ≙ lst_ldt[i]). Therefore:
  - Window (as built): both requests use `begin_date` = UTC date of (now − 48 h) and `range=264`. The lst_ldt window is shifted by the station offset (−11 to +10 h for NOAA stations), so the overlap still starts more than a day before station-local today and ends past day 7.
  - Align, don't zip: find the shift `k` (searched over −4…+4) where `lst[k+i]` matches `gmt[i]` on `type` and the exact `v` string for every overlapping `i`; keep the overlap only. Fewer than 2 matched events is a `TideError('bad-response')`.
  - Coverage is not validated up front (not implemented). Days the data does not reach show "No high or low water in the saved data for this day"; stale data with no turn after now is shown as the AC8 error.
- Each `TideEvent` is `{ at: number /* epoch ms */, local: string /* "YYYY-MM-DD HH:mm" */, type: 'H' | 'L', height: number }`. The UTC offset per event (`local − at`) gives station-local day boundaries without a timezone database, and handles DST transitions:
  - Station-local midnight for day D = `Date.UTC(D) − offset`, where `offset` is taken from the last event at or before that midnight (US DST switches at 02:00, never at midnight, so this is exact). Days are 23 h / 25 h on transition dates.
  - The repeated hour on fall-back day is ambiguous in `local` alone; `at` (gmt) disambiguates, so all ordering and countdowns use `at`, never `local`.
  - "Today", the *now* marker and the day picker are **station-local**, not device-local (a user in New York viewing a Hawaii station sees Hawaii's today).
- NOAA responds with `cache-control: no-store`, so the browser HTTP cache never helps; offline relies entirely on the SW/app cache below.
- **Curve:** between consecutive events `a`, `b`: `h(t) = (a.h + b.h)/2 + (a.h − b.h)/2 · cos(π · (t − a.t)/(b.t − a.t))`. Exact at every turn, zero slope at turns (that's the "slack").
- Subordinate (`S`) stations only publish hi/lo, which is why we never request the 6-minute series.

## Offline and caching

- `sw.js` lives in `public/`, so Vite does not see hashed filenames. A post-build script (`scripts/postbuild.mjs`) walks `dist/app/` and writes the precache list (everything except `sw.js`, `stations.json` and the icons) plus a content-hash cache version over all built files into `dist/app/sw.js`. Without this the precache list is wrong after every build.
- `sw.js` precaches the shell (`index.html`, hashed JS/CSS, fonts, icons) under that versioned cache name; old caches are deleted on `activate`. Served from `/app/sw.js`, so its default scope is `/app/` (no `Service-Worker-Allowed` header needed). Registered with `{ scope: '/app/' }`; `/app` without the slash is outside scope, so Netlify must redirect `/app` → `/app/` (it does by default for directories; add an explicit 301 to be safe).
- Navigations within scope (any `?station=…&day=…`) are answered **cache-first** with the precached `index.html`. New deploys arrive through the worker update: `sw.js` is served `no-cache`, a changed version installs, `skipWaiting()` + `clients.claim()`, and the next launch gets the new shell.
- NOAA requests: **network-first with a 4 s timeout, falling back to cache**, in a `tides-v1` cache capped at 20 entries. Predictions are deterministic, so freshness is not the issue; **coverage** is. The cache key is normalised to `station + time_zone` (strip `begin_date`/`range`), otherwise tomorrow's URL never matches yesterday's cached response and offline fails the next day. The SW stores a synthetic `x-sw-fetched-at` header on the cached copy and adds `x-sw-stale: 1` when it serves that copy; the page reads them to show "Showing saved tides from 14:02" and to set `stale: true`. If saved data has no turn after now, the page shows the AC8 error state (without the saved time). The 4 s timeout applies only when a cached copy exists; a first load with no cache waits for the network.
- Offline detection is by fetch failure/timeout, never `navigator.onLine` (unreliable, especially on iOS).
- `stations.json`: cache-first in the **versioned shell cache** (so a deploy replaces it), fetched lazily, not precached.

## Platform notes (iOS / Netlify)

- iOS home-screen PWAs have storage separate from Safari: the installed app starts with an empty cache and empty `localStorage`, so AC7 holds only after one online launch *from the home screen*.
- iOS needs `<link rel="apple-touch-icon">` (180 px, opaque) and `apple-mobile-web-app-title`; use `viewport-fit=cover` plus `env(safe-area-inset-*)` padding for the notch and home indicator. `<meta name="theme-color">` twice with `media="(prefers-color-scheme: …)"` for light/dark.
- Baselines: `<dialog>` iOS 15.4+, View Transitions Safari 18+ (feature-detect `document.startViewTransition`, else instant swap), `:focus-visible` 15.4+.
- Manifest: `id: "/app/"`, `start_url: "/app/"`, `scope: "/app/"`, `display: "standalone"`, served as `application/manifest+json`.
- `setInterval` is throttled/paused in background tabs and when iOS suspends the PWA: recompute the countdown and the selected "today" on `visibilitychange` and `pageshow`.

## Fonts

Cabinet Grotesk (800, 500) and Geist Mono (400) self-hosted as WOFF2, Latin subset, `font-display: swap`, display weight preloaded. Fallback stacks use `size-adjust` metrics to keep CLS ≈ 0.

## Build and deploy

- `npm run build` (in `app/`) → `vite build` with `base: '/app/'`, outputs to `../dist/app/` with `emptyOutDir: true` (Vite refuses to empty an outDir outside its root otherwise) then runs `scripts/postbuild.mjs`, which also copies `slack-water-brandkit.html` into `../dist/` so the existing root redirect (`/` → `/slack-water-brandkit.html`, 200) keeps working; that redirect block stays unchanged in `netlify.toml`.
- Netlify: `base` stays repo root, `command = "npm --prefix app ci && npm --prefix app run build"`, `publish = "dist"`, `[build.environment] NODE_VERSION = "22"`. `app/package-lock.json` must be committed (`npm ci` fails without it). Headers: `Cache-Control: public, max-age=31536000, immutable` for `/app/assets/*`; `no-cache` for `/app/sw.js` (everything else under `/app/` keeps Netlify's default `max-age=0, must-revalidate`). Redirect `/app` → `/app/` (301).
- Preconnect to `https://api.tidesandcurrents.noaa.gov` in `index.html` and start the NOAA fetch from `main.ts` before defining elements: the LCP element (next-turn time) depends on that cross-origin request, so it is the critical path. The hero reserves its final box during loading so CLS stays ≈ 0.
- CI quality gates (`npm run check`): `tsc --noEmit` strict, Vitest, Playwright e2e with axe, bundle size budget script.
