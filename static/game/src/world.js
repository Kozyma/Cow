// 지형, 장식, 하늘, 낮/밤
import * as THREE from 'three';
import { G, LAYOUT, BARN_DEFS } from './state.js';
import { mat, glow, glowMats, basic } from './materials.js';
import { part, group, rbox, box, sphere, cyl, cone, dodeca, rand, pick, clamp, lerp } from './util.js';
import { INST } from './instancer.js';
import { addCircle, addBoxC, setOwner } from './physics.js';

/** 나무·덤불 충돌체 소유자 (건물 지을 때 치울 수 있음) */
export const NATURE = { nature: true };
import {
  buildFarmhouse, buildAirfield, buildLamp, buildSign, buildScarecrow, zoneRing, buildDock, buildMarket,
} from './buildings.js';
import { dockSlots, setOnDock } from './items.js';
import { removeColliders } from './physics.js';
import { spawn } from './particles.js';

const W = {}; // 월드 내부 참조

// ---------------- 지면 ----------------
function noise2(x, z) {
  return Math.sin(x * 0.09 + Math.sin(z * 0.05) * 2) * 0.5 + Math.sin(z * 0.11 + x * 0.03) * 0.35 + Math.sin((x + z) * 0.21) * 0.15;
}

function buildGround(scene) {
  const size = 720, seg = 300;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const c1 = new THREE.Color(0xa6dc7e), c2 = new THREE.Color(0x8ccf6c), c3 = new THREE.Color(0xb9e48c);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = noise2(x, z);
    if (n > 0.35) c.copy(c3); else if (n < -0.3) c.copy(c2); else c.copy(c1).lerp(c2, 0.25 - n * 0.3);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);
}

export function strip(scene, cx, cz, w, d, color, y = 0.02, borderColor = 0xe2c48e) {
  const segX = Math.max(1, Math.round(w / 2)), segZ = Math.max(1, Math.round(d / 2));
  const b = new THREE.PlaneGeometry(w + 0.6, d + 0.6, segX, segZ);
  b.rotateX(-Math.PI / 2);
  const bm = new THREE.Mesh(b, mat(borderColor));
  bm.position.set(cx, y, cz); bm.receiveShadow = true; scene.add(bm);
  const p = new THREE.PlaneGeometry(w, d, segX, segZ);
  p.rotateX(-Math.PI / 2);
  const pm = new THREE.Mesh(p, mat(color));
  pm.position.set(cx, y + 0.012, cz); pm.receiveShadow = true; scene.add(pm);
}

function buildRoads(scene) {
  const sand = 0xf3e2b3, pave = 0xe6e1d6;
  strip(scene, 0, LAYOUT.roadZ, LAYOUT.bound * 2 - 4, 4, sand);
  // 비행장 가는 길 (주차장 → 남쪽 비행장)
  strip(scene, -20, 62.5, 4, 50, sand, 0.022);
  strip(scene, -46, 88, 52, 4, sand, 0.022);
  strip(scene, -3, 7.5, 3.6, 23, sand, 0.025);
  strip(scene, -9, 28.5, 44, 18, 0xeadbb8, 0.03, 0xd8c79c); // 주차장 (2줄)
  strip(scene, LAYOUT.station.x, LAYOUT.station.z + 3, 14, 13, 0xeadbb8, 0.026, 0xd8c79c); // 배합장
  strip(scene, -56, 2, 16, 9, 0xeadbb8, 0.026, 0xd8c79c); // 사료 가게
  strip(scene, LAYOUT.yard.x, LAYOUT.yard.z, 8.6, 6.6, 0xe6d3a3, 0.03, 0xcdb88a); // 건초 보관소
  strip(scene, 54, 3, 13, 11, 0xeadbb8, 0.026, 0xd8c79c); // 판매소
  for (let i = 0; i < 6; i++) {
    INST.add('stone', cyl(0.55, 0.6, 0.08, 10), mat(0xffffff), -36 - i * 1.3, 0.05, 23 + i * 0.6, 0, rand(0, 3), 0, 1, 1, 0.8, 0xdcd6c8, false);
  }
}

