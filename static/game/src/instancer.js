import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** 나무, 꽃, 울타리처럼 많은 정적 오브젝트를 InstancedMesh로 묶어주는 도우미 */
export class Instancer {
  constructor() {
    this.groups = new Map();
  }
  add(key, geo, material, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff, shadow = true) {
    let g = this.groups.get(key);
    if (!g) {
      g = { geo, material, list: [], shadow };
      this.groups.set(key, g);
    }
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    g.list.push({ m: new THREE.Matrix4().compose(_p, _q, _s), c: new THREE.Color(color) });
  }
  build(scene) {
    this.built ||= [];
    for (const [key, g] of this.groups.entries()) {
      const im = new THREE.InstancedMesh(g.geo, g.material, g.list.length);
      g.list.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        im.setColorAt(i, it.c);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = g.shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
      this.built.push({ key, im, list: g.list });
    }
    this.groups.clear();
  }
}

export const INST = new Instancer();

const _pos = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
/** 새 건물이 놓인 자리의 풀·꽃·바위 장식을 숨긴다 */
export function clearDecorIn(rect, keys = ['tuft', 'stem', 'petal', 'fcenter', 'rock', 'bush', 'bflower']) {
  for (const b of INST.built || []) {
    if (!keys.includes(b.key)) continue;
    let changed = false;
    b.list.forEach((it, i) => {
      _pos.setFromMatrixPosition(it.m);
      if (_pos.x > rect.minX && _pos.x < rect.maxX && _pos.z > rect.minZ && _pos.z < rect.maxZ) {
        b.im.setMatrixAt(i, _zero);
        changed = true;
      }
    });
    if (changed) b.im.instanceMatrix.needsUpdate = true;
  }
}
