'use strict';
/* ---------- State, input, camera ---------- */
const state = { started: false, map: 0, loadedMap: -1, photo: false, finished: false, bigmap: false, t0: 0, elapsed: 0, cp: 0,
  paint: 0, carType: 0, camMode: 0, lights: false, lightsAuto: true, muted: false, showKeys: true, localResults: {} };
const CAM_NAMES = ['Chase camera', "Driver's seat", 'Hood camera'];
const keys = {}, touchIn = { left: 0, right: 0, gas: 0, brake: 0 };
const cam = { yaw: 0, pitch: 0.3, dist: 9.5, lastDrag: 0, yawS: 0, orbit: 0, photoBase: 0, hy: 0, hp: 0 };
const gp = { steer: 0, gas: 0, brake: 0, prev: [] };

function setBigMap(on) { state.bigmap = on; $('#bigmap').hidden = !on; }
function setPaint(i) { state.paint = i; carMesh.paint.color.set(PAINTS[i][1]); }
function press(code) {
  if (!state.started) { if (code === 'Enter') start(); return; }
  if (state.finished) { if (code === 'Enter') driveAgain(); return; }
  switch (code) {
    case 'KeyL': {
      const sp = Math.abs(car.v.dot(fwd.set(0, 0, 1).applyQuaternion(car.q)));
      if (sp > 2.5) { toast('Slow below 9 km/h to shift the transfer case.'); break; }
      car.low = !car.low;
      toast(car.low ? `4L: low range. More pulling power, top speed ${Math.round(car.spec.low.vmax * 3.6)} km/h.` : '4H: high range. Fast, less pulling power.');
      clunk(); break;
    }
    case 'KeyE': toggleWinch(); break;
    case 'KeyM': setBigMap(!state.bigmap); break;
    case 'KeyH': state.lightsAuto = false; state.lights = !state.lights; break;
    case 'KeyR': recover(); break;
    case 'KeyC': state.camMode = (state.camMode + 1) % 3; cam.hy = cam.hp = 0; toast(CAM_NAMES[state.camMode] + '.', 1400); break;
    case 'KeyV': setPaint((state.paint + 1) % PAINTS.length); toast('Paint: ' + PAINTS[state.paint][0]); break;
    case 'KeyT': minimap.rotate = !minimap.rotate; saveMinimap(); toast(minimap.rotate ? 'Minimap: heading up.' : 'Minimap: north up.', 1600); break;
    case 'PageUp': minimapZoom(-1); break;
    case 'PageDown': minimapZoom(1); break;
    case 'KeyP':
      state.photo = !state.photo;
      cam.photoBase = cam.yawS - cam.yaw;
      $('#hud').hidden = state.photo; $('#photoHint').hidden = !state.photo; $('#touch').hidden = state.photo || !isTouch;
      if (state.photo) setBigMap(false);
      break;
    case 'KeyN': state.muted = !state.muted; if (audio.master) audio.master.gain.value = state.muted ? 0 : 0.32; toast(state.muted ? 'Sound off.' : 'Sound on.'); break;
    case 'KeyK': state.showKeys = !state.showKeys; $('#keys').hidden = !state.showKeys; break;
    case 'BracketLeft': if (state.photo) sky.t = (sky.t + 1 - 1 / 48) % 1; break;
    case 'BracketRight': if (state.photo) sky.t = (sky.t + 1 / 48) % 1; break;
    case 'Escape': setBigMap(false); break;
  }
}
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Enter') { e.target.blur(); press('Enter'); } return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!e.repeat) press(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let drag = null;
// Dragging orbits the chase camera, or turns your head in the driver's seat.
function look(dx, dy) {
  if (state.camMode === 1 && !state.photo) { cam.hy = clamp(cam.hy - dx, -1.75, 1.75); cam.hp = clamp(cam.hp - dy, -0.55, 0.6); }
  else { cam.yaw -= dx; cam.pitch = clamp(cam.pitch + dy, 0.04, 1.25); }
  cam.lastDrag = performance.now();
}
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  look((e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.004);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 5, 24); }, { passive: false });

const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
document.querySelectorAll('#touch [data-hold]').forEach(b => {
  const k = b.dataset.hold;
  const on = e => { e.preventDefault(); touchIn[k] = 1; b.classList.add('down'); if (b.setPointerCapture) b.setPointerCapture(e.pointerId); };
  const offF = () => { touchIn[k] = 0; b.classList.remove('down'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', offF); b.addEventListener('pointercancel', offF); b.addEventListener('lostpointercapture', offF);
});
document.querySelectorAll('#touch [data-tap]').forEach(b => b.addEventListener('click', () => press(b.dataset.tap)));

function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const g = pads && pads[0];
  if (!g) { gp.steer = gp.gas = gp.brake = 0; return; }
  let s = g.axes[0] || 0; if (Math.abs(s) < 0.12) s = 0; gp.steer = s;
  gp.gas = g.buttons[7] ? g.buttons[7].value : 0; gp.brake = g.buttons[6] ? g.buttons[6].value : 0;
  const map = { 0: 'KeyE', 1: 'KeyL', 2: 'KeyH', 3: 'KeyR', 4: 'KeyC', 5: 'KeyV', 8: 'KeyM', 9: 'KeyP', 12: 'PageUp', 13: 'PageDown' };
  for (const b in map) { const pr = !!(g.buttons[b] && g.buttons[b].pressed); if (pr && !gp.prev[b]) press(state.started && !state.finished ? map[b] : 'Enter'); gp.prev[b] = pr; }
  const rx = g.axes[2] || 0, ry = g.axes[3] || 0;
  if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15) look(rx * dt * 2.2, ry * dt * 1.5);
}

