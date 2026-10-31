'use strict';
/* ---------- Terrain ---------- */
// The world is cut into 256 m chunks that are built around the player and thrown away behind them.
// Near chunks get a fine 4 m mesh plus trees, rocks and collision obstacles; farther chunks get
// coarser meshes so mountains on the horizon stay cheap. Heights always come from the same seeded
// function, so a chunk rebuilt later (or on a friend's computer) is identical.
for (const r of REGIONS) for (const k in REGION_DEFAULTS) if (!(k in r)) r[k] = REGION_DEFAULTS[k];
for (const r of REGIONS) r.pads = r.pads || [];

let R = REGIONS[0];
let SIZE = 800, HALF = 400;
let world = new THREE.Group(); scene.add(world);   // region-lifetime objects: arches, cairns, water, props
const terrainRoot = new THREE.Group(); scene.add(terrainRoot);
const CHUNK = 256, OC = 16, L0N = 64, L0W = L0N + 1, L0CELL = CHUNK / L0N;
// Mesh resolution by distance from the player. r is the chunk-centre distance up to which a level is used.
const LODS = [{ n: 64, r: 620, skirt: 3 }, { n: 16, r: 1450, skirt: 14 }, { n: 8, r: Infinity, skirt: 30 }];
// Objects only on chunks that are (almost always) at the fine level, so trees sit on the mesh you see.
const OBJ_R = 600, LOD_HYST = 70;
let VIEW_R = 2400;
const chunks = new Map();
let staticObs = new Map();
const mapImage = document.createElement('canvas'); mapImage.width = mapImage.height = 200;
let terrainMat = null, waterMesh = null, objKit = null;
const chunkKey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);
const obsKey = (x, z) => (Math.floor(x / OC) + 4096) * 8192 + (Math.floor(z / OC) + 4096);

// The original quick-map terrain: rolling fbm hills, a ridged layer and fine bumps.
function baseHeight(x, z) {
  const s = R.s;
  let h = fbm(x * 0.0034, z * 0.0034, s, 5) * R.amp;
  const rn = 1 - Math.abs(fbm(x * 0.0105 + 40, z * 0.0105 - 13, s + 3, 4));
  h += (rn * rn - 0.4) * R.ridge;
  h += fbm(x * 0.045, z * 0.045, s + 9, 3) * R.bump;
  if (R.terrace) { const st = R.terrace, t = h / st, fl = Math.floor(t); h = (fl + smooth(0.25, 0.75, t - fl)) * st; }
  return h;
}
// flat = apply the start/finish/hamlet pads. Pads call this with flat = false to find their own height.
function rawHeight(x, z, flat) {
  let h = R.height ? R.height(x, z) : baseHeight(x, z);
  if (flat) for (const pad of R.pads) {
    const dx = x - pad.x, dz = z - pad.z;
    if (dx * dx + dz * dz < pad.r1 * pad.r1) h = lerp(pad.h, h, smooth(pad.r0, pad.r1, Math.sqrt(dx * dx + dz * dz)));
  }
  if (R.carve) h = R.carve(x, z, h);
  h += smooth(HALF - R.edge[0], HALF - R.edge[1], Math.max(Math.abs(x), Math.abs(z))) * R.edge[2];
  if (R.frozen) h = Math.max(h, R.wl);
  return h;
}
const nearPad = (x, z, d) => R.pads.some(p => Math.hypot(x - p.x, z - p.z) < d + (p.r0 - 16));

function chunkAt(x, z) { return chunks.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK))); }
// Height under a point. Uses the fine chunk grid when it exists (always true near the player) and
// the same triangle split as the rendered mesh, so the wheels sit exactly on what you see.
function heightAt(x, z) {
  const ch = chunkAt(x, z);
  if (!ch || !ch.h0) return rawHeight(x, z, true);
  const gx = clamp((x - ch.x0) / L0CELL, 0, L0N - 1e-4), gz = clamp((z - ch.z0) / L0CELL, 0, L0N - 1e-4);
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, H = ch.h0;
  const h00 = H[i + j * L0W], h10 = H[i + 1 + j * L0W], h01 = H[i + (j + 1) * L0W], h11 = H[i + 1 + (j + 1) * L0W];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}
