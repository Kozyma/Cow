// 자동 운전용 격자 A* 경로 탐색
import { G, LAYOUT } from './state.js';
import { distToCollider } from './physics.js';

const N = 468;          // 셀 개수 (한 변)
const ORIGIN = -234;
const CELL = 1;
let blocked = null;
let zone = null;         // 칸 비용 배수 (축사 안은 비싸게: 볼일 없는 차가 축사를 지름길로 쓰지 않게)
let clr = null;          // 칸마다 가장 가까운 장애물(충돌체·농장 경계)까지 거리(m), 최대 CLR_MAX
const CLR_MAX = 6;
let INFLATE = 1.75;      // 이보다 가까운 칸은 아예 못 지나감 (예전과 같은 기준 → 갈 수 있는 곳은 그대로)

const cx = (x) => Math.max(0, Math.min(N - 1, Math.floor((x - ORIGIN) / CELL)));
const wx = (i) => ORIGIN + (i + 0.5) * CELL;

export function buildGrid(inflate = 1.75) {
  INFLATE = inflate;
  blocked = new Uint8Array(N * N);
  clr = new Float32Array(N * N);
  zone = new Float32Array(N * N).fill(1);
  // 건초 보관소 · 출하장 · 배합장 마당은 볼일 있는 차만 (지나가는 차가 건초 더미·기둥 사이로 가로지르지 않게)
  const areas = [
    { x: LAYOUT.yard.x, z: LAYOUT.yard.z, hw: 4.8, hd: 3.8 },
    { x: LAYOUT.dock.x, z: LAYOUT.dock.z, hw: LAYOUT.dock.w / 2 + 0.5, hd: LAYOUT.dock.d / 2 + 0.5 },
    { x: LAYOUT.station.x, z: LAYOUT.station.z, hw: LAYOUT.station.w / 2 + 0.5, hd: LAYOUT.station.d / 2 + 0.5 },
  ];
  for (const r of areas) for (let iz = cx(r.z - r.hd); iz <= cx(r.z + r.hd); iz++) for (let ix = cx(r.x - r.hw); ix <= cx(r.x + r.hw); ix++) zone[iz * N + ix] = 3;
  for (const b of G.barns || []) {
    for (let iz = cx(b.back); iz <= cx(b.front); iz++) for (let ix = cx(b.minX); ix <= cx(b.maxX); ix++) zone[iz * N + ix] = 3;
    // 퇴비사 안도 지름길로 쓰지 않게
    const sh = b.shed;
    if (sh) for (let iz = cx(sh.back); iz <= cx(sh.front); iz++) for (let ix = cx(sh.x - sh.w / 2); ix <= cx(sh.x + sh.w / 2); ix++) zone[iz * N + ix] = 4;
  }
  const B = LAYOUT.bound;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = wx(ix), z = wx(iz);
    clr[iz * N + ix] = Math.max(0, Math.min(CLR_MAX, B - Math.abs(x), B - Math.abs(z)));
  }
  // 충돌체마다 주변 셀만 검사 (빠름)
  for (const c of G.colliders) {
    const R = CLR_MAX;
    const minX = (c.type === 'box' ? c.minX : c.x - c.r) - R, maxX = (c.type === 'box' ? c.maxX : c.x + c.r) + R;
    const minZ = (c.type === 'box' ? c.minZ : c.z - c.r) - R, maxZ = (c.type === 'box' ? c.maxZ : c.z + c.r) + R;
    for (let iz = cx(minZ); iz <= cx(maxZ); iz++) for (let ix = cx(minX); ix <= cx(maxX); ix++) {
      const i = iz * N + ix;
      // 가로등·기둥처럼 가는 기둥은 0.9m 더 크게 봐서 차가 넉넉히 비켜 가게 (나무는 그대로)
      const d = distToCollider(c, wx(ix), wx(iz)) - (c.type === 'circle' && c.r < 0.4 && !c.owner?.nature ? 0.9 : 0);
      if (d < clr[i]) clr[i] = Math.max(0, d);
    }
  }
  for (let i = 0; i < N * N; i++) if (clr[i] < inflate) blocked[i] = 1;
}

/** 그 자리에서 가장 가까운 장애물까지 거리(m, 최대 6) — 자동 운전 앞 감지용 */
export function clearanceAt(x, z) {
  return clr ? clr[cx(z) * N + cx(x)] : CLR_MAX;
}

/** need: 이만큼 여유가 있어야 '비어 있음' (기본은 예전 기준) */
export function isFree(x, z, need = INFLATE) {
  return clr ? clr[cx(z) * N + cx(x)] >= need : true;
}

