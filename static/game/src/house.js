// 우리 집: 실내 꾸미기(가구 배치·벽지·바닥·외관) + 활동(잠·요리·장부·TV·피아노·화분·고양이)
import * as THREE from 'three';
import { G, LAYOUT, PRODUCTS } from './state.js';
import { mat, glow, curved, gradientMap } from './materials.js';
import { part, group, rbox, box, sbox, sphere, cyl, cone, torus, capsule, rand, clamp, damp, dampAngle } from './util.js';
import { burst, emote, spawn } from './particles.js';
import { toast, floatText, setHouseHud, openModalHtml } from './ui.js';
import { sfx, playNote } from './audio.js';
import { makeBoardModel, openBoard } from './board.js';

export const ROOM = { x: 0, z: -400, cols: 12, rows: 9 };
const X0 = ROOM.x - ROOM.cols / 2, Z0 = ROOM.z - ROOM.rows / 2;
export const DOOR = { c: 10, r: 8 };     // 출입문 매트 칸 (오른쪽 앞)

const tm = (c) => curved(new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() }));

// ---------------- 가구 목록 ----------------
export const FURNITURE = {
  bed: { name: '포근 침대', icon: '🛏️', price: 600, w: 2, d: 3, act: 'sleep', actName: '잠자기' },
  kitchen: { name: '주방 조리대', icon: '🍳', price: 700, w: 3, d: 1, act: 'cook', actName: '새참 만들기' },
  fridge: { name: '냉장고', icon: '🧊', price: 350, w: 1, d: 1 },
  table: { name: '동그란 식탁', icon: '🍽️', price: 300, w: 2, d: 2 },
  chair: { name: '나무 의자', icon: '🪑', price: 90, w: 1, d: 1 },
  sofa: { name: '말랑 소파', icon: '🛋️', price: 650, w: 3, d: 1 },
  tv: { name: 'TV', icon: '📺', price: 500, w: 2, d: 1, act: 'tv', actName: '뉴스·시세 보기' },
  desk: { name: '컴퓨터 책상', icon: '💻', price: 450, w: 2, d: 1, act: 'ledger', actName: '목장 장부 보기' },
  piano: { name: '업라이트 피아노', icon: '🎹', price: 1200, w: 2, d: 1, act: 'piano', actName: '피아노 치기' },
  bookshelf: { name: '책장', icon: '📚', price: 380, w: 2, d: 1 },
  plant: { name: '화분', icon: '🪴', price: 120, w: 1, d: 1, act: 'water', actName: '물 주기' },
  lamp: { name: '스탠드 조명', icon: '💡', price: 160, w: 1, d: 1 },
  rug: { name: '동그란 러그', icon: '🟠', price: 220, w: 3, d: 2, flat: true },
  catbed: { name: '고양이 방석', icon: '🐱', price: 150, w: 1, d: 1 },
  dogbed: { name: '강아지 방석', icon: '🐶', price: 150, w: 1, d: 1 },
  fireplace: { name: '벽난로', icon: '🔥', price: 900, w: 2, d: 1 },
  vase: { name: '꽃병 탁자', icon: '💐', price: 140, w: 1, d: 1 },
  board: { name: '방명록 칠판', icon: '🪧', price: 300, w: 2, d: 1, act: 'board', actName: '칠판 보기' },   // 집 앞 알림판과 같은 내용
};

const WALLPAPERS = [0xfff1d6, 0xffd6de, 0xd8f2c8, 0xd6e8ff, 0xe8dcff, 0xfff3b0];
const FLOORS = [0xd9a066, 0xb07a4f, 0xf0dcb4, 0x9cc7a0, 0xc8b4e6];
export const EXT_WALLS = [0xfff1d6, 0xffe0e6, 0xe2f5d6, 0xdcebff, 0xfff6c2, 0xf0e0ff];
export const EXT_ROOFS = [0x5fb8c6, 0xec7d70, 0x84c46f, 0x9b8cff, 0xffb84d, 0x6b7280];

export function defaultHouse() {
  return {
    wall: 0, floor: 0, ext: { wall: 0, roof: 0 },
    placed: [
      { id: 'bed', c: 0, r: 0, rot: 0 },
      { id: 'kitchen', c: 4, r: 0, rot: 0 },
      { id: 'fridge', c: 7, r: 0, rot: 0 },
      { id: 'desk', c: 9, r: 0, rot: 0 },
      { id: 'rug', c: 4, r: 3, rot: 0 },
      { id: 'table', c: 4, r: 3, rot: 0 },
      { id: 'chair', c: 3, r: 3, rot: 3 },   // 식탁 왼쪽, 식탁을 바라봄
      { id: 'chair', c: 6, r: 3, rot: 1 },   // 식탁 오른쪽, 식탁을 바라봄
      { id: 'tv', c: 0, r: 7, rot: 2 },
      { id: 'catbed', c: 2, r: 7, rot: 0 },
      { id: 'dogbed', c: 3, r: 7, rot: 0 },
      { id: 'plant', c: 11, r: 0, rot: 0 },
      { id: 'board', c: 2, r: 0, rot: 0 },   // 침대와 주방 사이 벽: 공지·방명록 칠판
    ],
    inventory: {},
    plants: {},
    pets: { cat: '', dog: '' },   // 반려동물 이름
    v: 4,
  };
}

/** 예전 기본 배치(의자가 식탁 반대쪽을 보고 엇갈려 있던 것)를 저장본에서 한 번만 바로잡기 */
function migrateHouse(h) {
  if (!h || h.v >= 4) return;
  const at = (id, c, r) => h.placed.find((p) => p.id === id && p.c === c && p.r === r);
  // 칸(c, r)부터 w×d 영역이 다른 가구(러그 제외)와 겹치는지
  const busy = (c, r, w, d, skip = null) => h.placed.some((p) => {
    if (p === skip || FURNITURE[p.id]?.flat) return false;
    const q = dims(p);
    return c < p.c + q.w && c + w > p.c && r < p.r + q.d && r + d > p.r;
  });
  if (!(h.v >= 2)) {
    // v2: 예전 기본 배치의 의자 방향
    const a = at('chair', 3, 3), b = at('chair', 6, 4);
    if (at('table', 4, 3)) {
      if (a && a.rot === 1) a.rot = 3;
      if (b && b.rot === 3) { b.rot = 1; if (!busy(6, 3, 1, 1, b)) b.r = 3; }
    }
  }
  // v3: 집 안 방명록 칠판 — 빈 벽 쪽에 놓고, 자리가 없으면 보관함에
  if (!(h.v >= 3) && !h.placed.some((p) => p.id === 'board') && !(h.inventory?.board > 0)) {
    // 벽에 붙는 자리만 (가구 앞을 막지 않게): 뒷벽(침대 옆) → 왼쪽 벽 → 오른쪽 벽 → 앞벽, 칠판 앞면은 방 안쪽으로
    const spot = [[2, 0, 0], [0, 3, 3], [11, 2, 1], [11, 4, 1], [4, 8, 2], [6, 8, 2]].map(([c, r, rot]) => ({ id: 'board', c, r, rot })).find((p) => {
      const { w, d } = dims(p);
      return p.c + w <= ROOM.cols && p.r + d <= ROOM.rows && !(p.r + d > DOOR.r && p.c + w > DOOR.c && p.c < DOOR.c + 2) && !busy(p.c, p.r, w, d);
    });
    if (spot) h.placed.push(spot);
    else { h.inventory ||= {}; h.inventory.board = (h.inventory.board || 0) + 1; }
  }
  // v4: 강아지 + 강아지 방석 (고양이 방석 옆 빈칸, 없으면 보관함)
  h.pets ||= { cat: '', dog: '' };
  if (!h.placed.some((p) => p.id === 'dogbed') && !(h.inventory?.dogbed > 0)) {
    const spot = [[3, 7], [1, 6], [3, 6], [8, 7], [9, 7], [11, 6], [6, 6], [0, 5]].map(([c, r]) => ({ id: 'dogbed', c, r, rot: 0 }))
      .find((p) => !(p.r + 1 > DOOR.r && p.c + 1 > DOOR.c && p.c < DOOR.c + 2) && !busy(p.c, p.r, 1, 1));
    if (spot) h.placed.push(spot);
    else { h.inventory ||= {}; h.inventory.dogbed = (h.inventory.dogbed || 0) + 1; }
  }
  h.v = 4;
}

