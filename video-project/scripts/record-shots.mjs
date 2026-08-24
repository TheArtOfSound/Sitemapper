import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = join(root, 'video-project/raw');
const overlays = join(root, 'video-project/overlays');
await mkdir(raw, { recursive: true });

const ORIGIN = 'https://sitemapper.oortstack.com';
const SITE = 'prj_6677a99d551941248280346008a7b3b0';
const EVENT = 'chg_20f5c7c461b343e2b7f16b18ab18de56';
const token = readFileSync('/tmp/sp_session_token.txt', 'utf8').trim();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  recordVideo: { dir: raw, size: { width: 1920, height: 1080 } },
});
await context.addCookies([
  {
    name: 'sp_session',
    value: token,
    domain: 'sitemapper.oortstack.com',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  },
]);
const page = await context.newPage();
page.setDefaultTimeout(45000);

async function shot(name, path) {
  await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => {
      v.pause();
      v.removeAttribute('autoplay');
    });
  });
  await page.screenshot({ path: join(raw, `${name}.png`), type: 'png' });
  console.log('still', name);
}

await shot('01-home', '/');
await shot('02-app', '/app');
await shot('03-site', `/app/sites/${SITE}`);
await shot('04-incident', `/app/sites/${SITE}/changes?event=${EVENT}`);
await shot('05-history', `/app/sites/${SITE}/history`);

// Short real interaction: open incident from dashboard
await page.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
const incident = page.locator('a.incident').first();
if (await incident.count()) {
  await incident.click();
  await page.waitForTimeout(1600);
}
await page.screenshot({ path: join(raw, '06-after-click.png'), type: 'png' });

const ovPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const name of ['title', 'count', 'end']) {
  await ovPage.goto(`file://${join(overlays, `${name}.html`)}`);
  await ovPage.waitForTimeout(250);
  await ovPage.screenshot({
    path: join(raw, `ov-${name}.png`),
    omitBackground: name === 'count',
  });
}
await ovPage.close();
await context.close();
await browser.close();
console.log('raw captures written to', raw);
