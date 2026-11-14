// 귀여운 로우폴리 모델들 (모두 기본 도형으로 조립)
import * as THREE from 'three';
import { mat, glow } from './materials.js';
import { part, group, rbox, box, sphere, cyl, cone, torus, capsule, rand } from './util.js';
import { mergeStatic } from './merge.js';

/** 모델을 만든 뒤 정적 부품을 합쳐 그리기 호출 줄이기 */
function merged(m) { mergeStatic(m.group, m); return m; }

export const COL = {
  white: 0xfffdf7,
  ink: 0x2e2a35,
  blush: 0xffa3b5,
  cowSpot: 0x3d3843,
  hoof: 0x6e5c52,
  horn: 0xf5e4bc,
  snout: 0xffc4cf,
  pig: 0xffb9c6,
  pigDark: 0xf393a8,
  chick: 0xfffdf7,
  chickBrown: 0xe0a466,
  comb: 0xff5a5f,
  beak: 0xffb52e,
  skin: 0xffdcc0,
  tire: 0x3b3b45,
  dark: 0x4a4f5c,
  metal: 0xc9d1dc,
};

export const PLAYER_LOOK = { shirt: 0xff9eb5, overall: 0x6aa9e9, hat: 0xf5d68a, hair: 0x8a5a3b, band: 0xef6f6c };
export const NPC_LOOKS = [
  { shirt: 0xa8e07a, overall: 0x7f8f5a, hat: 0x7fc97a, hair: 0x5a3b2a, cap: true },
  { shirt: 0xffd36e, overall: 0xb27850, hat: 0xff8a65, hair: 0x2e2a35, cap: true },
  { shirt: 0x9ad7ff, overall: 0x5a6f9a, hat: 0xffcc3d, hair: 0xc98a4a, cap: true },
  { shirt: 0xc9a7ff, overall: 0x6b6f7a, hat: 0xffa14a, hair: 0x7a4b2a, cap: true },
];

/** 멀티플레이 · 광장에서 사람마다 다른 옷 색 */
export const LOOKS = [PLAYER_LOOK, ...NPC_LOOKS.map((l) => ({ ...l, cap: false })),
  { shirt: 0xffb38a, overall: 0x5f8fd0, hat: 0xff8fab, hair: 0x3a2a20, band: 0x8fd16a },
  { shirt: 0xb5f0d0, overall: 0x7a5fb0, hat: 0xfff08a, hair: 0x6b3a2a, band: 0xff6b6b }];

function eyes(p, x, y, z, s = 0.075) {
  for (const sx of [-1, 1]) {
    part(p, sphere(s, 12, 10), mat(COL.ink), sx * x, y, z, 0, 0, 0, 1, 1.25, 0.6);
    part(p, sphere(s * 0.34, 8, 6), mat(0xffffff), sx * x + s * 0.3, y + s * 0.45, z + s * 0.42);
  }
}
function blush(p, x, y, z, s = 0.085) {
  for (const sx of [-1, 1]) part(p, sphere(s, 10, 8), mat(COL.blush), sx * x, y, z, 0, sx * 0.5, 0, 1, 0.6, 0.35);
}

// ---------------- 동물 ----------------

export function makeCow(variant = 0) {
  const g = new THREE.Group();
  const body = group(g);
  const han = variant === 2;
  const W = mat(han ? 0xd39352 : variant === 1 ? 0xf6dcb4 : COL.white);
  const S = mat(han ? 0xd39352 : variant === 1 ? 0xb47c4c : COL.cowSpot);
  part(body, rbox(1.0, 0.85, 1.45, 0.34), W, 0, 0.98, 0);
  part(body, sphere(0.26, 14, 10), S, 0.47, 1.05, 0.15, 0, 0, 0, 0.3, 1, 1.25);
  part(body, sphere(0.22, 14, 10), S, -0.47, 0.95, -0.3, 0, 0, 0, 0.3, 1.1, 1);
  part(body, sphere(0.25, 14, 10), S, 0.12, 1.39, -0.3, 0, 0, 0, 1.2, 0.25, 1);
  part(body, sphere(0.16, 12, 8), S, -0.47, 1.15, 0.38, 0, 0, 0, 0.3, 1, 1);
  part(body, sphere(0.2, 12, 10), mat(COL.snout), 0, 0.58, -0.32, 0, 0, 0, 1, 0.7, 1);
  const legs = [];
  for (const [x, z] of [[-0.3, 0.45], [0.3, 0.45], [-0.3, -0.45], [0.3, -0.45]]) {
    const leg = group(body, x, 0.62, z);
    part(leg, cyl(0.13, 0.12, 0.5, 10), W, 0, -0.25, 0);
    part(leg, cyl(0.135, 0.135, 0.13, 10), mat(COL.hoof), 0, -0.53, 0);
    legs.push(leg);
  }
  const head = group(body, 0, 1.42, 0.8);
  part(head, rbox(0.84, 0.72, 0.7, 0.3), W);
  part(head, rbox(0.76, 0.36, 0.32, 0.15), mat(COL.snout), 0, -0.18, 0.34);
  for (const sx of [-1, 1]) part(head, sphere(0.045, 8, 6), mat(0xd9788a), sx * 0.15, -0.14, 0.505, 0, 0, 0, 1, 1.3, 0.5);
  eyes(head, 0.2, 0.08, 0.35);
  blush(head, 0.32, -0.04, 0.29);
  for (const sx of [-1, 1]) {
    part(head, cone(0.075, 0.24, 10), mat(COL.horn), sx * 0.24, 0.44, -0.05, 0, 0, -sx * 0.35);
    part(head, sphere(0.15, 12, 8), W, sx * 0.52, 0.1, -0.05, 0, 0, sx * 0.5, 1.3, 0.55, 0.85);
  }
  part(head, sphere(0.16, 12, 8), S, -0.18, 0.22, 0.31, 0, 0, 0, 1, 1, 0.35);
  if (han) {
    // 한우: 큰 뿔 · 코뚜레 · 이마 털
    for (const sx of [-1, 1]) part(head, cone(0.09, 0.42, 10), mat(COL.horn), sx * 0.36, 0.42, 0.0, 0.3, 0, -sx * 1.0);
    part(head, torus(0.11, 0.025, 6, 16), mat(0xffd34d), 0, -0.3, 0.53, 0, 0, 0);
    part(head, sphere(0.2, 10, 8), mat(0xb87838), 0, 0.33, 0.2, 0, 0, 0, 1.3, 0.5, 1);
  }
  // 방울
  part(head, cyl(0.25, 0.25, 0.08, 14), mat(0xff7a7a), 0, -0.38, 0.0);
  part(head, sphere(0.1, 10, 8), mat(0xffd34d), 0, -0.48, 0.2);
  const tail = group(body, 0, 1.25, -0.74);
  part(tail, cyl(0.035, 0.035, 0.55, 6), W, 0, -0.27, 0);
  part(tail, sphere(0.09, 8, 6), S, 0, -0.56, 0, 0, 0, 0, 1, 1.4, 1);
  tail.rotation.x = 0.25;
  return merged({ group: g, body, head, legs, tail });
}

export function makePig() {
  const g = new THREE.Group();
  const body = group(g);
  const P = mat(COL.pig), PD = mat(COL.pigDark);
  part(body, rbox(0.85, 0.72, 1.1, 0.34), P, 0, 0.64, 0);
  const legs = [];
  for (const [x, z] of [[-0.25, 0.33], [0.25, 0.33], [-0.25, -0.33], [0.25, -0.33]]) {
    const leg = group(body, x, 0.34, z);
    part(leg, cyl(0.11, 0.1, 0.28, 10), P, 0, -0.14, 0);
    part(leg, cyl(0.105, 0.105, 0.08, 10), PD, 0, -0.3, 0);
    legs.push(leg);
  }
  const head = group(body, 0, 0.86, 0.6);
  part(head, rbox(0.76, 0.66, 0.56, 0.27), P);
  part(head, cyl(0.18, 0.19, 0.14, 16), PD, 0, -0.08, 0.32, Math.PI / 2, 0, 0);
  for (const sx of [-1, 1]) part(head, sphere(0.04, 8, 6), mat(0xb8566b), sx * 0.065, -0.08, 0.395, 0, 0, 0, 1, 1.4, 0.5);
  eyes(head, 0.19, 0.1, 0.28, 0.07);
  blush(head, 0.29, -0.06, 0.24);
  for (const sx of [-1, 1]) part(head, cone(0.14, 0.24, 4), P, sx * 0.24, 0.38, 0.0, 0.7, 0, -sx * 0.35);
  const tail = group(body, 0, 0.75, -0.56);
  part(tail, torus(0.07, 0.025, 6, 12, Math.PI * 1.6), PD, 0, 0, 0, 0, Math.PI / 2, 0);
  return merged({ group: g, body, head, legs, tail });
}

export function makeChicken(brown = false) {
  const g = new THREE.Group();
  const body = group(g);
  const B = mat(brown ? COL.chickBrown : COL.chick);
  part(body, sphere(0.32, 16, 12), B, 0, 0.48, 0, 0, 0, 0, 1, 0.95, 1.15);
  part(body, cone(0.12, 0.32, 8), B, 0, 0.7, -0.3, -0.7, 0, 0);
  for (const sx of [-1, 1]) part(body, cone(0.09, 0.26, 8), B, sx * 0.1, 0.66, -0.3, -0.9, 0, sx * 0.4);
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = group(body, sx * 0.29, 0.52, -0.02);
    part(w, sphere(0.16, 10, 8), B, 0, -0.04, 0, 0, 0, 0, 0.35, 0.75, 1.1);
    wings.push(w);
  }
  const head = group(body, 0, 0.82, 0.17);
  part(head, sphere(0.21, 14, 10), B);
  for (const [z, s] of [[-0.07, 0.06], [0.0, 0.075], [0.07, 0.062]]) part(head, sphere(s, 8, 6), mat(COL.comb), 0, 0.2, z);
  part(head, cone(0.06, 0.14, 8), mat(COL.beak), 0, -0.02, 0.24, Math.PI / 2, 0, 0);
  part(head, sphere(0.045, 8, 6), mat(COL.comb), 0, -0.11, 0.18, 0, 0, 0, 1, 1.4, 1);
  eyes(head, 0.1, 0.05, 0.16, 0.045);
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = group(body, sx * 0.1, 0.22, 0);
    part(leg, cyl(0.025, 0.025, 0.22, 6), mat(COL.beak), 0, -0.1, 0);
    part(leg, sphere(0.06, 8, 6), mat(COL.beak), 0, -0.2, 0.04, 0, 0, 0, 1, 0.35, 1.4);
    legs.push(leg);
  }
  return merged({ group: g, body, head, legs, wings });
}

