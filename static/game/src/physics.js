import { G, LAYOUT } from './state.js';
import { clamp } from './util.js';

// 건물 이동을 위해 충돌체에 소유자를 붙여둔다
let OWNER = null;
export function setOwner(o) { OWNER = o; }
export function removeColliders(owner) {
  G.colliders = G.colliders.filter((c) => c.owner !== owner);
}

export function addBox(minX, maxX, minZ, maxZ, opts = {}) {
  G.colliders.push({ type: 'box', minX, maxX, minZ, maxZ, owner: OWNER, ...opts });
}
export function addBoxC(cx, cz, w, d, opts) {
  addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, opts);
}
export function addCircle(x, z, r, opts = {}) {
  G.colliders.push({ type: 'circle', x, z, r, owner: OWNER, ...opts });
}

/** 충돌체 표면까지의 거리 (내부면 음수) */
export function distToCollider(c, x, z) {
  if (c.type === 'box') {
    const dx = Math.max(c.minX - x, 0, x - c.maxX);
    const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
    if (dx === 0 && dz === 0) {
      return -Math.min(x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z);
    }
    return Math.hypot(dx, dz);
  }
  return Math.hypot(x - c.x, z - c.z) - c.r;
}

export function blockedAt(x, z, r, isVehicle = true) {
  for (const c of G.colliders) {
    if (c.vehicleOnly && !isVehicle) continue;
    if (distToCollider(c, x, z) < r) return true;
  }
  return Math.abs(x) > LAYOUT.bound - r || Math.abs(z) > LAYOUT.bound - r;
}

/** 원형 몸체를 충돌체 밖으로 밀어낸다. 충돌 여부 반환 */
export function collideCircle(pos, r, isVehicle) {
  let hit = false;
  for (const c of G.colliders) {
    if (c.vehicleOnly && !isVehicle) continue;
    if (c.type === 'box') {
      if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - r;
        else if (m === pr) pos.x = c.maxX + r;
        else if (m === pt) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    } else {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      hit = true;
      const d = Math.sqrt(d2) || 1e-4;
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
  const b = LAYOUT.bound;
  if (pos.x < -b + r) { pos.x = -b + r; hit = true; }
  if (pos.x > b - r) { pos.x = b - r; hit = true; }
  if (pos.z < -b + r) { pos.z = -b + r; hit = true; }
  if (pos.z > b - r) { pos.z = b - r; hit = true; }
  return hit;
}

/** 사각 영역과 겹치는 충돌체가 있는지 (ignore 소유자 제외) */
export function rectBlocked(rect, ignore = null, pad = 0.3) {
  for (const c of G.colliders) {
    if (ignore && c.owner === ignore) continue;
    if (c.type === 'box') {
      if (c.maxX > rect.minX - pad && c.minX < rect.maxX + pad && c.maxZ > rect.minZ - pad && c.minZ < rect.maxZ + pad) return c;
    } else {
      const cx = clamp(c.x, rect.minX, rect.maxX), cz = clamp(c.z, rect.minZ, rect.maxZ);
      if (Math.hypot(c.x - cx, c.z - cz) < c.r + pad) return c;
    }
  }
  return null;
}
