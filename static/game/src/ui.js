// HUD, 운전 패널, 월드 라벨, 토스트, 상점, 설정, 미니맵
import * as THREE from 'three';
import { G, LAYOUT, PRODUCTS, ANIMAL_DEFS, BARN_DEFS, BUCKET_CAP, TRUCK_BULK_CAP, COMPOST, INGREDIENTS, RECIPES, MIX_TIME, MIXER_CAP, VEHICLE_SHOP, MAX_ANIMALS, BARN_EXPAND_STEPS } from './state.js';
import { PARKING, parkRows, maxVehicles, parkingBlocker, addParkingRow } from './layout.js';
import { stock, recipeOf, mixTotal, stationItems } from './feed.js';
import { bendY } from './materials.js';
import { sfx } from './audio.js';
import { Item, setOnDock, freeDockSlot, truckCargo, dockItems } from './items.js';
import { burst } from './particles.js';
import { saveSettings } from './settings.js';
import { GRADES, SKINS, SLOTS, TIERS, gradeCost, applyGrade, applySkin, gradeLabel, skinBonus, setPart, partPrice } from './garage.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const labels = [];
const floats = [];
const _v = new THREE.Vector3();
let shownCoins = 0;
let API = null;

// ---------------- 알림 (🔔 한 줄 알림 + 기록함) / 플로팅 텍스트 ----------------
// 화면 가운데에 쌓이던 팝업 대신, 왼쪽 위 🔔 옆에 한 줄로 잠깐 보여 주고 기록함에 모아 둔다.
const NOTE_MAX = 40;
const notes = [];          // { msg, icon, at: '3일 07:20' }
const lastSeen = new Map(); // msg → 마지막으로 보여 준 시각 (같은 알림 반복 방지)
let unread = 0, noteTimer = 0;

