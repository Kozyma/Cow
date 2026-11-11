// 온라인 멀티플레이
//  호스트: 농장 전체를 계산하고, 상태를 게스트에게 보낸다 (차량·사람 15회/초, 아이템 5회/초, 농장 1회/초)
//  게스트: 키 입력·카메라 방향을 호스트에 보내고, 받은 상태를 부드럽게 따라가며 그린다
import * as THREE from 'three';
import { G, LAYOUT } from './state.js';
import { Player } from './player.js';
import { LOOKS } from './models.js';
import { Item } from './items.js';
import { addMuck } from './items.js';
import { buildSaveData, applySaveData } from './save.js';
import { addLabel, removeLabel, toast, addVehicleUI } from './ui.js';
import { damp, dampAngle } from './util.js';
import { sfx } from './audio.js';

const lookFor = (id) => LOOKS[id % LOOKS.length];

// 호스트로 보내는 입력 키
const HELD = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyF', 'KeyT', 'KeyG'];
const TAPS = ['KeyE', 'Space', 'Digit1', 'Digit2', 'Digit3'];

export const net = { role: null, ws: null, id: 0, name: '', room: '', remotes: new Map(), puppets: new Map(), peers: new Map(), stats: { s: 0, m: 0, w: 0, init: 0 } };
G.net = net;
// 창을 닫거나 다른 페이지로 가면 바로 퇴장 처리
window.addEventListener('pagehide', () => { try { net.ws?.close(1000, 'bye'); } catch { /* 무시 */ } });

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------------- 연결 ----------------
/** 게임 페이지와 같은 폴더의 'ws' (단독 실행: /ws, 운영 서버: /static/game/ws) */
function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const dir = location.pathname.replace(/[^/]*$/, '');
  return `${proto}//${location.host}${dir}ws`;
}

/** 방 만들기(t='host') 또는 참여(t='join'). 결과 메시지를 기다린다 */
export function connect(t, name, room) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch (e) { reject(new Error('서버에 연결할 수 없어요')); return; }
    const timer = setTimeout(() => { ws.close(); reject(new Error('서버 응답이 없어요. npm start 로 서버를 켰는지 확인해 주세요')); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ t, name, room }));
    ws.onerror = () => { clearTimeout(timer); reject(new Error('서버에 연결할 수 없어요. 게임을 npm start 서버 주소로 열었는지 확인해 주세요')); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'error') { clearTimeout(timer); ws.close(); reject(new Error(m.msg)); return; }
      if (m.t === 'hosted' || m.t === 'joined') {
        clearTimeout(timer);
        Object.assign(net, { ws, id: m.id, name, room: m.room, role: t === 'host' ? 'host' : 'guest' });
        ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
        ws.onclose = onClose;
        resolve(m);
      }
    };
  });
}

function sendRaw(m) { if (net.ws?.readyState === 1) net.ws.send(JSON.stringify(m)); }
const toGuests = (m, id = 'all') => sendRaw({ t: 'to', id, m });

function onClose() {
  if (!net.role) return;
  const wasGuest = net.role === 'guest';
  net.role = null;
  toast(wasGuest ? (G.returnToPlaza ? '농장 주인이 떠났어요. 광장으로 돌아가요' : '호스트와 연결이 끊겼어요. 처음 화면으로 돌아가요') : '서버와 연결이 끊겼어요. 혼자 하기로 계속해요', '📡', 5000);
  if (wasGuest) {
    // 광장에서 놀러 왔다면 광장으로 돌아간다
    if (G.returnToPlaza) { try { sessionStorage.setItem('mf-goto-plaza', JSON.stringify({ name: G.returnToPlaza })); } catch { /* 무시 */ } }
    setTimeout(() => location.reload(), 2500);
  }
  else for (const id of [...net.remotes.keys()]) removeRemote(id);
  updatePeersUI();
}

function onMessage(m) {
  if (net.role === 'host') {
    if (m.t === 'join') addRemote(m.id, m.name);
    else if (m.t === 'leave') removeRemote(m.id);
    else if (m.t === 'g') onGuestMessage(m.from, m.m);
  } else if (net.role === 'guest') {
    if (m.t in net.stats) net.stats[m.t]++;
    if (m.t === 'init') applyInit(m);
    else if (m.t === 's') applyFast(m);
    else if (m.t === 'm') applyMid(m);
    else if (m.t === 'w') applyWorld(m);
    else if (m.t === 'toast') toast(m.msg, m.icon, m.ms);
    else if (m.t === 'hostgone') { toast('호스트가 방을 닫았어요', '🚪', 4000); }
  }
}

