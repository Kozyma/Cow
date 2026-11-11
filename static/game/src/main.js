import * as THREE from 'three';
import { G, LAYOUT, PRODUCTS } from './state.js';
import { curveUniforms } from './materials.js';
import { Input } from './input.js';
import { buildWorld, updateWorld, updateSky } from './world.js';
import { Field } from './field.js';
import { createBarns } from './barns.js';
import { buildStation, buildStore, stationSlots, setOnStation } from './feed.js';
import { createVehicles, addVehicle, VEH_DEFS } from './vehicles.js';
import { Player } from './player.js';
import { buildGrid } from './pathfinding.js';
import { INST } from './instancer.js';
import { updateParticles, burst } from './particles.js';
import { updateItems, spawnBale, setOnDock, dockSlots, Item } from './items.js';
import { initUI, updateUI, updateLabels, setPrompt, setActionLabel, toast, renderShop, syncSettingsUI, renderStore, addVehicleUI } from './ui.js';
import { enterBuild, exitBuild, updateBuild, buildPointer, buildClick, buildCancel, buildState } from './layout.js';
import * as HOUSE from './house.js';
import { initAudio, updateEngine, sfx, setVolumes } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { loadSettings } from './settings.js';
import { damp, dampAngle, clamp, wrapAngle } from './util.js';
import { blockedAt } from './physics.js';
import { net, connect, hostStep, hostEndFrame, guestStep, guestCmd, updatePeersUI, setPublic } from './net.js';
import { plaza, enterPlaza, updatePlaza } from './plaza.js';
const isGuest = () => net.role === 'guest';
const guestOnly = (what) => { toast(`${what}은(는) 방장만 할 수 있어요`, '👑', 1800); };

loadSettings();

// ---------------- 렌더러 / 씬 ----------------
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
// 최적화: 모바일은 안티에일리어싱을 끄고(픽셀 비율 1.5로 충분) 그리기 부담을 줄인다
const renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, powerPreference: 'high-performance' });
G.isMobile = IS_MOBILE;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
if (IS_MOBILE) document.body.classList.add('mobile');
if (IS_MOBILE && !localStorage.getItem('monggle-farm-settings-v1')) G.settings.shadows = 'low';
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 900);
G.scene = scene; G.camera = camera; G.renderer = renderer;
G.input = new Input(renderer.domElement);
G.camTarget = new THREE.Vector3(0, 0, 0);

buildWorld(scene);
G.field = new Field(scene);
createBarns(scene);
buildStation(scene);
buildStore(scene);
INST.build(scene);
buildGrid(1.75);
createVehicles();
G.player = new Player(scene);
G.players = [G.player];
HOUSE.buildHouse(scene);
rollPrices();

function rollPrices() {
  for (const k of Object.keys(PRODUCTS)) G.prices[k] = Math.round((0.8 + Math.random() * 0.55) * 100) / 100;
}

function starterItems() {
  for (const [x, z] of [[-18, 4.1], [-16, 4.1], [-14, 4.1]]) spawnBale(x, z, Math.PI / 2).pop = 1;
  const slots = stationSlots();
  ['corn', 'corn', 'soy', 'soy'].forEach((k, i) => setOnStation(new Item('sack', k), slots[i]));
}
starterItems();