// ---------------- 농부 ----------------

export function makeFarmer(o = PLAYER_LOOK) {
  const g = new THREE.Group();
  const root = group(g);
  const legs = [], arms = [];
  for (const sx of [-1, 1]) {
    const leg = group(root, sx * 0.14, 0.55, 0);
    part(leg, capsule(0.11, 0.26, 4, 8), mat(o.overall), 0, -0.24, 0);
    part(leg, rbox(0.22, 0.14, 0.32, 0.06), mat(0x7a4a2e), 0, -0.5, 0.05);
    legs.push(leg);
  }
  part(root, rbox(0.64, 0.42, 0.44, 0.17), mat(o.overall), 0, 0.68, 0);
  part(root, rbox(0.6, 0.42, 0.4, 0.17), mat(o.shirt), 0, 0.98, 0);
  part(root, rbox(0.36, 0.28, 0.06, 0.03), mat(o.overall), 0, 0.93, 0.2);
  for (const sx of [-1, 1]) {
    part(root, box(0.07, 0.36, 0.05), mat(o.overall), sx * 0.17, 1.04, 0.19);
    part(root, sphere(0.035, 6, 4), mat(0xffd34d), sx * 0.13, 1.05, 0.23);
  }
  for (const sx of [-1, 1]) {
    const arm = group(root, sx * 0.36, 1.12, 0);
    part(arm, capsule(0.085, 0.26, 4, 8), mat(o.shirt), 0, -0.17, 0);
    part(arm, sphere(0.095, 10, 8), mat(COL.skin), 0, -0.38, 0);
    arm.rotation.z = sx * 0.15;
    arms.push(arm);
  }
  const head = group(root, 0, 1.6, 0);
  part(head, sphere(0.46, 20, 16), mat(COL.skin), 0, 0, 0, 0, 0, 0, 1, 0.94, 0.96);
  part(head, new THREE.SphereGeometry(0.485, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(o.hair), 0, 0.02, -0.04, -0.5, 0, 0);
  for (const sx of [-0.18, 0, 0.18]) part(head, sphere(0.11, 10, 8), mat(o.hair), sx, 0.24, 0.36, 0, 0, 0, 1.2, 0.8, 0.8);
  eyes(head, 0.15, 0.0, 0.41, 0.07);
  blush(head, 0.27, -0.12, 0.36, 0.08);
  part(head, sphere(0.05, 8, 6), mat(0xffb59a), 0, -0.07, 0.45);
  part(head, torus(0.05, 0.015, 4, 10, Math.PI), mat(COL.ink), 0, -0.17, 0.43, 0, 0, Math.PI);
  const hat = group(head, 0, 0.3, 0);
  hat.rotation.x = -0.15;
  if (o.cap) {
    part(hat, new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(o.hat), 0, -0.22, 0);
    part(hat, cyl(0.3, 0.32, 0.05, 16), mat(o.hat), 0, -0.2, 0.42, 0.15, 0, 0, 1, 1, 1.25);
    part(hat, sphere(0.06, 8, 6), mat(0xffffff), 0, 0.28, 0);
  } else {
    part(hat, cyl(0.68, 0.68, 0.05, 24), mat(o.hat), 0, 0.03, 0);
    part(hat, cyl(0.33, 0.37, 0.3, 18), mat(o.hat), 0, 0.2, 0);
    part(hat, cyl(0.375, 0.375, 0.08, 18), mat(o.band ?? 0xef6f6c), 0, 0.1, 0);
  }
  return merged({ group: g, root, head, legs, arms });
}

/** 운전석에 앉은 자세로 만들기 */
export function seatFigure(f) {
  f.group.scale.setScalar(0.78);
  f.group.position.set(0, -0.43, 0.05);
  for (const l of f.legs) l.rotation.x = -1.45;
  f.arms[0].rotation.x = -0.9; f.arms[1].rotation.x = -0.9;
  return f;
}

/** 항공기 조종사: 작게 앉히고 모자 대신 헤드셋 (기체 밖으로 튀어나오지 않게) */
export function pilotFigure(f) {
  seatFigure(f);
  f.group.scale.setScalar(0.58);
  f.group.position.set(0, -0.3, 0.04);
  for (const c of f.head.children) if (c.type === 'Group') c.visible = false;
  part(f.head, torus(0.5, 0.05, 6, 18, Math.PI), mat(0x4a4f5c), 0, 0.04, 0);
  for (const sx of [-1, 1]) part(f.head, sphere(0.15, 10, 8), mat(0xff8fab), sx * 0.48, -0.02, 0, 0, 0, 0, 0.6, 1, 1);
  return f;
}

// ---------------- 차량 ----------------

function wheel(parent, x, y, z, r, w, hub = 0xffd34d) {
  const steer = group(parent, x, y, z);
  const spin = group(steer);
  part(spin, cyl(r, r, w, 22), mat(COL.tire), 0, 0, 0, 0, 0, Math.PI / 2);
  part(spin, cyl(r * 0.58, r * 0.58, w + 0.02, 18), mat(hub), 0, 0, 0, 0, 0, Math.PI / 2);
  part(spin, cyl(r * 0.2, r * 0.2, w + 0.06, 10), mat(COL.dark), 0, 0, 0, 0, 0, Math.PI / 2);
  const side = Math.sign(x) || 1;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    part(spin, sphere(r * 0.08, 6, 4), mat(COL.dark), side * (w / 2 + 0.02), Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
  }
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    part(spin, box(w * 0.96, 0.07, r * 0.24), mat(COL.tire), 0, Math.cos(a) * r, Math.sin(a) * r, a, 0, 0);
  }
  return { steer, spin, r, side };
}

function seatMesh(body, x, y, z) {
  part(body, rbox(0.58, 0.14, 0.52, 0.06), mat(0x8b5a3c), x, y, z);
  part(body, rbox(0.58, 0.5, 0.12, 0.05), mat(0x8b5a3c), x, y + 0.3, z - 0.27);
  return group(body, x, y + 0.07, z);
}

function steeringWheel(body, x, y, z) {
  part(body, cyl(0.035, 0.035, 0.55, 6), mat(COL.dark), x, y - 0.2, z + 0.15, -0.6, 0, 0);
  part(body, torus(0.17, 0.035, 6, 16), mat(COL.dark), x, y, z, 1.0, 0, 0);
}

/** 반투명 유리 (1인칭 운전 시에는 숨김) */
export const glassMat = () => mat(0xd6f0ff, { transparent: true, opacity: 0.22, depthWrite: false });

const lampOff = () => mat(0x777b86);
const lampOn = () => mat(0x8dff8a, { emissive: 0x4fdc4a, emissiveIntensity: 0.9 });
export const LAMP = { off: lampOff, on: lampOn };

export function makeTractor() {
  const g = new THREE.Group(), body = group(g);
  const G1 = mat(0x86d474), G2 = mat(0x63b85c), D = mat(COL.dark), Wt = mat(0xfffaf0), Y = mat(0xffd34d);
  part(body, rbox(1.15, 0.55, 2.9, 0.2), G2, 0, 0.98, 0.15);
  part(body, rbox(1.1, 0.82, 1.65, 0.32), G1, 0, 1.6, 0.85);
  part(body, rbox(0.84, 0.5, 0.1, 0.04), D, 0, 1.52, 1.68);
  for (const i of [-1, 0, 1]) part(body, box(0.66, 0.05, 0.06), mat(0x9aa1ad), 0, 1.52 + i * 0.13, 1.74);
  const hl = glow(0xfff3b0, 0.25);
  for (const sx of [-1, 1]) part(body, sphere(0.12, 12, 8), hl, sx * 0.36, 1.82, 1.64, 0, 0, 0, 1, 1, 0.55);
  // 배기관은 보닛 오른쪽 끝에 (1인칭 시야 가운데를 가리지 않게)
  part(body, cyl(0.07, 0.07, 0.75, 10), D, 0.5, 2.3, 1.15);
  part(body, cyl(0.1, 0.08, 0.12, 10), D, 0.5, 2.7, 1.15);
  const seat = seatMesh(body, 0, 1.32, -0.55);
  steeringWheel(body, 0, 1.92, -0.12);
  for (const sx of [-1, 1]) for (const z of [-0.02, -1.02]) part(body, cyl(0.05, 0.05, 1.6, 8), D, sx * 0.7, 2.12, z);
  part(body, rbox(1.8, 0.14, 1.45, 0.07), Wt, 0, 2.95, -0.52);
  part(body, rbox(1.82, 0.06, 1.47, 0.03), mat(0xff8a7a), 0, 2.86, -0.52);
  for (const sx of [-1, 1]) part(body, rbox(0.56, 0.12, 1.35, 0.06), G1, sx * 0.99, 1.64, -0.6);
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 1.0, 0.8, -0.6, 0.8, 0.46));
  for (const sx of [-1, 1]) {
    const w = wheel(body, sx * 0.74, 0.46, 1.3, 0.46, 0.3);
    wheels.push(w); steer.push(w.steer);
  }
  const mower = group(body, 0, 0.75, 2.4);
  part(mower, box(0.22, 0.14, 0.9), D, 0, 0.18, -0.35);
  part(mower, rbox(2.8, 0.26, 0.9, 0.1), mat(0xff7b6b), 0, 0, 0.3);
  part(mower, rbox(2.86, 0.08, 0.14, 0.03), Y, 0, 0.12, 0.74);
  const discs = [];
  for (const i of [-1, 0, 1]) {
    const d = group(mower, i * 0.9, -0.17, 0.3);
    part(d, cyl(0.36, 0.36, 0.05, 14), mat(COL.metal));
    part(d, box(0.86, 0.03, 0.1), D, 0, -0.03, 0);
    discs.push(d);
  }
  return { group: g, body, wheels, steer, mower, discs, seat, exhaust: group(body, 0.5, 2.8, 1.15) };
}

