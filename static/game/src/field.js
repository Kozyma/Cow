// 밭: 작물이 자라고(grow) → 다 자라면(tall) → 트랙터가 베고(cut) → 베일러가 수거
// 밭은 여러 개 (기본 목초지 + 상점에서 사는 밭 부지), 밭마다 작물(목초·라이그라스·옥수수)을 고른다
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

/** 작물 정의: grow = 자라는 시간 배수, bale = 베일러가 만드는 베일 (item.product) */
export const CROPS = {
  grass: { name: '목초', icon: '🌱', grow: 1.0, bale: null, baleName: '건초', soil: [0xd2cf86, 0xc2bd72], row: [0.15, 0.6, 0.66] },
  rye: { name: '라이그라스', icon: '🌿', grow: 0.85, bale: 'rye', baleName: '라이그라스 건초', soil: [0xc9c47e, 0xb9b46a], row: [0.2, 0.5, 0.58] },
  corn: { name: '옥수수', icon: '🌽', grow: 1.5, bale: 'corn', baleName: '옥수수 사일리지', soil: [0xc8a878, 0xb89868], row: [0.13, 0.7, 0.6] },
};
export const cropOfBale = (product) => (product === 'rye' ? 'rye' : product === 'corn' ? 'corn' : 'grass');

function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const GEO = {};
function cropGeometry(crop) {
  if (GEO[crop]) return GEO[crop];
  const parts = [];
  if (crop === 'corn') {
    // 옥수숫대 3그루: 줄기 + 잎 + 옥수수 + 수염 (⚡ 꼭짓점 수를 줄인 가벼운 모양)
    for (const [x, z] of [[-0.45, -0.35], [0.45, -0.3], [0, 0.5]]) {
      const h = rand(1.9, 2.3);
      parts.push(colored(new THREE.CylinderGeometry(0.05, 0.08, h, 4, 1, true).translate(x, h / 2, z), 0x6fae4a));
      for (let k = 0; k < 3; k++) {
        const leaf = new THREE.ConeGeometry(0.07, 0.8, 3, 1, true);
        leaf.rotateX(Math.PI / 2);
        leaf.translate(0, 0, 0.36);
        leaf.rotateX(-0.5 - k * 0.12);
        leaf.rotateY(k * 2.1 + rand(-0.3, 0.3));
        leaf.translate(x, 0.55 + k * 0.45, z);
        parts.push(colored(leaf, k === 2 ? 0x8cc65a : 0x79b852));
      }
      const cob = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 5, 1, true);
      cob.rotateZ(0.35); cob.translate(x + 0.1, h * 0.55, z);
      parts.push(colored(cob, 0xffd04d));
      parts.push(colored(new THREE.ConeGeometry(0.1, 0.35, 4, 1, true).translate(x, h + 0.12, z), 0xe8c977));
    }
  } else {
    // 목초: 짧은 풀 다발, 라이그라스: 가늘고 길쭉한 잎 + 이삭
    const rye = crop === 'rye';
    const spots = [[0, 0], [-0.55, -0.5], [0.55, -0.45], [-0.5, 0.5], [0.5, 0.55], [0, -0.7], [0, 0.7], [-0.7, 0], [0.7, 0.05]];
    for (const [x, z] of spots) {
      const h = rye ? rand(1.0, 1.35) : rand(0.75, 1.05);
      const c = new THREE.ConeGeometry(rye ? 0.13 : 0.2, h, 5);
      c.rotateX(rand(-0.2, 0.2));
      c.rotateZ(rand(-0.2, 0.2));
      c.translate(x + rand(-0.1, 0.1), h / 2, z + rand(-0.1, 0.1));
      parts.push(colored(c, 0xffffff));
      if (rye) parts.push(colored(new THREE.CylinderGeometry(0.04, 0.03, 0.28, 4).translate(x, h + 0.08, z), 0xe9e2a0));
    }
  }
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return (GEO[crop] = g);
}