// ---------------- 연못 ----------------
function buildPond(scene) {
  const { x, z, r } = LAYOUT.pond;
  const g = group(scene, x, 0, z);
  const rim = new THREE.CircleGeometry(r + 0.9, 40); rim.rotateX(-Math.PI / 2);
  part(g, rim, mat(0xf0dfae), 0, 0.03, 0).castShadow = false;
  const water = new THREE.CircleGeometry(r, 40); water.rotateX(-Math.PI / 2);
  W.water = part(g, water, mat(0x7fd0ea), 0, 0.06, 0);
  W.water.castShadow = false;
  const inner = new THREE.CircleGeometry(r * 0.6, 32); inner.rotateX(-Math.PI / 2);
  part(g, inner, mat(0x6ac0e0), 0, 0.07, 0).castShadow = false;
  W.lilies = [];
  for (let i = 0; i < 6; i++) {
    const a = rand(0, Math.PI * 2), rr = rand(1, r - 1);
    const lg = group(g, Math.cos(a) * rr, 0.09, Math.sin(a) * rr);
    const pad = new THREE.CircleGeometry(0.5, 16, 0.3, Math.PI * 2 - 0.6); pad.rotateX(-Math.PI / 2);
    part(lg, pad, mat(0x6cbf5e), 0, 0, 0).castShadow = false;
    if (i % 2 === 0) part(lg, sphere(0.14, 8, 6), mat(0xffb3c7), 0.1, 0.08, 0.05, 0, 0, 0, 1, 0.6, 1);
    lg.userData.ph = rand(0, 6);
    W.lilies.push(lg);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rand(-0.2, 0.2);
    INST.add('rock', dodeca(0.5), mat(0xffffff), x + Math.cos(a) * (r + 0.7), 0.15, z + Math.sin(a) * (r + 0.7), rand(0, 3), rand(0, 3), 0, rand(0.6, 1.1), rand(0.5, 0.8), rand(0.6, 1.1), 0xc7c9cf);
  }
  for (let i = 0; i < 4; i++) {
    const a = 2.2 + i * 0.25;
    const cx = x + Math.cos(a) * (r - 0.4), cz = z + Math.sin(a) * (r - 0.4);
    INST.add('reed', cyl(0.03, 0.03, 1.4, 5), mat(0xffffff), cx, 0.7, cz, 0, 0, rand(-0.1, 0.1), 1, 1, 1, 0x6cbf5e, false);
    INST.add('cattail', capsuleGeo(), mat(0xffffff), cx, 1.35, cz, 0, 0, 0, 1, 1, 1, 0x8a5f3c, false);
  }
  addCircle(x, z, r + 0.2);
}
let _capG = null;
function capsuleGeo() {
  if (!_capG) { _capG = new THREE.CapsuleGeometry(0.07, 0.3, 3, 6); _capG.computeBoundingSphere(); }
  return _capG;
}

