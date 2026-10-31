'use strict';
/* ---------- Vehicle physics ---------- */
// A single rigid body with four raycast wheels. Each wheel is a spring-damper pushing along the
// body's up axis, and tyre forces are clamped to a friction circle (grip x load), so a heavy,
// slow truck on a good surface grips and a spinning wheel in mud does not.
const G = 9.81;
const car = {
  spec: CAR_TYPES[0],
  p: new V3(), v: new V3(), q: new THREE.Quaternion(), w: new V3(),
  steer: 0, low: false, stalled: false, winch: null, grounded: 0, safe: new V3(), safeYaw: 0, flipT: 0, safeT: 0,
  wheel: [],
};
function resetWheels() {
  const S = car.spec;
  car.wheel = S.wheels.map(() => ({ comp: 0, d: S.rest + S.wr, contact: false, surf: SURF.grass, spinV: 0, angle: 0, slip: 0, vl: 0, cp: new V3(), depth: 0 }));
}
resetWheels();
let carMesh = buildCarMesh(car.spec, true);
function setCarType(i) {
  const paint = carMesh.paint.color.getHex();
  disposeCarMesh(carMesh);
  car.spec = CAR_TYPES[i];
  resetWheels();
  carMesh = buildCarMesh(car.spec, true);
  carMesh.paint.color.setHex(paint);
}

const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1b1d1a }));
ropeMesh.visible = false; scene.add(ropeMesh);

const F = new V3(), T = new V3(), up = new V3(), fwd = new V3(), right = new V3(), off = new V3(), a = new V3(), foot = new V3(),
  nrm = new V3(), r = new V3(), vp = new V3(), wf = new V3(), side = new V3(), tmp = new V3(), tmp2 = new V3(), qi = new THREE.Quaternion();
const Yaxis = new V3(0, 1, 0);
const ctl = { throttle: 0, brake: 0, handbrake: false };

function addForceAt(f, rr) {
  F.add(f);
  T.x += rr.y * f.z - rr.z * f.y; T.y += rr.z * f.x - rr.x * f.z; T.z += rr.x * f.y - rr.y * f.x;
}
function pointVel(rr, out) {
  const w = car.w;
  return out.set(w.y * rr.z - w.z * rr.y, w.z * rr.x - w.x * rr.z, w.x * rr.y - w.y * rr.x).add(car.v);
}

