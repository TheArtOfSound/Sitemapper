import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/brand/demo-raw');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const t0 = Date.now();
const mark = (label) => console.log(`MARK ${(Date.now() - t0) / 1000} ${label}`);

await page.goto('https://sitemapper.oortstack.com/', { waitUntil: 'networkidle' });
mark('home');
await page.waitForTimeout(1800);

const input = page.locator('#site');
await input.click();
await page.waitForTimeout(400);
await input.fill('');
await page.keyboard.type('https://imagineqira.com', { delay: 70 });
mark('typed');
await page.waitForTimeout(600);
await page.locator('#map-form button[type="submit"]').click();
mark('submit');

await page.waitForURL(/\/r\//, { timeout: 90_000 });
mark('report-url');
await page.getByRole('button', { name: 'Monitor this site' }).waitFor({ timeout: 90_000 });
mark('report-ready');
await page.waitForTimeout(1600);
await page.getByRole('button', { name: 'Monitor this site' }).scrollIntoViewIfNeeded();
mark('monitor-cta');
await page.waitForTimeout(2200);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await page.waitForTimeout(1200);

await page.goto('https://sitemapper.oortstack.com/pricing', { waitUntil: 'networkidle' });
mark('pricing');
await page.waitForTimeout(2200);
await page.goto('https://sitemapper.oortstack.com/login', { waitUntil: 'networkidle' });
mark('login');
await page.waitForTimeout(1800);

const video = page.video();
await page.close();
const rawPath = await video.path();
await context.close();
await browser.close();
console.log(rawPath);
