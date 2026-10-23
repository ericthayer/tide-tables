import { describe, expect, it } from 'vitest';
import { readPrefs, rememberStation } from '../../src/data/prefs';
import { rowsToStations } from '../../src/data/stations';
import type { Station } from '../../src/domain/types';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}
const st = (id: string): Station => ({ id, name: `S${id}`, state: 'CA', lat: 1, lng: 2 });

describe('prefs', () => {
  it('remembers the station and keeps five unique recents, newest first', () => {
    const s = memory();
    for (const id of ['1', '2', '3', '4', '5', '6', '3']) rememberStation(st(id), s);
    const p = readPrefs(s);
    expect(p.station?.id).toBe('3');
    expect(p.recents.map((r) => r.id)).toEqual(['3', '6', '5', '4', '2']);
  });
  it('survives corrupt or throwing storage', () => {
    expect(readPrefs({ getItem: () => '{nope' })).toEqual({ recents: [] });
    expect(readPrefs({ getItem: () => { throw new Error('denied'); } })).toEqual({ recents: [] });
    expect(readPrefs(undefined)).toEqual({ recents: [] });
    expect(() => rememberStation(st('1'), { getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});

describe('rowsToStations', () => {
  it('maps compact rows and drops malformed ones', () => {
    expect(rowsToStations([['9415020', 'Point Reyes', 'CA', 37.99, -122.97], ['bad']])).toEqual([
      { id: '9415020', name: 'Point Reyes', state: 'CA', lat: 37.99, lng: -122.97 },
    ]);
  });
});
