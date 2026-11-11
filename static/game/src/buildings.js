// 건물과 구조물
import * as THREE from 'three';
import { mat, glow, curved, gradientMap } from './materials.js';
import { glassMat } from './models.js';
import { part, group, rbox, box, sbox, sphere, cyl, cone, torus, rand, pick } from './util.js';
import { INST, Instancer } from './instancer.js';
import { addBox, addBoxC, addCircle } from './physics.js';
import { G } from './state.js';

export function extrude(points, depth, steps = 1) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps });
  geo.translate(0, 0, -depth / 2);
  geo.computeBoundingSphere();
  return geo;
}

function gableRoof(parent, w, d, h, wallMat, roofMat, y, over = 0.5) {
  const inner = [[-w / 2, 0], [0, h], [w / 2, 0]];
  part(parent, extrude(inner, d - 0.05), wallMat, 0, y, 0);
  const t = 0.42;
  const outer = [[-w / 2 - over, -0.25], [0, h + t], [w / 2 + over, -0.25]];
  const band = [...outer, [w / 2 + over - 0.3, -0.25 + 0.01], [0, h + 0.02], [-w / 2 - over + 0.3, -0.25 + 0.01]];
  return part(parent, extrude(band, d + over * 1.6), roofMat, 0, y, 0);
}

function windowBox(parent, x, y, z, w, h, ry = 0, frame = 0xfffaf0) {
  const g = group(parent, x, y, z);
  g.rotation.y = ry;
  part(g, rbox(w + 0.25, h + 0.25, 0.12, 0.05), mat(frame), 0, 0, 0);
  part(g, box(w, h, 0.06), glow(0xffe9a8, 0.12), 0, 0, 0.05);
  part(g, box(0.06, h, 0.08), mat(frame), 0, 0, 0.07);
  part(g, box(w, 0.06, 0.08), mat(frame), 0, 0, 0.07);
  return g;
}

// ---------------- 울타리 ----------------
const FENCE = 0xf6e8cc;
export function fenceLine(x1, z1, x2, z2, gateAt = null) {
  const horiz = Math.abs(z2 - z1) < 1e-6;
  const len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const n = Math.max(1, Math.round(len / 2));
  const sp = len / n;
  const dx = horiz ? Math.sign(x2 - x1) : 0, dz = horiz ? 0 : Math.sign(z2 - z1);
  const white = mat(0xffffff);
  for (let i = 0; i <= n; i++) {
    const px = x1 + dx * sp * i, pz = z1 + dz * sp * i;
    INST.add('fpost', rbox(0.24, 1.15, 0.24, 0.08), white, px, 0.575, pz, 0, 0, 0, 1, 1, 1, FENCE);
  }
  for (let i = 0; i < n; i++) {
    const mx = x1 + dx * sp * (i + 0.5), mz = z1 + dz * sp * (i + 0.5);
    const isGate = gateAt != null && (horiz ? Math.abs(mx - gateAt) < sp / 2 : Math.abs(mz - gateAt) < sp / 2);
    const ry = horiz ? 0 : Math.PI / 2;
    const b = horiz
      ? [mx - sp / 2, mx + sp / 2, z1 - 0.15, z1 + 0.15]
      : [x1 - 0.15, x1 + 0.15, mz - sp / 2, mz + sp / 2];
    if (isGate) {
      addBox(...b, { vehicleOnly: true });
      // 아치형 문
      for (const s of [-1, 1]) {
        const px = horiz ? mx + (s * sp) / 2 : x1, pz = horiz ? z1 : mz + (s * sp) / 2;
        INST.add('gpost', rbox(0.28, 2.3, 0.28, 0.08), white, px, 1.15, pz, 0, 0, 0, 1, 1, 1, 0xc98a5a);
      }
      INST.add('gbeam', rbox(1, 0.22, 0.3, 0.08), white, mx, 2.3, mz, 0, ry, 0, sp + 0.5, 1, 1, 0xc98a5a);
      INST.add('gflower', sphere(0.16, 8, 6), white, mx, 2.48, mz, 0, 0, 0, 1, 1, 1, 0xff8fab);
      continue;
    }
    for (const y of [0.45, 0.85]) INST.add('frail', box(1, 0.12, 0.08), white, mx, y, mz, 0, ry, 0, sp, 1, 1, FENCE);
    addBox(...b);
  }
}