function normalAt(x, z, out) {
  const ch = chunkAt(x, z);
  if (!ch || !ch.h0) {
    const e = 2, hx = rawHeight(x + e, z, true) - rawHeight(x - e, z, true), hz = rawHeight(x, z + e, true) - rawHeight(x, z - e, true);
    return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }
  const gx = clamp((x - ch.x0) / L0CELL, 0, L0N - 1e-4), gz = clamp((z - ch.z0) / L0CELL, 0, L0N - 1e-4);
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, H = ch.h0;
  const h00 = H[i + j * L0W], h10 = H[i + 1 + j * L0W], h01 = H[i + (j + 1) * L0W], h11 = H[i + 1 + (j + 1) * L0W];
  let dx, dz;
  if (fx + fz <= 1) { dx = (h10 - h00) / L0CELL; dz = (h01 - h00) / L0CELL; }
  else { dx = (h11 - h01) / L0CELL; dz = (h11 - h10) / L0CELL; }
  return out.set(-dx, 1, -dz).normalize();
}
const patchAt = (x, z) => fbm(x * 0.021 + R.s * 0.37, z * 0.021 - R.s * 0.21, R.s + 77, 3) > R.patchT && !nearPad(x, z, 22);
function surfaceAt(x, z, ny, h) {
  if (R.surface) { const s = R.surface(x, z, ny, h); if (s) return s; }
  if (R.frozen && h <= R.wl + 0.08) return SURF.ice;
  if (hasWater(R) && h < R.wl - 0.1) return SURF.bed;
  if (ny < 0.8) return SURF[R.rockSurf || 'rock'];
  if (patchAt(x, z)) return SURF[R.patch];
  return SURF[R.ground];
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function terrainColor(x, z, h, ny, out) {
  if (R.color && R.color(x, z, h, ny, out)) return out;
  return baseTerrainColor(x, z, h, ny, out);
}
// The shared colour ramp (shore, rock, patches, low-to-high grass). Region hooks can call it too.
function baseTerrainColor(x, z, h, ny, out) {
  if (R.frozen && h <= R.wl + 0.05) return out.set(R.patchC);
  if (!R.dry && h < R.wl + 0.8) { out.set(R.shore); if (h < R.wl) out.multiplyScalar(0.72); return out; }
  if (ny < 0.8) return out.set(R.rock).lerp(_c1.set(R.mid), smooth(0.72, 0.8, ny) * 0.5);
  if (patchAt(x, z)) return out.set(R.patchC);
  const t = smooth(R.wl + 2, R.wl + (R.colorSpan || 55), h);
  if (t < 0.5) return out.set(R.low).lerp(_c2.set(R.mid), t * 2);
  return out.set(R.mid).lerp(_c2.set(R.high), (t - 0.5) * 2);
}

/* ---------- Obstacles (trees, rocks, props) for collisions and winch anchors ---------- */
function addObstacle(o, map) {
  map = map || staticObs;
  const k = obsKey(o.x, o.z);
  let l = map.get(k); if (!l) map.set(k, l = []);
  l.push(o);
}
function nearbyObstacles(x, z, fn) {
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const px = x + a * OC, pz = z + b * OC, k = obsKey(px, pz);
    const s = staticObs.get(k); if (s) for (const o of s) fn(o);
    const ch = chunkAt(px, pz);
    const l = ch && ch.obs && ch.obs.get(k); if (l) for (const o of l) fn(o);
  }
}

