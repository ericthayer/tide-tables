import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function ready(page: Page): Promise<void> {
  await expect(page.locator('tide-next')).toHaveAttribute('aria-busy', 'false');
}
async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
const shareChunk = (url: string): boolean => /\/assets\/share-[\w-]+\.js$/.test(url);

test('share: the station sheet hands the station and day to the share sheet, loading its code on use', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared: ShareData[] };
    w.shared = [];
    navigator.share = async (data?: ShareData) => void w.shared.push(data ?? {});
  });
  const chunks: string[] = [];
  page.on('request', (r) => shareChunk(r.url()) && chunks.push(r.url()));
  await page.goto('./');
  await ready(page);
  await page.getByRole('radio', { name: /^Thu/ }).check({ force: true });

  await page.getByRole('button', { name: 'Change station' }).click();
  const here = page.getByRole('dialog', { name: 'Find a station' }).getByRole('region', { name: 'This station' });
  await expect(here).toContainText('Point Reyes');
  await expect(here.getByRole('button')).toHaveText(['Share', 'Add week to calendar']);
  // Opening the sheet still puts focus in the search field.
  await expect(page.getByRole('combobox', { name: 'Station or harbour' })).toBeFocused();
  await axe(page);
  expect(chunks).toEqual([]);

  await here.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('dialog').locator('#station-help')).toHaveText('Shared.');
  expect(chunks).toHaveLength(1);
  const [data] = await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared);
  expect(data!.title).toBe('Point Reyes tides');
  const url = new URL(data!.url!);
  expect(url.pathname).toBe('/app/');
  expect(url.searchParams.get('station')).toBe('9415020');
  expect(url.searchParams.get('day')).toBe('2026-11-05');
});

test('share: without a share sheet the link is copied and that is said', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Change station' }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('dialog').locator('#station-help')).toHaveText('Link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/app\/\?station=9415020$/);
});

test('share: cancelling the share sheet says nothing', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async () => {
      throw new DOMException('cancelled', 'AbortError');
    };
  });
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Change station' }).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await page.waitForResponse((r) => shareChunk(r.url())).catch(() => undefined);
  await expect(page.getByRole('dialog').locator('#station-help')).toHaveText('');
});

test('calendar: the week downloads as an .ics of high and low waters in the chosen units', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Change station' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add week to calendar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('point-reyes-tides-2026-11-03.ics');
  const ics = await readFile((await file.path())!, 'utf8');
  const events = ics.match(/BEGIN:VEVENT/g) ?? [];
  // Up to four turns a day for seven days (the fixture runs out partway through day 7).
  expect(events.length).toBeGreaterThanOrEqual(20);
  expect(events.length).toBeLessThanOrEqual(28);
  expect(ics).toMatch(/SUMMARY:(High|Low) −?\d\.\d ft · Point Reyes/);
  // The first turn of the file falls on the station's today (Nov 3, PST = UTC−8).
  expect(ics.match(/DTSTART:(\d{8})T/)?.[1]).toMatch(/^2026110[34]$/);
  await expect(page.getByRole('dialog').locator('#station-help')).toHaveText(`Calendar file saved. Open it to add ${events.length} tides.`);
});

test.describe('without tides', () => {
  test.use({ noaa: 'error' });
  test('calendar: is not offered when no tides are loaded; Share still is', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#note-text')).toHaveText(/aren’t available/);
    await page.getByRole('button', { name: 'Change station' }).click();
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add week to calendar' })).toBeHidden();
  });
});
