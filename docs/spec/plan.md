# Implementation plan: Slack Water app v1

Spec-driven: each step has a goal, the files it touches, and how it is verified. Steps are ordered so every step ends green.

## Step 1: Scaffold and quality gates
- **Goal:** `app/` package with Vite, strict TS, Vitest, Playwright + axe, size budget script, Netlify build wiring.
- **Files:** `app/package.json`, `app/package-lock.json` (committed; Netlify runs `npm ci`), `app/tsconfig.json`, `app/vite.config.ts` (`base: '/app/'`, `outDir: '../dist/app'`, `emptyOutDir: true`, `app/playwright.config.ts` (webServer = `vite preview` of the built output), `app/scripts/size-budget.mjs`, `app/scripts/postbuild.mjs` (also copies the brand board), `netlify.toml` (keep the `/` redirect; add `command`, `publish = "dist"`, `NODE_VERSION = "22"`, headers and `/app` → `/app/` per architecture.md), `.gitignore`.
- **Verify:** `npm run typecheck`, `npm test`, `npm run build` all pass on an empty app; `dist/slack-water-brandkit.html` and `dist/app/index.html` both exist; `npx netlify build` (or a deploy preview) serves `/` as the board and `/app/` as the app.

## Step 2: Domain layer (TDD)
- **Goal:** `types.ts`, `tide-math.ts` (interpolate, nextTurn, eventsForDay, countdown, dayCurve), `geo.ts`, `search.ts`.
- **Verify:** unit tests written first, covering DST day (23 h / 25 h; fall-back repeated hour ordered by `at`), turn exactly at *now*, empty data, station-local today differing from device-local today (e.g. Hawaii station, device in UTC+1), ranking ("reyes" → Point Reyes first; id match). Run tests under `TZ=UTC` and `TZ=Pacific/Auckland` to prove nothing depends on the device zone.

## Step 3: Data layer
- **Goal:** `noaa.ts` (paired fetch, validation, typed errors), `stations.ts` (lazy cached loader), `prefs.ts`, `build-stations.mjs` + generated `public/stations.json`.
- **Verify:** unit tests with mocked `fetch` for success, gmt/lst_ldt windows offset by one or more events (real fixture: 9415020 `begin_date=20261031`, spans the 2026-11-01 fall-back), no consistent alignment, coverage short of day 7, HTTP error, NOAA `{error:{message}}` payload (HTTP 200), timeout/abort.

## Step 4: Tokens, shell, and styles
- **Goal:** tokens and component classes imported from `design/` (PR #3), `app.css`, `index.html` with semantic landmarks, preconnect to NOAA, a pre-existing polite live region in the static HTML (live regions injected later are often not announced), SVG sprite, self-hosted fonts, light/dark, reduced motion, forced colours, iOS meta (apple-touch-icon, `viewport-fit=cover`, safe-area padding, per-scheme `theme-color`).
- **Fonts:** Cabinet Grotesk WOFF2 comes from Fontshare (ITF Free Font License, self-hosting allowed) and Geist Mono from its OFL release; subset with `pyftsubset` and commit the files. If the container cannot download them, stop and ask rather than shipping fallbacks only.
- **Verify:** contrast unit test over token pairs used for text and UI boundaries, in both schemes (note `fog #B9B4A8` on ivory is 1.79:1, so it is never text or a boundary on light); visual check at 320 px, 430 px and 200% zoom.

## Step 5: Components and store
- **Goal:** `store.ts` with URL sync; `<tide-next>`, `<tide-chart>`, `<tide-list>`, `<tide-days>`, `<tide-station-search>`; `main.ts` boot, loading/error/offline states, live-region announcements.
- **Verify:** Playwright e2e with NOAA mocked via `context.route()`: AC1–AC6, AC8; AC2 via `page.clock`; out-of-range `day` and unknown `station` URL params; back button after a station change; keyboard-only flow incl. focus return from the dialog; axe on default, dialog open, error state, offline note, dark scheme, reduced motion.

## Step 6: PWA
- **Goal:** manifest (`id`/`start_url`/`scope` = `/app/`), icons rendered from the mark (incl. 180 px apple-touch-icon and maskable), `sw.js` (shell precache, navigation fallback with `ignoreSearch`, NOAA network-first with normalised cache key and `x-sw-fetched-at`), `scripts/postbuild.mjs` precache injection, offline note.
- **Verify:** e2e AC7 against `vite preview` (go offline after first load, reload, tides still render); offline reload with `?station=…&day=…` still serves the shell; offline with `page.clock` advanced 2 days still shows tides, advanced 8 days shows the AC8 state; a second build changes the cache version and old caches are deleted on activate.

## Step 7: Performance pass and docs
- **Goal:** Lighthouse mobile run against `vite preview` with NOAA served from a local fixture (deterministic), plus one run against live NOAA for the record; fix regressions, README section, PR. Manual smoke on a real iOS device (install, offline relaunch, VoiceOver pass) is listed in the PR as a human check, since it cannot run here.
- **Verify:** budgets in PRD §5 met; numbers recorded in the PR body.
