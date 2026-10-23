import type { DayKey, TideEvent, TurnType } from './types';
import { countdown } from './tide-math';

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const deviceTime = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const utcDate = (key: DayKey): Date => new Date(`${key}T00:00:00Z`);

export const turnWord = (t: TurnType): 'High' | 'Low' => (t === 'H' ? 'High' : 'Low');

/** "12:58" from a station wall clock. */
export const clockTime = (e: TideEvent): string => e.local.slice(11, 16);

/** ISO 8601 with the station's offset, for <time datetime>. */
export function isoLocal(e: TideEvent): string {
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