// ---------------- 가구 모델 ----------------
function buildFurniture(id) {
  const g = new THREE.Group();
  const wood = mat(0xc98a5a), woodL = mat(0xe0b077), white = mat(0xfffaf0), D = mat(0x4a4f5c);
  if (id === 'board') {   // 집 앞 알림판과 같은 칠판 (조금 작게)
    const b = makeBoardModel(g);
    b.scale.setScalar(0.95);
    return g;
  }
  switch (id) {
    case 'bed':
      part(g, rbox(1.9, 0.4, 2.9, 0.12), wood, 0, 0.25, 0);
      part(g, rbox(1.95, 1.0, 0.18, 0.08), wood, 0, 0.6, -1.4);
      part(g, rbox(1.8, 0.25, 2.7, 0.12), white, 0, 0.55, 0.05);
      part(g, rbox(1.82, 0.22, 1.7, 0.12), mat(0xff9eb5), 0, 0.62, 0.55);
      part(g, rbox(0.7, 0.2, 0.45, 0.1), white, -0.42, 0.75, -0.95);
      part(g, rbox(0.7, 0.2, 0.45, 0.1), white, 0.42, 0.75, -0.95);
      break;
    case 'kitchen':
      part(g, rbox(2.9, 0.9, 0.85, 0.08), mat(0xfff3dc), 0, 0.45, 0);
      part(g, rbox(2.95, 0.08, 0.9, 0.03), mat(0x9aa7b8), 0, 0.94, 0);
      for (const x of [-0.9, -0.3]) part(g, cyl(0.2, 0.2, 0.03, 16), D, x, 0.99, 0.05);
      part(g, rbox(0.7, 0.05, 0.5, 0.03), mat(0x7ec8e3), 0.75, 0.97, 0.02);
      part(g, cyl(0.18, 0.15, 0.22, 14), mat(0xff7b6b), -0.9, 1.1, 0.05);
      for (const x of [-1.0, 0, 1.0]) part(g, box(0.85, 0.65, 0.04), mat(0xffe6c4), x, 0.42, 0.44);
      part(g, rbox(2.9, 0.7, 0.4, 0.06), mat(0xfff3dc), 0, 2.1, -0.22);
      break;
    case 'fridge':
      part(g, rbox(0.85, 1.9, 0.8, 0.15), mat(0xd6eef5), 0, 0.95, 0);
      part(g, box(0.86, 0.03, 0.81), mat(0xb8c4d4), 0, 1.25, 0);
      part(g, box(0.05, 0.4, 0.06), D, 0.3, 1.55, 0.42);
      part(g, box(0.05, 0.4, 0.06), D, 0.3, 0.85, 0.42);
      part(g, sphere(0.07, 8, 6), mat(0xff8fab), -0.15, 1.6, 0.41);
      break;
    case 'table':
      part(g, cyl(0.85, 0.85, 0.08, 24), woodL, 0, 0.78, 0);
      part(g, cyl(0.08, 0.12, 0.75, 10), wood, 0, 0.38, 0);
      part(g, cyl(0.4, 0.45, 0.05, 16), wood, 0, 0.03, 0);
      part(g, cyl(0.1, 0.07, 0.25, 10), mat(0xc9e6ff), 0.2, 0.95, -0.1);
      part(g, sphere(0.09, 8, 6), mat(0xff8fab), 0.2, 1.12, -0.1);
      part(g, cyl(0.18, 0.18, 0.03, 14), white, -0.3, 0.84, 0.2);
      break;
    case 'chair':
      part(g, rbox(0.6, 0.08, 0.6, 0.04), woodL, 0, 0.48, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, cyl(0.04, 0.04, 0.46, 6), wood, sx * 0.24, 0.23, sz * 0.24);
      part(g, rbox(0.6, 0.55, 0.08, 0.04), woodL, 0, 0.8, -0.27);
      part(g, rbox(0.5, 0.06, 0.5, 0.03), mat(0xff9eb5), 0, 0.54, 0);
      break;
    case 'sofa':
      part(g, rbox(2.8, 0.45, 0.85, 0.2), mat(0x9ad7ff), 0, 0.35, 0.05);
      part(g, rbox(2.8, 0.7, 0.3, 0.15), mat(0x7fc4ef), 0, 0.7, -0.3);
      for (const sx of [-1, 1]) part(g, rbox(0.3, 0.6, 0.85, 0.14), mat(0x7fc4ef), sx * 1.3, 0.55, 0.05);
      for (const x of [-0.65, 0.65]) part(g, rbox(1.2, 0.15, 0.7, 0.1), mat(0xb8e4ff), x, 0.63, 0.1);
      part(g, rbox(0.45, 0.4, 0.15, 0.12), mat(0xffd34d), 0.9, 0.85, -0.1, 0.2, 0, 0.2);
      break;
    case 'tv': {
      part(g, rbox(1.8, 0.5, 0.6, 0.08), wood, 0, 0.25, 0);
      part(g, rbox(1.5, 0.9, 0.08, 0.05), D, 0, 1.0, -0.05);
      const scr = part(g, box(1.35, 0.75, 0.02), glow(0x9ad7ff, 0.6), 0, 1.0, 0.0);
      g.userData.screen = scr;
      part(g, sphere(0.06, 8, 6), mat(0xff6b6b), 0.65, 0.55, 0.0);
      break;
    }
    case 'desk':
      part(g, rbox(1.8, 0.08, 0.75, 0.03), woodL, 0, 0.78, 0);
      for (const sx of [-1, 1]) part(g, rbox(0.08, 0.76, 0.7, 0.03), wood, sx * 0.85, 0.38, 0);
      part(g, rbox(0.9, 0.55, 0.06, 0.04), D, -0.2, 1.2, -0.2);
      part(g, box(0.8, 0.45, 0.02), glow(0xb8f2c8, 0.6), -0.2, 1.2, -0.16);
      part(g, box(0.5, 0.03, 0.18), white, -0.2, 0.83, 0.12);
      part(g, cyl(0.07, 0.06, 0.12, 10), mat(0xffd34d), 0.6, 0.88, 0);
      break;
    case 'piano':
      part(g, rbox(1.8, 1.25, 0.6, 0.06), mat(0x3a2f35), 0, 0.62, -0.05);
      part(g, rbox(1.7, 0.08, 0.35, 0.03), white, 0, 0.78, 0.3);
      for (let i = 0; i < 10; i++) part(g, box(0.08, 0.05, 0.2), D, -0.72 + i * 0.16, 0.83, 0.25);
      part(g, rbox(0.9, 0.12, 0.4, 0.05), mat(0x3a2f35), 0, 0.45, 0.85);
      part(g, cyl(0.06, 0.06, 0.45, 6), mat(0x3a2f35), 0, 0.22, 0.85);
      part(g, cone(0.12, 0.25, 8), mat(0xffd34d), 0.6, 1.4, -0.05);
      break;
    case 'bookshelf':
      part(g, rbox(1.8, 2.0, 0.5, 0.05), wood, 0, 1.0, 0);
      for (let s2 = 0; s2 < 3; s2++) {
        part(g, box(1.65, 0.04, 0.42), woodL, 0, 0.45 + s2 * 0.6, 0.03);
        for (let i = 0; i < 8; i++) part(g, box(0.15, 0.4 + rand(-0.06, 0.06), 0.32), mat([0xff7b6b, 0xffd34d, 0x8fd16a, 0x7cb7f0, 0xc9a7ff][(i + s2) % 5]), -0.7 + i * 0.19, 0.67 + s2 * 0.6, 0.06, 0, 0, i % 4 === 3 ? 0.2 : 0);
      }
      break;
    case 'plant': {
      part(g, cyl(0.28, 0.22, 0.4, 14), mat(0xd98c74), 0, 0.2, 0);
      const leaves = group(g, 0, 0.4, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(leaves, sphere(0.2, 8, 6), mat(0x7fcf6a), Math.cos(a) * 0.15, 0.25 + (i % 2) * 0.12, Math.sin(a) * 0.15, 0, 0, 0, 0.7, 1.4, 0.7); }
      const flower = group(leaves, 0, 0.6, 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(flower, sphere(0.08, 6, 4), mat(0xff8fab), Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09); }
      part(flower, sphere(0.06, 6, 4), mat(0xffd34d), 0, 0.02, 0);
      g.userData.leaves = leaves; g.userData.flower = flower;
      break;
    }
    case 'lamp':
      part(g, cyl(0.2, 0.25, 0.06, 12), D, 0, 0.03, 0);
      part(g, cyl(0.03, 0.03, 1.5, 6), D, 0, 0.78, 0);
      part(g, cyl(0.22, 0.32, 0.35, 14), glow(0xfff0b8, 0.4), 0, 1.6, 0);
      break;
    case 'rug':
      part(g, cyl(1.0, 1.0, 0.03, 32), mat(0xffb38a), 0, 0.02, 0, 0, 0, 0, 1.45, 1, 0.95).castShadow = false;
      part(g, cyl(0.7, 0.7, 0.035, 28), mat(0xfff3dc), 0, 0.025, 0, 0, 0, 0, 1.45, 1, 0.95).castShadow = false;
      break;
    case 'catbed':
      part(g, cyl(0.42, 0.38, 0.18, 18), mat(0xff9eb5), 0, 0.09, 0);
      part(g, cyl(0.32, 0.32, 0.05, 16), white, 0, 0.17, 0);
      break;
    case 'dogbed':
      part(g, cyl(0.46, 0.42, 0.2, 18), mat(0x7cb7f0), 0, 0.1, 0);
      part(g, cyl(0.35, 0.35, 0.05, 16), mat(0xfff3dc), 0, 0.19, 0);
      part(g, torus(0.4, 0.07, 6, 18), mat(0x5a95d0), 0, 0.2, 0, Math.PI / 2, 0, 0);
      // 뼈다귀 장난감
      part(g, cyl(0.025, 0.025, 0.2, 6), white, 0.15, 0.24, 0.12, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) part(g, sphere(0.04, 6, 5), white, 0.15 + s * 0.1, 0.24, 0.12);
      break;
    case 'fireplace': {
      part(g, rbox(1.8, 1.4, 0.7, 0.08), mat(0xd98c74), 0, 0.7, -0.05);
      part(g, rbox(2.0, 0.12, 0.8, 0.04), woodL, 0, 1.45, -0.05);
      part(g, rbox(1.0, 0.75, 0.2, 0.05), D, 0, 0.5, 0.25);
      const fire = part(g, cone(0.25, 0.45, 8), glow(0xffa94d, 1.2), 0, 0.4, 0.3);
      g.userData.fire = fire;
      break;
    }
    case 'vase':
      part(g, cyl(0.3, 0.3, 0.05, 14), woodL, 0, 0.7, 0);
      part(g, cyl(0.04, 0.04, 0.7, 6), wood, 0, 0.35, 0);
      part(g, cyl(0.1, 0.13, 0.3, 12), mat(0x9ad7ff), 0, 0.88, 0);
      for (let i = 0; i < 4; i++) part(g, sphere(0.08, 6, 4), mat([0xff8fab, 0xffd34d, 0xc9a7ff, 0xff7b6b][i]), Math.cos(i * 1.6) * 0.1, 1.12 + (i % 2) * 0.06, Math.sin(i * 1.6) * 0.1);
      break;
  }
  return g;
}

