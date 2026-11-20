// Sunfall Heat — all sound is synthesised with WebAudio; there are no
// audio files. The context is created lazily on the first user gesture
// (browsers refuse sound before that), and every call is a no-op until
// then, so headless screenshot runs stay silent and error-free.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function env(gain, t0, peak, dur) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env(g, t0, vol, dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, vol, dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  click() { tone(660, 0.06, 'square', 0.12); },
  swing() { noise(0.12, 0.12, 900, 1.5); },
  punch() { noise(0.09, 0.3, 300, 1); tone(90, 0.09, 'sine', 0.3, 45); },
  shot() { noise(0.16, 0.5, 2600, 0.4); tone(160, 0.1, 'sawtooth', 0.25, 60); },
  dryFire() { tone(1200, 0.04, 'square', 0.1); },
  hit() { noise(0.07, 0.25, 500, 1); },
  crash(big = false) {
    noise(big ? 0.4 : 0.2, big ? 0.55 : 0.3, 240, 0.6);
    tone(70, big ? 0.35 : 0.18, 'sine', 0.4, 40);
  },
  horn() { tone(370, 0.28, 'square', 0.16); tone(466, 0.28, 'square', 0.12, null, 0.01); },
  pickup() { tone(880, 0.08, 'sine', 0.2); tone(1320, 0.12, 'sine', 0.2, null, 0.07); },
  cash() { tone(1560, 0.07, 'square', 0.14); tone(2090, 0.14, 'square', 0.14, null, 0.06); },
  splash() { noise(0.3, 0.2, 700, 0.7); },
  scream() { tone(900, 0.22, 'sawtooth', 0.1, 1400); },
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, null, i * 0.09));
  },
  fail() { tone(330, 0.2, 'triangle', 0.2, 220); tone(220, 0.3, 'triangle', 0.2, 160, 0.16); },
  sting() { tone(196, 0.5, 'sawtooth', 0.22, 98); tone(185, 0.5, 'sawtooth', 0.18, 92, 0.05); },
  door() { tone(180, 0.08, 'square', 0.15, 120); noise(0.06, 0.1, 800, 1, 0.02); },
};

// Engine loop: a detuned saw pair through a low-pass, pitched by speed.
export function engineStart() {
  if (!ctx || engineNodes) return;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 28;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  const g = ctx.createGain();
  g.gain.value = 0.0;
  osc.connect(filter); osc2.connect(filter);
  filter.connect(g).connect(master);
  osc.start(); osc2.start();
  engineNodes = { osc, osc2, filter, g };
}
export function engineSet(norm, throttle) {
  if (!engineNodes) return;
  const t = ctx.currentTime;
  engineNodes.osc.frequency.setTargetAtTime(50 + norm * 130 + throttle * 22, t, 0.06);
  engineNodes.osc2.frequency.setTargetAtTime(25 + norm * 65, t, 0.06);
  engineNodes.filter.frequency.setTargetAtTime(280 + norm * 700, t, 0.08);
  engineNodes.g.gain.setTargetAtTime(0.05 + norm * 0.075, t, 0.09);
}
export function engineStop() {
  if (!engineNodes) return;
  const { osc, osc2, g } = engineNodes;
  g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
  setTimeout(() => { try { osc.stop(); osc2.stop(); } catch { /* already stopped */ } }, 220);
  engineNodes = null;
}

// Police siren: one oscillator whose pitch wobbles between two tones.
export function sirenStart() {
  if (!ctx || sirenNodes) return;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 760;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 0.9;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 130;
  lfo.connect(lfoGain).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.value = 0.0;
  osc.connect(g).connect(master);
  osc.start(); lfo.start();
  sirenNodes = { osc, lfo, g };
}
export function sirenSet(vol) {
  if (!sirenNodes) return;
  sirenNodes.g.gain.setTargetAtTime(Math.min(0.11, vol), ctx.currentTime, 0.15);
}
export function sirenStop() {
  if (!sirenNodes) return;
  const { osc, lfo, g } = sirenNodes;
  g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
  setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* already stopped */ } }, 200);
  sirenNodes = null;
}
