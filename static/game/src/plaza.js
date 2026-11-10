// 🏞️ 마을 광장: 모두가 모여 걷고 · 말하고 · 서로의 농장에 초대하는 곳
//  광장은 농장 계산이 없어서 서버가 위치·채팅·초대만 중계한다.
//  농장으로 갈 때는 초대한 사람이 방장(호스트)이 되고, 초대받은 사람이 그 방에 참여한다.
import * as THREE from 'three';
import { G } from './state.js';
import { mat, glow, curveUniforms } from './materials.js';
import { part, group, rbox, box, sphere, cyl, cone, torus, rand, pick, damp, dampAngle, clamp } from './util.js';
import { makeFarmer, makeCow, makeChicken, LOOKS } from './models.js';
import { sfx, initAudio, setVolumes } from './audio.js';
import { toast, initTouch } from './ui.js';

const R_PLAZA = 40;             // 걸어 다닐 수 있는 반지름
const EMOTES = ['👋', '❤️', '😂', '🎉', '👍', '😮', '🐮', '🌾'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const plaza = {
  active: false, ws: null, id: 0, name: '', look: 0,
  scene: null, me: null, others: new Map(), colliders: [], water: [],
  farms: [], pending: new Map(),   // 내가 보낸 초대: pid → 방 코드
  onGoFarm: null,                  // main.js가 연결: ({ kind:'host'|'join', room, open }) => void
};

// ---------------- 장면 ----------------
function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcdeeff);
  scene.fog = new THREE.Fog(0xcdeeff, 60, 140);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa8d08a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff6e6, 2.2);
  sun.position.set(25, 40, 18);
  sun.castShadow = G.settings.shadows !== 'off';
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const col = plaza.colliders;
  const circle = (x, z, r) => col.push({ x, z, r });

  // 땅: 잔디 + 둥근 광장 + 네 갈래 길
  const flat = (geo, m, y, x = 0, z = 0) => { geo.rotateX(-Math.PI / 2); const mesh = part(scene, geo, m, x, y, z); mesh.castShadow = false; mesh.receiveShadow = true; return mesh; };
  flat(new THREE.CircleGeometry(90, 64), mat(0x9fd67a), 0);
  flat(new THREE.CircleGeometry(19, 64), mat(0xeadbb8), 0.02);
  flat(new THREE.RingGeometry(18.6, 19.4, 64), mat(0xd2bf98), 0.03);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const p = flat(new THREE.PlaneGeometry(5, 26), mat(0xeadbb8), 0.015, Math.sin(a) * 30, Math.cos(a) * 30);
    p.rotation.y = a;
  }
  // 바닥 무늬 돌
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    flat(new THREE.CircleGeometry(0.55, 6), mat(i % 2 ? 0xf6ecd2 : 0xdccaa3), 0.035, Math.sin(a) * 13.5, Math.cos(a) * 13.5);
  }

  // 분수
  const f = group(scene);
  part(f, cyl(4.2, 4.5, 0.8, 32), mat(0xf3ead8), 0, 0.4, 0);
  part(f, torus(4.2, 0.28, 8, 40), mat(0xffffff), 0, 0.82, 0, Math.PI / 2, 0, 0);
  const water = part(f, cyl(3.9, 3.9, 0.1, 32), glow(0x8fd6f0, 0.25), 0, 0.72, 0);
  water.castShadow = false;
  part(f, cyl(0.5, 0.7, 2.2, 16), mat(0xf3ead8), 0, 1.6, 0);
  part(f, cyl(1.6, 0.6, 0.45, 24), mat(0xf3ead8), 0, 2.8, 0);
  part(f, cyl(1.4, 1.4, 0.08, 24), glow(0x8fd6f0, 0.3), 0, 3.0, 0);
  part(f, sphere(0.45, 14, 10), mat(0xff8fab), 0, 3.4, 0);
  for (let i = 0; i < 10; i++) {
    const d = part(f, sphere(0.12, 8, 6), glow(0xbfeaff, 0.4), 0, 3, 0);
    d.castShadow = false;
    plaza.water.push({ mesh: d, a: (i / 10) * Math.PI * 2, t: i / 10 });
  }
  circle(0, 0, 4.7);

  // 벤치 8개 (분수를 바라봄)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 10.5, z = Math.cos(a) * 10.5;
    const b = group(scene, x, 0, z);
    b.rotation.y = a + Math.PI;
    part(b, rbox(2.2, 0.14, 0.7, 0.05), mat(0xc98a5a), 0, 0.55, 0);
    part(b, rbox(2.2, 0.5, 0.12, 0.05), mat(0xc98a5a), 0, 0.9, -0.32, -0.15, 0, 0);
    for (const s of [-0.9, 0.9]) part(b, box(0.12, 0.55, 0.6), mat(0x6b5a50), s, 0.27, 0);
    circle(x, z, 1.0);
  }
  // 가로등 + 줄 깃발
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.sin(a) * 17, z = Math.cos(a) * 17;
    const l = group(scene, x, 0, z);
    part(l, cyl(0.1, 0.14, 3.6, 8), mat(0x4a6b5a), 0, 1.8, 0);
    part(l, sphere(0.34, 12, 10), glow(0xfff0b8, 0.3), 0, 3.75, 0);
    part(l, cone(0.42, 0.3, 10), mat(0x4a6b5a), 0, 4.15, 0);
    circle(x, z, 0.3);
    lamps.push(new THREE.Vector3(x, 3.4, z));
  }
  const flagCols = [0xff8fab, 0xffd34d, 0x8fd16a, 0x7cb7f0, 0xc9a7ff];
  for (let i = 0; i < lamps.length; i++) {
    const a = lamps[i], b = lamps[(i + 1) % lamps.length];
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const sag = Math.sin(t * Math.PI) * 0.7;
      const fl = part(scene, cone(0.22, 0.45, 3), mat(flagCols[(i + k) % flagCols.length]), a.x + (b.x - a.x) * t, a.y - sag - 0.25, a.z + (b.z - a.z) * t, Math.PI, Math.atan2(b.x - a.x, b.z - a.z), 0);
      fl.castShadow = false;
    }
  }
  // 게시판 (열린 농장)
  const bd = group(scene, 0, 0, -15.5);
  for (const s of [-1.6, 1.6]) part(bd, cyl(0.12, 0.12, 2.8, 8), mat(0x8a5f3c), s, 1.4, 0);
  part(bd, rbox(3.8, 2.0, 0.18, 0.08), mat(0xc98a5a), 0, 2.0, 0);
  part(bd, rbox(3.4, 1.6, 0.2, 0.06), mat(0xfff3dc), 0, 2.0, 0.02);
  part(bd, rbox(4.4, 0.18, 0.9, 0.06), mat(0xff8fab), 0, 3.15, 0, 0.2, 0, 0);
  for (let i = 0; i < 5; i++) part(bd, rbox(0.55, 0.4, 0.05, 0.03), mat(pick([0xffd34d, 0x8fd16a, 0x7cb7f0, 0xffb38a])), -1.2 + i * 0.6, 2.1 + (i % 2) * 0.35, 0.13, 0, 0, rand(-0.15, 0.15));
  circle(0, -15.5, 2.1);
  // 소 · 닭 친구들 (장식)
  const cow = makeCow(0);
  cow.group.position.set(-13, 0, 6); cow.group.rotation.y = 1.9; scene.add(cow.group);
  circle(-13, 6, 1.5);
  const cow2 = makeCow(2);
  cow2.group.position.set(14, 0, -6); cow2.group.rotation.y = -2.4; scene.add(cow2.group);
  circle(14, -6, 1.5);
  plaza.animals = [cow, cow2];
  plaza.chicks = [];
  for (let i = 0; i < 4; i++) {
    const c = makeChicken(i % 2 === 0);
    c.group.position.set(rand(-6, 6) + 22, 0, rand(-6, 6));
    scene.add(c.group);
    plaza.chicks.push({ m: c, x: c.group.position.x, z: c.group.position.z, tx: 22, tz: 0, t: 0, h: 0, ph: rand(0, 6) });
  }
  // 나무 · 꽃밭
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), r = rand(25, 55);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(x) < 4 || Math.abs(z) < 4) continue;   // 길 비우기
    const t = group(scene, x, 0, z);
    const s = rand(0.8, 1.3);
    part(t, cyl(0.25 * s, 0.35 * s, 2.2 * s, 8), mat(0x8a5f3c), 0, 1.1 * s, 0);
    if (Math.random() < 0.5) part(t, sphere(1.6 * s, 12, 10), mat(pick([0x7fc464, 0x6db857, 0x94d07a])), 0, 3.0 * s, 0);
    else { part(t, cone(1.6 * s, 2.6 * s, 10), mat(0x5fae5a), 0, 3.0 * s, 0); part(t, cone(1.2 * s, 2.0 * s, 10), mat(0x6dbb63), 0, 4.1 * s, 0); }
    circle(x, z, 0.6 * s);
  }
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), r = rand(20, 30);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(x) < 3.2 || Math.abs(z) < 3.2) continue;
    const fl = part(scene, sphere(0.18, 8, 6), mat(pick([0xff8fab, 0xffd34d, 0xc9a7ff, 0xff7b6b, 0xffffff])), x, 0.25, z);
    fl.castShadow = false;
    part(scene, cyl(0.03, 0.03, 0.25, 4), mat(0x5fae5a), x, 0.12, z).castShadow = false;
  }
  scene.traverse((o) => { if (o.isMesh && o.castShadow !== false) o.castShadow = true; });
  return scene;
}