/* ---------- Chunk meshes ---------- */
function computeH0(ch) {
  const H = new Float32Array(L0W * L0W);
  for (let j = 0; j < L0W; j++) for (let i = 0; i < L0W; i++) H[i + j * L0W] = rawHeight(ch.x0 + i * L0CELL, ch.z0 + j * L0CELL, true);
  ch.h0 = H;
}
function buildChunkMesh(ch, lod) {
  const { n, skirt } = LODS[lod], cs = CHUNK / n, W = n + 1;
  let H;
  if (lod === 0) { if (!ch.h0) computeH0(ch); H = ch.h0; }
  else {
    H = new Float32Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) H[i + j * W] = rawHeight(ch.x0 + i * cs, ch.z0 + j * cs, true);
  }
  const tris = n * n * 2 + n * 4 * 4;
  const pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
  let o = 0; const c = new THREE.Color();
  const put = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az; pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz; pos[o + 6] = cx; pos[o + 7] = cy; pos[o + 8] = cz;
    for (let k = 0; k < 3; k++) { col[o + k * 3] = c.r; col[o + k * 3 + 1] = c.g; col[o + k * 3 + 2] = c.b; }
    o += 9;
  };
  // One colour lookup per grid cell (the colour functions are the expensive part of a chunk);
  // the two triangles get slightly different brightness so the faceted look survives.
  const base = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x0 = ch.x0 + i * cs, x1 = x0 + cs, z0 = ch.z0 + j * cs, z1 = z0 + cs;
    const h00 = H[i + j * W], h10 = H[i + 1 + j * W], h01 = H[i + (j + 1) * W], h11 = H[i + 1 + (j + 1) * W];
    const dx = (h10 - h00 + h11 - h01) / (2 * cs), dz = (h01 - h00 + h11 - h10) / (2 * cs);
    terrainColor(x0 + cs / 2, z0 + cs / 2, (h00 + h10 + h01 + h11) / 4, 1 / Math.sqrt(1 + dx * dx + dz * dz), base);
    c.copy(base).multiplyScalar(0.94 + hash2(Math.floor(x0 * 3), Math.floor(z0 * 3), 7) * 0.12);
    put(x0, h00, z0, x0, h01, z1, x1, h10, z0);
    c.copy(base).multiplyScalar(0.94 + hash2(Math.floor(x1 * 3), Math.floor(z1 * 3), 7) * 0.12);
    put(x1, h10, z0, x0, h01, z1, x1, h11, z1);
  }
  // Skirts: short walls hanging down from every chunk edge, drawn from both sides. They hide the
  // hairline cracks where a fine chunk meets a coarser neighbour.
  const edge = (xa, za, ha, xb, zb, hb) => {
    terrainColor((xa + xb) / 2, (za + zb) / 2, (ha + hb) / 2, 0.7, c); c.multiplyScalar(0.8);
    put(xa, ha, za, xb, hb, zb, xa, ha - skirt, za); put(xb, hb, zb, xb, hb - skirt, zb, xa, ha - skirt, za);
    put(xa, ha, za, xa, ha - skirt, za, xb, hb, zb); put(xb, hb, zb, xa, ha - skirt, za, xb, hb - skirt, zb);
  };
  for (let i = 0; i < n; i++) {
    const xa = ch.x0 + i * cs, xb = xa + cs;
    edge(xa, ch.z0, H[i], xb, ch.z0, H[i + 1]);
    edge(xa, ch.z0 + CHUNK, H[i + n * W], xb, ch.z0 + CHUNK, H[i + 1 + n * W]);
    const za = ch.z0 + i * cs, zb = za + cs;
    edge(ch.x0, za, H[i * W], ch.x0, zb, H[(i + 1) * W]);
    edge(ch.x0 + CHUNK, za, H[n + i * W], ch.x0 + CHUNK, zb, H[n + (i + 1) * W]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, terrainMat);
  m.receiveShadow = true; m.castShadow = lod === 0;
  if (ch.mesh) { terrainRoot.remove(ch.mesh); ch.mesh.geometry.dispose(); }
  ch.mesh = m; ch.lod = lod;
  terrainRoot.add(m);
}

