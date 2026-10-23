// After `vite build`: inject the precache list + version into sw.js, and copy the
// brand board into dist/ so the site root keeps serving it.
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const appDir = new URL('../../dist/app/', import.meta.url).pathname;
const base = '/app/';

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const all = (await walk(appDir))
  .map((p) => relative(appDir, p))
  .filter((p) => p !== 'sw.js')
  .sort();
// The version covers every file the worker may cache, including the lazily cached
// station index and icons; otherwise a deploy that only changes those never reaches users.
const hash = createHash('sha256');
for (const f of all) hash.update(f).update(await readFile(join(appDir, f)));
const version = hash.digest('hex').slice(0, 12);
const precache = all
  .filter((p) => p !== 'stations.json' && !p.endsWith('.png') && p !== 'icons/mark.svg')
  .map((f) => base + f);

const swPath = join(appDir, 'sw.js');
const sw = (await readFile(swPath, 'utf8'))
  .replace("'__VERSION__'", JSON.stringify(version))
  .replace('__PRECACHE__', JSON.stringify(precache));
await writeFile(swPath, sw);

await copyFile(new URL('../../slack-water-brandkit.html', import.meta.url), new URL('../../dist/slack-water-brandkit.html', import.meta.url));
console.log(`sw.js: ${precache.length} files precached, version ${version}`);
