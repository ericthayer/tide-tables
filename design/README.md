# Slack Water design system (code)

The machine-readable half of the Slack Water design system. The brand book, component guidelines and live previews are in the design system artifact; this folder is what the app imports.

| File | What it is |
| --- | --- |
| `tokens.json` | The source of truth: colour (Almanac and Night watch themes), type, spacing, radius, depth, duration, easing, size. |
| `tokens.css` | Generated CSS custom properties. Follows `prefers-color-scheme`, honours `data-theme="light" \| "dark"` on `<html>`, zeroes durations under `prefers-reduced-motion`, declares the `@font-face` rules and one class per type style. |
| `components.css` | The `sw-` component classes: button, chip, search field, segmented control, slack readout, tide curve, tide table, station ticker, tab bar. |
| `icons.svg` | Symbol sprite. Icons take `currentColor`. |
| `fonts/` | Self-hosted WOFF2: Cabinet Grotesk 500/700/800, Geist Mono (400 to 500 weight axis). Subset to Latin-1 plus typographic punctuation, 42 KB total. |
| `assets/` | The mark for light and dark grounds, and the 1024px app icon. |
| `build-tokens.mjs` | Regenerates `tokens.css` from `tokens.json`. Zero dependencies. |
| `check-contrast.mjs` | WCAG 2.2 AA gate over every required colour pair, in both themes. Exits 1 on any failure. |

## Use

```html
<link rel="preload" href="/design/fonts/CabinetGrotesk-Extrabold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/design/fonts/GeistMono-Latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/design/tokens.css">
<link rel="stylesheet" href="/design/components.css">
```

Inside a web component's shadow root, custom properties inherit through the boundary, so components read `var(--ink)` and friends directly; adopt `components.css` as a constructable stylesheet where a component needs the `sw-` classes.

## Change a token

1. Edit `tokens.json`.
2. `node design/build-tokens.mjs`
3. `node design/check-contrast.mjs` and fix anything it reports before committing.

## Rules the code must keep

- Red (`signal`, `signal-fill`) means now and slack water. Nothing else is red, errors included.
- One focus ring everywhere: 2px solid `var(--focus)`, 2px offset.
- Hit areas are at least `var(--size-touch)` (44px).
- Animate `transform`, `opacity` and the curve's `stroke-dashoffset` only, using the duration and easing tokens. Wrap keyframe animations in `@media (prefers-reduced-motion: no-preference)`.

## Licences

Geist Mono is under the SIL Open Font License. Cabinet Grotesk is from Fontshare under the ITF Free Font License, which allows use in apps and on the web; confirm the terms before shipping a commercial build.

## Fonts are subset

Each WOFF2 holds Latin-1 plus typographic punctuation (U+0020-007E, U+00A0-00FF, en and em dash, curly quotes, bullet, ellipsis, minus) with kern, liga and calt kept. Geist Mono is instanced to its 400 to 500 weight range. To regenerate from the full Fontshare and Google files:

```bash
fonttools varLib.instancer GeistMono.woff2 "wght=400:500" -o gm.ttf
pyftsubset <font> --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2212" \
  --layout-features=kern,liga,calt,tnum --flavor=woff2 --output-file=<out>.woff2
```

A station name outside Latin-1 (for example Hawaiian ʻokina) falls back to the system font for that glyph. Widen the range if the station list needs it.
