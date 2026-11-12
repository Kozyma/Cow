// 🎨 차고: 차량 모델(등급)과 페인트(스킨)
// - 등급: 같은 차종이라도 성능이 다른 모델 (최고 속도 · 가속 · 회전). 항공기는 페인트만 바꿀 수 있다
// - 스킨: 차체 '페인트 색 계열'만 골라 다른 색으로 바꾼다 (타이어·유리·램프·사람은 그대로)
//   모델은 최적화로 부품을 합쳐 정점 색으로 구워 두므로, 그 정점 색을 다시 칠한다 → 모델을 새로 만들 필요 없음
import * as THREE from 'three';
import { G } from './state.js';
import { mat } from './materials.js';
import { part, group, cyl, sphere, cone, rbox } from './util.js';

/** 희귀도: 모델·페인트 모두 등급별로 나뉘고, 등급이 높을수록 능력치가 좋다 */
export const TIERS = {
  common: { name: '일반', color: '#9a8f84' },
  rare: { name: '희귀', color: '#4f9be0' },
  epic: { name: '영웅', color: '#a066e0' },
  legend: { name: '전설', color: '#e8a21c' },
};

/** 모델(성능). cost = 차 가격 대비 비율 */
export const GRADES = {
  std: { name: '기본형', icon: '', tier: 'common', speed: 1, accel: 1, turn: 1, cost: 0, desc: '균형 잡힌 기본 모델' },
  compact: { name: '컴팩트', icon: '🌀', tier: 'rare', speed: 0.92, accel: 1.2, turn: 1.35, cost: 0.4, flag: 0x5fd4b4, desc: '좁은 축사·통로에서 잘 도는 날렵한 모델' },
  turbo: { name: '터보', icon: '⚡', tier: 'rare', speed: 1.3, accel: 1.3, turn: 0.92, cost: 0.6, flag: 0xffd34d, desc: '최고 속도·가속 ↑ · 회전은 살짝 둔해요' },
  pro: { name: '프로', icon: '👑', tier: 'legend', speed: 1.18, accel: 1.22, turn: 1.15, cost: 1.0, flag: 0xff8fab, desc: '속도·가속·회전 모두 ↑ 최고급 모델' },
};

/** 페인트. 희귀 이상은 작은 능력치 보너스 (지상 차량) */
export const SKINS = {
  base: { name: '기본색', tier: 'common', price: 0 },
  cherry: { name: '체리', tier: 'common', color: '#ff6b7a', price: 600 },
  sky: { name: '하늘', tier: 'common', color: '#6fb8f0', price: 600 },
  lavender: { name: '라벤더', tier: 'common', color: '#b49cf0', price: 600 },
  mint: { name: '민트', tier: 'common', color: '#5fd4b4', price: 600 },
  lemon: { name: '레몬', tier: 'common', color: '#ffd84d', price: 600 },
  strawberry: { name: '딸기우유', tier: 'common', color: '#ffb3c8', price: 600 },
  choco: { name: '초코', tier: 'rare', color: '#9a6b4f', price: 1200, speed: 1.03 },
  navy: { name: '밤하늘', tier: 'rare', color: '#3d4f8a', price: 1200, speed: 1.03 },
  snow: { name: '눈꽃', tier: 'rare', color: '#f2efe8', price: 1200, speed: 1.03 },
  black: { name: '블랙', tier: 'epic', color: '#33333d', price: 2200, speed: 1.05, accel: 1.05 },
  ruby: { name: '루비', tier: 'epic', color: '#c8204f', price: 2200, speed: 1.05, accel: 1.05 },
  chrome: { name: '크롬', tier: 'epic', color: '#c9ced8', price: 2200, speed: 1.05, accel: 1.05 },
  gold: { name: '황금', tier: 'legend', color: '#f0b62a', price: 4500, speed: 1.08, accel: 1.08, turn: 1.05 },
  rainbow: { name: '무지개', tier: 'legend', color: '#ff7b9c', rainbow: true, price: 4500, speed: 1.08, accel: 1.08, turn: 1.05 },
};
/** 페인트 보너스 설명 */
export const skinBonus = (s) => {
  const b = [];
  if (s.speed > 1) b.push(`속도 +${Math.round((s.speed - 1) * 100)}%`);
  if (s.accel > 1) b.push(`가속 +${Math.round((s.accel - 1) * 100)}%`);
  if (s.turn > 1) b.push(`회전 +${Math.round((s.turn - 1) * 100)}%`);
  return b.join(' · ');
};

/** 차종 기본 가격 (자가용은 상점에 없어서 따로) */
export const basePrice = (type, shop) => shop[type] || 3000;
/** 등급으로 바꾸는 값: 차 가격 × 비율 (100단위) */
export const gradeCost = (type, grade, shop) => Math.round(basePrice(type, shop) * GRADES[grade].cost / 100) * 100;

