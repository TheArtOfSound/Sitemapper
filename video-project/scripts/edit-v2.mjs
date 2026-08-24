import { spawn } from 'node:child_process';
import { mkdir, copyFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = join(root, 'video-project/raw');
const edit = join(root, 'video-project/edit');
const audioDir = join(root, 'video-project/audio');
const overlays = join(root, 'video-project/overlays');
const exportsDir = join(root, 'video-project/exports');
await mkdir(edit, { recursive: true });
await mkdir(audioDir, { recursive: true });
await mkdir(exportsDir, { recursive: true });

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}`))));
  });
}

async function stillClip(input, output, seconds, { y = 'ih/2-(ih/zoom/2)', z = 1.12, speed = 0.0007 } = {}) {
  const frames = Math.round(seconds * 60);
  await run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    input,
    '-vf',
    `zoompan=z='min(1+${speed}*on,${z})':d=${frames}:x='iw/2-(iw/zoom/2)':y='${y}':s=1920x1080:fps=60,format=yuv420p`,
    '-t',
    String(seconds),
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    output,
  ]);
}

async function cardClip(input, output, seconds) {
  const frames = Math.round(seconds * 60);
  await run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    input,
    '-vf',
    `scale=2880:1620,zoompan=z='min(1+0.00055*on,1.08)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60,format=yuv420p`,
    '-t',
    String(seconds),
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    output,
  ]);
}

const browser = await chromium.launch({ headless: true });
const capPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const name of ['cap-monitor', 'cap-site', 'cap-detect', 'cap-why', 'cap-recovered']) {
  await capPage.goto(`file://${join(overlays, `${name}.html`)}`);
  await capPage.waitForTimeout(180);
  await capPage.screenshot({ path: join(raw, `${name}.png`), omitBackground: true });
}
await browser.close();

const music = join(audioDir, 'pad.m4a');
await run('ffmpeg', [
  '-y',
  '-filter_complex',
  "aevalsrc='0.06*sin(2*PI*220*t)+0.05*sin(2*PI*(277.18+0.4*sin(2*PI*0.04*t))*t)+0.045*sin(2*PI*329.63*t)+0.03*sin(2*PI*440*t)+0.02*sin(2*PI*659.25*t)+0.015*sin(2*PI*110*t)':s=44100:d=56[a];[a]highpass=f=70,lowpass=f=1800,chorus=0.45:0.55:35:0.22:0.22:1.8,aecho=0.8:0.72:160:0.22,afade=t=in:st=0:d=1.8,afade=t=out:st=48:d=6,loudnorm=I=-23:LRA=7:TP=-2.5[out]",
  '-map',
  '[out]',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  music,
]);
await writeFile(
  join(audioDir, 'LICENSE.txt'),
  'Original ambient pad generated for this Sitemapper demo with FFmpeg aevalsrc.\nNo third-party sample. Safe to ship with the product video.\n'
);

const title = join(edit, 'title.mp4');
const app = join(edit, 'app.mp4');
const site = join(edit, 'site.mp4');
const incident = join(edit, 'incident.mp4');
const recovered = join(edit, 'recovered.mp4');
const end = join(edit, 'end.mp4');

await cardClip(join(raw, 'ov-title.png'), title, 3.6);
await stillClip(join(raw, '02-app.png'), app, 6.2, { y: 'ih*0.40-(ih/zoom/2)', z: 1.14, speed: 0.00085 });
await stillClip(join(raw, '03-site.png'), site, 5.0, { y: 'ih*0.34-(ih/zoom/2)', z: 1.12, speed: 0.0008 });
await stillClip(join(raw, '04-incident.png'), incident, 12.0, { y: 'ih*0.24-(ih/zoom/2)', z: 1.2, speed: 0.00095 });
await stillClip(join(raw, '04-incident.png'), recovered, 5.2, { y: 'ih*0.70-(ih/zoom/2)', z: 1.1, speed: 0.0006 });
await cardClip(join(raw, 'ov-end.png'), end, 4.4);

