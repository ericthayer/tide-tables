import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PREFS_KEY, readPrefs, rememberStation, setDepth, setHome, setTheme, setUnits } from '../../src/data/prefs';
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
    expect(readPrefs({ getItem: () => '{nope' })).toEqual(DEFAULT_PREFS);
    expect(readPrefs({ getItem: () => { throw new Error('denied'); } })).toEqual(DEFAULT_PREFS);
    expect(readPrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(() => rememberStation(st('1'), { getItem: () => null, setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});

describe('prefs v2', () => {
  it('migrates v1 station and recents, with feet and system theme by default', () => {
    const s = memory();
    s.setItem('slackwater:v1', JSON.stringify({ station: st('1'), recents: [st('1'), st('2')] }));
    const p = readPrefs(s);
    expect(p.station?.id).toBe('1');
    expect(p.recents.map((r) => r.id)).toEqual(['1', '2']);
    expect(p).toMatchObject({ saved: [], units: 'ft', theme: 'system' });
    expect(p.home).toBeUndefined();
    rememberStation(st('3'), s);
    expect(JSON.parse(s.getItem(PREFS_KEY)!).station.id).toBe('3');
  });
  it('sets home port at the top of saved, keeps earlier ones, and clears home without dropping saved', () => {
    const s = memory();
    setHome(st('1'), s);
    setHome(st('2'), s);
    let p = setHome(st('1'), s);
    expect(p.home?.id).toBe('1');
    expect(p.saved.map((x) => x.id)).toEqual(['1', '2']);
    p = setHome(null, s);
    expect(p.home).toBeUndefined();
    expect(readPrefs(s).saved.map((x) => x.id)).toEqual(['1', '2']);
    for (const id of ['3', '4', '5', '6', '7']) setHome(st(id), s);
    expect(readPrefs(s).saved).toHaveLength(5);
  });
  it('stores units and theme, and ignores unknown values', () => {
    const s = memory();
    setUnits('m', s);
    setTheme('dark', s);
    expect(readPrefs(s)).toMatchObject({ units: 'm', theme: 'dark' });
    s.setItem(PREFS_KEY, JSON.stringify({ units: 'yards', theme: 'sepia', recents: [], saved: [] }));
    expect(readPrefs(s)).toMatchObject({ units: 'ft', theme: 'system' });
  });
});

describe('depth windows', () => {
  it('stores one depth per station, clears it, and drops malformed entries', () => {
    const s = memory();
    setDepth('9415020', { m: 0.6, dir: 'above' }, s);
    setDepth('9413450', { m: 0.2, dir: 'below' }, s);
    setDepth('9415020', { m: 0.7, dir: 'above' }, s);
    expect(readPrefs(s).depths).toEqual([{ id: '9413450', m: 0.2, dir: 'below' }, { id: '9415020', m: 0.7, dir: 'above' }]);
    expect(setDepth('9415020', null, s).depths).toEqual([{ id: '9413450', m: 0.2, dir: 'below' }]);
    s.setItem(PREFS_KEY, JSON.stringify({ depths: [{ id: 'a', m: 'x', dir: 'above' }, { id: 'b', m: 1, dir: 'sideways' }, { m: 1, dir: 'above' }, { id: 'c', m: 1, dir: 'below' }] }));
    expect(readPrefs(s).depths).toEqual([{ id: 'c', m: 1, dir: 'below' }]);
  });
  it('keeps the newest twenty stations, even with numeric ids', () => {
    const s = memory();
    for (let i = 25; i > 0; i--) setDepth(String(9410000 + i), { m: i, dir: 'above' }, s);
    const ids = readPrefs(s).depths.map((d) => d.id);
    expect(ids).toHaveLength(20);
    expect(ids.at(-1)).toBe('9410001');
    expect(ids).not.toContain('9410025');
  });
});

describe('rowsToStations', () => {
  it('maps compact rows and drops malformed ones', () => {
    expect(rowsToStations([['9415020', 'Point Reyes', 'CA', 37.99, -122.97], ['bad']])).toEqual([
      { id: '9415020', name: 'Point Reyes', state: 'CA', lat: 37.99, lng: -122.97 },
    ]);
  });
});
