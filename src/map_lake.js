import * as THREE from 'three';
import { World } from './world.js';
import { roadTexture, signTexture, billboardTexture } from './textures.js';
import { groundedGroup, instancedFromTemplate, measure } from './models.js';

// SUKHNA LAKE - day scene: lakeside loop, dam road, hills, gardens, walking plaza.

export const LAKE = {
  name: 'Sukhna Lake',
  spawn: { x: -100, z: 17, heading: -Math.PI / 2 }, // on dam road, facing +x along the shore
  trafficCount: 5,
};

export function buildLake(scene, models = null) {
  const world = new World(scene);
  const rng = mulberry(404);
  // real 3D tree/palm pools when models are loaded
  const treePools = models
    ? ['tree_a', 'tree_b', 'tree_c', 'tree_d', 'palmL', 'palmS'].map((k) => models[k]).filter(Boolean).map((m) => {
        const g = groundedGroup(m.clone(true));
        return { tpl: g, dims: g.userData.dims, placements: [] };
      })
    : null;
  const addTree3d = (x, z, sc = 1) => {
    const pool = treePools[(rng() * treePools.length) | 0];
    const targetH = (5 + rng() * 4) * sc;
    pool.placements.push({ x, z, rotY: rng() * Math.PI * 2, s: targetH / (pool.dims.y || 6) });
  };

  // green ground
  world.ground(700, 'assets/tex/grass', 70, 0x8fa060);

  // the lake
  world.waterPlane(40, -120, 120);

  // shore: sandy ring
  const shore = new THREE.Mesh(new THREE.RingGeometry(112, 126, 40), new THREE.MeshStandardMaterial({ color: 0xc9b285, roughness: 1 }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(40, 0.02, -120);
  shore.receiveShadow = true;
  scene.add(shore);
  world.surfaces.push({ type: 'rect', x: 40, z: -120, w: 250, l: 250, rot: 0, surf: 'sand' });

  // dam road along the south shore (straight promenade)
  const roadTex = roadTexture(2);
  world.road(20, 20, 280, 12, Math.PI / 2, roadTex);
  // loop road around lake east side
  world.road(160, -60, 180, 10, 0, roadTex.clone());
  world.road(60, -220, 220, 10, Math.PI / 2, roadTex.clone());
  world.road(-60, -80, 200, 10, 0, roadTex.clone());

  // garden plaza near spawn
  world.surfaces.push({ type: 'rect', x: -20, z: 60, w: 60, l: 40, rot: 0, surf: 'road' });
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(60, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0xb0aa9c, roughness: 0.95 }));
  plaza.position.set(-20, 0.05, 60); plaza.receiveShadow = true;
  scene.add(plaza);

  // trees: real 3D when loaded, else billboard bucket
  if (treePools && treePools.length) {
    for (let i = 0; i < 64; i++) {
      const a = rng() * Math.PI * 2, r = 135 + rng() * 90;
      const x = 40 + Math.cos(a) * r, z = -120 + Math.sin(a) * r * 0.8;
      addTree3d(x, z, 0.9 + rng() * 0.6);
    }
    for (let i = 0; i < 40; i++) {
      addTree3d(-80 + rng() * 160, 40 + rng() * 80, 0.8 + rng() * 0.5);
    }
    for (const pool of treePools) {
      if (pool.placements.length) instancedFromTemplate(scene, pool.tpl, pool.placements);
    }
    // benches along the promenade
    if (models.bench) {
      const btpl = groundedGroup(models.bench.clone());
      const bdims = btpl.userData.dims;
      const benches = [];
      for (let x = -96; x <= 150; x += 26) {
        benches.push({ x, z: 13.2, rotY: Math.PI, s: 1.6 / (bdims.x || 1.6) });
        benches.push({ x: x + 13, z: 27, rotY: 0, s: 1.6 / (bdims.x || 1.6) });
      }
      instancedFromTemplate(scene, btpl, benches);
    }
  } else {
    const trees = world.treeBucket(160);
    for (let i = 0; i < 64; i++) {
      const a = rng() * Math.PI * 2, r = 135 + rng() * 90;
      const x = 40 + Math.cos(a) * r, z = -120 + Math.sin(a) * r * 0.8;
      world.tree(trees, x, z, 0.9 + rng() * 0.6);
    }
    for (let i = 0; i < 40; i++) {
      world.tree(trees, -80 + rng() * 160, 40 + rng() * 80, 0.8 + rng() * 0.5);
    }
    world.finalizeBucket(trees);
  }

  // hills (Shivaliks) to the north
  world.hill(0, -330, 180, 70);
  world.hill(160, -300, 130, 46);
  world.hill(-170, -290, 150, 55);

  // lamps along dam road
  for (let x = -110; x <= 150; x += 52) {
    world.lamp(x, 13.6, 0, true);
    world.lamp(x + 26, 26.4, Math.PI, true);
  }

  // signage
  world.sign(-100, 30, Math.PI, signTexture('SUKHNA LAKE', { bg: '#0d2a1a', fg: '#9fe8b0', w: 512, h: 96, font: 'bold 60px Segoe UI, sans-serif' }), 10, 1.9);
  world.sign(120, 30, Math.PI, billboardTexture('BOATING CLUB', 'Shikara rides 100/-', '#0b3550', '#7ad0ff'), 9, 4.5);

  // speed bumps
  world.addBump(-40, 20); world.addBump(80, 20);

  // jump ramp facing the lake view
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.9 }));
  ramp.position.set(100, 0.9, -20); ramp.rotation.x = -0.18;
  ramp.castShadow = true; ramp.receiveShadow = true;
  scene.add(ramp);
  world.addRamp(100, -11, 0, -1, 18, 1.7);

  // traffic routes
  world.routes = [
    { axis: 'x', fixed: 20 - 3, dir: -1 },
    { axis: 'x', fixed: 20 + 3, dir: 1 },
    { axis: 'z', fixed: 160 - 3, dir: 1 },
    { axis: 'z', fixed: 160 + 3, dir: -1 },
  ];
  world.parkedSpots = [
    { x: -60, z: 44, rot: 0 }, { x: -46, z: 44, rot: 0 }, { x: -32, z: 44, rot: 0 },
  ];

  return world;
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
