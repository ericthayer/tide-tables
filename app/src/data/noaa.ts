import { parseWall } from '../domain/tide-math';
import type { TideErrorReason, TideEvent, TurnType } from '../domain/types';

export const NOAA_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const HOUR = 3_600_000;
/** Ten days: covers any device/station date skew plus a seven-day picker. */
const RANGE_HOURS = 240;

export type TimeBasis = 'gmt' | 'lst_ldt';

interface RawPrediction {
  readonly t: string;
  readonly v: string;
  readonly type: string;
}

export class TideError extends Error {
  constructor(readonly reason: TideErrorReason, message: string) {
    super(message);
    this.name = 'TideError';
  }
}

export interface TideResult {
  readonly events: TideEvent[];
  /** When the underlying response was fetched from NOAA (epoch ms). */
  readonly fetchedAt: number;
  /** True when the service worker served saved data because the network failed. */
  readonly stale: boolean;
}

/** begin is "YYYYMMDD". */
export function predictionsUrl(stationId: string, begin: string, basis: TimeBasis): string {
  const p = new URLSearchParams({
    product: 'predictions',
    application: 'slack_water',
    begin_date: begin,
    range: String(RANGE_HOURS),
    datum: 'MLLW',
    station: stationId,
    time_zone: basis,
    units: 'metric',
    interval: 'hilo',
    format: 'json',
  });
  return `${NOAA_API}?${p.toString()}`;
}

function isRaw(x: unknown): x is RawPrediction {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r['t'] === 'string' && typeof r['v'] === 'string' && (r['type'] === 'H' || r['type'] === 'L');
}

export function parsePredictions(body: unknown): RawPrediction[] {
  if (typeof body !== 'object' || body === null) throw new TideError('bad-response', 'Not an object');
  const b = body as Record<string, unknown>;
  if ('error' in b) throw new TideError('no-data', 'NOAA returned no predictions');
  const list = b['predictions'];
  if (!Array.isArray(list) || !list.every(isRaw)) throw new TideError('bad-response', 'Malformed predictions');
  if (list.length === 0) throw new TideError('no-data', 'Empty predictions');
  return list;
}

/**
 * Pair the same turns from a GMT and a station-local response. The two windows
 * start at different instants (begin_date is read in each time basis), so we
 * find the index shift where types and heights line up, then zip the overlap.
 */
export function mergePairs(gmt: readonly RawPrediction[], local: readonly RawPrediction[]): TideEvent[] {
  const same = (a: RawPrediction, b: RawPrediction): boolean => a.type === b.type && a.v === b.v;
  let best = { shift: 0, run: -1 };
  for (let shift = -4; shift <= 4; shift++) {
    let run = 0;
    for (let i = Math.max(0, -shift); i < gmt.length && i + shift < local.length; i++) {
      if (!same(gmt[i]!, local[i + shift]!)) {
        run = -1;
        break;
      }
      run++;
    }
    if (run > best.run) best = { shift, run };
  }
  if (best.run < 2) throw new TideError('bad-response', 'GMT and local predictions do not align');

  const out: TideEvent[] = [];
  for (let i = Math.max(0, -best.shift); i < gmt.length && i + best.shift < local.length; i++) {
    const g = gmt[i]!;
    const l = local[i + best.shift]!;
    const at = parseWall(g.t);
    const offsetMin = Math.round((parseWall(l.t) - at) / 60_000);
    if (Math.abs(offsetMin) > 14 * 60) throw new TideError('bad-response', 'Implausible UTC offset');
    out.push({ at, local: l.t, offsetMin, type: g.type as TurnType, height: Number(g.v) });
  }
  return out;
}

async function getJson(url: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ body: unknown; res: Response }> {
  let res: Response;
  try {
    res = await fetchImpl(url, signal ? { signal } : {});
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new TideError('network', 'Network request failed');
  }
  if (!res.ok) throw new TideError('network', `HTTP ${res.status}`);
  try {
    return { body: await res.json(), res };
  } catch {
    throw new TideError('bad-response', 'Invalid JSON');
  }
}

/** Start the window two days before the device's UTC date to cover any timezone. */
export function windowStart(now: number): string {
  return new Date(now - 2 * 24 * HOUR).toISOString().slice(0, 10).replaceAll('-', '');
}

export async function fetchTides(
  stationId: string,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<TideResult> {
  const begin = windowStart(now);
  const [g, l] = await Promise.all([
    getJson(predictionsUrl(stationId, begin, 'gmt'), fetchImpl, signal),
    getJson(predictionsUrl(stationId, begin, 'lst_ldt'), fetchImpl, signal),
  ]);
  const events = mergePairs(parsePredictions(g.body), parsePredictions(l.body));
  const stale = g.res.headers.get('x-sw-stale') === '1' || l.res.headers.get('x-sw-stale') === '1';
  const fetchedAt = Number(g.res.headers.get('x-sw-fetched-at')) || now;
  return { events, fetchedAt, stale };
}
