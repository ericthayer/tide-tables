import { describe, expect, it } from 'vitest';
import { elongationAt, moonGlyphPath, moonLabel, moonPhase, moonSpoken } from '../../src/domain/moon';

const at = (iso: string): number => Date.parse(iso);
/** Angular distance, degrees. */
const off = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe('moon', () => {
  it('lands on published phase instants within a few hours (~2°)', () => {
    // USNO principal phases.
    expect(off(elongationAt(at('2024-01-11T11:57Z')), 0)).toBeLessThan(2);
    expect(off(elongationAt(at('2024-01-18T03:53Z')), 90)).toBeLessThan(2);
    expect(off(elongationAt(at('2024-01-25T17:54Z')), 180)).toBeLessThan(2);
    expect(off(elongationAt(at('2024-02-02T23:18Z')), 270)).toBeLessThan(2);
    expect(off(elongationAt(at('2025-11-05T13:19Z')), 180)).toBeLessThan(2);
  });

  it('names phases and illumination', () => {
    const full = moonPhase(at('2024-01-25T17:54Z'));
    expect(full.name).toBe('Full moon');
    expect(full.illumination).toBeGreaterThan(0.99);
    const cres = moonPhase(at('2026-11-04T20:00Z'));
    expect(cres.name).toBe('Waning crescent');
    expect(cres.waxing).toBe(false);
    expect(moonPhase(at('2024-01-14T12:00Z')).name).toBe('Waxing crescent');
    expect(moonPhase(at('2024-01-22T00:00Z')).name).toBe('Waxing gibbous');
  });

  it('labels spring tides after new and full moon, neap after the quarters, nothing between', () => {
    expect(moonPhase(at('2024-01-12T12:00Z')).range).toBe('spring');
    expect(moonPhase(at('2024-01-19T12:00Z')).range).toBe('neap');
    expect(moonPhase(at('2024-01-26T12:00Z')).range).toBe('spring');
    // Tide lags the moon: two days before new moon is outside the window, two after is inside.
    expect(moonPhase(at('2024-01-09T06:00Z')).range).toBeNull();
    expect(moonPhase(at('2024-01-13T12:00Z')).range).toBe('spring');
    expect(moonPhase(at('2024-01-22T12:00Z')).range).toBeNull();
  });

  it('gives one visible label and a full spoken sentence', () => {
    const neap = moonPhase(at('2026-11-03T20:00Z'));
    expect(moonLabel(neap)).toBe('Neap tides');
    expect(moonSpoken(neap)).toBe('Waning crescent moon, neap tides, smaller range than usual');
    const spring = moonPhase(at('2024-01-26T12:00Z'));
    expect(moonLabel(spring)).toBe('Spring tides');
    expect(moonSpoken(spring)).toBe('Full moon, spring tides, bigger range than usual');
    const mid = moonPhase(at('2024-01-22T12:00Z'));
    expect(moonLabel(mid)).toBe('Waxing gibbous');
    expect(moonSpoken(mid)).toBe('Waxing gibbous moon');
  });

  it('draws the lit limb on the correct side, mirrored in the south', () => {
    expect(moonGlyphPath(moonPhase(at('2024-01-11T11:57Z')))).toBe('');
    expect(moonGlyphPath(moonPhase(at('2024-01-25T17:54Z')))).toMatch(/A6,6 0 1 1/);
    const waxing = moonPhase(at('2024-01-14T12:00Z'));
    expect(moonGlyphPath(waxing)).toMatch(/^M8,2A6,6 0 0 1 8,14A[\d.]+,6 0 0 0 8,2Z$/);
    expect(moonGlyphPath(waxing, true)).toMatch(/^M8,2A6,6 0 0 0 8,14A[\d.]+,6 0 0 1 8,2Z$/);
    const gibbous = moonPhase(at('2024-01-22T00:00Z'));
    expect(moonGlyphPath(gibbous)).toMatch(/^M8,2A6,6 0 0 1 8,14A[\d.]+,6 0 0 1 8,2Z$/);
  });
});
