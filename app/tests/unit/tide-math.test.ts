import { describe, expect, it } from 'vitest';
import type { TideEvent } from '../../src/domain/types';
import {
  addDays,
  countdown,
  dayBounds,
  dayCurve,
  dayKeyAt,
  eventsForDay,
  heightAt,
  nextTurn,
  parseWall,
} from '../../src/domain/tide-math';

/** Build an event from a wall-clock string and a fixed offset (minutes). */
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

describe('parseWall', () => {
  it('reads "YYYY-MM-DD HH:mm" as a UTC wall clock', () => {
    expect(parseWall('2026-10-23 03:06')).toBe(Date.UTC(2026, 9, 23, 3, 6));
  });
  it('rejects malformed input', () => {
    expect(() => parseWall('23/10/2026')).toThrow();
  });
});

describe('heightAt', () => {
  it('is exact at every turn', () => {
    for (const e of week) expect(heightAt(week, e.at)).toBeCloseTo(e.height, 6);
  });
  it('is the mean half way between turns', () => {
    const a = week[1]!;
    const b = week[2]!;
    expect(heightAt(week, (a.at + b.at) / 2)).toBeCloseTo((a.height + b.height) / 2, 6);
  });
  it('rises monotonically on a flood', () => {
    const a = week[1]!;
    const b = week[2]!;
    let prev = -Infinity;
    for (let t = a.at; t <= b.at; t += 10 * 60_000) {
      const h = heightAt(week, t)!;
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });
  it('returns null outside the data range', () => {
    expect(heightAt(week, week[0]!.at - 1)).toBeNull();
    expect(heightAt(week, week.at(-1)!.at + 1)).toBeNull();
    expect(heightAt([], Date.now())).toBeNull();
  });
});

describe('nextTurn', () => {
  it('returns the first turn strictly after now', () => {
    const now = parseWall('2026-10-23 10:00') + 420 * 60_000;
    expect(nextTurn(week, now)?.local).toBe('2026-10-23 15:50');
  });
  it('skips a turn happening exactly now', () => {
    expect(nextTurn(week, week[2]!.at)?.local).toBe('2026-10-23 15:50');
  });
  it('returns undefined past the last turn', () => {
    expect(nextTurn(week, week.at(-1)!.at)).toBeUndefined();
  });
});

describe('days', () => {
  it('derives the station-local day of an instant', () => {
    // 2026-10-23 06:30 UTC is 23:30 on the 22nd in PDT.
    expect(dayKeyAt(week, Date.UTC(2026, 9, 23, 6, 30))).toBe('2026-10-22');
    expect(dayKeyAt(week, Date.UTC(2026, 9, 23, 7, 30))).toBe('2026-10-23');
  });
  it('lists only that day\'s turns', () => {
    expect(eventsForDay(week, '2026-10-23').map((e) => e.local)).toEqual([
      '2026-10-23 03:06',
      '2026-10-23 09:27',
      '2026-10-23 15:50',
      '2026-10-23 21:53',
    ]);
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('bounds a normal day at 24 h', () => {
    const { start, end } = dayBounds(week, '2026-10-23');
    expect(start).toBe(Date.UTC(2026, 9, 23, 7, 0));
    expect(end - start).toBe(24 * 3_600_000);
  });
  it('bounds a DST fall-back day at 25 h', () => {
    // US DST ends 1 Nov 2026 at 02:00 PDT → 01:00 PST.
    const dst: TideEvent[] = [
      ev('2026-10-31 22:00', 'H', 1.6, -420),
      ev('2026-11-01 04:10', 'L', 0.4, -480),
      ev('2026-11-01 10:20', 'H', 1.7, -480),
      ev('2026-11-01 16:30', 'L', 0.2, -480),
      ev('2026-11-01 22:40', 'H', 1.5, -480),
      ev('2026-11-02 04:50', 'L', 0.5, -480),
    ];
    const { start, end } = dayBounds(dst, '2026-11-01');
    expect(start).toBe(Date.UTC(2026, 10, 1, 7, 0));
    expect(end).toBe(Date.UTC(2026, 10, 2, 8, 0));
  });
});

describe('days around a DST switch', () => {
  // Fall back on 1 Nov 2026 at 02:00 PDT. The PST event is nearer to 00:30 PDT than the PDT one.
  const fallBack: TideEvent[] = [ev('2026-10-31 20:00', 'H', 1.5, -420), ev('2026-11-01 03:00', 'L', 0.2, -480)];
  it('uses the offset in force, not the nearest event, for the station-local day', () => {
    expect(dayKeyAt(fallBack, Date.UTC(2026, 10, 1, 7, 30))).toBe('2026-11-01'); // 00:30 PDT
    expect(dayKeyAt(fallBack, Date.UTC(2026, 10, 1, 6, 30))).toBe('2026-10-31'); // 23:30 PDT
  });
  it('puts station-local midnight at 00:00 PDT on the fall-back day', () => {
    expect(dayBounds(fallBack, '2026-11-01').start).toBe(Date.UTC(2026, 10, 1, 7, 0));
  });
});

describe('dayCurve', () => {
  it('samples the whole day and passes through each turn', () => {
    const pts = dayCurve(week, '2026-10-23', 15);
    const { start, end } = dayBounds(week, '2026-10-23');
    expect(pts[0]!.at).toBe(start);
    expect(pts.at(-1)!.at).toBe(end);
    for (const e of eventsForDay(week, '2026-10-23')) {
      expect(pts.some((p) => p.at === e.at && Math.abs(p.height - e.height) < 1e-9)).toBe(true);
    }
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.at).toBeGreaterThan(pts[i - 1]!.at);
  });
  it('omits points with no surrounding data', () => {
    expect(dayCurve(week.slice(1, 3), '2026-10-23', 15).every((p) => Number.isFinite(p.height))).toBe(true);
  });
});

describe('countdown', () => {
  it('splits into hours and minutes, rounding up', () => {
    expect(countdown(2 * 3_600_000 + 37 * 60_000 + 5_000)).toEqual({ hours: 2, minutes: 38 });
  });
  it('never goes negative', () => {
    expect(countdown(-5_000)).toEqual({ hours: 0, minutes: 0 });
  });
});
