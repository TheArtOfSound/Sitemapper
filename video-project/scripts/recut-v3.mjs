import { spawn } from 'node:child_process';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = join(root, 'video-project/raw');
const edit = join(root, 'video-project/edit');
const overlays = join(root, 'video-project/overlays');
const exportsDir = join(root, 'video-project/exports');
const audio = join(root, 'video-project/audio/easylemon.mp3');
await mkdir(raw, { recursive: true });
await mkdir(join(edit, 'review'), { recursive: true });

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}`))));
  });
}

const captions = {
  'bar-title': ['SITEMAPPER', 'Your website can break without looking broken.'],
  'bar-monitor': ['MONITOR', 'One production site. 1,361 pages watched.'],
  'bar-site': ['OORTSTACK.COM', 'Latest scan still shows 1,361 sitemap URLs.'],
  'bar-detect': ['DETECT', 'Sitemap URLs dropped from 1,361 to 0.'],
  'bar-why': ['UNDERSTAND', 'Search visibility risk — pages may stop being discovered.'],
  'bar-then': ['THEN', 'A later scan recorded 1,361 URLs again.'],
};

const barHtml = (kicker, line) => `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@600&family=Source+Serif+4:opsz,wght@8..60,650&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:1920px;height:280px;background:#0d0f14;color:#fff;overflow:hidden}
.inner{height:280px;display:flex;flex-direction:column;justify-content:center;padding:0 72px;border-top:4px solid #4f6ef7}
.k{font:600 18px/1 "IBM Plex Sans";letter-spacing:.2em;color:#9db0ff}
b{display:block;margin-top:12px;font:650 48px/1.12 "Source Serif 4",Georgia,serif;letter-spacing:-.02em}
</style></head>
<body><div class="inner"><span class="k">${kicker}</span><b>${line}</b></div></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 280 }, deviceScaleFactor: 1 });
for (const [name, [kicker, line]] of Object.entries(captions)) {
  const htmlPath = join(overlays, `${name}.html`);
  await writeFile(htmlPath, barHtml(kicker, line));
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(raw, `${name}.png`) });
}
await page.setViewportSize({ width: 1920, height: 1080 });
await writeFile(
  join(overlays, 'end.html'),
  `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:1920px;height:1080px;background:#111318;color:#f6f7f9;
  font-family:"IBM Plex Sans",system-ui,sans-serif;overflow:hidden}
.wrap{height:1080px;display:flex;flex-direction:column;justify-content:center;padding:0 140px}
.word{font:600 28px/1 "Source Serif 4";color:#4f6ef7;margin:0 0 18px}
h1{margin:0 0 22px;font:600 64px/1.12 "Source Serif 4",Georgia,serif;letter-spacing:-.03em;max-width:18ch}
p{margin:0;color:#9aa3b2;font:400 22px/1.45 "IBM Plex Sans"}
</style></head>
<body>
<div class="wrap">
  <p class="word">Sitemapper</p>
  <h1>Know what changed before your traffic, customers, or revenue tell you.</h1>
  <p>sitemapper.oortstack.com</p>
  <p style="margin-top:28px;font-size:14px;color:#6b7280">Music: Easy Lemon — Kevin MacLeod (incompetech.com) · CC BY 3.0</p>
</div>
</body></html>`
);
await page.goto(`file://${join(overlays, 'end.html')}`);
await page.waitForTimeout(400);
await page.screenshot({ path: join(raw, 'ov-end.png') });
await browser.close();

async function burn(src, bars, out, duration) {
  const args = ['-y', '-i', src];
  for (const bar of bars) args.push('-i', join(raw, bar.file));
  const parts = bars.map((bar, i) => `[${i + 1}:v]scale=1920:280[c${i}];`);
  let chain = '[0:v]';
  bars.forEach((bar, i) => {
    const next = i === bars.length - 1 ? '[vout]' : `[t${i}]`;
    parts.push(`${chain}[c${i}]overlay=0:H-h:enable='between(t\\,${bar.in}\\,${bar.out})'${next};`);
    chain = next;
  });
  args.push(
    '-filter_complex',
    parts.join('').replace(/;$/, ''),
    '-map',
    '[vout]',
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-t',
    String(duration),
    out
  );
  await run('ffmpeg', args);
}

const titleC = join(edit, 'title-bar.mp4');
const appC = join(edit, 'app-bar.mp4');
const siteC = join(edit, 'site-bar.mp4');
const incC = join(edit, 'inc-bar.mp4');
const recC = join(edit, 'rec-bar.mp4');
const end = join(edit, 'end.mp4');

await burn(join(edit, 'title.mp4'), [{ file: 'bar-title.png', in: 0.05, out: 3.55 }], titleC, 3.6);
await burn(join(edit, 'app.mp4'), [{ file: 'bar-monitor.png', in: 0.05, out: 6.15 }], appC, 6.2);
await burn(join(edit, 'site.mp4'), [{ file: 'bar-site.png', in: 0.05, out: 4.95 }], siteC, 5.0);
await burn(
  join(edit, 'incident.mp4'),
  [
    { file: 'bar-detect.png', in: 0.05, out: 6.05 },
    { file: 'bar-why.png', in: 6.15, out: 11.9 },
  ],
  incC,
  12.0
);
await burn(join(edit, 'recovered.mp4'), [{ file: 'bar-then.png', in: 0.05, out: 5.15 }], recC, 5.2);

