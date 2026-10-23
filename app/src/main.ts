import '../../design/tokens.css';
import '../../design/components.css';
import './styles/app.css';
import { fetchTides, TideError } from './data/noaa';
import { readPrefs, rememberStation, setDepth, setHome, setTheme, setUnits } from './data/prefs';
import { applyTheme } from './data/theme';
import { DEFAULT_STATION, loadStations } from './data/stations';
import { daylightText, dayLongLabel, deviceClock } from './domain/format';
import { moonPhase } from './domain/moon';
import { sunDay } from './domain/sun';
import { addDays, dayBounds, dayKeyAt, eventsForDay, nextTurn } from './domain/tide-math';
import type { DayKey, Station, TideErrorReason } from './domain/types';
import { createStore, readUrl, writeUrl, type AppState, type View } from './state/store';
import './components/tide-next';
import './components/tide-days';
import './components/tide-chart';
import './components/tide-list';
import './components/tide-station-search';
import './components/tide-settings';
import type { TideChart } from './components/tide-chart';
import type { DayChangeEvent, TideDays } from './components/tide-days';
import type { TideList } from './components/tide-list';
import type { TideNext } from './components/tide-next';
import type { StationPickEvent, TideStationSearch } from './components/tide-station-search';
import type { SettingsChangeEvent, TideSettings } from './components/tide-settings';
import type { MonthView } from './month/month-view';
import type { DepthChangeEvent, DepthData, TideDepth } from './components/tide-depth';

const BASE = import.meta.env.BASE_URL;
const DAYS = 7;
/** Slack water: the window around a turn when the stream is (nearly) still. */
const SLACK_MS = 20 * 60_000;
let drawnFor = '';

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};
const ui = {
  name: $<HTMLHeadingElement>('#station-name'),
  meta: $<HTMLParagraphElement>('#station-meta'),
  next: $<TideNext>('tide-next'),
  days: $<TideDays>('tide-days'),
  chart: $<TideChart>('tide-chart'),
  list: $<TideList>('tide-list'),
  day: $<HTMLElement>('section.day'),
  note: $<HTMLDivElement>('#note'),
  noteText: $<HTMLParagraphElement>('#note-text'),
  retry: $<HTMLButtonElement>('#retry'),
  announcer: $<HTMLDivElement>('#announcer'),
  trigger: $<HTMLButtonElement>('#station-trigger'),
  search: $<TideStationSearch>('tide-station-search'),
  home: $<HTMLButtonElement>('#home-btn'),
  settingsTrigger: $<HTMLButtonElement>('#settings-trigger'),
  settings: $<TideSettings>('tide-settings'),
  footUnits: $<HTMLSpanElement>('#foot-units'),
  monthLink: $<HTMLAnchorElement>('#month-link'),
  bar: $<HTMLElement>('#today-bar'),
  tides: $<HTMLElement>('#tides'),
  skip: $<HTMLAnchorElement>('#skip'),
  depth: $<TideDepth>('tide-depth'),
};

/** The depth window is code most people never run: fetch it on first use or when a station has one. */
let depthData: DepthData | undefined;
function loadDepth(edit = false): void {
  import('./components/tide-depth').then(() => {
    if (depthData) ui.depth.data = depthData;
    if (edit) ui.depth.edit();
  }, () => undefined);
}

/** Resolve the start station: URL first, then home port, then the last one opened, then Point Reyes. */
function initialStation(urlId: string | undefined, p: { readonly station?: Station | undefined; readonly home?: Station | undefined; readonly saved: readonly Station[]; readonly recents: readonly Station[] }): Station {
  if (!urlId) return p.home ?? p.station ?? DEFAULT_STATION;
  const known = [p.station, p.home, ...p.saved, ...p.recents, DEFAULT_STATION].find((s) => s?.id === urlId);
  return known ?? { id: urlId, name: `Station ${urlId}`, state: '', lat: 0, lng: 0 };
}

const fromUrl = readUrl(location.search);
const prefs = readPrefs();
applyTheme(prefs.theme);
const store = createStore({
  station: initialStation(fromUrl.stationId, prefs),
  day: fromUrl.day ?? null,
  load: { status: 'idle' },
  now: Date.now(),
  recents: prefs.recents,
  home: prefs.home,
  saved: prefs.saved,
  units: prefs.units,
  theme: prefs.theme,
  depths: prefs.depths,
});

let controller: AbortController | undefined;