/** 턱시도 고양이: 까만 몸 + 하얀 가슴(턱받이) · 입 주변 · 발(양말) */
function makeCat() {
  const g = new THREE.Group(), body = group(g);
  const K = mat(0x2b2a30), W = mat(0xfffaf0), Pink = mat(0xffa3b8);
  part(body, sphere(0.25, 12, 10), K, 0, 0.25, 0, 0, 0, 0, 0.9, 0.85, 1.25);
  // 하얀 가슴·배 (턱시도 셔츠)
  part(body, sphere(0.15, 10, 8), W, 0, 0.23, 0.22, 0, 0, 0, 1, 1.05, 0.8);
  part(body, sphere(0.14, 10, 8), W, 0, 0.13, 0.04, 0, 0, 0, 1.1, 0.55, 1.5);
  const head = group(body, 0, 0.45, 0.28);
  part(head, sphere(0.2, 12, 10), K);
  // 하얀 입 주변 + 이마에서 내려오는 하얀 줄무늬
  part(head, sphere(0.1, 10, 8), W, 0, -0.06, 0.13, 0, 0, 0, 1.25, 0.8, 0.8);
  part(head, sphere(0.05, 8, 6), W, 0, 0.06, 0.17, 0, 0, 0, 0.6, 1.4, 0.5);
  for (const sx of [-1, 1]) {
    part(head, cone(0.08, 0.14, 4), K, sx * 0.11, 0.18, 0, 0, 0, -sx * 0.3);
    part(head, cone(0.045, 0.08, 4), Pink, sx * 0.11, 0.17, 0.025, 0, 0, -sx * 0.3);   // 귀 안쪽
    // 까만 얼굴에서도 잘 보이게 연두빛 눈 + 동공
    part(head, sphere(0.035, 8, 6), mat(0xc8e05a), sx * 0.075, 0.035, 0.172, 0, 0, 0, 1, 1.2, 0.5);
    part(head, sphere(0.018, 6, 4), mat(0x15141a), sx * 0.075, 0.035, 0.19, 0, 0, 0, 0.6, 1.4, 0.5);
    // 하얀 수염
    for (const dy of [-0.01, -0.035]) part(head, cyl(0.004, 0.004, 0.16, 3), W, sx * 0.13, -0.04 + dy, 0.15, 0, 0, Math.PI / 2 + sx * dy * 3);
  }
  part(head, sphere(0.025, 6, 4), Pink, 0, -0.02, 0.215);
  const tail = group(body, 0, 0.3, -0.28);
  part(tail, capsule(0.04, 0.35, 3, 6), K, 0, 0.18, -0.05, -0.4, 0, 0);
  const legs = [];
  for (const [x, z] of [[-0.1, 0.12], [0.1, 0.12], [-0.1, -0.12], [0.1, -0.12]]) {
    const l = group(body, x, 0.12, z);
    part(l, cyl(0.04, 0.04, 0.14, 6), K, 0, -0.06, 0);
    part(l, sphere(0.048, 8, 6), W, 0, -0.12, 0.01, 0, 0, 0, 1, 0.7, 1.15);   // 하얀 양말
    legs.push(l);
  }
  return { group: g, body, head, tail, legs };
}

