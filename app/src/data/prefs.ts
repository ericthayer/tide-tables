import type { Depth, Station, Units } from '../domain/types';

/** v2 adds home port, saved stations, units and colour mode. v1 is read once and migrated. */
export const PREFS_KEY = 'slackwater:v2';
const V1_KEY = 'slackwater:v1';
const MAX_RECENTS = 5;
const MAX_SAVED = 5;
const MAX_DEPTHS = 20;

export type { Units };
export type Theme = 'system' | 'light' | 'dark';
export interface StationDepth extends Depth {
  readonly id: string;
}

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
  /**
   * Depth windows, oldest first, one per station. An array, not an object keyed by id:
   * station ids are digits, and JS orders integer-like keys numerically, not by age.
   */
  readonly depths: readonly StationDepth[];
  /** Keep the currents section open across visits. */
  readonly showCurrents: boolean;
}

type Read = Pick<Storage, 'getItem'> | undefined;
type ReadWrite = Pick<Storage, 'getItem' | 'setItem'> | undefined;

export const DEFAULT_PREFS: Prefs = { recents: [], saved: [], units: 'ft', theme: 'system', depths: [], showCurrents: false };

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

function isDepth(x: unknown): x is StationDepth {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  return typeof d['id'] === 'string' && typeof d['m'] === 'number' && Number.isFinite(d['m']) && (d['dir'] === 'above' || d['dir'] === 'below');
}

const depths = (x: unknown): StationDepth[] => (Array.isArray(x) ? x.filter(isDepth).slice(-MAX_DEPTHS) : []);

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
      depths: depths(r['depths']),
      showCurrents: r['showCurrents'] === true,
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

/** Set or clear (null) the depth window for one station. The newest MAX_DEPTHS are kept. */
export function setDepth(stationId: string, depth: Depth | null, storage: ReadWrite = globalThis.localStorage): Prefs {
  return update((p) => {
    const rest = p.depths.filter((d) => d.id !== stationId);
    return { ...p, depths: depth ? [...rest, { id: stationId, m: depth.m, dir: depth.dir }].slice(-MAX_DEPTHS) : rest };
  }, storage);
}

export function setShowCurrents(showCurrents: boolean, storage: ReadWrite = globalThis.localStorage): Prefs {
  return update((p) => ({ ...p, showCurrents }), storage);
}
