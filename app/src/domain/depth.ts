import { dayBounds, heightAt, offsetAt } from './tide-math';
import type { DayKey, Depth, TideEvent } from './types';

const MINUTE = 60_000;

/** An absolute [start, end] when the water meets the depth. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Instants within one station-local day when the water is above (or below) a depth.
 * Between two turns the curve is a half cosine, so each crossing is solved exactly
 * rather than sampled; that keeps the times identical to the curve the chart draws.
 */
export function depthSpans(events: readonly TideEvent[], day: DayKey, depth: Depth): Span[] {
  const { start, end } = dayBounds(events, day);
  const cuts = [start];
  for (let i = 0; i + 1 < events.length; i++) {
    const a = events[i]!;
    const b = events[i + 1]!;
    if (b.at <= start || a.at >= end) continue;
    if (depth.m <= Math.min(a.height, b.height) || depth.m >= Math.max(a.height, b.height)) continue;
    const phase = Math.acos((2 * depth.m - a.height - b.height) / (a.height - b.height)) / Math.PI;
    const t = a.at + phase * (b.at - a.at);
    if (t > start && t < end) cuts.push(t);
  }
  cuts.push(end);

  const out: Span[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i]!;
    const to = cuts[i + 1]!;
    const h = heightAt(events, (from + to) / 2);
    if (h === null || (depth.dir === 'above' ? h < depth.m : h > depth.m)) continue;
    const prev = out.at(-1);
    if (prev && prev.end === from) out[out.length - 1] = { start: prev.start, end: to };
    else out.push({ start: from, end: to });
  }
  return out;
}

/** Station wall clock "HH:mm" for an instant, rounded to the minute; the day's end reads 24:00. */
export function wallTime(events: readonly TideEvent[], t: number, dayEnd: number): string {
  if (t >= dayEnd) return '24:00';
  const r = Math.round(t / MINUTE) * MINUTE;
  return new Date(r + offsetAt(events, r) * MINUTE).toISOString().slice(11, 16);
}