/** 갈색 강아지: 크림색 주둥이·배 + 축 처진 귀 + 빨간 목줄, 꼬리를 흔든다 */
function makeDog() {
  const g = new THREE.Group(), body = group(g);
  const B = mat(0xc98a4b), C = mat(0xfff1d6), Dk = mat(0x5a3a22), Red = mat(0xff6b6b), Pink = mat(0xffa3b8);
  part(body, sphere(0.27, 12, 10), B, 0, 0.32, 0, 0, 0, 0, 0.95, 0.85, 1.35);
  part(body, sphere(0.18, 10, 8), C, 0, 0.26, 0.12, 0, 0, 0, 1, 0.8, 1.2);   // 크림색 배
  const head = group(body, 0, 0.58, 0.3);
  part(head, sphere(0.22, 12, 10), B);
  part(head, sphere(0.12, 10, 8), C, 0, -0.06, 0.16, 0, 0, 0, 1.1, 0.85, 1.1);   // 주둥이
  part(head, sphere(0.045, 8, 6), Dk, 0, -0.01, 0.28);                           // 코
  part(head, sphere(0.035, 6, 4), Pink, 0, -0.12, 0.22, 0, 0, 0, 1, 0.5, 1);       // 혀
  for (const sx of [-1, 1]) {
    part(head, sphere(0.03, 8, 6), Dk, sx * 0.08, 0.06, 0.18);                      // 눈
    part(head, sphere(0.012, 6, 4), mat(0xffffff), sx * 0.075, 0.07, 0.205);
    part(head, sphere(0.1, 8, 6), Dk, sx * 0.18, 0.02, -0.02, 0, 0, sx * 0.35, 0.45, 1.2, 0.8);   // 처진 귀
  }
  part(body, torus(0.15, 0.03, 6, 14), Red, 0, 0.5, 0.24, Math.PI / 2 - 0.4, 0, 0);   // 목줄
  part(body, sphere(0.035, 6, 5), mat(0xffd84d), 0, 0.42, 0.33);                        // 방울
  const tail = group(body, 0, 0.42, -0.34);
  part(tail, capsule(0.04, 0.22, 3, 6), B, 0, 0.12, -0.04, -0.6, 0, 0);
  const legs = [];
  for (const [x, z] of [[-0.12, 0.17], [0.12, 0.17], [-0.12, -0.17], [0.12, -0.17]]) {
    const l = group(body, x, 0.16, z);
    part(l, cyl(0.05, 0.05, 0.18, 6), B, 0, -0.07, 0);
    part(l, sphere(0.055, 8, 6), C, 0, -0.15, 0.01, 0, 0, 0, 1, 0.7, 1.2);
    legs.push(l);
  }
  return { group: g, body, head, tail, legs };
}

const PET_INFO = {
  cat: { label: '고양이', icon: '🐱', bed: 'catbed', speed: 1.1, sound: 'meow' },
  dog: { label: '강아지', icon: '🐶', bed: 'dogbed', speed: 1.6, sound: 'woof' },
};
/** 반려동물 이름 (이름이 없으면 '고양이' · '강아지') */
export function petName(kind) { return G.house?.pets?.[kind] || PET_INFO[kind].label; }
export function setPetName(kind, name) {
  if (!PET_INFO[kind]) return;
  G.house.pets ||= { cat: '', dog: '' };
  G.house.pets[kind] = String(name ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, 12);
}

// ---------------- 방 만들기 ----------------
const H = {
  root: null, wallMat: null, floorMat: null, items: [], cat: null, dog: null, pets: [], light: null,
  decor: false, holding: null, hover: { c: 0, r: 0 }, colliders: [],
};
export const houseState = H;

