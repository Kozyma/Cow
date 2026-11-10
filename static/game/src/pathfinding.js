// 자동 운전용 격자 A* 경로 탐색
import { G, LAYOUT } from './state.js';
import { distToCollider } from './physics.js';

const N = 228;          // 셀 개수 (한 변)
const ORIGIN = -114;
const CELL = 1;
let blocked = null;

const cx = (x) => Math.max(0, Math.min(N - 1, Math.floor((x - ORIGIN) / CELL)));
const wx = (i) => ORIGIN + (i + 0.5) * CELL;

export function buildGrid(inflate = 1.75) {
  blocked = new Uint8Array(N * N);
  const b = LAYOUT.bound - inflate;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = wx(ix), z = wx(iz);
    if (Math.abs(x) > b || Math.abs(z) > b) blocked[iz * N + ix] = 1;
  }
  // 충돌체마다 주변 셀만 검사 (빠름)
  for (const c of G.colliders) {
    const minX = (c.type === 'box' ? c.minX : c.x - c.r) - inflate, maxX = (c.type === 'box' ? c.maxX : c.x + c.r) + inflate;
    const minZ = (c.type === 'box' ? c.minZ : c.z - c.r) - inflate, maxZ = (c.type === 'box' ? c.maxZ : c.z + c.r) + inflate;
    for (let iz = cx(minZ); iz <= cx(maxZ); iz++) for (let ix = cx(minX); ix <= cx(maxX); ix++) {
      const i = iz * N + ix;
      if (blocked[i]) continue;
      if (distToCollider(c, wx(ix), wx(iz)) < inflate) blocked[i] = 1;
    }
  }
}

export function isFree(x, z) {
  return !blocked[cx(z) * N + cx(x)];
}

export function lineClear(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
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
export function findPath(sx, sz, tx, tz) {
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
  while (open.size && iter++ < 70000) {
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
      const ng = gScore[cur] + c;
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
    while (j > i + 1 && !lineClear(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out.length ? out : [{ x: tx, z: tz }];
}
