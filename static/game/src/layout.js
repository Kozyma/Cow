// 배치 변경 모드: 축사 · 배합장 · 출하장을 마우스로 옮기고, 새 축사를 짓는다
import * as THREE from 'three';
import { G, LAYOUT, BARN_DEFS } from './state.js';
import { Barn, addBarn } from './barns.js';
import { stationFootprint, relocateStation, STATION_OWNER } from './feed.js';
import { dockFootprint, relocateDock, DOCK_OWNER, NATURE, strip } from './world.js';
import { rectBlocked, removeColliders } from './physics.js';
import { buildGrid } from './pathfinding.js';
import { INST, clearDecorIn } from './instancer.js';
import { toast, onLayoutChanged, setBuildHud } from './ui.js';
import { sfx } from './audio.js';
import { burst } from './particles.js';

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouse = new THREE.Vector2();
const hit = new THREE.Vector3();
let ghost = null, ghostInner = null, outline = null;
const B = {
  holding: null,     // { kind: 'barn'|'station'|'dock'|'newbarn', ref, def, dx, dz }
  pointer: { x: 0, z: 0 },
  valid: false,
  reason: '',
  cam: { x: 0, z: -10 },
};
export const buildState = B;

// ---------------- 구조물 목록 ----------------
function structures() {
  const list = G.barns.map((b) => ({ kind: 'barn', ref: b, rect: b.footprint, name: b.name, x: b.cx, z: b.front }));
  list.push({ kind: 'station', ref: STATION_OWNER, rect: stationFootprint(), name: '배합장', x: LAYOUT.station.x, z: LAYOUT.station.z });
  list.push({ kind: 'dock', ref: DOCK_OWNER, rect: dockFootprint(), name: '출하장', x: LAYOUT.dock.x, z: LAYOUT.dock.z });
  return list;
}

// ---------------- 주차장 (줄 단위로 넓히기) ----------------
// 한 줄 = 8칸, 깊이 9m. 처음 2줄(16칸)에서 최대 5줄(40칸)까지 남쪽으로 넓어진다.
export const PARKING = { cols: 8, x0: -28, dx: 5.5, z0: 24, dz: 9, baseRows: 2, maxRows: 5, prices: [0, 0, 3000, 5000, 8000] };
export const parkRows = () => Math.ceil(LAYOUT.parking.length / PARKING.cols);
export const maxVehicles = () => LAYOUT.parking.length;
export function parkingRect(rows = parkRows()) {
  return { minX: -31, maxX: 13, minZ: 19.5, maxZ: 19.5 + rows * PARKING.dz };
}
function rowRect(r) {
  return { minX: -31, maxX: 13, minZ: 19.5 + r * PARKING.dz, maxZ: 19.5 + (r + 1) * PARKING.dz };
}
/** 다음 줄을 넓힐 자리에 축사 · 배합장 · 출하장이 있으면 그 이름 */
export function parkingBlocker() {
  const r = rowRect(parkRows());
  for (const s of structures()) if (overlap(r, s.rect)) return s.name;
  return null;
}
/** 주차장 한 줄 추가 (바닥 깔기 · 나무 치우기 · 주차 칸 8개) */
export function addParkingRow(rebuild = true) {
  const r = parkRows();
  if (r >= PARKING.maxRows) return false;
  const rect = rowRect(r);
  clearSite(rect);
  const cz = (rect.minZ + rect.maxZ) / 2;
  strip(G.scene, -9, cz, 44, PARKING.dz + 0.4, 0xeadbb8, 0.03 + r * 0.0005, 0xd8c79c);
  for (let i = 0; i < PARKING.cols; i++) LAYOUT.parking.push({ x: PARKING.x0 + i * PARKING.dx, z: PARKING.z0 + r * PARKING.dz });
  if (rebuild) afterChange();
  return true;
}
/** 저장본 불러오기: 저장된 줄 수만큼 넓힌다 */
export function setParkingRows(n) {
  let changed = false;
  while (parkRows() < Math.min(n || 0, PARKING.maxRows)) { addParkingRow(false); changed = true; }
  return changed;
}

