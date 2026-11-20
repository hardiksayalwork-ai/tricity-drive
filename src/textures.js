import * as THREE from 'three';
import { QUALITY } from './config.js';

const texLoader = new THREE.TextureLoader();

export function loadPBR(base, repeat = 1) {
  // base: e.g. 'assets/tex/asphalt' -> _alb/_nrm/_rgh.jpg
  const out = {};
  const mk = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = QUALITY.aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  out.map = mk(texLoader.load(`${base}_alb.jpg`), true);
  out.normalMap = mk(texLoader.load(`${base}_nrm.jpg`), false);
  out.roughnessMap = mk(texLoader.load(`${base}_rgh.jpg`), false);
  return out;
}

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = QUALITY.aniso;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat); }
  return t;
}

// ---- Procedural building facade (PBR-ish) -------------------------------
// windows with emissive map so lit windows glow at dusk
export function facadeTexture({ floors = 6, cols = 4, base = '#b8b2a4', trim = '#8f8a7c', litRatio = 0.42 } = {}) {
  const W = 256, H = 64 * floors;
  const lit = [];
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    // subtle grime
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * W, Math.random() * H, 8 + Math.random() * 30, 4 + Math.random() * 16);
    }
    const cw = W / cols, ch = H / floors;
    for (let f = 0; f < floors; f++) {
      // floor band
      g.fillStyle = trim; g.fillRect(0, f * ch, W, 4);
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.18, y = f * ch + ch * 0.22, w = cw * 0.64, h = ch * 0.6;
        const isLit = Math.random() < litRatio;
        lit.push(isLit);
        // window frame + glass
        g.fillStyle = '#2b2f38'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
        const grad = g.createLinearGradient(x, y, x, y + h);
        if (isLit) { grad.addColorStop(0, '#ffd489'); grad.addColorStop(1, '#c98a3d'); }
        else { grad.addColorStop(0, '#4a5a70'); grad.addColorStop(1, '#232c3c'); }
        g.fillStyle = grad; g.fillRect(x, y, w, h);
        // glass reflection streak
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.4, y); g.lineTo(x + w * 0.62, y); g.lineTo(x + w * 0.22, y + h); g.fill();
      }
    }
  });
  // emissive: only lit windows
  let i = 0;
  const emissiveMap = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / floors;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      if (lit[i++]) {
        const x = c * cw + cw * 0.18, y = f * ch + ch * 0.22, w = cw * 0.64, h = ch * 0.6;
        g.fillStyle = '#ffbe6a'; g.fillRect(x, y, w, h);
      }
    }
  });
  return { map, emissiveMap };
}

// ---- Road markings overlay (asphalt + painted lines baked) --------------
export function roadTexture(lanes = 2) {
  // straight segment: lane dashes + edge lines over asphalt-ish dark base
  return canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#33353a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { // noise
      g.fillStyle = `rgba(${Math.random() > .5 ? 255 : 0},${Math.random() > .5 ? 255 : 0},${Math.random() > .5 ? 255 : 0},0.025)`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    g.fillStyle = 'rgba(235,235,225,0.85)';
    g.fillRect(6, 0, 4, H); g.fillRect(W - 10, 0, 4, H); // edge lines
    if (lanes === 2) { // center dashes
      for (let y = 0; y < H; y += 42) { g.fillStyle = 'rgba(255,214,90,0.9)'; g.fillRect(W / 2 - 2, y, 4, 22); }
    }
  }, { repeat: 1 });
}

export function roundaboutTexture() {
  return canvasTex(512, 512, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    g.fillStyle = '#33353a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(255,255,255,0.02)`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // ring road edge
    g.strokeStyle = 'rgba(235,235,225,0.85)'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, W * 0.48, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, W * 0.30, 0, Math.PI * 2); g.stroke();
    // center island: grass + pavers
    g.fillStyle = '#2e4a24'; g.beginPath(); g.arc(cx, cy, W * 0.28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#9a948a'; g.lineWidth = 10;
    g.beginPath(); g.arc(cx, cy, W * 0.29, 0, Math.PI * 2); g.stroke();
  });
}

