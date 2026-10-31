'use strict';
/* ---------- Multiplayer (same Wi-Fi, via server.js) ---------- */
// How it works: every browser simulates only its own truck (so steering has zero lag) and sends
// its position about 15 times a second to server.js, which forwards it to everyone else. Other
// trucks are drawn slightly in the past (INTERP_MS) so there are always two received positions to
// blend between, which hides the uneven timing of Wi-Fi packets.
const INTERP_MS = 150, EXTRAP_MS = 200;
const net = { ws: null, id: 0, slot: 0, online: false, full: false, roster: [], results: {}, pins: new Map(), lan: [], sendT: 0,
  available: /^https?:$/.test(location.protocol) && !/claude/i.test(location.hostname) };
const remotes = new Map();
const nameInput = $('#playerName');
nameInput.value = storage(s => s.getItem('lowrange-name')) || 'Driver ' + Math.floor(100 + Math.random() * 900);
nameInput.addEventListener('change', () => {
  nameInput.value = nameInput.value.trim().slice(0, 16) || 'Driver';
  storage(s => s.setItem('lowrange-name', nameInput.value));
  if (net.online) sendNet({ t: 'hello', name: playerName() });
});
const playerName = () => (nameInput.value.trim() || 'Driver').slice(0, 16);
const slotColor = slot => PLAYER_COLORS[(slot | 0) % PLAYER_COLORS.length];