export function makeBaler() {
  const g = new THREE.Group(), body = group(g);
  const R = mat(0xff9478), R2 = mat(0xf0705c), D = mat(COL.dark), Wt = mat(0xfffaf0), Y = mat(0xffd34d);
  part(body, rbox(1.45, 0.45, 3.3, 0.18), R2, 0, 0.85, -0.1);
  part(body, rbox(1.35, 0.6, 1.25, 0.22), R, 0, 1.3, 0.9);
  const hl = glow(0xfff3b0, 0.25);
  for (const sx of [-1, 1]) part(body, sphere(0.11, 12, 8), hl, sx * 0.45, 1.4, 1.53, 0, 0, 0, 1, 1, 0.5);
  const seat = seatMesh(body, 0, 1.64, 0.75);
  steeringWheel(body, 0, 2.08, 1.25);
  for (const sx of [-1, 1]) for (const z of [1.45, 0.25]) part(body, cyl(0.05, 0.05, 1.3, 8), D, sx * 0.62, 2.25, z);
  part(body, rbox(1.6, 0.14, 1.5, 0.07), Wt, 0, 2.92, 0.85);
  part(body, rbox(1.62, 0.06, 1.52, 0.03), mat(0x6fc3e8), 0, 2.83, 0.85);
  // 베일 챔버
  part(body, cyl(0.95, 0.95, 1.7, 24), R, 0, 1.78, -0.9, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) part(body, cyl(0.98, 0.98, 0.12, 24), Wt, sx * 0.6, 1.78, -0.9, 0, 0, Math.PI / 2);
  const tailgate = group(body, 0, 2.72, -0.9);
  part(tailgate, rbox(1.82, 1.85, 1.0, 0.45), R2, 0, -0.93, -0.5);
  part(tailgate, rbox(1.86, 0.16, 1.04, 0.06), Wt, 0, -0.93, -0.5);
  const lamps = [];
  for (let i = 0; i < 4; i++) lamps.push(part(body, sphere(0.08, 8, 6), lampOff(), -0.45 + i * 0.3, 2.7, -0.55));
  // 픽업 릴
  const pickup = group(body, 0, 0.7, 2.0);
  part(pickup, rbox(2.3, 0.3, 0.7, 0.12), Y, 0, 0.2, -0.1);
  part(pickup, box(0.2, 0.2, 0.8), D, 0, 0.2, -0.6);
  const reel = group(pickup, 0, -0.05, 0.1);
  part(reel, cyl(0.2, 0.2, 2.2, 12), D, 0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + i * 0.4;
      part(reel, cyl(0.02, 0.02, 0.22, 4), mat(COL.metal), -0.95 + i * 0.316, Math.cos(a) * 0.28, Math.sin(a) * 0.28, a, 0, 0);
    }
  }
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) {
    const w = wheel(body, sx * 0.88, 0.6, 0.95, 0.6, 0.36);
    wheels.push(w); steer.push(w.steer);
  }
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 0.98, 0.45, -1.45, 0.45, 0.3));
  part(body, cyl(0.06, 0.06, 0.8, 8), D, 0.55, 2.2, 0.2);
  return { group: g, body, wheels, steer, pickup, reel, tailgate, lamps, seat, exhaust: group(body, 0.55, 2.65, 0.2) };
}

export function makeForklift() {
  const g = new THREE.Group(), body = group(g);
  const Y = mat(0xffcc3d), Y2 = mat(0xf2b134), D = mat(COL.dark), M = mat(0x6b7280), M2 = mat(0x8a93a3);
  part(body, rbox(1.25, 0.6, 1.75, 0.22), Y, 0, 0.66, -0.1);
  part(body, rbox(1.3, 0.85, 0.6, 0.24), M, 0, 0.9, -0.95);
  part(body, rbox(1.0, 0.35, 0.7, 0.12), Y2, 0, 1.1, 0.35);
  const seat = seatMesh(body, 0, 1.02, -0.35);
  steeringWheel(body, 0, 1.6, 0.05);
  for (const sx of [-1, 1]) for (const z of [0.5, -0.75]) part(body, cyl(0.05, 0.05, 1.55, 8), D, sx * 0.56, 1.72, z);
  part(body, rbox(1.3, 0.08, 1.4, 0.04), Y, 0, 2.5, -0.12);
  for (const z of [-0.4, 0.0, 0.3]) part(body, box(1.2, 0.05, 0.06), D, 0, 2.47, z);
  const beacon = part(body, cyl(0.1, 0.12, 0.16, 10), mat(0xff9a3c), 0, 2.62, -0.5);
  const hl = glow(0xfff3b0, 0.25);
  for (const sx of [-1, 1]) part(body, sphere(0.09, 10, 8), hl, sx * 0.56, 2.38, 0.56);
  // 마스트 (틸트) → 안쪽 마스트 (상승) → 캐리지(포크)
  const mast = group(body, 0, 0.1, 1.0);
  for (const sx of [-1, 1]) part(mast, box(0.12, 2.3, 0.14), M, sx * 0.38, 1.2, 0);
  part(mast, box(0.88, 0.1, 0.14), M, 0, 2.35, 0);
  const inner = group(mast, 0, 0, 0.06);
  for (const sx of [-1, 1]) part(inner, box(0.09, 2.2, 0.1), M2, sx * 0.27, 1.15, 0);
  part(inner, box(0.62, 0.08, 0.1), M2, 0, 2.25, 0);
  // 유압 실린더
  part(mast, cyl(0.05, 0.05, 1.6, 8), mat(0xdfe6ee), 0, 0.85, -0.08);
  const carriage = group(mast, 0, 0.08, 0.12);
  part(carriage, box(0.95, 0.6, 0.08), D, 0, 0.32, 0);
  for (const i of [-1, 0, 1]) part(carriage, box(0.06, 0.6, 0.06), M, i * 0.3, 0.32, 0.04);
  for (const sx of [-1, 1]) {
    part(carriage, box(0.14, 0.06, 1.15), M, sx * 0.28, 0, 0.6);
    part(carriage, box(0.14, 0.5, 0.06), M, sx * 0.28, 0.25, 0.05);
  }
  const carry = group(carriage, 0, 0.03, 0.62);
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 0.6, 0.38, 0.6, 0.38, 0.32, 0xfff3d6));
  for (const sx of [-1, 1]) {
    const w = wheel(body, sx * 0.55, 0.32, -0.9, 0.32, 0.26, 0xfff3d6);
    wheels.push(w); steer.push(w.steer);
  }
  return { group: g, body, wheels, steer, rearSteer: true, mast, inner, carriage, carry, seat, beacon, exhaust: group(body, -0.45, 1.5, -1.15) };
}

export function makeSkidLoader() {
  const g = new THREE.Group(), body = group(g);
  const O = mat(0xffa14a), O2 = mat(0xf08a2c), D = mat(COL.dark), M = mat(0x8a93a3);
  part(body, rbox(1.45, 0.62, 2.0, 0.22), O2, 0, 0.75, -0.1);
  part(body, rbox(1.3, 0.62, 0.72, 0.22), O, 0, 1.35, -0.78);
  for (const i of [-1, 0, 1]) part(body, box(0.9, 0.05, 0.05), D, 0, 1.35 + i * 0.13, -1.15);
  const seat = seatMesh(body, 0, 1.1, -0.05);
  for (const sx of [-1, 1]) for (const z of [0.55, -0.42]) part(body, cyl(0.05, 0.05, 1.3, 8), D, sx * 0.56, 1.7, z);
  part(body, rbox(1.32, 0.12, 1.3, 0.05), O, 0, 2.38, 0.05);
  for (const i of [-1, 1]) part(body, box(0.04, 1.0, 0.04), D, i * 0.25, 1.75, 0.58);
  const beacon = part(body, cyl(0.09, 0.11, 0.14, 10), mat(0xff9a3c), 0.4, 2.5, -0.3);
  const hl = glow(0xfff3b0, 0.25);
  for (const sx of [-1, 1]) part(body, sphere(0.08, 10, 8), hl, sx * 0.5, 2.35, 0.7);
  // 리프트 암
  const arms = group(body, 0, 2.0, -0.9);
  for (const sx of [-1, 1]) part(arms, box(0.14, 0.22, 2.9), O, sx * 0.82, -0.775, 1.225, 0.564, 0, 0);
  part(arms, box(1.78, 0.12, 0.12), O, 0, -1.4, 2.25);
  const bucket = group(arms, 0, -1.55, 2.45);
  part(bucket, box(1.85, 0.07, 0.75), M, 0, -0.22, 0.25);
  part(bucket, box(1.85, 0.65, 0.07), M, 0, 0.08, -0.1);
  for (const sx of [-1, 1]) part(bucket, box(0.07, 0.5, 0.75), M, sx * 0.9, -0.02, 0.25);
  part(bucket, box(1.85, 0.05, 0.1), mat(0xdfe6ee), 0, -0.24, 0.62);
  const load = group(bucket, 0, -0.18, 0.25);
  for (const [x, z, s] of [[0, 0, 0.42], [-0.45, 0.05, 0.32], [0.45, -0.05, 0.33], [0.1, 0.15, 0.3]]) {
    part(load, sphere(s, 10, 8), mat(0x8b6a4f), x, 0.05, z, 0, 0, 0, 1.2, 0.6, 1);
  }
  load.visible = false;
  const carry = group(bucket, 0, -0.18, 0.28);
  const wheels = [];
  for (const sx of [-1, 1]) for (const z of [0.62, -0.62]) wheels.push(wheel(body, sx * 0.82, 0.42, z, 0.42, 0.34, 0x9aa1ad));
  part(body, cyl(0.06, 0.06, 0.5, 8), D, 0.45, 1.85, -1.0);
  return { group: g, body, wheels, steer: [], arms, bucket, load, carry, seat, beacon, exhaust: group(body, 0.45, 2.12, -1.0) };
}

// ---------------- 트럭 ----------------
function cabDetails(body, w, y, zFront, cabColor, h) {
  const glass = glassMat(), Wt = mat(0xfffaf0), D = mat(COL.dark);
  part(body, rbox(w - 0.2, h * 0.42, 0.1, 0.05), glass, 0, y + h * 0.15, zFront + 0.02, -0.1, 0, 0);
  for (const sx of [-1, 1]) {
    part(body, box(0.06, h * 0.36, 0.9), glass, sx * (w / 2 + 0.01), y + h * 0.15, zFront - 0.6);
    part(body, rbox(0.12, 0.3, 0.08, 0.03), D, sx * (w / 2 + 0.18), y + h * 0.12, zFront - 0.1);
    part(body, sphere(0.14, 12, 8), glow(0xfff3b0, 0.25), sx * (w / 2 - 0.35), y - h * 0.32, zFront + 0.03, 0, 0, 0, 1, 0.8, 0.45);
  }
  part(body, rbox(w + 0.05, 0.28, 0.25, 0.1), Wt, 0, y - h * 0.5 + 0.05, zFront + 0.05);
  part(body, rbox(w * 0.5, 0.2, 0.06, 0.04), D, 0, y - h * 0.3, zFront + 0.03);
  // 대시보드 (1인칭에서 보임)
  part(body, rbox(w - 0.3, 0.25, 0.4, 0.06), mat(0x6b5a50), 0, y - 0.1, zFront - 0.35);
}

