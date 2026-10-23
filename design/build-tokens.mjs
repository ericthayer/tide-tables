#!/usr/bin/env node
// Compiles design/tokens.json into CSS custom properties.
//   node design/build-tokens.mjs          -> design/tokens.css (app: prefers-color-scheme + data-theme + reduced motion)
//   node design/build-tokens.mjs --ds OUT -> OUT (Design System artifact layout)
// Zero dependencies. tokens.json is the single source; never hand-edit tokens.css.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8'));
const args = process.argv.slice(2);
const dsOut = args[0] === '--ds' ? args[1] : null;

const [first, ...rest] = tokens.color.themes.map((t) => t.id);
const ref = (v) => v.replace(/^\{(.+)\}$/, 'var(--$1)');
const valueFor = (t, theme) => (typeof t.value === 'string' ? t.value : t.value[theme] ?? t.value[first]);
const decl = (name, value) => `  --${name}: ${ref(value)};`;

/** Declarations for one theme; later themes emit only what differs from the first. */
const themed = (theme) =>
  [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])]
    .filter((t) => theme === first || (typeof t.value !== 'string' && valueFor(t, theme) !== valueFor(t, first)))
    .map((t) => decl(t.name, valueFor(t, theme)))
    .join('\n');

const OTHER = ['spacing', 'radius', 'duration', 'easing', 'size'];
const scalars = OTHER.flatMap((k) => tokens[k]?.tokens ?? [])
  .map((t) => decl(t.name, t.value))
  .concat(Object.entries(tokens.type.families).map(([k, v]) => `  --font-${k}: ${v};`))
  .join('\n');

const fontUrl = (file) => (dsOut ? file : `./${file}`);
const faces = tokens.type.fonts
  .map(
    (f) =>
      `@font-face { font-family: "${f.family}"; src: url("${fontUrl(f.file)}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style ?? 'normal'}; font-display: swap; }`,
  )
  .join('\n');

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const styleClasses = tokens.type.groups
  .flatMap((g) =>
    g.styles.map((s) => {
      const props = { fontFamily: `var(--font-${s.family ?? g.family})` };
      for (const k of ['fontSize', 'lineHeight', 'fontWeight', 'letterSpacing']) if (s[k] !== undefined) props[k] = s[k];
      if ((s.family ?? g.family) === 'mono') props.fontVariantNumeric = 'tabular-nums';
      if (s.name === 'label') props.textTransform = 'uppercase';
      const body = Object.entries(props).map(([k, v]) => `${kebab(k)}: ${v};`).join(' ');
      return `.${s.name} { ${body} }`;
    }),
  )
  .join('\n');

const reducedMotion = (tokens.duration?.tokens ?? [])
  .filter((t) => t.name !== 'dur-ripple')
  .map((t) => `    --${t.name}: 0ms;`)
  .join('\n');

let css;
if (dsOut) {
  css = [
    `/* ${tokens.name} — generated from tokens.json */`,
    `:root, [data-theme="${first}"] {\n${themed(first)}\n}`,
    ...rest.map((id) => `[data-theme="${id}"] {\n${themed(id)}\n}`),
    `:root {\n${scalars}\n}`,
    styleClasses,
    faces,
    '',
  ].join('\n');
} else {
  const dark = rest[0];
  css = [
    `/* ${tokens.name} — generated from tokens.json by build-tokens.mjs. Do not edit. */`,
    faces,
    `:root {\n  color-scheme: light;\n${themed(first)}\n${scalars}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="${first}"]) {\n    color-scheme: dark;\n${themed(dark).replace(/^/gm, '  ')}\n  }\n}`,
    `:root[data-theme="${dark}"] {\n  color-scheme: dark;\n${themed(dark)}\n}`,
    `@media (prefers-reduced-motion: reduce) {\n  :root {\n${reducedMotion}\n  }\n}`,
    styleClasses,
    '',
  ].join('\n');
}

const out = dsOut ?? join(here, 'tokens.css');
writeFileSync(out, css);
console.log(`wrote ${out}`);
