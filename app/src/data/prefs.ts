import type { Station, Units } from '../domain/types';

/** v2 adds home port, saved stations, units and colour mode. v1 is read once and migrated. */
export const PREFS_KEY = 'slackwater:v2';
const V1_KEY = 'slackwater:v1';
const MAX_RECENTS = 5;
const MAX_SAVED = 5;

export type { Units };
export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  /** Last station opened. */
  readonly station?: Station;
  readonly recents: readonly Station[];
  /** Station the app opens to; always saved[0] when set. */
  readonly home?: Station;
  /** Stations that have been home port, newest first. */
  readonly saved: readonly Station[];
  readonly units: Units;
  readonly theme: Theme;
}

type Read = Pick<Storage, 'getItem'> | undefined;
type ReadWrite = Pick<Storage, 'getItem' | 'setItem'> | undefined;

export const DEFAULT_PREFS: Prefs = { recents: [], saved: [], units: 'ft', theme: 'system' };

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

const stations = (x: unknown, max: number): Station[] => (Array.isArray(x) ? x.filter(isStation).slice(0, max) : []);

function parse(raw: string | null): Record<string, unknown> | undefined {
  const v: unknown = JSON.parse(raw ?? 'null');
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
}

/** Storage can be missing or throw (private mode, blocked cookies); never fail the app over it. */
export function readPrefs(storage: Read = globalThis.localStorage): Prefs {
  try {
    const r = parse(storage?.getItem(PREFS_KEY) ?? null) ?? parse(storage?.getItem(V1_KEY) ?? null);
    if (!r) return DEFAULT_PREFS;
    const saved = stations(r['saved'], MAX_SAVED);
    const home = isStation(r['home']) ? r['home'] : undefined;
    return {
      ...(isStation(r['station']) ? { station: r['station'] } : {}),
      recents: stations(r['recents'], MAX_RECENTS),
      ...(home ? { home } : {}),
      saved: home && saved[0]?.id !== home.id ? [home, ...saved.filter((s) => s.id !== home.id)].slice(0, MAX_SAVED) : saved,
      units: r['units'] === 'm' ? 'm' : 'ft',
      theme: r['theme'] === 'light' || r['theme'] === 'dark' ? r['theme'] : 'system',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function update(patch: (p: Prefs) => Prefs, storage: ReadWrite): Prefs {
  const next = patch(readPrefs(storage));
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* quota or disabled storage: preference is best-effort */
  }
  return next;
}

export function rememberStation(station: Station, storage: ReadWrite = globalThis.localStorage): readonly Station[] {
  return update(
    (p) => ({ ...p, station, recents: [station, ...p.recents.filter((s) => s.id !== station.id)].slice(0, MAX_RECENTS) }),
    storage,
  ).recents;
}

/** Make a station home port (it moves to the top of saved), or clear home port with null. */
export function setHome(station: Station | null, storage: ReadWrite = globalThis.localStorage): Prefs {
  return update((p) => {
    if (!station) {
      const { home: _home, ...rest } = p;
      return rest;
    }
    return { ...p, home: station, saved: [station, ...p.saved.filter((s) => s.id !== station.id)].slice(0, MAX_SAVED) };
  }, storage);
}

export function setUnits(units: Units, storage: ReadWrite = globalThis.localStorage): Prefs {
  return update((p) => ({ ...p, units }), storage);
}

export function setTheme(theme: Theme, storage: ReadWrite = globalThis.localStorage): Prefs {
  return update((p) => ({ ...p, theme }), storage);
}