function step(dt) {
  const { p, v, q, w } = car, S = car.spec, M = S.mass, REST = S.rest, WR = S.wr;
  F.set(0, -G * M, 0); T.set(0, 0, 0);
  up.set(0, 1, 0).applyQuaternion(q); fwd.set(0, 0, 1).applyQuaternion(q); right.set(-1, 0, 0).applyQuaternion(q);
  const speedF = v.dot(fwd), gear = car.low ? S.low : S.high, th = ctl.throttle;
  let drive = 0;
  if (!car.stalled) {
    if (th > 0) drive = th * gear.force * clamp(1 - Math.max(0, speedF) / gear.vmax, 0, 1);
    else if (th < 0) drive = th * gear.force * 0.7 * clamp(1 - Math.max(0, -speedF) / gear.rev, 0, 1);
  }
  const hold = Math.abs(th) < 0.05 && Math.abs(speedF) < 1.2 && !ctl.brake;
  const sc = Math.cos(car.steer), ss = Math.sin(car.steer), quarter = M / 4, wMu = (1 - 0.2 * weather.rain) * S.grip;
  let grounded = 0;
  for (let k = 0; k < 4; k++) {
    const wh = car.wheel[k];
    off.fromArray(S.wheels[k]).applyQuaternion(q); a.copy(p).add(off);
    if (up.y < 0.12) { wh.comp = 0; wh.contact = false; wh.d = REST + WR; continue; }
    foot.copy(a).addScaledVector(up, -(REST + WR * 0.6));
    const hg = heightAt(foot.x, foot.z);
    normalAt(foot.x, foot.z, nrm);
    const surf = surfaceAt(foot.x, foot.z, nrm.y, hg);
    const d = (a.y - (hg - surf.sink)) / up.y;
    wh.d = d; wh.surf = surf; wh.depth = hasWater(R) ? R.wl - hg : 0;
    let comp = REST + WR - d;
    if (comp <= 0) { wh.comp = 0; wh.contact = false; continue; }
    comp = Math.min(comp, REST + 0.2);
    const rate = (comp - wh.comp) / dt;
    wh.comp = comp; wh.contact = true; grounded++;
    let fn = S.k * comp + S.c * rate;
    if (comp > REST) fn += (comp - REST) * S.k * 8; // bump stop
    fn = clamp(fn, 0, 90000);
    r.copy(off).addScaledVector(up, -d);
    wh.cp.copy(p).add(r);
    addForceAt(tmp.copy(up).multiplyScalar(fn), r);
    pointVel(r, vp);
    if (k < 2) wf.copy(fwd).multiplyScalar(sc).addScaledVector(right, ss); else wf.copy(fwd);
    wf.addScaledVector(nrm, -wf.dot(nrm)).normalize();
    side.crossVectors(nrm, wf).normalize();
    const vs = vp.dot(side), vl = vp.dot(wf);
    const maxF = surf.mu * wMu * fn;
    let fs = -vs * quarter / dt * 0.22;
    let bk = ctl.brake * S.brake / 4;
    if (hold) bk = Math.max(bk, 8000);
    if (ctl.handbrake && k >= 2) bk = Math.max(bk, 9000);
    const d4 = drive / 4, resist = bk + surf.rr * fn, desired = -vl * quarter / dt * 0.4;
    let fl = d4 + clamp(desired - d4, -resist, resist);
    const tot = Math.hypot(fs, fl); let slip = 0;
    if (tot > maxF) { const s = maxF / tot; fs *= s; fl *= s; slip = 1 - s; }
    if (ctl.handbrake && k >= 2) fs *= 0.45;
    r.addScaledVector(up, -r.dot(up) * 0.6);
    addForceAt(tmp.copy(side).multiplyScalar(fs).addScaledVector(wf, fl), r);
    wh.vl = vl; wh.slip = slip;
    wh.spinV = (ctl.handbrake && k >= 2) ? 0 : vl / WR + (slip > 0.15 && drive !== 0 ? Math.sign(drive) * slip * 28 : 0);
  }
  // Body corners: stiff contact so a rolled truck slides on its roof instead of sinking in.
  for (const c of S.corners) {
    off.fromArray(c).applyQuaternion(q); a.copy(p).add(off);
    const pen = heightAt(a.x, a.z) - a.y;
    if (pen <= 0) continue;
    normalAt(a.x, a.z, nrm); pointVel(off, vp);
    const vn = vp.dot(nrm), fn = clamp(pen * 120000 - vn * 7000, 0, 150000);
    tmp.copy(vp).addScaledVector(nrm, -vn);
    const vt = tmp.length(), ff = Math.min(vt * quarter / dt * 0.3, 0.6 * fn);
    if (vt > 1e-4) tmp.multiplyScalar(-ff / vt); else tmp.set(0, 0, 0);
    addForceAt(tmp.addScaledVector(nrm, fn), off);
  }
  if (hasWater(R)) {
    const depth = R.wl - (p.y - 0.4);
    if (depth > 0) {
      const dd = Math.min(depth, 1.8);
      F.addScaledVector(v, -dd * 700 * M / 1650); F.y += dd * 4200 * M / 1650;
      w.multiplyScalar(1 - dd * 0.4 * dt);
    }
  }
  if (car.winch) {
    off.fromArray(S.winch).applyQuaternion(q); a.copy(p).add(off);
    tmp.copy(car.winch.anchor).sub(a);
    const dist = tmp.length(); tmp.divideScalar(dist || 1);
    car.winch.dist = dist;
    if (dist > car.winch.len) {
      pointVel(off, vp);
      const t = clamp((dist - car.winch.len) * 50000 - vp.dot(tmp) * 6000, 0, 36000);
      car.winch.tension = t;
      addForceAt(tmp.multiplyScalar(t), off);
    } else car.winch.tension = 0;
  }
  F.addScaledVector(v, -v.length() * 0.55);
  v.addScaledVector(F, dt / M);
  qi.copy(q).invert();
  tmp.copy(T).applyQuaternion(qi); tmp.x /= S.inertia[0]; tmp.y /= S.inertia[1]; tmp.z /= S.inertia[2]; tmp.applyQuaternion(q);
  w.addScaledVector(tmp, dt);
  w.multiplyScalar(1 - (grounded ? 0.9 : 0.2) * dt);
  p.addScaledVector(v, dt);
  const wx = w.x * dt * 0.5, wy = w.y * dt * 0.5, wz = w.z * dt * 0.5;
  const { x: qx, y: qy, z: qz, w: qw } = q;
  q.set(qx + wx * qw + wy * qz - wz * qy, qy + wy * qw + wz * qx - wx * qz, qz + wz * qw + wx * qy - wy * qx, qw - wx * qx - wy * qy - wz * qz).normalize();
  car.grounded = grounded;
}

