#!/usr/bin/env node
// WCAG 2.2 contrast gate for design/tokens.json. Exits 1 if any required pair fails in any theme.
//   node design/check-contrast.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8'));
const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t]));
const themes = tokens.color.themes.map((t) => t.id);

/** [foreground, ground, minimum ratio, role] */
const PAIRS = [
  ['ink', 'bg', 4.5, 'text'],
  ['ink', 'surface', 4.5, 'text'],
  ['ink', 'surface-field', 4.5, 'text'],
  ['ink-muted', 'bg', 4.5, 'text'],
  ['ink-muted', 'surface', 4.5, 'text'],
  ['ink-muted', 'surface-field', 4.5, 'text'],
  ['signal', 'bg', 4.5, 'text'],
  ['signal', 'surface', 4.5, 'text'],
  ['on-signal', 'signal-fill', 4.5, 'text'],
  ['on-fill-strong', 'fill-strong', 4.5, 'text'],
  ['line-strong', 'bg', 3, 'control boundary'],
  ['line-strong', 'surface', 3, 'control boundary'],
  ['line-strong', 'surface-field', 3, 'control boundary'],
  ['focus', 'bg', 3, 'focus ring'],
  ['focus', 'surface', 3, 'focus ring'],
  // The ring is drawn with a 2px offset, so it always sits on the ground, never on a fill.
  // That is why focus on signal-fill (2.72:1 in light) is not a required pair.
  ['fill-strong', 'bg', 3, 'selected control'],
  ['fill-strong', 'surface', 3, 'selected control'],
];

const resolve = (name, theme, depth = 0) => {
  if (depth > 16) throw new Error(`alias chain too deep at ${name}`);
  const t = byName[name];
  if (!t) throw new Error(`unknown token ${name}`);
  const v = typeof t.value === 'string' ? t.value : t.value[theme] ?? t.value[themes[0]];
  const alias = /^\{(.+)\}$/.exec(v);
  return alias ? resolve(alias[1], theme, depth + 1) : v;
};

const parse = (c) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgba = /^rgba?\(([^)]+)\)$/.exec(c);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map(Number);
    return [r, g, b, a];
  }
  throw new Error(`unsupported colour ${c}`);
};
const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
const lum = (rgb) =>
  rgb
    .slice(0, 3)
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failures = 0;
for (const theme of themes) {
  console.log(`\n${theme}`);
  for (const [fg, ground, min, role] of PAIRS) {
    const g = parse(resolve(ground, theme));
    const f = over(parse(resolve(fg, theme)), g);
    const r = ratio(f, g);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  ${fg} on ${ground}  (${role}, needs ${min}:1)`);
  }
}
if (failures) {
  console.error(`\n${failures} pair(s) below WCAG 2.2 AA`);
  process.exit(1);
}
console.log('\nAll pairs meet WCAG 2.2 AA.');
