import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function ready(page: Page): Promise<void> {
  await expect(page.locator('tide-next')).toHaveAttribute('aria-busy', 'false');
}
async function monthReady(page: Page): Promise<void> {
  await expect(page.locator('tide-month')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('tide-month tbody tr').first()).toBeVisible();
}
async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('today links to the month, which loads lazily as a real table', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('month-view')) chunks.push(r.url());
  });
  const ranges: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === 'api.tidesandcurrents.noaa.gov') ranges.push(u.searchParams.get('range') ?? '');
  });
  await page.goto('./');
  await ready(page);
  expect(chunks).toEqual([]);

  const link = page.getByRole('link', { name: 'Next 30 days' });
  await expect(link).toHaveAttribute('href', /station=9415020&view=month/);
  await link.click();
  await monthReady(page);
  expect(chunks.length).toBeGreaterThan(0);
  expect(ranges).toContain('816');

  await expect(page).toHaveURL(/view=month/);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText('Point Reyes');
  await expect(h1).toBeFocused();
  await expect(page.getByText('Next 30 days · heights in feet')).toBeVisible();
  await expect(page).toHaveTitle('Point Reyes · 30 days · Slack Water');

  const table = page.getByRole('table', { name: /High and low water at Point Reyes/ });
  await expect(table.getByRole('columnheader', { name: 'Day' })).toBeVisible();
  await expect(table.getByRole('rowheader').first()).toHaveText(/Tue 3/);
  await expect(table.getByRole('rowheader').first()).toContainText('Today, Tuesday, November 3');
  // The fixture covers Nov 3 to Nov 8 in full; NOAA's live 34-day window gives 30 rows.
  expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(5);
  // Only the next turn is in signal colour; it matches today's hero.
  await expect(table.locator('td.is-next')).toHaveCount(1);
  await expect(table.locator('td.is-next')).toContainText('(next turn)');
  await expect(table.locator('td.is-past').first()).toBeVisible();
  // Today's screen is out of the way.
  await expect(page.locator('#tides')).toBeHidden();
  await axe(page);

  await page.getByRole('link', { name: 'Today' }).click();
  await ready(page);
  await expect(page).not.toHaveURL(/view=month/);
  await expect(page.locator('#month')).toBeHidden();
  await expect(link).toBeFocused();
});

test('a shared month link opens on the month, and Today returns to today', async ({ page }) => {
  await page.goto('./?station=9415020&view=month');
  await monthReady(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Point Reyes');
  await page.getByRole('link', { name: 'Today' }).click();
  await ready(page);
  await expect(page).toHaveURL(/station=9415020$/);
  await expect(page.locator('#tides')).toBeVisible();
});

test('browser Back from the month returns to today', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('link', { name: 'Next 30 days' }).click();
  await monthReady(page);
  await page.goBack();
  await expect(page.locator('#tides')).toBeVisible();
  await expect(page.locator('#month')).toBeHidden();
});

test('month heights follow the units setting', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('slackwater:v2', JSON.stringify({ v: 2, units: 'm' })));
  await page.goto('./?station=9415020&view=month');
  await monthReady(page);
  await expect(page.getByText('Next 30 days · heights in metres')).toBeVisible();
  await expect(page.locator('td.is-next')).toContainText('metres');
});

test('month view passes axe in dark mode and reflows at 320px', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./?station=9415020&view=month');
  await monthReady(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axe(page);
});

test.describe('offline', () => {
  test('a saved month serves offline from its own cache, and the week is untouched', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await ready(page);
    await page.getByRole('link', { name: 'Next 30 days' }).click();
    await monthReady(page);
    // Wait for the worker to finish writing the month responses.
    await expect
      .poll(() => page.evaluate(async () => (await (await caches.open('tides-month-v1')).keys()).length))
      .toBe(2);
    expect(await page.evaluate(async () => (await (await caches.open('tides-v1')).keys()).length)).toBe(2);

    await context.unrouteAll();
    await context.route('https://api.tidesandcurrents.noaa.gov/**', (route) => route.abort('internetdisconnected'));
    await context.setOffline(true);

    await page.goto('./?station=9415020&view=month');
    await monthReady(page);
    await expect(page.locator('#month .note')).toContainText('Showing saved tides from');
    await page.getByRole('link', { name: 'Today' }).click();
    await ready(page);
    await expect(page.locator('#note-text')).toContainText('Showing saved tides from');
  });

  test('with no saved month, the days saved for today’s screen still show', async ({ page, context }) => {
    await page.goto('./');
    await ready(page);
    await context.unrouteAll();
    await context.route('https://api.tidesandcurrents.noaa.gov/**', (route) => route.abort('internetdisconnected'));
    await page.getByRole('link', { name: 'Next 30 days' }).click();
    await expect(page.locator('#month .note')).toContainText('Showing the days saved on this device');
    await expect(page.locator('tide-month tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
