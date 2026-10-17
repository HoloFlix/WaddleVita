// Waddle Forever companion for the Vita client.
//
// Waddle Forever's timeline picker, settings, mods and reset live in its Electron app (menu items that open windows and talk to
// the server over IPC); its server only reads settings.json. This script starts Waddle Forever's three services (HTTP, login,
// world) in ONE process, so it shares the live settings, and adds a small JSON API for a client without that menu (the Vita):
//
//   GET  /vita/info                    { name, wfVersion, version, entry, settings }
//   GET  /vita/entry                   { url, swf, width, height, flashvars: {lang: "en"} }  (what to start, from the server's own page)
//   GET  /vita/timeline[?year=2009]    { years: [...], current, days: [{ year, month, day, events: [{ text, image, party }] }] }
//   GET  /vita/settings                { settings }
//   POST /vita/settings                { settings: { fps30: true, ... }, reset: true }   (reset: wipe the running world like the picker does)
//   POST /vita/version                 { version: "2009-12-18", reset: true }            (pick a date on the timeline)
//   GET  /vita/mods                    { mods: [{ name, active }] }
//   POST /vita/mods                    { name, state }   -> { ok } or { ok: false, error }
//   POST /vita/reset                   {}
//   GET  /vita/players                 { players: [{ id, name }] }                       (who is connected now)
//   GET  /vita/commands                { commands: [...] }                               (Waddle Forever's chat commands, as in its Commands window)
//   POST /vita/command                 { id, command: "ai 413" }                         (run a command as that player)
//   GET  /vita/rooms                   { rooms: [{ key, id, name }] }                    (for "send a player to ...")
//   GET  /vita/items?q=hat             { items: [{ id, name, type }] }                   (find a clothing item to give)
//   POST /vita/kick                    { id }                                            (disconnect that player)
//   POST /vita/mute                    { name, muted: true }                             (their chat is dropped)
//   POST /vita/ban                     { name, banned: true }                            (kicked now, refused at login until unbanned)
//   GET  /vita/bans                    { bans: [...], mutes: [...] }
//   GET  /vita/chat?since=12           { next, chat: [{ n, t, id, name, room, text, muted }] }   (the last 500 messages)
//   GET  /admin                        the HTML admin dashboard (admin.html) for a browser
//
// Run:  node companion.js            (env: WF_APP = <Waddle Forever>/resources/app, WF_DATA_DIR = folder that holds "WaddleForever/",
//                                           COMPANION_PORT = 24110, COMPANION_TOKEN = the admin code (X-Token header) for other devices;
//                                           without it an 8-digit code is made once and kept in companion-code.txt; COMPANION_OPEN=1 = no code)
// Do not run it together with Waddle Forever's own app or server: they would fight over the same ports.
// Tested against Waddle Forever 1.5.1 (compiled/ layout). The game media is NOT part of this project; see README.md.
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const dgram = require('dgram');
const path = require('path');
const Module = require('module');

