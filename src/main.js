import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { QUALITY, CAR, clamp, lerp } from './config.js';
import { initInput, pollInput, input, debug } from './input.js';
import { startAudio, updateAudio, setAudioOn } from './audio.js';
import { Car } from './car.js';
import { loadPlayerFerrari } from './car_gltf.js';
import { buildCity, CITY } from './map_city.js';
import { buildLake, LAKE } from './map_lake.js';
import { Traffic } from './traffic.js';
import { loadTemplates, tagTemplateResources } from './models.js';
import { People, cityWalkPaths, lakeWalkPaths } from './people.js';
import { Tesla } from './tesla.js';
import { sunsetSkyTexture, daySkyTexture } from './textures.js';

const G = {
  renderer: null, scene: null, camera: null,
  player: null, traffic: null, world: null,
  map: 'city', camMode: 'chase', speedKmh: 0,
  audioOn: true, ready: false, playing: false, paused: false,
};
window.G = G;

const el = (id) => document.getElementById(id);

// ---------------- renderer ----------------
function makeRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setSize(innerWidth, innerHeight);
  r.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatioCap));
  r.shadowMap.enabled = QUALITY.shadows;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  r.outputColorSpace = THREE.SRGBColorSpace;
  el('app').appendChild(r.domElement);
  return r;
}

// ---------------- lighting ----------------
let lights = null;
function addLights(scene, kind) {
  const hemi = new THREE.HemisphereLight(kind === 'city' ? 0x9a7a9a : 0xbdd7ee, kind === 'city' ? 0x4a382c : 0x5a6a4a, kind === 'city' ? 1.15 : 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(kind === 'city' ? 0xffb070 : 0xfff2dd, kind === 'city' ? 2.4 : 3.0);
  if (kind === 'city') sun.position.set(180, 46, 120);
  else sun.position.set(90, 140, 60);
  sun.castShadow = QUALITY.shadows;
  sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  const S = 120;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  return { hemi, sun };
}

// ---------------- map lifecycle ----------------
// dispose a scene's GPU resources, skipping anything owned by cached templates
// (clones share geometry/material/texture objects with the cached template scenes)
function disposeScene(scene) {
  scene.traverse((o) => {
    if (typeof o.getRenderTarget === 'function' && typeof o.dispose === 'function') { try { o.dispose(); } catch (_) {} } // Reflector etc.
    if (o.geometry && !o.geometry.userData.__tpl) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.userData && m.userData.__tpl) continue;
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'specularMap']) {
        if (m[slot] && !(m[slot].userData && m[slot].userData.__tpl)) m[slot].dispose();
      }
      m.dispose();
    }
  });
  if (scene.background && scene.background.dispose && !(scene.background.userData && scene.background.userData.__tpl)) scene.background.dispose();
  if (scene.environment && scene.environment !== scene.background && scene.environment.dispose && !(scene.environment.userData && scene.environment.userData.__tpl)) scene.environment.dispose();
}

