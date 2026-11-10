// 가벼운 파티클 (투명도 대신 크기로 나타났다 사라짐)
import * as THREE from 'three';
import { G } from './state.js';
import { mat } from './materials.js';
import { sphere, box, cyl, octa, rand, easeOutBack } from './util.js';
import { makeHeartGeo } from './models.js';

let heartGeo = null;
const TYPES = {
  smoke: { geo: () => sphere(0.3, 8, 6), mat: () => mat(0xeeeaf3) },
  dust: { geo: () => sphere(0.3, 8, 6), mat: () => mat(0xead9b0) },
  puff: { geo: () => sphere(0.3, 8, 6), mat: () => mat(0xffffff) },
  clip: { geo: () => box(0.1, 0.04, 0.24), mat: () => mat(0x8fd16a) },
  hay: { geo: () => box(0.08, 0.04, 0.26), mat: () => mat(0xf4d36b) },
  heart: { geo: () => (heartGeo ||= makeHeartGeo()), mat: () => mat(0xff6f91) },
  drop: { geo: () => sphere(0.12, 8, 6), mat: () => mat(0x7cc6ff) },
  coin: { geo: () => cyl(0.24, 0.24, 0.06, 16), mat: () => mat(0xffd34d, { emissive: 0x6b4a00, emissiveIntensity: 0.3 }) },
  star: { geo: () => octa(0.2), mat: () => mat(0xfff1a1, { emissive: 0xffd34d, emissiveIntensity: 0.4 }) },
  muck: { geo: () => sphere(0.12, 6, 4), mat: () => mat(0x7d5d44) },
};

const pools = {};
const live = [];

export function spawn(type, x, y, z, o = {}) {
  const pool = (pools[type] ||= []);
  let p = pool.pop();
  if (!p) {
    const t = TYPES[type];
    const mesh = new THREE.Mesh(t.geo(), t.mat());
    mesh.castShadow = false;
    p = { mesh, vel: new THREE.Vector3(), type };
  }
  p.life = 0;
  p.max = o.life ?? 1;
  p.mesh.position.set(x, y, z);
  p.vel.set(o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
  p.grav = o.grav ?? 0;
  p.size = o.size ?? 1;
  p.spin = o.spin ?? 0;
  p.mode = o.mode ?? (type === 'heart' || type === 'drop' ? 'pop' : type === 'clip' || type === 'hay' || type === 'muck' || type === 'star' ? 'bit' : type === 'coin' ? 'coin' : 'puff');
  p.mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  if (p.mode === 'coin') p.mesh.rotation.set(Math.PI / 2, 0, 0);
  p.mesh.scale.setScalar(0.001);
  G.scene.add(p.mesh);
  live.push(p);
  return p;
}

export function burst(type, x, y, z, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(o.minSpeed ?? 1.5, o.maxSpeed ?? 3.5);
    spawn(type, x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2), {
      vx: Math.cos(a) * s * (o.spread ?? 0.6), vz: Math.sin(a) * s * (o.spread ?? 0.6), vy: o.vy ?? rand(2.5, 4.5),
      grav: o.grav ?? 9, life: o.life ?? rand(0.6, 1.0), size: o.size ?? rand(0.8, 1.3), spin: rand(-10, 10),
    });
  }
}

export function updateParticles(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.life += dt;
    const t = p.life / p.max;
    if (t >= 1) {
      G.scene.remove(p.mesh);
      pools[p.type].push(p);
      live.splice(i, 1);
      continue;
    }
    p.vel.y -= p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05 && p.grav > 0) { p.mesh.position.y = 0.05; p.vel.multiplyScalar(0.5); }
    let s;
    if (p.mode === 'puff') {
      s = p.size * Math.pow(Math.sin(t * Math.PI), 0.6) * (0.6 + t * 0.8);
    } else if (p.mode === 'pop') {
      s = p.size * (t < 0.2 ? easeOutBack(t / 0.2) : t > 0.75 ? (1 - t) / 0.25 : 1);
      p.mesh.quaternion.copy(G.camera.quaternion);
    } else if (p.mode === 'coin') {
      s = p.size * (t < 0.15 ? easeOutBack(t / 0.15) : t > 0.8 ? (1 - t) / 0.2 : 1);
      p.mesh.rotation.z += dt * 9;
    } else {
      s = p.size * (1 - t * t * t);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * 0.7 * dt;
    }
    p.mesh.scale.setScalar(Math.max(0.001, s));
  }
}

export function emote(type, x, y, z) {
  spawn(type, x, y, z, { vy: 0.9, life: 1.5, size: type === 'heart' ? 1 : 0.9 });
}
