'use strict';
/* ---------- Big map: Mare Serenum (a Moon-like plain with Earth physics, original) ---------- */
// Grey regolith plains peppered with craters at three sizes, highlands in the north-east, a long
// sinuous rille (a collapsed lava channel) to cross, and one large crater whose rim you must climb.
// The sky is black and Earth hangs over the horizon, but gravity, grip and engines are exactly the
// same as on the Earth maps.
(() => {
  const SEED = 83;
  const HALDEN = { x: -150, z: 260, r: 230, depth: 36 };
  const rilleX = z => -1100 + 260 * Math.sin(z * 0.0021) + 0.25 * z;
  let rille = null;

  // A bowl with a raised rim. d: distance from the centre, r: rim radius.
  function crater(d, r, depth) {
    const rim = depth * 0.42;
    if (d < r) { const q = d / r; return depth * (q * q - 1) + rim * smooth(0.7, 1, q); }
    const o = (d - r) / (0.45 * r);
    return rim * Math.exp(-o * o);
  }
  // Craters live on a jittered grid; each cell may hold one. Checking the 3x3 neighbourhood is
  // enough because no crater is wider than a cell.
  function craterLayer(x, z, cell, prob, rMin, rMax, depthK, seed) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let h = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const gx = cx + a, gz = cz + b;
      if (hash2(gx, gz, seed) > prob) continue;
      const r = lerp(rMin, rMax, Math.pow(hash2(gx, gz, seed + 1), 1.6));
      const px = (gx + 0.2 + hash2(gx, gz, seed + 2) * 0.6) * cell, pz = (gz + 0.2 + hash2(gx, gz, seed + 3) * 0.6) * cell;
      const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz, reach = r * 2;
      if (d2 > reach * reach) continue;
      h += crater(Math.sqrt(d2), r, r * depthK);
    }
    return h;
  }
  function height(x, z) {
    let h = fbm(x * 0.0009, z * 0.0009, SEED, 4) * 35;
    // Highlands: rugged, higher ground towards the north-east.
    const hl = smooth(-0.2, 0.6, (x - z) / 4096 + fbm(x * 0.0006, z * 0.0006, SEED + 4, 3) * 0.6);
    const rn = 1 - Math.abs(fbm(x * 0.0021 + 5, z * 0.0021 - 9, SEED + 7, 4));
    h += hl * (40 + (rn * rn) * 110);
    h += craterLayer(x, z, 240, 0.5, 25, 90, 0.18, SEED + 11);
    h += craterLayer(x, z, 70, 0.42, 6, 22, 0.2, SEED + 21);
    h += craterLayer(x, z, 22, 0.3, 1.6, 5, 0.22, SEED + 31);
    h += fbm(x * 0.05, z * 0.05, SEED + 9, 2) * 0.9;
    // The big crater is placed by hand, with a gentler outer slope so its rim is a climb, not a wall.
    const hd = Math.hypot(x - HALDEN.x, z - HALDEN.z);
    if (hd < HALDEN.r * 2.4) h += crater(hd, HALDEN.r, HALDEN.depth) * (hd < HALDEN.r ? 1 : 1.25);
    // The rille: a winding trench about 40 m across and 14 m deep with sloping walls.
    if (rille) {
      const nn = pathNearest(rille, x, z, _n);
      if (nn && nn.d < 60) h -= 14 * (1 - smooth(10, 55, nn.d));
    }
    return h;
  }
  const _n = {};
  function init() {
    const pts = [];
    for (let z = 2040; z >= -2040; z -= 30) pts.push([rilleX(z), z]);
    rille = makePath(pts, { reach: 64 });
  }
  const C = { mare: new THREE.Color('#7b7a77'), light: new THREE.Color('#a9a7a1'), hl: new THREE.Color('#b8b6b0'), ray: new THREE.Color('#c9c7c1'), rock: new THREE.Color('#5f5e5b') };
  function color(x, z, h, ny, out) {
    const hl = smooth(-0.2, 0.6, (x - z) / 4096 + fbm(x * 0.0006, z * 0.0006, SEED + 4, 3) * 0.6);
    out.copy(C.mare).lerp(C.hl, hl);
    out.lerp(C.light, smooth(0.1, 0.5, fbm(x * 0.0035, z * 0.0035, SEED + 2, 3)) * 0.5);
    if (ny < 0.82) out.lerp(C.rock, smooth(0.82, 0.68, ny));
    // Bright ray streaks around the big crater.
    const hd = Math.hypot(x - HALDEN.x, z - HALDEN.z);
    if (hd > HALDEN.r && hd < HALDEN.r * 5) {
      const ang = Math.atan2(z - HALDEN.z, x - HALDEN.x), ray = Math.pow(Math.max(0, Math.sin(ang * 9 + Math.sin(ang * 4) * 2)), 6);
      out.lerp(C.ray, ray * (1 - smooth(HALDEN.r, HALDEN.r * 5, hd)) * 0.6);
    }
    return true;
  }
  function rockBias(x, z, h, ny) {
    // Boulders gather on crater walls and rims.
    return ny < 0.95 ? 0.5 : 0.05;
  }

  /* Props */
  const GOLD = '#c89b3c', WHITE = '#d9d7cf', GREY = '#6f6e6b', DARK = '#2b2d30', PANEL = '#2c3f66';
  function lander(kit, x, z) {
    const y = kit.ground(x, z), f = kit.frame(x, y, z, 0.4);
    f.box(3.4, 1.6, 3.4, GOLD, 0, 1.9, 0);
    f.box(2.4, 1.6, 2.4, GOLD, 0, 1.9, 0, Math.PI / 4);
    f.box(1.8, 1.4, 1.6, WHITE, 0, 3.4, 0);
    f.cyl(0.6, 0.5, GREY, 0, 4.3, 0);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, lx = Math.cos(a) * 2.6, lz = Math.sin(a) * 2.6;
      f.box(0.14, 2.8, 0.14, GREY, lx * 0.7, 1.2, lz * 0.7, 0, Math.sin(a) * 0.45, -Math.cos(a) * 0.45);
      f.cyl(0.45, 0.1, GREY, lx, 0.05, lz);
      kit.anchor(...f.at(lx, lz), 0.5, 1.5, 'post');
    }
    f.box(0.06, 2.4, 0.06, WHITE, 5, 1.2, 1);
    f.box(0.9, 0.55, 0.03, '#e8e3d5', 5.45, 2.1, 1);
    kit.anchor(x, z, 2.2, 3, 'post');
  }
  function mast(kit, x, z, yaw) {
    const y = kit.ground(x, z), f = kit.frame(x, y, z, yaw);
    f.box(0.25, 7, 0.25, WHITE, 0, 3.5, 0);
    f.box(1.6, 0.2, 1.6, GREY, 0, 0.1, 0);
    f.cyl(1.5, 0.25, WHITE, 0, 7.3, 0.4, 10, -0.6);
    f.box(0.12, 1.2, 0.12, GREY, 0, 7.6, 0.9, 0, -0.6);
    kit.anchor(x, z, 0.8, 6, 'post');
  }
  function habitat(kit, x, z) {
    const y = kit.ground(x, z), f = kit.frame(x, y, z, -0.3);
    for (const [mx, mz, len] of [[0, 0, 12], [9, 4, 8], [-8, 5, 8]]) {
      for (let i = 0; i < len; i += 1) f.cyl(1.9, 1.02, WHITE, mx, 1.95, mz - len / 2 + i, 10, Math.PI / 2);
      f.box(4.2, 0.4, len + 0.6, GREY, mx, 0.2, mz);
      kit.anchor(...f.at(mx, mz), 3, 3.5, 'post');
    }
    f.box(3.2, 3.2, 3.2, WHITE, 0, 1.6, 8);
    f.cyl(1.2, 0.4, GREY, 0, 3.4, 8);
    // Solar panel field
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
      f.box(0.12, 1.6, 0.12, GREY, sx * (16 + (i % 3) * 5), 0.8, -6 + Math.floor(i / 3) * 6);
      f.box(4.0, 0.08, 2.6, PANEL, sx * (16 + (i % 3) * 5), 1.65, -6 + Math.floor(i / 3) * 6, 0, 0.5);
    }
  }
  function props(kit) {
    const cp = H.checkpoints;
    lander(kit, cp[0].at[0] + 14, cp[0].at[1] - 6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mast(kit, cp[3].at[0] + 12 + Math.cos(a) * 22, cp[3].at[1] + Math.sin(a) * 22, a); }
    habitat(kit, cp[4].at[0] + 26, cp[4].at[1] + 4);
    // Small instrument packages scattered near the start.
    const rnd = mulberry(909);
    for (let i = 0; i < 8; i++) {
      const x = H.start[0] + 30 + rnd() * 200, z = H.start[1] - 30 - rnd() * 200, f = kit.frame(x, kit.ground(x, z), z, rnd() * 6);
      f.box(0.8, 0.5, 0.6, i % 2 ? GOLD : WHITE, 0, 0.25, 0); f.box(0.05, 1.0, 0.05, GREY, 0.3, 1.0, 0);
    }
  }

  const H = {
    id: 'serenum', name: 'Mare Serenum', blurb: 'The Moon with Earth physics: craters, a rille and a big crater rim',
    big: true, space: true, dry: true, size: 4096, seed: SEED, wl: -999, edge: [180, 10, 120], cairns: 16, contour: 12,
    ground: 'regolith', patch: 'moondust', patchT: .3, rockSurf: 'basalt', terrace: 0, fixedT: 0.31,
    low: '#7b7a77', mid: '#8e8d89', high: '#b3b1ab', rock: '#6a6966', patchC: '#a7a5a0', shore: '#7b7a77', water: '#000000',
    tree: ['#000000'], cap: null, trunk: '#000000', shape: 'pine', treeCount: 0, forest: 9,
    rockDensity: 1.8, rockScale: 1.15, archColor: '#9a9893', skyDay: ['#000000', '#07080b'], weather: 'none', rainChance: 0, dust: '#a4a29c',
    start: [-1750, 1750], end: [1700, -1750], startYaw: null,
    checkpoints: [
      { at: [-900, 1100], name: 'Lander site', hint: 'An old descent stage to the north-east.' },
      { at: [rilleX(150), 150], name: 'Rille crossing', hint: 'Drop into the rille and climb out the far side.' },
      { at: [HALDEN.x, HALDEN.z - HALDEN.r - 6], name: 'Halden crater rim', hint: 'Climb to the north rim of the big crater.' },
      { at: [1250, 900], name: 'Antenna array', hint: 'Six masts on the plain to the south-east.' },
      { at: [1500, -700], name: 'Habitat Kestrel', hint: 'Head north to the base modules.' },
    ],
    init, height, color, rockBias, props,
  };
  init(); H.ready = true;
  registerRegion(H);
})();
