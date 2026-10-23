import { describe, expect, it } from 'vitest';
import { depthSpans, wallTime } from '../../src/domain/depth';
import { dayBounds, heightAt, parseWall } from '../../src/domain/tide-math';
import type { TideEvent } from '../../src/domain/types';

function ev(local: string, type: 'H' | 'L', height: number, offsetMin = -420): TideEvent {
  return { at: parseWall(local) - offsetMin * 60_000, local, offsetMin, type, height };
}

// Point Reyes, 23 Oct 2026 (PDT, UTC−7).
const week: TideEvent[] = [
  ev('2026-10-22 21:10', 'H', 1.5),
  ev('2026-10-23 03:06', 'L', 0.342),
  ev('2026-10-23 09:27', 'H', 1.692),
  ev('2026-10-23 15:50', 'L', 0.303),
  ev('2026-10-23 21:53', 'H', 1.474),
  ev('2026-10-24 03:38', 'L', 0.427),
];
const DAY = '2026-10-23';
const { end } = dayBounds(week, DAY);
const times = (spans: { start: number; end: number }[]): string[] => spans.map((s) => `${wallTime(week, s.start, end)}–${wallTime(week, s.end, end)}`);

describe('depthSpans', () => {
  it('finds when the water is above a depth, crossing exactly on the curve', () => {
    const spans = depthSpans(week, DAY, { m: 1, dir: 'above' });
    expect(times(spans)).toEqual(['06:13–12:38', '19:14–24:00']);
    for (const s of spans.slice(0, 1)) {
      expect(heightAt(week, s.start)).toBeCloseTo(1, 6);
      expect(heightAt(week, s.end)).toBeCloseTo(1, 6);
    }
  });
  it('finds when it is below, the complement of above', () => {
    expect(times(depthSpans(week, DAY, { m: 1, dir: 'below' }))).toEqual(['00:00–06:13', '12:38–19:14']);
  });
  it('is all day or never when the depth is outside the day’s range', () => {
    expect(times(depthSpans(week, DAY, { m: 0.1, dir: 'above' }))).toEqual(['00:00–24:00']);
    expect(depthSpans(week, DAY, { m: 2, dir: 'above' })).toEqual([]);
    expect(depthSpans(week, DAY, { m: 0.1, dir: 'below' })).toEqual([]);
  });
  it('treats a depth equal to a turn as touching, not a window', () => {
    expect(times(depthSpans(week, DAY, { m: 1.692, dir: 'above' }))).toEqual([]);
  });
});