let lookPoint = null;
let storeTruck = null;
const api = {
  view(v) {
    G.viewTarget = G.viewTarget === v ? null : v;
    sfx('click');
  },
  /** 차량 목록에서 더블클릭: 거리와 상관없이 바로 탑승 (운전 중이면 갈아타기) */
  board(v) {
    if (!G.started || G.paused) return;
    if (isGuest()) { if (v.driver && v !== G.driving) toast(`${v.def.name}은(는) 다른 사람이 운전 중이에요`, v.def.icon, 1600); else guestCmd.board(v); return; }
    if (G.mode !== 'farm') { toast(G.mode === 'house' ? '집 밖에서 탈 수 있어요' : '배치 변경 중에는 탈 수 없어요', v.def.icon, 1600); return; }
    if (v === G.driving) return;
    if (!enterVehicle(v)) return;
    lookPoint = null;
    if (!G.cam.fp) G.cam.yaw = v.heading + Math.PI;
    toast(`${v.def.name}에 탔어요`, v.def.icon, 1600, { quiet: true });
  },
  lookAt(x, z) {
    if (G.cam.fp) return;
    lookPoint = { x, z, t: 3 };
  },
  toggleModal(name) {
    if (isGuest() && (name === 'shop' || name === 'store')) { guestOnly(name === 'shop' ? '상점 이용' : '사료 구매'); return; }
    const m = document.getElementById(`modal-${name}`);
    const open = m.classList.contains('hidden');
    api.closeModals();
    if (open) {
      if (name === 'shop') renderShop();
      if (name === 'settings') syncSettingsUI();
      if (name === 'store') renderStore(storeTruck);
      m.classList.remove('hidden');   // 상점·설정을 열어도 게임은 멈추지 않는다
      document.exitPointerLock?.();
      sfx('click');
    }
  },
  closeModals() {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  },
  toggleFP,
  applySettings,
  lockScreen,
  /** 🏠 버튼: 어디서든 집으로 들어가기 / 집 안이면 나가기 */
  toggleHouse() {
    if (!G.started || G.paused) return;
    if (isGuest()) { guestOnly('집 들어가기'); return; }
    if (G.mode === 'house') { HOUSE.exitHouse(); return; }
    if (G.mode !== 'farm') { toast('배치 변경을 마친 뒤에 들어갈 수 있어요', '🏠', 1600); return; }
    if (G.driving) exitVehicle();
    if (G.cam.fp) toggleFP();
    lookPoint = null;
    HOUSE.enterHouse();
  },
  openStore(truck) {
    storeTruck = truck;
    api.toggleModal('store');
  },
  toggleBuild() {
    if (isGuest()) { guestOnly('배치 변경'); return; }
    if (G.mode === 'build') exitBuild();
    else if (G.mode === 'farm') { if (G.driving) exitVehicle(); if (G.cam.fp) toggleFP(); enterBuild(); }
    else toast('집 밖에서 배치를 바꿀 수 있어요', '🏗️');
  },
  startBuild(defId) {
    if (isGuest()) { guestOnly('건설'); return; }
    if (G.mode === 'house') { toast('집 밖에서 지을 수 있어요', '🏗️'); return; }
    if (G.driving) exitVehicle();
    if (G.cam.fp) toggleFP();
    if (G.mode === 'build') exitBuild();
    enterBuild(defId);
  },
  buyVehicle(type) {
    const v = addVehicle(type);
    addVehicleUI(v);
    burst('star', v.pos.x, 2, v.pos.z, 16, { vy: 5 });
  },
  vehDefs: () => VEH_DEFS,
  house: () => HOUSE.houseState,
  furniture: () => HOUSE.FURNITURE,
  wallpapers: () => HOUSE.WALLPAPERS,
  floors: () => HOUSE.FLOORS,
  extWalls: () => HOUSE.EXT_WALLS,
  extRoofs: () => HOUSE.EXT_ROOFS,
  setDecor: (on) => HOUSE.setDecor(on),
  exitHouse: () => HOUSE.exitHouse(),
  decorRotate: () => HOUSE.decorRotate(),
  decorStore: () => HOUSE.decorStore(),
  holdFromInventory: (id) => HOUSE.holdFromInventory(id),
  applyRoom: () => HOUSE.applyRoomColors(),
  applyExt: () => HOUSE.applyExterior(),
  resetGame() {
    clearSave();
    G.started = false;
    window.removeEventListener('beforeunload', saveGame);
    location.reload();
  },
};
G.openStore = (t) => api.openStore(t);
api.setAuto = (v, on) => {
  if (isGuest()) { guestCmd.auto(v, on); return; }
  v.setAuto(on);
};
api.addIngredient = (kind) => {
  if (isGuest()) guestCmd.ing(kind);
  else G.driving?.addIngredient(kind);
};
applySettings();

