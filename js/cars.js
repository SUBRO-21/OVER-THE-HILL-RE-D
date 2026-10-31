'use strict';
/* ---------- Vehicle types ---------- */
// Every handling number lives here, one block per vehicle. Gravity is NOT per vehicle or per map:
// G is 9.81 everywhere, including the Moon map.
// Car axes: +z forward, +y up, -x is the driver's right. Wheel/corner arrays are [x, y, z] in metres.
// Suspension: k is spring rate per wheel (N/m), c damping (N·s/m). Each pair below sags about 9 cm
// at rest with a damping ratio near 0.47, so all four feel related but distinct.
const CAR_TYPES = [
  { id: 'jeep', name: 'Trail Jeep', blurb: 'All-rounder. The one you know.',
    mass: 1650, rest: 0.55, wr: 0.42, tyreW: 0.32, k: 46000, c: 4100, brake: 30000, inertia: [4200, 4600, 1900], grip: 1.0,
    high: { force: 11500, vmax: 44, rev: 9 }, low: { force: 19000, vmax: 11, rev: 6 },
    wheels: [[0.82, -0.1, 1.32], [-0.82, -0.1, 1.32], [0.82, -0.1, -1.28], [-0.82, -0.1, -1.28]],
    corners: [[.9, -.25, 2.05], [-.9, -.25, 2.05], [.9, -.25, -2.05], [-.9, -.25, -2.05], [.85, 1.33, .5], [-.85, 1.33, .5], [.85, 1.33, -1.45], [-.85, 1.33, -1.45], [0, .5, 2.12], [0, .5, -2.18]],
    winch: [0, -0.05, 2.2], hull: { zs: [1.1, -1.1], r: 1.15 }, lamps: { z: 2.04, x: 0.62, y: 0.25 },
    cockpit: { eye: [-0.4, 1.06, -0.32], dashY: 0.78, dashZ: [0.12, 0.5], dashW: 1.62, wheelZ: 0.1, doorY: 0.66, doorX: 0.86, doorZ: [-1.4, 0.48] },
    build: buildJeep },
  { id: 'pickup', name: 'Ridge Pickup', blurb: 'Long, heavy, lots of low-range torque. Tows friends out.',
    mass: 2100, rest: 0.5, wr: 0.44, tyreW: 0.34, k: 56000, c: 5000, brake: 36000, inertia: [8350, 8700, 2700], grip: 1.0,
    high: { force: 14500, vmax: 40, rev: 8 }, low: { force: 25000, vmax: 10, rev: 6 },
    wheels: [[0.86, -0.1, 1.6], [-0.86, -0.1, 1.6], [0.86, -0.1, -1.55], [-0.86, -0.1, -1.55]],
    corners: [[.95, -.25, 2.5], [-.95, -.25, 2.5], [.95, -.25, -2.5], [-.95, -.25, -2.5], [.88, 1.36, 1.15], [-.88, 1.36, 1.15], [.88, 1.36, -.45], [-.88, 1.36, -.45], [0, .5, 2.6], [0, .5, -2.55], [.9, .95, -2.4], [-.9, .95, -2.4]],
    winch: [0, -0.05, 2.62], hull: { zs: [1.5, 0, -1.5], r: 1.15 }, lamps: { z: 2.52, x: 0.66, y: 0.25 },
    cockpit: { eye: [-0.42, 1.1, 0.2], dashY: 0.8, dashZ: [0.72, 1.12], dashW: 1.7, wheelZ: 0.62, doorY: 0.7, doorX: 0.9, doorZ: [-0.42, 1.12] },
    build: buildPickup },
  { id: 'crawler', name: 'Goat Crawler', blurb: 'Short and light. Huge wheel travel, very low gearing.',
    mass: 1250, rest: 0.68, wr: 0.46, tyreW: 0.38, k: 30000, c: 2900, brake: 24000, inertia: [2040, 2390, 1290], grip: 1.12,
    high: { force: 8000, vmax: 30, rev: 8 }, low: { force: 17000, vmax: 6.5, rev: 5 },
    wheels: [[0.85, -0.05, 1.0], [-0.85, -0.05, 1.0], [0.85, -0.05, -1.0], [-0.85, -0.05, -1.0]],
    corners: [[.85, -.1, 1.55], [-.85, -.1, 1.55], [.85, -.1, -1.55], [-.85, -.1, -1.55], [.75, 1.5, .55], [-.75, 1.5, .55], [.75, 1.5, -1.0], [-.75, 1.5, -1.0], [0, .5, 1.62], [0, .5, -1.6]],
    winch: [0, 0.05, 1.62], hull: { zs: [0.7, -0.7], r: 1.05 }, lamps: { z: 1.58, x: 0.5, y: 0.35 },
    cockpit: { eye: [-0.36, 1.18, -0.4], dashY: 0.84, dashZ: [0.18, 0.5], dashW: 1.36, wheelZ: 0.0, doorY: 0.74, doorX: 0.72, doorZ: [-1.1, 0.5] },
    build: buildCrawler },
  { id: 'rover', name: 'Survey Rover', blurb: 'Open frame, big wheels, slow and planted. Built for the Moon.',
    mass: 1400, rest: 0.6, wr: 0.55, tyreW: 0.36, k: 36000, c: 3300, brake: 26000, inertia: [2000, 2640, 1990], grip: 1.06,
    high: { force: 8400, vmax: 19, rev: 7 }, low: { force: 14500, vmax: 8, rev: 5 },
    wheels: [[1.0, -0.05, 1.25], [-1.0, -0.05, 1.25], [1.0, -0.05, -1.25], [-1.0, -0.05, -1.25]],
    corners: [[1.1, -.1, 1.8], [-1.1, -.1, 1.8], [1.1, -.1, -1.8], [-1.1, -.1, -1.8], [.8, 1.3, 0], [-.8, 1.3, 0], [0, .4, 1.9], [0, .4, -1.9]],
    winch: [0, 0.0, 1.9], hull: { zs: [0.8, -0.8], r: 1.25 }, lamps: { z: 1.86, x: 0.55, y: 0.45 },
    cockpit: { eye: [-0.4, 1.06, -0.3], dashY: 0.74, dashZ: [0.3, 0.55], dashW: 1.2, wheelZ: 0.12, doorY: 0, doorX: 0, doorZ: null, open: true },
    build: buildRover },
];
const carTypeIndex = id => Math.max(0, CAR_TYPES.findIndex(t => t.id === id));

