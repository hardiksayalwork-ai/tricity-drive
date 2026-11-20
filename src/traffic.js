import * as THREE from 'three';
import { Car } from './car.js';
import { groundedGroup } from './models.js';

// Simple ambient traffic: cars follow straight routes, despawn at range, respawn elsewhere.
// Uses real 3D vehicle models (CC0) when provided; otherwise the simple buildCar boxes.
const PAINTS = [0xb8b8bc, 0x2a2c30, 0x7a1a1a, 0x1a3a6a, 0xc8a020, 0x3a6a3a, 0xd8d0c0];

// normalize a vehicle model: ground it, scale to real car length, face -Z (game forward)
function vehicleTemplate(gltfScene, targetLen = 4.4) {
  const g = groundedGroup(gltfScene.clone(true));
  const d = g.userData.dims;
  const s = targetLen / Math.max(d.x, d.z);
  g.scale.setScalar(s);
  if (d.x > d.z) g.rotation.y = Math.PI / 2; // longest axis onto Z
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return g;
}

// minimal externalMesh contract for Car.syncMesh: brakeMat must be a real material
function externalFor(tpl) {
  return {
    group: tpl.clone(true),
    wheels: [],
    steering: null,
    brakeMat: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000 }),
    headlights: [],
    cockpit: null,
    wheelsRadius: 0.35,
    doorMeshes: null,
  };
}

export class Traffic {
  constructor(scene, world, count = 10, models = null) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.templates = [];
    if (models) {
      for (const key of ['veh_sedan', 'veh_taxi', 'veh_suv', 'veh_hatch', 'veh_police', 'veh_truck']) {
        if (models[key]) this.templates.push(vehicleTemplate(models[key]));
      }
    }
    for (let i = 0; i < count; i++) this.spawnCar(true);
    // parked cars
    for (const spot of world.parkedSpots || []) {
      const tpl = this.templates.length ? this.templates[(Math.random() * this.templates.length) | 0] : null;
      let c;
      if (tpl) {
        c = new Car(scene, { x: spot.x, z: spot.z, heading: spot.rot, externalMesh: externalFor(tpl) });
      } else {
        const paint = PAINTS[(Math.random() * PAINTS.length) | 0];
        c = new Car(scene, { paint, x: spot.x, z: spot.z, heading: spot.rot, taxi: Math.random() < 0.25 });
      }
      c.parked = true;
      c.speed = 0;
      this.cars.push(c);
    }
  }

  spawnCar(anywhere = false) {
    const routes = this.world.routes;
    if (!routes || routes.length === 0) return;
    const r = routes[(Math.random() * routes.length) | 0];
    const t = anywhere ? (Math.random() * 2 - 1) * 220 : (Math.random() < 0.5 ? -220 : 220);
    const x = r.axis === 'z' ? r.fixed : t * (r.dir);
    const z = r.axis === 'z' ? t * r.dir : r.fixed;
    const heading = r.axis === 'z' ? (r.dir > 0 ? Math.PI : 0) : (r.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    const tpl = this.templates.length ? this.templates[(Math.random() * this.templates.length) | 0] : null;
    const paint = PAINTS[(Math.random() * PAINTS.length) | 0];
    const c = tpl
      ? new Car(this.scene, { x, z, heading, externalMesh: externalFor(tpl) })
      : new Car(this.scene, { paint, x, z, heading, taxi: Math.random() < 0.2 });
    c.route = r;
    c.cruiseSpeed = 8 + Math.random() * 7;
    this.cars.push(c);
  }

  update(dt, playerPos) {
    for (const c of this.cars) {
      if (c.parked) continue;
      const r = c.route;
      // simple driver: accelerate to cruise, brake if player close ahead
      const inp = { steer: 0, throttle: 1, brake: 0, handbrake: false };
      const distPlayer = c.pos.distanceTo(playerPos);
      if (distPlayer < 9) { inp.throttle = 0; inp.brake = 1; }
      c._braking = inp.brake > 0;
      // move along route manually (heading fixed)
      const targetSpeed = inp.brake ? 0 : c.cruiseSpeed;
      c.speed += (targetSpeed - c.speed) * Math.min(1, 2 * dt);
      const f = c.forwardDir();
      c.pos.x += f.x * c.speed * dt;
      c.pos.z += f.y * c.speed * dt;
      c.wheelSpin += (c.speed / 0.35) * dt;
      c.syncMesh(dt);
      // despawn at edge
      const along = r.axis === 'z' ? c.pos.z * r.dir : c.pos.x * r.dir;
      if (along > 240 || distPlayer > 420) {
        // respawn behind player
        const back = Math.random() < 0.5 ? -240 : -180;
        if (r.axis === 'z') { c.pos.x = r.fixed; c.pos.z = back * r.dir; }
        else { c.pos.z = r.fixed; c.pos.x = back * r.dir; }
        c.speed = c.cruiseSpeed;
      }
    }
  }
}