async function startMap(name) {
  if (G.scene) disposeScene(G.scene);
  G.map = name;
  G.scene = new THREE.Scene();
  if (name === 'city') {
    const sky = sunsetSkyTexture();
    G.scene.background = sky;
    G.scene.environment = sky;
    G.scene.fog = new THREE.Fog(0x9a5a50, 90, 520);
  } else {
    const hdr = await new RGBELoader().loadAsync('assets/env/day.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    G.scene.background = daySkyTexture(); // clean gradient; HDR kept for lighting only
    G.scene.environment = hdr;
    G.scene.fog = new THREE.Fog(0xcfe0ec, 120, 620);
  }

  if (G._models === undefined) {
    try { G._models = await loadTemplates(); }
    catch (e) { console.warn('model templates failed, procedural fallback', e); G._models = null; }
  }
  const models = G._models;

  G.world = name === 'city' ? buildCity(G.scene, models) : buildLake(G.scene, models);
  lights = addLights(G.scene, name);

  const meta = name === 'city' ? CITY : LAKE;
  const sp = meta.spawn;

  if (G._ferrari === undefined) {
    try {
      G._ferrari = await loadPlayerFerrari({ paint: 0xc01818 });
      if (G._ferrari && G._ferrari.group) tagTemplateResources(G._ferrari.group);
    } catch (e) { console.warn('ferrari load failed, procedural fallback', e); G._ferrari = null; }
  }
  G.player = new Car(G.scene, {
    paint: 0xc01818, x: sp.x, z: sp.z, heading: sp.heading,
    isPlayer: true, externalMesh: G._ferrari || undefined,
  });
  G.traffic = new Traffic(G.scene, G.world, Math.round(meta.trafficCount * QUALITY.trafficMul), models);

  // pedestrians + autonomous flying Tesla
  if (models && models.nathan) {
    const paths = name === 'city' ? cityWalkPaths() : lakeWalkPaths();
    G.people = new People(G.scene, models.nathan, paths, name === 'city' ? 7 : 4);
  } else G.people = null;
  G.tesla = (name === 'city' && models && models.tesla) ? new Tesla(G.scene, models.tesla, G.world.routes) : null;

  // snap camera behind spawn
  const f = G.player.forwardDir();
  G.camera.position.set(sp.x + f.x * -7.6, 2.45, sp.z + f.y * -7.6);
  G.camera.lookAt(sp.x, 1.2, sp.z);

  setHeadlights(name === 'city');
  setObjective(meta.name, name === 'city'
    ? 'Free roam the grid - C camera, D doors, M map, R respawn'
    : 'Lakeside drive - C camera, M map, R respawn');
  toast(meta.name.toUpperCase());
}

function setHeadlights(on) {
  const p = G.player;
  const arr = p.usingExternalMesh ? p.external.headlights : p.mesh.userData.headlights;
  for (const l of arr || []) l.visible = on;
  if (G.traffic) for (const c of G.traffic.cars) {
    for (const l of c.mesh.userData.headlights || []) l.visible = on;
  }
}

// ---------------- camera ----------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const p = G.player;
  const f = p.forwardDir();
  // dual-model: textured exterior in chase/orbit, detailed interior in cockpit
  const E = p.usingExternalMesh && p.external;
  if (E && E.exterior) {
    const inCockpit = G.camMode === 'cockpit';
    E.exterior.visible = !inCockpit;
    E.interiorModel.visible = inCockpit;
  }
  if (G.camMode !== 'cockpit' && G.camera.fov !== 68) { G.camera.fov = 68; G.camera.updateProjectionMatrix(); }
  if (G.camMode === 'chase') {
    const dist = 7.6, height = 2.45;
    camPos.set(p.pos.x - f.x * dist, p.pos.y + height, p.pos.z - f.y * dist);
    const k = 1 - Math.exp(-6.5 * dt);
    G.camera.position.lerp(camPos, k);
    camLook.set(p.pos.x + f.x * 3, p.pos.y + 1.55, p.pos.z + f.y * 3);
    G.camera.lookAt(camLook);
  } else if (G.camMode === 'cockpit') {
    if (G.camera.fov !== 78) { G.camera.fov = 78; G.camera.updateProjectionMatrix(); }
    const cp = p.usingExternalMesh && p.external.cockpit ? p.external.cockpit : { lx: -0.34, ly: 1.05, lz: -0.05 };
    const right = new THREE.Vector2(f.y, -f.x);
    // note: lz negative = forward in car space
    G.camera.position.set(
      p.pos.x + right.x * cp.lx - f.x * cp.lz,
      p.pos.y + cp.ly,
      p.pos.z + right.y * cp.lx - f.y * cp.lz,
    );
    camLook.set(
      p.pos.x + right.x * cp.lx + f.x * 8,
      p.pos.y + cp.ly - 2.40,
      p.pos.z + right.y * cp.lx + f.y * 8,
    );
    G.camera.lookAt(camLook);
  } else {
    const t = performance.now() * 0.0004;
    G.camera.position.set(p.pos.x + Math.cos(t) * 9, p.pos.y + 3.2, p.pos.z + Math.sin(t) * 9);
    G.camera.lookAt(p.pos.x, p.pos.y + 0.8, p.pos.z);
  }
}

// ---------------- HUD ----------------
let toastTimer = null;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = 0; }, 2200);
}
function setObjective(t, d) {
  el('objective').querySelector('.t').textContent = t;
  el('objective').querySelector('.d').textContent = d;
}

