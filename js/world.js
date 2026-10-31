'use strict';
/* ---------- Region contents: cairns, arches, checkpoints, props ---------- */
let cairns = [], finishArch = null, checkpoints = [];

function placeCairns(rnd, found) {
  const cands = [], n = new V3(), reach = HALF - (R.big ? 140 : 100);
  for (let t = 0; t < (R.big ? 9000 : 5000); t++) {
    const x = (rnd() * 2 - 1) * reach, z = (rnd() * 2 - 1) * reach, h = rawHeight(x, z, true);
    if (h < R.wl + 3 || nearPad(x, z, 70)) continue;
    if (normalAt(x, z, n).y < 0.75) continue;
    if (R.cairnOk && !R.cairnOk(x, z, h)) continue;
    // Quick maps favour lookout spots; big maps just spread them out.
    cands.push({ x, z, h, s: R.big ? rnd() : h + rnd() * 12 });
  }
  cands.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const minD of R.big ? [420, 280, 150] : [120, 80, 40]) {
    for (const c of cands) {
      if (picked.length >= R.cairns) break;
      if (picked.every(p => Math.hypot(p.x - c.x, p.z - c.z) > minD)) picked.push(c);
    }
    if (picked.length >= R.cairns) break;
  }
  const stoneMat = new THREE.MeshLambertMaterial({ color: R.frozen ? '#7d858c' : R.dry ? '#8c8c8a' : '#9a9184' });
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3a2e24' });
  cairns = picked.map((c, i) => {
    const g = new THREE.Group();
    [[1.0, 0.6], [0.8, 1.6], [0.6, 2.4], [0.42, 3.0]].forEach(([r, y], k) => {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stoneMat);
      s.position.y = y; s.rotation.set(k, k * 1.7, k * 0.5); s.castShadow = true; g.add(s);
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), poleMat);
    pole.position.y = 4.4; g.add(pole);
    const flagMat = new THREE.MeshLambertMaterial({ color: '#e8742f', side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), flagMat);
    flag.position.set(0.62, 5.25, 0); flag.castShadow = true; g.add(flag);
    g.position.set(c.x, c.h - 0.2, c.z);
    world.add(g);
    addObstacle({ x: c.x, z: c.z, y: c.h, r: 1.1, h: 3.5, kind: 'cairn' });
    const isFound = !!(found && found[i]);
    if (isFound) flagMat.color.set('#f1ead9');
    return { x: c.x, z: c.z, y: c.h, found: isFound, flag, flagMat };
  });
}

function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 96);
  x.fillStyle = fg; x.font = '900 64px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 52);
  return new THREE.CanvasTexture(c);
}
function buildArch(x, z, yaw, kind) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: R.frozen ? '#7b838a' : R.archColor || '#8f877a' });
  const cs = Math.cos(yaw), sn = Math.sin(yaw), base = rawHeight(x, z, true);
  for (const sx of [-3.6, 3.6]) {
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 1.5), mat);
      b.position.set(sx + (k % 2 ? 0.08 : -0.06), 0.8 + k * 1.6, 0); b.rotation.y = (k - 1) * 0.08; b.castShadow = true; g.add(b);
    }
    addObstacle({ x: x + sx * cs, z: z - sx * sn, y: base, r: 1.0, h: 5, kind: 'arch' });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(9, 1.1, 1.7), mat);
  lintel.position.y = 5.35; lintel.castShadow = true; g.add(lintel);
  const isFinish = kind === 'finish';
  // Two single-sided banners back to back, so the text reads correctly from both directions.
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture(isFinish ? 'FINISH' : 'START', isFinish ? '#cf5d33' : '#86a35b', '#f1ead9') });
  for (const ry of [0, Math.PI]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), bannerMat);
    banner.position.set(0, 6.5, ry ? -0.01 : 0.01); banner.rotation.y = ry; g.add(banner);
  }
  let portalMat = null, beacon = null;
  if (isFinish) {
    portalMat = new THREE.MeshBasicMaterial({ color: '#f0a53a', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(5.7, 4.7), portalMat);
    portal.position.y = 2.35; g.add(portal);
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#f0a53a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beacon.position.y = 66; g.add(beacon);
  }
  g.position.set(x, base - 0.05, z); g.rotation.y = yaw;
  world.add(g);
  return { group: g, portalMat, beacon, x, z };
}

