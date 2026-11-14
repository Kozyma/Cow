// 건초/팔레트 아이템, 출하장 · 트럭 적재 · 판매, 바닥 분뇨 더미
import * as THREE from 'three';
import { G, LAYOUT, PRODUCTS, BALE_FEED, COMPOST, TRUCK_BULK_CAP, INGREDIENTS, baleKind } from './state.js';
import { fieldAt } from './field.js';
import { inStation, freeStationSlot, setOnStation } from './feed.js';
import { shedAt } from './compost.js';
import { makeBale, makePallet } from './models.js';
import { mat } from './materials.js';
import { easeOutBack, rand, sphere, clamp } from './util.js';
import { blockedAt } from './physics.js';
import { burst, spawn } from './particles.js';
import { toast, floatText, flashCoins } from './ui.js';
import { sfx } from './audio.js';

let nextId = 1;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Item {
  constructor(kind, product = null) {
    this.id = nextId++;
    this.kind = kind;
    this.product = product;
    this.mesh = kind === 'bale' ? makeBale(product) : makePallet(product);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.carriedBy = null;
    this.reservedBy = null;
    this.barn = null;
    this.support = { kind: 'ground' };
    this.unreachable = 0;
    this.removed = false;
    this.pop = 0;
    this.fly = null;
    G.scene.add(this.mesh);
    G.items.push(this);
  }
  get baseY() { return this.pos.y; }
  placeAt(x, z, heading = 0) {
    G.scene.add(this.mesh);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.set(0, heading, 0);
    this.heading = heading;
    this.carriedBy = null;
    this.support = { kind: 'ground' };
    this.pos.set(x, 0, z);
  }
  remove() {
    this.removed = true;
    this.mesh.parent?.remove(this.mesh);
    const i = G.items.indexOf(this);
    if (i >= 0) G.items.splice(i, 1);
    detachFromBarn(this);
  }
}

export function detachFromBarn(it) {
  if (it.barn) {
    const j = it.barn.pallets.indexOf(it);
    if (j >= 0) it.barn.pallets.splice(j, 1);
    it.barn = null;
  }
}

export function spawnBale(x, z, heading, product = null) {
  const it = new Item('bale', product);
  it.placeAt(x, z, heading);
  it.pop = 0.001;
  G.stats.bales++;
  return it;
}

export function baleCount() {
  let n = 0;
  for (const it of G.items) if (it.kind === 'bale') n++;
  return n;
}

export function updateItems(dt) {
  for (const it of G.items) {
    if (it.pop > 0 && it.pop < 1) {
      it.pop = Math.min(1, it.pop + dt * 2.5);
      it.mesh.scale.setScalar(Math.max(0.01, easeOutBack(it.pop)));
    }
    if (it.fly) {
      const f = it.fly;
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      f.anchor.updateWorldMatrix(true, false);
      _v.set(f.local.x, 0, f.local.z).applyMatrix4(f.anchor.matrixWorld);
      it.mesh.position.lerpVectors(f.from, _v, t);
      it.mesh.position.y += Math.sin(t * Math.PI) * 2.0;
      if (t >= 1) {
        f.anchor.add(it.mesh);
        it.mesh.position.set(f.local.x, 0, f.local.z);
        it.mesh.rotation.set(0, f.local.ry ?? Math.PI / 2, 0);
        it.fly = null;
        sfx('drop');
      }
    }
    if (it.mesh.parent && it.mesh.parent !== G.scene) it.mesh.getWorldPosition(it.pos);
    else it.pos.copy(it.mesh.position);
  }
  for (const m of G.muck) {
    const s = Math.sqrt(m.amount / 10);
    m.mesh.scale.set(0.5 + s, 0.25 + s * 0.6, 0.5 + s);
  }
}