/** 움직일 수 없는 땅 (목초지, 주차장, 집, 판매소 등) */
function fixedRects() {
  const f = LAYOUT.field;
  return [
    { minX: f.x0 - 1, maxX: f.x0 + f.cols * f.tile + 1, minZ: f.z0 - 1, maxZ: f.z0 + f.rows * f.tile + 1, name: '목초지' },
    { ...parkingRect(), name: '주차장' },
    { minX: LAYOUT.airfield.runway.x - LAYOUT.airfield.runway.len / 2 - 12, maxX: LAYOUT.airfield.runway.x + LAYOUT.airfield.runway.len / 2 + 12, minZ: LAYOUT.airfield.runway.z - 12, maxZ: LAYOUT.airfield.runway.z + 24, name: '비행장' },
    { minX: LAYOUT.airfield.heli.x - 9, maxX: LAYOUT.airfield.heli.x + 9, minZ: LAYOUT.airfield.heli.z - 9, maxZ: LAYOUT.airfield.heli.z + 9, name: '헬기장' },
    { minX: LAYOUT.yard.x - 4.5, maxX: LAYOUT.yard.x + 4.5, minZ: LAYOUT.yard.z - 3.5, maxZ: LAYOUT.yard.z + 3.5, name: '건초 보관소' },
    { minX: LAYOUT.market.x - 6, maxX: LAYOUT.market.x + 13, minZ: LAYOUT.market.z - 6, maxZ: LAYOUT.market.z + 6, name: '판매소' },
    { minX: LAYOUT.store.x - 11, maxX: LAYOUT.store.x + 5, minZ: LAYOUT.store.z - 5, maxZ: LAYOUT.store.z + 5, name: '사료 가게' },
    { minX: LAYOUT.farmhouse.x - 6, maxX: LAYOUT.farmhouse.x + 6, minZ: LAYOUT.farmhouse.z - 4, maxZ: LAYOUT.farmhouse.z + 6, name: '집' },
  ];
}

const overlap = (a, b) => a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;

function rectFor(h, x, z) {
  if (h.kind === 'barn' || h.kind === 'newbarn') return Barn.footprint(h.def, x, z);
  if (h.kind === 'station') return stationFootprint(x, z);
  return dockFootprint(x, z);
}

function validate(h, rect) {
  const bnd = LAYOUT.bound - 1;
  if (rect.minX < -bnd || rect.maxX > bnd || rect.minZ < -bnd || rect.maxZ > bnd) return '농장 경계를 벗어나요';
  for (const r of fixedRects()) if (overlap(rect, r)) return `${r.name}와 겹쳐요`;
  for (const s of structures()) {
    if (s.ref === h.ref) continue;
    if (overlap(rect, s.rect)) return `${s.name}와 겹쳐요`;
  }
  const c = rectBlocked(rect, h.ref, 0.2);
  if (c && c.owner !== NATURE) return '다른 시설과 겹쳐요';
  for (const v of G.vehicles) {
    if (v.pos.x > rect.minX - 1 && v.pos.x < rect.maxX + 1 && v.pos.z > rect.minZ - 1 && v.pos.z < rect.maxZ + 1) {
      if (!(h.kind === 'barn' && h.ref.contains(v.pos.x, v.pos.z, 2))) return `${v.def.name}가 자리에 있어요`;
    }
  }
  return '';
}

