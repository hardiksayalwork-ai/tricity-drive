import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { QUALITY } from './config.js';
import { loadPBR, glowTexture, leafTexture } from './textures.js';

// Shared world helpers: ground, roads, props, collision, surfaces, height.

const lampGlow = { tex: null };
const leaf = { tex: null };

// Scale BoxGeometry UVs so a facade texture tiles at real-world size.
// BoxGeometry vertex order: +x,-x,+y,-y,+z,-z faces, 4 uv verts each.
function scaleBoxUVs(geo, w, h, d, tileW, tileH) {
  const uv = geo.attributes.uv;
  const faces = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    const ru = Math.max(1, Math.round(fw / tileW));
    const rv = Math.max(1, Math.round(fh / tileH));
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    }
  }
  uv.needsUpdate = true;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {x,z,r} circles
    this.roads = [];       // {ax,az,bx,bz,w} segments for surface test
    this.polys = [];       // extra 'road' polygons (roundabouts, plazas)
    this.ramps = [];       // {x,z,r,h,dirx,dirz,len} linear ramps
    this.bumps = [];       // {x,z,r}
    this.surfaces = [];    // {type:'rect',x,z,w,l,rot,surf}
    this.water = null;
    this.instanceBuckets = [];
  }

  addCollider(x, z, r) { this.colliders.push({ x, z, r }); }
  addRoadSeg(ax, az, bx, bz, w) { this.roads.push({ ax, az, bx, bz, w }); }
  addPoly(cx, cz, r) { this.polys.push({ cx, cz, r }); }
  addRamp(x, z, dirx, dirz, len, h) { this.ramps.push({ x, z, dirx, dirz, len, h }); }
  addBump(x, z, r = 2.2) { this.bumps.push({ x, z, r }); }

  // surface type at point: 'road' | 'grass' | 'sand' | 'dirt'
  surfaceAt(x, z) {
    for (const r of this.roads) {
      const dx = r.bx - r.ax, dz = r.bz - r.az;
      const len2 = dx * dx + dz * dz;
      let t = ((x - r.ax) * dx + (z - r.az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = r.ax + t * dx, pz = r.az + t * dz;
      if ((x - px) ** 2 + (z - pz) ** 2 < (r.w / 2 + 1.2) ** 2) return 'road';
    }
    for (const p of this.polys) {
      if ((x - p.cx) ** 2 + (z - p.cz) ** 2 < p.r * p.r) return 'road';
    }
    for (const s of this.surfaces) {
      const c = Math.cos(-s.rot), si = Math.sin(-s.rot);
      const lx = (x - s.x) * c - (z - s.z) * si;
      const lz = (x - s.x) * si + (z - s.z) * c;
      if (Math.abs(lx) < s.w / 2 && Math.abs(lz) < s.l / 2) return s.surf;
    }
    return 'grass';
  }

  heightAt(x, z) {
    let h = 0;
    for (const r of this.ramps) {
      // point projected on ramp line
      const dx = x - r.x, dz = z - r.z;
      const t = dx * r.dirx + dz * r.dirz;
      if (t >= 0 && t <= r.len) {
        const perp = Math.abs(dx * -r.dirz + dz * r.dirx);
        if (perp < 6) h = Math.max(h, (t / r.len) * r.h);
      }
    }
    return h;
  }

  bumpAt(x, z) {
    for (const b of this.bumps) {
      if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return true;
    }
    return false;
  }

  collide(nx, nz, radius) {
    let x = nx, z = nz, blocked = false;
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      const min = c.r + radius;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
        blocked = true;
      }
    }
    return { x, z, blocked };
  }

  // ---------------- builders ----------------

  ground(size, pbrBase, repeat = 60, color = 0xffffff) {
    let mat;
    if (pbrBase) {
      const p = loadPBR(pbrBase, repeat);
      mat = new THREE.MeshStandardMaterial({ ...p, color });
    }
    mat.envMapIntensity = 0.35;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.scene.add(g);
    return g;
  }

  road(x, z, len, width, rot = 0, tex = null) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshStandardMaterial({
      color: 0xffffff, map: tex, roughness: 0.93, metalness: 0.02,
    }));
    if (tex) { tex.repeat.set(1, Math.max(1, Math.round(len / 16))); tex.needsUpdate = true; }
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = rot;
    g.position.set(x, 0.03, z);
    g.receiveShadow = true;
    this.scene.add(g);
    // register for surface
    const dx = Math.sin(rot), dz = Math.cos(rot);
    this.addRoadSeg(x - dx * len / 2, z - dz * len / 2, x + dx * len / 2, z + dz * len / 2, width);
    return g;
  }

  sidewalk(x, z, len, width, rot = 0) {
    const p = loadPBR('assets/tex/paving', Math.max(1, len / 8));
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, len), new THREE.MeshStandardMaterial({ ...p, color: 0xa8a49c }));
    m.position.set(x, 0.06, z);
    m.rotation.y = rot;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  // Photographic facade styles (ambientCG CC0 scans). One shared material per style; UVs scaled per building.
  facadeStyles() {
    if (this._facStyles) return this._facStyles;
    const loader = new THREE.TextureLoader();
    const mk = (id, tileW, tileH, emissive) => {
      const t = (suffix, srgb) => {
        const tex = loader.load(`assets/fac/${id}_${suffix}.jpg`);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = QUALITY.aniso;
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      };
      const mat = new THREE.MeshStandardMaterial({
        map: t('Color', true),
        normalMap: t('NormalGL', false),
        roughnessMap: t('Roughness', false),
        roughness: 1.0,
        envMapIntensity: 0.6,
      });
      if (emissive) {
        mat.emissiveMap = t('Emission', true);
        mat.emissive = new THREE.Color(0xffbe78);
        mat.emissiveIntensity = 0.8;
      }
      return { mat, tileW, tileH };
    };
    this._facStyles = [
      mk('Facade002', 11, 9, true),   // dark glass + lit windows
      mk('Facade002', 11, 9, true),
      mk('Facade003', 8, 7, true),    // gold/white block
      mk('Facade013', 9, 8, true),    // residential tower, scattered lit windows
      mk('Facade017', 9, 8, true),    // concrete residential
    ];
    return this._facStyles;
  }

  building(x, z, w, h, d, rot, style) {
    if (style && style.mat) {
      const geo = new THREE.BoxGeometry(w, h, d);
      scaleBoxUVs(geo, w, h, d, style.tileW, style.tileH);
      const m = new THREE.Mesh(geo, style.mat);
      m.position.set(x, h / 2, z);
      m.rotation.y = rot;
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.addCollider(x, z, Math.max(w, d) * 0.62);
      return m;
    }
    return this._buildingFlat(x, z, w, h, d, rot, style);
  }

  _buildingFlat(x, z, w, h, d, rot, mats) {
    // mats: {map, emissiveMap} from facadeTexture (shared per style)
    const mat = new THREE.MeshStandardMaterial({
      map: mats.map, emissiveMap: mats.emissiveMap, emissive: 0xffc37a, emissiveIntensity: 0.85, roughness: 0.9,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.rotation.y = rot;
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    this.addCollider(x, z, Math.max(w, d) * 0.62);
    return m;
  }

  // instanced palm/shisham-ish tree
  treeBucket(count) {
    const trunkG = new THREE.CylinderGeometry(0.14, 0.2, 3.2, 6);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
    if (!leaf.tex) leaf.tex = leafTexture();
    const leafG = new THREE.PlaneGeometry(3.4, 3.4);
    const leafM = new THREE.MeshStandardMaterial({ map: leaf.tex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, color: 0x9fb872 });
    const trunk = new THREE.InstancedMesh(trunkG, trunkM, count);
    const leaves = new THREE.InstancedMesh(leafG, leafM, count * 2);
    trunk.castShadow = true;
    this.scene.add(trunk, leaves);
    return { trunk, leaves, i: 0, dummy: new THREE.Object3D(), count };
  }

  tree(bucket, x, z, s = 1) {
    const { trunk, leaves, dummy } = bucket;
    if (bucket.i >= bucket.count) return;
    dummy.position.set(x, 1.6 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    dummy.updateMatrix();
    trunk.setMatrixAt(bucket.i, dummy.matrix);
    dummy.position.y = 3.2 * s;
    dummy.updateMatrix();
    leaves.setMatrixAt(bucket.i * 2, dummy.matrix);
    dummy.rotation.y += Math.PI / 2;
    dummy.updateMatrix();
    leaves.setMatrixAt(bucket.i * 2 + 1, dummy.matrix);
    bucket.i++;
    this.addCollider(x, z, 0.5 * s);
  }

  finalizeBucket(bucket) {
    bucket.trunk.count = bucket.i;
    bucket.leaves.count = bucket.i * 2;
    bucket.trunk.instanceMatrix.needsUpdate = true;
    bucket.leaves.instanceMatrix.needsUpdate = true;
  }

  lamp(x, z, rot = 0, on = true) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.5 }));
    pole.position.y = 3.2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), pole.material);
    arm.position.set(0, 6.3, 0.75);
    const headM = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, emissive: on ? 0xffd9a0 : 0x000000, emissiveIntensity: on ? 1.6 : 0 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), headM);
    head.position.set(0, 6.25, 1.45);
    g.add(pole, arm, head);
    if (on) {
      if (!lampGlow.tex) lampGlow.tex = glowTexture('#ffd9a0');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampGlow.tex, color: 0xffcf90, transparent: true, opacity: 0.85, depthWrite: false }));
      sp.scale.setScalar(2.6);
      sp.position.set(0, 6.2, 1.45);
      g.add(sp);
      // no PointLight: dozens of dynamic lights kill the forward renderer; emissive head + glow sprite reads as lit
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
    this.addCollider(x, z, 0.3);
    return g;
  }

  hedge(x, z, len, rot = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, len), new THREE.MeshStandardMaterial({ color: 0x2e5222, roughness: 1 }));
    m.position.set(x, 0.5, z);
    m.rotation.y = rot;
    m.castShadow = true;
    this.scene.add(m);
    return m;
  }

  sign(x, z, rot, tex, w = 6, h = 3) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h + 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 }));
    pole.position.y = (h + 1.4) / 2;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 }));
    board.position.y = h + 0.7;
    g.add(pole, board);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
    this.addCollider(x, z, 0.3);
    return g;
  }

  waterPlane(x, z, r, color = 0x184254) {
    if (QUALITY.high) {
      const ref = new Reflector(new THREE.CircleGeometry(r, 40), {
        clipBias: 0.003,
        textureWidth: 1024, textureHeight: 1024,
        color: 0x8a97a0,
      });
      ref.rotation.x = -Math.PI / 2;
      ref.position.set(x, 0.05, z);
      this.scene.add(ref);
      this.water = ref;
      return ref;
    }
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.75, envMapIntensity: 1.6 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    this.scene.add(m);
    this.water = m;
    return m;
  }

  hill(x, z, r, h) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a8468, roughness: 1 }));
    m.scale.y = h / r;
    m.position.set(x, 0, z);
    this.scene.add(m);
    this.addCollider(x, z, r * 0.7);
    return m;
  }

  roundabout(x, z, r, tex) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.035, z);
    m.receiveShadow = true;
    this.scene.add(m);
    this.addPoly(x, z, r);
    // center island: painted in the texture; collider only so cars route around
    this.addCollider(x, z, r * 0.3);
    return m;
  }
}