/* ---------- Mesh helpers ---------- */
function carKit(g) {
  const m = {
    paint: new THREE.MeshLambertMaterial({ color: PAINTS[0][1] }),
    dark: new THREE.MeshLambertMaterial({ color: 0x23261f }),
    chrome: new THREE.MeshLambertMaterial({ color: 0xcfcac0 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x2a3940 }),
    lampMat: new THREE.MeshBasicMaterial({ color: 0x8a8576 }),
    tailMat: new THREE.MeshBasicMaterial({ color: 0x6a1a12 }),
    tan: new THREE.MeshLambertMaterial({ color: 0xb8892f }),
  };
  m.box = (w, h, d, mat, x, y, z, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; (parent || g).add(b); return b; };
  m.cyl = (r, h, mat, x, y, z, axis, parent) => {
    const geo = new THREE.CylinderGeometry(r, r, h, 12);
    if (axis === 'x') geo.rotateZ(Math.PI / 2); else if (axis === 'z') geo.rotateX(Math.PI / 2);
    const b = new THREE.Mesh(geo, mat); b.position.set(x, y, z); b.castShadow = true; (parent || g).add(b); return b;
  };
  return m;
}
function addLamps(g, k, spec, withLights) {
  const L = spec.lamps;
  for (const x of [-L.x, L.x]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12).rotateX(Math.PI / 2), k.lampMat);
    l.position.set(x, L.y, L.z); g.add(l);
  }
  const spots = [];
  if (withLights) for (const x of [-L.x, L.x]) {
    const s = new THREE.SpotLight(0xfff1cf, 0, 75, 0.5, 0.55, 1.4);
    s.position.set(x, L.y + 0.05, L.z + 0.06);
    s.target.position.set(x * 2, -1.2, 24);
    g.add(s, s.target); spots.push(s);
  }
  return spots;
}
function addWheels(g, k, spec) {
  const wheelGeo = new THREE.CylinderGeometry(spec.wr, spec.wr, spec.tyreW, 14).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(spec.wr * 0.4, spec.wr * 0.4, spec.tyreW + 0.02, 8).rotateZ(Math.PI / 2);
  const lugGeo = new THREE.BoxGeometry(spec.tyreW + 0.02, 0.08, spec.wr * 1.2);
  return spec.wheels.map(w => {
    const pivot = new THREE.Group(); pivot.position.set(w[0], w[1] - (spec.rest - 0.1), w[2]);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, k.dark); tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(hubGeo, k.chrome), new THREE.Mesh(lugGeo, k.dark)); pivot.add(spin); g.add(pivot);
    return { pivot, spin };
  });
}

