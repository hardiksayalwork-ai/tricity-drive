import * as THREE from 'three';

// Autonomous Tesla Model 3: drives itself on road routes, periodically takes off,
// flies a circuit above the map, lands and resumes driving.
// Source: "Tesla 2018 Model 3" (CC-BY, Sketchfab).

const FLY_ALT = 55;
const TAKEOFF_AFTER = 40;   // seconds of driving before a flight
const FLY_TIME = 32;        // seconds airborne

export class Tesla {
  constructor(scene, teslaScene, routes) {
    this.scene = scene;
    this.routes = routes && routes.length ? routes : [{ axis: 'z', fixed: 0, dir: 1 }];
    this.state = 'drive';
    this.timer = TAKEOFF_AFTER * (0.5 + Math.random() * 0.5);
    this.speed = 9;
    this.flyT = 0;

    // normalize the model: ground it, length ~4.7m
    const box = new THREE.Box3().setFromObject(teslaScene);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const s = 4.7 / Math.max(size.x, size.z, 0.001);
    this.model = new THREE.Group();
    const inner = teslaScene.clone(true); // never mutate the cached template
    inner.scale.setScalar(s);
    inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    this.model.add(inner);
    inner.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.envMapIntensity = Math.max(m.envMapIntensity || 0, 1.1); m.needsUpdate = true; }
      }
    });
    // soft underglow while flying
    this.glow = new THREE.PointLight(0x88bbff, 0, 26, 1.6);
    this.glow.position.set(0, -0.4, 0);
    this.model.add(this.glow);

    // start on a route
    const r = this.routes[0];
    this.pos = new THREE.Vector3(r.axis === 'z' ? r.fixed : -200, 0, r.axis === 'z' ? -200 : r.fixed);
    this.heading = 0;
    this.route = r;
    this._applyDriveHeading();
    this.model.position.copy(this.pos);
    scene.add(this.model);
  }

  _applyDriveHeading() {
    const r = this.route;
    this.heading = r.axis === 'z' ? (r.dir > 0 ? Math.PI : 0) : (r.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  }

  update(dt, playerPos) {
    if (this.state === 'drive') {
      const f = { x: -Math.sin(this.heading), y: -Math.cos(this.heading) };
      // brake near player
      const near = playerPos && this.pos.distanceTo(playerPos) < 10;
      const target = near ? 0 : 9;
      this.speed += (target - this.speed) * Math.min(1, 1.6 * dt);
      this.pos.x += f.x * this.speed * dt;
      this.pos.z += f.y * this.speed * dt;
      const along = this.route.axis === 'z' ? this.pos.z * this.route.dir : this.pos.x * this.route.dir;
      if (along > 235) {
        // hop to another route at the far end
        this.route = this.routes[(Math.random() * this.routes.length) | 0];
        this._applyDriveHeading();
        if (this.route.axis === 'z') { this.pos.x = this.route.fixed; this.pos.z = -235 * this.route.dir; }
        else { this.pos.z = this.route.fixed; this.pos.x = -235 * this.route.dir; }
      }
      this.model.position.set(this.pos.x, 0, this.pos.z);
      this.model.rotation.set(0, this.heading, 0);
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'takeoff'; this.glow.intensity = 60; }
    } else if (this.state === 'takeoff') {
      this.flyT = Math.min(1, this.flyT + dt / 3.2);
      const y = THREE.MathUtils.smoothstep(this.flyT, 0, 1) * FLY_ALT;
      this.model.position.set(this.pos.x, y, this.pos.z);
      this.model.rotation.z = Math.sin(this.flyT * Math.PI) * 0.06;
      if (this.flyT >= 1) { this.state = 'fly'; this.timer = FLY_TIME; this._flyAngle = Math.atan2(this.pos.x, this.pos.z); }
    } else if (this.state === 'fly') {
      this.timer -= dt;
      this._flyAngle += dt * 0.22;
      const R = 150;
      const tx = Math.sin(this._flyAngle) * R, tz = Math.cos(this._flyAngle) * R;
      // gentle bobbing + bank into the turn
      const y = FLY_ALT + Math.sin(performance.now() * 0.0011) * 3;
      const vx = Math.cos(this._flyAngle) * R * 0.22, vz = -Math.sin(this._flyAngle) * R * 0.22;
      this.model.position.set(tx, y, tz);
      this.model.rotation.y = Math.atan2(vx, vz) + Math.PI;
      this.model.rotation.z = -0.12;
      if (this.timer <= 0) { this.state = 'land'; this._landFrom = this.model.position.clone(); this.flyT = 0;
        // land near current route position
        this.pos.set(this.route.axis === 'z' ? this.route.fixed : -120, 0, this.route.axis === 'z' ? -120 : this.route.fixed);
      }
    } else if (this.state === 'land') {
      this.flyT = Math.min(1, this.flyT + dt / 3.4);
      const k = 1 - THREE.MathUtils.smoothstep(this.flyT, 0, 1);
      this.model.position.lerpVectors(new THREE.Vector3(this.pos.x, 0, this.pos.z), this._landFrom, k);
      this.model.rotation.z *= 0.95;
      this.model.rotation.y = this.model.rotation.y + (((this.heading - this.model.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, 2.2 * dt);
      if (this.flyT >= 1) { this.state = 'drive'; this.timer = TAKEOFF_AFTER * (0.7 + Math.random() * 0.6); this.glow.intensity = 0; }
    }
  }
}
