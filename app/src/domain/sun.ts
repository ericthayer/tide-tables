import type { DayKey } from './types';

/** Sunrise and sunset for one day, or the sun staying up or down all day (high latitudes). */
export type SunDay =
  | { readonly kind: 'normal'; readonly rise: number; readonly set: number }
  | { readonly kind: 'up' }
  | { readonly kind: 'down' };

const RAD = Math.PI / 180;
const J2000 = 2451545;
const UNIX_EPOCH_JD = 2440587.5;
const DAY_MS = 86_400_000;
/** Sun's centre 0.833° below the horizon: refraction plus the sun's radius. */
const HORIZON = -0.833 * RAD;
const OBLIQUITY = 23.4397 * RAD;

const sin = (deg: number): number => Math.sin(deg * RAD);

/**
 * Sunrise and sunset on a calendar day at a position, from the sunrise equation
 * (the approximation behind NOAA's solar calculator). Good to about a minute
 * below the polar circles. `lng` is degrees east (west is negative).
 */
export function sunDay(day: DayKey, lat: number, lng: number): SunDay {
  const n = Math.round((Date.parse(`${day}T12:00:00Z`) / DAY_MS) + UNIX_EPOCH_JD - J2000);
  const meanNoon = n - lng / 360;
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
  const centre = 1.9148 * sin(anomaly) + 0.02 * sin(2 * anomaly) + 0.0003 * sin(3 * anomaly);
  const longitude = (anomaly + centre + 180 + 102.9372) % 360;
  const transit = J2000 + meanNoon + 0.0053 * sin(anomaly) - 0.0069 * sin(2 * longitude);
  const decl = Math.asin(Math.sin(longitude * RAD) * Math.sin(OBLIQUITY));
  const cosHour = (Math.sin(HORIZON) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
  if (cosHour < -1) return { kind: 'up' };
  if (cosHour > 1) return { kind: 'down' };
  const half = Math.acos(cosHour) / (2 * Math.PI);
  const toMs = (jd: number): number => (jd - UNIX_EPOCH_JD) * DAY_MS;
  return { kind: 'normal', rise: toMs(transit - half), set: toMs(transit + half) };
}