export function makeTruck1() {
  const g = new THREE.Group(), body = group(g);
  const C = mat(0xa8dcf5), Wt = mat(0xfffaf0), D = mat(COL.dark), M = mat(0xc9d1dc);
  part(body, box(1.1, 0.24, 4.4, 1), D, 0, 0.62, -0.25);
  part(body, rbox(1.8, 1.55, 1.5, 0.38), C, 0, 1.45, 1.6);
  part(body, rbox(1.82, 0.1, 1.52, 0.04), Wt, 0, 1.0, 1.6);
  cabDetails(body, 1.8, 1.45, 2.35, C, 1.55);
  part(body, rbox(1.3, 0.12, 0.45, 0.05), Wt, 0, 2.27, 1.75);
  const seat = group(body, 0.38, 1.05, 1.55);
  steeringWheel(body, 0.38, 1.55, 1.95);
  const bed = group(body, 0, 1.0, -0.85);
  part(bed, box(1.78, 0.12, 2.9), M, 0, -0.06, 0);
  for (const sx of [-1, 1]) part(bed, box(0.06, 0.42, 2.9), M, sx * 0.88, 0.2, 0);
  part(bed, box(1.78, 0.95, 0.08), M, 0, 0.47, 1.45);
  for (const y of [0.25, 0.55, 0.8]) part(bed, box(1.78, 0.04, 0.1), mat(0x9aa7b8), 0, y, 1.47);
  const tailgate = group(bed, 0, 0.0, -1.45);
  part(tailgate, box(1.78, 0.42, 0.06), M, 0, 0.21, 0);
  const load = group(bed, 0, 0.02, 0);
  for (const [x, z, s] of [[0, 0, 0.85], [-0.3, 0.8, 0.6], [0.3, -0.8, 0.65]]) part(load, sphere(1, 12, 8), mat(0x8b6a4f), x, 0, z, 0, 0, 0, s * 0.95, s * 0.5, s * 1.3);
  load.visible = false;
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) { const w = wheel(body, sx * 0.78, 0.4, 1.55, 0.4, 0.26, 0xfffaf0); wheels.push(w); steer.push(w.steer); }
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 0.78, 0.4, -1.3, 0.4, 0.3, 0xfffaf0));
  const slots = [{ x: 0, z: 0.68 }, { x: 0, z: -0.68 }];
  return { group: g, body, wheels, steer, bed, tailgate, load, seat, slots, bedY: 1.0, bedHalf: { x: 0.9, z: 1.45 }, exhaust: group(body, -0.55, 0.5, -2.3) };
}

/** 자가용: 동글동글한 2도어 해치백 */
// ---------------- 손으로 미는 수레 · 농기구 ----------------
/** 미는 사람 자세: 서서 손잡이를 잡는다 (pull=true면 앞에서 손잡이를 끄는 리어카 자세) */
export function pushFigure(f, pull = false) {
  f.group.scale.setScalar(1);
  f.group.position.set(0, 0, 0);
  f.arms[0].rotation.x = f.arms[1].rotation.x = pull ? 0.35 : -0.95;
  f.push = true;
  return f;
}

/** 🛞 손수레(외바퀴): 분뇨·퇴비를 담는다 */
export function makeWheelbarrow() {
  const g = new THREE.Group(), body = group(g);
  const T = mat(0x6fb8e0), T2 = mat(0x4f97c4), W = mat(0xc98a5a), D = mat(COL.dark);
  // 통 (앞이 낮고 뒤가 높은 사다리꼴)
  part(body, rbox(1.0, 0.12, 1.2, 0.05), T2, 0, 0.5, 0.15);
  part(body, rbox(1.12, 0.42, 0.1, 0.05), T, 0, 0.72, 0.8, -0.35, 0, 0);
  part(body, rbox(1.12, 0.42, 0.1, 0.05), T, 0, 0.72, -0.48, 0.25, 0, 0);
  for (const sx of [-1, 1]) part(body, rbox(0.1, 0.42, 1.35, 0.05), T, sx * 0.56, 0.72, 0.15);
  // 손잡이 · 다리
  for (const sx of [-1, 1]) {
    part(body, cyl(0.045, 0.045, 2.2, 8), W, sx * 0.36, 0.62, -0.25, Math.PI / 2 - 0.12, 0, 0);
    part(body, sphere(0.07, 8, 6), D, sx * 0.36, 0.76, -1.33);
    part(body, cyl(0.04, 0.04, 0.5, 6), D, sx * 0.36, 0.25, -0.5);
  }
  const wheels = [wheel(body, 0, 0.3, 1.0, 0.3, 0.14)];
  const load = group(body, 0, 0.62, 0.15);
  part(load, sphere(1, 12, 8), mat(0x8b6a4f), 0, 0, 0, 0, 0, 0, 0.42, 0.22, 0.5);
  load.visible = false;
  const seat = group(body, 0, 0, -1.55);
  return { group: g, body, wheels, steer: [], seat, load, exhaust: group(body, 0, 0.5, -1) };
}

/** 🛒 리어카(두 바퀴 수레): 앞에서 손잡이를 끌고, 짐칸에 건초·팔레트·포대를 2개 싣는다 */
export function makeHandcart() {
  const g = new THREE.Group(), body = group(g);
  const W = mat(0xd9a066), W2 = mat(0xb9874f), D = mat(COL.dark), M = mat(0x9aa3b2);
  const bed = group(body, 0, 0.78, -0.45);
  part(bed, box(1.5, 0.08, 2.5), W, 0, -0.04, 0);
  for (let i = 0; i < 5; i++) part(bed, box(1.52, 0.02, 0.08), W2, 0, 0.01, -1.1 + i * 0.55);
  for (const sx of [-1, 1]) part(bed, box(0.06, 0.3, 2.5), W2, sx * 0.76, 0.12, 0);
  part(bed, box(1.5, 0.3, 0.06), W2, 0, 0.12, -1.25);
  // 손잡이 (앞으로 길게 뻗어 사람이 그 사이에서 끈다)
  for (const sx of [-1, 1]) {
    part(body, cyl(0.045, 0.045, 1.9, 8), M, sx * 0.5, 0.82, 1.55, Math.PI / 2, 0, 0);
    part(body, cyl(0.04, 0.04, 0.5, 6), D, sx * 0.5, 0.25, -1.55);
  }
  part(body, cyl(0.045, 0.045, 1.0, 8), M, 0, 0.82, 2.48, 0, 0, Math.PI / 2);
  part(body, box(1.7, 0.08, 0.1), D, 0, 0.42, -0.45);
  const wheels = [];
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 0.9, 0.42, -0.45, 0.42, 0.12, 0xfffaf0));
  const seat = group(body, 0, 0, 2.2);
  const slots = [{ x: 0, z: 0.62 }, { x: 0, z: -0.62 }];
  return { group: g, body, wheels, steer: [], seat, bed, slots, bedY: 0.78, bedHalf: { x: 0.75, z: 1.25 }, exhaust: group(body, 0, 0.5, -1.5) };
}

/** 🪏 삽 / 🌾 낫 (손에 드는 농기구) */
export function makeShovel() {
  const g = new THREE.Group();
  part(g, cyl(0.035, 0.035, 1.25, 8), mat(0xc98a5a), 0, 0, 0.55, Math.PI / 2, 0, 0);
  part(g, rbox(0.3, 0.04, 0.34, 0.03), mat(0x9aa3b2), 0, -0.02, 1.28);
  const lump = group(g, 0, 0.06, 1.28);
  part(lump, sphere(0.15, 8, 6), mat(0x8b6a4f), 0, 0, 0, 0, 0, 0, 1, 0.5, 1);
  lump.visible = false;
  g.userData.lump = lump;
  return g;
}
export function makeSickle() {
  const g = new THREE.Group();
  part(g, cyl(0.035, 0.035, 0.42, 8), mat(0xc98a5a), 0, 0, 0.18, Math.PI / 2, 0, 0);
  part(g, torus(0.2, 0.025, 4, 14, Math.PI * 1.1), mat(0xd7dde6), 0.18, 0, 0.4, Math.PI / 2, 0, 0);
  return g;
}
/** 품에 안은 풀 한 아름 */
export function makeArmful() {
  const g = new THREE.Group();
  part(g, capsule(0.18, 0.5, 4, 8), mat(0xe8d070), 0, 0, 0, 0, 0, Math.PI / 2);
  return g;
}

export function makeCar() {
  const g = new THREE.Group(), body = group(g);
  const C = mat(0xff9eb5), Wt = mat(0xfffaf0), D = mat(COL.dark), glass = glassMat();
  // 차체 + 흰 띠
  part(body, rbox(1.9, 0.66, 3.9, 0.3), C, 0, 0.7, 0);
  part(body, rbox(1.94, 0.1, 3.5, 0.04), Wt, 0, 0.78, 0);
  part(body, rbox(1.7, 0.2, 1.2, 0.1), C, 0, 1.06, 1.25);      // 보닛
  // 유리 객실 + 기둥 + 지붕
  part(body, rbox(1.66, 0.72, 2.0, 0.22), glass, 0, 1.38, -0.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(body, rbox(0.1, 0.74, 0.12, 0.04), C, sx * 0.8, 1.38, -0.3 + sz * 0.94);
  part(body, rbox(1.76, 0.14, 2.1, 0.07), C, 0, 1.78, -0.3);
  part(body, rbox(1.2, 0.06, 1.3, 0.03), Wt, 0, 1.86, -0.3);
  // 범퍼 · 그릴 · 라이트
  for (const z of [1.98, -1.98]) part(body, rbox(1.96, 0.24, 0.24, 0.1), Wt, 0, 0.46, z);
  part(body, rbox(0.8, 0.2, 0.06, 0.04), D, 0, 0.72, 1.96);
  for (const sx of [-1, 1]) {
    part(body, sphere(0.16, 12, 8), glow(0xfff3b0, 0.25), sx * 0.62, 0.82, 1.92, 0, 0, 0, 1, 0.85, 0.5);
    part(body, rbox(0.3, 0.16, 0.06, 0.04), mat(0xff5a5f), sx * 0.64, 0.84, -1.96);
    part(body, rbox(0.1, 0.16, 0.22, 0.04), C, sx * 0.98, 1.2, 0.62);      // 사이드미러
  }
  // 실내 (1인칭에서 보임)
  part(body, rbox(1.5, 0.22, 0.36, 0.06), mat(0x6b5a50), 0, 1.08, 0.55);
  seatMesh(body, -0.38, 0.62, -0.25);
  const seat = group(body, 0.38, 0.69, -0.25);
  part(body, rbox(0.58, 0.14, 0.52, 0.06), mat(0x8b5a3c), 0.38, 0.62, -0.25);
  part(body, rbox(0.58, 0.5, 0.12, 0.05), mat(0x8b5a3c), 0.38, 0.92, -0.52);
  steeringWheel(body, 0.38, 1.16, 0.25);
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) { const w = wheel(body, sx * 0.86, 0.38, 1.25, 0.38, 0.24, 0xfffaf0); wheels.push(w); steer.push(w.steer); }
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 0.86, 0.38, -1.25, 0.38, 0.24, 0xfffaf0));
  return { group: g, body, wheels, steer, seat, exhaust: group(body, -0.55, 0.38, -2.05) };
}

