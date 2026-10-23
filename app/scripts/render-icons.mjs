// Render PNG app icons from design/assets/app-icon.svg. Run once after the icon changes.
// The mark sits inside the central 62.5%, so the same art is safe as a maskable icon.
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../../design/assets/app-icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: out(name), omitBackground: false });
}
await browser.close();
console.log('Icons rendered');
