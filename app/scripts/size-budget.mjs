// Fail the build if shipped JS/CSS or the lazy station index exceed the PRD §5 budgets.
// First-load JS (what index.html loads or preloads) has 15 KB; each on-demand chunk has its own 5 KB.
import { readdir, readFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const dist = new URL('../../dist/app/', import.meta.url);
const KB = 1024;
const gzip = (b) => gzipSync(b, { level: 9 }).length;
const html = await readFile(new URL('index.html', dist), 'utf8');
const firstLoad = new Set([...html.matchAll(/(?:src|href)="[^"]*assets\/([^"/]+\.js)"/g)].map((m) => m[1]));
const assets = await readdir(new URL('assets/', dist));
const lazy = assets.filter((f) => f.endsWith('.js') && !firstLoad.has(f));
const budgets = [
  { label: 'First-load JS (gzip)', match: (f) => firstLoad.has(f), dir: 'assets/', limit: 15 * KB, size: gzip },
  ...lazy.map((name) => ({ label: `Lazy chunk ${name} (gzip)`, match: (f) => f === name, dir: 'assets/', limit: 5 * KB, size: gzip })),
  { label: 'CSS (gzip)', match: (f) => f.endsWith('.css'), dir: 'assets/', limit: 8 * KB, size: gzip },
  { label: 'Station index (brotli)', match: (f) => f === 'stations.json', dir: '', limit: 70 * KB, size: (b) => brotliCompressSync(b).length },
];

let failed = firstLoad.size === 0;
if (failed) console.log('✗ No first-load script found in index.html');
for (const b of budgets) {
  const dir = new URL(b.dir, dist);
  let total = 0;
  for (const f of (await readdir(dir)).filter(b.match)) total += b.size(await readFile(new URL(f, dir)));
  const ok = total <= b.limit;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${b.label}: ${(total / KB).toFixed(1)} KB / ${(b.limit / KB).toFixed(0)} KB`);
}
process.exit(failed ? 1 : 0);