function applySettings() {
  const s = G.settings;
  const sh = s.shadows;
  const shadowChanged = sh !== applySettings.lastShadows;   // (함수 속성: 선언 전에 호출돼도 안전)
  applySettings.lastShadows = sh;
  renderer.shadowMap.enabled = sh !== 'off';
  // 높음: 부드러운 그림자 / 낮음: 가벼운 그림자 + 2프레임마다 갱신
  renderer.shadowMap.type = sh === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = sh !== 'low';
  renderer.shadowMap.needsUpdate = true;
  const sun = scene.children.find((c) => c.isDirectionalLight);
  if (sun) {
    sun.castShadow = sh !== 'off';
    const size = sh === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }
  // 그림자 설정이 바뀔 때만 셰이더 다시 만들기 (볼륨 슬라이더 등을 움직일 때마다 하면 버벅임)
  if (shadowChanged) scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  setVolumes(s.music, s.sfx);
  G.timeScale = 1440 / (s.dayLength * 60);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- 시점 ----------------
function toggleFP() {
  if (G.mode !== 'farm' && !G.cam.fp) { toast('바깥에서만 1인칭으로 볼 수 있어요', '👀', 1600); return; }
  G.cam.fp = !G.cam.fp;
  if (G.cam.fp) {
    G.cam.fpYaw = G.player.heading;
    G.cam.fpOff = 0;
    G.cam.fpPitch = G.driving ? -0.08 : -0.05;
    G.viewTarget = null;
    toast(IS_MOBILE ? '1인칭 시점 · 화면을 손가락으로 끌어서 둘러봐요' : '1인칭 시점 · 화면을 클릭하면 마우스로 둘러볼 수 있어요 (Esc로 해제)', '👀', 3000);
  } else {
    document.exitPointerLock?.();
    G.cam.yaw = G.driving ? G.driving.heading + Math.PI : G.cam.yaw;
  }
  sfx('click');
}

// ---------------- 탑승 / 하차 ----------------
// p: 로컬 플레이어(G.player) 또는 원격 플레이어 (호스트가 대신 계산)
const isLocal = (p) => p === G.player;
const drivingOf = (p) => (isLocal(p) ? G.driving : p.driving);
const ridingOf = (p) => (isLocal(p) ? G.riding : p.riding);
const seatFree = (v) => (v.def.seats || 1) >= 2 && !v.passenger;
function nearestVehicle(maxD, p = G.player) {
  let best = null, bd = maxD;
  for (const v of G.vehicles) {
    if (v.driver && v.driver !== p && !seatFree(v)) continue;
    if (v.airborne) continue;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    for (const [off, r] of v.def.circles) {
      const d = Math.hypot(v.pos.x + fx * off - p.pos.x, v.pos.z + fz * off - p.pos.z) - r;
      if (d < bd) { bd = d; best = v; }
    }
  }
  return best;
}
function nearestAnimal(maxD, p = G.player) {
  let best = null, bd = maxD;
  for (const b of G.barns) for (const a of b.animals) {
    const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** 옆자리에 타기 (2인승 비행기·헬기) */
function boardPassenger(v, p) {
  if (drivingOf(p)) exitVehicle(p);
  v.passenger = p;
  if (isLocal(p)) {
    G.riding = v;
    G.viewTarget = null;
    G.cam.dist = Math.max(G.cam.dist, 34);
    sfx('board');
    toast(v.driver ? `${v.driver.name || '조종사'} 님 옆자리에 탔어요! 즐거운 비행 ✨` : `일꾼 조종사와 함께 유람 비행! (직접 조종하려면 카드의 자동을 끄세요)`, v.def.icon, 3200);
  } else {
    p.riding = v;
  }
  return true;
}

function exitRide(p) {
  const v = ridingOf(p);
  if (!v) return;
  if (v.airborne) { if (isLocal(p)) toast('땅에 내려앉은 뒤 내릴 수 있어요', v.def.icon, 1800); return; }
  const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
  const r = v.radius + 1.0;
  const spots = [[-lx * r, -lz * r], [lx * r, lz * r]];
  const spot = spots.find(([dx, dz]) => !blockedAt(v.pos.x + dx, v.pos.z + dz, 0.5, false)) || spots[0];
  p.pos.set(v.pos.x + spot[0], 0, v.pos.z + spot[1]);
  v.passenger = null;
  if (isLocal(p)) { G.riding = null; sfx('unboard'); }
  else p.riding = null;
}

function enterVehicle(v, p = G.player) {
  if (ridingOf(p)) return false;
  // 일꾼이 자동 비행 중인 비행기·헬기는 옆자리에 탄다
  if (v.def.air && v.auto && !v.driver && seatFree(v)) return boardPassenger(v, p);
  if (v.driver && v.driver !== p) {
    if (seatFree(v)) return boardPassenger(v, p);
    if (isLocal(p)) toast(`${v.def.name}은(는) ${v.driver.name || '다른 사람'} 님이 운전 중이에요`, v.def.icon, 1800);
    return false;
  }
  if (drivingOf(p)) exitVehicle(p);
  v.driver = p;
  if (isLocal(p)) {
    G.driving = v;
    G.viewTarget = null;
    G.cam.dragT = 0;
    G.cam.fpOff = 0;
    G.cam.fpPitch = -0.08;
    if (v.def.air) { G.cam.dist = Math.max(G.cam.dist, 34); toast(v.def.air === 'heli' ? '🚁 R 상승 · F 하강 · W/S 앞뒤 · A/D 선회 · Space 짐 걸기' : '✈️ W로 출력을 올려 달리다 R로 이륙 · A/D 선회 · F 하강', v.def.icon, 4200); }
    sfx('board');
  } else {
    p.driving = v;
  }
  v.onEnter();
  burst('puff', v.pos.x, 1, v.pos.z, 6, { vy: 2, grav: 2, life: 0.6 });
  return true;
}

function exitVehicle(p = G.player) {
  if (!drivingOf(p) && ridingOf(p)) { exitRide(p); return; }
  const v = drivingOf(p);
  if (!v) return;
  if (v.def.air && v.pos.y > 0.4) {
    if (isLocal(p)) toast(v.def.air === 'heli' ? '땅에 내려앉은 뒤 내릴 수 있어요 (F로 하강)' : '착륙한 뒤 내릴 수 있어요 (활주로에 천천히 내려앉기)', v.def.icon, 2200);
    return;
  }
  const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const r = (v.isTruck ? 1.6 : v.radius) + 0.9;
  const spots = [[lx * r, lz * r], [-lx * r, -lz * r], [-fx * (r + 2), -fz * (r + 2)], [fx * (r + 2), fz * (r + 2)]];
  const spot = spots.find(([dx, dz]) => !blockedAt(v.pos.x + dx, v.pos.z + dz, 0.5, false)) || spots[0];
  p.pos.set(v.pos.x + spot[0], 0, v.pos.z + spot[1]);
  p.heading = v.heading;
  v.driver = null;
  v.speed *= 0.3;
  v.onExit();
  if (isLocal(p)) {
    G.cam.fpYaw = v.heading + G.cam.fpOff;
    G.driving = null;
    sfx('unboard');
    if (v.auto) toast(`${v.def.name}은(는) 이제 일꾼이 자동으로 운전해요`, '🤖', 2200);
  } else {
    p.driving = null;
  }
}

/** 호스트: 원격 플레이어가 누른 E / Space 처리 */
function remoteActions(p) {
  const k = p.input;
  if (k.pressed('KeyE')) {
    if (p.driving || p.riding) exitVehicle(p);
    else {
      const v = nearestVehicle(2.2, p);
      if (v) enterVehicle(v, p);
      else { const a = nearestAnimal(2.4, p); if (a) a.pet(); }
    }
  }
  if (k.pressed('Space')) {
    if (p.driving) p.driving.action();
    else p.hop();
  }
}
G.hooks = { enterVehicle, exitVehicle, remoteActions, nearestVehicle, nearestAnimal };

function handleInput() {
  const k = G.input;
  const modalOpen = [...document.querySelectorAll('.modal')].some((m) => !m.classList.contains('hidden'));
  // 창이 열려 있는 동안 게임은 계속 진행되지만, 내 캐릭터·차는 조작하지 않는다
  k.blocked = modalOpen;
  if (k.pressed('Escape') && modalOpen) api.closeModals();
  if (G.mode === 'build') {
    if (k.pressed('KeyB') && !modalOpen) api.toggleModal('shop');
    if (k.pressed('KeyL') && !modalOpen) api.toggleBuild();   // L 한 번 더 누르면 배치 변경 끝
    return;
  }
  if (k.pressed('KeyB')) api.toggleModal('shop');
  if (k.pressed('KeyH')) api.toggleModal('help');
  if (k.pressed('KeyO')) api.toggleModal('settings');
  if (G.paused || modalOpen) return;
  if (G.mode === 'house') { houseInput(); return; }
  if (k.pressed('KeyL')) api.toggleBuild();
  if (k.pressed('KeyV')) toggleFP();
  if (k.pressed('KeyE') && !isGuest()) {
    if (G.driving || G.riding) exitVehicle();
    else {
      const v = nearestVehicle(2.2);
      if (v) enterVehicle(v);
      else if (HOUSE.nearHouseDoor(G.player.pos)) HOUSE.enterHouse();
      else {
        const a = nearestAnimal(2.4);
        if (a) a.pet();
      }
    }
  }
  if (k.pressed('Space') && !isGuest()) {
    if (G.driving) G.driving.action();
    else G.player.hop();
  }
  if (k.pressed('Tab')) {
    const list = [null, ...G.vehicles.filter((v) => v !== G.driving)];
    const i = list.indexOf(G.viewTarget);
    G.viewTarget = list[(i + 1) % list.length];
    if (G.viewTarget && G.cam.fp) toggleFP();
    sfx('click');
  }
  if (!G.driving) for (let i = 0; i < G.vehicles.length; i++) if (k.pressed(`Digit${i + 1}`)) { if (G.cam.fp) toggleFP(); api.view(G.vehicles[i]); }
  if (k.pressed('KeyC')) {
    if (G.cam.fp) { G.cam.fpOff = 0; G.cam.fpPitch = -0.08; }
    else { G.cam.yaw = G.driving ? G.driving.heading + Math.PI : 0; G.cam.pitch = 0.92; G.cam.dist = 28; }
  }

  if (G.driving) setPrompt(null);
  else if (G.riding) { setPrompt(`${G.riding.def.icon} 옆자리 동승 중 · 고도 ${Math.round(G.riding.pos.y)}m · <kbd>E</kbd> 내리기 (착륙 후)`); setActionLabel('🚪 내리기'); }
  else if (G.viewTarget) { setPrompt(`👁 ${G.viewTarget.def.name} 관찰 중 · 움직이면 돌아와요`); setActionLabel(null); }
  else {
    const v = nearestVehicle(2.2);
    const door = !v && !isGuest() && HOUSE.nearHouseDoor(G.player.pos);
    const a = !v && !door && nearestAnimal(2.4);
    const icon = a && ({ cow: '🐮', hanwoo: '🐂', pig: '🐷', chicken: '🐔' })[a.type];
    if (v) setPrompt(`<kbd>E</kbd> ${v.def.icon} ${v.def.name} 타기`);
    else if (door) setPrompt('<kbd>E</kbd> 🏠 집에 들어가기');
    else if (a) setPrompt(`<kbd>E</kbd> ${icon} 쓰다듬기`);
    else setPrompt(null);
    // 모바일 행동 버튼 글자도 상황에 맞게
    setActionLabel(v ? `${v.def.icon} 타기` : door ? '🏠 들어가기' : a ? `${icon} 쓰다듬기` : null);
  }
}

function houseInput() {
  const k = G.input;
  const H = HOUSE.houseState;
  if (H.piano) { setPrompt(null); return; }
  if (k.pressed('Escape') && H.decor) HOUSE.setDecor(false);
  if (k.pressed('KeyV')) toggleFP();
  const a = H.decor ? null : HOUSE.nearestActivity();
  if (k.pressed('KeyE') && a) HOUSE.doActivity(a);
  if (k.pressed('Space') && !H.decor) G.player.hop();
  setPrompt(a ? `<kbd>E</kbd> ${a.name}` : null);
  setActionLabel(a ? (a.door ? '🚪 나가기' : '✋ ' + (a.name.length > 6 ? '하기' : a.name)) : null);
}

// ---------------- 카메라 ----------------
const _eye = new THREE.Vector3();
let fovBoost = 0;
function updateCamera(dt) {
  const tgt = G.camTarget;
  const crosshair = document.getElementById('crosshair');
  if (!G.started) {
    G.cam.yaw += dt * 0.05;
    tgt.set(0, 0, -5);
    place(tgt, G.cam.yaw, 0.7, 95);
    crosshair.classList.add('hidden');
    return;
  }
  fovBoost = damp(fovBoost, G.driving?.boosting ? 1 : 0, 4, dt);
  const curve = G.settings.curve ? 1 : 0;
  if (G.mode === 'build') {
    crosshair.classList.add('hidden');
    curveUniforms.uCurve.value = 0;
    tgt.y = 0;
    if (camera.fov !== 40 || camera.near !== 0.5) { camera.fov = 40; camera.near = 0.5; camera.updateProjectionMatrix(); }
    tgt.x = damp(tgt.x, buildState.cam.x, 6, dt);
    tgt.z = damp(tgt.z, buildState.cam.z, 6, dt);
    place(tgt, 0, 1.15, G.buildDist);
    return;
  }
  if (G.mode === 'house') {
    crosshair.classList.add('hidden');
    curveUniforms.uCurve.value = 0;
    tgt.y = 0;
    if (camera.fov !== 40 || camera.near !== 0.5) { camera.fov = 40; camera.near = 0.5; camera.updateProjectionMatrix(); }
    const rc = HOUSE.roomCenter();
    const p = G.player.pos;
    tgt.x = damp(tgt.x, rc.x + (p.x - rc.x) * 0.35, 5, dt);
    tgt.z = damp(tgt.z, rc.z + 0.8 + (p.z - rc.z) * 0.3, 5, dt);
    place(tgt, 0, 0.98, G.isMobile ? 19 : 15.5);
    return;
  }
  if (G.cam.fp) {
    crosshair.classList.remove('hidden');
    let yaw;
    if (G.driving) {
      G.driving.eye.getWorldPosition(_eye);
      yaw = G.driving.heading + G.cam.fpOff;
    } else if (G.riding?.eye2) {
      G.riding.eye2.getWorldPosition(_eye);
      yaw = G.riding.heading + G.cam.fpOff;
    } else {
      const p = G.player.pos;
      _eye.set(p.x, 1.62 + Math.abs(Math.sin(G.player.phase)) * 0.04 * Math.min(1, G.player.speed / 5), p.z);
      yaw = G.cam.fpYaw;
    }
    camera.position.copy(_eye);
    const pitch = G.cam.fpPitch;
    camera.lookAt(_eye.x + Math.sin(yaw) * Math.cos(pitch), _eye.y + Math.sin(pitch), _eye.z + Math.cos(yaw) * Math.cos(pitch));
    tgt.set(_eye.x, 0, _eye.z);
    curveUniforms.uCurveCenter.value.set(_eye.x, _eye.z);
    curveUniforms.uCurve.value = 0.0005 * curve;
    camera.near = 0.08;
    camera.fov = 70 + fovBoost * 10;
    camera.updateProjectionMatrix();
    return;
  }
  crosshair.classList.add('hidden');
  curveUniforms.uCurve.value = 0.0016 * curve;
  if (camera.near !== 0.5 || Math.abs(camera.fov - (40 + fovBoost * 6)) > 0.01) {
    camera.near = 0.5;
    camera.fov = 40 + fovBoost * 6;
    camera.updateProjectionMatrix();
  }
  let p;
  if (lookPoint) {
    p = lookPoint;
    lookPoint.t -= dt;
    if (lookPoint.t <= 0) lookPoint = null;
  } else {
    p = (G.viewTarget || G.driving || G.riding || G.player).pos;
  }
  tgt.x = damp(tgt.x, p.x, 5, dt);
  tgt.y = damp(tgt.y, (p.y || 0) * 0.9, 4, dt);
  tgt.z = damp(tgt.z, p.z, 5, dt);
  G.cam.dragT -= dt;
  const follow = G.driving || G.riding || G.viewTarget;
  if (follow && G.settings.camFollow && G.cam.dragT <= 0 && follow.speed > 0.6) {
    // 모바일은 화면이 덜 휙휙 돌도록 조금 더 느긋하게 따라감
    G.cam.yaw = dampAngle(G.cam.yaw, follow.heading + Math.PI, G.driving ? (G.isMobile ? 1.0 : 1.6) : 0.8, dt);
  }
  place(tgt, G.cam.yaw, G.cam.pitch, G.cam.dist);
}
function place(tgt, yaw, pitch, dist) {
  camera.position.set(
    tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    tgt.y + Math.sin(pitch) * dist,
    tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(tgt.x, tgt.y + 1.2, tgt.z);
  curveUniforms.uCurveCenter.value.set(tgt.x, tgt.z);
}

/** 3인칭에서 축사 안을 볼 때는 지붕을 숨긴다 */
G.buildDist = 85;
renderer.domElement.addEventListener('wheel', (e) => { if (G.mode === 'build') G.buildDist = clamp(G.buildDist * (1 + Math.sign(e.deltaY) * 0.08), 35, 140); }, { passive: true });
// 배치 변경 · 집 꾸미기용 마우스
{
  const el = renderer.domElement;
  let down = null;
  el.addEventListener('pointermove', (e) => {
    if (G.mode === 'build') buildPointer(e.clientX, e.clientY);
    if (G.mode === 'house' && HOUSE.houseState.decor) HOUSE.decorPointer(e.clientX, e.clientY);
  });
  el.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, b: e.button };
    if (G.mode === 'build') buildPointer(e.clientX, e.clientY);
    if (G.mode === 'house' && HOUSE.houseState.decor) HOUSE.decorPointer(e.clientX, e.clientY);
  });
  el.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    if (down.b === 2) { if (G.mode === 'build') buildCancel(); down = null; return; }
    if (G.mode === 'build') buildClick();
    else if (G.mode === 'house' && HOUSE.houseState.decor) HOUSE.decorClick();
    down = null;
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function updateRoofs() {
  const t = G.camTarget;
  for (const b of G.barns) {
    b.roof.visible = G.cam.fp || !G.started || !b.contains(t.x, t.z, 1.5);
  }
}

// ---------------- 게임 루프 ----------------
const clock = new THREE.Clock();
let uiT = 0, saveT = 0;

function step(dt) {
  G.time += dt * G.timeScale;
  if (G.time >= 1440) { G.time -= 1440; G.day++; rollPrices(); }
  G.snackT = Math.max(0, G.snackT - dt);
  if (G.mode === 'house') HOUSE.updateHouse(dt);
  const h = G.time / 60;
  if (G.lastHour !== undefined && G.lastHour < 6 && h >= 6) {
    toast(`${G.day}일째 아침이 밝았어요! 오늘도 힘내요 ☀️`, '🐓', 4000);
    sfx('day');
  }
  G.lastHour = h;
  G.fertileTimer = Math.max(0, G.fertileTimer - dt);
  const gameHours = (dt * G.timeScale) / 60;

  G.player.update(dt);
  hostStep(dt);
  for (const v of G.vehicles) v.update(dt);
  for (const b of G.barns) b.update(gameHours, dt);
  G.field.update(dt);
  updateItems(dt);
  updateWorld(dt);
  updateEngine();
  saveT += dt;
  if (saveT > 10) { saveT = 0; saveGame(); }
}

function frame() {
  frame.n ??= 0;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.now += dt;
  if (G.mode === 'plaza' && plaza.active) {
    updatePlaza(dt, camera, renderer);
    updateParticles(dt);
    G.input.endFrame();
    return;
  }
  if (G.started) handleInput();
  if (G.started && !G.paused && !isGuest()) step(dt);
  if (G.started && isGuest()) { guestStep(dt); updateWorld(dt); updateEngine(); }
  if (G.started) hostEndFrame(dt);
  if (G.mode === 'build') updateBuild(dt);
  updateParticles(dt);
  updateCamera(dt);
  updateRoofs();
  updateSky(camera.position, G.camTarget);
  if (G.started) {
    updateLabels(dt);
    uiT -= dt;
    if (uiT <= 0) { uiT = 0.12; updateUI(0.12); }
  }
  G.input.endFrame();
  // 그림자 "낮음": 그림자 지도는 2프레임에 한 번만 다시 그린다
  if (!renderer.shadowMap.autoUpdate) renderer.shadowMap.needsUpdate = (++frame.n & 1) === 0;
  renderer.render(scene, camera);
}

// ---------------- 시작 화면 ----------------
const title = document.getElementById('title');
const btnStart = document.getElementById('btn-start');
const btnNew = document.getElementById('btn-new');
if (hasSave()) {
  btnStart.textContent = '이어하기';
  btnNew.classList.remove('hidden');
}
document.querySelectorAll('#title .mode-pick button').forEach((b) => {
  b.classList.toggle('on', b.dataset.mode === G.settings.mode);
  b.addEventListener('click', () => {
    G.settings.mode = b.dataset.mode;
    document.querySelectorAll('#title .mode-pick button').forEach((x) => x.classList.toggle('on', x === b));
    localStorage.setItem('monggle-farm-settings-v1', JSON.stringify(G.settings));
  });
});
/** 모바일: 전체화면 + 지금 방향(가로/세로)으로 화면 회전 고정.
 *  폰을 조금 기울일 때마다 화면이 가로↔세로로 돌아가는 것을 막는다 (안드로이드 크롬 등 지원 브라우저만). */
function lockScreen() {
  if (!IS_MOBILE || !G.settings.lockScreen) return;
  const want = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  const lock = () => { try { screen.orientation?.lock?.(want)?.catch?.(() => {}); } catch { /* 미지원 */ } };
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, lock);
    else lock();
  } catch { lock(); }
}
// 시작 화면 버튼을 누르는 순간(사용자 동작이 있어야 전체화면 가능) 회전 고정
document.getElementById('title').addEventListener('click', (e) => { if (e.target.closest('button.big')) lockScreen(); }, true);

