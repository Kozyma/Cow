// 🔧 차량 외형: ① 브랜드별 차체 모양(늘이기·줄이기·넓히기) · 투톤 도색 · 엠블럼  ② 자리별 커스텀 파츠
// 차종마다 모양이 달라도, 차체를 광선으로 훑어서 지붕 끝·앞면·뒷면·옆면·보닛·바퀴 자리를 찾아 그 자리에 붙인다.
// 그래서 같은 파츠라도 트랙터·트럭·지게차마다 크기와 위치가 알맞게 달라진다.
import * as THREE from 'three';
import { mat, glow } from './materials.js';
import { part, group, rbox, box, sphere, cyl, cone, torus } from './util.js';
import { mergeStatic } from './merge.js';

const UP = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();

// ---------------- 차체 분석 ----------------
/** 움직이는 부품(포크·버킷·예초기 등): 모델이 돌려준 부품 중 차체(body)·전체(group)가 아닌 것 */
function movingSet(v) {
  const set = new Set();
  const m = v.m;
  for (const [k, val] of Object.entries(m)) {
    if (k === 'group' || k === 'body' || k === 'seat' || k === 'seat2' || k === 'exhaust') continue;
    const add = (o) => { if (o?.isObject3D) set.add(o); };
    if (Array.isArray(val)) val.forEach((x) => { add(x); add(x?.steer); add(x?.spin); });
    else add(val);
  }
  return set;
}

/**
 * 차체 기준점 찾기 (모델 좌표, 차는 원점·정면 +z 기준으로 잠깐 되돌려 놓고 계산)
 * roof: 가장 높은 평평한 면 / roofFront·roofBack: 그 지붕의 앞·뒤 끝 / front·back: 앞·뒷면
 * side: 옆면(±x) / box: 차체 크기
 */