async function load(station: Station): Promise<void> {
  controller?.abort();
  const ctrl = new AbortController();
  controller = ctrl;
  store.set({ load: { status: 'loading', station } });
  try {
    const r = await fetchTides(station.id, Date.now(), fetch, ctrl.signal);
    if (ctrl.signal.aborted) return;
    // Saved data that no longer reaches past now is as good as none.
    if (r.stale && !nextTurn(r.events, Date.now())) throw new TideError('network', 'Saved tides have run out');
    store.set({ load: { status: 'ready', station, events: r.events, fetchedAt: r.fetchedAt, stale: r.stale }, now: Date.now() });
  } catch (err) {
    if (ctrl.signal.aborted) return;
    const reason: TideErrorReason = err instanceof TideError ? err.reason : 'bad-response';
    store.set({ load: { status: 'error', station, reason } });
  }
}

function announce(text: string): void {
  ui.announcer.textContent = '';
  requestAnimationFrame(() => (ui.announcer.textContent = text));
}

const ERROR_COPY: Record<TideErrorReason, string> = {
  network: 'aren’t available right now. Check your connection and try again.',
  'no-data': 'aren’t published by NOAA for this station.',
  'bad-response': 'couldn’t be read. Try again in a moment.',
};

function render(state: AppState, prev: AppState | undefined): void {
  const { station, load: ld, now, units } = state;
  ui.name.textContent = station.name;
  ui.home.setAttribute('aria-pressed', String(state.home?.id === station.id));
  ui.footUnits.textContent = units === 'ft' ? 'feet' : 'metres';
  ui.monthLink.href = writeUrl(BASE, station.id, null, 'month');
  ui.meta.textContent = [station.state, `NOAA ${station.id}`].filter(Boolean).join(' · ');
  document.title = `${station.name} · Slack Water`;

  if (ld.status !== 'ready') {
    ui.next.data = { kind: 'loading' };
    const isError = ld.status === 'error';
    ui.note.hidden = !isError;
    // Retrying a station NOAA doesn't publish can never succeed.
    ui.retry.hidden = !isError || ld.reason === 'no-data';
    // Never leave the previous station's curve and table under this station's name.
    if (isError) {
      ui.day.hidden = true;
      ui.next.data = { kind: 'none' };
      ui.noteText.textContent = `Tides for ${station.name} ${ERROR_COPY[ld.reason]}`;
      if (prev?.load.status !== 'error') announce(ui.noteText.textContent);
    }
    return;
  }

  const { events } = ld;
  const today = dayKeyAt(events, now);
  const days: DayKey[] = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const selected = state.day && days.includes(state.day) ? state.day : today;
  const next = nextTurn(events, now);
  const week = events.filter((e) => days.some((d) => e.local.startsWith(d)));
  const heights = (week.length ? week : events).map((e) => e.height);

  ui.next.data = next ? { kind: 'ready', event: next, now, units } : { kind: 'none' };
  ui.days.data = { days, today, selected };
  // The curve draws once per station load; day changes cross-fade instead.
  const loadKey = `${station.id}|${ld.fetchedAt}`;
  const draw = loadKey !== drawnFor;
  drawnFor = loadKey;
  const prevTurn = events.filter((e) => e.at <= now).at(-1);
  const depth = state.depths.find((x) => x.id === station.id);
  const slack = [prevTurn, next].some((e) => e !== undefined && Math.abs(e.at - now) <= SLACK_MS);

  // A station opened from a shared link has no position until the station index loads.
  const sun = station.lat === 0 && station.lng === 0 ? undefined : sunDay(selected, station.lat, station.lng);

  ui.chart.data = {
    events,
    day: selected,
    now: selected === today ? now : undefined,
    min: Math.min(...heights),
    max: Math.max(...heights),
    draw,
    slack,
    units,
    sun,
    depth: depth?.m,
  };
  const bounds = dayBounds(events, selected);
  depthData = { events, day: selected, depth, units };
  // Without a depth the static "Set depth" row is already right; once loaded, the element keeps itself current.
  if (depth || customElements.get('tide-depth')) loadDepth();
  ui.list.data = {
    events: eventsForDay(events, selected),
    nextAt: next?.at,
    now,
    caption: selected === today ? `Today, ${dayLongLabel(selected)}` : dayLongLabel(selected),
    units,
    daylight: sun && daylightText(sun, events),
    moon: moonPhase((bounds.start + bounds.end) / 2),
    south: station.lat < 0,
  };

  ui.day.hidden = false;
  ui.retry.hidden = true;
  ui.note.hidden = !ld.stale;
  if (ld.stale) ui.noteText.textContent = `Showing saved tides from ${deviceClock(ld.fetchedAt)}. They’ll refresh when you’re back online.`;

  const stationChanged = prev?.load.status !== 'ready' || prev.load.station.id !== station.id;
  if (stationChanged) announce(`Showing tides for ${ld.station.name}, ${selected === today ? 'today' : dayLongLabel(selected)}.`);
  else if (prev && prev.day !== state.day) announce(selected === today ? `Today, ${dayLongLabel(selected)}` : dayLongLabel(selected));
}

