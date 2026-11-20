import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Shared GLTF loading + normalization helpers for externally-sourced models.

let _loader = null;
export function getLoader() {
  if (_loader) return _loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('vendor/draco/');
  _loader = new GLTFLoader();
  _loader.setDRACOLoader(draco);
  return _loader;
}

export async function loadGLB(url) {
  const gltf = await getLoader().loadAsync(url);
  return gltf;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _ctr = new THREE.Vector3();

// Measure an object's world bbox. Returns {size, center, minY}.
export function measure(obj) {
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getSize(_size);
  _box.getCenter(_ctr);
  return { size: _size.clone(), center: _ctr.clone(), minY: _box.min.y };
}

// Wrap obj in a Group so the group origin sits at ground-center (x/z centered, y=base).
export function groundedGroup(obj) {
  const m = measure(obj);
  const g = new THREE.Group();
  obj.position.set(-m.center.x, -m.minY, -m.center.z);
  g.add(obj);
  g.userData.dims = m.size;
  return g;
}

// Extract building singles from a pack scene: every descendant node that carries
// a mesh and has no mesh-bearing descendants (leaf mesh groups), above a tri floor.
// Each single is recentered to a ground-origin Group. Returns [{group, w, h, d, tris}].
export function extractSingles(sceneRoot, { minTris = 300, maxSingles = 24 } = {}) {
  const out = [];
  sceneRoot.updateMatrixWorld(true);
  sceneRoot.traverse((node) => {
    if (!node.isMesh) return;
    // skip tiny props
    const geom = node.geometry;
    const tris = geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
    if (tris < minTris) return;
    const m = measure(node);
    if (m.size.y < 1.2) return; // not a building
    const clone = node.clone();
    clone.position.copy(node.position);
    clone.quaternion.copy(node.quaternion);
    clone.scale.copy(node.scale);
    // bake world transform: apply node's world matrix to a fresh mesh
    const baked = new THREE.Mesh(geom, node.material);
    baked.applyMatrix4(node.matrixWorld);
    const g = groundedGroup(baked);
    out.push({ group: g, w: g.userData.dims.x, h: g.userData.dims.y, d: g.userData.dims.z, tris });
  });
  out.sort((a, b) => b.tris - a.tris);
  return out.slice(0, maxSingles);
}

// Scale a grounded template group so its height == targetH, clone it, place at x,z,rotY.
export function placeBuilding(scene, tpl, x, z, rotY, targetH) {
  const inst = tpl.group.clone();
  const s = targetH / tpl.h;
  inst.scale.setScalar(s);
  inst.position.set(x, 0, z);
  inst.rotation.y = rotY;
  scene.add(inst);
  return inst;
}

// Build InstancedMeshes for every mesh found in a template, one transform set per placement.
// transforms: [{x, z, y?, rotY, s}]
export function instancedFromTemplate(scene, tplGroup, transforms, { castShadow = false } = {}) {
  tplGroup.updateMatrixWorld(true);
  const meshes = [];
  tplGroup.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const made = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (const mesh of meshes) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length);
    im.castShadow = castShadow;
    im.receiveShadow = true;
    const base = mesh.matrixWorld.clone(); // mesh offset within the template
    transforms.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rotY || 0);
      sc.setScalar(t.s || 1);
      pos.set(t.x, t.y || 0, t.z);
      m4.compose(pos, q, sc);
      m4.multiply(base);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    made.push(im);
  }
  return made;
}

// Load all game model templates in parallel. Returns a map; failed entries are null.
export async function loadTemplates() {
  const jobs = {
    cityPack: ['assets/models/city_pack_7.glb'],
    nyc: ['assets/models/nyc_dwellings.glb'],
    fronts: ['assets/models/buildings_front.glb'],
    tesla: ['assets/models/tesla_model3.glb'],
    nathan: ['assets/models/nathan_walking.glb', true],
    tree_a: ['assets/models/tree_a.glb'],
    tree_b: ['assets/models/tree_b.glb'],
    tree_c: ['assets/models/tree_c.glb'],
    tree_d: ['assets/models/tree_d.glb'],
    house1: ['assets/models/house1.gltf'],
    house3: ['assets/models/house-3.gltf'],
    house4: ['assets/models/house-4.gltf'],
    house5: ['assets/models/house-5.gltf'],
    house6: ['assets/models/house-6.gltf'],
    house7: ['assets/models/house-7.gltf'],
    house18: ['assets/models/house-18.gltf'],
    library: ['assets/models/library-large.gltf'],
    veh_sedan: ['assets/models/sedan.gltf'],
    veh_taxi: ['assets/models/taxi.gltf'],
    veh_suv: ['assets/models/suv.gltf'],
    veh_hatch: ['assets/models/hatchback.gltf'],
    veh_police: ['assets/models/police-car.gltf'],
    veh_truck: ['assets/models/delivery-truck.gltf'],
    palmL: ['assets/models/palm-detailed-long.gltf'],
    palmS: ['assets/models/palm-detailed-short.gltf'],
    bench: ['assets/models/bench.gltf'],
  };
  const out = {};
  await Promise.all(Object.entries(jobs).map(async ([k, [url, keepAnims]]) => {
    try {
      const gltf = await loadGLB(url);
      out[k] = keepAnims ? gltf : gltf.scene;
    } catch (e) {
      console.warn('[models] failed', k, e.message || e);
      out[k] = null;
    }
  }));
  // tag every geometry/material/texture owned by a template so scene disposal skips them
  for (const v of Object.values(out)) {
    const root = v && v.scene ? v.scene : v;
    if (!root || !root.traverse) continue;
    root.traverse((o) => {
      if (o.geometry) o.geometry.userData.__tpl = true;
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        m.userData.__tpl = true;
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'specularMap']) {
          if (m[slot]) m[slot].userData.__tpl = true;
        }
      }
    });
  }
  return out;
}

export function tagTemplateResources(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.userData.__tpl = true;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      m.userData.__tpl = true;
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'specularMap']) {
        if (m[slot]) m[slot].userData.__tpl = true;
      }
    }
  });
}
