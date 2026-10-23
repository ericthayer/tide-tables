import type { DayKey, TideEvent, TurnType, Units } from './types';
import type { SunDay } from './sun';
import { countdown, offsetAt } from './tide-math';

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const deviceTime = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const utcDate = (key: DayKey): Date => new Date(`${key}T00:00:00Z`);

export const turnWord = (t: TurnType): 'High' | 'Low' => (t === 'H' ? 'High' : 'Low');

/** "12:58" from a station wall clock. */
export const clockTime = <E extends Pick<TideEvent, 'local'>>(e: E): string => e.local.slice(11, 16);

/** ISO 8601 with the station's offset, for <time datetime>. */
export function isoLocal<E extends Pick<TideEvent, 'local' | 'offsetMin'>>(e: E): string {
  const sign = e.offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(e.offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${e.local.replace(' ', 'T')}${sign}${hh}:${mm}`;
}

/** "1.7 m", "−0.3 m" (true minus sign). */
export function metres(h: number): string {
  const v = Math.abs(h) < 0.05 ? 0 : h;
  return `${v.toFixed(1).replace('-', '−')} m`;
}
export function metresSpoken(h: number): string {
  const v = Math.abs(h) < 0.05 ? 0 : h;
  return `${v < 0 ? 'minus ' : ''}${Math.abs(v).toFixed(1)} metres`;
}

const FT_PER_M = 3.28084;

/** A metres value expressed in the display unit, and back. */
export const inUnits = (m: number, units: Units): number => (units === 'm' ? m : m * FT_PER_M);
export const toMetres = (v: number, units: Units): number => (units === 'm' ? v : v / FT_PER_M);

/** Height in the chosen unit: "5.2 ft" or "1.6 m". Data stays in metres; only display converts. */
export function height(m: number, units: Units): string {
  if (units === 'm') return metres(m);
  const v = Math.abs(m * FT_PER_M) < 0.05 ? 0 : m * FT_PER_M;
  return `${v.toFixed(1).replace('-', '−')} ft`;
}
export function heightSpoken(m: number, units: Units): string {
  if (units === 'm') return metresSpoken(m);
  const v = Math.abs(m * FT_PER_M) < 0.05 ? 0 : m * FT_PER_M;
  return `${v < 0 ? 'minus ' : ''}${Math.abs(v).toFixed(1)} feet`;
}

/** "06:39" on the station's wall clock, for an instant that need not be a turn. */
export function stationClock(events: readonly TideEvent[], t: number): string {
  const wall = Math.round((t + offsetAt(events, t) * 60_000) / 60_000) * 60_000;
  return new Date(wall).toISOString().slice(11, 16);
}

/** Visual "06:39–17:12" and spoken "Sunrise 06:39, sunset 17:12" in station time. */
export function daylightText(sun: SunDay, events: readonly TideEvent[]): { short: string; spoken: string } {
  if (sun.kind === 'up') return { short: 'Sun up all day', spoken: 'The sun stays up all day' };
  if (sun.kind === 'down') return { short: 'Sun down all day', spoken: 'The sun stays down all day' };
  const rise = stationClock(events, sun.rise);
  const set = stationClock(events, sun.set);
  return { short: `${rise}–${set}`, spoken: `Sunrise ${rise}, sunset ${set}` };
}

/** "Sat 24" */
export function dayShortLabel(key: DayKey): string {
  const d = utcDate(key);
  return `${weekday.format(d)} ${d.getUTCDate()}`;
}
/** "Saturday, October 24" */
export function dayLongLabel(key: DayKey): string {
  return dayLong.format(utcDate(key));
}

/** Visual "2 h 38 m" and spoken "2 hours 38 minutes". */
export function countdownText(ms: number): { short: string; spoken: string } {
  const { hours, minutes } = countdown(ms);
  if (hours === 0 && minutes === 0) return { short: 'now', spoken: 'now' };
  const parts: string[] = [];
  const spoken: string[] = [];
  if (hours) {
    parts.push(`${hours} h`);
    spoken.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes) {
    parts.push(`${minutes} m`);
    spoken.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  return { short: `in ${parts.join(' ')}`, spoken: `in ${spoken.join(' ')}` };
}

/** Device-local "HH:mm", for "Saved tides from 14:02". */
export function deviceClock(epoch: number): string {
  return deviceTime.format(epoch);
}