/* ---------- Vehicle bodies ---------- */
function buildJeep(g, k) {
  const { box } = k, hide = [];
  box(1.8, 0.7, 4.0, k.paint, 0, 0.15, 0);
  box(1.82, 0.1, 1.5, k.paint, 0, 0.53, 1.2);
  hide.push(box(1.68, 0.56, 1.95, k.glass, 0, 0.92, -0.45));
  box(1.78, 0.1, 2.08, k.paint, 0, 1.25, -0.45);
  for (const x of [-0.85, 0.85]) for (const z of [0.5, -0.45, -1.42]) box(0.08, 0.56, 0.1, k.paint, x, 0.92, z);
  box(1.6, 0.06, 1.6, k.dark, 0, 1.34, -0.5);
  for (const x of [-0.78, 0.78]) box(0.05, 0.12, 1.7, k.dark, x, 1.38, -0.5);
  box(0.5, 0.42, 0.32, k.tan, 0.4, 1.58, -0.9);
  box(1.95, 0.22, 0.22, k.chrome, 0, -0.05, 2.08);
  box(1.95, 0.22, 0.22, k.chrome, 0, -0.05, -2.08);
  box(1.3, 0.32, 0.06, k.dark, 0, 0.25, 2.02);
  box(0.5, 0.2, 0.2, k.dark, 0, -0.04, 2.24);
  for (const x of [-0.95, 0.95]) for (const z of [1.32, -1.28]) box(0.18, 0.12, 1.2, k.dark, x, 0.42, z);
  k.cyl(0.4, 0.26, k.dark, 0, 0.5, -2.15, 'z');
  for (const x of [-0.62, 0.62]) box(0.16, 0.12, 0.05, k.tailMat, x * 1.25, 0.3, -2.02);
  return hide;
}
function buildPickup(g, k) {
  const { box } = k, hide = [];
  box(1.9, 0.62, 5.0, k.paint, 0, 0.12, 0);
  box(1.92, 0.12, 1.4, k.paint, 0, 0.5, 1.82);
  hide.push(box(1.76, 0.6, 1.58, k.glass, 0, 0.9, 0.36));
  box(1.86, 0.1, 1.72, k.paint, 0, 1.25, 0.36);
  for (const x of [-0.9, 0.9]) for (const z of [1.15, -0.44]) box(0.08, 0.6, 0.1, k.paint, x, 0.9, z);
  // Load bed
  for (const x of [-0.92, 0.92]) box(0.1, 0.45, 2.02, k.paint, x, 0.66, -1.46);
  box(1.9, 0.45, 0.1, k.paint, 0, 0.66, -2.45);
  box(1.72, 0.05, 2.0, k.dark, 0, 0.45, -1.46);
  box(0.9, 0.35, 0.7, k.tan, 0.3, 0.65, -1.2);
  box(0.4, 0.5, 0.5, k.dark, -0.5, 0.72, -1.9);
  // Headache rack behind the cab
  box(1.7, 0.06, 0.06, k.dark, 0, 1.38, -0.5); for (const x of [-0.8, 0, 0.8]) box(0.05, 0.6, 0.05, k.dark, x, 1.08, -0.5);
  box(2.0, 0.24, 0.24, k.chrome, 0, -0.05, 2.55);
  box(2.0, 0.22, 0.22, k.chrome, 0, -0.05, -2.52);
  box(1.4, 0.3, 0.06, k.dark, 0, 0.25, 2.51);
  box(0.6, 0.24, 0.24, k.dark, 0, -0.04, 2.7);
  for (const x of [-0.98, 0.98]) for (const z of [1.6, -1.55]) box(0.2, 0.12, 1.25, k.dark, x, 0.4, z);
  for (const x of [-0.66, 0.66]) box(0.16, 0.14, 0.05, k.tailMat, x * 1.25, 0.32, -2.5);
  return hide;
}
function buildCrawler(g, k) {
  const { box } = k, hide = [];
  const tube = (w, h, d, x, y, z) => box(w, h, d, k.dark, x, y, z);
  box(1.46, 0.5, 2.7, k.paint, 0, 0.3, -0.05);
  box(1.5, 0.1, 0.8, k.paint, 0, 0.6, 0.95);
  box(1.0, 0.36, 0.5, k.dark, 0, 0.4, 1.32);
  // Roll cage
  for (const x of [-0.72, 0.72]) {
    tube(0.07, 0.95, 0.07, x, 1.03, 0.52); tube(0.07, 0.95, 0.07, x, 1.03, -1.0);
    tube(0.07, 0.07, 1.6, x, 1.5, -0.24);
  }
  tube(1.5, 0.07, 0.07, 0, 1.5, 0.52); tube(1.5, 0.07, 0.07, 0, 1.5, -1.0); tube(1.5, 0.07, 0.07, 0, 1.5, -0.24);
  box(1.2, 0.12, 0.14, k.dark, 0, 1.58, 0.5);
  // Seats and spare
  for (const x of [-0.36, 0.36]) { box(0.46, 0.1, 0.5, k.tan, x, 0.6, -0.4); box(0.46, 0.6, 0.1, k.tan, x, 0.92, -0.66); }
  k.cyl(0.42, 0.3, k.dark, 0, 0.75, -1.35, 'z');
  box(1.7, 0.18, 0.18, k.chrome, 0, 0.12, 1.5);
  box(1.7, 0.18, 0.18, k.chrome, 0, 0.12, -1.5);
  for (const x of [-0.92, 0.92]) for (const z of [1.0, -1.0]) box(0.16, 0.1, 1.0, k.paint, x, 0.62, z);
  for (const x of [-0.55, 0.55]) box(0.14, 0.12, 0.05, k.tailMat, x, 0.4, -1.42);
  // Lamp bar on the cage
  for (const x of [-0.45, -0.15, 0.15, 0.45]) box(0.18, 0.12, 0.08, k.lampMat, x, 1.58, 0.58);
  return hide;
}
function buildRover(g, k) {
  const { box } = k, hide = [];
  const white = new THREE.MeshLambertMaterial({ color: 0xd9d7cf }), gold = new THREE.MeshLambertMaterial({ color: 0xc89b3c });
  box(1.7, 0.16, 3.1, k.dark, 0, 0.12, 0);
  box(1.4, 0.3, 0.9, white, 0, 0.3, -1.05);
  box(1.4, 0.24, 0.5, gold, 0, 0.32, 1.25);
  for (const x of [-1.0, 1.0]) for (const z of [1.25, -1.25]) {
    box(0.5, 0.06, 1.2, k.paint, x, 0.66, z);
    box(0.08, 0.5, 0.08, k.dark, x * 0.6, 0.35, z);
  }
  // Seats, console and mast
  for (const x of [-0.4, 0.4]) { box(0.5, 0.08, 0.5, k.paint, x, 0.5, -0.25); box(0.5, 0.75, 0.08, k.paint, x, 0.9, -0.5); }
  box(0.08, 0.6, 0.08, k.chrome, 0, 0.55, 0.42);
  box(0.6, 0.3, 0.2, white, 0, 0.85, 0.45);
  box(0.06, 1.4, 0.06, k.chrome, 0.55, 1.2, -1.2);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.12, 0.12, 14), white);
  dish.position.set(0.55, 1.95, -1.2); dish.rotation.x = -0.5; dish.castShadow = true; g.add(dish);
  box(0.4, 0.3, 0.4, gold, -0.45, 0.62, -1.2);
  for (const x of [-0.55, 0.55]) box(0.14, 0.1, 0.05, k.tailMat, x, 0.28, -1.56);
  return hide;
}

