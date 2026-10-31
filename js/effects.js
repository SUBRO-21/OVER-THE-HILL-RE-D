'use strict';
/* ---------- Particles ---------- */
const PCOUNT = 420;
const particles = (() => {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(PCOUNT * 3), col = new Float32Array(PCOUNT * 3), alpha = new Float32Array(PCOUNT), size = new Float32Array(PCOUNT);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'attribute vec3 pcolor; attribute float alpha; attribute float psize; varying vec3 vC; varying float vA; void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * (320.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * (1.0 - d * 2.0)); }',
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  const life = new Float32Array(PCOUNT), vel = new Float32Array(PCOUNT * 3);
  let next = 0;
  return {
    emit(x, y, z, vx, vy, vz, c, s) {
      const i = next; next = (next + 1) % PCOUNT;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      life[i] = 1; size[i] = s;
    },
    update(dt) {
      for (let i = 0; i < PCOUNT; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt * 0.8;
        vel[i * 3 + 1] -= dt * 1.5;
        for (let k = 0; k < 3; k++) { pos[i * 3 + k] += vel[i * 3 + k] * dt; vel[i * 3 + k] *= 1 - dt * 1.4; }
        size[i] += dt * 1.6;
        alpha[i] = Math.max(0, life[i]) * 0.55;
      }
      for (const n of ['position', 'pcolor', 'alpha', 'psize']) g.attributes[n].needsUpdate = true;
    },
  };
})();
const pColor = new THREE.Color();
function surfaceDustColor(s) {
  if (s === SURF.mud || s === SURF.sand) return pColor.set(R.patchC).multiplyScalar(1.15);
  if (s === SURF.snow || s === SURF.ice) return pColor.set('#f5f9fb');
  if (s === SURF.rock || s === SURF.rubble) return pColor.set('#b4ab9c');
  if (s === SURF.tarmac || s === SURF.broken) return pColor.set('#9d9a92');
  if (s === SURF.gravel) return pColor.set('#b8ab92');
  return pColor.set(R.dust);
}
function emitWheelParticles(dt) {
  for (const wh of car.wheel) {
    if (!wh.contact) continue;
    const spd = Math.abs(wh.vl);
    if (wh.depth > 0.05 && spd > 1.5) {
      if (Math.random() < dt * spd * 3) particles.emit(wh.cp.x, R.wl + 0.1, wh.cp.z, (Math.random() - .5) * 3, 2 + Math.random() * 2, (Math.random() - .5) * 3, pColor.set('#dfeef0'), 0.5);
      continue;
    }
    // Tarmac throws almost nothing; loose ground throws a lot.
    const dusty = wh.surf === SURF.tarmac ? 0.15 : 1;
    const kick = spd > 6 ? (spd - 6) * 0.6 * dusty : 0, spinning = wh.slip > 0.2 ? 8 : 0;
    if (Math.random() < dt * (kick + spinning)) {
      particles.emit(wh.cp.x, wh.cp.y + 0.15, wh.cp.z, -fwd.x * 1.5 + (Math.random() - .5) * 1.5, 0.8 + Math.random(), -fwd.z * 1.5 + (Math.random() - .5) * 1.5, surfaceDustColor(wh.surf), 0.7);
    }
  }
}

/* ---------- Weather ---------- */
const weather = { rain: 0, target: 0, timer: 70, kind: 'rain' };
const RAIN_N = 2400;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) { rainPos[i * 3] = (Math.random() - .5) * 60; rainPos[i * 3 + 1] = (Math.random() - .5) * 30; rainPos[i * 3 + 2] = (Math.random() - .5) * 60; }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.PointsMaterial({ color: 0xdfe8ee, size: 0.09, transparent: true, opacity: 0, depthWrite: false });
const rain = new THREE.Points(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);
function updateWeather(dt) {
  weather.timer -= dt;
  if (weather.timer <= 0) { weather.timer = 90 + Math.random() * 90; weather.target = Math.random() < R.rainChance ? 1 : 0; }
  weather.rain += clamp(weather.target - weather.rain, -dt / 20, dt / 20);
  rain.visible = weather.rain > 0.02;
  rainMat.opacity = weather.rain * 0.75;
  if (!rain.visible) return;
  const snow = weather.kind === 'snow', fall = snow ? 3 : 24;
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3 + 1] -= fall * dt;
    if (snow) rainPos[i * 3] += Math.sin(i + performance.now() * 0.0007) * dt * 0.8;
    if (rainPos[i * 3 + 1] < -15) rainPos[i * 3 + 1] += 30;
  }
  rainGeo.attributes.position.needsUpdate = true;
  rain.position.copy(camera.position);
}

