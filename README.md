# Tide Tables

Brand work for **Slack Water**, a tide-tables brand.

## What's here

- [`slack-water-brandkit.html`](slack-water-brandkit.html) is a single-page brand guidelines board built with plain HTML, CSS and inline SVG. It uses no JavaScript and no image files. The board covers:
  1. Cover with the mark and wordmark
  2. Mark construction
  3. App icon
  4. Voice and tagline
  5. Colour, shown by proportion of use
  6. Type
  7. Print booklet
  8. Image direction (engraved sea, never photographed)
  9. Components system strip
- [`design/`](design/) holds the design system as code: `tokens.json` (source), generated `tokens.css`, `components.css`, an icon sprite, self-hosted fonts, and a WCAG contrast check. See [`design/README.md`](design/README.md).
- `.claude/launch.json` defines a local preview server for Claude Code.
- `app/` is the tide-tables app (see below), and `docs/` holds its ADR and spec.

Fonts load from Fontshare (Cabinet Grotesk) and Google Fonts (Geist Mono), so the board needs a network connection to render with the intended type.

## Viewing the board

Open `slack-water-brandkit.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8765
```

Then visit <http://localhost:8765/slack-water-brandkit.html>.

## The app

`app/` is the Slack Water tide-tables app: an installable PWA in vanilla TypeScript and Custom Elements, with no runtime dependencies. It reads NOAA tide predictions, works offline, and is built on the design system in `design/`. Why this stack: [ADR 0001](docs/adr/0001-app-platform-vanilla-ts-web-components-pwa.md). What it does: [PRD](docs/spec/PRD.md). How it fits together: [architecture](docs/spec/architecture.md).

```bash
cd app
npm ci
npm run dev        # http://localhost:5173/app/
npm run check      # typecheck, unit tests, build, size budget, e2e + axe
npm run stations   # refresh public/stations.json from NOAA
```

Netlify builds the app into `dist/app/` and serves the brand board at `/` as before; the app lives at `/app/`.

## License

[MIT](LICENSE)
