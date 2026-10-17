// NPC penguins for the Waddle Forever companion.
//
// Every NPC is a "bot client": a real Waddle Forever penguin (a WorldPenguin linked to a fake socket) that plays through the
// server's own message handlers exactly as a player's game would (walk, chat, emote, join a room, sit at a waddle or a table,
// pick a Card-Jitsu card...). So players see them, can click them, befriend them and play against them, and everything the
// server does for a player (room lists, buddy lists, 'ap'/'rp' packets, waddle seats) just works.
//
//   - ordinary NPCs: made up on the spot (ids 7,000,000+, never saved to disk)
//   - mascots (Rockhopper, Gary, Aunt Arctic...): Waddle Forever's own mascot accounts (ids 1-36). They can be scheduled to
//     appear and roam, they say their lines from Waddle Forever's mascot script, send each player they meet a buddy request and
//     (when accepted) give the mascot's background. Their accounts are never written to, so a player can still log in as one.
//   - the tour guide: a timed script that announces a tour, walks the stops and says the tour-guide text of every room.
//
// Everything is controlled from the admin dashboard (see api()).
'use strict';
const fs = require('fs');
const path = require('path');

const FIRST_NPC_ID = 7000000;
const TICK_MS = 1000;

// [key, id, name, since]: rooms an ordinary NPC may stand in. `since` is the first date (YYYY-MM-DD) the room is likely to exist.
const ROOMS = [
  ['town', 100, 'Town Center', '2005-08-22'], ['coffee', 110, 'Coffee Shop', '2005-08-22'], ['book', 111, 'Book Room', '2005-08-22'],
  ['dance', 120, 'Night Club', '2005-08-22'], ['lounge', 121, 'Lounge', '2005-08-22'], ['shop', 130, 'Clothes Shop', '2005-08-22'],
  ['village', 200, 'Ski Village', '2005-08-22'], ['lodge', 220, 'Ski Lodge', '2005-08-22'], ['attic', 221, 'Lodge Attic', '2005-08-22'],
  ['mtn', 230, 'Ski Hill', '2005-08-22'], ['plaza', 300, 'The Plaza', '2006-01-01'], ['pet', 310, 'Pet Shop', '2005-12-01'],
  ['dojo', 320, 'The Dojo', '2008-11-18'], ['pizza', 330, 'Pizza Parlor', '2006-04-01'], ['stage', 340, 'Stage', '2007-02-01'],
  ['beach', 400, 'The Beach', '2005-12-01'], ['light', 410, 'Lighthouse', '2006-05-01'], ['ship', 420, 'Pirate Ship', '2006-07-01'],
  ['dock', 800, 'The Dock', '2005-08-22'], ['forts', 801, 'Snow Forts', '2005-08-22'], ['rink', 802, 'Ice Rink', '2005-08-22'],
  ['berg', 805, 'Ice Berg', '2005-12-01'], ['cave', 806, 'Underground Pool', '2006-03-01'], ['shack', 807, 'Mine Shack', '2006-03-01'],
  ['forest', 809, 'Forest', '2005-08-22'], ['cove', 810, 'Cove', '2007-06-01'],
];
const ROOM_BY_ID = new Map(ROOMS.map((r) => [r[1], r]));
const ROOM_BY_KEY = new Map(ROOMS.map((r) => [r[0], r]));

// where a quiet penguin might stand when nothing better is known (760x480 room, floor in the lower half)
const FALLBACK_BOX = { x1: 120, y1: 260, x2: 650, y2: 420 };

const NAMES = ['Snowy', 'Frosty', 'Chilly', 'Waddles', 'Pebble', 'Icicle', 'Flipper', 'Mittens', 'Blizzard', 'Slushie', 'Tundra', 'Pengu', 'Puffy', 'Skippy',
  'Rocket', 'Cookie', 'Pizza', 'Sparky', 'Zippy', 'Bubbles', 'Cocoa', 'Penny', 'Moose', 'Fishy', 'Nacho', 'Jelly', 'Turbo', 'Glacier', 'Peanut', 'Ninja'];
const TAGS = ['', '', '', '1', '2', '99', 'X', 'Pro', 'Cool', '_', '123', 'FTW', 'Fan', '2005', '07', 'Boy', 'Girl', 'Bob'];

const GREETINGS = ['hi', 'hello', 'hey', 'hi everyone', 'hey guys', 'hiya', 'sup', 'hello!', 'hi :)', 'yo'];
const IDLE_LINES = ['anyone want to play?', 'this is fun', 'i love this place', 'brb', 'so what is everyone doing?', 'lol', 'haha', 'cool', 'nice', 'whats new?',
  'i just got coins', 'i am so bored', 'wanna be friends?', 'who wants to go sledding?', 'i like your outfit', 'this room is cool', 'has anyone seen a puffle?',
  'i need more coins', 'i am saving up for something', 'anyone want to throw snowballs?', 'ok', 'what is the best game?', 'my igloo is so cool',
  'omg', 'wow', 'hehe', 'wheres the pizza parlor?', 'i am new here', 'how do i get coins?', 'the coffee shop is my favorite'];
const ROOM_LINES = {
  coffee: ['i love the coffee shop', 'bean counters is my favorite game', 'anyone play bean counters?'],
  book: ['anyone want to play mancala?', 'i am reading a book', 'mancala is hard'],
  dance: ['i love dancing', 'this music is great', 'dance party!'],
  lounge: ['the lounge is so cozy', 'i like the arcade games'],
  shop: ['i need new clothes', 'i like the new catalog', 'what should i buy?'],
  pet: ['i want a puffle', 'puffles are so cute', 'which puffle should i get?'],
  dojo: ['who wants to play card jitsu?', 'i want to be a ninja', 'card jitsu is so fun', 'looking for a card jitsu match'],
  pizza: ['i want a pizza', 'i love making pizzas', 'extra cheese please'],
  lodge: ['anyone want to play find four?', 'find four is my favorite', 'i will beat you at find four'],
  attic: ['anyone want to play find four?', 'it is quiet up here'],
  mtn: ['who wants to race?', 'sled racing is awesome', 'i love the ski hill'],
  village: ['brr its cold', 'i love the ski village'],
  dock: ['i like the dock', 'hydro hopper is hard', 'look at the water'],
  forts: ['snowball fight!', 'i got you!', 'dont hit me'],
  rink: ['do you play hockey?', 'go team!', 'hockey is fun'],
  beach: ['i love the beach', 'lets go to the lighthouse'],
  light: ['i like the view', 'lets try the jetpack game'],
  ship: ['arr!', 'is rockhopper here?', 'i love the pirate ship'],
  plaza: ['i love the plaza', 'theres a lot to do here'],
  town: ['town is crowded', 'where is everybody going?', 'i like the town'],
};
const REPLIES = {
  greet: ['hi!', 'hello!', 'hey!', 'hi there', 'hiya!'],
  how: ['good, you?', 'great! how are you?', 'i am fine :)', 'pretty good'],
  friend: ['sure!', 'ok!', 'yeah lets be friends', 'sure why not'],
  game: ['yeah lets play!', 'ok i will play', 'sure!'],
  generic: ['lol', 'haha', 'yeah', 'cool', 'ok', 'nice', 'really?', 'hehe'],
};
const GAME_LINES = { start: ['good luck!', 'lets play!', 'ready?', 'have fun!'], win: ['yay i won!', 'good game!', 'gg'], lose: ['good game!', 'you are good!', 'gg', 'aw'] };

