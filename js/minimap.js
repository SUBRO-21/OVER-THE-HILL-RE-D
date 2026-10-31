'use strict';
/* ---------- Minimap, full map, fog of war, shared pins ---------- */
// The corner map is centred on you and can turn with your heading. On the big maps, unexplored
// ground is hidden under fog that clears around every driver in the session. Clicking the full map
// drops a pin that all friends on the same map see on their own maps and compasses.
const ZOOMS = [160, 320, 640, 1280, 2560];
const minimap = { zoom: 2, rotate: true };
(() => {
  const saved = storage(s => JSON.parse(s.getItem('lowrange-minimap') || 'null'));
  if (saved && Number.isInteger(saved.zoom)) minimap.zoom = clamp(saved.zoom, 0, ZOOMS.length - 1);
  if (saved && typeof saved.rotate === 'boolean') minimap.rotate = saved.rotate;
})();
function saveMinimap() { storage(s => s.setItem('lowrange-minimap', JSON.stringify(minimap))); updateMiniButtons(); }
function minimapZoom(d) { minimap.zoom = clamp(minimap.zoom + d, 0, ZOOMS.length - 1); saveMinimap(); }
function updateMiniButtons() {
  $('#mmRotate').textContent = minimap.rotate ? 'Heading up' : 'North up';
  $('#mmRotate').setAttribute('aria-pressed', String(minimap.rotate));
}

const mapC = $('#map'), mctx = mapC.getContext('2d');
const bigC = $('#bigmapC'), bctx = bigC.getContext('2d');
const fogC = document.createElement('canvas'); fogC.width = fogC.height = 256;
const fctx = fogC.getContext('2d');
const fog = { on: false, last: 0, saveT: 0, key: '' };
let myPin = null;

