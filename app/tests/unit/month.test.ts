import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MONTH_RANGE_HOURS, mergePairs, parsePredictions, predictionsUrl } from '../../src/data/noaa';
import { monthRows } from '../../src/domain/month';

const fixture = (tz: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/9415020-20261030-${tz}.json`, import.meta.url), 'utf8'));
const events = mergePairs(parsePredictions(fixture('gmt')), parsePredictions(fixture('lst_ldt')));
const NOW = Date.parse('2026-11-03T18:00:00Z');

describe('month request', () => {
  it('asks NOAA for 34 days so 30 whole station days fit in any timezone', () => {
    expect(new URL(predictionsUrl('9415020', '20261101', 'gmt', MONTH_RANGE_HOURS)).searchParams.get('range')).toBe('816');
    expect(new URL(predictionsUrl('9415020', '20261101', 'gmt')).searchParams.get('range')).toBe('264');
  });
});

describe('monthRows', () => {
  const rows = monthRows(events, NOW);
  it('starts on the station’s today', () => {
    expect(rows[0]!.day).toBe('2026-11-03');
  });
  it('lists only whole days the data reaches, in order, with their turns', () => {
    const last = events.at(-1)!.local.slice(0, 10);
    expect(rows.every((r) => r.day < last)).toBe(true);
    expect(rows.map((r) => r.day)).toEqual([...rows.map((r) => r.day)].sort());
    for (const r of rows) expect(r.events.every((e) => e.local.startsWith(r.day))).toBe(true);
  });
  it('caps at the requested number of days', () => {
    expect(monthRows(events, NOW, 2)).toHaveLength(2);
  });
  it('is empty without data', () => {
    expect(monthRows([], NOW)).toEqual([]);
  });
});
