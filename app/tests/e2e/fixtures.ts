import { readFileSync } from 'node:fs';
import { test as base, type BrowserContext } from '@playwright/test';

const fixture = (tz: string): string =>
  readFileSync(new URL(`../fixtures/9415020-20261030-${tz}.json`, import.meta.url), 'utf8');

const currentsFixture = (): string => readFileSync(new URL('../fixtures/SFB1201-20261030-gmt.json', import.meta.url), 'utf8');

/** Pretend Point Reyes has a current station nearby (the real index has none within 10 km). */
export async function pairCurrents(context: BrowserContext): Promise<void> {
  await context.route('**/app/currents.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ '9415020': ['SFB1201', 'San Francisco Bay Entrance (Outside)', 5.6] }) }),
  );
}

/** 2026-11-03 10:00 PST: inside the fixture window, after the DST change. */
export const NOW = new Date('2026-11-03T18:00:00Z');

export type NoaaMode = 'ok' | 'error' | 'no-data';

export async function mockNoaa(context: BrowserContext, mode: NoaaMode = 'ok'): Promise<void> {
  // context.route also sees requests the service worker makes.
  await context.route('https://api.tidesandcurrents.noaa.gov/**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const tz = params.get('time_zone') ?? 'gmt';
    if (mode === 'error') return route.fulfill({ status: 503, body: '' });
    const ok = params.get('product') === 'currents_predictions' ? currentsFixture() : fixture(tz);
    const body = mode === 'no-data' ? '{"error":{"message":"No Predictions data was found."}}' : ok;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  });
}

export const test = base.extend<{ noaa: NoaaMode }>({
  noaa: ['ok', { option: true }],
  page: async ({ page, context, noaa }, use) => {
    await mockNoaa(context, noaa);
    await page.clock.install({ time: NOW });
    await use(page);
  },
});
export { expect } from '@playwright/test';