const clockStr = () => {
  const t = Math.floor(G.time || 0), h = Math.floor(t / 60) % 24, m = t % 60;
  return `${G.day}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * @param opts.quiet true면 화면에 띄우지 않고 기록함에만 (내가 방금 한 행동의 확인 메시지 등)
 */
export function toast(msg, icon = '🌼', ms = 3200, opts = {}) {
  const now = performance.now();
  if (now - (lastSeen.get(msg) || -1e9) < 8000) return;   // 8초 안에 같은 말은 한 번만
  lastSeen.set(msg, now);
  if (lastSeen.size > 80) lastSeen.delete(lastSeen.keys().next().value);
  notes.unshift({ msg, icon, at: clockStr() });
  if (notes.length > NOTE_MAX) notes.pop();
  // 광장에서는 채팅창에 안내 한 줄로
  if (document.body.classList.contains('mode-plaza')) {
    const logEl = $('#p-log');
    if (logEl) {
      const line = el('div', 'p-line sys', `${icon} ${msg}`);
      logEl.append(line);
      while (logEl.children.length > 40) logEl.firstChild.remove();
      logEl.scrollTop = logEl.scrollHeight;
    }
    return;
  }
  const box = $('#notice');
  if (!box) return;
  const logOpen = !$('#notice-log').classList.contains('hidden');
  if (logOpen) { renderNoteLog(); return; }
  unread++;
  $('#notice-count').textContent = unread > 9 ? '9+' : String(unread);
  box.classList.add('has-unread');
  if (opts.quiet || G.settings?.notify === 'bell') {
    box.classList.remove('ping'); void box.offsetWidth; box.classList.add('ping');
    return;
  }
  $('#notice-text').innerHTML = `${icon} ${msg}`;
  box.classList.add('show');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => box.classList.remove('show'), Math.min(4500, Math.max(2200, ms)));
}

function renderNoteLog() {
  const list = $('#notice-log');
  list.innerHTML = `<div class="nl-head"><b>🔔 알림 기록</b><small>최근 ${NOTE_MAX}개</small></div>` +
    (notes.length ? notes.map((n) => `<div class="nl-row"><span class="nl-ico">${n.icon}</span><span class="nl-msg">${n.msg}</span><small>${n.at}</small></div>`).join('')
      : '<div class="nl-empty">아직 알림이 없어요</div>');
}

function initNotice() {
  const box = $('#notice'), list = $('#notice-log');
  const close = () => list.classList.add('hidden');
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = list.classList.contains('hidden');
    if (open) {
      renderNoteLog();
      const r = box.getBoundingClientRect();
      list.classList.remove('hidden');
      // 🔔 오른쪽 끝에 맞춰 아래로 펼치기 (화면 밖으로 나가지 않게)
      const w = list.offsetWidth;
      list.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
      list.style.top = `${Math.min(r.bottom + 6, window.innerHeight - list.offsetHeight - 8)}px`;
      unread = 0;
      box.classList.remove('has-unread', 'show');
    } else close();
    sfx('click');
  });
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  list.addEventListener('pointerdown', (e) => e.stopPropagation());
  window.addEventListener('pointerdown', close);
}

export function floatText(x, y, z, text, cls = '') {
  const e = el('div', `float ${cls}`, text);
  $('#labels').appendChild(e);
  floats.push({ e, x, y, z, t: 0 });
}

export function flashCoins() {
  const c = $('.pill.coin');
  c.classList.remove('bump');
  void c.offsetWidth;
  c.classList.add('bump');
}

export function setPrompt(text) {
  const p = $('#prompt');
  if (!text) { p.classList.add('hidden'); return; }
  if (p.dataset.text !== text) { p.innerHTML = text; p.dataset.text = text; }
  p.classList.remove('hidden');
}

/** 모바일 행동 버튼(E) 글자: 차량 근처면 '타기', 집 문 앞이면 '들어가기' 등. null이면 할 일 없음(흐리게) */
export function setActionLabel(text) {
  const b = $('#btn-e');
  if (!b || G.driving) return;
  const t = text || '✋ 행동';
  if (b.textContent !== t) b.textContent = t;
  b.classList.toggle('idle', !text);
}

const kb = (k) => `<kbd>${k}</kbd>`;

// ---------------- 초기화 ----------------
export function addBarnUI(b) {
  if (b.ui) return;
  const c = el('div', 'card barn', `
    <div class="card-head"><span class="emoji">${b.icon}</span><b>${b.name}</b><span class="count"></span></div>
    <div class="bar"><span class="lbl">사료</span><div class="track"><div class="fill feed"></div></div></div>
    <div class="bar"><span class="lbl">청결</span><div class="track"><div class="fill clean"></div></div></div>
    <div class="bar"><span class="lbl">행복</span><div class="track"><div class="fill happy"></div></div></div>
    <div class="prod"></div>
    <div class="shedrow"></div>`);
  c.addEventListener('click', () => API.lookAt(b.cx, b.front - 6));
  $('#barn-panel').appendChild(c);
  b.ui = { card: c, count: c.querySelector('.count'), feed: c.querySelector('.feed'), clean: c.querySelector('.clean'), happy: c.querySelector('.happy'), prod: c.querySelector('.prod'), shed: c.querySelector('.shedrow') };
  addLabel(() => ({ x: b.labelPos.x, y: b.labelPos.y, z: b.labelPos.z }), 'barn-label', () => {
    const alerts = [];
    if (b.feed < 20) alerts.push('<span class="alert">🌾 사료 부족</span>');
    if (b.manure > 60) alerts.push('<span class="alert">🧹 청소 필요</span>');
    if (b.pallets.length) alerts.push(`<span class="ok">📦 ${b.pallets.length}</span>`);
    return `<b>${b.icon} ${b.name}</b>${alerts.join('')}`;
  });
  addLabel(() => ({ x: b.dropPos.x, y: 1.0, z: b.dropPos.z }), 'zone-label small', () => '🌾 건초 내리는 곳');
  addLabel(() => ({ x: b.palletSlots[1].x, y: 1.6, z: b.palletSlots[1].z }), 'zone-label small', () => (b.pallets.length ? '' : '📦 팔레트 나오는 곳'));
  addLabel(() => ({ x: b.shed.x, y: 5.6, z: b.shed.front }), 'zone-label shed-label', () => {
    const sh = b.shed;
    return `♻️ ${sh.name} <span class="raw">💩 ${Math.round(sh.raw)}</span><span class="cmp">🟫 퇴비 ${Math.round(sh.compost)}</span>${sh.fermenting ? '<span class="steam">♨️</span>' : ''}`;
  });
  addLabel(() => ({ x: b.shed.loadPos.x, y: 0.6, z: b.shed.loadPos.z }), 'zone-label small', () => '🚚 퇴비 상차');
}

export function addVehicleUI(v) {
  if (v.ui) return;
  const i = G.vehicles.indexOf(v);
  const c = el('div', 'vcard', `
    <div class="v-top"><span class="v-num">${i + 1}</span><span class="v-ico">${v.def.icon}</span><b>${gradeLabel(v)}${v.def.name}</b></div>
    <div class="v-status"></div>
    <div class="v-actions">
      <label class="switch" title="자동 운전"><input type="checkbox" ${v.auto ? 'checked' : ''}><span></span></label><span class="sw-lbl">자동</span>
      <button class="eye" title="이 차량 보기">👁</button>
    </div>`);
  c.style.setProperty('--vc', v.def.color);
  const cb = c.querySelector('input');
  cb.addEventListener('change', () => { API.setAuto(v, cb.checked); sfx('click'); toast(`${v.def.name} 자동 운전 ${cb.checked ? '켜짐' : '꺼짐'}`, v.def.icon, 1800, { quiet: true }); });
  c.querySelector('.eye').addEventListener('click', (e) => { e.stopPropagation(); API.view(v); });
  // 카드 더블클릭(모바일 더블탭) → 바로 탑승. 자동 스위치·보기 버튼은 제외
  c.title = '더블클릭하면 바로 타요';
  let lastTap = 0, lastBoard = 0;
  const board = () => {
    const now = performance.now();
    if (now - lastBoard < 600) return;   // 두 방식이 동시에 잡혀도 한 번만
    lastBoard = now;
    API.board(v);
  };
  c.addEventListener('pointerup', (e) => {
    if (e.target.closest('.switch, .eye')) { lastTap = 0; return; }
    const now = performance.now();
    if (now - lastTap < 400) { lastTap = 0; board(); }
    else lastTap = now;
  });
  // 컴퓨터가 버벅여 손가락 탭 간격 계산이 늦어져도 브라우저의 더블클릭은 잡힌다
  c.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (!e.target.closest('.switch, .eye')) board();
  });
  $('#vehicle-dock').appendChild(c);
  v.ui = { card: c, status: c.querySelector('.v-status'), cb };
  addLabel(() => ({ x: v.pos.x, y: (v.isTruck ? 4.2 : v.def.air ? 4.4 : 3.6) + v.pos.y, z: v.pos.z }), 'veh-label', () => {
    if (G.driving === v || G.riding === v || G.mode !== 'farm') return '';
    return `${v.def.icon} <span>${v.auto ? shortStatus(v) : '수동'}</span>`;
  });
}

/** 배치가 바뀌었을 때 (새 축사, 이동) */
export function onLayoutChanged() {
  mmBg = null;
  for (const b of G.barns) addBarnUI(b);
}

export function initUI(api) {
  API = api;
  for (const b of G.barns) addBarnUI(b);
  addLabel(() => ({ x: LAYOUT.dock.x, y: 4.6, z: LAYOUT.dock.z }), 'zone-label', () => `📦 출하장 ${dockItems().length}/6`);
  addLabel(() => ({ x: LAYOUT.dock.bay.x, y: 0.6, z: LAYOUT.dock.bay.z }), 'zone-label small', () => '🚚 트럭 상차 위치');
  addLabel(() => ({ x: LAYOUT.market.x + 8, y: 6.5, z: LAYOUT.market.z }), 'zone-label', () => '🏪 판매소');
  addLabel(() => ({ x: LAYOUT.yard.x, y: 0.6, z: LAYOUT.yard.z + 3.8 }), 'zone-label', () => '🌾 건초 보관소');
  addLabel(() => ({ x: LAYOUT.station.x, y: 4.8, z: LAYOUT.station.z }), 'zone-label', () => { const st = stock(); return `🥣 배합장 · 🌾${st.hay} 🌽${st.corn} 🫘${st.soy}`; });
  addLabel(() => ({ x: LAYOUT.station.bay.x, y: 0.6, z: LAYOUT.station.bay.z }), 'zone-label small', () => '🚚 원료 하차 · 🥣 배합기 투입');
  addLabel(() => ({ x: LAYOUT.store.x - 7, y: 6, z: LAYOUT.store.z }), 'zone-label', () => '🌽 사료 가게');
  addLabel(() => ({ x: G.field.x0 + G.field.w / 2, y: 0.8, z: G.field.z0 - 1.2 }), 'zone-label', () => `🌱 목초지 · 다 자란 풀 ${G.field.counts.tall}`);
  addLabel(() => ({ x: G.farmhouse.door.x, y: 4.2, z: G.farmhouse.door.z - 1 }), 'zone-label', () => '🏠 우리 집');
  for (const v of G.vehicles) addVehicleUI(v);

  $('#btn-shop').addEventListener('click', () => api.toggleModal('shop'));
  $('#btn-help').addEventListener('click', () => api.toggleModal('help'));
  $('#btn-settings').addEventListener('click', () => api.toggleModal('settings'));
  $('#btn-cam').addEventListener('click', () => api.toggleFP());
  $('#btn-build').addEventListener('click', () => api.toggleBuild());
  $('#mode-pill').addEventListener('click', () => { setMode(G.settings.mode === 'sim' ? 'easy' : 'sim'); });
  document.querySelectorAll('.modal .close').forEach((b) => b.addEventListener('click', () => api.closeModals()));
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('pointerdown', (e) => { if (e.target === m) api.closeModals(); }));
  document.querySelectorAll('#shop-tabs button').forEach((b) => b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); sfx('click'); }));
  $('#build-done').addEventListener('click', () => api.toggleBuild());
  $('#btn-panel').addEventListener('click', () => document.body.classList.toggle('show-panel'));
  $('#btn-dock').addEventListener('click', () => document.body.classList.toggle('show-dock'));

  initTouch();
  initNotice();
  $('#btn-house').addEventListener('click', () => api.toggleHouse());
  shownCoins = G.coins;
  buildSettings();
  $('#drive-panel').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-ing]');
    if (b && G.driving?.type === 'mixer') { e.preventDefault(); API.addIngredient(b.dataset.ing); }
  });
}

// ---------------- 모바일 터치 조작 ----------------
let touchReady = false;
export function initTouch() {
  if (touchReady) return;
  touchReady = true;
  const joy = $('#joy'), knob = $('#joy-knob');
  let id = null, cx = 0, cy = 0;
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const set = (dx, dy) => {
    const r = Math.max(30, joy.clientWidth * 0.35), l = Math.hypot(dx, dy);
    const k = l > r ? r / l : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    // 아날로그 값: 가운데 데드존(18%)을 빼고 0~1로 다시 펼침
    let nx = (dx * k) / r, ny = (dy * k) / r;
    const m = Math.hypot(nx, ny), dz = 0.18;
    if (m < dz) { nx = 0; ny = 0; } else { const s = (m - dz) / (1 - dz) / m; nx *= s; ny *= s; }
    G.input.setAxis(nx, ny, true);
    // 키 입력도 함께 (온라인 친구 · 배치 변경 화면 이동 · 광장용)
    const th = 0.3;
    G.input.hold('KeyW', ny < -th); G.input.hold('KeyS', ny > th);
    G.input.hold('KeyA', nx < -th); G.input.hold('KeyD', nx > th);
  };
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault(); id = e.pointerId; joy.setPointerCapture(id);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    set(e.clientX - cx, e.clientY - cy);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; G.input.setAxis(0, 0, false); for (const k of keys) G.input.hold(k, false); };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
  bindHold('#btn-e', 'KeyE', true);
  bindHold('#btn-space', 'Space', true);
  bindHold('#btn-v', 'KeyV', true);
  // 말풍선 안내(예: 🏠 집에 들어가기)를 눌러도 행동 버튼과 같은 동작
  $('#prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); G.input.tap('KeyE'); });
  for (const [sel, code] of [['#btn-r', 'KeyR'], ['#btn-f', 'KeyF'], ['#btn-t', 'KeyT'], ['#btn-g', 'KeyG'], ['#btn-boost', 'ShiftLeft']]) bindHold(sel, code, false);
}

// ---------------- 배치 변경 · 집 HUD ----------------
export function setBuildHud(show, title = null, status = null) {
  const hud = $('#build-hud');
  hud.classList.toggle('hidden', !show);
  document.body.classList.toggle('mode-build', show);
  if (title !== null) $('#build-title').innerHTML = title || '🏗️ 옮길 건물(축사 · 배합장 · 출하장)을 클릭하세요';
  if (status !== null) $('#build-status').innerHTML = status;
  else if (title !== null) $('#build-status').innerHTML = 'W A S D로 화면 이동 · Esc/우클릭 취소';
}

export function openModalHtml(title, html) {
  $('#info-title').innerHTML = title;
  $('#info-body').innerHTML = html;
  API.toggleModal('info');
}

export function setHouseHud(show) {
  document.body.classList.toggle('mode-house', show);
  const hud = $('#house-hud');
  hud.classList.toggle('hidden', !show);
  if (!show) return;
  const H = API.house();
  const decor = H.decor;
  const inv = Object.entries(G.house.inventory).filter(([, n]) => n > 0);
  const FUR = API.furniture();
  hud.innerHTML = `
    <div class="hh-top"><b>🏠 우리 집</b>
      <button class="hh-btn ${decor ? 'on' : ''}" data-act="decor">${decor ? '✅ 꾸미기 끝' : '🎨 꾸미기'}</button>
      <button class="hh-btn" data-act="exit">🚪 나가기</button></div>
    ${decor ? `
    <div class="hh-decor">
      <div class="hh-row"><span>${H.holding ? `🖐 ${FUR[H.holding.p.id].icon} ${FUR[H.holding.p.id].name} 들고 있음` : '가구를 클릭해서 집어요'}</span>
        ${H.holding ? '<button class="hh-btn" data-act="rot">↻ 돌리기 (R)</button><button class="hh-btn" data-act="store">📦 보관 (X)</button>' : ''}</div>
      <div class="hh-row"><span>📦 보관함</span>${inv.length ? inv.map(([id, n]) => `<button class="hh-item" data-inv="${id}">${FUR[id].icon} ${FUR[id].name} ×${n}</button>`).join('') : '<small>비어 있어요 · 상점 🛋️ 가구 탭에서 사요</small>'}</div>
      <div class="hh-row"><span>🧱 벽지</span>${API.wallpapers().map((c, i) => `<button class="sw ${G.house.wall === i ? 'on' : ''}" style="--c:#${c.toString(16).padStart(6, '0')}" data-wall="${i}"></button>`).join('')}
        <span>🪵 바닥</span>${API.floors().map((c, i) => `<button class="sw ${G.house.floor === i ? 'on' : ''}" style="--c:#${c.toString(16).padStart(6, '0')}" data-floor="${i}"></button>`).join('')}</div>
      <div class="hh-row"><span>🏡 외벽</span>${API.extWalls().map((c, i) => `<button class="sw ${G.house.ext.wall === i ? 'on' : ''}" style="--c:#${c.toString(16).padStart(6, '0')}" data-ewall="${i}"></button>`).join('')}
        <span>🔺 지붕</span>${API.extRoofs().map((c, i) => `<button class="sw ${G.house.ext.roof === i ? 'on' : ''}" style="--c:#${c.toString(16).padStart(6, '0')}" data-eroof="${i}"></button>`).join('')}</div>
    </div>` : '<div class="hh-tip">가구 앞에서 <kbd>E</kbd> — 🛏️ 잠자기 · 🍳 새참 · 💻 장부 · 📺 시세 · 🎹 피아노 · 🪴 물 주기 · 🪧 방명록 · 🐱 쓰다듬기</div>'}`;
  hud.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    sfx('click');
    if (t.dataset.act === 'decor') API.setDecor(!decor);
    else if (t.dataset.act === 'exit') API.exitHouse();
    else if (t.dataset.act === 'rot') API.decorRotate();
    else if (t.dataset.act === 'store') API.decorStore();
    else if (t.dataset.inv) API.holdFromInventory(t.dataset.inv);
    else if (t.dataset.wall) { G.house.wall = Number(t.dataset.wall); API.applyRoom(); }
    else if (t.dataset.floor) { G.house.floor = Number(t.dataset.floor); API.applyRoom(); }
    else if (t.dataset.ewall) { G.house.ext.wall = Number(t.dataset.ewall); API.applyExt(); }
    else if (t.dataset.eroof) { G.house.ext.roof = Number(t.dataset.eroof); API.applyExt(); }
    setHouseHud(true);
  };
}

function bindHold(sel, code, tap) {
  const b = $(sel);
  if (!b) return;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (tap) G.input.tap(code); else G.input.hold(code, true); b.classList.add('down'); });
  const up = () => { if (!tap) G.input.hold(code, false); b.classList.remove('down'); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('pointercancel', up);
}

function shortStatus(v) {
  const s = v.status || '';
  return s.length > 16 ? s.slice(0, 15) + '…' : s;
}

export function addLabel(getPos, cls, getHtml) {
  const e = el('div', `wlabel ${cls}`);
  $('#labels').appendChild(e);
  const l = { e, getPos, getHtml, html: null };
  labels.push(l);
  return l;
}
export function removeLabel(l) {
  const i = labels.indexOf(l);
  if (i >= 0) labels.splice(i, 1);
  l?.e.remove();
}

export function setMode(mode) {
  G.settings.mode = mode;
  saveSettings();
  sfx('click');
  toast(mode === 'sim' ? '시뮬레이션 모드: R/F/T/G로 유압을 직접 조작해요' : '간편 모드: Space 한 번으로 작업을 자동으로 해요', mode === 'sim' ? '🎛️' : '🎮', 2600);
  syncSettingsUI();
}

// ---------------- 매 프레임 ----------------
export function updateLabels(dt) {
  const cam = G.camera;
  const w = window.innerWidth, h = window.innerHeight;
  const ref = G.cam.fp ? cam.position : G.camTarget;
  const maxD = G.cam.fp ? 60 : 55;
  for (const l of labels) {
    const p = l.getPos();
    const far = Math.hypot(p.x - ref.x, p.z - ref.z) > maxD;
    _v.set(p.x, bendY(p.x, p.y, p.z), p.z).project(cam);
    const html = far ? '' : l.getHtml();
    if (!html || _v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) {
      if (l.shown !== false) { l.e.style.display = 'none'; l.shown = false; }
      continue;
    }
    if (html !== l.html) { l.e.innerHTML = html; l.html = html; }
    if (l.shown !== true) { l.e.style.display = ''; l.shown = true; }
    // 최적화: 화면 위치가 1px 이상 바뀔 때만 스타일 갱신
    const sx = Math.round(((_v.x + 1) / 2) * w), sy = Math.round(((1 - _v.y) / 2) * h);
    if (sx !== l.sx || sy !== l.sy) { l.sx = sx; l.sy = sy; l.e.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    if (f.t > 1.6) { f.e.remove(); floats.splice(i, 1); continue; }
    _v.set(f.x, bendY(f.x, f.y + f.t * 1.2, f.z), f.z).project(cam);
    if (_v.z > 1) { f.e.style.display = 'none'; continue; }
    f.e.style.display = '';
    f.e.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%) scale(${f.t < 0.15 ? 0.5 + f.t * 3.3 : 1})`;
    f.e.style.opacity = f.t > 1.2 ? (1.6 - f.t) / 0.4 : 1;
  }
}