function start(fresh) {
  initAudio();
  setVolumes(G.settings.music, G.settings.sfx);
  if (fresh) clearSave();
  else if (hasSave()) loadGame();
  initUI(api);
  title.classList.add('out');
  setTimeout(() => title.remove(), 700);
  document.getElementById('hud').classList.remove('hidden');
  G.started = true;
  G.player.name = G.player.name || myName();
  refreshNetButtons();
  const s = G.player.pos;
  G.camTarget.set(s.x, 0, s.z);
  G.cam.yaw = 0;
  if (G.settings.fpDefault) toggleFP();
  sfx('day');
  setTimeout(() => toast(IS_MOBILE ? '몽글몽글 목장에 오신 걸 환영해요! 차량 근처에서 오른쪽 아래 [타기] 버튼을 눌러 보세요' : '몽글몽글 목장에 오신 걸 환영해요! 차량 근처에서 E를 눌러 타보세요', '🌼', 5000), 600);
  setTimeout(() => toast(G.settings.mode === 'sim' ? '시뮬레이션 모드: R/F/T/G로 유압을 직접 조작해요 · 설정(O)에서 바꿀 수 있어요' : '간편 모드: Space 한 번으로 작업해요 · 설정(O)에서 바꿀 수 있어요', '⚙️', 5000), 2500);
}
btnStart.addEventListener('click', () => start(false));
btnNew.addEventListener('click', () => start(true));
window.addEventListener('beforeunload', saveGame);