// ---------------- 모드 진입/종료 ----------------
export function enterBuild(newDefId = null) {
  if (G.mode === 'house') return;
  G.mode = 'build';   // 배치 중에도 농장은 계속 돌아간다 (일시정지 없음)
  document.exitPointerLock?.();
  const p = G.driving ? G.driving.pos : G.player.pos;
  B.cam.x = p.x * 0.6; B.cam.z = p.z - 28;
  G.buildDist = 105;
  B.holding = null;
  if (newDefId) {
    const def = BARN_DEFS.find((d) => d.id === newDefId);
    B.holding = { kind: 'newbarn', def, ref: null, dx: 0, dz: 0, name: def.name };
  }
  ensureGhost();
  ghost.visible = outline.visible = ghostInner.visible = !!B.holding;
  setBuildHud(true, B.holding ? `${B.holding.name} 지을 자리를 고르세요` : '');
  sfx('click');
}

export function exitBuild() {
  B.holding = null;
  if (ghost) ghost.visible = outline.visible = ghostInner.visible = false;
  G.mode = 'farm';
  setBuildHud(false);
}

function ensureGhost() {
  if (ghost) return;
  ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fd16a, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.position.y = 0.2;
  ghost.renderOrder = 5;
  ghostInner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  ghostInner.renderOrder = 6;
  const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffffff }));
  G.scene.add(ghost, ghostInner, outline);
}

// ---------------- 입력 ----------------
export function buildPointer(clientX, clientY) {
  mouse.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, G.camera);
  if (ray.ray.intersectPlane(plane, hit)) { B.pointer.x = hit.x; B.pointer.z = hit.z; }
}

export function buildClick() {
  if (!B.holding) {
    const s = structures().find((st) => B.pointer.x > st.rect.minX && B.pointer.x < st.rect.maxX && B.pointer.z > st.rect.minZ && B.pointer.z < st.rect.maxZ);
    if (!s) return;
    B.holding = { ...s, def: s.kind === 'barn' ? s.ref.def : null, dx: s.x - B.pointer.x, dz: s.z - B.pointer.z };
    ghost.visible = outline.visible = ghostInner.visible = true;
    setBuildHud(true, `${s.name} 옮기는 중 · 새 자리를 클릭하세요`);
    sfx('pickup');
    return;
  }
  if (!B.valid) { toast(`여기에는 놓을 수 없어요: ${B.reason}`, '🚫', 2000); sfx('error'); return; }
  place();
}

export function buildCancel() {
  if (B.holding) {
    B.holding = null;
    ghost.visible = outline.visible = ghostInner.visible = false;
    setBuildHud(true, '');
  } else exitBuild();
}

function target() {
  const h = B.holding;
  return { x: Math.round(B.pointer.x + h.dx), z: Math.round(B.pointer.z + h.dz) };
}

function place() {
  const h = B.holding;
  const { x, z } = target();
  const rect = rectFor(h, x, z);
  if (h.kind === 'newbarn') {
    const price = h.def.buildPrice;
    if (G.coins < price) { toast('코인이 부족해요', '🪙'); sfx('error'); return; }
    G.coins -= price;
    clearSite(rect);
    const b = addBarn(h.def.id, x, z);
    toast(`${b.name}을(를) 지었어요! 상점에서 동물을 더 들일 수 있어요`, b.icon, 3500);
  } else if (h.kind === 'barn') {
    clearSite(rect);
    h.ref.relocate(x, z);
    toast(`${h.ref.name}을(를) 옮겼어요`, h.ref.icon, 2000);
  } else if (h.kind === 'station') {
    clearSite(rect);
    relocateStation(x, z);
    toast('배합장을 옮겼어요', '🥣', 2000);
  } else {
    clearSite(rect);
    relocateDock(x, z);
    toast('출하장을 옮겼어요', '📦', 2000);
  }
  burst('star', x, 2, z, 20, { vy: 5 });
  sfx('buy');
  afterChange();
  B.holding = null;
  ghost.visible = outline.visible = ghostInner.visible = false;
  setBuildHud(true, '');
}

