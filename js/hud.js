'use strict';
/* ---------- HUD ---------- */
let toastTimer = 0;
function toast(text, ms = 3000) {
  const el = $('#toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
const compass = $('#compass'), cctx = compass.getContext('2d');
function sizeCompass() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  compass.width = Math.max(1, compass.clientWidth * dpr); compass.height = Math.max(1, compass.clientHeight * dpr);
}
const camDir = new V3();
function drawCompass() {
  const w = compass.width, h = compass.height; if (w < 2) return;
  const dpr = w / Math.max(1, compass.clientWidth);
  cctx.clearRect(0, 0, w, h);
  cctx.fillStyle = 'rgba(20,26,21,0.76)'; cctx.fillRect(0, 0, w, h);
  camera.getWorldDirection(camDir);
  const heading = (Math.atan2(camDir.x, -camDir.z) * 180 / Math.PI + 360) % 360;
  const span = 150, ppd = w / span, labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
  for (let d = Math.floor((heading - span / 2) / 5) * 5; d <= heading + span / 2; d += 5) {
    const x = w / 2 + (d - heading) * ppd, dd = ((d % 360) + 360) % 360;
    if (labels[dd] !== undefined) {
      cctx.fillStyle = dd === 0 ? '#f0a53a' : '#f1ead9';
      cctx.font = `600 ${12 * dpr}px "Overpass Mono", monospace`; cctx.fillText(labels[dd], x, h * 0.42);
    } else {
      cctx.fillStyle = 'rgba(241,234,217,0.5)';
      const th = dd % 15 === 0 ? h * 0.32 : h * 0.16;
      cctx.fillRect(x - dpr * 0.5, h - th, dpr, th);
    }
  }
  const mark = (x, z, color, label) => {
    const dx = x - car.p.x, dz = z - car.p.z, dist = Math.hypot(dx, dz);
    const b = Math.atan2(dx, -dz) * 180 / Math.PI;
    let rel = ((b - heading + 540) % 360) - 180;
    const offscreen = Math.abs(rel) > span / 2 - 4;
    if (offscreen && !label) return;
    rel = clamp(rel, -span / 2 + 4, span / 2 - 4);
    const px = w / 2 + rel * ppd;
    cctx.fillStyle = color;
    cctx.beginPath(); cctx.moveTo(px, h * 0.08); cctx.lineTo(px + 5 * dpr, h * 0.22); cctx.lineTo(px, h * 0.36); cctx.lineTo(px - 5 * dpr, h * 0.22); cctx.fill();
    cctx.font = `400 ${9.5 * dpr}px "Overpass Mono", monospace`;
    cctx.fillText(label ? `${label} ${fmtDist(dist)}` : fmtDist(dist), px, h * 0.8);
  };
  for (const c of cairns) if (!c.found && Math.hypot(c.x - car.p.x, c.z - car.p.z) < 260) mark(c.x, c.z, '#e8742f');
  if (myPin) mark(myPin.x, myPin.z, slotColor(net.slot), 'PIN');
  const tg = nextTarget();
  mark(tg.x, tg.z, tg.cp ? '#7fd0e6' : '#cf5d33', tg.label);
  cctx.fillStyle = '#f0a53a'; cctx.fillRect(w / 2 - dpr, 0, dpr * 2, h * 0.14);
}
const fmtDist = d => d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;

let hudTick = 0;
function updateHud(now) {
  drawCompass(); drawMinimap(now);
  if (state.bigmap) drawBigMap(now);
  const elapsed = state.finished ? state.elapsed : (now - state.t0) / 1000;
  $('#hudTime').textContent = fmtTime(elapsed);
  if (++hudTick % 4) return;
  const tg = nextTarget(), toGo = Math.hypot(car.p.x - tg.x, car.p.z - tg.z);
  $('#hudToGo').textContent = state.finished ? 'Finished' : tg.cp ? `${fmtDist(toGo)} to post ${state.cp + 1}` : `${fmtDist(toGo)} to finish`;
  const cpRow = $('#hudPostsRow');
  cpRow.hidden = !checkpoints.length;
  if (checkpoints.length) $('#hudPosts').textContent = `${state.cp} / ${checkpoints.length}`;
  const sp = Math.abs(car.v.dot(fwd.set(0, 0, 1).applyQuaternion(car.q))) * 3.6;
  $('#hudSpeed').textContent = Math.round(sp);
  const gearEl = $('#hudGear'); gearEl.textContent = car.low ? '4L' : '4H'; gearEl.classList.toggle('on', car.low);
  $('#hudLights').classList.toggle('dim', !lightsOn()); $('#hudLights').classList.toggle('on', lightsOn());
  $('#hudWinchChip').classList.toggle('dim', !car.winch); $('#hudWinchChip').classList.toggle('on', !!car.winch);
  const hrs = sky.t * 24, hh = Math.floor(hrs), mm = Math.floor((hrs - hh) * 60);
  $('#hudClock').textContent = R.space ? 'Lunar day' : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('#hudWeather').textContent = R.space ? 'Vacuum' : weather.rain > 0.3 ? (weather.kind === 'snow' ? 'Snow' : 'Rain') : 'Clear';
  $('#hudCairns').textContent = `${cairnsFound()} / ${cairns.length}`;
  const surfEl = $('#hudSurface'), wh = car.wheel.find(w => w.contact);
  const depth = hasWater(R) ? R.wl - heightAt(car.p.x, car.p.z) : 0;
  if (car.stalled) { surfEl.textContent = 'Engine flooded · press R'; surfEl.className = 'warn'; }
  else if (depth > 0.15) { surfEl.textContent = `Water ${depth.toFixed(1)} m deep`; surfEl.className = depth > 0.8 ? 'warn' : ''; }
  else { surfEl.textContent = wh ? wh.surf.name : 'Airborne'; surfEl.className = ''; }
  $('#hudWinch').textContent = car.winch ? `${car.winch.len.toFixed(1)} m · ${car.winch.tension > 30000 ? 'max pull' : car.winch.tension > 1000 ? 'pulling' : 'slack'}` : 'Ready';
}
const lightsOn = () => state.lightsAuto ? (sky.night > 0.55 || weather.rain > 0.7) : state.lights;

function updateCarVisual(dt, now) {
  const g = carMesh.group, S = car.spec;
  g.position.copy(car.p); g.quaternion.copy(car.q);
  car.wheel.forEach((wh, k) => {
    const w = carMesh.wheels[k];
    w.pivot.position.y = S.wheels[k][1] - clamp(wh.d - S.wr, S.rest - 0.42, S.rest);
    w.pivot.rotation.y = k < 2 ? -car.steer : 0;
    wh.angle += wh.spinV * dt; w.spin.rotation.x = wh.angle;
  });
  const on = lightsOn();
  for (const s of carMesh.spots) s.intensity = on ? 2.2 : 0;
  carMesh.lampMat.color.set(on ? 0xfff4d2 : 0x8a8576);
  carMesh.tailMat.color.set(ctl.brake > 0 || ctl.handbrake ? 0xff3a22 : on ? 0xb02a1a : 0x6a1a12);
  // Driver's seat: show the interior, hide the cab glass you would otherwise be sitting inside.
  const inside = state.started && state.camMode === 1 && !state.photo, ck = carMesh.cockpit;
  ck.inter.visible = inside;
  for (const m of carMesh.hide) m.visible = !inside;
  if (inside) {
    // Roughly 7:1 steering ratio, so full lock is about one and a quarter turns of the wheel.
    ck.wheelPivot.rotation.z = car.steer * 7;
    if (now - ck.last > 80) {
      ck.last = now;
      drawGauges(ck, Math.abs(car.v.dot(fwd.set(0, 0, 1).applyQuaternion(car.q))) * 3.6, engineRpm(), car.low, car.stalled);
    }
  }
  if (finishArch) {
    const ready = state.cp >= checkpoints.length;
    finishArch.portalMat.opacity = ready ? 0.3 + 0.15 * Math.sin(now * 0.003) : 0.08;
    if (finishArch.beacon) finishArch.beacon.visible = ready;
  }
  checkpoints.forEach((c, i) => {
    const next = i === state.cp;
    c.beam.visible = !c.done;
    c.beamMat.opacity = next ? 0.22 + 0.1 * Math.sin(now * 0.004) : 0.07;
  });
  for (const c of cairns) if (!c.found) c.flag.rotation.y = Math.sin(now * 0.002 + c.x) * 0.35;
}

let lastFlipMsg = 0;
function vehicleChecks(dt, now) {
  up.set(0, 1, 0).applyQuaternion(car.q);
  const wet = hasWater(R);
  if (wet && R.wl - car.p.y > 0.75 && !car.stalled) { car.stalled = true; car.winch = null; toast('Water reached the air intake. The engine is flooded. Press R to recover.', 4500); }
  if (up.y < 0.3 && car.v.length() < 2) car.flipT += dt; else car.flipT = 0;
  if (car.flipT > 2 && now - lastFlipMsg > 8000) { lastFlipMsg = now; toast('On your side. Press R to put the wheels back down.'); }
  if (car.grounded === 4 && up.y > 0.85 && !car.stalled && (!wet || heightAt(car.p.x, car.p.z) > R.wl + 0.5)) {
    car.safeT += dt;
    if (car.safeT > 2) { car.safeT = 0; car.safe.copy(car.p); car.safeYaw = yawOf(car.q); }
  }
}
