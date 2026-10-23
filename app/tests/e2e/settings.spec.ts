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

test('home port: toggles, is announced, and the app reopens to it', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const home = page.getByRole('button', { name: 'Home port' });
  await expect(home).toHaveAttribute('aria-pressed', 'false');
  await home.click();
  await expect(home).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#announcer')).toHaveText('Point Reyes is now your home port.');
  await axe(page);

  // Browse another station, then open the app fresh: home port wins over the last station.
  await page.getByRole('button', { name: 'Change station' }).click();
  await page.getByRole('combobox', { name: 'Station or harbour' }).fill('monterey');
  await page.getByRole('option').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Monterey, Monterey Bay');
  await expect(home).toHaveAttribute('aria-pressed', 'false');
  await page.goto('./');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Point Reyes');

  // The station sheet lists it under Saved, marked as home port, and not again under Recent.
  await page.getByRole('button', { name: 'Change station' }).click();
  const saved = page.getByRole('list', { name: 'Saved' });
  await expect(saved.getByRole('button')).toHaveText(/Point Reyes.*Home port/);
  await expect(page.getByRole('list', { name: 'Recent' }).getByRole('button', { name: /Point Reyes/ })).toHaveCount(0);
  await axe(page);
  await page.keyboard.press('Escape');

  await home.click();
  await expect(home).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#announcer')).toHaveText('Point Reyes is no longer your home port.');
});

test('settings: feet by default, metres on request, kept after reload', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await expect(page.locator('tide-next')).toContainText(' ft · ');
  await expect(page.locator('footer')).toContainText('Heights in feet above MLLW');

  const trigger = page.getByRole('button', { name: 'Settings' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('radio', { name: 'Feet' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'System' })).toBeChecked();
  await axe(page);
  await dialog.getByText('Metres').click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('tide-next')).toContainText(' m · ');
  await expect(page.locator('tr.is-next')).toContainText(' m');
  await expect(page.locator('footer')).toContainText('Heights in metres above MLLW');
  await page.reload();
  await ready(page);
  await expect(page.locator('tide-next')).toContainText(' m · ');
});

test('settings: a forced colour mode applies before first paint and survives reload', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await axe(page);

  // The inline head script sets the theme before any module runs.
  await page.goto('./', { waitUntil: 'commit' });
  await page.waitForSelector('html[data-theme="dark"]', { state: 'attached' });
  const atParse = await page.evaluate(() => document.documentElement.dataset['theme']);
  expect(atParse).toBe('dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(14, 24, 46)');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#0B1120');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByText('System', { exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#F3EEE3');
});

test('header holds the wordmark, Settings and Change station on one line at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await ready(page);
  expect((await page.locator('.brand-name').boundingBox())!.width).toBeGreaterThan(50);
  const [settings, station] = await Promise.all([
    page.getByRole('button', { name: 'Settings' }).boundingBox(),
    page.getByRole('button', { name: 'Change station' }).boundingBox(),
  ]);
  expect(settings!.x).toBeLessThan(station!.x);
  expect(Math.round(station!.x + station!.width)).toBe(390 - 16);
  expect(Math.abs(settings!.y + settings!.height / 2 - (station!.y + station!.height / 2))).toBeLessThan(1);
});

test('header keeps the mark but drops the wordmark when it cannot fit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('./');
  await ready(page);
  expect((await page.locator('.brand-name').boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(page.locator('.brand')).toHaveText('Slack Water');
  const station = (await page.getByRole('button', { name: 'Change station' }).boundingBox())!;
  expect(Math.round(station.x + station.width)).toBe(375 - 16);
});
