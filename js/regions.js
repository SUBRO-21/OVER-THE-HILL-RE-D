'use strict';
/* ---------- Surfaces & maps ---------- */
// mu: tyre grip multiplier. rr: rolling resistance (fraction of wheel load). sink: how far the tyre
// sinks in, which also lowers the body.
const SURF = {
  grass:    { name: 'Grass',          mu: .90, rr: .04, sink: 0 },
  dust:     { name: 'Hardpack',       mu: .82, rr: .05, sink: 0 },
  snow:     { name: 'Snow',           mu: .60, rr: .10, sink: .06 },
  rock:     { name: 'Rock',           mu: 1.05, rr: .02, sink: 0 },
  mud:      { name: 'Mud',            mu: .52, rr: .34, sink: .18 },
  sand:     { name: 'Soft sand',      mu: .66, rr: .20, sink: .10 },
  ice:      { name: 'Ice',            mu: .26, rr: .02, sink: 0 },
  bed:      { name: 'Riverbed',       mu: .60, rr: .12, sink: .05 },
  tarmac:   { name: 'Tarmac',         mu: 1.00, rr: .015, sink: 0 },
  broken:   { name: 'Broken tarmac',  mu: .92, rr: .03, sink: 0 },
  gravel:   { name: 'Gravel',         mu: .78, rr: .05, sink: .02 },
  rubble:   { name: 'Landslide',      mu: .80, rr: .09, sink: .03 },
  regolith: { name: 'Regolith',       mu: .72, rr: .09, sink: .05 },
  basalt:   { name: 'Basalt',         mu: 1.00, rr: .02, sink: 0 },
  moondust: { name: 'Deep dust',      mu: .55, rr: .16, sink: .10 },
};

// Quick maps: the original 800 m regions. Big maps (Himalaya, Moon) are added by their own files.
const REGIONS = [
  { id: 'pinewood', name: 'Pinewood Hollow', blurb: 'Pine forest, mud and lakes', seed: 11, amp: 46, ridge: 16, bump: 2.2, wl: -9, terrace: 0, ground: 'grass', patch: 'mud', patchT: .18,
    start: [-250, -250], end: [250, 235],
    low: '#6f8a3c', mid: '#557535', high: '#8f9468', rock: '#8a8277', patchC: '#5b4330', shore: '#b5a274', water: '#3e7b80',
    tree: ['#2e5634', '#3d6a37', '#47703a'], cap: null, trunk: '#5b3e2a', shape: 'pine', treeCount: 1200, forest: -0.05,
    skyDay: ['#5d9bd0', '#d4e6e8'], weather: 'rain', rainChance: .35, dust: '#8f7d58' },
  { id: 'mesa', name: 'Red Mesa', blurb: 'Terraced desert, soft sand', seed: 29, amp: 40, ridge: 22, bump: 1.4, wl: -18, terrace: 7, ground: 'dust', patch: 'sand', patchT: .12,
    start: [-275, 10], end: [270, -15],
    low: '#c98a55', mid: '#b5653d', high: '#d7a46c', rock: '#9b4e32', patchC: '#e3c38f', shore: '#d6b98c', water: '#4b8c86',
    tree: ['#6c7b3f', '#7f8b48'], cap: null, trunk: '#6a4a33', shape: 'bush', treeCount: 420, forest: -0.3,
    skyDay: ['#4f94d6', '#f1d5ae'], weather: 'rain', rainChance: .1, dust: '#d9a873' },
  { id: 'whiteback', name: 'Whiteback Pass', blurb: 'Snowfields and frozen lakes', seed: 47, amp: 58, ridge: 26, bump: 2.6, wl: -12, terrace: 0, ground: 'snow', patch: 'ice', patchT: .2, frozen: true,
    start: [15, 275], end: [-10, -262],
    low: '#dfe7ea', mid: '#cdd9df', high: '#f6f9fb', rock: '#68717a', patchC: '#a8d0e2', shore: '#c5d3d9', water: '#2e5d76',
    tree: ['#27453a', '#31523f'], cap: ['#e4ecef', '#d6e2e7', '#31523f'], trunk: '#4a3a2f', shape: 'pine', treeCount: 850, forest: 0,
    skyDay: ['#86acd0', '#e6eef3'], weather: 'snow', rainChance: .45, dust: '#f4f8fa' },
];
// Defaults shared by every region; big maps override what they need.
const REGION_DEFAULTS = { size: 800, big: false, cairns: 6, checkpoints: [], startYaw: null, edge: [82, 2, 75], props: null };
// The original maps scattered treeCount trees over about 770 m x 770 m; chunks use that as a density.
const QUICK_AREA = 770 * 770;

const PAINTS = [['Rust', '#c4572e'], ['Pine', '#3d6151'], ['Sand', '#d6bf7c'], ['Slate blue', '#3f5577'], ['Bone', '#e6dfcc'], ['Signal yellow', '#e2a72e']];
// Map and minimap marker colors, one per connected player slot.
const PLAYER_COLORS = ['#f0a53a', '#7fd0e6', '#d58cf0', '#9ad66b'];
const routeLen = R => {
  let pts = [R.start, ...R.checkpoints.map(c => c.at), R.end], L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};
const routeYaw = R => R.startYaw !== null ? R.startYaw : Math.atan2(R.end[0] - R.start[0], R.end[1] - R.start[1]);
const hasWater = R => !R.frozen && !R.dry;
function registerRegion(def) { REGIONS.push(def); }
