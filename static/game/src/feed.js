// 사료 배합: 배합장(원료 보관) · 사료 가게 · 배합 레시피
import * as THREE from 'three';
import { G, LAYOUT, INGREDIENTS, RECIPES, MIX_UNIT_FEED, MIXER_CAP } from './state.js';
import { mat, glow } from './materials.js';
import { part, group, sbox, box, rbox, sphere, cyl, rand, pick } from './util.js';
import { addBox, addCircle, setOwner, removeColliders } from './physics.js';
import { zoneRing } from './buildings.js';
import { burst, spawn } from './particles.js';

// ---------------- 건물 ----------------
export const STATION_OWNER = { name: 'station' };
let stationRoot = null;

export function buildStation(scene) {
  const S = LAYOUT.station;
  setOwner(STATION_OWNER);
  const root = group(scene);
  stationRoot = root;
  const g = group(root, S.x, 0, S.z);
  const wood = mat(0xd9a066), woodD = mat(0xb07a4f), roof = mat(0x9b8cff), white = mat(0xfffaf0);
  const pave = new THREE.PlaneGeometry(14, 13, 5, 5);
  pave.rotateX(-Math.PI / 2);
  const pm = new THREE.Mesh(pave, mat(0xeadbb8));
  pm.position.set(S.x, 0.026, S.z + 3); pm.receiveShadow = true; root.add(pm);
  const floor = new THREE.PlaneGeometry(S.w + 1, S.d + 1, 4, 3);
  floor.rotateX(-Math.PI / 2);
  const fm = new THREE.Mesh(floor, mat(0xe2dccd));
  fm.position.y = 0.045; fm.receiveShadow = true; g.add(fm);
  part(g, sbox(S.w, 1.4, 0.3), wood, 0, 0.7, -S.d / 2);
  for (const s of [-1, 1]) part(g, sbox(0.3, 1.4, S.d), wood, (s * S.w) / 2, 0.7, 0);
  for (let i = 0; i < 3; i++) part(g, sbox(S.w + 0.02, 0.05, 0.32), woodD, 0, 0.3 + i * 0.4, -S.d / 2);
  addBox(S.x - S.w / 2 - 0.2, S.x + S.w / 2 + 0.2, S.z - S.d / 2 - 0.2, S.z - S.d / 2 + 0.2);
  for (const s of [-1, 1]) addBox(S.x + (s * S.w) / 2 - 0.2, S.x + (s * S.w) / 2 + 0.2, S.z - S.d / 2, S.z + S.d / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, cyl(0.13, 0.13, 3.9, 8), woodD, (sx * S.w) / 2, 1.95, (sz * S.d) / 2);
  part(g, sbox(S.w + 1.2, 0.2, S.d + 1.4), roof, 0, 4.0, 0, 0.1, 0, 0);
  for (let i = 0; i < 6; i++) part(g, sbox((S.w + 1.2) / 6 - 0.05, 0.22, 0.35), i % 2 ? white : mat(0xc9a7ff), -(S.w + 1.2) / 2 + (i + 0.5) * ((S.w + 1.2) / 6), 3.75, S.d / 2 + 0.75, 0.1, 0, 0);
  for (const s of stationSlots()) {
    const r = new THREE.RingGeometry(0.75, 0.85, 4, 1, Math.PI / 4);
    r.rotateX(-Math.PI / 2);
    part(root, r, mat(0x9b8cff), s.x, 0.06, s.z, 0, 0, 0, 1.3, 1, 1.1).castShadow = false;
  }
  const sx = S.x + S.w / 2 + 2.2, sz = S.z - 1.5;
  part(root, cyl(1.0, 1.0, 4.6, 18), mat(0xe3ebf3), sx, 2.3, sz);
  part(root, new THREE.SphereGeometry(1.05, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9b8cff), sx, 4.6, sz);
  part(root, cone(0.6, 0.8, 12), mat(0xb8c4d4), sx, 0.4, sz, Math.PI, 0, 0);
  addCircle(sx, sz, 1.1);
  zoneRing(root, S.bay.x, S.bay.z, 3.2, 0x9b8cff);
  setOwner(null);
}