// ================= 호스트 =================
function addRemote(id, name) {
  const p = new Player(G.scene, lookFor(id), true);
  p.netId = id;
  p.name = name;
  p.pos.set(LAYOUT.spawn.x + (id % 4) * 1.4 - 2, 0, LAYOUT.spawn.z + 1.5);
  p.label = addLabel(() => ({ x: p.pos.x, y: 2.6, z: p.pos.z }), 'zone-label small', () => (p.driving ? '' : `🧑‍🌾 ${name}`));
  net.remotes.set(id, p);
  net.peers.set(id, name);
  syncPlayersList();
  toGuests(initPacket(id), id);
  toast(`${name} 님이 농장에 놀러 왔어요!`, '👋', 3000);
  sfx('ding');
  updatePeersUI();
}

function removeRemote(id) {
  const p = net.remotes.get(id);
  if (!p) return;
  if (p.driving || p.riding) G.hooks.exitVehicle(p);
  removeLabel(p.label);
  p.destroy();
  net.remotes.delete(id);
  net.peers.delete(id);
  syncPlayersList();
  toast(`${p.name} 님이 돌아갔어요`, '👋', 2500);
  updatePeersUI();
}

function syncPlayersList() {
  G.players = [G.player, ...net.remotes.values()];
}

function onGuestMessage(id, m) {
  const p = net.remotes.get(id);
  if (!p) return;
  if (m.t === 'in') {
    p.input.keys = new Set(m.k || []);
    for (const c of m.p || []) if (TAPS.includes(c)) p.input.just.add(c);
    if (m.c) { p.cam.fp = !!m.c[0]; p.cam.yaw = +m.c[1] || 0; p.cam.fpYaw = +m.c[2] || 0; }
    if (m.mode === 'easy' || m.mode === 'sim') p.mode = m.mode;
  } else if (m.t === 'board') {
    const v = G.vehicles[m.vi];
    if (v) G.hooks.enterVehicle(v, p);
  } else if (m.t === 'auto') {
    const v = G.vehicles[m.vi];
    if (v) { v.setAuto(!!m.on); if (v.ui) v.ui.cb.checked = v.auto; }
  } else if (m.t === 'ing') {
    if (p.driving?.type === 'mixer') p.driving.addIngredient(m.kind);
  } else if (m.t === 'chat') {
    const msg = String(m.msg || '').slice(0, 80);
    toast(`${p.name}: ${msg}`, '💬', 4000);
    toGuests({ t: 'toast', msg: `${p.name}: ${msg}`, icon: '💬', ms: 4000 });
  }
}

/** 호스트 게임 루프: 원격 플레이어 이동 · 행동 */
export function hostStep(dt) {
  if (net.role !== 'host') return;
  for (const p of net.remotes.values()) {
    p.update(dt);
    G.hooks.remoteActions(p);
  }
}
/** 호스트 프레임 끝: 원격 입력의 '눌림' 처리 끝 + 상태 보내기 */
let fastT = 0, midT = 0, worldT = 0, lastSig = '';
export function hostEndFrame(dt) {
  if (net.role !== 'host') return;
  for (const p of net.remotes.values()) p.input.endFrame();
  if (!net.remotes.size) return;
  fastT -= dt; midT -= dt; worldT -= dt;
  if (fastT <= 0) { fastT = 1 / 15; toGuests(fastPacket()); }
  if (midT <= 0) { midT = 0.2; toGuests(midPacket()); }
  if (worldT <= 0) {
    worldT = 1;
    const sig = structSig();
    if (sig !== lastSig) { lastSig = sig; for (const id of net.remotes.keys()) toGuests(initPacket(id), id); }
    else toGuests(worldPacket());
  }
}

/** 축사·차량·시설 배치가 바뀌었는지 (바뀌면 게스트를 통째로 다시 맞춘다) */
function structSig() {
  return JSON.stringify([G.barns.map((b) => [b.id, b.cx, b.front, b.capacity]), G.vehicles.map((v) => v.type), LAYOUT.station.x, LAYOUT.station.z, LAYOUT.dock.x, LAYOUT.dock.z]);
}