// ---------------- 등급 (성능) ----------------
/** 차량 성능을 등급에 맞추기. v.def는 차종 정의(baseDef)를 물려받은 차량 전용 객체 */
export function applyGrade(v, grade) {
  if (!GRADES[grade] || (v.def.air && grade !== 'std')) grade = 'std';
  v.grade = grade;
  recalc(v);
  setFlag(v, GRADES[grade].flag);
}

/** 능력치 = 차종 기본값 × 모델 × 페인트 보너스 (항공기는 비행 역학이 따로라 페인트 보너스 없음) */
function recalc(v) {
  const g = GRADES[v.grade || 'std'], s = v.def.air ? {} : SKINS[v.skin || 'base'], b = v.baseDef;
  v.def.maxSpeed = b.maxSpeed * g.speed * (s.speed || 1);
  v.def.accel = b.accel * g.accel * (s.accel || 1);
  v.def.turn = b.turn * g.turn * (s.turn || 1);
}

/** 등급 깃발: 차체 맨 윗면(지붕·캐노피)에 작은 안테나 깃발. 그 부품에 붙여서 같이 흔들린다 */
function setFlag(v, color) {
  if (v.gradeFlag) { v.gradeFlag.parent?.remove(v.gradeFlag); v.gradeFlag = null; }
  if (color == null) return;
  const spot = v.flagSpot || (v.flagSpot = findTop(v));
  const f = group(spot.parent, spot.x, spot.y, spot.z);
  part(f, cyl(0.03, 0.03, 1.1, 6), mat(0xd9d4ca), 0, 0.55, 0);
  part(f, sphere(0.07, 8, 6), mat(0xfffaf0), 0, 1.13, 0);
  // 삼각 깃발 (뒤쪽으로 펄럭)
  const flag = part(f, cone(0.22, 0.56, 3), mat(color), 0, 0.92, -0.3, Math.PI / 2, 0, 0, 1, 1, 0.45);
  flag.rotation.z = Math.PI / 2;
  f.userData.flag = flag;
  v.gradeFlag = f;
}

const _ray = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(0, -1, 0);
/**
 * 모델 윗면의 안테나 자리: 위에서 아래로 광선을 여러 곳에 쏘아, 차체(합쳐진 정적 부품)의
 * 위를 향한 평평한 면 중 가장 높은 곳 (화물칸 바닥·통 안쪽처럼 낮은 곳은 고르지 않게)
 */
function findTop(v) {
  const g = v.group;
  const saved = { p: g.position.clone(), r: g.rotation.clone(), s: g.scale.clone() };
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
  g.updateMatrixWorld(true);
  const all = (v.paintMeshes || []).filter((m) => m.visible);
  const body = all.filter((m) => m.material.vertexColors);   // 움직이지 않는 차체
  const meshes = body.length ? body : all;
  const box = new THREE.Box3();
  for (const m of meshes) box.expandByObject(m);
  let best = null;
  if (!box.isEmpty()) {
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z;
    for (const fx of [0.2, 0, 0.35]) {
      for (const fz of [0.25, 0.4, 0.55, 0.7, 0.15, 0.85]) {
        _o.set(box.min.x + w * (0.5 + fx * 0.5), box.max.y + 2, box.min.z + d * fz);   // fx: 가운데→오른쪽, fz: 뒤→앞
        _ray.set(_o, _d);
        const hit = _ray.intersectObjects(meshes, false)[0];
        if (!hit || !hit.face) continue;
        const ny = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y;
        if (ny < 0.7) continue;
        if (!best || hit.point.y > best.point.y + 0.05) best = hit;
      }
    }
  }
  let out;
  if (best) {
    const parent = best.object.parent || g;
    const p = parent.worldToLocal(best.point.clone());
    out = { parent, x: p.x, y: p.y - 0.02, z: p.z };
  } else out = { parent: g, x: 0, y: box.isEmpty() ? 2 : box.max.y, z: 0 };
  g.position.copy(saved.p); g.rotation.copy(saved.r); g.scale.copy(saved.s);
  g.updateMatrixWorld(true);
  return out;
}

/** 깃발 펄럭임 (매 프레임) */
export function animateFlag(v, t) {
  const f = v.gradeFlag?.userData.flag;
  if (f) f.rotation.y = Math.sin(t * 6 + v.id) * 0.25 * (0.4 + Math.min(1, Math.abs(v.speed) / 6));
}

// ---------------- 스킨 (페인트) ----------------
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 }, _base = { h: 0, s: 0, l: 0 }, _skin = { h: 0, s: 0, l: 0 };
const SRGB = THREE.SRGBColorSpace;
const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