function fmtTime() {
  const m = Math.floor(G.time) % 1440;
  const hh = Math.floor(m / 60), mm = (Math.floor(m / 10) * 10) % 60;
  const ampm = hh < 12 ? '오전' : '오후';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${ampm} ${h12}:${String(mm).padStart(2, '0')}`;
}

export function updateUI(dt) {
  shownCoins += (G.coins - shownCoins) * Math.min(1, dt * 8);
  if (Math.abs(G.coins - shownCoins) < 1) shownCoins = G.coins;
  $('#coins').textContent = Math.round(shownCoins).toLocaleString('ko-KR');
  const hh = G.time / 60;
  $('#clock-ico').textContent = hh >= 5 && hh < 7 ? '🌅' : hh >= 7 && hh < 17.5 ? '☀️' : hh >= 17.5 && hh < 19.5 ? '🌇' : '🌙';
  $('#clock').textContent = `${G.day}일째 · ${fmtTime()}`;
  const fert = $('#fert');
  if (G.fertileTimer > 0) { fert.classList.remove('hidden'); fert.textContent = `🌱 성장촉진 ${Math.ceil(G.fertileTimer)}s`; }
  else fert.classList.add('hidden');
  $('#mode-pill').innerHTML = G.settings.mode === 'sim' ? '🎛️<span class="lbl"> 시뮬레이션</span>' : '🎮<span class="lbl"> 간편</span>';
  $('#btn-cam .i').textContent = G.cam.fp ? '👀' : '🎥';

  for (const b of G.barns) {
    const u = b.ui;
    u.count.textContent = `${b.animals.length}/${b.capacity}`;
    setBar(u.feed, b.feed / 100);
    setBar(u.clean, 1 - b.manure / 100);
    setBar(u.happy, b.happiness);
    const p = b.pdef;
    u.prod.innerHTML = `${p.icon} ${p.name} ${Math.floor(b.buffer)}/${p.pallet} <span class="pal">📦 ${b.pallets.length}/3</span>`;
    u.shed.innerHTML = `♻️ 퇴비사 💩 ${Math.round(b.shed.raw)} → 🟫 ${Math.round(b.shed.compost)}${b.shed.fermenting ? ' ♨️' : ''}`;
    u.card.classList.toggle('warn', b.feed < 15 || b.manure > 75 || b.pallets.length >= 3);
    u.card.classList.toggle('boost', b.boostT > 0);
    u.count.innerHTML = `${b.boostT > 0 ? '<span class="boost-tag">✨</span>' : ''}${b.animals.length}/${b.capacity}`;
  }
  for (const v of G.vehicles) {
    const u = v.ui;
    u.status.textContent = G.driving === v ? '🎮 직접 운전 중' : v.auto ? v.status : '⏸ 수동 모드';
    u.card.classList.toggle('viewing', G.viewTarget === v);
    if (u.cb.checked !== v.auto) u.cb.checked = v.auto;
  }
  updateDrivePanel();
}

function setBar(e, v) {
  const p = Math.max(0, Math.min(1, v));
  e.style.width = `${p * 100}%`;
  e.classList.toggle('low', p < 0.25);
}

function gauge(label, frac, text, cls = '') {
  return `<div class="gauge ${cls}"><span class="g-lbl">${label}</span><div class="track"><div class="fill" style="width:${Math.round(clamp01(frac) * 100)}%"></div></div><span class="g-val">${text}</span></div>`;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function updateDrivePanel() {
  const v = G.driving;
  const panel = $('#drive-panel');
  $('#vehicle-dock').classList.toggle('hidden', !!v);
  if (!v) {
    panel.classList.add('hidden');
    $('#btn-space').textContent = '점프';
    $('#touch-hyd').classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  $('#touch-hyd').classList.toggle('hidden', !(v.def.lift || v.def.air));
  // 항공기: R/F = 상승·하강, 헬기만 T/G(화물 줄)
  $('#btn-r').textContent = v.def.air ? '▲상승' : 'R▲';
  $('#btn-f').textContent = v.def.air ? '▼하강' : 'F▼';
  for (const id of ['#btn-t', '#btn-g']) $(id).classList.toggle('hidden', v.def.air === 'plane');
  $('#btn-t').textContent = v.def.air === 'heli' ? '줄↑' : 'T';
  $('#btn-g').textContent = v.def.air === 'heli' ? '줄↓' : 'G';
  const d = v.def, easy = G.settings.mode === 'easy';
  const kmh = Math.round(Math.abs(v.speed) * 3.6);
  const g = [];
  g.push(gauge('부스트', 1, v.boosting ? '🔥 ∞' : '∞', v.boosting ? 'boost on' : 'boost'));
  if (d.air) {
    g.push(gauge('고도', Math.min(1, v.pos.y / 60), `${Math.round(v.pos.y)}m`, 'lift'));
    const vs = v.vs || 0;
    g.push(gauge('상승률', Math.min(1, Math.abs(vs) / 5), `${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(1)}m/s`, Math.abs(vs) > 3.2 && v.pos.y < 6 && vs < 0 ? 'boost on' : 'mix'));
    if (d.air === 'heli') {
      g.push(gauge('출력', v.coll || 0, v.rpm < 0.95 ? `시동 ${Math.round(v.rpm * 100)}%` : `${Math.round((v.coll || 0) * 100)}%`, 'tilt'));
      if (v.carrying || v.winch) g.push(gauge('화물 줄', v.lift / 30, `${v.lift.toFixed(1)}m`, 'feedleft'));
    } else {
      g.push(gauge('스로틀', v.thrL || 0, v.rpm < 0.95 ? `시동 ${Math.round(v.rpm * 100)}%` : `${Math.round((v.thrL || 0) * 100)}%`, 'tilt'));
      g.push(gauge('플랩', v.tilt, v.tilt === 0 ? '올림' : v.tilt === 0.5 ? '10°' : '30°', 'feedleft'));
    }
  }
  if (d.lift) {
    const val = v.type === 'forklift' ? `${(v.lift + 0.18).toFixed(1)}m` : v.type === 'truck5' ? `${Math.round((v.lift / d.lift.max) * 50)}°` : v.lift < 0.2 ? '작업' : `${Math.round(v.lift * 100)}%`;
    g.push(gauge(d.lift.name, (v.lift - d.lift.min) / (d.lift.max - d.lift.min), val, 'lift'));
  }
  if (d.tilt) {
    const f = (v.tilt - d.tilt.min) / (d.tilt.max - d.tilt.min);
    const val = v.type === 'baler' || v.type === 'mixer' ? (v.tilt > 0.6 ? '열림' : v.tilt > 0.05 ? '…' : '닫힘') : v.type === 'skid' ? (v.tilt > 0.7 ? '쏟기' : v.tilt < -0.25 ? '젖힘' : '수평') : `${Math.round(v.tilt * 57)}°`;
    g.push(gauge(d.tilt.name, f, val, 'tilt'));
  }
  const chips = [];
  if (d.pto) chips.push(`<span class="chip ${v.pto ? 'on' : ''}">${d.pto} ${v.pto ? 'ON' : 'OFF'}</span>`);
  if (v.type === 'baler') chips.push(`<span class="chip ${v.collected >= 4 ? 'warn' : ''}">🌾 챔버 ${v.collected}/4</span>`);
  if (v.type === 'skid' && easy) chips.push(`<span class="chip ${v.skidMode === 'dump' ? 'warn' : 'on'}">${v.skidMode === 'dump' ? '⤵️ 쏟기 모드' : '➖ 수평 모드'}</span>`);
  if (v.type === 'skid') chips.push(`<span class="chip">${v.loadKind === 'compost' ? '🟫 퇴비' : '💩 분뇨'} 버킷 ${Math.round((v.load / BUCKET_CAP) * 100)}%</span>`);
  if (v.carrying) chips.push(`<span class="chip on">${v.carrying.kind === 'bale' ? '🌾 건초' : PRODUCTS[v.carrying.product].icon + ' 팔레트'} 들고 있음</span>`);
  if (v.isTruck) chips.push(`<span class="chip">📦 적재 ${truckCargo(v).length}/${v.m.slots.length}</span>`);
  if (v.type === 'mixer') {
    const total = mixTotal(v);
    const rec = recipeOf(v.mix);
    chips.push(`<span class="chip">🌾 ${v.mix.hay} · 🌽 ${v.mix.corn} · 🫘 ${v.mix.soy} (${total}/${MIXER_CAP})</span>`);
    if (total) chips.push(`<span class="chip ${rec ? 'on' : 'warn'}">${rec ? RECIPES[rec].icon + ' ' + RECIPES[rec].name : '❔ 레시피 불일치 (잡사료)'}</span>`);
    g.push(gauge('배합', total ? v.mixT / MIX_TIME : 0, total ? (v.isMixed() ? '완료' : `${Math.round((v.mixT / MIX_TIME) * 100)}%`) : '-', 'mix'));
    if (total) g.push(gauge('남은 사료', v.feedLeft() / (MIXER_CAP * 22), `${Math.round(v.feedLeft())}`, 'feedleft'));
  }
  if (v.type === 'balewagon') chips.push(`<span class="chip ${truckCargo(v).length >= v.m.slots.length ? 'warn' : ''}">🌾 데크 ${truckCargo(v).length}/${v.m.slots.length}</span>`);
  if (v.isTruck && v.bulk > 0.3) chips.push(`<span class="chip on">${v.bulkKind === 'compost' ? '🟫 퇴비' : '💩 분뇨'} ${Math.round(v.bulk)}/${TRUCK_BULK_CAP[v.type]}</span>`);

  const keys = [`${kb('W')}${kb('S')} 전진·후진`, `${kb('A')}${kb('D')} 조향`, `${kb('Shift')} 부스트`];
  let space = '';
  if (v.type === 'tractor' || v.type === 'baler') space = `${d.pto} 켜기/끄기${easy ? ' (자동으로 내림)' : ''}`;
  else if (v.isTruck) space = '상차(출하장·퇴비사) · 구매(사료 가게) · 하차(배합장) · 판매(판매소)';
  else if (v.type === 'balewagon') space = easy ? '건초 집기·싣기 / 데크 하차 자동' : '';
  else if (v.type === 'mixer') space = easy ? '배합장: 레시피 자동 투입 · 통로: 배출 · 그 외: 오거' : '오거 켜기/끄기 (배합·배출)';
  else if (d.personal) space = '경적 울리기';
  else space = easy ? (v.type === 'skid' ? (v.carrying ? '내려놓기' : v.skidMode === 'dump' ? '버킷 수평으로 (→ 앞으로 가면 퍼담기)' : '버킷 쏟기') : '들기·내리기 자동') : '';
  if (d.lift) {
    const nm = { tractor: '예초기', baler: '픽업', forklift: '포크', skid: '암', truck5: '적재함', balewagon: '집게' }[v.type];
    keys.push(`${kb('R')}${kb('F')} ${nm} 올리기·내리기`);
  }
  if (d.tilt) {
    const nm = { baler: '뒷문 열기·닫기', forklift: '마스트 젖히기·숙이기', skid: '버킷 젖히기·쏟기', mixer: '배출구 열기·닫기', balewagon: '데크 들기·내리기' }[v.type];
    keys.push(`${kb('T')}${kb('G')} ${nm}`);
  }
  if (space) keys.push(`${kb('Space')} ${space}`);
  if (v.type === 'mixer') keys.push(`${kb('1')}${kb('2')}${kb('3')} 건초·옥수수·대두박 넣기 (배합장)`);
  if (d.air === 'heli') keys.splice(0, keys.length, `${kb('W')}${kb('S')} 앞·뒤`, `${kb('R')}${kb('F')} 상승·하강`, `${kb('A')}${kb('D')} 선회`, `${kb('Space')} ${v.carrying ? '짐 내려놓기 (자동)' : '짐 걸기 · 빈 곳이면 후크 감기 🪝'}`);
  if (d.air === 'plane') keys.splice(0, keys.length, `${kb('W')}${kb('S')} 출력 올리기·내리기`, `${kb('R')}${kb('F')} 상승·하강`, `${kb('A')}${kb('D')} 선회`, `${kb('Space')} 플랩`);
  keys.push(`${kb('E')} 내리기`, `${kb('V')} 시점`);
  let tip = '';
  if (d.air === 'heli') {
    if (!v.airborne) tip = v.rpm < 0.95 ? '로터가 다 돌 때까지 기다렸다가 R로 떠올라요' : v.carrying ? '짐을 매단 채 R로 천천히 올라가요 (짐 무게만큼 출력이 더 필요해요)' : 'R로 떠올라요 · 팔레트를 매달아 판매소에 내려놓으면 팔려요';
    else if (v.winch?.mode === 'down') tip = '🪝 후크가 짐까지 내려가는 중… 그대로 떠 있어요';
    else if (v.winch?.mode === 'set') tip = '🪝 줄을 풀어 짐을 내려놓는 중…';
    else if (v.carrying) tip = '짐이 흔들려요! 천천히 멈춰요 · 내려놓을 곳(판매소·출하장·트럭) 위에서 Space';
    else tip = Math.abs(v.speed) > 6 ? '손을 떼도 관성으로 계속 가요 · S로 기수를 들어 멈춰요' : '짐 위에서 Space → 후크가 자동으로 내려가 걸어요 · 빈 곳에서 Space → 후크 감기';
  }
  if (d.air === 'plane') {
    const kmh = Math.round(v.V * 3.6);
    if (v.stalled) tip = '⚠️ 실속! F로 기수를 내리고 W로 출력을 올려요';
    else if (!v.airborne && v.pos.y <= 0.001) tip = v.V > 11 ? 'R로 기수를 들어 이륙!' : v.thrL < 0.9 ? 'W로 출력을 끝까지 올려 활주로를 달려요 (플랩 10° 추천)' : `가속 중… ${kmh}km/h (약 45km/h면 뜰 수 있어요)`;
    else if (v.V < 13) tip = '속도가 느려요! 너무 느리면 날개가 양력을 잃어요(실속)';
    else tip = '기울여야 돌아요(A/D) · 착륙: 출력을 줄이고 플랩 30°, 활주로 앞에서 천천히 내려와요';
  }
  if (easy && v.type === 'mixer') tip = mixerTip(v);
  if (v.isTruck && v.nearStore()) tip = 'Space를 눌러 사료 가게에서 옥수수·대두박을 사요';
  else if (v.isTruck && v.atStation() && truckCargo(v).some((it) => it.kind === 'sack')) tip = 'Space를 눌러 원료를 배합장에 내려요';
  if (!easy && !tip && !d.air) {
    if (v.type === 'forklift') tip = v.carrying ? '내려놓을 곳에서 F로 포크를 내리면 놓여요 (트럭 적재함 위도 가능)' : '포크를 바닥까지 내리고(F) 짐 아래로 밀어 넣은 뒤 R로 들어올려요';
    else if (v.type === 'skid') tip = v.load > 0 ? (v.loadKind === 'compost' ? '트럭 적재함 위로 암을 올리고(R) G로 쏟아 퇴비를 실어요' : '축사 뒤 퇴비사 분뇨칸(왼쪽)에서 G로 버킷을 쏟아요') : '암을 바닥까지 내리고(F) 앞으로 밀면 분뇨(우리 바닥)나 퇴비(퇴비사 오른쪽)가 담겨요';
    else if (v.type === 'tractor') tip = 'F로 예초기를 내리고 Space로 칼날을 돌려요';
    else if (v.type === 'baler') tip = v.collected >= 4 ? 'T로 뒷문을 열어 건초를 내보내세요!' : 'F로 픽업을 내리고 Space로 릴을 돌려 벤 풀 위를 지나가요';
    else if (v.type === 'truck5') tip = v.bulk > 0 ? (v.bulkKind === 'compost' ? '판매소에서 Space로 팔거나, 목초지에서 R로 적재함을 들어 거름으로 뿌려요' : '퇴비사 앞에서 R로 적재함을 들어 분뇨를 내려요') : '퇴비사 앞 상차 위치에서 Space로 퇴비를 실어요';
    else if (v.type === 'truck1') tip = v.bulk > 0 ? '판매소에서 Space로 퇴비를 팔아요' : '';
    else if (v.type === 'mixer') tip = mixerTip(v);
    else if (v.type === 'balewagon') tip = v.carrying ? 'R로 집게를 끝까지 올리면 건초가 데크로 넘어가요' : truckCargo(v).length ? '축사 통로·건초 보관소·배합장에서 T로 데크를 들면 건초를 내려요 (더 실으려면 F로 집게를 내려 건초 앞으로)' : 'F로 집게를 바닥까지 내리고 건초를 집게 사이에 넣은 뒤 R로 들어올려요';
  }
  const html = `
    <div class="dp-head"><span class="dp-ico">${d.icon}</span><b>${d.name}</b><span class="dp-mode">${d.air ? '🛩️ 비행' : easy ? '🎮 간편' : '🎛️ 시뮬레이션'}</span><span class="dp-speed"><b>${kmh}</b> km/h</span></div>
    <div class="dp-gauges">${g.join('')}</div>
    ${chips.length ? `<div class="dp-chips">${chips.join('')}</div>` : ''}
    ${tip ? `<div class="dp-tip">💡 ${tip}</div>` : ''}
    ${v.type === 'mixer' ? mixerButtons(v) : ''}
    <div class="dp-keys">${keys.map((k) => `<span>${k}</span>`).join('')}</div>`;
  if (panel.dataset.html !== html) { panel.innerHTML = html; panel.dataset.html = html; }
  $('#btn-space').textContent = d.air === 'heli' ? (v.winch && v.winch.mode !== 'up' ? '멈추기' : v.carrying ? '내려놓기' : '후크') : d.air === 'plane' ? '플랩' : d.personal ? '경적' : space ? (v.isTruck ? '상차/판매' : '작업') : '작업';
  $('#btn-e').textContent = '🚪 내리기';
  $('#btn-e').classList.remove('idle');
}

function mixerTip(v) {
  const total = mixTotal(v);
  if (v.atStation() && total < MIXER_CAP && !v.dispensed) return '아래 버튼(또는 1·2·3 키)으로 원료를 넣어요. 동물별 레시피 비율을 맞추면 맞춤 사료가 돼요!';
  if (!total) return '배합장(보라색 원)으로 가서 원료를 넣어요';
  if (!v.isMixed()) return v.pto ? '오거가 돌며 배합 중… 다 섞이면 축사 통로로!' : 'Space로 오거를 돌려 원료를 섞어요';
  return '축사 가운데 통로를 천천히 지나가며 T로 배출구를 열면 사료가 급여돼요';
}

function mixerButtons(v) {
  const st = stock();
  const at = v.atStation();
  const rec = Object.entries(RECIPES).map(([k, r]) => `<span>${r.icon} ${r.hay ? `🌾${r.hay} ` : ''}🌽${r.corn} 🫘${r.soy}</span>`).join('');
  return `<div class="dp-mix">
    <div class="mix-btns">${['hay', 'corn', 'soy'].map((k, i) => `<button data-ing="${k}" ${at ? '' : 'disabled'}>${kb(i + 1)} ${INGREDIENTS[k].icon} ${INGREDIENTS[k].name} <small>재고 ${st[k]}</small></button>`).join('')}</div>
    <div class="recipes">📖 레시피 ${rec}</div>
  </div>`;
}

/** 사료 가게 */
export function renderStore(truck) {
  const list = $('#store-list');
  list.innerHTML = '';
  if (!truck) return;
  const free = truck.m.slots.length - truckCargo(truck).length;
  $('#store-coins').textContent = G.coins.toLocaleString('ko-KR');
  $('#store-info').innerHTML = `${truck.def.icon} ${truck.def.name} 적재함 빈 칸 <b>${free}</b> / ${truck.m.slots.length}`;
  for (const k of ['corn', 'soy']) {
    const ing = INGREDIENTS[k];
    const row = el('div', 'shop-item', `
      <div class="s-ico">${ing.icon}</div>
      <div class="s-txt"><b>${ing.name} 1팔레트</b><small>${k === 'corn' ? '에너지가 높은 곡물 · 모든 배합에 들어가요' : '단백질 사료 · 모든 배합에 들어가요'}</small></div>
      <button class="buy" ${free <= 0 || G.coins < ing.price ? 'disabled' : ''}>${free <= 0 ? '적재함 가득' : `🪙 ${ing.price}`}</button>`);
    row.querySelector('.buy').addEventListener('click', () => { if (truck.buyIngredient(k)) { toast(`${ing.name} 구매! 트럭에 실었어요`, ing.icon, 1600); renderStore(truck); } });
    list.appendChild(row);
  }
  const rec = Object.values(RECIPES).map((r) => `<div>${r.icon} <b>${r.name}</b> — ${r.hay ? `🌾 건초 ${r.hay} · ` : ''}🌽 옥수수 ${r.corn} · 🫘 대두박 ${r.soy}</div>`).join('');
  $('#store-recipes').innerHTML = `<h3>📖 배합 레시피 (비율)</h3>${rec}<p>배합장에 원료를 내려두고 🥣 배합기로 섞어서 축사 통로에 배출하세요. 레시피가 맞으면 생산량이 크게 늘어요!</p>`;
}

// ---------------- 미니맵 ----------------
let mmBg = null;
const MM = 470;
const MM_PX = 3;   // 배경 해상도 (픽셀/m)
const MM_ZOOM = [75, 140, MM / 2];   // 미니맵에 보이는 반경(m): 가까이 · 중간 · 전체 (미니맵을 눌러 바꾸기)
let mmZoom = 0, mmR = MM_ZOOM[0], mmF = 0;   // mmF: 0 = 내 위치 중심, 1 = 지도 중심 (부드럽게 전환)
function drawMinimapBg() {
  const size = MM * MM_PX;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = MM_PX;
  g.translate(size / 2, size / 2);
  g.scale(s, s);
  g.fillStyle = '#a6dc7e'; g.fillRect(-MM / 2, -MM / 2, MM, MM);
  g.fillStyle = '#f3e2b3';
  g.fillRect(-LAYOUT.bound + 2, LAYOUT.roadZ - 2, LAYOUT.bound * 2 - 4, 4);
  g.fillRect(-22, 37.5, 4, 50); g.fillRect(-72, 86, 52, 4);
  const AF = LAYOUT.airfield;
  g.fillStyle = '#8a8f9c'; g.fillRect(AF.runway.x - AF.runway.len / 2, AF.runway.z - AF.runway.w / 2, AF.runway.len, AF.runway.w);
  g.fillStyle = '#7cb7f0'; g.fillRect(AF.hangar.x - 8, AF.hangar.z - 5.5, 16, 11);
  g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(AF.heli.x, AF.heli.z, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3e2b3';
  g.strokeStyle = 'rgba(107,79,58,0.35)'; g.lineWidth = 1; g.strokeRect(-LAYOUT.bound, -LAYOUT.bound, LAYOUT.bound * 2, LAYOUT.bound * 2);
  g.fillRect(-4.8, -4, 3.6, 23);
  g.fillRect(-31, 19.5, 44, 18);
  const f = LAYOUT.field;
  g.fillStyle = '#7fc464'; g.fillRect(f.x0, f.z0, f.cols * f.tile, f.rows * f.tile);
  const p = LAYOUT.pond;
  g.fillStyle = '#7fd0ea'; g.beginPath(); g.arc(p.x, p.z, p.r, 0, Math.PI * 2); g.fill();
  for (const b of G.barns) {
    g.fillStyle = '#' + b.def.roof.toString(16).padStart(6, '0');
    g.fillRect(b.minX, b.back, b.maxX - b.minX, b.front - b.back);
    g.fillStyle = '#e6e1d6';
    g.fillRect(b.alley.minX, b.back, b.alley.maxX - b.alley.minX, b.front - b.back);
  }
  g.fillStyle = '#fff1d6'; g.fillRect(LAYOUT.farmhouse.x - 3.5, LAYOUT.farmhouse.z - 3, 7, 6);
  g.fillStyle = '#ffd6de'; g.fillRect(LAYOUT.farmhouse.x - 3.5, LAYOUT.farmhouse.z - 3, 7, 1.5);
  const S = LAYOUT.station;
  g.fillStyle = '#9b8cff'; g.fillRect(S.x - S.w / 2, S.z - S.d / 2, S.w, S.d);
  g.fillStyle = '#ffb84d'; g.fillRect(LAYOUT.store.x - 10, LAYOUT.store.z - 4, 6, 8);
  const d = LAYOUT.dock;
  g.fillStyle = '#ffb84d'; g.fillRect(d.x - d.w / 2, d.z - d.d / 2, d.w, d.d);
  g.fillStyle = '#ff8fab'; g.beginPath(); g.arc(LAYOUT.market.x, LAYOUT.market.z, LAYOUT.market.r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#a8743f';
  for (const b of G.barns) g.fillRect(b.shed.x - b.shed.w / 2, b.shed.back, b.shed.w, b.shed.front - b.shed.back);
  return c;
}

let mmBound = false;
export function drawMinimap(dt = 0.016) {
  if (G.mode === 'house') return;
  const cv = $('#minimap');
  if (!mmBound) {
    mmBound = true;
    cv.style.pointerEvents = 'auto'; cv.style.cursor = 'pointer';
    cv.title = '눌러서 확대/축소';
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      mmZoom = (mmZoom + 1) % MM_ZOOM.length;
      sfx('click');
    });
  }
  // 화면 크기 × 기기 배율에 맞춰 선명하게 (숨겨져 있으면 그리지 않음)
  const css = cv.clientWidth;
  if (!css) return;
  const want = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
  if (cv.width !== want) { cv.width = cv.height = want; }
  const size = cv.width, half = size / 2, px = size / css;   // px: CSS 1픽셀당 캔버스 픽셀
  if (!mmBg) mmBg = drawMinimapBg();
  const ease = Math.min(1, dt * 8);
  mmR += (MM_ZOOM[mmZoom] - mmR) * ease;
  mmF += ((mmZoom === MM_ZOOM.length - 1 ? 1 : 0) - mmF) * ease;
  if (Math.abs(mmF - Math.round(mmF)) < 0.002) mmF = Math.round(mmF);
  const R = mmR, sc = half / R;   // m → 캔버스 픽셀
  const me = G.driving ? G.driving.pos : G.player.pos;
  const hd = G.driving ? G.driving.heading : G.player.heading;
  // 전체 지도에서는 지도 가운데 고정, 그 외에는 내 위치가 가운데
  const cx = me.x * (1 - mmF), cz = me.z * (1 - mmF);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath(); g.arc(half, half, half - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#86b866'; g.fillRect(0, 0, size, size);   // 맵 바깥
  g.translate(half, half);
  const yaw = G.cam.fp ? (G.driving ? G.driving.heading + G.cam.fpOff : G.cam.fpYaw) + Math.PI : G.cam.yaw;
  g.rotate(yaw);
  g.scale(sc, sc);
  g.translate(-cx, -cz);
  g.imageSmoothingEnabled = true;
  g.drawImage(mmBg, -MM / 2, -MM / 2, MM, MM);
  // 아이템 · 차량 · 다른 사람은 확대와 관계없이 일정한 크기로
  const u = px / sc;   // CSS 1픽셀 = u m
  for (const b of G.items) {
    g.fillStyle = b.kind === 'bale' ? '#f4d36b' : '#b9874f';
    const r = 1.6 * u;
    g.fillRect(b.pos.x - r, b.pos.z - r, r * 2, r * 2);
  }
  g.lineWidth = 1.2 * u; g.strokeStyle = '#fff';
  for (const v of G.vehicles) {
    if (v === G.driving) continue;
    g.fillStyle = v.def.color;
    g.beginPath(); g.arc(v.pos.x, v.pos.z, (v.isTruck ? 3.6 : 3) * u, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  for (const pl of G.players || []) {
    if (!pl || pl === G.player || !pl.pos || pl.driving) continue;
    g.fillStyle = '#5aa9ff';
    g.beginPath(); g.arc(pl.pos.x, pl.pos.z, 3 * u, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.restore();

  // 내 위치: 화면 기준 고정 크기 마커 (맥박 링 + 흰 테두리 화살표)
  g.save();
  g.beginPath(); g.arc(half, half, half - 1, 0, Math.PI * 2); g.clip();
  const dx = me.x - cx, dz = me.z - cz, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const mx = half + (dx * cy - dz * sy) * sc, my = half + (dx * sy + dz * cy) * sc;
  const t = (performance.now() / 1000) % 1.4 / 1.4;
  g.strokeStyle = `rgba(255,79,129,${0.75 * (1 - t)})`; g.lineWidth = 2.5 * px;
  g.beginPath(); g.arc(mx, my, (7 + t * 12) * px, 0, Math.PI * 2); g.stroke();
  g.translate(mx, my);
  g.rotate(yaw - hd);
  const k = px * (css < 110 ? 0.85 : 1);
  g.shadowColor = 'rgba(60,30,20,0.45)'; g.shadowBlur = 4 * px;
  g.fillStyle = '#ff4f81'; g.strokeStyle = '#fff'; g.lineWidth = 2.2 * px; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, 10 * k); g.lineTo(7 * k, -6 * k); g.lineTo(0, -2.5 * k); g.lineTo(-7 * k, -6 * k); g.closePath();
  g.fill(); g.shadowBlur = 0; g.stroke();
  g.restore();

  // 북쪽 표시 (지도가 시점에 따라 돌아가므로)
  const nr = half - 9 * px;
  const nx = half + Math.sin(yaw) * nr, ny = half - Math.cos(yaw) * nr;
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(nx, ny, 7 * px, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c0392b'; g.font = `bold ${9 * px}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', nx, ny + 0.5 * px);

  g.strokeStyle = '#f1e3c8'; g.lineWidth = 3 * px;
  g.beginPath(); g.arc(half, half, half - 1.5 * px, 0, Math.PI * 2); g.stroke();
}