export function analyze(v) {
  if (v.anchors) return v.anchors;
  const g = v.group;
  const saved = { p: g.position.clone(), r: g.rotation.clone(), s: g.scale.clone() };
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
  g.updateMatrixWorld(true);
  const moving = movingSet(v);
  const isMoving = (o) => { for (let p = o; p && p !== g; p = p.parent) if (moving.has(p)) return true; return false; };
  const meshes = (v.paintMeshes || []).filter((m) => m.visible && !isMoving(m) && !m.material.transparent);
  const box3 = new THREE.Box3();
  for (const m of meshes) box3.expandByObject(m);
  const W = box3.max.x - box3.min.x, H = box3.max.y - box3.min.y, D = box3.max.z - box3.min.z;
  const cast = (ox, oy, oz, dx, dy, dz) => {
    _o.set(ox, oy, oz); _d.set(dx, dy, dz).normalize();
    _ray.set(_o, _d);
    const hit = _ray.intersectObjects(meshes, false)[0];
    if (!hit || !hit.face) return null;
    _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return { p: hit.point.clone(), n: _n.clone(), obj: hit.object };
  };
  const down = (x, z) => { const h = cast(x, box3.max.y + 2, z, 0, -1, 0); return h && h.n.y > 0.6 ? h : null; };
  // 가운데 줄을 앞뒤로 훑어 지붕(가장 높은 평평한 면)과 그 앞·뒤 끝
  const N = 24, prof = [];
  for (let i = 0; i <= N; i++) { const z = box3.min.z + (D * i) / N; prof.push({ z, h: down(0, z) }); }
  let top = -1;
  prof.forEach((s, i) => { if (s.h && (top < 0 || s.h.p.y > prof[top].h.p.y + 0.04)) top = i; });
  const roofY = top >= 0 ? prof[top].h.p.y : box3.max.y;
  let iB = top, iF = top;
  while (iB > 0 && prof[iB - 1].h && Math.abs(prof[iB - 1].h.p.y - roofY) < 0.16) iB--;
  while (iF < N && prof[iF + 1].h && Math.abs(prof[iF + 1].h.p.y - roofY) < 0.16) iF++;
  const roofHit = top >= 0 ? prof[top].h : null;
  const roof = roofHit ? prof[Math.round((iB + iF) / 2)].h || roofHit : null;
  const roofBack = top >= 0 ? prof[iB].h : null, roofFront = top >= 0 ? prof[iF].h : null;
  // 지붕 폭: 지붕 높이에서 옆으로 훑기
  let roofW = W * 0.5;
  if (roof) {
    let x = 0;
    while (x < W / 2) { const h = down(x + 0.1, roof.p.z); if (!h || Math.abs(h.p.y - roofY) > 0.16) break; x += 0.1; }
    roofW = Math.max(0.5, x * 2);
  }
  // 앞·뒷면: 몇 가지 높이에서 수평으로
  const face = (dir) => {
    for (const f of [0.4, 0.3, 0.55, 0.22, 0.7]) {
      const y = box3.min.y + H * f;
      const h = cast(0, y, dir > 0 ? box3.max.z + 3 : box3.min.z - 3, 0, 0, -dir);
      if (h && Math.abs(h.n.z) > 0.5) return h;
    }
    return null;
  };
  const side = (sx) => {
    for (const fz of [0.5, 0.4, 0.6, 0.3, 0.7]) for (const f of [0.45, 0.35, 0.55]) {
      const h = cast(sx * (box3.max.x + 3), box3.min.y + H * f, box3.min.z + D * fz, -sx, 0, 0);
      if (h && Math.abs(h.n.x) > 0.6) return h;
    }
    return null;
  };
  // 줄무늬용: x=±off 에서 앞뒤로 훑은 윗면 점들
  const stripe = (off) => {
    const pts = [];
    for (let z = box3.min.z + 0.1; z < box3.max.z - 0.05; z += 0.2) {
      const h = down(off, z);
      if (h && h.n.y > 0.75) pts.push(h);
    }
    return pts;
  };
  // 옆면 허리선: 정해진 높이에서 앞뒤로 옆면을 훑기 (움푹 들어간 곳은 빼고)
  const band = (sx) => {
    const pts = [];
    for (let z = box3.min.z + 0.15; z < box3.max.z - 0.1; z += 0.2) {
      const h = cast(sx * (box3.max.x + 3), box3.min.y + H * 0.42, z, -sx, 0, 0);
      if (h && Math.abs(h.n.x) > 0.75 && Math.abs(h.p.x) > W * 0.28) pts.push(h);
    }
    return pts;
  };
  // 보닛(앞쪽 30%) 윗면: 불꽃 무늬 자리
  const hood = [];
  for (const x of [-0.28, 0, 0.28]) for (let z = box3.max.z - D * 0.32; z < box3.max.z - 0.1; z += 0.24) {
    const h = down(x, z);
    if (h && h.n.y > 0.7 && h.p.y < roofY - 0.25) hood.push(h);
  }
  const out = {
    box: box3.clone(), W, H, D, roof, roofFront, roofBack, roofW, roofY, hood, bandL: band(-1), bandR: band(1),
    front: face(1), back: face(-1), sideL: side(-1), sideR: side(1),
    stripes: [stripe(-0.16), stripe(0.16)], gold: [stripe(-0.3), stripe(0.3)],
  };
  g.position.copy(saved.p); g.rotation.copy(saved.r); g.scale.copy(saved.s);
  g.updateMatrixWorld(true);
  v.anchors = out;
  return out;
}

// ---------------- 부품 붙이기 도우미 ----------------
/** hit 지점(모델 좌표)에 붙는 작은 그룹. 그 면을 가진 부품(차체 그룹)에 달아서 함께 흔들린다 */
function at(v, hit, ox = 0, oy = 0, oz = 0) {
  const parent = hit?.obj?.parent || v.m.body || v.group;
  const g0 = v.group;
  const saved = { p: g0.position.clone(), r: g0.rotation.clone() };
  g0.position.set(0, 0, 0); g0.rotation.set(0, 0, 0);
  g0.updateMatrixWorld(true);
  const p = parent.worldToLocal((hit ? hit.p.clone() : new THREE.Vector3()).add(new THREE.Vector3(ox, oy, oz)));
  g0.position.copy(saved.p); g0.rotation.copy(saved.r);
  g0.updateMatrixWorld(true);
  const k = group(parent, p.x, p.y, p.z);
  k.userData.kit = true;
  return k;
}