function minimapReset() {
  fog.on = R.big;
  fog.key = 'lowrange-fog-' + R.id;
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, 256, 256);
  if (fog.on) {
    fctx.fillStyle = 'rgba(16,20,16,0.9)'; fctx.fillRect(0, 0, 256, 256);
    const url = storage(s => s.getItem(fog.key));
    if (url) { const im = new Image(); im.onload = () => { fctx.globalCompositeOperation = 'source-over'; fctx.clearRect(0, 0, 256, 256); fctx.drawImage(im, 0, 0); }; im.src = url; }
  }
  myPin = null;
  updateMiniButtons();
}
function revealAt(x, z, radius) {
  const k = 256 / SIZE, px = (x + HALF) * k, pz = (z + HALF) * k, r = radius * k;
  fctx.globalCompositeOperation = 'destination-out';
  const g = fctx.createRadialGradient(px, pz, r * 0.4, px, pz, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  fctx.fillStyle = g; fctx.beginPath(); fctx.arc(px, pz, r, 0, 7); fctx.fill();
  fctx.globalCompositeOperation = 'source-over';
}
function updateFog(now) {
  if (!fog.on || now - fog.last < 250) return;
  fog.last = now;
  revealAt(car.p.x, car.p.z, 170);
  for (const rc of remotes.values()) if (rc.map === state.map && now - rc.last < 5000) revealAt(rc.x, rc.z, 170);
  if (now - fog.saveT > 10000) { fog.saveT = now; try { const u = fogC.toDataURL(); storage(s => s.setItem(fog.key, u)); } catch (_) {} }
}

/* Drawing helpers shared by the corner map and the full map. */
function drawRoads(ctx) {
  if (R.paths) ctx.drawImage(roadLayer, -HALF, -HALF, SIZE, SIZE);
}
function dot(ctx, x, y, r, fill, stroke, lw) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}
function badge(ctx, x, y, r, fill, letter, k) {
  dot(ctx, x, y, r, fill, '#141a15', 2 * k);
  ctx.fillStyle = '#141a15'; ctx.font = `700 ${r * 1.2}px "Overpass Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + 0.5 * k);
}
function arrow(ctx, x, y, ang, k, fill, stroke) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(k, k);
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}
function allPins() {
  const l = [];
  if (myPin) l.push({ x: myPin.x, z: myPin.z, slot: net.slot, name: 'You', mine: true });
  for (const p of net.pins.values()) if (p.m === state.map) l.push(p);
  return l;
}
const headingOf = () => { fwd.set(0, 0, 1).applyQuaternion(car.q); return Math.atan2(fwd.x, -fwd.z); };

function drawMinimap(now) {
  updateFog(now);
  const S = mapC.width, k = S / 300, span = R.big ? ZOOMS[minimap.zoom] : Math.min(ZOOMS[minimap.zoom], SIZE), sc = S / span;
  const hd = headingOf(), rot = minimap.rotate ? -hd : 0, cs = Math.cos(rot), sn = Math.sin(rot), cx = car.p.x, cz = car.p.z;
  const proj = (x, z) => { const dx = (x - cx) * sc, dz = (z - cz) * sc; return [S / 2 + dx * cs - dz * sn, S / 2 + dx * sn + dz * cs]; };
  mctx.fillStyle = '#141a15'; mctx.fillRect(0, 0, S, S);
  mctx.save();
  mctx.translate(S / 2, S / 2); mctx.rotate(rot); mctx.scale(sc, sc); mctx.translate(-cx, -cz);
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(mapImage, -HALF, -HALF, SIZE, SIZE);
  drawRoads(mctx);
  if (fog.on) mctx.drawImage(fogC, -HALF, -HALF, SIZE, SIZE);
  mctx.restore();
  const inside = (p, m) => p[0] > m && p[0] < S - m && p[1] > m && p[1] < S - m;
  // Off-screen targets are pinned to the edge with a small arrow pointing their way.
  const edgeMark = (x, z, color, letter) => {
    let p = proj(x, z);
    if (inside(p, 12 * k)) { badge(mctx, p[0], p[1], 8 * k, color, letter, k); return; }
    const dx = p[0] - S / 2, dy = p[1] - S / 2, m = (S / 2 - 12 * k) / Math.max(Math.abs(dx), Math.abs(dy));
    const ex = S / 2 + dx * m, ey = S / 2 + dy * m;
    arrow(mctx, ex, ey, Math.atan2(dx, -dy), 0.7 * k, color, '#141a15');
  };
  for (const c of cairns) if (c.found) { const p = proj(c.x, c.z); if (inside(p, 0)) dot(mctx, p[0], p[1], 3.5 * k, '#f1ead9'); }
  checkpoints.forEach((c, i) => { if (!c.done && i !== state.cp) { const p = proj(c.x, c.z); if (inside(p, 0)) badge(mctx, p[0], p[1], 6.5 * k, 'rgba(127,208,230,.55)', String(i + 1), k); } });
  const tg = nextTarget();
  edgeMark(tg.x, tg.z, tg.cp ? '#7fd0e6' : '#cf5d33', tg.cp ? String(state.cp + 1) : 'F');
  for (const p of allPins()) edgeMark(p.x, p.z, slotColor(p.slot), '⌖');
  for (const rc of remotes.values()) {
    if (rc.map !== state.map || now - rc.last < 0 || now - rc.last > 5000) continue;
    const p = proj(rc.x, rc.z);
    if (inside(p, 6 * k)) dot(mctx, p[0], p[1], 5.5 * k, slotColor(rc.slot), '#141a15', 2 * k);
    else { const dx = p[0] - S / 2, dy = p[1] - S / 2, m = (S / 2 - 8 * k) / Math.max(Math.abs(dx), Math.abs(dy)); dot(mctx, S / 2 + dx * m, S / 2 + dy * m, 4 * k, slotColor(rc.slot), '#141a15', 2 * k); }
  }
  arrow(mctx, S / 2, S / 2, hd + rot, k, slotColor(net.slot), '#ffffff');
  if (minimap.rotate) { // north marker
    const p = [S / 2 + Math.sin(rot) * (S / 2 - 14 * k), S / 2 - Math.cos(rot) * (S / 2 - 14 * k)];
    mctx.fillStyle = '#f0a53a'; mctx.font = `700 ${13 * k}px "Overpass Mono", monospace`; mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText('N', p[0], p[1]);
  }
  // Footer: your pin, or else the nearest friend's pin.
  const pins = allPins();
  let pick = pins.find(p => p.mine) || pins.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
  const foot = $('#mmFoot');
  if (pick) {
    const d = Math.hypot(pick.x - cx, pick.z - cz), b = (Math.atan2(pick.x - cx, -(pick.z - cz)) * 180 / Math.PI + 360) % 360;
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8];
    foot.textContent = d < 5 ? `${pick.mine ? 'Your pin' : pick.name + "'s pin"} · Arrived` : `${pick.mine ? 'Your pin' : pick.name + "'s pin"} · ${fmtDist(d)} ${dir}`;
    foot.hidden = false;
  } else foot.hidden = true;
}

function drawBigMap(now) {
  const S = bigC.width, k = S / 720, sc = S / SIZE;
  const toPx = v => (v + HALF) * sc;
  bctx.fillStyle = '#141a15'; bctx.fillRect(0, 0, S, S);
  bctx.save(); bctx.scale(sc, sc); bctx.translate(HALF, HALF);
  bctx.drawImage(mapImage, -HALF, -HALF, SIZE, SIZE);
  drawRoads(bctx);
  if (fog.on) bctx.drawImage(fogC, -HALF, -HALF, SIZE, SIZE);
  bctx.restore();
  // Planned route: start, posts in order, finish.
  const route = [R.start, ...checkpoints.map(c => [c.x, c.z]), R.end];
  bctx.setLineDash([8 * k, 8 * k]); bctx.strokeStyle = 'rgba(241,234,217,.5)'; bctx.lineWidth = 2 * k;
  bctx.beginPath(); route.forEach(([x, z], i) => i ? bctx.lineTo(toPx(x), toPx(z)) : bctx.moveTo(toPx(x), toPx(z))); bctx.stroke(); bctx.setLineDash([]);
  for (const c of cairns) if (c.found) dot(bctx, toPx(c.x), toPx(c.z), 4.5 * k, '#f1ead9');
  badge(bctx, toPx(R.start[0]), toPx(R.start[1]), 9 * k, '#86a35b', 'S', k);
  badge(bctx, toPx(R.end[0]), toPx(R.end[1]), 9 * k, '#cf5d33', 'F', k);
  checkpoints.forEach((c, i) => badge(bctx, toPx(c.x), toPx(c.z), 9 * k, c.done ? 'rgba(241,234,217,.6)' : i === state.cp ? '#7fd0e6' : 'rgba(127,208,230,.6)', String(i + 1), k));
  for (const p of allPins()) {
    badge(bctx, toPx(p.x), toPx(p.z), 8 * k, slotColor(p.slot), '⌖', k);
    bctx.fillStyle = '#f1ead9'; bctx.font = `600 ${12 * k}px "Barlow Semi Condensed", sans-serif`; bctx.textAlign = 'left'; bctx.textBaseline = 'middle';
    bctx.fillText(p.mine ? 'Your pin' : p.name, toPx(p.x) + 11 * k, toPx(p.z));
  }
  for (const rc of remotes.values()) {
    if (rc.map !== state.map || now - rc.last > 5000) continue;
    dot(bctx, toPx(rc.x), toPx(rc.z), 6 * k, slotColor(rc.slot), '#141a15', 2 * k);
    bctx.fillStyle = '#f1ead9'; bctx.font = `600 ${12 * k}px "Barlow Semi Condensed", sans-serif`; bctx.textAlign = 'left'; bctx.textBaseline = 'middle';
    bctx.fillText(rc.name, toPx(rc.x) + 9 * k, toPx(rc.z));
  }
  arrow(bctx, toPx(car.p.x), toPx(car.p.z), headingOf(), k, slotColor(net.slot), '#ffffff');
}

function setPin(x, z) {
  myPin = x === null ? null : { x, z };
  sendNet(x === null ? { t: 'pin', x: null } : { t: 'pin', x: Math.round(x), z: Math.round(z), m: state.map });
}
// Click the full map to drop a pin; click your pin again to remove it; click outside to close.
bigC.addEventListener('click', e => {
  e.stopPropagation();
  const rect = bigC.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * SIZE - HALF, z = (e.clientY - rect.top) / rect.height * SIZE - HALF;
  if (myPin && Math.hypot(myPin.x - x, myPin.z - z) < SIZE * 0.025) { setPin(null); toast('Pin removed.', 1500); }
  else { setPin(x, z); toast(net.online ? 'Pin dropped. Your friends can see it.' : 'Pin dropped.', 1800); }
});
$('#bigmap').addEventListener('click', () => setBigMap(false));
mapC.addEventListener('click', () => press('KeyM'));
$('#mmIn').addEventListener('click', e => { e.stopPropagation(); minimapZoom(-1); });
$('#mmOut').addEventListener('click', e => { e.stopPropagation(); minimapZoom(1); });
$('#mmRotate').addEventListener('click', e => { e.stopPropagation(); press('KeyT'); });
