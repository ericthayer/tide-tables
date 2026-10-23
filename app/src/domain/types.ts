/** High or low water. */
export type TurnType = 'H' | 'L';

/** One predicted turn of the tide. */
export interface TideEvent {
  /** Absolute instant, epoch milliseconds. */
  readonly at: number;
  /** Station wall-clock time, "YYYY-MM-DD HH:mm". */
  readonly local: string;
  /** Station UTC offset at this instant, in minutes (local − UTC). */
  readonly offsetMin: number;
  readonly type: TurnType;
  /** Height above MLLW, metres. */
  readonly height: number;
}

export interface Station {
  readonly id: string;
  readonly name: string;
  /** Two-letter state or territory code; empty when NOAA has none. */
  readonly state: string;
  readonly lat: number;
  readonly lng: number;
}

/** A point on the interpolated curve. */
export interface CurvePoint {
  readonly at: number;
  readonly height: number;
}

/** "YYYY-MM-DD" in station-local time. */
export type DayKey = string;

export type LoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly station: Station }
  | {
      readonly status: 'ready';
      readonly station: Station;
      readonly events: readonly TideEvent[];
      readonly fetchedAt: number;
      /** True when the data came from cache because the network failed. */
      readonly stale: boolean;
    }
  | { readonly status: 'error'; readonly station: Station; readonly reason: TideErrorReason };

export type TideErrorReason = 'network' | 'no-data' | 'bad-response';

/** Display unit for heights; data is always metres. */
export type Units = 'ft' | 'm';

/** A depth the user cares about at one station, e.g. "above 0.6 m" over a ramp. */
export interface Depth {
  /** Threshold above MLLW, metres. */
  readonly m: number;
  /** Above: launching, crossing a bar. Below: clamming, tide pools. */
  readonly dir: 'above' | 'below';
}
