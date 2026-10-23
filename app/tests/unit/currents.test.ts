import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currentsUrl, fetchCurrents, parseCurrents } from '../../src/currents/noaa-currents';
import { nmi, parseCurrentsIndex, stationLine } from '../../src/data/currents-index';
import { mergePairs, parsePredictions } from '../../src/data/noaa';
import { nextSlack } from '../../src/domain/currents';
import { eventsForDay, heightAt } from '../../src/domain/tide-math';

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const tides = mergePairs(parsePredictions(read('9415020-20261030-gmt')), parsePredictions(read('9415020-20261030-lst_ldt')));
const body = read('SFB1201-20261030-gmt');

describe('currentsUrl', () => {
  it('asks for slack and max events in knots, in UTC', () => {
    const u = new URL(currentsUrl('SFB1201', '20261101'));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      product: 'currents_predictions',
      station: 'SFB1201',
      begin_date: '20261101',
      interval: 'MAX_SLACK',
      units: 'english',
      time_zone: 'gmt',
    });
  });
});

describe('parseCurrents (real NOAA fixture, San Francisco Bay Entrance)', () => {
  const { events, floodDir, ebbDir } = parseCurrents(body, tides);

  it('reads every event, sorted, with flood positive and ebb negative', () => {
    expect(events.length).toBe(85);
    for (let i = 1; i < events.length; i++) expect(events[i]!.at).toBeGreaterThan(events[i - 1]!.at);
    expect(events.filter((e) => e.kind === 'flood').every((e) => e.height > 0)).toBe(true);
    expect(events.filter((e) => e.kind === 'ebb').every((e) => e.height < 0)).toBe(true);
  });
  it('treats slack as zero, whatever the rounding noise', () => {
    expect(events.filter((e) => e.kind === 'slack').every((e) => e.height === 0)).toBe(true);
  });
  it('borrows the tide station clock, across the DST change', () => {
    expect(eventsForDay(events, '2026-10-31').every((e) => e.offsetMin === -420)).toBe(true);
    expect(eventsForDay(events, '2026-11-03').every((e) => e.offsetMin === -480)).toBe(true);
    const e = eventsForDay(events, '2026-11-03')[0]!;
    expect(Date.parse(`${e.local.replace(' ', 'T')}:00Z`) - e.at).toBe(-480 * 60_000);
  });
  it('keeps the mean flood and ebb directions', () => {
    expect(floodDir).toBe(61);
    expect(ebbDir).toBe(239);
  });
  it('interpolates a curve through zero at slack', () => {
    const slack = events.find((e) => e.kind === 'slack')!;
    expect(heightAt(events, slack.at)).toBe(0);
  });
  it('maps NOAA errors and junk', () => {
    expect(() => parseCurrents({ error: { message: 'Currents predictions are not available' } }, tides)).toThrow(
      expect.objectContaining({ reason: 'no-data' }),
    );
    expect(() => parseCurrents({ current_predictions: { cp: [{ Type: 'max' }] } }, tides)).toThrow(
      expect.objectContaining({ reason: 'bad-response' }),
    );
  });
});

describe('fetchCurrents', () => {
  it('reports saved data from the service worker', async () => {
    const f = (() =>
      Promise.resolve(new Response(JSON.stringify(body), { headers: { 'x-sw-stale': '1', 'x-sw-fetched-at': '1000' } }))) as typeof fetch;
    await expect(fetchCurrents('SFB1201', tides, Date.UTC(2026, 10, 3), f)).resolves.toMatchObject({ stale: true, fetchedAt: 1000 });
  });
});

describe('nextSlack', () => {
  const { events } = parseCurrents(body, tides);
  const slack = events.find((e) => e.kind === 'slack' && e.at > Date.UTC(2026, 10, 3, 18))!;

  it('finds the next slack and what follows it', () => {
    const r = nextSlack(events, slack.at - 3_600_000)!;
    expect(r.slack).toBe(slack);
    expect(r.isNow).toBe(false);
    expect(['flood', 'ebb']).toContain(r.then?.kind);
  });
  it('holds on a slack for 20 minutes either side', () => {
    expect(nextSlack(events, slack.at - 19 * 60_000)).toMatchObject({ slack, isNow: true });
    expect(nextSlack(events, slack.at + 19 * 60_000)).toMatchObject({ slack, isNow: true });
    expect(nextSlack(events, slack.at + 21 * 60_000)?.slack).not.toBe(slack);
  });
  it('is undefined past the data', () => {
    expect(nextSlack(events, Date.UTC(2030, 0, 1))).toBeUndefined();
  });
});

describe('currents index', () => {
  it('keeps well-formed pairings only', () => {
    const m = parseCurrentsIndex({ '9414290': ['PCT0286', 'Fort Point', 0.6], bad: ['x'] });
    expect([...m.keys()]).toEqual(['9414290']);
    expect(m.get('9414290')).toEqual({ id: 'PCT0286', name: 'Fort Point', km: 0.6 });
    expect(() => parseCurrentsIndex([])).toThrow(TypeError);
  });
  it('labels distance in nautical miles', () => {
    expect(nmi(1.852)).toBe('1.0 nmi');
    expect(stationLine({ id: 'PCT0286', name: 'Fort Point', km: 0.6 })).toBe('Fort Point · 0.3 nmi away · NOAA PCT0286');
  });
});
