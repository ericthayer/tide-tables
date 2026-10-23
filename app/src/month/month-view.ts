import { h, s } from '../components/dom';
import { fetchTides, MONTH_RANGE_HOURS, TideError } from '../data/noaa';
import { deviceClock } from '../domain/format';
import { monthRows, MONTH_DAYS } from '../domain/month';
import { dayKeyAt, nextTurn } from '../domain/tide-math';
import type { Station, TideErrorReason, TideEvent } from '../domain/types';
import type { AppState, Store } from '../state/store';
import './month.css';
import { designIcon, type TideMonth } from './tide-month';

type MonthLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly events: readonly TideEvent[]; readonly fetchedAt: number; readonly stale: boolean }
  | { readonly status: 'error'; readonly reason: TideErrorReason };

export interface MonthViewOptions {
  readonly store: Store;
  /** Today's screen: hidden while the month is showing. */
  readonly today: readonly HTMLElement[];
  readonly skip: HTMLAnchorElement;
  /** href of the back link (today's screen for the current station). */
  readonly todayHref: (station: Station) => string;
  readonly onBack: () => void;
  readonly announce: (text: string) => void;
}

export interface MonthView {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

const ERROR_COPY: Record<TideErrorReason, string> = {
  network: 'need a connection the first time. Check your connection and try again.',
  'no-data': 'aren’t published by NOAA for this station.',
  'bad-response': 'couldn’t be read. Try again in a moment.',
};

const backIcon = (): SVGSVGElement =>
  s(
    'svg',
    { class: 'sw-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M10 3 L5 8 L10 13', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );

/** The month screen: its own header and main, a 30-day table, its own fetch and cache. */
export function createMonthView(o: MonthViewOptions): MonthView {
  const back = h('a', { class: 'sw-button sw-button--quiet back-btn', href: '' }, backIcon(), 'Today');
  const header = h('header', { class: 'bar month-bar' }, back);
  const title = h('h1', { class: 'title-1 station-name', id: 'month-h', tabindex: -1 });
  const meta = h('p', { class: 'caption station-meta' });
  const table = document.createElement('tide-month') as TideMonth;
  const noteText = h('p', { class: 'body-sm' });
  const retry = h('button', { type: 'button', class: 'sw-button sw-button--outline' }, 'Try again');
  const note = h('div', { class: 'note', hidden: true }, noteText, retry);
  const legend = h(
    'p',
    { class: 'caption month-key' },
    h('span', { class: 'month-turn' }, designIcon('i-rising'), 'high water'),
    h('span', { class: 'month-turn' }, designIcon('i-falling'), 'low water'),
  );
  const main = h(
    'main',
    { id: 'month', class: 'month-screen', tabindex: -1 },
    h('section', { class: 'hero', 'aria-labelledby': 'month-h' }, title, meta),
    note,
    table,
    legend,
  );

  let open = false;
  let load: MonthLoad = { status: 'loading' };
  let loadedFor = '';
  let ctrl: AbortController | undefined;
  let unsubscribe: (() => void) | undefined;

  async function fetchMonth(station: Station): Promise<void> {
    ctrl?.abort();
    const c = new AbortController();
    ctrl = c;
    loadedFor = station.id;
    load = { status: 'loading' };
    render(o.store.get());
    try {
      const r = await fetchTides(station.id, Date.now(), fetch, c.signal, MONTH_RANGE_HOURS);
      if (c.signal.aborted) return;
      load = { status: 'ready', events: r.events, fetchedAt: r.fetchedAt, stale: r.stale };
    } catch (err) {
      if (c.signal.aborted) return;
      load = { status: 'error', reason: err instanceof TideError ? err.reason : 'bad-response' };
      o.announce(noteFor(o.store.get()));
    }
    render(o.store.get());
  }

  /** Offline with no saved month: today's week is better than nothing. */
  function fallback(st: AppState): readonly TideEvent[] | undefined {
    const ld = st.load;
    return ld.status === 'ready' && ld.station.id === st.station.id ? ld.events : undefined;
  }

  function noteFor(st: AppState): string {
    if (load.status === 'ready') return load.stale ? `Showing saved tides from ${deviceClock(load.fetchedAt)}. They’ll refresh when you’re back online.` : '';
    if (load.status !== 'error') return '';
    if (load.reason === 'network' && fallback(st)) return 'Showing the days saved on this device. The full 30 days need a connection.';
    return `30 days of tides for ${st.station.name} ${ERROR_COPY[load.reason]}`;
  }

  function render(st: AppState): void {
    if (!open) return;
    const { station, units, now } = st;
    if (station.id !== loadedFor) {
      void fetchMonth(station);
      return;
    }
    title.textContent = station.name;
    meta.textContent = `Next ${MONTH_DAYS} days · heights in ${units === 'ft' ? 'feet' : 'metres'}`;
    back.href = o.todayHref(station);
    document.title = `${station.name} · ${MONTH_DAYS} days · Slack Water`;

    const events = load.status === 'ready' ? load.events : load.status === 'error' && load.reason === 'network' ? fallback(st) : undefined;
    const text = noteFor(st);
    note.hidden = !text;
    noteText.textContent = text;
    retry.hidden = load.status !== 'error' || load.reason === 'no-data';
    table.setAttribute('aria-busy', String(load.status === 'loading'));
    table.hidden = !events;
    legend.hidden = !events;
    if (!events) return;
    table.data = {
      rows: monthRows(events, now),
      today: dayKeyAt(events, now),
      nextAt: nextTurn(events, now)?.at,
      now,
      units,
      caption: `High and low water at ${station.name}, by day, for the next ${MONTH_DAYS} days`,
    };
  }

  back.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    o.onBack();
  });
  retry.addEventListener('click', () => void fetchMonth(o.store.get().station));

  return {
    get isOpen() {
      return open;
    },
    open() {
      if (open) return;
      open = true;
      if (!header.isConnected) o.today[0]?.before(header, main);
      for (const el of o.today) el.hidden = true;
      header.hidden = false;
      main.hidden = false;
      o.skip.href = '#month';
      o.skip.textContent = 'Skip to month';
      unsubscribe = o.store.subscribe((st) => render(st));
      // Reuse a month already loaded for this station; try again after a failure.
      if (load.status !== 'ready') loadedFor = '';
      render(o.store.get());
      title.focus();
      o.announce(`${o.store.get().station.name}, high and low water for the next ${MONTH_DAYS} days.`);
    },
    close() {
      if (!open) return;
      open = false;
      unsubscribe?.();
      header.hidden = true;
      main.hidden = true;
      for (const el of o.today) el.hidden = false;
      o.skip.href = '#tides';
      o.skip.textContent = 'Skip to tides';
    },
  };
}
