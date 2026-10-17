// Which media files can the playable dates reach? Builds Waddle Forever's GameData for every update date up to a cutoff and
// collects every file its routes point at (and the website folders). Usage: node media-union.js <WF install> <cutoff YYYY-MM-DD> <out.json>
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const wf = path.resolve(process.argv[2] || path.join(process.env.LOCALAPPDATA, 'Programs', 'Waddle Forever'));
const cutoff = process.argv[3] || '2011-06-26';
const out = process.argv[4] || 'media-union.json';
const compiled = path.join(wf, 'resources', 'app', 'compiled');

// an isolated data folder, so nothing of the user's is read or written
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-union-'));
process.env.APPDATA = tmp;
process.env.HOME = tmp;
fs.mkdirSync(path.join(tmp, 'WaddleForever'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'WaddleForever', 'settings.json'), JSON.stringify({ version: '2005-08-22' }));
process.chdir(wf);

const settings = require(path.join(compiled, 'server', 'settings')).default;
const { UPDATES } = require(path.join(compiled, 'server', 'updates', 'updates'));
const { GameData } = require(path.join(compiled, 'server', 'timelines', 'game-data'));

// every file reference the build resolves, with the path it resolves to (the offline server ships this as a table: see boot.js)
const refs = {};
const filesModule = require(path.join(compiled, 'server', 'game-data', 'files'));
const realMediaPath = filesModule.getMediaFilePath;
filesModule.getMediaFilePath = (ref) => {
  let r = refs[ref];
  if (r === undefined) { r = realMediaPath(ref).split(path.sep).join('/'); refs[ref] = r; }
  return r;
};
const dates = [...new Set(UPDATES.map((u) => u.date))].filter((d) => d <= cutoff).sort();
const gd = new GameData(settings);
const files = new Set();
const websites = new Set();
const t0 = Date.now();
dates.forEach((d, i) => {
  gd.update(d);
  for (const v of gd.state.files.values()) files.add(typeof v === 'string' ? v : '');
  if (gd.state.website) websites.add(gd.state.website);
  if (i % 100 === 0) console.log(`${i}/${dates.length} ${d}: ${files.size} files so far`);
});
fs.writeFileSync(out, JSON.stringify({ cutoff, dates: dates.length, files: [...files].filter(Boolean).sort(), websites: [...websites].sort(), refs }));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${dates.length} dates, ${files.size} files, websites ${[...websites].join(',')}`);
try { fs.rmdirSync(tmp, { recursive: true }); } catch (e) { /* temp folder, leave it */ }