const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function defaults() {
  return {
    enabled: false,
    // how many ordinary NPC penguins there are, and where
    population: { total: 12, maxPerRoom: 6, humanBias: 40, rooms: {}, stayMin: 40, stayMax: 150 },
    // how much they talk: lines per NPC per minute, how much they answer players, and whether they say hello when someone arrives
    chat: { perMinute: 1.5, reply: 60, greetArrivals: true, quiet: 25 },
    // company: how often NPCs stand together in pairs / small groups
    groups: { pair: 30, group: 15, groupMax: 4 },
    // react to players using multiplayer games
    games: { react: true, card: true, sled: true, findFour: true, delaySec: 4 },
    mascots: { buddyRequests: true, giveBackground: true, list: {} },
    tour: { enabled: false, guide: 'Tour Guide', everyMinutes: 30, dwellSec: 25, announceRoom: 'town', stops: ['town', 'coffee', 'book', 'dance', 'lounge', 'shop', 'village', 'lodge', 'mtn', 'plaza', 'pizza', 'dock', 'forts', 'rink', 'beach', 'light'] },
    events: [],   // scheduled mascot/NPC appearances
    disabledRooms: [],
  };
}

module.exports = function createNpcEngine(env) {
  const { req, dataFile, log = console.log, getWorld } = env;
  const SM = () => env.settingsManager;
  const cfgFile = dataFile;
  let cfg = defaults();
  try { cfg = merge(defaults(), JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); } catch { /* first run */ }
  const save = () => { try { fs.mkdirSync(path.dirname(cfgFile), { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1)); } catch (e) { log('could not save npc settings: ' + e.message); } };

  function merge(base, extra) {
    for (const [k, v] of Object.entries(extra || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], v);
      else base[k] = v;
    }
    return base;
  }

  const W = () => getWorld();
  const WORLD = () => W()._world;
  const MSG = () => W()._msg;

  const joinMod = () => req('server/socket-server/handlers/join');
  const WorldPenguin = () => req('server/socket-server/world/world-penguin').WorldPenguin;
  const getDefaultPenguin = () => req('server/database/database').getDefaultPenguin;
  const mascotsData = () => req('server/game-data/mascots').MASCOTS;
  const mascotLines = () => req('server/game-data/mascot-messages').MASCOT_MESSAGES;
  const tourLines = () => req('server/game-data/tour-guide-messages').TOUR_GUIDE_MESSAGES;

  // ---- the game date and the clothes that exist on it ----
  const today = () => String(SM().settings.version || '2010-01-01').slice(0, 10);
  let itemCache = { date: '', byType: {} };
  function wardrobe() {
    const date = today();
    if (itemCache.date === date) return itemCache.byType;
    const byType = {};
    try {
      for (const r of req('server/game-logic/items').ITEMS.rows) {
        if (r.isEPF || r.isTour || r.isTreasure || r.isGift || r.isMedal || r.isBait || r.makeAgent) continue;
        if (r.releaseDate && String(r.releaseDate) > date) continue;
        if (r.cost > 2000) continue;
        (byType[r.type] = byType[r.type] || []).push(r.id);
      }
    } catch (e) { log('npc wardrobe: ' + e.message); }
    itemCache = { date, byType };
    return byType;
  }
  function randomLook() {
    const w = wardrobe();
    const maybe = (t, p) => (w[t] && w[t].length && Math.random() < p ? pick(w[t]) : 0);
    const colors = (w[1] || []).filter((id) => id <= 20);
    return { color: colors.length ? pick(colors) : irnd(1, 15), head: maybe(2, 0.55), face: maybe(3, 0.3), neck: maybe(4, 0.25), body: maybe(5, 0.4), hand: maybe(6, 0.15), feet: maybe(7, 0.15), background: 0, pin: 0 };
  }

  // ---- where penguins can stand: the walk zones and doors that the Vita asset build leaves behind (optional) ----
  const roomDirs = [process.env.WF_WALK_DIR, path.join(__dirname, '..', '..', '.cache', 'vita', 'rooms'), path.join(__dirname, 'rooms')].filter(Boolean);
  const walkCache = new Map();
  function roomInfo(id) {
    if (walkCache.has(id)) return walkCache.get(id);
    const info = { block: null, doors: [] };
    for (const dir of roomDirs) {
      try {
        const b = fs.readFileSync(path.join(dir, String(id), 'block.bin'));
        info.block = { w: b.readUInt16LE(0), h: b.readUInt16LE(2), cell: b[4], bits: b.subarray(5) };
      } catch { /* no walk zones for this room */ }
      try {
        for (const line of fs.readFileSync(path.join(dir, String(id), 'doors.txt'), 'utf8').split(/\r?\n/)) {
          const p = line.trim().split(/\s+/);
          if (p[0] === 'door' && p.length >= 8) info.doors.push({ to: Number(p[1]), x1: Number(p[2]), y1: Number(p[3]), x2: Number(p[4]), y2: Number(p[5]), ax: Number(p[6]), ay: Number(p[7]) });
        }
      } catch { /* no doors */ }
      if (info.block || info.doors.length) break;
    }
    walkCache.set(id, info);
    return info;
  }
  function blocked(info, x, y) {
    const b = info.block;
    if (!b) return false;
    const cx = Math.floor(x / b.cell), cy = Math.floor(y / b.cell);
    if (cx < 0 || cy < 0 || cx >= b.w || cy >= b.h) return true;
    const i = cy * b.w + cx;
    return ((b.bits[i >> 3] >> (i & 7)) & 1) === 1;
  }
  function walkable(roomId, x, y) {
    return !blocked(roomInfo(roomId), x, y);
  }
  function randomSpot(roomId, near, spread) {
    const info = roomInfo(roomId);
    for (let i = 0; i < 40; i++) {
      let x, y;
      if (near) { x = near.x + rnd(-spread, spread); y = near.y + rnd(-spread * 0.5, spread * 0.5); }
      else { x = rnd(FALLBACK_BOX.x1 - 40, FALLBACK_BOX.x2 + 60); y = rnd(FALLBACK_BOX.y1 - 40, FALLBACK_BOX.y2 + 30); }
      x = Math.round(Math.max(40, Math.min(720, x))); y = Math.round(Math.max(150, Math.min(450, y)));
      if (!blocked(info, x, y) && (info.block || (y >= 200))) return { x, y };
    }
    return { x: irnd(FALLBACK_BOX.x1, FALLBACK_BOX.x2), y: irnd(FALLBACK_BOX.y1, FALLBACK_BOX.y2) };
  }
  /** Where a penguin appears in `to` after walking through its door from `from` (the room's own arrival point), if it is known. */
  function arrivalSpot(to, from) {
    const d = roomInfo(to).doors.find((x) => x.to === from);
    return d && walkable(to, d.ax, d.ay) ? { x: d.ax, y: d.ay } : randomSpot(to);
  }
  function doorSpot(from, to) {
    const d = roomInfo(from).doors.find((x) => x.to === to);
    return d ? { x: Math.round((d.x1 + d.x2) / 2), y: Math.round((d.y1 + d.y2) / 2) } : null;
  }

  // ---- bots ----
  const bots = new Map();      // penguin id -> Bot
  let nextNpcId = FIRST_NPC_ID;
  let nextBotSeq = 0;
  const usedNames = new Set();

  const humans = () => WORLD().players.filter((p) => !bots.has(p.id));
  const roomObj = (p) => { const s = WORLD().getContext(p); return s && 'room' in s ? s.room : null; };
  const roomId = (p) => { const r = roomObj(p); return r ? r.id : null; };
  const normName = (n) => String(n).trim().toLowerCase().replace(/_/g, ' ');

  class Bot {
    constructor(spec) {
      this.seq = ++nextBotSeq;
      this.kind = spec.kind;                 // 'npc' | 'mascot' | 'guide'
      this.name = spec.name;
      this.mascotId = spec.mascotId || 0;
      this.json = spec.json;
      this.id = spec.id;
      this.penguin = null;
      this.alive = false;
      this.client = { write: async (m) => { try { this.onPacket(m); } catch (e) { log('npc packet: ' + e.message); } }, end: () => { this.alive = false; }, buffer: '', isBot: true };
      this.nextWalk = Date.now() + rnd(2000, 8000);
      this.nextTalk = Date.now() + rnd(4000, 40000);
      this.nextMove = Date.now() + rnd(cfg.population.stayMin, cfg.population.stayMax) * 1000;
      this.pos = { x: 0, y: 0 };
      this.busyUntil = 0;
      this.game = null;                      // what the bot is doing in a multiplayer game
      this.buddyAsked = new Set();
      this.pendingSay = [];
      this.groupWith = null;
      this.following = null;
      this.script = null;                    // mascot / guide script state
    }
    get room() { return this.penguin ? roomObj(this.penguin) : null; }
    get roomId() { return this.room ? this.room.id : null; }
    xt(ext, code, ...args) {
      if (!this.alive) return;
      const msg = `%xt%${ext}%${code}%1%${args.join('%')}${args.length ? '%' : ''}`;
      try { W().handle(this.client, msg); } catch (e) { log(`npc ${this.name} ${code}: ${e.message}`); }
    }
    async spawn(rid, spot) {
      const WP = WorldPenguin();
      this.penguin = new WP(this.id, this.json, SM());
      WORLD().addPenguin(this.penguin);
      MSG().linkClient(this.client, this.penguin);
      this.alive = true;
      bots.set(this.id, this);
      this.joinRoom(rid, spot);
      // players who are friends with this penguin see it come online
      try {
        const m = MSG();
        for (const h of humans()) if (h.buddy.isBuddy(this.id)) m.send(h, 'bon', this.id);
      } catch { /* the buddy list is a nicety */ }
      log(`npc: ${this.name} (${this.id}) appeared in ${roomName(rid)}`);
    }
    joinRoom(rid, spot) {
      spot = spot || randomSpot(rid);
      this.pos = spot;
      this.game = null;
      this.xt('s', 'j#jr', rid, spot.x, spot.y);
      this.xt('s', 'u#sf', 1);
    }
    walkTo(x, y) { this.pos = { x, y }; this.xt('s', 'u#sp', x, y); }
    say(text) {
      if (!text) return;
      this.xt('s', 'm#sm', this.id, String(text).replace(/%/g, ''));
    }
    emote(n) { this.xt('s', 'u#se', n); }
    wave() { this.xt('s', 'u#sa', 25); }
    despawn() {
      if (!this.alive) return;
      this.leaveGame();
      // the server's own disconnect: leaves the room, tells buddies, forgets the penguin
      Promise.resolve(W().disconnect(this.client)).catch((e) => log('npc despawn: ' + e.message));
      this.alive = false;
      bots.delete(this.id);
      if (this.kind === 'npc') usedNames.delete(normName(this.name));
    }
    leaveGame() { this.game = null; }

    // ---- what the server tells this bot ----
    onPacket(raw) {
      const m = /^%xt%([^%]+)%[^%]*%(.*)$/.exec(raw);
      if (!m) return;
      const code = m[1];
      const args = m[2].replace(/%$/, '').split('%');
      switch (code) {
        case 'br': case 'bq': this.onBuddyRequest(Number(args[0]), args[1]); break;
        case 'jg': this.onGameStart(args); break;
        case 'jz': if (this.game) this.onJoinedGame(args); break;
        case 'zm': if (this.game) this.onGameMove(args); break;
        case 'czo': case 'zo': if (this.game && this.game.kind === 'card') this.onGameOver(args); break;
        case 'lz': break;
        default: break;
      }
    }
    onBuddyRequest(fromId) {
      if (!fromId) return;
      // anyone may befriend an NPC (mascots take the request at once, the others a moment later)
      setTimeout(() => { if (this.alive) this.xt('s', 'b#ba', fromId); }, this.kind === 'npc' ? irnd(1500, 6000) : 800);
    }

    // ---- multiplayer games ----
    onGameStart(args) {
      const gid = Number(args[0]);
      const ctx = WORLD().getContext(this.penguin) || {};
      if ('card' in ctx) this.game = { kind: 'card', seat: -1, cards: [], picked: false, round: 0, dealt: false };
      else if ('sled' in ctx) { this.game = { kind: 'sled', started: Date.now() }; setTimeout(() => this.finishSled(), irnd(40000, 70000)); }
      else if ('fire' in ctx) this.game = { kind: 'fire' };
      else this.game = { kind: 'other' };
      if (this.game.kind === 'card') {
        setTimeout(() => { this.xt('z', 'gz', gid); this.xt('z', 'uz'); }, irnd(800, 2000));
      }
      if (this.game.kind === 'sled') setTimeout(() => this.xt('z', 'jz'), irnd(500, 1500));
    }
    onJoinedGame(args) {
      const g = this.game;
      if (g.kind !== 'card') return;
      g.seat = Number(args[0]);
      if (!g.dealt) { g.dealt = true; setTimeout(() => this.xt('z', 'zm', 'deal', 5), irnd(600, 1500)); }
    }
    onGameMove(args) {
      const g = this.game;
      if (g.kind !== 'card') return;
      const what = args[0];
      if (what === 'deal') {
        const seat = Number(args[1]);
        if (seat === g.seat) { for (const c of args.slice(2)) g.cards.push(Number(String(c).split('|')[0])); }
        this.cardMaybePick();
      } else if (what === 'pick') {
        this.cardMaybePick();
      } else if (what === 'judge') {
        g.picked = false; g.round++;
        setTimeout(() => { if (this.alive && this.game === g) this.xt('z', 'zm', 'deal', 1); }, irnd(1500, 3000));
        setTimeout(() => this.cardMaybePick(), irnd(5000, 8000));
      }
    }
    cardMaybePick() {
      const g = this.game;
      if (!g || g.kind !== 'card' || g.picked || g.cards.length < 5) return;
      g.picked = true;
      const card = pick(g.cards);
      g.cards.splice(g.cards.indexOf(card), 1);
      setTimeout(() => { if (this.alive && this.game === g) this.xt('z', 'zm', 'pick', card); }, irnd(2500, 6500));
    }
    onGameOver() {
      const g = this.game;
      this.game = null;
      setTimeout(() => {
        if (!this.alive) return;
        this.xt('z', 'lz');
        const back = this.script && this.script.home ? this.script.home : 320;
        this.joinRoom(back, randomSpot(back));
        if (g && Math.random() < 0.6) setTimeout(() => this.say(pick(GAME_LINES.win)), 1500);
      }, irnd(3000, 6000));
    }
    finishSled() {
      if (!this.alive || !this.game || this.game.kind !== 'sled') return;
      this.xt('z', 'zo', irnd(2, 4));
      this.game = null;
      setTimeout(() => { if (this.alive) { const back = 230; this.joinRoom(back, randomSpot(back)); } }, 4000);
    }
  }

  const roomName = (id) => (ROOM_BY_ID.get(id) || [0, 0, 'room ' + id])[2];

  /** A Card-Jitsu deck (the starter deck), so an NPC can be dealt cards. */
  function starterCards() {
    try { return Object.fromEntries(req('server/game-logic/starter-deck').STARTER_DECKS[821].map((id) => [id, 1])); } catch { return {}; }
  }

  function newNpc() {
    let name;
    for (let i = 0; i < 30; i++) {
      name = pick(NAMES) + pick(TAGS);
      if (!usedNames.has(normName(name)) && !WORLD().players.some((p) => normName(p.name) === normName(name))) break;
    }
    usedNames.add(normName(name));
    const look = randomLook();
    const base = getDefaultPenguin()(name, look.color, true, Date.now());
    const json = { ...base, ...look, inventory: [look.color, look.head, look.face, look.neck, look.body, look.hand, look.feet].filter(Boolean), noSave: true, name: base.name, cards: starterCards(), cardProgress: 0, isNinja: false };
    return new Bot({ kind: 'npc', name: json.name, id: nextNpcId++, json });
  }

  async function newMascot(def) {
    const world = W();
    const off = await world._off.getPenguin(def.id);
    if (!off) return null;
    const json = { ...off.getJSON(), noSave: true, buddies: [] };
    if (!json.cards || !Object.keys(json.cards).length) json.cards = starterCards();
    // a mascot wears something recognisable
    return new Bot({ kind: 'mascot', name: def.display || def.name, mascotId: def.id, id: def.id, json });
  }

  // ---- the director: decides how many penguins stand where ----
  function eligibleRooms() {
    const d = today();
    return ROOMS.filter((r) => r[3] <= d && !cfg.disabledRooms.includes(r[0]));
  }
  function wantedPerRoom() {
    const rooms = eligibleRooms();
    const total = Math.max(0, Math.min(200, cfg.population.total));
    const cap = Math.max(1, cfg.population.maxPerRoom);
    const want = new Map(rooms.map((r) => [r[1], 0]));
    let left = total;
    // some go where the players are
    const hRooms = new Map();
    for (const h of humans()) { const id = roomId(h); if (id != null && want.has(id)) hRooms.set(id, (hRooms.get(id) || 0) + 1); }
    if (hRooms.size && cfg.population.humanBias > 0) {
      let budget = Math.round(total * cfg.population.humanBias / 100);
      for (const [id] of [...hRooms.entries()].sort((a, b) => b[1] - a[1])) {
        if (budget <= 0) break;
        const n = Math.min(budget, cap, 2 + Math.floor(Math.random() * 2));
        want.set(id, want.get(id) + n); budget -= n; left -= n;
      }
    }
    // the rest by the room weights (0 = never, 1 = normal, up to 10)
    const weights = rooms.map((r) => [r[1], Math.max(0, Number(cfg.population.rooms[r[0]] ?? 1))]);
    let sum = weights.reduce((a, [, w]) => a + w, 0);
    let guard = 0;
    while (left > 0 && sum > 0 && guard++ < 2000) {
      let t = Math.random() * sum;
      for (const [id, w] of weights) { t -= w; if (t <= 0) { if (want.get(id) < cap) { want.set(id, want.get(id) + 1); left--; } break; } }
    }
    return want;
  }

  let wanted = new Map();
  let wantedAt = 0;
  const regular = () => [...bots.values()].filter((b) => b.kind === 'npc');

  function balance() {
    const npcs = regular();
    const total = cfg.enabled ? Math.max(0, Math.min(200, cfg.population.total)) : 0;
    // too many: send the surplus home, one at a time
    if (npcs.length > total) { npcs[npcs.length - 1].despawn(); return; }
    if (npcs.length < total) {
      if (Date.now() - wantedAt > 8000 || !wanted.size) { wanted = wantedPerRoom(); wantedAt = Date.now(); }
      const count = new Map();
      for (const b of npcs) count.set(b.roomId, (count.get(b.roomId) || 0) + 1);
      let target = null, best = 0;
      for (const [id, n] of wanted) { const gap = n - (count.get(id) || 0); if (gap > best) { best = gap; target = id; } }
      if (target == null) { const e = eligibleRooms(); if (!e.length) return; target = pick(e)[1]; }
      const bot = newNpc();
      bot.spawn(target, randomSpot(target)).catch((e) => log('npc spawn: ' + e.message));
    }
  }

  /** Players who walk into a room with nobody in it soon get some company: a few NPCs are called over from rooms that have too many. */
  function pullNpcs(now) {
    if (now - lastPull < 4000 || cfg.population.humanBias <= 0) return;
    lastPull = now;
    if (now - wantedAt > 8000 || !wanted.size) { wanted = wantedPerRoom(); wantedAt = now; }
    const count = new Map();
    const list = regular();
    for (const b of list) count.set(b.roomId, (count.get(b.roomId) || 0) + 1);
    for (const [id, n] of wanted) {
      if ((count.get(id) || 0) >= n) continue;
      const donor = list.find((b) => b.roomId !== id && (count.get(b.roomId) || 0) > (wanted.get(b.roomId) || 0) && !b.game && now >= b.busyUntil && !b.called);
      if (donor) { donor.nextMove = Math.min(donor.nextMove, now + rnd(1500, 9000)); donor.callTo = id; count.set(id, (count.get(id) || 0) + 1); count.set(donor.roomId, count.get(donor.roomId) - 1); }
    }
  }
  let lastPull = 0;

  function sayTo(bot, text, delay) {
    const typing = Math.min(5000, 600 + String(text).length * 90);
    setTimeout(() => { if (bot.alive) bot.say(text); }, (delay || 0) + typing);
  }

  function roomLine(rid) {
    const entry = ROOM_BY_ID.get(rid);
    const pool = [...IDLE_LINES, ...IDLE_LINES, ...(entry && ROOM_LINES[entry[0]] ? ROOM_LINES[entry[0]] : [])];
    return pick(pool);
  }

  function tickBot(bot, now) {
    if (!bot.alive || !bot.room) return;
    if (bot.game || now < bot.busyUntil) return;
    if (bot.kind === 'mascot' || bot.kind === 'guide') return;   // their scripts move them
    const room = bot.room;
    const rid = room.id;
    // walking about (staying by the group if in one)
    if (now >= bot.nextWalk) {
      const near = bot.groupWith && bot.groupWith.alive && bot.groupWith.roomId === rid ? bot.groupWith.pos : null;
      const spot = randomSpot(rid, near, near ? 70 : 0);
      bot.walkTo(spot.x, spot.y);
      bot.nextWalk = now + (near ? rnd(6000, 16000) : rnd(5000, 25000));
    }
    // chat
    if (now >= bot.nextTalk) {
      const perMin = Math.max(0, cfg.chat.perMinute);
      bot.nextTalk = perMin > 0 ? now + rnd(0.4, 1.6) * 60000 / perMin : now + 3600000;
      const quiet = bot.quiet === undefined ? (bot.quiet = Math.random() * 100 < cfg.chat.quiet) : bot.quiet;
      if (!quiet) {
        const others = room.players.length;
        if (others > 1 && Math.random() < 0.25) sayTo(bot, pick(GREETINGS)); else sayTo(bot, roomLine(rid));
        if (Math.random() < 0.08) setTimeout(() => bot.alive && bot.emote(irnd(1, 12)), 1500);
      }
    }
    // moving on
    if (now >= bot.nextMove) {
      bot.nextMove = now + rnd(cfg.population.stayMin, cfg.population.stayMax) * 1000;
      const count = new Map();
      for (const b of regular()) count.set(b.roomId, (count.get(b.roomId) || 0) + 1);
      wanted = wantedPerRoom(); wantedAt = now;
      const options = [...wanted.entries()].filter(([id, n]) => id !== rid && n > (count.get(id) || 0));
      const called = bot.callTo; bot.callTo = 0;
      if ((called && called !== rid) || (options.length && Math.random() < 0.8)) {
        const to = called && called !== rid ? called : pick(options)[0];
        const door = doorSpot(rid, to);
        const leave = () => { if (bot.alive && !bot.game) bot.joinRoom(to, arrivalSpot(to, rid)); };
        if (door) { bot.walkTo(door.x, door.y); setTimeout(leave, irnd(2500, 5000)); } else leave();
        bot.groupWith = null;
      }
    }
  }

  function formGroups(now) {
    // pairs and small groups: a lone NPC may attach itself to another NPC in the same room
    const byRoom = new Map();
    for (const b of regular()) { if (!b.alive || b.game) continue; (byRoom.get(b.roomId) || byRoom.set(b.roomId, []).get(b.roomId)).push(b); }
    for (const list of byRoom.values()) {
      for (const b of list) {
        if (b.groupWith && (!b.groupWith.alive || b.groupWith.roomId !== b.roomId)) b.groupWith = null;
        if (b.groupWith || list.length < 2 || now < (b.nextGroupTry || 0)) continue;
        b.nextGroupTry = now + rnd(20000, 60000);
        const chance = list.length >= 3 ? cfg.groups.group : cfg.groups.pair;
        if (Math.random() * 100 > chance) continue;
        const mates = list.filter((o) => o !== b && o.groupWith !== b);
        if (!mates.length) continue;
        const anchor = pick(mates);
        // groups have a size limit
        const size = list.filter((o) => o.groupWith === anchor).length + 2;
        if (size > Math.max(2, cfg.groups.groupMax)) continue;
        b.groupWith = anchor;
        const spot = randomSpot(b.roomId, anchor.pos, 60);
        setTimeout(() => b.alive && b.walkTo(spot.x, spot.y), irnd(500, 2500));
        if (Math.random() < 0.5) sayTo(b, pick(GREETINGS), 2000);
      }
    }
  }

  // ---- reacting to players ----
  function onHumanChat(room, penguin, text) {
    if (!cfg.enabled || !room || bots.has(penguin.id)) return;
    const t = String(text).toLowerCase();
    const near = [...bots.values()].filter((b) => b.alive && b.roomId === room.id && b.kind !== 'guide');
    if (!near.length) return;
    // answer a player who names an NPC, or sometimes anyone in the room
    const named = near.find((b) => t.includes(String(b.name).toLowerCase()));
    const responders = named ? [named] : (Math.random() * 100 < cfg.chat.reply ? [pick(near)] : []);
    for (const b of responders) {
      let reply;
      if (/\b(hi|hello|hey|hiya|yo|sup)\b/.test(t)) reply = pick(REPLIES.greet);
      else if (/how are you|how r u|hows it going|how's it going/.test(t)) reply = pick(REPLIES.how);
      else if (/friend|buddy/.test(t)) { reply = pick(REPLIES.friend); if (b.kind === 'npc' && !b.buddyAsked.has(penguin.id)) { b.buddyAsked.add(penguin.id); setTimeout(() => b.alive && b.xt('s', 'b#br', penguin.id), 3000); } }
      else if (/play|game|jitsu|find four|sled|race/.test(t)) reply = pick(REPLIES.game);
      else if (named || Math.random() < 0.4) reply = pick(REPLIES.generic);
      if (reply) sayTo(b, reply, irnd(500, 2500));
    }
  }

  function onHumanJoinRoom() { /* arrivals are noticed in the tick, see greetArrivals */ }

  const seenInRoom = new Map();   // bot id -> Set of human ids already greeted in this stay
  function greetArrivals(now) {
    if (!cfg.chat.greetArrivals) return;
    for (const b of bots.values()) {
      if (!b.alive || !b.room || b.kind === 'guide' || b.game) continue;
      const here = new Set();
      for (const p of b.room.players) if (!bots.has(p.id)) here.add(p.id);
      let seen = seenInRoom.get(b.id);
      if (!seen || seen.room !== b.roomId) { seen = { room: b.roomId, ids: new Set(here) }; seenInRoom.set(b.id, seen); continue; }
      for (const id of here) {
        if (seen.ids.has(id)) continue;
        seen.ids.add(id);
        if (b.kind === 'npc' && Math.random() < 0.18 && now > b.nextTalk - 20000) { sayTo(b, pick(GREETINGS), irnd(1000, 4000)); if (Math.random() < 0.3) setTimeout(() => b.alive && b.wave(), 1500); }
      }
      for (const id of [...seen.ids]) if (!here.has(id)) seen.ids.delete(id);
    }
  }

  // multiplayer games: a lone player waiting for an opponent finds one
  function gameHelp(now) {
    if (!cfg.games.react) return;
    const delay = Math.max(1, cfg.games.delaySec) * 1000;
    const idle = (b) => b.alive && b.kind === 'npc' && !b.game && now >= b.busyUntil && b.room;
    for (const room of WORLD().rooms.values()) {
      if (!room.penguins.size) continue;
      const hs = room.players.filter((p) => !bots.has(p.id));
      if (!hs.length) continue;
      // waddles (Card-Jitsu, sled racing, Fire)
      for (const w of room.getWaddleRooms()) {
        const seats = w.getSeats();
        const kind = w.getGame ? w.getGame() : '';
        if (!((kind === 'card' && cfg.games.card) || (kind === 'sled' && cfg.games.sled))) continue;
        const seated = seats.filter(Boolean);
        const human = seated.some((p) => !bots.has(p.id));
        const botSeated = seated.filter((p) => bots.has(p.id));
        const key = 'w' + room.id + ':' + w.getId();
        const waiting = waitSince.get(key);
        if (!human) { waitSince.delete(key); for (const p of botSeated) { const b = bots.get(p.id); if (b) b.xt('z', 'lw'); } continue; }
        if (seated.length === seats.length) { waitSince.delete(key); continue; }
        if (!waiting) { waitSince.set(key, now); continue; }
        if (now - waiting < delay) continue;
        const free = seats.length - seated.length;
        const helpers = candidates(room, free, idle);
        for (const b of helpers) {
          const moveOn = () => { if (b.alive && !b.game) b.xt('z', 'jw', w.getId()); };
          if (b.roomId !== room.id) { b.joinRoom(room.id, randomSpot(room.id)); setTimeout(moveOn, 1500); } else moveOn();
          b.busyUntil = now + 15000;
        }
        waitSince.set(key, now + 1500);
      }
      // tables (Find Four)
      if (cfg.games.findFour) {
        for (const t of room.getTables()) {
          if (!t._board || t.constructor.name !== 'FindFourTable') continue;
          const seats = t.getSeats();
          const humanSeated = seats.some((p) => p && !bots.has(p.id));
          const key = 't' + room.id + ':' + t.getId();
          const botSeat = seats.map((p, i) => (p && bots.has(p.id) ? i : -1)).filter((i) => i >= 0);
          if (!humanSeated) { waitSince.delete(key); for (const i of botSeat) { const b = bots.get(seats[i].id); if (b) { b.xt('z', 'lz'); b.xt('s', 'a#lt'); b.tableMode = false; } } continue; }
          if (seats.every(Boolean)) { waitSince.delete(key); continue; }
          const w0 = waitSince.get(key);
          if (!w0) { waitSince.set(key, now); continue; }
          if (now - w0 < delay) continue;
          const b = candidates(room, 1, idle)[0];
          if (!b) continue;
          waitSince.set(key, now + 1500);
          b.busyUntil = now + 120000;
          b.tableMode = t;
          let wait = 0;
          if (b.roomId !== room.id) { b.joinRoom(room.id, randomSpot(room.id)); wait = 1800; }
          setTimeout(() => b.alive && b.xt('s', 'a#jt', t.getId()), wait);
          setTimeout(() => b.alive && b.xt('z', 'jz'), wait + 1200);
        }
      }
    }
    // bots playing Find Four take their turn
    for (const b of bots.values()) {
      if (!b.alive || !b.tableMode || !b.room) continue;
      const t = b.room.getPenguinTable(b.penguin);
      if (!t) { b.tableMode = false; b.busyUntil = 0; continue; }
      if (!t.hasStarted() || t.hasEnded()) { if (t.hasEnded() && !b.leavingTable) { b.leavingTable = true; setTimeout(() => { if (b.alive) { b.xt('z', 'lz'); b.xt('s', 'a#lt'); b.tableMode = false; b.busyUntil = 0; b.leavingTable = false; if (Math.random() < .6) b.say(pick(GAME_LINES.win)); } }, irnd(3000, 6000)); } continue; }
      const seat = t.getSeatIndex(b.penguin);
      if (seat === undefined || t.getTurn() !== seat || b.thinking) continue;
      b.thinking = true;
      setTimeout(() => {
        b.thinking = false;
        if (!b.alive || !t.hasStarted() || t.hasEnded() || t.getTurn() !== seat) return;
        const move = findFourMove(t, seat);
        if (move) b.xt('z', 'zm', move.col, move.row);
      }, irnd(1500, 4500));
    }
  }
  const waitSince = new Map();

  function candidates(room, n, test) {
    const mine = [...bots.values()].filter((b) => test(b));
    // prefer NPCs already in the room
    mine.sort((a, b) => (b.roomId === room.id ? 1 : 0) - (a.roomId === room.id ? 1 : 0) || Math.random() - 0.5);
    return mine.slice(0, n);
  }

  /** A sensible Find Four move: win if possible, block a win, else near the middle. */
  function findFourMove(t, seat) {
    const W_ = 7, H_ = 6;
    const board = t._board;
    if (!board) return null;
    const mine = seat + 1, theirs = 2 - seat;
    // which end of a column is the floor? learn it from the first piece dropped (an empty board: assume the high index)
    let floorHigh = true;
    outer: for (let c = 0; c < W_; c++) for (let r = 0; r < H_; r++) if (board[c][r] !== 0) { floorHigh = r >= H_ / 2; break outer; }
    const dropRow = (c) => {
      if (floorHigh) { for (let r = H_ - 1; r >= 0; r--) if (board[c][r] === 0) return r; }
      else { for (let r = 0; r < H_; r++) if (board[c][r] === 0) return r; }
      return -1;
    };
    const wins = (c, r, who) => {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let n = 1;
        for (const s of [1, -1]) { let x = c + dx * s, y = r + dy * s; while (x >= 0 && x < W_ && y >= 0 && y < H_ && board[x][y] === who) { n++; x += dx * s; y += dy * s; } }
        if (n >= 4) return true;
      }
      return false;
    };
    const cols = [];
    for (let c = 0; c < W_; c++) { const r = dropRow(c); if (r >= 0) cols.push({ col: c, row: r }); }
    if (!cols.length) return null;
    // the board's row 0 may be the top or the bottom depending on the table; find which end is "down" from existing pieces
    for (const m of cols) { board[m.col][m.row] = mine; const w = wins(m.col, m.row, mine); board[m.col][m.row] = 0; if (w) return m; }
    for (const m of cols) { board[m.col][m.row] = theirs; const w = wins(m.col, m.row, theirs); board[m.col][m.row] = 0; if (w) return m; }
    cols.sort((a, b) => Math.abs(a.col - 3) - Math.abs(b.col - 3) + (Math.random() - 0.5) * 2);
    return cols[0];
  }

  // ---- mascots ----
  const mascotDefs = () => mascotsData();
  const mascotState = new Map();   // mascot id -> { bot, sched }
  function mascotConf(def) {
    const k = String(def.id);
    return cfg.mascots.list[k] || (cfg.mascots.list[k] = { on: false, mode: 'stay', room: 'town', roam: ['town', 'plaza', 'dock', 'forts'], dwellSec: 60, talkEverySec: 25 });
  }
  function giftFor(def) {
    const c = mascotConf(def);
    if (c.gift) return Number(c.gift);
    // the mascot's own giveaway background, found by name in the item list
    const names = [def.display, def.name].filter(Boolean).map((n) => n.toLowerCase());
    let best = null;
    try {
      for (const r of req('server/game-logic/items').ITEMS.rows) {
        if (r.type !== 9) continue;
        const n = String(r.name).toLowerCase();
        if (names.some((x) => n.includes(x))) if (!best || String(r.releaseDate) < String(best.releaseDate)) best = r;
      }
    } catch { /* none */ }
    // none by name: the giveaway background the old private servers gave this mascot
    const FALLBACK = { Rockhopper: 9215, 'Aunt Arctic': 9196, Cadence: 9217, Gary: 9190, Franky: 9251, 'Petey K': 9251, 'G Billy': 9251, 'Stompin Bob': 9251, Sensei: 9200, Herbert: 9239, Dott: 9303, Rookie: 9250, Paige: 9193, Rocky: 9156, CeCe: 9156, Brady: 9211, McKenzie: 9211, Kermit: 9252, Sasquatch: 9277, 'Merry Walrus': 9286 };
    return best ? best.id : (FALLBACK[def.name] || 0);
  }
  function allLinesFor(def) {
    const found = mascotLines().find((m) => m.mascotName === def.name);
    if (!found) return { all: [], hello: [], directions: [] };
    const all = [], directions = [];
    for (const c of found.mascotScript) {
      const list = (c.script || []).map((s) => (typeof s === 'string' ? s : s.message)).filter(Boolean);
      all.push(...list);
      if (/direction/i.test(c.category)) directions.push(...list);
    }
    return { all, directions };
  }
  async function mascotOn(id) {
    const def = mascotDefs().find((m) => m.id === Number(id));
    if (!def) throw new Error('unknown mascot');
    if (bots.has(def.id)) return;
    if (WORLD().getById(def.id)) throw new Error(def.display + ' is logged in by a player');
    const bot = await newMascot(def);
    if (!bot) throw new Error('no account for ' + def.name);
    const c = mascotConf(def);
    const entry = ROOM_BY_KEY.get(c.room) || ROOMS[0];
    bot.script = { def, nextSay: Date.now() + 8000, nextRoam: Date.now() + (c.dwellSec || 60) * 1000, askedThisStay: new Set(), home: entry[1], stopIndex: 0 };
    await bot.spawn(entry[1], randomSpot(entry[1]));
    c.on = true; save();
  }
  function mascotOff(id) {
    const b = bots.get(Number(id));
    if (b && b.kind === 'mascot') { b.despawn(); const def = mascotDefs().find((m) => m.id === Number(id)); if (def) { mascotConf(def).on = false; save(); } }
  }

  function tickMascot(bot, now) {
    const s = bot.script; if (!s || !bot.room) return;
    const def = s.def; const c = mascotConf(def);
    const rid = bot.roomId;
    const here = bot.room.players.filter((p) => !bots.has(p.id));
    // meeting players: a buddy request for everyone who has not got one from this mascot yet
    if (cfg.mascots.buddyRequests) {
      for (const h of here) {
        if (h.buddy.isBuddy(bot.id) || s.askedThisStay.has(h.id) || bot.buddyAsked.has(h.id)) continue;
        s.askedThisStay.add(h.id);
        bot.buddyAsked.add(h.id);
        setTimeout(() => {
          if (!bot.alive || h.buddy.isBuddy(bot.id)) return;
          bot.wave();
          bot.xt('s', 'b#br', h.id);
        }, irnd(2500, 6000));
      }
      // forget players who left, so they get asked again next time they meet the mascot
      for (const id of [...s.askedThisStay]) if (!here.some((p) => p.id === id)) s.askedThisStay.delete(id);
    }
    // saying lines, only when someone is there to hear
    if (now >= s.nextSay) {
      s.nextSay = now + (c.talkEverySec || 25) * 1000 * rnd(0.7, 1.4);
      if (here.length) {
        const lines = allLinesFor(def);
        const line = pick(lines.all.length ? lines.all : ['Hello!']);
        sayTo(bot, line, 0);
        if (Math.random() < 0.5) bot.walkTo(...Object.values(randomSpot(rid)));
      } else if (Math.random() < 0.5) bot.walkTo(...Object.values(randomSpot(rid)));
    }
    // roaming
    if (c.mode === 'roam' && now >= s.nextRoam && !bot.game) {
      const stops = (c.roam || []).map((k) => ROOM_BY_KEY.get(k)).filter(Boolean);
      if (stops.length) {
        s.stopIndex = (s.stopIndex + 1) % stops.length;
        const dest = stops[s.stopIndex][1];
        s.nextRoam = now + (c.dwellSec || 60) * 1000 * rnd(0.8, 1.3);
        if (dest !== rid) {
          const lines = allLinesFor(def).directions;
          if (here.length) sayTo(bot, lines.length ? pick(lines) : `Let's go to the ${roomName(dest)}!`, 0);
          const door = doorSpot(rid, dest);
          const go = () => { if (bot.alive) { bot.joinRoom(dest, arrivalSpot(dest, rid)); s.askedThisStay.clear(); } };
          if (door) { setTimeout(() => bot.alive && bot.walkTo(door.x, door.y), 3500); setTimeout(go, 7000); } else setTimeout(go, 4000);
        }
      }
    }
  }

  /** After a mascot friendship is made, the player gets the mascot's background. */
  function afterBuddyAccept(ctx, otherId) {
    if (!cfg.mascots.giveBackground) return;
    const a = ctx.penguin, b = WORLD().getById(otherId);
    if (!a || !b) return;
    const mascot = bots.get(a.id) && bots.get(a.id).kind === 'mascot' ? a : (bots.get(b.id) && bots.get(b.id).kind === 'mascot' ? b : null);
    if (!mascot) return;
    const human = mascot === a ? b : a;
    if (bots.has(human.id)) return;
    const def = mascotDefs().find((m) => m.id === mascot.id);
    const item = def ? giftFor(def) : 0;
    if (!item || human.inventory.has(item)) return;
    const info = W()._gameData.getItem(item);
    human.inventory.add(item);
    try { MSG().send(human, 'ai', item, human.currency.coins); } catch { /* ignore */ }
    try { W()._persister(human); } catch { /* ignore */ }
    log(`mascot ${mascot.name} gave item ${item}${info ? ' (' + info.name + ')' : ''} to ${human.name}`);
  }

  // ---- the tour guide: a timed script ----
  const tour = { state: 'idle', bot: null, stop: 0, next: 0, stopAt: 0, lastStart: 0, announcedAt: 0 };
  function tourClock(now) {
    const t = cfg.tour;
    if (!t.enabled && tour.state === 'idle') return;
    if (tour.state === 'idle') {
      if (!tour.next) tour.next = now + 20000;
      if (now >= tour.next) startTour(now);
      return;
    }
    if (!t.enabled) { endTour(); return; }
    const bot = tour.bot;
    if (!bot || !bot.alive) { tour.state = 'idle'; tour.next = now + (t.everyMinutes || 30) * 60000; return; }
    if (tour.state === 'gather' && now >= tour.stopAt) { tour.state = 'tour'; tour.stop = -1; tour.stopAt = now; }
    if (tour.state === 'tour' && now >= tour.stopAt) {
      tour.stop++;
      const stops = t.stops.map((k) => ROOM_BY_KEY.get(k)).filter(Boolean);
      if (tour.stop >= stops.length) { sayGuide('That is the end of the tour! Thanks for coming along.'); setTimeout(endTour, 6000); tour.state = 'ending'; return; }
      const [key, id] = stops[tour.stop];
      const nextStop = stops[tour.stop + 1];
      const moveIn = () => {
        if (!bot.alive) return;
        bot.joinRoom(id, arrivalSpot(id, bot.roomId || 0));
        const text = tourLines()[key];
        const parts = text ? text.split('|') : [`This is the ${roomName(id)}.`];
        parts.forEach((line, i) => setTimeout(() => bot.alive && bot.say(line), 2500 + i * 3500));
        // the client's own tour-guide bubble, for the players who are there
        setTimeout(() => { try { sendTourGuide(bot, id); } catch { /* old client */ } }, 1500);
        if (nextStop) setTimeout(() => sayGuide(`Next stop: the ${nextStop[2]}! Use the map to meet me there.`), 3000 + parts.length * 3500);
        tour.stopAt = Date.now() + (t.dwellSec || 25) * 1000 + parts.length * 3500;
      };
      if (tour.stop === 0) { moveIn(); } else moveIn();
    }
  }
  function sayGuide(text) { const b = tour.bot; if (b && b.alive) b.say(text); }
  async function startTour(now) {
    const t = cfg.tour;
    const home = ROOM_BY_KEY.get(t.announceRoom) || ROOMS[0];
    const name = t.guide || 'Tour Guide';
    if (WORLD().players.some((p) => normName(p.name) === normName(name))) { tour.next = now + 60000; return; }
    const look = randomLook();
    const base = getDefaultPenguin()(name, 5, true, Date.now());
    const json = { ...base, ...look, color: 5, noSave: true, name: base.name, cards: starterCards() };
    const bot = new Bot({ kind: 'guide', name: json.name, id: nextNpcId++, json });
    tour.bot = bot; tour.state = 'gather'; tour.lastStart = now;
    await bot.spawn(home[1], randomSpot(home[1]));
    const first = ROOM_BY_KEY.get(t.stops[0]);
    bot.say(`Welcome! A tour of the island starts soon, and I will begin at the ${first ? first[2] : home[2]}.`);
    setTimeout(() => bot.alive && bot.say('Follow me, or use your map to meet me at each stop!'), 5000);
    tour.stopAt = now + 25000;
    log('tour: gathering');
  }
  function endTour() {
    if (tour.bot) tour.bot.despawn();
    tour.bot = null; tour.state = 'idle'; tour.next = Date.now() + (cfg.tour.everyMinutes || 30) * 60000;
  }
  function sendTourGuide(bot, rid) {
    for (const p of bot.room ? bot.room.players : []) if (!bots.has(p.id)) MSG().send(p, 'sg', bot.id, rid);
  }

  // ---- scheduled events: a mascot (or anyone) appears at a set time ----
  function tickEvents(now) {
    const d = new Date(now);
    const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    for (const ev of cfg.events) {
      if (!ev.on) continue;
      if (ev.lastRun === hhmm + d.toDateString()) continue;
      const days = ev.days && ev.days.length ? ev.days : [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(d.getDay())) continue;
      if (ev.at !== hhmm) { if (ev.until === hhmm && bots.has(Number(ev.mascot))) { mascotOff(ev.mascot); } continue; }
      ev.lastRun = hhmm + d.toDateString();
      if (ev.mascot) {
        const def = mascotDefs().find((m) => m.id === Number(ev.mascot));
        if (def) {
          const c = mascotConf(def);
          if (ev.room) c.room = ev.room;
          if (ev.mode) c.mode = ev.mode;
          if (ev.roam) c.roam = ev.roam;
          mascotOn(def.id).catch((e) => log('event: ' + e.message));
          if (ev.text) setTimeout(() => announceFrom(def.id, ev.text), 4000);
          if (ev.minutes) setTimeout(() => mascotOff(def.id), ev.minutes * 60000);
        }
      }
    }
    save();
  }
  function announceFrom(id, text) {
    const b = bots.get(Number(id));
    if (b && b.alive) b.say(text);
  }

  // ---- the clock ----
  let timer = null;
  let busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      if (!W() || !WORLD()) return;
      const now = Date.now();
      // bots that the server dropped (a world reset) are gone
      for (const [id, b] of [...bots]) if (!WORLD().getById(id)) { b.alive = false; bots.delete(id); usedNames.delete(normName(b.name)); }
      if (tour.bot && !tour.bot.alive) tour.bot = null;
      balance();
      for (const b of [...bots.values()]) {
        if (b.kind === 'npc') tickBot(b, now);
        else if (b.kind === 'mascot') tickMascot(b, now);
      }
      pullNpcs(now);
      formGroups(now);
      greetArrivals(now);
      gameHelp(now);
      tourClock(now);
      if (now - lastEventCheck > 15000) { lastEventCheck = now; tickEvents(now); }
    } catch (e) {
      log('npc tick: ' + (e && e.stack || e));
    } finally { busy = false; }
  }
  let lastEventCheck = 0;
  function start() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
    // mascots that were on at the last shutdown come back
    setTimeout(async () => {
      for (const def of mascotDefs()) if (cfg.mascots.list[String(def.id)] && cfg.mascots.list[String(def.id)].on) { try { await mascotOn(def.id); } catch (e) { log('mascot: ' + e.message); } }
    }, 3000);
  }
  function stopAll() {
    for (const b of [...bots.values()]) b.despawn();
    tour.state = 'idle'; tour.bot = null;
  }

  /** A player is about to log in under a name that a bot is using: the player wins. */
  function playerLoggingIn(name) {
    for (const b of [...bots.values()]) if (normName(b.name) === normName(name)) { b.despawn(); if (b.kind === 'mascot') { const c = mascotConf(b.script.def); c.on = false; save(); } }
  }

  function status() {
    return {
      enabled: cfg.enabled,
      count: regular().length,
      bots: [...bots.values()].map((b) => ({ id: b.id, name: b.name, kind: b.kind, room: b.roomId, roomName: b.roomId != null ? roomName(b.roomId) : '', game: b.game ? b.game.kind : (b.tableMode ? 'findfour' : '') })),
      tour: { state: tour.state, stop: tour.stop, next: tour.next },
      date: today(),
    };
  }

  // ---- the dashboard's API ----
  async function api(route, body) {
    switch (route) {
      case 'GET /vita/npc': {
        return { config: cfg, status: status(), rooms: eligibleRooms().map((r) => ({ key: r[0], id: r[1], name: r[2], weight: cfg.population.rooms[r[0]] ?? 1, off: cfg.disabledRooms.includes(r[0]) })), allRooms: ROOMS.map((r) => ({ key: r[0], id: r[1], name: r[2], since: r[3] })), mascots: mascotDefs().map((m) => ({ id: m.id, name: m.name, display: m.display, on: bots.has(m.id), conf: mascotConf(m), gift: giftFor(m), lines: allLinesFor(m).all.length })) };
      }
      case 'POST /vita/npc/config': {
        if (body.config && typeof body.config === 'object') {
          const next = merge(defaults(), JSON.parse(JSON.stringify(cfg)));
          merge(next, body.config);
          // numbers only where numbers belong
          const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);
          next.population.total = n(next.population.total, 0, 200, 12);
          next.population.maxPerRoom = n(next.population.maxPerRoom, 1, 60, 6);
          next.population.humanBias = n(next.population.humanBias, 0, 100, 40);
          next.population.stayMin = n(next.population.stayMin, 5, 3600, 40);
          next.population.stayMax = n(next.population.stayMax, next.population.stayMin, 7200, 150);
          next.chat.perMinute = n(next.chat.perMinute, 0, 20, 1.5);
          next.chat.reply = n(next.chat.reply, 0, 100, 60);
          next.chat.quiet = n(next.chat.quiet, 0, 100, 25);
          next.groups.pair = n(next.groups.pair, 0, 100, 30);
          next.groups.group = n(next.groups.group, 0, 100, 15);
          next.groups.groupMax = n(next.groups.groupMax, 2, 8, 4);
          next.games.delaySec = n(next.games.delaySec, 1, 120, 4);
          next.tour.everyMinutes = n(next.tour.everyMinutes, 1, 1440, 30);
          next.tour.dwellSec = n(next.tour.dwellSec, 5, 300, 25);
          cfg = next;
          wanted = new Map();
          if (!cfg.enabled) for (const b of regular()) b.despawn();
          save();
        }
        return { ok: true, config: cfg, status: status() };
      }
      case 'POST /vita/npc/clear': stopAll(); cfg.enabled = false; save(); return { ok: true };
      case 'POST /vita/npc/mascot': {
        const id = Number(body.id);
        const def = mascotDefs().find((m) => m.id === id);
        if (!def) return { ok: false, error: 'unknown mascot' };
        if (body.conf && typeof body.conf === 'object') Object.assign(mascotConf(def), body.conf);
        try {
          if (body.on === true) await mascotOn(id);
          else if (body.on === false) mascotOff(id);
        } catch (e) { return { ok: false, error: e.message }; }
        save();
        return { ok: true, status: status() };
      }
      case 'POST /vita/npc/mascot/send': {
        // move a mascot now, or have it say something
        const b = bots.get(Number(body.id));
        if (!b || b.kind !== 'mascot') return { ok: false, error: 'that mascot is not on the island' };
        if (body.room) { const r = ROOM_BY_KEY.get(body.room) || ROOM_BY_ID.get(Number(body.room)); if (!r) return { ok: false, error: 'unknown room' }; b.joinRoom(r[1], randomSpot(r[1])); b.script.askedThisStay.clear(); }
        if (body.say) b.say(String(body.say).slice(0, 120));
        if (body.wave) b.wave();
        return { ok: true };
      }
      case 'POST /vita/npc/say': {
        const b = bots.get(Number(body.id));
        if (!b) return { ok: false, error: 'no such NPC' };
        b.say(String(body.text || '').slice(0, 120));
        return { ok: true };
      }
      case 'POST /vita/npc/event': {
        // add or remove a scheduled appearance
        if (body.remove != null) { cfg.events = cfg.events.filter((e) => e.id !== body.remove); save(); return { ok: true, events: cfg.events }; }
        const ev = { id: Date.now().toString(36), on: true, at: String(body.at || '12:00'), until: body.until || '', mascot: Number(body.mascot) || 0, room: body.room || '', mode: body.mode || '', minutes: Number(body.minutes) || 0, text: String(body.text || '').slice(0, 120), days: Array.isArray(body.days) ? body.days.map(Number) : [] };
        cfg.events.push(ev); save();
        return { ok: true, events: cfg.events };
      }
      case 'POST /vita/npc/tour': {
        if (body.action === 'start') { tour.next = 0; cfg.tour.enabled = true; tour.state = 'idle'; await startTour(Date.now()); }
        else if (body.action === 'stop') endTour();
        else if (body.action === 'skip' && tour.state === 'tour') tour.stopAt = 0;
        save();
        return { ok: true, status: status() };
      }
      default: return null;
    }
  }

  return { api, start, onHumanChat, afterBuddyAccept, playerLoggingIn, stopAll, status, isBot: (id) => bots.has(id), ROOMS };
};