/** 곡면을 따라 작은 조각 여러 개: 같은 부품(부모)에 붙는 조각끼리 한 그룹으로 모아 나중에 한 메시로 합친다 */
function onSurface(v, hits, add, make) {
  const g0 = v.group;
  const saved = { p: g0.position.clone(), r: g0.rotation.clone() };
  g0.position.set(0, 0, 0); g0.rotation.set(0, 0, 0);
  g0.updateMatrixWorld(true);
  const conts = new Map();
  for (const h of hits) {
    const parent = h.obj?.parent || v.m.body || v.group;
    let c = conts.get(parent);
    if (!c) { c = group(parent, 0, 0, 0); c.userData.kit = true; conts.set(parent, c); add(c); }
    const lp = parent.worldToLocal(h.p.clone().addScaledVector(h.n, 0.012));
    const piece = make(c);
    piece.position.copy(lp);
    const own = piece.quaternion.clone();                       // 조각 자체의 기울기(예: 눕힌 불꽃)는 살리고
    piece.quaternion.setFromUnitVectors(UP, h.n).multiply(own); // 면의 기울기를 그 위에 더한다
  }
  g0.position.copy(saved.p); g0.rotation.copy(saved.r);
  g0.updateMatrixWorld(true);
}

/** 바퀴 정보: 각 바퀴의 회전 그룹 · 반지름 · 폭 · 바깥쪽 방향 */
function wheelsOf(v) {
  const out = [];
  for (const w of v.m.wheels || []) {
    if (!w?.spin) continue;
    const b = new THREE.Box3().setFromObject(w.spin);
    const s = b.getSize(new THREE.Vector3());
    const ws = w.spin.getWorldScale(new THREE.Vector3());
    out.push({ w, r: w.r, width: s.x / (ws.x || 1), side: w.side || 1 });
  }
  return out;
}

// ---------------- 커스텀 파츠 (자리별로 하나씩) ----------------
const C = {
  chrome: () => mat(0xd9dde4), dark: () => mat(0x3a3f4a), gold: () => mat(0xf0b62a),
  red: () => mat(0xff5a5f), yellow: () => mat(0xffd34d), mint: () => mat(0x7fe0c4), pink: () => mat(0xff9eb5), white: () => mat(0xfffaf0),
};