export class Field {
  /** def: { id, name, x0, z0, cols, rows, tile, crop, owned, price } */
  constructor(scene, def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.scene = scene;
    this.L = def;
    this.x0 = def.x0; this.z0 = def.z0; this.T = def.tile;
    this.cols = def.cols; this.rows = def.rows;
    this.w = def.cols * def.tile; this.d = def.rows * def.tile;
    this.owned = def.owned !== false;
    this.crop = def.crop || 'grass';
    this.tiles = [];
    for (let r = 0; r < def.rows; r++) {
      for (let c = 0; c < def.cols; c++) {
        const g = Math.random() < 0.85 ? 1 : rand(0.2, 0.9);
        this.tiles.push({ i: this.tiles.length, c, r, x: def.x0 + (c + 0.5) * def.tile, z: def.z0 + (r + 0.5) * def.tile, state: g >= 1 ? 'tall' : 'grow', g, rot: rand(0, 6), k: rand(0.7, 1.3) });
      }
    }
    this.growAcc = 0;
    this.visTimer = 0;
    this.counts = { tall: 0, cut: 0, grow: 0 };
    this.root = new THREE.Group();
    scene.add(this.root);
    this.buildSoil();
    this.buildPlot();
    this.buildCrop();
    this.applyOwned();
  }

