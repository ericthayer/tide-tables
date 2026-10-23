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
const READING = (time: string, unit: string): RegExp => new RegExp(`^${time}, (minus )?\\d\\.\\d ${unit}, (rising|falling)$`);

test('scrub: hidden until used, then keyboard reads any moment from now', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const tag = page.locator('.scrub-tag');
  await expect(tag).toBeHidden();
  await expect(page.locator('.scrub-marks')).toBeHidden();

  const slider = page.getByRole('slider', { name: 'Time of day' });
  // Tab order: after the day picker, before the table.
  await page.getByRole('radio', { name: /^Today/ }).focus();
  await page.keyboard.press('Tab');
  await expect(slider).toBeFocused();
  // Starts at now (10:00 at the station).
  await expect(slider).toHaveAttribute('aria-valuetext', READING('10:00', 'feet'));
  await expect(tag).toBeVisible();
  await expect(tag).toHaveText(/^10:00 · −?\d\.\d ft · (rising|falling)$/);
  await expect(page.locator('tide-chart')).toHaveCSS('outline-style', 'solid');
  await axe(page);

  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', READING('10:05', 'feet'));
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', READING('23:55', 'feet'));
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', READING('00:00', 'feet'));

  // The minute tick redraws the chart without losing focus or the chosen moment.
  await page.clock.runFor(61_000);
  await expect(slider).toBeFocused();
  await expect(slider).toHaveAttribute('aria-valuetext', READING('00:00', 'feet'));
  // Red stays reserved for now: the cursor is ink.
  const stroke = await page.locator('.sw-curve__scrub').evaluate((el) => getComputedStyle(el).stroke);
  const signal = await page.locator('.sw-curve__now').evaluate((el) => getComputedStyle(el).stroke);
  expect(stroke).not.toBe(signal);

  await slider.blur();
  await expect(tag).toBeHidden();
});

test('scrub: a press anywhere on the curve reads that moment', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const box = (await page.locator('tide-chart').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const slider = page.getByRole('slider', { name: 'Time of day' });
  await expect(slider).toBeFocused();
  await expect(slider).toHaveAttribute('aria-valuetext', READING('12:00', 'feet'));
  // No keyboard focus ring after a press; it comes back once keys are used.
  await expect(page.locator('tide-chart')).toHaveCSS('outline-style', 'none');
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect(slider).toHaveAttribute('aria-valuetext', READING('12:00', 'feet'));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuetext', READING('18:00', 'feet'));
});

test('scrub: other days start at midday, in the chosen unit', async ({ page }) => {
  await page.goto('./?station=9415020&day=2026-11-05');
  await ready(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog').getByText('Metres').click();
  await page.keyboard.press('Escape');
  const slider = page.getByRole('slider', { name: 'Time of day' });
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuetext', READING('12:00', 'metres'));
  await expect(page.locator('.scrub-tag')).toHaveText(/^12:00 · −?\d\.\d m · (rising|falling)$/);
  await axe(page);
});
