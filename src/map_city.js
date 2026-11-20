import * as THREE from 'three';
import { World } from './world.js';
import { roadTexture, roundaboutTexture, signTexture, billboardTexture } from './textures.js';
import { extractSingles, groundedGroup, placeBuilding, instancedFromTemplate, measure } from './models.js';

// SECTOR 17 - compact Chandigarh-style sector grid at golden dusk.
// Grid roads, streetwall buildings, roundabouts, palms, lamps, markets, billboards.

export const CITY = {
  name: 'Sector 17',
  spawn: { x: -80, z: 190, heading: 0 }, // x=-80 road: no roundabout until z=80, clean launch
  trafficCount: 13,
};

const ROADS_X = [-160, -80, 0, 80, 160];   // north-south roads (vary z)
const ROADS_Z = [-160, -80, 0, 80, 160];   // east-west roads
const HALF = 260;

export function buildCity(scene, models = null) {
  const world = new World(scene);

  // externally-sourced 3D building templates (Sketchfab CC-BY packs), mixed for variety
  let bldgPool = [];
  let housePool = [];
  let treePools = null;
  if (models) {
    for (const key of ['cityPack', 'nyc', 'fronts']) {
      if (models[key]) bldgPool.push(...extractSingles(models[key], { minTris: 380, maxSingles: 10 }));
    }
    bldgPool = bldgPool.filter((b) => b.w > 4 && b.w < 70 && b.h > 5 && b.h < 80 && b.tris <= 25000);
    for (const key of ['house1', 'house3', 'house4', 'house5', 'house6', 'house7', 'house18', 'library']) {
      if (models[key]) {
        const g = groundedGroup(models[key].clone());
        housePool.push({ group: g, w: g.userData.dims.x, h: g.userData.dims.y, d: g.userData.dims.z });
      }
    }
    treePools = ['tree_a', 'tree_b']
      .map((k) => models[k])
      .filter(Boolean)
      .map((m) => {
        const g = groundedGroup(m.clone(true)); // ground base-center at origin
        return { tpl: g, dims: g.userData.dims, placements: [] };
      });
  }
  const recentBldg = [];
  const pickBldg = (rng) => {
    if (!bldgPool.length) return null;
    for (let tries = 0; tries < 8; tries++) {
      const i = (rng() * bldgPool.length) | 0;
      if (!recentBldg.includes(i)) {
        recentBldg.push(i);
        if (recentBldg.length > Math.min(4, bldgPool.length - 1)) recentBldg.shift();
        return bldgPool[i];
      }
    }
    return bldgPool[(rng() * bldgPool.length) | 0];
  };

  // ground: dusty grass with paving tone
  world.ground(HALF * 2 + 200, 'assets/tex/grass', 90, 0x9aa06a);

  const roadTex = roadTexture(2);
  const rbtTex = roundaboutTexture();

  // roads
  for (const x of ROADS_X) world.road(x, 0, HALF * 2, 14, 0, roadTex.clone());
  for (const z of ROADS_Z) world.road(0, z, HALF * 2, 14, Math.PI / 2, roadTex.clone());
  // fix cloned texture repeat orientation: horizontal roads need swap - handled by rotation in road()

  // sidewalks flanking each road (sparse: only inner core for perf)
  for (const x of ROADS_X) {
    if (Math.abs(x) > 160) continue;
    world.sidewalk(x - 9.5, 0, HALF * 2, 4.4, 0);
    world.sidewalk(x + 9.5, 0, HALF * 2, 4.4, 0);
  }
  for (const z of ROADS_Z) {
    if (Math.abs(z) > 160) continue;
    world.sidewalk(-9.5 - 0, z, HALF * 2, 4.4, Math.PI / 2);
    world.sidewalk(9.5, z, HALF * 2, 4.4, Math.PI / 2);
  }

  // roundabouts at alternate intersections
  for (const x of ROADS_X) for (const z of ROADS_Z) {
    if ((Math.abs(x / 80) + Math.abs(z / 80)) % 2 === 0) {
      world.roundabout(x, z, 15, rbtTex);
    }
  }

  // real photographic facades (ambientCG CC0 scans)
  const styles = world.facadeStyles();

  // streetwall: buildings lining every road, facing it - mixed photo facades + real 3D models
  const rng = mulberry(1709);
  const wantH = () => 13 + rng() * 22;
  const putBldg = (bx, bz, rotY, hTarget) => {
    const tpl = pickBldg(rng);
    if (!tpl) return false;
    const s = hTarget / tpl.h;
    if (tpl.w * s > 34 || tpl.d * s > 34) return false; // would swallow the block
    placeBuilding(scene, tpl, bx, bz, rotY, hTarget);
    return true;
  };
  for (const rx of ROADS_X) {
    for (let z = -HALF + 30; z < HALF - 20; z += 34) {
      if (ROADS_Z.some((rz) => Math.abs(z - rz) < 22)) continue; // skip intersections
      for (const side of [-1, 1]) {
        const bx = rx + side * 22;
        if (Math.abs(bx) > HALF - 10) continue;
        const rotY = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        if (bldgPool.length && rng() < 0.42 && putBldg(bx, z + (rng() - 0.5) * 6, rotY + (rng() < 0.5 ? Math.PI : 0), wantH())) continue;
        const st = styles[(rng() * styles.length) | 0];
        const w = 20 + rng() * 10, h = wantH(), d = 14;
        world.building(bx, z + (rng() - 0.5) * 6, w, h, d, rotY, st);
      }
    }
  }
  for (const rz of ROADS_Z) {
    for (let x = -HALF + 30; x < HALF - 20; x += 34) {
      if (ROADS_X.some((rx) => Math.abs(x - rx) < 22)) continue;
      for (const side of [-1, 1]) {
        const bz = rz + side * 22;
        if (Math.abs(bz) > HALF - 10) continue;
        if (rng() < 0.25) continue; // some gaps: inner courtyards
        const rotY = side === -1 ? Math.PI : 0;
        if (bldgPool.length && rng() < 0.42 && putBldg(x + (rng() - 0.5) * 6, bz, rotY + (rng() < 0.5 ? Math.PI : 0), 12 + rng() * 18)) continue;
        const st = styles[(rng() * styles.length) | 0];
        const w = 20 + rng() * 10, h = 12 + rng() * 18, d = 14;
        world.building(x + (rng() - 0.5) * 6, bz, w, h, d, rotY, st);
      }
    }
  }

  // corner landmarks at roundabouts: tallest hero models facing the intersection
  if (bldgPool.length) {
    const heroes = [...bldgPool].sort((a, b) => b.h - a.h).slice(0, 6);
    let hi = 0;
    for (const x of ROADS_X) for (const z of ROADS_Z) {
      if ((Math.abs(x / 80) + Math.abs(z / 80)) % 2 !== 0) continue;
      const tpl = heroes[hi++ % heroes.length];
      const corner = (hi % 2) ? 1 : -1;
      const cx = x + corner * 26, cz = z - corner * 26;
      if (Math.abs(cx) > HALF - 8 || Math.abs(cz) > HALF - 8) continue;
      const s = Math.min(2.2, 30 / tpl.h);
      placeBuilding(scene, tpl, cx, cz, Math.atan2(x - cx, z - cz), tpl.h * s);
    }
  }

  // inner-block fill: real 3D houses when models are loaded, else low boxes
  for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
    if (gx === 0 && gz === 0) continue;
    const cx = gx * 80 + 40 * (gx === 0 ? 1 : Math.sign(gx)), cz = gz * 80 + 40 * (gz === 0 ? 1 : Math.sign(gz));
    for (let i = 0; i < 5; i++) {
      const x = cx + (rng() - 0.5) * 52, z = cz + (rng() - 0.5) * 52;
      if (ROADS_X.some((rx) => Math.abs(x - rx) < 16) || ROADS_Z.some((rz) => Math.abs(z - rz) < 16)) continue;
      if (housePool.length) {
        const hp = housePool[(rng() * housePool.length) | 0];
        placeBuilding(scene, hp, x, z, rng() * Math.PI * 2, 6 + rng() * 4);
        continue;
      }
      const st = styles[(rng() * styles.length) | 0];
      world.building(x, z, 12 + rng() * 8, 7 + rng() * 8, 10, rng() * Math.PI, st);
    }
  }

  // trees along roads: real 3D trees (mixed species) when loaded, else billboard bucket
  if (treePools && treePools.length) {
    const addTree = (x, z) => {
      const pool = treePools[(rng() * treePools.length) | 0];
      const targetH = 5.5 + rng() * 3.5;
      pool.placements.push({ x, z, rotY: rng() * Math.PI * 2, s: targetH / (pool.dims.y || 6) });
    };
    for (const x of ROADS_X) {
      for (let z = -HALF + 16; z < HALF; z += 48) {
        if (ROADS_Z.some((rz) => Math.abs(z - rz) < 18)) continue;
        addTree(x - 12.4, z);
        addTree(x + 12.4, z + 17);
      }
    }
    for (const z of ROADS_Z) {
      for (let x = -HALF + 16; x < HALF; x += 48) {
        if (ROADS_X.some((rx) => Math.abs(x - rx) < 18)) continue;
        addTree(x, z - 12.4);
        addTree(x + 17, z + 12.4);
      }
    }
    for (const pool of treePools) {
      if (pool.placements.length) instancedFromTemplate(scene, pool.tpl, pool.placements);
    }
  } else {
    const trees = world.treeBucket(240);
    for (const x of ROADS_X) {
      for (let z = -HALF + 16; z < HALF; z += 26) {
        if (ROADS_Z.some((rz) => Math.abs(z - rz) < 18)) continue;
        world.tree(trees, x - 12.4, z, 0.85 + rng() * 0.4);
        world.tree(trees, x + 12.4, z + 13, 0.85 + rng() * 0.4);
      }
    }
    for (const z of ROADS_Z) {
      for (let x = -HALF + 16; x < HALF; x += 26) {
        if (ROADS_X.some((rx) => Math.abs(x - rx) < 18)) continue;
        world.tree(trees, x, z - 12.4, 0.85 + rng() * 0.4);
        world.tree(trees, x + 13, z + 12.4, 0.85 + rng() * 0.4);
      }
    }
    world.finalizeBucket(trees);
  }

  // hedges near roundabouts
  for (const x of ROADS_X) for (const z of ROADS_Z) {
    if ((Math.abs(x / 80) + Math.abs(z / 80)) % 2 === 0) {
      world.hedge(x - 13, z - 13, 6, Math.PI / 4);
      world.hedge(x + 13, z + 13, 6, Math.PI / 4);
    }
  }

  // street lamps along main roads
  for (const x of [-80, 0, 80]) {
    for (let z = -HALF + 20; z < HALF; z += 110) {
      world.lamp(x - 8.2, z, Math.PI / 2, true);
      world.lamp(x + 8.2, z + 55, -Math.PI / 2, true);
    }
  }
  for (const z of [-80, 0, 80]) {
    for (let x = -HALF + 20; x < HALF; x += 110) {
      world.lamp(x, z - 8.2, 0, true);
      world.lamp(x + 55, z + 8.2, Math.PI, true);
    }
  }

  // market strip near spawn: shops with signs
  const shopNames = [
    ['KHAANA KHAZANA', 'Dhaba & Sweets', '#7a1f1f', '#e8b23a'],
    ['TRICITY MOTORS', 'Car Care', '#10243e', '#6ab0ff'],
    ['CHAI SUTTA', 'Tapri', '#2a1a08', '#ffd75e'],
    ['SECTOR 17 PLAZA', 'Shopping', '#301a3a', '#e08aff'],
  ];
  shopNames.forEach(([t, s, bg, fg], i) => {
    const sx = -60 + i * 40, sz = 128;
    const tex = signTexture(t, { bg, fg, w: 512, h: 96, font: 'bold 56px Segoe UI, sans-serif' });
    world.sign(sx, sz, Math.PI, tex, 10, 1.9);
  });

  // billboards
  const bb1 = billboardTexture('ROYAL ENFIELD', 'Chandigarh ka swagger', '#8e1616', '#ff8f00');
  world.sign(-140, -140, Math.PI / 4, bb1, 12, 6);
  const bb2 = billboardTexture('LASSI 20/-', 'Thandi thandi, matka wali', '#0e5c2e', '#7ee06a');
  world.sign(140, 140, -Math.PI * 0.75, bb2, 12, 6);
  const bb3 = billboardTexture('TRICITY DRIFT', 'Sector 17 GP - tonight', '#101418', '#ffd75e');
  world.sign(140, -140, Math.PI * 0.75, bb3, 12, 6);

  // speed bumps on inner roads
  world.addBump(-80, 40); world.addBump(-80, -120);
  world.addBump(80, 120); world.addBump(0, -40);

  // flyover ramp near east edge (launch ramp fun)
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 26), new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.9 }));
  ramp.position.set(200, 1.2, 40);
  ramp.rotation.x = -0.16;
  ramp.castShadow = true; ramp.receiveShadow = true;
  scene.add(ramp);
  world.addRamp(200, 52, 0, -1, 26, 2.2);

  // parked cars placement markers (traffic.js spawns actual meshes)
  world.parkedSpots = [];
  for (const x of [-80, 0, 80]) {
    for (let z = -140; z < 160; z += 47) {
      world.parkedSpots.push({ x: x - 6.2, z, rot: Math.PI });
    }
  }
  world.parkedSpots = world.parkedSpots.filter(() => rng() < 0.5);

  // traffic routes: loops around the grid
  world.routes = [];
  for (const x of ROADS_X) {
    world.routes.push({ axis: 'z', fixed: x - 3.4, dir: 1 });
    world.routes.push({ axis: 'z', fixed: x + 3.4, dir: -1 });
  }
  for (const z of ROADS_Z) {
    world.routes.push({ axis: 'x', fixed: z - 3.4, dir: -1 });
    world.routes.push({ axis: 'x', fixed: z + 3.4, dir: 1 });
  }

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