function updateControls(dt) {
  const speedF = car.v.dot(fwd.set(0, 0, 1).applyQuaternion(car.q));
  const live = state.started && !state.finished;
  const gas = live ? Math.max(keys.KeyW || keys.ArrowUp ? 1 : 0, touchIn.gas, gp.gas) : 0;
  const back = live ? Math.max(keys.KeyS || keys.ArrowDown ? 1 : 0, touchIn.brake, gp.brake) : 0;
  let st = live ? ((keys.KeyD || keys.ArrowRight || touchIn.right) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft || touchIn.left) ? 1 : 0) + gp.steer : 0;
  st = clamp(st, -1, 1);
  ctl.throttle = 0; ctl.brake = state.finished ? 1 : 0;
  if (gas > 0) { if (speedF < -1.5) ctl.brake = gas; else ctl.throttle = gas; }
  if (back > 0) { if (speedF > 1.5) ctl.brake = Math.max(ctl.brake, back); else ctl.throttle = -back; }
  ctl.handbrake = live && !!keys.Space;
  const maxSteer = 0.6 / (1 + Math.abs(speedF) * 0.07);
  car.steer += clamp(st * maxSteer - car.steer, -2.4 * dt, 2.4 * dt);
}

const camPos = new V3(), camTarget = new V3(), qFlip = new THREE.Quaternion().setFromAxisAngle(Yaxis, Math.PI), qTilt = new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), -0.08);
const qHead = new THREE.Quaternion(), eHead = new THREE.Euler(0, 0, 0, 'YXZ'), sway = new V3(), prevV = new V3(), accel = new V3(), eye = new V3();
function setNear(n) { if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); } }
function updateCamera(dt, now) {
  camTarget.copy(car.p).y += 1.0;
  // Body acceleration in the car's own frame, for head sway in the driver's seat.
  if (dt > 0) { accel.copy(car.v).sub(prevV).divideScalar(dt).applyQuaternion(qi.copy(car.q).invert()); prevV.copy(car.v); }
  if (!state.started) {
    setNear(0.2);
    cam.orbit += dt * 0.06;
    camPos.set(car.p.x + Math.sin(cam.orbit) * 13, car.p.y + 4.2, car.p.z + Math.cos(cam.orbit) * 13);
    camera.position.copy(camPos); camera.lookAt(camTarget.x - Math.cos(cam.orbit) * 3, camTarget.y, camTarget.z + Math.sin(cam.orbit) * 3);
    return;
  }
  if (state.camMode === 1 && !state.photo) {
    // Driver's seat. The head lags behind body acceleration a little (leans back when you
    // accelerate, sideways in turns), which makes bumps readable without being nauseating.
    setNear(0.05);
    const ck = car.spec.cockpit;
    tmp.set(-accel.x, -accel.y * 0.5, -accel.z).multiplyScalar(0.005);
    tmp.clampLength(0, 0.07);
    sway.lerp(tmp, 1 - Math.exp(-6 * dt));
    if (now - cam.lastDrag > 2500) { cam.hy *= 1 - Math.min(1, 2 * dt); cam.hp *= 1 - Math.min(1, 2 * dt); }
    eye.fromArray(ck.eye).add(sway).applyQuaternion(car.q);
    camera.position.copy(car.p).add(eye);
    qHead.setFromEuler(eHead.set(cam.hp, cam.hy, 0));
    camera.quaternion.copy(car.q).multiply(qFlip).multiply(qHead).multiply(qTilt);
    return;
  }
  if (state.camMode === 2 && !state.photo) {
    setNear(0.1);
    const ck = car.spec.cockpit;
    up.set(0, 1, 0).applyQuaternion(car.q); fwd.set(0, 0, 1).applyQuaternion(car.q);
    camera.position.copy(car.p).addScaledVector(up, ck.eye[1] + 0.06).addScaledVector(fwd, ck.dashZ[1] - 0.15);
    camera.quaternion.copy(car.q).multiply(qFlip).multiply(qTilt);
    return;
  }
  setNear(0.2);
  const heading = yawOf(car.q);
  if (!state.photo && now - cam.lastDrag > 2500 && car.v.length() > 2) cam.yaw *= 1 - Math.min(1, 1.6 * dt);
  if (state.photo) cam.yawS = cam.photoBase + cam.yaw;
  else cam.yawS += wrapAngle(heading + cam.yaw - cam.yawS) * (1 - Math.exp(-3.5 * dt));
  const dist = cam.dist + clamp(car.v.length() - 15, 0, 25) * 0.12;
  const cp = Math.cos(cam.pitch) * dist;
  camPos.set(camTarget.x - Math.sin(cam.yawS) * cp, camTarget.y + Math.sin(cam.pitch) * dist + 0.6, camTarget.z - Math.cos(cam.yawS) * cp);
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 1.2);
  camera.position.lerp(camPos, 1 - Math.exp(-9 * dt));
  camera.lookAt(camTarget);
}
