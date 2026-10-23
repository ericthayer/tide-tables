import { getJson, NOAA_API, TideError, windowStart } from '../data/noaa';
import { offsetAt, parseWall } from '../domain/tide-math';
import type { CurrentEvent, CurrentKind, TideEvent } from '../domain/types';

/** Same 11-day window as the tides, so every day in the picker has currents too. */
const RANGE_HOURS = 264;
const MINUTE = 60_000;

interface RawCurrent {
  readonly Type: CurrentKind;
  readonly Time: string;
  readonly Velocity_Major: number;
  readonly meanFloodDir?: unknown;
  readonly meanEbbDir?: unknown;
}

export interface CurrentResult {
  readonly events: CurrentEvent[];
  /** Mean flood and ebb directions, degrees true, when NOAA publishes them. */
  readonly floodDir: number | undefined;
  readonly ebbDir: number | undefined;
  readonly fetchedAt: number;
  readonly stale: boolean;
}

/** Slack, max-flood and max-ebb events in knots. begin is "YYYYMMDD". */
export function currentsUrl(stationId: string, begin: string): string {
  const p = new URLSearchParams({
    product: 'currents_predictions',
    application: 'slack_water',
    begin_date: begin,
    range: String(RANGE_HOURS),
    station: stationId,
    time_zone: 'gmt',
    units: 'english',
    interval: 'MAX_SLACK',
    format: 'json',
  });
  return `${NOAA_API}?${p.toString()}`;
}

function isRaw(x: unknown): x is RawCurrent {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    (r['Type'] === 'slack' || r['Type'] === 'flood' || r['Type'] === 'ebb') &&
    typeof r['Time'] === 'string' &&
    typeof r['Velocity_Major'] === 'number' &&
    Number.isFinite(r['Velocity_Major'])
  );
}

const degrees = (x: unknown): number | undefined => (typeof x === 'number' && x >= 0 && x <= 360 ? x : undefined);
const wall = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Turn NOAA's GMT rows into events. A paired current station is never more than 10 km
 * from its tide station, so it shares that station's clock: borrowing the tide offsets
 * saves a second (station-local) request.
 */
export function parseCurrents(body: unknown, tides: readonly TideEvent[]): Omit<CurrentResult, 'fetchedAt' | 'stale'> {
  if (typeof body !== 'object' || body === null) throw new TideError('bad-response', 'Not an object');
  const b = body as Record<string, unknown>;
  if ('error' in b) throw new TideError('no-data', 'NOAA returned no current predictions');
  const cp = (b['current_predictions'] as Record<string, unknown> | undefined)?.['cp'];
  if (!Array.isArray(cp) || !cp.every(isRaw)) throw new TideError('bad-response', 'Malformed current predictions');
  if (cp.length === 0) throw new TideError('no-data', 'Empty current predictions');
  const events = cp
    .map((r): CurrentEvent => {
      const at = parseWall(r.Time);
      const offsetMin = offsetAt(tides, at);
      // NOAA's slack rows carry ±0.01 kn of rounding noise; slack is zero.
      const height = r.Type === 'slack' ? 0 : r.Velocity_Major;
      return { at, local: wall(at + offsetMin * MINUTE), offsetMin, kind: r.Type, height };
    })
    .sort((x, y) => x.at - y.at);
  return { events, floodDir: degrees(cp[0]!.meanFloodDir), ebbDir: degrees(cp[0]!.meanEbbDir) };
}

export async function fetchCurrents(
  stationId: string,
  tides: readonly TideEvent[],
  now = Date.now(),
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CurrentResult> {
  const { body, res } = await getJson(currentsUrl(stationId, windowStart(now)), fetchImpl, signal);
  return {
    ...parseCurrents(body, tides),
    stale: res.headers.get('x-sw-stale') === '1',
    fetchedAt: Number(res.headers.get('x-sw-fetched-at')) || now,
  };
}