const frames = Math.round(4.4 * 60);
await run('ffmpeg', [
  '-y',
  '-loop',
  '1',
  '-i',
  join(raw, 'ov-end.png'),
  '-vf',
  `scale=2880:1620,zoompan=z='min(1+0.00055*on,1.08)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60,format=yuv420p`,
  '-t',
  '4.4',
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  end,
]);

const clips = [
  [titleC, 3.6],
  [appC, 6.2],
  [siteC, 5.0],
  [incC, 12.0],
  [recC, 5.2],
  [end, 4.4],
];
const fade = 0.32;
const inputs = [];
for (const [file] of clips) inputs.push('-i', file);
inputs.push('-i', audio);
let filter = '';
let last = '[0:v]';
let acc = clips[0][1];
for (let i = 1; i < clips.length; i++) {
  const out = i === clips.length - 1 ? '[vout]' : `[v${i}]`;
  filter += `${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${(acc - fade).toFixed(3)}${out};`;
  last = out;
  acc += clips[i][1] - fade;
}

const master = join(exportsDir, 'sitemapper-demo-master.mp4');
const web = join(exportsDir, 'sitemapper-demo-web.mp4');
const short = join(exportsDir, 'sitemapper-demo-short.mp4');
const dur = acc.toFixed(2);

await run('ffmpeg', [
  '-y',
  ...inputs,
  '-filter_complex',
  `${filter.slice(0, -1)};[vout]format=yuv420p[v];[${clips.length}:a]atrim=start=0.35:end=${(0.35 + acc).toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=0.35,afade=t=out:st=${(acc - 1.8).toFixed(2)}:d=1.8,volume=0.62[a]`,
  '-map',
  '[v]',
  '-map',
  '[a]',
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-ar',
  '44100',
  '-ac',
  '2',
  '-b:a',
  '192k',
  '-shortest',
  '-movflags',
  '+faststart',
  '-r',
  '60',
  master,
]);

await run('ffmpeg', [
  '-y',
  '-i',
  master,
  '-c:v',
  'libx264',
  '-crf',
  '20',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-movflags',
  '+faststart',
  web,
]);

await run('ffmpeg', [
  '-y',
  '-i',
  titleC,
  '-i',
  incC,
  '-i',
  end,
  '-i',
  audio,
  '-filter_complex',
  '[0:v][1:v]xfade=transition=fade:duration=0.28:offset=3.32[v1];[v1][2:v]xfade=transition=fade:duration=0.28:offset=15.04[vout];[3:a]atrim=start=0.35:end=19.55,asetpts=PTS-STARTPTS,afade=t=in:d=0.35,afade=t=out:st=17.0:d=2.1,volume=0.62[a]',
  '-map',
  '[vout]',
  '-map',
  '[a]',
  '-c:v',
  'libx264',
  '-crf',
  '18',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-shortest',
  '-movflags',
  '+faststart',
  '-r',
  '60',
  short,
]);

await copyFile(web, join(root, 'public/brand/hero.mp4'));
await run('ffmpeg', [
  '-y',
  '-ss',
  '5.2',
  '-i',
  web,
  '-frames:v',
  '1',
  '-update',
  '1',
  join(root, 'public/brand/hero.jpg'),
]);

const review = join(edit, 'review');
for (const t of ['0.8', '5.2', '10.0', '16.5', '22.0', '27.5']) {
  await run('ffmpeg', [
    '-y',
    '-ss',
    t,
    '-i',
    web,
    '-frames:v',
    '1',
    '-update',
    '1',
    join(review, `v3-t${t.replace('.', '_')}.jpg`),
  ]);
}

await writeFile(
  join(root, 'video-project/audio/LICENSE.txt'),
  'Easy Lemon by Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 3.0\nhttp://creativecommons.org/licenses/by/3.0/\n'
);

await writeFile(
  join(root, 'public/brand/hero.vtt'),
  `WEBVTT

00:00.000 --> 00:03.500
SITEMAPPER
Your website can break without looking broken.

00:03.500 --> 00:09.300
MONITOR
One production site. 1,361 pages watched.

00:09.300 --> 00:14.100
OORTSTACK.COM
Latest scan still shows 1,361 sitemap URLs.

00:14.100 --> 00:20.200
DETECT
Sitemap URLs dropped from 1,361 to 0.

00:20.200 --> 00:25.700
UNDERSTAND
Search visibility risk — pages may stop being discovered.

00:25.700 --> 00:30.600
THEN
A later scan recorded 1,361 URLs again.

00:30.600 --> 00:34.800
SITEMAPPER
Know what changed before traffic, customers, or revenue tell you.
`
);

const s = await stat(web);
console.log('web', s.size, 'duration', dur);