/**
 * 원래 색(선형 r,g,b) → 스킨 색. 차체 기본색과 같은 계열(색상 ±30°, 채도 있음)만 바꾸고 나머지는 그대로.
 * 밝기·채도는 기본색과의 차이를 유지해서 명암(진한 칸·연한 칸)이 살아 있게
 */
function remap(r, g, b, out) {
  _c.setRGB(r, g, b);
  _c.getHSL(_hsl, SRGB);
  if (_hsl.s < 0.22 || hueDist(_hsl.h, _base.h) > 0.085) { out.setRGB(r, g, b); return false; }
  const h = (_skin.h + (_hsl.h - _base.h) + 1) % 1;
  const s = Math.min(1, _skin.s * (_base.s > 0.01 ? _hsl.s / _base.s : 1));
  const l = Math.min(0.95, Math.max(0.08, _skin.l + (_hsl.l - _base.l) * (_skin.s < 0.15 ? 0.6 : 1)));
  out.setHSL(h, s, l, SRGB);
  return true;
}

/** 차량 v에 스킨 입히기. paintMeshes는 차량을 만들 때(사람·짐이 붙기 전) 모아 둔 차체 메시들 */
export function applySkin(v, skin) {
  if (!SKINS[skin]) skin = 'base';
  v.skin = skin;
  const sk = SKINS[skin];
  v.def.color = sk.color || v.baseDef.color;
  new THREE.Color(v.baseDef.color).getHSL(_base, SRGB);
  if (sk.color) new THREE.Color(sk.color).getHSL(_skin, SRGB);
  if (sk.rainbow) { _skin.s = 0.8; _skin.l = Math.max(0.45, Math.min(0.62, _base.l)); }
  const out = new THREE.Color();
  const rb = sk.rainbow ? rainbowRange(v) : null;
  for (const m of v.paintMeshes || []) {
    const ca = m.geometry.attributes.color;
    if (ca && m.material.vertexColors) {
      // 합쳐진 메시: 원래 정점 색을 보관해 두고 거기서 다시 칠한다
      const orig = m.userData.origColors || (m.userData.origColors = Float32Array.from(ca.array));
      const a = ca.array, pos = m.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        if (rb) {   // 무지개: 차 앞뒤 위치에 따라 색상이 돈다
          const t = (pos[i + 2] + m.position.z - rb.min) / rb.len;
          _skin.h = ((t * 0.85) % 1 + 1) % 1;
        }
        if (sk.color) { remap(orig[i], orig[i + 1], orig[i + 2], out); a[i] = out.r; a[i + 1] = out.g; a[i + 2] = out.b; }
        else { a[i] = orig[i]; a[i + 1] = orig[i + 1]; a[i + 2] = orig[i + 2]; }
      }
      ca.needsUpdate = true;
    } else if (m.material.userData?.plain || m.userData.origMat) {
      // 따로 움직이는 부품(포크·버킷 등): 같은 색 계열이면 재질을 바꿔 끼운다
      const orig = m.userData.origMat || (m.userData.origMat = m.material);
      if (!sk.color) { m.material = orig; continue; }
      const c = orig.color;
      if (rb) _skin.h = 0.55;
      m.material = remap(c.r, c.g, c.b, out) ? mat(out.getHex()) : orig;
    }
  }
  recalc(v);
  if (v.ui) v.ui.card.style.setProperty('--vc', v.def.color);
}

/** 무지개 칠하기용: 차체 앞뒤 길이 (모델 좌표 z) */
function rainbowRange(v) {
  let min = Infinity, max = -Infinity;
  for (const m of v.paintMeshes || []) {
    const p = m.geometry.attributes.position?.array;
    if (!p || !m.material.vertexColors) continue;
    for (let i = 2; i < p.length; i += 3) { const z = p[i] + m.position.z; if (z < min) min = z; if (z > max) max = z; }
  }
  return min < max ? { min, len: max - min } : { min: -2, len: 4 };
}

/** 차량을 만들 때 한 번: 칠할 수 있는 차체 메시 목록 */
export function collectPaint(v) {
  const list = [];
  v.group.traverse((o) => { if (o.isMesh) list.push(o); });
  v.paintMeshes = list;
}

/** 저장본 → 차량 등급·스킨 */
export function applyLook(v, grade, skin) {
  applyGrade(v, grade || 'std');
  if ((skin || 'base') !== 'base' || v.skin !== 'base') applySkin(v, skin || 'base');
}

/** 등급·스킨 표시 이름 */
export const gradeLabel = (v) => (v.grade && v.grade !== 'std' ? `${GRADES[v.grade].icon} ` : '');
