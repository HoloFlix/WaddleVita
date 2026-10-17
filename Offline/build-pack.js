// Builds WaddleVita's offline pack from a Waddle Forever install: ONE file with Waddle Forever's server code and every game file the
// playable dates can reach. (The Vita accepts files only nine folders deep and VitaShell loses files in big copies, so a single file.)
//
//   node build-pack.js [--wf "<Waddle Forever folder>"] [--out <folder>] [--cutoff 2011-06-26] [--union media-union.json]
//
// Format: "WVPACK01", u64 little-endian index length, the index (JSON: {"files": {"code/server/boot.js": [offset, length], ...}}), then the data.
// Keys: code/server/..., code/common/..., code/package.json (the server's code), media/<package>/<path> (Waddle Forever's media folder).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const wf = path.resolve(arg('wf', path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs', 'Waddle Forever')));
const out = path.resolve(arg('out', path.join(process.cwd(), 'offline-pack')));
const cutoff = arg('cutoff', '2011-06-26');
const unionFile = arg('union', '');
const compiled = path.join(wf, 'resources', 'app', 'compiled');
const media = path.join(wf, 'media');

if (!fs.existsSync(path.join(compiled, 'server', 'boot.js'))) { console.error('Waddle Forever was not found at ' + wf + ' (use --wf).'); process.exit(1); }
if (!fs.existsSync(path.join(media, 'default'))) { console.error('Waddle Forever\'s media folder is missing at ' + media + ': start Waddle Forever once so it finishes downloading.'); process.exit(1); }

const entries = new Map();   // key -> absolute source path
const add = (key, abs) => { if (!entries.has(key)) entries.set(key, abs); };
const walk = (dir, fn) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, fn); else fn(p); } };

// the server's code
for (const d of ['server', 'common']) walk(path.join(compiled, d), (p) => { if (!p.endsWith('.map')) add('code/' + path.relative(compiled, p).split(path.sep).join('/'), p); });
add('code/package.json', path.join(wf, 'resources', 'app', 'package.json'));
// the menu's timeline page (the offline server answers the Waddle Forever menu itself, see emulator/offline/boot.js)
add('code/client/views/timeline/timeline.js', path.join(compiled, 'client', 'views', 'timeline', 'timeline.js'));

// the game files the playable dates reach
let union;
if (unionFile && fs.existsSync(unionFile)) union = JSON.parse(fs.readFileSync(unionFile, 'utf8'));
else {
  console.log('working out which game files the playable dates reach (about two minutes)...');
  const tmp = path.join(os.tmpdir(), 'wv-union-' + process.pid + '.json');
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'media-union.js'), wf, cutoff, tmp], { stdio: 'inherit' });
  union = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  try { fs.unlinkSync(tmp); } catch (e) { /* already gone */ }
}
let missing = 0;
for (const f of union.files) {
  const rel = f.split(/[\\/]/).join('/');
  const abs = path.join(media, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) add('media/' + rel, abs); else missing++;
}
// small folders that generators and the start pages read as a whole
for (const d of ['approximation', 'auto', 'fix', 'mammoth', 'mod', 'tool', 'unknown', 'slippers07']) {
  const dir = path.join(media, 'default', d);
  if (fs.existsSync(dir)) walk(dir, (p) => add('media/' + path.relative(media, p).split(path.sep).join('/'), p));
}
for (const w of union.websites || []) {
  const dir = path.join(media, 'default', 'websites', w);
  if (fs.existsSync(dir)) walk(dir, (p) => add('media/' + path.relative(media, p).split(path.sep).join('/'), p));
}

// the table of file references (made while the union was worked out): the offline server uses it instead of looking each one up
const built = new Date().toISOString();
if (!union.refs) { console.error('The union file has no "refs": run media-union.js again (or leave --union out).'); process.exit(1); }
const tableFile = path.join(os.tmpdir(), 'wv-mediapath-' + process.pid + '.json');
fs.writeFileSync(tableFile, JSON.stringify({ built, refs: union.refs }));
add('code/index/mediapath.json', tableFile);

// the index
const keys = [...entries.keys()].sort();
const files = {};
let offset = 0;
for (const k of keys) {
  const size = fs.statSync(entries.get(k)).size;
  files[k] = [offset, size];
  offset += size;
}
const index = Buffer.from(JSON.stringify({ files, cutoff, built }));
const head = Buffer.alloc(16);
head.write('WVPACK01', 0, 'latin1');
head.writeBigUInt64LE(BigInt(index.length), 8);

fs.mkdirSync(out, { recursive: true });
const packPath = path.join(out, 'offline.pack');
const fd = fs.openSync(packPath, 'w');
let pos = 0;
const write = (buf) => { fs.writeSync(fd, buf, 0, buf.length, pos); pos += buf.length; };
write(head); write(index);
const hash = crypto.createHash('sha256');
let n = 0;
for (const k of keys) {
  const data = fs.readFileSync(entries.get(k));
  write(data);
  n++;
  if (n % 2000 === 0) console.log(`${n}/${keys.length} files, ${(pos / 1048576).toFixed(0)} MB`);
}
fs.closeSync(fd);
try { fs.unlinkSync(tableFile); } catch (e) { /* already gone */ }
console.log(`pack: ${keys.length} files, ${(pos / 1048576).toFixed(1)} MB (${missing} listed files are not in this Waddle Forever install and were skipped)`);
console.log('writing the checksum...');
const h = crypto.createHash('sha256');
const rfd = fs.openSync(packPath, 'r');
const buf = Buffer.alloc(8 * 1024 * 1024);
for (let p = 0; ;) { const r = fs.readSync(rfd, buf, 0, buf.length, p); if (r <= 0) break; h.update(buf.subarray(0, r)); p += r; }
fs.closeSync(rfd);
fs.writeFileSync(path.join(out, 'offline.pack.sha256'), h.digest('hex') + '  offline.pack\n');
console.log('done: ' + packPath);