const B = {
  // ---- 지붕 ----
  spoiler(v, a, add) {
    if (!a.roofBack) return;
    const k = add(at(v, a.roofBack, 0, 0, -0.02));
    const w = Math.min(a.roofW * 1.05, a.W * 0.9);
    for (const sx of [-1, 1]) part(k, box(0.07, 0.48, 0.12), C.dark(), sx * w * 0.32, 0.22, 0.05, 0.25, 0, 0);
    part(k, rbox(w, 0.07, 0.5, 0.03), C.red(), 0, 0.48, -0.08, -0.22, 0, 0);
    for (const sx of [-1, 1]) part(k, rbox(0.06, 0.3, 0.55, 0.02), C.yellow(), sx * w * 0.5, 0.45, -0.08);
  },
  lightbar(v, a, add) {
    if (!a.roofFront) return;
    const k = add(at(v, a.roofFront, 0, 0, -0.12));
    const w = Math.min(a.roofW * 0.9, a.W * 0.8);
    part(k, rbox(w, 0.13, 0.2, 0.05), C.dark(), 0, 0.1, 0);
    const n = Math.max(3, Math.round(w / 0.28));
    for (let i = 0; i < n; i++) part(k, sphere(0.055, 8, 6), glow(0xfff3b0, 0.9), -w / 2 + 0.12 + (i * (w - 0.24)) / (n - 1), 0.1, 0.1, 0, 0, 0, 1, 1, 0.5);
    for (const sx of [-1, 1]) part(k, box(0.04, 0.12, 0.04), C.chrome(), sx * w * 0.42, 0.02, 0);
  },
  bow(v, a, add) {
    if (a.roof) {
      const k = add(at(v, a.roof, 0, 0.02, 0));
      k.scale.setScalar(1.5);
      const p = C.pink();
      for (const sx of [-1, 1]) part(k, cone(0.16, 0.3, 4), p, sx * 0.17, 0.14, 0, 0, 0, sx * Math.PI / 2, 1, 1, 0.55);
      part(k, sphere(0.09, 10, 8), mat(0xff7b9c), 0, 0.14, 0);
      for (const sx of [-1, 1]) part(k, box(0.07, 0.22, 0.02), p, sx * 0.07, 0.03, 0.06, 0, 0, sx * 0.35);
    }
    if (a.roofBack) {
      const k = add(at(v, a.roofBack, Math.min(0.3, a.roofW * 0.35), 0, 0.15));
      part(k, cyl(0.02, 0.02, 0.8, 6), C.white(), 0, 0.4, 0);
      v.kitBob = part(k, sphere(0.1, 10, 8), C.mint(), 0, 0.84, 0);
    }
  },
  rack(v, a, add) {
    if (!a.roof) return;
    const k = add(at(v, a.roof, 0, 0.02, -0.05));
    const w = Math.min(a.roofW * 0.8, 1.3);
    for (const sx of [-1, 1]) part(k, box(0.04, 0.04, 0.8), C.chrome(), sx * w / 2, 0.06, 0);
    for (const z of [-0.35, 0.35]) part(k, box(w, 0.04, 0.04), C.chrome(), 0, 0.06, z);
    part(k, rbox(w * 0.7, 0.2, 0.55, 0.08), C.dark(), 0, 0.18, -0.05);
    part(k, sphere(0.09, 10, 8), glow(0xffa94d, 0.9), w * 0.38, 0.14, 0.3);
  },
  // ---- 앞 ----
  bullbar(v, a, add) {
    if (!a.front) return;
    const k = add(at(v, a.front, 0, 0, 0.14));
    const w = Math.min(a.W * 0.7, 1.4), h = Math.min(a.H * 0.4, 0.7);
    for (const sx of [-1, 1]) part(k, cyl(0.04, 0.04, h, 8), C.chrome(), sx * w / 2, -h * 0.25, 0);
    part(k, cyl(0.04, 0.04, w, 8), C.chrome(), 0, h * 0.25, 0, 0, 0, Math.PI / 2);
    part(k, cyl(0.04, 0.04, w * 0.8, 8), C.chrome(), 0, -h * 0.55, 0.04, 0, 0, Math.PI / 2);
  },
  eyes(v, a, add) {
    if (!a.front) return;
    const k = add(at(v, a.front, 0, Math.min(0.14, a.H * 0.08), 0.03));
    const ex = Math.min(0.32, a.W * 0.2);
    for (const sx of [-1, 1]) {
      part(k, sphere(0.15, 14, 10), C.white(), sx * ex, 0, 0, 0, 0, 0, 1, 1.15, 0.35);
      part(k, sphere(0.085, 12, 8), mat(0x2e2a35), sx * ex, -0.02, 0.04, 0, 0, 0, 1, 1.2, 0.4);
      part(k, sphere(0.03, 8, 6), C.white(), sx * ex + 0.03, 0.03, 0.075);
      part(k, sphere(0.07, 10, 8), mat(0xffb3c8), sx * (ex + 0.17), -0.12, 0.0, 0, 0, 0, 1, 0.6, 0.3);
    }
  },
  splitter(v, a, add) {
    if (!a.front) return;
    const k = add(at(v, a.front, 0, a.box.min.y + 0.2 - a.front.p.y, 0.05));   // 앞면 아래쪽, 바닥에서 약간 위
    part(k, rbox(Math.min(a.W * 0.9, 1.7), 0.05, 0.3, 0.02), C.dark(), 0, 0, 0.05);
    part(k, box(Math.min(a.W * 0.9, 1.7), 0.03, 0.04), C.red(), 0, 0.035, 0.19);
  },
  bumper(v, a, add) {
    for (const [h, dz] of [[a.front, 1], [a.back, -1]]) {
      if (!h) continue;
      const k = add(at(v, h, 0, -Math.min(0.2, a.H * 0.1), dz * 0.1));
      part(k, cyl(0.1, 0.1, Math.min(a.W * 0.85, 1.6), 12), C.mint(), 0, 0, 0, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) part(k, sphere(0.12, 10, 8), C.white(), sx * Math.min(a.W * 0.42, 0.8), 0, 0);
    }
  },
  // ---- 뒤 ----
  muffler(v, a, add) {
    if (!a.back) return;
    const k = add(at(v, a.back, 0, -Math.min(0.25, a.H * 0.12), -0.05));
    for (const sx of [-1, 1]) {
      part(k, cyl(0.07, 0.07, 0.4, 10), C.chrome(), sx * 0.22, 0, -0.1, Math.PI / 2, 0, 0);
      part(k, cyl(0.075, 0.075, 0.03, 10), C.dark(), sx * 0.22, 0, -0.31, Math.PI / 2, 0, 0);
    }
  },
  stacks(v, a, add) {
    if (!a.roofBack) return;
    const k = add(at(v, a.roofBack, 0, 0, -0.12));
    const x0 = Math.min(a.roofW / 2 + 0.06, a.W / 2 - 0.05);
    const h = Math.max(0.9, a.roofY - a.box.min.y - 0.3) + 0.45;
    for (const sx of [-1, 1]) {
      part(k, cyl(0.07, 0.07, h, 10), C.chrome(), sx * x0, 0.45 - h / 2, 0);
      part(k, cyl(0.085, 0.07, 0.12, 10), C.dark(), sx * x0, 0.45, 0, 0.35, 0, 0);
    }
  },
  flaps(v, a, add) {
    const ws = wheelsOf(v);
    if (!ws.length) return;
    const backZ = Math.min(...ws.map((x) => x.w.steer.position.z));
    for (const x of ws) {
      if (Math.abs(x.w.steer.position.z - backZ) > 0.1) continue;
      const s = x.w.steer;
      const k = group(s.parent, s.position.x, s.position.y, s.position.z - x.r - 0.08);
      k.userData.kit = true;
      add(k);
      part(k, rbox(Math.max(0.2, x.width * 0.9), x.r * 1.1, 0.04, 0.02), C.dark(), 0, -x.r * 0.35, 0);
      part(k, box(Math.max(0.2, x.width * 0.9), 0.05, 0.05), C.gold(), 0, x.r * 0.2, 0);
    }
  },
  // ---- 무늬 ----
  stripes(v, a, add) { const y = C.yellow(); onSurface(v, a.stripes.flat(), add, (c) => part(c, box(0.11, 0.02, 0.21), y)); },
  flames(v, a, add) {
    const fo = mat(0xff8a3d), fy = C.yellow();
    let fi = 0;
    onSurface(v, a.hood, add, (c) => part(c, cone(0.11, 0.38, 3), (fi++ % 2) ? fy : fo, 0, 0, 0, -Math.PI / 2, 0, 0, 1, 1, 0.12));
  },
  goldline(v, a, add) {
    const gd = C.gold();
    onSurface(v, a.gold.flat(), add, (c) => part(c, box(0.05, 0.02, 0.21), gd));
    onSurface(v, [...a.bandL, ...a.bandR], add, (c) => part(c, box(0.07, 0.02, 0.21), gd));
  },
  dots(v, a, add) {
    for (const [h, sx] of [[a.sideL, -1], [a.sideR, 1]]) {
      if (!h) continue;
      const k = add(at(v, h, sx * 0.012, 0, 0));
      for (const [dy, dz, r] of [[0.08, 0.18, 0.09], [-0.06, -0.05, 0.07], [0.1, -0.25, 0.06]]) part(k, cyl(r, r, 0.02, 12), C.white(), 0, dy, dz, 0, 0, Math.PI / 2);
    }
  },
  bolts(v, a, add) {
    for (const [h, sx] of [[a.sideL, -1], [a.sideR, 1]]) {
      if (!h) continue;
      const k = add(at(v, h, sx * 0.015, 0, 0));
      const y = C.yellow();
      part(k, box(0.03, 0.07, 0.34), y, 0, 0.1, 0.12, 0.5, 0, 0);
      part(k, box(0.03, 0.07, 0.3), y, 0, 0, -0.02, -0.5, 0, 0);
      part(k, box(0.03, 0.07, 0.34), y, 0, -0.1, -0.16, 0.5, 0, 0);
    }
  },
};

