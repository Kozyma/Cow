// 목초지: 풀이 자라고(grow) → 다 자라면(tall) → 트랙터가 베고(cut) → 베일러가 수거
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, LAYOUT, GROW_TIME } from './state.js';
import { mat } from './materials.js';
import { rand, wrapAngle } from './util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function tuftGeometry() {
  const parts = [];
  const spots = [[0, 0], [-0.55, -0.5], [0.55, -0.45], [-0.5, 0.5], [0.5, 0.55], [0, -0.7], [0, 0.7], [-0.7, 0], [0.7, 0.05]];
  for (const [x, z] of spots) {
    const h = rand(0.75, 1.05);
    const c = new THREE.ConeGeometry(0.2, h, 5);
    c.rotateX(rand(-0.2, 0.2));
    c.rotateZ(rand(-0.2, 0.2));
    c.translate(x + rand(-0.1, 0.1), h / 2, z + rand(-0.1, 0.1));
    parts.push(c);
  }
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

export class Field {
  constructor(scene) {
    const L = LAYOUT.field;
    this.L = L;
    this.x0 = L.x0; this.z0 = L.z0; this.T = L.tile;
    this.w = L.cols * L.tile; this.d = L.rows * L.tile;
    this.tiles = [];
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        const g = Math.random() < 0.85 ? 1 : rand(0.2, 0.9);
        this.tiles.push({ i: this.tiles.length, c, r, x: L.x0 + (c + 0.5) * L.tile, z: L.z0 + (r + 0.5) * L.tile, state: g >= 1 ? 'tall' : 'grow', g, rot: rand(0, 6) });
      }
    }
    // 흙 바닥 (줄무늬)
    const geo = new THREE.PlaneGeometry(this.w + 1, this.d + 1, L.cols, L.rows * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const a = new THREE.Color(0xd2cf86), b = new THREE.Color(0xc2bd72), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      c.copy(Math.floor((z + this.d) / 1) % 2 ? a : b);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const soil = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true }));
    soil.position.set(L.x0 + this.w / 2, 0.035, L.z0 + this.d / 2);
    soil.receiveShadow = true;
    scene.add(soil);

    const n = this.tiles.length;
    this.tall = new THREE.InstancedMesh(tuftGeometry(), mat(0xffffff), n);
    this.tall.castShadow = true; this.tall.receiveShadow = true;
    const wg = new THREE.CapsuleGeometry(0.42, 1.0, 2, 7);
    wg.rotateX(Math.PI / 2);
    wg.scale(1, 0.55, 1);
    wg.translate(0, 0.22, 0);
    this.windrow = new THREE.InstancedMesh(wg, mat(0xffffff), n);
    this.windrow.castShadow = true; this.windrow.receiveShadow = true;
    const col = new THREE.Color();
    for (const t of this.tiles) {
      col.setHSL(0.27 + rand(-0.03, 0.03), 0.5, rand(0.42, 0.5));
      this.tall.setColorAt(t.i, col);
      col.setHSL(0.15 + rand(-0.02, 0.02), 0.6, rand(0.62, 0.7));
      this.windrow.setColorAt(t.i, col);
    }
    scene.add(this.tall, this.windrow);
    this.tall.frustumCulled = false; this.windrow.frustumCulled = false;
    this.visTimer = 0;
    this.counts = { tall: 0, cut: 0, grow: 0 };
    this.refreshAll();
  }

  setVisual(t) {
    if (t.state === 'cut') {
      _s.set(0.0001, 0.0001, 0.0001);
    } else {
      const g = t.state === 'tall' ? 1 : t.g;
      _s.set(0.55 + 0.45 * g, 0.12 + 0.88 * g, 0.55 + 0.45 * g);
    }
    _q.setFromAxisAngle(_up, t.rot);
    _p.set(t.x, 0.03, t.z);
    _m.compose(_p, _q, _s);
    this.tall.setMatrixAt(t.i, _m);
    if (t.state === 'cut') _s.set(1, 1, 1); else _s.set(0.0001, 0.0001, 0.0001);
    _q.setFromAxisAngle(_up, t.rot * 0.1);
    _m.compose(_p, _q, _s);
    this.windrow.setMatrixAt(t.i, _m);
  }

  refreshAll() {
    this.counts = { tall: 0, cut: 0, grow: 0 };
    for (const t of this.tiles) { this.setVisual(t); this.counts[t.state]++; }
    this.tall.instanceMatrix.needsUpdate = true;
    this.windrow.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const boost = G.fertileTimer > 0 ? 2.5 : 1;
    const inc = (dt / GROW_TIME) * boost;
    let changed = false;
    for (const t of this.tiles) {
      if (t.state === 'grow') {
        t.g += inc * rand(0.7, 1.3);
        if (t.g >= 1) { t.g = 1; t.state = 'tall'; }
        changed = true;
      }
    }
    this.visTimer -= dt;
    if (changed && this.visTimer <= 0) {
      this.visTimer = 0.3;
      this.refreshAll();
    }
  }

  inside(x, z, m = 0) {
    return x > this.x0 - m && x < this.x0 + this.w + m && z > this.z0 - m && z < this.z0 + this.d + m;
  }

  forEachNear(x, z, r, fn) {
    const T = this.T;
    const c0 = Math.max(0, Math.floor((x - r - this.x0) / T)), c1 = Math.min(this.L.cols - 1, Math.floor((x + r - this.x0) / T));
    const r0 = Math.max(0, Math.floor((z - r - this.z0) / T)), r1 = Math.min(this.L.rows - 1, Math.floor((z + r - this.z0) / T));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const t = this.tiles[rr * this.L.cols + cc];
      if (Math.hypot(t.x - x, t.z - z) <= r) fn(t);
    }
  }

  /** 다 자란 풀 베기 → 벤 타일 배열 */
  cutAt(x, z, r) {
    const out = [];
    this.forEachNear(x, z, r, (t) => {
      if (t.state === 'tall') { t.state = 'cut'; out.push(t); }
    });
    if (out.length) this.refreshAll();
    return out;
  }

  /** 벤 풀 수거 → 개수 */
  collectAt(x, z, r) {
    const out = [];
    this.forEachNear(x, z, r, (t) => {
      if (t.state === 'cut') { t.state = 'grow'; t.g = 0; out.push(t); }
    });
    if (out.length) this.refreshAll();
    return out;
  }

  /** 상태가 같은 타일 중 진행 방향을 고려한 가장 가까운 타일 */
  nearest(state, x, z, heading) {
    let best = null, bv = Infinity;
    for (const t of this.tiles) {
      if (t.state !== state) continue;
      const dx = t.x - x, dz = t.z - z;
      const d = Math.hypot(dx, dz);
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - heading));
      const v = d + ang * 2.2 + (d < 0.6 ? 50 : 0);
      if (v < bv) { bv = v; best = t; }
    }
    return best;
  }

  growAll() {
    for (const t of this.tiles) if (t.state === 'grow') { t.g = 1; t.state = 'tall'; }
    this.refreshAll();
  }

  serialize() {
    return this.tiles.map((t) => (t.state === 'tall' ? 'T' : t.state === 'cut' ? 'C' : String(Math.min(9, Math.floor(t.g * 10))))).join('');
  }
  deserialize(s) {
    if (!s || s.length !== this.tiles.length) return;
    this.tiles.forEach((t, i) => {
      const ch = s[i];
      if (ch === 'T') { t.state = 'tall'; t.g = 1; }
      else if (ch === 'C') { t.state = 'cut'; t.g = 0; }
      else { t.state = 'grow'; t.g = Number(ch) / 10; }
    });
    this.refreshAll();
  }
}
