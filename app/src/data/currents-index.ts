import type { CurrentStation } from '../domain/types';

/** Pairing row: [currentId, name, km]. Keyed by tide station id. */
type Row = [string, string, number];

let pending: Promise<ReadonlyMap<string, CurrentStation>> | undefined;

function isRow(x: unknown): x is Row {
  return Array.isArray(x) && x.length === 3 && typeof x[0] === 'string' && typeof x[1] === 'string' && typeof x[2] === 'number';
}

export function parseCurrentsIndex(body: unknown): ReadonlyMap<string, CurrentStation> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new TypeError('Currents index is not an object');
  const out = new Map<string, CurrentStation>();
  for (const [tideId, row] of Object.entries(body)) if (isRow(row)) out.set(tideId, { id: row[0], name: row[1], km: row[2] });
  return out;
}

/** Nearest current station for a tide station, if one is close enough to be useful. Loads the index once. */
export function currentStationFor(tideId: string, url = `${import.meta.env.BASE_URL}currents.json`): Promise<CurrentStation | undefined> {
  pending ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then(parseCurrentsIndex)
    .catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
  return pending.then((m) => m.get(tideId));
}

/** "0.3 nmi": boaters read current distances in nautical miles. */
export const nmi = (km: number): string => `${(km / 1.852).toFixed(1)} nmi`;

/** Station line for the section header: "San Francisco Bay Entrance · 3.2 nmi away · NOAA SFB1201". */
export const stationLine = (c: CurrentStation): string => `${c.name} · ${nmi(c.km)} away · NOAA ${c.id}`;
