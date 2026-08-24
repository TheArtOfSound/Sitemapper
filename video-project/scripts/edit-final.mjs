import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = join(root, 'video-project/raw');
const edit = join(root, 'video-project/edit');
const exportsDir = join(root, 'video-project/exports');
await mkdir(edit, { recursive: true });
await mkdir(exportsDir, { recursive: true });

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} ${code}`))));
  });
}

function stillClip(input, output, seconds, { y = 'ih/2-(ih/zoom/2)', z = 1.08 } = {}) {
  const frames = Math.round(seconds * 60);
  return run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    input,
    '-vf',
    `zoompan=z='min(1+0.00032*on,${z})':d=${frames}:x='iw/2-(iw/zoom/2)':y='${y}':s=1920x1080:fps=60,format=yuv420p`,
    '-t',
    String(seconds),
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    output,
  ]);
}

function cardClip(input, output, seconds) {
  const frames = Math.round(seconds * 60);
  return run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    input,
    '-vf',
    `scale=2880:1620,zoompan=z='min(1+0.00028*on,1.06)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=60,format=yuv420p`,
    '-t',
    String(seconds),
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    output,
  ]);
}

const title = join(edit, 'title.mp4');
const app = join(edit, 'app.mp4');
const site = join(edit, 'site.mp4');
const incident = join(edit, 'incident.mp4');
const incidentOv = join(edit, 'incident-ov.mp4');
const recovered = join(edit, 'recovered.mp4');
const end = join(edit, 'end.mp4');

await cardClip(join(raw, 'ov-title.png'), title, 5.0);
await stillClip(join(raw, '02-app.png'), app, 8.0, { y: 'ih*0.42-(ih/zoom/2)', z: 1.07 });
await stillClip(join(raw, '03-site.png'), site, 6.5, { y: 'ih*0.38-(ih/zoom/2)', z: 1.06 });
await stillClip(join(raw, '04-incident.png'), incident, 14.0, { y: 'ih*0.28-(ih/zoom/2)', z: 1.1 });
await stillClip(join(raw, '04-incident.png'), recovered, 6.5, { y: 'ih*0.72-(ih/zoom/2)', z: 1.05 });
await cardClip(join(raw, 'ov-end.png'), end, 5.2);

await run('ffmpeg', [
  '-y',
  '-i',
  incident,
  '-i',
  join(raw, 'ov-count.png'),
  '-filter_complex',
  `[1:v]format=rgba,fade=t=in:st=3.2:d=0.4:alpha=1,fade=t=out:st=8.4:d=0.5:alpha=1[ov];[0:v][ov]overlay=0:0:format=auto`,
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'medium',
  '-pix_fmt',
  'yuv420p',
  '-t',
  '14',
  incidentOv,
]);

const clips = [
  [title, 5.0],
  [app, 8.0],
  [site, 6.5],
  [incidentOv, 14.0],
  [recovered, 6.5],
  [end, 5.2],
];
const fade = 0.45;
let offset = 0;
const inputs = [];
const labels = [];
for (const [file] of clips) {
  inputs.push('-i', file);
}
let filter = '';
for (let i = 0; i < clips.length; i++) {
  labels.push(`[${i}:v]`);
}
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
  '-filter_complex',
  filter.slice(0, -1),
  '-map',
  '[vout]',
  '-c:v',
  'libx264',
  '-crf',
  '16',
  '-preset',
  'medium',
  '-pix_fmt',
  'yuv420p',
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
  'medium',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-r',
  '60',
  web,
]);

// Short: title + incident + end
await run('ffmpeg', [
  '-y',
  '-i',
  title,
  '-i',
  incidentOv,
  '-i',
  end,
  '-filter_complex',
  '[0:v][1:v]xfade=transition=fade:duration=0.4:offset=4.6[v1];[v1][2:v]xfade=transition=fade:duration=0.4:offset=17.8[vout]',
  '-map',
  '[vout]',
  '-c:v',
  'libx264',
  '-crf',
  '18',
  '-preset',
  'medium',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-r',
  '60',
  short,
]);

await copyFile(web, join(root, 'public/brand/hero.mp4'));
await run('ffmpeg', [
  '-y',
  '-i',
  join(raw, '02-app.png'),
  '-vf',
  'scale=1920:1080',
  '-frames:v',
  '1',
  join(root, 'public/brand/hero.jpg'),
]);

const report = [];
for (const file of [master, web, short]) {
  const s = await stat(file);
  report.push(`${file.split('/').pop()} ${s.size} bytes`);
}
await writeFile(join(exportsDir, 'REPORT.txt'), report.join('\n') + `\nduration_chain=${acc.toFixed(2)}s\n`);
console.log(report.join('\n'));
console.log('approx duration', acc.toFixed(2));
