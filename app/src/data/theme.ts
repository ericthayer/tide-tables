import type { Theme } from './prefs';

/** Browser chrome colours per scheme; they match the static <meta name="theme-color"> tags. */
const CHROME = { light: '#F3EEE3', dark: '#0B1120' } as const;

/**
 * Force a colour mode, or hand it back to the system. index.html runs the same
 * logic inline before first paint so a forced theme never flashes.
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = CHROME[theme === 'system' ? scheme : theme];
  }
}
