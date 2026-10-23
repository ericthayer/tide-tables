import type { StationDepth, Theme } from '../data/prefs';
import type { CurrentStation, DayKey, LoadState, Station, Units } from '../domain/types';

export interface AppState {
  readonly station: Station;
  /** Selected station-local day; null means "today at the station". */
  readonly day: DayKey | null;
  readonly load: LoadState;
  /** Clock used for "now"; ticks each minute. */
  readonly now: number;
  readonly recents: readonly Station[];
  /** Station the app opens to, when the user has chosen one. */
  readonly home: Station | undefined;
  readonly saved: readonly Station[];
  readonly units: Units;
  readonly theme: Theme;
  readonly depths: readonly StationDepth[];
  /** Nearest current station for `tideId`; station is undefined when none is close enough. */
  readonly currents: { readonly tideId: string; readonly station: CurrentStation | undefined } | undefined;
  readonly showCurrents: boolean;
}

export type Listener = (state: AppState, prev: AppState) => void;

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: Listener): () => void;
}

/** Minimal observable store: explicit updates, synchronous fan-out. */
export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state, prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9]{5,12}$/;

/** Screens other than today's. */
export type View = 'month';

/** Read ?station=&day=&view= defensively; anything malformed is ignored. */
export function readUrl(search: string): { stationId?: string; day?: DayKey; view?: View } {
  const p = new URLSearchParams(search);
  const out: { stationId?: string; day?: DayKey; view?: View } = {};
  const id = p.get('station');
  const day = p.get('day');
  if (id && ID_RE.test(id)) out.stationId = id;
  if (day && DAY_RE.test(day)) out.day = day;
  if (p.get('view') === 'month') out.view = 'month';
  return out;
}

export function writeUrl(base: string, stationId: string, day: DayKey | null, view?: View): string {
  const p = new URLSearchParams({ station: stationId });
  if (day) p.set('day', day);
  if (view) p.set('view', view);
  return `${base}?${p.toString()}`;
}