export function zoneRing(scene, x, z, r, color) {
  const g = group(scene, x, 0.06, z);
  const ring = new THREE.RingGeometry(r - 0.22, r, 48, 1);
  ring.rotateX(-Math.PI / 2);
  part(g, ring, mat(color), 0, 0, 0).castShadow = false;
  const disc = new THREE.CircleGeometry(r - 0.22, 48);
  disc.rotateX(-Math.PI / 2);
  part(g, disc, mat(color, { transparent: true, opacity: 0.2, depthWrite: false }), 0, -0.01, 0).castShadow = false;
  return g;
}

// ---------------- 실제 크기 축사 ----------------
function floorPlane(parent, x, z, w, d, material, y) {
  const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / 3)), Math.max(1, Math.ceil(d / 3)));
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function longCyl(r, len, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, Math.max(1, Math.ceil(len / 3)));
  g.rotateX(Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

/** 통로를 차량으로 지나다닐 수 있는 개방형 대형 축사 */
export function buildBigBarn(scene, b) {
  const d = b.def;
  const { cx, front, back, minX, maxX } = b;
  const len = front - back, W = maxX - minX, zc = (front + back) / 2;
  const g = group(scene);
  const LI = new Instancer();
  // 축사 앞 진입로 · 옆 통로 · 뒤 작업 마당 (축사와 함께 움직인다)
  floorPlane(g, cx, front + 2.5, 8.6, 5, mat(0xd2ccbe), 0.026);
  floorPlane(g, cx, front + 2.5, 8, 4.4, mat(0xe6e1d6), 0.03);
  floorPlane(g, maxX + 3.2, (front + back - 12) / 2, 4.6, len + 12, mat(0xf3e2b3), 0.024);
  floorPlane(g, cx, back - 6, W + 6, 12, mat(0xe6e1d6), 0.027);
  const roof = group(g);
  const EAVE = 4.6, RISE = 3.0;
  const white = mat(0xffffff), wallC = mat(0xfffaf0), trim = mat(d.trim), steel = mat(0xe8edf2);
  const roofM = mat(d.roof), curtain = mat(d.curtain);
  // 바닥
  floorPlane(g, cx, zc, 6.6, len, mat(0xdcd8cf), 0.04);
  for (const p of b.pens) floorPlane(g, (p.minX + p.maxX) / 2, zc, p.maxX - p.minX + 0.6, len - 0.4, mat(d.bed), 0.045);
  floorPlane(g, cx, front + 2.5, 6.6, 5, mat(0xdcd8cf), 0.035);
  // 옆벽 (낮은 벽 + 걷어 올린 커튼)
  for (const x of [minX, maxX]) {
    part(g, sbox(0.3, 1.3, len), wallC, x, 0.65, zc);
    part(g, sbox(0.36, 0.16, len + 0.1), trim, x, 1.36, zc);
    part(g, longCyl(0.24, len), curtain, x, EAVE - 0.45, zc);
    addBox(x - 0.2, x + 0.2, back, front);
  }
  // 기둥
  const nP = Math.max(2, Math.round(len / 4));
  for (let i = 0; i <= nP; i++) {
    const z = back + (i * len) / nP;
    for (const x of [minX, maxX, cx - 3.3, cx + 3.3]) LI.add('bpost', box(0.3, 1, 0.3), white, x, EAVE / 2, z, 0, 0, 0, 1, EAVE, 1, 0xe8edf2);
  }
  // 윗보
  for (const x of [minX, cx - 3.3, cx + 3.3, maxX]) part(g, sbox(0.3, 0.36, len + 0.3), trim, x, EAVE, zc);
  for (const z of [front, back]) part(g, sbox(W + 0.3, 0.36, 0.3), trim, cx, EAVE, z);
  // 사료 펜스 (스탄치온) + 사료 더미
  b.hayStrips = [];
  for (const fx of [cx - 3.3, cx + 3.3]) {
    for (const y of [0.55, 1.25]) part(g, sbox(0.1, 0.1, len), steel, fx, y, zc);
    for (let z = back + 0.4; z < front - 0.3; z += 0.7) LI.add('hbar', cyl(0.035, 0.035, 1, 6), white, fx, 0.9, z, 0, 0, 0, 1, 0.9, 1, 0xe8edf2, false);
    addBox(fx - 0.15, fx + 0.15, back, front);
    const hx = fx + (fx < cx ? 0.7 : -0.7);
    const hay = part(g, sbox(0.95, 0.4, len - 2), mat(0xf4d36b), hx, 0.2, zc);
    hay.castShadow = false;
    b.hayStrips.push(hay);
  }
  // 앞/뒤 벽 (통로와 우리 출입문은 앞뒤 모두 비워둠 → 축사를 관통해 퇴비사까지 바로 왕복)
  const wallSeg = (x0, x1, z) => {
    if (x1 - x0 < 0.05) return;
    part(g, sbox(x1 - x0, 1.3, 0.3), wallC, (x0 + x1) / 2, 0.65, z);
    part(g, sbox(x1 - x0 + 0.06, 0.16, 0.36), trim, (x0 + x1) / 2, 1.36, z);
    addBox(x0, x1, z - 0.15, z + 0.15);
  };
  const openings = [[cx - 3.3, cx + 3.3], ...b.pens.map((p) => [p.gate - p.gateW / 2, p.gate + p.gateW / 2])].sort((a, c) => a[0] - c[0]);
  for (const z of [front, back]) {
    let x0 = minX;
    for (const [o0, o1] of openings) { wallSeg(x0, o0, z); x0 = o1; }
    wallSeg(x0, maxX, z);
  }
  // 열려 있는 우리 문짝 (앞문 · 뒷문)
  for (const p of b.pens) {
    for (const z of [front - 1.0, back + 1.0]) {
      for (const s of [-1, 1]) {
        const gx = p.gate + (s * p.gateW) / 2;
        part(g, box(0.08, 1.1, 2.0), steel, gx, 0.65, z);
        part(g, box(0.1, 0.08, 2.0), trim, gx, 1.2, z);
      }
    }
  }
  // 박공 (삼각 벽)
  const tri = extrude([[-W / 2 - 0.15, 0], [0, RISE], [W / 2 + 0.15, 0]], 0.25);
  for (const z of [front, back]) {
    part(g, tri, wallC, cx, EAVE + 0.18, z);
    part(g, cyl(0.75, 0.75, 0.1, 24), glow(0xffe9a8, 0.12), cx, EAVE + 1.2, z + (z === front ? 0.15 : -0.15), Math.PI / 2, 0, 0);
    part(g, torus(0.78, 0.1, 8, 24), trim, cx, EAVE + 1.2, z + (z === front ? 0.17 : -0.17));
  }
  // 지붕
  const half = W / 2 + 0.9;
  const slope = Math.atan2(RISE, W / 2);
  const slant = half / Math.cos(slope);
  for (const s of [-1, 1]) {
    part(roof, sbox(slant, 0.22, len + 1.6, 2.5), roofM, cx + (s * half) / 2, EAVE + RISE - (half * Math.tan(slope)) / 2 + 0.16, zc, 0, 0, -s * slope);
    // 채광창 줄
    const off = slant * 0.18;
    part(roof, sbox(slant * 0.16, 0.05, len + 1.6, 2.5), mat(0xfffaf0), cx + s * Math.cos(slope) * (half / 2 / Math.cos(slope) - off), EAVE + RISE - Math.sin(slope) * (half / 2 / Math.cos(slope) - off) + 0.3, zc, 0, 0, -s * slope);
  }
  part(roof, sbox(0.7, 0.26, len + 1.7), trim, cx, EAVE + RISE + 0.2, zc);
  for (let z = back + 5; z < front - 3; z += 9) {
    part(roof, rbox(1.4, 0.8, 1.4, 0.12), wallC, cx, EAVE + RISE + 0.6, z);
    part(roof, rbox(1.8, 0.16, 1.8, 0.06), roofM, cx, EAVE + RISE + 1.05, z);
  }
  // 바닥 표시: 사료 하차 지점
  zoneRing(g, b.dropPos.x, b.dropPos.z, 2.2, 0x8fd16a);
  zoneRing(g, b.palletSlots[1].x, b.palletSlots[1].z, 3.8, 0x7cb7f0);
  LI.build(g);
  return { group: g, roof };
}

/** 출하장: 팔레트를 쌓아두면 트럭이 실어간다 */
export function buildDock(scene, dock, slots) {
  const root = group(scene);
  const g = group(root, dock.x, 0, dock.z);
  const pave = new THREE.PlaneGeometry(13, 15, 5, 5);
  pave.rotateX(-Math.PI / 2);
  const pm = new THREE.Mesh(pave, mat(0xeadbb8));
  pm.position.set(dock.x, 0.026, dock.z + 3); pm.receiveShadow = true; root.add(pm);
  const pad = new THREE.PlaneGeometry(dock.w + 1, dock.d + 1, 4, 3);
  pad.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(pad, mat(0xd9d4c7));
  m.position.y = 0.04; m.receiveShadow = true; g.add(m);
  for (const s of slots) {
    const r = new THREE.RingGeometry(0.75, 0.85, 4, 1, Math.PI / 4);
    r.rotateX(-Math.PI / 2);
    part(root, r, mat(0xffb84d), s.x, 0.06, s.z, 0, 0, 0, 1.3, 1, 1.1).castShadow = false;
  }
  const O = mat(0xffb84d), D = mat(0x8a5f3c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    part(g, cyl(0.12, 0.12, 4, 8), D, sx * (dock.w / 2 + 0.2), 2, sz * (dock.d / 2 + 0.2));
    addCircle(dock.x + sx * (dock.w / 2 + 0.2), dock.z + sz * (dock.d / 2 + 0.2), 0.2);
  }
  part(g, sbox(dock.w + 1.6, 0.2, dock.d + 1.6), O, 0, 4.05, 0);
  for (let i = 0; i < 6; i++) part(g, sbox((dock.w + 1.6) / 6 - 0.05, 0.22, 0.4), i % 2 ? mat(0xffffff) : mat(0xff8a65), -(dock.w + 1.6) / 2 + (i + 0.5) * ((dock.w + 1.6) / 6), 3.9, dock.d / 2 + 0.9);
  zoneRing(root, dock.bay.x, dock.bay.z, 3.4, 0xffb84d);
  return root;
}

/** 판매소 */
export function buildMarket(scene, m) {
  const x = m.x + 8, z = m.z;
  const g = group(scene, x, 0, z);
  const wall = mat(0xfff1d6), roof = mat(0xff8fab), Wt = mat(0xfffaf0);
  part(g, rbox(7, 3.4, 8, 0.2), wall, 0, 1.7, 0);
  const rg = group(g);
  rg.rotation.y = Math.PI / 2;
  gableRoof(rg, 8, 7, 2.2, wall, roof, 3.4, 0.6);
  // 줄무늬 차양
  for (let i = 0; i < 7; i++) part(g, box(0.9, 0.12, 1.4), i % 2 ? Wt : mat(0xff8fab), -3.9, 2.9, -3.1 + i * 1.03, 0, 0, -0.35);
  part(g, rbox(0.4, 1.8, 6.6, 0.1), mat(0xc98a5a), -3.6, 1.0, 0);
  for (let i = 0; i < 6; i++) part(g, sphere(0.22, 10, 8), mat(pick([0xff6b6b, 0xffd34d, 0x8fd16a, 0xffa94d])), -3.75, 2.0, -2.5 + i, 0, 0, 0, 1, 0.8, 1);
  windowBox(g, -3.53, 2.3, 2.6, 1.0, 0.8, -Math.PI / 2);
  addBox(x - 3.6, x + 3.6, z - 4.1, z + 4.1);
  zoneRing(scene, m.x, m.z, m.r, 0xff8fab);
}

// ---------------- 그 외 구조물 ----------------

export function buildFarmhouse(scene, x, z) {
  const g = group(scene, x, 0, z);
  // 외관 꾸미기용 개별 재질
  const wall = curved(new THREE.MeshToonMaterial({ color: 0xfff1d6, gradientMap: gradientMap() }));
  const roof = curved(new THREE.MeshToonMaterial({ color: 0x5fb8c6, gradientMap: gradientMap() }));
  const wood = curved(new THREE.MeshToonMaterial({ color: 0xb07a4f, gradientMap: gradientMap() }));
  const white = mat(0xfffaf0);
  const w = 7, d = 6, H = 3.3;
  part(g, rbox(w, H, d, 0.2), wall, 0, H / 2, 0);
  part(g, rbox(w + 0.15, 0.4, d + 0.15, 0.1), mat(0xd9c3a0), 0, 0.2, 0);
  const rg = group(g, 0, 0, 0);
  rg.rotation.y = Math.PI / 2;
  gableRoof(rg, d, w, 2.4, wall, roof, H, 0.6);
  // 문
  part(g, rbox(1.3, 2.2, 0.14, 0.08), wood, 0, 1.1, d / 2 + 0.03);
  part(g, sphere(0.08, 8, 6), mat(0xffd34d), 0.4, 1.1, d / 2 + 0.14);
  part(g, rbox(2.2, 0.2, 1.2, 0.06), mat(0xd9c3a0), 0, 0.1, d / 2 + 0.6);
  // 차양
  part(g, rbox(2.2, 0.12, 1.0, 0.05), roof, 0, 2.55, d / 2 + 0.45, 0.25, 0, 0);
  for (const sx of [-1, 1]) {
    windowBox(g, sx * 2.2, 1.8, d / 2 + 0.03, 1.1, 0.9);
    part(g, rbox(1.3, 0.3, 0.35, 0.06), mat(0xc98a5a), sx * 2.2, 1.15, d / 2 + 0.2);
    for (let i = 0; i < 4; i++) part(g, sphere(0.12, 8, 6), mat(pick([0xff8fab, 0xffd34d, 0xc9a7ff, 0xff7b6b])), sx * 2.2 - 0.45 + i * 0.3, 1.38, d / 2 + 0.22);
  }
  // 굴뚝
  part(g, rbox(0.7, 1.6, 0.7, 0.08), mat(0xd98c74), 2.0, H + 1.9, -1.0);
  part(g, rbox(0.85, 0.2, 0.85, 0.06), mat(0xc0705a), 2.0, H + 2.75, -1.0);
  addBoxC(x, z, w, d);
  // 우편함
  const mb = group(scene, x + 4.6, 0, z + d / 2 + 1.2);
  part(mb, cyl(0.06, 0.06, 1.1, 6), wood, 0, 0.55, 0);
  part(mb, rbox(0.5, 0.36, 0.7, 0.15), mat(0xff7b6b), 0, 1.25, 0);
  part(mb, box(0.04, 0.3, 0.12), mat(0xffd34d), 0.27, 1.45, -0.1);
  addCircle(x + 4.6, z + d / 2 + 1.2, 0.35);
  return { group: g, chimney: new THREE.Vector3(x + 2.0, H + 2.9, z - 1.0), door: { x, z: z + d / 2 + 1.0 }, mats: { wall, roof, door: wood } };
}

export function buildLamp(scene, x, z) {
  const g = group(scene, x, 0, z);
  part(g, cyl(0.1, 0.14, 3.2, 8), mat(0x4a6b5a), 0, 1.6, 0);
  part(g, cyl(0.22, 0.28, 0.2, 10), mat(0x4a6b5a), 0, 0.1, 0);
  part(g, sphere(0.32, 12, 10), glow(0xfff0b8, 0.15), 0, 3.35, 0);
  part(g, cone(0.4, 0.3, 10), mat(0x4a6b5a), 0, 3.75, 0);
  addCircle(x, z, 0.25);
}

export function buildSign(scene, x, z, color = 0xc98a5a, ry = 0) {
  const g = group(scene, x, 0, z);
  g.rotation.y = ry;
  for (const sx of [-0.6, 0.6]) part(g, cyl(0.07, 0.07, 1.4, 6), mat(0x8a5f3c), sx, 0.7, 0);
  part(g, rbox(1.7, 0.7, 0.12, 0.08), mat(color), 0, 1.25, 0);
  part(g, rbox(1.45, 0.48, 0.13, 0.06), mat(0xfff3dc), 0, 1.25, 0.01);
  return g;
}

export function buildScarecrow(scene, x, z) {
  const g = group(scene, x, 0, z);
  part(g, cyl(0.07, 0.07, 2.4, 6), mat(0x8a5f3c), 0, 1.2, 0);
  part(g, cyl(0.05, 0.05, 1.8, 6), mat(0x8a5f3c), 0, 1.65, 0, 0, 0, Math.PI / 2);
  part(g, rbox(0.7, 0.8, 0.4, 0.15), mat(0x7cb7f0), 0, 1.5, 0);
  part(g, sphere(0.32, 12, 10), mat(0xf4d36b), 0, 2.2, 0);
  for (const s of [-1, 1]) part(g, sphere(0.04, 6, 4), mat(0x2e2a35), s * 0.11, 2.25, 0.29);
  part(g, cyl(0.5, 0.5, 0.04, 16), mat(0xe0b077), 0, 2.45, 0);
  part(g, cyl(0.25, 0.3, 0.25, 12), mat(0xe0b077), 0, 2.58, 0);
  for (const s of [-1, 1]) part(g, cone(0.1, 0.25, 6), mat(0xf4d36b), s * 0.95, 1.65, 0, 0, 0, s * Math.PI / 2);
  addCircle(x, z, 0.4);
}

// ---------------- ✈️ 비행장 ----------------
export function buildAirfield(scene, A) {
  const R = A.runway;
  const g = group(scene);
  const flat = (x, z, w, d, color, y) => {
    const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(d / 4)));
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // 활주로 (아스팔트 + 흰 중앙선 + 양 끝 줄무늬)
  flat(R.x, R.z, R.len + 2, R.w + 2, 0xd9d4c7, 0.03);
  flat(R.x, R.z, R.len, R.w, 0x8a8f9c, 0.06);
  for (let x = R.x - R.len / 2 + 14; x < R.x + R.len / 2 - 12; x += 9) flat(x, R.z, 4.5, 0.4, 0xfffaf0, 0.09);
  for (const end of [-1, 1]) {
    for (let i = -2; i <= 2; i++) flat(R.x + end * (R.len / 2 - 4), R.z + i * 2.4, 5, 0.9, 0xfffaf0, 0.09);
    flat(R.x + end * (R.len / 2 - 11), R.z, 0.6, R.w - 2, 0xffd34d, 0.09);
  }
  // 활주로 가장자리 등불
  for (let x = R.x - R.len / 2; x <= R.x + R.len / 2; x += 10) {
    for (const s2 of [-1, 1]) INST.add('rwlight', sphere(0.16, 8, 6), mat(0xffffff), x, 0.18, R.z + s2 * (R.w / 2 + 0.8), 0, 0, 0, 1, 1, 1, x % 20 === 0 ? 0xffd34d : 0x8fd16a, false);
  }
  // 주기장 · 유도로
  flat(A.plane.x, R.z + R.w / 2 + 1 + 9, 18, 18, 0xc9c4b8, 0.045);
  // 격납고 (둥근 지붕, 앞이 열림)
  const H = A.hangar;
  const hg = group(g, H.x, 0, H.z);
  const wall = mat(0xe8edf2), roofM = mat(0x7cb7f0);
  part(hg, sbox(16, 0.3, 11), mat(0xd9d4c7), 0, 0.15, 0);
  const arch = new THREE.CylinderGeometry(6.5, 6.5, 11, 24, 3, true, -Math.PI / 2, Math.PI);
  arch.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(arch, curved(new THREE.MeshToonMaterial({ color: 0x7cb7f0, gradientMap: gradientMap(), side: THREE.DoubleSide })));
  roof.position.set(0, 0.2, 0);
  roof.scale.set(1.2, 1, 1);
  roof.castShadow = true; roof.receiveShadow = true;
  hg.add(roof);
  const half = new THREE.Shape();
  half.absarc(0, 0, 6.5, 0, Math.PI, false);
  half.lineTo(6.5, 0);
  const backGeo = new THREE.ExtrudeGeometry(half, { depth: 0.3, bevelEnabled: false, curveSegments: 24 });
  backGeo.scale(1.2, 1, 1);
  const back = new THREE.Mesh(backGeo, wall);
  back.position.set(0, 0.2, -5.6);
  back.castShadow = true; back.receiveShadow = true;
  hg.add(back);
  for (let i = -3; i <= 3; i++) part(hg, box(0.25, 0.25, 11.2), mat(0xfffaf0), Math.sin((i / 3.5) * 1.4) * 7.6, 0.2 + Math.cos((i / 3.5) * 1.4) * 6.4, 0);
  part(hg, rbox(4, 1.1, 0.15, 0.08), mat(0xfff3dc), 0, 5.1, 5.6);
  part(hg, sphere(0.35, 10, 8), mat(0xff9eb5), -1.2, 5.1, 5.7, 0, 0, 0, 1, 1, 0.3);
  addBox(H.x - 8, H.x + 8, H.z - 5.6, H.z - 5.2);
  for (const sx of [-1, 1]) addBox(H.x + sx * 7.8 - 0.3, H.x + sx * 7.8 + 0.3, H.z - 5.5, H.z + 5.5);
  // 헬기장
  const P = A.heli;
  const hp = group(g, P.x, 0, P.z);
  const pad = new THREE.CircleGeometry(7, 32); pad.rotateX(-Math.PI / 2);
  part(hp, pad, mat(0x9aa1ad), 0, 0.03, 0).castShadow = false;
  const ring = new THREE.RingGeometry(5.6, 6.1, 32); ring.rotateX(-Math.PI / 2);
  part(hp, ring, mat(0xffd34d), 0, 0.04, 0).castShadow = false;
  for (const [x, z, w, d] of [[-1.6, 0, 0.7, 4.6], [1.6, 0, 0.7, 4.6], [0, 0, 2.6, 0.7]]) part(hp, box(w, 0.02, d), mat(0xfffaf0), x, 0.05, z).castShadow = false;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(hp, sphere(0.14, 8, 6), glow(0xffd34d, 0.4), Math.cos(a) * 6.9, 0.16, Math.sin(a) * 6.9); }
  // 바람자루
  const ws = group(g, R.x - R.len / 2 + 8, 0, R.z + R.w / 2 + 6);
  part(ws, cyl(0.08, 0.08, 5, 8), mat(0xfffaf0), 0, 2.5, 0);
  const sock = group(ws, 0, 4.8, 0);
  for (let i = 0; i < 4; i++) part(sock, cyl(0.35 - i * 0.06, 0.3 - i * 0.06, 0.55, 12), mat(i % 2 ? 0xfffaf0 : 0xff7b6b), 0.35 + i * 0.52, 0, 0, 0, 0, Math.PI / 2);
  addCircle(ws.position.x, ws.position.z, 0.3);
  // 관제탑 (작고 귀여운)
  const tw = group(g, R.x - R.len / 2 + 24, 0, R.z + R.w / 2 + 12);
  part(tw, rbox(3, 6, 3, 0.3), mat(0xfff1d6), 0, 3, 0);
  part(tw, rbox(4, 1.8, 4, 0.4), glassMat(), 0, 6.9, 0);
  part(tw, rbox(4.4, 0.35, 4.4, 0.15), mat(0xff9eb5), 0, 7.95, 0);
  part(tw, sphere(0.25, 8, 6), glow(0xff6b6b, 0.6), 0, 8.4, 0);
  addBox(tw.position.x - 1.5, tw.position.x + 1.5, tw.position.z - 1.5, tw.position.z + 1.5);
  return { sock };
}