/* ---------- Cockpit interior ---------- */
// Only visible in the driver's-seat camera. The driver sits on the right (-x), like cars in India.
function buildCockpit(g, k, spec) {
  const ck = spec.cockpit, inter = new THREE.Group(); g.add(inter);
  const dashMat = new THREE.MeshLambertMaterial({ color: 0x2b2a26 }), trim = new THREE.MeshLambertMaterial({ color: 0x3b3a34 });
  const [ex, , ] = ck.eye, [dz0, dz1] = ck.dashZ, dl = dz1 - dz0;
  k.box(ck.dashW, 0.16, dl, dashMat, 0, ck.dashY - 0.08, (dz0 + dz1) / 2, inter);
  k.box(ck.dashW, 0.36, 0.06, dashMat, 0, ck.dashY - 0.3, dz0 + 0.03, inter);
  if (ck.doorZ) for (const x of [-ck.doorX, ck.doorX]) k.box(0.08, 0.06, ck.doorZ[1] - ck.doorZ[0], trim, x, ck.doorY, (ck.doorZ[0] + ck.doorZ[1]) / 2, inter);
  if (!ck.open) k.box(0.2, 0.05, 0.03, trim, 0, ck.eye[1] + 0.12, dz1 - 0.06, inter); // rear-view mirror
  // Gear lever and transfer-case lever on the tunnel.
  k.box(0.24, 0.14, 0.36, trim, 0, ck.dashY - 0.5, dz0 - 0.1, inter);
  k.box(0.03, 0.24, 0.03, k.chrome, 0.06, ck.dashY - 0.34, dz0 - 0.06, inter);
  // Gauges: a canvas texture redrawn a few times a second.
  const gc = document.createElement('canvas'); gc.width = 256; gc.height = 96;
  const gTex = new THREE.CanvasTexture(gc);
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.165), new THREE.MeshBasicMaterial({ map: gTex }));
  gauge.position.set(ex, ck.dashY + 0.06, dz0 + 0.2); gauge.rotation.set(0.3, Math.PI, 0); inter.add(gauge);
  // Steering wheel on a tilted column. The pivot spins about its own axis with steering input.
  const col = new THREE.Group(); col.position.set(ex, ck.dashY + 0.02, ck.wheelZ + 0.06); col.rotation.x = 0.42; inter.add(col);
  const wheelPivot = new THREE.Group(); col.add(wheelPivot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 22), dashMat); wheelPivot.add(rim);
  k.box(0.32, 0.03, 0.02, dashMat, 0, -0.02, 0, wheelPivot);
  k.box(0.03, 0.16, 0.02, dashMat, 0, -0.09, 0, wheelPivot);
  k.box(0.07, 0.07, 0.03, trim, 0, 0, -0.005, wheelPivot);
  k.cyl(0.03, 0.4, dashMat, 0, 0, 0.2, 'z', col);
  inter.visible = false;
  return { inter, wheelPivot, gc, gTex, last: 0 };
}
function drawGauges(ck, speedKmh, rpm, low, warn) {
  const x = ck.gc.getContext('2d'), W = 256, H = 96;
  x.fillStyle = '#121410'; x.fillRect(0, 0, W, H);
  const dial = (cx, val, max, label, txt) => {
    x.strokeStyle = 'rgba(241,234,217,.35)'; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, 54, 36, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
    const a = Math.PI * 0.8 + clamp(val / max, 0, 1) * Math.PI * 1.4;
    x.strokeStyle = '#f0a53a'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(cx, 54); x.lineTo(cx + Math.cos(a) * 32, 54 + Math.sin(a) * 32); x.stroke();
    x.fillStyle = '#f1ead9'; x.font = '600 18px "Overpass Mono", monospace'; x.textAlign = 'center'; x.fillText(txt, cx, 80);
    x.fillStyle = 'rgba(241,234,217,.6)'; x.font = '400 10px "Overpass Mono", monospace'; x.fillText(label, cx, 30);
  };
  dial(60, speedKmh, 120, 'KM/H', String(Math.round(speedKmh)));
  dial(196, rpm, 1, 'RPM', String(Math.round(rpm * 40) * 100));
  x.fillStyle = low ? '#f0a53a' : 'rgba(241,234,217,.5)'; x.font = '800 20px "Overpass Mono", monospace'; x.textAlign = 'center';
  x.fillText(low ? '4L' : '4H', 128, 58);
  if (warn) { x.fillStyle = '#cf5d33'; x.fillRect(110, 70, 36, 12); }
  ck.gTex.needsUpdate = true;
}

/* ---------- Build a full vehicle ---------- */
function buildCarMesh(spec, withLights) {
  const g = new THREE.Group(), k = carKit(g);
  const hide = spec.build(g, k);
  const spots = addLamps(g, k, spec, withLights);
  const wheels = addWheels(g, k, spec);
  const cockpit = withLights ? buildCockpit(g, k, spec) : null;
  scene.add(g);
  return { group: g, paint: k.paint, wheels, spots, lampMat: k.lampMat, tailMat: k.tailMat, hide, cockpit, spec };
}
function disposeCarMesh(cm) {
  scene.remove(cm.group);
  cm.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
}
