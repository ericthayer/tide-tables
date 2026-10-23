import { dayCurve, dayBounds, heightAt } from '../domain/tide-math';
import type { CurrentEvent, DayKey } from '../domain/types';
import { s } from '../components/dom';
import { clockTime } from '../domain/format';

// Same viewBox as <tide-chart>, so the two curves line up hour for hour.
const W = 240;
const TOP = 12;
const BOTTOM = 80;
const ZERO = (TOP + BOTTOM) / 2;
const AXIS_Y = 94;
const VB_H = 98;

const f = (n: number): string => n.toFixed(1);

/**
 * Flood above the zero line, ebb below, slack where the curve crosses it. Decorative:
 * the caller's figcaption and table carry every value.
 */
export function currentSvg(events: readonly CurrentEvent[], day: DayKey, peak: number, now: number | undefined, slackNow: boolean): SVGSVGElement {
  const { start, end } = dayBounds(events, day);
  const x = (t: number): number => ((t - start) / (end - start)) * W;
  const y = (v: number): number => ZERO - (v / peak) * (ZERO - TOP);

  const pts = dayCurve(events, day, 10);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${f(x(p.at))},${f(y(p.height))}`).join('');
  const first = pts[0];
  const last = pts.at(-1);
  const area = first && last ? `${line}L${f(x(last.at))},${ZERO}L${f(x(first.at))},${ZERO}Z` : '';

  const svg = s(
    'svg',
    { viewBox: `0 0 ${W} ${VB_H}`, 'aria-hidden': 'true', focusable: 'false' },
    s('path', { class: 'sw-curve__area', d: area }),
    s('line', { class: 'sw-curve__datum', x1: 0, x2: W, y1: ZERO, y2: ZERO }),
    s('text', { class: 'sw-curve__axis', x: 0, y: TOP - 4 }, 'FLOOD'),
    s('text', { class: 'sw-curve__axis', x: 0, y: BOTTOM + 6 }, 'EBB'),
    s('path', { class: 'sw-curve__line', d: line, pathLength: 1 }),
  );

  events.forEach((e, i) => {
    if (e.kind !== 'slack' || e.at < start || e.at >= end) return;
    const cx = f(x(e.at));
    // Tag on the side the curve leaves empty: below before a flood, above before an ebb.
    const below = events[i + 1]?.kind === 'flood';
    svg.append(
      s('circle', { class: 'sw-curve__extreme', cx, cy: ZERO, r: 2.2 }),
      s('text', { class: 'sw-curve__axis curve-tag', x: cx, y: below ? ZERO + 9 : ZERO - 5, 'text-anchor': 'middle' }, clockTime(e)),
    );
  });

  if (now !== undefined && now >= start && now < end) {
    const v = heightAt(events, now);
    if (v !== null) {
      const nx = f(x(now));
      svg.append(
        s('line', { class: 'sw-curve__now', x1: nx, x2: nx, y1: TOP - 8, y2: BOTTOM + 6 }),
        s('circle', { class: slackNow ? 'sw-curve__now-dot sw-curve__now-dot--slack' : 'sw-curve__now-dot', cx: nx, cy: f(y(v)), r: 3.4 }),
      );
    }
  }

  ['00', '06', '12', '18', '24'].forEach((label, i) => {
    svg.append(s('text', { class: 'sw-curve__axis', x: (W / 4) * i, y: AXIS_Y, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, label));
  });
  return svg;
}