// ---------------- 멀티플레이 시작 ----------------
const mpName = document.getElementById('mp-name');
const mpRoom = document.getElementById('mp-room');
const mpMsg = document.getElementById('mp-msg');
// 시작 화면이 지워진 뒤(광장 → 농장)에도 쓸 수 있게 미리 잡아 둔다
const btnHostEl = document.getElementById('btn-host');
const btnJoinEl = document.getElementById('btn-join');
try {
  const saved = JSON.parse(localStorage.getItem('monggle-farm-mp') || '{}');
  if (saved.name) mpName.value = saved.name;
  if (saved.room) mpRoom.value = saved.room;
} catch { /* 무시 */ }
if (!mpRoom.value) mpRoom.value = 'FARM' + Math.floor(100 + Math.random() * 900);
const mpSay = (msg, err = false) => { mpMsg.textContent = msg; mpMsg.classList.toggle('err', err); };

const myName = () => mpName.value.trim().slice(0, 12) || '농부';
const fromPlaza = { on: false };

/** kind: 'host' | 'join'.  opts: { name, room, retry(방이 열릴 때까지 기다림), open(게시판에 올림), host(주인 이름) } */
async function startMulti(kind, opts = {}) {
  const name = opts.name || myName();
  const room = (opts.room || mpRoom.value).trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(room)) { mpSay('방 코드는 영문/숫자 3~12자로 적어 주세요', true); return; }
  try { localStorage.setItem('monggle-farm-mp', JSON.stringify({ name, room: opts.room ? (mpRoom.value || room) : room })); } catch { /* 무시 */ }
  btnHostEl.disabled = btnJoinEl.disabled = true;
  mpSay(kind === 'host' ? '방을 여는 중…' : '방에 들어가는 중…');
  // 광장에서 초대를 수락한 경우: 상대가 농장 문을 여는 동안 잠깐 기다리며 다시 시도
  const tries = opts.retry ? 15 : 1;
  for (let i = 0; i < tries; i++) {
    try {
      await connect(kind, name, room);
      break;
    } catch (e) {
      const last = i === tries - 1;
      if (!last && /그런 방이 없어요/.test(e.message)) {
        if (i === 0 && opts.host) toast(`${opts.host} 님이 농장 문을 여는 중이에요…`, '🚪', 2500);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (fromPlaza.on) { toast(`농장에 들어가지 못했어요: ${e.message}`, '😢', 3500); setTimeout(() => goPlaza(), 2500); return; }
      mpSay(e.message, true);
      btnHostEl.disabled = btnJoinEl.disabled = false;
      return;
    }
  }
  G.player.name = name;
  if (kind === 'host') {
    start(false);
    if (opts.open) setPublic(true);
    updatePeersUI();
    refreshNetButtons();
    setTimeout(() => toast(opts.open ? '농장 문을 열었어요! 광장 게시판에 내 농장이 올라갔어요' : fromPlaza.on ? '내 농장에 왔어요. 초대한 친구가 곧 따라와요' : `방 ${room}을(를) 열었어요! 친구에게 방 코드를 알려 주세요`, '🌐', 5000), 1200);
  } else {
    mpSay('호스트 농장을 불러오는 중…');
    G.onNetInit = startGuest;
  }
}

