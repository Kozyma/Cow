import * as THREE from 'three';
import { G, LAYOUT } from './state.js';
import { makeFarmer, PLAYER_LOOK } from './models.js';
import { collideCircle } from './physics.js';
import { collideHouse, houseState } from './house.js';
import { damp, dampAngle } from './util.js';
import { spawn } from './particles.js';
import { sfx } from './audio.js';
import { initTools, TOOLS } from './handwork.js';
import { makeShovel, makeSickle, makeArmful } from './models.js';

/** 원격 플레이어의 키 입력 (네트워크로 받은 값) */
export class NetInput {
  constructor() { this.keys = new Set(); this.just = new Set(); this.axis = { x: 0, y: 0, active: false }; }
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.just.has(code); }
  endFrame() { this.just.clear(); }
}

export class Player {
  /**
   * @param look  옷 색 (PLAYER_LOOK 형식)
   * @param remote true면 다른 사람이 조종하는 플레이어 (호스트가 계산)
   */
  constructor(scene, look = PLAYER_LOOK, remote = false) {
    this.m = makeFarmer(look);
    this.look = look;
    this.group = this.m.group;
    scene.add(this.group);
    this.pos = new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z);
    this.heading = Math.PI;
    this.speed = 0;
    this.phase = 0;
    this.hopT = 0;
    this.stepT = 0;
    this.radius = 0.45;
    this.remote = remote;
    this.isPlayer = true;
    initTools(this);
    this.input = remote ? new NetInput() : G.input;
    this.cam = { fp: false, yaw: 0, fpYaw: 0 };   // 원격 플레이어의 카메라 방향 (이동 기준)
    this.driving = null;                           // 원격 플레이어가 탄 차량
    this.riding = null;                            // 원격 플레이어가 동승한 비행기·헬기
    // 발밑 그림자 동그라미
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }));
    sh.position.y = 0.05;
    this.group.add(sh);
  }

  get isDriving() { return this.remote ? !!this.driving : !!G.driving; }
  get ridingVehicle() { return this.remote ? this.riding : G.riding; }

  update(dt) {
    if (this.isDriving) { this.group.visible = false; return; }
    // 옆자리 동승 중: 몸은 숨기고 탈것을 따라간다
    const ride = this.ridingVehicle;
    if (ride) { this.group.visible = false; this.pos.set(ride.pos.x, 0, ride.pos.z); this.heading = ride.heading; return; }
    const remote = this.remote;
    const cam = remote ? this.cam : G.cam;
    const mode = remote ? (this.inHouse ? 'house' : 'farm') : G.mode;   // 집에 놀러 온 친구는 집 안 규칙대로
    if (this.restT > 0) this.restT -= dt;
    if (!remote && G.mode === 'house' && houseState.piano) { this.speed = 0; return; }
    // 다른 사람은 항상 보이고, 나는 1인칭이면 숨김
    this.group.visible = remote || !G.cam.fp || G.mode === 'house';
    const k = this.input;
    let ix = (k.down('KeyD') || k.down('ArrowRight') ? 1 : 0) - (k.down('KeyA') || k.down('ArrowLeft') ? 1 : 0);
    let iz = (k.down('KeyW') || k.down('ArrowUp') ? 1 : 0) - (k.down('KeyS') || k.down('ArrowDown') ? 1 : 0);
    // 모바일 조이스틱: 8방향 대신 기울인 방향 그대로, 살짝 밀면 천천히
    let mag = 1;
    if (!remote && (G.mode === 'build' || k.blocked)) { ix = 0; iz = 0; }   // 배치 중 WASD는 화면 이동용
    else if (k.axis?.active) {
      ix = k.axis.x; iz = -k.axis.y;
      mag = Math.min(1, Math.hypot(ix, iz));
      if (mag < 0.01) { ix = 0; iz = 0; } else mag = Math.max(0.35, mag);
    }
    let mx = 0, mz = 0;
    if (ix || iz) {
      let fx, fz, rx, rz;
      if (cam.fp) {
        const a = cam.fpYaw;
        fx = Math.sin(a); fz = Math.cos(a); rx = -Math.cos(a); rz = Math.sin(a);
      } else {
        // 집 안 카메라는 항상 정면(yaw 0)이므로 이동 기준도 그에 맞춤
        const yaw = mode === 'house' ? 0 : cam.yaw;
        fx = -Math.sin(yaw); fz = -Math.cos(yaw); rx = Math.cos(yaw); rz = -Math.sin(yaw);
      }
      mx = fx * iz + rx * ix; mz = fz * iz + rz * ix;
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      if (!remote) G.viewTarget = null;
    }
    const run = k.down('ShiftLeft') || k.down('ShiftRight');
    const indoor = mode === 'house';
    const want = (mx || mz ? (run ? 7.8 : 5.0) * mag : 0) * (indoor ? 0.6 : 1) * (this.restT > 0 ? 1.15 : 1);
    this.speed = damp(this.speed, want, 12, dt);
    if (cam.fp) this.heading = cam.fpYaw;
    else if (mx || mz) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 14, dt);
    if (mx || mz) this.moveDir = Math.atan2(mx, mz);
    const md = cam.fp ? (this.moveDir ?? this.heading) : this.heading;
    const fx = Math.sin(md), fz = Math.cos(md);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    if (indoor) collideHouse(this.pos, this.radius);
    else collideCircle(this.pos, this.radius, false);
    this.animate(dt);
  }

  /** 걷기 애니메이션 + 모델 위치 (게스트 화면에서는 이것만 돌린다) */
  animate(dt) {
    const m = this.m;
    const amt = Math.min(1, this.speed / 5);
    this.phase += dt * (6 + this.speed * 1.6);
    const sw = Math.sin(this.phase) * amt;
    m.legs[0].rotation.x = sw * 0.8; m.legs[1].rotation.x = -sw * 0.8;
    m.arms[0].rotation.x = -sw * 0.7; m.arms[1].rotation.x = sw * 0.7;
    let y = Math.abs(Math.sin(this.phase)) * 0.09 * amt;
    if (this.hopT > 0) {
      this.hopT -= dt;
      y += Math.sin((1 - Math.max(0, this.hopT) / 0.45) * Math.PI) * 0.6;
    }
    m.root.position.y = y;
    m.head.rotation.z = Math.sin(this.phase * 0.5) * 0.05 * amt;
    m.root.rotation.x = amt * 0.08;
    this.toolVisual(dt);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    // 발자국 먼지
    if (this.speed > 4.5) {
      this.stepT -= dt;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      if (this.stepT <= 0) { this.stepT = 0.18; spawn('dust', this.pos.x - fx * 0.3, 0.1, this.pos.z - fz * 0.3, { vy: 0.5, life: 0.5, size: 0.45 }); }
    }
  }

  /** 손에 든 농기구 · 품에 안은 풀 · 들고 있는 짐 자세 (게스트 화면도 같은 값으로 그린다) */
  toolVisual(dt) {
    const m = this.m, arm = m.arms[0];
    if (!this.tv) {
      this.tv = { shovel: makeShovel(), sickle: makeSickle(), armful: makeArmful(), lastN: this.swingN || 0, swingT: 0 };
      for (const k of ['shovel', 'sickle']) { arm.add(this.tv[k]); this.tv[k].position.set(0, -0.38, 0.02); this.tv[k].rotation.x = -0.5; }
      m.root.add(this.tv.armful); this.tv.armful.position.set(0, 0.95, 0.42);
    }
    const tv = this.tv;
    tv.shovel.visible = this.tool === 'shovel';
    tv.sickle.visible = this.tool === 'sickle';
    tv.shovel.userData.lump.visible = (this.scoop || 0) > 0.05;
    const arm2 = (this.armful || 0) > 0.05 && this.tool === 'hand';
    tv.armful.visible = arm2;
    if (arm2) tv.armful.scale.setScalar(0.6 + Math.min(1, this.armful / 4) * 0.6);
    if ((this.swingN || 0) !== tv.lastN) { tv.lastN = this.swingN || 0; tv.swingT = 0.32; }
    const holding = !!this.held || this.heldKind || arm2;
    if (holding) { m.arms[0].rotation.x = m.arms[1].rotation.x = -1.25; }
    if (tv.swingT > 0) {
      tv.swingT -= dt;
      const k = Math.sin((1 - Math.max(0, tv.swingT) / 0.32) * Math.PI);
      arm.rotation.x = -0.4 - k * 1.3;
      if (this.tool === 'shovel') m.arms[1].rotation.x = -0.4 - k * 1.0;
      m.root.rotation.x = 0.08 + k * 0.25;
    } else if (this.tool !== 'hand' && !holding) arm.rotation.x = Math.min(arm.rotation.x, -0.35);
  }

  hop() {
    if (this.hopT > 0) return;
    this.hopT = 0.45;
    if (!this.remote) sfx('hop');
  }

  destroy() {
    this.group.parent?.remove(this.group);
  }
}
