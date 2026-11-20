import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Pedestrians: rigged walking people on sidewalk routes.
// Source: "Nathan Animated 003 - Walking 3D Man" (Renderpeople, CC-BY).

const ROUTE_SIDEWALKS = true;

export class People {
  // paths: array of [{ax, az, bx, bz}] straight walking segments
  constructor(scene, nathanGltf, paths, count = 6) {
    this.scene = scene;
    this.walkers = [];
    if (!nathanGltf || !paths.length) return;
    const src = nathanGltf.scene;
    const clips = nathanGltf.animations || [];
    // normalize template height ~1.8m
    const box = new THREE.Box3().setFromObject(src);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = 1.8 / (size.y || 1.8);
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length];
      const inst = skeletonClone(src);
      inst.scale.setScalar(scale * (0.95 + Math.random() * 0.1));
      inst.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = true; } });
      scene.add(inst);
      const mixer = new THREE.AnimationMixer(inst);
      if (clips.length) {
        const action = mixer.clipAction(clips[0]);
        action.timeScale = 0.9 + Math.random() * 0.25;
        action.play();
      }
      const t = Math.random();
      const speed = 1.15 + Math.random() * 0.5; // m/s walk
      this.walkers.push({ obj: inst, mixer, path, t, dir: Math.random() < 0.5 ? 1 : -1, speed });
    }
  }

  update(dt) {
    for (const w of this.walkers) {
      w.mixer.update(dt);
      const { path } = w;
      const dx = path.bx - path.ax, dz = path.bz - path.az;
      const len = Math.hypot(dx, dz) || 1;
      w.t += (w.dir * w.speed * dt) / len;
      if (w.t > 1) { w.t = 1; w.dir = -1; }
      else if (w.t < 0) { w.t = 0; w.dir = 1; }
      const x = path.ax + dx * w.t, z = path.az + dz * w.t;
      w.obj.position.set(x, 0, z);
      w.obj.rotation.y = Math.atan2(dx * w.dir, dz * w.dir);
    }
  }
}

// Sidewalk walking segments for the city grid (along the inner sidewalks).
export function cityWalkPaths() {
  const paths = [];
  for (const x of [-80, 0, 80]) {
    for (const off of [-9.5, 9.5]) {
      paths.push({ ax: x + off, az: -230, bx: x + off, bz: 230 });
    }
  }
  for (const z of [-80, 0, 80]) {
    for (const off of [-9.5, 9.5]) {
      paths.push({ ax: -230, az: z + off, bx: 230, bz: z + off });
    }
  }
  return paths;
}

// Lake promenade segments.
export function lakeWalkPaths() {
  return [
    { ax: -140, az: 40, bx: 140, bz: 40 },
    { ax: -140, az: 46, bx: 140, bz: 46 },
    { ax: -60, az: 10, bx: 80, bz: 10 },
  ];
}
