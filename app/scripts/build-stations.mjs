// Regenerate public/stations.json from NOAA's metadata API.
// Output rows: [id, name, state, lat, lng], sorted by name. Run: npm run stations
import { writeFile } from 'node:fs/promises';

const URL_ = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
const res = await fetch(URL_);
if (!res.ok) throw new Error(`NOAA metadata HTTP ${res.status}`);
const { stations } = await res.json();
// NOAA shouts some names ("MONTEREY, MONTEREY BAY"); set all-caps words in title case.
const tidy = (name) =>
  name.trim().replace(/\b[A-Z][A-Z'.-]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
const round = (n) => Math.round(n * 1e3) / 1e3;
const rows = stations
  .filter((s) => s.id && s.name && Number.isFinite(s.lat) && Number.isFinite(s.lng))
  .map((s) => [String(s.id), tidy(String(s.name)), String(s.state ?? '').trim(), round(s.lat), round(s.lng)])
  .sort((a, b) => a[1].localeCompare(b[1]));
await writeFile(new URL('../public/stations.json', import.meta.url), JSON.stringify(rows));
console.log(`Wrote ${rows.length} stations`);
