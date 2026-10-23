import { describe, expect, it } from 'vitest';
import {
  countdownText,
  dayLongLabel,
  daylightText,
  dayShortLabel,
  height,
  heightSpoken,
  isoLocal,
  metres,
  metresSpoken,
  stationClock,
} from '../../src/domain/format';

describe('format', () => {
  it('formats heights with a true minus and one decimal', () => {
    expect(metres(1.692)).toBe('1.7 m');
    expect(metres(-0.319)).toBe('−0.3 m');
    expect(metres(-0.02)).toBe('0.0 m');
    expect(metresSpoken(-0.319)).toBe('minus 0.3 metres');
  });
  it('converts to feet for display only', () => {
    expect(height(1.593, 'ft')).toBe('5.2 ft');
    expect(height(-0.144, 'ft')).toBe('−0.5 ft');
    expect(height(0.01, 'ft')).toBe('0.0 ft');
    expect(height(1.593, 'm')).toBe('1.6 m');
    expect(heightSpoken(0.702, 'ft')).toBe('2.3 feet');
    expect(heightSpoken(-0.144, 'm')).toBe('minus 0.1 metres');
  });
  it('formats days independent of device timezone', () => {
    expect(dayShortLabel('2026-10-24')).toBe('Sat 24');
    expect(dayLongLabel('2026-10-24')).toBe('Saturday, October 24');
  });
  it('writes ISO times with the station offset', () => {
    expect(isoLocal({ at: 0, local: '2026-10-23 12:58', offsetMin: -420, type: 'L', height: 0 })).toBe(
      '2026-10-23T12:58-07:00',
    );
  });
  it('writes sunrise and sunset in station time for eyes and ears', () => {
    const pst = [{ at: Date.parse('2026-11-03T08:00:00Z'), local: '2026-11-03 00:00', offsetMin: -480, type: 'L' as const, height: 0 }];
    const sun = { kind: 'normal', rise: Date.parse('2026-11-03T14:39:40Z'), set: Date.parse('2026-11-04T01:11:20Z') } as const;
    expect(stationClock(pst, sun.rise)).toBe('06:40');
    expect(daylightText(sun, pst)).toEqual({ short: '06:40–17:11', spoken: 'Sunrise 06:40, sunset 17:11' });
    expect(daylightText({ kind: 'up' }, pst).short).toBe('Sun up all day');
    expect(daylightText({ kind: 'down' }, pst).spoken).toBe('The sun stays down all day');
  });
  it('writes countdowns for eyes and ears', () => {
    expect(countdownText(2 * 3_600_000 + 38 * 60_000)).toEqual({ short: 'in 2 h 38 m', spoken: 'in 2 hours 38 minutes' });
    expect(countdownText(60_000)).toEqual({ short: 'in 1 m', spoken: 'in 1 minute' });
    expect(countdownText(0).short).toBe('now');
  });
});