async function captioned(src, cap, out, seconds, inAt, hold) {
  await run('ffmpeg', [
    '-y',
    '-i',
    src,
    '-i',
    cap,
    '-filter_complex',
    `[1:v]format=rgba,fade=t=in:st=${inAt}:d=0.28:alpha=1,fade=t=out:st=${hold}:d=0.35:alpha=1[ov];[0:v][ov]overlay=0:0:format=auto`,
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-t',
    String(seconds),
    out,
  ]);
}

const appC = join(edit, 'app-c.mp4');
const siteC = join(edit, 'site-c.mp4');
const incC = join(edit, 'inc-c.mp4');
const recC = join(edit, 'rec-c.mp4');
await captioned(app, join(raw, 'cap-monitor.png'), appC, 6.2, 0.25, 5.4);
await captioned(site, join(raw, 'cap-site.png'), siteC, 5.0, 0.2, 4.3);
await captioned(incident, join(raw, 'cap-detect.png'), incC, 12.0, 0.35, 6.2);
await run('ffmpeg', [
  '-y',
  '-i',
  incC,
  '-i',
  join(raw, 'cap-why.png'),
  '-filter_complex',
  `[1:v]format=rgba,fade=t=in:st=6.5:d=0.3:alpha=1,fade=t=out:st=11.2:d=0.35:alpha=1[ov];[0:v][ov]overlay=0:0:format=auto`,
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  '-t',
  '12',
  join(edit, 'inc-c2.mp4'),
]);
const incC2 = join(edit, 'inc-c2.mp4');
await captioned(recovered, join(raw, 'cap-recovered.png'), recC, 5.2, 0.2, 4.5);

const clips = [
  [title, 3.6],
  [appC, 6.2],
  [siteC, 5.0],
  [incC2, 12.0],
  [recC, 5.2],
  [end, 4.4],
];
const fade = 0.32;
const inputs = [];
for (const [file] of clips) inputs.push('-i', file);
let filter = '';
let last = '[0:v]';
let acc = clips[0][1];
for (let i = 1; i < clips.length; i++) {
  const out = i === clips.length - 1 ? '[vout]' : `[v${i}]`;
  const at = acc - fade;
  filter += `${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${at.toFixed(3)}${out};`;
  last = out;
  acc = acc + clips[i][1] - fade;
}

const master = join(exportsDir, 'sitemapper-demo-master.mp4');
const web = join(exportsDir, 'sitemapper-demo-web.mp4');
const short = join(exportsDir, 'sitemapper-demo-short.mp4');

await run('ffmpeg', [
  '-y',
  ...inputs,
  '-i',
  music,
  '-filter_complex',
  `${filter.slice(0, -1)};[vout]format=yuv420p[v];[${clips.length}:a]atrim=0:${acc.toFixed(2)},afade=t=in:d=1.4,afade=t=out:st=${(acc - 2.4).toFixed(2)}:d=2.4,volume=0.55[a]`,
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
  '-b:a',
  '160k',
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
  '128k',
  '-movflags',
  '+faststart',
  web,
]);

await run('ffmpeg', [
  '-y',
  '-i',
  title,
  '-i',
  incC2,
  '-i',
  end,
  '-i',
  music,
  '-filter_complex',
  '[0:v][1:v]xfade=transition=fade:duration=0.3:offset=3.3[v1];[v1][2:v]xfade=transition=fade:duration=0.3:offset=14.8[vout];[3:a]atrim=0:19.2,afade=t=in:d=1,afade=t=out:st=16.8:d=2.2,volume=0.55[a]',
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
  '128k',
  '-shortest',
  '-movflags',
  '+faststart',
  '-r',
  '60',
  short,
]);

await copyFile(web, join(root, 'public/brand/hero.mp4'));
const report = [];
for (const file of [master, web, short]) {
  const s = await stat(file);
  report.push(`${file.split('/').pop()} ${s.size}`);
}
await writeFile(join(exportsDir, 'REPORT.txt'), report.join('\n') + `\nduration=${acc.toFixed(2)}s\n`);
console.log(report.join('\n'));
console.log('duration', acc.toFixed(2));
