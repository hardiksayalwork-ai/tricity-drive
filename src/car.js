import * as THREE from 'three';
import { CAR, clamp, lerp } from './config.js';
import { plateTexture } from './textures.js';

// ---------------------------------------------------------------- visuals
// Shared geometries/materials so many cars stay cheap.
const G = {};
function shared() {
  if (G.tire) return G;
  G.tire = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
  G.tire.rotateZ(Math.PI / 2);
  G.rim = new THREE.CylinderGeometry(0.19, 0.19, 0.25, 12);
  G.rim.rotateZ(Math.PI / 2);
  G.tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.94 });
  G.rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, metalness: 0.9, roughness: 0.28 });
  G.glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.85, roughness: 0.06, transparent: true, opacity: 0.88 });
  G.lightF = new THREE.MeshStandardMaterial({ color: 0xfff8e0, emissive: 0xfff2c0, emissiveIntensity: 0.7 });
  G.lightR = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x220000 });
  G.darkMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7, metalness: 0.2 });
  G.plateMat = new THREE.MeshBasicMaterial({ map: plateTexture() });
  G.seatMat = new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 0.92 });
  return G;
}

// Silhouette from 2D profile extruded sideways => reads like a real car side.
function profileGeometry() {
  const s = new THREE.Shape();
  // side view: x = length axis (+x rear), y = height. Will be rotated so length runs on z.
  s.moveTo(-2.02, 0.46);          // front bumper low
  s.lineTo(-2.14, 0.60);          // bumper face
  s.lineTo(-2.06, 0.76);          // hood leading edge
  s.lineTo(-1.10, 0.90);          // hood rear
  s.lineTo(-0.52, 1.24);          // windshield top / roof front
  s.lineTo(0.62, 1.28);           // roof
  s.lineTo(1.28, 0.96);           // rear glass base
  s.lineTo(1.98, 0.88);           // deck
  s.lineTo(2.12, 0.66);           // tail
  s.lineTo(2.02, 0.43);           // rear bumper low
  s.lineTo(0.9, 0.43);            // rear wheel arch start
  // rear arch (wheel well)
  s.absarc(0.88, 0.36, 0.44, 0, Math.PI, false);
  s.lineTo(-0.55, 0.46);
  // front arch
  s.absarc(-0.92, 0.36, 0.44, 0, Math.PI, false);
  s.lineTo(-2.02, 0.46);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.56, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 3, curveSegments: 12 });
  geo.translate(0, 0, -0.78);
  geo.rotateY(-Math.PI / 2); // length onto z: -z front, +z rear
  return geo;
}

function greenhouseGeometry() {
  // glass cabin inset
  const s = new THREE.Shape();
  s.moveTo(-0.98, 0.88);
  s.lineTo(-0.50, 1.21);
  s.lineTo(0.56, 1.245);
  s.lineTo(1.16, 0.94);
  s.lineTo(-0.98, 0.88);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.30, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  geo.translate(0, 0, -0.65);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

function makeWheel(s, x, z) {
  const w = new THREE.Group();
  const tire = new THREE.Mesh(G.tire, G.tireMat);
  const rim = new THREE.Mesh(G.rim, G.rimMat);
  w.add(tire, rim);
  w.position.set(x, 0.35, z);
  w.userData.spinAxis = 'x';
  w.castShadow = true;
  return w;
}

// interior shell (steering wheel + seats + dash) for cockpit view
function buildInterior(group, s) {
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.42), G.darkMat);
  dash.position.set(0, 0.86, -0.52);
  const dashFace = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.18), new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.35, metalness: 0.4, emissive: 0x0a0c10, emissiveIntensity: 0.6 }));
  dashFace.position.set(0, 0.97, -0.30); dashFace.rotation.x = -0.32;
  const wheelT = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 10, 24), G.darkMat);
  wheelT.position.set(-0.34, 0.92, -0.28); wheelT.rotation.x = -0.35; wheelT.userData.steering = true;
  const colM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), G.darkMat);
  colM.position.set(-0.34, 0.84, -0.40); colM.rotation.x = 1.05;
  const seatG = new THREE.BoxGeometry(0.46, 0.5, 0.5);
  const seatL = new THREE.Mesh(seatG, s.seatMat); seatL.position.set(-0.36, 0.62, 0.42);
  const seatR = new THREE.Mesh(seatG, s.seatMat); seatR.position.set(0.36, 0.62, 0.42);
  const dome = new THREE.PointLight(0xffe2b0, 1.4, 3.4, 1.8); dome.position.set(0, 1.15, 0.15);
  group.add(dash, dashFace, wheelT, colM, seatL, seatR, dome);
  group.userData.interior = { steeringWheel: wheelT, dome };
}