let PORT = Number(process.env.COMPANION_PORT || 24110);
// Waddle Forever's handlers throw from timers when a game gets an impossible request; one bad packet must not stop the server.
process.on('uncaughtException', (e) => console.error('uncaught: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => console.error('unhandled: ' + (e && e.stack || e)));

function findApp() {
  const home = os.homedir();
  const candidates = [
    process.env.WF_APP,
    // Windows installer (per user, or for everybody)
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Waddle Forever', 'resources', 'app'),
    path.join(process.env.ProgramFiles || '', 'Waddle Forever', 'resources', 'app'),
    // macOS
    '/Applications/Waddle Forever.app/Contents/Resources/app',
    path.join(home, 'Applications', 'Waddle Forever.app', 'Contents', 'Resources', 'app'),
    // Linux: unpacked release or a source checkout that was built (yarn build)
    path.join(home, 'Waddle-Forever'), path.join(home, 'WaddleForever'), path.join(home, 'waddle-forever'),
    path.join(home, 'Waddle Forever', 'resources', 'app'), '/opt/Waddle Forever/resources/app', '/opt/waddle-forever/resources/app',
    path.join(__dirname, '..', '..', '.cache', 'wf-app'),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(path.join(c, 'compiled', 'server', 'boot.js'))) return c;
  throw new Error('Waddle Forever was not found. Install it (https://github.com/nhaar/Waddle-Forever/releases), or set WF_APP to its folder (the one that holds "compiled").');
}
const APP = findApp();
// Waddle Forever's server reads the game media as ./media/default/..., relative to the working directory: the Waddle Forever
// install folder (the one that holds media/), or whichever folder WF_ROOT names.
const ROOT = [process.env.WF_ROOT, APP, path.join(APP, '..', '..')].filter(Boolean).find((d) => fs.existsSync(path.join(d, 'media', 'default')));
if (!ROOT) throw new Error('No media/default folder found next to Waddle Forever. Set WF_ROOT to the folder that contains media/.');
process.chdir(ROOT);
if (process.env.WF_DATA_DIR) process.env.APPDATA = process.env.WF_DATA_DIR;   // Waddle Forever keeps its data in %APPDATA%/WaddleForever
const req = (p) => require(path.join(APP, 'compiled', p));
// Where Waddle Forever keeps its data (Windows: %APPDATA%/WaddleForever, Linux and macOS: ~/.waddleforever); our files go next to it.
const DATA_DIR = (() => { try { return req('common/paths').USER_DATA_FOLDER; } catch { return path.join(os.homedir(), '.waddleforever'); } })();
// WF_PORT runs the whole server on other ports than 24105 (login, world follow it; the companion is 5 above) - for a second server on one PC.
if (process.env.WF_PORT) {
  req('common/constants').HTTP_PORT = Number(process.env.WF_PORT);
  if (!process.env.COMPANION_PORT) PORT = Number(process.env.WF_PORT) + 5;
}

// ---- the admin code: needed from other devices (the Vita, a phone), never from this PC itself ----
function loadToken() {
  if (process.env.COMPANION_TOKEN) return process.env.COMPANION_TOKEN;
  if (process.env.COMPANION_OPEN === '1') return '';
  const file = path.join(DATA_DIR, 'companion-code.txt');
  try { const t = fs.readFileSync(file, 'utf8').trim(); if (t) return t; } catch { /* first run */ }
  const code = String(require('crypto').randomBytes(4).readUInt32BE(0) % 100000000).padStart(8, '0');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(file, code); } catch (e) { console.error('could not save the admin code: ' + e.message); }
  return code;
}
const TOKEN = loadToken();
const isLocal = (request) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);

// ---- the timeline: Waddle Forever's own code, loaded with the Electron parts stubbed out ----
function loadTimeline() {
  const file = path.join(APP, 'compiled', 'client', 'views', 'timeline', 'timeline.js');
  const src = fs.readFileSync(file, 'utf8') + '\nexports.__vita = { getTimeline, getConsumedTimeline };';
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent === m) {
      if (request === 'electron') return { BrowserWindow: class {}, ipcMain: { on() {} } };
      if (request.endsWith('/popups')) return { getPopupCreator: () => () => undefined };
    }
    return load.apply(this, arguments);
  };
  try { m._compile(src, file); } finally { Module._load = load; }
  return m.exports.__vita;
}

let timelineCache = null;
function timeline() {
  if (!timelineCache) {
    const t = loadTimeline();
    timelineCache = t.getConsumedTimeline(t.getTimeline());
  }
  return timelineCache;
}

// ---- the entry page: which SWF the server wants started, and with which FlashVars ----
function parseEntry(html, base) {
  const attr = (tag, name) => {
    const m = new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(tag);
    return m ? m[1] : '';
  };
  const embed = /<embed\b[^>]*>/i.exec(html);
  const object = /<object\b[^>]*>/i.exec(html);
  let swf = '', flashvars = '', width = 0, height = 0;
  const param = (n) => {
    const m = new RegExp('<param\\b[^>]*name\\s*=\\s*["\']' + n + '["\'][^>]*value\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(html);
    return m ? m[1] : '';
  };
  swf = param('movie') || (object && attr(object[0], 'data')) || (embed && attr(embed[0], 'src')) || '';
  flashvars = param('flashvars') || (embed && attr(embed[0], 'flashvars')) || '';
  const sized = object ? object[0] : embed ? embed[0] : '';
  width = Number(attr(sized, 'width')) || 0;
  height = Number(attr(sized, 'height')) || 0;
  const vars = {};
  for (const pair of flashvars.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    vars[decodeURIComponent(i < 0 ? pair : pair.slice(0, i))] = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1));
  }
  return { swf, url: swf ? new URL(swf, base).toString() : '', width, height, flashvars: vars };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ---- moderation: bans and mutes (by penguin name), and a log of what was said ----
