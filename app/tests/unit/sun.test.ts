import { describe, expect, it } from 'vitest';
import { sunDay } from '../../src/domain/sun';

const MIN = 60_000;
const utc = (iso: string): number => Date.parse(iso);

function times(day: string, lat: number, lng: number): { rise: number; set: number } {
  const s = sunDay(day, lat, lng);
  if (s.kind !== 'normal') throw new Error(`expected rise and set, got ${s.kind}`);
  return s;
}

describe('sunDay', () => {
  // Reference times from the astral library (NOAA solar equations), rounded to the minute.
  it('matches the reference for Point Reyes on 3 Nov 2026 (PST)', () => {
    const { rise, set } = times('2026-11-03', 37.9942, -122.9736);
    expect(Math.abs(rise - utc('2026-11-03T14:40:00Z'))).toBeLessThanOrEqual(2 * MIN);
    expect(Math.abs(set - utc('2026-11-04T01:11:00Z'))).toBeLessThanOrEqual(2 * MIN);
  });

  it('matches the reference for London at the June solstice', () => {
    const { rise, set } = times('2024-06-21', 51.5074, -0.1278);
    expect(Math.abs(rise - utc('2024-06-21T03:43:00Z'))).toBeLessThanOrEqual(2 * MIN);
    expect(Math.abs(set - utc('2024-06-21T20:21:00Z'))).toBeLessThanOrEqual(2 * MIN);
  });

  it('puts both times on the local day east of Greenwich (Guam, UTC+10)', () => {
    const { rise, set } = times('2026-11-03', 13.4443, 144.6567);
    expect(rise).toBeGreaterThan(utc('2026-11-02T14:00:00Z')); // local midnight
    expect(set).toBeLessThan(utc('2026-11-03T14:00:00Z'));
    expect(rise).toBeLessThan(set);
  });

  it('reports the sun up or down all day north of the Arctic Circle', () => {
    expect(sunDay('2026-06-21', 71.29, -156.79).kind).toBe('up');
    expect(sunDay('2026-12-21', 71.29, -156.79).kind).toBe('down');
  });
});