  buildSoil() {
    if (this.soil) { this.root.remove(this.soil); this.soil.geometry.dispose(); }
    const geo = new THREE.PlaneGeometry(this.w + 1, this.d + 1, this.cols, this.rows * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const [ca, cb] = CROPS[this.crop].soil;
    const a = new THREE.Color(ca), b = new THREE.Color(cb), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      c.copy(Math.floor(z + this.d) % 2 ? a : b);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.soil = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true }));
    this.soil.position.set(this.x0 + this.w / 2, 0.035, this.z0 + this.d / 2);
    this.soil.receiveShadow = true;
    this.root.add(this.soil);
  }

  /** 아직 안 산 밭 부지: 말뚝 + 줄 + 표지판 */
  buildPlot() {
    const g = new THREE.Group();
    const wood = mat(0xc98a5a), rope = mat(0xf4e3b5), sign = mat(0xfff6dc);
    const x0 = this.x0, z0 = this.z0, x1 = x0 + this.w, z1 = z0 + this.d;
    const post = new THREE.CylinderGeometry(0.12, 0.14, 1.0, 6);
    const pts = [];
    const stepX = this.w / Math.max(1, Math.round(this.w / 8)), stepZ = this.d / Math.max(1, Math.round(this.d / 8));
    for (let x = x0; x <= x1 + 0.01; x += stepX) pts.push([x, z0], [x, z1]);
    for (let z = z0 + stepZ; z < z1 - 0.01; z += stepZ) pts.push([x0, z], [x1, z]);
    for (const [x, z] of pts) { const m = new THREE.Mesh(post, wood); m.position.set(x, 0.5, z); g.add(m); }
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
      const L = Math.hypot(bx - ax, bz - az);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L), rope);
      m.position.set((ax + bx) / 2, 0.85, (az + bz) / 2);
      m.rotation.y = Math.atan2(bx - ax, bz - az);
      g.add(m);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.12), sign);
    board.position.set(x0 + this.w / 2, 1.6, z0 - 0.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), wood);
    pole.position.set(x0 + this.w / 2, 0.8, z0 - 0.5);
    g.add(board, pole);
    this.plot = g;
    this.root.add(g);
  }

  buildCrop() {
    for (const k of ['tall', 'windrow']) if (this[k]) { this.root.remove(this[k]); this[k].dispose(); }
    this.windrow?.geometry.dispose();
    const n = this.tiles.length;
    const vc = this.crop === 'corn';
    this.tall = new THREE.InstancedMesh(cropGeometry(this.crop), mat(0xffffff, { vertexColors: true }), n);
    this.tall.castShadow = true; this.tall.receiveShadow = true;
    const wg = new THREE.CapsuleGeometry(0.42, 1.0, 2, 7);
    wg.rotateX(Math.PI / 2);
    wg.scale(1, 0.55, 1);
    wg.translate(0, 0.22, 0);
    this.windrow = new THREE.InstancedMesh(wg, mat(0xffffff), n);
    this.windrow.castShadow = true; this.windrow.receiveShadow = true;
    const col = new THREE.Color();
    const row = CROPS[this.crop].row;
    for (const t of this.tiles) {
      if (vc) col.setHSL(0.25, 0.1, rand(0.88, 1.0));
      else if (this.crop === 'rye') col.setHSL(0.33 + rand(-0.02, 0.02), 0.55, rand(0.36, 0.43));
      else col.setHSL(0.27 + rand(-0.03, 0.03), 0.5, rand(0.42, 0.5));
      this.tall.setColorAt(t.i, col);
      col.setHSL(row[0] + rand(-0.02, 0.02), row[1], rand(row[2] - 0.04, row[2] + 0.04));
      this.windrow.setColorAt(t.i, col);
    }
    this.root.add(this.tall, this.windrow);
    this.tall.frustumCulled = false; this.windrow.frustumCulled = false;
    this.refreshAll();
  }

  applyOwned() {
    this.soil.visible = this.tall.visible = this.windrow.visible = this.owned;
    this.plot.visible = !this.owned;
  }

  /** 밭 부지 사기 */
  buy(crop) {
    this.owned = true;
    this.plant(crop, true);
    this.applyOwned();
  }

  /** 작물 바꾸기: 새로 심어서 처음부터 자란다 (full=true면 다 자란 채로) */
  plant(crop, full = false) {
    if (!CROPS[crop]) return;
    const changed = crop !== this.crop;
    this.crop = crop;
    for (const t of this.tiles) { t.state = full ? 'tall' : 'grow'; t.g = full ? 1 : rand(0, 0.15); }
    if (changed) { this.buildSoil(); this.buildCrop(); this.applyOwned(); } else this.refreshAll();
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

  /** 몇 칸만 바뀌었을 때 (베기·수거): 그 칸만 다시 그린다 */
  touch(list, from, to) {
    for (const t of list) this.setVisual(t);
    this.counts[from] -= list.length; this.counts[to] += list.length;
    this.tall.instanceMatrix.needsUpdate = true;
    this.windrow.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    if (!this.owned || !this.counts.grow) return;
    // 자라는 계산은 0.25초마다 한 번에 (매 프레임 모든 칸을 돌지 않게)
    this.growAcc += dt;
    if (this.growAcc < 0.25) return;
    const step = this.growAcc;
    this.growAcc = 0;
    const boost = G.fertileTimer > 0 ? 2.5 : 1;
    const inc = (step / (GROW_TIME * CROPS[this.crop].grow)) * boost;
    let grown = 0;
    for (const t of this.tiles) {
      if (t.state !== 'grow') continue;
      t.g += inc * t.k;
      if (t.g >= 1) { t.g = 1; t.state = 'tall'; grown++; }
    }
    this.counts.grow -= grown; this.counts.tall += grown;
    this.visTimer -= step;
    if (this.visTimer <= 0) {
      this.visTimer = 0.75;
      for (const t of this.tiles) if (t.state !== 'cut') this.setVisual(t);
      this.tall.instanceMatrix.needsUpdate = true;
    }
  }

  inside(x, z, m = 0) {
    return this.owned && x > this.x0 - m && x < this.x0 + this.w + m && z > this.z0 - m && z < this.z0 + this.d + m;
  }
  /** 산 것과 상관없이 땅 영역 */
  area(m = 0) { return { minX: this.x0 - m, maxX: this.x0 + this.w + m, minZ: this.z0 - m, maxZ: this.z0 + this.d + m }; }

  forEachNear(x, z, r, fn) {
    const T = this.T;
    const c0 = Math.max(0, Math.floor((x - r - this.x0) / T)), c1 = Math.min(this.cols - 1, Math.floor((x + r - this.x0) / T));
    const r0 = Math.max(0, Math.floor((z - r - this.z0) / T)), r1 = Math.min(this.rows - 1, Math.floor((z + r - this.z0) / T));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const t = this.tiles[rr * this.cols + cc];
      if (Math.hypot(t.x - x, t.z - z) <= r) fn(t);
    }
  }

  /** 다 자란 작물 베기 → 벤 타일 배열 */
  cutAt(x, z, r) {
    if (!this.inside(x, z, r)) return [];
    const out = [];
    this.forEachNear(x, z, r, (t) => {
      if (t.state === 'tall') { t.state = 'cut'; out.push(t); }
    });
    if (out.length) this.touch(out, 'tall', 'cut');
    return out;
  }

  /** 벤 작물 수거 → 타일 배열 */
  collectAt(x, z, r) {
    if (!this.inside(x, z, r)) return [];
    const out = [];
    this.forEachNear(x, z, r, (t) => {
      if (t.state === 'cut') { t.state = 'grow'; t.g = 0; out.push(t); }
    });
    if (out.length) this.touch(out, 'cut', 'grow');
    return out;
  }

  /** 상태가 같은 타일 중 진행 방향을 고려한 가장 가까운 타일 → { t, v } */
  nearestScored(state, x, z, heading) {
    let best = null, bv = Infinity;
    if (!this.owned || !this.counts[state]) return null;
    for (const t of this.tiles) {
      if (t.state !== state) continue;
      const dx = t.x - x, dz = t.z - z;
      const d = Math.hypot(dx, dz);
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - heading));
      const v = d + ang * 2.2 + (d < 0.6 ? 50 : 0);
      if (v < bv) { bv = v; best = t; }
    }
    return best ? { t: best, v: bv } : null;
  }
  nearest(state, x, z, heading) { return this.nearestScored(state, x, z, heading)?.t || null; }

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
  /** 저장 · 네트워크용 */
  state() { return { id: this.id, crop: this.crop, owned: this.owned, s: this.serialize() }; }
  applyState(o) {
    if (!o) return;
    if (o.crop && o.crop !== this.crop && CROPS[o.crop]) { this.crop = o.crop; this.buildSoil(); this.buildCrop(); }
    if (typeof o.owned === 'boolean') this.owned = o.owned || this.id === 'main';
    this.applyOwned();
    this.deserialize(o.s);
  }
}

