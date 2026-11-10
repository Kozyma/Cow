// HUD, 운전 패널, 월드 라벨, 토스트, 상점, 설정, 미니맵
import * as THREE from 'three';
import { G, LAYOUT, PRODUCTS, ANIMAL_DEFS, BARN_DEFS, BUCKET_CAP, TRUCK_BULK_CAP, COMPOST, INGREDIENTS, RECIPES, MIX_TIME, MIXER_CAP, VEHICLE_SHOP, MAX_VEHICLES } from './state.js';
import { stock, recipeOf, mixTotal, stationItems } from './feed.js';
import { bendY } from './materials.js';
import { sfx } from './audio.js';
import { Item, setOnDock, freeDockSlot, truckCargo, dockItems } from './items.js';
import { burst } from './particles.js';
import { saveSettings } from './settings.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const labels = [];
const floats = [];
const _v = new THREE.Vector3();
let shownCoins = 0;
let API = null;

// ---------------- 토스트 / 플로팅 텍스트 ----------------
export function toast(msg, icon = '🌼', ms = 3200) {
  const box = $('#toasts');
  if (!box) return;
  if (box.firstChild && box.firstChild.dataset.msg === msg) return;
  const t = el('div', 'toast', `<span class="t-ico">${icon}</span><span>${msg}</span>`);
  t.dataset.msg = msg;
  box.prepend(t);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
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
    <div class="v-top"><span class="v-num">${i + 1}</span><span class="v-ico">${v.def.icon}</span><b>${v.def.name}</b></div>
    <div class="v-status"></div>
    <div class="v-actions">
      <label class="switch" title="자동 운전"><input type="checkbox" ${v.auto ? 'checked' : ''}><span></span></label><span class="sw-lbl">자동</span>
      <button class="eye" title="이 차량 보기">👁</button>
    </div>`);
  c.style.setProperty('--vc', v.def.color);
  const cb = c.querySelector('input');
  cb.addEventListener('change', () => { API.setAuto(v, cb.checked); sfx('click'); toast(`${v.def.name} 자동 운전 ${cb.checked ? '켜짐' : '꺼짐'}`, v.def.icon, 1800); });
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
  addLabel(() => ({ x: v.pos.x, y: v.isTruck ? 4.2 : 3.6, z: v.pos.z }), 'veh-label', () => {
    if (G.driving === v || G.mode !== 'farm') return '';
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
  shownCoins = G.coins;
  buildSettings();
  $('#drive-panel').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-ing]');
    if (b && G.driving?.type === 'mixer') { e.preventDefault(); API.addIngredient(b.dataset.ing); }
  });
}

// ---------------- 모바일 터치 조작 ----------------
function initTouch() {
  const joy = $('#joy'), knob = $('#joy-knob');
  let id = null, cx = 0, cy = 0;
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const set = (dx, dy) => {
    const r = 46, l = Math.hypot(dx, dy);
    const k = l > r ? r / l : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const th = 14;
    G.input.hold('KeyW', dy < -th); G.input.hold('KeyS', dy > th);
    G.input.hold('KeyA', dx < -th); G.input.hold('KeyD', dx > th);
  };
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault(); id = e.pointerId; joy.setPointerCapture(id);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    set(e.clientX - cx, e.clientY - cy);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; for (const k of keys) G.input.hold(k, false); };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
  bindHold('#btn-e', 'KeyE', true);
  bindHold('#btn-space', 'Space', true);
  bindHold('#btn-v', 'KeyV', true);
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
    </div>` : '<div class="hh-tip">가구 앞에서 <kbd>E</kbd> — 🛏️ 잠자기 · 🍳 새참 · 💻 장부 · 📺 시세 · 🎹 피아노 · 🪴 물 주기 · 🐱 쓰다듬기</div>'}`;
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
      l.e.style.display = 'none';
      continue;
    }
    if (html !== l.html) { l.e.innerHTML = html; l.html = html; }
    l.e.style.display = '';
    l.e.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
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
  $('#mode-pill').innerHTML = G.settings.mode === 'sim' ? '🎛️ 시뮬레이션' : '🎮 간편';
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
  drawMinimap();
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
    $('#btn-e').textContent = '타기';
    $('#touch-hyd').classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  $('#touch-hyd').classList.toggle('hidden', !v.def.lift);
  const d = v.def, easy = G.settings.mode === 'easy';
  const kmh = Math.round(Math.abs(v.speed) * 3.6);
  const g = [];
  g.push(gauge('부스트', 1, v.boosting ? '🔥 ∞' : '∞', v.boosting ? 'boost on' : 'boost'));
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
  keys.push(`${kb('E')} 내리기`, `${kb('V')} 시점`);
  let tip = '';
  if (easy && v.type === 'mixer') tip = mixerTip(v);
  if (v.isTruck && v.nearStore()) tip = 'Space를 눌러 사료 가게에서 옥수수·대두박을 사요';
  else if (v.isTruck && v.atStation() && truckCargo(v).some((it) => it.kind === 'sack')) tip = 'Space를 눌러 원료를 배합장에 내려요';
  if (!easy && !tip) {
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
    <div class="dp-head"><span class="dp-ico">${d.icon}</span><b>${d.name}</b><span class="dp-mode">${easy ? '🎮 간편' : '🎛️ 시뮬레이션'}</span><span class="dp-speed"><b>${kmh}</b> km/h</span></div>
    <div class="dp-gauges">${g.join('')}</div>
    ${chips.length ? `<div class="dp-chips">${chips.join('')}</div>` : ''}
    ${tip ? `<div class="dp-tip">💡 ${tip}</div>` : ''}
    ${v.type === 'mixer' ? mixerButtons(v) : ''}
    <div class="dp-keys">${keys.map((k) => `<span>${k}</span>`).join('')}</div>`;
  if (panel.dataset.html !== html) { panel.innerHTML = html; panel.dataset.html = html; }
  $('#btn-space').textContent = d.personal ? '경적' : space ? (v.isTruck ? '상차/판매' : '작업') : '작업';
  $('#btn-e').textContent = '내리기';
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
const MM = 230;
function drawMinimapBg(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / MM;
  g.translate(size / 2, size / 2);
  g.scale(s, s);
  g.fillStyle = '#a6dc7e'; g.fillRect(-MM / 2, -MM / 2, MM, MM);
  g.fillStyle = '#f3e2b3';
  g.fillRect(-108, LAYOUT.roadZ - 2, 216, 4);
  g.strokeStyle = 'rgba(107,79,58,0.25)'; g.lineWidth = 1; g.strokeRect(-LAYOUT.bound, -LAYOUT.bound, LAYOUT.bound * 2, LAYOUT.bound * 2);
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

function drawMinimap() {
  const cv = $('#minimap');
  const size = cv.width;
  if (!mmBg) mmBg = drawMinimapBg(size);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.clip();
  g.translate(size / 2, size / 2);
  const yaw = G.cam.fp ? (G.driving ? G.driving.heading + G.cam.fpOff : G.cam.fpYaw) + Math.PI : G.cam.yaw;
  g.rotate(yaw);
  g.drawImage(mmBg, -size / 2, -size / 2);
  const s = size / MM;
  g.scale(s, s);
  for (const b of G.items) {
    g.fillStyle = b.kind === 'bale' ? '#f4d36b' : '#b9874f';
    g.fillRect(b.pos.x - 0.9, b.pos.z - 0.9, 1.8, 1.8);
  }
  for (const v of G.vehicles) {
    g.fillStyle = v.def.color;
    g.strokeStyle = '#fff'; g.lineWidth = 0.6;
    g.beginPath(); g.arc(v.pos.x, v.pos.z, v.isTruck ? 2.8 : 2.2, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const me = G.driving ? G.driving.pos : G.player.pos;
  const hd = G.driving ? G.driving.heading : G.player.heading;
  g.save();
  g.translate(me.x, me.z);
  g.rotate(-hd);
  g.fillStyle = '#ff6f91'; g.strokeStyle = '#fff'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(0, 3.6); g.lineTo(2.5, -2.2); g.lineTo(-2.5, -2.2); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.restore();
  g.strokeStyle = '#f1e3c8'; g.lineWidth = 4;
  g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.stroke();
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
    out.push({
      icon: barns[0].icon, name: `${ad.name} 한 마리`, desc: `${barns.length > 1 ? `축사 ${barns.length}동 · ` : ''}${total}/${cap}마리 · ${barns[0].pdef.icon} ${barns[0].pdef.name} 생산`,
      price: ad.price, can: !!room, why: '축사가 꽉 찼어요', buy: () => room.addAnimal(true),
    });
  }
  for (const b of G.barns) {
    out.push({
      icon: '🏗️', name: `${b.name} 확장${G.barns.filter((x) => x.id === b.id).length > 1 ? ` #${b.uid}` : ''}`, desc: `수용 +${b.def.expand}마리 (${b.expansions}/2단계)`,
      price: 700 * (1 + b.expansions), can: b.expansions < 2, why: '최대 확장', buy: () => { b.expansions++; b.capacity += b.def.expand; },
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
const EQUIP_ITEMS = () => Object.entries(VEHICLE_SHOP).map(([type, price]) => {
  const def = API.vehDefs()[type];
  const owned = G.vehicles.filter((v) => v.type === type).length;
  return {
    icon: def.icon, name: owned ? `${def.name} 한 대 더` : `${def.name}`, desc: `보유 ${owned}대 · 사면 주차장에 도착해요 (자동 운전 일꾼 포함)`,
    price, can: owned < 3 && G.vehicles.length < MAX_VEHICLES, why: owned >= 3 ? '최대 3대' : '주차장이 가득', buy: () => API.buyVehicle(type),
  };
});
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
      toast(it.after || `${it.name} 구매 완료!`, it.icon, 2400);
      renderShop();
    });
    list.appendChild(row);
  }
  $('#shop-coins').textContent = G.coins.toLocaleString('ko-KR');
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
      <div class="row"><span>마우스 감도</span>${slider('sensitivity', 0.3, 2, 0.1)}</div>
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
  box.querySelectorAll('input[type=checkbox][data-key]').forEach((c) => c.addEventListener('change', () => { G.settings[c.dataset.key] = c.checked; changed(); }));
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
