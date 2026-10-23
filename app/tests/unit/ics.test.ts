import { describe, expect, it } from 'vitest';
import { icsFilename, icsFold, icsText, icsUtc, weekIcs } from '../../src/domain/ics';
import type { Station, TideEvent } from '../../src/domain/types';

const station: Station = { id: '9415020', name: 'Point Reyes', state: 'CA', lat: 37.9961, lng: -122.9767 };
const events: TideEvent[] = [
  { at: Date.parse('2026-11-03T14:36:00Z'), local: '2026-11-03 06:36', offsetMin: -480, type: 'H', height: 1.593 },
  { at: Date.parse('2026-11-03T20:28:00Z'), local: '2026-11-03 12:28', offsetMin: -480, type: 'L', height: -0.144 },
];
const NOW = Date.parse('2026-11-03T18:00:00Z');
const url = 'https://example.test/app/?station=9415020';

describe('ics', () => {
  it('formats instants in UTC basic form', () => {
    expect(icsUtc(Date.parse('2026-11-03T14:36:00.000Z'))).toBe('20261103T143600Z');
  });

  it('escapes TEXT values', () => {
    expect(icsText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('folds at 75 octets without splitting a multi-byte character', () => {
    const line = `SUMMARY:${'−'.repeat(40)}`; // 8 + 120 octets
    const folded = icsFold(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const l of folded) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(line);
  });

  it('writes one transparent instant event per turn, in the chosen units', () => {
    const ics = weekIcs({ station, events, units: 'ft', now: NOW, url });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261103T143600Z');
    expect(ics).toContain('SUMMARY:High 5.2 ft · Point Reyes');
    expect(ics).toContain('SUMMARY:Low −0.5 ft · Point Reyes');
    expect(ics).toContain('UID:9415020-1793716560000@slackwater');
    expect(ics).toContain('DTSTAMP:20261103T180000Z');
    expect(ics).toContain('GEO:37.9961;-122.9767');
    expect(ics).toContain('LOCATION:Point Reyes\\, CA');
    expect(ics).toContain('TRANSP:TRANSPARENT');
    expect(ics).not.toContain('DTEND');
    // Bare LF never appears; every line ends CRLF.
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(weekIcs({ station, events, units: 'm', now: NOW, url })).toContain('SUMMARY:High 1.6 m · Point Reyes');
  });

  it('omits GEO for a station without coordinates', () => {
    const ics = weekIcs({ station: { ...station, lat: 0, lng: 0 }, events, units: 'ft', now: NOW, url });
    expect(ics).not.toContain('GEO:');
  });

  it('names the file after the station and first day', () => {
    expect(icsFilename(station, '2026-11-03')).toBe('point-reyes-tides-2026-11-03.ics');
    expect(icsFilename({ ...station, name: 'Monterey, Monterey Bay' }, '2026-11-03')).toBe('monterey-monterey-bay-tides-2026-11-03.ics');
    expect(icsFilename({ ...station, name: '***' }, '2026-11-03')).toBe('9415020-tides-2026-11-03.ics');
  });
});