// A stylized but believable sedan. opts.paint: hex.
export function makeCarMesh({ paint = 0x8a1a1a, interior = false, spoiler = false, taxi = false } = {}) {
  const s = shared();
  const group = new THREE.Group();

  const paintMat = new THREE.MeshStandardMaterial({
    color: paint, metalness: 0.82, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.35,
  });

  const body = new THREE.Mesh(profileGeometry(), paintMat);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  const glass = new THREE.Mesh(greenhouseGeometry(), G.glassMat);
  group.add(glass);

  // rocker sills
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 2.2), paintMat);
  sill.position.set(0.83, 0.47, 0); group.add(sill);
  const sill2 = sill.clone(); sill2.position.x = -0.83; group.add(sill2);

  // lights
  const lfl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), G.lightF); lfl.position.set(0.55, 0.72, -2.13); lfl.rotation.y = 0.12;
  const lfr = lfl.clone(); lfr.position.x = -0.55; lfr.rotation.y = -0.12;
  const lrl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.05), G.lightR.clone()); lrl.position.set(0.6, 0.78, 2.13);
  const lrr = lrl.clone(); lrr.position.x = -0.6;
  group.add(lfl, lfr, lrl, lrr);
  group.userData.brakeMats = [lrl.material, lrr.material];

  // rear light bar (full-width, modern look)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.04), G.lightR.clone());
  bar.position.set(0, 0.84, 2.14); group.add(bar);
  group.userData.brakeMats.push(bar.material);

  // plates
  const plateG = new THREE.PlaneGeometry(0.5, 0.125);
  const pf = new THREE.Mesh(plateG, G.plateMat); pf.position.set(0, 0.5, -2.155); pf.rotation.y = Math.PI;
  const pr = pf.clone(); pr.position.z = 2.16; pr.rotation.y = 0;
  group.add(pf, pr);

  // mirrors
  const mirG = new THREE.BoxGeometry(0.1, 0.09, 0.16);
  const mirL = new THREE.Mesh(mirG, paintMat); mirL.position.set(0.92, 1.02, -0.5);
  const mirR = mirL.clone(); mirR.position.x = -0.92;
  group.add(mirL, mirR);

  if (spoiler) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.3), paintMat);
    sp.position.set(0, 1.02, 1.86);
    const stL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.2), paintMat); stL.position.set(0.5, 0.93, 1.86);
    const stR = stL.clone(); stR.position.x = -0.5;
    group.add(sp, stL, stR);
  }

  if (taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.2), new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffc400, emissiveIntensity: 0.7 }));
    sign.position.set(0, 1.4, 0.1);
    group.add(sign);
  }

  // wheels: front steer group
  const wfl = makeWheel(s, 0.83, -0.92), wfr = makeWheel(s, -0.83, -0.92);
  const wrl = makeWheel(s, 0.83, 0.88), wrr = makeWheel(s, -0.83, 0.88);
  group.add(wfl, wfr, wrl, wrr);
  group.userData.wheels = { frontL: wfl, frontR: wfr, rearL: wrl, rearR: wrr, radius: 0.35 };

  // headlight spot lights (off by default, toggled at dusk)
  const spotL = new THREE.SpotLight(0xfff2cc, 55, 65, 0.45, 0.5, 1.6);
  const spotR = spotL.clone();
  spotL.position.set(0.62, 0.62, -2.1); spotR.position.set(-0.62, 0.62, -2.1);
  const tgtL = new THREE.Object3D(); tgtL.position.set(0.9, 0.3, -14); group.add(tgtL);
  const tgtR = new THREE.Object3D(); tgtR.position.set(-0.9, 0.3, -14); group.add(tgtR);
  spotL.target = tgtL; spotR.target = tgtR;
  spotL.visible = spotR.visible = false;
  group.add(spotL, spotR);
  group.userData.headlights = [spotL, spotR];

  if (interior) buildInterior(group, s);
  return group;
}

