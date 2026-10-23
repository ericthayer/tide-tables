// Fail the build if shipped JS/CSS or the lazy station index exceed the PRD §5 budgets.
import { readdir, readFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const dist = new URL('../../dist/app/', import.meta.url);
const KB = 1024;
const budgets = [
  { label: 'JS (gzip)', match: (f) => f.endsWith('.js'), dir: 'assets/', limit: 15 * KB, size: (b) => gzipSync(b, { level: 9 }).length },
  { label: 'CSS (gzip)', match: (f) => f.endsWith('.css'), dir: 'assets/', limit: 8 * KB, size: (b) => gzipSync(b, { level: 9 }).length },
  { label: 'Station index (brotli)', match: (f) => f === 'stations.json', dir: '', limit: 70 * KB, size: (b) => brotliCompressSync(b).length },
];

let failed = false;
for (const b of budgets) {
  const dir = new URL(b.dir, dist);
  let total = 0;
  for (const f of (await readdir(dir)).filter(b.match)) total += b.size(await readFile(new URL(f, dir)));
  const ok = total <= b.limit;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${b.label}: ${(total / KB).toFixed(1)} KB / ${(b.limit / KB).toFixed(0)} KB`);
}
process.exit(failed ? 1 : 0);
