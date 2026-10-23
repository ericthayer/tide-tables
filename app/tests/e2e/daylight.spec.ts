import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function ready(page: Page): Promise<void> {
  await expect(page.locator('tide-next')).toHaveAttribute('aria-busy', 'false');
}

test('daylight: night is shaded behind the curve and sunrise and sunset sit in the caption', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  // Point Reyes, 3 Nov 2026 (PST): sunrise about 06:40, sunset about 17:11.
  const sun = page.locator('caption .sun');
  await expect(sun).toHaveText(/06:(39|40|41)–17:(10|11|12)/);
  await expect(page.getByRole('table')).toHaveAccessibleName(/^Today, Tuesday, November 3 ?\. Sunrise 06:\d\d, sunset 17:\d\d ?\. Waning crescent moon, neap tides, smaller range than usual ?\.$/);
  await expect(page.locator('figcaption')).toContainText(/Sunrise 06:\d\d, sunset 17:\d\d\./);

  // Two bands: midnight to sunrise and sunset to midnight, about 6.7 h and 6.8 h of the 24 h width.
  const bands = page.locator('.sw-curve__night');
  await expect(bands).toHaveCount(2);
  const widths = await bands.evaluateAll((els) => els.map((el) => Number(el.getAttribute('width'))));
  expect(widths[0]).toBeGreaterThan(65);
  expect(widths[0]).toBeLessThan(68);
  expect(widths[1]).toBeGreaterThan(66);
  expect(widths[1]).toBeLessThan(70);

  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test('daylight: other days get their own sunrise and sunset', async ({ page }) => {
  await page.goto('./?day=2026-11-06');
  await ready(page);
  await expect(page.locator('caption .label')).toHaveText('Friday, November 6.');
  await expect(page.locator('caption .sun')).toHaveText(/06:4\d–17:\d\d/);
  await expect(page.locator('.sw-curve__night')).toHaveCount(2);
});