// ---------------- 여러 밭 ----------------
export function initFields(scene) {
  G.fields = [
    new Field(scene, { id: 'main', name: '목초지', ...LAYOUT.field, crop: 'grass', owned: true }),
    ...LAYOUT.plots.map((p) => new Field(scene, { ...p, crop: p.crop || 'corn', owned: false })),
  ];
  G.field = G.fields[0];
}
/** 그 자리에 있는 (산) 밭 */
export function fieldAt(x, z, m = 0) {
  for (const f of G.fields) if (f.inside(x, z, m)) return f;
  return null;
}
export const ownedFields = () => G.fields.filter((f) => f.owned);
export function updateFields(dt) { for (const f of G.fields) f.update(dt); }
export function fieldsState() { return G.fields.map((f) => f.state()); }
export function applyFieldsState(list) {
  if (!Array.isArray(list)) return;
  for (const o of list) G.fields.find((f) => f.id === o?.id)?.applyState(o);
}
/** 작물별 다 자란·벤 칸 합계 */
export function cropCounts() {
  const out = {};
  for (const f of G.fields) {
    if (!f.owned) continue;
    const c = (out[f.crop] ||= { tall: 0, cut: 0, grow: 0 });
    c.tall += f.counts.tall; c.cut += f.counts.cut; c.grow += f.counts.grow;
  }
  return out;
}
