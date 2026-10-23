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
    build-stations.mjs       Regenerates public/stations.json from NOAA metadata API
  src/
    main.ts                  Boot: register elements, read URL, wire store → views
    styles/
      tokens.css             Design tokens (swap point for the design-system thread)
      app.css                Layout, components, motion
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
      tide-days.ts           <tide-days>    radio-group day picker
      tide-station-search.ts <tide-station-search> dialog + combobox
  tests/
    unit/*.test.ts           Vitest, domain + data
    e2e/*.spec.ts            Playwright + axe, NOAA mocked via route()
```

## Data flow

```
URL (?station, ?day) ──► store ◄── prefs (localStorage)
                          │
                          ▼
                 noaa.fetchWeek(station)  ──►  SW cache (stale-while-revalidate)
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

- One request pair per station per load: `interval=hilo`, `range=216` hours starting yesterday (covers curve edges for day 1 through day 7), `datum=MLLW`, `units=metric`, once with `time_zone=gmt` (absolute instants) and once with `time_zone=lst_ldt` (station wall clock). Pairs are zipped by index and validated (same length, same type sequence).
- Each `TideEvent` is `{ at: number /* epoch ms */, local: string /* "YYYY-MM-DD HH:mm" */, type: 'H' | 'L', height: number }`. The UTC offset per event (`local − at`) gives station-local day boundaries without a timezone database, and handles DST transitions.
- **Curve:** between consecutive events `a`, `b`: `h(t) = (a.h + b.h)/2 + (a.h − b.h)/2 · cos(π · (t − a.t)/(b.t − a.t))`. Exact at every turn, zero slope at turns (that's the "slack").
- Subordinate (`S`) stations only publish hi/lo, which is why we never request the 6-minute series.

## Offline and caching

- `sw.js` precaches the shell (`index.html`, hashed JS/CSS, fonts, icons) under a versioned cache name; old caches are deleted on `activate`.
- NOAA requests: stale-while-revalidate in a `tides-v1` cache, capped at 20 entries. The page also records `fetchedAt`, so the UI can say "Saved tides from 14:02" when the network request fails.
- `stations.json`: cache-first (rebuilt only on deploy).

## Fonts

Cabinet Grotesk (800, 500) and Geist Mono (400) self-hosted as WOFF2, Latin subset, `font-display: swap`, display weight preloaded. Fallback stacks use `size-adjust` metrics to keep CLS ≈ 0.

## Build and deploy

- `npm run build` (in `app/`) → `vite build` with `base: '/app/'`, outputs to `../dist/app/`. A post-build step copies the brand board into `../dist/` so the existing root redirect keeps working.
- Netlify: `base` stays repo root, `command = "npm --prefix app ci && npm --prefix app run build"`, `publish = "dist"`. Long-cache headers for `/app/assets/*`; `no-cache` for `sw.js` and HTML.
- CI quality gates (`npm run check`): `tsc --noEmit` strict, Vitest, Playwright e2e with axe, bundle size budget script.
