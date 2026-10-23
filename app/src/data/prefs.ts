import type { Station } from '../domain/types';

const KEY = 'slackwater:v1';
const MAX_RECENTS = 5;

interface Prefs {
  station?: Station;
  recents: Station[];
}

function isStation(x: unknown): x is Station {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s['id'] === 'string' &&
    typeof s['name'] === 'string' &&
    typeof s['state'] === 'string' &&
    typeof s['lat'] === 'number' &&
    typeof s['lng'] === 'number'
  );
}

/** Storage can be missing or throw (private mode, blocked cookies); never fail the app over it. */
export function readPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Prefs {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { recents: [] };
    const r = raw as Record<string, unknown>;
    const recents = Array.isArray(r['recents']) ? r['recents'].filter(isStation).slice(0, MAX_RECENTS) : [];
    return isStation(r['station']) ? { station: r['station'], recents } : { recents };
  } catch {
    return { recents: [] };
  }
}

export function rememberStation(
  station: Station,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage,
): Station[] {
  const recents = [station, ...readPrefs(storage).recents.filter((s) => s.id !== station.id)].slice(0, MAX_RECENTS);
  try {
    storage?.setItem(KEY, JSON.stringify({ station, recents }));
  } catch {
    /* quota or disabled storage: preference is best-effort */
  }
  return recents;
}
