// 🪧 집 앞 알림판(칠판): 집주인 공지 + 방명록
// - 집 문 왼쪽 마당에 서 있어서 놀러 온 친구도 볼 수 있다 (친구는 집 안에 못 들어가므로)
// - 공지는 집주인(혼자 하기 · 방장)만 고칠 수 있고, 방명록은 누구나 남길 수 있다
// - 내용은 집주인 농장 저장본에 들어가고, 멀티플레이에서는 방장이 모두에게 다시 보내 준다
import * as THREE from 'three';
import { G } from './state.js';
import { mat, curved } from './materials.js';
import { part, group, rbox, cyl } from './util.js';
import { addCircle } from './physics.js';
import { sfx } from './audio.js';
import { toast } from './ui.js';

export const MAX_NOTICE = 120, MAX_MSG = 80, MAX_BOOK = 40;
const NEAR = 2.0;

export const defaultBoard = () => ({ notice: '', book: [] });
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

let B = null;   // { group, pos, tex, canvas }
let netApi = null;   // net.js가 연결: { isGuest, isHost, sendEntry, broadcast, myName }
export function bindBoardNet(api) { netApi = api; }
const isGuest = () => !!netApi?.isGuest();

/** 저장본 → 알림판 (잘못된 값은 걸러서) */
export function setBoardData(d) {
  const b = defaultBoard();
  if (d && typeof d === 'object') {
    b.notice = clean(d.notice, MAX_NOTICE);
    if (Array.isArray(d.book)) b.book = d.book.slice(-MAX_BOOK).map((e) => ({ n: clean(e?.n, 12) || '손님', m: clean(e?.m, MAX_MSG), d: +e?.d || 0 })).filter((e) => e.m);
  }
  G.board = b;
  refreshBoard();
}

// ---------------- 모델 ----------------
export function buildBoard(scene, fh) {
  const x = fh.door.x - 4.4, z = fh.door.z + 0.2;
  const g = group(scene, x, 0, z);
  g.scale.setScalar(1.3);   // 멀리서도 글씨가 보이게 조금 크게
  const wood = mat(0xb07a4f), woodD = mat(0x8a5f3c);
  // A자 이젤 다리
  for (const sx of [-0.75, 0.75]) {
    part(g, cyl(0.06, 0.07, 2.1, 6), wood, sx, 1.0, 0.12, -0.12, 0, 0);
    part(g, cyl(0.05, 0.06, 2.0, 6), woodD, sx, 0.95, -0.38, 0.32, 0, 0);
  }
  // 칠판 판 (앞면에 글씨 텍스처)
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 320;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const frame = part(g, rbox(1.9, 1.3, 0.1, 0.05), wood, 0, 1.45, 0.05, -0.12, 0, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.1), curved(new THREE.MeshBasicMaterial({ map: tex })));
  face.position.set(0, 0, 0.056);
  frame.add(face);
  // 분필 받침 + 분필
  part(g, rbox(1.8, 0.06, 0.14, 0.02), woodD, 0, 0.83, 0.16, -0.12, 0, 0);
  part(g, rbox(0.16, 0.05, 0.05, 0.02), mat(0xfffaf0), -0.4, 0.88, 0.18);
  part(g, rbox(0.14, 0.05, 0.05, 0.02), mat(0xff9eb5), -0.15, 0.88, 0.18);
  addCircle(x, z, 1.0);
  B = { group: g, pos: { x, z }, tex, canvas };
  refreshBoard();
  return B;
}

/** 칠판 글씨 다시 그리기 */
export function refreshBoard() {
  if (!B || !G.board) return;
  const c = B.canvas, g = c.getContext('2d');
  g.fillStyle = '#2f5d4a'; g.fillRect(0, 0, c.width, c.height);
  // 분필 얼룩
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(60 + i * 80, 80 + (i % 3) * 80, 70, 24, 0.3, 0, Math.PI * 2); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillStyle = '#ffe9a8'; g.font = 'bold 38px Jua, "Gowun Dodum", sans-serif';
  g.fillText('📢 알림판', c.width / 2, 18);
  g.fillStyle = '#fffaf0'; g.font = '30px Jua, "Gowun Dodum", sans-serif';
  const text = G.board.notice || '집주인의 공지가 아직 없어요';
  if (!G.board.notice) g.fillStyle = 'rgba(255,250,240,0.55)';
  const lines = wrap(g, text, c.width - 60).slice(0, 4);
  lines.forEach((l, i) => g.fillText(l, c.width / 2, 78 + i * 42));
  g.fillStyle = '#ffb7c9'; g.font = '26px Jua, "Gowun Dodum", sans-serif';
  g.fillText(`✍️ 방명록 ${G.board.book.length}개 · E로 보기`, c.width / 2, 268);
  B.tex.needsUpdate = true;
}

