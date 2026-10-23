import { height, turnWord } from './format';
import type { Station, TideEvent, Units } from './types';

export interface IcsInput {
  readonly station: Station;
  /** The week's turns, already filtered to the days shown. */
  readonly events: readonly TideEvent[];
  readonly units: Units;
  /** Clock for DTSTAMP. */
  readonly now: number;
  /** Absolute app link for the station, added to each event. */
  readonly url: string;
}

const CRLF = '\r\n';
const encoder = new TextEncoder();

/** RFC 5545 §3.3.5 UTC form: 20261103T182800Z. */
export function icsUtc(epoch: number): string {
  return new Date(epoch).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function icsText(text: string): string {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: fold lines longer than 75 octets, never splitting a UTF-8 character. */
export function icsFold(line: string): string {
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    // Continuation lines start with a space, which counts toward their 75.
    if (bytes + n > 75) {
      parts.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(CRLF);
}

const place = (st: Station): string => (st.state ? `${st.name}, ${st.state}` : st.name);

/**
 * A VCALENDAR with one zero-length, non-blocking VEVENT per high and low water.
 * Times are absolute (UTC), so calendars show them in the reader's own zone.
 */
export function weekIcs({ station, events, units, now, url }: IcsInput): string {
  const stamp = icsUtc(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slack Water//Tide tables//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`${station.name} tides`)}`,
  ];
  for (const e of events) {
    const what = `${turnWord(e.type)} ${height(e.height, units)}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${station.id}-${e.at}@slackwater`,
      `DTSTAMP:${stamp}`,
      // No DTEND: a DATE-TIME start alone is an instant (RFC 5545 §3.6.1).
      `DTSTART:${icsUtc(e.at)}`,
      `SUMMARY:${icsText(`${what} · ${station.name}`)}`,
      `DESCRIPTION:${icsText(`${turnWord(e.type)} water at ${place(station)} (NOAA ${station.id}), ${height(e.height, units)} above MLLW. Predictions from NOAA CO-OPS. Not for navigation.`)}`,
      `LOCATION:${icsText(place(station))}`,
      ...(station.lat || station.lng ? [`GEO:${station.lat.toFixed(4)};${station.lng.toFixed(4)}`] : []),
      `URL:${url}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join(CRLF) + CRLF;
}

/** "point-reyes-tides-2026-11-03.ics" */
export function icsFilename(station: Station, firstDay: string): string {
  const slug = station.name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-');
  return `${slug || station.id}-tides-${firstDay}.ics`;
}