export function makeTruck5() {
  const g = new THREE.Group(), body = group(g);
  const C = mat(0xffc94d), O = mat(0xff9f5a), Wt = mat(0xfffaf0), D = mat(COL.dark), M = mat(0x9aa7b8);
  part(body, box(1.25, 0.3, 7.2, 3), D, 0, 0.78, -0.4);
  part(body, rbox(2.35, 2.0, 1.9, 0.42), C, 0, 2.0, 2.55);
  part(body, rbox(2.37, 0.12, 1.92, 0.05), Wt, 0, 1.35, 2.55);
  cabDetails(body, 2.35, 2.0, 3.5, C, 2.0);
  part(body, rbox(1.8, 0.16, 0.5, 0.06), Wt, 0, 3.08, 2.75);
  for (const sx of [-1, 1]) part(body, rbox(0.5, 0.12, 0.9, 0.05), D, sx * 0.95, 1.05, 2.5);
  const seat = group(body, 0.5, 1.6, 2.45);
  steeringWheel(body, 0.5, 2.1, 2.9);
  // 덤프 적재함 (뒤쪽 경첩 기준으로 들림)
  const bed = group(body, 0, 1.3, -3.85);
  part(bed, box(2.4, 0.14, 5.7, 1, 1, 4), O, 0, 0, 2.85);
  for (const sx of [-1, 1]) {
    part(bed, box(0.08, 0.75, 5.7), O, sx * 1.2, 0.42, 2.85);
    part(bed, box(0.1, 0.08, 5.7), Wt, sx * 1.2, 0.82, 2.85);
  }
  part(bed, box(2.4, 1.2, 0.1), O, 0, 0.6, 5.7);
  part(bed, box(2.4, 0.1, 0.5), O, 0, 1.2, 5.85);
  const tailgate = group(bed, 0, 0.8, 0);
  part(tailgate, box(2.4, 0.75, 0.08), O, 0, -0.38, 0);
  part(tailgate, box(2.4, 0.08, 0.1), Wt, 0, -0.05, 0);
  const load = group(bed, 0, 0.07, 2.85);
  for (const [x, z, s] of [[0, 0, 1.3], [-0.5, 1.4, 0.9], [0.5, -1.4, 0.95], [0.3, 1.6, 0.8], [-0.4, -1.8, 0.8]]) {
    part(load, sphere(1, 12, 8), mat(0x8b6a4f), x, 0, z, 0, 0, 0, s * 0.95, s * 0.45, s * 1.4);
  }
  load.visible = false;
  const cylinder = part(body, cyl(0.1, 0.1, 1.2, 8), mat(0xdfe6ee), 0, 1.0, 1.2);
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) { const w = wheel(body, sx * 1.05, 0.55, 2.5, 0.55, 0.38, 0xfffaf0); wheels.push(w); steer.push(w.steer); }
  for (const z of [-1.9, -3.05]) for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 1.0, 0.55, z, 0.55, 0.5, 0xfffaf0));
  const slots = [];
  for (const z of [4.85, 3.55, 2.25, 0.95]) for (const x of [-0.56, 0.56]) slots.push({ x, z });
  part(body, cyl(0.07, 0.07, 1.4, 8), D, -1.05, 2.4, 1.5);
  return { group: g, body, wheels, steer, bed, tailgate, load, cylinder, seat, slots, bedY: 1.37, bedHalf: { x: 1.15, z: 2.85 }, bedCenterZ: 2.85, exhaust: group(body, -1.05, 3.15, 1.5) };
}

export function makeMixer() {
  const g = new THREE.Group(), body = group(g);
  const C = mat(0x8fdcc8), C2 = mat(0x5fc4ae), D = mat(COL.dark), Wt = mat(0xfffaf0);
  part(body, box(1.4, 0.35, 4.3, 1, 1, 2), D, 0, 0.75, -0.25);
  part(body, rbox(1.7, 1.45, 1.35, 0.38), C, 0, 1.6, 1.45);
  part(body, rbox(1.72, 0.1, 1.37, 0.04), Wt, 0, 1.05, 1.45);
  part(body, rbox(1.45, 0.62, 0.1, 0.05), glassMat(), 0, 1.85, 2.13, -0.1, 0, 0);
  for (const sx of [-1, 1]) {
    part(body, box(0.06, 0.5, 0.8), glassMat(), sx * 0.86, 1.85, 1.4);
    part(body, sphere(0.12, 10, 8), glow(0xfff3b0, 0.25), sx * 0.55, 1.2, 2.13, 0, 0, 0, 1, 0.8, 0.45);
  }
  part(body, rbox(1.3, 0.25, 0.4, 0.06), mat(0x6b5a50), 0, 1.45, 1.85);
  const seat = group(body, 0, 1.18, 1.3);
  steeringWheel(body, 0, 1.65, 1.7);
  // 배합 통 (위가 넓은 원뿔대)
  const tubG = group(body, 0, 0, -1.15);
  part(tubG, cyl(1.3, 0.95, 1.7, 22), C2, 0, 1.85, 0);
  part(tubG, torus(1.3, 0.09, 8, 28), Wt, 0, 2.7, 0, Math.PI / 2, 0, 0);
  part(tubG, cyl(0.98, 0.98, 0.18, 22), Wt, 0, 1.12, 0);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(tubG, box(0.06, 1.6, 0.06), mat(0x4fae9a), Math.cos(a) * 1.13, 1.85, Math.sin(a) * 1.13, Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); }
  const fill = group(tubG, 0, 1.1, 0);
  const fillMesh = part(fill, cyl(1.18, 0.95, 1, 20), mat(0xe8c86a), 0, 0.5, 0);
  fillMesh.castShadow = false;
  fill.scale.y = 0.001;
  const auger = group(tubG, 0, 1.15, 0);
  part(auger, cyl(0.07, 0.07, 1.5, 8), mat(COL.metal), 0, 0.75, 0);
  for (let i = 0; i < 6; i++) part(auger, box(0.95 - i * 0.12, 0.05, 0.16), mat(COL.metal), 0, 0.15 + i * 0.24, 0, 0, i * 1.05, 0.25);
  // 배출구 (오른쪽)
  const door = group(tubG, -1.12, 1.35, 0);
  part(door, box(0.08, 0.55, 0.85), mat(0xffd34d), 0, 0.27, 0);
  const chute = part(tubG, box(0.75, 0.06, 0.75), mat(COL.metal), -1.5, 1.15, 0, 0, 0, 0.35);
  const out = group(tubG, -1.85, 1.0, 0);
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) { const w = wheel(body, sx * 0.82, 0.45, 1.4, 0.45, 0.3, 0xfffaf0); wheels.push(w); steer.push(w.steer); }
  for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 0.88, 0.5, -1.25, 0.5, 0.36, 0xfffaf0));
  const beacon = part(body, cyl(0.09, 0.11, 0.14, 10), mat(0xff9a3c), 0.5, 2.38, 1.6);
  part(body, cyl(0.06, 0.06, 0.6, 8), D, 0.7, 2.1, 0.75);
  return { group: g, body, wheels, steer, seat, beacon, tub: tubG, fill, fillMesh, auger, door, chute, out, exhaust: group(body, 0.7, 2.45, 0.75) };
}

export function makeBaleWagon() {
  const g = new THREE.Group(), body = group(g);
  const C = mat(0xa9c8ff), C2 = mat(0x7fa8f0), D = mat(COL.dark), Wt = mat(0xfffaf0), W = mat(0xe0b077), M = mat(COL.metal);
  part(body, box(1.3, 0.32, 7.4, 1, 1, 3), D, 0, 0.8, -1.6);
  // 앞쪽 캡 (작은 트랙터 모양)
  part(body, rbox(1.25, 0.7, 1.6, 0.28), C, 0, 1.3, 1.5);
  part(body, rbox(0.8, 0.45, 0.1, 0.04), D, 0, 1.3, 2.32);
  for (const sx of [-1, 1]) part(body, sphere(0.11, 10, 8), glow(0xfff3b0, 0.25), sx * 0.4, 1.5, 2.3, 0, 0, 0, 1, 1, 0.5);
  const seat = seatMesh(body, 0, 1.25, 0.3);
  steeringWheel(body, 0, 1.85, 0.8);
  for (const sx of [-1, 1]) for (const z of [1.0, -0.2]) part(body, cyl(0.05, 0.05, 1.5, 8), D, sx * 0.68, 2.0, z);
  part(body, rbox(1.6, 0.14, 1.5, 0.07), Wt, 0, 2.8, 0.4);
  part(body, rbox(1.62, 0.06, 1.52, 0.03), C2, 0, 2.71, 0.4);
  // 앞 집게 (리프트 암 + 클램프)
  const arms = group(body, 0, 1.9, 0.9);
  for (const sx of [-1, 1]) part(arms, box(0.14, 0.2, 2.2), C2, sx * 0.78, -0.55, 1.0, 0.52, 0, 0);
  part(arms, box(1.7, 0.12, 0.12), C2, 0, -1.05, 1.9);
  const clamp = group(arms, 0, -1.2, 2.1);
  part(clamp, box(1.5, 0.5, 0.08), M, 0, 0.1, -0.05);
  const jaws = [];
  for (const sx of [-1, 1]) {
    const j = group(clamp, sx * 0.72, 0, 0);
    part(j, box(0.08, 0.5, 1.1), mat(0xffd34d), 0, 0.05, 0.55);
    part(j, box(0.16, 0.1, 0.12), mat(0xffd34d), -sx * 0.06, -0.15, 1.08);
    jaws.push({ g: j, s: sx });
  }
  const carry = group(clamp, 0, -0.55, 0.62);
  // 적재 데크 (뒤쪽 경첩 기준으로 들림)
  const bed = group(body, 0, 1.12, -5.7);
  part(bed, box(2.45, 0.14, 5.1, 1, 1, 3), W, 0, 0, 2.55);
  for (let i = 0; i < 5; i++) part(bed, box(2.47, 0.03, 0.12), mat(0xb9874f), 0, 0.08, 0.5 + i * 1.0);
  for (const sx of [-1, 1]) part(bed, box(0.08, 0.35, 5.1), C2, sx * 1.22, 0.2, 2.55);
  part(bed, box(2.45, 0.9, 0.1), C2, 0, 0.45, 5.1);
  const cylinder = part(body, cyl(0.09, 0.09, 1.0, 8), M, 0, 0.95, -0.9);
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) { const w = wheel(body, sx * 0.78, 0.5, 1.6, 0.5, 0.32, 0xfffaf0); wheels.push(w); steer.push(w.steer); }
  for (const z of [-3.3, -4.6]) for (const sx of [-1, 1]) wheels.push(wheel(body, sx * 1.05, 0.5, z, 0.5, 0.36, 0xfffaf0));
  const slots = [];
  for (const z of [4.1, 2.55, 1.0]) for (const x of [-0.58, 0.58]) slots.push({ x, z, ry: 0 });
  part(body, cyl(0.06, 0.06, 0.7, 8), D, 0.5, 2.0, 1.9);
  return { group: g, body, wheels, steer, seat, arms, clamp, jaws, carry, bed, cylinder, slots, bedY: 1.19, bedHalf: { x: 1.2, z: 2.55 }, bedCenterZ: 2.55, exhaust: group(body, 0.5, 2.4, 1.9) };
}