// ---------------- 사람 (나 · 다른 사람) ----------------
class Avatar {
  constructor(name, look, mine = false) {
    this.m = makeFarmer(LOOKS[look % LOOKS.length]);
    this.group = this.m.group;
    plaza.scene.add(this.group);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }));
    sh.position.y = 0.05;
    this.group.add(sh);
    this.name = name;
    this.mine = mine;
    this.pos = new THREE.Vector3();
    this.tgt = new THREE.Vector3();
    this.h = 0; this.th = 0; this.spd = 0; this.phase = rand(0, 6); this.hopT = 0;
    this.tag = document.createElement('div');
    this.tag.className = 'p-tag' + (mine ? ' me' : '');
    this.tag.innerHTML = `<span>${esc(name)}${mine ? ' (나)' : ''}</span>`;
    this.bubble = document.createElement('div');
    this.bubble.className = 'p-bubble hidden';
    $('#plaza-layer').append(this.tag, this.bubble);
    this.bubbleT = 0;
  }
  say(text, big = false) {
    this.bubble.textContent = text;
    this.bubble.classList.toggle('big', big);
    this.bubble.classList.remove('hidden');
    this.bubbleT = big ? 2.5 : Math.min(8, 3 + text.length * 0.12);
  }
  hop() { if (!(this.hopT > 0)) this.hopT = 0.45; }
  animate(dt) {
    const m = this.m;
    const amt = Math.min(1, this.spd / 5);
    this.phase += dt * (6 + this.spd * 1.6);
    const sw = Math.sin(this.phase) * amt;
    m.legs[0].rotation.x = sw * 0.8; m.legs[1].rotation.x = -sw * 0.8;
    m.arms[0].rotation.x = -sw * 0.7; m.arms[1].rotation.x = sw * 0.7;
    let y = Math.abs(Math.sin(this.phase)) * 0.09 * amt;
    if (this.hopT > 0) { this.hopT -= dt; y += Math.sin((1 - Math.max(0, this.hopT) / 0.45) * Math.PI) * 0.6; }
    m.root.position.y = y;
    m.root.rotation.x = amt * 0.08;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.h;
    if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0) this.bubble.classList.add('hidden'); }
  }
  destroy() {
    plaza.scene.remove(this.group);
    this.tag.remove();
    this.bubble.remove();
  }
}

