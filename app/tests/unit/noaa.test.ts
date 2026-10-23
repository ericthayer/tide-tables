import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchTides, mergePairs, parsePredictions, predictionsUrl, TideError, windowStart } from '../../src/data/noaa';
import { dayBounds, eventsForDay } from '../../src/domain/tide-math';

const fixture = (tz: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/9415020-20261030-${tz}.json`, import.meta.url), 'utf8'));
const gmt = parsePredictions(fixture('gmt'));
const local = parsePredictions(fixture('lst_ldt'));

function fakeFetch(map: (url: URL) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL) => Promise.resolve(map(new URL(String(input))))) as typeof fetch;
}
const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });

describe('predictionsUrl', () => {
  it('requests hi/lo predictions in metres above MLLW', () => {
    const u = new URL(predictionsUrl('9415020', '20261023', 'gmt'));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      station: '9415020',
      begin_date: '20261023',
      interval: 'hilo',
      datum: 'MLLW',
      units: 'metric',
      time_zone: 'gmt',
    });
  });
});

describe('windowStart', () => {
  it('starts two UTC days back', () => {
    expect(windowStart(Date.UTC(2026, 9, 23, 0, 30))).toBe('20261021');
  });
});

describe('mergePairs (real fixture across the 1 Nov 2026 DST change)', () => {
  const events = mergePairs(gmt, local);

  it('aligns windows that start at different instants', () => {
    expect(events.length).toBeGreaterThan(30);
    expect(events[0]!.local).toBe(local[0]!.t);
  });
  it('switches offset from PDT to PST', () => {
    expect(eventsForDay(events, '2026-10-31').every((e) => e.offsetMin === -420)).toBe(true);
    expect(eventsForDay(events, '2026-11-02').every((e) => e.offsetMin === -480)).toBe(true);
  });
  it('makes the fall-back day 25 hours long', () => {
    const { start, end } = dayBounds(events, '2026-11-01');
    expect((end - start) / 3_600_000).toBe(25);
  });
  it('keeps events sorted by instant', () => {
    for (let i = 1; i < events.length; i++) expect(events[i]!.at).toBeGreaterThan(events[i - 1]!.at);
  });
  it('rejects responses that never align', () => {
    const bogus = local.map((p) => ({ ...p, v: '9.999' }));
    expect(() => mergePairs(gmt, bogus)).toThrow(TideError);
  });
});

describe('parsePredictions', () => {
  it('maps the NOAA error payload to no-data', () => {
    expect(() => parsePredictions({ error: { message: 'No Predictions data was found.' } })).toThrow(
      expect.objectContaining({ reason: 'no-data' }),
    );
  });
  it('rejects malformed rows', () => {
    expect(() => parsePredictions({ predictions: [{ t: 1 }] })).toThrow(
      expect.objectContaining({ reason: 'bad-response' }),
    );
  });
});

describe('fetchTides', () => {
  const ok = fakeFetch((u) => json(fixture(u.searchParams.get('time_zone')!)));

  it('returns merged events', async () => {
    const r = await fetchTides('9415020', Date.UTC(2026, 10, 1), ok);
    expect(r.events.length).toBeGreaterThan(30);
    expect(r.stale).toBe(false);
  });
  it('reports saved data served by the service worker', async () => {
    const f = fakeFetch((u) =>
      json(fixture(u.searchParams.get('time_zone')!), { headers: { 'x-sw-stale': '1', 'x-sw-fetched-at': '1000' } }),
    );
    const r = await fetchTides('9415020', Date.UTC(2026, 10, 1), f);
    expect(r).toMatchObject({ stale: true, fetchedAt: 1000 });
  });
  it('maps HTTP and network failures to network errors', async () => {
    await expect(fetchTides('1', 0, fakeFetch(() => new Response('', { status: 503 })))).rejects.toMatchObject({
      reason: 'network',
    });
    const down = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    await expect(fetchTides('1', 0, down)).rejects.toMatchObject({ reason: 'network' });
  });
  it('lets aborts through untouched', async () => {
    const aborted = (() => Promise.reject(new DOMException('aborted', 'AbortError'))) as typeof fetch;
    await expect(fetchTides('1', 0, aborted)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
