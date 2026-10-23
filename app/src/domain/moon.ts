/** Moon phase and the spring/neap cycle, computed locally (no network, no tables). */

export type PhaseName =
  | 'New moon'
  | 'Waxing crescent'
  | 'First quarter'
  | 'Waxing gibbous'
  | 'Full moon'
  | 'Waning gibbous'
  | 'Last quarter'
  | 'Waning crescent';

/** Spring tides near new and full moon (bigger range), neap near the quarters (smaller). */
export type TideRange = 'spring' | 'neap' | null;

export interface MoonPhase {
  /** Sun–moon elongation in degrees, 0–360: 0 new, 90 first quarter, 180 full, 270 last quarter. */
  readonly elongation: number;
  /** Illuminated fraction of the disc, 0–1. */
  readonly illumination: number;
  readonly waxing: boolean;
  readonly name: PhaseName;
  readonly range: TideRange;
}

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
/** The elongation advances ~12.19° a day (360° per 29.53-day synodic month). */
const DEG_PER_DAY = 360 / 29.530589;
/** Spring and neap tides: within two days either side of the phase that drives them. */
const RANGE_WINDOW = 2 * DEG_PER_DAY;
/**
 * Age of the tide: the biggest and smallest ranges trail the moon by about a day on most
 * US coasts, so the spring/neap window is centred one day after the phase.
 */
const TIDE_LAG = DEG_PER_DAY;
/** A principal phase (new, quarter, full) names the day either side of the exact instant. */
const PRINCIPAL_WINDOW = DEG_PER_DAY;

const norm = (deg: number): number => ((deg % 360) + 360) % 360;
/** Smallest distance between two angles, degrees. */
const gap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Elongation from Meeus, Astronomical Algorithms ch. 47–48 (mean elements plus the six
 * largest periodic terms): within a few hours of the true phase, plenty for day labels.
 */
export function elongationAt(t: number): number {
  const T = (t / DAY_MS + 2440587.5 - 2451545) / 36525;
  const D = norm(297.8501921 + 445267.1114034 * T) * RAD; // mean elongation
  const M = norm(357.5291092 + 35999.0502909 * T) * RAD; // sun's mean anomaly
  const Mp = norm(134.9633964 + 477198.8675055 * T) * RAD; // moon's mean anomaly
  const i =
    180 -
    D / RAD -
    6.289 * Math.sin(Mp) +
    2.1 * Math.sin(M) -
    1.274 * Math.sin(2 * D - Mp) -
    0.658 * Math.sin(2 * D) -
    0.214 * Math.sin(2 * Mp) -
    0.11 * Math.sin(D);
  return norm(180 - i);
}

function phaseName(e: number): PhaseName {
  if (gap(e, 0) <= PRINCIPAL_WINDOW) return 'New moon';
  if (gap(e, 90) <= PRINCIPAL_WINDOW) return 'First quarter';
  if (gap(e, 180) <= PRINCIPAL_WINDOW) return 'Full moon';
  if (gap(e, 270) <= PRINCIPAL_WINDOW) return 'Last quarter';
  if (e < 90) return 'Waxing crescent';
  if (e < 180) return 'Waxing gibbous';
  if (e < 270) return 'Waning gibbous';
  return 'Waning crescent';
}

export function moonPhase(t: number): MoonPhase {
  const e = elongationAt(t);
  const lagged = e - TIDE_LAG;
  const syzygy = Math.min(gap(lagged, 0), gap(lagged, 180));
  const quadrature = Math.min(gap(lagged, 90), gap(lagged, 270));
  return {
    elongation: e,
    illumination: (1 - Math.cos(e * RAD)) / 2,
    waxing: e < 180,
    name: phaseName(e),
    range: syzygy <= RANGE_WINDOW ? 'spring' : quadrature <= RANGE_WINDOW ? 'neap' : null,
  };
}

/** The one visible label: the tide range when it is spring or neap, otherwise the phase. */
export function moonLabel(p: MoonPhase): string {
  return p.range === 'spring' ? 'Spring tides' : p.range === 'neap' ? 'Neap tides' : p.name;
}

/** Screen reader sentence: "Waning crescent moon, neap tides, smaller range than usual." */
export function moonSpoken(p: MoonPhase): string {
  const phase = p.name.endsWith('moon') ? p.name : `${p.name} moon`;
  if (p.range === 'spring') return `${phase}, spring tides, bigger range than usual`;
  if (p.range === 'neap') return `${phase}, neap tides, smaller range than usual`;
  return phase;
}

/**
 * Path for the lit part of a 16×16 moon glyph (disc r 6 at 8,8). The lit limb faces east
 * while waxing as seen from the northern hemisphere; `south` mirrors it.
 */
export function moonGlyphPath(p: MoonPhase, south = false): string {
  if (p.illumination < 0.02) return '';
  if (p.illumination > 0.98) return 'M8,2A6,6 0 1 1 8,14A6,6 0 1 1 8,2Z';
  const right = p.waxing !== south;
  const rx = Math.abs(Math.cos(p.elongation * RAD)) * 6;
  const gibbous = p.illumination > 0.5;
  const limb = right ? 1 : 0;
  const terminator = gibbous === right ? 1 : 0;
  return `M8,2A6,6 0 0 ${limb} 8,14A${rx.toFixed(2)},6 0 0 ${terminator} 8,2Z`;
}
