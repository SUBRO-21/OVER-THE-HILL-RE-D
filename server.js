// Low Range LAN server: serves the game and relays driver positions between devices on the same Wi-Fi.
// No dependencies. Run with:  node server.js   (optional: PORT=4000 node server.js)
//
// How multiplayer works here: each browser drives its own truck and sends where it is about 15 times
// a second. This server does no physics; it just forwards those messages to the other browsers,
// remembers which map the group picked, and keeps the session's best times and map pins.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 3;
const MAP_COUNT = 5;            // must match the number of REGIONS in js/regions.js + big maps
const MAX_FRAME = 64 * 1024;
const MSG_PER_SEC = 60;         // a client sends ~16/s; anything far above that is dropped
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push('http://' + i.address + ':' + PORT);
  }
  return out;
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (_) { res.writeHead(400); res.end(); return; }
  if (url === '/') url = '/index.html';
  // Only the game page and files under js/ and assets/ are served. Normalising and re-checking the
  // prefix stops "../" tricks from reading anything else on this computer.
  const file = path.normalize(path.join(ROOT, url));
  const allowed = file === path.join(ROOT, 'index.html') || file.startsWith(path.join(ROOT, 'js') + path.sep) || file.startsWith(path.join(ROOT, 'assets') + path.sep);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!allowed || !type) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const clients = new Map();
let nextId = 1;
let currentMap = 0;
const results = {};
const pins = new Map(); // client id -> { id, x, z, m, name, slot }

function freeSlot() {
  const used = new Set([...clients.values()].map(c => c.slot));
  for (let s = 0; s < MAX_PLAYERS; s++) if (!used.has(s)) return s;
  return -1;
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const slot = freeSlot();
  if (slot < 0) {
    // Tell the browser why, then close. It shows "This game is full" and stops retrying.
    socket.write(frame(1, Buffer.from(JSON.stringify({ t: 'full', max: MAX_PLAYERS }))));
    socket.end(frame(8, Buffer.alloc(0)));
    console.log(`Turned away a driver: already ${MAX_PLAYERS} connected.`);
    return;
  }
  const c = { id: nextId++, slot, socket, name: 'Driver', buf: Buffer.alloc(0), tokens: MSG_PER_SEC, tokT: Date.now() };
  clients.set(c.id, c);
  send(c, { t: 'welcome', id: c.id, slot, map: currentMap, results, pins: [...pins.values()], lan: lanAddresses(), max: MAX_PLAYERS });
  socket.on('data', chunk => {
    c.buf = Buffer.concat([c.buf, chunk]);
    if (c.buf.length > MAX_FRAME * 4) { drop(c); return; }
    let f;
    while ((f = readFrame(c))) handleFrame(c, f);
  });
  socket.on('close', () => drop(c));
  socket.on('error', () => drop(c));
});

function readFrame(c) {
  const b = c.buf;
  if (b.length < 2) return null;
  const op = b[0] & 0x0f, masked = b[1] & 0x80;
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  if (len > MAX_FRAME) { drop(c); return null; }
  const maskOff = off;
  if (masked) off += 4;
  if (b.length < off + len) return null;
  const data = Buffer.from(b.subarray(off, off + len));
  if (masked) for (let i = 0; i < len; i++) data[i] ^= b[maskOff + (i & 3)];
  c.buf = b.subarray(off + len);
  return { op, data };
}

function frame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
function send(c, obj) { if (!c.socket.destroyed) c.socket.write(frame(1, Buffer.from(JSON.stringify(obj)))); }
function broadcast(obj, except) {
  const buf = frame(1, Buffer.from(JSON.stringify(obj)));
  for (const c of clients.values()) if (c !== except && !c.socket.destroyed) c.socket.write(buf);
}
function roster() {
  const players = [...clients.values()].map(c => ({ id: c.id, name: c.name, slot: c.slot }));
  players.max = MAX_PLAYERS;
  broadcast({ t: 'roster', players, max: MAX_PLAYERS });
}

function drop(c) {
  if (!clients.delete(c.id)) return;
  c.socket.destroy();
  pins.delete(c.id);
  broadcast({ t: 'leave', id: c.id });
  roster();
  console.log(`${c.name} left (${clients.size} connected)`);
}

const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Driver';
const num = v => typeof v === 'number' && Number.isFinite(v);

// Token bucket: refills MSG_PER_SEC tokens per second, each message costs one.
function allow(c) {
  const now = Date.now();
  c.tokens = Math.min(MSG_PER_SEC, c.tokens + (now - c.tokT) / 1000 * MSG_PER_SEC); c.tokT = now;
  if (c.tokens < 1) return false;
  c.tokens -= 1; return true;
}

function handleFrame(c, f) {
  if (f.op === 8) { drop(c); return; }
  if (f.op === 9) { c.socket.write(frame(10, f.data)); return; }
  if (f.op !== 1 || !allow(c)) return;
  let m;
  try { m = JSON.parse(f.data.toString('utf8')); } catch (_) { return; }
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'hello':
      c.name = cleanName(m.name);
      console.log(`${c.name} joined (${clients.size} of ${MAX_PLAYERS} connected)`);
      roster();
      break;
    case 'map':
      if (Number.isInteger(m.m) && m.m >= 0 && m.m < MAP_COUNT) { currentMap = m.m; broadcast({ t: 'map', m: m.m, by: c.name }, c); }
      break;
    case 's':
      c.name = cleanName(m.n);
      broadcast({ ...m, t: 's', id: c.id, n: c.name, sl: c.slot }, c);
      break;
    case 'pin':
      if (m.x === null) { pins.delete(c.id); broadcast({ t: 'pin', id: c.id, x: null }, c); break; }
      if (!num(m.x) || !num(m.z) || !Number.isInteger(m.m)) return;
      pins.set(c.id, { id: c.id, x: m.x, z: m.z, m: m.m, name: c.name, slot: c.slot });
      broadcast({ t: 'pin', ...pins.get(c.id) }, c);
      break;
    case 'finish': {
      if (!Number.isInteger(m.m) || !num(m.time)) return;
      const list = results[m.m] || (results[m.m] = []);
      list.push({ name: c.name, time: m.time, cairns: m.cairns | 0 });
      list.sort((a, b) => a.time - b.time);
      list.length = Math.min(list.length, 10);
      broadcast({ t: 'results', m: m.m, list, who: c.id, name: c.name, time: m.time });
      console.log(`${c.name} finished map ${m.m + 1} in ${m.time.toFixed(1)} s`);
      break;
    }
  }
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.log(`\nPort ${PORT} is already in use. Is Low Range already running in another window?\n`);
  else console.log(err);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('\nLow Range server is running.\n');
  console.log('On this computer:   http://localhost:' + PORT);
  const lan = lanAddresses();
  for (const a of lan) console.log('Friends open:       ' + a);
  if (!lan.length) console.log('No Wi-Fi address found. Connect this computer to the Wi-Fi your friends are on.');
  console.log(`\nUp to ${MAX_PLAYERS} drivers. Everyone must be on the same Wi-Fi.`);
  console.log('If friends cannot connect: when Windows asks, allow Node.js on Private networks.');
  console.log('(Missed it? Windows Security > Firewall > Allow an app > tick Node.js for Private.)');
  console.log('Keep this window open while you play. Press Ctrl+C to stop.\n');
});
