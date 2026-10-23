import type { Station } from '../domain/types';

/** Compact index row: [id, name, state, lat, lng]. */
type Row = [string, string, string, number, number];

export const DEFAULT_STATION: Station = {
  id: '9415020',
  name: 'Point Reyes',
  state: 'CA',
  lat: 37.9942,
  lng: -122.9736,
};

let pending: Promise<Station[]> | undefined;

function isRow(x: unknown): x is Row {
  return (
    Array.isArray(x) &&
    x.length === 5 &&
    typeof x[0] === 'string' &&
    typeof x[1] === 'string' &&
    typeof x[2] === 'string' &&
    typeof x[3] === 'number' &&
    typeof x[4] === 'number'
  );
}

export function rowsToStations(rows: unknown): Station[] {
  if (!Array.isArray(rows)) throw new TypeError('Station index is not an array');
  return rows.filter(isRow).map(([id, name, state, lat, lng]) => ({ id, name, state, lat, lng }));
}

/** Load the ~3,500-station index once; retry on the next call if it failed. */
export function loadStations(url = `${import.meta.env.BASE_URL}stations.json`): Promise<Station[]> {
  pending ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then(rowsToStations)
    .catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
  return pending;
}
