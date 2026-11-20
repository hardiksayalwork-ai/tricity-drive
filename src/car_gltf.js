import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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
    wheels,               // spin on local X
    steering,             // rotate local Z
    brakeMat,
    headlights: [spotL, spotR],
    dome,
    cockpit: { lx: 0.22, ly: 1.12, lz: -0.10 },
    wheelsRadius: 0.36,
    doorMeshes: null,     // model has no separate doors
  };
}