const modFile = path.join(DATA_DIR, 'companion-moderation.json');
const moderation = { bans: [], mutes: [] };
try { Object.assign(moderation, JSON.parse(fs.readFileSync(modFile, 'utf8'))); } catch { /* first run */ }
const norm = (name) => String(name).trim().toLowerCase().replace(/_/g, ' ');
const saveModeration = () => { try { fs.mkdirSync(path.dirname(modFile), { recursive: true }); fs.writeFileSync(modFile, JSON.stringify(moderation)); } catch (e) { console.error('could not save moderation:', e.message); } };
const isBanned = (name) => moderation.bans.includes(norm(name));
const isMuted = (name) => moderation.mutes.includes(norm(name));
const toggle = (list, name, on) => { const n = norm(name); const i = list.indexOf(n); if (on && i < 0) list.push(n); if (!on && i >= 0) list.splice(i, 1); saveModeration(); };

const createNpcEngine = require('./npc');
const npc = createNpcEngine({
  req, get settingsManager() { return settingsManager; }, getWorld: () => world, log: (m) => console.log(m),
  dataFile: path.join(DATA_DIR, 'companion-npc.json'),
});
const chat = [];
let chatCount = 0;
const CHAT_MAX = 500;
const roomOf = (penguin) => { try { const r = world._world.getPenguinRoom(penguin); return r ? (r.id ?? (r.getId && r.getId())) : null; } catch { return null; } };

// Wrap Waddle Forever's own handlers BEFORE the services start (they read these properties when the servers are created).
{
  const roomHandlers = req('server/socket-server/handlers/room');
  const sendMessage = roomHandlers.handleSendMessage;
  roomHandlers.handleSendMessage = function (ctx, ...args) {
    const penguin = ctx && ctx.penguin;
    const text = args[args.length - 1];
    const muted = penguin ? isMuted(penguin.name) : false;
    chat.push({ n: ++chatCount, t: Date.now(), id: penguin ? penguin.id : 0, name: penguin ? penguin.name : '?', room: penguin ? roomOf(penguin) : null, text: String(text), muted });
    if (chat.length > CHAT_MAX) chat.shift();
    if (muted) return undefined;           // a muted player talks to nobody
    const out = sendMessage.call(this, ctx, ...args);
    try { if (penguin && ctx.room) npc.onHumanChat(ctx.room, penguin, text); } catch (e) { console.error('npc chat:', e.message); }
    return out;
  };
  const loginHandlers = req('server/socket-server/handlers/login');
  const login = loginHandlers.login;
  loginHandlers.login = function (ctx, message) {
    const m = /<nick><!\[CDATA\[(.*)\]\]><\/nick>/.exec(message);
    if (m && isBanned(m[1])) {
      console.log('refused banned penguin: ' + m[1]);
      try { ctx.client.end(); } catch { /* already gone */ }
      return undefined;
    }
    if (m) { try { npc.playerLoggingIn(m[1].replace(/_/g, ' ')); } catch (e) { console.error('npc login:', e.message); } }
    return login.call(this, ctx, message);
  };
  const joinHandlers = req('server/socket-server/handlers/join');
  const buddyAccept = joinHandlers.handleBuddyAccept;
  joinHandlers.handleBuddyAccept = async function (ctx, requesterId) {
    const out = await buddyAccept.call(this, ctx, requesterId);
    try { npc.afterBuddyAccept(ctx, requesterId); } catch (e) { console.error('npc buddy:', e.message); }
    return out;
  };
}

