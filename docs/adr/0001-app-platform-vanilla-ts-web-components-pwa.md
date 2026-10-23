# ADR 0001: Build the Slack Water app as a vanilla TypeScript + Web Components PWA

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Eric (owner), Claude (implementation)

## Context

Slack Water is a tide-tables app. The brief ranks **web performance and accessibility (WCAG 2.2 AA) above everything else**, with motion and water as the design inspiration. The stated platform preference, in order, was:

1. Expo Go (native, React Native), if it can actually be built and verified.
2. Otherwise vanilla TypeScript, unless Web Components, React Native or another framework makes more sense.

Constraints we checked before deciding:

- The build runs in a Linux cloud container with Node 22 and a headless Chromium. There is no iOS Simulator, no Android emulator and no physical device, so an Expo app could compile but could not be run, screen-read, or measured here. Shipping something we cannot verify contradicts the "performance and accessibility first" brief.
- The only data source we need is NOAA CO-OPS tide predictions, a public JSON API that sends `access-control-allow-origin: *`. No native capability (Bluetooth, background fetch, widgets) is required for v1.
- The repo already deploys static files to Netlify.

## Decision

Build a **Progressive Web App** in **strict TypeScript with native Custom Elements**, no runtime framework.

- **Vite** is used only at build time (TS transpile, CSS bundling, hashing). The shipped output is plain ES modules.
- **No runtime dependencies.** Dev dependencies only: `vite`, `typescript`, `vitest`, `@playwright/test`, `@axe-core/playwright`.
- **Service worker** (hand-written, ~2 KB) precaches the shell and caches tide data for offline use at sea.
- Installable via Web App Manifest; launches standalone on iOS and Android home screens.

## Options considered

| Option | Perf (JS shipped) | A11y control | Verifiable here | Maintenance | Verdict |
|---|---|---|---|---|---|
| **Expo Go / React Native** | n/a native; ~400 KB+ for `react-native-web` | Good on native, indirect on web | **No** (no simulator/device) | Expo SDK upgrades yearly | Rejected for v1 |
| **React 19 PWA** | ~60 KB gz framework floor | Good | Yes | Low | Rejected: framework cost buys nothing for 3 views |
| **Vanilla TS + Web Components PWA** | **< 15 KB gz target** | Full control, native elements | **Yes** (Chromium, axe, Lighthouse) | Low, no framework churn | **Chosen** |
| Lit | ~6 KB gz extra | Good | Yes | Low | Rejected: adds a dep for templating we don't need |

## Consequences

- **Good:** smallest possible payload, fast cold start on slow coastal connections, full control over semantics and focus, testable end to end in CI with axe and Lighthouse.
- **Good:** Web Components are framework-agnostic, so the `tide-*` elements can be reused inside a future native shell (e.g. a WebView or Capacitor wrapper) or another app.
- **Trade-off:** no App Store / Play Store presence. iOS PWAs cannot do background push without the user adding to home screen (iOS 16.4+). Acceptable for v1; push is out of scope.
- **Trade-off:** we hand-write what a framework gives for free (re-render diffing, routing). Kept small by limiting the app to one screen plus a station-search dialog.
- **Revisit when:** we need store distribution, home-screen widgets, or background tide alerts. The path then is Capacitor around this same build, or an Expo app that reuses `src/domain/` (pure TS, no DOM).
