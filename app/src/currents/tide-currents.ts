import iconsUrl from '../../../design/icons.svg?url';
import { DataElement, h, s, sr } from '../components/dom';
import { TideError } from '../data/noaa';
import { clockTime, countdownText, dayLongLabel, deviceClock, isoLocal } from '../domain/format';
import { nextSlack } from '../domain/currents';
import { eventsForDay } from '../domain/tide-math';
import type { CurrentEvent, CurrentKind, CurrentStation, DayKey, TideErrorReason, TideEvent } from '../domain/types';
import { currentSvg } from './current-chart';
import { fetchCurrents, type CurrentResult } from './noaa-currents';

export interface CurrentsInput {
  readonly station: CurrentStation;
  /** The paired tide station's turns: their clock (UTC offsets) is the current station's too. */
  readonly tides: readonly TideEvent[];
  readonly day: DayKey;
  readonly today: DayKey;
  readonly now: number;
}

type Load =
  | { readonly id: string; readonly status: 'loading' }
  | { readonly id: string; readonly status: 'ready'; readonly result: CurrentResult }
  | { readonly id: string; readonly status: 'error'; readonly reason: TideErrorReason };

const KIND_WORD: Record<CurrentKind, string> = { slack: 'Slack', flood: 'Max flood', ebb: 'Max ebb' };
const knots = (v: number): string => `${Math.abs(v).toFixed(1)} kn`;
const knotsSpoken = (v: number): string => `${Math.abs(v).toFixed(1)} knots`;
const bearing = (d: number): string => `${String(Math.round(d) % 360).padStart(3, '0')}°`;

function kindIcon(kind: CurrentKind): SVGSVGElement {
  const attrs = { class: 'sw-icon', 'aria-hidden': 'true', focusable: 'false' };
  if (kind === 'slack') return s('svg', { ...attrs, viewBox: '0 0 16 16' }, s('circle', { cx: 8, cy: 8, r: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }));
  return s('svg', attrs, s('use', { href: `${iconsUrl}#${kind === 'flood' ? 'i-rising' : 'i-falling'}` }));
}

/**
 * Currents at the nearest NOAA current station: next slack, a flood/ebb curve and the
 * day's slack and max events. Loaded on demand; fetches its own data.
 */
export class TideCurrents extends DataElement<CurrentsInput> {
  #load: Load | undefined;
  #ctrl: AbortController | undefined;

  disconnectedCallback(): void {
    this.#ctrl?.abort();
  }

