# Implementation plan: Slack Water app v1

Spec-driven: each step has a goal, the files it touches, and how it is verified. Steps are ordered so every step ends green.

## Step 1: Scaffold and quality gates
- **Goal:** `app/` package with Vite, strict TS, Vitest, Playwright + axe, size budget script, Netlify build wiring.
- **Files:** `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/playwright.config.ts`, `app/scripts/size-budget.mjs`, `netlify.toml`, `.gitignore`.
- **Verify:** `npm run typecheck`, `npm test`, `npm run build` all pass on an empty app.

## Step 2: Domain layer (TDD)
- **Goal:** `types.ts`, `tide-math.ts` (interpolate, nextTurn, eventsForDay, countdown, dayCurve), `geo.ts`, `search.ts`.
- **Verify:** unit tests written first, covering DST day (23 h / 25 h), turn exactly at *now*, empty data, ranking ("reyes" → Point Reyes first; id match).

## Step 3: Data layer
- **Goal:** `noaa.ts` (paired fetch, validation, typed errors), `stations.ts` (lazy cached loader), `prefs.ts`, `build-stations.mjs` + generated `public/stations.json`.
- **Verify:** unit tests with mocked `fetch` for success, mismatched pairs, HTTP error, NOAA `{error}` payload.

## Step 4: Tokens, shell, and styles
- **Goal:** `tokens.css` from the brand board (swap point), `app.css`, `index.html` with semantic landmarks, SVG sprite, self-hosted fonts, light/dark, reduced motion, forced colours.
- **Verify:** contrast unit test over token pairs used for text; visual check at 320 px and 430 px.

## Step 5: Components and store
- **Goal:** `store.ts` with URL sync; `<tide-next>`, `<tide-chart>`, `<tide-list>`, `<tide-days>`, `<tide-station-search>`; `main.ts` boot, loading/error/offline states, live-region announcements.
- **Verify:** Playwright e2e with NOAA mocked: AC1–AC6, AC8; keyboard-only flow; axe on default, dialog open, error state, dark scheme.

## Step 6: PWA
- **Goal:** manifest, icons rendered from the mark, `sw.js` precache + SWR, offline note.
- **Verify:** e2e AC7 (go offline after first load, reload, tides still render).

## Step 7: Performance pass and docs
- **Goal:** Lighthouse mobile run against `vite preview`, fix regressions, README section, PR.
- **Verify:** budgets in PRD §5 met; numbers recorded in the PR body.