// ---------------- 나무/꽃 ----------------
const reserved = [];
function reserve(minX, maxX, minZ, maxZ) { reserved.push({ minX, maxX, minZ, maxZ }); }
function isReserved(x, z, m = 0) {
  for (const r of reserved) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
  return false;
}
function setupReserved() {
  for (const b of BARN_DEFS) if (!b.optional) reserve(b.cx - b.width / 2 - 4, b.cx + b.width / 2 + 7, b.front - b.len - 21, b.front + 3);
  reserve(-70, 70, -9, -3);
  // 축사 앞 작업 마당 · 출하장~판매소 · 배합장~사료 가게 사이 (차들이 자주 지나는 곳)에는 나무를 심지 않는다
  reserve(-70, 66, -3, 17);
  reserve(-6, 0, -9, 21);
  const f = LAYOUT.field;
  reserve(f.x0 - 3, f.x0 + f.cols * f.tile + 3, f.z0 - 3, f.z0 + f.rows * f.tile + 3);
  reserve(-1, 13, -2, 15);
  reserve(45, 66, -3, 13);
  reserve(-21, -11, 2, 10);
  reserve(-33, 16, 18, 39);
  reserve(-50, -38, 22, 34);
  reserve(-41, -21, -1, 16);
  reserve(-66, -47, -2, 12);
  const p = LAYOUT.pond;
  reserve(p.x - p.r - 2, p.x + p.r + 2, p.z - p.r - 2, p.z + p.r + 2);
  const A = LAYOUT.airfield;
  reserve(A.runway.x - A.runway.len / 2 - 25, A.runway.x + A.runway.len / 2 + 25, A.runway.z - 14, A.runway.z + 26);
  reserve(A.heli.x - 9, A.heli.x + 9, A.heli.z - 9, A.heli.z + 9);
  reserve(-24, -16, 36, 92);
  reserve(-74, -18, 84, 92);
}

const GREENS = [0x7fcf6a, 0x6cbf5e, 0x8fdc78, 0x5fb35a, 0x9be07f];
function roundTree(x, z, s = 1, collide = true) {
  const w = mat(0xffffff);
  INST.add('trunk', cyl(0.22, 0.3, 1.6, 8), w, x, 0.8 * s, z, 0, 0, 0, s, s, s, 0x9c6b4a);
  const c = pick(GREENS);
  const shade = new THREE.Color(c).multiplyScalar(0.9).getHex();
  INST.add('crown', sphere(1, 10, 7), w, x, 2.5 * s, z, 0, 0, 0, 1.5 * s, 1.35 * s, 1.5 * s, c);
  INST.add('crown', sphere(1, 10, 7), w, x + 0.75 * s, 2.05 * s, z + 0.3 * s, 0, 0, 0, 1.0 * s, 0.95 * s, 1.0 * s, shade);
  INST.add('crown', sphere(1, 10, 7), w, x - 0.65 * s, 2.15 * s, z - 0.35 * s, 0, 0, 0, 1.05 * s, 1.0 * s, 1.05 * s, shade);
  if (Math.random() < 0.4) {
    const fc = pick([0xff6b6b, 0xffa94d, 0xffd43b]);
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2), e = rand(-0.2, 0.6);
      INST.add('fruit', sphere(0.15, 6, 4), w, x + Math.cos(a) * Math.cos(e) * 1.45 * s, 2.5 * s + Math.sin(e) * 1.3 * s, z + Math.sin(a) * Math.cos(e) * 1.45 * s, 0, 0, 0, 1, 1, 1, fc, false);
    }
  }
  if (collide) addCircle(x, z, 0.45 * s);
}
function pineTree(x, z, s = 1, collide = true) {
  const w = mat(0xffffff);
  INST.add('trunk', cyl(0.22, 0.3, 1.6, 8), w, x, 0.8 * s, z, 0, 0, 0, s, s, s, 0x8a5f3c);
  const c = pick([0x4f9e6a, 0x5aab72, 0x478f61]);
  for (let i = 0; i < 3; i++) {
    INST.add('pine', cone(1, 1.7, 8), w, x, (1.8 + i * 0.85) * s, z, 0, rand(0, 3), 0, (1.6 - i * 0.38) * s, s, (1.6 - i * 0.38) * s, c);
  }
  if (collide) addCircle(x, z, 0.45 * s);
}
function bush(x, z, s = 1) {
  const w = mat(0xffffff);
  const c = pick(GREENS);
  INST.add('bush', sphere(1, 9, 6), w, x, 0.45 * s, z, 0, 0, 0, 0.8 * s, 0.6 * s, 0.8 * s, c);
  INST.add('bush', sphere(1, 9, 6), w, x + 0.55 * s, 0.35 * s, z + 0.2 * s, 0, 0, 0, 0.55 * s, 0.45 * s, 0.55 * s, c);
  if (Math.random() < 0.5) {
    const fc = pick([0xff8fab, 0xffffff, 0xffd34d]);
    for (let i = 0; i < 4; i++) INST.add('bflower', sphere(0.1, 5, 3), w, x + rand(-0.6, 0.6) * s, 0.75 * s, z + rand(-0.5, 0.5) * s, 0, 0, 0, 1, 1, 1, fc, false);
  }
}
function flowerPatch(x, z) {
  const w = mat(0xffffff);
  const fc = pick([0xff8fab, 0xffffff, 0xffd34d, 0xc9a7ff, 0xff7b6b, 0x8ecae6]);
  const n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + rand(-0.8, 0.8), pz = z + rand(-0.8, 0.8);
    INST.add('stem', cyl(0.025, 0.025, 0.3, 4), w, px, 0.15, pz, 0, 0, 0, 1, 1, 1, 0x6cbf5e, false);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      INST.add('petal', sphere(0.08, 4, 3), w, px + Math.cos(a) * 0.08, 0.32, pz + Math.sin(a) * 0.08, 0, 0, 0, 1, 0.5, 1, fc, false);
    }
    INST.add('fcenter', sphere(0.05, 4, 3), w, px, 0.34, pz, 0, 0, 0, 1, 0.7, 1, 0xffd34d, false);
  }
}