// ---------------- 하늘 탈것 ----------------
/** 🚁 MD 500 스타일 소형 헬기: 달걀 동체 · 5날 로터 · T자 꼬리 · 화물 후크 (정원 2명) */
export function makeHelicopter() {
  const g = new THREE.Group(), body = group(g), inner = group(body);
  const S = 0.78;               // 작고 귀엽게 (원래 크기의 78%)
  inner.scale.setScalar(S);
  const Y = mat(0xffd36e), Y2 = mat(0xf2b134), W = mat(0xfffaf0), D = mat(COL.dark), M = mat(COL.metal), K = mat(0x5a6170);
  // 높은 스키드 (앞 다리가 조금 더 길다)
  for (const sx of [-1, 1]) {
    part(inner, capsule(0.075, 3.3, 3, 8), M, sx * 1.05, 0.1, 0.15, Math.PI / 2, 0, 0);
    part(inner, sphere(0.09, 8, 6), M, sx * 1.05, 0.16, 1.8, 0, 0, 0, 1, 1, 1.4);
    part(inner, cyl(0.06, 0.06, 1.15, 6), K, sx * 0.85, 0.62, 0.95, 0.15, 0, sx * 0.35);
    part(inner, cyl(0.06, 0.06, 1.1, 6), K, sx * 0.85, 0.6, -0.75, -0.1, 0, sx * 0.35);
  }
  // 달걀 모양 동체 (앞이 둥글고 뒤가 좁다)
  const egg = group(inner, 0, 1.75, 0.2);
  part(egg, sphere(1.15, 24, 18), Y, 0, 0, 0, 0, 0, 0, 1.0, 1.0, 1.35);
  part(egg, sphere(1.0, 20, 14), Y, 0, 0.05, -0.75, 0, 0, 0, 0.8, 0.85, 1.0);
  // 앞 유리 (위·아래 버블)
  part(egg, sphere(0.8, 22, 16), mat(0xbfe8ff), 0, 0.18, 0.98, 0, 0, 0, 1.05, 0.78, 0.62);
  part(egg, sphere(0.8, 22, 16), glassMat(), 0, 0.2, 1.02, 0, 0, 0, 1.08, 0.8, 0.64);
  part(egg, sphere(0.5, 14, 10), mat(0xbfe8ff), 0, -0.48, 1.18, 0, 0, 0, 0.95, 0.5, 0.5);
  // 반짝이는 눈 (귀엽게)
  for (const sx of [-1, 1]) part(egg, sphere(0.13, 10, 8), mat(0xffffff), sx * 0.32, 0.38, 1.47, 0, 0, 0, 1, 1.1, 0.4);
  // 옆문 창 · 줄무늬 · 귀여운 볼터치
  for (const sx of [-1, 1]) {
    part(egg, sphere(0.42, 14, 10), glassMat(), sx * 1.0, 0.15, -0.05, 0, 0, 0, 0.25, 0.85, 1.0);
    part(egg, sphere(0.18, 10, 8), mat(0xffa3b5), sx * 0.98, -0.32, 0.55, 0, 0, 0, 0.25, 0.7, 1);
  }
  part(egg, torus(1.17, 0.07, 6, 30), W, 0, -0.35, 0, Math.PI / 2, 0, 0, 1, 1.32, 1);
  // 엔진 덮개 · 배기구
  part(inner, rbox(0.9, 0.45, 1.3, 0.2), Y2, 0, 2.75, -0.35);
  // 꼬리붐 + T자 꼬리
  part(inner, cyl(0.13, 0.26, 3.2, 12), Y, 0, 2.0, -2.55, Math.PI / 2 - 0.05, 0, 0);
  const tail = group(inner, 0, 2.15, -4.15);
  part(tail, rbox(0.1, 1.15, 0.6, 0.05), Y2, 0, 0.5, -0.05, -0.32, 0, 0);
  part(tail, rbox(0.1, 0.65, 0.45, 0.05), Y2, 0, -0.3, 0.05, 0.4, 0, 0);
  part(tail, rbox(1.25, 0.08, 0.42, 0.04), W, 0, 1.0, -0.2);
  for (const sx of [-1, 1]) part(tail, rbox(0.06, 0.32, 0.36, 0.03), Y2, sx * 0.62, 1.0, -0.2);
  for (const sx of [-1, 1]) part(inner, sphere(0.06, 6, 4), glow(sx > 0 ? 0x8fff8a : 0xff6b6b, 0.5), sx * 0.66, 3.15, -4.35);
  const trotor = group(tail, 0.14, 0.15, 0.05);
  for (let i = 0; i < 2; i++) part(trotor, box(0.04, 0.8, 0.11), D, 0, 0, 0, i * Math.PI / 2, 0, 0);
  part(trotor, sphere(0.07, 8, 6), mat(0xff8a7a), 0.03, 0, 0);
  // 5날 메인 로터
  part(inner, cyl(0.1, 0.16, 0.45, 10), D, 0, 3.15, 0.0);
  const rotor = group(inner, 0, 3.42, 0.0);
  part(rotor, cyl(0.26, 0.26, 0.14, 12), mat(0xff8a7a));
  part(rotor, sphere(0.14, 10, 8), mat(0xff8a7a), 0, 0.1, 0);
  for (let i = 0; i < 5; i++) {
    const bl = group(rotor);
    bl.rotation.y = (i / 5) * Math.PI * 2;
    part(bl, box(0.26, 0.04, 3.9), K, 0, 0, 2.05);
    part(bl, box(0.27, 0.05, 0.35), W, 0, 0.005, 3.85);
  }
  const beacon = part(inner, sphere(0.1, 8, 6), mat(0xff6b6b), 0, 2.98, -1.05);
  // 조종석 2자리 (나란히) — 작은 조종사가 달걀 동체 안에 쏙 들어간다
  const seat = group(body, 0.3 * S, 1.02 * S, 0.42 * S);
  const seat2 = group(body, -0.3 * S, 1.02 * S, 0.42 * S);
  // 화물 후크 (배 밑)
  const hook = group(body, 0, 0.62 * S, 0.15 * S);
  part(hook, cyl(0.1, 0.1, 0.08, 10), D);
  return { group: g, body, wheels: [], steer: [], rotor, trotor, beacon, seat, seat2, hook, hookY: 0.58 * S, hookZ: 0.15 * S, carry: g, exhaust: group(inner, 0, 2.8, -1.05), heli: true };
}

/** ✈️ 초소형 2인승 경비행기: 통통한 작은 저익기 · 물방울 캐노피 · 앞뒤(탠덤) 좌석 · 세발바퀴 */
/** 공통: 뒷전에 붙는 조종면(플랩·보조익·승강타 등) — 앞쪽 경첩을 축으로 접힌다 */
function surface(parent, x, y, z, w, d, m, ry = 0) {
  const gr = group(parent, x, y, z);
  gr.rotation.y = ry;
  const inner = group(gr);
  part(inner, rbox(w, 0.06, d, 0.02), m, 0, 0, -d / 2);
  return { gr, inner };
}