/** 커스텀 파츠 목록: 자리(slot) → 고를 수 있는 파츠. price = 처음 한 번 사면 모든 차에 쓸 수 있음 */
export const SLOTS = {
  roof: { name: '지붕', icon: '🎩', parts: { spoiler: ['🏁 리어 윙', 700], lightbar: ['💡 LED 라이트바', 900], bow: ['🎀 리본·방울 안테나', 500], rack: ['🧳 루프랙·짐상자', 800] } },
  front: { name: '앞', icon: '🛡️', parts: { bullbar: ['🛡️ 크롬 불바', 800], eyes: ['👀 큰 눈·볼터치', 600], splitter: ['🏎️ 스플리터', 600], bumper: ['🍡 말랑 범퍼', 500] } },
  back: { name: '뒤', icon: '💨', parts: { muffler: ['💨 쌍 머플러', 600], stacks: ['🏭 크롬 굴뚝', 900], flaps: ['🟫 머드플랩', 400] } },
  deco: { name: '무늬', icon: '✨', parts: { stripes: ['〰️ 레이싱 줄무늬', 600], flames: ['🔥 불꽃 무늬', 800], goldline: ['✨ 금 허리선', 900], dots: ['⚪ 물방울 스티커', 400], bolts: ['⚡ 번개 스티커', 500] } },
  wheel: { name: '휠', icon: '🛞', parts: { red: ['🔴 빨간 휠', 300], mint: ['🟢 민트 휠', 300], gold: ['🟡 금색 휠', 700], chrome: ['⚪ 크롬 휠', 500] } },
};
const WHEELS = { red: [0xff5a5f, 0xffd34d], mint: [0x7fe0c4, 0xfffaf0], gold: [0xf0b62a, 0xd9dde4], chrome: [0xd9dde4, 0x3a3f4a] };

