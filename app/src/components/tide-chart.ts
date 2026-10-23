import { clockTime, dayLongLabel, height, turnWord } from '../domain/format';
import { dayBounds, dayCurve, eventsForDay, heightAt } from '../domain/tide-math';
import type { DayKey, TideEvent, Units } from '../domain/types';
import { DataElement, h, s } from './dom';

export interface ChartData {
  readonly events: readonly TideEvent[];
  readonly day: DayKey;
  /** Instant for the red now marker; omitted on days other than today. */
  readonly now: number | undefined;
  /** Fixed height scale across the week so days compare honestly. */
  readonly min: number;
  readonly max: number;
  /** Draw the curve on (once per station load, per the design system). */
  readonly draw: boolean;
  /** Within slack water of a turn: the now dot breathes. */
  readonly slack: boolean;
  readonly units: Units;
}

// Plot geometry in viewBox units. The SVG keeps its aspect ratio, so circles stay round.
const W = 240;
const TOP = 12;
const BOTTOM = 80;
const AXIS_Y = 94;
const VB_H = 98;

const f = (n: number): string => n.toFixed(1);

/**
 * Tide curve for one station-local day, built on the design system's sw-curve.
 * The SVG is decorative; the figcaption summarises and <tide-list> holds every value.
 */
export class TideChart extends DataElement<ChartData> {
  protected render(d: ChartData): void {
    const { start, end } = dayBounds(d.events, d.day);
    const span = Math.max(d.max - d.min, 0.5);
    const x = (t: number): number => ((t - start) / (end - start)) * W;
    const y = (v: number): number => BOTTOM - ((v - d.min) / span) * (BOTTOM - TOP);

    const pts = dayCurve(d.events, d.day, 10);
    const turns = eventsForDay(d.events, d.day);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${f(x(p.at))},${f(y(p.height))}`).join('');
    const first = pts[0];
    const last = pts.at(-1);
    const area = first && last ? `${line}L${f(x(last.at))},${BOTTOM + 6}L${f(x(first.at))},${BOTTOM + 6}Z` : '';

    const svg = s(
      'svg',
      { viewBox: `0 0 ${W} ${VB_H}`, 'aria-hidden': 'true', focusable: 'false' },
      s('path', { class: 'sw-curve__area', d: area }),
      s('line', { class: 'sw-curve__datum', x1: 0, x2: W, y1: BOTTOM + 6, y2: BOTTOM + 6 }),
      s('path', { class: 'sw-curve__line', d: line, pathLength: 1 }),
    );

    for (const e of turns) {
      const cx = x(e.at);
      const cy = y(e.height);
      svg.append(
        s('circle', { class: 'sw-curve__extreme', cx: f(cx), cy: f(cy), r: 2.2 }),
        s('text', { class: 'sw-curve__axis curve-tag', x: f(cx), y: f(e.type === 'H' ? cy - 5 : cy + 9), 'text-anchor': 'middle' }, clockTime(e)),
      );
    }

    if (d.now !== undefined && d.now >= start && d.now < end) {
      const nh = heightAt(d.events, d.now);
      if (nh !== null) {
        const nx = f(x(d.now));
        svg.append(
          s('line', { class: 'sw-curve__now', x1: nx, x2: nx, y1: TOP - 8, y2: BOTTOM + 6 }),
          s('circle', {
            class: d.slack ? 'sw-curve__now-dot sw-curve__now-dot--slack' : 'sw-curve__now-dot',
            cx: nx,
            cy: f(y(nh)),
            r: 3.4,
          }),
        );
      }
    }

    ['00', '06', '12', '18', '24'].forEach((label, i) => {
      svg.append(
        s('text', { class: 'sw-curve__axis', x: (W / 4) * i, y: AXIS_Y, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, label),
      );
    });

    const summary = turns.length
      ? `Tide curve for ${dayLongLabel(d.day)}: ${turns.map((e) => `${turnWord(e.type).toLowerCase()} water ${height(e.height, d.units)} at ${clockTime(e)}`).join(', ')}.`
      : `No tide data for ${dayLongLabel(d.day)}.`;

    this.replaceChildren(
      h('figure', { class: d.draw ? 'sw-curve sw-curve--draw' : 'sw-curve' }, svg, h('figcaption', { class: 'sw-sr' }, summary)),
    );
  }
}
customElements.define('tide-chart', TideChart);
