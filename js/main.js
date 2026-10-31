'use strict';
/* ---------- Map select, car select & start ---------- */
// Big maps first, then the quick maps. Buttons keep their region index in data-map.
const mapOrder = [...REGIONS.keys()].sort((a, b) => (REGIONS[b].big ? 1 : 0) - (REGIONS[a].big ? 1 : 0));
$('#maps').innerHTML = mapOrder.map(i => {
  const r = REGIONS[i];
  return `<button class="map-btn${r.big ? ' big' : ''}" type="button" data-map="${i}" aria-pressed="false"><b>${esc(r.name)}</b><span>${esc(r.blurb)}</span>` +
    `<span class="mono" data-dist>${r.big ? 'Big map · ' : 'Quick · '}${fmtDist(routeLen(r))} route</span></button>`;
}).join('');
const mapButtons = [...document.querySelectorAll('.map-btn')];
mapButtons.forEach(b => b.addEventListener('click', () => selectMap(+b.dataset.map, true)));

$('#cars').innerHTML = CAR_TYPES.map((t, i) => `<button class="car-btn" type="button" data-car="${i}" aria-pressed="false"><b>${esc(t.name)}</b><span>${esc(t.blurb)}</span></button>`).join('');
const carButtons = [...document.querySelectorAll('.car-btn')];
carButtons.forEach(b => b.addEventListener('click', () => selectCar(+b.dataset.car, true)));
function markButtons() {
  mapButtons.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.map === state.map)));
  carButtons.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.car === state.carType)));
}
function selectCar(i, save) {
  if (i === state.carType && carMesh.spec === CAR_TYPES[i]) { markButtons(); return; }
  state.carType = i;
  setCarType(i); setPaint(state.paint);
  if (!state.started && state.loadedMap === state.map) placeAtStart();
  if (save) storage(s => s.setItem('lowrange-car', CAR_TYPES[i].id));
  markButtons();
}
// Big maps take a moment to generate, so put a loading card up first and let it paint.
function withLoading(text, fn) {
  if (!R.big && !REGIONS[state.map].big) { fn(); return; }
  const el = $('#loading'); $('#loadingText').textContent = text; el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { fn(); el.hidden = true; }));
}
function selectMap(i, broadcast) {
  state.map = i;
  // The rover is the natural pick for the Moon; you can still change it afterwards.
  if (REGIONS[i].space && CAR_TYPES[state.carType].id !== 'rover') { selectCar(carTypeIndex('rover'), false); toast('Survey Rover selected for the Moon. Pick another vehicle if you like.', 3500); }
  markButtons();
  if (state.loadedMap !== i) withLoading(`Building ${REGIONS[i].name}…`, () => { buildRegion(null); placeAtStart(); });
  if (broadcast) sendNet({ t: 'map', m: i });
}
function beginRun() {
  placeAtStart();
  car.low = false;
  state.finished = false; state.t0 = performance.now();
  cam.yawS = yawOf(car.q); cam.yaw = 0;
  $('#touch').hidden = !isTouch;
  const others = [...remotes.values()].filter(rc => rc.map === state.map && performance.now() - rc.last < 5000).length;
  const plan = checkpoints.length
    ? `Log ${checkpoints.length} survey posts in order, then reach the finish. First: ${checkpoints[0].name}. ${checkpoints[0].hint}`
    : `Drive to the finish arch ${fmtDist(routeLen(R))} away. Follow FINISH on your compass.`;
  toast(`${R.name}. ${plan}${others ? ` ${others} other driver${others === 1 ? ' is' : 's are'} on this map.` : ''}`, 6500);
}
function start() {
  if (state.started) return;
  state.started = true;
  $('#title').hidden = true; $('#hud').hidden = false;
  $('#keys').hidden = !state.showKeys;
  sizeCompass();
  initAudio(); if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  if (state.loadedMap !== state.map) buildRegion(null);
  beginRun();
}
$('#startBtn').addEventListener('click', start);
$('#photoHint').addEventListener('click', () => { if (state.photo) press('KeyP'); });
if (isTouch) $('#photoHint').textContent = 'Photo mode · drag to orbit · tap here to exit';

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); sizeCompass();
}
addEventListener('resize', resize);

/* ---------- Main loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  pollGamepad(dt);
  // Stream terrain around the truck. A few milliseconds a frame keeps chunk building invisible.
  updateChunks(car.p.x, car.p.z, R.big ? 4 : 8);
  stepMapImage(3);
  if (!state.photo) {
    updateControls(dt);
    const sub = Math.min(12, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < sub; i++) step(dt / sub);
    collideObstacles();
    updateWinch(dt);
    if (state.started) { checkObjectives(now); vehicleChecks(dt, now); }
    fwd.set(0, 0, 1).applyQuaternion(car.q);
    emitWheelParticles(dt);
  }
  particles.update(state.photo ? 0 : dt);
  updateCarVisual(state.photo ? 0 : dt, now);
  updateRemotes(dt, now);
  updateCamera(dt, now);
  updateSky(dt);
  updateWeather(state.photo ? 0 : dt);
  if (state.started && !state.photo) updateHud(now);
  netSend(now);
  updateAudio();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function boot(data) {
  data = data || {};
  if (Number.isInteger(data.map) && REGIONS[data.map]) state.map = data.map;
  const savedCar = storage(s => s.getItem('lowrange-car'));
  const ct = Number.isInteger(data.carType) ? data.carType : savedCar ? carTypeIndex(savedCar) : 0;
  state.carType = -1; selectCar(ct, false);
  if (typeof data.paint === 'number') setPaint(data.paint);
  if (typeof data.t === 'number') sky.t = data.t;
  markButtons();
  buildRegion(data.found || null, data.cp || 0);
  if (R.fixedT !== undefined) sky.t = R.fixedT;
  placeAtStart();
  resize();
  updateNetStatus();
  if (data.started && !data.finished) {
    start();
    if (data.p && data.q) { car.p.fromArray(data.p); car.q.fromArray(data.q); car.low = !!data.low; }
    if (typeof data.elapsed === 'number') state.t0 = performance.now() - data.elapsed * 1000;
  }
  netConnect();
  requestAnimationFrame(t => { last = t; frame(t); });
}
if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
  window.claude.hot.snapshot(() => ({ started: state.started, finished: state.finished, map: state.map, found: cairns.map(c => c.found), p: car.p.toArray(), q: car.q.toArray(),
    t: sky.t, low: car.low, paint: state.paint, carType: state.carType, cp: state.cp, elapsed: (performance.now() - state.t0) / 1000 }));
}
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