function pushOut(cx, cz, ox, oz, rr) {
  const dx = cx - ox, dz = cz - oz, d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d, push = rr - d, v = car.v;
  car.p.x += nx * push; car.p.z += nz * push;
  const vn = v.x * nx + v.z * nz;
  if (vn < 0) { v.x -= nx * vn * 1.25; v.z -= nz * vn * 1.25; car.w.y *= 0.7; }
  return vn;
}
function collideObstacles() {
  const p = car.p, hull = car.spec.hull;
  fwd.set(0, 0, 1).applyQuaternion(car.q);
  for (const cz of hull.zs) {
    const cx = p.x + fwd.x * cz, czz = p.z + fwd.z * cz;
    nearbyObstacles(cx, czz, o => {
      if (p.y > o.y + o.h + 1.2) return;
      if (pushOut(cx, czz, o.x, o.z, o.r + hull.r) < -7) thud();
    });
    for (const rc of remotes.values()) {
      if (!rc.mesh.group.visible) continue;
      const rp = rc.mesh.group.position;
      if (Math.abs(rp.y - p.y) < 2.5 && pushOut(cx, czz, rp.x, rp.z, hull.r + 1.15) < -5) thud();
    }
  }
  const lim = HALF - 8;
  p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
}

function yawOf(q) { tmp2.set(0, 0, 1).applyQuaternion(q); return Math.atan2(tmp2.x, tmp2.z); }
function placeCar(x, z, yaw) {
  car.p.set(x, heightAt(x, z) + car.spec.rest + car.spec.wr + 0.75, z);
  car.q.setFromAxisAngle(Yaxis, yaw);
  car.v.set(0, 0, 0); car.w.set(0, 0, 0);
  car.stalled = false; car.winch = null; car.flipT = 0; car.steer = 0;
  car.wheel.forEach(w => { w.comp = 0; w.contact = false; });
  car.safe.copy(car.p); car.safeYaw = yaw;
}
function placeAtStart() {
  // Spread drivers sideways on the start pad so they don't spawn inside each other.
  const yaw = routeYaw(R), slot = net.online ? ((net.id - 1) % 3) - 1 : 0;
  placeCar(R.start[0] + Math.cos(yaw) * slot * 4.5, R.start[1] - Math.sin(yaw) * slot * 4.5, yaw);
}
function recover() {
  const inWater = hasWater(R) && heightAt(car.p.x, car.p.z) < R.wl + 0.3;
  if (inWater || car.stalled) placeCar(car.safe.x, car.safe.z, car.safeYaw);
  else placeCar(car.p.x, car.p.z, yawOf(car.q));
  toast('Vehicle recovered.');
}
