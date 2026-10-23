// Regenerate public/currents.json: for each tide station in public/stations.json, the
// nearest NOAA current-prediction station within MAX_KM. NOAA doesn't link the two
// networks, so distance is the only honest pairing; the app always shows it.
// Output: { [tideId]: [currentId, name, km] }. Run after `npm run stations`: npm run currents
import { readFile, writeFile } from 'node:fs/promises';

const URL_ = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions';
const MAX_KM = 10;

const res = await fetch(URL_);
if (!res.ok) throw new Error(`NOAA metadata HTTP ${res.status}`);
const { stations } = await res.json();
// One row per bin; keep one per station. 'W' (weak and variable) stations publish no predictions.
const current = new Map();
for (const s of stations) {
  if ((s.type === 'H' || s.type === 'S') && s.id && s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng) && !current.has(s.id)) {
    current.set(s.id, { id: String(s.id), name: String(s.name).trim(), lat: s.lat, lng: s.lng });
  }
}

const rad = (d) => (d * Math.PI) / 180;
const km = (a, b, c, d) => {
  const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
};

const tides = JSON.parse(await readFile(new URL('../public/stations.json', import.meta.url), 'utf8'));
const out = {};
for (const [id, , , lat, lng] of tides) {
  let best;
  for (const c of current.values()) {
    const d = km(lat, lng, c.lat, c.lng);
    if (d <= MAX_KM && (!best || d < best.d)) best = { c, d };
  }
  if (best) out[id] = [best.c.id, best.c.name, Math.round(best.d * 10) / 10];
}
await writeFile(new URL('../public/currents.json', import.meta.url), JSON.stringify(out));
console.log(`Paired ${Object.keys(out).length} of ${tides.length} tide stations with ${current.size} current stations`);
