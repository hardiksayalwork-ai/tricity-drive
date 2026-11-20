export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);

export const QUALITY = {};
export function applyQuality(high) {
  QUALITY.high = high;
  QUALITY.shadows = true;
  QUALITY.shadowSize = high ? 2048 : 1024;
  QUALITY.pixelRatioCap = high ? 2 : 1.25;
  QUALITY.aniso = high ? 8 : 4;
  QUALITY.trafficMul = high ? 1.0 : 0.6;
}
applyQuality(!isMobile && localStorage.getItem('td_quality') !== 'low');

export const CAR = {
  maxSpeed: 52,        // m/s ~187 km/h
  maxReverse: 10,
  engine: 14.5,
  brake: 22,
  drag: 0.35,
  grip: 7.5,
  gripOffroad: 3.4,
  handbrakeGrip: 0.35,
  maxSteer: 0.62,      // rad at low speed
  steerSpeedFac: 0.28, // fraction of maxSteer at top speed
  wheelBase: 2.6,
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
