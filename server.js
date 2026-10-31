// Low Range LAN server: serves the game and relays driver positions between devices on the same Wi-Fi.
// No dependencies. Run with:  node server.js   (optional: PORT=4000 node server.js)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const GAME = path.join(__dirname, 'index.html');
const MAX_FRAME = 64 * 1024;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    fs.readFile(GAME, (err, data) => {
      if (err) { res.writeHead(500); res.end('index.html is missing next to server.js'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

const clients = new Map();
let nextId = 1;
let currentMap = 0;
const results = {};

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = { id: nextId++, socket, name: 'Driver', buf: Buffer.alloc(0) };
  clients.set(c.id, c);
  send(c, { t: 'welcome', id: c.id, map: currentMap, results });
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
function roster() { broadcast({ t: 'roster', players: [...clients.values()].map(c => ({ id: c.id, name: c.name })) }); }

function drop(c) {
  if (!clients.delete(c.id)) return;
  c.socket.destroy();
  broadcast({ t: 'leave', id: c.id });
  roster();
  console.log(`${c.name} left (${clients.size} connected)`);
}

const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Driver';

function handleFrame(c, f) {
  if (f.op === 8) { drop(c); return; }
  if (f.op === 9) { c.socket.write(frame(10, f.data)); return; }
  if (f.op !== 1) return;
  let m;
  try { m = JSON.parse(f.data.toString('utf8')); } catch (_) { return; }
  switch (m.t) {
    case 'hello':
      c.name = cleanName(m.name);
      console.log(`${c.name} joined (${clients.size} connected)`);
      roster();
      break;
    case 'map':
      if (Number.isInteger(m.m) && m.m >= 0 && m.m < 3) { currentMap = m.m; broadcast({ t: 'map', m: m.m, by: c.name }, c); }
      break;
    case 's':
      c.name = cleanName(m.n);
      broadcast({ ...m, t: 's', id: c.id, n: c.name }, c);
      break;
    case 'finish': {
      if (!Number.isInteger(m.m) || typeof m.time !== 'number') return;
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

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nLow Range server is running.\n');
  console.log('On this computer:   http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log('Other devices:      http://' + i.address + ':' + PORT);
  }
  console.log('\nEvery device must be on the same Wi-Fi. Press Ctrl+C to stop.\n');
});