/** 자리 정리: 나무·덤불 치우고 바닥 장식 숨기기.
 *  차가 건물 둘레를 돌아다닐 수 있게 나무는 넉넉히(3m) 치우고, 풀·꽃 장식은 가까이만 숨긴다 */
export function clearSite(rect, treePad = 3) {
  const pad = { minX: rect.minX - 0.8, maxX: rect.maxX + 0.8, minZ: rect.minZ - 0.8, maxZ: rect.maxZ + 0.8 };
  const tp = { minX: rect.minX - treePad, maxX: rect.maxX + treePad, minZ: rect.minZ - treePad, maxZ: rect.maxZ + treePad };
  G.colliders = G.colliders.filter((c) => !(c.owner === NATURE && c.type === 'circle' && c.x > tp.minX && c.x < tp.maxX && c.z > tp.minZ && c.z < tp.maxZ));
  clearDecorIn(tp, ['rock', 'bush', 'bflower', 'trunk', 'crown', 'fruit', 'pine']);
  clearDecorIn(pad, ['tuft', 'stem', 'petal', 'fcenter']);
}

export function afterChange() {
  buildGrid(1.75);
  for (const v of G.vehicles) { v.clearTask(); v.ai.think = 0; v.ai.path = null; }
  onLayoutChanged();
}

// ---------------- 매 프레임 ----------------
export function updateBuild(dt) {
  const k = G.input;
  const sp = 28 * dt;
  if (k.down('KeyW') || k.down('ArrowUp')) B.cam.z -= sp;
  if (k.down('KeyS') || k.down('ArrowDown')) B.cam.z += sp;
  if (k.down('KeyA') || k.down('ArrowLeft')) B.cam.x -= sp;
  if (k.down('KeyD') || k.down('ArrowRight')) B.cam.x += sp;
  B.cam.x = Math.max(-LAYOUT.bound, Math.min(LAYOUT.bound, B.cam.x));
  B.cam.z = Math.max(-LAYOUT.bound, Math.min(LAYOUT.bound, B.cam.z));
  if (k.pressed('Escape')) buildCancel();
  const h = B.holding;
  if (!h || !ghost) return;
  const { x, z } = target();
  const rect = rectFor(h, x, z);
  B.reason = validate(h, rect);
  B.valid = !B.reason;
  const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ;
  ghost.scale.set(w, 1, d);
  ghost.position.set((rect.minX + rect.maxX) / 2, 0.25, (rect.minZ + rect.maxZ) / 2);
  ghost.material.color.setHex(B.valid ? 0x8fd16a : 0xff6b6b);
  // 건물 본체 (앞면 = 남쪽)
  let body;
  if (h.kind === 'barn' || h.kind === 'newbarn') body = { minX: x - h.def.width / 2, maxX: x + h.def.width / 2, minZ: z - h.def.len, maxZ: z, h: 7 };
  else if (h.kind === 'station') body = { minX: x - LAYOUT.station.w / 2, maxX: x + LAYOUT.station.w / 2, minZ: z - LAYOUT.station.d / 2, maxZ: z + LAYOUT.station.d / 2, h: 4 };
  else body = { minX: x - LAYOUT.dock.w / 2, maxX: x + LAYOUT.dock.w / 2, minZ: z - LAYOUT.dock.d / 2, maxZ: z + LAYOUT.dock.d / 2, h: 4 };
  const bw = body.maxX - body.minX, bd = body.maxZ - body.minZ;
  ghostInner.scale.set(bw, body.h, bd);
  ghostInner.position.set((body.minX + body.maxX) / 2, body.h / 2, (body.minZ + body.maxZ) / 2);
  ghostInner.material.color.setHex(B.valid ? 0xffffff : 0xffb3b3);
  outline.scale.copy(ghostInner.scale);
  outline.position.copy(ghostInner.position);
  setBuildHud(true, null, B.valid ? `✅ 놓을 수 있어요 (${x}, ${z})` : `🚫 ${B.reason}`);
}