export function buildHouse(scene) {
  if (!G.house) G.house = defaultHouse();
  migrateHouse(G.house);
  const root = group(scene);
  H.root = root;
  root.visible = false;
  H.wallMat = tm(WALLPAPERS[G.house.wall]);
  H.floorMat = tm(FLOORS[G.house.floor]);
  // 바깥 잔디
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(40, 32).rotateX(-Math.PI / 2), mat(0xa6dc7e));
  lawn.position.set(ROOM.x, -0.02, ROOM.z); lawn.receiveShadow = true; root.add(lawn);
  // 바닥 (판자 줄무늬)
  const fl = part(root, sbox(ROOM.cols, 0.2, ROOM.rows, 1), H.floorMat, ROOM.x, -0.1, ROOM.z);
  fl.castShadow = false;
  for (let i = 1; i < ROOM.rows; i++) part(root, box(ROOM.cols, 0.01, 0.03), mat(0x000000, { transparent: true, opacity: 0.08 }), ROOM.x, 0.005, Z0 + i).castShadow = false;
  // 벽 (뒤·왼·오른쪽)
  const WH = 3.2;
  part(root, sbox(ROOM.cols + 0.6, WH, 0.3), H.wallMat, ROOM.x, WH / 2, Z0 - 0.15);
  part(root, sbox(0.3, WH, ROOM.rows), H.wallMat, X0 - 0.15, WH / 2, ROOM.z);
  part(root, sbox(0.3, WH, ROOM.rows), H.wallMat, X0 + ROOM.cols + 0.15, WH / 2, ROOM.z);
  part(root, sbox(ROOM.cols + 0.6, 0.25, 0.34), mat(0xb07a4f), ROOM.x, 0.12, Z0 - 0.15);
  for (const x of [X0 - 0.15, X0 + ROOM.cols + 0.15]) part(root, sbox(0.34, 0.25, ROOM.rows), mat(0xb07a4f), x, 0.12, ROOM.z);
  part(root, sbox(ROOM.cols + 0.7, 0.18, 0.4), mat(0xfffaf0), ROOM.x, WH, Z0 - 0.15);
  // 창문 2개 + 시계
  for (const x of [ROOM.x - 2.5, ROOM.x + 2.5]) {
    part(root, rbox(1.6, 1.2, 0.12, 0.05), mat(0xfffaf0), x, 2.0, Z0 + 0.02);
    part(root, box(1.4, 1.0, 0.05), glow(0xbfe8ff, 0.5), x, 2.0, Z0 + 0.06);
    part(root, box(0.06, 1.0, 0.08), mat(0xfffaf0), x, 2.0, Z0 + 0.08);
  }
  part(root, cyl(0.3, 0.3, 0.06, 20), mat(0xfffaf0), ROOM.x, 2.7, Z0 + 0.05, Math.PI / 2, 0, 0);
  H.clockHand = part(root, box(0.03, 0.22, 0.02), mat(0x2e2a35), ROOM.x, 2.7, Z0 + 0.1);
  // 문 매트
  const door = cellCenter(DOOR.c, DOOR.r, 2, 1);
  part(root, rbox(1.8, 0.04, 0.8, 0.02), mat(0x8fd16a), door.x, 0.02, door.z).castShadow = false;
  H.doorPos = door;
  // 실내 조명
  H.light = new THREE.PointLight(0xffe2b0, 0, 18, 1.6);
  H.light.position.set(ROOM.x, 2.8, ROOM.z);
  root.add(H.light);
  // 가구
  rebuildFurniture();
  // 고양이 · 강아지
  H.cat = makeCat();
  H.cat.group.position.set(ROOM.x - 3, 0, ROOM.z + 2.5);
  H.dog = makeDog();
  H.dog.group.position.set(ROOM.x + 1, 0, ROOM.z + 2.5);
  H.pets = [];
  for (const [kind, p] of [['cat', H.cat], ['dog', H.dog]]) {
    root.add(p.group);
    Object.assign(p, { kind, target: null, t: 0, heading: 0, petT: 0, wag: 0 });
    H.pets.push(p);
  }
  applyExterior();
}

export function cellCenter(c, r, w = 1, d = 1) {
  return { x: X0 + c + w / 2, z: Z0 + r + d / 2 };
}
const dims = (p) => { const f = FURNITURE[p.id]; return p.rot % 2 ? { w: f.d, d: f.w } : { w: f.w, d: f.d }; };

function rebuildFurniture() {
  for (const it of H.items) H.root.remove(it.mesh);
  H.items = [];
  H.colliders = [];
  for (const p of G.house.placed) addFurnitureMesh(p);
  tuckChairs();
}

/**
 * 식탁 옆에 놓인 의자·식탁 아래 러그는 식탁 가운데에 줄을 맞춰 보이게 한다 (칸은 1칸·식탁은 2칸이라 반 칸 어긋나는 것 보정)
 * 보이는 위치만 옮기고, 저장되는 칸 위치는 그대로
 */
function tuckChairs() {
  const tables = H.items.filter((it) => it.p.id === 'table');
  // 식탁 아래 깔린 러그도 식탁 가운데로
  for (const it of H.items) {
    if (it.p.id !== 'rug') continue;
    const r = it.rect, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    it.mesh.position.x = cx; it.mesh.position.z = cz;
    const t = tables.find((t) => t.rect.minX >= r.minX && t.rect.maxX <= r.maxX && t.rect.minZ >= r.minZ && t.rect.maxZ <= r.maxZ);
    if (!t) continue;
    const tx = (t.rect.minX + t.rect.maxX) / 2, tz = (t.rect.minZ + t.rect.maxZ) / 2;
    if (Math.abs(tx - cx) <= 0.5) it.mesh.position.x = tx;
    if (Math.abs(tz - cz) <= 0.5) it.mesh.position.z = tz;
  }
  for (const it of H.items) {
    if (it.p.id !== 'chair') continue;
    const r = it.rect, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    it.mesh.position.x = cx; it.mesh.position.z = cz;
    for (const t of tables) {
      const q = t.rect, tx = (q.minX + q.maxX) / 2, tz = (q.minZ + q.maxZ) / 2;
      const side = (r.maxX === q.minX || r.minX === q.maxX) && r.minZ < q.maxZ && r.maxZ > q.minZ;   // 식탁 왼쪽·오른쪽
      const end = (r.maxZ === q.minZ || r.minZ === q.maxZ) && r.minX < q.maxX && r.maxX > q.minX;    // 식탁 위·아래
      if (side && Math.abs(tz - cz) <= 0.5) { it.mesh.position.z = tz; break; }
      if (end && Math.abs(tx - cx) <= 0.5) { it.mesh.position.x = tx; break; }
    }
  }
}

function addFurnitureMesh(p) {
  const mesh = buildFurniture(p.id);
  const { w, d } = dims(p);
  const c = cellCenter(p.c, p.r, w, d);
  mesh.position.set(c.x, 0, c.z);
  mesh.rotation.y = -p.rot * Math.PI / 2;
  H.root.add(mesh);
  const it = { p, mesh, rect: { minX: X0 + p.c, maxX: X0 + p.c + w, minZ: Z0 + p.r, maxZ: Z0 + p.r + d } };
  H.items.push(it);
  if (p.id === 'plant') {
    const key = `${p.c},${p.r}`;
    const gr = G.house.plants[key] ?? 0;
    mesh.userData.leaves.scale.setScalar(0.7 + gr * 0.15);
    mesh.userData.flower.visible = gr >= 2;
  }
  return it;
}

function canPlace(p, ignore = null) {
  const { w, d } = dims(p);
  if (p.c < 0 || p.r < 0 || p.c + w > ROOM.cols || p.r + d > ROOM.rows) return false;
  const flat = FURNITURE[p.id].flat;
  // 출입문 칸 비워두기
  if (!flat && p.r + d > DOOR.r && p.c + w > DOOR.c && p.c < DOOR.c + 2) return false;
  for (const it of H.items) {
    if (it === ignore || it.p === ignore) continue;
    const of = FURNITURE[it.p.id].flat;
    if (flat !== of) continue; // 러그 위에는 가구를 놓을 수 있다
    const r2 = it.rect;
    const ax0 = p.c, ax1 = p.c + w, az0 = p.r, az1 = p.r + d;
    const bx0 = r2.minX - X0, bx1 = r2.maxX - X0, bz0 = r2.minZ - Z0, bz1 = r2.maxZ - Z0;
    if (ax0 < bx1 && ax1 > bx0 && az0 < bz1 && az1 > bz0) return false;
  }
  return true;
}

