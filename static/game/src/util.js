import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}
export function approach(v, t, d) {
  return v < t ? Math.min(v + d, t) : Math.max(v - d, t);
}
export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ---------- 지오메트리 캐시 ----------
const gc = new Map();
function cached(key, fn) {
  let g = gc.get(key);
  if (!g) {
    g = fn();
    g.computeBoundingSphere();
    gc.set(key, g);
  }
  return g;
}
export const rbox = (w, h, d, r = 0.12, s = 3) =>
  cached(`rb${w},${h},${d},${r},${s}`, () => new RoundedBoxGeometry(w, h, d, s, Math.max(0.001, Math.min(r, Math.min(w, h, d) / 2 - 0.005))));
export const box = (w, h, d, sx = 1, sy = 1, sz = 1) => cached(`b${w},${h},${d},${sx},${sy},${sz}`, () => new THREE.BoxGeometry(w, h, d, sx, sy, sz));
/** 곡면 월드에서 휘어지도록 큰 면을 잘게 나눈 박스 */
export const sbox = (w, h, d, step = 2.5) => box(w, h, d, Math.max(1, Math.ceil(w / step)), Math.max(1, Math.ceil(h / step)), Math.max(1, Math.ceil(d / step)));
export const sphere = (r, ws = 16, hs = 12) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const cyl = (rt, rb, h, s = 16) => cached(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const cone = (r, h, s = 12) => cached(`co${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
export const torus = (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => cached(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
export const capsule = (r, l, cs = 4, rs = 10) => cached(`ca${r},${l},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, l, cs, rs));
export const ico = (r, d = 0) => cached(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
export const dodeca = (r) => cached(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));
export const octa = (r) => cached(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));

/** 메쉬를 만들어 부모에 붙이는 헬퍼 */
export function part(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  m.castShadow = geo.boundingSphere.radius * Math.max(sx, sy, sz) > 0.14;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
