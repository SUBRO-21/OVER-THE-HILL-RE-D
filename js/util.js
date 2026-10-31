'use strict';
// Shared helpers and deterministic noise. Every script in js/ is a classic script, so top-level
// const/let/function declarations here are visible to the files loaded after this one.
const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const fmtTime = s => { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const V3 = THREE.Vector3;
function storage(fn) { try { return fn(window.localStorage); } catch (_) { return null; } }

/* ---------- Noise ---------- */
// All terrain comes from these seeded functions, so every player's browser builds the same world
// from the region seed alone and the server never has to send terrain.
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
function fbm(x, z, seed, oct) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/* ---------- Polylines (roads, tracks) ---------- */
// A polyline with a coarse spatial hash, so "how far is this point from the road" stays cheap even
// though the terrain function asks it for every vertex of every chunk.
function makePath(pts, opts) {
  const P = { pts, cell: 64, grid: new Map(), ...opts };
  P.len = [0];
  for (let i = 1; i < pts.length; i++) P.len.push(P.len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const pad = (P.reach || 40);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const x0 = Math.floor((Math.min(ax, bx) - pad) / P.cell), x1 = Math.floor((Math.max(ax, bx) + pad) / P.cell);
    const z0 = Math.floor((Math.min(az, bz) - pad) / P.cell), z1 = Math.floor((Math.max(az, bz) + pad) / P.cell);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gx * 65536 + gz;
      let l = P.grid.get(k); if (!l) P.grid.set(k, l = []);
      l.push(i);
    }
  }
  return P;
}
// Nearest point on the path within its reach. Writes into out { d, s, seg, t } and returns it, or null.
function pathNearest(P, x, z, out) {
  const l = P.grid.get(Math.floor(x / P.cell) * 65536 + Math.floor(z / P.cell));
  if (!l) return null;
  let best = Infinity, bi = -1, bt = 0;
  for (const i of l) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  if (bi < 0) return null;
  out.d = Math.sqrt(best); out.seg = bi; out.t = bt;
  out.s = P.len[bi] + (P.len[bi + 1] - P.len[bi]) * bt;
  return out;
}
// Chaikin corner cutting: turns a zig-zag into rounded hairpins.
function chaikin(pts, iters) {
  for (let k = 0; k < iters; k++) {
    const o = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
// Resample to roughly even spacing.
function resample(pts, step) {
  const o = [pts[0]];
  let need = step;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    let pos = 0;
    while (L - pos >= need) { pos += need; o.push([ax + (bx - ax) * pos / L, az + (bz - az) * pos / L]); need = step; }
    need -= L - pos;
  }
  const lp = pts[pts.length - 1], lo = o[o.length - 1];
  if (Math.hypot(lp[0] - lo[0], lp[1] - lo[1]) > step * 0.3) o.push(lp); else o[o.length - 1] = lp;
  return o;
}