export function stationFootprint(x = LAYOUT.station.x, z = LAYOUT.station.z) {
  const S = LAYOUT.station;
  return { minX: x - S.w / 2 - 1, maxX: x + S.w / 2 + 3.8, minZ: z - S.d / 2 - 1, maxZ: z + 10.5 };
}

/** 배합장 옮기기 (보관 중인 원료도 함께) */
export function relocateStation(x, z) {
  const S = LAYOUT.station;
  const stored = G.items.filter((it) => it.support.kind === 'station');
  G.scene.remove(stationRoot);
  removeColliders(STATION_OWNER);
  S.x = x; S.z = z; S.bay.x = x; S.bay.z = z + 7.5;
  buildStation(G.scene);
  const slots = stationSlots();
  for (const it of stored) setOnStation(it, slots[it.support.slot]);
}

const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s);

export function buildStore(scene) {
  const m = LAYOUT.store;
  const x = m.x - 7, z = m.z;
  const g = group(scene, x, 0, z);
  const wall = mat(0xfff1d6), roofM = mat(0xffb84d), white = mat(0xfffaf0);
  part(g, rbox(6, 3.4, 8, 0.2), wall, 0, 1.7, 0);
  part(g, sbox(7.2, 0.25, 9.2), roofM, 0, 3.6, 0, 0, 0, 0.12);
  part(g, sbox(0.5, 1.2, 9.2), roofM, -0.2, 4.1, 0, 0, 0, 0.12);
  for (let i = 0; i < 7; i++) part(g, box(1.1, 0.12, 1.3), i % 2 ? white : mat(0xffb84d), 3.6, 2.9, -3.3 + i * 1.1, 0, 0, 0.35);
  // 진열된 포대
  for (let i = 0; i < 5; i++) {
    part(g, rbox(0.6, 0.35, 0.45, 0.12), mat(i % 2 ? 0xf6d58a : 0xece0c4), 3.4, 0.2, -2.4 + i * 1.2);
    part(g, rbox(0.55, 0.32, 0.42, 0.11), mat(i % 2 ? 0xece0c4 : 0xf6d58a), 3.4, 0.52, -2.4 + i * 1.2 + 0.1);
  }
  for (let i = 0; i < 4; i++) part(g, capsule(0.12, 0.35), mat(0xffc83d), 3.3, 1.2, -1.8 + i * 1.2, Math.PI / 2, 0, 0.3);
  // 간판 (옥수수)
  part(g, cyl(0.7, 0.7, 0.12, 20), white, 3.05, 2.4, 0, 0, 0, Math.PI / 2);
  part(g, capsule(0.2, 0.5), mat(0xffc83d), 3.15, 2.4, 0, 0, 0, 0.5);
  addBox(x - 3.1, x + 3.1, z - 4.1, z + 4.1);
  zoneRing(scene, m.x, m.z, m.r, 0xffb84d);
}
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 8);

