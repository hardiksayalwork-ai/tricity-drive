// Procedural engine audio via WebAudio - no files needed.
let ctx = null, osc = null, osc2 = null, gain = null, filter = null, started = false;

export function initAudio() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc2 = ctx.createOscillator(); osc2.type = 'square';
  filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 2;
  gain = ctx.createGain(); gain.gain.value = 0;
  osc.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc2.start();
}

export function startAudio() {
  initAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  started = true;
}

export function updateAudio(rpm01, speed01) {
  if (!ctx || !started) return;
  const f = 55 + rpm01 * 165 + speed01 * 40;
  osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
  osc2.frequency.setTargetAtTime(f * 0.5 + 2, ctx.currentTime, 0.05);
  filter.frequency.setTargetAtTime(500 + rpm01 * 2400, ctx.currentTime, 0.08);
  gain.gain.setTargetAtTime(0.05 + rpm01 * 0.07, ctx.currentTime, 0.1);
}

export function setAudioOn(on) {
  started = on;
  if (ctx && !on && gain) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  if (ctx && on && ctx.state === 'suspended') ctx.resume();
}