// ---------------- 상점 (탭) ----------------
let shopTab = 'animal';
const FARM_ITEMS = () => {
  const out = [];
  // 동물 (축사 종류별로 빈 자리 있는 곳에)
  for (const type of ['cow', 'hanwoo', 'pig', 'chicken']) {
    const barns = G.barns.filter((b) => b.animalType === type);
    if (!barns.length) continue;
    const ad = ANIMAL_DEFS[type];
    const room = barns.find((b) => b.animals.length < b.capacity);
    const total = barns.reduce((n, b) => n + b.animals.length, 0), cap = barns.reduce((n, b) => n + b.capacity, 0);
    const free = cap - total;
    out.push({
      icon: barns[0].icon, name: `${ad.name} 한 마리`, desc: `${barns.length > 1 ? `축사 ${barns.length}동 · ` : ''}${total}/${cap}마리 · ${barns[0].pdef.icon} ${barns[0].pdef.name} 생산`,
      price: ad.price, can: !!room, why: '축사가 꽉 찼어요 (확장하세요)', buy: () => room.addAnimal(true),
    });
    // 많이 키울 때 편하게: 5마리 한 번에
    if (cap > 10) {
      out.push({
        icon: barns[0].icon, name: `${ad.name} 5마리 한 번에`, desc: `빈 자리 ${free}마리`,
        price: ad.price * 5, can: free >= 5, why: '빈 자리 부족', buy: () => { let n = 5; for (const b of barns) while (n > 0 && b.addAnimal(n === 5)) n--; },
        after: `${ad.name} 5마리가 들어왔어요!`,
      });
    }
  }
  for (const b of G.barns) {
    // 축사 하나에 최대 MAX_ANIMALS마리까지, BARN_EXPAND_STEPS단계로 나눠 넓힌다
    const step = Math.ceil((MAX_ANIMALS - b.def.cap) / BARN_EXPAND_STEPS);
    const add = Math.min(step, MAX_ANIMALS - b.capacity);
    out.push({
      icon: '🏗️', name: `${b.name} 확장${G.barns.filter((x) => x.id === b.id).length > 1 ? ` #${b.uid}` : ''}`,
      desc: b.capacity >= MAX_ANIMALS ? `최대 ${MAX_ANIMALS}마리까지 넓혔어요` : `수용 +${add}마리 (지금 ${b.capacity}마리 → 최대 ${MAX_ANIMALS}마리) · 사료통·바닥도 함께 커져요`,
      price: 700 * (1 + Math.min(b.expansions, 6)), can: b.capacity < MAX_ANIMALS, why: '최대 확장',
      buy: () => { b.expansions++; b.capacity = Math.min(MAX_ANIMALS, b.capacity + add); },
    });
  }
  for (const d of BARN_DEFS) {
    const owned = G.barns.filter((b) => b.id === d.id).length;
    const price = d.buildPrice ?? (d.id === 'cow' ? 7000 : d.id === 'pig' ? 6000 : 5000);
    out.push({
      icon: d.icon, name: owned ? `${d.name} 하나 더 짓기` : `✨ ${d.name} 짓기`, desc: `${d.id === 'hanwoo' ? '누렁이 한우를 키워 🥩 한우 선물세트를 생산해요 · ' : ''}원하는 자리에 배치해요 (퇴비사 포함)`,
      price, can: owned < 2, why: '최대 2동', build: d.id,
    });
  }
  return out;
};
const MAX_PER_TYPE = 5;
const EQUIP_ITEMS = () => [parkingItem(), ...Object.entries(VEHICLE_SHOP).map(([type, price]) => {
  const def = API.vehDefs()[type];
  const owned = G.vehicles.filter((v) => v.type === type).length;
  const max = def.air ? 1 : MAX_PER_TYPE;   // 항공기는 주기장 자리가 하나씩
  const t = def.tier ? TIERS[def.tier] : null;
  const fly = def.fly ? (type === 'jet' ? ' · 추력이 아주 커서 빠르고 날렵해요, 부스트는 애프터버너 🔥' : ' · 묵직하게 길게 달려 이륙하고, 빠르게 순항해요') : '';
  return {
    icon: def.icon, name: `${t ? `<span class="g-tier" style="--tc:${t.color}">${t.name}</span> ` : ''}${owned && max > 1 ? `${def.name} 한 대 더` : def.name}`,
    desc: `보유 ${owned}대 · ${def.air ? '비행장에 도착해요' : '사면 주차장에 도착해요 (자동 운전 일꾼 포함)'}${fly}`,
    price, can: owned < max && G.vehicles.length < maxVehicles(), why: owned >= max ? (max === 1 ? '보유 중' : `최대 ${max}대`) : '주차장이 가득', buy: () => API.buyVehicle(type),
  };
})];
/** 🅿️ 주차장 넓히기: 남쪽으로 한 줄(8칸)씩 */
function parkingItem() {
  const rows = parkRows(), maxed = rows >= PARKING.maxRows;
  const blocker = maxed ? null : parkingBlocker();
  return {
    icon: '🅿️', name: '주차장 넓히기 (+8칸)',
    desc: `지금 ${rows}줄 · ${maxVehicles()}칸 (차량 ${G.vehicles.length}대) · 남쪽으로 한 줄씩 최대 ${PARKING.maxRows}줄`
      + (blocker ? ` · ⚠️ 넓힐 자리에 ${blocker}이(가) 있어요 (배치 변경으로 옮겨 주세요)` : ''),
    price: PARKING.prices[Math.min(rows, PARKING.prices.length - 1)] || 0,
    can: !maxed && !blocker, why: maxed ? '최대 크기' : '자리가 막혔어요',
    buy: () => addParkingRow(), after: '주차장을 넓혔어요! 차량을 8대 더 세울 수 있어요',
  };
}
const FURN_ITEMS = () => Object.entries(API.furniture()).map(([id, f]) => {
  const inv = G.house.inventory[id] || 0;
  const placed = G.house.placed.filter((p) => p.id === id).length;
  return {
    icon: f.icon, name: f.name, desc: `${f.act ? `🎯 ${f.actName} · ` : ''}크기 ${f.w}×${f.d} · 배치 ${placed} / 보관 ${inv}`,
    price: f.price, can: true, buy: () => { G.house.inventory[id] = inv + 1; },
    after: '보관함에 넣었어요. 집에서 🎨 꾸미기로 배치해요',
  };
});
const ETC_ITEMS = () => [
  {
    icon: '⚙️', name: '자동 운전 업그레이드', desc: `일꾼들의 운전 속도 +12% (${G.upgrades.autoSpeed}/3단계)`,
    price: 800 * (1 + G.upgrades.autoSpeed), can: G.upgrades.autoSpeed < 3, why: '최대 단계', buy: () => { G.upgrades.autoSpeed++; },
  },
  { icon: '🧪', name: '목초 비료', desc: '2분 동안 목초지가 2.5배 빨리 자라요', price: 150, can: true, buy: () => { G.fertileTimer = Math.min(300, G.fertileTimer + 120); } },
  {
    icon: '🌾', name: '건초 한 더미 주문', desc: '출하장 빈 칸에 건초 1개가 배달돼요', price: 60, can: !!freeDockSlot(), why: '출하장이 가득',
    buy: () => { const sl = freeDockSlot(); const it = new Item('bale'); setOnDock(it, sl); it.pop = 0.001; burst('star', sl.x, 1, sl.z, 8); },
  },
];

