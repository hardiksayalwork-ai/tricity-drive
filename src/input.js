// Unified keyboard + touch input. Exposes axes: steer (-1..1), throttle (0..1), brake (0..1), handbrake (bool)
export const input = { steer: 0, throttle: 0, brake: 0, handbrake: false };
export const debug = { gas: false, steer: null };
const keys = {};
const touch = { left: false, right: false, gas: false, brake: false, hb: false };

// smooth keyboard steering
let steerTarget = 0;

export function initInput(callbacks = {}) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (callbacks.onKey) callbacks.onKey(e.code);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  const zone = (id, prop) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { touch[prop] = true; e.preventDefault(); };
    const off = (e) => { touch[prop] = false; e.preventDefault(); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  zone('steerL', 'left'); zone('steerR', 'right');
  zone('pedalG', 'gas'); zone('pedalB', 'brake');
  const hb = document.getElementById('btn-hb');
  if (hb) {
    hb.addEventListener('pointerdown', (e) => { touch.hb = true; e.preventDefault(); });
    hb.addEventListener('pointerup', () => { touch.hb = false; });
    hb.addEventListener('pointercancel', () => { touch.hb = false; });
  }
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.getElementById('touch').style.display = 'block';
  }
}

export function pollInput(dt) {
  const kL = keys['KeyA'] || keys['ArrowLeft'], kR = keys['KeyD'] || keys['ArrowRight'];
  const kG = keys['KeyW'] || keys['ArrowUp'], kB = keys['KeyS'] || keys['ArrowDown'];

  steerTarget = 0;
  if (kL || touch.left) steerTarget -= 1;
  if (kR || touch.right) steerTarget += 1;
  // smooth toward target (fast in, slightly slower out)
  const rate = steerTarget !== 0 ? 6.5 : 4.5;
  input.steer += (steerTarget - input.steer) * Math.min(1, rate * dt);

  input.throttle = (kG || touch.gas || debug.gas) ? 1 : 0;
  input.brake = (kB || touch.brake) ? 1 : 0;
  input.handbrake = !!keys['Space'] || touch.hb;
  if (debug.steer !== null) input.steer = debug.steer;
  return input;
}
