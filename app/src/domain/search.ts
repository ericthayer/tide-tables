import type { Station } from './types';

/** Lowercase, strip accents and punctuation so "Pt. Reyes" ≈ "pt reyes". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function score(station: Station, name: string, q: string): number {
  if (station.id === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(` ${q}`)) return 2;
  if (station.state.toLowerCase() === q) return 3;
  if (q.length >= 3 && name.includes(q)) return 4;
  return -1;
}

/**
 * Rank stations against a query. Every query word must match; ties break on
 * shorter name, then alphabetically, so "reyes" puts "Point Reyes" first.
 */
export function searchStations(stations: readonly Station[], query: string, limit = 20): Station[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const hits: { station: Station; rank: number; name: string }[] = [];
  for (const station of stations) {
    const name = normalize(station.name);
    let rank = 0;
    for (const w of words) {
      const s = score(station, name, w);
      if (s < 0) {
        rank = -1;
        break;
      }
      rank += s;
    }
    if (rank >= 0) hits.push({ station, rank, name });
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return hits.slice(0, limit).map((h) => h.station);
}
