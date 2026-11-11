import * as THREE from 'three';

// 동글동글 굴러가는 지평선(rolling world) 효과용 유니폼
export const curveUniforms = {
  uCurve: { value: 0.0016 },
  uCurveCenter: { value: new THREE.Vector2(0, 0) },
};

let gradient = null;
export function gradientMap() {
  if (!gradient) {
    const data = new Uint8Array([120, 182, 228, 255]);
    gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 cwp = modelMatrix * mvPosition;
vec2 cdl = cwp.xz - uCurveCenter;
cwp.y -= dot(cdl, cdl) * uCurve;
mvPosition = viewMatrix * cwp;
gl_Position = projectionMatrix * mvPosition;
`;

/** 재질에 곡면 월드 셰이더 패치 적용 */
export function curved(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurve = curveUniforms.uCurve;
    shader.uniforms.uCurveCenter = curveUniforms.uCurveCenter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform vec2 uCurveCenter;')
      .replace('#include <project_vertex>', PROJECT);
  };
  material.customProgramCacheKey = () => 'curved-v1';
  return material;
}

/** 곡면 처리된 화면 좌표 계산 (DOM 라벨용) */
export function bendY(x, y, z) {
  const c = curveUniforms.uCurveCenter.value;
  const dx = x - c.x, dz = z - c.y;
  return y - (dx * dx + dz * dz) * curveUniforms.uCurve.value;
}

const cache = new Map();
/** 공유 툰 재질 */
export function mat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = cache.get(key);
  if (!m) {
    m = curved(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts }));
    cache.set(key, m);
    if (!Object.keys(opts).length) m.userData.plain = true;   // 색만 다른 기본 재질 → 정점 색으로 합칠 수 있음
  }
  return m;
}

/** 최적화용: 정점 색(색깔별 재질 대신)을 쓰는 공유 툰 재질 */
const vcCache = new Map();
export function vcMat(side = THREE.FrontSide) {
  let m = vcCache.get(side);
  if (!m) {
    m = curved(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(), side }));
    vcCache.set(side, m);
  }
  return m;
}

/** 밤에 빛나는 재질 (창문, 램프, 헤드라이트) */
export const glowMats = [];
const glowCache = new Map();
export function glow(color, base = 0.15) {
  const key = color + '|' + base;
  if (glowCache.has(key)) return glowCache.get(key);
  const m = curved(new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: base, gradientMap: gradientMap() }));
  m.userData.base = base;
  glowMats.push(m);
  glowCache.set(key, m);
  return m;
}

export function basic(color, opts = {}) {
  return curved(new THREE.MeshBasicMaterial({ color, ...opts }));
}
