import { chromium } from '/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
import { join } from 'path';

const outDir = '/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/reviews/screens';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const baseUrl = 'http://127.0.0.1:5175';

const routes = [
  ['00-home', '/'],
  ['10-signin', '/sign-in'],
  ['12-verify-no-token', '/sign-in/verify'],
  ['20-auslage-einreichen', '/auslage-einreichen'],
  ['21-auslage-eingereicht', '/auslage-eingereicht?id=abc-123'],
  ['30-datenschutz', '/datenschutz'],
  ['31-impressum', '/impressum'],
  ['40-app-redirect', '/app'],
  ['50-404', '/this-does-not-exist'],
  ['51-status-bogus', '/auslage-status/abc'],
];

for (const [name, path] of routes) {
  try {
    await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
    console.log(`captured ${name}`);
  } catch (e) {
    console.error(`${name} failed: ${e.message}`);
  }
}

// Mobile
const mctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const mpage = await mctx.newPage();
for (const [name, path] of [
  ['60-mobile-home', '/'],
  ['61-mobile-signin', '/sign-in'],
  ['62-mobile-auslage', '/auslage-einreichen'],
  ['63-mobile-datenschutz', '/datenschutz'],
  ['64-mobile-impressum', '/impressum'],
]) {
  try {
    await mpage.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 15000 });
    await mpage.waitForTimeout(400);
    await mpage.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
    console.log(`captured ${name}`);
  } catch (e) {
    console.error(`${name} failed: ${e.message}`);
  }
}

await browser.close();
console.log('done');
