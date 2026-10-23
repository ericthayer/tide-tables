import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATION } from '../../src/data/stations';
import { createStore, readUrl, writeUrl } from '../../src/state/store';

describe('store', () => {
  it('notifies with next and previous state, and unsubscribes', () => {
    const s = createStore({ station: DEFAULT_STATION, day: null, load: { status: 'idle' }, now: 0, recents: [] });
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ now: 5 });
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ now: 5 }), expect.objectContaining({ now: 0 }));
    off();
    s.set({ now: 6 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('url', () => {
  it('round-trips station and day', () => {
    expect(readUrl(new URL(writeUrl('/app/', '9415020', '2026-10-24'), 'https://x').search)).toEqual({
      stationId: '9415020',
      day: '2026-10-24',
    });
  });
  it('drops malformed values', () => {
    expect(readUrl('?station=<script>&day=tomorrow')).toEqual({});
  });
});