// ---------------- 배합장 원료 칸 ----------------
export function stationSlots() {
  const S = LAYOUT.station, out = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push({ i: r * 3 + c, x: S.x + (c - 1) * 3.0, z: S.z - 1.3 + r * 2.5 });
  return out;
}
export function inStation(x, z, m = 0) {
  const S = LAYOUT.station;
  return Math.abs(x - S.x) < S.w / 2 + m && Math.abs(z - S.z) < S.d / 2 + m;
}
export function stationItems(product = null) {
  return G.items.filter((it) => it.support.kind === 'station' && !it.carriedBy && !it.fly && (!product || (product === 'hay' ? it.kind === 'bale' : it.product === product)));
}
export function freeStationSlot(self = null, nearX = null, nearZ = null) {
  let best = null, bd = Infinity;
  for (const s of stationSlots()) {
    if (G.items.some((it) => it.support.kind === 'station' && it.support.slot === s.i && !it.carriedBy)) continue;
    if (G.vehicles.some((v) => v !== self && v.ai.task?.slot === 's' + s.i)) continue;
    const d = nearX == null ? s.i : Math.hypot(s.x - nearX, s.z - nearZ);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
export function setOnStation(it, slot) {
  it.placeAt(slot.x, slot.z, Math.PI / 2);
  it.support = { kind: 'station', slot: slot.i };
}

/** 배합기에 넣을 수 있는 원료 재고 */
function hayCandidates() {
  const b = LAYOUT.station.bay;
  return G.items.filter((it) => it.kind === 'bale' && !it.carriedBy && !it.fly && !it.reservedBy && (it.support.kind === 'station' || (it.support.kind === 'ground' && Math.hypot(it.pos.x - b.x, it.pos.z - b.z) < 26)));
}
export function stock() {
  return { hay: hayCandidates().length, corn: stationItems('corn').length, soy: stationItems('soy').length };
}

/** 원료 하나를 꺼내 배합기에 넣는다 */
export function loadIngredient(mixer, kind) {
  const total = mixTotal(mixer);
  if (total >= MIXER_CAP) return 'full';
  let it = null;
  if (kind === 'hay') {
    const list = hayCandidates();
    let bd = Infinity;
    for (const c of list) { const d = Math.hypot(c.pos.x - mixer.pos.x, c.pos.z - mixer.pos.z); if (d < bd) { bd = d; it = c; } }
  } else {
    it = stationItems(kind)[0];
  }
  if (!it) return 'none';
  const from = it.pos.clone();
  it.remove();
  mixer.mix[kind]++;
  mixer.mixT = Math.min(mixer.mixT, 1.5);
  const c = INGREDIENTS[kind].color;
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    spawn(kind === 'hay' ? 'hay' : 'muck', from.x + (mixer.pos.x - from.x) * t, 1.2 + Math.sin(t * Math.PI) * 2.5, from.z + (mixer.pos.z - from.z) * t, { vy: 1, grav: 4, life: 0.4 + t * 0.4 });
  }
  burst('hay', mixer.pos.x, 2.8, mixer.pos.z, 8, { vy: 2.5 });
  return 'ok';
}

// ---------------- 레시피 ----------------
export const mixTotal = (v) => v.mix.hay + v.mix.corn + v.mix.soy;

/** 현재 배합이 어떤 동물용인지 판정 */
export function recipeOf(mix) {
  const total = mix.hay + mix.corn + mix.soy;
  if (!total) return null;
  for (const [animal, r] of Object.entries(RECIPES)) {
    const rt = r.hay + r.corn + r.soy;
    if (total % rt) continue;
    const k = total / rt;
    if (mix.hay === r.hay * k && mix.corn === r.corn * k && mix.soy === r.soy * k) return animal;
  }
  return null;
}

/** 목표 동물 레시피를 채우는 다음 원료 (AI·간편 모드용) */
export function planRecipe(animal, mix, st, maxUnits = MIXER_CAP) {
  const r = RECIPES[animal];
  const rt = r.hay + r.corn + r.soy;
  const kMax = Math.max(1, Math.floor(Math.min(MIXER_CAP, maxUnits) / rt));
  for (let k = kMax; k >= 1; k--) {
    const need = { hay: r.hay * k - mix.hay, corn: r.corn * k - mix.corn, soy: r.soy * k - mix.soy };
    if (need.hay < 0 || need.corn < 0 || need.soy < 0) continue;
    if (need.hay <= st.hay && need.corn <= st.corn && need.soy <= st.soy) return need;
  }
  return null;
}

export const mixFeedAmount = (v) => mixTotal(v) * MIX_UNIT_FEED;
