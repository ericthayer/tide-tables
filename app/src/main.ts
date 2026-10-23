import './styles/tokens.css';
import './styles/app.css';
import { fetchTides, TideError } from './data/noaa';
import { readPrefs, rememberStation } from './data/prefs';
import { DEFAULT_STATION, loadStations } from './data/stations';
import { dayLongLabel, deviceClock } from './domain/format';
import { addDays, dayKeyAt, eventsForDay, nextTurn } from './domain/tide-math';
import type { DayKey, Station, TideErrorReason } from './domain/types';
import { createStore, readUrl, writeUrl, type AppState } from './state/store';
import './components/tide-next';
import './components/tide-days';
import './components/tide-chart';
import './components/tide-list';
import './components/tide-station-search';
import type { TideChart } from './components/tide-chart';
import type { DayChangeEvent, TideDays } from './components/tide-days';
import type { TideList } from './components/tide-list';
import type { TideNext } from './components/tide-next';
import type { StationPickEvent, TideStationSearch } from './components/tide-station-search';

const BASE = import.meta.env.BASE_URL;
const DAYS = 7;

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
  note: $<HTMLDivElement>('#note'),
  noteText: $<HTMLParagraphElement>('#note-text'),
  retry: $<HTMLButtonElement>('#retry'),
  announcer: $<HTMLDivElement>('#announcer'),
  trigger: $<HTMLButtonElement>('#station-trigger'),
  search: $<TideStationSearch>('tide-station-search'),
};

/** Resolve the start station: URL first, then saved, then Point Reyes. */
function initialStation(urlId: string | undefined, saved: Station | undefined, recents: readonly Station[]): Station {
  if (!urlId) return saved ?? DEFAULT_STATION;
  const known = [saved, ...recents, DEFAULT_STATION].find((s) => s?.id === urlId);
  return known ?? { id: urlId, name: `Station ${urlId}`, state: '', lat: 0, lng: 0 };
}

const fromUrl = readUrl(location.search);
const prefs = readPrefs();
const store = createStore({
  station: initialStation(fromUrl.stationId, prefs.station, prefs.recents),
  day: fromUrl.day ?? null,
  load: { status: 'idle' },
  now: Date.now(),
  recents: prefs.recents,
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
  const { station, load: ld, now } = state;
  ui.name.textContent = station.name;
  ui.meta.textContent = [station.state, `NOAA ${station.id}`].filter(Boolean).join(' · ');
  document.title = `${station.name} · Slack Water`;

  if (ld.status !== 'ready') {
    ui.next.data = { kind: 'loading' };
    const isError = ld.status === 'error';
    ui.note.hidden = !isError;
    ui.retry.hidden = !isError;
    if (isError) {
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

  ui.next.data = next ? { kind: 'ready', event: next, now } : { kind: 'none' };
  ui.days.data = { days, today, selected };
  ui.chart.data = {
    events,
    day: selected,
    now: selected === today ? now : undefined,
    min: Math.min(...heights),
    max: Math.max(...heights),
  };
  ui.list.data = { events: eventsForDay(events, selected), nextAt: next?.at };

  ui.retry.hidden = true;
  ui.note.hidden = !ld.stale;
  if (ld.stale) ui.noteText.textContent = `Showing saved tides from ${deviceClock(ld.fetchedAt)}. They’ll refresh when you’re back online.`;

  const stationChanged = prev?.load.status !== 'ready' || prev.load.station.id !== station.id;
  if (stationChanged) announce(`Showing tides for ${station.name}, ${selected === today ? 'today' : dayLongLabel(selected)}.`);
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

store.subscribe(render);
render(store.get(), undefined);
void load(store.get().station);

// A station from a shared link: fill in its real name once the index is around.
if (store.get().station.name.startsWith('Station ')) {
  void loadStations()
    .then((all) => {
      const found = all.find((s) => s.id === store.get().station.id);
      if (found) store.set({ station: found, recents: rememberStation(found) });
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
  ui.search.recents = store.get().recents;
  ui.search.open(ui.trigger);
});
ui.search.addEventListener('station-pick', (e) => selectStation((e as StationPickEvent).detail));
ui.retry.addEventListener('click', () => void load(store.get().station));
addEventListener('popstate', () => {
  const u = readUrl(location.search);
  const st = initialStation(u.stationId, store.get().station, store.get().recents);
  if (st.id !== store.get().station.id) {
    store.set({ station: st, day: u.day ?? null });
    void load(st);
  } else store.set({ day: u.day ?? null });
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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => void navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }));
}