// ---------------- 영역 판정 ----------------
export function inYard(x, z) {
  const y = LAYOUT.yard;
  return Math.abs(x - y.x) < 4.3 && Math.abs(z - y.z) < 3.3;
}
export function yardSlots() {
  const y = LAYOUT.yard, out = [];
  for (let r = 0; r < y.rows; r++) for (let c = 0; c < y.cols; c++) {
    out.push({ i: r * y.cols + c, x: y.x + (c - (y.cols - 1) / 2) * y.gap, z: y.z + (r - (y.rows - 1) / 2) * y.gap });
  }
  return out;
}
export function freeYardSlot(self = null) {
  for (const s of yardSlots()) {
    let used = false;
    for (const it of G.items) {
      if (it.carriedBy || it.support.kind !== 'ground') continue;
      if (Math.hypot(it.pos.x - s.x, it.pos.z - s.z) < 1.0) { used = true; break; }
    }
    if (!used) for (const v of G.vehicles) if (v !== self && v.ai.task?.slot === 'y' + s.i) { used = true; break; }
    if (!used) return s;
  }
  return null;
}

export function inDock(x, z, m = 0) {
  const d = LAYOUT.dock;
  return Math.abs(x - d.x) < d.w / 2 + m && Math.abs(z - d.z) < d.d / 2 + m;
}
export function dockSlots() {
  const d = LAYOUT.dock, out = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push({ i: r * 3 + c, x: d.x + (c - 1) * 2.8, z: d.z + (r - 0.5) * 2.6 });
  return out;
}
export function dockItems() {
  return G.items.filter((it) => it.support.kind === 'dock' && !it.carriedBy && !it.fly);
}
export function freeDockSlot(self = null, nearX = null, nearZ = null) {
  let best = null, bd = Infinity;
  for (const s of dockSlots()) {
    if (G.items.some((it) => it.support.kind === 'dock' && it.support.slot === s.i && !it.carriedBy)) continue;
    if (G.vehicles.some((v) => v !== self && v.ai.task?.slot === 'd' + s.i)) continue;
    const d = nearX == null ? s.i : Math.hypot(s.x - nearX, s.z - nearZ);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
export function nearMarket(p, extra = 0) {
  const m = LAYOUT.market;
  return Math.hypot(p.x - m.x, p.z - m.z) < m.r + extra;
}
export function barnAlleyAt(x, z) {
  return G.barns.find((b) => x > b.alley.minX && x < b.alley.maxX && z > b.alley.minZ && z < b.alley.maxZ) || null;
}

// ---------------- 판매 ----------------
export function itemPrice(it) {
  if (it.kind === 'sack') return Math.round(INGREDIENTS[it.product].price * 0.6);
  return it.kind === 'bale' ? baleKind(it).price : Math.round(PRODUCTS[it.product].price * (G.prices[it.product] ?? 1) * (it.dmg ? 0.6 : 1));
}
export function sellItems(list, at) {
  let total = 0, pallets = 0;
  for (const it of list) {
    total += itemPrice(it);
    if (it.kind === 'pallet') pallets++;
    it.remove();
  }
  if (!total) return 0;
  G.coins += total;
  G.stats.earned += total;
  G.stats.shipped += pallets;
  floatText(at.x, 3.5, at.z, `+${total}🪙`, 'coin');
  for (let i = 0; i < Math.min(12, 4 + list.length * 2); i++) spawn('coin', at.x + rand(-1.2, 1.2), 2, at.z + rand(-1.2, 1.2), { vy: rand(2, 4), grav: 4, life: 1.2, vx: rand(-1, 1), vz: rand(-1, 1) });
  sfx('coin');
  flashCoins();
  toast(`판매소에서 ${list.length}개 판매! +${total}🪙`, '🏪');
  return total;
}

// ---------------- 놓기 / 들기 ----------------
export function setOnDock(it, slot) {
  it.placeAt(slot.x, slot.z, Math.PI / 2);
  it.support = { kind: 'dock', slot: slot.i };
}

export function setOnTruck(it, truck, slotIndex, animate = false) {
  detachFromBarn(it);
  it.carriedBy = null;
  it.reservedBy = null;
  const s = truck.m.slots[slotIndex];
  it.support = { kind: 'truck', truck, slot: slotIndex };
  if (animate) {
    G.scene.add(it.mesh);
    it.mesh.position.copy(it.pos);
    it.fly = { from: it.pos.clone(), anchor: truck.m.bed, local: s, t: 0, dur: 0.55 };
  } else {
    truck.m.bed.add(it.mesh);
    it.mesh.position.set(s.x, 0, s.z);
    it.mesh.rotation.set(0, s.ry ?? Math.PI / 2, 0);
  }
}

export function truckCargo(truck) {
  return G.items.filter((it) => it.support.kind === 'truck' && it.support.truck === truck);
}
export function freeTruckSlot(truck) {
  const used = new Set(truckCargo(truck).map((it) => it.support.slot));
  for (let i = 0; i < truck.m.slots.length; i++) if (!used.has(i)) return i;
  return -1;
}

export function pickupItem(v, it) {
  detachFromBarn(it);
  it.reservedBy = null;
  it.carriedBy = v;
  it.fly = null;
  it.support = { kind: 'carried' };
  v.carrying = it;
  v.m.carry.add(it.mesh);
  it.mesh.position.set(0, 0, 0);
  it.mesh.rotation.set(0, 0, 0);
  it.mesh.scale.setScalar(1);
  it.pop = 0;
  sfx('pickup');
}

/** 들고 있는 아이템이 놓일 수 있는 받침 높이 (트럭 적재함 or 바닥) */
export function supportUnder(x, z, self, pad = 0.2) {
  for (const t of G.vehicles) {
    if (!t.m.slots || t === self) continue;
    if (t.def.dump && t.lift > 0.05) continue;
    if (t.type === 'balewagon' && t.tilt > 0.05) continue;
    const local = t.m.bed.worldToLocal(_v.set(x, 1, z));
    const cz = t.m.bedCenterZ ?? 0;
    if (Math.abs(local.x) < t.m.bedHalf.x + pad && Math.abs(local.z - cz) < t.m.bedHalf.z + pad) {
      t.m.bed.getWorldPosition(_v);
      return { kind: 'truck', truck: t, y: _v.y, x, z };
    }
  }
  return { kind: 'ground', y: 0, x, z };
}

/**
 * 들고 있던 아이템을 내려놓는다. 놓은 위치에 따라
 * 축사 통로 → 사료 / 판매소 → 판매 / 출하장 → 칸에 정리 / 트럭 → 적재 / 그 외 → 바닥
 */
export function releaseCarried(v, sp = null) {
  const it = v.carrying;
  if (!it || it.kind === 'manure') return false;
  it.mesh.getWorldPosition(_v);
  const x = _v.x, z = _v.z;
  sp = sp || supportUnder(x, z, v);
  const manual = !!v.driver;
  v.lastDrop = it;
  v.lastDropT = G.now;
  if (sp.kind === 'truck') {
    const slot = freeTruckSlot(sp.truck);
    if (slot < 0) { if (manual) toast('적재함이 가득 찼어요', '🚚'); return false; }
    v.carrying = null;
    setOnTruck(it, sp.truck, slot);
    burst('dust', x, sp.y + 0.3, z, 4, { vy: 1, grav: 0, life: 0.5, spread: 0.3 });
    sfx('drop');
    if (manual) floatText(x, sp.y + 1.5, z, `적재 ${truckCargo(sp.truck).length}/${sp.truck.m.slots.length}`, 'good');
    return true;
  }
  if (it.kind === 'bale') {
    const barn = barnAlleyAt(x, z);
    if (barn) {
      if (barn.feed > 100 - BALE_FEED * 0.6) {
        if (manual) toast(`${barn.name} 사료가 이미 넉넉해요!`, '🌾');
        return false;
      }
      const bk = baleKind(it);
      barn.addFeed(bk.feed, null);
      burst('hay', x, 0.8, z, 18, { vy: 3.5 });
      floatText(x, 2.2, z, `+사료 ${bk.icon}`, 'good');
      sfx('pop');
      v.carrying = null;
      v.ai.forBarn = null;
      it.remove();
      return true;
    }
  }
  if (nearMarket({ x, z }, 1)) {
    v.carrying = null;
    sellItems([it], LAYOUT.market);
    return true;
  }
  if ((it.kind === 'sack' || it.kind === 'bale') && inStation(x, z, 1)) {
    const slot = freeStationSlot(v, x, z);
    if (slot) {
      v.carrying = null;
      setOnStation(it, slot);
      sfx('drop');
      if (manual) floatText(slot.x, 1.8, slot.z, '배합장 보관 🌽', 'good');
      return true;
    }
  }
  if (inDock(x, z, 1)) {
    const slot = freeDockSlot(v, x, z);
    if (slot) {
      v.carrying = null;
      setOnDock(it, slot);
      sfx('drop');
      if (manual) floatText(slot.x, 1.8, slot.z, '출하 대기 📦', 'good');
      return true;
    }
  }
  if (blockedAt(x, z, 0.5, false)) {
    if (manual) toast('여기에는 내려놓을 수 없어요', '📦');
    return false;
  }
  v.carrying = null;
  it.placeAt(x, z, v.heading);
  burst('dust', x, 0.2, z, 4, { vy: 1, grav: 0, life: 0.6, spread: 0.3 });
  sfx('drop');
  return true;
}

/** 포크/버킷 앞쪽 영역에 있는 아이템 */
export function itemInFront(v, along0, along1, lat, liftY = null, tol = 0.35) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let best = null, bd = Infinity;
  for (const it of G.items) {
    if (it.carriedBy || it.fly || !v.def.carries.includes(it.kind)) continue;
    if (it.support.kind === 'truck' && it.support.truck === v) continue;
    if (it.reservedBy && it.reservedBy !== v) continue;
    const dx = it.pos.x - v.pos.x, dz = it.pos.z - v.pos.z;
    const a = dx * fx + dz * fz;
    const l = Math.abs(dx * fz - dz * fx);
    if (a < along0 || a > along1 || l > lat) continue;
    if (liftY != null && Math.abs(it.pos.y - liftY) > tol) continue;
    const d = Math.abs(a - (along0 + along1) / 2) + l;
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

// ---------------- 분뇨 · 퇴비 ----------------
export function addMuck(x, z, amount) {
  let p = G.muck.find((m) => Math.hypot(m.x - x, m.z - z) < 1.6);
  if (!p) {
    const mesh = new THREE.Mesh(sphere(0.9, 12, 8), mat(0x8b6a4f));
    mesh.position.set(x, 0.05, z);
    mesh.castShadow = true;
    G.scene.add(mesh);
    p = { x, z, amount: 0, mesh };
    G.muck.push(p);
  }
  p.amount += amount;
  burst('muck', x, 0.8, z, 8, { vy: 2.5 });
}

/**
 * 버킷으로 퍼담기. kind가 정해져 있으면 같은 종류만 담는다.
 * 퇴비사 퇴비칸 → 퇴비, 축사 바닥 · 쏟아진 더미 → 분뇨
 * @returns {{got:number, kind:string|null}}
 */
export function takeBulk(x, z, r, max, kind = null) {
  const sa = shedAt(x, z, 0.3);
  if (sa && sa.zone === 'compost' && kind !== 'manure') {
    const t = Math.min(sa.shed.compost, max);
    if (t > 0.01) {
      sa.shed.compost -= t;
      burst('muck', sa.shed.compostPos.x, 1, sa.shed.compostPos.z, 5, { vy: 2.5 });
      return { got: t, kind: 'compost' };
    }
    return { got: 0, kind };
  }
  if (kind === 'compost') return { got: 0, kind };
  let got = 0;
  for (const b of G.barns) {
    if (max - got <= 0) break;
    got += b.takeManure(x, z, r, max - got);
  }
  for (let i = G.muck.length - 1; i >= 0 && got < max; i--) {
    const m = G.muck[i];
    if (Math.hypot(m.x - x, m.z - z) > r + 0.6) continue;
    const t = Math.min(m.amount, max - got);
    m.amount -= t;
    got += t;
    if (m.amount <= 0.05) { G.scene.remove(m.mesh); G.muck.splice(i, 1); }
  }
  return { got, kind: got > 0 ? 'manure' : kind };
}

/** 퍼담을 게 있는지만 확인 */
export function hasBulkNear(x, z, r) {
  const sa = shedAt(x, z, 0.3);
  if (sa) return sa.zone === 'compost' ? sa.shed.compost > 0.5 : false;
  for (const b of G.barns) if (b.contains(x, z, 1)) for (const c of b.cells) if (c.amt > 0.3 && Math.hypot(c.x - x, c.z - z) < r) return true;
  return G.muck.some((m) => Math.hypot(m.x - x, m.z - z) < r + 0.6);
}

/**
 * 버킷/적재함에서 쏟은 분뇨·퇴비 처리.
 * 퇴비사 → 저장, 목초지(퇴비) → 거름 효과, 트럭 적재함 → 적재, 그 외 → 바닥에 쏟아짐
 * @returns 처리된 양
 */
export function depositBulk(kind, amount, x, z, opts = {}) {
  const manual = opts.manual;
  if (opts.truck) {
    const t = opts.truck;
    if (t.bulk > 0.01 && t.bulkKind !== kind) {
      if (manual) toast(kind === 'compost' ? '분뇨가 실린 트럭에는 퇴비를 섞을 수 없어요' : '퇴비가 실린 트럭에는 분뇨를 섞을 수 없어요', '🚚');
      addMuck(x, z, amount);
      return amount;
    }
    if (truckCargo(t).length) {
      if (manual) toast('적재함에 짐이 있어서 쏟을 수 없어요', '🚚');
      addMuck(x, z, amount);
      return amount;
    }
    const cap = TRUCK_BULK_CAP[t.type];
    const add = Math.min(amount, cap - t.bulk);
    t.bulk += add;
    t.bulkKind = kind;
    burst('muck', x, opts.y ?? 2, z, 10, { vy: 1.5 });
    sfx('dump');
    if (manual) floatText(x, (opts.y ?? 2) + 1, z, `${kind === 'compost' ? '퇴비' : '분뇨'} 적재 ${Math.round((t.bulk / cap) * 100)}%`, 'good');
    if (add < amount) addMuck(x, z, amount - add);
    return amount;
  }
  const sa = shedAt(x, z, opts.pad ?? 0.6);
  if (sa) {
    const s = sa.shed;
    if (kind === 'manure') {
      const add = s.addRaw(amount);
      sfx('dump');
      if (manual) floatText(s.rawPos.x, 2.6, s.rawPos.z, `분뇨 저장 +${Math.round(add)} · 발효 중 ♨️`, 'good');
      if (add < amount) addMuck(x, z, amount - add);
      return amount;
    }
    const add = Math.min(amount, COMPOST.cap - s.compost);
    s.compost += add;
    sfx('dump');
    if (add < amount) addMuck(x, z, amount - add);
    return amount;
  }
  if (kind === 'compost' && fieldAt(x, z, 1)) {
    spreadCompost(amount, x, z);
    return amount;
  }
  addMuck(x, z, amount);
  sfx('dump');
  if (manual) toast(kind === 'compost' ? '퇴비를 바닥에 쏟았어요 (밭에 뿌리면 거름이 돼요)' : '분뇨는 축사 뒤 퇴비사에 쏟아주세요', '💩');
  return amount;
}

export function spreadCompost(amount, x, z) {
  G.fertileTimer = Math.min(300, G.fertileTimer + amount * 2.4);
  for (let i = 0; i < 16; i++) spawn('muck', x + rand(-3, 3), 0.6, z + rand(-3, 3), { vy: rand(1.5, 3), grav: 9, life: 0.9 });
  floatText(x, 2.5, z, `🌱 퇴비 살포! 성장촉진 +${Math.round(amount * 2.4)}s`, 'good');
  sfx('dump');
}

export function sellCompost(amount, at) {
  const coins = Math.round(amount * COMPOST.price);
  G.coins += coins;
  G.stats.earned += coins;
  floatText(at.x, 3.5, at.z, `+${coins}🪙 · 퇴비`, 'coin');
  for (let i = 0; i < 6; i++) spawn('coin', at.x + rand(-1, 1), 2, at.z + rand(-1, 1), { vy: rand(2, 4), grav: 4, life: 1.2, vx: rand(-1, 1), vz: rand(-1, 1) });
  sfx('coin');
  flashCoins();
  toast(`퇴비 ${Math.round(amount)}포 판매! +${coins}🪙`, '♻️');
  return coins;
}
