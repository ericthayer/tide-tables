import type { Station } from './types';

const R_KM = 6371;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestStation(
  stations: readonly Station[],
  lat: number,
  lng: number,
): { station: Station; km: number } | undefined {
  let best: { station: Station; km: number } | undefined;
  for (const station of stations) {
    const km = distanceKm(lat, lng, station.lat, station.lng);
    if (!best || km < best.km) best = { station, km };
  }
  return best;
}