// ---------------- 입장 / 퇴장 ----------------
function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${location.pathname.replace(/[^/]*$/, '')}ws`;
}

function myLook() {
  let l = parseInt(localStorage.getItem('monggle-farm-look') ?? '', 10);
  if (!(l >= 0)) { l = Math.floor(Math.random() * LOOKS.length); try { localStorage.setItem('monggle-farm-look', String(l)); } catch { /* 무시 */ } }
  return l % LOOKS.length;
}

/** 광장 들어가기. 성공하면 true */
export function enterPlaza(name) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch { reject(new Error('서버에 연결할 수 없어요')); return; }
    const timer = setTimeout(() => { ws.close(); reject(new Error('서버 응답이 없어요. 서버 주소로 게임을 열었는지 확인해 주세요')); }, 8000);
    plaza.look = myLook();
    const sx = rand(-3, 3), sz = 24 + rand(-2, 2);   // 남쪽 길 입구에서 시작
    ws.onopen = () => ws.send(JSON.stringify({ t: 'plaza', name, look: plaza.look, x: sx, z: sz }));
    ws.onerror = () => { clearTimeout(timer); reject(new Error('서버에 연결할 수 없어요. 서버 주소로 게임을 열었는지 확인해 주세요')); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'error') { clearTimeout(timer); ws.close(); reject(new Error(m.msg)); return; }
      if (m.t !== 'welcome') return;
      clearTimeout(timer);
      plaza.ws = ws; plaza.id = m.id; plaza.name = name;
      plaza.farms = m.farms || [];
      ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
      ws.onclose = () => { if (plaza.active) { toast('광장 연결이 끊겼어요. 다시 들어와 주세요', '📡', 4000); setTimeout(() => location.reload(), 2500); } };
      start(sx, sz);
      resolve(true);
    };
  });
}

function start(x, z) {
  if (!plaza.scene) plaza.scene = buildScene();
  plaza.active = true;
  G.mode = 'plaza';
  document.body.classList.add('mode-plaza');
  $('#hud').classList.remove('hidden');
  $('#plaza-hud').classList.remove('hidden');
  initAudio();
  setVolumes(G.settings.music, G.settings.sfx);
  initTouch();
  plaza.me = new Avatar(plaza.name, plaza.look, true);
  plaza.me.pos.set(x, 0, z);
  plaza.me.h = Math.PI;
  G.cam.yaw = 0; G.cam.pitch = 0.62; G.cam.dist = 20; G.cam.fp = false;
  G.camTarget.set(x, 0, z);
  bindHud();
  renderFarms();
  renderPeople();
  sfx('day');
  setTimeout(() => toast(`마을 광장에 왔어요! 사람 이름을 누르면 내 농장에 초대할 수 있어요`, '🏞️', 5000), 500);
}

/** 광장을 떠나 농장으로 */
function leaveTo(dest) {
  if (!plaza.active) return;
  plaza.active = false;
  try { plaza.ws?.close(); } catch { /* 무시 */ }
  for (const a of plaza.others.values()) a.destroy();
  plaza.others.clear();
  plaza.me?.destroy();
  $('#plaza-hud').classList.add('hidden');
  document.body.classList.remove('mode-plaza');
  G.mode = 'farm';
  plaza.onGoFarm?.(dest);
}

// ---------------- 서버 메시지 ----------------
function onMessage(m) {
  if (!plaza.active) return;
  switch (m.t) {
    case 'ps': {
      const seen = new Set();
      for (const [id, name, look, x, z, h, s] of m.p) {
        if (id === plaza.id) continue;
        seen.add(id);
        let a = plaza.others.get(id);
        if (!a) {
          a = new Avatar(name, look);
          a.id = id;
          a.pos.set(x, 0, z);
          a.tag.addEventListener('click', (e) => { e.stopPropagation(); openPerson(id); });
          plaza.others.set(id, a);
          renderPeople();
        }
        a.tgt.set(x, 0, z); a.th = h; a.spd = s;
      }
      for (const [id, a] of plaza.others) if (!seen.has(id)) { a.destroy(); plaza.others.delete(id); renderPeople(); }
      $('#p-count').textContent = String(plaza.others.size + 1);
      break;
    }
    case 'hello': if (m.id !== plaza.id) log(`👋 ${m.name} 님이 광장에 왔어요`, 'sys'); break;
    case 'bye': { const a = plaza.others.get(m.id); if (a) log(`${a.name} 님이 떠났어요`, 'sys'); break; }
    case 'chat': {
      const a = m.id === plaza.id ? plaza.me : plaza.others.get(m.id);
      if (a) { a.say(m.msg); log(m.msg, '', a.name); }
      break;
    }
    case 'emote': { const a = m.id === plaza.id ? plaza.me : plaza.others.get(m.id); if (a) { a.say(m.e, true); a.hop(); } break; }
    case 'hop': plaza.others.get(m.id)?.hop(); break;
    case 'farms': plaza.farms = m.list; renderFarms(); break;
    case 'invite': incoming('invite', m); break;
    case 'visit': incoming('visit', m); break;
    case 'reply': onReply(m); break;
  }
}

const send = (m) => { if (plaza.ws?.readyState === 1) plaza.ws.send(JSON.stringify(m)); };
const newRoom = () => 'F' + Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(5, '7');

// ---------------- 초대 · 방문 ----------------
function invite(id) {
  const a = plaza.others.get(id);
  if (!a) return;
  if (plaza.pending.has(id)) { toast(`${a.name} 님의 답을 기다리는 중이에요`, '💌', 1800); return; }
  const room = plaza.myRoom || (plaza.myRoom = newRoom());
  plaza.pending.set(id, room);
  send({ t: 'invite', to: id, room });
  toast(`${a.name} 님에게 농장 초대를 보냈어요 💌`, '💌', 2500);
  sfx('pickup');
  setTimeout(() => plaza.pending.delete(id), 30000);
}
function askVisit(id) {
  const a = plaza.others.get(id);
  if (!a) return;
  send({ t: 'visit', to: id });
  toast(`${a.name} 님에게 농장 구경을 부탁했어요`, '🚜', 2500);
  sfx('pickup');
}

/** 받은 초대 · 방문 요청 카드 */
function incoming(kind, m) {
  const box = document.createElement('div');
  box.className = 'p-invite';
  const text = kind === 'invite' ? `<b>${esc(m.name)}</b> 님이 농장에 초대했어요!` : `<b>${esc(m.name)}</b> 님이 내 농장을 구경하고 싶어 해요`;
  box.innerHTML = `<div class="p-inv-ico">${kind === 'invite' ? '💌' : '🚜'}</div><div class="p-inv-txt">${text}</div>
    <div class="p-inv-btns"><button class="yes">${kind === 'invite' ? '놀러 가기' : '초대하기'}</button><button class="no">다음에</button></div>`;
  $('#p-invites').append(box);
  sfx('alert');
  const done = () => box.remove();
  const timer = setTimeout(done, 30000);
  box.querySelector('.no').addEventListener('click', () => {
    clearTimeout(timer); done();
    send({ t: 'reply', to: m.from, kind, ok: false });
  });
  box.querySelector('.yes').addEventListener('click', () => {
    clearTimeout(timer); done();
    if (kind === 'invite') {
      send({ t: 'reply', to: m.from, kind, ok: true, room: m.room });
      toast(`${m.name} 님 농장으로 가는 중…`, '🚜', 3000);
      leaveTo({ kind: 'join', room: m.room, retry: true, host: m.name });
    } else {
      const room = plaza.myRoom || (plaza.myRoom = newRoom());
      send({ t: 'reply', to: m.from, kind, ok: true, room });
      leaveTo({ kind: 'host', room });
    }
  });
}

function onReply(m) {
  if (m.kind === 'invite') {
    plaza.pending.delete(m.from);
    if (!m.ok) { toast(`${m.name} 님이 다음에 놀러 온대요`, '🙂', 2500); return; }
    // 상대가 수락 → 내 농장 문을 열고 이동 (상대는 이 방 코드로 따라 들어온다)
    toast(`${m.name} 님이 초대를 받아 줬어요! 농장 문을 여는 중…`, '🎉', 3000);
    sfx('ding');
    leaveTo({ kind: 'host', room: m.room || plaza.myRoom });
  } else {
    if (!m.ok || !m.room) { toast(`${m.name} 님이 지금은 어렵대요`, '🙂', 2500); return; }
    toast(`${m.name} 님이 초대해 줬어요! 농장으로 가는 중…`, '🎉', 3000);
    sfx('ding');
    leaveTo({ kind: 'join', room: m.room, retry: true, host: m.name });
  }
}

// ---------------- 화면 (HUD) ----------------
let hudBound = false;
function bindHud() {
  if (hudBound) return;
  hudBound = true;
  const say = $('#p-say');
  const sendChat = () => {
    const msg = say.value.trim().slice(0, 80);
    if (!msg) { say.blur(); return; }
    send({ t: 'chat', msg });
    say.value = '';
  };
  $('#p-send').addEventListener('click', sendChat);
  say.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    if (e.key === 'Escape') say.blur();
    e.stopPropagation();
  });
  window.addEventListener('keydown', (e) => {
    if (!plaza.active || e.target === say) return;
    if (e.key === 'Enter') { e.preventDefault(); say.focus(); }
  });
  document.querySelectorAll('#p-emotes button').forEach((b) => b.addEventListener('click', () => { send({ t: 'emote', e: b.dataset.e }); }));
  $('#p-home').addEventListener('click', () => leaveTo({ kind: 'host', room: plaza.myRoom || (plaza.myRoom = newRoom()) }));
  $('#p-open').addEventListener('click', () => leaveTo({ kind: 'host', room: plaza.myRoom || (plaza.myRoom = newRoom()), open: true }));
  $('#p-side-toggle').addEventListener('click', () => $('#plaza-hud').classList.toggle('side-open'));
  document.addEventListener('click', (e) => { if (!e.target.closest('#p-pop, .p-tag, .p-person')) $('#p-pop').classList.add('hidden'); });
}

function openPerson(id) {
  const a = plaza.others.get(id);
  if (!a) return;
  const pop = $('#p-pop');
  pop.innerHTML = `<b>🧑‍🌾 ${esc(a.name)}</b>
    <button data-act="invite">💌 내 농장에 초대</button>
    <button data-act="visit">🚜 농장 구경 가고 싶어요</button>`;
  pop.classList.remove('hidden');
  pop.dataset.id = String(id);
  pop.querySelector('[data-act=invite]').onclick = () => { invite(id); pop.classList.add('hidden'); };
  pop.querySelector('[data-act=visit]').onclick = () => { askVisit(id); pop.classList.add('hidden'); };
  sfx('click');
}

function renderPeople() {
  const el = $('#p-people');
  if (!el) return;
  const list = [...plaza.others.values()];
  el.innerHTML = list.length ? '' : '<div class="p-empty">아직 아무도 없어요. 친구에게 광장으로 오라고 해 보세요!</div>';
  for (const a of list) {
    const row = document.createElement('div');
    row.className = 'p-person';
    row.innerHTML = `<span>🧑‍🌾 ${esc(a.name)}</span><button title="내 농장에 초대">💌</button><button title="농장 구경 가고 싶어요">🚜</button>`;
    const [inv, vis] = row.querySelectorAll('button');
    inv.addEventListener('click', () => invite(a.id));
    vis.addEventListener('click', () => askVisit(a.id));
    row.querySelector('span').addEventListener('click', () => openPerson(a.id));
    el.append(row);
  }
}

function renderFarms() {
  const el = $('#p-farms');
  if (!el) return;
  el.innerHTML = plaza.farms.length ? '' : '<div class="p-empty">지금 문을 연 농장이 없어요</div>';
  for (const f of plaza.farms) {
    const row = document.createElement('div');
    row.className = 'p-farm';
    row.innerHTML = `<span>🏡 ${esc(f.title)} <small>${f.n}/8명</small></span><button ${f.n >= 8 ? 'disabled' : ''}>놀러 가기</button>`;
    row.querySelector('button').addEventListener('click', () => leaveTo({ kind: 'join', room: f.room, host: f.owner }));
    el.append(row);
  }
}

function log(text, cls = '', who = '') {
  const el = $('#p-log');
  const line = document.createElement('div');
  line.className = 'p-line ' + cls;
  line.innerHTML = who ? `<b>${esc(who)}</b> ${esc(text)}` : esc(text);
  el.append(line);
  while (el.children.length > 40) el.firstChild.remove();
  el.scrollTop = el.scrollHeight;
}

// ---------------- 매 프레임 ----------------
const _v = new THREE.Vector3();
let sendT = 0, lastSent = '';
function collide(p, r) {
  for (const c of plaza.colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, min = r + c.r, d = Math.hypot(dx, dz);
    if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > R_PLAZA) { p.x *= R_PLAZA / d; p.z *= R_PLAZA / d; }
}

export function updatePlaza(dt, camera, renderer) {
  const me = plaza.me;
  const k = G.input;
  // 이동 (카메라 기준 WASD)
  const ix = (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0) - (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0);
  const iz = (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0) - (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0);
  let mx = 0, mz = 0;
  if (ix || iz) {
    const yaw = G.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    mx = fx * iz + rx * ix; mz = fz * iz + rz * ix;
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
  }
  const run = k.down('ShiftLeft') || k.down('ShiftRight');
  me.spd = damp(me.spd, mx || mz ? (run ? 7.8 : 5) : 0, 12, dt);
  if (mx || mz) me.h = dampAngle(me.h, Math.atan2(mx, mz), 14, dt);
  me.pos.x += Math.sin(me.h) * me.spd * dt;
  me.pos.z += Math.cos(me.h) * me.spd * dt;
  collide(me.pos, 0.45);
  if (k.pressed('Space')) { me.hop(); send({ t: 'hop' }); sfx('hop'); }
  me.animate(dt);
  // 위치 보내기 (10회/초, 바뀌었을 때만)
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 0.1;
    const p = [+me.pos.x.toFixed(2), +me.pos.z.toFixed(2), +me.h.toFixed(2), +me.spd.toFixed(1)];
    const key = p.join(',');
    if (key !== lastSent) { lastSent = key; send({ t: 'p', p }); }
  }
  // 다른 사람: 부드럽게 따라가기
  for (const a of plaza.others.values()) {
    a.pos.x = damp(a.pos.x, a.tgt.x, 10, dt);
    a.pos.z = damp(a.pos.z, a.tgt.z, 10, dt);
    a.h = dampAngle(a.h, a.th, 10, dt);
    a.animate(dt);
  }
  // 분수 물방울 · 닭
  for (const w of plaza.water) {
    w.t = (w.t + dt * 0.7) % 1;
    const r = 0.4 + w.t * 2.2;
    w.mesh.position.set(Math.sin(w.a) * r, 3.4 + Math.sin(w.t * Math.PI) * 1.2 - w.t * 2.4, Math.cos(w.a) * r);
  }
  for (const c of plaza.chicks) {
    c.t -= dt;
    if (c.t <= 0) { c.t = rand(1.5, 4); c.tx = 22 + rand(-6, 6); c.tz = rand(-6, 6); }
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { c.h = dampAngle(c.h, Math.atan2(dx, dz), 6, dt); c.x += Math.sin(c.h) * 1.4 * dt; c.z += Math.cos(c.h) * 1.4 * dt; }
    c.ph += dt * (d > 0.3 ? 16 : 3);
    c.m.legs[0].rotation.x = Math.sin(c.ph) * (d > 0.3 ? 0.8 : 0); c.m.legs[1].rotation.x = -c.m.legs[0].rotation.x;
    c.m.head.rotation.x = d > 0.3 ? 0 : Math.max(0, Math.sin(G.now * 3 + c.ph)) > 0.8 ? 0.9 : 0;
    c.m.group.position.set(c.x, 0, c.z);
    c.m.group.rotation.y = c.h;
  }
  // 카메라 (3인칭)
  curveUniforms.uCurve.value = 0;
  const t = G.camTarget;
  t.x = damp(t.x, me.pos.x, 6, dt); t.z = damp(t.z, me.pos.z, 6, dt);
  const yaw = G.cam.yaw, pitch = G.cam.pitch, dist = G.cam.dist;
  camera.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, t.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(t.x, 1.2, t.z);
  if (camera.fov !== 40 || camera.near !== 0.5) { camera.fov = 40; camera.near = 0.5; camera.updateProjectionMatrix(); }
  renderer.render(plaza.scene, camera);
  // 이름표 · 말풍선
  const W = window.innerWidth, H = window.innerHeight;
  const place = (a) => {
    _v.set(a.pos.x, 2.45 + (a.hopT > 0 ? 0.4 : 0), a.pos.z).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
    const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    a.tag.style.display = vis ? '' : 'none';
    a.tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    a.bubble.style.transform = `translate(${x}px, ${y - 26}px) translate(-50%, -100%)`;
    if (!vis) a.bubble.style.display = 'none'; else a.bubble.style.display = '';
  };
  place(me);
  for (const a of plaza.others.values()) place(a);
}

export { EMOTES };
