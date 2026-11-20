import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Split a merged wheel mesh (all 4 wheels in one mesh) into 4 pivots by triangle position.
function splitWheelMesh(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!idx) return [];
  const buckets = new Map();
  const triCount = idx.count / 3;
  for (let t = 0; t < triCount; t++) {
    const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const k = (cx >= 0 ? 'r' : 'l') + (cz >= 0 ? 'f' : 'b');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(a, b, c);
  }
  const pivots = [];
  for (const indices of buckets.values()) {
    const g2 = new THREE.BufferGeometry();
    for (const name in geo.attributes) g2.setAttribute(name, geo.attributes[name]);
    g2.setIndex(indices);
    let cx = 0, cy = 0, cz = 0;
    for (const i of indices) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
    cx /= indices.length; cy /= indices.length; cz /= indices.length;
    const m2 = new THREE.Mesh(g2, mesh.material);
    m2.castShadow = true;
    m2.position.set(-cx, -cy, -cz);
    const pivot = new THREE.Group();
    pivot.position.set(cx, cy, cz);
    pivot.add(m2);
    pivots.push(pivot);
  }
  mesh.visible = false;
  for (const p of pivots) mesh.parent.add(p);
  return pivots;
}

// Player Ferrari 458 Spider (three.js example model, CC-asset). Fallback: null -> procedural car.
export async function loadPlayerFerrari({ paint = 0xc01818, envMap = null } = {}) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('vendor/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const gltf = await loader.loadAsync('assets/ferrari.glb');
  const model = gltf.scene;

  const wheels = [];
  let steering = null;
  const named = {};

  model.traverse((o) => {
    if (!o.isMesh) return;
    named[o.name] = o;
    if (/^wheel_(fl|fr|rl|rr)$/.test(o.name)) wheels.push(o);
    if (o.name === 'steering_wheel') steering = o;
    o.castShadow = true;
    o.receiveShadow = true;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const n = m.name || '';
      if (n === 'Body_Color') {
        m.color.setHex(paint);
        m.metalness = 0.85; m.roughness = 0.32; m.clearcoat = 1; m.clearcoatRoughness = 0.06;
        m.envMapIntensity = 1.6;
      } else if (n === 'Glass_Gray' || n === 'Taillight_Glass' || n === 'Projector_Glass') {
        m.transparent = true; m.opacity = 0.45; m.roughness = 0.05; m.metalness = 0.1;
        m.envMapIntensity = 2.2; m.depthWrite = false;
      } else if (n === 'Turn_Signal_LED' || n === 'Interior_light') {
        if (m.emissive) m.emissive.setHex(0xffb36a);
        m.emissiveIntensity = 0.9;
      } else {
        m.envMapIntensity = Math.max(m.envMapIntensity || 0, 0.9);
      }
      if (envMap) m.envMap = envMap;
      m.needsUpdate = true;
    }
  });

  // forward = -Z for our physics convention
  const inner = model;
  inner.rotation.y = 0;
  const g = new THREE.Group();
  g.add(inner);

  // Ddiaz textured exterior (CC-BY 4.0): shown in chase/orbit, hidden in cockpit
  let exterior = null;
  let exteriorWheels = [];
  try {
    const d2 = await loader.loadAsync('assets/ferrari2k.glb');
    const dm = d2.scene;
    const pivots = [];
    const toSplit = [];
    dm.traverse((o) => { if (o.isMesh && /Tire_High|Rim_High/.test(o.name)) toSplit.push(o); });
    dm.updateMatrixWorld(true);
    for (const mesh of toSplit) pivots.push(...splitWheelMesh(mesh));
    dm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    exterior = new THREE.Group();
    dm.rotation.y = Math.PI; // model nose faces +Z; physics forward is -Z
    dm.position.y = 0.136; // compensate baked -0.136 ground offset
    exterior.add(dm);
    dm.scale.setScalar(100); // Sketchfab 0.01 node scale baked into transforms
    exteriorWheels = pivots;
    g.add(exterior);
  } catch (e) { console.warn('ddiaz exterior load failed', e); exterior = null; }

  // headlight spots + visible cones
  const spotL = new THREE.SpotLight(0xfff2cc, 55, 65, 0.45, 0.5, 1.6);
  const spotR = spotL.clone();
  spotL.position.set(0.62, 0.62, -2.1); spotR.position.set(-0.62, 0.62, -2.1);
  const tgtL = new THREE.Object3D(); tgtL.position.set(0.9, 0.3, -14); g.add(tgtL);
  const tgtR = new THREE.Object3D(); tgtR.position.set(-0.9, 0.3, -14); g.add(tgtR);
  spotL.target = tgtL; spotR.target = tgtR;
  spotL.visible = spotR.visible = false;
  g.add(spotL, spotR);

  // dome light for cockpit view
  const dome = new THREE.PointLight(0xffd9a0, 2.4, 3.2, 1.8);
  dome.position.set(0, 1.05, -0.2);
  g.add(dome);

  // brakelight glow strip
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x220000 });
  const brakeBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.03), brakeMat);
  brakeBar.position.set(0, 0.78, 2.05);
  g.add(brakeBar);

  return {
    group: g,
    wheels: exterior ? [...wheels, ...exteriorWheels] : wheels, // spin on local X
    exterior,             // Ddiaz textured body (chase/orbit)
    interiorModel: inner, // detailed interior model (cockpit)
    steering,             // rotate local Z
    brakeMat,
    headlights: [spotL, spotR],
    dome,
    cockpit: { lx: 0.22, ly: 1.12, lz: -0.10 },
    wheelsRadius: 0.36,
    doorMeshes: null,     // model has no separate doors
  };
}
