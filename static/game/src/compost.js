// 축사별 퇴비사: 분뇨 저장 → 발효 → 퇴비 → 트럭에 실어 판매
import * as THREE from 'three';
import { G, COMPOST } from './state.js';
import { mat, glow } from './materials.js';
import { part, group, sbox, box, sphere, cyl, rand, pick } from './util.js';
import { addBox } from './physics.js';
import { spawn, burst } from './particles.js';
import { zoneRing } from './buildings.js';

export class Shed {
  constructor(barn, scene) {
    this.barn = barn;
    this.name = barn.name.replace(/ (축사|계사)$/, '') + ' 퇴비사';
    this.x = barn.cx;
    this.front = barn.back - 12;           // 축사 쪽으로 열린 면
    this.back = this.front - 7;
    this.w = 12;
    this.z = (this.front + this.back) / 2;
    this.raw = 0;
    this.compost = 0;
    this.steamT = rand(0, 1);
    this.rawPos = { x: this.x - 2.9, z: this.front - 3.0 };
    this.compostPos = { x: this.x + 2.9, z: this.front - 3.0 };
    this.loadPos = { x: this.x + 2.9, z: this.front + 6.0 };
    this.build(scene);
  }

  build(scene) {
    const { x, front, back, w } = this;
    const z = this.z, d = front - back;
    const g = group(scene);
    const wood = mat(0xc99561), woodD = mat(0xa8743f), roof = mat(this.barn.def.roof), conc = mat(0xd9d4c7);
    const floor = new THREE.PlaneGeometry(w, d + 6, 4, 4);
    floor.rotateX(-Math.PI / 2);
    const fm = new THREE.Mesh(floor, conc);
    fm.position.set(x, 0.04, z + 3);
    fm.receiveShadow = true;
    g.add(fm);
    // 벽: 뒤 + 양옆 + 가운데 칸막이(반만)
    part(g, sbox(w + 0.3, 1.6, 0.3), wood, x, 0.8, back);
    for (const s of [-1, 1]) part(g, sbox(0.3, 1.6, d), wood, x + (s * w) / 2, 0.8, z);
    part(g, sbox(0.25, 1.1, d * 0.55), woodD, x, 0.55, back + (d * 0.55) / 2);
    for (let i = 0; i < 4; i++) part(g, sbox(w + 0.32, 0.06, 0.34), woodD, x, 0.3 + i * 0.4, back);
    addBox(x - w / 2 - 0.2, x + w / 2 + 0.2, back - 0.2, back + 0.2);
    for (const s of [-1, 1]) addBox(x + (s * w) / 2 - 0.2, x + (s * w) / 2 + 0.2, back, front);
    addBox(x - 0.15, x + 0.15, back, back + d * 0.55);
    // 기둥 + 경사 지붕
    for (const s of [-1, 1]) for (const zz of [back, front]) part(g, cyl(0.15, 0.15, 4.2, 8), woodD, x + (s * w) / 2, 2.1, zz);
    part(g, sbox(w + 1.2, 0.2, d + 1.6), roof, x, 4.35, z, -0.12, 0, 0);
    part(g, sbox(w + 1.25, 0.24, 0.3), mat(this.barn.def.trim), x, 4.1, front + 0.8, -0.12, 0, 0);
    // 간판
    part(g, sbox(3.2, 0.9, 0.12), mat(0xfff3dc), x, 3.4, front + 0.6);
    part(g, sphere(0.25, 10, 8), mat(0x8fd16a), x - 1.2, 3.4, front + 0.7, 0, 0, 0, 1, 1, 0.4);
    // 더미
    this.rawPile = group(g, this.rawPos.x, 0.05, this.rawPos.z - 0.4);
    for (const [px, pz, s] of [[0, 0, 1.4], [1.0, 0.6, 1.0], [-1.0, -0.3, 1.1], [0.3, -1.1, 0.9], [-0.6, 0.9, 0.8]]) {
      part(this.rawPile, sphere(1, 12, 8), mat(pick([0x8b6a4f, 0x7d5d44, 0x96755a])), px, 0, pz, 0, 0, 0, s, s * 0.6, s);
    }
    for (let i = 0; i < 6; i++) part(this.rawPile, box(0.3, 0.03, 0.05), mat(0xf4d36b), rand(-1, 1), rand(0.4, 0.7), rand(-1, 1), 0, rand(0, 3), 0);
    this.compostPile = group(g, this.compostPos.x, 0.05, this.compostPos.z - 0.4);
    for (const [px, pz, s] of [[0, 0, 1.5], [-1.0, 0.5, 1.0], [1.0, -0.4, 1.1], [0.2, 1.0, 0.85], [-0.5, -1.0, 0.9]]) {
      part(this.compostPile, sphere(1, 12, 8), mat(pick([0x5a4130, 0x4e3828, 0x634836])), px, 0, pz, 0, 0, 0, s, s * 0.6, s);
    }
    for (let i = 0; i < 5; i++) part(this.compostPile, sphere(0.12, 6, 4), mat(0x8fd16a), rand(-1, 1), rand(0.6, 0.85), rand(-0.8, 0.8), 0, 0, 0, 1, 0.5, 1);
    zoneRing(scene, this.loadPos.x, this.loadPos.z, 2.6, 0x8a6a4f);
    this.updateVisuals();
  }

  /** 퇴비사 안인지, 어느 칸인지 */
  zoneAt(px, pz, pad = 0) {
    if (px < this.x - this.w / 2 - pad || px > this.x + this.w / 2 + pad || pz < this.back - pad || pz > this.front + pad) return null;
    return px < this.x ? 'raw' : 'compost';
  }

  addRaw(amount) {
    const add = Math.min(amount, COMPOST.cap - this.raw);
    this.raw += add;
    burst('muck', this.rawPos.x, 1.2, this.rawPos.z, 10, { vy: 3 });
    return add;
  }

  update(h, dt) {
    const amt = Math.min(this.raw, COMPOST.rate * h, COMPOST.cap - this.compost);
    const fermenting = amt > 0;
    this.raw -= amt;
    this.compost += amt;
    this.fermenting = fermenting;
    if (fermenting) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.5;
        spawn('smoke', this.rawPos.x + rand(-1, 1), 0.8 + this.raw / COMPOST.cap * 1.2, this.rawPos.z + rand(-1, 0.5), { vy: 0.8, life: 2.0, size: 0.9 });
      }
    }
    this.visT = (this.visT ?? 0) - dt;
    if (this.visT <= 0) { this.visT = 0.25; this.updateVisuals(); }
  }

  updateVisuals() {
    const r = this.raw / COMPOST.cap, c = this.compost / COMPOST.cap;
    this.rawPile.visible = r > 0.01;
    this.rawPile.scale.set(0.45 + r * 0.75, 0.25 + r * 1.2, 0.45 + r * 0.7);
    this.compostPile.visible = c > 0.01;
    this.compostPile.scale.set(0.45 + c * 0.75, 0.25 + c * 1.2, 0.45 + c * 0.7);
  }
}


export function shedAt(x, z, pad = 0) {
  for (const b of G.barns) {
    const zone = b.shed?.zoneAt(x, z, pad);
    if (zone) return { shed: b.shed, zone };
  }
  return null;
}

export const allSheds = () => G.barns.map((b) => b.shed);