// Doors that open (driver/passenger) for the player car - simple hinged panels.
export function addDoors(carMesh, paint) {
  const s = shared();
  const mat = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.82, roughness: 0.3, clearcoat: 1 });
  const mkDoor = (side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.86, 0.7, -0.35); // hinge at front edge
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 1.05), mat);
    panel.position.set(0, 0, 0.55); panel.castShadow = true;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.85), G.glassMat);
    win.position.set(0, 0.48, 0.55);
    hinge.add(panel, win);
    carMesh.add(hinge);
    return hinge;
  };
  return { left: mkDoor(1), right: mkDoor(-1), openAmount: 0, target: 0 };
}

// ---------------------------------------------------------------- physics
// Arcade bicycle-ish model tuned for feel: grippy but slides with handbrake.
export class Car {
  constructor(scene, { paint = 0x8a1a1a, x = 0, z = 0, heading = 0, isPlayer = false, spoiler = false, taxi = false, externalMesh = null } = {}) {
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.vel = new THREE.Vector2(0, 0); // local: x lateral, y forward
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.airborne = false;
    this.vy = 0;
    this.offroad = false;
    this.crashShake = 0;
    this.usingExternalMesh = !!externalMesh;

    if (externalMesh) {
      this.mesh = externalMesh.group;
      this.external = externalMesh;
    } else {
      this.mesh = makeCarMesh({ paint, interior: isPlayer, spoiler, taxi });
    }
    if (isPlayer && !externalMesh) {
      this.doors = addDoors(this.mesh, paint);
    } else {
      this.doors = null;
    }
    scene.add(this.mesh);
    this.syncMesh(0);
  }

  forwardDir() { return new THREE.Vector2(-Math.sin(this.heading), -Math.cos(this.heading)); }

  update(dt, inp, world) {
    const maxSteer = CAR.maxSteer * lerp(1, CAR.steerSpeedFac, Math.abs(this.speed) / CAR.maxSpeed);
    this.steer = lerp(this.steer, inp.steer * maxSteer, Math.min(1, 9 * dt));

    // surface
    const surf = world ? world.surfaceAt(this.pos.x, this.pos.z) : 'road';
    this.offroad = (surf === 'grass' || surf === 'dirt');
    let grip = this.offroad ? CAR.gripOffroad : CAR.grip;
    let drag = CAR.drag * (this.offroad ? 3.2 : 1);

    // engine / brake
    let accel = 0;
    if (inp.throttle > 0) {
      const t = clamp(this.speed / CAR.maxSpeed, 0, 1);
      accel += CAR.engine * inp.throttle * (1 - t * t * 0.9) * (this.offroad ? 0.6 : 1);
    }
    if (inp.brake > 0) accel -= CAR.brake * inp.brake * Math.sign(this.speed >= -0.5 ? 1 : -1);
    if (inp.handbrake) { grip *= CAR.handbrakeGrip; accel -= Math.sign(this.speed) * CAR.brake * 0.45; }
    if (this.speed < 0.4 && inp.brake > 0 && inp.throttle === 0) {
      // reverse
      accel -= CAR.engine * 0.45 * inp.brake;
    }

    this.speed += accel * dt;
    this.speed -= this.speed * drag * dt;
    if (Math.abs(this.speed) < 0.08 && inp.throttle === 0 && inp.brake === 0) this.speed = 0;
    this.speed = clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);

    // steering yaw
    const yaw = (this.speed / CAR.wheelBase) * Math.tan(this.steer) * dt;
    this.heading += yaw;

    // velocity split with grip (lateral slides decay)
    const f = this.forwardDir();
    const fwdSpeed = this.speed;
    const latDecay = clamp(grip * dt, 0, 1);
    this.vel.y = lerp(this.vel.y, fwdSpeed, latDecay);
    this.vel.x = lerp(this.vel.x, 0, latDecay);

    // handbrake kick: inject lateral from steering
    if (inp.handbrake && Math.abs(this.speed) > 4) {
      this.vel.x += -this.steer * Math.abs(this.speed) * 0.55 * dt * 8;
    }

    const r = new THREE.Vector2(f.y, -f.x); // right vector
    const dx = f.x * this.vel.y + r.x * this.vel.x;
    const dz = f.y * this.vel.y + r.y * this.vel.x;

    let nx = this.pos.x + dx * dt;
    let nz = this.pos.z + dz * dt;

