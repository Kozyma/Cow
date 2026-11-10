import * as THREE from 'three';
import { G, LAYOUT } from './state.js';
import { makeFarmer, PLAYER_LOOK } from './models.js';
import { collideCircle } from './physics.js';
import { collideHouse, houseState } from './house.js';
import { damp, dampAngle } from './util.js';
import { spawn } from './particles.js';
import { sfx } from './audio.js';

export class Player {
  constructor(scene) {
    this.m = makeFarmer(PLAYER_LOOK);
    this.group = this.m.group;
    scene.add(this.group);
    this.pos = new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z);
    this.heading = Math.PI;
    this.speed = 0;
    this.phase = 0;
    this.hopT = 0;
    this.stepT = 0;
    this.radius = 0.45;
    // 발밑 그림자 동그라미
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }));
    sh.position.y = 0.05;
    this.group.add(sh);
  }

  update(dt) {
    if (G.driving) { this.group.visible = false; return; }
    if (this.restT > 0) this.restT -= dt;
    if (G.mode === 'house' && houseState.piano) { this.speed = 0; return; }
    this.group.visible = !G.cam.fp || G.mode === 'house';
    const k = G.input;
    const ix = (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0) - (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0);
    const iz = (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0) - (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0);
    let mx = 0, mz = 0;
    if (ix || iz) {
      let fx, fz, rx, rz;
      if (G.cam.fp) {
        const a = G.cam.fpYaw;
        fx = Math.sin(a); fz = Math.cos(a); rx = -Math.cos(a); rz = Math.sin(a);
      } else {
        const yaw = G.cam.yaw;
        fx = -Math.sin(yaw); fz = -Math.cos(yaw); rx = Math.cos(yaw); rz = -Math.sin(yaw);
      }
      mx = fx * iz + rx * ix; mz = fz * iz + rz * ix;
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      G.viewTarget = null;
    }
    const run = k.down('ShiftLeft') || k.down('ShiftRight');
    const indoor = G.mode === 'house';
    const want = (mx || mz ? (run ? 7.8 : 5.0) : 0) * (indoor ? 0.6 : 1) * (this.restT > 0 ? 1.15 : 1);
    this.speed = damp(this.speed, want, 12, dt);
    if (G.cam.fp) this.heading = G.cam.fpYaw;
    else if (mx || mz) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 14, dt);
    if (mx || mz) this.moveDir = Math.atan2(mx, mz);
    const md = G.cam.fp ? (this.moveDir ?? this.heading) : this.heading;
    const fx = Math.sin(md), fz = Math.cos(md);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    if (indoor) collideHouse(this.pos, this.radius);
    else collideCircle(this.pos, this.radius, false);

    // 애니메이션
    const m = this.m;
    const amt = Math.min(1, this.speed / 5);
    this.phase += dt * (6 + this.speed * 1.6);
    const sw = Math.sin(this.phase) * amt;
    m.legs[0].rotation.x = sw * 0.8; m.legs[1].rotation.x = -sw * 0.8;
    m.arms[0].rotation.x = -sw * 0.7; m.arms[1].rotation.x = sw * 0.7;
    let y = Math.abs(Math.sin(this.phase)) * 0.09 * amt;
    if (this.hopT > 0) {
      this.hopT -= dt;
      y += Math.sin((1 - this.hopT / 0.45) * Math.PI) * 0.6;
    }
    m.root.position.y = y;
    m.head.rotation.z = Math.sin(this.phase * 0.5) * 0.05 * amt;
    m.root.rotation.x = amt * 0.08;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    // 발자국 먼지
    if (this.speed > 4.5) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.18; spawn('dust', this.pos.x - fx * 0.3, 0.1, this.pos.z - fz * 0.3, { vy: 0.5, life: 0.5, size: 0.45 }); }
    }
  }

  hop() {
    if (this.hopT > 0) return;
    this.hopT = 0.45;
    sfx('hop');
  }
}