/* ---------- Chunk trees, rocks and obstacles ---------- */
function makeObjKit() {
  const pine = [
    { geo: new THREE.CylinderGeometry(0.16, 0.24, 1.8, 6).translate(0, 0.9, 0), color: 'trunk' },
    { geo: new THREE.ConeGeometry(1.7, 3.4, 7).translate(0, 2.9, 0), color: 'tree' },
    { geo: new THREE.ConeGeometry(1.15, 2.6, 7).translate(0, 4.6, 0), color: 'cap' },
  ];
  const bush = [
    { geo: new THREE.CylinderGeometry(0.14, 0.2, 0.8, 5).translate(0, 0.4, 0), color: 'trunk' },
    { geo: new THREE.IcosahedronGeometry(1.2, 0).scale(1, 0.8, 1).translate(0, 1.4, 0), color: 'tree' },
    { geo: new THREE.IcosahedronGeometry(0.8, 0).translate(0.6, 1.9, 0.2), color: 'cap' },
  ];
  // Deodar: a tall, narrow Himalayan cedar with drooping tiers.
  const deodar = [
    { geo: new THREE.CylinderGeometry(0.18, 0.3, 3.2, 6).translate(0, 1.6, 0), color: 'trunk' },
    { geo: new THREE.ConeGeometry(2.1, 3.0, 8).translate(0, 3.4, 0), color: 'tree' },
    { geo: new THREE.ConeGeometry(1.5, 3.2, 8).translate(0, 5.6, 0), color: 'tree' },
    { geo: new THREE.ConeGeometry(0.9, 2.8, 7).translate(0, 7.6, 0), color: 'cap' },
  ];
  const parts = { pine, bush, deodar }[R.shape] || pine;
  return {
    parts: parts.map(p => ({ ...p, mat: new THREE.MeshLambertMaterial({ color: p.color === 'trunk' ? R.trunk : '#ffffff' }) })),
    rockGeo: new THREE.DodecahedronGeometry(1, 0),
    rockMat: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    treeR: R.shape === 'bush' ? 1.0 : 0.7,
  };
}
function buildChunkObjects(ch) {
  ch.obs = new Map(); ch.objs = [];
  const rnd = mulberry(Math.floor(hash2(ch.cx, ch.cz, R.s) * 4294967296));
  const n = new V3(), area = CHUNK * CHUNK;
  const inMap = (x, z) => Math.abs(x) < HALF - 12 && Math.abs(z) < HALF - 12;
  // Trees
  const quota = Math.round(R.treeCount * area / QUICK_AREA), spots = [];
  for (let t = 0; t < quota * 6 && spots.length < quota; t++) {
    const x = ch.x0 + rnd() * CHUNK, z = ch.z0 + rnd() * CHUNK;
    const roll = rnd(), sz = rnd(), rot = rnd(), cc = rnd();
    if (!inMap(x, z) || nearPad(x, z, 30)) continue;
    if (fbm(x * 0.007, z * 0.007, R.s + 5, 3) < R.forest + (roll - 0.5) * 0.25) continue;
    const h = heightAt(x, z);
    if (h < R.wl + 1.2 || normalAt(x, z, n).y < 0.86 || patchAt(x, z)) continue;
    if (R.treeBlocked && R.treeBlocked(x, z, h)) continue;
    if (cairns.some(c => Math.hypot(c.x - x, c.z - z) < 9)) continue;
    spots.push({ x, z, h, s: 0.8 + sz * 0.75, r: rot * 6.3, c: cc });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), ps = new V3(), Y = new V3(0, 1, 0), col = new THREE.Color();
  if (spots.length) for (const part of objKit.parts) {
    const mesh = new THREE.InstancedMesh(part.geo, part.mat, spots.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    spots.forEach((s, i) => {
      q.setFromAxisAngle(Y, s.r); sc.set(s.s, s.s * (0.9 + s.c * 0.3), s.s); ps.set(s.x, s.h - 0.15, s.z);
      mesh.setMatrixAt(i, m4.compose(ps, q, sc));
      if (part.color !== 'trunk') {
        const pal = part.color === 'cap' && R.cap ? R.cap : R.tree;
        mesh.setColorAt(i, col.set(pal[Math.floor(s.c * pal.length) % pal.length]));
      }
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    terrainRoot.add(mesh); ch.objs.push(mesh);
  }
  for (const s of spots) addObstacle({ x: s.x, z: s.z, y: s.h, r: objKit.treeR * s.s, h: 4, kind: 'tree' }, ch.obs);
  // Rocks: mostly on slopes, plus whatever extra the region asks for (landslides, crater rims).
  const rq = Math.round(320 * (R.rockDensity || 1) * area / (760 * 760)), rocks = [];
  for (let t = 0; t < rq * 8 && rocks.length < rq; t++) {
    const x = ch.x0 + rnd() * CHUNK, z = ch.z0 + rnd() * CHUNK;
    const keep = rnd(), s0 = rnd(), a1 = rnd(), a2 = rnd(), a3 = rnd(), r1 = rnd(), r2 = rnd(), r3 = rnd(), shade = rnd();
    if (!inMap(x, z) || nearPad(x, z, 30)) continue;
    const h = heightAt(x, z), ny = normalAt(x, z, n).y;
    const bias = R.rockBias ? R.rockBias(x, z, h, ny) : 0;
    if (bias < 0) continue;
    if (ny > 0.93 && keep > 0.25 + bias) continue;
    const s = (0.9 + Math.pow(s0, 2) * 2.4) * (R.rockScale || 1);
    rocks.push({ x, z, h, sx: s * (0.8 + a1 * 0.5), sy: s * (0.5 + a2 * 0.4), sz: s * (0.8 + a3 * 0.5), r: [r1 * 3, r2 * 3, r3 * 3], shade });
  }
  if (rocks.length) {
    const mesh = new THREE.InstancedMesh(objKit.rockGeo, objKit.rockMat, rocks.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    rocks.forEach((k, i) => {
      sc.set(k.sx, k.sy, k.sz); ps.set(k.x, k.h - k.sy * 0.25, k.z); q.setFromEuler(e.set(k.r[0], k.r[1], k.r[2]));
      mesh.setMatrixAt(i, m4.compose(ps, q, sc));
      mesh.setColorAt(i, col.set(R.rock).multiplyScalar(0.85 + k.shade * 0.3));
      addObstacle({ x: k.x, z: k.z, y: k.h, r: (k.sx + k.sz) * 0.42, h: k.sy * 0.8, kind: 'rock' }, ch.obs);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    terrainRoot.add(mesh); ch.objs.push(mesh);
  }
}
function dropChunkObjects(ch) {
  for (const m of ch.objs || []) { terrainRoot.remove(m); m.dispose && m.dispose(); }
  ch.objs = null; ch.obs = null;
}
function dropChunk(ch) {
  dropChunkObjects(ch);
  if (ch.mesh) { terrainRoot.remove(ch.mesh); ch.mesh.geometry.dispose(); }
  chunks.delete(ch.key);
}

/* ---------- Streaming ---------- */
const stream = { fx: 1e9, fz: 1e9, want: [] };
function chunkRange() { return [Math.floor(-HALF / CHUNK), Math.floor((HALF - 1) / CHUNK)]; }
function planChunks(fx, fz) {
  stream.fx = fx; stream.fz = fz;
  const [c0, c1] = chunkRange(), want = [], seen = new Set();
  for (let cz = c0; cz <= c1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const mx = (cx + 0.5) * CHUNK, mz = (cz + 0.5) * CHUNK, d = Math.hypot(mx - fx, mz - fz);
    if (d > VIEW_R + CHUNK * 0.7) continue;
    const key = chunkKey(cx, cz); seen.add(key);
    let ch = chunks.get(key);
    if (!ch) { ch = { key, cx, cz, x0: cx * CHUNK, z0: cz * CHUNK, lod: -1, mesh: null, h0: null, objs: null, obs: null }; chunks.set(key, ch); }
    // Hysteresis keeps a chunk from flickering between two levels when you drive along a boundary.
    let lod = LODS.findIndex(l => d < l.r);
    if (ch.lod >= 0 && lod !== ch.lod) {
      const finer = lod < ch.lod;
      const edgeR = LODS[Math.min(lod, ch.lod)].r;
      if (!finer && d < edgeR + LOD_HYST) lod = ch.lod;
    }
    ch.wantLod = lod; ch.wantObjs = d < OBJ_R; ch.dist = d;
    if (ch.lod !== lod || ch.wantObjs !== !!ch.objs) want.push(ch);
  }
  for (const ch of [...chunks.values()]) if (!seen.has(ch.key)) dropChunk(ch);
  // Release fine height grids that are no longer needed, to keep memory flat on the big maps.
  for (const ch of chunks.values()) if (ch.h0 && ch.wantLod > 0 && !ch.wantObjs && ch.lod > 0) ch.h0 = null;
  want.sort((a, b) => a.dist - b.dist);
  stream.want = want;
}
// One step of work on a chunk. The fine height grid, the mesh and the trees are separate steps so
// that no single frame has to do all three for a new chunk.
function workChunk(ch) {
  if (!chunks.has(ch.key)) return;
  if ((ch.wantLod === 0 || ch.wantObjs) && !ch.h0) computeH0(ch);
  else if (ch.lod !== ch.wantLod) buildChunkMesh(ch, ch.wantLod);
  else if (ch.wantObjs && !ch.objs) buildChunkObjects(ch);
  else if (!ch.wantObjs && ch.objs) dropChunkObjects(ch);
  if (ch.lod !== ch.wantLod || ch.wantObjs !== !!ch.objs) stream.want.unshift(ch); // finish this chunk next
}
// Call every frame. Builds chunks until the time budget is spent, nearest first.
function updateChunks(fx, fz, budgetMs) {
  if (Math.hypot(fx - stream.fx, fz - stream.fz) > 24) planChunks(fx, fz);
  const t0 = performance.now();
  while (stream.want.length && performance.now() - t0 < budgetMs) workChunk(stream.want.shift());
}
// Build everything near a point right now (used while the loading screen is up).
function primeChunks(fx, fz) {
  planChunks(fx, fz);
  while (stream.want.length) workChunk(stream.want.shift());
}
function clearChunks() {
  for (const ch of [...chunks.values()]) dropChunk(ch);
  stream.fx = stream.fz = 1e9; stream.want = [];
}

/* ---------- Overview map image ---------- */
// Drawn from the height function. Small maps finish at once; big maps fill in over a few seconds
// in the background, starting at the player's row and spreading outwards, and fog of war hides
// most of it at first anyway. The job can stop and resume in the middle of a row, so it never
// takes more than its time budget in a frame.
const mapJob = { S: 200, done: true };
function startMapImage() {
  const S = R.big ? 1024 : 200;
  mapImage.width = mapImage.height = S;
  const ctx = mapImage.getContext('2d');
  ctx.fillStyle = '#20261f'; ctx.fillRect(0, 0, S, S);
  const j0 = clamp(Math.floor((R.start[1] + HALF) / SIZE * S), 0, S - 1), order = [j0];
  for (let k = 1; order.length < S; k++) { if (j0 + k < S) order.push(j0 + k); if (j0 - k >= 0) order.push(j0 - k); }
  Object.assign(mapJob, { S, order, oi: 0, hi: 0, ci: 0, H: new Float32Array((S + 1) * (S + 1)), have: new Uint8Array(S + 1), img: ctx.createImageData(S, S),
    done: false, lo: S, hi2: -1, flushT: 0 });
  drawRoadLayer();
}
// Copy finished rows into the visible map image. Doing this a few times a second instead of every
// row keeps the browser from re-uploading a 1024 px canvas every frame.
function flushMapImage(force) {
  const J = mapJob, now = performance.now();
  if (J.hi2 < J.lo || (!force && now - J.flushT < 250)) return;
  mapImage.getContext('2d').putImageData(J.img, 0, 0, 0, J.lo, J.S, J.hi2 - J.lo + 1);
  J.lo = J.S; J.hi2 = -1; J.flushT = now;
}
// Roads and tracks, drawn once onto their own layer at map resolution.
const roadLayer = document.createElement('canvas');
function drawRoadLayer() {
  const S = mapJob.S, k = S / SIZE;
  roadLayer.width = roadLayer.height = S;
  const ctx = roadLayer.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  if (!R.paths) return;
  ctx.save(); ctx.scale(k, k); ctx.translate(HALF, HALF);
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const P of R.paths) {
    ctx.strokeStyle = P.mapColor; ctx.lineWidth = Math.max(P.halfW * 2, 1.6 / k);
    ctx.setLineDash(P.dashed ? [10 / k, 6 / k] : []);
    ctx.beginPath();
    P.pts.forEach(([x, z], i) => i ? ctx.lineTo(x, z) : ctx.moveTo(x, z));
    ctx.stroke();
  }
  ctx.restore();
}
const _mapN = new V3(), _mapC = new THREE.Color(), _mapL = new V3(-0.5, 0.8, -0.35).normalize();
function stepMapImage(budgetMs) {
  if (mapJob.done) return;
  const t0 = performance.now(), J = mapJob, S = J.S, W = S + 1, px = SIZE / S, band = R.contour || 10;
  const wc = _c2.set(R.water), H = J.H, out = () => performance.now() - t0 > budgetMs;
  const pos = i => -HALF + (Math.min(i, S - 1) + 0.5) * px;
  while (J.oi < S) {
    const j = J.order[J.oi];
    // Heights for this row and the one below it (needed for shading and contour lines).
    for (const r of [j, j + 1]) {
      if (J.have[r]) continue;
      const z = pos(r);
      while (J.hi <= S) {
        const end = Math.min(S + 1, J.hi + 64);
        for (let i = J.hi; i < end; i++) H[i + r * W] = rawHeight(pos(i), z, true);
        J.hi = end;
        if (out()) return;
      }
      J.have[r] = 1; J.hi = 0;
    }
    const d = J.img.data, z = pos(j), wet = hasWater(R), row = j * S * 4;
    while (J.ci < S) {
      const end = Math.min(S, J.ci + 64);
      for (let i = J.ci; i < end; i++) {
        const h = H[i + j * W], hr = H[i + 1 + j * W], hd = H[i + (j + 1) * W];
        if (wet && h < R.wl) _mapC.copy(wc);
        else {
          _mapN.set(-(hr - h) / px, 1, -(hd - h) / px).normalize();
          terrainColor(pos(i), z, h, _mapN.y, _mapC);
          _mapC.multiplyScalar(0.6 + 0.5 * Math.max(0, _mapN.dot(_mapL)));
          const b = Math.floor(h / band);
          if (b !== Math.floor(hr / band) || b !== Math.floor(hd / band)) _mapC.multiplyScalar(0.72);
        }
        const k = row + i * 4;
        d[k] = _mapC.r * 255; d[k + 1] = _mapC.g * 255; d[k + 2] = _mapC.b * 255; d[k + 3] = 255;
      }
      J.ci = end;
      if (J.ci < S && out()) return;
    }
    J.lo = Math.min(J.lo, j); J.hi2 = Math.max(J.hi2, j);
    J.ci = 0; J.oi++;
    if (out()) break;
  }
  if (J.oi >= S) { flushMapImage(true); J.done = true; J.H = null; J.img = null; }
  else flushMapImage(budgetMs > 50);
}

/* ---------- Region terrain setup ---------- */
function setupTerrain() {
  SIZE = R.size; HALF = SIZE / 2;
  VIEW_R = R.big ? 2400 : 900;
  clearChunks();
  if (objKit) { for (const p of objKit.parts) p.mat.dispose(); objKit.rockMat.dispose(); }
  if (!terrainMat) terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  objKit = makeObjKit();
  staticObs = new Map();
  if (waterMesh) { scene.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh.material.dispose(); waterMesh = null; }
  if (hasWater(R)) {
    const wg = new THREE.PlaneGeometry(SIZE + 400, SIZE + 400).rotateX(-Math.PI / 2);
    waterMesh = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: R.water, transparent: true, opacity: 0.8, shininess: 90, specular: 0x8899aa }));
    waterMesh.position.y = R.wl; waterMesh.receiveShadow = true;
    scene.add(waterMesh);
  }
  startMapImage();
}