export function applyRoomColors() {
  H.wallMat.color.setHex(WALLPAPERS[G.house.wall]);
  H.floorMat.color.setHex(FLOORS[G.house.floor]);
}
export function applyExterior() {
  const fh = G.farmhouse;
  if (!fh) return;
  fh.mats.wall.color.setHex(EXT_WALLS[G.house.ext.wall]);
  fh.mats.roof.color.setHex(EXT_ROOFS[G.house.ext.roof]);
}
export { WALLPAPERS, FLOORS };

// ---------------- 들어가기 / 나가기 ----------------
export function nearHouseDoor(p) {
  const d = G.farmhouse?.door;
  return d && Math.hypot(p.x - d.x, p.z - d.z) < 2.4;
}

/** 집 화면 켜기/끄기 (위치는 그대로). 온라인 친구는 방장이 옮겨 준 위치를 받아서 이것만 한다 */
export function showHouse(on) {
  if (!on) { H.decor = false; if (H.holding) cancelHold(); }
  G.mode = on ? 'house' : 'farm';
  H.root.visible = on;
  if (on) { if (G.cam.fp) G.cam.fp = false; document.exitPointerLock?.(); G.viewTarget = null; }
  setHouseHud(on);
  sfx(on ? 'board' : 'unboard');
}

export function enterHouse() {
  G.player.pos.set(H.doorPos.x, 0, H.doorPos.z - 0.6);
  G.player.heading = Math.PI;
  showHouse(true);
  toast('우리 집에 왔어요! 가구 앞에서 E를 눌러 활동하고, [꾸미기]로 집을 꾸며요', '🏠', 3600);
}

export function exitHouse() {
  showHouse(false);
  const d = G.farmhouse.door;
  G.player.pos.set(d.x, 0, d.z + 1.2);
  G.player.heading = 0;
}


// ---------------- 실내 충돌 ----------------
export function collideHouse(pos, r) {
  pos.x = clamp(pos.x, X0 + r, X0 + ROOM.cols - r);
  pos.z = clamp(pos.z, Z0 + r, Z0 + ROOM.rows - r * 0.5);
  for (const it of H.items) {
    if (FURNITURE[it.p.id].flat) continue;
    const b = it.rect;
    const cx = clamp(pos.x, b.minX + 0.05, b.maxX - 0.05), cz = clamp(pos.z, b.minZ + 0.05, b.maxZ - 0.05);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); }
      else pos.z = b.maxZ + r;
    }
  }
}

/** 플레이어 근처에서 할 수 있는 활동 */
export function nearestActivity() {
  const p = G.player.pos;
  let best = null, bd = 1.0;
  for (const it of H.items) {
    const f = FURNITURE[it.p.id];
    if (!f.act) continue;
    const b = it.rect;
    const d = Math.hypot(p.x - clamp(p.x, b.minX, b.maxX), p.z - clamp(p.z, b.minZ, b.maxZ));
    if (d < bd) { bd = d; best = it; }
  }
  // 문 매트 위에 서 있으면 나가기가 먼저 (졸졸 따라온 강아지 때문에 못 나가는 일이 없게)
  if (Math.abs(p.x - H.doorPos.x) < 0.95 && Math.abs(p.z - H.doorPos.z) < 0.5) return { door: true, name: '밖으로 나가기' };
  for (const pet of H.pets) {
    const q = pet.group.position;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 1.3 && (!best || bd > 0.4)) return { pet, cat: pet.kind === 'cat', name: `${PET_INFO[pet.kind].icon} ${petName(pet.kind)} 쓰다듬기` };
  }
  if (Math.hypot(p.x - H.doorPos.x, p.z - H.doorPos.z) < 1.3) return { door: true, name: '밖으로 나가기' };
  return best ? { it: best, name: FURNITURE[best.p.id].actName } : null;
}

export function doActivity(a) {
  if (!a) return;
  if (a.door) { exitHouse(); return; }
  if (a.pet) { petPet(a.pet); return; }
  const it = a.it;
  switch (FURNITURE[it.p.id].act) {
    case 'sleep': sleep(); break;
    case 'cook': cook(it); break;
    case 'ledger': openModalHtml('📒 목장 장부', ledgerHtml()); break;
    case 'tv': openModalHtml('📺 오늘의 뉴스', newsHtml()); sfx('ding'); break;
    case 'piano': openPiano(); break;
    case 'water': water(it); break;
    case 'board': openBoard(); break;
  }
}

/** 반려동물 쓰다듬기 (온라인 친구도 각자 화면에서) */
export function petPet(pet) {
  pet.petT = 0.6;
  pet.wag = 2;
  const q = pet.group.position;
  emote('heart', q.x, 0.9, q.z);
  floatText(q.x, 1.3, q.z, `${PET_INFO[pet.kind].icon} ${petName(pet.kind)}`, 'good');
  sfx(PET_INFO[pet.kind].sound);
}

// ---------------- 활동 ----------------
function sleep() {
  const h = G.time / 60;
  const night = h >= 18 || h < 5;
  const fade = document.getElementById('fade');
  fade.classList.add('on');
  fade.textContent = night ? '💤 쿨쿨… 좋은 꿈 꿔요' : '💤 잠깐 낮잠…';
  sfx('sleep');
  setTimeout(() => {
    const target = night ? (h >= 18 ? 1440 - G.time + 360 : 360 - G.time) : 120;
    G.skipMinutes?.(target);
    toast(night ? `${G.day}일째 아침이에요! 푹 잤더니 개운해요 ☀️` : '낮잠을 자고 일어났어요 (2시간 지남)', '🛏️', 3200);
    G.player.restT = 240;
    setTimeout(() => fade.classList.remove('on'), 400);
  }, 1300);
}

function cook(it) {
  if (G.coins < 40) { toast('재료비 40🪙가 필요해요', '🍳'); sfx('error'); return; }
  G.coins -= 40;
  G.snackT = Math.max(G.snackT, 0) + 180;
  const p = it.mesh.position;
  for (let i = 0; i < 10; i++) spawn('smoke', p.x + rand(-1, 0), 1.3, p.z, { vy: 1, life: 1.4, size: 0.6 });
  sfx('cook');
  toast('맛있는 새참 완성! 일꾼들이 3분 동안 15% 빨리 일해요 🍙', '🍳', 3200);
}

function water(it) {
  const key = `${it.p.c},${it.p.r}`;
  const gr = Math.min(3, (G.house.plants[key] ?? 0) + 1);
  G.house.plants[key] = gr;
  it.mesh.userData.leaves.scale.setScalar(0.7 + gr * 0.15);
  it.mesh.userData.flower.visible = gr >= 2;
  const p = it.mesh.position;
  for (let i = 0; i < 8; i++) spawn('drop', p.x + rand(-0.2, 0.2), 1.3, p.z + rand(-0.2, 0.2), { vy: -1, grav: 4, life: 0.6, mode: 'bit', size: 0.6 });
  sfx('pop');
  toast(gr >= 3 ? '화분이 활짝 피었어요! 🌸' : '쑥쑥 자라라~ 💧', '🪴', 1800);
}

