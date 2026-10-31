'use strict';
/* ---------- Renderer & scene ---------- */
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 1600);
scene.fog = new THREE.Fog(0xcfe0e6, 80, 430);

const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a30, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 420 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.7+0.04,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.65)), 1.0); }',
  side: THREE.BackSide, depthWrite: false, fog: false,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), skyMat);
skyDome.renderOrder = -2;
scene.add(skyDome);
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xfff3d8, fog: false, depthWrite: false }));
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: 0xdfe6f2, fog: false, depthWrite: false }));
sunDisc.renderOrder = moonDisc.renderOrder = -1;
scene.add(sunDisc, moonDisc);
const stars = (() => {
  const g = new THREE.BufferGeometry(), n = 1400, p = new Float32Array(n * 3), rnd = mulberry(5);
  for (let i = 0; i < n; i++) {
    const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 0.95);
    p[i * 3] = Math.sin(v) * Math.cos(u) * 950; p[i * 3 + 1] = Math.cos(v) * 950; p[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 950;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  s.renderOrder = -1; scene.add(s); return s;
})();
// Earth as seen from the Moon: a painted disc, only shown on space maps.
const earthDisc = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), rnd = mulberry(77);
  x.beginPath(); x.arc(128, 128, 124, 0, 7); x.closePath(); x.save(); x.clip();
  x.fillStyle = '#2f6db5'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#5f8a46';
  for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(40 + rnd() * 180, 40 + rnd() * 180, 14 + rnd() * 34, 10 + rnd() * 26, rnd() * 3, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 14; i++) { x.beginPath(); x.ellipse(rnd() * 256, rnd() * 256, 18 + rnd() * 40, 4 + rnd() * 7, rnd() * 3, 0, 7); x.fill(); }
  // Night side shading, so it reads as a lit sphere.
  const gr = x.createLinearGradient(40, 0, 256, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,.85)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256); x.restore();
  const m = new THREE.Mesh(new THREE.CircleGeometry(48, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, fog: false, depthWrite: false }));
  m.renderOrder = -1; m.visible = false; scene.add(m);
  return m;
})();
const EARTH_DIR = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
