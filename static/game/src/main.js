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
import { initUI, updateUI, updateLabels, setPrompt, toast, renderShop, syncSettingsUI, renderStore, addVehicleUI } from './ui.js';
import { enterBuild, exitBuild, updateBuild, buildPointer, buildClick, buildCancel, buildState } from './layout.js';
import * as HOUSE from './house.js';
import { initAudio, updateEngine, sfx, setVolumes } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { loadSettings } from './settings.js';
import { damp, dampAngle, clamp, wrapAngle } from './util.js';
import { blockedAt } from './physics.js';
import { net, connect, hostStep, hostEndFrame, guestStep, guestCmd, updatePeersUI } from './net.js';
const isGuest = () => net.role === 'guest';
const guestOnly = (what) => { toast(`${what}은(는) 방장만 할 수 있어요`, '👑', 1800); };

loadSettings();

// ---------------- 렌더러 / 씬 ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
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
    toast(`${v.def.name}에 탔어요`, v.def.icon, 1600);
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
      m.classList.remove('hidden');
      G.paused = true;
      document.exitPointerLock?.();
      sfx('click');
    }
  },
  closeModals() {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    G.paused = G.mode === 'build';
  },
  toggleFP,
  applySettings,
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
  renderer.shadowMap.enabled = sh !== 'off';
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
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
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
    toast('1인칭 시점 · 화면을 클릭하면 마우스로 둘러볼 수 있어요 (Esc로 해제)', '👀', 3000);
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
function nearestVehicle(maxD, p = G.player) {
  let best = null, bd = maxD;
  for (const v of G.vehicles) {
    if (v.driver && v.driver !== p) continue;
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

function enterVehicle(v, p = G.player) {
  if (v.driver && v.driver !== p) {
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
    sfx('board');
  } else {
    p.driving = v;
  }
  v.onEnter();
  burst('puff', v.pos.x, 1, v.pos.z, 6, { vy: 2, grav: 2, life: 0.6 });
  return true;
}

function exitVehicle(p = G.player) {
  const v = drivingOf(p);
  if (!v) return;
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
    if (p.driving) exitVehicle(p);
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
  if (k.pressed('Escape') && modalOpen) api.closeModals();
  if (G.mode === 'build') {
    if (k.pressed('KeyB') && !modalOpen) api.toggleModal('shop');
    return;
  }
  if (k.pressed('KeyB')) api.toggleModal('shop');
  if (k.pressed('KeyH')) api.toggleModal('help');
  if (k.pressed('KeyO')) api.toggleModal('settings');
  if (G.paused) return;
  if (G.mode === 'house') { houseInput(); return; }
  if (k.pressed('KeyL')) api.toggleBuild();
  if (k.pressed('KeyV')) toggleFP();
  if (k.pressed('KeyE') && !isGuest()) {
    if (G.driving) exitVehicle();
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
  else if (G.viewTarget) setPrompt(`👁 ${G.viewTarget.def.name} 관찰 중 · 움직이면 돌아와요`);
  else {
    const v = nearestVehicle(2.2);
    const a = !v && nearestAnimal(2.4);
    if (v) setPrompt(`<kbd>E</kbd> ${v.def.icon} ${v.def.name} 타기`);
    else if (HOUSE.nearHouseDoor(G.player.pos)) setPrompt('<kbd>E</kbd> 🏠 집에 들어가기');
    else if (a) setPrompt(`<kbd>E</kbd> ${({ cow: '🐮', hanwoo: '🐂', pig: '🐷', chicken: '🐔' })[a.type]} 쓰다듬기`);
    else setPrompt(null);
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
    if (camera.fov !== 40 || camera.near !== 0.5) { camera.fov = 40; camera.near = 0.5; camera.updateProjectionMatrix(); }
    tgt.x = damp(tgt.x, buildState.cam.x, 6, dt);
    tgt.z = damp(tgt.z, buildState.cam.z, 6, dt);
    place(tgt, 0, 1.15, G.buildDist);
    return;
  }
  if (G.mode === 'house') {
    crosshair.classList.add('hidden');
    curveUniforms.uCurve.value = 0;
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
    p = (G.viewTarget || G.driving || G.player).pos;
  }
  tgt.x = damp(tgt.x, p.x, 5, dt);
  tgt.z = damp(tgt.z, p.z, 5, dt);
  G.cam.dragT -= dt;
  const follow = G.driving || G.viewTarget;
  if (follow && G.settings.camFollow && G.cam.dragT <= 0 && follow.speed > 0.6) {
    G.cam.yaw = dampAngle(G.cam.yaw, follow.heading + Math.PI, G.driving ? 1.6 : 0.8, dt);
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
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.now += dt;
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
  const s = G.player.pos;
  G.camTarget.set(s.x, 0, s.z);
  G.cam.yaw = 0;
  if (G.settings.fpDefault) toggleFP();
  sfx('day');
  setTimeout(() => toast('몽글몽글 목장에 오신 걸 환영해요! 차량 근처에서 E를 눌러 타보세요', '🌼', 5000), 600);
  setTimeout(() => toast(G.settings.mode === 'sim' ? '시뮬레이션 모드: R/F/T/G로 유압을 직접 조작해요 · 설정(O)에서 바꿀 수 있어요' : '간편 모드: Space 한 번으로 작업해요 · 설정(O)에서 바꿀 수 있어요', '⚙️', 5000), 2500);
}
btnStart.addEventListener('click', () => start(false));
btnNew.addEventListener('click', () => start(true));
window.addEventListener('beforeunload', saveGame);

// ---------------- 멀티플레이 시작 ----------------
const mpName = document.getElementById('mp-name');
const mpRoom = document.getElementById('mp-room');
const mpMsg = document.getElementById('mp-msg');
try {
  const saved = JSON.parse(localStorage.getItem('monggle-farm-mp') || '{}');
  if (saved.name) mpName.value = saved.name;
  if (saved.room) mpRoom.value = saved.room;
} catch { /* 무시 */ }
if (!mpRoom.value) mpRoom.value = 'FARM' + Math.floor(100 + Math.random() * 900);
const mpSay = (msg, err = false) => { mpMsg.textContent = msg; mpMsg.classList.toggle('err', err); };

async function startMulti(kind) {
  const name = mpName.value.trim().slice(0, 12) || '농부';
  const room = mpRoom.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(room)) { mpSay('방 코드는 영문/숫자 3~12자로 적어 주세요', true); return; }
  try { localStorage.setItem('monggle-farm-mp', JSON.stringify({ name, room })); } catch { /* 무시 */ }
  document.getElementById('btn-host').disabled = document.getElementById('btn-join').disabled = true;
  mpSay(kind === 'host' ? '방을 여는 중…' : '방에 들어가는 중…');
  try {
    await connect(kind, name, room);
  } catch (e) {
    mpSay(e.message, true);
    document.getElementById('btn-host').disabled = document.getElementById('btn-join').disabled = false;
    return;
  }
  G.player.name = name;
  if (kind === 'host') {
    start(false);
    updatePeersUI();
    setTimeout(() => toast(`방 ${room}을(를) 열었어요! 친구에게 방 코드를 알려 주세요`, '🌐', 6000), 1200);
  } else {
    mpSay('호스트 농장을 불러오는 중…');
    G.onNetInit = startGuest;
  }
}

function startGuest() {
  G.onNetInit = null;
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

document.getElementById('btn-host').addEventListener('click', () => startMulti('host'));
document.getElementById('btn-join').addEventListener('click', () => startMulti('join'));
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
