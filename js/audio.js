'use strict';
/* ---------- Audio ---------- */
const audio = {};
function initAudio() {
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(); audio.ctx = ctx;
  audio.master = ctx.createGain(); audio.master.gain.value = state.muted ? 0 : 0.32; audio.master.connect(ctx.destination);
  audio.o1 = ctx.createOscillator(); audio.o1.type = 'sawtooth';
  audio.o2 = ctx.createOscillator(); audio.o2.type = 'square';
  audio.filt = ctx.createBiquadFilter(); audio.filt.type = 'lowpass'; audio.filt.frequency.value = 400;
  audio.eng = ctx.createGain(); audio.eng.gain.value = 0.1;
  const sub = ctx.createGain(); sub.gain.value = 0.45;
  audio.o1.connect(audio.filt); audio.o2.connect(sub); sub.connect(audio.filt); audio.filt.connect(audio.eng); audio.eng.connect(audio.master);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  audio.bp = ctx.createBiquadFilter(); audio.bp.type = 'bandpass'; audio.bp.frequency.value = 900; audio.bp.Q.value = 0.6;
  audio.noise = ctx.createGain(); audio.noise.gain.value = 0;
  src.connect(audio.bp); audio.bp.connect(audio.noise); audio.noise.connect(audio.master);
  audio.o1.start(); audio.o2.start(); src.start();
}
// Engine "rpm" from road speed against the current range's top speed, plus throttle and wheelspin.
function engineRpm() {
  const gear = car.low ? car.spec.low : car.spec.high;
  const sp = Math.abs(car.v.dot(fwd.set(0, 0, 1).applyQuaternion(car.q)));
  const slip = Math.max(...car.wheel.map(w => w.slip));
  return car.stalled ? 0 : 0.18 + clamp(sp / gear.vmax, 0, 1) * 0.7 + Math.abs(ctl.throttle) * (0.12 + slip * 0.3);
}
function updateAudio() {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime, rpm = engineRpm();
  const f = 30 + rpm * 82;
  audio.o1.frequency.setTargetAtTime(f, t, 0.06); audio.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
  audio.filt.frequency.setTargetAtTime(220 + rpm * 900, t, 0.08);
  audio.eng.gain.setTargetAtTime(car.stalled || !state.started ? 0.03 : 0.08 + Math.abs(ctl.throttle) * 0.1, t, 0.1);
  audio.noise.gain.setTargetAtTime(Math.min(0.3, weather.rain * 0.18 + car.v.length() * 0.004), t, 0.2);
}
function blip(freq, dur, type, vol) {
  if (!audio.ctx) return;
  const ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(audio.master); o.start(); o.stop(ctx.currentTime + dur);
}
const clunk = () => blip(70, 0.18, 'square', 0.25);
let lastThud = 0;
const thud = () => { const n = performance.now(); if (n - lastThud > 400) { lastThud = n; blip(48, 0.3, 'sine', 0.6); } };
const chime = () => { blip(660, 0.5, 'triangle', 0.2); setTimeout(() => blip(990, 0.7, 'triangle', 0.16), 140); };
