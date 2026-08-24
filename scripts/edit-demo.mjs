import { chromium } from 'playwright';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'scripts/demo-raw');
const work = join(rawDir, 'edit');
const brand = join(root, 'public/brand');
await mkdir(work, { recursive: true });

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited ${code}`))));
  });
}

async function probeDuration(file) {
  const { spawnSync } = await import('node:child_process');
  const out = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file],
    { encoding: 'utf8' }
  );
  return Number(out.stdout.trim());
}

const files = (await readdir(rawDir)).filter((f) => f.endsWith('.webm'));
if (!files.length) throw new Error('No webm recording in public/brand/demo-raw');
const ranked = await Promise.all(files.map(async (f) => ({ f, m: (await stat(join(rawDir, f))).mtimeMs })));
ranked.sort((a, b) => a.m - b.m);
const raw = join(rawDir, ranked[ranked.length - 1].f);
console.log('raw', raw);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const [file, out] of [
  [join(root, 'scripts/title-card.html'), join(work, 'title.png')],
  [join(root, 'scripts/end-card.html'), join(work, 'end.png')],
]) {
  await page.goto(`file://${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, type: 'png' });
}
await browser.close();

const titleMp4 = join(work, 'title.mp4');
const endMp4 = join(work, 'end.mp4');
const bodyMp4 = join(work, 'body60.mp4');
const outMp4 = join(brand, 'hero.mp4');
const poster = join(brand, 'hero.jpg');

const zoom = (seconds) =>
  `zoompan=z='min(zoom+0.00055,1.14)':d=${seconds * 60}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60,format=yuv420p`;

await run('ffmpeg', [
  '-y',
  '-loop',
  '1',
  '-i',
  join(work, 'title.png'),
  '-vf',
  zoom(3.2),
  '-t',
  '3.2',
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  titleMp4,
]);
await run('ffmpeg', [
  '-y',
  '-loop',
  '1',
  '-i',
  join(work, 'end.png'),
  '-vf',
  zoom(3.0),
  '-t',
  '3.0',
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'fast',
  '-pix_fmt',
  'yuv420p',
  endMp4,
]);

console.log('cutting, speeding the long crawl, grading to 60fps…');
await run('ffmpeg', [
  '-y',
  '-i',
  raw,
  '-filter_complex',
  [
    '[0:v]trim=1.30:8.40,setpts=PTS-STARTPTS[intro]',
    '[0:v]trim=8.40:14.00,setpts=PTS-STARTPTS[over1]',
    '[0:v]trim=14.00:29.20,setpts=(PTS-STARTPTS)/2.6[over2]',
    '[0:v]trim=29.20:119.80,setpts=(PTS-STARTPTS)/15[over3]',
    '[0:v]trim=119.80:128.00,setpts=PTS-STARTPTS[report]',
    '[0:v]trim=128.00:134.70,setpts=(PTS-STARTPTS)/1.35[price]',
    '[intro][over1][over2][over3][report][price]concat=n=6:v=1:a=0[cut]',
    "[cut]fps=60,minterpolate=fps=60:mi_mode=blend,unsharp=5:5:0.55:5:5:0.0,eq=contrast=1.05:saturation=1.08:gamma=0.98,vignette=PI/6,scale=1920:1080:flags=lanczos,format=yuv420p[v]",
  ].join(';'),
  '-map',
  '[v]',
  '-c:v',
  'libx264',
  '-crf',
  '17',
  '-preset',
  'medium',
  '-pix_fmt',
  'yuv420p',
  '-an',
  bodyMp4,
]);

const bodyDur = await probeDuration(bodyMp4);
const titleDur = 3.2;
const fade = 0.55;
const offset1 = titleDur - fade;
const offset2 = offset1 + bodyDur - fade;
console.log({ bodyDur, offset1, offset2 });

await run('ffmpeg', [
  '-y',
  '-i',
  titleMp4,
  '-i',
  bodyMp4,
  '-i',
  endMp4,
  '-filter_complex',
  `[0:v][1:v]xfade=transition=fade:duration=${fade}:offset=${offset1}[v1];[v1][2:v]xfade=transition=fade:duration=${fade}:offset=${offset2}[v]`,
  '-map',
  '[v]',
  '-c:v',
  'libx264',
  '-crf',
  '17',
  '-preset',
  'medium',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-an',
  outMp4,
]);

await run('ffmpeg', ['-y', '-ss', '8', '-i', outMp4, '-frames:v', '1', '-q:v', '3', poster]);
const finalDur = await probeDuration(outMp4);
console.log('wrote', outMp4, 'duration', finalDur);