/** 🛫 미니 여객기: 쌍발 제트 · 후퇴익 · 긴 동체와 창문 줄 (작게 줄인 귀여운 여객기) */
export function makeLiner() {
  const g = new THREE.Group(), body = group(g);
  const W = mat(0xfffaf0), P = mat(0x6fb8f0), P2 = mat(0x4f9be0), D = mat(COL.dark), M = mat(COL.metal), Win = mat(0x3b3f4a);   // 창문은 칠해지지 않는 짙은 회색
  const fus = group(body, 0, 1.25, 0);
  part(fus, capsule(0.62, 6.6, 8, 18), W, 0, 0, 0.2, Math.PI / 2, 0, 0);
  part(fus, cyl(0.6, 0.18, 2.2, 18), W, 0, 0.22, -4.1, Math.PI / 2 + 0.16, 0, 0);   // 위로 들린 꼬리
  // 배 쪽 회색 · 옆구리 줄무늬(도색)
  part(fus, capsule(0.5, 6.0, 6, 16), mat(0xe3e7ee), 0, -0.2, 0.2, Math.PI / 2, 0, 0, 1, 1, 0.9);
  for (const sx of [-1, 1]) {
    part(fus, box(0.04, 0.1, 7.0), P, sx * 0.61, -0.08, 0.1);
    part(fus, box(0.04, 0.05, 6.6), P2, sx * 0.6, -0.2, 0.05);
    // 창문 줄
    for (let z = -2.7; z <= 2.7; z += 0.45) part(fus, rbox(0.04, 0.16, 0.18, 0.03), Win, sx * 0.6, 0.2, z);
    part(fus, rbox(0.04, 0.42, 0.3, 0.04), mat(0xc9ced8), sx * 0.6, 0.02, 2.95);   // 문
  }
  // 조종석 창 (앞이마)
  part(fus, rbox(0.62, 0.16, 0.25, 0.05), Win, 0, 0.32, 3.72, -0.55, 0, 0);
  for (const sx of [-1, 1]) part(fus, rbox(0.2, 0.15, 0.22, 0.04), Win, sx * 0.36, 0.28, 3.62, -0.4, sx * 0.6, 0);
  part(fus, sphere(0.08, 8, 6), mat(COL.blush), 0.45, -0.05, 3.8);
  part(fus, sphere(0.08, 8, 6), mat(COL.blush), -0.45, -0.05, 3.8);
  // 후퇴익 (낮은 날개) + 날개 끝 윙렛
  const flaps = [], ailerons = [];
  for (const sx of [-1, 1]) {
    part(body, rbox(4.0, 0.14, 1.25, 0.05), W, sx * 2.25, 0.88, 0.0, 0, sx * 0.32, 0);
    part(body, rbox(0.1, 0.6, 0.55, 0.03), P, sx * 4.12, 1.15, -0.72, 0, 0, sx * -0.25);
    part(body, sphere(0.08, 8, 6), glow(sx > 0 ? 0x8fff8a : 0xff6b6b, 0.6), sx * 4.15, 0.95, -0.55);
    const f = surface(body, sx * 1.5, 0.86, -0.6, 1.5, 0.35, W, sx * 0.32);
    flaps.push(f.inner);
    const a = surface(body, sx * 3.3, 0.86, -1.2, 1.1, 0.3, P, sx * 0.32);
    a.inner.userData.side = sx;
    ailerons.push(a.inner);
  }
  // 날개 밑 쌍발 엔진 (돌아가는 팬)
  const fans = [];
  for (const sx of [-1, 1]) {
    const e = group(body, sx * 1.95, 0.6, 0.45);
    part(e, cyl(0.34, 0.3, 1.25, 18), P, 0, 0, 0, Math.PI / 2, 0, 0);
    part(e, cyl(0.3, 0.3, 0.05, 18), D, 0, 0, 0.62, Math.PI / 2, 0, 0);
    part(e, cyl(0.2, 0.12, 0.3, 12), M, 0, 0, -0.72, Math.PI / 2, 0, 0);
    part(body, rbox(0.12, 0.3, 0.7, 0.03), W, sx * 1.95, 0.82, 0.35);   // 엔진 기둥
    const fan = group(e, 0, 0, 0.6);
    part(fan, cone(0.1, 0.18, 10), mat(0xfffaf0), 0, 0, 0.06, Math.PI / 2, 0, 0);
    for (let k = 0; k < 6; k++) part(fan, box(0.05, 0.5, 0.02), mat(COL.metal), 0, 0, 0, 0, 0, (k * Math.PI) / 6);
    fans.push(fan);
  }
  // 꼬리: 수직날개(도색) + 방향타, 수평날개 + 승강타
  part(body, rbox(0.12, 1.45, 1.05, 0.06), P, 0, 2.2, -4.3, -0.5, 0, 0);
  const rp = group(body, 0, 2.15, -4.72);
  rp.rotation.x = -0.5;
  const rudder = group(rp);
  part(rudder, rbox(0.1, 1.25, 0.32, 0.02), P2, 0, 0, -0.16);
  for (const sx of [-1, 1]) part(body, rbox(1.5, 0.08, 0.6, 0.03), W, sx * 0.85, 1.5, -4.55, 0, sx * 0.3, 0);
  const elevator = group(body, 0, 1.5, -4.95);
  for (const sx of [-1, 1]) part(elevator, rbox(1.4, 0.06, 0.26, 0.02), P, sx * 0.85, 0, -0.1, 0, sx * 0.3, 0);
  // 바퀴: 앞바퀴 + 주바퀴 두 쌍
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) {
    part(body, box(0.08, 0.5, 0.08), M, sx * 1.0, 0.5, -0.15);
    wheels.push(wheel(body, sx * 1.0, 0.24, -0.15, 0.24, 0.16, 0xfffaf0));
  }
  part(body, cyl(0.04, 0.04, 0.6, 6), M, 0, 0.5, 3.2);
  const nw = wheel(body, 0, 0.2, 3.2, 0.2, 0.12, 0xfffaf0);
  wheels.push(nw); steer.push(nw.steer);
  const beacon = part(body, sphere(0.08, 8, 6), mat(0xff6b6b), 0, 1.92, 0.4);
  const seat = group(body, 0, 0.98, 3.25);
  const seat2 = group(body, 0, 0.98, 2.5);
  return { group: g, body, wheels, steer, prop: null, fans, beacon, seat, seat2, flaps, ailerons, elevator, rudder, exhaust: group(body, 1.95, 0.6, -0.4), plane: true };
}

/** 🛩️ 미니 제트 전투기: 뾰족한 코 · 물방울 캐노피 · 쌍둥이 꼬리날개 · 애프터버너 (작고 귀엽게) */
export function makeJet() {
  const g = new THREE.Group(), body = group(g);
  const P = mat(0x5f8fd8), P2 = mat(0x4a74b8), W = mat(0xfffaf0), D = mat(COL.dark), M = mat(COL.metal);
  const fus = group(body, 0, 1.05, 0);
  part(fus, capsule(0.46, 3.6, 8, 16), P, 0, 0, -0.2, Math.PI / 2, 0, 0, 1.15, 1, 0.85);
  part(fus, cone(0.4, 1.7, 16), P, 0, -0.04, 2.95, Math.PI / 2, 0, 0, 1, 1, 0.8);
  part(fus, cone(0.12, 0.35, 10), D, 0, -0.04, 3.85, Math.PI / 2, 0, 0);   // 코끝
  part(fus, rbox(1.1, 0.22, 3.4, 0.1), P2, 0, -0.2, -0.6);                 // 납작한 배
  // 공기흡입구
  for (const sx of [-1, 1]) {
    part(fus, rbox(0.34, 0.42, 1.2, 0.08), P2, sx * 0.62, -0.12, 0.6);
    part(fus, rbox(0.26, 0.32, 0.05, 0.04), D, sx * 0.62, -0.12, 1.21);
    part(fus, sphere(0.09, 8, 6), mat(COL.blush), sx * 0.35, 0.05, 2.35, 0, 0, 0, 1, 0.6, 1);
  }
  // 물방울 캐노피 (앞뒤 두 자리)
  part(fus, sphere(0.42, 18, 12), glassMat(), 0, 0.38, 1.2, 0, 0, 0, 0.8, 0.7, 1.9);
  part(fus, torus(0.33, 0.03, 6, 14, Math.PI), W, 0, 0.38, 0.6, 0, Math.PI / 2, 0, 1, 0.9, 1);
  // 삼각(후퇴) 날개
  const flaps = [], ailerons = [];
  for (const sx of [-1, 1]) {
    part(body, rbox(2.3, 0.1, 1.9, 0.04), P, sx * 1.45, 0.98, -0.55, 0, sx * 0.42, 0);
    part(body, rbox(1.0, 0.09, 1.0, 0.04), P, sx * 0.85, 0.98, 0.7, 0, sx * 0.75, 0);   // 날개 앞 연장
    part(body, rbox(0.5, 0.11, 0.6, 0.04), W, sx * 2.45, 0.98, -1.35, 0, sx * 0.42, 0);
    part(body, sphere(0.07, 8, 6), glow(sx > 0 ? 0x8fff8a : 0xff6b6b, 0.6), sx * 2.68, 1.0, -1.5);
    const f = surface(body, sx * 1.0, 0.96, -1.45, 0.9, 0.3, P2);
    flaps.push(f.inner);
    const a = surface(body, sx * 1.95, 0.96, -1.75, 0.8, 0.28, W);
    a.inner.userData.side = sx;
    ailerons.push(a.inner);
  }
  // 쌍둥이 꼬리날개 (밖으로 살짝 기울어짐) — 왼쪽 날개에 방향타
  let rudder = null;
  for (const sx of [-1, 1]) {
    const fin = group(body, sx * 0.5, 1.35, -2.35);
    fin.rotation.z = sx * -0.38;
    part(fin, rbox(0.08, 1.1, 0.95, 0.03), P2, 0, 0.5, 0, -0.45, 0, 0);
    part(fin, rbox(0.09, 0.25, 0.5, 0.03), W, 0, 0.95, -0.25, -0.45, 0, 0);
    if (sx < 0) {
      const rp = group(fin, 0, 0.45, -0.5);
      rp.rotation.x = -0.45;
      rudder = group(rp);
      part(rudder, rbox(0.07, 0.75, 0.26, 0.02), P, 0, 0, -0.13);
    }
  }
  // 수평 꼬리날개 (통째로 움직이는 승강타)
  const elevator = group(body, 0, 0.98, -2.75);
  for (const sx of [-1, 1]) part(elevator, rbox(1.1, 0.07, 0.75, 0.03), P, sx * 1.0, 0, -0.1, 0, sx * 0.35, 0);
  // 쌍발 노즐 + 애프터버너 불꽃
  const burner = [];
  for (const sx of [-1, 1]) {
    part(body, cyl(0.24, 0.27, 0.6, 14), M, sx * 0.3, 1.0, -3.05, Math.PI / 2, 0, 0);
    part(body, cyl(0.2, 0.2, 0.05, 14), D, sx * 0.3, 1.0, -3.36, Math.PI / 2, 0, 0);
    const fl = group(body, sx * 0.3, 1.0, -3.4);
    part(fl, cone(0.18, 1.0, 12), glow(0xffa94d, 1.4), 0, 0, -0.5, -Math.PI / 2, 0, 0);
    part(fl, cone(0.1, 0.6, 10), glow(0xfff3b0, 1.8), 0, 0, -0.3, -Math.PI / 2, 0, 0);
    fl.visible = false;
    burner.push(fl);
  }
  // 세발 바퀴
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) {
    part(body, box(0.07, 0.45, 0.07), M, sx * 0.85, 0.45, -0.7, 0, 0, sx * 0.25);
    wheels.push(wheel(body, sx * 0.95, 0.22, -0.7, 0.22, 0.14, 0xfffaf0));
  }
  part(body, cyl(0.035, 0.035, 0.55, 6), M, 0, 0.46, 2.1);
  const nw = wheel(body, 0, 0.18, 2.1, 0.18, 0.1, 0xfffaf0);
  wheels.push(nw); steer.push(nw.steer);
  const beacon = part(body, sphere(0.07, 8, 6), mat(0xff6b6b), 0, 1.62, -0.9);
  const seat = group(body, 0, 0.92, 1.45);
  const seat2 = group(body, 0, 0.92, 0.85);
  return { group: g, body, wheels, steer, prop: null, burner, beacon, seat, seat2, flaps, ailerons, elevator, rudder, exhaust: group(body, 0, 1.0, -3.4), plane: true };
}