function sendNet(obj) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(obj)); }
function netConnect() {
  if (!net.available || net.full) { updateNetStatus(); return; }
  let ws;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (_) { updateNetStatus(); return; }
  net.ws = ws;
  ws.onopen = () => { net.online = true; sendNet({ t: 'hello', name: playerName() }); updateNetStatus(); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onNet(m); };
  ws.onclose = () => {
    const was = net.online;
    net.online = false; net.ws = null; net.roster = []; net.pins.clear();
    for (const id of [...remotes.keys()]) removeRemote(id);
    updateNetStatus();
    if (net.full) return;
    if (was) toast('Lost the connection to the Low Range server. Retrying.');
    setTimeout(netConnect, 3000);
  };
}
function onNet(m) {
  switch (m.t) {
    case 'welcome':
      net.id = m.id; net.slot = m.slot | 0; net.max = m.max || 3; net.results = m.results || {}; net.lan = Array.isArray(m.lan) ? m.lan : [];
      net.pins.clear();
      for (const p of m.pins || []) net.pins.set(p.id, p);
      if (!state.started && Number.isInteger(m.map) && m.map !== state.map && REGIONS[m.map]) selectMap(m.map, false);
      updateNetStatus();
      break;
    case 'full':
      net.full = true; net.max = m.max;
      updateNetStatus();
      break;
    case 'roster': net.roster = m.players || []; if (m.max) net.max = m.max; updateNetStatus(); break;
    case 'map':
      if (!state.started && Number.isInteger(m.m) && m.m !== state.map && REGIONS[m.m]) { selectMap(m.m, false); updateNetStatus(`${esc(m.by)} picked ${esc(REGIONS[m.m].name)}.`); }
      break;
    case 's': if (m.id !== net.id) updateRemote(m); break;
    case 'leave': removeRemote(m.id); net.pins.delete(m.id); break;
    case 'pin':
      if (m.id === net.id) break;
      if (m.x === null) net.pins.delete(m.id);
      else if (typeof m.x === 'number' && typeof m.z === 'number') {
        net.pins.set(m.id, { id: m.id, x: m.x, z: m.z, m: m.m, name: m.name, slot: m.slot });
        if (state.started && m.m === state.map) toast(`${m.name} dropped a map pin.`, 2200);
      }
      break;
    case 'results':
      net.results[m.m] = m.list;
      if (state.finished && m.m === state.map) renderResults();
      if (m.who !== net.id && state.started && REGIONS[m.m]) toast(`${m.name} finished ${REGIONS[m.m].name} in ${fmtTime(m.time)}.`);
      break;
  }
}
// The address your friends type in. When you opened the game as localhost, that's the LAN address
// the server reported; when you opened it by IP, it's simply the address in your own address bar.
function shareUrl() {
  if (!/^(localhost|127\.|\[::1\])/.test(location.hostname)) return location.origin;
  return net.lan[0] || '';
}
function updateNetStatus(extra) {
  const el = $('#netStatus'), hud = $('#hudNet'), box = $('#lanBox');
  box.hidden = true;
  if (net.full) {
    el.innerHTML = `<b class="warn">This game is full.</b> Low Range is set up for ${net.max || 3} drivers at once. Ask someone to close their tab, then reload this page.`;
    hud.textContent = 'Solo';
  } else if (net.online) {
    const names = net.roster.map(p => `<span style="color:${slotColor(p.slot)}">${esc(p.name)}</span>`).join(', ');
    el.innerHTML = `<b>On your Wi-Fi.</b> ${net.roster.length} of ${net.max || 3} drivers connected: ${names}. Everyone who picks the same map drives together.${extra ? ' ' + extra : ''}`;
    hud.textContent = `LAN · ${net.roster.length}`;
    const url = shareUrl();
    if (url) { box.hidden = false; $('#lanUrl').value = url; }
  } else if (net.available) {
    el.textContent = 'Looking for the Low Range server on this network…';
    hud.textContent = 'Solo';
  } else {
    el.textContent = 'Solo. To drive with friends on the same Wi-Fi, double-click start-server.bat on one computer and open the address it shows on every device.';
    hud.textContent = 'Solo';
  }
}
$('#lanCopy').addEventListener('click', () => {
  const inp = $('#lanUrl');
  const done = () => { $('#lanCopy').textContent = 'Copied'; setTimeout(() => { $('#lanCopy').textContent = 'Copy link'; }, 1500); };
  // The clipboard API only works on localhost/https, so fall back to selecting the text.
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(inp.value).then(done, () => { inp.select(); });
  else { inp.focus(); inp.select(); try { if (document.execCommand('copy')) done(); } catch (_) {} }
});
function makeTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,26,21,0.78)'; x.fillRect(8, 8, 240, 48);
  x.fillStyle = color; x.fillRect(8, 8, 8, 48);
  x.fillStyle = '#f1ead9'; x.font = '600 30px "Barlow Semi Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name, 132, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, fog: false }));
  s.scale.set(3.4, 0.85, 1); s.position.y = 2.9;
  return s;
}
function updateRemote(m) {
  if (!Array.isArray(m.p) || !Array.isArray(m.q) || m.p.length !== 3 || m.q.length !== 4) return;
  let rc = remotes.get(m.id);
  const kind = carTypeIndex(m.k);
  if (rc && rc.kind !== kind) { removeRemote(m.id); rc = null; }
  if (!rc) {
    const mesh = buildCarMesh(CAR_TYPES[kind], false);
    rc = { mesh, kind, name: '', slot: -1, buf: [], tag: null, last: 0, map: m.m, lights: false, steer: 0, x: m.p[0], z: m.p[2] };
    mesh.group.position.fromArray(m.p); mesh.group.quaternion.fromArray(m.q);
    remotes.set(m.id, rc);
  }
  const slot = m.sl | 0;
  if (m.n !== rc.name || slot !== rc.slot) {
    if (rc.tag) { rc.mesh.group.remove(rc.tag); rc.tag.material.map.dispose(); rc.tag.material.dispose(); }
    rc.name = m.n; rc.slot = slot; rc.tag = makeTag(m.n, slotColor(slot)); rc.mesh.group.add(rc.tag);
  }
  const now = performance.now();
  if (rc.map !== m.m) rc.buf.length = 0;
  rc.buf.push({ t: now, p: new V3().fromArray(m.p), q: new THREE.Quaternion().fromArray(m.q).normalize() });
  if (rc.buf.length > 12) rc.buf.shift();
  rc.map = m.m; rc.last = now;
  rc.mesh.paint.color.set(PAINTS[(m.c | 0) % PAINTS.length][1]);
  rc.lights = !!m.l; rc.steer = +m.s || 0; rc.finished = !!m.f;
}
function removeRemote(id) {
  const rc = remotes.get(id); if (!rc) return;
  disposeCarMesh(rc.mesh);
  remotes.delete(id);
}
const _iq = new THREE.Quaternion(), _iv = new V3();
function updateRemotes(dt, now) {
  const rt = now - INTERP_MS;
  for (const rc of remotes.values()) {
    const g = rc.mesh.group;
    g.visible = rc.map === state.map && now - rc.last < 5000 && rc.buf.length > 0;
    if (!g.visible) continue;
    const b = rc.buf;
    // Find the two snapshots either side of the render time and blend between them.
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > rt) i--;
    if (b[i].t <= rt && b.length > 1) {
      // The next update is late (a Wi-Fi hiccup): keep the truck moving the way it was going for a
      // moment instead of freezing it, then it blends back once the update arrives.
      const A = b[b.length - 2], B = b[b.length - 1], span = Math.max(1, B.t - A.t), ahead = Math.min(rt - B.t, EXTRAP_MS);
      g.position.copy(B.p).addScaledVector(_iv.copy(B.p).sub(A.p), ahead / span);
      g.quaternion.copy(B.q);
    } else if (i === 0 || b[i].t <= rt) { g.position.copy(b[i].p); g.quaternion.copy(b[i].q); }
    else {
      const A = b[i - 1], B = b[i], k = clamp((rt - A.t) / Math.max(1, B.t - A.t), 0, 1);
      g.position.lerpVectors(A.p, B.p, k);
      g.quaternion.copy(_iq.copy(A.q).slerp(B.q, k));
    }
    rc.x = g.position.x; rc.z = g.position.z;
    rc.mesh.wheels[0].pivot.rotation.y = rc.mesh.wheels[1].pivot.rotation.y = -rc.steer;
    rc.mesh.lampMat.color.set(rc.lights ? 0xfff4d2 : 0x8a8576);
    // Far-away remotes are still shown on the minimap, but their mesh is not worth drawing.
    g.visible = Math.hypot(rc.x - camera.position.x, rc.z - camera.position.z) < 1500;
  }
}
function netSend(now) {
  if (!net.online || !state.started || now - net.sendT < 66) return;
  net.sendT = now;
  const rd = v => Math.round(v * 100) / 100;
  sendNet({ t: 's', m: state.map, n: playerName(), p: car.p.toArray().map(rd), q: car.q.toArray().map(v => Math.round(v * 10000) / 10000),
    c: state.paint, k: car.spec.id, l: lightsOn(), s: rd(car.steer), f: state.finished });
}
