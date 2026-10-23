import { expect, test } from './fixtures';

test('AC7: after one visit, tides still load offline from the service worker', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload once so the page is controlled and NOAA responses pass through the worker cache.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator('tide-next')).toHaveAttribute('aria-busy', 'false');

  await context.unrouteAll();
  await context.route('https://api.tidesandcurrents.noaa.gov/**', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);

  await page.goto('./?station=9415020&day=2026-11-04');
  await expect(page.locator('tide-next')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#note-text')).toContainText('Showing saved tides from');
  await expect(page.getByRole('radio', { name: 'Wednesday, November 4' })).toBeChecked();
});

test('AC8: offline with no saved data shows the calm error', async ({ page, context }) => {
  await context.unrouteAll();
  await context.route('https://api.tidesandcurrents.noaa.gov/**', (route) => route.abort('internetdisconnected'));
  await page.goto('./');
  await expect(page.locator('#note-text')).toContainText('aren’t available right now');
});
