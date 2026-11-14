// 실제 크기 축사(통로·우리·바닥 분뇨)와 동물 행동
import * as THREE from 'three';
import { G, BARN_DEFS, ANIMAL_DEFS, PRODUCTS, MANURE_RATE } from './state.js';
import { makeCow, makePig, makeChicken } from './models.js';
import { mat } from './materials.js';
import { rand, clamp, damp, dampAngle, wrapAngle, sphere } from './util.js';
import { buildBigBarn } from './buildings.js';
import { setOwner, removeColliders } from './physics.js';
import { Shed } from './compost.js';
import { Item } from './items.js';
import { emote, burst } from './particles.js';
import { toast, floatText } from './ui.js';
import { sfx } from './audio.js';
import { mergeStatic } from './merge.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

let barnUid = 0;

export class Barn {
  constructor(def, scene, cx = def.cx, front = def.front, opts = {}) {
    Object.assign(this, { def, id: def.id, name: def.name, icon: def.icon, animalType: def.animal, product: def.product });
    this.uid = ++barnUid;
    this.scene = scene;
    this.capacity = def.cap;
    this.expansions = 0;
    this.feed = 70;
    this.happiness = 0.8;
    this.buffer = 0;
    this.petBonus = 0;
    this.boostT = 0;        // 맞춤 배합사료 효과 남은 시간(초)
    this.animals = [];
    this.pallets = [];
    this.warnT = { feed: 0, manure: 0, full: 0 };
    this.layout(cx, front);
    this.build();
    const n = opts.animals ?? def.start;
    for (let i = 0; i < n; i++) this.addAnimal(false);
    if (opts.manure !== false) this.addManure(12);
    this.updateVisuals();
  }

  /** 위치에서 통로 · 우리 · 분뇨 칸 등 좌표 계산 */
  layout(cx, front) {
    const def = this.def;
    this.cx = cx;
    this.front = front;
    this.back = front - def.len;
    this.minX = cx - def.width / 2;
    this.maxX = cx + def.width / 2;
    this.alley = { minX: cx - 3.1, maxX: cx + 3.1, minZ: this.back + 0.5, maxZ: this.front + 0.5 };
    this.pens = [-1, 1].map((side) => {
      const fenceX = cx + side * 3.3;
      const minX = side < 0 ? this.minX + 0.2 : fenceX + 0.15;
      const maxX = side < 0 ? fenceX - 0.15 : this.maxX - 0.2;
      const w = maxX - minX;
      return { side, fenceX, minX, maxX, minZ: this.back + 0.2, maxZ: this.front - 0.2, gate: (minX + maxX) / 2, gateW: Math.min(6, w - 2) };
    });
    this.dropPos = { x: cx, z: this.front - 7 };
    this.palletSlots = [0, 1, 2].map((i) => ({ x: this.maxX + 3.2, z: this.front - 3 - i * 2.6 }));
    this.labelPos = { x: cx, y: 9.4, z: this.front };
    this.cells = [];
    for (const p of this.pens) {
      const pc = (p.minX + p.maxX) / 2;
      const off = Math.min(1.6, Math.max(0.6, (p.maxX - p.minX - 3.5) / 2 - 0.3));
      for (let z = this.front - 3; z > this.back + 1.5; z -= 3) {
        for (const o of [-off, off]) this.cells.push({ x: pc + o, z, amt: 0, pen: p, rot: rand(0, 6) });
      }
    }
    this.cellMax = (100 / this.cells.length) * 2.4;
  }

  /** 배치 변경 미리보기·검사용 전체 영역 (축사 + 퇴비사 + 팔레트 자리) */
  static footprint(def, cx, front) {
    return { minX: cx - def.width / 2 - 1.5, maxX: cx + def.width / 2 + 6, minZ: front - def.len - 20, maxZ: front + 5 };
  }
  get footprint() { return Barn.footprint(this.def, this.cx, this.front); }