function ledgerHtml() {
  const rows = G.barns.map((b) => `<tr><td>${b.icon} ${b.name}</td><td>${b.animals.length}/${b.capacity}</td><td>${Math.round(b.feed)}</td><td>${Math.round(100 - b.manure)}</td><td>${Math.round(b.happiness * 100)}%</td><td>${b.pdef.icon} ${b.pallets.length}</td></tr>`).join('');
  const veh = {};
  for (const v of G.vehicles) veh[v.def.name] = (veh[v.def.name] || 0) + 1;
  return `<div class="ledger">
    <div class="ledger-top"><div><small>보유 코인</small><b>🪙 ${G.coins.toLocaleString('ko-KR')}</b></div><div><small>누적 수입</small><b>🪙 ${G.stats.earned.toLocaleString('ko-KR')}</b></div><div><small>출하한 팔레트</small><b>📦 ${G.stats.shipped}</b></div><div><small>만든 건초</small><b>🌾 ${G.stats.bales}</b></div></div>
    <table><tr><th>축사</th><th>마리</th><th>사료</th><th>청결</th><th>행복</th><th>대기</th></tr>${rows}</table>
    <p>🚜 보유 장비: ${Object.entries(veh).map(([k, n]) => `${k} ${n}대`).join(' · ')}</p>
    <p>📅 ${G.day}일째 목장 운영 중이에요. 오늘도 수고했어요!</p></div>`;
}

const FORECAST = ['맑음 ☀️ — 풀이 쑥쑥 자라는 날!', '구름 조금 ⛅ — 일하기 좋은 날씨예요', '살랑살랑 바람 🍃 — 빨래 널기 좋은 날', '포근한 날씨 🌤️ — 동물들이 기분 좋아해요'];
function newsHtml() {
  const rows = Object.entries(PRODUCTS).map(([k, p]) => {
    const m = G.prices[k] ?? 1;
    const arrow = m > 1.05 ? `<span class="up">▲ ${Math.round((m - 1) * 100)}%</span>` : m < 0.95 ? `<span class="down">▼ ${Math.round((1 - m) * 100)}%</span>` : '<span>─ 보합</span>';
    return `<tr><td>${p.icon} ${p.name}</td><td>🪙 ${Math.round(p.price * m)}</td><td>${arrow}</td></tr>`;
  }).join('');
  return `<div class="news"><p class="headline">🗞️ 몽글 뉴스 · ${G.day}일째</p><p>오늘의 날씨: ${FORECAST[G.day % FORECAST.length]}</p>
    <h3>📈 오늘의 판매소 시세 (팔레트 1개)</h3><table>${rows}</table><p class="tip">💡 값이 오른 날에 출하하면 더 많이 벌어요. 시세는 매일 아침 바뀌어요.</p></div>`;
}

// ---------------- 피아노 ----------------
const PIANO_KEYS = [['KeyA', '도', 523.25], ['KeyS', '레', 587.33], ['KeyD', '미', 659.25], ['KeyF', '파', 698.46], ['KeyG', '솔', 783.99], ['KeyH', '라', 880], ['KeyJ', '시', 987.77], ['KeyK', '도', 1046.5]];
export function openPiano() {
  H.piano = true;
  const el = document.getElementById('piano');
  el.innerHTML = `<div class="piano-card"><b>🎹 피아노</b><small>A S D F G H J K 키나 건반을 눌러 연주해요 · Esc로 그만</small>
    <div class="keys">${PIANO_KEYS.map(([k, n], i) => `<button data-i="${i}"><span>${n}</span><kbd>${k.replace('Key', '')}</kbd></button>`).join('')}</div>
    <button class="close-piano">그만 치기</button></div>`;
  el.classList.remove('hidden');
  el.querySelectorAll('.keys button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); pressKey(Number(b.dataset.i)); }));
  el.querySelector('.close-piano').addEventListener('click', closePiano);
}
export function closePiano() {
  H.piano = false;
  document.getElementById('piano').classList.add('hidden');
}
function pressKey(i) {
  playNote(PIANO_KEYS[i][2]);
  const btn = document.querySelector(`#piano .keys button[data-i="${i}"]`);
  btn?.classList.add('down');
  setTimeout(() => btn?.classList.remove('down'), 160);
  const pi = H.items.find((it) => it.p.id === 'piano');
  if (pi) spawn('star', pi.mesh.position.x + rand(-0.6, 0.6), 1.8, pi.mesh.position.z, { vy: 1.5, life: 1, size: 0.6 });
}
function pianoInput() {
  if (G.input.pressed('Escape')) { closePiano(); return; }
  PIANO_KEYS.forEach(([k], i) => { if (G.input.pressed(k)) pressKey(i); });
}

// ---------------- 꾸미기 모드 ----------------
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _m = new THREE.Vector2(), _h = new THREE.Vector3();
let hoverBox = null;

export function setDecor(on) {
  H.decor = on;
  if (!on && H.holding) cancelHold();
  if (!hoverBox) {
    hoverBox = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fd16a, transparent: true, opacity: 0.45, depthWrite: false }));
    hoverBox.renderOrder = 4;
    H.root.add(hoverBox);
  }
  hoverBox.visible = on;
  setHouseHud(true);
}

export function decorPointer(cx, cy) {
  _m.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(_m, G.camera);
  if (ray.ray.intersectPlane(plane, _h)) { H.hover.c = Math.floor(_h.x - X0); H.hover.r = Math.floor(_h.z - Z0); H.hover.x = _h.x; H.hover.z = _h.z; }
}

/** 보관함에서 꺼내 들기 */
export function holdFromInventory(id) {
  if (!(G.house.inventory[id] > 0)) return;
  if (H.holding) cancelHold();
  G.house.inventory[id]--;
  startHold({ id, c: 0, r: 0, rot: 0 }, true);
}

function startHold(p, fromInv) {
  const mesh = buildFurniture(p.id);
  mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  H.root.add(mesh);
  H.holding = { p, mesh, fromInv };
  setHouseHud(true);
}

function cancelHold() {
  const h = H.holding;
  H.root.remove(h.mesh);
  if (h.fromInv) G.house.inventory[h.p.id] = (G.house.inventory[h.p.id] || 0) + 1;
  else { G.house.placed.push(h.orig); addFurnitureMesh(h.orig); tuckChairs(); }
  H.holding = null;
  setHouseHud(true);
}

