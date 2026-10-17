// A tiny headless Club Penguin client for testing the companion (npc, messages): logs in to the world server by name and
// lets a script send and watch packets.   const c = await connect('Tester'); c.xt('s', 'j#jr', 100, 300, 300); ...
'use strict';
const net = require('net');

function connect(name, port = 24107, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host);
    sock.setEncoding('utf8');
    let buf = '';
    const waiters = [];
    const log = [];
    const client = {
      name, log, sock, id: 0,
      raw(s) { sock.write(s + '\0'); },
      xt(ext, code, ...args) { client.raw(`%xt%${ext}%${code}%1%${args.join('%')}${args.length ? '%' : ''}`); },
      /** Waits for a packet whose code matches; resolves with its args. */
      waitFor(code, ms = 8000, test = () => true) {
        const old = log.find((p) => p.code === code && test(p.args) && !p.taken);
        if (old) { old.taken = true; return Promise.resolve(old.args); }
        return new Promise((res, rej) => {
          const w = { code, test, res, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('timeout waiting for ' + code)); }, ms) };
          waiters.push(w);
        });
      },
      packets(code) { return log.filter((p) => p.code === code).map((p) => p.args); },
      close() { sock.destroy(); },
    };
    sock.on('data', (d) => {
      buf += d;
      const parts = buf.split('\0');
      buf = parts.pop();
      for (const raw of parts) {
        const m = /^%xt%([^%]+)%[^%]*%(.*)$/.exec(raw);
        if (!m) { log.push({ code: 'xml', args: [raw], raw }); continue; }
        const p = { code: m[1], args: m[2].replace(/%$/, '').split('%'), raw };
        log.push(p);
        for (const w of [...waiters]) if (w.code === p.code && w.test(p.args)) { clearTimeout(w.timer); waiters.splice(waiters.indexOf(w), 1); p.taken = true; w.res(p.args); }
      }
    });
    sock.on('error', reject);
    sock.on('connect', async () => {
      try {
        client.raw("<msg t='sys'><body action='verChk' r='0'><ver v='153' /></body></msg>");
        await sleep(300);
        client.raw("<msg t='sys'><body action='rndK' r='-1'></body></msg>");
        await sleep(300);
        client.raw(`<msg t='sys'><body action='login' r='0'><login z='w'><nick><![CDATA[${name}]]></nick><pword><![CDATA[x]]></pword></login></body></msg>`);
        const l = await client.waitFor('l', 8000);
        client.id = Number(l[0]);
        client.xt('s', 'j#js', client.id, 'x', 'en');
        await client.waitFor('jr', 8000).catch(() => {});
        resolve(client);
      } catch (e) { reject(e); }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { connect, sleep };
