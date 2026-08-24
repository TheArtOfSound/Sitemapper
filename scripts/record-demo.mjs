import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts/demo-raw');
await mkdir(outDir, { recursive: true });

const ORIGIN = 'https://sitemapper.oortstack.com';
const W = 1920;
const H = 1080;

const demoInit = () => {
  if (window.__sitemapperDemo) return;
  window.__sitemapperDemo = true;
  const style = document.createElement('style');
  style.textContent = `
    html.demo-cam{transition:transform 1.15s cubic-bezier(.16,1,.3,1)}
    #demo-cursor{
      position:fixed;width:22px;height:22px;margin:0;padding:0;z-index:2147483646;
      left:0;top:0;pointer-events:none;border-radius:50%;
      border:2px solid #f4ece4;background:rgba(208,138,74,.92);
      box-shadow:0 0 0 6px rgba(208,138,74,.22),0 8px 22px rgba(0,0,0,.35);
      transform:translate(-30%,-30%);
    }
    #demo-cursor.down{transform:translate(-30%,-30%) scale(.72)}
    #demo-hl{
      position:fixed;pointer-events:none;z-index:2147483645;border-radius:10px;
      border:2px solid #d08a4a;
      box-shadow:0 0 0 9999px rgba(8,6,5,.48),0 0 32px rgba(208,138,74,.4);
      transition:left .35s cubic-bezier(.16,1,.3,1),top .35s cubic-bezier(.16,1,.3,1),width .35s cubic-bezier(.16,1,.3,1),height .35s cubic-bezier(.16,1,.3,1),opacity .3s ease;
    }
    #demo-cap{
      position:fixed;left:50%;bottom:42px;transform:translateX(-50%);
      z-index:2147483647;pointer-events:none;max-width:86%;
      background:rgba(20,15,12,.9);border:1px solid #4a3224;color:#f4ece4;
      padding:14px 22px;font:600 28px/1.25 "Source Serif 4",Georgia,serif;
      letter-spacing:-.01em;text-align:center;backdrop-filter:blur(8px);
    }
    #demo-cap small{display:block;margin-top:6px;font:12px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#7aa68a}
  `;
  document.documentElement.appendChild(style);
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  document.documentElement.appendChild(cursor);
  window.addEventListener(
    'mousemove',
    (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    },
    true
  );
  window.addEventListener('mousedown', () => cursor.classList.add('down'), true);
  window.addEventListener('mouseup', () => cursor.classList.remove('down'), true);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: outDir, size: { width: W, height: H } },
});
await context.addInitScript(demoInit);
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const t0 = Date.now();
const marks = [];
const mark = (label) => {
  const t = Number(((Date.now() - t0) / 1000).toFixed(2));
  marks.push({ t, label });
  console.log(`MARK ${t} ${label}`);
};

async function camera({ origin = '50% 40%', scale = 1, ms = 1100 } = {}) {
  await page.evaluate(
    ({ origin, scale, ms }) => {
      const r = document.documentElement;
      r.classList.add('demo-cam');
      r.style.transitionDuration = `${ms}ms`;
      r.style.transformOrigin = origin;
      r.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
    },
    { origin, scale, ms }
  );
  await page.waitForTimeout(ms + 60);
}

async function highlight(selector, pad = 10) {
  await page.evaluate(
    ({ selector, pad }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      let box = document.getElementById('demo-hl');
      if (!box) {
        box = document.createElement('div');
        box.id = 'demo-hl';
        document.body.appendChild(box);
      }
      box.style.opacity = '1';
      box.style.left = `${Math.max(8, r.left - pad)}px`;
      box.style.top = `${Math.max(8, r.top - pad)}px`;
      box.style.width = `${r.width + pad * 2}px`;
      box.style.height = `${r.height + pad * 2}px`;
    },
    { selector, pad }
  );
}

async function clearHighlight() {
  await page.evaluate(() => {
    const box = document.getElementById('demo-hl');
    if (box) box.style.opacity = '0';
  });
}

async function caption(text, kicker = 'Sitemapper') {
  await page.evaluate(
    ({ text, kicker }) => {
      let el = document.getElementById('demo-cap');
      if (!el) {
        el = document.createElement('div');
        el.id = 'demo-cap';
        document.body.appendChild(el);
      }
      el.innerHTML = `<small>${kicker}</small>${text}`;
    },
    { text, kicker }
  );
}