// Survey posts on the big maps. They must be reached in order before the finish arch counts.
function buildCheckpoints(done) {
  const stone = new THREE.MeshLambertMaterial({ color: R.dry ? '#8d8f93' : '#8f877a' });
  checkpoints = R.checkpoints.map((cp, i) => {
    const [x, z] = cp.at, h = rawHeight(x, z, true), g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.2, 7), stone); base.position.y = 0.4; base.castShadow = true; g.add(base);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 0.35), new THREE.MeshLambertMaterial({ color: '#e2a72e' })); post.position.y = 2.4; post.castShadow = true; g.add(post);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshBasicMaterial({ map: bannerTexture(String(i + 1), '#141a15', '#f0a53a'), side: THREE.DoubleSide }));
    plate.position.y = 4.4; g.add(plate);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#7fd0e6', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 160, 8, 1, true), beamMat); beam.position.y = 84; g.add(beam);
    g.position.set(x, h - 0.1, z);
    world.add(g);
    addObstacle({ x, z, y: h, r: 1.3, h: 2, kind: 'post' });
    return { x, z, name: cp.name, hint: cp.hint || '', group: g, beam, beamMat, plate, done: i < done };
  });
}

/* ---------- Prop kit ---------- */
// Region props (huts, prayer flags, landers...) are many small boxes. They are all merged into one
// vertex-coloured mesh so a whole map of scenery costs a single draw call.
function makePropKit() {
  const pos = [], nor = [], col = [], c = new THREE.Color(), m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new V3();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), ps = new V3();
  const kit = {
    add(geo, color, x, y, z, rx, ry, rz, sx, sy, sz) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      // YXZ: tilt in the prop's own frame first, then turn it by yaw.
      m4.compose(ps.set(x, y, z), q.setFromEuler(e.set(rx || 0, ry || 0, rz || 0, 'YXZ')), sc.set(sx || 1, sy || 1, sz || 1));
      nm.getNormalMatrix(m4); c.set(color);
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m4); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
      if (g !== geo) g.dispose();
    },
    // Local frame helper: place parts relative to an origin turned by yaw.
    frame(ox, oy, oz, yaw) {
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      return {
        box: (w, h, d, color, x, y, z, ry, rx, rz) => kit.add(BOX, color, ox + x * cs + z * sn, oy + y, oz - x * sn + z * cs, rx || 0, yaw + (ry || 0), rz || 0, w, h, d),
        cyl: (r, h, color, x, y, z, seg, rx, rz) => kit.add(seg === 6 ? CYL6 : CYL, color, ox + x * cs + z * sn, oy + y, oz - x * sn + z * cs, rx || 0, yaw, rz || 0, r, h, r),
        at: (x, z) => [ox + x * cs + z * sn, oz - x * sn + z * cs],
      };
    },
    ground: (x, z) => rawHeight(x, z, true),
    anchor: (x, z, r, h, kind) => addObstacle({ x, z, y: rawHeight(x, z, true), r, h, kind: kind || 'post' }),
    finish() {
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      m.castShadow = true; m.receiveShadow = true;
      world.add(m);
    },
  };
  return kit;
}
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);

/* ---------- Build a region ---------- */
function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry && o.geometry !== BOX && o.geometry !== CYL && o.geometry !== CYL6) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}
function buildRegion(found, cpDone) {
  R = REGIONS[state.map];
  R.s = R.seed;
  disposeTree(world);
  scene.remove(world); world = new THREE.Group(); scene.add(world);
  R.pads = [];
  SIZE = R.size; HALF = SIZE / 2;
  if (R.init && !R.ready) { R.init(); R.ready = true; }
  const startPads = [R.start, R.end].map(([x, z]) => ({ x, z, r0: 16, r1: 50, h: hasWater(R) ? Math.max(rawHeight(x, z, false), R.wl + 5) : rawHeight(x, z, false) }));
  R.pads = [...startPads, ...(R.extraPads || [])];
  setupTerrain();
  const rnd = mulberry(R.s * 31 + 7);
  placeCairns(rnd, found);
  const yaw = routeYaw(R);
  buildArch(R.start[0] + Math.sin(yaw) * 12, R.start[1] + Math.cos(yaw) * 12, yaw, 'start');
  finishArch = buildArch(R.end[0], R.end[1], R.endYaw !== undefined ? R.endYaw : yaw, 'finish');
  state.cp = cpDone || 0;
  buildCheckpoints(state.cp);
  if (R.props) { const kit = makePropKit(); R.props(kit); kit.finish(); }
  hemi.groundColor.set(R.mid).multiplyScalar(0.6);
  weather.kind = R.weather; weather.rain = 0; weather.target = 0;
  rainMat.size = R.weather === 'snow' ? 0.2 : 0.09;
  camera.far = R.big ? 3400 : 1600; camera.updateProjectionMatrix();
  earthDisc.visible = !!R.space;
  $('#hudRegion').textContent = R.name; $('#bmTitle').textContent = R.name;
  state.loadedMap = state.map;
  if (R.fixedT !== undefined) sky.t = R.fixedT;
  primeChunks(R.start[0], R.start[1]);
  stepMapImage(R.big ? 250 : 1e9);
  minimapReset();
}