const mm = { ctx: null, last: 0 };
function drawMinimap(now) {
  if (now - mm.last < 120) return;
  mm.last = now;
  if (!mm.ctx) mm.ctx = el('minimap').getContext('2d');
  const g = mm.ctx, S = 300, scale = S / 560;
  g.clearRect(0, 0, S, S);
  g.save();
  g.translate(S / 2, S / 2);
  // center on player
  const px = G.player.pos.x, pz = G.player.pos.z;
  g.translate(-px * scale, -pz * scale);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 3;
  for (const r of G.world.roads) {
    g.beginPath();
    g.moveTo(r.ax * scale, r.az * scale);
    g.lineTo(r.bx * scale, r.bz * scale);
    g.stroke();
  }
  if (G.map === 'lake') {
    g.fillStyle = 'rgba(60,120,190,0.8)';
    g.beginPath(); g.arc(40 * scale, -120 * scale, 120 * scale, 0, Math.PI * 2); g.fill();
  }
  // traffic
  g.fillStyle = '#ffb84d';
  for (const c of G.traffic.cars) {
    if (c.parked) continue;
    g.fillRect(c.pos.x * scale - 2, c.pos.z * scale - 2, 4, 4);
  }
  g.restore();
  // player arrow (center)
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(-G.player.heading + Math.PI);
  g.fillStyle = '#ffc72c';
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.restore();
}

function updateHUD(now) {
  el('speedo').querySelector('.kmh').textContent = Math.round(Math.abs(G.speedKmh));
  el('gear').textContent = G.player.speed < -0.3 ? 'R' : 'D';
  drawMinimap(now);
}

// ---------------- flow ----------------
function showMenu() {
  G.playing = false;
  el('hud').style.display = 'none';
  el('paused').style.display = 'none';
  el('menu').style.display = 'flex';
}

async function enterMap(name) {
  el('menu').style.display = 'none';
  el('loading').style.display = 'flex';
  el('loadmsg').textContent = 'building ' + (name === 'city' ? 'Sector 17' : 'Sukhna Lake') + '…';
  await startMap(name);
  el('loading').style.display = 'none';
  el('hud').style.display = 'block';
  G.playing = true;
  G.paused = false;
}

function togglePause(force) {
  if (!G.playing) return;
  G.paused = force !== undefined ? force : !G.paused;
  el('paused').style.display = G.paused ? 'flex' : 'none';
}

function cycleCam() {
  G.camMode = G.camMode === 'chase' ? 'cockpit' : G.camMode === 'cockpit' ? 'orbit' : 'chase';
  toast({ chase: 'CHASE CAM', cockpit: 'COCKPIT', orbit: 'ORBIT' }[G.camMode]);
}

function toggleDoor() {
  const d = G.player.doors;
  if (!d) { toast('NO DOORS ON THIS MODEL'); return; }
  d.target = d.target > 0.5 ? 0 : 1;
  toast(d.target ? 'DOORS OPEN' : 'DOORS CLOSED');
}

function resetCar() {
  const meta = G.map === 'city' ? CITY : LAKE;
  G.player.pos.set(meta.spawn.x, 0, meta.spawn.z);
  G.player.heading = meta.spawn.heading;
  G.player.speed = 0; G.player.vel.set(0, 0); G.player.vy = 0; G.player.airborne = false;
}

// ---------------- boot ----------------
async function boot() {
  G.renderer = makeRenderer();
  G.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 900);
  addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
  });

  // preload ferrari behind the loading screen, then go to menu
  el('loadmsg').textContent = 'loading assets…';
  G._ferrari = undefined;
  await startMap('city'); // build city in background for instant start
  el('loading').style.display = 'none';
  showMenu();

  el('card-city').onclick = () => { startAudio(); enterMap('city'); };
  el('card-lake').onclick = () => { startAudio(); enterMap('lake'); };

  el('btn-pause').onclick = () => togglePause();
  el('btn-cam').onclick = cycleCam;
  el('btn-door').onclick = toggleDoor;
  el('btn-sound').onclick = () => {
    G.audioOn = !G.audioOn; setAudioOn(G.audioOn);
    el('btn-sound').textContent = G.audioOn ? '♪' : '✕';
  };
  el('btn-resume').onclick = () => togglePause(false);
  el('btn-restart').onclick = () => { resetCar(); togglePause(false); };
  el('btn-tomenu').onclick = () => showMenu();
  el('btn-quality').onclick = () => {
    localStorage.setItem('td_quality', QUALITY.high ? 'low' : 'high');
    location.reload();
  };
  el('btn-quality').textContent = 'QUALITY: ' + (QUALITY.high ? 'HIGH' : 'LOW');

  initInput({
    onKey(code) {
      if (!G.playing) return;
      if (code === 'KeyC') cycleCam();
      if (code === 'KeyM') enterMap(G.map === 'city' ? 'lake' : 'city');
      if (code === 'KeyD') toggleDoor();
      if (code === 'KeyR') resetCar();
      if (code === 'Escape') togglePause();
    },
  });
  addEventListener('pointerdown', () => startAudio(), { once: true });

  G.ready = true;
  requestAnimationFrame(loop);
}

