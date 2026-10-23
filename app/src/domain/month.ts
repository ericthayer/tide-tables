import { addDays, dayKeyAt, eventsForDay } from './tide-math';
import type { DayKey, TideEvent } from './types';

export const MONTH_DAYS = 30;

export interface MonthRow {
  readonly day: DayKey;
  readonly events: readonly TideEvent[];
}

/**
 * Station-local days from today, each with its turns. Stops at the first day the
 * data doesn't reach, so a short (saved) response ends cleanly instead of with gaps.
 */
export function monthRows(events: readonly TideEvent[], now: number, days = MONTH_DAYS): MonthRow[] {
  if (events.length === 0) return [];
  const today = dayKeyAt(events, now);
  const last = events.at(-1)!.local.slice(0, 10);
  const rows: MonthRow[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    // The last day in the data is usually cut off part way, so only whole days count.
    if (day >= last) break;
    rows.push({ day, events: eventsForDay(events, day) });
  }
  return rows;
}