/* ---------- Sky & time ---------- */
const DAY = 720;
const sky = { t: 0.3, night: 0 };
const cNightTop = new THREE.Color('#0a1226'), cNightHor = new THREE.Color('#1c2639'), cDuskTop = new THREE.Color('#4a5f8a'), cDuskHor = new THREE.Color('#e8975c'),
  cDayTop = new THREE.Color(), cDayHor = new THREE.Color(), cGrey = new THREE.Color(), skyTop = new THREE.Color(), skyHor = new THREE.Color();
const sunDir = new V3(), lightDir = new V3();
function updateSky(dt) {
  // On the Moon a day lasts a month, so the sun stays put unless photo mode moves it.
  if (!state.photo && R.fixedT === undefined) sky.t = (sky.t + dt / DAY) % 1;
  const ang = (sky.t - 0.25) * Math.PI * 2, elev = Math.sin(ang), az = Math.cos(ang);
  const day = smooth(-0.1, 0.3, elev), dusk = elev > -0.15 ? Math.max(0, 1 - Math.abs(elev) / 0.28) : 0, wr = weather.rain;
  sunDir.set(az * 0.85, elev, 0.42).normalize();
  const isDay = elev > -0.05;
  lightDir.copy(sunDir); if (!isDay) lightDir.negate();
  sun.position.copy(car.p).addScaledVector(lightDir, 180);
  sun.target.position.copy(car.p);
  skyDome.position.copy(camera.position);
  stars.position.copy(camera.position);
  sunDisc.position.copy(camera.position).addScaledVector(sunDir, 900); sunDisc.lookAt(camera.position);
  moonDisc.position.copy(camera.position).addScaledVector(sunDir, -900); moonDisc.lookAt(camera.position);
  if (R.space) {
    // No air: black sky in daylight, stars always out, one hard white sun and very little fill light.
    skyMat.uniforms.top.value.set('#000000'); skyMat.uniforms.bottom.value.set('#07080b');
    scene.fog.color.set('#07080b'); scene.fog.near = 2600; scene.fog.far = 4200;
    sun.color.set('#ffffff'); sun.intensity = isDay ? 1.35 : 0.08;
    hemi.color.set('#9aa3b5'); hemi.intensity = isDay ? 0.16 : 0.1;
    sunDisc.visible = isDay; moonDisc.visible = false;
    sunDisc.material.color.set('#ffffff');
    stars.material.opacity = 0.95;
    earthDisc.position.copy(camera.position).addScaledVector(EARTH_DIR, 900); earthDisc.lookAt(camera.position);
    sky.night = isDay ? 0 : 1;
    return;
  }
  cDayTop.set(R.skyDay[0]); cDayHor.set(R.skyDay[1]);
  skyTop.copy(cNightTop).lerp(cDayTop, day).lerp(cDuskTop, dusk * 0.5);
  skyHor.copy(cNightHor).lerp(cDayHor, day).lerp(cDuskHor, dusk * 0.65);
  cGrey.set('#8d969b').multiplyScalar(0.25 + 0.75 * day);
  skyTop.lerp(cGrey, wr * 0.65); skyHor.lerp(cGrey, wr * 0.6);
  skyMat.uniforms.top.value.copy(skyTop); skyMat.uniforms.bottom.value.copy(skyHor);
  scene.fog.color.copy(skyHor);
  const [fn, ff] = R.fog || [70, 430];
  scene.fog.far = lerp(ff, ff * 0.35, wr); scene.fog.near = lerp(fn, fn * 0.3, wr);
  if (isDay) { sun.color.set('#ffb070').lerp(_c1.set('#fff6e6'), smooth(0, 0.4, elev)); sun.intensity = lerp(0.25, 1.0, day) * (1 - 0.45 * wr); }
  else { sun.color.set('#9fb4dc'); sun.intensity = 0.3 * (1 - 0.5 * wr); }
  hemi.color.copy(skyTop).lerp(_c1.set('#ffffff'), 0.35);
  hemi.intensity = 0.32 + 0.38 * day;
  sunDisc.visible = elev > -0.06 && wr < 0.7; moonDisc.visible = elev < 0.06 && wr < 0.7;
  sunDisc.material.color.set('#ffd9a0').lerp(_c1.set('#fff8ea'), smooth(0, 0.3, elev));
  stars.material.opacity = (1 - day) * (1 - wr) * 0.9;
  sky.night = 1 - day;
}