export function makePlane() {
  const g = new THREE.Group(), body = group(g);
  const W = mat(0xfffaf0), P = mat(0xff9eb5), B = mat(0x7cb7f0), D = mat(COL.dark), M = mat(COL.metal);
  const fus = group(body, 0, 0.95, 0);
  // 통통한 동체 → 가늘어지는 꼬리
  part(fus, capsule(0.48, 1.6, 6, 16), W, 0, 0, 0.35, Math.PI / 2, 0, 0);
  part(fus, cyl(0.44, 0.12, 2.4, 16), W, 0, 0.06, -1.9, Math.PI / 2 + 0.05, 0, 0);
  for (const sx of [-1, 1]) {
    part(fus, box(0.04, 0.12, 2.9), P, sx * 0.46, -0.14, 0.15);
    part(fus, box(0.04, 0.06, 2.7), B, sx * 0.45, -0.3, 0.1);
    part(fus, sphere(0.1, 10, 8), mat(COL.blush), sx * 0.4, -0.05, 1.45, 0, sx * 0.6, 0, 0.35, 0.7, 1);
  }
  // 반짝 눈 (엔진 덮개 위)
  for (const sx of [-1, 1]) part(fus, sphere(0.09, 10, 8), mat(0xffffff), sx * 0.2, 0.22, 1.75, 0, 0, 0, 1, 1.15, 0.45);
  // 엔진 덮개 + 스피너 + 2날 프로펠러
  part(fus, sphere(0.42, 16, 12), B, 0, -0.04, 1.85, 0, 0, 0, 1, 0.95, 0.55);
  const prop = group(fus, 0, -0.04, 2.08);
  part(prop, cone(0.15, 0.32, 12), mat(0xffd34d), 0, 0, 0.1, Math.PI / 2, 0, 0);
  for (let i = 0; i < 2; i++) part(prop, rbox(0.13, 1.6, 0.04, 0.02), D, 0, 0, 0, 0, 0, i * Math.PI);
  for (let i = 0; i < 2; i++) part(prop, box(0.14, 0.14, 0.05), mat(0xffd34d), 0, (i ? 1 : -1) * 0.72, 0.01);
  // 물방울 캐노피 (두 자리를 덮는다)
  part(fus, sphere(0.5, 20, 14), glassMat(), 0, 0.44, 0.05, 0, 0, 0, 0.75, 0.62, 1.7);
  part(fus, torus(0.36, 0.035, 6, 16, Math.PI), P, 0, 0.44, 0.05, 0, Math.PI / 2, 0, 1, 0.85, 1);
  // 낮은 날개 + 끝 등불 + 뒷전의 플랩 · 보조익
  part(body, rbox(6.4, 0.12, 0.95, 0.05), W, 0, 0.62, 0.45);
  const flaps = [], ailerons = [];
  for (const sx of [-1, 1]) {
    part(body, rbox(0.8, 0.13, 0.97, 0.05), P, sx * 2.85, 0.62, 0.45);
    part(body, sphere(0.08, 8, 6), glow(sx > 0 ? 0x8fff8a : 0xff6b6b, 0.6), sx * 3.22, 0.62, 0.45);
    const f = group(body, sx * 1.15, 0.6, 0.0);
    part(f, rbox(1.4, 0.06, 0.32, 0.02), W, 0, 0, -0.16);
    flaps.push(f);
    const a = group(body, sx * 2.5, 0.6, 0.0);
    part(a, rbox(1.2, 0.06, 0.32, 0.02), P, 0, 0, -0.16);
    a.userData.side = sx;
    ailerons.push(a);
  }
  // 꼬리: 수평날개 + 승강타 · 수직날개 + 방향타
  part(body, rbox(2.0, 0.07, 0.42, 0.03), W, 0, 1.05, -2.85);
  const elevator = group(body, 0, 1.05, -3.06);
  part(elevator, rbox(2.0, 0.06, 0.3, 0.02), P, 0, 0, -0.15);
  part(body, rbox(0.08, 0.9, 0.5, 0.03), P, 0, 1.45, -2.85, -0.35, 0, 0);
  const rp = group(body, 0, 1.45, -3.13);
  rp.rotation.x = -0.35;
  const rudder = group(rp);
  part(rudder, rbox(0.07, 0.85, 0.28, 0.02), W, 0, 0, -0.14);
  // 짧은 세발바퀴
  const wheels = [], steer = [];
  for (const sx of [-1, 1]) {
    part(body, box(0.06, 0.45, 0.08), M, sx * 0.75, 0.42, 0.25, 0, 0, sx * 0.5);
    wheels.push(wheel(body, sx * 0.9, 0.22, 0.25, 0.22, 0.14, 0xfffaf0));
    part(body, sphere(0.26, 12, 8), P, sx * 0.9, 0.28, 0.25, 0, 0, 0, 0.4, 0.6, 1.1);
  }
  part(body, cyl(0.04, 0.04, 0.5, 6), M, 0, 0.42, 1.55);
  const nw = wheel(body, 0, 0.18, 1.55, 0.18, 0.12, 0xfffaf0);
  wheels.push(nw); steer.push(nw.steer);
  const beacon = part(body, sphere(0.08, 8, 6), mat(0xff6b6b), 0, 1.92, -3.05);
  // 앞뒤 좌석 (탠덤)
  for (const z of [0.45, -0.35]) part(body, rbox(0.42, 0.45, 0.1, 0.05), mat(0x8b5a3c), 0, 0.92, z - 0.22);
  const seat = group(body, 0, 0.7, 0.45);
  const seat2 = group(body, 0, 0.7, -0.35);
  return { group: g, body, wheels, steer, prop, beacon, seat, seat2, flaps, ailerons, elevator, rudder, exhaust: group(body, 0.3, 0.8, 1.7), plane: true };
}

// ---------------- 아이템 ----------------

/** 베일: 목초 건초(노랑) · 라이그라스(연두) · 옥수수 사일리지(비닐로 감싼 초록 베일 + 노란 띠) */
const BALE_COLORS = {
  grass: [0xf4d36b, 0xe8c158, 0xfae39a, 0xd9b24e],
  rye: [0xc9d873, 0xb5c862, 0xe2eca2, 0x9fb455],
  corn: [0x7fbf6a, 0x6aa95a, 0xf2e6a0, 0xffd04d],
};
export function makeBale(product = null) {
  const g = new THREE.Group();
  const b = group(g, 0, 0.6, 0);
  const [c0, c1, c2, c3] = BALE_COLORS[product === 'rye' ? 'rye' : product === 'corn' ? 'corn' : 'grass'];
  part(b, cyl(0.6, 0.6, 1.1, 22), mat(c0), 0, 0, 0, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    part(b, cyl(0.45, 0.45, 0.02, 20), mat(c1), sx * 0.555, 0, 0, 0, 0, Math.PI / 2);
    part(b, cyl(0.22, 0.22, 0.02, 16), mat(c2), sx * 0.565, 0, 0, 0, 0, Math.PI / 2);
  }
  for (const x of product === 'corn' ? [0] : [-0.3, 0.3]) part(b, cyl(0.615, 0.615, product === 'corn' ? 0.22 : 0.06, 22), mat(c3), x, 0, 0, 0, 0, Math.PI / 2);
  return g;
}

export function makePallet(product) {
  const g = new THREE.Group();
  const wood = mat(0xe0b077), woodD = mat(0xb9874f);
  for (const x of [-0.5, 0, 0.5]) part(g, box(0.16, 0.12, 1.0), woodD, x, 0.06, 0);
  for (const z of [-0.4, -0.13, 0.13, 0.4]) part(g, box(1.2, 0.05, 0.2), wood, 0, 0.145, z);
  const top = group(g, 0, 0.17, 0);
  if (product === 'milk') {
    for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
      part(top, cyl(0.2, 0.22, 0.55, 14), mat(0xe6edf5), x, 0.28, z);
      part(top, cyl(0.12, 0.17, 0.12, 12), mat(0xe6edf5), x, 0.61, z);
      part(top, cyl(0.13, 0.13, 0.06, 12), mat(0x6fa8dc), x, 0.69, z);
      part(top, cyl(0.205, 0.205, 0.08, 14), mat(0x6fa8dc), x, 0.3, z);
    }
  } else if (product === 'egg') {
    for (const [x, z] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]]) {
      part(top, rbox(0.52, 0.28, 0.42, 0.05), mat(0xf3d9a4), x, 0.14, z);
      for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
        part(top, sphere(0.07, 8, 6), mat(Math.random() < 0.5 ? 0xfff4e0 : 0xf2d2a9), x - 0.15 + i * 0.15, 0.3, z - 0.08 + k * 0.16, 0, 0, 0, 1, 1.25, 1);
      }
    }
  } else if (product === 'corn' || product === 'soy') {
    const sackC = product === 'corn' ? 0xf6d58a : 0xece0c4;
    const band = product === 'corn' ? 0x7fcf6a : 0xc98a5a;
    for (let layer = 0; layer < 2; layer++) {
      for (const [x, z] of layer === 0 ? [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]] : [[0, -0.25], [0, 0.25]]) {
        part(top, rbox(0.55, 0.26, 0.42, 0.11), mat(sackC), x, 0.13 + layer * 0.26, z, 0, (layer ? 0.1 : 0), 0);
        part(top, box(0.56, 0.05, 0.43), mat(band), x, 0.13 + layer * 0.26, z);
      }
    }
    if (product === 'corn') {
      for (const [x, z, r] of [[-0.15, 0, 0.4], [0.15, 0.05, -0.3]]) {
        part(top, capsule(0.07, 0.22, 3, 8), mat(0xffc83d), x, 0.72, z, Math.PI / 2, r, 0);
        part(top, cone(0.07, 0.2, 6), mat(0x7fcf6a), x + Math.sin(r) * 0.18, 0.72, z + Math.cos(r) * 0.18, Math.PI / 2, r, 0);
      }
    } else {
      for (let i = 0; i < 7; i++) part(top, sphere(0.05, 6, 4), mat(i % 2 ? 0xd9b07a : 0x9ccf6a), rand(-0.2, 0.2), 0.68, rand(-0.25, 0.25), 0, 0, 0, 1.2, 0.8, 1);
    }
  } else {
    part(top, cyl(0.5, 0.4, 0.42, 16), mat(0xc08a52), 0, 0.21, 0);
    part(top, torus(0.5, 0.045, 6, 20), mat(0xa8743f), 0, 0.42, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8, r = i === 0 ? 0 : 0.25;
      part(top, sphere(rand(0.1, 0.14), 8, 6), mat(0x5a4636), Math.cos(a) * r, 0.45 + (i === 0 ? 0.08 : 0), Math.sin(a) * r);
    }
    part(top, sphere(0.1, 8, 6), mat(0x7fcf6a), 0.25, 0.5, -0.2, 0, 0, 0, 1.4, 0.4, 0.8);
  }
  return g;
}

export function makeHeartGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(-0.05, -0.25, -0.35, -0.05, -0.35, 0.12);
  s.bezierCurveTo(-0.35, 0.32, -0.12, 0.38, 0, 0.22);
  s.bezierCurveTo(0.12, 0.38, 0.35, 0.32, 0.35, 0.12);
  s.bezierCurveTo(0.35, -0.05, 0.05, -0.25, 0, -0.3);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  geo.center();
  return geo;
}