/** A mod's modinfo.txt (name=, author=, version=, description=; the Speedrunners' mod manager writes it): { title, author, version, description }. */
function modInfo(name) {
  try {
    const text = fs.readFileSync(path.join(req('common/paths').MODS_DIRECTORY, name, 'modinfo.txt'), 'utf8');
    const o = {};
    for (const line of text.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) o[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    return { title: o.name || '', author: o.author || '', version: o.version || '', description: o.description || '' };
  } catch { return {}; }
}

function kick(id) {
  const penguin = world._world.getById(id);
  if (!penguin) return false;
  const client = world._msg.getClient(penguin);
  if (client) client.end();
  return true;
}

// ---- start Waddle Forever's services in this process ----
const boot = req('server/boot');
const settingsManager = req('server/settings').default;
const constants = req('common/constants');
let world = null;

async function reset() {
  if (world && typeof world.reset === 'function') await world.reset();
}

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(request) {
  return new Promise((resolve) => {
    let data = '';
    request.on('data', (c) => { data += c; if (data.length > 1 << 20) request.destroy(); });
    request.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
  });
}

const versions = req('server/routes/versions');

// ---- messages the 2008-2011 client understands but Waddle Forever's server never sends ----
// ma = moderator action line in the chat log, mm = blocked-message line, sma = mascot message (by its number in the mascot script),
// sg = tour-guide bubble for a room, e = error pop-up (the client's own wording for that code), shn = scavenger-hunt unlock day.
function mascotMessageList() {
  const out = [];
  let n = 0;
  for (const m of req('server/game-data/mascot-messages').MASCOT_MESSAGES) {
    for (const c of m.mascotScript) {
      for (const line of c.script || []) {
        out.push({ index: n++, mascot: m.mascotName, category: c.category, text: typeof line === 'string' ? line : line.message });
      }
    }
  }
  return out;
}
const humansOnly = () => world._world.players.filter((p) => !npc.isBot(p.id));
function targets(spec) {
  const w = world._world;
  if (!spec || spec === 'all') return humansOnly();
  if (spec.startsWith('room:')) { const r = w.getRoom(Number(spec.slice(5))); return r.players.filter((p) => !npc.isBot(p.id)); }
  if (spec.startsWith('player:')) { const p = w.getById(Number(spec.slice(7))); return p ? [p] : []; }
  return [];
}
function sendMessage(body) {
  const msg = world._msg;
  const to = targets(body.target);
  if (!to.length) return { ok: false, error: 'nobody to send it to (the target has no players)' };
  const who = body.about != null ? world._world.getById(Number(body.about)) : null;
  const speakerId = who ? who.id : Number(body.speaker) || 0;
  const speakerName = who ? who.name : String(body.nickname || '');
  switch (body.type) {
    case 'mod': {
      const action = { kick: 'k', mute: 'm', ban: 'b' }[body.action] || body.action;
      if (!['k', 'm', 'b'].includes(action)) return { ok: false, error: 'action must be kick, mute or ban' };
      msg.send(to, 'ma', action, speakerId, speakerName || 'A penguin');
      return { ok: true, sent: to.length };
    }
    case 'notice': {
      const text = String(body.text || '').slice(0, 200).replace(/%/g, '');
      if (!text) return { ok: false, error: 'text expected' };
      msg.send(to, 'mm', text, speakerId);
      return { ok: true, sent: to.length };
    }
    case 'mascot': {
      const list = mascotMessageList();
      const line = list.find((l) => l.index === Number(body.index));
      if (!line) return { ok: false, error: 'no such mascot message' };
      msg.send(to, 'sma', speakerId, line.index);
      return { ok: true, sent: to.length, text: line.text };
    }
    case 'guide': {
      msg.send(to, 'sg', speakerId, Number(body.room) || 100);
      return { ok: true, sent: to.length };
    }
    case 'error': {
      msg.send(to, 'e', Number(body.code));
      return { ok: true, sent: to.length };
    }
    case 'scavenger': {
      msg.send(to, 'shn', Number(body.day) || 1);
      return { ok: true, sent: to.length };
    }
    default: return { ok: false, error: 'unknown message type' };
  }
}

async function handle(request, res) {
  const url = new URL(request.url, 'http://localhost');
  const route = request.method + ' ' + url.pathname;
  if (route === 'GET /admin' || route === 'GET /') {
    const page = fs.readFileSync(path.join(__dirname, 'admin.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': page.length, 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  if (TOKEN && !isLocal(request) && request.headers['x-token'] !== TOKEN) return send(res, 401, { error: 'bad token' });
  const body = request.method === 'POST' ? await readBody(request) : {};
  if (body === null) return send(res, 400, { error: 'bad json' });
  const s = settingsManager.settings;
  const base = `http://127.0.0.1:${constants.HTTP_PORT}/`;

  if (route.startsWith('GET /vita/npc') || route.startsWith('POST /vita/npc')) {
    const out = await npc.api(route, body);
    if (out) return send(res, 200, out);
  }

  switch (route) {
    case 'GET /vita/info': {
      let entry = null;
      try { entry = parseEntry(await fetchText(base), base); } catch (e) { entry = { error: String(e.message) }; }
      return send(res, 200, { name: 'Waddle Forever companion', wfVersion: constants.VERSION, version: s.version, httpPort: constants.HTTP_PORT, entry, settings: s });
    }
    case 'GET /vita/entry':
      return send(res, 200, parseEntry(await fetchText(base), base));
    case 'GET /vita/timeline': {
      const days = timeline();
      const years = [...new Set(days.map((d) => d.year))];
      const year = Number(url.searchParams.get('year') || 0);
      return send(res, 200, { years, current: s.version, days: year ? days.filter((d) => d.year === year) : days.map((d) => ({ year: d.year, month: d.month, day: d.day, count: d.events.length })) });
    }
    case 'GET /vita/settings':
      return send(res, 200, { settings: s });
    case 'POST /vita/settings': {
      if (!body.settings || typeof body.settings !== 'object') return send(res, 400, { error: 'settings object expected' });
      const clean = {};
      for (const [k, v] of Object.entries(body.settings)) if (k in s && typeof v === typeof s[k]) clean[k] = v;
      if ('version' in clean && !versions.isVersionValid(clean.version)) return send(res, 400, { error: 'invalid version' });
      settingsManager.updateSettings(clean);
      if (body.reset === true) await reset();
      return send(res, 200, { ok: true, applied: Object.keys(clean), settings: settingsManager.settings });
    }
    case 'POST /vita/version': {
      if (typeof body.version !== 'string' || !versions.isVersionValid(body.version)) return send(res, 400, { error: 'invalid version' });
      settingsManager.updateSettings({ version: body.version });
      if (body.reset === true) await reset();
      return send(res, 200, { ok: true, version: settingsManager.settings.version });
    }
    case 'GET /vita/mods': {
      const mods = settingsManager.mods;
      // getMods() lists the folders in the mods directory (read fresh each time), so a mod copied in shows up without a restart
      return send(res, 200, { mods: mods.getMods().map((name) => ({ name, active: mods.isModActive(name), ...modInfo(name) })) });
    }
    case 'POST /vita/mods': {
      if (typeof body.name !== 'string') return send(res, 400, { error: 'name expected' });
      try {
        if (body.state) settingsManager.mods.setModActive(body.name); else settingsManager.mods.setModInactive(body.name);
      } catch (e) {
        return send(res, 200, { ok: false, error: String(e.message) });
      }
      await reset();
      return send(res, 200, { ok: true });
    }
    case 'GET /vita/players': {
      const list = world && world._world ? world._world.players : [];
      return send(res, 200, { players: list.map((pl) => ({ id: pl.id, name: pl.name, room: roomOf(pl), muted: isMuted(pl.name), banned: isBanned(pl.name), npc: npc.isBot(pl.id) })) });
    }
    case 'GET /vita/messages/mascot':
      return send(res, 200, { messages: mascotMessageList() });
    case 'POST /vita/message':
      return send(res, 200, sendMessage(body));
    case 'GET /vita/rooms': {
      const rooms = req('server/game-data/rooms').ROOMS;
      return send(res, 200, { rooms: Object.entries(rooms).map(([key, r]) => ({ key, id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    case 'GET /vita/items': {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const rows = req('server/game-logic/items').ITEMS.rows;
      const items = rows.filter((r) => !q || String(r.name).toLowerCase().includes(q) || String(r.id) === q).slice(0, 60).map((r) => ({ id: r.id, name: r.name, type: r.type }));
      return send(res, 200, { items });
    }
    case 'POST /vita/kick':
      if (typeof body.id !== 'number') return send(res, 400, { error: 'id (number) expected' });
      return send(res, 200, { ok: kick(body.id) });
    case 'POST /vita/mute':
      if (typeof body.name !== 'string') return send(res, 400, { error: 'name expected' });
      toggle(moderation.mutes, body.name, body.muted !== false);
      return send(res, 200, { ok: true, mutes: moderation.mutes });
    case 'POST /vita/ban': {
      if (typeof body.name !== 'string') return send(res, 400, { error: 'name expected' });
      const on = body.banned !== false;
      toggle(moderation.bans, body.name, on);
      if (on) for (const pl of world._world.players) if (norm(pl.name) === norm(body.name)) kick(pl.id);
      return send(res, 200, { ok: true, bans: moderation.bans });
    }
    case 'GET /vita/bans':
      return send(res, 200, { bans: moderation.bans, mutes: moderation.mutes });
    case 'GET /vita/chat': {
      const since = Number(url.searchParams.get('since') || 0);
      return send(res, 200, { next: chatCount, chat: chat.filter((c) => c.n > since) });
    }
    case 'GET /vita/commands': {
      let commands = [];
      try { commands = req('server/commands/commands').getCommandsList(); } catch (e) { return send(res, 200, { commands: [], error: String(e.message) }); }
      return send(res, 200, { commands });
    }
    case 'POST /vita/command': {
      if (typeof body.id !== 'number' || typeof body.command !== 'string') return send(res, 400, { error: 'id (number) and command (string) expected' });
      const m = body.command.match(/(\w+)(.*)/);   // same split as Waddle Forever's Commands window
      if (!m) return send(res, 400, { error: 'empty command' });
      const rest = m[2].trim();
      world.runCommand(body.id, m[1], rest === '' ? [] : rest.split(/\s+/));
      return send(res, 200, { ok: true, note: 'the result appears in the game, to that player' });
    }
    case 'POST /vita/reset':
      await reset();
      return send(res, 200, { ok: true });
    default:
      return send(res, 404, { error: 'unknown route' });
  }
}

// ---- server discovery: tell the LAN who we are, so the Vita can find this PC without typing its address ----
const VIRTUAL_ADAPTER = /vethernet|wsl|docker|virtualbox|vbox|vmware|vmnet|hyper-v|loopback|tailscale|zerotier|hamachi|vpn|\btap\b|\btun\d|^veth|^br-|^virbr|^utun|^awdl|^llw|bridge/i;
const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const PREFERRED_ADAPTER = /wi-?fi|wlan|wireless|^en0$|^eth0$|^ethernet/i;
/** The PC's addresses on the real network (Wi-Fi / Ethernet), best first; virtual adapters (WSL, Docker, VPN) are left out. */
function lanAddresses() {
  const all = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) all.push({ ...a, name });
  }
  let real = all.filter((a) => !VIRTUAL_ADAPTER.test(a.name) && isPrivate(a.address));
  if (!real.length) real = all.filter((a) => !VIRTUAL_ADAPTER.test(a.name));
  if (!real.length) real = all;
  return real.sort((a, b) => (PREFERRED_ADAPTER.test(b.name) ? 1 : 0) - (PREFERRED_ADAPTER.test(a.name) ? 1 : 0));
}
function broadcastOf(a) {
  const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
  return ip.map((b, i) => (b | (~mask[i] & 255))).join('.');
}
function announce() {
  const addrs = lanAddresses();
  console.log('');
  console.log('  ================  WaddleVita server is running  ================');
  const port = constants.HTTP_PORT === 24105 ? '' : ':' + constants.HTTP_PORT;
  if (!addrs.length) console.log('  No network connection found. Connect this PC to your Wi-Fi or router.');
  addrs.forEach((a, i) => console.log(i === 0 ? `  Vita address:  ${a.address}${port}` : `  (or:           ${a.address}${port}  on ${a.name})`));
  console.log(`  Admin page:    http://localhost:${PORT}/admin`);
  if (TOKEN) console.log(`  Admin code:    ${TOKEN}   (type it on the Vita's Server tab, Start button, to use the Waddle Forever menu)`);
  console.log('  The Vita finds this PC by itself on the same Wi-Fi (Server tab).');
  console.log('  =================================================================');
  console.log('');
  if (process.env.COMPANION_NO_BROADCAST) return;   // a test server must not show up on other devices
  const sock = dgram.createSocket('udp4');
  sock.on('error', (e) => console.log('discovery broadcast off: ' + e.message));
  sock.bind(0, () => {
    try { sock.setBroadcast(true); } catch (e) { return; }
    const msg = () => Buffer.from('WADDLEVITA1 ' + JSON.stringify({ name: os.hostname(), port: constants.HTTP_PORT }));
    const tick = () => {
      const m = msg();
      const targets = new Set(['255.255.255.255', ...lanAddresses().map(broadcastOf)]);
      for (const t of targets) sock.send(m, 24111, t, () => {});
    };
    tick();
    setInterval(tick, 2000).unref();
  });
}

(async () => {
  const failed = boot.startMods();
  if (failed.length) console.log('mods that failed to start: ' + failed.join(', '));
  world = await boot.startServices();
  npc.start();
  http.createServer((q, r) => handle(q, r).catch((e) => { console.error(e); send(r, 500, { error: String(e.message) }); }))
    .listen(PORT, () => {
      console.log(`companion API on port ${PORT} (Waddle Forever HTTP ${constants.HTTP_PORT}, ${TOKEN ? 'admin code required from other devices' : 'no admin code'}), version ${settingsManager.settings.version}`);
      announce();
    });
})().catch((e) => { console.error(e); process.exit(1); });