// ---------------- 브랜드 차체 모양 · 투톤 · 엠블럼 ----------------
/**
 * 브랜드별 차체 변형 (움직이지 않는 차체 정점만, 바퀴·작업기·좌석은 그대로)
 * hood: 앞쪽(앞 35%) 길이 배율 · roof: 지붕 높이 배율(위쪽 30%만) · wide: 바퀴 위 부분 폭 배율
 */
export function morphBody(v, shape) {
  const meshes = staticBody(v);
  const g0 = v.group;
  const saved = { p: g0.position.clone(), r: g0.rotation.clone() };
  g0.position.set(0, 0, 0); g0.rotation.set(0, 0, 0);
  g0.updateMatrixWorld(true);
  // 원래 모양 기준 크기 (한 번만 재 둔다)
  if (!v.bodyBox) { v.bodyBox = new THREE.Box3(); for (const m of meshes) { restore(m); if (m.material.vertexColors) v.bodyBox.expandByObject(m); } }
  const bx = v.bodyBox, H = bx.max.y - bx.min.y, D = bx.max.z - bx.min.z;
  const wheelTop = Math.max(0.3, ...wheelsOf(v).map((x) => x.w.steer.position.y + x.r));
  const zH = bx.max.z - D * 0.35, yR = bx.min.y + H * 0.7;
  const hood = shape?.hood ?? 1, roof = shape?.roof ?? 1, wide = shape?.wide ?? 1;
  const w = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    const orig = m.userData.origPos || (m.userData.origPos = Float32Array.from(pos.array));
    const M = m.matrixWorld;
    inv.copy(M).invert();
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      w.set(orig[i], orig[i + 1], orig[i + 2]).applyMatrix4(M);
      if (w.z > zH) w.z = zH + (w.z - zH) * hood;
      if (w.y > yR) w.y = yR + (w.y - yR) * roof;
      if (w.y > wheelTop) w.x *= 1 + (wide - 1) * Math.min(1, (w.y - wheelTop) / 0.3);
      w.applyMatrix4(inv);
      arr[i] = w.x; arr[i + 1] = w.y; arr[i + 2] = w.z;
    }
    pos.needsUpdate = true;
    m.geometry.computeBoundingSphere();
    m.geometry.computeBoundingBox();
  }
  g0.position.copy(saved.p); g0.rotation.copy(saved.r);
  g0.updateMatrixWorld(true);
  v.anchors = null;   // 모양이 바뀌었으니 파츠 자리 다시 찾기
}
function restore(m) {
  const o = m.userData.origPos;
  if (o) { m.geometry.attributes.position.array.set(o); m.geometry.attributes.position.needsUpdate = true; }
}
/** 움직이지 않는 차체 메시 (합쳐진 정적 부품, 움직이는 작업기 제외) */
function staticBody(v) {
  if (v.bodyMeshes) return v.bodyMeshes;
  const g = v.group, moving = movingSet(v);
  const isMoving = (o) => { for (let p = o; p && p !== g; p = p.parent) if (moving.has(p)) return true; return false; };
  // 칠한 차체뿐 아니라 유리·램프처럼 따로 남은 정적 메시도 함께 (안 그러면 창문만 튀어나온다)
  v.bodyMeshes = (v.paintMeshes || []).filter((m) => !isMoving(m));
  for (const m of v.bodyMeshes) {
    // 합쳐지지 않은 메시는 도형을 다른 차와 함께 쓸 수 있으니, 바꾸기 전에 이 차 전용으로 복사
    if (!m.material.vertexColors && !m.userData.ownGeo) { m.geometry = m.geometry.clone(); m.userData.ownGeo = true; }
  }
  return v.bodyMeshes;
}

