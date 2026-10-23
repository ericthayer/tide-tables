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

test('AC1: shows the next turn with local time, type, height and countdown', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Point Reyes');
  const next = page.locator('tide-next');
  await expect(next.locator('time')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(next).toContainText(/(High|Low) · −?\d\.\d ft · in (\d+ h )?\d+ m/);
  // Same turn is highlighted in the table.
  const t = await next.locator('time').textContent();
  await expect(page.locator('tr.is-next time')).toHaveText(t!);
  await axe(page);
});

test('AC2: countdown ticks without a reload', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const eta = page.locator('.sw-readout__eta');
  const before = await eta.textContent();
  await page.clock.runFor(61_000);
  await expect(eta).not.toHaveText(before!);
});

test('AC3/AC4: day picker updates chart, table and URL; keyboard works', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const today = page.getByRole('radio', { name: /^Today/ });
  await expect(today).toBeChecked();
  await expect(page.locator('.sw-curve__now')).toHaveCount(1);
  await today.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Wednesday, November 4' })).toBeChecked();
  await expect(page).toHaveURL(/day=2026-11-04/);
  await expect(page.locator('caption')).toHaveText('Wednesday, November 4');
  await expect(page.locator('.sw-curve__now')).toHaveCount(0);
  await expect(page.locator('figcaption')).toContainText('Wednesday, November 4');
});

test('AC4: a shared link opens on its day', async ({ page }) => {
  await page.goto('./?station=9415020&day=2026-11-05');
  await ready(page);
  await expect(page.getByRole('radio', { name: 'Thursday, November 5' })).toBeChecked();
});

test('AC4: an out-of-range day falls back to today', async ({ page }) => {
  await page.goto('./?station=9415020&day=2030-01-01');
  await ready(page);
  await expect(page.getByRole('radio', { name: /^Today/ })).toBeChecked();
});

test('AC5: search by keyboard selects a station and returns focus', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const trigger = page.getByRole('button', { name: 'Change station' });
  await trigger.click();
  const box = page.getByRole('combobox', { name: 'Station or harbour' });
  await expect(box).toBeFocused();
  await box.fill('monterey');
  await expect(page.getByRole('option').first()).toContainText('Monterey, Monterey Bay');
  await axe(page);
  await page.keyboard.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', 'opt-0');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Monterey, Monterey Bay');
  await expect(page).toHaveURL(/station=9413450/);
  await expect(page.locator('#announcer')).toContainText('Showing tides for Monterey');
  // Back returns to the previous station.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Point Reyes');
});

test('Escape closes the station dialog', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Change station' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Change station' })).toBeFocused();
});

test('AC6: denied location leaves the station and says so calmly', async ({ page, context }) => {
  await context.clearPermissions();
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Change station' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Couldn’t get your location');
});

test('AC6: granted location picks the nearest station', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 36.605, longitude: -121.888 });
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Change station' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Monterey, Monterey Bay');
});

test.describe('errors', () => {
  test.use({ noaa: 'error' });
  test('AC8: API failure shows a calm message and retry', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#note-text')).toHaveText(/Tides for Point Reyes aren’t available right now/);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await axe(page);
  });
});

test.describe('unknown station', () => {
  test.use({ noaa: 'no-data' });
  test('AC8: NOAA error payload maps to no-data copy', async ({ page }) => {
    await page.goto('./?station=0000000');
    await expect(page.locator('#note-text')).toContainText('aren’t published by NOAA');
  });
});

test.describe('dark scheme', () => {
  test('has no axe violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./');
    await ready(page);
    await axe(page);
  });
});

test.describe('reduced motion', () => {
  test('curve renders without draw animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await ready(page);
    const anim = await page.locator('.sw-curve__line').evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('none');
  });
});

test('reflows at 320px with no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