    // world collision
    if (world) {
      const hit = world.collide(nx, nz, 1.1);
      if (hit.blocked) {
        nx = hit.x; nz = hit.z;
        if (Math.abs(this.speed) > 8) this.crashShake = Math.min(1, Math.abs(this.speed) / 40);
        this.speed *= -0.25;
        this.vel.multiplyScalar(0.4);
      }
    }

    // terrain height (ramps / flyovers / speed bumps)
    if (world) {
      const hHere = world.heightAt(this.pos.x, this.pos.z);
      const hNext = world.heightAt(nx, nz);
      const slope = (hNext - hHere) / Math.max(0.001, Math.hypot(nx - this.pos.x, nz - this.pos.z));
      if (hNext > hHere + 0.25 && Math.abs(this.speed) > 6 && slope > 0.45) {
        // launching off a ramp lip
        this.vy = Math.abs(this.speed) * slope * 0.5;
        this.airborne = true;
      }
      if (this.airborne) {
        this.vy -= 16 * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= hNext) { this.pos.y = hNext; this.airborne = false; this.vy = 0; if (Math.abs(this.speed) > 3) this.crashShake = Math.min(0.6, Math.abs(this.speed) / 60); }
      } else {
        this.pos.y = lerp(this.pos.y, hNext, Math.min(1, 12 * dt));
      }
      // speed bumps slow you hard if fast
      if (world.bumpAt && world.bumpAt(nx, nz) && Math.abs(this.speed) > 8) {
        this.speed *= (1 - 1.4 * dt);
        this.crashShake = Math.max(this.crashShake, 0.25);
        this.vy = Math.abs(this.speed) * 0.06; this.airborne = true;
      }
    }

    this.pos.x = nx; this.pos.z = nz;
    this.crashShake = Math.max(0, this.crashShake - dt * 2.2);
    this.wheelSpin += (this.speed / (this.wheelsRadius || 0.35)) * dt;

    // doors
    if (this.doors && this.doors.target !== this.doors.openAmount) {
      const d = Math.sign(this.doors.target - this.doors.openAmount);
      this.doors.openAmount = clamp(this.doors.openAmount + d * dt * 2.2, 0, 1);
    }

    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    if (this.crashShake > 0) {
      this.mesh.position.x += (Math.random() - 0.5) * this.crashShake * 0.14;
      this.mesh.position.z += (Math.random() - 0.5) * this.crashShake * 0.14;
      this.mesh.rotation.z = (Math.random() - 0.5) * this.crashShake * 0.03;
    } else this.mesh.rotation.z = 0;

    // drift lean + pitch
    this.mesh.rotation.x = clamp(-(this._accelSmooth || 0) * 0.012, -0.05, 0.05);
    this.mesh.rotation.z += clamp(this.vel.x * 0.004, -0.06, 0.06);

    if (this.usingExternalMesh && this.external) {
      const E = this.external;
      for (const w of E.wheels) w.rotation.x = this.wheelSpin;
      if (E.steering) E.steering.rotation.z = -this.steer * 2.6;
      const braking = this._braking ? 1 : 0;
      E.brakeMat.emissive.setHex(braking ? 0xff1500 : 0x220000);
      E.brakeMat.emissiveIntensity = braking ? 1.6 : 0.35;
    } else {
      const W = this.mesh.userData.wheels;
      if (W) {
        for (const k of ['frontL', 'frontR', 'rearL', 'rearR']) {
          W[k].rotation.y = k.startsWith('front') ? this.steer * 0.9 : 0;
          W[k].children.forEach((c) => { c.rotation.x = this.wheelSpin; });
        }
        // apply front steer rotation on group (parent), spin on children
        W.frontL.rotation.y = this.steer * 0.9;
        W.frontR.rotation.y = this.steer * 0.9;
      }
      // steering wheel visual
      const I = this.mesh.userData.interior;
      if (I) I.steeringWheel.rotation.z = -this.steer * 2.6;
      // brakelights
      const braking = this._braking ? 1 : 0;
      for (const m of this.mesh.userData.brakeMats || []) {
        m.emissive.setHex(braking ? 0xff1500 : 0x220000);
        m.emissiveIntensity = braking ? 1.6 : 0.35;
      }
    }

    // doors
    if (this.doors) {
      const a = this.doors.openAmount * 1.15;
      this.doors.left.rotation.y = a;
      this.doors.right.rotation.y = -a;
    }
  }
}