  #fetch(d: CurrentsInput): void {
    this.#ctrl?.abort();
    const ctrl = new AbortController();
    this.#ctrl = ctrl;
    const id = d.station.id;
    this.#load = { id, status: 'loading' };
    fetchCurrents(id, d.tides, Date.now(), fetch, ctrl.signal)
      .then((result) => (this.#load = { id, status: 'ready', result }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        this.#load = { id, status: 'error', reason: err instanceof TideError ? err.reason : 'bad-response' };
      })
      .finally(() => {
        if (!ctrl.signal.aborted && this.data) this.data = this.data;
      });
  }

  protected render(d: CurrentsInput): void {
    if (this.#load?.id !== d.station.id) this.#fetch(d);
    const ld = this.#load!;
    this.setAttribute('aria-busy', String(ld.status === 'loading'));
    if (ld.status === 'loading') {
      this.replaceChildren(h('p', { class: 'body-sm empty' }, 'Loading currents…'));
      return;
    }
    if (ld.status === 'error') {
      const retry = h('button', { type: 'button', class: 'sw-button sw-button--outline' }, 'Try again');
      retry.addEventListener('click', () => {
        this.#load = undefined;
        this.data = d;
      });
      const copy = ld.reason === 'no-data' ? 'aren’t published by NOAA right now.' : 'aren’t available right now. Check your connection and try again.';
      this.replaceChildren(h('div', { class: 'note' }, h('p', { class: 'body-sm' }, `Currents for ${d.station.name} ${copy}`), ld.reason === 'no-data' ? null : retry));
      return;
    }

    const { events, floodDir, ebbDir, stale, fetchedAt } = ld.result;
    const isToday = d.day === d.today;
    const next = nextSlack(events, d.now);
    const peak = Math.max(0.5, ...events.map((e) => Math.abs(e.height)));
    const dayEvents = eventsForDay(events, d.day);

    const dirs = floodDir !== undefined && ebbDir !== undefined ? `Flood sets ${bearing(floodDir)}, ebb ${bearing(ebbDir)} true` : '';
    const meta = h('p', { class: 'caption currents-dir' }, [dirs, stale ? `Saved ${deviceClock(fetchedAt)}` : ''].filter(Boolean).join(' · '));

    const summary = dayEvents.length
      ? `Current for ${dayLongLabel(d.day)}: ${dayEvents.map((e) => (e.kind === 'slack' ? `slack at ${clockTime(e)}` : `${KIND_WORD[e.kind].toLowerCase()} ${knotsSpoken(e.height)} at ${clockTime(e)}`)).join(', ')}.`
      : `No current predictions for ${dayLongLabel(d.day)}.`;
    const figure = h(
      'figure',
      { class: 'sw-curve currents-chart' },
      currentSvg(events, d.day, peak, isToday ? d.now : undefined, next?.isNow ?? false),
      h('figcaption', { class: 'sw-sr' }, summary),
    );

    this.replaceChildren(this.#readout(next, d.now), meta, figure, this.#table(dayEvents, next?.slack.at, d));
  }

  #readout(next: ReturnType<typeof nextSlack>, now: number): HTMLElement {
    const label = h('p', { class: 'sw-readout__label label' }, 'Next slack current');
    if (!next) return h('div', { class: 'sw-readout' }, label, h('p', { class: 'sw-readout__time readout' }, '--:--'), h('p', { class: 'sw-readout__detail data' }, 'No upcoming slack in saved data.'));
    const { slack, then, isNow } = next;
    const cd = isNow ? { short: 'now', spoken: 'now' } : countdownText(slack.at - now);
    const thenText = then && then.kind !== 'slack' ? `Then ${then.kind} ${knots(then.height)}` : 'Slack';
    const thenSpoken = then && then.kind !== 'slack' ? `, then ${then.kind} up to ${knotsSpoken(then.height)}` : '';
    return h(
      'div',
      { class: 'sw-readout' },
      label,
      h('p', { class: 'sw-readout__time readout' }, h('time', { datetime: isoLocal(slack) }, clockTime(slack))),
      h(
        'p',
        { class: 'sw-readout__detail data' },
        h('span', { 'aria-hidden': 'true' }, `${thenText} · `, h('span', { class: 'sw-readout__eta' }, cd.short)),
        sr(`Slack current at ${clockTime(slack)}${thenSpoken}, ${cd.spoken}.`),
      ),
    );
  }

  #table(events: readonly CurrentEvent[], nextAt: number | undefined, d: CurrentsInput): HTMLElement {
    if (events.length === 0) return h('p', { class: 'body empty' }, 'No current predictions in the saved data for this day.');
    const rows = events.map((e) => {
      const next = e.at === nextAt;
      return h(
        'tr',
        { class: next ? 'is-next' : e.at < d.now ? 'is-past' : undefined },
        h('th', { scope: 'row' }, h('span', { class: 'turn-type' }, kindIcon(e.kind), KIND_WORD[e.kind]), next ? sr(' (next slack)') : null),
        h('td', {}, h('time', { datetime: isoLocal(e) }, clockTime(e))),
        h('td', {}, e.kind === 'slack' ? sr('no current') : h('span', { 'aria-hidden': 'true' }, knots(e.height)), e.kind === 'slack' ? null : sr(knotsSpoken(e.height))),
      );
    });
    const caption = d.day === d.today ? `Currents today, ${dayLongLabel(d.day)}` : `Currents, ${dayLongLabel(d.day)}`;
    return h(
      'table',
      { class: 'sw-table' },
      h('caption', { class: 'label table-caption' }, caption),
      h('thead', { class: 'sw-sr' }, h('tr', {}, h('th', { scope: 'col' }, 'Current'), h('th', { scope: 'col' }, 'Time'), h('th', { scope: 'col' }, 'Speed'))),
      h('tbody', {}, ...rows),
    );
  }
}
customElements.define('tide-currents', TideCurrents);