  build() {
    const scene = this.scene;
    setOwner(this);
    this.root = new THREE.Group();
    scene.add(this.root);
    const geo = new THREE.SphereGeometry(0.9, 10, 7);
    this.manureMesh = new THREE.InstancedMesh(geo, mat(0xffffff), this.cells.length);
    this.manureMesh.castShadow = false;
    this.manureMesh.receiveShadow = true;
    this.manureMesh.frustumCulled = false;
    const col = new THREE.Color();
    this.cells.forEach((c, i) => { col.setHex([0x8b6a4f, 0x7d5d44, 0x96755a][i % 3]); this.manureMesh.setColorAt(i, col); });
    this.root.add(this.manureMesh);
    const built = buildBigBarn(this.root, this);
    this.roof = built.roof;
    const keep = this.shed ? { raw: this.shed.raw, compost: this.shed.compost } : null;
    this.shed = new Shed(this, this.root);
    if (keep) Object.assign(this.shed, keep);
    // 최적화: 축사 건물(기둥·울타리·지붕 등) 정적 부품 합치기. 코드에서 쓰는 부품(지붕·퇴비 더미 등)은 보호
    mergeStatic(this.root, [built, this.shed, this]);
    setOwner(null);
    this.dirtyManure = true;
  }

  destroy() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    removeColliders(this);
  }

  /** 다른 곳으로 옮기기 (동물·팔레트·분뇨 상태 유지) */
  relocate(cx, front) {
    const manure = this.manure;
    this.destroy();
    this.layout(cx, front);
    this.build();
    this.addManure(manure);
    this.animals.forEach((a, i) => {
      a.pen = this.pens[i % 2];
      const p = a.randPos();
      a.pos.set(p.x, 0, p.z);
      a.state = 'idle';
    });
    this.pallets.forEach((it) => { const s = this.palletSlots[it.slot]; it.placeAt(s.x, s.z, Math.PI / 2); });
    this.updateVisuals();
  }

  get adef() { return ANIMAL_DEFS[this.animalType]; }
  get pdef() { return PRODUCTS[this.product]; }
  get manure() {
    let s = 0;
    for (const c of this.cells) s += c.amt;
    return Math.min(100, s);
  }

  /** 기본 크기 대비 비율 (확장할수록 작아짐, 최대 1) */
  get sizeScale() { return this.def.cap / Math.max(this.def.cap, this.capacity); }

  contains(x, z, m = 0) {
    return x > this.minX - m && x < this.maxX + m && z > this.back - m && z < this.front + m;
  }

  addAnimal(fx = true) {
    if (this.animals.length >= this.capacity) return false;
    const a = new Animal(this, this.pens[this.animals.length % 2]);
    this.animals.push(a);
    if (fx) {
      burst('star', a.pos.x, 1.2, a.pos.z, 10, { vy: 4 });
      emote('heart', a.pos.x, 2.2, a.pos.z);
    }
    return true;
  }

  removeAnimal() {
    const a = this.animals.pop();
    if (a) G.scene.remove(a.group);
  }

  /** 동물 근처 칸에 분뇨 쌓기 */
  addManure(amount) {
    let left = amount;
    let guard = 0;
    while (left > 0.0001 && guard++ < 12) {
      if (this.manure >= 100) return;
      let c;
      if (this.animals.length && Math.random() < 0.8) {
        const a = this.animals[Math.floor(Math.random() * this.animals.length)];
        let bd = Infinity;
        for (const k of this.cells) {
          if (k.amt >= this.cellMax) continue;
          const d = Math.hypot(k.x - a.pos.x, k.z - a.pos.z) + rand(0, 2);
          if (d < bd) { bd = d; c = k; }
        }
      }
      if (!c) c = this.cells[Math.floor(Math.random() * this.cells.length)];
      const add = Math.min(left, this.cellMax - c.amt);
      c.amt += add;
      left -= add;
    }
    this.dirtyManure = true;
  }

  takeManure(x, z, r, max) {
    if (!this.contains(x, z, 1)) return 0;
    let got = 0;
    for (const c of this.cells) {
      if (got >= max) break;
      if (c.amt <= 0 || Math.hypot(c.x - x, c.z - z) > r) continue;
      const t = Math.min(c.amt, max - got);
      c.amt -= t;
      got += t;
      burst('muck', c.x, 0.5, c.z, 3, { vy: 2.5 });
    }
    if (got) this.dirtyManure = true;
    return got;
  }

  dirtiestCell(fromX, fromZ) {
    let best = null, bv = -Infinity;
    for (const c of this.cells) {
      if (c.amt < 0.8) continue;
      const v = c.amt * 3 - Math.hypot(c.x - fromX, c.z - fromZ) * 0.15;
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }

  /** @param h 게임 시간(시간 단위) */
  update(h, dt) {
    const n = this.animals.length;
    const ad = this.adef;
    const k = this.sizeScale;   // 큰 축사는 사료통·바닥도 그만큼 커서, 가득 찬 축사 기준 비우는 속도는 같게
    const need = ad.eat * n * h * k;
    let fed = n > 0;
    if (this.feed >= need) this.feed -= need;
    else { this.feed = 0; fed = false; }
    this.addManure(ad.manure * n * h * k * MANURE_RATE);
    const manure = this.manure;
    this.petBonus = Math.max(0, this.petBonus - 0.08 * h);
    this.boostT = Math.max(0, this.boostT - dt);
    const boost = this.boostT > 0;
    const target = clamp((fed ? 0.55 : 0.12) + 0.33 * (1 - manure / 100) + this.petBonus + (boost ? 0.12 : 0), 0, 1);
    this.happiness += clamp(target - this.happiness, -0.5 * h, 0.5 * h);

    if (this.pallets.length < 3) {
      this.buffer += ad.rate * n * this.happiness * (fed ? 1 : 0.15) * (boost ? 1.4 : 1) * h;
      if (this.buffer >= this.pdef.pallet) {
        this.buffer -= this.pdef.pallet;
        this.spawnPallet();
      }
    } else {
      this.buffer = Math.min(this.buffer, this.pdef.pallet - 0.01);
    }

    for (const k in this.warnT) this.warnT[k] -= dt;
    if (n > 0 && this.feed <= 0 && this.warnT.feed <= 0) {
      this.warnT.feed = 60;
      toast(`${this.name}의 사료가 떨어졌어요! 통로에 건초를 내려주세요`, '🌾');
      sfx('alert');
    }
    if (manure >= 80 && this.warnT.manure <= 0) {
      this.warnT.manure = 60;
      toast(`${this.name} 바닥이 지저분해요. 스키드로더로 치워주세요`, '🧹');
      sfx('alert');
    }
    if (this.pallets.length >= 3 && this.warnT.full <= 0) {
      this.warnT.full = 60;
      toast(`${this.name} 팔레트가 가득! 출하장으로 옮겨주세요`, '📦');
    }

    for (const a of this.animals) a.update(dt);
    this.shed?.update(h, dt);
    this.visTimer = (this.visTimer ?? 0) - dt;
    if (this.visTimer <= 0) { this.visTimer = 0.25; this.updateVisuals(); }
  }

  /** 사료 넣기. recipe가 이 축사 동물용이면 생산량 보너스 */
  addFeed(amount, recipe = null) {
    const k = this.sizeScale;
    const add = Math.min(amount * k, 100 - this.feed);
    this.feed += add;
    if (recipe === this.animalType) this.boostT = Math.min(300, this.boostT + amount * 1.6);
    return add / k;   // 넣은 양 (원래 단위)
  }

  spawnPallet(quiet = false) {
    const used = new Set(this.pallets.map((p) => p.slot));
    const slot = [0, 1, 2].find((i) => !used.has(i));
    const s = this.palletSlots[slot];
    const it = new Item('pallet', this.product);
    it.placeAt(s.x, s.z, Math.PI / 2);
    it.barn = this;
    it.slot = slot;
    it.pop = 0.001;
    this.pallets.push(it);
    if (quiet) return;
    burst('star', s.x, 1, s.z, 8, { vy: 4 });
    floatText(s.x, 2.2, s.z, `${this.pdef.icon} 팔레트 완성!`, 'good');
    sfx('ding');
  }

  updateVisuals() {
    const f = this.feed / 100;
    for (const h of this.hayStrips) {
      h.visible = f > 0.01;
      h.scale.set(0.5 + f * 0.5, 0.2 + f * 1.0, 1);
    }
    if (this.dirtyManure) {
      this.dirtyManure = false;
      this.cells.forEach((c, i) => {
        const s = c.amt > 0.05 ? Math.sqrt(c.amt / this.cellMax) : 0.0001;
        _q.setFromAxisAngle(_p.set(0, 1, 0), c.rot);
        _m.compose(_p.set(c.x, 0.04, c.z), _q, _s.set(0.35 + s * 0.9, 0.12 + s * 0.4, 0.35 + s * 0.9));
        if (c.amt <= 0.05) _m.makeScale(0.0001, 0.0001, 0.0001);
        this.manureMesh.setMatrixAt(i, _m);
      });
      this.manureMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------------- 동물 ----------------
const SOUND = { cow: 'moo', hanwoo: 'moo', pig: 'oink', chicken: 'cluck' };
/** 이름 정리: 화면(HTML)에 그대로 들어가므로 꺾쇠 등 특수문자는 빼고 12자까지 */
export function cleanName(s) { return String(s ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, 12); }
export const ANIMAL_ICON = { cow: '🐮', hanwoo: '🐂', pig: '🐷', chicken: '🐔' };
/** 이름표 글자: 지어 준 이름, 없으면 '젖소 3' 처럼 */
export function animalName(a) {
  return a.name || `${ANIMAL_DEFS[a.type].name} ${a.barn.animals.indexOf(a) + 1}`;
}

export class Animal {
  constructor(barn, pen) {
    this.barn = barn;
    this.pen = pen;
    this.type = barn.animalType;
    const m = this.type === 'cow' ? makeCow(Math.random() < 0.3 ? 1 : 0) : this.type === 'hanwoo' ? makeCow(2) : this.type === 'pig' ? makePig() : makeChicken(Math.random() < 0.4);
    this.m = m;
    this.group = m.group;
    G.scene.add(this.group);
    this.group.scale.setScalar(rand(0.9, 1.06));
    const p = this.randPos();
    this.pos = new THREE.Vector3(p.x, 0, p.z);
    this.heading = rand(-Math.PI, Math.PI);
    this.state = 'idle';
    this.timer = rand(0.5, 3);
    this.target = null;
    this.next = 'idle';
    this.phase = rand(0, 10);
    this.walkAmt = 0;
    this.jumpT = 0;
    this.petCD = 0;
    this.speed = ANIMAL_DEFS[this.type].speed * rand(0.85, 1.1);
    this.emoteT = rand(6, 25);
    this.headTilt = 0;
    this.top = this.type === 'chicken' ? 1.4 : this.type === 'pig' ? 1.7 : 2.4;
    this.name = '';   // 플레이어가 지어 준 이름
    if (this.type === 'hanwoo') this.group.scale.multiplyScalar(1.08);
  }

  randPos() {
    const p = this.pen;
    return { x: rand(p.minX + 0.9, p.maxX - 0.9), z: rand(p.minZ + 1.2, p.maxZ - 2.5) };
  }

  update(dt) {
    const b = this.barn, pen = this.pen;
    this.timer -= dt;
    this.petCD -= dt;
    let moving = false;
    if (this.state === 'idle') {
      if (this.timer <= 0) {
        if (b.feed > 0 && Math.random() < 0.35) {
          this.target = { x: pen.fenceX - pen.side * 1.0, z: rand(pen.minZ + 1.5, pen.maxZ - 1.5) };
          this.next = 'eat';
        } else {
          this.target = this.randPos();
          this.next = 'idle';
        }
        this.state = 'walk';
      }
    } else if (this.state === 'walk') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.state = this.next;
        this.timer = this.next === 'eat' ? rand(4, 8) : rand(1.5, 5);
        if (this.next === 'eat') this.heading = pen.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        const want = Math.atan2(dx, dz);
        this.heading = dampAngle(this.heading, want, 6, dt);
        const sp = this.speed * Math.max(0, Math.cos(wrapAngle(want - this.heading))) * (this.fleeing ? 2 : 1);
        this.pos.x += Math.sin(this.heading) * sp * dt;
        this.pos.z += Math.cos(this.heading) * sp * dt;
        moving = true;
      }
    } else if (this.timer <= 0) {
      this.state = 'idle';
      this.timer = rand(1, 4);
    }

    // 겹침 방지 & 차량 피하기
    const min = this.type === 'chicken' ? 0.6 : 1.3;
    for (const o of b.animals) {
      if (o === this || o.pen !== pen) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) { this.pos.x += (dx / d) * (min - d) * 0.5; this.pos.z += (dz / d) * (min - d) * 0.5; }
    }
    this.fleeing = false;
    for (const v of G.vehicles) {
      if (v.airborne) continue;
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.5 && d > 1e-4) {
        if (d < v.radius + 0.7) { this.pos.x += (dx / d) * (v.radius + 0.7 - d); this.pos.z += (dz / d) * (v.radius + 0.7 - d); }
        if (Math.abs(v.speed) > 0.2 && this.state !== 'walk') {
          this.state = 'walk'; this.next = 'idle';
          this.target = { x: clamp(this.pos.x + (dx / d) * 4, pen.minX + 0.8, pen.maxX - 0.8), z: clamp(this.pos.z + (dz / d) * 4, pen.minZ + 1, pen.maxZ - 1) };
        }
        this.fleeing = true;
      }
    }
    for (const pl of G.players || [G.player]) {
      if (!pl || pl.driving || (pl === G.player && G.driving)) continue;
      const p = pl.pos;
      const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
      const d = Math.hypot(dx, dz), mn = this.type === 'chicken' ? 0.8 : 1.2;
      if (d < mn && d > 1e-4) { this.pos.x += (dx / d) * (mn - d); this.pos.z += (dz / d) * (mn - d); }
    }
    this.pos.x = clamp(this.pos.x, pen.minX + 0.5, pen.maxX - 0.5);
    this.pos.z = clamp(this.pos.z, pen.minZ + 0.6, pen.maxZ - 0.6);

    this.animate(dt, moving);

    this.emoteT -= dt;
    if (this.emoteT <= 0) {
      this.emoteT = rand(14, 32);
      if (b.happiness > 0.82) emote('heart', this.pos.x, this.top, this.pos.z);
      else if (b.happiness < 0.45) emote('drop', this.pos.x, this.top, this.pos.z);
    }
  }

  animate(dt, moving) {
    const m = this.m;
    this.walkAmt = damp(this.walkAmt, moving ? 1 : 0, 8, dt);
    const rate = this.type === 'chicken' ? 16 : 9;
    this.phase += dt * rate * (0.3 + this.walkAmt);
    const sw = Math.sin(this.phase) * this.walkAmt;
    let bob = Math.abs(Math.sin(this.phase)) * 0.06 * this.walkAmt;
    if (this.type === 'chicken') {
      bob = Math.abs(Math.sin(this.phase)) * 0.12 * this.walkAmt;
      m.legs[0].rotation.x = sw * 0.8; m.legs[1].rotation.x = -sw * 0.8;
      const flap = this.fleeing || (this.state === 'idle' && Math.sin(G.now * 1.3 + this.phase) > 0.97) ? Math.sin(G.now * 40) * 0.6 : 0;
      m.wings[0].rotation.z = -flap - 0.05; m.wings[1].rotation.z = flap + 0.05;
    } else {
      m.legs[0].rotation.x = sw * 0.5; m.legs[3].rotation.x = sw * 0.5;
      m.legs[1].rotation.x = -sw * 0.5; m.legs[2].rotation.x = -sw * 0.5;
    }
    let tilt = 0;
    if (this.state === 'eat') tilt = 0.55 + Math.sin(G.now * 9) * 0.12;
    else if (this.type === 'chicken' && this.state === 'idle') tilt = Math.max(0, Math.sin(G.now * 3 + this.phase * 3)) > 0.8 ? 0.9 : 0;
    this.headTilt = damp(this.headTilt, tilt, 10, dt);
    m.head.rotation.x = this.headTilt;
    m.head.rotation.y = this.state === 'idle' ? Math.sin(G.now * 0.7 + this.phase) * 0.3 : 0;
    if (m.tail) {
      if (this.type === 'pig') m.tail.rotation.z = Math.sin(G.now * 8 + this.phase) * 0.6;
      else m.tail.rotation.z = Math.sin(G.now * 2.5 + this.phase) * 0.35;
    }
    let jump = 0;
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      jump = Math.sin((1 - this.jumpT / 0.5) * Math.PI) * 0.45;
    }
    m.body.position.y = bob + jump;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
  }

  pet() {
    if (this.petCD > 0) return false;
    this.petCD = 2.5;
    this.jumpT = 0.5;
    const p = G.player.pos;
    this.heading = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.state = 'idle';
    this.timer = 2;
    emote('heart', this.pos.x, this.top, this.pos.z);
    if (this.name) floatText(this.pos.x, this.top + 0.6, this.pos.z, `${ANIMAL_ICON[this.type]} ${this.name}`, 'good');
    this.barn.petBonus = Math.min(0.2, this.barn.petBonus + 0.04);
    sfx(SOUND[this.type]);
    return true;
  }
}

export function createBarns(scene) {
  G.barns = BARN_DEFS.filter((d) => !d.optional).map((d) => new Barn(d, scene));
}

/** 새 축사 짓기 */
export function addBarn(defId, cx, front, opts = {}) {
  const def = BARN_DEFS.find((d) => d.id === defId);
  const b = new Barn(def, G.scene, cx, front, opts);
  G.barns.push(b);
  return b;
}
