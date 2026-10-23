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
const loaded = (page: Page): Promise<boolean> => page.evaluate(() => customElements.get('tide-depth') !== undefined);
const TIMES = /^(\d{2}:\d{2}–\d{2}:\d{2})( · \d{2}:\d{2}–\d{2}:\d{2})*$|^All day$|^Not today$/;

test('depth window: loads on first use, shows a dashed line and times, and is kept per station', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const depth = page.locator('tide-depth');
  await expect(depth).toContainText('Depth window');
  expect(await loaded(page)).toBe(false);
  await expect(page.locator('.sw-curve__depth')).toHaveCount(0);

  await depth.getByRole('button', { name: 'Set depth' }).click();
  const input = page.getByRole('spinbutton', { name: 'Depth in feet' });
  await expect(input).toBeFocused();
  expect(await loaded(page)).toBe(true);
  await expect(page.getByRole('radio', { name: 'Above' })).toBeChecked();
  await axe(page);

  await input.fill('3');
  await input.press('Enter');
  await expect(depth.locator('.depth-muted')).toHaveText('Above 3.0 ft, estimated');
  await expect(depth.locator('.data')).toHaveText(/\d{2}:\d{2}/);
  const visible = await depth.locator('.data').evaluate((el) => [...el.childNodes].filter((n) => !(n instanceof Element && n.classList.contains('sw-sr'))).map((n) => n.textContent).join(''));
  expect(visible).toMatch(TIMES);
  const change = depth.getByRole('button', { name: 'Change depth, now above 3.0 feet' });
  await expect(change).toBeFocused();
  await expect(depth.locator('[aria-live]')).toHaveText(/^Depth window set\. Above 3\.0 feet, estimated: \d{2}:\d{2} to \d{2}:\d{2}/);
  await expect(page.locator('.sw-curve__depth')).toHaveCount(1);
  await expect(page.locator('.sw-curve__depth-tag')).toHaveText('3.0 ft');
  // Never red: the line is muted ink.
  const stroke = await page.locator('.sw-curve__depth').evaluate((el) => getComputedStyle(el).stroke);
  expect(stroke).not.toBe(await page.locator('.sw-curve__now').evaluate((el) => getComputedStyle(el).stroke));
  await axe(page);

  // Another day recomputes the window.
  const before = await depth.locator('.data').textContent();
  await page.getByRole('radio', { name: /^Thu/ }).check({ force: true });
  await expect(depth.locator('.data')).not.toHaveText(before!);

  // Kept after reload: the module loads by itself because this station has a depth.
  await page.goto('./');
  await ready(page);
  await expect(depth.locator('.depth-muted')).toHaveText('Above 3.0 ft, estimated');

  // Metres follow the units preference; the stored depth is unchanged.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByText('Metres').click();
  await page.keyboard.press('Escape');
  await expect(depth.locator('.depth-muted')).toHaveText('Above 0.9 m, estimated');
  await expect(page.locator('.sw-curve__depth-tag')).toHaveText('0.9 m');

  // Below, for clamming; then remove.
  await depth.getByRole('button', { name: /^Change depth/ }).click();
  await expect(page.getByRole('spinbutton', { name: 'Depth in metres' })).toHaveValue('0.9');
  await page.getByText('Below', { exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(depth.locator('.depth-muted')).toHaveText('Below 0.9 m, estimated');
  await depth.getByRole('button', { name: /^Change depth/ }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(depth.getByRole('button', { name: 'Set depth' })).toBeFocused();
  await expect(depth.locator('[aria-live]')).toHaveText('Depth window removed.');
  await expect(page.locator('.sw-curve__depth')).toHaveCount(0);
});

test('depth window: rejects an out-of-range depth and Escape cancels', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Set depth' }).click();
  const input = page.getByRole('spinbutton', { name: 'Depth in feet' });
  await input.fill('100');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toBeFocused();
  await expect(page.locator('#depth-help')).toHaveText('Enter a depth from −10 to 40 ft.');
  await axe(page);
  await input.press('Escape');
  await expect(page.getByRole('button', { name: 'Set depth' })).toBeFocused();
  await expect(page.locator('.sw-curve__depth')).toHaveCount(0);
});

test('depth window: the row and editor fit at 320px with 44px targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Set depth' }).click();
  await page.getByRole('spinbutton', { name: 'Depth in feet' }).fill('2');
  await page.getByRole('button', { name: 'Save' }).click();
  const change = (await page.getByRole('button', { name: /^Change depth/ }).boundingBox())!;
  expect(change.height).toBeGreaterThanOrEqual(44);
  expect(change.x + change.width).toBeLessThanOrEqual(320 - 16 + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