function buildNature(scene) {
  setupReserved();
  const B = LAYOUT.bound;
  // 외곽 숲
  for (let ring = 0; ring < 3; ring++) {
    const d = B + 2.5 + ring * 4;
    const step = 4.2;
    for (let t = -d; t <= d; t += step) {
      for (const [x, z] of [[t, -d], [t, d], [-d, t], [d, t]]) {
        const jx = x + rand(-1.2, 1.2), jz = z + rand(-1.2, 1.2);
        const s = rand(0.9, 1.5);
        if (Math.random() < 0.45) pineTree(jx, jz, s, false); else roundTree(jx, jz, s, false);
      }
    }
  }
  // 내부 나무
  setOwner(NATURE);
  const placed = [];
  let tries = 0;
  while (placed.length < 470 && tries++ < 24000) {
    const x = rand(-B + 2, B - 2), z = rand(-B + 2, B - 2);
    if (isReserved(x, z, 2.5)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
    placed.push({ x, z });
    const s = rand(0.85, 1.25);
    if (Math.random() < 0.35) pineTree(x, z, s); else roundTree(x, z, s);
  }
  // 덤불, 꽃, 풀, 바위
  tries = 0; let n = 0;
  while (n < 210 && tries++ < 9000) {
    const x = rand(-B + 1, B - 1), z = rand(-B + 1, B - 1);
    if (isReserved(x, z, 1.2) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
    bush(x, z, rand(0.8, 1.2)); addCircle(x, z, 0.6); n++;
  }
  setOwner(null);
  tries = 0; n = 0;
  // 맵이 넓어진 만큼 장식도 늘리되, 최적화를 위해 모바일은 줄인다
  const FLOWERS = G.isMobile ? 420 : 760, TUFTS = G.isMobile ? 3200 : 6000;
  while (n < FLOWERS && tries++ < 20000) {
    const x = rand(-B - 6, B + 6), z = rand(-B - 6, B + 6);
    if (isReserved(x, z, 0.5)) continue;
    flowerPatch(x, z); n++;
  }
  const w = mat(0xffffff);
  for (let i = 0; i < TUFTS; i++) {
    const x = rand(-B - 8, B + 8), z = rand(-B - 8, B + 8);
    if (isReserved(x, z, 0.2)) continue;
    const c = pick([0x7cc464, 0x6cb85a, 0x8ad272]);
    for (let k = 0; k < 3; k++) INST.add('tuft', cone(0.07, 0.38, 4), w, x + rand(-0.15, 0.15), 0.15, z + rand(-0.15, 0.15), rand(-0.3, 0.3), 0, rand(-0.3, 0.3), 1, rand(0.7, 1.2), 1, c, false);
  }
  for (let i = 0; i < 180; i++) {
    const x = rand(-B, B), z = rand(-B, B);
    if (isReserved(x, z, 1)) continue;
    INST.add('rock', dodeca(0.5), w, x, 0.15, z, rand(0, 3), rand(0, 3), 0, rand(0.5, 1), rand(0.4, 0.7), rand(0.5, 1), 0xc7c9cf);
  }
}

// ---------------- 하늘 ----------------
const SKY_KEYS = [
  { h: 0, top: 0x101c40, hz: 0x2b3f70, sun: 0x8fa8ff, si: 0.6, hemi: 1.05, hs: 0x7a8fce, hg: 0x40604a },
  { h: 4.5, top: 0x1b2652, hz: 0x3a4a7e, sun: 0x8fa8ff, si: 0.6, hemi: 1.05, hs: 0x7a8fce, hg: 0x40604a },
  { h: 6, top: 0x5b8fd0, hz: 0xffc3a8, sun: 0xffc4a0, si: 1.2, hemi: 1.1, hs: 0xffe0d0, hg: 0x7a9a6a },
  { h: 8, top: 0x76c3f0, hz: 0xdff4ff, sun: 0xffecd0, si: 2.1, hemi: 1.45, hs: 0xffffff, hg: 0xa8d08a },
  { h: 15, top: 0x6ec0f2, hz: 0xd8f2ff, sun: 0xfff6e6, si: 2.3, hemi: 1.5, hs: 0xffffff, hg: 0xa8d08a },
  { h: 17.5, top: 0x7aa8e0, hz: 0xffd6a8, sun: 0xffcf96, si: 1.8, hemi: 1.3, hs: 0xffe8d0, hg: 0x9ab87a },
  { h: 19, top: 0x4c4c96, hz: 0xff9a7a, sun: 0xff9a6a, si: 0.9, hemi: 0.95, hs: 0xd8b0d0, hg: 0x5a6a5a },
  { h: 20.5, top: 0x16224a, hz: 0x33447a, sun: 0x8fa8ff, si: 0.6, hemi: 1.05, hs: 0x7a8fce, hg: 0x40604a },
  { h: 24, top: 0x101c40, hz: 0x2b3f70, sun: 0x8fa8ff, si: 0.6, hemi: 1.05, hs: 0x7a8fce, hg: 0x40604a },
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpHex(a, b, t, out) { _c1.setHex(a); _c2.setHex(b); return out.copy(_c1).lerp(_c2, t); }

function buildSky(scene) {
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.5 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0); \n#include <colorspace_fragment>\n }',
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  W.sky = sky; W.skyMat = skyMat;
  // 별
  const n = 400, pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.15, 1.4), r = 380;
    pts[i * 3] = Math.cos(a) * Math.cos(e) * r; pts[i * 3 + 1] = Math.sin(e) * r; pts[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  W.starMat = new THREE.PointsMaterial({ color: 0xfff6d0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, W.starMat);
  stars.frustumCulled = false;
  sky.add(stars);

  W.hemi = new THREE.HemisphereLight(0xffffff, 0xa8d08a, 1.5);
  scene.add(W.hemi);
  const sun = new THREE.DirectionalLight(0xfff6e6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;
  scene.fog = new THREE.Fog(0xd8f2ff, 100, 280);
}

export function updateSky(camPos, target) {
  const h = G.time / 60;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= h) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
  lerpHex(a.top, b.top, t, W.skyMat.uniforms.top.value);
  lerpHex(a.hz, b.hz, t, W.skyMat.uniforms.bottom.value);
  G.scene.fog.color.copy(W.skyMat.uniforms.bottom.value);
  lerpHex(a.sun, b.sun, t, W.sun.color);
  W.sun.intensity = lerp(a.si, b.si, t);
  lerpHex(a.hs, b.hs, t, W.hemi.color);
  lerpHex(a.hg, b.hg, t, W.hemi.groundColor);
  W.hemi.intensity = lerp(a.hemi, b.hemi, t);
  const night = clamp((1.6 - W.sun.intensity) / 1.1, 0, 1);
  G.night = night;
  W.starMat.opacity = night;
  for (const m of glowMats) m.emissiveIntensity = m.userData.base + night * 1.4;
  // 태양 방향 (낮에는 동→서, 밤에는 달빛)
  const day = h >= 5 && h < 20;
  const ph = day ? ((h - 5) / 15) * Math.PI : ((h >= 20 ? h - 20 : h + 4) / 9) * Math.PI;
  const dir = new THREE.Vector3(-Math.cos(ph) * 0.75, 0.55 + Math.sin(ph) * 0.45, 0.45).normalize();
  W.sun.position.set(target.x + dir.x * 60, dir.y * 60, target.z + dir.z * 60);
  W.sun.target.position.set(target.x, 0, target.z);
  W.sky.position.copy(camPos);
}

// ---------------- 구름, 나비, 반딧불 ----------------
function buildCritters(scene) {
  W.clouds = [];
  for (let i = 0; i < 16; i++) {
    const g = group(scene, rand(-160, 160), rand(24, 32), rand(-160, 120));
    const n = 4 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const m = part(g, sphere(1, 9, 6), mat(0xffffff), k * 1.8 - n * 0.9, rand(-0.3, 0.4), rand(-1, 1), 0, 0, 0, rand(1.6, 2.6), rand(1.2, 1.8), rand(1.5, 2.2));
      m.castShadow = false;
    }
    g.userData.speed = rand(0.6, 1.4);
    W.clouds.push(g);
  }
  W.butterflies = [];
  for (let i = 0; i < 8; i++) {
    const g = group(scene, rand(-55, 55), 1.2, rand(-10, 60));
    const c = pick([0xffd34d, 0xff8fab, 0xffffff, 0x8ecae6, 0xc9a7ff]);
    const wings = [];
    for (const s of [-1, 1]) {
      const wg = group(g);
      part(wg, sphere(0.16, 8, 6), mat(c), s * 0.14, 0, 0, 0, 0, 0, 1, 0.15, 0.8).castShadow = false;
      wings.push({ g: wg, s });
    }
    part(g, capsuleGeo(), mat(0x4a4f5c), 0, 0, 0, Math.PI / 2, 0, 0, 0.6, 0.6, 0.6).castShadow = false;
    g.userData = { wings, ph: rand(0, 6), home: new THREE.Vector3(g.position.x, 0, g.position.z), t: rand(0, 100) };
    W.butterflies.push(g);
  }
  W.fireflies = [];
  const ffm = basic(0xfff7a0);
  for (let i = 0; i < 26; i++) {
    const p = LAYOUT.pond;
    const home = i < 14
      ? new THREE.Vector3(p.x + rand(-9, 9), 0, p.z + rand(-9, 9))
      : new THREE.Vector3(rand(-60, 60), 0, rand(-55, 60));
    const m = part(scene, sphere(0.07, 6, 4), ffm, home.x, 1, home.z);
    m.castShadow = false;
    m.userData = { home, t: rand(0, 100) };
    W.fireflies.push(m);
  }
}

// ---------------- 빌드 / 업데이트 ----------------
export function buildWorld(scene) {
  buildSky(scene);
  buildGround(scene);
  buildRoads(scene);
  buildPond(scene);

  const fh = buildFarmhouse(scene, LAYOUT.farmhouse.x, LAYOUT.farmhouse.z);
  W.chimney = fh.chimney;
  W.house = fh;
  G.farmhouse = fh;
  setOwner(DOCK_OWNER);
  W.dockRoot = buildDock(scene, LAYOUT.dock, dockSlots());
  setOwner(null);
  const fh2 = W.house;
  buildMarket(scene, LAYOUT.market);
  buildSign(scene, LAYOUT.yard.x - 5.3, LAYOUT.yard.z - 3, 0xf4c96b);
  buildSign(scene, LAYOUT.dock.x - 6.5, LAYOUT.dock.z - 2, 0xffb84d);
  const y = LAYOUT.yard;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = y.x + sx * 4.6, pz = y.z + sz * 3.6;
    INST.add('ypost', rbox(0.3, 0.8, 0.3, 0.08), mat(0xffffff), px, 0.4, pz, 0, 0, 0, 1, 1, 1, 0xc98a5a);
    addCircle(px, pz, 0.25);
  }
  for (const x of [-62, -48, -32, -21, -10, 16, 30, 42]) buildLamp(scene, x, -2.6);
  buildLamp(scene, -32.5, 28.8);
  buildLamp(scene, 14.5, 28.8);
  buildScarecrow(scene, 13.5, 56);
  buildScarecrow(scene, 62.5, 20);
  buildAirfield(scene, LAYOUT.airfield);

  buildNature(scene);
  buildCritters(scene);
}

let chimneyT = 0;
export function updateWorld(dt) {
  const t = G.now;
  for (const c of W.clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 180) c.position.x = -180;
  }
  for (const l of W.lilies) l.position.y = 0.09 + Math.sin(t * 1.2 + l.userData.ph) * 0.02;
  const day = G.night < 0.5;
  for (const b of W.butterflies) {
    b.visible = day;
    if (!day) continue;
    const u = b.userData; u.t += dt;
    b.position.x = u.home.x + Math.sin(u.t * 0.35) * 5 + Math.sin(u.t * 1.3) * 0.8;
    b.position.z = u.home.z + Math.cos(u.t * 0.27) * 5;
    b.position.y = 1.1 + Math.sin(u.t * 2.1) * 0.35;
    b.rotation.y = Math.atan2(Math.cos(u.t * 0.35) * 1.75, -Math.sin(u.t * 0.27) * 1.35);
    const f = Math.sin(u.t * 18) * 0.9;
    for (const w of u.wings) w.g.rotation.z = w.s * f;
  }
  const ffOn = G.night > 0.55;
  for (const f of W.fireflies) {
    f.visible = ffOn;
    if (!ffOn) continue;
    const u = f.userData; u.t += dt;
    f.position.set(u.home.x + Math.sin(u.t * 0.5) * 2, 0.8 + Math.sin(u.t * 1.7) * 0.5, u.home.z + Math.cos(u.t * 0.43) * 2);
    const s = 0.6 + Math.sin(u.t * 4) * 0.5;
    f.scale.setScalar(Math.max(0.1, s));
  }
  chimneyT -= dt;
  if (chimneyT < 0) {
    chimneyT = 0.7;
    const c = W.chimney;
    spawn('smoke', c.x + rand(-0.1, 0.1), c.y, c.z, { vy: 1.0, vx: 0.3, life: 2.6, size: 1.2 });
  }
}


// ---------------- 출하장 이동 ----------------
export const DOCK_OWNER = { name: 'dock' };
export function dockFootprint(x = LAYOUT.dock.x, z = LAYOUT.dock.z) {
  const d = LAYOUT.dock;
  return { minX: x - 7, maxX: x + 7, minZ: z - d.d / 2 - 1, maxZ: z + 12.5 };
}
export function relocateDock(x, z) {
  const d = LAYOUT.dock;
  const stored = G.items.filter((it) => it.support.kind === 'dock');
  G.scene.remove(W.dockRoot);
  removeColliders(DOCK_OWNER);
  d.x = x; d.z = z; d.bay.x = x; d.bay.z = z + 8.5;
  setOwner(DOCK_OWNER);
  W.dockRoot = buildDock(G.scene, d, dockSlots());
  setOwner(null);
  const slots = dockSlots();
  for (const it of stored) setOnDock(it, slots[it.support.slot]);
}
