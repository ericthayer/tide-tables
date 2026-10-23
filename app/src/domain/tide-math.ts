import type { CurvePoint, DayKey, TideEvent } from './types';

/** What the curve maths needs from a turn; currents reuse it with speed as `height`. */
type Timed = Pick<TideEvent, 'at' | 'offsetMin'>;
type Turn = Timed & Pick<TideEvent, 'height'>;

const MINUTE = 60_000;
/** Slack water: the window around a turn when the stream is (nearly) still. */
export const SLACK_MS = 20 * MINUTE;
const DAY = 24 * 60 * MINUTE;
const WALL = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** Parse a "YYYY-MM-DD HH:mm" wall clock as if it were UTC. */
export function parseWall(local: string): number {
  const m = WALL.exec(local);
  if (!m) throw new RangeError(`Bad wall-clock time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi);
}

/** Inverse of parseWall, date part only. */
function wallDay(wallMs: number): DayKey {
  return new Date(wallMs).toISOString().slice(0, 10);
}

/** Index of the last event at or before t, or -1. Events are sorted by `at`. */
function floorIndex(events: readonly Timed[], t: number): number {
  let lo = 0;
  let hi = events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.at <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Station UTC offset (minutes) in force at instant t: that of the last event at
 * or before t (the first event before the data starts). US DST switches at 02:00,
 * so this is exact at every local midnight; the nearest event can be on the far
 * side of a switch and put the hour around midnight on the wrong day.
 */
export function offsetAt(events: readonly Timed[], t: number): number {
  if (events.length === 0) return 0;
  return events[Math.max(floorIndex(events, t), 0)]!.offsetMin;
}

/** Station-local day containing instant t. */
export function dayKeyAt(events: readonly Timed[], t: number): DayKey {
  return wallDay(t + offsetAt(events, t) * MINUTE);
}

export function addDays(key: DayKey, n: number): DayKey {
  return wallDay(parseWall(`${key} 00:00`) + n * DAY);
}

/** Absolute instant of station-local midnight starting `key`. */
function localMidnight(events: readonly Timed[], key: DayKey): number {
  const wall = parseWall(`${key} 00:00`);
  let t = wall - (events[0]?.offsetMin ?? 0) * MINUTE;
  t = wall - offsetAt(events, t) * MINUTE;
  return wall - offsetAt(events, t) * MINUTE;
}

/** Absolute [start, end) of a station-local day. 23 or 25 h on DST changes. */
export function dayBounds(events: readonly Timed[], key: DayKey): { start: number; end: number } {
  return { start: localMidnight(events, key), end: localMidnight(events, addDays(key, 1)) };
}

export function eventsForDay<E extends Pick<TideEvent, 'local'>>(events: readonly E[], key: DayKey): E[] {
  return events.filter((e) => e.local.startsWith(key));
}

/** First turn strictly after `now`. */
export function nextTurn<E extends Timed>(events: readonly E[], now: number): E | undefined {
  const i = floorIndex(events, now);
  return events[i + 1];
}

/**
 * Predicted height at t by cosine interpolation between the surrounding turns.
 * Exact at each turn with zero slope there (slack water). Null outside the data.
 */
export function heightAt(events: readonly Turn[], t: number): number | null {
  const i = floorIndex(events, t);
  const a = events[i];
  if (!a) return null;
  if (a.at === t) return a.height;
  const b = events[i + 1];
  if (!b) return null;
  const phase = (t - a.at) / (b.at - a.at);
  return (a.height + b.height) / 2 + ((a.height - b.height) / 2) * Math.cos(Math.PI * phase);
}

/** Curve for a station-local day, sampled every `stepMin` plus every turn. */
export function dayCurve(events: readonly Turn[], key: DayKey, stepMin = 10): CurvePoint[] {
  const { start, end } = dayBounds(events, key);
  const times = new Set<number>();
  for (let t = start; t < end; t += stepMin * MINUTE) times.add(t);
  times.add(end);
  for (const e of events) if (e.at >= start && e.at <= end) times.add(e.at);
  const out: CurvePoint[] = [];
  for (const at of [...times].sort((x, y) => x - y)) {
    const height = heightAt(events, at);
    if (height !== null) out.push({ at, height });
  }
  return out;
}

/** Whole hours and minutes until a turn, rounded up to the next minute. */
export function countdown(ms: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.ceil(ms / MINUTE));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Station wall clock "HH:mm" at instant t, for times between the turns. */
export function clockAt(events: readonly TideEvent[], t: number): string {
  return new Date(t + offsetAt(events, t) * MINUTE).toISOString().slice(11, 16);
}

/** Estimated height at t and whether the tide is heading up to a high. Null outside the data. */
export function readingAt(events: readonly TideEvent[], t: number): { height: number; rising: boolean } | null {
  const height = heightAt(events, t);
  const next = nextTurn(events, t);
  return height === null || !next ? null : { height, rising: next.type === 'H' };
}
