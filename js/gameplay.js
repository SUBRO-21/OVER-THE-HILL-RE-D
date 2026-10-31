'use strict';
/* ---------- Gameplay ---------- */
function toggleWinch() {
  if (car.winch) { car.winch = null; toast('Winch released.'); return; }
  fwd.set(0, 0, 1).applyQuaternion(car.q);
  a.copy(car.p).addScaledVector(fwd, car.spec.winch[2]);
  let best = null, bd = 25;
  nearbyObstacles(a.x, a.z, o => {
    if (o.kind !== 'tree' && o.kind !== 'rock' && o.kind !== 'post') return;
    if (o.kind === 'rock' && o.r < 1.4) return;
    const d = Math.hypot(o.x - a.x, o.z - a.z);
    if (d < bd) { bd = d; best = o; }
  });
  if (!best) { toast('No tree, boulder or post within 25 m to anchor the winch.'); return; }
  const anchor = new V3(best.x, best.y + 0.8, best.z);
  car.winch = { anchor, len: a.distanceTo(anchor), tension: 0, dist: a.distanceTo(anchor) };
  toast(`Winch line on ${{ tree: 'a tree', rock: 'a boulder', post: 'a post' }[best.kind]}, ${Math.round(car.winch.len)} m out. Reeling in.`);
  clunk();
}
function updateWinch(dt) {
  if (!car.winch) { ropeMesh.visible = false; return; }
  const w = car.winch;
  w.len = Math.max(3.5, w.len - 1.6 * dt, (w.dist || w.len) - 1.2);
  if (w.len <= 3.6 && w.dist < 4.6) { car.winch = null; ropeMesh.visible = false; toast('Winch fully reeled in and released.'); return; }
  off.fromArray(car.spec.winch).applyQuaternion(car.q); a.copy(car.p).add(off);
  ropeMesh.visible = true; ropeMesh.position.copy(a);
  ropeMesh.scale.set(1, 1, a.distanceTo(w.anchor)); ropeMesh.lookAt(w.anchor);
}

const cairnsFound = () => cairns.filter(c => c.found).length;
const nextCheckpoint = () => checkpoints[state.cp] || null;
// Where the compass and "to go" readout point: the next survey post, or the finish once they're done.
function nextTarget() {
  const c = nextCheckpoint();
  return c ? { x: c.x, z: c.z, label: `POST ${state.cp + 1}`, cp: c } : { x: R.end[0], z: R.end[1], label: 'FINISH', cp: null };
}
let lastEarlyMsg = 0;
function checkObjectives(now) {
  for (const c of cairns) {
    if (c.found) continue;
    if (Math.hypot(car.p.x - c.x, car.p.z - c.z) < 7.5) {
      c.found = true; c.flagMat.color.set('#f1ead9');
      chime();
      toast(`Bonus cairn ${cairnsFound()} of ${cairns.length} logged.`);
    }
  }
  const cp = nextCheckpoint();
  if (cp && Math.hypot(car.p.x - cp.x, car.p.z - cp.z) < 10) {
    cp.done = true; state.cp++;
    chime();
    const nx = nextCheckpoint();
    toast(nx ? `Survey post ${state.cp} of ${checkpoints.length}: ${cp.name}. Next: ${nx.name}. ${nx.hint}` : `All ${checkpoints.length} survey posts logged. Head for the finish arch.`, 5200);
  }
  if (!state.finished && Math.hypot(car.p.x - R.end[0], car.p.z - R.end[1]) < 7) {
    if (state.cp >= checkpoints.length) finish(now);
    else if (now - lastEarlyMsg > 6000) { lastEarlyMsg = now; toast(`Log survey post ${state.cp + 1} (${nextCheckpoint().name}) first. Follow POST on the compass.`); }
  }
}
function finish(now) {
  state.finished = true;
  state.elapsed = (now - state.t0) / 1000;
  car.winch = null; setBigMap(false);
  const entry = { name: playerName(), time: state.elapsed, cairns: cairnsFound(), car: car.spec.name, me: true };
  if (net.online) sendNet({ t: 'finish', m: state.map, time: state.elapsed, cairns: entry.cairns, car: car.spec.id });
  const list = state.localResults[state.map] || (state.localResults[state.map] = []);
  list.push(entry); list.sort((x, y) => x.time - y.time);
  chime(); setTimeout(chime, 300);
  $('#resMap').textContent = R.name;
  $('#resTime').textContent = fmtTime(state.elapsed);
  $('#resNote').textContent = `${car.spec.name}. ${entry.cairns} of ${cairns.length} bonus cairns logged on the way.`;
  renderResults();
  $('#results').hidden = false;
  $('#touch').hidden = true;
  setTimeout(() => $('#againBtn').focus(), 50);
}
function renderResults() {
  const online = net.online && net.results[state.map];
  const list = online ? net.results[state.map] : (state.localResults[state.map] || []);
  $('#resBoardLabel').textContent = online ? 'Fastest on this network' : 'Your times this session';
  const me = playerName();
  $('#resBoard').innerHTML = list.slice(0, 8).map((e, i) =>
    `<tr class="${(online ? e.name === me && Math.abs(e.time - state.elapsed) < 0.05 : e.me && e.time === state.elapsed) ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${fmtTime(e.time)}</td><td>${e.cairns}</td></tr>`).join('') ||
    '<tr><td colspan="4">No times yet.</td></tr>';
}
function driveAgain() {
  $('#results').hidden = true;
  buildRegion(null);
  beginRun();
}
function backToMaps() {
  $('#results').hidden = true; $('#hud').hidden = true; $('#touch').hidden = true; setBigMap(false);
  state.started = false; state.finished = false;
  buildRegion(null); placeAtStart();
  $('#title').hidden = false;
  updateNetStatus();
}
$('#againBtn').addEventListener('click', driveAgain);
$('#mapsBtn').addEventListener('click', backToMaps);