async function point(locator, steps = 22) {
  const box = await locator.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}

async function tap(locator) {
  await point(locator);
  await page.waitForTimeout(180);
  await locator.click({ delay: 40 });
}

await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
await page.addInitScript(demoInit);
await page.evaluate(demoInit);
mark('home');
await page.evaluate(() => {
  const stage = document.querySelector('.hero-stage');
  if (stage) stage.style.display = 'none';
});
await caption('No account. Paste a public site.');
await page.mouse.move(240, 180, { steps: 16 });
await page.waitForTimeout(900);
await camera({ origin: '50% 78%', scale: 1.38, ms: 1300 });
mark('zoom-form');
await highlight('#map-form', 14);
await page.waitForTimeout(500);
const input = page.locator('#site');
await point(input, 18);
await input.click();
await page.waitForTimeout(250);
await input.fill('');
await page.keyboard.type('https://wesearch.press', { delay: 52 });
mark('typed');
await page.waitForTimeout(380);
await highlight('#map-form button[type="submit"]', 12);
await caption('A real crawl — robots, sitemaps, live pages.', 'Free survey');
await tap(page.locator('#map-form button[type="submit"]'));
mark('submit');
await camera({ origin: '50% 50%', scale: 1, ms: 700 });
await clearHighlight();

await page.waitForSelector('#loading.on', { timeout: 12_000 }).catch(() => {});
mark('overlay');
await caption('You can see how far the survey still has to go.', 'Live progress');
await page.waitForFunction(() => parseInt(document.querySelector('#scan-pct')?.textContent || '0', 10) >= 20, { timeout: 60_000 }).catch(() => {});
mark('scan-20');
await page.waitForTimeout(1400);
await page.waitForFunction(() => parseInt(document.querySelector('#scan-pct')?.textContent || '0', 10) >= 55, { timeout: 60_000 }).catch(() => {});
mark('scan-55');
await page.waitForTimeout(1200);
await page.waitForFunction(() => parseInt(document.querySelector('#scan-pct')?.textContent || '0', 10) >= 90, { timeout: 60_000 }).catch(() => {});
mark('scan-90');
await page.waitForTimeout(600);
await page.waitForURL(/\/r\//, { timeout: 90_000 });
mark('report-url');
await page.getByRole('button', { name: 'Monitor this site' }).waitFor({ timeout: 90_000 });
mark('report-ready');
await page.evaluate(demoInit);
await caption('Declared inventory. Live evidence. Not a fake score.', 'Report');
await page.waitForTimeout(700);
await camera({ origin: '50% 32%', scale: 1.28, ms: 1200 });
mark('zoom-scores');
await page.waitForTimeout(1600);
await camera({ origin: '50% 50%', scale: 1, ms: 700 });
const monitor = page.getByRole('button', { name: 'Monitor this site' });
await monitor.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button, a')].find((el) => /Monitor this site/i.test(el.textContent || ''));
  if (btn) btn.id = 'demo-monitor';
});
await camera({ origin: '50% 70%', scale: 1.32, ms: 1000 });
await highlight('#demo-monitor', 12);
await point(monitor, 20);
await caption('Then monitor what a deploy changed.', 'Next');
mark('monitor-cta');
await page.waitForTimeout(1600);
await camera({ origin: '50% 50%', scale: 1, ms: 600 });
await clearHighlight();

await page.goto(`${ORIGIN}/pricing`, { waitUntil: 'networkidle' });
await page.evaluate(demoInit);
mark('pricing');
await caption('Builder $19 · Pro $49 · Agency $149', 'Pricing');
await camera({ origin: '50% 42%', scale: 1.18, ms: 1100 });
await page.waitForTimeout(1800);
await camera({ origin: '50% 50%', scale: 1, ms: 700 });
await page.waitForTimeout(600);
mark('end');

const video = page.video();
await page.close();
const rawPath = await video.path();
await context.close();
await browser.close();
await writeFile(join(outDir, 'marks.json'), JSON.stringify(marks, null, 2));
console.log(rawPath);