export function decorClick() {
  if (!H.decor) return;
  if (H.holding) {
    const h = H.holding;
    if (!canPlace(h.p)) { sfx('error'); toast('여기에는 놓을 수 없어요', '🚫', 1400); return; }
    H.root.remove(h.mesh);
    const p = { id: h.p.id, c: h.p.c, r: h.p.r, rot: h.p.rot };
    G.house.placed.push(p);
    addFurnitureMesh(p);
    tuckChairs();
    H.holding = null;
    sfx('drop');
    burst('star', h.mesh.position.x, 0.8, h.mesh.position.z, 6, { vy: 3 });
    setHouseHud(true);
    return;
  }
  // 가구 집기 (러그보다 위에 있는 가구 우선)
  const hits = H.items.filter((it) => H.hover.x > it.rect.minX && H.hover.x < it.rect.maxX && H.hover.z > it.rect.minZ && H.hover.z < it.rect.maxZ);
  hits.sort((a, b) => (FURNITURE[a.p.id].flat ? 1 : 0) - (FURNITURE[b.p.id].flat ? 1 : 0));
  const it = hits[0];
  if (!it) return;
  H.root.remove(it.mesh);
  H.items.splice(H.items.indexOf(it), 1);
  G.house.placed.splice(G.house.placed.indexOf(it.p), 1);
  tuckChairs();
  startHold({ ...it.p }, false);
  H.holding.orig = it.p;
  sfx('pickup');
}

export function decorRotate() {
  if (H.holding) { H.holding.p.rot = (H.holding.p.rot + 1) % 4; sfx('click'); }
}

/** 들고 있는 가구를 보관함에 넣기 */
export function decorStore() {
  const h = H.holding;
  if (!h) return;
  H.root.remove(h.mesh);
  G.house.inventory[h.p.id] = (G.house.inventory[h.p.id] || 0) + 1;
  H.holding = null;
  sfx('pop');
  setHouseHud(true);
}

// ---------------- 매 프레임 ----------------
export function updateHouse(dt) {
  if (H.piano) pianoInput();
  const night = G.night ?? 0;
  H.light.intensity = 8 + night * 22;
  // 시계 바늘
  H.clockHand.rotation.z = -((G.time % 720) / 720) * Math.PI * 2;
  for (const it of H.items) {
    if (it.mesh.userData.fire) it.mesh.userData.fire.scale.set(1 + Math.sin(G.now * 12) * 0.1, 1 + Math.sin(G.now * 9) * 0.15, 1);
  }
  // 고양이 · 강아지
  for (const pet of H.pets) updatePet(pet, dt);
  // 꾸미기
  if (H.decor) {
    const k = G.input;
    if (k.pressed('KeyR')) decorRotate();
    if (k.pressed('KeyX') || k.pressed('Delete') || k.pressed('Backspace')) decorStore();
    if (H.holding) {
      const h = H.holding;
      const { w, d } = dims(h.p);
      h.p.c = clamp(Math.round(H.hover.x - X0 - w / 2), -1, ROOM.cols);
      h.p.r = clamp(Math.round(H.hover.z - Z0 - d / 2), -1, ROOM.rows);
      const c = cellCenter(h.p.c, h.p.r, w, d);
      h.mesh.position.set(c.x, 0.15 + Math.sin(G.now * 6) * 0.05, c.z);
      h.mesh.rotation.y = -h.p.rot * Math.PI / 2;
      hoverBox.scale.set(w, 1, d);
      hoverBox.position.set(c.x, 0.03, c.z);
      hoverBox.material.color.setHex(canPlace(h.p) ? 0x8fd16a : 0xff6b6b);
    } else {
      const c = cellCenter(H.hover.c, H.hover.r);
      hoverBox.scale.set(1, 1, 1);
      hoverBox.position.set(c.x, 0.03, c.z);
      hoverBox.material.color.setHex(0xffffff);
    }
  }
}

/** 반려동물 돌아다니기: 고양이는 제멋대로, 강아지는 사람을 졸졸 따라다니길 좋아한다 */
function updatePet(pet, dt) {
  const info = PET_INFO[pet.kind];
  pet.t -= dt;
  if (pet.petT > 0) { pet.petT -= dt; pet.body.position.y = Math.sin((1 - pet.petT / 0.6) * Math.PI) * (pet.kind === 'dog' ? 0.3 : 0.2); }
  else pet.body.position.y = 0;
  const g = pet.group.position;
  const near = pet.kind === 'dog' ? nearestPersonIndoor(g) : null;
  if (!pet.target || pet.t <= 0) {
    const r = Math.random();
    if (near && r < 0.55) {
      pet.target = { follow: near };
    } else if (r < (pet.kind === 'dog' ? 0.7 : 0.4)) {
      const bed = H.items.find((it) => it.p.id === info.bed);
      pet.target = bed ? { x: (bed.rect.minX + bed.rect.maxX) / 2, z: (bed.rect.minZ + bed.rect.maxZ) / 2 } : null;
    } else pet.target = { x: X0 + rand(0.8, ROOM.cols - 0.8), z: Z0 + rand(0.8, ROOM.rows - 1) };
    pet.t = rand(4, 9);
  }
  let moving = false;
  if (pet.target) {
    const f = pet.target.follow;
    const tx = f ? f.x : pet.target.x, tz = f ? f.z : pet.target.z;
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    if (d > (f ? 1.1 : 0.2)) {
      pet.heading = dampAngle(pet.heading, Math.atan2(dx, dz), 6, dt);
      const sp = info.speed * (f && d > 3 ? 1.6 : 1);
      g.x += Math.sin(pet.heading) * sp * dt; g.z += Math.cos(pet.heading) * sp * dt;
      moving = true;
    } else if (f) { pet.heading = dampAngle(pet.heading, Math.atan2(dx, dz), 6, dt); pet.wag = Math.max(pet.wag, 0.5); }
  }
  g.x = clamp(g.x, X0 + 0.3, X0 + ROOM.cols - 0.3);
  g.z = clamp(g.z, Z0 + 0.3, Z0 + ROOM.rows - 0.3);
  pet.group.rotation.y = pet.heading;
  const ph = G.now * (pet.kind === 'dog' ? 14 : 12);
  pet.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ph + i * Math.PI) * 0.5 : 0; });
  pet.wag = Math.max(0, pet.wag - dt);
  if (pet.kind === 'dog') pet.tail.rotation.z = Math.sin(G.now * (moving || pet.wag > 0 ? 18 : 4)) * (moving || pet.wag > 0 ? 0.7 : 0.25);
  else pet.tail.rotation.z = Math.sin(G.now * 3) * 0.4;
}

/** 집 안에 있는 사람 중 가장 가까운 사람 위치 (나 + 집에 놀러 온 친구) */
function nearestPersonIndoor(from) {
  let best = null, bd = 7;
  for (const p of G.players || [G.player]) {
    if (!p) continue;
    const inside = p.pos.x > X0 - 1 && p.pos.x < X0 + ROOM.cols + 1 && p.pos.z > Z0 - 1 && p.pos.z < Z0 + ROOM.rows + 1;
    if (!inside) continue;
    const d = Math.hypot(p.pos.x - from.x, p.pos.z - from.z);
    if (d < bd) { bd = d; best = p.pos; }
  }
  return best;
}

export const roomCenter = () => ({ x: ROOM.x, z: ROOM.z });

/** 저장된 집 상태 다시 적용 */
export function reloadHouse() {
  migrateHouse(G.house);
  applyRoomColors();
  rebuildFurniture();
  applyExterior();
}
