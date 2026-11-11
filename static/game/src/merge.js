// 최적화: 같은 부모 아래의 작은 메시들을 하나로 합쳐 그리기 호출(draw call)을 줄인다.
// - 색만 다른 기본 툰 재질(mat())은 색을 정점 색으로 구워서 한 메시로 합친다
// - 그 밖의 재질(빛나는 램프, 유리 등)은 같은 재질끼리만 합친다
// 움직이는 부품(다리·머리·바퀴·포크 등)은 부모 그룹 단위로 남겨 두므로 애니메이션은 그대로 동작한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vcMat } from './materials.js';

/** keep 안에 들어 있는 Object3D(모델이 돌려준 부품 참조)는 코드에서 직접 만지므로 합치지 않는다 */
function collectProtected(keep) {
  const set = new Set();
  const walk = (v, d) => {
    if (!v || d > 3) return;
    if (v.isObject3D) { set.add(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; }
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x, d + 1);
  };
  walk(keep, 0);
  return set;
}

function prepGeo(mesh, vc) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  // 툰 재질은 텍스처를 쓰지 않으므로 위치·법선(+정점 색)만 남긴다 (속성 구성을 맞춰야 합칠 수 있음)
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(mesh.matrix);
  if (vc) {
    const c = mesh.material.color, n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

/**
 * @param root 모델 최상위 그룹
 * @param keep 모델 생성 함수가 돌려준 객체 (그 안의 부품은 보호)
 * @returns 줄어든 메시 수
 */
export function mergeStatic(root, keep = null) {
  const protect = collectProtected(keep);
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  let saved = 0;
  for (const n of nodes) {
    const buckets = new Map();
    for (const c of n.children) {
      if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || protect.has(c)) continue;
      if (Array.isArray(c.material) || !c.visible || c.userData.noMerge) continue;
      c.updateMatrix();
      if (c.matrix.determinant() < 0) continue;   // 뒤집힌(음수 스케일) 메시는 면 방향이 바뀌므로 그대로 둔다
      const vc = !!c.material.userData.plain;
      const key = `${vc ? `vc${c.material.side}` : c.material.uuid}|${c.receiveShadow ? 1 : 0}|${c.renderOrder}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { vc, list: [] }));
      b.list.push(c);
    }
    for (const { vc, list } of buckets.values()) {
      if (list.length < 2) continue;
      let geo;
      try { geo = mergeGeometries(list.map((m) => prepGeo(m, vc)), false); } catch { geo = null; }
      if (!geo) continue;
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, vc ? vcMat(list[0].material.side) : list[0].material);
      m.castShadow = list.some((c) => c.castShadow);   // 작은 부품 그림자 여부로 나누면 호출이 두 배가 되므로 한 덩어리로
      m.receiveShadow = list[0].receiveShadow;
      m.renderOrder = list[0].renderOrder;
      for (const c of list) n.remove(c);
      n.add(m);
      saved += list.length - 1;
    }
  }
  return saved;
}
