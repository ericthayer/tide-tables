import { describe, expect, it } from 'vitest';
import { distanceKm, nearestStation } from '../../src/domain/geo';
import { normalize, searchStations } from '../../src/domain/search';
import type { Station } from '../../src/domain/types';

const S = (id: string, name: string, state: string, lat = 0, lng = 0): Station => ({ id, name, state, lat, lng });
const stations: Station[] = [
  S('9415144', 'Point Reyes Station, Tomales Bay', 'CA', 38.07, -122.81),
  S('9415020', 'Point Reyes', 'CA', 37.994, -122.974),
  S('9414290', 'SAN FRANCISCO (Golden Gate)', 'CA', 37.806, -122.466),
  S('9413450', 'Monterey', 'CA', 36.609, -121.891),
  S('8443970', 'Boston', 'MA', 42.354, -71.053),
];

describe('normalize', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalize('  Pt. Réyes!  ')).toBe('pt reyes');
  });
});

describe('searchStations', () => {
  it('ranks the shortest prefix match first', () => {
    expect(searchStations(stations, 'reyes').map((s) => s.id)).toEqual(['9415020', '9415144']);
  });
  it('matches station ids exactly', () => {
    expect(searchStations(stations, '9413450')[0]?.name).toBe('Monterey');
  });
  it('requires every word', () => {
    expect(searchStations(stations, 'golden gate').map((s) => s.id)).toEqual(['9414290']);
    expect(searchStations(stations, 'golden boston')).toEqual([]);
  });
  it('matches state codes', () => {
    expect(searchStations(stations, 'ma').map((s) => s.id)).toEqual(['8443970']);
  });
  it('returns nothing for a blank query', () => {
    expect(searchStations(stations, '  ')).toEqual([]);
  });
});

describe('geo', () => {
  it('measures San Francisco to Monterey at about 140 km', () => {
    expect(distanceKm(37.806, -122.466, 36.609, -121.891)).toBeGreaterThan(135);
    expect(distanceKm(37.806, -122.466, 36.609, -121.891)).toBeLessThan(145);
  });
  it('finds the nearest station', () => {
    expect(nearestStation(stations, 37.99, -122.97)?.station.id).toBe('9415020');
    expect(nearestStation([], 0, 0)).toBeUndefined();
  });
});
