import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, pairCurrents, test } from './fixtures';

async function ready(page: Page): Promise<void> {
  await expect(page.locator('tide-next')).toHaveAttribute('aria-busy', 'false');
}

test('no current station nearby: the section stays hidden', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  // Give the idle-time index lookup a chance to run.
  await page.clock.runFor(3000);
  await expect(page.locator('#currents')).toBeHidden();
});

test.describe('with a paired current station', () => {
  test.beforeEach(async ({ context }) => pairCurrents(context));

  test('opens on demand: next slack, curve and table, then remembers it', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    await page.clock.runFor(3000);
    const toggle = page.getByRole('button', { name: 'Currents' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#currents-station')).toHaveText('San Francisco Bay Entrance (Outside) · 3.0 nmi away · NOAA SFB1201');
    // The panel's code is not loaded until asked for.
    expect(await page.evaluate(() => customElements.get('tide-currents'))).toBeUndefined();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('tide-currents');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await expect(panel.locator('.sw-readout time')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(panel.locator('.sw-readout')).toContainText(/Then (flood|ebb) \d+\.\d kn · (now|in (\d+ h )?\d+ m)/);
    await expect(panel.getByText('Flood sets 061°, ebb 239° true')).toBeVisible();
    await expect(panel.locator('caption')).toHaveText('Currents today, Tuesday, November 3');
    await expect(panel.locator('tbody tr')).not.toHaveCount(0);
    await expect(panel.locator('tr.is-next th')).toContainText('Slack');
    // The readout's slack is the one highlighted in the table.
    await expect(panel.locator('tr.is-next time')).toHaveText((await panel.locator('.sw-readout time').textContent())!);
    await expect(panel.locator('.sw-curve__now')).toHaveCount(1);

    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    await page.reload();
    await ready(page);
    await page.clock.runFor(3000);
    await expect(page.getByRole('button', { name: 'Currents' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('tide-currents tbody tr')).not.toHaveCount(0);
  });

  test('follows the day picker', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    await page.clock.runFor(3000);
    await page.getByRole('button', { name: 'Currents' }).click();
    await expect(page.locator('tide-currents')).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('radio', { name: 'Thursday, November 5' }).check({ force: true });
    await expect(page.locator('tide-currents caption')).toHaveText('Currents, Thursday, November 5');
    await expect(page.locator('tide-currents .sw-curve__now')).toHaveCount(0);
    await expect(page.locator('tide-currents figcaption')).toContainText('Thursday, November 5');
  });

  test('dark mode passes axe with the panel open', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./');
    await ready(page);
    await page.clock.runFor(3000);
    await page.getByRole('button', { name: 'Currents' }).click();
    await expect(page.locator('tide-currents')).toHaveAttribute('aria-busy', 'false');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
