import { describe, expect, it } from 'vitest';
import { countdownText, dayLongLabel, dayShortLabel, isoLocal, metres, metresSpoken } from '../../src/domain/format';

describe('format', () => {
  it('formats heights with a true minus and one decimal', () => {
    expect(metres(1.692)).toBe('1.7 m');
    expect(metres(-0.319)).toBe('−0.3 m');
    expect(metres(-0.02)).toBe('0.0 m');
    expect(metresSpoken(-0.319)).toBe('minus 0.3 metres');
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
  it('writes countdowns for eyes and ears', () => {
    expect(countdownText(2 * 3_600_000 + 38 * 60_000)).toEqual({ short: 'in 2 h 38 m', spoken: 'in 2 hours 38 minutes' });
    expect(countdownText(60_000)).toEqual({ short: 'in 1 m', spoken: 'in 1 minute' });
    expect(countdownText(0).short).toBe('now');
  });
});