/** 투톤: 차체 아래쪽(높이 low 이하)의 '도색 정점'을 브랜드 색으로. paintOf(i) = 그 정점이 도색 계열인지 */
export function livery(v, m, i, out, two) {
  if (!two || !v.bodyBox) return;
  const pos = m.geometry.attributes.position.array;
  const bx = v.bodyBox;
  // 정적 차체는 부모가 차체 원점이라 정점 y가 곧 모델 높이
  const y = pos[i + 1] + (m.position?.y || 0);
  if (y < bx.min.y + (bx.max.y - bx.min.y) * two.below) out.setHex(two.color);
}

/** 브랜드 엠블럼 (앞면 위쪽) */
const BADGES = {
  popo(k) { const p = mat(0xffb3c8); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(k, sphere(0.055, 8, 6), p, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0, 0, 0, 0, 1, 1, 0.4); } part(k, sphere(0.045, 8, 6), mat(0xffd34d), 0, 0, 0.01, 0, 0, 0, 1, 1, 0.5); },
  volt(k) { part(k, cyl(0.12, 0.12, 0.03, 16), C.dark(), 0, 0, 0, Math.PI / 2, 0, 0); const y = C.yellow(); part(k, box(0.04, 0.12, 0.03), y, 0.02, 0.04, 0.02, 0, 0, 0.5); part(k, box(0.04, 0.12, 0.03), y, -0.02, -0.04, 0.02, 0, 0, 0.5); },
  titan(k) { const G = C.gold(); part(k, box(0.28, 0.07, 0.04), G, 0, 0, 0); for (const x of [-0.11, 0, 0.11]) part(k, cone(0.045, 0.14, 4), G, x, 0.1, 0); for (const x of [-0.11, 0, 0.11]) part(k, sphere(0.025, 6, 4), mat(0xff6b9c), x, 0.18, 0); },
};

// ---------------- 붙이기 / 떼기 ----------------
export function clearKit(v) {
  for (const k of v.kitParts || []) k.parent?.remove(k);
  v.kitParts = [];
  v.kitBob = null;
}

/**
 * 외형 다시 붙이기: 브랜드 엠블럼 + 자리별 커스텀 파츠 + 휠. 부품은 붙은 자리별로 합쳐 그리기 호출을 줄인다
 * custom = { roof, front, back, deco, wheel } (각각 파츠 id 또는 null)
 */
export function applyKit(v, custom = {}, badge = null) {
  clearKit(v);
  if ((v.def.air || v.def.push)) return;
  const a = analyze(v);
  const parts = [];
  const add = (k) => { parts.push(k); return k; };
  for (const slot of ['roof', 'front', 'back', 'deco']) {
    const id = custom[slot];
    if (id && B[id]) B[id](v, a, add);
  }
  if (badge && BADGES[badge] && a.front) {
    const k = add(at(v, a.front, 0, Math.min(0.32, a.H * 0.16), 0.035));
    BADGES[badge](k);
  }
  const wc = WHEELS[custom.wheel];
  if (wc) for (const x of wheelsOf(v)) {
    const k = group(x.w.spin, x.side * (x.width / 2 + 0.015), 0, 0);
    k.userData.kit = true;
    parts.push(k);
    part(k, cyl(x.r * 0.5, x.r * 0.5, 0.03, 16), mat(wc[0]), 0, 0, 0, 0, 0, Math.PI / 2);
    part(k, cyl(x.r * 0.18, x.r * 0.18, 0.05, 10), mat(wc[1]), x.side * 0.015, 0, 0, 0, 0, Math.PI / 2);
  }
  for (const k of parts) mergeStatic(k, {});
  v.kitParts = parts;
}

/** 키트 움직임 (안테나 방울 흔들기) */
export function animateKit(v, t) {
  if (v.kitBob) v.kitBob.position.x = Math.sin(t * 7 + v.id) * 0.05 * (0.3 + Math.min(1, Math.abs(v.speed) / 5));
}
