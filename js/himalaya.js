'use strict';
/* ---------- Big map: Dhauli Valley (Himalayan foothills, original) ---------- */
// A 4 km glacial valley running north-south. A tarmac road follows the river; gravel switchback
// roads climb to hamlets on the valley walls; mud tracks, river fords and landslides make up the
// off-road half. The survey posts force a mix of both on the way to the pass at the valley head.
// North is -z (top of the map).
(() => {
  const riverX = z => 380 * Math.sin(z * 0.0012 + 0.6) + 160 * Math.sin(z * 0.0029 + 2.1) - 120;
  // The main road keeps to the east bank and moves further out near the lake at the valley head.
  const roadX = z => riverX(z) + 120 + 60 * smooth(-800, -1150, z) + 30 * Math.sin(z * 0.0047);
  const FORDS = [600, -380];
  const LAKE = { x: riverX(-1250) + 10, z: -1250, r: 125 };
  const HAMLETS = [
    { id: 'dhara', x: riverX(1150) + 520, z: 1150, name: 'Dhara hamlet', huts: 7, temple: true },
    { id: 'sangti', x: riverX(-60) - 470, z: -60, name: 'Sangti village', huts: 9, temple: false },
  ];
  const CAMP = { x: riverX(-700) + 640, z: -700 };
  const RIDGE = { x: riverX(450) - 430, z: 450 };
  const PASS = { x: riverX(-1850) + 40, z: -1850 };
  const SLIDES = [-250, -950].map(z => ({ x: roadX(z), z, r: 46 }));

  // Terrain before roads and pads.
  function valley(x, z) {
    const s = 61, rx = riverX(z), d = Math.abs(x - rx);
    const t = smooth(110, 1250, d);
    let h = 6 + t * 330;
    // The valley floor climbs towards the pass at the north end.
    h += smooth(-1150, -1950, z) * 165 * (1 - 0.5 * t);
    h += fbm(x * 0.0016, z * 0.0016, s, 5) * 140 * smooth(120, 600, d);
    const rn = 1 - Math.abs(fbm(x * 0.0042 + 11, z * 0.0042 - 7, s + 3, 4));
    h += (rn * rn - 0.35) * 90 * smooth(250, 900, d);
    h += fbm(x * 0.008, z * 0.008, s + 5, 3) * 9 * (0.35 + t);
    h += fbm(x * 0.045, z * 0.045, s + 9, 3) * 2.2;
    // Stepped fields around the hamlets.
    for (const hm of HAMLETS) {
      const dd = Math.hypot(x - hm.x, z - hm.z);
      if (dd < 300) { const st = 3.2, tt = h / st, fl = Math.floor(tt); h = lerp(h, (fl + smooth(0.3, 0.7, tt - fl)) * st, 1 - smooth(170, 300, dd)); }
    }
    // Glacial lake at the head of the valley.
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r + 60) h = lerp(-3.5, h, smooth(LAKE.r * 0.45, LAKE.r + 50, ld));
    // River channel, shallow at the two fords, ending at the lake.
    if (z > LAKE.z) {
      let ford = 0;
      for (const fz of FORDS) ford = Math.max(ford, 1 - smooth(18, 40, Math.abs(z - fz)));
      const ch = 1 - smooth(8, 18 + 24 * ford, d);
      if (ch > 0) h = lerp(h, lerp(-1.8, -0.4, ford), ch);
    }
    return h;
  }

  /* Roads and tracks */
  const _n = {};
  // Height profile for a road: follow the terrain, smooth it, then limit the grade in both
  // directions so no stretch is steeper than `grade`. Ends can be pinned to a pad height.
  function profile(P, grade, minH, pinA, pinB) {
    const pts = P.pts, n = pts.length;
    let h = pts.map(([x, z]) => Math.max(valley(x, z), minH));
    const win = 6;
    h = h.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) { s += h[k]; c++; } return Math.max(s / c, minH); });
    if (pinA !== undefined) h[0] = pinA;
    if (pinB !== undefined) h[n - 1] = pinB;
    for (let pass = 0; pass < 8; pass++) {
      // Pinned ends are never moved by the passes, only the points between them.
      for (let i = 1; i < (pinB !== undefined ? n - 1 : n); i++) { const ds = P.len[i] - P.len[i - 1]; h[i] = clamp(h[i], h[i - 1] - grade * ds, h[i - 1] + grade * ds); }
      for (let i = n - 2; i >= (pinA !== undefined ? 1 : 0); i--) { const ds = P.len[i + 1] - P.len[i]; h[i] = clamp(h[i], h[i + 1] - grade * ds, h[i + 1] + grade * ds); }
      if (pinA !== undefined) h[0] = pinA;
      if (pinB !== undefined) h[n - 1] = pinB;
    }
    P.h = h;
  }
  // Switchbacks: zig-zag up a slope so the road climbs at about `grade`, then round the hairpins.
  // `extra` adds legs when a first attempt turned out too short (rounding the hairpins shortens it).
  function switchback(a, b, ha, hb, grade, oneSided, extra) {
    const dx = b[0] - a[0], dz = b[1] - a[1], D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D, vx = -uz, vz = ux;
    const climb = Math.abs(hb - ha), L = climb / grade * 1.2 * (1 + 0.18 * (extra || 0)), wMax = 190;
    const legs = Math.max(2, Math.ceil(Math.sqrt(Math.max(0, L * L - D * D)) / (2 * wMax)), Math.round(climb / 45)) + (extra || 0);
    const p = D / legs, l = L / legs;
    const W = clamp(0.5 * Math.sqrt(Math.max(0, l * l - p * p)), 25, wMax);
    const pts = [a];
    for (let i = 1; i < legs; i++) {
      const off = oneSided ? (i % 2 ? 2 * W : 0) : (i % 2 ? W : -W);
      pts.push([a[0] + ux * p * i + vx * off, a[1] + uz * p * i + vz * off]);
    }
    pts.push(b);
    return pts;
  }
  // Build a branch road and make sure it is long enough to climb at no more than `maxGrade`.
  function branch(prefix, a, b, ha, hb, oneSided, minH) {
    let P;
    for (let extra = 0; extra < 8; extra++) {
      P = mkRoad([...prefix, ...switchback(a, b, ha, hb, 0.1, oneSided, extra)], 'branch');
      let flat = 0; [...prefix, a].forEach((q, i, l) => { if (i) flat += Math.hypot(q[0] - l[i - 1][0], q[1] - l[i - 1][1]); });
      const climbLen = P.len[P.len.length - 1] - flat;
      if (climbLen * 0.125 >= Math.abs(hb - ha)) break;
    }
    profile(P, 0.135, minH, ha, hb);
    return P;
  }
  const mkRoad = (pts, kind) => {
    const P = makePath(resample(chaikin(pts, 3), 10), { reach: 50 });
    Object.assign(P, kind === 'main' ? { halfW: 3.6, surf: SURF.tarmac, col: '#4e4c48', mapColor: '#3a3935' }
      : { halfW: 2.8, surf: SURF.gravel, col: '#a08f74', mapColor: '#6e6150' });
    return P;
  };
  const mkTrack = pts => {
    const P = makePath(resample(chaikin(pts, 3), 10), { reach: 12 });
    return Object.assign(P, { halfW: 2.0, track: true, mapColor: 'rgba(92,68,46,.85)', dashed: true });
  };

  let roads = [], tracks = [];
  function init() {
    const main = [];
    for (let z = 1820; z >= -1150; z -= 25) main.push([roadX(z), z]);
    const mainRoad = mkRoad(main, 'main');
    profile(mainRoad, 0.07, 2.6);
    const mainAt = z => [roadX(z), z];
    const roadHAt = z => { const P = mainRoad, nn = pathNearest(P, roadX(z), z, _n); return nn ? lerp(P.h[nn.seg], P.h[nn.seg + 1], nn.t) : 3; };
    const padH = hm => hm.h !== undefined ? hm.h : (hm.h = valley(hm.x, hm.z));
    // Branch to Dhara (east wall).
    const A = HAMLETS[0], jA = mainAt(A.z - 40);
    const rA = branch([], jA, [A.x, A.z], roadHAt(A.z - 40), padH(A), 0, 2.6);
    // Branch to Sangti (west wall) over the causeway.
    const B = HAMLETS[1], jB = mainAt(B.z), rx = riverX(B.z);
    const westEnd = [rx - 40, B.z];
    const rB = branch([jB, [rx + 40, B.z], [rx, B.z]], westEnd, [B.x, B.z], roadHAt(B.z), padH(B), 0, 3.2);
    // The pass road: one-sided switchbacks up the valley head, east of the lake.
    const jP = main[main.length - 1];
    const passH = valley(PASS.x, PASS.z);
    PASS.h = passH;
    const rP = branch([], jP, [PASS.x, PASS.z], roadHAt(-1150), passH, 1, 3);
    roads = [mainRoad, rA, rB, rP];
    tracks = [
      mkTrack([mainAt(780), [roadX(700) - 40, 650], [riverX(600) + 30, 600], [riverX(600) - 30, 585], [RIDGE.x + 260, 520], [RIDGE.x, RIDGE.z]]),
      mkTrack([[RIDGE.x, RIDGE.z], [RIDGE.x - 60, 250], [B.x + 10, 80], [B.x, B.z]]),
      mkTrack([[B.x, B.z], [B.x + 110, -200], [riverX(-380) - 120, -350], [riverX(-380) - 25, -380], [riverX(-380) + 30, -392], [CAMP.x - 190, -520], [CAMP.x, CAMP.z]]),
      mkTrack([[CAMP.x, CAMP.z], [CAMP.x - 140, -900], [LAKE.x + 420, -1100], [LAKE.x + 200, -1215], [LAKE.x + LAKE.r + 40, LAKE.z]]),
    ];
    H.paths = [...tracks, ...roads];
    H.extraPads = [
      ...HAMLETS.map(hm => ({ x: hm.x, z: hm.z, h: padH(hm), r0: 42, r1: 95 })),
      { x: PASS.x, z: PASS.z, h: passH, r0: 30, r1: 80 },
      { x: CAMP.x, z: CAMP.z, h: valley(CAMP.x, CAMP.z), r0: 18, r1: 50 },
    ];
    H.start = [roadX(1730), 1730];
    H.startYaw = Math.atan2(roadX(1710) - roadX(1730), -20);
    H.end = [PASS.x, PASS.z];
  }
  const slideAt = (x, z) => { for (const s of SLIDES) { const d = Math.hypot(x - s.x, z - s.z); if (d < s.r) return 1 - smooth(s.r * 0.55, s.r, d); } return 0; };
  // Roads cut into the hillside: inside the carriageway the ground is the road profile; beyond it
  // the cut or fill fades out over a slope that gets wider the bigger the height difference.
  function shape(x, z, h) {
    for (const P of roads) {
      if (!P.h) continue;
      const nn = pathNearest(P, x, z, _n);
      if (!nn) continue;
      const rh = lerp(P.h[nn.seg], P.h[nn.seg + 1], nn.t);
      const fade = Math.min(45, P.halfW + 4 + Math.abs(h - rh) * 1.25);
      if (nn.d > fade) continue;
      let w = 1 - smooth(P.halfW + 0.6, fade, nn.d);
      const sl = P === roads[0] ? slideAt(x, z) : 0;
      if (sl > 0) { w *= 1 - 0.6 * sl; h += fbm(x * 0.09, z * 0.09, 5, 3) * 2.2 * sl; }
      h = lerp(h, rh, w);
    }
    return h;
  }
  // What's under a point: road, track or nothing special.
  function roadInfo(x, z) {
    for (const P of roads) { if (!P.h) continue; const nn = pathNearest(P, x, z, _n); if (nn && nn.d < P.halfW + 1.6) return { P, d: nn.d }; }
    for (const P of tracks) { const nn = pathNearest(P, x, z, _n); if (nn && nn.d < P.halfW) return { P, d: nn.d }; }
    return null;
  }
  const muddy = (x, z) => fbm(x * 0.03, z * 0.03, 88, 2) > 0.12;
  function surface(x, z, ny, h) {
    const ri = roadInfo(x, z);
    if (ri) {
      if (ri.P.track) return muddy(x, z) && h < 120 ? SURF.mud : SURF.dust;
      if (ri.d > ri.P.halfW) return SURF.gravel;
      if (ri.P === roads[0] && slideAt(x, z) > 0.2) return SURF.rubble;
      // The main road is old tarmac: mostly good, with broken patches.
      if (ri.P === roads[0] && fbm(x * 0.05, z * 0.05, 31, 2) > 0.3) return SURF.broken;
      return ri.P.surf;
    }
    if (h > 255 + fbm(x * 0.004, z * 0.004, 4, 3) * 40 && ny > 0.72) return SURF.snow;
    return null;
  }
  const C = {}; for (const [k, v] of Object.entries({ snow: '#eef2f3', alpine: '#8b9a62', rhodo: '#a3474b', forest: '#2f4a2c', shoulder: '#8d7f63', track: '#7c6648', mud: '#5b4330', slide: '#8a8174' })) C[k] = new THREE.Color(v);
  function color(x, z, h, ny, out) {
    const ri = roadInfo(x, z);
    if (ri) {
      if (ri.P.track) { out.copy(muddy(x, z) && h < 120 ? C.mud : C.track); return true; }
      if (ri.d > ri.P.halfW) { out.copy(C.shoulder); return true; }
      if (ri.P === roads[0] && slideAt(x, z) > 0.2) { out.copy(C.slide); return true; }
      out.set(ri.P.col);
      if (ri.P === roads[0] && fbm(x * 0.05, z * 0.05, 31, 2) > 0.3) out.offsetHSL(0, 0, 0.06);
      return true;
    }
    if (h < R.wl + 0.8) return false;
    const snowLine = 255 + fbm(x * 0.004, z * 0.004, 4, 3) * 40;
    if (h > snowLine) { out.copy(ny > 0.72 ? C.snow : _c1.set(R.rock).lerp(C.snow, 0.25)); return true; }
    if (ny < 0.8) return false;
    if (h > 200) { out.copy(C.alpine).lerp(C.snow, smooth(snowLine - 40, snowLine, h) * 0.6); return true; }
    // Flowering rhododendron scrub: small patches, blended into the grass rather than painted on.
    const rh = fbm(x * 0.03, z * 0.03, 19, 3);
    if (h > 45 && h < 210 && rh > 0.5) { baseTerrainColor(x, z, h, ny, out); out.lerp(C.rhodo, smooth(0.5, 0.62, rh) * 0.6); return true; }
    // Darken forested slopes so far-away forest reads as forest even without tree meshes.
    const fm = fbm(x * 0.007, z * 0.007, R.s + 5, 3) - R.forest;
    if (h > 12 && h < 230 && fm > 0.05) { baseTerrainColor(x, z, h, ny, out); out.lerp(C.forest, smooth(0.05, 0.3, fm) * 0.55); return true; }
    return false;
  }
  function treeBlocked(x, z, h) {
    if (h > 235) return true;
    if (Math.abs(x - riverX(z)) < 22) return true;
    for (const P of roads) { const nn = P.h && pathNearest(P, x, z, _n); if (nn && nn.d < P.halfW + 5) return true; }
    for (const P of tracks) { const nn = pathNearest(P, x, z, _n); if (nn && nn.d < P.halfW + 3) return true; }
    return false;
  }
  function rockBias(x, z, h, ny) {
    const sl = slideAt(x, z);
    if (sl > 0) return 0.7 + sl;
    for (const P of roads) { const nn = P.h && pathNearest(P, x, z, _n); if (nn && nn.d < P.halfW + 1.5) return -1; }
    return h > 200 ? 0.35 : 0;
  }

  /* Props */
  function hut(kit, x, z, yaw, big) {
    const y = kit.ground(x, z) - 0.25, f = kit.frame(x, y, z, yaw), w = big ? 5.6 : 4.4, d = big ? 4.2 : 3.6;
    f.box(w, 2.7, d, '#9b8f80', 0, 1.35, 0);
    f.box(w + 0.1, 0.22, d + 0.1, '#5a3d28', 0, 2.05, 0);
    f.box(w + 0.1, 0.22, d + 0.1, '#5a3d28', 0, 1.0, 0);
    f.box(0.9, 1.6, 0.12, '#3b2a1c', 0, 0.8, d / 2 + 0.02);
    for (const sx of [-1, 1]) f.box(0.7, 0.6, 0.1, '#2b2f33', sx * w * 0.3, 1.75, d / 2 + 0.03);
    // Slate roof in two halves.
    for (const sz of [-1, 1]) f.box(w + 0.7, 0.16, d * 0.62, '#5d6168', 0, 3.05, sz * d * 0.26, 0, sz * 0.5);
    f.box(w + 0.7, 0.18, 0.3, '#4a4e55', 0, 3.42, 0);
    // A wooden balcony on one side.
    f.box(w * 0.8, 0.12, 0.9, '#6b4a30', 0, 2.1, -d / 2 - 0.45);
    f.box(w * 0.8, 0.5, 0.06, '#6b4a30', 0, 2.45, -d / 2 - 0.88);
    kit.anchor(x, z, Math.max(w, d) * 0.55, 3, 'post');
  }
  function temple(kit, x, z) {
    const y = kit.ground(x, z) - 0.2, f = kit.frame(x, y, z, 0.3);
    f.box(5.5, 0.6, 5.5, '#8f877a', 0, 0.3, 0);
    f.box(3.6, 3.4, 3.6, '#b8ab96', 0, 2.3, 0);
    for (let i = 0; i < 5; i++) f.box(3.9 - i * 0.65, 0.6, 3.9 - i * 0.65, i % 2 ? '#6b4a30' : '#5d6168', 0, 4.3 + i * 0.6, 0);
    f.cyl(0.12, 1.4, '#c89b3c', 0, 7.7, 0, 6);
    kit.anchor(x, z, 2.8, 4, 'post');
  }
  const FLAG_COLORS = ['#3d6fc4', '#f1ead9', '#cf3b2e', '#4f9a47', '#e2b72e'];
  // A string of prayer flags between two poles, sagging in the middle.
  function flagLine(kit, x1, z1, x2, z2, hgt) {
    const y1 = kit.ground(x1, z1), y2 = kit.ground(x2, z2);
    for (const [x, z, y] of [[x1, z1, y1], [x2, z2, y2]]) { kit.add(CYL6, '#5a3d28', x, y + hgt / 2, z, 0, 0, 0, 0.08, hgt, 0.08); kit.anchor(x, z, 0.4, hgt, 'post'); }
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(L / 0.9), yaw = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 1; i < n; i++) {
      const t = i / n, sag = Math.sin(t * Math.PI) * L * 0.08;
      kit.add(BOX, FLAG_COLORS[i % 5], lerp(x1, x2, t), lerp(y1, y2, t) + hgt - 0.35 - sag, lerp(z1, z2, t), 0, yaw + Math.PI / 2, 0, 0.5, 0.42, 0.03);
    }
  }
  function maniWall(kit, x, z, yaw, len) {
    const y = kit.ground(x, z), f = kit.frame(x, y, z, yaw);
    f.box(1.2, 1.1, len, '#8f877a', 0, 0.45, 0);
    for (let i = 0; i < len / 0.7; i++) f.box(0.5, 0.18, 0.5, i % 3 ? '#b8b0a2' : '#d7d0c3', 0, 1.06, -len / 2 + 0.35 + i * 0.7, i * 0.7);
    kit.anchor(x, z, 1.2, 1.2, 'post');
  }
  function props(kit) {
    const rnd = mulberry(4242);
    for (const hm of HAMLETS) {
      const n = hm.huts;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4, rr = 16 + rnd() * 18;
        const x = hm.x + Math.cos(a) * rr, z = hm.z + Math.sin(a) * rr;
        // Keep the road into the hamlet clear.
        if (roads.some(P => { const nn = P.h && pathNearest(P, x, z, _n); return nn && nn.d < 7; })) continue;
        hut(kit, x, z, a + Math.PI / 2 + (rnd() - 0.5) * 0.3, i === 0);
      }
      if (hm.temple) temple(kit, hm.x + 8, hm.z - 6);
      else maniWall(kit, hm.x - 4, hm.z + 4, 0.6, 9);
      for (let i = 0; i < 3; i++) { const a = rnd() * 6.3; flagLine(kit, hm.x + Math.cos(a) * 6, hm.z + Math.sin(a) * 6, hm.x + Math.cos(a) * 26, hm.z + Math.sin(a) * 26, 5); }
    }
    // Prayer flags radiating from a tall pole on the pass.
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; flagLine(kit, PASS.x + 14, PASS.z + 10, PASS.x + 14 + Math.cos(a) * 18, PASS.z + 10 + Math.sin(a) * 18, 6); }
    // Shepherds' camp: two low stone shelters and a pen.
    hut(kit, CAMP.x + 9, CAMP.z + 4, 0.8, false);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; kit.add(BOX, '#8f877a', CAMP.x - 10 + Math.cos(a) * 7, kit.ground(CAMP.x - 10 + Math.cos(a) * 7, CAMP.z + Math.sin(a) * 7) + 0.3, CAMP.z + Math.sin(a) * 7, 0, -a, 0, 1.0, 0.7, 4.4); }
    // Causeway: a raised stone deck with railings where the Sangti road crosses the river.
    const cz = HAMLETS[1].z, cx = riverX(cz), cy = kit.ground(cx, cz);
    const cw = kit.frame(cx, cy, cz, 0);
    cw.box(26, 0.5, 6.4, '#8f877a', 0, -0.3, 0);
    for (const sz of [-3.1, 3.1]) { cw.box(26, 0.12, 0.12, '#d7d0c3', 0, 0.85, sz); for (let i = -6; i <= 6; i++) cw.box(0.14, 0.9, 0.14, '#d7d0c3', i * 2, 0.4, sz); }
    for (const sx of [-6, 0, 6]) cw.box(1.2, 4, 5, '#7b7468', sx, -2.2, 0);
    // Kilometre stones along the main road: white with a yellow cap.
    const main = roads[0];
    for (let s = 300, k = 1; s < main.len[main.len.length - 1]; s += 500, k++) {
      const i = main.len.findIndex(l => l >= s); if (i < 1) continue;
      const [ax, az] = main.pts[i - 1], [bx, bz] = main.pts[i], yaw = Math.atan2(bx - ax, bz - az);
      const ox = ax + Math.cos(yaw) * (main.halfW + 1.4), oz = az - Math.sin(yaw) * (main.halfW + 1.4), y = kit.ground(ox, oz);
      kit.add(BOX, '#f2efe6', ox, y + 0.3, oz, 0, yaw, 0, 0.42, 0.6, 0.16);
      kit.add(BOX, '#e2a72e', ox, y + 0.66, oz, 0, yaw, 0, 0.42, 0.22, 0.17);
    }
    // Warning boulders at each landslide.
    for (const s of SLIDES) for (let i = 0; i < 6; i++) {
      const a = rnd() * 6.3, d = 6 + rnd() * 30, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, sc = 1 + rnd() * 1.6;
      kit.add(DODE, '#857d70', x, kit.ground(x, z) + sc * 0.3, z, rnd() * 3, rnd() * 3, 0, sc, sc * 0.8, sc);
      kit.anchor(x, z, sc * 0.85, sc, 'rock');
    }
  }
  const DODE = new THREE.DodecahedronGeometry(1, 0);

  const H = {
    id: 'dhauli', name: 'Dhauli Valley', blurb: 'Himalayan valley: mountain roads, switchbacks, fords and mud tracks',
    big: true, size: 4096, seed: 61, wl: 0, edge: [180, 10, 160], cairns: 18, contour: 25, colorSpan: 220,
    ground: 'grass', patch: 'mud', patchT: .34, terrace: 0,
    low: '#6f8a3c', mid: '#5f7a3a', high: '#8a8f63', rock: '#7d776e', patchC: '#5b4330', shore: '#b2a88f', water: '#5a9aa6',
    tree: ['#2a4a33', '#33553a', '#3c5f3c'], cap: ['#2f5238', '#3a5e40', '#355a3c'], trunk: '#4a3628', shape: 'deodar', treeCount: 1400, forest: -0.08,
    rockDensity: 1.2, skyDay: ['#5f9ad6', '#dbe8ec'], weather: 'rain', rainChance: .3, dust: '#9a8a6a', fog: [160, 2100],
    start: [0, 0], end: [0, 0],
    checkpoints: [
      { at: [HAMLETS[0].x, HAMLETS[0].z], name: 'Dhara hamlet', hint: 'Take the gravel switchbacks up the east side.' },
      { at: [RIDGE.x, RIDGE.z], name: 'Bugyal ridge', hint: 'Mud track west from the main road, through the ford.' },
      { at: [HAMLETS[1].x, HAMLETS[1].z], name: 'Sangti village', hint: 'Follow the ridge track north, or the road over the causeway.' },
      { at: [CAMP.x, CAMP.z], name: "Shepherds' camp", hint: 'Back across the second ford and up the east slopes.' },
      { at: [LAKE.x + LAKE.r + 40, LAKE.z], name: 'Neela Tal', hint: 'The glacial lake at the head of the valley.' },
    ],
    init, carve: shape, surface, color, treeBlocked, rockBias, props,
    height: valley,
    cairnOk: (x, z) => !roadInfo(x, z),
  };
  init(); H.ready = true;
  registerRegion(H);
})();