/** zoned: 축사·건초 보관소 같은 '볼일 있을 때만' 구역을 지나가면 막힌 것으로 본다 (출발·도착 4m 안은 괜찮음) */
export function lineClear(ax, az, bx, bz, need = INFLATE, zoned = false) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (!isFree(x, z, need)) return false;
    if (zoned && zone && t * d > 4 && (1 - t) * d > 4 && zone[cx(z) * N + cx(x)] > 1) return false;
  }
  return true;
}

/** (x,z)에서 가장 가까운, 차체 여유(need)가 있는 빈 자리 — 끼임 감시 장치가 마지막 수단으로 쓴다 */
export function nearestOpenSpot(x, z, need = INFLATE) {
  if (!clr) return null;
  const ix0 = cx(x), iz0 = cx(z);
  for (let r = 1; r < 25; r++) {
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = ix0 + dx, iz = iz0 + dz;
      if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
      const j = iz * N + ix;
      if (clr[j] >= need && zone[j] <= 1) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { x: wx(ix), z: wx(iz) }; } }
    }
    if (best) return best;
  }
  return null;
}

function nearestFree(idx) {
  if (!blocked[idx]) return idx;
  const ix0 = idx % N, iz0 = Math.floor(idx / N);
  for (let r = 1; r < 14; r++) {
    let best = -1, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = ix0 + dx, iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const j = iz * N + ix;
        if (!blocked[j]) {
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = j; }
        }
      }
    }
    if (best >= 0) return best;
  }
  return idx;
}

// 간단한 이진 힙
class Heap {
  constructor() { this.a = []; }
  push(f, v) {
    const a = this.a; a.push([f, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

const gScore = new Float32Array(N * N);
const parent = new Int32Array(N * N);
const stamp = new Uint32Array(N * N);
const closed = new Uint32Array(N * N);
let run = 0;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

/** (sx,sz)→(tx,tz) 경로. 시작점은 제외한 웨이포인트 배열을 반환 */
/**
 * @param need 차체 크기에 맞춘 "편한" 여유 거리. 이보다 장애물에 가까운 칸은 비용을 더 매겨 길 가운데로 다니게 한다
 */
export function findPath(sx, sz, tx, tz, need = INFLATE) {
  const comfort = need + 1.2;
  if (!blocked) return null;
  run++;
  const s = nearestFree(cx(sz) * N + cx(sx));
  const goalRaw = cx(tz) * N + cx(tx);
  const goalBlocked = !!blocked[goalRaw];
  const t = nearestFree(goalRaw);
  const tix = t % N, tiz = Math.floor(t / N);
  const h = (i) => {
    const dx = Math.abs((i % N) - tix), dz = Math.abs(Math.floor(i / N) - tiz);
    return dx + dz + (1.414 - 2) * Math.min(dx, dz);
  };
  const open = new Heap();
  stamp[s] = run; gScore[s] = 0; parent[s] = -1;
  open.push(h(s), s);
  let found = false, iter = 0;
  while (open.size && iter++ < 260000) {
    const cur = open.pop();
    if (closed[cur] === run) continue;
    closed[cur] = run;
    if (cur === t) { found = true; break; }
    const ix = cur % N, iz = Math.floor(cur / N);
    for (const [dx, dz, c] of DIRS) {
      const nx = ix + dx, nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const ni = nz * N + nx;
      if (blocked[ni] || closed[ni] === run) continue;
      if (dx && dz && (blocked[iz * N + nx] || blocked[nz * N + ix])) continue; // 모서리 끼임 방지
      const cl = clr[ni];
      const ng = gScore[cur] + c * zone[ni] * (1 + (cl < comfort ? (comfort - cl) * 1.6 : 0));
      if (stamp[ni] !== run || ng < gScore[ni]) {
        stamp[ni] = run; gScore[ni] = ng; parent[ni] = cur;
        open.push(ng + h(ni), ni);
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = t; i !== -1; i = parent[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ x: wx(i % N), z: wx(Math.floor(i / N)) }));
  pts[0] = { x: sx, z: sz };
  if (!goalBlocked) pts[pts.length - 1] = { x: tx, z: tz };
  // 문자열 당기기(string pulling)로 경로 단순화
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    // 차체 여유(need)를 지키는 직선만 잇는다. 마지막 칸(목적지)으로는 원래 기준으로 접근 허용
    while (j > i + 1 && !lineClear(pts[i].x, pts[i].z, pts[j].x, pts[j].z, j === pts.length - 1 ? Math.min(need, Math.max(INFLATE, clr[cells[i]] - 0.01)) : Math.min(need, Math.max(INFLATE, Math.min(clr[cells[i]], clr[cells[j]]) - 0.01)), true)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out.length ? out : [{ x: tx, z: tz }];
}