// ---------------- loop ----------------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.manual) return; // TD.step drives frames explicitly
  if (!G.playing || G.paused) {
    if (G.scene) G.renderer.render(G.scene, G.camera);
    return;
  }
  tick(dt);
}

function tick(dt) {
  const pr = G.prof;
  let t0 = pr ? performance.now() : 0;
  const mark = (k) => { if (pr) { pr[k] = (pr[k] || 0) + performance.now() - t0; t0 = performance.now(); } };
  const inp = pollInput(dt);
  G.player._braking = inp.brake > 0;
  G.player.update(dt, inp, G.world);
  mark('player');
  G.traffic.update(dt, G.player.pos);
  mark('traffic');
  if (G.people) G.people.update(dt);
  mark('people');
  if (G.tesla) G.tesla.update(dt, G.player.pos);
  mark('tesla');
  G.speedKmh = G.player.speed * 3.6;

  updateCamera(dt);
  updateHUD(performance.now());
  if (G.audioOn) updateAudio(Math.abs(G.player.speed) / CAR.maxSpeed, Math.min(1, Math.abs(G.player.speed) / CAR.maxSpeed));

  if (lights) {
    lights.sun.target.position.set(G.player.pos.x, 0, G.player.pos.z);
    lights.sun.position.set(
      G.player.pos.x + (G.map === 'city' ? 180 : 90),
      G.map === 'city' ? 46 : 140,
      G.player.pos.z + (G.map === 'city' ? 120 : 60));
  }

  mark('pre');
  G.renderer.render(G.scene, G.camera);
  mark('render');
  if (pr) pr.n = (pr.n || 0) + 1;
}

boot();

// ---------------- debug/test API ----------------
window.TD = {
  ready: () => G.ready,
  state: () => ({
    map: G.map, cam: G.camMode, playing: G.playing, speed: G.player?.speed || 0,
    x: G.player?.pos.x, z: G.player?.pos.z, calls: G.renderer?.info.render.calls,
    tris: G.renderer?.info.render.triangles,
  }),
  start: async (map) => { await enterMap(map || 'city'); },
  play: () => { G.playing = true; },
  cam: (m) => { G.camMode = m; },
  drive: (on) => { debug.gas = !!on; },
  steer: (v) => { debug.steer = v; },
  trial: () => { debug.gas = true; },
  door: () => toggleDoor(),
  teleport: (x, z, h = 0) => { G.player.pos.set(x, 0, z); G.player.heading = h; G.player.speed = 0; },
  orbit: () => { G.camMode = 'orbit'; },
  skyRot: (y) => { if (G.scene.backgroundRotation) G.scene.backgroundRotation.y = y; },
  setQuality: () => {},
  step: (dt) => { G.manual = true; tick(dt || 1 / 30); },
  auto: () => { G.manual = false; },
  cam2: (x, y, z, tx, ty, tz) => {
    G.camera.position.set(x, y, z);
    G.camera.lookAt(tx || 0, ty || 0, tz || 0);
    G.renderer.render(G.scene, G.camera);
  },
  teslaState: () => (G.tesla ? { state: G.tesla.state, x: G.tesla.pos.x, z: G.tesla.pos.z, alt: G.tesla.model.position.y } : null),
  resetModels: () => { G._models = null; },
  g: () => G,
  three: () => THREE,
};