function wrap(g, text, maxW) {
  const out = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; }
    line += ch;
  }
  if (line) out.push(line);
  return out;
}

export function nearBoard(p) {
  return !!B && Math.hypot(p.x - B.pos.x, p.z - B.pos.z) < NEAR;
}

// ---------------- 내용 바꾸기 (집주인 쪽에서 실제로 반영) ----------------
const lastPost = new Map();
/** 방명록 남기기 (호스트/혼자). 너무 자주 쓰면 무시 */
export function addEntry(name, msg, who = 'me') {
  const m = clean(msg, MAX_MSG);
  if (!m) return false;
  const now = Date.now();
  if (now - (lastPost.get(who) || 0) < 4000) return false;
  lastPost.set(who, now);
  G.board.book.push({ n: clean(name, 12) || '손님', m, d: now });
  if (G.board.book.length > MAX_BOOK) G.board.book.splice(0, G.board.book.length - MAX_BOOK);
  changed();
  return true;
}

function changed() {
  refreshBoard();
  netApi?.broadcast?.(G.board);
  if (isOpen()) renderBoard();
}

/** 게스트: 방장이 보내 준 알림판 */
export function applyBoardSync(b) {
  setBoardData(b);
  if (isOpen()) renderBoard();
}

// ---------------- 창 ----------------
const $ = (s) => document.querySelector(s);
const isOpen = () => !$('#modal-board')?.classList.contains('hidden');
const myName = () => netApi?.myName?.() || '농장 주인';

export function openBoard() {
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  renderBoard();
  $('#modal-board').classList.remove('hidden');
  document.exitPointerLock?.();
  sfx('click');
}

function fmtDate(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderBoard() {
  const owner = !isGuest();
  const nv = $('#board-notice-view'), ne = $('#board-notice-edit');
  nv.textContent = G.board.notice || (owner ? '아직 공지가 없어요. 아래에 적어서 친구들에게 알려 주세요!' : '집주인의 공지가 아직 없어요');
  nv.classList.toggle('empty', !G.board.notice);
  ne.classList.toggle('hidden', !owner);
  if (owner && document.activeElement !== $('#board-notice-input')) $('#board-notice-input').value = G.board.notice;
  $('#board-count').textContent = `${G.board.book.length}/${MAX_BOOK}`;
  const list = $('#board-book');
  list.textContent = '';
  if (!G.board.book.length) {
    const p = document.createElement('p');
    p.className = 'board-empty';
    p.textContent = '첫 번째 방명록을 남겨 주세요 ✍️';
    list.appendChild(p);
  }
  // 최신 글이 위로
  G.board.book.map((e, i) => [e, i]).reverse().forEach(([e, i]) => {
    const row = document.createElement('div');
    row.className = 'board-entry';
    const head = document.createElement('div');
    head.className = 'be-head';
    const nm = document.createElement('b'); nm.textContent = e.n;
    const dt = document.createElement('span'); dt.textContent = fmtDate(e.d);
    head.append(nm, dt);
    if (owner) {
      const del = document.createElement('button');
      del.className = 'be-del'; del.textContent = '✕'; del.title = '지우기';
      del.addEventListener('click', () => { G.board.book.splice(i, 1); sfx('pop'); changed(); });
      head.appendChild(del);
    }
    const body = document.createElement('div');
    body.className = 'be-msg'; body.textContent = e.m;
    row.append(head, body);
    list.appendChild(row);
  });
}

export function initBoardUI() {
  $('#board-notice-save').addEventListener('click', () => {
    if (isGuest()) return;
    G.board.notice = clean($('#board-notice-input').value, MAX_NOTICE);
    sfx('drop');
    toast(G.board.notice ? '공지를 칠판에 적었어요' : '공지를 지웠어요', '📢', 1600);
    changed();
  });
  const send = () => {
    const inp = $('#board-msg');
    const msg = clean(inp.value, MAX_MSG);
    if (!msg) return;
    if (isGuest()) { netApi.sendEntry(msg); toast('방명록을 남겼어요', '✍️', 1600); }
    else if (!addEntry(myName(), msg)) { toast('조금 있다가 다시 남겨 주세요', '⏳', 1400); return; }
    inp.value = '';
    sfx('drop');
  };
  $('#board-send').addEventListener('click', send);
  $('#board-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
}
