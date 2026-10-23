# PRD: Slack Water, the tide-tables app (v1)

- **Status:** Approved for build
- **Owner:** Eric
- **Date:** 2026-10-23
- **Related:** [ADR 0001](../adr/0001-app-platform-vanilla-ts-web-components-pwa.md), [Architecture](architecture.md), [Plan](plan.md), [brand board](../../slack-water-brandkit.html)

## 1. Problem

People who work or play on the water (sailors, kayakers, surfers, divers, anglers, harbour crews) need one answer fast: **when does the tide turn next, and how high will it be?** Existing tide apps bury that answer under ads, maps and weather, load slowly on a weak coastal signal, and are hard to use with a screen reader or one wet hand.

## 2. Product principles (from the brand board)

1. **Know the water before you meet it.** The next turn is the hero; everything else is secondary.
2. **Calm. Exact. Never alarmist.** Red (`Signal`) is used only for *now* and *next slack*. No warning colours, no exclamation marks.
3. **Numbers are mono and tabular.** Every time and height is set in Geist Mono with tabular figures.
4. **Water moves; the interface breathes with it.** Motion is slow, eased like a tide, and fully removed under `prefers-reduced-motion`.

## 3. Users and jobs

| User | Job to be done | v1 answer |
|---|---|---|
| Kayaker at the launch | "Do I have time before the ebb?" | Next turn, time-until, height; today's curve with a *now* marker |
| Sailor planning the weekend | "When is high water Saturday?" | 7-day day picker, per-day HW/LW list |
| Harbour crew, screen-reader user | "Read me today's tides" | Semantic list of turns, announced station/day changes, no info locked in the chart |
| Anyone offline at sea | "It still works out here" | The 7-day window (today + 6) last fetched is cached on device |

## 4. Scope

### In (v1)

- **F1 Today view:** station name, date, *Next slack* label, next turn time (large), type + height + countdown, 24-hour tide curve with *now* marker, list of the day's high and low waters with the next one marked.
- **F2 Day picker:** today plus the next 6 days, where *today* is the **station-local** date. Selecting a day re-renders curve and list; *now* marker only on today.
- **F3 Station search:** dialog with an accessible combobox over all NOAA tide-prediction stations (~3,500), searchable by name, state or station id. Index is lazy-loaded the first time search opens. The listbox renders at most 50 options, and a polite status line announces the result count (debounced).
- **F4 Nearest station:** opt-in "Use my location" button (never prompts on load) picks the nearest station.
- **F5 Remember station:** last station (and up to 5 recents) persists locally. Default station: Point Reyes, CA (9415020).
- **F6 Offline:** app shell precached; tide responses cached; a clear "Showing saved tides from <time>" note when offline.
- **F7 Installable PWA:** manifest, icons from the brand mark, standalone display, theme colour.
- **F8 Light and dark themes** following `prefers-color-scheme`, both AA.
- **F9 Disclaimer:** "Predictions from NOAA. Not for navigation." always visible in the footer.

### Out (v1)

Push notifications and departure alerts, tidal currents (true slack of current), weather, maps, accounts and sync, non-NOAA (international) data, imperial/metric toggle (v1 shows metres, matching the brand board; feet is a fast follow).

## 5. Requirements

### Functional acceptance criteria

| ID | Given / When / Then |
|---|---|
| AC1 | Given a station with data, when the app opens, then the next high or low after *now* is shown with its station-local time, type, height (m, 1 dp) and a countdown in `Xh Ym`. |
| AC2 | The countdown updates at least once a minute without a reload, rolls to the following turn when the current one passes, and is correct immediately after the app returns from background (`visibilitychange`/`pageshow`), including rolling *today* past station-local midnight. |
| AC3 | The curve plots predicted height for 00:00 to 24:00 station-local time, passing through every high and low of that day, with a red *now* marker on today only. |
| AC4 | Selecting a day in the picker updates the curve and list within one frame of data being available; selection is reflected in the URL (`?station=…&day=YYYY-MM-DD`, station-local date) so the view is shareable. Station changes `pushState` (back returns to the previous station); day changes `replaceState` (arrow keys in the radio group would otherwise flood history). A `day` outside today…today+6 (e.g. an old shared link) falls back to today; an unknown `station` falls back to the saved/default station with a calm note. |
| AC5 | Typing "reyes" in station search lists Point Reyes within 100 ms of the index loading; Enter selects it, closes the dialog and returns focus to the trigger. |
| AC6 | "Use my location" only requests permission on click; on denial it shows a calm inline message and leaves the current station. |
| AC7 | With the network off after one successful load, reopening the app (same day or any later day still inside the cached 7-day window) shows the same station's tides and the offline note. Once the cache no longer covers station-local today, AC8's state is shown with the saved time. On iOS this holds only after one online launch from the home screen (separate storage). |
| AC8 | On API error with no cache, the app shows "Tides for <station> aren't available right now" with a Retry button; nothing crashes. |