// ---- Text sign (billboards, shop fronts, plates) ------------------------
export function signTexture(text, { bg = '#101418', fg = '#ffd75e', w = 512, h = 128, font = 'bold 72px Segoe UI, sans-serif', border = true } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function plateTexture(text = 'CH 01 AX 1709') {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#111'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
}

// ---- Billboard ad (desi flavor) -----------------------------------------
export function billboardTexture(title, sub, bg1 = '#d84315', bg2 = '#ff8f00') {
  return canvasTex(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, bg1); grad.addColorStop(1, bg2);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = 'bold 54px Segoe UI, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, w / 2, h / 2 - 24);
    g.font = '28px Segoe UI, sans-serif';
    g.fillText(sub, w / 2, h / 2 + 34);
  });
}

// soft round glow sprite (for lamps / sun flare)
export function glowTexture(color = '#ffffff') {
  const t = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, color); gr.addColorStop(0.4, color + 'aa'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// tree foliage: alpha leaf blob
export function leafTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 340; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 104;
      const x = 128 + Math.cos(a) * r, y = 118 + Math.sin(a) * r * 0.9;
      const s = 6 + Math.random() * 14;
      const shade = 40 + Math.random() * 90;
      g.fillStyle = `rgba(${shade * 0.45 | 0},${shade + 40 | 0},${shade * 0.4 | 0},${0.75 + Math.random() * 0.25})`;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
  });
}

// ---- Hand-graded golden-hour sky (equirect) -----------------------------
export function sunsetSkyTexture() {
  const t = canvasTex(2048, 1024, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#1d1440');   // zenith: deep violet
    grad.addColorStop(0.35, '#4a2a5e');
    grad.addColorStop(0.52, '#a04a52');
    grad.addColorStop(0.60, '#e87a3d');  // horizon: hot orange
    grad.addColorStop(0.65, '#f7a54c');
    grad.addColorStop(0.72, '#5a3a3a');
    grad.addColorStop(1.0, '#14100e');   // below horizon: ground haze
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // sun low in the west, aligned with city sunDir azimuth (~u=0.92)
    const sx = w * 0.92, sy = h * 0.60;
    const sun = g.createRadialGradient(sx, sy, 4, sx, sy, 260);
    sun.addColorStop(0, 'rgba(255,250,225,1)');
    sun.addColorStop(0.06, 'rgba(255,220,150,0.95)');
    sun.addColorStop(0.25, 'rgba(255,160,80,0.5)');
    sun.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff8ec';
    g.beginPath(); g.arc(sx, sy, 16, 0, Math.PI * 2); g.fill();
    // cloud streaks
    for (let i = 0; i < 26; i++) {
      const cy = h * (0.18 + Math.random() * 0.42), cw = 120 + Math.random() * 480;
      const cx = Math.random() * w;
      g.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${100 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${0.05 + Math.random() * 0.10})`;
      g.beginPath(); g.ellipse(cx, cy, cw, 6 + Math.random() * 14, 0, 0, Math.PI * 2); g.fill();
    }
  });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export { canvasTex };

export function daySkyTexture() {
  const t = canvasTex(2048, 1024, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#3f7cc4');   // zenith blue
    grad.addColorStop(0.45, '#8fc3e8');
    grad.addColorStop(0.62, '#cfe8f2');  // horizon haze
    grad.addColorStop(0.70, '#e8e2c8');
    grad.addColorStop(1.0, '#9aa488');   // below horizon
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // high sun, slightly west
    const sx = w * 0.68, sy = h * 0.30;
    const sun = g.createRadialGradient(sx, sy, 4, sx, sy, 300);
    sun.addColorStop(0, 'rgba(255,255,246,1)');
    sun.addColorStop(0.05, 'rgba(255,252,230,0.95)');
    sun.addColorStop(0.3, 'rgba(255,244,200,0.35)');
    sun.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fffef8';
    g.beginPath(); g.arc(sx, sy, 20, 0, Math.PI * 2); g.fill();
    // a few soft clouds
    for (let i = 0; i < 18; i++) {
      const cy = h * (0.12 + Math.random() * 0.38), cw = 140 + Math.random() * 420;
      const cx = Math.random() * w;
      g.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.16})`;
      g.beginPath(); g.ellipse(cx, cy, cw, 10 + Math.random() * 22, 0, 0, Math.PI * 2); g.fill();
    }
  });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