export function renderShop() {
  const list = $('#shop-list');
  list.innerHTML = '';
  document.querySelectorAll('#shop-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === shopTab));
  if (shopTab === 'garage') { renderGarage(list); $('#shop-coins').textContent = G.coins.toLocaleString('ko-KR'); return; }
  const items = shopTab === 'animal' ? FARM_ITEMS() : shopTab === 'equip' ? EQUIP_ITEMS() : shopTab === 'furn' ? FURN_ITEMS() : ETC_ITEMS();
  for (const it of items) {
    const afford = G.coins >= it.price;
    const row = el('div', `shop-item ${!it.can ? 'maxed' : ''}`, `
      <div class="s-ico">${it.icon}</div>
      <div class="s-txt"><b>${it.name}</b><small>${it.desc}</small></div>
      <button class="buy" ${!it.can || !afford ? 'disabled' : ''}>${!it.can ? it.why : `🪙 ${it.price.toLocaleString('ko-KR')}`}</button>`);
    row.querySelector('.buy').addEventListener('click', () => {
      if (!it.can || G.coins < it.price) { sfx('error'); return; }
      if (it.build) { API.closeModals(); API.startBuild(it.build); return; }
      G.coins -= it.price;
      it.buy();
      sfx('buy');
      toast(it.after || `${it.name.replace(/<[^>]+>/g, '')} 구매 완료!`, it.icon, 2400);
      renderShop();
    });
    list.appendChild(row);
  }
  $('#shop-coins').textContent = G.coins.toLocaleString('ko-KR');
}

// ---------------- 🎨 차고: 모델(등급) · 페인트 ----------------
let garageSel = 0;
const statBar = (label, val, base) => {
  const pct = Math.round(Math.min(1, val / (base * 1.35)) * 100);
  const d = val / base - 1;
  const tag = Math.abs(d) < 0.01 ? '' : `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${Math.round(d * 100)}%</em>`;
  return `<div class="g-stat"><span>${label}</span><i><b style="width:${pct}%"></b></i>${tag}</div>`;
};
function renderGarage(list) {
  const vs = G.vehicles;
  if (garageSel >= vs.length) garageSel = 0;
  const v = vs[garageSel];
  const wrap = el('div', 'garage');
  // 차량 고르기
  const pick = el('div', 'g-pick');
  vs.forEach((x, i) => {
    const b = el('button', `g-car ${i === garageSel ? 'on' : ''}`, `<span>${x.def.icon}</span><small>${i + 1}. ${gradeLabel(x)}${x.def.name}</small>`);
    b.style.setProperty('--vc', x.def.color);
    b.addEventListener('click', () => { garageSel = i; sfx('click'); renderShop(); });
    pick.appendChild(b);
  });
  wrap.appendChild(pick);
  const b = v.baseDef;
  const busy = v.driver && v.driver !== G.player;
  wrap.appendChild(el('div', 'g-head', `<span class="g-ico">${v.def.icon}</span><div><b>${gradeLabel(v)}${v.def.name}</b><small>${v.def.air ? '' : `${GRADES[v.grade].name} · `}${SKINS[v.skin].name}${busy ? ' · 다른 사람이 운전 중' : ''}</small></div>`));
  if (!v.def.air) wrap.appendChild(el('div', 'g-stats', statBar('최고 속도', v.def.maxSpeed, b.maxSpeed) + statBar('가속', v.def.accel, b.accel) + statBar('회전', v.def.turn, b.turn)));
  // 모델(등급)
  wrap.appendChild(el('div', 'g-title', v.def.air ? '✈️ 항공기는 페인트만 바꿀 수 있어요' : '🏭 브랜드(모델) <small>회사마다 차체 모양·투톤·엠블럼·성능이 달라요 · 사면 그 브랜드 기본 파츠도 함께</small>'));
  if (!v.def.air) {
    const grid = el('div', 'g-grades');
    for (const [id, g] of Object.entries(GRADES)) {
      const cost = gradeCost(v.type, id, VEHICLE_SHOP);
      const cur = v.grade === id;
      const t = TIERS[g.tier];
      const btn = el('button', `g-grade ${cur ? 'on' : ''}`, `<span class="g-tier" style="--tc:${t.color}">${t.name}</span><b>${g.icon} ${g.name}</b><small>${g.desc}</small><span class="g-price">${cur ? '사용 중' : cost ? `🪙 ${cost.toLocaleString('ko-KR')}` : '무료'}</span>`);
      btn.style.setProperty('--tc', t.color);
      btn.disabled = cur || G.coins < cost;
      btn.addEventListener('click', () => {
        if (cur || G.coins < cost) { sfx('error'); return; }
        G.coins -= cost;
        applyGrade(v, id, true);
        refreshVehicleCard(v);
        sfx('buy');
        burst('star', v.pos.x, 2.5, v.pos.z, 14, { vy: 5 });
        toast(`${v.def.name} → ${g.icon} ${g.name}(으)로 바꿨어요`, v.def.icon, 2200);
        renderShop();
      });
      grid.appendChild(btn);
    }
    wrap.appendChild(grid);
    // 커스텀 파츠: 자리마다 하나씩
    wrap.appendChild(el('div', 'g-title', '🔧 커스텀 파츠 <small>자리마다 하나씩 · 한 번 사면 모든 차에 달 수 있어요</small>'));
    const box = el('div', 'g-parts');
    for (const [slot, def] of Object.entries(SLOTS)) {
      const row = el('div', 'g-slot', `<span class="g-slot-name">${def.icon} ${def.name}</span>`);
      const chips = el('div', 'g-chips');
      const cur = v.custom?.[slot] || null;
      const none = el('button', `g-chip ${!cur ? 'on' : ''}`, '없음');
      none.addEventListener('click', () => { if (!cur) return; setPart(v, slot, null); sfx('click'); renderShop(); });
      chips.appendChild(none);
      for (const [id, [label, price]] of Object.entries(def.parts)) {
        const owned = G.partsOwned.includes(id);
        const on = cur === id;
        const chip = el('button', `g-chip ${on ? 'on' : ''} ${owned ? '' : 'locked'}`, `${label}${owned || on ? '' : ` <em>🪙${price}</em>`}`);
        chip.disabled = !on && !owned && G.coins < price;
        chip.addEventListener('click', () => {
          if (on) return;
          if (!owned) {
            if (G.coins < price) { sfx('error'); return; }
            G.coins -= price;
            G.partsOwned.push(id);
          }
          setPart(v, slot, id);
          sfx('buy');
          burst('star', v.pos.x, 2.5, v.pos.z, 8, { vy: 4 });
          renderShop();
        });
        chips.appendChild(chip);
      }
      row.appendChild(chips);
      box.appendChild(row);
    }
    wrap.appendChild(box);
  }
  // 페인트
  wrap.appendChild(el('div', 'g-title', `🎨 페인트 <small>한 번 사면 모든 차에 칠할 수 있어요${v.def.air ? '' : ' · 희귀 이상은 능력치 보너스'}</small>`));
  const sw = el('div', 'g-skins');
  for (const [id, s] of Object.entries(SKINS)) {
    const owned = id === 'base' || G.skinsOwned.includes(id);
    const cur = v.skin === id;
    const t = TIERS[s.tier];
    const bonus = v.def.air ? '' : skinBonus(s);
    const chip = s.rainbow ? 'linear-gradient(135deg,#ff6b7a,#ffd84d,#5fd4b4,#6fb8f0,#b49cf0)' : (s.color || b.color);
    const btn = el('button', `g-skin ${cur ? 'on' : ''} ${owned ? '' : 'locked'} tier-${s.tier}`, `<span class="g-tier" style="--tc:${t.color}">${t.name}</span><i style="background:${chip}"></i><b>${s.name}</b>${bonus ? `<em>${bonus}</em>` : ''}<small>${cur ? '칠함' : owned ? '칠하기' : `🪙 ${s.price.toLocaleString('ko-KR')}`}</small>`);
    btn.style.setProperty('--tc', t.color);
    btn.disabled = cur || (!owned && G.coins < s.price);
    btn.addEventListener('click', () => {
      if (cur) return;
      if (!owned) {
        if (G.coins < s.price) { sfx('error'); return; }
        G.coins -= s.price;
        G.skinsOwned.push(id);
      }
      applySkin(v, id);
      sfx('buy');
      burst('star', v.pos.x, 2.5, v.pos.z, 12, { vy: 4 });
      toast(`${v.def.name}을(를) ${s.name}으로 칠했어요`, '🎨', 2000);
      renderShop();
    });
    sw.appendChild(btn);
  }
  wrap.appendChild(sw);
  wrap.appendChild(el('div', 'g-eye', ''));
  const eye = el('button', 'g-view', '👁 이 차 보러 가기');
  eye.addEventListener('click', () => { API.closeModals(); API.view(v); });
  wrap.lastChild.appendChild(eye);
  list.appendChild(wrap);
}
/** 차량 카드 이름(등급 표시) 다시 쓰기 */
export function refreshVehicleCard(v) {
  const n = v.ui?.card.querySelector('.v-top b');
  if (n) n.textContent = `${gradeLabel(v)}${v.def.name}`;
}

// ---------------- 설정 ----------------
function seg(key, options) {
  return `<div class="seg" data-key="${key}">${options.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join('')}</div>`;
}
function toggle(key) {
  return `<label class="switch big"><input type="checkbox" data-key="${key}"><span></span></label>`;
}
function slider(key, min, max, step) {
  return `<input type="range" class="slider" data-key="${key}" min="${min}" max="${max}" step="${step}">`;
}

function buildSettings() {
  const box = $('#settings-body');
  box.innerHTML = `
    <section>
      <h3>🎮 조작 방식</h3>
      <div class="mode-cards">
        <button class="mode-card" data-mode="sim">
          <div class="mc-ico">🎛️</div><b>시뮬레이션</b>
          <small>유압 레버를 직접 조작해요<br>${kb('R')}${kb('F')} 올리기·내리기 · ${kb('T')}${kb('G')} 기울이기<br>포크를 짐 아래로 넣고 들어올리고, 버킷을 내려 분뇨를 밀어 담아요</small>
        </button>
        <button class="mode-card" data-mode="easy">
          <div class="mc-ico">🎮</div><b>간편</b>
          <small>${kb('Space')} 한 번이면 끝!<br>들기·내리기·퍼담기·쏟기·건초 배출을 자동으로 해줘요<br>(R/F/T/G 직접 조작도 가능)</small>
        </button>
      </div>
    </section>
    <section>
      <h3>🎥 카메라</h3>
      <div class="row"><span>운전할 때 카메라가 차량 뒤를 따라가기</span>${toggle('camFollow')}</div>
      <div class="row"><span>시작할 때 1인칭 시점</span>${toggle('fpDefault')}</div>
      <div class="row"><span>${G.isMobile ? '화면 끌기 감도' : '마우스 감도'}</span>${slider('sensitivity', 0.3, 2, 0.1)}</div>
      ${G.isMobile ? `<div class="row"><span>화면 회전 고정 (전체화면 · 폰을 기울여도 가로/세로가 안 바뀜)</span>${toggle('lockScreen')}</div>` : ''}
    </section>
    <section>
      <h3>🔔 알림</h3>
      <div class="row"><span>알림 보여 주기</span>${seg('notify', [['line', '한 줄로 잠깐'], ['bell', '🔔에만 모으기']])}</div>
      <p class="set-note">왼쪽 위 🔔을 누르면 지난 알림을 모아 볼 수 있어요.</p>
    </section>
    <section>
      <h3>✨ 그래픽</h3>
      <div class="row"><span>그림자</span>${seg('shadows', [['high', '높음'], ['low', '낮음'], ['off', '끄기']])}</div>
      <div class="row"><span>둥근 지평선 효과</span>${toggle('curve')}</div>
    </section>
    <section>
      <h3>🔊 소리</h3>
      <div class="row"><span>배경음악</span>${slider('music', 0, 1, 0.05)}</div>
      <div class="row"><span>효과음</span>${slider('sfx', 0, 1, 0.05)}</div>
    </section>
    <section>
      <h3>⏰ 게임</h3>
      <div class="row"><span>하루 길이</span>${seg('dayLength', [[4, '4분'], [6, '6분'], [10, '10분'], [16, '16분']])}</div>
      <div class="row"><span>저장 데이터</span><button class="danger" id="btn-reset">처음부터 다시하기</button></div>
    </section>`;
  box.querySelectorAll('.mode-card').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  box.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const k = s.dataset.key;
    G.settings[k] = typeof G.settings[k] === 'number' ? Number(b.dataset.v) : b.dataset.v;
    changed();
  })));
  box.querySelectorAll('input[type=checkbox][data-key]').forEach((c) => c.addEventListener('change', () => {
    G.settings[c.dataset.key] = c.checked;
    if (c.dataset.key === 'lockScreen') {
      if (c.checked) API.lockScreen();
      else { try { screen.orientation?.unlock?.(); } catch { /* 미지원 */ } if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }
    }
    changed();
  }));
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { G.settings[r.dataset.key] = Number(r.value); changed(false); }));
  let armed = false;
  $('#btn-reset').addEventListener('click', (e) => {
    if (!armed) { armed = true; e.target.textContent = '정말요? 한 번 더 누르면 초기화'; setTimeout(() => { armed = false; e.target.textContent = '처음부터 다시하기'; }, 3000); return; }
    API.resetGame();
  });
  syncSettingsUI();
}

function changed(click = true) {
  saveSettings();
  API.applySettings();
  if (click) sfx('click');
  syncSettingsUI();
}

export function syncSettingsUI() {
  const box = $('#settings-body');
  if (!box) return;
  box.querySelectorAll('.mode-card').forEach((b) => b.classList.toggle('on', b.dataset.mode === G.settings.mode));
  box.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(G.settings[s.dataset.key]) === b.dataset.v)));
  box.querySelectorAll('input[type=checkbox][data-key]').forEach((c) => { c.checked = !!G.settings[c.dataset.key]; });
  box.querySelectorAll('input[type=range]').forEach((r) => { r.value = G.settings[r.dataset.key]; });
}