function startGuest() {
  G.onNetInit = null;
  refreshNetButtons();
  initAudio();
  setVolumes(G.settings.music, G.settings.sfx);
  initUI(api);
  title.classList.add('out');
  setTimeout(() => title.remove(), 700);
  document.getElementById('hud').classList.remove('hidden');
  document.body.classList.add('net-guest');
  G.started = true;
  G.camTarget.set(G.player.pos.x, 0, G.player.pos.z);
  G.cam.yaw = 0;
  if (G.settings.fpDefault) toggleFP();
  updatePeersUI();
  sfx('day');
  setTimeout(() => toast(`방 ${net.room}에 들어왔어요! 차량 근처에서 E로 타거나, 아래 차량 카드를 더블클릭해요`, '👋', 5000), 600);
}

// ---------------- 마을 광장 ----------------
async function startPlaza(name) {
  const btn = document.getElementById('btn-plaza');
  btn.disabled = true;
  mpSay('광장으로 가는 중…');
  try { localStorage.setItem('monggle-farm-mp', JSON.stringify({ name, room: mpRoom.value })); } catch { /* 무시 */ }
  try {
    await enterPlaza(name);
  } catch (e) {
    mpSay(e.message, true);
    btn.disabled = false;
    return;
  }
  title.classList.add('out');
  setTimeout(() => title.remove(), 700);
}
// 광장 → 농장
plaza.onGoFarm = (dest) => {
  fromPlaza.on = true;
  if (dest.kind === 'host') startMulti('host', { name: plaza.name, room: dest.room, open: dest.open });
  else { G.returnToPlaza = plaza.name; startMulti('join', { name: plaza.name, room: dest.room, retry: dest.retry, host: dest.host }); }
};
// 농장 → 광장: 저장하고 새로 열어서 광장으로
function goPlaza() {
  saveGame();
  try { sessionStorage.setItem('mf-goto-plaza', JSON.stringify({ name: G.player.name || myName() })); } catch { /* 무시 */ }
  net.role = null;
  location.reload();
}
const btnOpen = document.getElementById('btn-open-farm');
const btnToPlaza = document.getElementById('btn-to-plaza');
function refreshNetButtons() {
  const served = location.protocol.startsWith('http');
  btnToPlaza.classList.toggle('hidden', !served);
  btnOpen.classList.toggle('hidden', !served || net.role === 'guest');
  btnOpen.classList.toggle('on', !!net.public);
  btnOpen.innerHTML = net.public ? '🔓<span class="lbl"> 농장 열림 (닫기)</span>' : '🚪<span class="lbl"> 농장 문 열기</span>';
}
btnToPlaza.addEventListener('click', () => {
  if (net.role === 'host' && net.remotes.size && !confirmLeave()) return;
  goPlaza();
});
function confirmLeave() {
  if (btnToPlaza.dataset.armed) return true;
  btnToPlaza.dataset.armed = '1';
  btnToPlaza.innerHTML = '🏞️<span class="lbl"> 한 번 더 누르면 이동 (손님들은 나가요)</span>';
  setTimeout(() => { delete btnToPlaza.dataset.armed; btnToPlaza.innerHTML = '🏞️<span class="lbl"> 광장으로</span>'; }, 3000);
  return false;
}
btnOpen.addEventListener('click', async () => {
  if (net.role === 'guest') return;
  if (!net.role) {
    // 혼자 하던 중이면 내 농장을 방으로 열고 게시판에 올린다
    const room = 'F' + Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(5, '7');
    try { await connect('host', G.player.name || myName(), room); } catch (e) { toast(e.message, '📡', 3000); return; }
    G.player.name = G.player.name || myName();
  }
  setPublic(!net.public);
  refreshNetButtons();
  updatePeersUI();
  toast(net.public ? '농장 문을 열었어요! 광장 게시판에서 누구나 놀러 올 수 있어요' : '농장 문을 닫았어요. 초대한 사람만 올 수 있어요', net.public ? '🔓' : '🔒', 3000);
  sfx('click');
});
document.getElementById('btn-plaza').addEventListener('click', () => startPlaza(myName()));
try {
  const go = JSON.parse(sessionStorage.getItem('mf-goto-plaza') || 'null');
  if (go) {
    sessionStorage.removeItem('mf-goto-plaza');
    if (go.name) mpName.value = go.name;
    document.getElementById('multi').open = true;
    startPlaza(go.name || myName());
  }
} catch { /* 무시 */ }

btnHostEl.addEventListener('click', () => startMulti('host'));
btnJoinEl.addEventListener('click', () => startMulti('join'));
// 호스트가 배치를 바꿔서 다시 접속하는 경우 자동 참여
try {
  const re = JSON.parse(sessionStorage.getItem('mf-rejoin') || 'null');
  if (re) {
    sessionStorage.removeItem('mf-rejoin');
    mpName.value = re.name; mpRoom.value = re.room;
    document.getElementById('multi').open = true;
    startMulti('join');
  }
} catch { /* 무시 */ }

frame();
window.G = G;

/** 잠자기: 시간을 건너뛰며 농장 시뮬레이션 (차량은 멈춘 채로) */
G.skipMinutes = (min) => {
  let left = min;
  while (left > 0) {
    const m = Math.min(30, left);
    left -= m;
    G.time += m;
    if (G.time >= 1440) { G.time -= 1440; G.day++; rollPrices(); }
    const h = m / 60, sec = m / G.timeScale;
    for (const b of G.barns) b.update(h, 0);
    G.field.update(sec);
    G.fertileTimer = Math.max(0, G.fertileTimer - sec);
  }
  G.lastHour = G.time / 60;
  sfx('day');
};
