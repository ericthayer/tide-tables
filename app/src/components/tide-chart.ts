import { clockTime, dayLongLabel, metres, turnWord } from '../domain/format';
import { dayBounds, dayCurve, eventsForDay, heightAt } from '../domain/tide-math';
import type { DayKey, TideEvent } from '../domain/types';
import { DataElement, h, s } from './dom';

export interface ChartData {
  readonly events: readonly TideEvent[];
  readonly day: DayKey;
  /** Instant for the red now marker; omitted on days other than today. */
  readonly now: number | undefined;
  /** Fixed height scale across the week so days compare honestly. */
  readonly min: number;
  readonly max: number;
}

const W = 1000;
const H = 300;
const PAD = 0.14;

/** Percent helpers keep HTML overlays aligned with the stretched SVG. */
const pct = (n: number): string => `${(n * 100).toFixed(3)}%`;

/**
 * Tide curve for one station-local day. The SVG is decorative; a figcaption
 * carries the summary and <tide-list> carries every value.
 */
export class TideChart extends DataElement<ChartData> {
  #lastKey = '';

  protected render(d: ChartData): void {
    const { start, end } = dayBounds(d.events, d.day);
    const span = Math.max(d.max - d.min, 0.5);
    const lo = d.min - span * PAD;
    const hi = d.max + span * PAD;
    const x = (t: number): number => (t - start) / (end - start);
    const y = (v: number): number => 1 - (v - lo) / (hi - lo);

    const pts = dayCurve(d.events, d.day, 10);
    const turns = eventsForDay(d.events, d.day);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${(x(p.at) * W).toFixed(1)},${(y(p.height) * H).toFixed(1)}`).join('');
    const area = pts.length ? `${line}L${(x(pts.at(-1)!.at) * W).toFixed(1)},${H}L${(x(pts[0]!.at) * W).toFixed(1)},${H}Z` : '';

    const svg = s(
      'svg',
      { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      s('defs', {}, s('pattern', { id: 'engrave', width: 8, height: 9, patternUnits: 'userSpaceOnUse' }, s('path', { d: 'M0 4.5H8', class: 'engrave-line' }))),
      s('g', { class: 'water' }, s('path', { d: area, class: 'water-fill' }), s('path', { d: area, class: 'water-engrave', fill: 'url(#engrave)' })),
      s('path', { d: line, class: 'curve', pathLength: 1 }),
    );

    const marks = turns.map((e) =>
      h(
        'span',
        { class: `turn-mark turn-${e.type}`, 'data-x': pct(x(e.at)), 'data-y': pct(y(e.height)) },
        h('span', { class: 'turn-tag num' }, clockTime(e)),
      ),
    );

    const overlay: HTMLElement[] = [...marks];
    if (d.now !== undefined && d.now >= start && d.now < end) {
      const nh = heightAt(d.events, d.now);
      if (nh !== null) {
        overlay.push(
          h('span', { class: 'now-rule', 'data-x': pct(x(d.now)) }),
          h('span', { class: 'now-level', 'data-y': pct(y(nh)) }),
          h('span', { class: 'now-dot', 'data-x': pct(x(d.now)), 'data-y': pct(y(nh)) }),
        );
      }
    }
    for (const el of overlay) {
      const px = el.dataset['x'];
      const py = el.dataset['y'];
      if (px) el.style.setProperty('--x', px);
      if (py) el.style.setProperty('--y', py);
    }

    const summary = turns.length
      ? `Tide curve for ${dayLongLabel(d.day)}: ${turns.map((e) => `${turnWord(e.type).toLowerCase()} ${metres(e.height)} at ${clockTime(e)}`).join(', ')}.`
      : `No tide data for ${dayLongLabel(d.day)}.`;

    const key = `${d.day}|${d.events.length}|${d.events[0]?.at ?? 0}`;
    const animate = key !== this.#lastKey;
    this.#lastKey = key;

    this.replaceChildren(
      h(
        'figure',
        { class: animate ? 'chart is-entering' : 'chart' },
        h('div', { class: 'chart-plot' }, svg, ...overlay),
        h('div', { class: 'chart-axis num', 'aria-hidden': 'true' }, ...['00', '06', '12', '18', '24'].map((t) => h('span', {}, t))),
        h('figcaption', { class: 'sr' }, summary),
      ),
    );
  }
}
customElements.define('tide-chart', TideChart);