/** Run a visual state change inside a view transition when allowed. */
function transition(fn: () => void): void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'startViewTransition' in document) document.startViewTransition(fn);
  else fn();
}

function selectStation(station: Station, push = true): void {
  const recents = rememberStation(station);
  if (push) history.pushState(null, '', writeUrl(BASE, station.id, null));
  transition(() => store.set({ station, day: null, recents }));
  void load(station);
}

/** The month screen is its own lazily loaded chunk; today's screen never pays for it. */
let month: MonthView | undefined;
async function showView(view: View | undefined): Promise<void> {
  if (view === 'month') {
    month ??= (await import('./month/month-view')).createMonthView({
      store,
      today: [ui.bar, ui.tides],
      skip: ui.skip,
      todayHref: (st) => writeUrl(BASE, st.id, null),
      onBack: () => {
        // Came from today's screen: step back so history stays one entry deep.
        if ((history.state as { fromToday?: boolean } | null)?.fromToday) history.back();
        else {
          history.replaceState(null, '', writeUrl(BASE, store.get().station.id, null));
          void showView(undefined);
        }
      },
      announce,
    });
    month.open();
  } else if (month?.isOpen) {
    month.close();
    render(store.get(), undefined);
    ui.monthLink.focus();
  }
}

// Make the first history entry explicit so Back always knows its station.
history.replaceState(null, '', writeUrl(BASE, store.get().station.id, store.get().day, fromUrl.view));
store.subscribe(render);
render(store.get(), undefined);
void load(store.get().station);
if (fromUrl.view) void showView(fromUrl.view);

// A station from a shared link: fill in its real name once the index is around.
if (store.get().station.name.startsWith('Station ')) {
  void loadStations()
    .then((all) => {
      const found = all.find((s) => s.id === store.get().station.id);
      if (!found) return;
      const home = store.get().home?.id === found.id ? setHome(found).home : store.get().home;
      store.set({ station: found, recents: rememberStation(found), home, saved: readPrefs().saved });
    })
    .catch(() => undefined);
}

ui.days.addEventListener('day-change', (e) => {
  const day = (e as DayChangeEvent).detail;
  const st = store.get();
  history.replaceState(null, '', writeUrl(BASE, st.station.id, day));
  transition(() => store.set({ day }));
});
ui.trigger.addEventListener('click', () => {
  const st = store.get();
  ui.search.recents = st.recents;
  ui.search.saved = st.saved;
  ui.search.homeId = st.home?.id;
  ui.search.open(ui.trigger);
});
ui.home.addEventListener('click', () => {
  const { station, home } = store.get();
  const wasHome = home?.id === station.id;
  const p = setHome(wasHome ? null : station);
  store.set({ home: p.home, saved: p.saved });
  announce(wasHome ? `${station.name} is no longer your home port.` : `${station.name} is now your home port.`);
});
ui.settingsTrigger.addEventListener('click', () => {
  const { units, theme } = store.get();
  ui.settings.open(ui.settingsTrigger, { units, theme });
});
ui.settings.addEventListener('settings-change', (e) => {
  const c = (e as SettingsChangeEvent).detail;
  if (c.kind === 'units') {
    setUnits(c.value);
    store.set({ units: c.value });
  } else {
    setTheme(c.value);
    applyTheme(c.value);
    store.set({ theme: c.value });
  }
});
ui.depth.addEventListener('click', (e) => {
  // Before the module loads, only the static "Set depth" button is here; afterwards the element handles clicks.
  if (!customElements.get('tide-depth') && e.target instanceof HTMLButtonElement) loadDepth(true);
});
ui.depth.addEventListener('depth-change', (e) => {
  const depth = (e as DepthChangeEvent).detail;
  store.set({ depths: setDepth(store.get().station.id, depth).depths });
});
ui.search.addEventListener('station-pick', (e) => selectStation((e as StationPickEvent).detail));
ui.retry.addEventListener('click', () => void load(store.get().station));
ui.monthLink.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  history.pushState({ fromToday: true }, '', ui.monthLink.href);
  void showView('month');
});
addEventListener('popstate', () => {
  const u = readUrl(location.search);
  const cur = store.get();
  const st = u.stationId ? initialStation(u.stationId, cur) : cur.station;
  if (st.id !== store.get().station.id) {
    store.set({ station: st, day: u.day ?? null });
    void load(st);
  } else store.set({ day: u.day ?? null });
  void showView(u.view);
});

// Minute tick, aligned to the minute; resync when the app returns to the foreground.
function tick(): void {
  store.set({ now: Date.now() });
  setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
}
setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') store.set({ now: Date.now() });
});
// Restored from the back/forward cache (and iOS PWA resume): visibilitychange may not fire.
addEventListener('pageshow', (e) => {
  if (e.persisted) store.set({ now: Date.now() });
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => void navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }));
}