function playerList() {
  const out = [];
  // 차량 번호: 운전 중이면 그대로, 옆자리 동승이면 +1000
  const add = (id, name, p, drv, ride) => out.push([id, name, r2(p.pos.x), r2(p.pos.z), r2(p.heading), r2(p.speed), drv ? G.vehicles.indexOf(drv) : ride ? 1000 + G.vehicles.indexOf(ride) : -1, p.hopT > 0 ? 1 : 0, G.mode === 'house' && id === 0 ? 1 : 0]);
  add(0, net.name, G.player, G.driving, G.riding);
  for (const p of net.remotes.values()) add(p.netId, p.name, p, p.driving, p.riding);
  return out;
}

function initPacket(id) {
  lastSig = structSig();
  return { t: 'init', you: id, save: buildSaveData(), world: worldPacket(), fast: fastPacket(), mid: midPacket() };
}

/** 항공기 추가 상태: 헬기 = 화물 줄 끝(기체 기준) · 콜렉티브 / 비행기 = 보조익 · 승강타 · 스로틀 */
function airExtra(v) {
  if (v.def.air === 'heli') return [r2(v.slingLocal.x), r2(v.slingLocal.y), r2(v.slingLocal.z), r2(v.coll)];
  if (v.def.air === 'plane') return [r2(v.ail || 0), r2(v.elev || 0), 0, r2(v.thrL)];
  return [];
}
function fastPacket() {
  return {
    t: 's', time: r2(G.time),
    v: G.vehicles.map((v) => [r2(v.pos.x), r2(v.pos.z), r3(v.heading), r2(v.speed), r3(v.lift), r3(v.tilt), r2(v.steerVis), v.driver ? (v.driver === G.player ? 0 : v.driver.netId) : -1, v.boosting ? 1 : 0, r2(v.pos.y), r3(v.roll || 0), r3(v.pitch || 0), r2(v.rpm || 0), v.passenger ? (v.passenger === G.player ? 0 : v.passenger.netId) : -1, ...airExtra(v)]),
    p: playerList(),
  };
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _pp = new THREE.Vector3(), _qq = new THREE.Quaternion(), _ss = new THREE.Vector3();
function midPacket() {
  const items = [];
  for (const it of G.items) {
    if (it.removed) continue;
    // 차에 실렸거나 들린 아이템은 그 차 기준 상대 위치로 보낸다
    let vi = -1;
    let o = it.mesh.parent;
    while (o && vi < 0) { vi = G.vehicles.findIndex((v) => v.group === o); o = o.parent; }
    it.mesh.updateWorldMatrix(true, false);
    if (vi >= 0) {
      _inv.copy(G.vehicles[vi].group.matrixWorld).invert();
      _m.multiplyMatrices(_inv, it.mesh.matrixWorld);
    } else _m.copy(it.mesh.matrixWorld);
    _m.decompose(_pp, _qq, _ss);
    const sup = it.carriedBy ? 'c' : it.barn ? 'b' : it.support.kind[0];
    items.push([it.id, it.kind, it.product, sup, vi, r3(_pp.x), r3(_pp.y), r3(_pp.z), r3(_qq.x), r3(_qq.y), r3(_qq.z), r3(_qq.w), r2(_ss.x)]);
  }
  return {
    t: 'm', items,
    vx: G.vehicles.map((v) => [r2(v.load), v.loadKind, r2(v.bulk), v.bulkKind, v.collected, v.mix, r2(v.mixT), r2(v.dispensed), v.skidMode, v.status, v.carrying?.kind || null, v.carrying?.product || null, v.pto ? 1 : 0, v.auto ? 1 : 0]),
  };
}

function worldPacket() {
  return {
    t: 'w', coins: G.coins, day: G.day, time: G.time, ts: G.timeScale, prices: G.prices, upgrades: G.upgrades, fertile: G.fertileTimer, snack: G.snackT,
    barns: G.barns.map((b) => [r2(b.feed), r2(b.happiness), b.animals.length, b.capacity, b.cells.map((c) => r2(c.amt)), r2(b.shed.raw), r2(b.shed.compost), b.pallets.length, Math.round(b.boostT), b.expansions]),
    field: G.field.serialize(),
    muck: G.muck.map((m) => [r2(m.x), r2(m.z), r2(m.amount)]),
    peers: [[0, net.name], ...[...net.remotes.values()].map((p) => [p.netId, p.name])],
  };
}

// ================= 게스트 =================
let ready = false;
const tgt = { v: [], p: new Map() };
const items = new Map();   // 호스트 아이템 id → 내 화면의 Item
let fieldStr = '', muckStr = '';

function applyInit(m) {
  if (ready) {
    // 호스트가 축사·차량 배치를 바꿨으면 깔끔하게 다시 접속해서 맞춘다
    try { sessionStorage.setItem('mf-rejoin', JSON.stringify({ name: net.name, room: net.room })); } catch { /* 무시 */ }
    net.role = null;
    location.reload();
    return;
  }
  net.id = m.you;
  // 호스트 농장 그대로 불러오기 (내 저장본은 건드리지 않음)
  applySaveData(m.save);
  for (const it of [...G.items]) it.remove();
  items.clear();
  for (const v of G.vehicles) { v.auto = false; addVehicleUI(v); }
  for (const p of net.puppets.values()) { removeLabel(p.label); p.destroy(); }
  net.puppets.clear();
  G.players = [G.player];
  G.driving = null;
  fieldStr = ''; muckStr = '';
  ready = true;
  applyWorld(m.world);
  applyFast(m.fast, true);
  applyMid(m.mid);
  G.onNetInit?.();
}

function applyFast(m, snap = false) {
  if (!ready) return;
  tgt.v = m.v;
  let mine = null, myRide = null;
  m.v.forEach((s, i) => {
    const v = G.vehicles[i];
    if (!v) return;
    v.netT = s;
    const drv = s[7];
    if (drv === net.id) mine = v;
    v.driver = drv === net.id ? G.player : drv >= 0 ? (v.driver && v.driver !== G.player ? v.driver : { remote: true }) : null;
    v.boosting = !!s[8];
    const pas = s[13] ?? -1;
    if (pas === net.id) myRide = v;
    v.passenger = pas === net.id ? G.player : pas >= 0 ? (v.passenger && v.passenger !== G.player ? v.passenger : { remote: true }) : null;
    if (v.def.air && s.length > 14) {
      if (v.def.air === 'heli') { v.netHook = [s[14], s[15], s[16]]; v.coll = s[17]; }
      else { v.ail = s[14]; v.elev = s[15]; v.thrL = s[17]; }
    }
    if (snap) { v.pos.set(s[0], s[9] || 0, s[1]); v.heading = s[2]; }
  });
  if (myRide !== G.riding) { G.riding = myRide; sfx(myRide ? 'board' : 'unboard'); }
  if (mine !== G.driving) {
    const prev = G.driving;
    G.driving = mine;
    if (mine) { G.cam.dragT = 0; G.cam.fpOff = 0; sfx('board'); }
    else if (prev) { sfx('unboard'); G.cam.fpYaw = prev.heading; }
  }
  const seen = new Set();
  for (const [id, name, x, z, h, spd, vi, hop, inHouse] of m.p) {
    seen.add(id);
    let p;
    if (id === net.id) p = G.player;
    else {
      p = net.puppets.get(id);
      if (!p) {
        p = new Player(G.scene, lookFor(id), true);
        p.name = name;
        p.label = addLabel(() => ({ x: p.pos.x, y: 2.6, z: p.pos.z }), 'zone-label small', () => (p.netDriving >= 0 || p.netHidden ? '' : `🧑‍🌾 ${p.name}`));
        p.pos.set(x, 0, z);
        net.puppets.set(id, p);
        G.players = [G.player, ...net.puppets.values()];
      }
      p.netDriving = vi;
      p.netHidden = !!inHouse;
      p.group.visible = vi < 0 && !inHouse;
      if (vi >= 1000 && G.vehicles[vi - 1000]) G.vehicles[vi - 1000].passenger = p;
      else if (vi >= 0 && G.vehicles[vi]) G.vehicles[vi].driver = p;
    }
    p.netT = { x, z, h, spd };
    if (hop && !(p.hopT > 0)) p.hopT = 0.45;
    if (snap || id === net.id && Math.hypot(p.pos.x - x, p.pos.z - z) > 6) p.pos.set(x, 0, z);
  }
  for (const [id, p] of net.puppets) if (!seen.has(id)) { removeLabel(p.label); p.destroy(); net.puppets.delete(id); G.players = [G.player, ...net.puppets.values()]; }
}

function applyMid(m) {
  if (!ready) return;
  const seen = new Set();
  for (const [id, kind, product, sup, vi, px, py, pz, qx, qy, qz, qw] of m.items) {
    seen.add(id);
    let it = items.get(id);
    if (!it) { it = new Item(kind, product); items.set(id, it); }
    const veh = vi >= 0 ? G.vehicles[vi] : null;
    const parent = veh ? veh.group : G.scene;
    if (it.mesh.parent !== parent) parent.add(it.mesh);
    it.mesh.position.set(px, py, pz);
    it.mesh.quaternion.set(qx, qy, qz, qw);
    it.mesh.scale.setScalar(1);
    it.support = { kind: { d: 'dock', s: 'station', t: 'truck', g: 'ground', c: 'carried', b: 'barn' }[sup] || 'ground' };
    it.carriedBy = sup === 'c' ? veh : null;
    if (!veh) it.pos.set(px, py, pz);
  }
  for (const [id, it] of items) if (!seen.has(id)) { it.remove(); items.delete(id); }
  m.vx.forEach((s, i) => {
    const v = G.vehicles[i];
    if (!v) return;
    [v.load, v.loadKind, v.bulk, v.bulkKind, v.collected] = s;
    if (s[5]) v.mix = s[5];
    v.mixT = s[6]; v.dispensed = s[7]; v.skidMode = s[8]; v.status = s[9];
    v.carrying = s[10] ? { kind: s[10], product: s[11] } : null;
    v.pto = !!s[12];
    const auto = !!s[13];
    if (v.auto !== auto) { v.auto = auto; if (v.ui) v.ui.cb.checked = auto; }
    guestToolVisual(v);
  });
}

function applyWorld(m) {
  if (!ready) return;
  G.coins = m.coins; G.day = m.day; G.time = m.time; G.timeScale = m.ts || G.timeScale;
  Object.assign(G.prices, m.prices); Object.assign(G.upgrades, m.upgrades);
  G.fertileTimer = m.fertile; G.snackT = m.snack || 0;
  m.barns.forEach((s, i) => {
    const b = G.barns[i];
    if (!b) return;
    const [feed, happy, n, cap, cells, raw, compost, pallets, boost, exp] = s;
    b.feed = feed; b.happiness = happy; b.capacity = cap; b.boostT = boost; b.expansions = exp;
    while (b.animals.length < n && b.addAnimal(false));
    while (b.animals.length > n) b.removeAnimal();
    if (cells.length === b.cells.length) cells.forEach((a, j) => { b.cells[j].amt = a; });
    b.dirtyManure = true;
    b.shed.raw = raw; b.shed.compost = compost;
    b.pallets.length = 0;
    for (let j = 0; j < pallets; j++) b.pallets.push({ net: true });
    b.updateVisuals();
    b.shed.updateVisuals();
  });
  if (m.field !== fieldStr) { fieldStr = m.field; G.field.deserialize(m.field); }
  const ms = JSON.stringify(m.muck);
  if (ms !== muckStr) {
    muckStr = ms;
    for (const p of G.muck) G.scene.remove(p.mesh);
    G.muck.length = 0;
    for (const [x, z, a] of m.muck) addMuck(x, z, a);
  }
  for (const [id, name] of m.peers) net.peers.set(id, name);
  for (const id of [...net.peers.keys()]) if (!m.peers.some(([i]) => i === id)) net.peers.delete(id);
  updatePeersUI();
}

/** 버킷·적재함 등 짐 모양 (게스트 화면) */
function guestToolVisual(v) {
  const m = v.m;
  if (v.type === 'skid' && m.load) {
    m.load.visible = v.load > 0.3;
    const s = Math.min(1, v.load / 25);
    m.load.scale.set(0.6 + s * 0.4, 0.4 + s * 0.8, 0.6 + s * 0.4);
    v.tintLoad(m.load, v.loadKind);
  }
  if (v.isTruck && m.load) {
    m.load.visible = v.bulk > 0.3;
    const k = Math.min(1, v.bulk / (v.type === 'truck5' ? 75 : 30));
    m.load.scale.set(0.5 + k * 0.5, 0.3 + k * 1.2, 0.5 + k * 0.5);
    v.tintLoad(m.load, v.bulkKind);
  }
  if (v.type === 'baler' && m.lamps) for (let i = 0; i < 4; i++) m.lamps[i].material = i < v.collected ? v.lampOn : v.lampOff;
}

/** 게스트 게임 루프: 받은 상태를 부드럽게 따라가며 그리기 + 입력 보내기 */
let inT = 0;
const pressedBuf = new Set();
export function guestStep(dt) {
  if (net.role !== 'guest' || !ready) return;
  // 입력
  for (const c of TAPS) if (G.input.pressed(c)) pressedBuf.add(c);
  inT -= dt;
  if (inT <= 0) {
    inT = 1 / 20;
    const k = HELD.filter((c) => G.input.down(c));
    sendRaw({ t: 'in', k, p: [...pressedBuf], c: [G.cam.fp ? 1 : 0, r3(G.cam.yaw), r3(G.cam.fpYaw)], mode: G.settings.mode });
    pressedBuf.clear();
  }
  G.time += dt * G.timeScale;
  if (G.time >= 1440) G.time -= 1440;
  // 차량
  G.vehicles.forEach((v) => {
    const s = v.netT;
    if (!s) return;
    const L = 14;
    v.pos.x = damp(v.pos.x, s[0], L, dt);
    v.pos.z = damp(v.pos.z, s[1], L, dt);
    v.heading = dampAngle(v.heading, s[2], L, dt);
    v.speed = s[3];
    v.lift = damp(v.lift, s[4], L, dt);
    v.tilt = damp(v.tilt, s[5], L, dt);
    if (v.def.air) {
      v.pos.y = damp(v.pos.y, s[9] || 0, L, dt);
      v.roll = damp(v.roll || 0, s[10] || 0, L, dt);
      v.pitch = damp(v.pitch || 0, s[11] || 0, L, dt);
      v.rpm = s[12] || 0;
    }
    v.applyControls();
    v.animate(dt, s[6] * 2);
  });
  // 사람
  const all = [G.player, ...net.puppets.values()];
  for (const p of all) {
    const t = p.netT;
    if (!t) continue;
    p.pos.x = damp(p.pos.x, t.x, 14, dt);
    p.pos.z = damp(p.pos.z, t.z, 14, dt);
    p.heading = dampAngle(p.heading, t.h, 14, dt);
    p.speed = t.spd;
    if (p === G.player) {
      p.group.visible = !G.driving && !G.riding && !G.cam.fp;
    }
    p.animate(dt);
  }
  // 동물은 각자 화면에서 자유롭게 (모양만)
  for (const b of G.barns) {
    for (const a of b.animals) a.update(dt);
    b.updateVisuals();
  }
}

// ---------------- 게스트 → 호스트 명령 ----------------
export const guestCmd = {
  board: (v) => sendRaw({ t: 'board', vi: G.vehicles.indexOf(v) }),
  auto: (v, on) => sendRaw({ t: 'auto', vi: G.vehicles.indexOf(v), on }),
  ing: (kind) => sendRaw({ t: 'ing', kind }),
  chat: (msg) => sendRaw({ t: 'chat', msg }),
};

/** 호스트: 광장 게시판에 내 농장 올리기/내리기 */
export function setPublic(on) {
  if (net.role !== 'host') return;
  net.public = !!on;
  sendRaw({ t: 'public', on: net.public, title: `${net.name}의 농장` });
}

/** 호스트: 모두에게 알림 */
export function hostToast(msg, icon, ms) {
  if (net.role === 'host' && net.remotes.size) toGuests({ t: 'toast', msg, icon, ms });
}

// ---------------- 화면 위 접속자 표시 ----------------
export function updatePeersUI() {
  const el = document.getElementById('net-pill');
  if (!el) return;
  if (!net.role) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const names = net.role === 'host'
    ? [`👑 ${net.name}(나)`, ...[...net.remotes.values()].map((p) => p.name)]
    : [...net.peers.entries()].map(([id, n]) => (id === 0 ? `👑 ${n}` : id === net.id ? `${n}(나)` : n));
  el.innerHTML = `<b>🌐 방 ${net.room}</b> <span>${names.join(' · ')}</span>`;
  el.title = '같은 방 코드로 친구가 참여할 수 있어요';
}