### Accessibility (WCAG 2.2 AA, non-negotiable)

- Native elements first: `<button>`, `<dialog>`, `<fieldset>` + radio inputs for the day picker, `<ol>` for the turn list, `<time datetime>` for every time.
- The chart is decorative-plus-summary: `role="img"` with a text summary; **all data in the chart is also in the list**.
- Station search follows the WAI-ARIA 1.2 combobox + listbox pattern (`aria-expanded`, `aria-controls`, `aria-activedescendant`).
- Station or day change is announced once via a polite live region. The countdown is **not** live (no chatter every minute).
- Contrast: text ≥ 4.5:1, large text and UI boundaries ≥ 3:1, in both themes. Brand red `#C8102E` passes on ivory (5.08:1) but **fails on navy (2.72:1)**, so dark mode uses a lifted signal red for text.
- Targets ≥ 44×44 CSS px (exceeds 2.5.8's 24 px minimum). Visible focus ring ≥ 2 px, never removed.
- Works at 200% zoom and 320 px width with no horizontal scroll (1.4.10 Reflow).
- `prefers-reduced-motion: reduce` removes all non-essential animation; `prefers-contrast: more` strengthens rules.
- Zero axe-core violations on every state, enforced in CI.

### Performance budgets (enforced in CI where measurable)

| Metric | Budget |
|---|---|
| JS, gzipped, initial | ≤ 15 KB |
| CSS, gzipped | ≤ 8 KB |
| Station index (lazy) | ≤ 70 KB gzipped, not on the critical path (measured ~66 KB for 3,502 stations as compact tuples; little headroom, so no extra fields) |
| LCP (Lighthouse mobile, simulated 4G, NOAA response mocked locally so CI is deterministic; one manual run against live NOAA recorded in the PR) | ≤ 1.8 s |
| CLS | ≤ 0.02 |
| TBT | ≤ 100 ms |
| Lighthouse Performance / Accessibility / Best Practices | ≥ 95 / 100 / 100 |

## 6. Motion direction

Water, not UI chrome. All motion uses one tidal easing (`cubic-bezier(.45,0,.55,1)`, a sine in-out) and slow durations (600–1200 ms).

- **Flood fill:** on load, the water under the curve rises from the baseline to the predicted level, like a tide coming in.
- **Draw-on:** the curve stroke draws left to right once.
- **Swell:** the *now* marker's level line drifts with a slow 6 s sine swell (2 px amplitude).
- **Turn:** day and station changes cross-fade via the View Transitions API where supported.
- **Reduced motion:** everything renders in its final state instantly. No parallax, no autoplay loops.

## 7. Success metrics (post-launch)

- Time to first meaningful answer (next turn visible) p75 < 2 s on mobile.
- ≥ 30% of returning users install to home screen within 4 weeks.
- Zero accessibility regressions (axe CI) per release.

## 8. Risks

| Risk | Mitigation |
|---|---|
| NOAA API outage or rate limit | Network-first with 4 s timeout falling back to the last cached week for the station, retry with backoff, clear error state |
| Interpolated curve differs from NOAA's 6-min series | Cosine interpolation between hi/lo is the standard method and matches within a few cm at mid-tide; heights shown in the list are NOAA's exact values |
| "Slack" means slack *current* to sailors, not high/low water | Copy says "Next slack" per brand voice and shows the turn type (High/Low); a true current product is out of scope and noted in the footer copy |
| Design tokens arrive late from the design-system thread | Ship with brand-board values in `tokens.css`; swap file when tokens land (single import) |
