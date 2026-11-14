// 차량: 직접 운전(시뮬레이션/간편) + 유압 조작 + 자동 운용 AI
import * as THREE from 'three';
import { G, LAYOUT, BALE_FEED, baleKind, MAX_BALES, BUCKET_CAP, TRUCK_BULK_CAP, COMPOST, INGREDIENTS, RECIPES, MIX_TIME, MIXER_CAP, MIX_UNIT_FEED } from './state.js';
import { stock, loadIngredient, recipeOf, planRecipe, mixTotal, freeStationSlot, setOnStation, inStation, stationItems } from './feed.js';
import { shedAt, allSheds } from './compost.js';
import { makeTractor, makeBaler, makeForklift, makeSkidLoader, makeTruck1, makeTruck5, makeMixer, makeBaleWagon, makeCar, makeHelicopter, makePlane, makeLiner, makeJet, glassMat, makeFarmer, seatFigure, pilotFigure, makeWheelbarrow, makeHandcart, pushFigure, PLAYER_LOOK, NPC_LOOKS, LAMP } from './models.js';
import { mat } from './materials.js';
import { clamp, wrapAngle, approach, damp, dampAngle, rand, lerp, group, part, sphere, torus } from './util.js';
import { collideCircle, blockedAt } from './physics.js';
import { findPath, lineClear, isFree, clearanceAt, nearestOpenSpot } from './pathfinding.js';
import { spawn, burst } from './particles.js';
import { toast, floatText } from './ui.js';
import { sfx } from './audio.js';
import { mergeStatic } from './merge.js';
import { collectPaint, animateFlag } from './garage.js';
import { fieldAt, CROPS } from './field.js';
import { barrowAction, cartAction } from './handwork.js';
import {
  spawnBale, baleCount, pickupItem, releaseCarried, supportUnder, itemInFront, freeYardSlot, inYard,
  freeDockSlot, dockItems, setOnTruck, truckCargo, freeTruckSlot, sellItems, nearMarket,
  addMuck, takeBulk, hasBulkNear, depositBulk, sellCompost, barnAlleyAt, Item,
} from './items.js';

export const VEH_DEFS = {
  // 🧑‍🌾 손으로 미는 수레 (처음 시작할 때의 일꾼 장비 · 자동 운전 없음)
  wheelbarrow: {
    name: '손수레', icon: '🛞', maxSpeed: 4.8, accel: 7, turn: 3.0, radius: 0.8, work: 1.6, build: makeWheelbarrow, carries: [], color: '#6fb8e0',
    circles: [[0.45, 0.72], [-0.7, 0.5], [-1.5, 0.42]], push: true, barrow: true,
  },
  handcart: {
    name: '리어카', icon: '🛒', maxSpeed: 4.6, accel: 6, turn: 2.4, radius: 1.0, work: 2.6, build: makeHandcart, carries: [], color: '#d9a066',
    circles: [[2.15, 0.45], [0.75, 0.75], [-0.6, 0.95]], push: true, cart: true,
  },
  tractor: {
    name: '트랙터', icon: '🚜', maxSpeed: 8, accel: 6, turn: 1.9, radius: 1.45, work: 2.7, build: makeTractor, carries: [], color: '#63b85c',
    lift: { min: 0, max: 1, rate: 1.3, init: 1, name: '예초기 높이' }, pto: '예초기',
  },
  baler: {
    name: '베일러', icon: '🌀', maxSpeed: 7, accel: 5, turn: 1.8, radius: 1.5, work: 2.2, build: makeBaler, carries: [], color: '#f0705c',
    lift: { min: 0, max: 1, rate: 1.3, init: 1, name: '픽업 높이' }, tilt: { min: 0, max: 1, rate: 1.3, init: 0, name: '뒷문' }, pto: '수집 릴',
  },
  forklift: {
    name: '지게차', icon: '🏗️', maxSpeed: 8, accel: 7, turn: 2.3, radius: 1.25, work: 1.9, build: makeForklift, carries: ['bale', 'pallet', 'sack'], color: '#f2b134',
    lift: { min: 0, max: 2.4, rate: 1.1, init: 0.1, name: '포크 높이' }, tilt: { min: -0.12, max: 0.1, rate: 0.35, init: -0.04, name: '마스트 틸트' },
  },
  skid: {
    name: '스키드로더', icon: '🚧', maxSpeed: 7, accel: 7, turn: 2.6, radius: 1.3, work: 2.1, skid: true, build: makeSkidLoader, carries: ['bale'], color: '#f08a2c',
    lift: { min: 0, max: 1, rate: 0.85, init: 0.12, name: '암 높이' }, tilt: { min: -0.5, max: 1.1, rate: 1.5, init: 0, name: '버킷 각도' },
  },
  truck1: {
    name: '1톤 트럭', icon: '🛻', maxSpeed: 13, accel: 7, turn: 1.6, radius: 1.3, work: 3.0, build: makeTruck1, carries: [], color: '#6fb8e0',
    circles: [[1.3, 1.15], [-1.0, 1.15]], cargo: true,
  },
  truck5: {
    name: '5톤 트럭', icon: '🚚', maxSpeed: 10.5, accel: 4.5, turn: 1.25, radius: 1.5, work: 4.2, build: makeTruck5, carries: [], color: '#f2b134',
    circles: [[2.5, 1.35], [0, 1.4], [-2.6, 1.4]], cargo: true, dump: true,
    lift: { min: 0, max: 0.85, rate: 0.32, init: 0, name: '적재함 각도' },
  },
  balewagon: {
    name: '베일 운반차', icon: '🚛', maxSpeed: 9, accel: 5.5, turn: 1.5, radius: 1.4, work: 3.6, build: makeBaleWagon, carries: ['bale'], color: '#7fa8f0',
    circles: [[1.7, 1.2], [-0.9, 1.4], [-3.7, 1.4]], wagon: true,
    lift: { min: 0, max: 1, rate: 0.9, init: 0.3, name: '집게 높이' }, tilt: { min: 0, max: 0.6, rate: 0.4, init: 0, name: '데크 기울기' },
  },
  mixer: {
    name: '사료 배합기', icon: '🥣', maxSpeed: 7.5, accel: 5, turn: 1.8, radius: 1.4, work: 2.2, build: makeMixer, carries: [], color: '#5fc4ae',
    circles: [[1.2, 1.15], [-1.0, 1.35]], tilt: { min: 0, max: 1, rate: 1.4, init: 0, name: '배출구' }, pto: '오거',
  },
  car: {
    name: '자가용', icon: '🚗', maxSpeed: 16, accel: 9, turn: 2.0, radius: 1.2, work: 2.2, build: makeCar, carries: [], color: '#ff9eb5',
    circles: [[1.0, 1.05], [-1.0, 1.05]], personal: true,
  },
  heli: {
    name: '헬기', icon: '🚁', maxSpeed: 26, accel: 6, turn: 1.6, radius: 1.6, work: 2.2, build: makeHelicopter, carries: ['pallet', 'bale', 'sack'], color: '#ffd36e',
    circles: [[0.2, 1.3], [-2.3, 0.6]], air: 'heli', seats: 2,
  },
  plane: {
    name: '경비행기', icon: '✈️', maxSpeed: 28, accel: 5, turn: 1.4, radius: 1.3, work: 2.4, build: makePlane, carries: [], color: '#ff9eb5',
    circles: [[0.7, 1.1], [-1.6, 0.7]], air: 'plane', seats: 2, tier: 'common',
  },
  // 🛫 미니 여객기: 무겁고 묵직하게 — 이륙 거리가 길고 천천히 기울지만 순항 속도가 빠르다
  liner: {
    name: '미니 여객기', icon: '🛫', maxSpeed: 34, accel: 4, turn: 1.0, radius: 1.3, work: 2.6, build: makeLiner, carries: [], color: '#6fb8f0',
    circles: [[2.4, 1.1], [0, 1.2], [-2.6, 1.0]], air: 'plane', park: 'liner', seats: 2, tier: 'epic',
    fly: { thrust: 4.6, vmax: 64, cd0: 0.036, roll: 0.7, boost: 1.2 },
  },
  // 🛩️ 미니 제트 전투기: 추력이 아주 커서 금방 빨라지고, 빠르게 기울며 선회 · 부스트는 애프터버너
  jet: {
    name: '미니 제트 전투기', icon: '🛩️', maxSpeed: 45, accel: 8, turn: 1.8, radius: 1.2, work: 2.4, build: makeJet, carries: [], color: '#5f8fd8',
    circles: [[1.4, 1.0], [-1.4, 1.0]], air: 'plane', park: 'jet', seats: 2, tier: 'legend',
    fly: { thrust: 10.5, vmax: 80, cd0: 0.026, roll: 1.7, boost: 1.55 },
  },
};
/** 경비행기 기본 비행 성능 (차종마다 fly로 바꿀 수 있음) */
const FLY = { thrust: 3.4, vmax: 50, cd0: 0.032, roll: 1, boost: 1.25 };

const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
/** 헬기 화물: 짐 윗면 높이(후크 거는 곳) · 헬기 대비 무게 비율 */
const SLING_TOP = { pallet: 0.95, bale: 1.0, sack: 0.75 };
const SLING_MASS = { pallet: 0.22, bale: 0.16, sack: 0.1 };
/** 비행기 양력 계수 (½ρS/m) */
const KL = 0.0522;
let nextId = 0;
/** 걸어 다니는(차에 안 탄) 모든 플레이어 */
export const walkers = () => (G.players || [G.player]).filter((p) => p && !p.driving && !(p === G.player && G.driving));

export class Vehicle {
  constructor(type, index) {
    this.id = nextId++;
    this.type = type;
    this.index = index;
    // 차종 정의(baseDef)를 물려받은 차량 전용 정의: 등급(터보·컴팩트·프로)·스킨은 이 차에만 적용된다
    this.baseDef = VEH_DEFS[type];
    this.baseDef.circles ||= [[0, this.baseDef.radius]];
    this.def = Object.create(this.baseDef);
    this.grade = 'std';
    this.skin = 'base';
    this.m = this.def.build();
    mergeStatic(this.m.group, this.m);   // 최적화: 차체의 정적 부품 합치기
    this.group = this.m.group;
    collectPaint(this);                  // 스킨으로 칠할 차체 메시 (사람·짐이 붙기 전에)
    G.scene.add(this.group);
    this.park = this.def.air ? LAYOUT.airfield[this.def.park || this.def.air] : LAYOUT.parking[index % LAYOUT.parking.length];
    this.pos = new THREE.Vector3(this.park.x, 0, this.park.z);
    this.heading = this.park.h ?? Math.PI;
    this.rpm = 0; this.vs = 0; this.pitch = 0; this.roll = 0;
    this.flyState = 'idle'; this.flyWait = 2;
    this.speed = 0;
    this.prevSpeed = 0;
    this.accSm = 0;
    this.steerVis = 0;
    this.auto = false;       // 유저가 카드의 '자동' 스위치를 켜야 일꾼이 일한다
    this.skidMode = 'level'; // 스키드로더 간편 모드 버킷: 'level'(수평) | 'dump'(쏟기)
    this.pto = false;
    this.lift = this.liftT = this.def.lift?.init ?? 0;
    this.tilt = this.tiltT = this.def.tilt?.init ?? 0;
    this.prevLift = this.lift;
    this.boostE = 1;
    this.boosting = false;
    this.carrying = null;
    this.driver = null;      // 운전 중인 플레이어 (로컬/원격)
    this.load = 0;           // 스키드로더 버킷 (분뇨/퇴비)
    this.loadKind = null;
    this.bulk = 0;           // 트럭 적재함 벌크 (분뇨/퇴비)
    this.bulkKind = null;
    this.collected = 0;      // 베일러 챔버
    this.baleCrop = 'grass'; // 챔버에 든 작물
    this.assign = null;      // 담당 지정: { barn } 또는 { field } (null = 전체)
    this.mix = { hay: 0, corn: 0, soy: 0 };   // 배합기 내용물
    this.mixT = 0;           // 배합 진행(초)
    this.dispensed = 0;      // 배출한 사료량
    this.ejectCD = 0;
    this.seq = null;
    this.smokeT = rand(0, 0.5);
    this.dustT = 0;
    this.status = '대기 중';
    this.idleStatus = '대기 중';
    this.ai = { task: null, path: null, idx: 0, think: rand(0.2, 1.2), stuck: 0, reverseT: 0, revSteer: 0, wait: 0, forBarn: null };
    const sit = this.def.air ? pilotFigure : this.def.push ? (f) => pushFigure(f, !!this.def.cart) : seatFigure;   // 항공기는 작은 조종사 + 헤드셋 · 수레는 서서 밀기
    this.playerFig = sit(makeFarmer(PLAYER_LOOK));
    this.npcFig = sit(makeFarmer(NPC_LOOKS[index % NPC_LOOKS.length]));
    this.m.seat.add(this.playerFig.group, this.npcFig.group);
    this.playerFig.group.visible = false;
    const eyeY = this.def.air ? 0.66 : this.def.push ? 1.6 : 0.95;
    this.eye = group(this.m.seat, 0, eyeY, 0.12);
    this.lampOn = LAMP.on();
    this.lampOff = LAMP.off();
    this.beaconOn = mat(0xffb03c, { emissive: 0xff8a00, emissiveIntensity: 1.2 });
    this.beaconOff = mat(0xff9a3c);
    // 2인승: 옆자리 동승자
    this.passenger = null;
    if (this.m.seat2) {
      this.passFig = sit(makeFarmer(NPC_LOOKS[(index + 2) % NPC_LOOKS.length]));
      this.m.seat2.add(this.passFig.group);
      this.passFig.group.visible = false;
      this.eye2 = group(this.m.seat2, 0, eyeY, 0.12);
    }
    this.glass = [];
    const gm = glassMat();
    this.group.traverse((o) => { if (o.isMesh && o.material === gm) this.glass.push(o); });
    if (this.def.air) this.initAir();
    this.applyControls();
    this.syncVisual();
  }

  /** 간편 모드인지: 운전자(원격이면 그 사람의 설정) 기준 */
  isEasy() { return (this.driver?.mode ?? G.settings.mode) === 'easy'; }

  /** 이 차를 운전 중인 플레이어의 키 입력 */
  key(...codes) { const i = this.driver?.input; return !!i && codes.some((c) => i.down(c)); }

  get radius() { return this.def.radius; }
  /** 자동 운전 경로가 장애물에서 떨어지고 싶은 거리 (차체 폭 + 여유) */
  get navNeed() { return Math.max(...this.def.circles.map(([, r]) => r)) + 0.85; }
  /** 차 중심에서 앞 범퍼까지 */
  get frontReach() { return Math.max(...this.def.circles.map(([o, r]) => o + r)); }
  /** 차 중심에서 뒤 범퍼까지 */
  get backReach() { return Math.max(...this.def.circles.map(([o, r]) => r - o)); }
  /** 하늘에 떠 있으면 땅 위 차·동물·건물과 부딪히지 않는다 */
  get airborne() { return this.pos.y > 0.6; }
  get isTruck() { return !!this.def.cargo; }

  workPoint() {
    return { x: this.pos.x + Math.sin(this.heading) * this.def.work, z: this.pos.z + Math.cos(this.heading) * this.def.work };
  }
  inField(m = 0) {
    const p = this.workPoint();
    return !!fieldAt(p.x, p.z, m);
  }

  setAuto(on) {
    if (this.def.push) on = false;   // 손수레·리어카는 사람이 직접 민다
    this.auto = on;
    if (this.def.air) {
      if (this.job?.reservedBy === this) this.job.reservedBy = null;
      this.job = null;
      if (this.winch?.it) this.winchStop();
      this.flyState = this.airborne ? (this.def.air === 'plane' ? 'dw1' : 'back') : 'idle'; this.flyWait = 1; this.stateT = 0;
      return;
    }
    if (!on) { this.clearTask(); this.pto = false; this.seq = null; }
    else this.ai.think = 0;
  }
  clearTask() {
    this.ai.sweep = null;   // 맡아 둔 우리 청소도 놓기 (다른 스키드가 할 수 있게)
    const t = this.ai.task;
    if (t?.item && t.item.reservedBy === this) t.item.reservedBy = null;
    this.ai.task = null;
    this.ai.path = null;
  }
  onEnter() {
    if (this.job?.reservedBy === this) this.job.reservedBy = null;
    this.job = null;
    this.holdAlt = null;
    this.clearTask();
    this.skidMode = this.tilt > 0.6 ? 'dump' : 'level';
    this.seq = null;
    this.ai.reverseT = 0;
    this.ai.forBarn = null;
  }
  onExit() {
    this.ai.think = 0.6;
    this.ai.stuck = 0;
  }

  // ---------------- 수동 조작 ----------------
  manualControls(dt) {
    if (this.seq) return;
    if (this.type === 'mixer') {
      for (const [code, kind] of [['Digit1', 'hay'], ['Digit2', 'corn'], ['Digit3', 'soy']]) if (this.driver?.input.pressed(code)) this.addIngredient(kind);
    }
    const d = this.def;
    const up = this.key('KeyR') ? 1 : 0, down = this.key('KeyF') ? 1 : 0;
    const tb = this.key('KeyT') ? 1 : 0, tf = this.key('KeyG') ? 1 : 0;
    if ((up || down) && d.lift) this.liftT = clamp(this.lift + (up - down) * d.lift.rate * dt * 1.5, d.lift.min, d.lift.max);
    if ((tb || tf) && d.tilt) {
      // 포크/버킷: T=뒤로 젖히기, G=앞으로 숙이기(쏟기) · 베일러: T=뒷문 열기, G=닫기
      const sign = this.type === 'forklift' || this.type === 'skid' ? -1 : 1;
      this.tiltT = clamp(this.tilt + (tb - tf) * sign * d.tilt.rate * dt * 1.5, d.tilt.min, d.tilt.max);
    }
    if ((up || down || tb || tf) && !d.lift && !d.tilt && !this.warnedNoHyd) {
      this.warnedNoHyd = true;
      toast(`${d.name}에는 유압 장치가 없어요`, d.icon, 1800);
    }
    if (up || down || tb || tf) this.manualHydT = 1.5;
    else this.manualHydT = Math.max(0, (this.manualHydT || 0) - dt);
    if (this.type === 'skid') this.skidEasyPosture();
  }

  /** 간편 모드: 직접 운전하는 스키드로더의 버킷 자세를 자동으로 맞춘다
   *  (앞으로 가면 바닥에 붙여 수평 → 분뇨를 계속 퍼담고, 가득 차면 들어 올려 젖힌다) */
  skidEasyPosture() {
    if (!this.isEasy() || this.seq || this.carrying || this.manualHydT > 0 || this.skidMode === 'dump') return;
    const forward = this.key('KeyW', 'ArrowUp') && !this.key('KeyS', 'ArrowDown');
    if (this.load >= BUCKET_CAP - 0.01) {
      this.liftT = Math.max(this.liftT, 0.3);   // 가득 차면 수평 그대로 살짝 들어 옮기기
      this.tiltT = 0;
    } else if (forward) {
      this.liftT = 0;
      this.tiltT = 0;
    }
  }

  /**
   * 간편 모드: 작업 버튼(Space) 없이, 운전만 하면 그 자리에 맞는 작업을 알아서 한다
   *  · 트랙터/베일러: 목초지에 들어가면 작업기 내리고 ON, 나오면 올리고 OFF
   *  · 지게차/스키드: 짐 앞으로 다가가면 들기, 들고 가다 멈추면 내려놓기
   *  · 스키드 버킷: 앞으로 가면 바닥 분뇨 퍼담기, 퇴비사 분뇨칸·트럭 적재함 앞에서 멈추면 쏟기
   *  · 트럭: 출하장 상차 · 판매소 판매 · 배합장 하차 · 퇴비사 상차/분뇨 내리기 · 사료 가게 창 열기 (멈추면)
   *  · 배합기: 배합장에서 멈추면 레시피 자동 투입 → 오거 자동 → 축사 통로 안에서 자동 배출
   *  · 베일 운반차: 건초 앞으로 다가가면 집어 싣기, 통로·보관소·배합장에서 멈추면 내리기
   */
  easyAuto(dt) {
    const t = this.type;
    const stopped = Math.abs(this.speed) < 0.35;
    this.easyStopT = stopped ? (this.easyStopT || 0) + dt : 0;
    this.easyCD = Math.max(0, (this.easyCD || 0) - dt);
    if (this.seq || this.manualHydT > 0) return;
    const local = this.driver === G.player;
    const say = (txt, cls = 'good') => { const p = this.workPoint(); floatText(p.x, 2.4, p.z, txt, cls); };

    if (t === 'tractor' || t === 'baler') {
      const on = this.inField(0.3);
      if (on !== this.pto) {
        this.pto = on;
        this.liftT = on ? 0 : 1;
        sfx('click');
        say(`${this.def.pto} ${on ? '자동 ON' : 'OFF'}`, on ? 'good' : '');
      }
      return;
    }
    if (this.easyCD > 0) return;

    // --- 들고 있는 짐 내려놓기: 짐을 들고 어느 정도 옮긴 뒤 멈추면 ---
    if (this.carrying && (t === 'forklift' || t === 'skid')) {
      const moved = this.pickAt ? Math.hypot(this.pos.x - this.pickAt.x, this.pos.z - this.pickAt.z) : 99;
      if (stopped && this.easyStopT > 0.6 && moved > 2.5) { this.quickAction(); this.pickAt = null; this.easyCD = 1.2; }
      return;
    }
    if (t === 'forklift' || (t === 'skid' && this.load < 0.5)) {
      // 앞에 짐이 있으면 들기 (방금 내려놓은 짐은 잠깐 다시 집지 않음)
      const it = itemInFront(this, 0.6, t === 'skid' ? 3.0 : 3.4, 1.0);
      // 앞으로 다가가는 중일 때만 (내려놓고 서 있는 동안 다시 집지 않게)
      if (it && this.canGrab(it) && this.speed > 0.2 && (t !== 'skid' || it.kind === 'bale')) {
        this.quickAction();
        this.pickAt = { x: this.pos.x, z: this.pos.z };
        this.easyCD = 1.0;
        return;
      }
    }
    if (t === 'skid') {
      this.skidMode = 'level';
      if (this.load > 0.5) {
        const fp = this.workPoint();
        const sp = supportUnder(fp.x, fp.z, this, 0.4);
        const sa = shedAt(fp.x, fp.z, 1.2);
        const intoShed = sa && (this.loadKind === 'compost' ? sa.zone === 'compost' : sa.zone === 'raw');
        // 트럭 적재함 위, 또는 퇴비사 알맞은 칸 앞에서 멈추면 쏟기
        if ((sp.kind === 'truck' || intoShed) && this.easyStopT > 0.25) {
          this.quickAction();
          this.easyCD = 2.2;
          say(sp.kind === 'truck' ? '트럭에 쏟기 ⤵️' : '퇴비사에 쏟기 ⤵️');
        }
      }
      return;
    }
    if (this.isTruck) {
      if (!stopped || this.easyStopT < 0.5) { if (!this.nearStore()) this.storeShown = false; return; }
      this.easyCD = 1.5;
      if (this.nearStore()) {
        if (!this.storeShown && local) { this.storeShown = true; G.openStore?.(this); }
        return;
      }
      if (this.atStation() && truckCargo(this).some((it) => it.kind === 'sack' || it.kind === 'bale')) { this.unloadToStation(); return; }
      const bay = LAYOUT.dock.bay;
      if (Math.hypot(this.pos.x - bay.x, this.pos.z - bay.z) < 6) {
        if (this.bulk < 0.01 && dockItems().length && freeTruckSlot(this) >= 0) this.loadFromDock();
        return;
      }
      if (nearMarket(this.pos, 4) || nearMarket(this.workPoint(), 3)) {
        if (truckCargo(this).length || (this.bulk > 0.01 && this.bulkKind === 'compost')) this.sellCargo();
        return;
      }
      const shed = this.nearShedLoad();
      if (shed) {
        if (this.def.dump && this.bulk > 0.01 && this.bulkKind === 'manure') { this.seq = [{ lift: 0.85, dur: 2.6 }, { lift: 0, dur: 2.2 }]; this.easyCD = 5; return; }
        const cap = TRUCK_BULK_CAP[this.type];
        if (!truckCargo(this).length && (this.bulk < 0.01 || this.bulkKind === 'compost') && this.bulk < cap - 0.5 && shed.compost > 0.5) this.loadCompost(shed);
      }
      return;
    }
    if (t === 'mixer') {
      const total = mixTotal(this);
      if (total > 0 && !this.isMixed()) this.pto = true;   // 원료가 들어 있으면 오거를 돌려 섞기
      const inAlley = barnAlleyAt(this.pos.x, this.pos.z);
      if (inAlley && total > 0 && this.isMixed()) {
        if (this.tiltT < 0.5) { this.pto = true; this.tiltT = 1; say('배출 시작!'); }
      } else if (this.tiltT > 0.5) this.tiltT = 0;   // 통로 밖에서는 배출구 닫기 (바닥에 쏟지 않게)
      // 배합장에 서 있으면 자동 투입 (원료가 모자라면 3초마다 다시 확인 → 트럭이 원료를 내려놓으면 바로 시작)
      if (this.atStation() && stopped && this.easyStopT > 0.5 && total < MIXER_CAP && this.dispensed === 0 && !this.stationTried && G.now > (this.stationRetryT || 0)) {
        const rec = recipeOf(this.mix);
        const target = rec ? G.barns.find((b) => b.animalType === rec) : this.pickRecipeTarget();
        if (target && this.autoLoad(target.animalType)) { this.stationTried = true; toast(`${RECIPES[target.animalType].name} 자동 배합 시작!`, RECIPES[target.animalType].icon, 2200); }
        else {
          this.stationRetryT = G.now + 3;
          if (!total && !this.stationWarned) { this.stationWarned = true; const msg = '원료가 부족해요. 트럭으로 사료 가게에서 옥수수·대두박을 사 오세요'; if (local) toast(msg, '🌽', 3000); }
        }
      }
      if (!this.atStation()) { this.stationTried = false; this.stationWarned = false; }
      return;
    }
    if (t === 'balewagon') {
      const cargo = truckCargo(this).filter((it) => !it.fly).length;
      if (!this.carrying && cargo < this.m.slots.length && this.speed > 0.2) {
        const it = itemInFront(this, 2.2, 5.0, 1.3);
        if (it && it.support.kind === 'ground' && this.canGrab(it)) { this.wagonQuick(); this.easyCD = 1.0; return; }
      }
      if (cargo && stopped && this.easyStopT > 0.6) {
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        const rx = this.pos.x - fx * 6.2, rz = this.pos.z - fz * 6.2;
        const y = LAYOUT.yard, S = LAYOUT.station.bay;
        const spot = barnAlleyAt(this.pos.x, this.pos.z) || barnAlleyAt(rx, rz) || Math.hypot(this.pos.x - y.x, this.pos.z - y.z) < 9 || inYard(rx, rz) || Math.hypot(this.pos.x - S.x, this.pos.z - S.z) < 7 || inStation(rx, rz, 2);
        if (spot) { this.seq = [{ tilt: 0.6, dur: 1.7 }, { tilt: 0, dur: 1.5 }]; this.easyCD = 4; }
      }
    }
  }

  /** Space 키 */
  action() {
    if (this.def.air) { this.airAction(); return; }
    if (this.def.barrow) { barrowAction(this, this.driver === G.player); return; }
    if (this.def.cart) { cartAction(this, this.driver === G.player); return; }
    const easy = this.isEasy();
    const t = this.type;
    if (t === 'tractor' || t === 'baler') {
      this.pto = !this.pto;
      if (easy) this.liftT = this.pto ? 0 : 1;
      sfx('click');
      const p = this.workPoint();
      floatText(p.x, 2.2, p.z, `${this.def.pto} ${this.pto ? 'ON' : 'OFF'}`, this.pto ? 'good' : '');
      if (!easy && this.pto && this.lift > 0.25) toast('F 키로 작업기를 내려야 작업이 돼요', this.def.icon, 2200);
      return;
    }
    if (this.def.personal) { this.honk(); return; }
    if (this.isTruck) { this.truckAction(); return; }
    if (t === 'mixer') { this.mixerAction(); return; }
    if (t === 'balewagon' && easy) { if (!this.seq) this.wagonQuick(); return; }
    if (!easy) {
      toast('시뮬레이션 모드: R/F로 올리고 내리고, T/G로 기울여 직접 작업해요 (설정에서 간편 모드 선택 가능)', '⚙️', 3500);
      sfx('error');
      return;
    }
    // 스키드로더 쏟기 ↔ 수평은 동작 중에 눌러도 바로 전환
    if (t === 'skid' && !this.carrying) { this.seq = null; this.skidToggle(); return; }
    if (this.seq) return;
    this.quickAction();
  }

  /** 간편 모드 스키드로더: Space 한 번에 쏟기 ↔ 수평 전환 */
  skidToggle() {
    const fp = this.workPoint();
    if (this.skidMode === 'dump') {
      this.skidMode = 'level';
      this.seq = [{ tilt: 0, lift: 0, dur: 0.6 }];
      floatText(fp.x, 2.2, fp.z, '버킷 수평 ➖', '');
    } else {
      this.skidMode = 'dump';
      const sp = supportUnder(fp.x, fp.z, this, 1.2);
      const high = sp.kind === 'truck';
      const lift = high ? (sp.truck.def.dump ? 0.95 : 0.75) : 0.4;
      this.seq = [{ lift, dur: high ? 1.0 : 0.5 }, { tilt: 1.05, dur: 0.6 }];
      floatText(fp.x, 2.2, fp.z, '버킷 쏟기 ⤵️', 'good');
    }
    sfx('click');
  }

  /** 자가용 경적: 앞에 있는 일꾼 차량은 잠깐 비켜 준다 */
  honk() {
    if (G.now - (this.honkT || 0) < 0.6) return;
    this.honkT = G.now;
    sfx('horn');
    const fp = this.workPoint();
    floatText(fp.x, 2.2, fp.z, '빵빵! 🎺', '');
  }

  /** 간편 모드: 한 번에 들기/내리기/퍼담기/쏟기 */
  quickAction() {
    const t = this.type;
    if (t === 'skid' && this.load > 0.5) {
      const fp = this.workPoint();
      const sp = supportUnder(fp.x, fp.z, this, 1.2);
      const high = sp.kind === 'truck';
      const lift = high ? (sp.truck.def.dump ? 0.95 : 0.75) : 0.4;
      // 버킷 기울이는 속도(1.5/초)로 끝까지(쏟기 각도 0.7 이상) 기울 시간을 준다
      this.seq = [{ lift, tilt: 0, dur: high ? 1.1 : 0.6 }, { tilt: 1.05, dur: 0.85 }, { tilt: 0, lift: 0.12, dur: 0.6 }];
      return;
    }
    if (this.carrying) {
      const anchor = this.m.carry.getWorldPosition(_w);
      const sp = supportUnder(anchor.x, anchor.z, this);
      const target = t === 'forklift' ? sp.y - 0.18 : 0;
      this.seq = [
        { lift: Math.max(0, target), dur: 0.7, fn: () => { if (this.carrying) releaseCarried(this, sp); } },
        { lift: t === 'forklift' ? Math.max(0.1, target - 0.05) : 0.12, dur: 0.4 },
      ];
      return;
    }
    if (t === 'skid') {
      const fp = this.workPoint();
      if (hasBulkNear(fp.x, fp.z, 2.4)) {
        this.seq = [
          { lift: 0, tilt: 0.1, dur: 0.45 },
          { fn: () => { this.scoop(fp.x, fp.z, 2.4); sfx('scoop'); }, dur: 0.15 },
          { tilt: -0.4, lift: 0.2, dur: 0.5 },
        ];
        return;
      }
    }
    const it = itemInFront(this, 0.6, 3.4, 1.1);
    if (it) {
      const y = it.pos.y;
      const low = t === 'forklift' ? Math.max(0, y - 0.15) : 0;
      this.seq = [
        { lift: low, tilt: 0, dur: 0.6 },
        { fn: () => { if (!it.carriedBy && !it.removed) pickupItem(this, it); }, dur: 0.1 },
        { lift: t === 'forklift' ? low + 0.6 : 0.35, tilt: t === 'skid' ? -0.3 : -0.04, dur: 0.5 },
      ];
      return;
    }
    toast(t === 'skid' ? '앞에 퍼담을 분뇨나 건초가 없어요' : '포크 앞에 들 수 있는 건초나 팔레트가 없어요', this.def.icon, 2000);
    sfx('error');
  }

  /** 버킷에 퍼담기 (분뇨/퇴비는 섞이지 않음) */
  scoop(x, z, r) {
    const res = takeBulk(x, z, r, BUCKET_CAP - this.load, this.load > 0.01 ? this.loadKind : null);
    if (res.got > 0) { this.load += res.got; this.loadKind = res.kind; }
    return res.got;
  }

  nearShedLoad() {
    for (const s of allSheds()) if (Math.hypot(this.pos.x - s.loadPos.x, this.pos.z - s.loadPos.z) < 7 || s.zoneAt(this.pos.x, this.pos.z, 2)) return s;
    return null;
  }

  /** 퇴비사에서 트럭에 퇴비 싣기 (퇴비사 컨베이어) */
  loadCompost(shed) {
    const cap = TRUCK_BULK_CAP[this.type];
    if (truckCargo(this).length) { toast('적재함에 팔레트/건초가 있어서 퇴비를 실을 수 없어요', this.def.icon); return 0; }
    if (this.bulk > 0.01 && this.bulkKind !== 'compost') { toast('분뇨가 실려 있어요. 먼저 퇴비사에 내려주세요', this.def.icon); return 0; }
    const amt = Math.min(cap - this.bulk, shed.compost);
    if (amt <= 0.5) { toast(shed.compost <= 0.5 ? `${shed.name}에 아직 완성된 퇴비가 없어요 (발효 중 ♨️)` : '적재함이 가득 찼어요', '♻️', 2400); return 0; }
    shed.compost -= amt;
    this.bulk += amt;
    this.bulkKind = 'compost';
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      spawn('muck', lerp(shed.compostPos.x, this.pos.x, t), 1.5 + Math.sin(t * Math.PI) * 2, lerp(shed.compostPos.z, this.pos.z, t), { vy: 1, grav: 4, life: 0.6 + t * 0.3 });
    }
    sfx('scoop');
    floatText(this.pos.x, 3.6, this.pos.z, `퇴비 ${Math.round(amt)}포 상차! (${Math.round((this.bulk / cap) * 100)}%)`, 'good');
    return amt;
  }

  // ---------------- 사료 배합기 ----------------
  atStation() {
    const b = LAYOUT.station.bay;
    return Math.hypot(this.pos.x - b.x, this.pos.z - b.z) < 6;
  }
  isMixed() { return mixTotal(this) > 0 && this.mixT >= MIX_TIME; }
  feedLeft() { return Math.max(0, mixTotal(this) * MIX_UNIT_FEED - this.dispensed); }

  addIngredient(kind) {
    if (!this.atStation()) { toast('배합장(보라색 원)에서 원료를 넣을 수 있어요', '🥣', 2200); sfx('error'); return false; }
    if (this.dispensed > 0) { toast('남은 사료를 먼저 다 배출해주세요', '🥣'); sfx('error'); return false; }
    const r = loadIngredient(this, kind);
    if (r === 'full') { toast('배합 통이 가득 찼어요', '🥣', 1800); sfx('error'); return false; }
    if (r === 'none') { toast(kind === 'hay' ? '근처에 건초가 없어요 (건초 보관소/배합장)' : `${INGREDIENTS[kind].name}가 없어요. 트럭으로 사료 가게에서 사 오세요`, INGREDIENTS[kind].icon, 2600); sfx('error'); return false; }
    sfx('pop');
    if (!!this.driver) floatText(this.pos.x, 3.4, this.pos.z, `${INGREDIENTS[kind].icon} +1`, 'good');
    return true;
  }

  /** 레시피대로 자동 투입 */
  autoLoad(animal) {
    const barn = G.barns.find((b) => b.animalType === animal);
    const units = barn ? Math.ceil((100 - barn.feed) / MIX_UNIT_FEED) + 1 : MIXER_CAP;
    const need = planRecipe(animal, this.mix, stock(), units);
    if (!need) return false;
    const steps = [];
    for (const k of ['hay', 'corn', 'soy']) for (let i = 0; i < need[k]; i++) steps.push({ fn: () => loadIngredient(this, k), dur: 0.35 });
    if (!steps.length) return false;
    steps.push({ fn: () => { this.pto = true; }, dur: 0.1 });
    this.seq = steps;
    sfx('pop');
    return true;
  }

  pickRecipeTarget(maxFeed = 101) {
    const st = stock();
    const list = this.workBarns().filter((b) => b.animals.length && b.feed < maxFeed).sort((a, b) => a.feed - b.feed);
    for (const b of list) if (planRecipe(b.animalType, this.mix, st)) return b;
    return null;
  }

  mixerAction() {
    const easy = this.isEasy();
    if (easy && this.atStation() && mixTotal(this) < MIXER_CAP && this.dispensed === 0) {
      const rec = recipeOf(this.mix);
      const target = rec ? G.barns.find((b) => b.animalType === rec) : this.pickRecipeTarget();
      if (target && this.autoLoad(target.animalType)) { toast(`${RECIPES[target.animalType].name} 배합 시작!`, RECIPES[target.animalType].icon, 2200); return; }
      if (!mixTotal(this)) { toast('원료가 부족해요. 트럭으로 사료 가게에서 옥수수·대두박을 사 오세요', '🌽', 3000); return; }
    }
    if (easy && barnAlleyAt(this.pos.x, this.pos.z) && mixTotal(this) > 0) {
      this.pto = true;
      this.tiltT = this.tilt > 0.5 ? 0 : 1;
      floatText(this.pos.x, 3.2, this.pos.z, this.tiltT ? '배출 시작!' : '배출 멈춤', 'good');
      return;
    }
    this.pto = !this.pto;
    sfx('click');
    floatText(this.pos.x, 3.2, this.pos.z, `오거 ${this.pto ? 'ON' : 'OFF'}`, this.pto ? 'good' : '');
  }

  /** 사료 가게에서 원료 구매 → 트럭 적재 */
  buyIngredient(kind) {
    const price = INGREDIENTS[kind].price;
    if (G.coins < price) { toast('코인이 부족해요', '🪙'); sfx('error'); return false; }
    if (this.bulk > 0.01) { toast('적재함에 퇴비/분뇨가 있어요', this.def.icon); sfx('error'); return false; }
    const slot = freeTruckSlot(this);
    if (slot < 0) { toast('적재함이 가득 찼어요', this.def.icon); sfx('error'); return false; }
    G.coins -= price;
    const st = LAYOUT.store;
    const it = new Item('sack', kind);
    it.placeAt(st.x - 4, st.z, 0);
    it.pos.set(st.x - 4, 0, st.z);
    setOnTruck(it, this, slot, true);
    sfx('buy');
    return true;
  }

  /** 배합장에 원료 내리기 */
  unloadToStation() {
    let n = 0;
    for (const it of truckCargo(this)) {
      if (it.kind !== 'sack' && it.kind !== 'bale') continue;
      const slot = freeStationSlot(this);
      if (!slot) { toast('배합장 보관 칸이 가득 찼어요', '🌽'); break; }
      it.mesh.getWorldPosition(it.pos);
      setOnStation(it, slot);
      it.pop = 0.4;
      burst('dust', slot.x, 0.6, slot.z, 4, { vy: 1.5, grav: 0, life: 0.5 });
      n++;
    }
    if (n) { sfx('drop'); floatText(this.pos.x, 3.4, this.pos.z, `원료 ${n}개 하차!`, 'good'); }
    return n;
  }

  nearStore() {
    const st = LAYOUT.store;
    return Math.hypot(this.pos.x - st.x, this.pos.z - st.z) < st.r + 3;
  }

  truckAction() {
    if (this.nearStore()) { G.openStore?.(this); return; }
    if (this.atStation() && truckCargo(this).some((it) => it.kind === 'sack' || it.kind === 'bale')) {
      if (!this.unloadToStation()) toast('내릴 원료가 없어요', this.def.icon);
      return;
    }
    const bay = LAYOUT.dock.bay;
    if (Math.hypot(this.pos.x - bay.x, this.pos.z - bay.z) < 6) {
      if (this.bulk > 0.01) { toast('적재함에 퇴비/분뇨가 있어서 팔레트를 실을 수 없어요', this.def.icon, 2200); return; }
      const n = this.loadFromDock();
      if (!n) toast(freeTruckSlot(this) < 0 ? '적재함이 가득 찼어요' : '출하장에 실을 짐이 없어요', this.def.icon, 2000);
      return;
    }
    if (nearMarket(this.pos, 4) || nearMarket(this.workPoint(), 3)) {
      if (!this.sellCargo()) toast(this.bulkKind === 'manure' && this.bulk > 0 ? '분뇨는 팔 수 없어요. 퇴비사에서 발효시켜 주세요' : '실은 짐이 없어요', this.def.icon, 2200);
      return;
    }
    const shed = this.nearShedLoad();
    if (shed) {
      if (this.def.dump && this.bulk > 0.01 && this.bulkKind === 'manure') { this.seq = [{ lift: 0.85, dur: 2.6 }, { lift: 0, dur: 2.2 }]; return; }
      this.loadCompost(shed);
      return;
    }
    if (this.def.dump && this.bulk > 0.01 && this.isEasy()) {
      this.seq = [{ lift: 0.85, dur: 2.6 }, { lift: 0, dur: 2.2 }];
      return;
    }
    toast('출하장에서 팔레트를, 퇴비사(축사 뒤)에서 퇴비를 싣고 판매소에서 팔아요', this.def.icon, 2800);
  }

  loadFromDock() {
    let n = 0;
    for (const it of dockItems()) {
      const slot = freeTruckSlot(this);
      if (slot < 0) break;
      setOnTruck(it, this, slot, true);
      it.fly.dur = 0.5 + n * 0.12;
      n++;
    }
    if (n) { sfx('pickup'); floatText(this.pos.x, 3.5, this.pos.z, `📦 ${n}개 상차!`, 'good'); }
    return n;
  }

  sellCargo() {
    const cargo = truckCargo(this).filter((it) => !it.fly);
    let total = 0;
    if (cargo.length) total += sellItems(cargo, LAYOUT.market);
    if (this.bulk > 0.01 && this.bulkKind === 'compost') {
      total += sellCompost(this.bulk, LAYOUT.market);
      this.bulk = 0;
      this.bulkKind = null;
    }
    return total;
  }

  // ---------------- 매 프레임 ----------------
  update(dt) {
    if (this.def.air) { this.updateAir(dt); return; }
    const driven = !!this.driver;
    const def = this.def;
    let thr = 0, st = 0;
    if (driven) {
      thr = (this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0);
      st = (this.key('KeyA', 'ArrowLeft') ? 1 : 0) - (this.key('KeyD', 'ArrowRight') ? 1 : 0);
      // 모바일 조이스틱: 기울인 만큼만 부드럽게 조향 (살짝 빗나가도 핸들을 끝까지 꺾지 않게)
      const ax = this.driver?.input?.axis;
      if (ax?.active) {
        const a = Math.abs(ax.x);
        st = a < 0.12 ? 0 : -Math.sign(ax.x) * Math.pow((a - 0.12) / 0.88, 1.6);
      }
      this.status = '직접 운전 중';
      this.manualControls(dt);
      if (this.isEasy() && !def.air && !def.personal && !def.push) this.easyAuto(dt);
    } else if (this.auto || this.ai.task?.kind === 'yield') {
      [thr, st] = this.think(dt);
      if (!this.def.air) this.watchdog(dt);
    } else {
      this.status = '수동 모드 · 정지';
      this.pto = false;
    }
    if (this.seq) {
      this.runSeq(dt);
      if (!driven) { thr = 0; st = 0; }
    }
    if (this.ai.ghostT > 0) this.ai.ghostT -= dt;
    this.yieldScanT = (this.yieldScanT || 0) - dt;
    if (this.yieldScanT <= 0) {
      this.yieldScanT = 0.3;
      // 자동 일꾼 차는 다른 차를 그냥 통과하므로 비켜 달라고 할 필요가 없다
      if (driven) this.askYield();
    }

    // 부스트 (Shift) — 게이지 소모 없이 무제한
    this.boosting = driven && thr > 0 && this.key('ShiftLeft', 'ShiftRight');
    this.boostE = 1;

    let max = driven ? def.maxSpeed : def.maxSpeed * (0.85 + 0.12 * G.upgrades.autoSpeed) * (G.snackT > 0 ? 1.15 : 1);
    let accel = def.accel;
    if (this.boosting) { max *= 1.55; accel *= 1.6; }
    if (def.dump && this.lift > 0.05) max *= 0.3;
    if (this.type === 'forklift' && this.lift > 1.2) max *= 0.55;
    const target = thr >= 0 ? thr * max : thr * max * 0.55;
    const braking = Math.abs(target) < Math.abs(this.speed) || Math.sign(target) !== Math.sign(this.speed);
    this.speed = approach(this.speed, target, (braking ? accel * 1.8 : accel) * dt);
    if (def.skid) {
      this.heading += st * def.turn * dt;
    } else {
      let eff = clamp(Math.abs(this.speed) / 2.2, 0, 1);
      if (Math.abs(thr) > 0.01) eff = Math.max(eff, 0.4);
      const dir = this.speed < -0.05 || (Math.abs(this.speed) <= 0.05 && thr < 0) ? -1 : 1;
      const hi = Math.abs(this.speed) > def.maxSpeed ? 0.75 : 1;
      this.heading += st * def.turn * eff * dir * hi * dt;
    }
    this.heading = wrapAngle(this.heading);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.resolveCollisions(fx, fz);

    // 유압
    this.prevLift = this.lift;
    if (def.lift) this.lift = approach(this.lift, this.liftT, def.lift.rate * dt);
    if (def.tilt) this.tilt = approach(this.tilt, this.tiltT, def.tilt.rate * dt);
    this.applyControls();
    this.updateTool(dt, driven);
    this.animate(dt, st);
  }

  runSeq(dt) {
    const s = this.seq[0];
    if (!s.started) {
      s.started = true;
      if (s.lift != null && this.def.lift) this.liftT = clamp(s.lift, this.def.lift.min, this.def.lift.max);
      if (s.tilt != null && this.def.tilt) this.tiltT = clamp(s.tilt, this.def.tilt.min, this.def.tilt.max);
      s.t = s.dur ?? 0.5;
    }
    s.t -= dt;
    if (s.t <= 0) {
      this.seq.shift();
      if (!this.seq.length) this.seq = null;
      s.fn?.();
    }
  }

  resolveCollisions(fx, fz) {
    let hit = false;
    const ghost = this.passThrough();
    // 자동 일꾼 차가 자꾸 막히면 잠깐 동안 장애물도 통과해서 빠져나간다
    if (!(ghost && this.ai.ghostT > 0)) for (const [off, r] of this.def.circles) {
      _c.set(this.pos.x + fx * off, 0, this.pos.z + fz * off);
      const ox = _c.x, oz = _c.z;
      if (collideCircle(_c, r, true)) { this.pos.x += _c.x - ox; this.pos.z += _c.z - oz; hit = true; }
    }
    if (hit) this.speed *= 0.92;
    // 차량끼리: 우선순위가 낮은 쪽(서 있는 일꾼 차)이 더 많이 밀리고,
    // 서로 파고드는 속도는 줄이며, 옆으로 미끄러져 비켜 가게 한다
    let vHit = false;
    const myP = this.pushPriority();
    const dir = Math.sign(this.speed) || 0;
    for (const o of G.vehicles) {
      if (o === this || o.airborne) continue;
      if (ghost || o.passThrough()) continue;   // 자동 일꾼 차는 차끼리 서로 통과
      if (Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) > 10) continue;
      const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
      const share = o.pushPriority() / (myP + o.pushPriority());
      for (const [a, ra] of this.def.circles) for (const [b, rb] of o.def.circles) {
        const ax = this.pos.x + fx * a, az = this.pos.z + fz * a;
        const bx = o.pos.x + ofx * b, bz = o.pos.z + ofz * b;
        const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), min = ra + rb;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          const p = (min - d) * share;
          this.pos.x += nx * p; this.pos.z += nz * p;
          // 내가 상대 쪽으로 파고드는 중이면 감속 + 접선 방향으로 미끄러지기
          const into = -(fx * nx + fz * nz) * dir;
          if (into > 0.1) {
            vHit = true;
            const tx = -nz, tz = nx;
            const s = Math.sign(tx * fx * dir + tz * fz * dir) || 1;
            this.pos.x += tx * s * p * 0.6; this.pos.z += tz * s * p * 0.6;
          }
        }
      }
    }
    if (vHit) {
      this.speed *= !!this.driver ? 0.9 : 0.8;
      // 밀려서 벽·울타리 속으로 들어가지 않도록 한 번 더 정리
      for (const [off, r] of this.def.circles) {
        _c.set(this.pos.x + fx * off, 0, this.pos.z + fz * off);
        const ox = _c.x, oz = _c.z;
        if (collideCircle(_c, r, true)) { this.pos.x += _c.x - ox; this.pos.z += _c.z - oz; }
      }
    }
    if (!G.driving && !ghost) {
      const p = G.player.pos;
      for (const [a, r] of this.def.circles) {
        const ax = this.pos.x + fx * a, az = this.pos.z + fz * a;
        const dx = p.x - ax, dz = p.z - az, d = Math.hypot(dx, dz), min = r + 0.45;
        if (d < min && d > 1e-4) { p.x = ax + (dx / d) * min; p.z = az + (dz / d) * min; }
      }
    }
  }

  applyControls() {
    const m = this.m;
    switch (this.type) {
      case 'tractor': m.mower.position.y = lerp(0.3, 0.85, this.lift); break;
      case 'baler':
        m.pickup.position.y = lerp(0.38, 0.75, this.lift);
        m.tailgate.rotation.x = this.tilt * 1.15;
        break;
      case 'forklift':
        m.mast.rotation.x = this.tilt;
        m.carriage.position.y = 0.08 + this.lift;
        m.inner.position.y = Math.max(0, this.lift - 1.0) * 0.95;
        break;
      case 'skid':
        m.arms.rotation.x = -this.lift * 0.95;
        m.bucket.rotation.x = this.lift * 0.95 + this.tilt;
        break;
      case 'balewagon': {
        m.arms.rotation.x = -this.lift * 1.0;
        m.clamp.rotation.x = this.lift * 1.0;
        const open = this.carrying ? 0 : 0.35;
        for (const j of m.jaws) j.g.rotation.y = j.s * open;
        m.bed.rotation.x = -this.tilt;
        m.cylinder.scale.y = 1 + this.tilt * 3;
        break;
      }
      case 'truck5':
        m.bed.rotation.x = -this.lift;
        m.tailgate.rotation.x = this.lift * 1.3;
        m.cylinder.scale.y = 1 + this.lift * 2.2;
        m.cylinder.position.y = 1.0 + this.lift * 1.3;
        break;
    }
  }

  updateTool(dt, driven) {
    const m = this.m;
    const moving = Math.abs(this.speed) > 0.3;
    const easy = this.isEasy();
    const fp = this.workPoint();
    if (this.type === 'tractor') {
      if (this.pto) for (const d of m.discs) d.rotation.y += dt * 22;
      if (this.pto && moving && this.lift < 0.2) {
        const cut = fieldAt(fp.x, fp.z, 1.45)?.cutAt(fp.x, fp.z, 1.45) || [];
        for (const t of cut) for (let i = 0; i < 3; i++) spawn('clip', t.x + rand(-0.6, 0.6), 0.5, t.z + rand(-0.6, 0.6), { vy: rand(2, 4), vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), grav: 9, life: 0.8, spin: rand(-12, 12) });
        if (cut.length) sfx('cut');
      }
    } else if (this.type === 'baler') {
      if (this.pto) m.reel.rotation.x -= dt * 9;
      if (this.pto && moving && this.lift < 0.2 && this.collected < 4) {
        // 챔버에는 한 가지 작물만: 다른 작물 밭이면 먼저 베일을 내보내야 한다
        const f = fieldAt(fp.x, fp.z, 1.35);
        const got = f && (!this.collected || f.crop === this.baleCrop) ? f.collectAt(fp.x, fp.z, 1.35) : [];
        if (f && this.collected && f.crop !== this.baleCrop && driven && G.now - (this.mixWarnT || 0) > 4) {
          this.mixWarnT = G.now;
          toast(`챔버에 ${CROPS[this.baleCrop].name}이(가) 들어 있어요. 먼저 베일을 내보내요`, '🌀', 2400);
        }
        if (got.length) {
          if (!this.collected) this.baleCrop = f.crop;
          this.collected = Math.min(4, this.collected + got.length);
          for (const t of got) for (let i = 0; i < 3; i++) spawn('hay', t.x + rand(-0.5, 0.5), 0.4, t.z + rand(-0.5, 0.5), { vy: rand(2, 3.5), grav: 9, life: 0.7, spin: rand(-10, 10) });
          sfx('cut');
        }
      }
      this.ejectCD -= dt;
      if ((this.collected >= 4 || (this.forceEject && this.collected > 0)) && this.tilt > 0.8 && this.ejectCD <= 0) {
        if (baleCount() < MAX_BALES) {
          this.collected = 0;
          this.forceEject = false;
          this.ejectCD = 1.2;
          const bx = this.pos.x - Math.sin(this.heading) * 3.0, bz = this.pos.z - Math.cos(this.heading) * 3.0;
          const crop = CROPS[this.baleCrop] ? this.baleCrop : 'grass';
          spawnBale(bx, bz, this.heading, CROPS[crop].bale);
          burst('hay', bx, 1.2, bz, 10, { vy: 3 });
          sfx('bale');
          if (driven) floatText(bx, 2, bz, `${CROPS[crop].baleName} 완성! ${CROPS[crop].icon}`, 'good');
        } else if (driven && G.now - (this.fullT || 0) > 4) {
          this.fullT = G.now;
          toast('건초가 너무 많아요! 먼저 옮기거나 팔아주세요', '🌾');
        }
      }
      if (this.collected >= 4 && !this.seq && (!driven || easy) && this.tilt < 0.1 && this.ejectCD <= 0) {
        this.seq = [{ tilt: 1, dur: 0.9 }, { tilt: 0, dur: 0.7 }];
      }
      if (driven && !easy && this.collected >= 4 && this.tilt < 0.5 && !this.fullWarned) {
        this.fullWarned = true;
        toast('챔버가 가득 찼어요! T 키로 뒷문을 열어 건초를 내보내세요', '🌀', 3200);
      }
      if (this.collected < 4) this.fullWarned = false;
      for (let i = 0; i < 4; i++) m.lamps[i].material = i < this.collected ? this.lampOn : this.lampOff;
    } else if (this.type === 'forklift') {
      const forkY = 0.18 + this.lift;
      if (!this.carrying && this.lift > this.prevLift + 1e-5) {
        const it = itemInFront(this, 1.0, 2.8, 0.7, forkY - 0.15, 0.3);
        if (it && forkY > it.pos.y + 0.06 && this.canGrab(it)) pickupItem(this, it);
      } else if (this.carrying && this.lift < this.prevLift - 1e-5) {
        const a = m.carry.getWorldPosition(_w);
        const sp = supportUnder(a.x, a.z, this);
        if (forkY <= sp.y + 0.2 && !releaseCarried(this, sp)) {
          this.lift = this.liftT = Math.max(this.lift, sp.y - 0.18 + 0.2);
        }
      }
    } else if (this.type === 'skid') {
      const by = m.carry.getWorldPosition(_w).y;
      const level = this.tilt > -0.35 && this.tilt < 0.3;
      if (!this.carrying && this.load < BUCKET_CAP && this.lift < 0.12 && level && this.speed > 0.15) {
        // 간편 모드·자동 일꾼은 버킷 폭 전체로 퍼담아, 우리 가운데로 지나가도 양옆 분뇨가 담긴다
        const got = this.scoop(fp.x, fp.z, (easy && driven) || !driven ? 2.0 : 1.5);
        if (got > 0) {
          if (G.now - (this.scoopSfx || 0) > 0.4) { sfx('scoop'); this.scoopSfx = G.now; }
          if (this.load >= BUCKET_CAP - 0.01 && driven) floatText(fp.x, 2, fp.z, '버킷 가득!', 'good');
        }
      }
      if (this.load > 0.01 && this.tilt > 0.7) this.dumpLoad();
      if (!this.carrying && this.load < 0.5 && this.lift > this.prevLift + 1e-5 && level) {
        const it = itemInFront(this, 1.2, 3.0, 0.9, by, 0.45);
        if (it && by > it.pos.y + 0.05 && this.canGrab(it)) pickupItem(this, it);
      } else if (this.carrying) {
        if (this.tilt > 0.75) {
          const it = this.carrying;
          if (releaseCarried(this, { kind: 'ground', y: 0 }) && !it.removed && it.support.kind === 'ground') {
            it.placeAt(fp.x + Math.sin(this.heading) * 0.6, fp.z + Math.cos(this.heading) * 0.6, this.heading);
          }
        } else if (this.lift < this.prevLift - 1e-5) {
          const a = m.carry.getWorldPosition(_w);
          const sp = supportUnder(a.x, a.z, this);
          if (by <= sp.y + 0.15 && !releaseCarried(this, sp)) this.lift = this.liftT = this.prevLift;
        }
      }
      m.load.visible = this.load > 0.3;
      const s = Math.min(1, this.load / BUCKET_CAP);
      m.load.scale.set(0.6 + s * 0.4, 0.4 + s * 0.8, 0.6 + s * 0.4);
      this.tintLoad(m.load, this.loadKind);
    }
    if (this.type === 'mixer') this.updateMixer(dt, driven);
    if (this.type === 'balewagon') this.updateWagon(dt, driven);
    if (this.def.barrow) {
      const k = Math.min(1, this.bulk / TRUCK_BULK_CAP.wheelbarrow);
      m.load.visible = this.bulk > 0.2;
      m.load.scale.set(0.6 + k * 0.4, 0.4 + k * 1.1, 0.6 + k * 0.4);
      this.tintLoad(m.load, this.bulkKind);
    }
    if (this.isTruck) {
      const cap = TRUCK_BULK_CAP[this.type];
      m.load.visible = this.bulk > 0.3;
      const k = Math.min(1, this.bulk / cap);
      m.load.scale.set(0.5 + k * 0.5, 0.3 + k * 1.2, 0.5 + k * 0.5);
      this.tintLoad(m.load, this.bulkKind);
      if (this.def.dump && this.lift > 0.45) {
        const rx = this.pos.x - Math.sin(this.heading) * 4.6, rz = this.pos.z - Math.cos(this.heading) * 4.6;
        if (this.bulk > 0.1) {
          const kind = this.bulkKind;
          if (kind === 'compost' && fieldAt(rx, rz, 2) && !shedAt(rx, rz, 3)) {
            depositBulk('compost', this.bulk, rx, rz, { manual: driven });
          } else {
            const sa = shedAt(rx, rz, 3) || shedAt(this.pos.x, this.pos.z, 5.5);
            const tx = sa ? (kind === 'manure' ? sa.shed.rawPos.x : sa.shed.compostPos.x) : rx;
            const tz = sa ? (kind === 'manure' ? sa.shed.rawPos.z : sa.shed.compostPos.z) : rz;
            depositBulk(kind, this.bulk, tx, tz, { manual: driven, pad: 0.6 });
          }
          this.bulk = 0;
          this.bulkKind = null;
        }
        const cargo = truckCargo(this);
        cargo.forEach((it, i) => {
          const side = (i % 2 ? 1 : -1) * 0.8;
          const back = 1.2 + Math.floor(i / 2) * 1.4;
          const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
          it.placeAt(rx - Math.sin(this.heading) * back + lx * side, rz - Math.cos(this.heading) * back + lz * side, this.heading + rand(-0.3, 0.3));
          it.pop = 0.3;
        });
        if (cargo.length) sfx('drop');
      }
    }
  }

  updateMixer(dt, driven) {
    const m = this.m;
    const total = mixTotal(this);
    if (this.pto) {
      m.auger.rotation.y += dt * 10;
      if (total > 0 && this.mixT < MIX_TIME) {
        this.mixT = Math.min(MIX_TIME, this.mixT + dt);
        if (this.mixT >= MIX_TIME && driven) {
          const rec = recipeOf(this.mix);
          toast(rec ? `${RECIPES[rec].name} 배합 완성! ✨ 축사 통로에서 배출하세요 (T)` : '잡사료가 됐어요 (레시피와 비율이 달라요)', rec ? RECIPES[rec].icon : '🥣', 3000);
          sfx('ding');
        }
      }
    }
    m.door.rotation.z = -this.tilt * 1.2;
    // 통 안 내용물
    const left = this.feedLeft() / (MIXER_CAP * MIX_UNIT_FEED);
    m.fill.scale.y = Math.max(0.001, left * 1.5);
    const key = total ? `${this.mix.hay}${this.mix.corn}${this.mix.soy}${this.isMixed() ? 1 : 0}` : '';
    if (key !== this.fillKey) {
      this.fillKey = key;
      const c = new THREE.Color(0, 0, 0);
      for (const k of ['hay', 'corn', 'soy']) c.add(new THREE.Color(INGREDIENTS[k].color).multiplyScalar(this.mix[k] / Math.max(1, total)));
      if (this.isMixed()) c.lerp(new THREE.Color(0xc9a05a), 0.35);
      m.fillMesh.material = mat(c.getHex());
    }
    // 배출
    if (this.tilt > 0.6 && total > 0) {
      if (!this.isMixed()) {
        if (driven && G.now - (this.mixWarnT || 0) > 4) { this.mixWarnT = G.now; toast('아직 덜 섞였어요! 오거를 돌려(Space) 충분히 배합해주세요', '🥣'); }
        return;
      }
      if (!this.pto) { if (driven && G.now - (this.ptoWarnT || 0) > 4) { this.ptoWarnT = G.now; toast('오거를 돌려야(Space) 사료가 나와요', '🥣'); } return; }
      const o = m.out.getWorldPosition(_w);
      const barn = barnAlleyAt(o.x, o.z) || barnAlleyAt(this.pos.x, this.pos.z);
      const amt = Math.min(this.feedLeft(), 14 * dt);
      const rec = recipeOf(this.mix);
      if (Math.random() < 0.6) spawn('hay', o.x + rand(-0.3, 0.3), o.y, o.z + rand(-0.3, 0.3), { vy: 0.5, vx: rand(-1.2, -0.4) * Math.cos(this.heading), vz: rand(-0.4, 0.4), grav: 9, life: 0.7, spin: rand(-8, 8) });
      if (barn) {
        const added = barn.addFeed(amt, rec);
        this.dispensed += added;
        if (added < amt * 0.5 && driven && G.now - (this.fullWarnT || 0) > 4) { this.fullWarnT = G.now; toast(`${barn.name} 사료가 가득 찼어요`, '🌾'); }
        if (rec && rec !== barn.animalType && driven && G.now - (this.recWarnT || 0) > 6) { this.recWarnT = G.now; toast(`이 사료는 ${RECIPES[rec].name}예요. 맞춤 효과가 없어요`, RECIPES[rec].icon); }
      } else {
        this.dispensed += amt;
        if (driven && G.now - (this.spillWarnT || 0) > 4) { this.spillWarnT = G.now; toast('사료가 바닥에 쏟아지고 있어요! 축사 통로 안에서 배출하세요', '🥣'); }
      }
      if (this.feedLeft() <= 0.01) {
        this.mix = { hay: 0, corn: 0, soy: 0 };
        this.mixT = 0;
        this.dispensed = 0;
        this.tiltT = 0;
        if (driven) { toast('배합 사료를 다 배출했어요! 배합장에서 다시 채워요', '🥣', 2400); sfx('ding'); }
      }
    }
  }

  // ---------------- 베일 운반차 ----------------
  updateWagon(dt, driven) {
    const m = this.m;
    const cy = m.carry.getWorldPosition(_w).y;
    if (!this.carrying && this.lift > this.prevLift + 1e-5 && this.lift < 0.5) {
      const it = itemInFront(this, 2.7, 4.6, 0.95);
      if (it && it.support.kind === 'ground' && this.canGrab(it)) pickupItem(this, it);
    }
    if (this.carrying && this.lift > 0.9) {
      const slot = this.tilt < 0.05 ? freeTruckSlot(this) : -1;
      if (slot >= 0) {
        const it = this.carrying;
        this.carrying = null;
        it.mesh.getWorldPosition(it.pos);
        setOnTruck(it, this, slot, true);
        sfx('pickup');
        if (driven) floatText(this.pos.x, 3.6, this.pos.z, `데크 ${truckCargo(this).length}/${m.slots.length}`, 'good');
      } else if (driven && G.now - (this.deckWarnT || 0) > 4) {
        this.deckWarnT = G.now;
        toast('데크가 가득 찼어요! 축사 통로·건초 보관소·배합장에서 T로 데크를 들어 내려요', '🚛', 3000);
      }
    }
    if (this.carrying && this.lift < this.prevLift - 1e-5 && cy < 0.4) {
      const a = m.carry.getWorldPosition(_w);
      releaseCarried(this, supportUnder(a.x, a.z, this));
    }
    if (this.tilt > 0.45 && !this.unloaded) { this.unloaded = true; this.unloadDeck(driven); }
    if (this.tilt < 0.1) this.unloaded = false;
  }

  /** 데크를 들면 위치에 따라: 축사 통로 → 사료 / 보관소·배합장 → 칸에 정리 / 그 외 → 뒤에 내려놓기 */
  unloadDeck(driven) {
    const cargo = truckCargo(this).filter((it) => !it.fly);
    if (!cargo.length) return;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = this.pos.x - fx * 6.2, rz = this.pos.z - fz * 6.2;
    const barn = barnAlleyAt(this.pos.x, this.pos.z) || barnAlleyAt(rx, rz);
    if (barn) {
      let n = 0;
      for (const it of cargo) {
        if (barn.feed > 100 - BALE_FEED * 0.6) break;
        barn.addFeed(baleKind(it).feed, null);
        it.remove();
        n++;
      }
      burst('hay', rx, 1.0, rz, 10 + n * 6, { vy: 3.5 });
      if (n) { sfx('pop'); floatText(rx, 2.4, rz, `+사료 🌾 ×${n}`, 'good'); }
      else if (driven) toast(`${barn.name} 사료가 이미 넉넉해요`, '🌾');
      this.ai.forBarn = null;
      return;
    }
    // 판매소: 남는 베일 팔기
    if (nearMarket(this.pos, 5) || nearMarket({ x: rx, z: rz }, 3)) {
      sellItems(cargo, LAYOUT.market);
      return;
    }
    const y = LAYOUT.yard;
    const nearYard = Math.hypot(this.pos.x - y.x, this.pos.z - y.z) < 9 || inYard(rx, rz);
    const nearStation = Math.hypot(this.pos.x - LAYOUT.station.bay.x, this.pos.z - LAYOUT.station.bay.z) < 7 || inStation(rx, rz, 2);
    let i = 0;
    // 일꾼(자동)은 보관소·배합장 칸이 모자라면 남은 베일을 데크에 그대로 싣고 다른 곳으로 간다
    // (예전에는 아무 데나 내려놓고 → 그걸 다시 집으러 가며 맴돌았다)
    const keepRest = !driven && (nearYard || nearStation);
    for (const it of cargo) {
      if (nearStation) {
        const slot = freeStationSlot(this);
        if (slot) { setOnStation(it, slot); it.pop = 0.4; continue; }
      }
      if (nearYard) {
        const slot = freeYardSlot(this);
        if (slot) { it.placeAt(slot.x, slot.z, Math.PI / 2); it.pop = 0.4; continue; }
      }
      if (keepRest) continue;
      const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
      const back = 1.0 + Math.floor(i / 2) * 1.5, side = (i % 2 ? 1 : -1) * 0.7;
      it.placeAt(rx - fx * back + lx * side, rz - fz * back + lz * side, this.heading);
      it.pop = 0.4;
      i++;
    }
    sfx('drop');
    if (driven) floatText(rx, 2.4, rz, nearStation ? '배합장에 하차!' : nearYard ? '건초 보관소에 하차!' : '건초 하차!', 'good');
  }

  /** 간편 모드 Space */
  wagonQuick() {
    if (this.carrying) { this.seq = [{ lift: 1, dur: 1.2 }, { lift: 0.3, dur: 0.6 }]; return; }
    const it = itemInFront(this, 2.2, 5.0, 1.3);
    if (it && it.support.kind === 'ground') {
      this.seq = [{ lift: 0, tilt: 0, dur: 0.6 }, { fn: () => { if (!it.carriedBy && !it.removed) pickupItem(this, it); }, dur: 0.1 }, { lift: 1, dur: 1.2 }, { lift: 0.3, dur: 0.6 }];
      return;
    }
    if (truckCargo(this).length) { this.seq = [{ tilt: 0.6, dur: 1.7 }, { tilt: 0, dur: 1.5 }]; return; }
    toast('앞에 건초가 없어요. 건초 더미 앞으로 가서 Space를 눌러요', '🚛', 2200);
  }

  taskWagon() {
    const cargo = truckCargo(this).filter((it) => !it.fly).length;
    const cap = this.m.slots.length;
    if (this.carrying) { this.liftT = 1; return null; }
    const ai = this.ai;
    // 보관소·배합장 근처에 내려 둔 베일은 '보관 중' → 다시 집지 않는다 (집었다 내렸다 맴돌기 방지)
    const Y = LAYOUT.yard, SB = LAYOUT.station.bay;
    const stored = (p) => inYard(p.x, p.z) || Math.hypot(p.x - Y.x, p.z - Y.z) < 11 || inStation(p.x, p.z, 1) || Math.hypot(p.x - SB.x, p.z - SB.z) < 9;
    const fid = this.assign?.field;
    let best = null, bd = Infinity;
    for (const it of G.items) {
      if (it.kind !== 'bale' || it.carriedBy || it.removed || it.fly || it.support.kind !== 'ground') continue;
      if (stored(it.pos) || nearMarket(it.pos, 2)) continue;
      if ((it.reservedBy && it.reservedBy !== this) || it.unreachable > G.now) continue;
      if (fid) { const f = G.fields.find((q) => q.id === fid); const a = f?.area(5); if (a && !(it.pos.x > a.minX && it.pos.x < a.maxX && it.pos.z > a.minZ && it.pos.z < a.maxZ)) continue; }
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    // 한번 배달하러 나서면 데크를 다 비울 때까지 배달만 한다 (실으러 갔다 내리러 갔다 오락가락 방지)
    if (!cargo) ai.wDeliver = false;
    if (cargo >= cap || (cargo > 0 && (!best || bd > 45))) ai.wDeliver = true;
    const unloadSeq = () => { this.seq = [{ tilt: 0.6, dur: 1.7 }, { tilt: 0, dur: 1.5 }]; };
    if (ai.wDeliver) {
      const deck = truckCargo(this).filter((it) => !it.fly);
      const corn = deck.filter((it) => it.product === 'corn').length;
      const st = stock();
      const S = LAYOUT.station;
      const drop = (key, x, z, label) => ({ kind: 'drop', key, center: true, x, z, arrive: 2.6, label, prep: () => { this.liftT = 0.3; }, onArrive: unloadSeq });
      // 옥수수 사일리지는 배합장 원료로 먼저
      if (corn && st.corn < 4 && freeStationSlot(this)) return drop('wstation', S.bay.x, S.bay.z + 3, '배합장에 옥수수 사일리지 내리는 중 🌽');
      const barn = this.neededBarn(65);
      if (barn) {
        ai.forBarn = barn;
        return { kind: 'drop', key: 'wfeed' + barn.uid, center: true, x: barn.cx, z: barn.front - 9, arrive: 2.4, label: `${barn.name} 통로에 건초 내리는 중 🌾`, slow: 0.7, prep: () => { this.liftT = 0.3; }, onArrive: unloadSeq };
      }
      if (deck.length > corn && st.hay < 2 && freeStationSlot(this)) return drop('wstation', S.bay.x, S.bay.z + 3, '배합장에 건초 내리는 중 🥣');
      if (freeYardSlot(this)) return drop('wyard', Y.x, Y.z + 7.5, '건초 보관소에 내리는 중');
      if (corn && freeStationSlot(this)) return drop('wstation', S.bay.x, S.bay.z + 3, '배합장에 옥수수 사일리지 내리는 중 🌽');
      // 둘 곳이 하나도 없으면 남는 베일은 판매소에서 팔기
      const M = LAYOUT.market;
      return { kind: 'drop', key: 'wsell', center: true, x: M.x, z: M.z, arrive: 3.2, label: '보관소가 가득 · 남는 베일 팔러 가는 중 🏪', prep: () => { this.liftT = 0.3; }, onArrive: unloadSeq };
    }
    if (best) {
      const it = best;
      return {
        kind: 'pickup', key: 'witem' + it.id, item: it, x: it.pos.x, z: it.pos.z, arrive: 1.1, label: `밭에서 베일 싣는 중 🚛 (${cargo}/${cap})`,
        valid: () => !it.carriedBy && !it.removed && it.support.kind === 'ground',
        // 집게 사이에 들어오면 바로 집는다 (정확히 한 점을 맞추려고 빙빙 돌지 않기)
        done: () => itemInFront(this, 2.2, 5.2, 1.4) === it,
        prep: () => {
          this.tiltT = 0;
          const dx = it.pos.x - this.pos.x, dz = it.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          this.liftT = d < 10 ? 0 : 0.3;
          // 너무 가까운데 옆·뒤에 있으면: 그 자리에서 돌지 말고 살짝 후진해서 정면으로 다시 들어간다
          const ang = wrapAngle(Math.atan2(dx, dz) - this.heading);
          if (d < 6.5 && Math.abs(ang) > 0.75 && !(ai.reverseT > 0) && G.now > (ai.wBackCD || 0)) {
            ai.wBackCD = G.now + 3;
            ai.reverseT = 1.6; ai.revSteer = -Math.sign(ang); ai.path = null;
          }
        },
        onArrive: () => {
          const ok = itemInFront(this, 2.2, 5.2, 1.4) === it;
          if (!ok) { it.unreachable = G.now + 15; return; }
          this.seq = [{ lift: 0, dur: 0.25 }, { fn: () => { if (!it.carriedBy && !it.removed) pickupItem(this, it); }, dur: 0.05 }, { lift: 1, dur: 1.2 }, { lift: 0.3, dur: 0.5 }];
        },
      };
    }
    this.idleStatus = '옮길 베일이 없어요';
    return null;
  }

  tintLoad(group, kind) {
    const want = kind === 'compost' ? 'compost' : 'manure';
    if (group.userData.kind === want) return;
    group.userData.kind = want;
    const m = want === 'compost' ? mat(0x4e3828) : mat(0x8b6a4f);
    group.traverse((o) => { if (o.isMesh) o.material = m; });
  }

  /** 방금 내려놓은 짐은 잠깐 동안 다시 집지 않는다 (포크를 살짝 올릴 때 재집기 방지) */
  canGrab(it) {
    return it !== this.lastDrop || G.now - (this.lastDropT || 0) > 3;
  }

  dumpLoad() {
    const a = this.m.carry.getWorldPosition(_w);
    const x = a.x, z = a.z, y = a.y;
    const sp = supportUnder(x, z, this, 0.8);
    const truck = sp.kind === 'truck' && y > sp.y + 0.2 ? sp.truck : null;
    depositBulk(this.loadKind || 'manure', this.load, x, z, { manual: !!this.driver, truck, y: sp.y + 0.5, pad: 0.6 });
    this.load = 0;
    this.loadKind = null;
  }

  animate(dt, st) {
    if (this.kitBob) animateFlag(this, G.now || 0);
    if (this.def.air) { this.animateAir(dt, st); return; }
    const m = this.m;
    const driven = !!this.driver;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    for (const w of m.wheels) {
      let v = this.speed;
      if (this.def.skid) v -= w.side * st * this.def.turn * 0.8;
      w.spin.rotation.x += (v * dt) / w.r;
    }
    this.steerVis = damp(this.steerVis, st * 0.5, 10, dt);
    for (const s of m.steer) s.rotation.y = m.rearSteer ? -this.steerVis : this.steerVis;
    const acc = (this.speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = this.speed;
    this.accSm = damp(this.accSm, acc, 6, dt);
    m.body.rotation.x = clamp(-this.accSm * 0.008, -0.05, 0.05);
    const running = driven || (this.auto && (Math.abs(this.speed) > 0.05 || this.ai.task || this.seq));
    m.body.position.y = running ? Math.sin(G.now * 38 + this.id) * 0.012 + Math.sin(G.now * 12) * 0.01 * Math.min(1, Math.abs(this.speed)) : 0;
    const mine = this.driver === G.player;
    this.playerFig.group.visible = driven && !(mine && G.cam.fp);
    const hideGlass = mine && G.cam.fp;
    for (const gl of this.glass) gl.visible = !hideGlass;
    this.npcFig.group.visible = !driven && this.auto;
    if (m.beacon) m.beacon.material = running && Math.sin(G.now * 8) > 0 ? this.beaconOn : this.beaconOff;
    if (this.def.push && driven) {
      // 미는 사람 걸음
      const f = this.playerFig, a = Math.min(1, Math.abs(this.speed) / 4);
      this.walkPh = (this.walkPh || 0) + dt * (6 + Math.abs(this.speed) * 1.8) * Math.sign(this.speed || 1);
      const sw = Math.sin(this.walkPh) * a;
      f.legs[0].rotation.x = sw * 0.8; f.legs[1].rotation.x = -sw * 0.8;
      f.root.position.y = Math.abs(Math.sin(this.walkPh)) * 0.07 * a;
      m.body.position.y = 0;
    }
    if (running && !this.def.push) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.boosting ? 0.05 : 0.12 + (1 - Math.min(1, Math.abs(this.speed) / this.def.maxSpeed)) * 0.3;
        m.exhaust.getWorldPosition(_w);
        spawn('smoke', _w.x, _w.y, _w.z, { vy: 1.4, vx: rand(-0.2, 0.2), vz: rand(-0.2, 0.2), life: this.boosting ? 0.8 : 1.1, size: this.boosting ? 1.0 : 0.7 });
      }
    }
    if (Math.abs(this.speed) > 3) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = this.boosting ? 0.05 : 0.12;
        const back = this.isTruck ? 3.5 : 1.3;
        const bx = this.pos.x - Math.sin(this.heading) * back, bz = this.pos.z - Math.cos(this.heading) * back;
        spawn('dust', bx + rand(-0.6, 0.6), 0.2, bz, { vy: 0.6, life: 0.8, size: this.boosting ? 1.2 : 0.8 });
      }
    }
  }

  /** 자동 모드로 일하는 차 (사람이 운전하지 않음): 다른 차·사람과 부딪히지 않고 통과한다 */
  passThrough() { return this.auto && !this.driver; }

  /** 부딪혔을 때 덜 밀리는 정도 (직접 운전 > 일하는 일꾼 차 > 쉬는 차) */
  pushPriority() {
    if (!!this.driver) return 4;
    if (this.ai.task?.kind === 'yield') return 0.6;
    if (this.auto && this.ai.task && this.ai.task.kind !== 'park') return 2;
    return 1;
  }

  /** 쉬는 일꾼 차가 다가오는 차량(by)의 길에서 옆으로 비켜 준다 */
  yieldTo(by) {
    if (!!this.driver || this.seq || this.carrying || this.def.push) return false;   // 손수레·리어카는 혼자 움직이지 않는다
    const t = this.ai.task;
    if (t && t.kind !== 'park') return false;
    if (G.now < (this.yieldCD || 0)) return false;
    const fx = Math.sin(by.heading), fz = Math.cos(by.heading);
    const ox = this.pos.x - by.pos.x, oz = this.pos.z - by.pos.z;
    const lat = ox * fz - oz * fx;
    const first = lat >= 0 ? 1 : -1;
    for (const side of [first, -first]) {
      for (const dist of [5.5, 7.5]) {
        const x = this.pos.x + fz * side * dist + fx * 1.5, z = this.pos.z - fx * side * dist + fz * 1.5;
        if (!isFree(x, z) || !lineClear(this.pos.x, this.pos.z, x, z)) continue;
        // 비킬 자리와 가는 길에 다른 차가 없어야 한다
        const crowded = G.vehicles.some((o) => {
          if (o === this || o.airborne) return false;
          const gap = this.radius + o.radius + 1.2;
          if (Math.hypot(o.pos.x - x, o.pos.z - z) < gap + 1) return true;
          const sx = x - this.pos.x, sz = z - this.pos.z, L2 = sx * sx + sz * sz;
          const u = clamp(((o.pos.x - this.pos.x) * sx + (o.pos.z - this.pos.z) * sz) / L2, 0, 1);
          return Math.hypot(this.pos.x + sx * u - o.pos.x, this.pos.z + sz * u - o.pos.z) < gap;
        });
        if (crowded) continue;
        this.yieldCD = G.now + 6;
        this.ai.task = { kind: 'yield', key: 'yield', center: true, x, z, arrive: 1.4, label: '길 비켜주는 중 🙇' };
        this.ai.path = null;
        this.ai.think = 3;
        this.ai.reverseT = 0;
        return true;
      }
    }
    this.yieldCD = G.now + 2;
    return false;
  }

  /** 앞에 서 있는 쉬는 차들에게 비켜 달라고 한다 */
  askYield() {
    if (Math.abs(this.speed) < (!!this.driver ? 0.8 : 0.2)) return;
    const dir = this.speed < -0.2 ? -1 : 1;
    const fx = Math.sin(this.heading) * dir, fz = Math.cos(this.heading) * dir;
    for (const o of G.vehicles) {
      if (o === this || o.def.air || Math.abs(o.speed) > 0.3) continue;
      const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
      const fwd = ox * fx + oz * fz;
      if (fwd <= 0 || fwd > 9) continue;
      if (Math.abs(ox * fz - oz * fx) > this.radius + o.radius + 0.8) continue;
      // 일꾼의 목적지가 바로 그 차 옆이면 굳이 비키게 하지 않는다
      const t = this.ai.task;
      if (t && !this.driver && Math.hypot(t.x - o.pos.x, t.z - o.pos.z) < 2.5) continue;
      o.yieldTo(this);
    }
  }

  syncVisual() {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
  }

  // ---------------- 자동 운용 AI ----------------
  think(dt) {
    const ai = this.ai;
    if (this.seq) { this.status = ai.task?.label || this.status; return [0, 0]; }
    if (ai.reverseT > 0 && !ai.task) { ai.reverseT -= dt; return [-0.6, ai.revSteer]; }
    ai.think -= dt;
    if (!ai.task) {
      if (ai.think > 0) { this.status = this.idleStatus; this.idlePose(); return [0, 0]; }
      this.chooseTask();
      ai.think = 2.5;
      if (!ai.task) { this.status = this.idleStatus; this.idlePose(); return [0, 0]; }
    } else if (ai.think <= 0 || (ai.task.valid && !ai.task.valid())) {
      if (!this.auto) { ai.task = null; ai.path = null; return [0, 0]; }
      this.chooseTask();
      ai.think = 2.5;
      if (!ai.task) return [0, 0];
    }
    const task = ai.task;
    this.status = task.label;
    task.prep?.();

    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      if (ai.reverseT <= 0) ai.path = null;
      return [-0.6, ai.revSteer];
    }

    const fp = this.workPoint();
    const dC = Math.hypot(task.x - this.pos.x, task.z - this.pos.z);
    const dF = Math.hypot(task.x - fp.x, task.z - fp.z);
    // 밭일(work)은 작업 지점(앞쪽 예초기·픽업)이 칸 위를 지나가야 한다:
    // 칸이 차체 바로 밑에 있다고 '도착'으로 치면 제자리에서 같은 칸을 끝없이 다시 고르며 멈춰 버린다
    const arrived = task.center ? dC < (task.arrive ?? 1.4) : dF < task.arrive || (dC < 0.9 && task.kind !== 'work');
    // 밭일: 작업기가 아직 덜 내려가 칸을 못 벤 채 도착했으면 멈추지 말고 천천히 앞으로 (멈추면 같은 칸만 계속 고르며 서 버린다)
    if (arrived && task.kind === 'work' && task.valid?.()) return [0.45, 0];
    if (arrived || task.done?.()) return this.arrive(task);
    // 밭일 칸이 작업 지점보다 뒤(차 밑)에 있으면: 곧게 조금 후진했다가 다시 지나가며 작업
    if (task.kind === 'work' && !this.def.skid) {
      const ax = task.x - this.pos.x, az = task.z - this.pos.z;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const along = ax * fx + az * fz, lat = Math.abs(ax * fz - az * fx);
      if (along < this.def.work - 0.4 && along > -this.backReach && lat < 2.2) {
        ai.reverseT = 1.1; ai.revSteer = 0; ai.path = null;
        return [-0.6, 0];
      }
    }

    if (!ai.path || ai.pathFor !== task) this.plan(task);
    const path = ai.path;
    // 다음 지점으로 넘어가기: 출입구 지점(tight)은 거의 밟아야, 일반 지점은 다음 지점이 곧게 보일 때만 (모서리 깎기 방지)
    while (ai.idx < path.length - 1) {
      const p = path[ai.idx], dd = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      const nx = path[ai.idx + 1];
      // 이미 지나쳤으면(다음 지점 쪽으로 넘어섰으면) 되돌아가 맴돌지 말고 다음으로 — 긴 차가 지점을 살짝 놓쳐 빙빙 도는 것 방지
      const sx = nx.x - p.x, sz = nx.z - p.z, sl = Math.hypot(sx, sz) || 1;
      const ox = this.pos.x - p.x, oz = this.pos.z - p.z;
      const lateral = Math.abs(ox * sz - oz * sx) / sl;   // 출입 지점은 옆으로 많이 벗어난 채 지나치면 인정하지 않음 (곧게 들어가야 하므로)
      const passed = dd < (p.tight ? 3.5 : 4) && ox * sx + oz * sz > 0 && (!p.tight || lateral < 1.6);
      if (passed) { ai.idx++; continue; }
      if (dd >= (p.tight ? 1.4 : 2.2)) break;
      if (!p.tight && dd > 0.9 && !lineClear(this.pos.x, this.pos.z, nx.x, nx.z, 1.3)) break;
      ai.idx++;
    }
    const wp = path[ai.idx];
    const last = ai.idx === path.length - 1;
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (last && d < 1.0 && task.kind !== 'work') return this.arrive(task);

    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - this.heading);
    const steer = clamp(diff * 2.2, -1, 1);
    let thr;
    if (this.def.skid) thr = Math.abs(diff) > 0.9 ? 0.05 : 1 - Math.abs(diff) * 0.6;
    else thr = 1 - Math.min(1, Math.abs(diff) / 1.6) * 0.75;
    if (last) thr *= clamp(d / 5, 0.35, 1);
    if (task.slow) thr *= task.slow;

    // 통로·주차 칸 출구(tight 지점)가 뒤쪽이면 그 안에서 돌지 말고 곧게 후진해서 빠져나온다
    if (!this.def.skid && wp.tight && Math.abs(diff) > 1.9 && d < 12) {
      const want = Math.abs(wrapAngle(this.heading)) < Math.PI / 2 ? 0 : Math.PI;   // 통로 방향(남북)에 맞춰
      const err = wrapAngle(want - this.heading);
      return this.stuckCheckRev(dt, [-0.55, clamp(-err * 2.5, -1, 1)]);
    }
    if (!this.def.skid && Math.abs(diff) > 2.1 && d < 5) {
      ai.reverseT = this.isTruck ? 1.6 : 1.1; ai.revSteer = -Math.sign(diff);
      return [-0.6, ai.revSteer];
    }
    // 크게 돌아야 하는데 돌 쪽이 좁으면: 제자리에서 크게 돌다 꽁무니로 기둥을 치지 말고 '세 번 꺾어 돌기'(후진하며 방향 틀기)
    if (!this.def.skid && Math.abs(diff) > 1.7 && this.speed > -0.1 && G.now > (ai.kTurnCD || 0) && !G.barns.some((bb) => bb.contains(this.pos.x, this.pos.z, 2))) {
      const sgn = Math.sign(diff), R = this.frontReach + 1.6;
      const turnSide = clearanceAt(this.pos.x + Math.sin(this.heading + sgn * 0.9) * R, this.pos.z + Math.cos(this.heading + sgn * 0.9) * R);
      const rear = clearanceAt(this.pos.x - Math.sin(this.heading) * (this.backReach + 1.2), this.pos.z - Math.cos(this.heading) * (this.backReach + 1.2));
      if (turnSide < this.navNeed + 0.6 && rear > this.navNeed) {
        ai.kTurnCD = G.now + 4;
        ai.reverseT = this.isTruck || this.def.wagon ? 1.5 : 1.1; ai.revSteer = -sgn;
        return [-0.6, ai.revSteer];
      }
    }

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let blocked = false, avoid = 0, crawl = false, oncoming = null, blockLat = 0, animalAhead = false;
    // 앞 감지: 진행 방향에 나무·벽 모서리가 있으면 미리 비어 있는 쪽으로 핸들을 튼다
    // (목적지 바로 앞이나 축사 안처럼 일부러 가까이 가는 곳에서는 끔)
    const reach = this.frontReach;
    const inBarn = G.barns.some((bb) => bb.contains(this.pos.x, this.pos.z, 7));   // 축사 근처(출입·팔레트 자리)에서는 정해 둔 길만 따른다
    if (!inBarn && this.speed > 0.2 && dC > reach + 4 && !(last && d < reach + 2.5)) {
      const look = reach + 0.6 + Math.min(3, this.speed * 0.35);
      const probe = (a, L = look) => clearanceAt(this.pos.x + Math.sin(this.heading + a) * L, this.pos.z + Math.cos(this.heading + a) * L);
      const rF = this.def.circles.reduce((m, [o, r]) => (o + r >= reach - 0.01 ? Math.max(m, r) : m), 0.8);
      const want0 = rF + 0.45;
      const c0 = Math.min(probe(0), probe(0, look * 0.6));
      if (c0 < want0) {
        const cl = probe(0.6) + probe(0.3) * 0.5, cr = probe(-0.6) + probe(-0.3) * 0.5;
        const side = cl === cr ? (diff >= 0 ? 1 : -1) : cl > cr ? 1 : -1;
        avoid += side * Math.min(1.4, 0.5 + (want0 - c0) * 1.2);
        if (c0 < rF + 0.1) crawl = true;   // 거의 닿을 듯하면 천천히
      }
    }
    // 꽁무니 휘두름 확인: 차는 가운데를 축으로 돌아서, 꺾는 반대쪽으로 꽁무니가 밀려 나간다 (긴 트럭·베일 운반차)
    if (!this.def.skid && Math.abs(steer + avoid) > 0.35 && this.speed > 0.2 && !G.barns.some((bb) => bb.contains(this.pos.x, this.pos.z, 0))) {
      const sgn = Math.sign(steer + avoid), bk = this.backReach - 0.3;
      const rx = this.pos.x - Math.sin(this.heading) * bk, rz = this.pos.z - Math.cos(this.heading) * bk;
      const sx = -Math.cos(this.heading) * sgn * 0.9, sz = Math.sin(this.heading) * sgn * 0.9;   // 꽁무니가 밀려 가는 쪽
      const rB = this.def.circles.reduce((m, [o, r]) => (r - o >= this.backReach - 0.01 ? Math.max(m, r) : m), 0.8);
      const cRear = clearanceAt(rx + sx, rz + sz);
      if (cRear < rB + 0.25) { avoid -= (steer + avoid) * 0.6; crawl = true; }   // 덜 꺾고 천천히
    }
    for (const o of (this.passThrough() ? [] : G.vehicles)) {
      if (o === this || o.airborne) continue;
      const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
      const od = Math.hypot(ox, oz);
      if (od > 9) continue;
      const fwd = ox * fx + oz * fz;
      if (fwd <= 0) continue;
      const lat = ox * fz - oz * fx;
      if (Math.abs(lat) > this.radius + o.radius + 0.5) continue;
      const movingOther = Math.abs(o.speed) > 0.3 || !!o.driver;
      if (movingOther) {
        if (od < this.radius + o.radius + 2.5 + (o.isTruck || this.isTruck ? 2 : 0) && (o.id < this.id || !!o.driver)) {
          blocked = true;
          // 마주 오는 차(또는 직접 운전 차)면 기다리지 말고 비켜야 한다
          const head = Math.sin(o.heading) * fx + Math.cos(o.heading) * fz;
          if (head < 0.3 || !!o.driver) { oncoming = o; blockLat = lat; }
        }
      } else if (Math.hypot(task.x - o.pos.x, task.z - o.pos.z) > 2.5) {
        avoid += (lat >= 0 ? -1 : 1) * (1 - od / 9) * 1.6;
      }
    }
    for (const pl of walkers()) {
      const p = pl.pos;
      const ox = p.x - this.pos.x, oz = p.z - this.pos.z, od = Math.hypot(ox, oz);
      const fwd = ox * fx + oz * fz, lat = ox * fz - oz * fx;
      if (fwd > 0 && od < 8 && Math.abs(lat) < this.radius + 1.4) {
        avoid += (lat >= 0 ? -1 : 1) * (1 - od / 8) * 2.2;
        if (od < this.radius + 2.2) { crawl = true; this.status = '잠깐만요! 지나갈게요'; }
      }
    }
    for (const b of G.barns) {
      if (!b.contains(this.pos.x, this.pos.z, 2)) continue;
      for (const a of b.animals) {
        const ox = a.pos.x - this.pos.x, oz = a.pos.z - this.pos.z;
        const fwd = ox * fx + oz * fz, lat = ox * fz - oz * fx;
        if (fwd > 0 && fwd < this.def.work + 2 && Math.abs(lat) < 1.6) { crawl = true; animalAhead = true; this.status = '동물들아 비켜줘~'; }
      }
    }
    if (blocked) {
      // 같은 방향으로 가는 앞차는 그냥 기다리고, 마주 오는 차에게는 빨리 옆으로 비켜 후진
      ai.wait += oncoming ? dt : dt * 0.3;
      const lim = oncoming ? (!!oncoming.driver ? 0.5 : 1.2) : 4;
      if (ai.wait > lim) {
        ai.wait = 0;
        ai.reverseT = this.isTruck ? 1.8 : 1.4;
        ai.revSteer = oncoming ? (blockLat >= 0 ? 1 : -1) * (this.def.skid ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
        ai.path = null;
      }
      return [0, clamp(steer + (blockLat >= 0 ? -0.6 : 0.6), -1, 1)];
    }
    ai.wait = 0;
    // 스키드로더는 동물이 비켜 가며(밀려나며) 지나가므로 너무 기어가지 않는다
    if (crawl) return [Math.min(thr, animalAhead && this.def.skid ? 0.6 : 0.3), clamp(steer + avoid, -1, 1)];
    if (avoid) return this.stuckCheck(dt, thr * 0.7, clamp(steer + avoid, -1, 1), diff);
    return this.stuckCheck(dt, thr, steer, diff);
  }

  /**
   * 끼임 감시 장치: 같은 일을 붙잡은 채 오래 못 움직이면 단계적으로 빼낸다
   * 8초: 길 다시 찾기 + 넓은 쪽으로 후진 → 14초: 잠깐 장애물 통과 → 20초: 가장 가까운 빈 자리로 옮기기
   * (작업 동작 중이거나 일거리를 기다리며 서 있는 건 끼임이 아님)
   */
  watchdog(dt) {
    const ai = this.ai, w = (ai.wd ||= { x: this.pos.x, z: this.pos.z, t: 0, key: null, stage: 0 });
    const key = ai.task?.key ?? null;
    if (!key || this.seq || key !== w.key || Math.hypot(this.pos.x - w.x, this.pos.z - w.z) > 1.5) {
      w.x = this.pos.x; w.z = this.pos.z; w.t = 0; w.key = key; w.stage = 0;
      return;
    }
    w.t += dt;
    if (w.stage === 0 && w.t > 8) {
      w.stage = 1;
      ai.path = null;
      const back = this.backReach + 1.2, lx = Math.cos(this.heading) * 1.5, lz = -Math.sin(this.heading) * 1.5;
      const bx = this.pos.x - Math.sin(this.heading) * back, bz = this.pos.z - Math.cos(this.heading) * back;
      const cL = clearanceAt(bx + lx, bz + lz), cR = clearanceAt(bx - lx, bz - lz);
      ai.reverseT = 1.6; ai.revSteer = (cL >= cR ? 1 : -1) * (this.def.skid ? -1 : 1);
    } else if (w.stage === 1 && w.t > 14) {
      w.stage = 2;
      ai.ghostT = 3; ai.reverseT = 0; ai.path = null;
    } else if (w.stage === 2 && w.t > 20) {
      // 정말 좁은 곳에 끼었을 때만 옮긴다 (넓은 곳이면 길만 다시 찾기)
      const spot = clearanceAt(this.pos.x, this.pos.z) < this.navNeed ? nearestOpenSpot(this.pos.x, this.pos.z, this.navNeed) : null;
      if (spot) { this.pos.x = spot.x; this.pos.z = spot.z; this.speed = 0; this.syncVisual?.(); }
      ai.path = null; ai.ghostT = 0;
      w.x = this.pos.x; w.z = this.pos.z; w.t = 0; w.stage = 0;
    }
  }

  /** 곧게 후진하는 중에 뒤가 막혀 못 움직이면: 길을 다시 찾게 한다 */
  stuckCheckRev(dt, out) {
    const ai = this.ai;
    if (Math.abs(this.speed) < 0.2) ai.revStuck = (ai.revStuck || 0) + dt; else ai.revStuck = 0;
    if (ai.revStuck > 1.5) { ai.revStuck = 0; ai.path = null; ai.reverseT = 0; return [0.5, out[1]]; }
    return out;
  }

  /** 막혔으면 목표 쪽으로 머리를 돌리며 후진 (반복되면 더 길게) */
  stuckCheck(dt, thr, steer, diff = 0) {
    const ai = this.ai;
    if (thr > 0.2 && Math.abs(this.speed) < 0.25) ai.stuck += dt;
    else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 1.4) {
      ai.stuck = 0;
      ai.stuckCount = G.now - (ai.lastStuck || 0) < 8 ? (ai.stuckCount || 0) + 1 : 1;
      ai.lastStuck = G.now;
      ai.reverseT = Math.min(3, 1.1 + ai.stuckCount * 0.5);
      if (this.passThrough() && ai.stuckCount >= 3) { ai.ghostT = 2.5; ai.reverseT = 0; }   // 세 번 이상 연속으로 막히면 잠깐 통과해서 빠져나가기
      ai.revSteer = Math.abs(diff) > 0.2 ? -Math.sign(diff) : (Math.random() < 0.5 ? -1 : 1);
      {
        // 후진할 때 차 뒤쪽 좌우 중 더 넓은 쪽으로 (후진은 핸들 방향이 반대로 먹으므로 그만큼 고려)
        const back = this.backReach + 1.2;
        const bx = this.pos.x - Math.sin(this.heading) * back, bz = this.pos.z - Math.cos(this.heading) * back;
        const lx = Math.cos(this.heading) * 1.5, lz = -Math.sin(this.heading) * 1.5;
        const cL = clearanceAt(bx + lx, bz + lz), cR = clearanceAt(bx - lx, bz - lz);
        if (Math.abs(cL - cR) > 0.4) ai.revSteer = (cL > cR ? 1 : -1) * (this.def.skid ? -1 : 1);
      }
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      let near = null, nd = 6;
      for (const o of G.vehicles) {
        if (o === this || o.def.air) continue;
        const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z, od = Math.hypot(ox, oz) - o.radius;
        if (od < nd && ox * fx + oz * fz > 0) { nd = od; near = o; }
      }
      if (near) {
        const lat = (near.pos.x - this.pos.x) * fz - (near.pos.z - this.pos.z) * fx;
        ai.revSteer = (lat >= 0 ? 1 : -1) * (this.def.skid ? -1 : 1);
        near.yieldTo(this);
      }
      ai.path = null;
    }
    return [thr, steer];
  }

  idlePose() {
    if (this.type === 'mixer') { this.pto = false; this.tiltT = 0; }
    if (this.type === 'balewagon' && !this.carrying) { this.liftT = 0.3; this.tiltT = 0; }
    if (this.type === 'tractor' || this.type === 'baler') { this.pto = false; this.liftT = 1; }
    if (this.type === 'forklift' && !this.carrying) { this.liftT = 0.1; this.tiltT = -0.04; }
    if (this.type === 'skid' && !this.carrying && this.load < 0.5) { this.liftT = 0.12; this.tiltT = 0; }
  }

  arrive(task) {
    const ai = this.ai;
    ai.task = null;
    ai.path = null;
    ai.think = task.kind === 'park' ? 2.5 : 0;
    task.onArrive?.();
    return [0, 0];
  }

  plan(task) {
    const ai = this.ai;
    ai.pathFor = task;
    ai.idx = 0;
    const need = this.navNeed;
    const pos = this.pos;
    // 배합기 급여: 통로 한가운데를 따라 앞에서 뒤로 곧게 (이미 통로 안이면 남은 구간만)
    if (task.through) {
      const b = task.through;
      const lane = [{ x: b.cx, z: b.front + 2, tight: true }, { x: b.cx, z: b.back + 1, tight: true }].filter((q) => q.z < pos.z - 0.5);
      const inAlley = barnAlleyAt(pos.x, pos.z) === b;
      const first = lane[0] || task;
      const lead = inAlley || lineClear(pos.x, pos.z, first.x, first.z, need) ? [] : (findPath(pos.x, pos.z, first.x, first.z, need) || []).slice(0, -1);
      ai.path = [...lead, ...lane, { x: task.x, z: task.z }];
      return;
    }
    // 축사 통로·우리, 주차 칸은 '곧게 들어가고 곧게 나오기': 문 밖까지 일직선으로 뺀 다음에 꺾는다
    // (긴 차가 바로 꺾으면 차 꽁무니가 벽 끝·기둥을 긁기 때문)
    const out = 3.5 + this.backReach;
    const from = this.laneAt(pos.x, pos.z), to = this.laneAt(task.x, task.z);
    const same = from && to && from.b === to.b && Math.abs(from.x - to.x) < 0.5;
    const pre = [], post = [];
    const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const ends = (L) => [{ edge: L.front, dir: 1 }, { edge: L.back, dir: -1 }];
    const outAt = (x, edge, dir) => {
      let best = out, bc = -1;
      for (const k of [0, 1, -1, 2, 3, -2]) {
        const o = out + k, c = clearanceAt(x, edge + dir * o);
        if (c >= need + 0.4) return o;
        if (c > bc) { bc = c; best = o; }
      }
      return best;
    };
    if (to && !same) {
      const hint = from ? { x: from.x, z: (from.front + from.back) / 2 } : pos;
      const opts = ends(to).map((q) => ({ ...q, o: { x: to.x, z: q.edge + q.dir * out } })).sort((a, b) => hyp(hint, a.o) + hyp(a.o, task) - hyp(hint, b.o) - hyp(b.o, task));
      const e = (task.enterDir && opts.find((q) => q.dir === task.enterDir)) || opts[0];   // 들어갈 문을 정해 둔 일(스키드 쓸기)은 그 문으로
      post.push({ x: to.x, z: e.edge + e.dir * outAt(to.x, e.edge, e.dir), tight: true }, { x: to.x, z: e.edge - e.dir * 1.5, tight: true });
    }
    if (from && !same) {
      const goal = post[0] || task;
      const fz = Math.cos(this.heading);
      const turnCost = (q) => (Math.sign(fz) !== q.dir && Math.abs(fz) > 0.3 ? 25 + this.backReach * 6 : 0);   // 뒤돌아 나가려면 통로 안에서 돌아야 함
      const e = ends(from).map((q) => ({ ...q, o: { x: from.x, z: q.edge + q.dir * out } })).sort((a, b) => hyp(pos, a.o) + hyp(a.o, goal) + turnCost(a) - hyp(pos, b.o) - hyp(b.o, goal) - turnCost(b))[0];
      pre.push({ x: from.x, z: e.edge, tight: true }, { x: from.x, z: e.edge + e.dir * outAt(from.x, e.edge, e.dir), tight: true });
    }
    // 주차 칸: 앞(북쪽)으로 곧게 빠져나왔다가, 들어올 때도 앞에서 곧게 들어온다
    const p = this.park;
    const lot = Math.max(5, this.frontReach + 3.5);
    if (!from && Math.hypot(pos.x - p.x, pos.z - p.z) < 2.5 && Math.hypot(task.x - p.x, task.z - p.z) > 12) pre.push({ x: p.x, z: p.z - lot, tight: true });
    if (task.kind === 'park') post.unshift({ x: p.x, z: p.z - lot, tight: true });
    if (task.via) post.unshift(...task.via.map((q) => ({ ...q, tight: true })));
    // 배합장 앞마당(지붕 아래 원료 칸): 남쪽 정면에서 곧게 들어가고, 나올 때도 곧게 빠져나온다
    const bay = LAYOUT.station.bay, bayOut = Math.max(6, this.frontReach + 3.5);
    const nearBay = (q) => Math.hypot(q.x - bay.x, q.z - bay.z) < 4.5;
    if (nearBay(task) && Math.hypot(pos.x - bay.x, pos.z - bay.z) > bayOut + 2) post.unshift({ x: bay.x, z: bay.z + bayOut, tight: true });
    if (nearBay(pos) && !nearBay(task)) pre.push({ x: bay.x, z: bay.z + bayOut, tight: true });
    const start = pre.length ? pre[pre.length - 1] : pos;
    const end = post.length ? post[0] : task;
    const mid = lineClear(start.x, start.z, end.x, end.z, need, true) ? [{ x: end.x, z: end.z }] : (findPath(start.x, start.z, end.x, end.z, need) || [{ x: end.x, z: end.z }]);
    if (post.length) mid[mid.length - 1] = post[0];
    ai.path = [...pre, ...mid, ...post.slice(1), { x: task.x, z: task.z }];
  }

  /** 축사 통로 정면, 장애물과 가장 여유 있는 접근 지점 */
  approachPoint(barn) {
    let best = null, bc = -1;
    for (const k of [9, 8, 7, 6, 10, 5]) {
      const z = barn.front + k, c = clearanceAt(barn.cx, z);
      if (c >= this.navNeed + 0.3) return { x: barn.cx, z };
      if (c > bc) { bc = c; best = { x: barn.cx, z }; }
    }
    return best;
  }

  /** 그 자리가 축사 통로·우리 안이면 드나드는 길 정보 (x: 문 가운데, front/back: 앞뒤 벽) */
  laneAt(x, z) {
    for (const b of G.barns) {
      if (!b.contains(x, z, -0.2)) continue;
      const a = b.alley;
      if (x > a.minX && x < a.maxX) return { b, x: b.cx, front: b.front, back: b.back };
      for (const pn of b.pens) if (x > pn.minX && x < pn.maxX) return { b, x: pn.gate, front: b.front, back: b.back };
    }
    return null;
  }

  chooseTask() {
    const prev = this.ai.task;
    let t = null;
    if (this.type === 'tractor') t = this.taskTractor();
    else if (this.type === 'baler') t = this.taskBaler();
    else if (this.isTruck) t = this.taskTruck();
    else if (this.type === 'mixer') t = this.taskMixer();
    else if (this.type === 'balewagon') t = this.taskWagon();
    else if (this.def.personal) { this.idleStatus = '주차장에서 쉬는 중'; t = null; }
    else if (this.def.push) { this.idleStatus = '사람이 밀어야 움직여요'; t = null; }
    else t = this.taskHauler();
    if (!t) {
      const p = this.park;
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 1.8) {
        t = { kind: 'park', key: 'park', center: true, x: p.x, z: p.z, label: `주차장으로 · ${this.idleStatus}` };
      }
    }
    if (prev && t && prev.key === t.key) return;
    if (prev?.item && prev.item.reservedBy === this && prev.item !== t?.item) prev.item.reservedBy = null;
    if (t?.item) t.item.reservedBy = this;
    if (t?.kind === 'pickup') this.ai.forBarn = t.forBarn ?? null;
    this.ai.task = t;
    this.ai.path = null;
  }

  // --- 트랙터 / 베일러 ---
  /** 일할 밭들 (담당 밭이 정해져 있으면 그 밭만) */
  workFields() {
    const id = this.assign?.field;
    return G.fields.filter((f) => f.owned && (!id || f.id === id));
  }

  /** 작물별로 베일이 넉넉한지 (넉넉하면 트랙터가 그 작물은 쉬어 간다) */
  cropFull(crop) {
    const corn = crop === 'corn';
    let bales = 0, cut = 0;
    for (const it of G.items) if (it.kind === 'bale' && (it.product === 'corn') === corn) bales++;
    for (const f of G.fields) if (f.owned && (f.crop === 'corn') === corn) cut += f.counts.cut;
    const stock = bales + cut / 4;
    const [lo, hi] = corn ? [12, 20] : [18, 28];
    const r = (this.restCrop ||= {}), k = corn ? 'corn' : 'hay';
    if (r[k] && stock < lo) r[k] = false;
    if (!r[k] && stock >= hi) r[k] = true;
    return r[k];
  }

  /** 여러 밭 중 갈 칸: 지금 있는 밭을 먼저 끝낸다 */
  pickTile(state, fields) {
    const wp = this.workPoint();
    const here = fieldAt(wp.x, wp.z, 1.5);
    let best = null, bv = Infinity;
    for (const f of fields) {
      const r = f.nearestScored(state, wp.x, wp.z, this.heading);
      if (!r) continue;
      const v = r.v + (here && f !== here ? 25 : 0);
      if (v < bv) { bv = v; best = { t: r.t, f }; }
    }
    return best;
  }

  /** 작업기는 가려는 그 밭 안에서만 내린다 (가는 길에 다른 밭을 지나며 베지 않게) */
  fieldPrep(f) {
    const p = this.workPoint();
    const on = f.inside(p.x, p.z, 1.5);
    this.pto = on; this.liftT = on ? 0 : 1;
  }

  taskTractor() {
    const fields = this.workFields();
    if (!fields.length) { this.idleStatus = '담당 밭이 없어요'; return null; }
    const open = fields.filter((f) => !this.cropFull(f.crop));
    if (!open.length) { this.idleStatus = '베일이 충분해서 쉬는 중'; return null; }
    const pick = this.pickTile('tall', open);
    if (!pick) { this.idleStatus = '작물이 자라길 기다리는 중'; return null; }
    const { t: tile, f } = pick;
    return {
      kind: 'work', key: 'tile' + f.id + tile.i, x: tile.x, z: tile.z, arrive: 0.9, label: `${f.name} ${CROPS[f.crop].name} 베는 중 ✂️`, valid: () => tile.state === 'tall' && f.owned,
      prep: () => this.fieldPrep(f), slow: 0.9,
    };
  }

  taskBaler() {
    const fields = this.workFields();
    const same = this.collected ? fields.filter((f) => f.crop === this.baleCrop) : fields;
    // 챔버가 덜 찼는데 같은 작물의 벤 줄이 더 없으면 있는 만큼이라도 베일로 내보낸다 (멍하니 기다리지 않기)
    if (this.collected > 0 && !same.some((f) => f.counts.cut > 0)) {
      if (baleCount() >= MAX_BALES) { this.idleStatus = '베일이 너무 많아요 (옮기거나 팔아 주세요)'; return null; }
      if (!this.seq && this.tilt < 0.1) { this.forceEject = true; this.seq = [{ tilt: 1, dur: 0.9 }, { tilt: 0, dur: 0.7 }]; }
      this.idleStatus = '남은 풀로 베일 내보내는 중';
      return null;
    }
    if (baleCount() >= MAX_BALES - 2) { this.idleStatus = '베일이 너무 많아요 (옮기거나 팔아 주세요)'; return null; }
    const pick = this.pickTile('cut', same);
    if (!pick) { this.idleStatus = fields.length ? '벤 풀을 기다리는 중' : '담당 밭이 없어요'; return null; }
    const { t: tile, f } = pick;
    return {
      kind: 'work', key: 'tile' + f.id + tile.i, x: tile.x, z: tile.z, arrive: 0.9, label: `${CROPS[f.crop].baleName} 만드는 중 (${this.collected}/4)`, valid: () => tile.state === 'cut' && this.collected < 4 && f.owned,
      prep: () => this.fieldPrep(f),
    };
  }

  /** 일할 축사들 (담당 축사가 정해져 있으면 그 축사만) */
  workBarns() {
    const b = this.assign?.barn;
    if (b && !G.barns.includes(b)) this.assign = null;
    return this.assign?.barn ? [this.assign.barn] : G.barns;
  }

  // --- 지게차 / 스키드로더 ---
  neededBarn(maxFeed) {
    let best = null, bv = Infinity;
    for (const b of this.workBarns()) {
      if (!b.animals.length) continue;
      let incoming = 0;
      for (const v of G.vehicles) if (v !== this && v.ai.forBarn === b) incoming++;
      const eff = b.feed + incoming * BALE_FEED;
      if (eff < maxFeed && eff < bv) { bv = eff; best = b; }
    }
    return best;
  }

  pickupTask(it, label, forBarn = null) {
    const low = this.type === 'forklift' ? Math.max(0, it.pos.y - 0.15) : 0;
    return {
      kind: 'pickup', key: 'item' + it.id, item: it, x: it.pos.x, z: it.pos.z, arrive: 1.7, label, forBarn,
      valid: () => !it.carriedBy && !it.removed && it.support.kind !== 'truck',
      prep: () => {
        if (Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < 7) { this.liftT = low; this.tiltT = 0; }
      },
      onArrive: () => {
        const fp = this.workPoint();
        const ok = !it.carriedBy && !it.removed && (Math.hypot(it.pos.x - fp.x, it.pos.z - fp.z) < 2.6 || Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < 2.4);
        if (!ok) { it.unreachable = G.now + 20; return; }
        this.seq = [
          { lift: low, dur: 0.3 },
          { fn: () => { if (!it.carriedBy && !it.removed) pickupItem(this, it); }, dur: 0.05 },
          { lift: low + 0.6, tilt: this.type === 'skid' ? -0.3 : -0.06, dur: 0.5 },
        ];
      },
    };
  }

  fetchBale(barn, label, opts = {}) {
    let best = null, bd = Infinity;
    for (const it of G.items) {
      if (it.kind !== 'bale' || it.carriedBy || it.removed || it.support.kind !== 'ground') continue;
      if (it.reservedBy && it.reservedBy !== this) continue;
      if (it.unreachable > G.now) continue;
      if (opts.notInYard && inYard(it.pos.x, it.pos.z)) continue;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best ? this.pickupTask(best, label, barn) : null;
  }

  fetchPallet() {
    let best = null, bd = Infinity;
    for (const it of G.items) {
      if (it.kind !== 'pallet' || it.carriedBy || it.removed || it.support.kind !== 'ground') continue;
      if (it.reservedBy && it.reservedBy !== this) continue;
      const ab = this.assign?.barn;   // 담당 축사 팔레트만
      if (ab && it.barn !== ab && !ab.contains(it.pos.x, it.pos.z, 8)) continue;
      if (it.unreachable > G.now) continue;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best ? this.pickupTask(best, '팔레트 가지러 가는 중 📦') : null;
  }

  dropTask(x, z, key, label, extra = {}) {
    return {
      kind: 'drop', key, x, z, arrive: extra.arrive ?? 1.0, label, ...extra,
      prep: () => { this.liftT = this.type === 'forklift' ? 0.6 : 0.35; this.tiltT = this.type === 'skid' ? -0.3 : -0.06; },
      onArrive: () => {
        const a = this.m.carry.getWorldPosition(_w);
        const sp = supportUnder(a.x, a.z, this);
        this.seq = [
          { lift: this.type === 'forklift' ? Math.max(0, sp.y - 0.18) : 0, tilt: 0, dur: 0.7, fn: () => {
            if (this.carrying && !releaseCarried(this, sp)) { this.ai.forBarn = null; this.ai.think = 0; return; }
            this.ai.reverseT = 0.9; this.ai.revSteer = 0;
          } },
        ];
      },
    };
  }

  deliverTask() {
    const it = this.carrying;
    if (it.kind === 'pallet') {
      const slot = freeDockSlot(this);
      if (slot) return this.dropTask(slot.x, slot.z, 'dock' + slot.i, '출하장으로 운반 중 📦', { slot: 'd' + slot.i, arrive: 0.8 });
      const m = LAYOUT.market;
      return this.dropTask(m.x, m.z, 'market', '판매소로 직접 운반 중 🏪', { arrive: 2.5 });
    }
    // 옥수수 사일리지는 배합장 원료가 모자라면 배합장으로
    if (it.product === 'corn' && stock().corn < 4) {
      const s = freeStationSlot(this, this.pos.x, this.pos.z);
      if (s) return this.dropTask(s.x, s.z, 'st' + s.i, '배합장에 옥수수 사일리지 옮기는 중 🌽', { slot: 's' + s.i, arrive: 0.8 });
    }
    let barn = this.ai.forBarn;
    if (barn && !this.workBarns().includes(barn)) barn = null;
    if (!barn || barn.feed > 100 - BALE_FEED * 0.6) barn = this.neededBarn(100 - BALE_FEED * 0.6);
    if (barn) {
      this.ai.forBarn = barn;
      return this.dropTask(barn.dropPos.x, barn.dropPos.z, 'feed' + barn.uid, `${barn.name} 통로에 건초 배달 중 🌾`, { arrive: 1.5 });
    }
    const slot = freeYardSlot(this);
    if (slot) return this.dropTask(slot.x, slot.z, 'yard' + slot.i, '건초 보관소로 옮기는 중', { slot: 'y' + slot.i, arrive: 0.8 });
    const d = freeDockSlot(this);
    if (d) return this.dropTask(d.x, d.z, 'dock' + d.i, '남는 건초 출하장으로', { slot: 'd' + d.i, arrive: 0.8 });
    this.idleStatus = '건초를 둘 곳이 없어요';
    return null;
  }

  taskHauler() {
    if (this.carrying) return this.deliverTask();
    if (this.type === 'skid') {
      if (this.load >= BUCKET_CAP * 0.85) { this.ai.sweep = null; return this.compostTask(); }
      const sw = this.sweepTask();
      if (sw) return sw;
      const ab = this.assign?.barn;
      const pile = G.muck.reduce((best, m) => ((ab && !ab.contains(m.x, m.z, 10)) || (best && m.amount <= best.amount) ? best : m), null);
      if (pile && this.load < BUCKET_CAP * 0.9) {
        return { kind: 'scoop', key: 'muck' + G.muck.indexOf(pile), x: pile.x, z: pile.z, arrive: 0.8, label: '쏟아진 분뇨 치우는 중', valid: () => G.muck.includes(pile), prep: () => { this.liftT = 0; this.tiltT = 0; } };
      }
      if (this.load > 1) return this.compostTask();
      const urgent = this.neededBarn(45);
      if (urgent) { const t = this.fetchBale(urgent, `${urgent.name} 건초 지원 중`); if (t) return t; }
      this.idleStatus = '축사가 깨끗해요 ✨';
      return null;
    }
    const urgent = this.neededBarn(40);
    if (urgent) { const t = this.fetchBale(urgent, `${urgent.name}에 줄 건초 가지러 가는 중`); if (t) return t; }
    if (freeDockSlot(this)) { const pal = this.fetchPallet(); if (pal) return pal; }
    const need = this.neededBarn(100 - BALE_FEED * 0.6);
    if (need) { const t = this.fetchBale(need, `${need.name}에 줄 건초 가지러 가는 중`); if (t) return t; }
    const wagonOn = G.vehicles.some((v) => v.type === 'balewagon' && v.auto && !v.driver);
    if (freeYardSlot(this) && !wagonOn) {
      const t = this.fetchBale(null, '흩어진 건초 정리 중', { notInYard: true });
      if (t) return t;
    }
    this.idleStatus = freeDockSlot(this) ? '할 일이 없어요 ☕' : '출하장이 가득 찼어요';
    return null;
  }

  /** 우리(한쪽 칸) 하나의 분뇨 양 */
  penManure(b, pen) {
    let s = 0;
    for (const c of b.cells) if (c.pen === pen) s += c.amt;
    return s;
  }

  /**
   * 스키드로더 청소: 칸마다 멈춰 서서 하나씩 뜨던 방식 대신,
   * 우리 한가운데를 버킷을 바닥에 붙인 채 앞→뒤(또는 뒤→앞)로 곧게 '쓸고 지나가며' 양쪽 분뇨를 한 번에 담는다.
   * 한 번 정한 줄은 끝까지 간다 (중간에 다른 칸으로 갈팡질팡하지 않게)
   */
  sweepTask() {
    const ai = this.ai;
    let s = ai.sweep;
    if (s && (!G.barns.includes(s.b) || this.penManure(s.b, s.pen) < 0.4)) s = ai.sweep = null;
    if (!s) {
      let best = null, bv = 0;
      for (const b of this.workBarns()) {
        for (const pen of b.pens) {
          if (G.vehicles.some((o) => o !== this && o.auto && !o.driver && o.ai.sweep && o.ai.sweep.pen === pen)) continue;   // 다른 스키드가 맡은 칸
          const amt = this.penManure(b, pen);
          if (amt < (this.load > 0.5 ? 2 : 6)) continue;
          const d = Math.hypot(pen.gate - this.pos.x, (b.front + b.back) / 2 - this.pos.z);
          const v = amt * 2 - d * 0.25;
          if (!best || v > bv) { best = { b, pen }; bv = v; }
        }
      }
      if (!best) return null;
      const { b } = best;
      // 가까운 쪽 끝에서 들어가 반대쪽 끝까지 (퇴비사는 축사 뒤에 있어서, 앞에서 들어가면 끝나는 곳이 퇴비사와 가깝다)
      const fromFront = Math.abs(this.pos.z - b.front) <= Math.abs(this.pos.z - b.back) + 6;
      s = ai.sweep = { ...best, dir: fromFront ? -1 : 1, n: (ai.sweepN = (ai.sweepN || 0) + 1) };
    }
    const { b, pen, dir } = s;
    const endZ = dir < 0 ? b.back + 1.6 : b.front - 1.6;
    const inside = (x, z) => x > pen.minX && x < pen.maxX && z > b.back && z < b.front;
    const self = this;
    return {
      kind: 'scoop', key: `sweep${b.uid}-${pen.side}-${s.n}`, center: true, x: pen.gate, z: endZ, arrive: 1.4,
      enterDir: dir < 0 ? 1 : -1,   // 들어갈 문: 앞(1) / 뒤(-1)
      get label() { return `${b.name} 바닥 쓸어 담는 중 🧹 (${Math.round((self.load / BUCKET_CAP) * 100)}%)`; },
      valid: () => this.load < BUCKET_CAP * 0.95,
      prep: () => {
        // 축사 안에 들어서면 버킷을 바닥에 붙이고 수평으로
        this.liftT = inside(this.pos.x, this.pos.z) || b.contains(this.pos.x, this.pos.z, 1.5) ? 0 : 0.15;
        this.tiltT = 0;
      },
      onArrive: () => { ai.sweep = null; },
    };
  }

  /** 분뇨 → 퇴비사 / 퇴비 → 트럭·퇴비사 */
  compostTask() {
    let shed = null, bd = Infinity;
    for (const sh of allSheds()) {
      if (sh.raw > COMPOST.cap - 5) continue;
      // 담당 축사가 있으면 그 축사 퇴비사를 먼저
      const d = Math.hypot(sh.rawPos.x - this.pos.x, sh.rawPos.z - this.pos.z) + (this.assign?.barn && sh.barn !== this.assign.barn ? 60 : 0);
      if (d < bd) { bd = d; shed = sh; }
    }
    if (!shed) { this.idleStatus = '퇴비사가 가득 찼어요'; return null; }
    const p = shed.rawPos;
    return {
      kind: 'drop', key: 'shed' + shed.barn.uid, x: p.x, z: p.z + 0.6, arrive: 1.4, label: `${shed.name}로 운반 중 ♻️`,
      via: [{ x: p.x, z: shed.front + 4 }],   // 퇴비사 정면에서 곧게 들어가 칸막이를 긁지 않게
      prep: () => { this.liftT = 0.3; this.tiltT = -0.4; },
      onArrive: () => { this.seq = [{ lift: 0.45, tilt: -0.2, dur: 0.5 }, { tilt: 1.05, dur: 0.7 }, { tilt: 0, lift: 0.12, dur: 0.6 }]; this.ai.reverseT = 0; },
    };
  }

  // --- 트럭 ---
  taskTruck() {
    const cargo = truckCargo(this).length;
    const cap = this.m.slots.length;
    const bulkCap = TRUCK_BULK_CAP[this.type];
    const dockN = dockItems().length;
    const m = LAYOUT.market, bay = LAYOUT.dock.bay;
    const sellTask = (label) => ({ kind: 'sell', key: 'sell', center: true, x: m.x, z: m.z, arrive: 3.2, label, onArrive: () => { this.sellCargo(); this.ai.think = 0.8; } });
    // 분뇨가 실려 있으면 퇴비사에 내리기
    if (this.bulk > 0.5 && this.bulkKind === 'manure') {
      if (!this.def.dump) { this.idleStatus = '분뇨는 5톤 덤프로 내려야 해요'; return null; }
      const sh = allSheds().reduce((best, s2) => (!best || s2.raw < best.raw ? s2 : best), null);
      return {
        kind: 'dump', key: 'tdump', center: true, x: sh.loadPos.x - 2.9, z: sh.loadPos.z + 1.5, arrive: 2.2, label: `${sh.name}에 분뇨 내리는 중 ♻️`,
        onArrive: () => { this.seq = [{ lift: 0.85, dur: 2.8 }, { lift: 0, dur: 2.4 }]; },
      };
    }
    if (this.bulk > 0.5 && this.bulkKind === 'compost') {
      const sh = this.bestCompostShed(5);
      if (this.bulk < bulkCap - 5 && sh && !this.otherTruckAt(sh)) return this.compostLoadTask(sh);
      return sellTask(`퇴비 팔러 가는 중 ♻️ (${Math.round((this.bulk / bulkCap) * 100)}%)`);
    }
    const S = LAYOUT.station;
    if (truckCargo(this).some((it) => it.kind === 'sack')) {
      return { kind: 'unload', key: 'unload', center: true, x: S.bay.x, z: S.bay.z, arrive: 2.6, label: '배합장에 원료 내리는 중 🌽', onArrive: () => { this.unloadToStation(); this.ai.think = 0.8; } };
    }
    if (cargo >= cap || (cargo > 0 && dockN === 0)) return sellTask(`판매소로 배송 중 🏪 (${cargo}/${cap})`);
    const other = G.vehicles.find((v) => v !== this && v.isTruck && v.auto && !v.driver && v.ai.task?.kind === 'load');
    const threshold = this.type === 'truck5' ? 2 : 1;
    const big = G.vehicles.find((v) => v.type === 'truck5');
    const bigBusy = !big || !big.auto || !!big.driver || big.ai.task?.kind === 'sell' || big.ai.task?.kind === 'compost' || truckCargo(big).length >= big.m.slots.length;
    if (!other && dockN >= threshold && (this.type === 'truck5' || bigBusy || dockN < 2)) {
      return { kind: 'load', key: 'load', center: true, x: bay.x, z: bay.z, arrive: 2.6, label: '출하장에서 짐 싣는 중 📦', onArrive: () => { this.loadFromDock(); this.ai.think = 1.4; } };
    }
    if (cargo > 0) return sellTask(`판매소로 배송 중 🏪 (${cargo}/${cap})`);
    // 사료 원료 구매 (1톤 우선)
    const buyer = G.vehicles.find((v) => v.type === 'truck1' && v.auto && !v.driver) || this;
    if (buyer === this && cargo === 0 && this.bulk < 0.01) {
      const st = stock();
      const free = 6 - stationItems().length;   // 배합장 칸 실제 빈 자리 (바닥에 둔 베일은 칸을 차지하지 않는다)
      const wants = [];
      if (st.corn < 2) wants.push('corn');
      if (st.soy < 2) wants.push('soy');
      if (wants.length && free >= 2 && G.coins >= 400 && !G.vehicles.some((v) => v !== this && v.ai.task?.kind === 'buy')) {
        const store = LAYOUT.store;
        return {
          kind: 'buy', key: 'buy', center: true, x: store.x, z: store.z, arrive: 3, label: '사료 가게에 원료 사러 가는 중 🌽',
          onArrive: () => {
            const list = [...wants];
            while (list.length < this.m.slots.length) list.push(list[list.length % wants.length]);
            for (const k of list.slice(0, this.m.slots.length)) if (!this.buyIngredient(k)) break;
            this.ai.think = 1.2;
          },
        };
      }
    }
    // 퇴비 수거
    const sh = this.bestCompostShed(this.type === 'truck5' ? 40 : 22);
    if (sh && !this.otherTruckAt(sh)) return this.compostLoadTask(sh);
    this.idleStatus = '배송할 짐을 기다리는 중';
    return null;
  }

  bestCompostShed(min) {
    let best = null;
    for (const s2 of allSheds()) if (s2.compost >= min && (!best || s2.compost > best.compost)) best = s2;
    return best;
  }

  otherTruckAt(shed) {
    return G.vehicles.some((v) => v !== this && v.isTruck && v.ai.task?.shed === shed);
  }

  compostLoadTask(sh) {
    return {
      kind: 'compost', key: 'compost' + sh.barn.uid, shed: sh, center: true, x: sh.loadPos.x, z: sh.loadPos.z, arrive: 2.6, label: `${sh.name}에서 퇴비 싣는 중 ♻️`,
      onArrive: () => { this.loadCompost(sh); this.ai.think = 1.0; },
    };
  }

  // --- 배합기 ---
  taskMixer() {
    const total = mixTotal(this);
    const S = LAYOUT.station;
    if (total > 0) {
      const rec = recipeOf(this.mix);
      let barn = this.ai.feedBarn && this.ai.feedBarn.feed < 95 ? this.ai.feedBarn : null;
      const mine = this.workBarns();
      if (barn && !mine.includes(barn)) barn = null;
      if (!barn) barn = (rec && mine.find((b) => b.animalType === rec && b.feed < 95)) || mine.filter((b) => b.feed < 95).sort((a, b) => a.feed - b.feed)[0];
      if (!barn) { this.idleStatus = '사료통이 모두 가득해요'; return null; }
      this.ai.feedBarn = barn;
      const name = rec ? RECIPES[rec].name : '잡사료';
      if ((this.ai.runBarn === barn && barn.contains(this.pos.x, this.pos.z, 9)) || barnAlleyAt(this.pos.x, this.pos.z) === barn) {
        return {
          kind: 'feedrun', key: 'run' + barn.uid, center: true, x: barn.cx, z: barn.back - 4, arrive: 2.2, label: `${barn.name}에 ${name} 급여 중 🥣`,
          through: barn,   // 반드시 통로 한가운데를 따라 앞→뒤로 지나간다
          prep: () => { this.pto = true; this.tiltT = this.isMixed() && barnAlleyAt(this.pos.x, this.pos.z) ? 1 : 0; }, slow: 0.4,
          onArrive: () => { this.tiltT = 0; this.ai.runBarn = null; },
        };
      }
      return {
        kind: 'toAlley', key: 'alley' + barn.uid, center: true, x: barn.cx, z: barn.front + 4.5, arrive: 2.4, label: `${name} 배합하며 ${barn.name}로 가는 중`,
        via: [this.approachPoint(barn)],   // 통로 정면에서 곧게 다가오기 (가로등·기둥 옆은 피해서)
        prep: () => { this.pto = true; this.tiltT = 0; },
        onArrive: () => { this.ai.think = 0; this.ai.runBarn = barn; },
      };
    }
    this.ai.feedBarn = null;
    this.ai.runBarn = null;
    const target = this.pickRecipeTarget(70);
    if (!target) {
      const st = stock();
      this.idleStatus = st.corn + st.soy === 0 ? '원료가 없어요 (사료 가게)' : '사료가 넉넉해요 ☕';
      return null;
    }
    return {
      kind: 'load', key: 'mixload', center: true, x: S.bay.x, z: S.bay.z, arrive: 2.6, label: `배합장에서 ${RECIPES[target.animalType].name} 원료 넣는 중`,
      onArrive: () => { this.ai.feedBarn = target; this.autoLoad(target.animalType); },
    };
  }

  // ================= 🚁 헬기 · ✈️ 비행기 (실제 비행 역학) =================
  // 헬기: 콜렉티브(추력 크기) · 사이클릭(로터 원판 기울기 → 그 방향으로 가속) · 페달(꼬리 로터 요)
  //       지면 효과 · 전진 양력 · 관성 · 항력 · 풍향계 효과 · 화물 줄(진자)
  // 비행기: 양력 = ½ρV²·CL(받음각) · 유도항력 · 실속 · 뱅크 선회(선회율 = L·sinφ / V) · 스로틀 레버 · 플랩
  initAir() {
    this.vel = new THREE.Vector3();
    this.coll = 0; this.collI = 0; this.yawRate = 0;
    this.thrL = 0; this.V = 0; this.gam = 0; this.theta = 0; this.ail = 0; this.elev = 0; this.stalled = false; this.holdAlt = null;
    this.stateT = 0; this.job = null;
    this.lift = this.liftT = 0; this.tilt = this.tiltT = 0;
    if (this.def.air !== 'heli') return;
    this.lift = this.liftT = 2.5;                 // 화물 줄 길이 (m)
    this.sling = { p: new THREE.Vector3(this.pos.x, 0, this.pos.z), v: new THREE.Vector3() };
    this.drops = [];
    this.slingLocal = new THREE.Vector3(0, 0, this.m.hookZ);
    this.winch = null;
    const rg = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
    rg.translate(0, 0.5, 0);
    this.rope = new THREE.Mesh(rg, mat(0x6b5a48));
    this.group.add(this.rope);
    this.hookBall = group(this.group);
    part(this.hookBall, sphere(0.17, 10, 8), mat(0xffd34d), 0, 0.15, 0);
    part(this.hookBall, torus(0.13, 0.04, 6, 14), mat(0x4a4f5c), 0, -0.04, 0);
  }

  updateAir(dt) {
    const driven = !!this.driver, heli = this.def.air === 'heli';
    const easy = true;   // 항공기 조작은 모드와 상관없이 간단하게 (W/S 앞뒤 · R/F 상승·하강 · A/D 선회) — 역학은 그대로 실제처럼
    let thr = 0, yaw = 0, climb = 0, side = 0;
    if (driven) {
      thr = (this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0);
      yaw = (this.key('KeyA', 'ArrowLeft') ? 1 : 0) - (this.key('KeyD', 'ArrowRight') ? 1 : 0);
      climb = (this.key('KeyR') ? 1 : 0) - (this.key('KeyF') ? 1 : 0);
      this.status = this.airborne ? `비행 중 · 고도 ${Math.round(this.pos.y)}m${this.carrying ? ' · 화물 운반 🪝' : ''}` : this.rpm < 0.95 ? '시동 거는 중' : '이륙 준비';
    } else if (!this.auto) {
      this.status = this.airborne ? '천천히 내려오는 중' : heli ? '헬기장에서 쉬는 중' : '주기장에서 쉬는 중';
    }
    this.boosting = driven && this.key('ShiftLeft', 'ShiftRight');
    const engineOn = driven || this.airborne || (this.auto && this.flyState !== 'idle');
    this.rpm = approach(this.rpm, engineOn ? 1 : 0, dt * (engineOn ? 0.3 : 0.12));
    if (heli) {
      let c;
      if (driven) {
        c = easy ? this.heliEasy(dt, thr, yaw, climb, side) : this.heliSim(dt, thr, yaw, climb, side);
        const w = (this.key('KeyT') ? 1 : 0) - (this.key('KeyG') ? 1 : 0);   // T: 줄 감기 · G: 줄 풀기
        if (w) { this.winch = null; this.lift = clamp(this.lift - w * 2.5 * dt, 0.6, 30); }
      } else if (this.auto) c = this.autoHeli(dt);
      else c = this.heliAssist(dt, 0, 0, this.airborne ? -Math.min(2.5, 0.6 + this.pos.y * 0.3) : -2, 0);
      this.heliPhysics(dt, c);
      this.winchStep(dt);
      this.slingStep(dt);
      this.stepDrops(dt);
    } else {
      let c;
      if (driven) c = this.planeInput(dt, thr, yaw, climb, easy);
      else if (this.auto) c = this.autoPlane(dt);
      else {
        if (this.airborne) this.thrL = approach(this.thrL, 0.35, dt * 0.3); else this.thrL = 0;
        c = this.planeLaw({ bankT: 0, gamT: this.airborne ? -0.06 : 0, steer: 0, brake: !this.airborne });
      }
      this.planePhysics(dt, c);
    }
    // 농장 경계: 부드럽게 되돌아오기
    const B = LAYOUT.bound - 6;
    if (Math.abs(this.pos.x) > B || Math.abs(this.pos.z) > B) {
      if (heli) {
        if (Math.abs(this.pos.x) > B) this.vel.x -= Math.sign(this.pos.x) * 8 * dt;
        if (Math.abs(this.pos.z) > B) this.vel.z -= Math.sign(this.pos.z) * 8 * dt;
      } else this.heading = dampAngle(this.heading, Math.atan2(-this.pos.x, -this.pos.z), 1.2, dt);
      this.pos.x = clamp(this.pos.x, -LAYOUT.bound + 2, LAYOUT.bound - 2);
      this.pos.z = clamp(this.pos.z, -LAYOUT.bound + 2, LAYOUT.bound - 2);
      if (driven && G.now - (this.edgeWarn || 0) > 5) { this.edgeWarn = G.now; toast('농장 경계예요. 안쪽으로 돌아가요', this.def.icon, 1800); }
    }
    if (!this.airborne) this.resolveCollisions(Math.sin(this.heading), Math.cos(this.heading));
    this.animateAir(dt, yaw);
  }

  // ---------------- 🚁 헬기 ----------------
  /** 콜렉티브 1일 때 낼 수 있는 가속도 (로터 회전², 지면 효과, 전진 양력, 고도) */
  thrustUnit() {
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const ge = 1 + 0.14 * clamp(1 - this.pos.y / 7, 0, 1);
    const etl = 1 + 0.1 * clamp((hv - 4) / 6, 0, 1);
    return 18.5 * this.rpm * this.rpm * ge * etl * (1 - this.pos.y / 500) * (this.boosting ? 1.12 : 1);
  }
  /** 지금 제자리 비행(호버)에 필요한 콜렉티브 */
  hoverColl() { return clamp(9.8 / Math.max(1, this.thrustUnit()) * (this.carrying && this.ropeTaut ? 1 + SLING_MASS[this.carrying.kind] : 1), 0, 1.2); }

  /** 시뮬레이션: R/F 콜렉티브 레버(손을 떼도 그대로) · W/S 사이클릭 앞뒤 · Z/X 사이클릭 좌우 · A/D 페달 */
  heliSim(dt, thr, yaw, climb, side) {
    if (climb) this.coll = clamp(this.coll + climb * 0.38 * dt, 0, 1);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const s = clamp((hv - 5) / 10, 0, 1);       // 속도가 붙으면 페달과 함께 기울여 부드럽게 선회
    return { pT: thr * (this.boosting ? 0.38 : 0.3), rT: side * 0.24 - yaw * 0.3 * s, yawIn: yaw };
  }
  /** 간편: 원하는 속도 · 상승률을 말하면 자동 안정 장치가 기울기와 콜렉티브를 맞춘다 */
  heliEasy(dt, thr, yaw, climb, side) {
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h);
    const maxF = this.boosting ? 28 : 21;   // 간편 모드 목표 속도 (예전 16·22 → 약 30% 빠르게)
    const fwd = thr >= 0 ? thr * maxF : thr * 6, lat = side * 6;
    const vsT = climb > 0 ? climb * 4.5 : climb < 0 ? -Math.min(4.5, 0.6 + this.pos.y * 0.45) : 0;
    return this.heliAssist(dt, fwd * fx - lat * fz, fwd * fz + lat * fx, vsT, yaw);
  }
  /** 자동 안정 장치: 목표 속도(월드) · 목표 상승률 → 사이클릭 · 콜렉티브 */
  heliAssist(dt, dvx, dvz, vsT, yawIn) {
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h);
    const ex = dvx - this.vel.x, ez = dvz - this.vel.z;
    const eu = ex * fx + ez * fz, ew = -ex * fz + ez * fx;
    const pm = this.boosting ? 0.38 : 0.3;
    const pT = clamp(eu * 0.08, -0.28, pm), rT = clamp(ew * 0.08, -0.28, 0.28);
    const ground = this.pos.y <= 0.001;
    if ((ground && vsT <= 0) || this.rpm < 0.92) {
      this.coll = approach(this.coll, 0, dt * 0.6);
      this.collI = 0;
    } else {
      this.collI = clamp(this.collI + (vsT - this.vs) * 0.9 * dt, -3, 5);
      const need = 9.8 + 0.6 * this.vs + (vsT - this.vs) * 2 + this.collI;
      const unit = this.thrustUnit() * Math.cos(this.pitch) * Math.cos(this.roll);
      this.coll = approach(this.coll, clamp(need / Math.max(unit, 1), 0, 1), dt * 1.2);
    }
    return { pT, rT, yawIn };
  }

  heliPhysics(dt, c) {
    const g = 9.8, h = this.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    const ground = this.pos.y <= 0.001;
    const aT = this.coll * this.thrustUnit();
    const u = this.vel.x * fx + this.vel.z * fz, w = this.vel.x * rx + this.vel.z * rz;
    const light = aT > g * 0.55;
    // 기체 자세는 즉시 바뀌지 않고 천천히 따라간다 (관성) · 속도가 붙으면 로터가 뒤로 젖혀진다(플래핑)
    if (ground && !light) { this.pitch = damp(this.pitch, 0, 6, dt); this.roll = damp(this.roll, 0, 6, dt); }
    else {
      this.pitch = damp(this.pitch, c.pT - u * 0.004, 2.4, dt);
      this.roll = damp(this.roll, c.rT, 2.6, dt);
      if (ground) { this.pitch = clamp(this.pitch, -0.07, 0.07); this.roll = clamp(this.roll, -0.07, 0.07); }
    }
    // 추력은 로터 원판에 수직 → 기울인 방향으로 가속
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    let ax = aT * (sp * fx + sr * rx), az = aT * (sp * fz + sr * rz);
    let ay = aT * Math.cos(this.pitch) * Math.cos(this.roll) - g - 0.6 * this.vs;
    // 항력: 앞뒤는 유선형, 옆으로는 동체가 넓어서 크게
    // 앞뒤 항력을 줄여 최고 속도 약 30% ↑ (약 66 → 80km/h, 부스트 약 94km/h)
    const du = -(0.0038 * u * Math.abs(u) + 0.05 * u), dw = -(0.02 * w * Math.abs(w) + 0.3 * w);
    ax += du * fx + dw * rx; az += du * fz + dw * rz;
    if (ground && ay <= 0) {
      this.vs = 0;
      const f = Math.exp(-(light ? 2 : 6) * dt);    // 스키드 마찰
      this.vel.x = this.vel.x * f + (light ? ax * 0.4 * dt : 0);
      this.vel.z = this.vel.z * f + (light ? az * 0.4 * dt : 0);
    } else {
      this.vel.x += ax * dt; this.vel.z += az * dt; this.vs += ay * dt;
    }
    // 요: 꼬리 로터(페달) + 풍향계 효과(빨리 날면 기수가 진행 방향으로)
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const wv = !ground && u > 2 ? -Math.atan2(w, u) * 1.4 * clamp((hv - 3) / 12, 0, 1) : 0;
    const auth = (ground ? (light ? 0.5 : 0) : 1) * clamp(this.rpm * 1.2, 0, 1);
    this.yawRate = damp(this.yawRate, (c.yawIn * 1.1 + wv) * auth, 3, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = Math.min(90, this.pos.y + this.vs * dt);
    if (this.pos.y < 0) this.heliTouchdown(-this.vs, hv);
    this.speed = u;
  }

  heliTouchdown(impact, hv) {
    const driven = !!this.driver;
    this.pos.y = 0;
    if (impact > 3.2 || hv > 8) {
      this.vs = Math.min(2.5, impact * 0.3);
      this.pos.y = 0.01;
      this.vel.multiplyScalar(0.5);
      burst('dust', this.pos.x, 0.3, this.pos.z, 12, { vy: 1.5, grav: 0, life: 0.8 });
      sfx('drop');
      if (driven) toast(impact > 3.2 ? `쿵! 초속 ${impact.toFixed(1)}m로 내려앉았어요 · 초속 3m 아래로 살살 내려와요` : '미끄러지듯 내렸어요! 속도를 줄이고 내려앉아요', '🚁', 2400);
    } else {
      this.vs = 0;
      burst('dust', this.pos.x, 0.2, this.pos.z, 8, { vy: 1, grav: 0, life: 0.7 });
      if (driven && impact > 0.2) floatText(this.pos.x, 3, this.pos.z, '사뿐 착륙 ✨', 'good');
    }
  }

  /** 화물 줄 끝(후크/짐)의 진자 운동. 줄이 팽팽하면 짐 무게가 헬기를 잡아당긴다 */
  slingStep(dt) {
    const S = this.sling, it = this.carrying;
    const h = this.heading, s = Math.sin(h), c = Math.cos(h);
    const HY = this.m.hookY, HZ = this.m.hookZ;
    const hy = HY * Math.cos(this.pitch) - HZ * Math.sin(this.pitch);
    const hz = HY * Math.sin(this.pitch) + HZ * Math.cos(this.pitch);
    const Hx = this.pos.x + hz * s, Hy = this.pos.y + hy, Hz = this.pos.z + hz * c;
    const top = it ? SLING_TOP[it.kind] ?? 0.9 : 0;
    const mu = it ? SLING_MASS[it.kind] ?? 0.2 : 0.004;
    S.v.y -= 9.8 * dt;
    S.v.multiplyScalar(Math.exp(-0.25 * dt));
    S.p.addScaledVector(S.v, dt);
    if (S.p.y <= 0) {
      S.p.y = 0;
      if (S.v.y < 0) S.v.y = 0;
      const f = Math.exp(-7 * dt);
      S.v.x *= f; S.v.z *= f;
    }
    let dx = S.p.x - Hx, dy = S.p.y + top - Hy, dz = S.p.z - Hz;
    const len = Math.hypot(dx, dy, dz), L = this.lift;
    this.ropeTaut = false;
    if (len > L && len > 1e-4) {
      dx /= len; dy /= len; dz /= len;
      const free = this.pos.y > 0.001 || this.vs > 0;      // 땅에 앉은 헬기는 끌려가지 않는다
      const wH = free ? mu / (1 + mu) : 0, wL = 1 - wH;
      const corr = len - L;
      S.p.x -= dx * corr * wL; S.p.y -= dy * corr * wL; S.p.z -= dz * corr * wL;
      if (free) { this.pos.x += dx * corr * wH; this.pos.y += dy * corr * wH; this.pos.z += dz * corr * wH; }
      const vrel = (S.v.x - this.vel.x) * dx + (S.v.y - this.vs) * dy + (S.v.z - this.vel.z) * dz;
      if (vrel > 0) {
        S.v.x -= dx * vrel * wL; S.v.y -= dy * vrel * wL; S.v.z -= dz * vrel * wL;
        if (free) { this.vel.x += dx * vrel * wH; this.vs += dy * vrel * wH; this.vel.z += dz * vrel * wH; }
      }
      this.ropeTaut = true;
      if (this.pos.y < 0) this.pos.y = 0;
    }
    if (S.p.y < 0) S.p.y = 0;
    if (it) it.mesh.visible = true;
  }

  /** 지금 매달린 짐 (게스트는 동기화된 아이템에서 찾는다) */
  slingItem() {
    if (!this.netT) return this.carrying;
    for (const it of G.items) if (it.carriedBy === this) return it;
    return null;
  }

  /** 줄 · 후크 · 짐을 헬기 기준 좌표로 그린다 */
  placeSling(dt = 0) {
    if (!this.sling) return;
    const L = this.slingLocal, it = this.slingItem();
    if (!this.netT) {
      const h = this.heading, s = Math.sin(h), c = Math.cos(h);
      const dx = this.sling.p.x - this.pos.x, dz = this.sling.p.z - this.pos.z;
      L.set(dx * c - dz * s, this.sling.p.y - this.pos.y, dx * s + dz * c);
    } else if (this.netHook) {
      const k = 1 - Math.exp(-14 * dt);
      L.x += (this.netHook[0] - L.x) * k; L.y += (this.netHook[1] - L.y) * k; L.z += (this.netHook[2] - L.z) * k;
    }
    const top = it ? SLING_TOP[it.kind] ?? 0.9 : 0;
    const HY = this.m.hookY, HZ = this.m.hookZ;
    const hy = HY * Math.cos(this.pitch) - HZ * Math.sin(this.pitch);
    const hz = HY * Math.sin(this.pitch) + HZ * Math.cos(this.pitch);
    _c.set(0, hy, hz);
    _w.set(L.x, L.y + top, L.z);
    this.hookBall.position.copy(_w);
    _c.sub(_w);
    const len = _c.length();
    this.rope.visible = len > 0.05;
    if (len > 0.05) {
      this.rope.position.copy(_w);
      _c.divideScalar(len);
      this.rope.quaternion.setFromUnitVectors(UP, _c);
      this.rope.scale.set(1, len, 1);
    }
    if (it) {
      it.mesh.position.copy(L);
      _q.setFromUnitVectors(UP, len > 0.05 ? _c : UP);
      it.mesh.quaternion.identity().slerp(_q, 0.85);
      it.mesh.scale.setScalar(1);
    }
  }

  /** Space: 🚁 후크 자동으로 내려 걸기 / 짐 내려놓기 · ✈️ 플랩 단계 */
  airAction() {
    if (this.def.air === 'plane') {
      this.tilt = this.tilt < 0.25 ? 0.5 : this.tilt < 0.75 ? 1 : 0;
      sfx('click');
      floatText(this.pos.x, this.pos.y + 3.5, this.pos.z, `플랩 ${this.tilt === 0 ? '올림' : this.tilt === 0.5 ? '10°' : '30°'}`, '');
      return;
    }
    if (this.winch && this.winch.mode !== 'up') {
      const hooking = this.winch.mode === 'down';
      this.winchStop();
      if (hooking) this.winch = { mode: 'up', target: 1 };   // 내려가던 후크는 다시 감아올린다
      if (this.driver) toast(hooking ? '후크를 다시 감아올려요' : '후크 작업을 멈췄어요', '🪝', 1400);
      return;
    }
    if (this.carrying) this.startSetdown();
    else this.startHook();
  }

  /** 헬기 아래(옆으로 8m 안)에서 가장 가까운 짐 */
  hookTarget(R = 8) {
    let best = null, bd = R;
    for (const it of G.items) {
      if (it.carriedBy || it.fly || it.removed || it.falling || !this.def.carries.includes(it.kind)) continue;
      if (it.reservedBy && it.reservedBy !== this) continue;
      if (it.pos.y > this.pos.y) continue;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /** 고도와 상관없이: 줄을 풀어 후크를 짐까지 내려 걸고, 다시 감아올린다 */
  startHook(it = null) {
    it = it || this.hookTarget();
    if (!it) {
      // 짐이 없는 곳에서 Space → 후크를 감아올린다
      if (this.lift > 1.05) {
        this.winch = { mode: 'up', target: 1 };
        sfx('click');
        if (this.driver) toast('후크를 감아올려요', '🪝', 1400);
      } else if (this.driver) toast('헬기 바로 아래(8m 안)에 팔레트·건초가 없어요', '🪝', 2000);
      return false;
    }
    it.reservedBy = this;
    this.winch = { mode: 'down', it };
    sfx('click');
    return true;
  }
  /** 짐을 매단 채: 줄을 풀어 짐이 땅(판매소·출하장·트럭)에 닿으면 내려놓는다 */
  startSetdown() {
    const S = this.sling, sp = supportUnder(S.p.x, S.p.z, this, 0.4);
    if (S.p.y - sp.y < 0.6) { if (this.slingRelease()) this.winch = { mode: 'up', target: 3 }; return; }
    this.winch = { mode: 'set' };
    sfx('click');
  }
  winchStop() {
    const w = this.winch;
    if (w?.it && w.it.reservedBy === this) w.it.reservedBy = null;
    this.winch = null;
  }
  winchStep(dt) {
    const w = this.winch, S = this.sling;
    if (!w) return;
    const MAXL = 30;
    if (w.mode === 'down') {
      const it = w.it;
      if (!it || it.removed || it.carriedBy || it.falling) { this.winchStop(); return; }
      if (Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) > 14) {
        this.winchStop();
        if (this.driver) toast('짐에서 너무 멀어졌어요. 다시 짐 위에서 Space', '🪝', 2000);
        return;
      }
      const top = it.pos.y + (SLING_TOP[it.kind] ?? 0.9);
      // 스마트 후크: 줄을 풀면서 짐 쪽으로 살짝 끌려간다
      const k = Math.min(1, dt * 4);
      S.p.x += (it.pos.x - S.p.x) * k; S.p.z += (it.pos.z - S.p.z) * k;
      S.v.x *= 1 - k; S.v.z *= 1 - k;
      if (S.p.y > top + 0.4) this.lift = Math.min(MAXL, this.lift + 7 * dt);
      if (Math.hypot(it.pos.x - S.p.x, top - S.p.y, it.pos.z - S.p.z) < 1.0) {
        it.reservedBy = null;
        pickupItem(this, it);
        S.p.copy(it.pos);
        S.v.set(0, 0, 0);
        if (this.driver) floatText(it.pos.x, it.pos.y + 2, it.pos.z, '후크 연결! 🪝', 'good');
        this.winch = { mode: 'up', target: Math.min(5, this.lift) };
      } else if (this.lift >= MAXL) {
        this.winchStop();
        if (this.driver) toast(`줄이 닿지 않아요 (최대 ${MAXL}m) · 조금 내려가서 다시 Space`, '🪝', 2200);
      }
    } else if (w.mode === 'up') {
      this.lift = Math.max(w.target, this.lift - (this.carrying ? 2.5 : 5) * dt);
      if (this.lift <= w.target + 0.001) this.winch = null;
    } else if (w.mode === 'set') {
      if (!this.carrying) { this.winch = { mode: 'up', target: 3 }; return; }
      const sp = supportUnder(S.p.x, S.p.z, this, 0.4);
      if (S.p.y - sp.y < 0.12 && Math.hypot(S.v.x, S.v.z) < 2.5) {
        if (this.slingRelease()) this.winch = { mode: 'up', target: 3 };
        else this.winch = null;
      } else if (this.lift >= MAXL) {
        this.winch = null;
        if (this.driver) toast(`줄이 땅까지 닿지 않아요 (최대 ${MAXL}m) · 조금 내려가서 다시 Space`, '🪝', 2200);
      } else this.lift = Math.min(MAXL, this.lift + 4 * dt);
    }
  }

  slingHook() { return this.startHook(); }

  /** 짐 풀기: 땅에 닿아 있으면 그 자리에 내려놓고(판매소 → 판매), 공중이면 떨어뜨린다 */
  slingRelease() {
    const it = this.carrying, S = this.sling;
    if (!it) return false;
    this.placeSling();
    this.group.updateMatrixWorld(true);
    const sp = supportUnder(S.p.x, S.p.z, this, 0.4);
    const top = SLING_TOP[it.kind] ?? 0.9;
    if (S.p.y - sp.y < 0.6) {
      it.mesh.quaternion.identity();
      const ok = releaseCarried(this, sp);
      if (ok) { S.p.y += top; S.v.set(0, 0, 0); }
      return ok;
    }
    this.carrying = null;
    it.carriedBy = null;
    it.support = { kind: 'carried' };
    it.falling = true;
    G.scene.add(it.mesh);
    it.mesh.position.copy(S.p);
    it.mesh.rotation.set(0, this.heading, 0);
    this.drops.push({ it, v: S.v.clone(), y0: S.p.y, driver: this.driver });
    S.p.y += top;
    S.v.set(0, 0, 0);
    if (this.driver) toast('공중에서 짐을 놓았어요! 높이 떨어지면 상품이 상해요', '🪝', 2000);
    return true;
  }

  stepDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i], it = d.it, p = it.mesh.position;
      d.v.y -= 9.8 * dt;
      p.addScaledVector(d.v, dt);
      const sp = supportUnder(p.x, p.z, this, 0.4);
      if (p.y > sp.y) continue;
      p.y = sp.y;
      this.drops.splice(i, 1);
      it.falling = false;
      const fall = d.y0 - sp.y;
      burst('dust', p.x, sp.y + 0.3, p.z, 10, { vy: 1.5, grav: 0, life: 0.7 });
      sfx('drop');
      if (fall > 2.5 && it.kind !== 'bale') { it.dmg = true; floatText(p.x, sp.y + 2, p.z, '쿵! 상품이 상했어요 (값 -40%)', ''); }
      const proxy = { carrying: it, driver: d.driver, heading: this.heading, ai: {}, m: {}, def: this.def };
      if (!releaseCarried(proxy, sp)) {
        let x = p.x, z = p.z;
        for (let r = 1; r < 12 && blockedAt(x, z, 0.6, false); r++) { const a = rand(0, 6.28); x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r; }
        it.placeAt(x, z, this.heading);
      }
    }
  }

  // ---------------- ✈️ 비행기 ----------------
  /** 조종 입력: W/S 스로틀 레버(손을 떼도 그대로) · R/F 승강타 · A/D 보조익(땅에선 앞바퀴) */
  planeInput(dt, thr, yaw, climb, easy) {
    if (thr) this.thrL = clamp(this.thrL + thr * 0.6 * dt, 0, 1);
    const ground = this.pos.y <= 0.001 && this.gam <= 0.0001;
    const brake = ground && thr < 0 && this.thrL <= 0.001;
    if (!easy) return { ail: -yaw, elev: climb, steer: yaw, brake };
    // 간편: R/F = 오르기/내리기 각도, 손 떼면 고도 유지 · A/D = 기울기(손 떼면 수평) · 실속 방지
    let gamT;
    if (ground) { gamT = climb > 0 ? 0.16 : 0; this.holdAlt = null; }
    else if (climb) { gamT = climb * 0.16; this.holdAlt = null; }
    else { if (this.holdAlt == null) this.holdAlt = this.pos.y; gamT = clamp((this.holdAlt - this.pos.y) * 0.03, -0.1, 0.1); }
    return this.planeLaw({ bankT: -yaw * 0.5, gamT, steer: yaw, brake });
  }

  /** 목표 상승각 → 필요한 받음각 (실속 각도 직전에서 멈춘다) */
  planeLaw(t) {
    const V = Math.max(this.V, 4), fl = this.tilt, g = 9.8;
    const CL0 = 0.25 + 0.6 * fl, AS = 0.26 - 0.02 * fl;
    const ground = this.pos.y <= 0.001 && this.gam <= 0.0001;
    let acmd;
    if (ground && t.gamT <= 0) acmd = 0;
    else {
      const need = (g * Math.cos(this.gam) / Math.max(Math.cos(this.roll), 0.5)) / (KL * V * V);
      acmd = (need - CL0) / 5 + (t.gamT - this.gam) * 0.6;
    }
    return { acmd: clamp(acmd, -0.1, AS - 0.04), bankT: t.bankT, steer: t.steer, brake: t.brake };
  }

  planePhysics(dt, c) {
    const g = 9.8, fl = this.tilt;
    const CL0 = 0.25 + 0.6 * fl, AS = 0.26 - 0.02 * fl;
    const ground = this.pos.y <= 0.001 && this.gam <= 0.0001;
    let V = this.V;
    // 승강타 → 받음각(α) 명령. 기체는 그 받음각을 향해 기수를 움직인다 (세로 안정성)
    const acmd = c.acmd ?? (0.07 + c.elev * (c.elev > 0 ? 0.27 : 0.2));
    let alpha = this.theta - this.gam;
    if (ground) {
      const eAuth = clamp((V - 6) / 6, 0, 1);      // 속도가 붙어야 승강타가 먹힌다
      const tgt = clamp(acmd, 0, 0.2);
      this.theta += clamp((tgt - this.theta) * 3 * eAuth - (1 - eAuth) * this.theta * 2, -0.5, 0.5) * dt;
      this.theta = clamp(this.theta, 0, 0.2);
    } else {
      let q = clamp((acmd - alpha) * 3 * clamp(V / 14, 0.15, 1), -0.6, 0.6);
      if (this.stalled) q -= 0.45;                   // 실속: 기수가 떨어진다
      this.theta += q * dt;
    }
    alpha = this.theta - this.gam;
    this.stalled = !ground && alpha > AS;
    const CL = this.stalled ? (CL0 + 5 * AS) * Math.max(0.5, 1 - (alpha - AS) * 4) : Math.max(-0.6, CL0 + 5 * alpha);
    const F = this.def.fly || FLY;   // 기종별 추력 · 최고 속도 · 항력 · 롤 빠르기
    const CD = F.cd0 + 0.05 * fl + 0.055 * CL * CL + (this.stalled ? 0.12 : 0);
    const qd = KL * V * V;
    const L = qd * CL, D = qd * CD;
    const T = this.thrL * this.rpm * (this.boosting ? F.boost : 1) * F.thrust * Math.max(0, 1 - V / F.vmax);
    // 롤: 보조익(시뮬) 또는 목표 기울기(간편/자동)
    if (ground) this.roll = damp(this.roll, 0, 8, dt);
    else {
      const ra = clamp(V / 12, 0.25, 1) * F.roll;
      if (c.bankT != null) this.roll += clamp((c.bankT - this.roll) * 2, -0.9, 0.9) * ra * dt;
      else this.roll += (c.ail * 0.9 - this.roll * 0.08) * ra * dt;
      if (this.stalled) this.roll += Math.sin(G.now * 3.1) * 0.3 * dt;
      this.roll = clamp(this.roll, -1.1, 1.1);
    }
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    if (ground) {
      const R = LAYOUT.airfield.runway;
      const onRwy = Math.abs(this.pos.z - R.z) < R.w / 2 + 1 && Math.abs(this.pos.x - R.x) < R.len / 2 + 2;
      const fr = (onRwy ? 0.2 : 0.55) + (c.brake ? 4 : 0);
      V = Math.max(0, V + (T - D - fr) * dt);
      this.heading = wrapAngle(this.heading + c.steer * 1.3 * clamp(V / 2.5, 0, 1) * (V > 12 ? 0.35 : 1) * dt);
      const up = L * ca + T * sa - g;              // 날개가 무게보다 크게 들어 올리면 이륙
      this.gam = up > 0 ? (up / Math.max(V, 4)) * dt : 0;
    } else {
      const Vc = Math.max(V, 3);
      V = Math.max(0, V + (T * ca - D - g * Math.sin(this.gam)) * dt);
      this.gam = clamp(this.gam + ((L * Math.cos(this.roll) + T * sa - g * Math.cos(this.gam)) / Vc) * dt, -1.2, 1.2);
      this.heading = wrapAngle(this.heading - (L * Math.sin(this.roll) / (Vc * Math.max(0.3, Math.cos(this.gam)))) * dt);
    }
    this.V = V;
    this.speed = V * Math.cos(this.gam);
    this.vs = V * Math.sin(this.gam);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.y = Math.min(120, this.pos.y + this.vs * dt);
    if (this.pos.y <= 0 && !ground) this.planeTouchdown();
    if (this.pos.y < 0) this.pos.y = 0;
    this.pitch = -this.theta;
    this.elev = clamp((acmd - 0.07) / 0.25, -1, 1);
    this.ail = c.bankT != null ? clamp((c.bankT - this.roll) * 2, -1, 1) : c.ail;
    if (this.stalled && this.driver === G.player && G.now - (this.stallWarn || 0) > 4) { this.stallWarn = G.now; sfx('error'); toast('⚠️ 실속! F로 기수를 내리고 W로 출력을 올려요', '✈️', 2000); }
  }

  planeTouchdown() {
    const impact = -this.vs, driven = !!this.driver;
    const hard = impact > 3.2 || this.theta < -0.03 || Math.abs(this.roll) > 0.3;
    this.theta = clamp(this.theta, 0, 0.2);
    if (hard) {
      this.gam = 0.05; this.V *= 0.8; this.pos.y = 0.05; this.roll *= 0.3;
      burst('dust', this.pos.x, 0.3, this.pos.z, 10, { vy: 1.5, grav: 0, life: 0.8 });
      sfx('drop');
      if (driven) toast(impact > 3.2 ? `쿵! 초속 ${impact.toFixed(1)}m로 떨어졌어요 · 활주로 앞에서 R로 살짝 기수를 들어(플레어) 내려요` : this.theta < 0 ? '앞바퀴부터 닿았어요! 기수를 살짝 든 채로 내려요' : '날개를 수평으로 맞추고 내려요', '✈️', 2600);
    } else {
      this.gam = 0; this.pos.y = 0;
      burst('dust', this.pos.x, 0.2, this.pos.z, 8, { vy: 1, grav: 0, life: 0.7 });
      if (driven) floatText(this.pos.x, 3, this.pos.z, '사뿐 착륙 ✨', 'good');
    }
  }

  animateAir(dt, yaw = 0) {
    const m = this.m;
    const driven = !!this.driver;
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.set(0, this.heading, 0);
    m.body.rotation.x = this.pitch;
    m.body.rotation.z = this.roll;
    if (m.rotor) { m.rotor.rotation.y += this.rpm * dt * 22; m.trotor.rotation.x += this.rpm * dt * 45; }
    if (m.prop) m.prop.rotation.z += (this.rpm * (0.35 + this.thrL * 0.65) + this.speed / 40) * dt * 45;
    if (m.fans) for (const f of m.fans) f.rotation.z += (this.rpm * (0.3 + this.thrL * 0.7)) * dt * 30;   // 여객기 엔진 팬
    if (m.burner) {   // 전투기 애프터버너: 부스트(또는 최대 추력)일 때 불꽃
      const on = this.rpm > 0.5 && (this.boosting || this.thrL > 0.92);
      const k = on ? (this.boosting ? 1.25 : 0.7) * (0.9 + Math.sin(G.now * 40) * 0.1) : 0;
      for (const b of m.burner) { b.visible = k > 0; b.scale.set(1, 1, k || 1); }
    }
    if (m.flaps) {
      for (const f of m.flaps) f.rotation.x = damp(f.rotation.x, -this.tilt * 0.55, 3, dt);
      for (const a of m.ailerons) a.rotation.x = damp(a.rotation.x, -(this.ail || 0) * 0.35 * a.userData.side, 10, dt);
      m.elevator.rotation.x = damp(m.elevator.rotation.x, (this.elev || 0) * 0.35, 10, dt);
      m.rudder.rotation.y = damp(m.rudder.rotation.y, yaw * 0.35, 8, dt);
    }
    if (this.pos.y < 0.05) for (const w of m.wheels) w.spin.rotation.x += (this.speed * dt) / w.r;
    this.steerVis = damp(this.steerVis, this.airborne ? 0 : yaw * 0.4, 8, dt);
    for (const s of m.steer) s.rotation.y = this.steerVis;
    if (this.sling) this.placeSling(dt);
    const mine = this.driver === G.player;
    this.playerFig.group.visible = driven && !(mine && G.cam.fp);
    for (const gl of this.glass) gl.visible = !(mine && G.cam.fp);
    this.npcFig.group.visible = !driven && this.auto;
    if (this.passFig) this.passFig.group.visible = !!this.passenger && !(this.passenger === G.player && G.cam.fp);
    if (m.beacon) m.beacon.material = this.rpm > 0.2 && Math.sin(G.now * 7) > 0.4 ? this.beaconOn : this.beaconOff;
    if (this.rpm > 0.3) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.18;
        m.exhaust.getWorldPosition(_w);
        spawn('smoke', _w.x, _w.y, _w.z, { vy: 0.8, life: 0.8, size: 0.5 });
        // 로터 바람(다운워시)에 날리는 흙먼지 — 콜렉티브를 올릴수록 세게
        if (m.rotor && this.pos.y < 8) {
          const s = 2 + (this.coll || 0) * 4;
          for (let i = 0; i < 3; i++) { const a = rand(0, 6.28); spawn('dust', this.pos.x + Math.cos(a) * 3, 0.2, this.pos.z + Math.sin(a) * 3, { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 0.4, life: 0.8, size: 0.8 }); }
        }
      }
    }
  }

  // ---------------- 🤖 자동 조종 ----------------
  /** 헬기 자동: 축사 팔레트를 매달아 판매소로 → 일감이 없으면 유람 비행 */
  autoHeli(dt) {
    const pad = this.park, S = this.sling, M = LAYOUT.market;
    this.stateT += dt;
    const st = (n, w = 0) => { this.flyState = n; this.flyWait = w; this.stateT = 0; };
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const fly = (tx, tz, alt, vmax = 14, face = true) => {
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
      const sp = Math.min(vmax, d * 0.25);
      const vsT = clamp((alt - this.pos.y) * 0.6, -3, 3.5);
      const yawIn = face && d > 10 ? clamp(wrapAngle(Math.atan2(dx, dz) - this.heading) * 1.5, -1, 1) : 0;
      return [this.heliAssist(dt, d > 0.01 ? (dx / d) * sp : 0, d > 0.01 ? (dz / d) * sp : 0, vsT, yawIn), d];
    };
    const drop = (why) => {
      if (this.job && this.job.reservedBy === this) this.job.reservedBy = null;
      if (why && this.job) this.job.unreachable = G.now + 60;
      this.job = null;
    };
    const it = this.job;
    const d0 = (o) => { const q = o.pos || o; return Math.hypot(q.x - this.pos.x, q.z - this.pos.z); };
    switch (this.flyState) {
      case 'idle': {
        this.status = this.passenger ? '손님을 태우고 곧 출발해요!' : '헬기장에서 출발 준비 중';
        if (this.passenger) this.flyWait = Math.min(this.flyWait, 2.5);
        this.flyWait -= dt;
        if (this.flyWait <= 0) {
          const job = this.passenger ? null : this.findCargo();
          if (job) { this.job = job; job.reservedBy = this; this.lift = 5; st('toItem'); }
          else st('up');
        }
        return this.heliAssist(dt, 0, 0, -1, 0);
      }
      case 'up':
        this.status = this.rpm < 0.92 ? '로터 회전 올리는 중' : '이륙! 🚁';
        if (this.pos.y > 14) { st('tour'); this.tourT = 75; this.tourA = Math.atan2(this.pos.x, this.pos.z - 15); }
        return fly(this.pos.x, this.pos.z, 18)[0];
      case 'tour': {
        this.status = '🚁 농장 유람 비행 중';
        this.tourA += dt * 0.13;
        this.tourT -= dt;
        if (this.tourT <= 0) st('back');
        return fly(Math.sin(this.tourA + 0.5) * 85, 15 + Math.cos(this.tourA + 0.5) * 85, 18)[0];
      }
      case 'toItem': {
        if (!it || it.removed || it.carriedBy || it.falling) { drop(); st('back'); return this.heliAssist(dt, 0, 0, 0, 0); }
        this.status = '📦 팔레트 가지러 가는 중';
        const [c, d] = fly(it.pos.x, it.pos.z, d0(it) < 30 ? it.pos.y + 11 : 16, 14);
        if (d < 2.5 && hv < 1.5 && Math.abs(this.pos.y - (it.pos.y + 11)) < 2) { this.job = null; this.startHook(it); st('lower'); }
        if (this.stateT > 70) { drop(true); st('back'); }
        return c;
      }
      case 'lower': {
        this.status = '🪝 후크를 내려 거는 중';
        const w = this.winch?.it;
        if (this.carrying) { st('lift'); return this.heliAssist(dt, 0, 0, 0, 0); }
        if (!w || this.stateT > 25) { if (w) w.unreachable = G.now + 60; this.winchStop(); st('back'); return this.heliAssist(dt, 0, 0, 0, 0); }
        return fly(w.pos.x, w.pos.z, w.pos.y + 11, 1.5, false)[0];
      }
      case 'lift':
        this.status = '📦 팔레트를 매달고 상승!';
        if (!this.carrying) { st('back'); return this.heliAssist(dt, 0, 0, 0, 0); }
        if (this.pos.y > 15 && !this.winch) st('toMarket');
        return fly(this.pos.x, this.pos.z, 18, 2, false)[0];
      case 'toMarket': {
        if (!this.carrying) { st('back'); return this.heliAssist(dt, 0, 0, 0, 0); }
        this.status = '🏪 판매소로 하늘 배송 중';
        const [c, d] = fly(M.x, M.z, d0(M) < 25 ? 11 : 18, 11);
        if (d < 2.5 && hv < 1.2 && this.pos.y < 13) { this.startSetdown(); st('setdown'); }
        return c;
      }
      case 'setdown': {
        this.status = '🏪 판매소에 살며시 내려놓는 중';
        if (!this.carrying) { st('back'); return this.heliAssist(dt, 0, 0, 0, 0); }
        if (!this.winch) this.startSetdown();
        if (this.stateT > 30) { this.slingRelease(); st('back'); }
        return fly(M.x, M.z, 11, 1.5, false)[0];
      }
      case 'back': {
        this.status = '헬기장으로 돌아가는 중';
        this.lift = approach(this.lift, 2.5, dt * 1.5);
        const [c, d] = fly(pad.x, pad.z, 14);
        if (d < 1.6 && hv < 0.8) st('down');
        return c;
      }
      case 'down': {
        this.status = '헬기장에 내리는 중';
        const dx = pad.x - this.pos.x, dz = pad.z - this.pos.z;
        const yawIn = clamp(wrapAngle((pad.h ?? this.heading) - this.heading) * 1.2, -1, 1);
        if (this.pos.y <= 0.001) st('idle', this.findCargo() ? 6 : 40);
        return this.heliAssist(dt, dx * 0.4, dz * 0.4, -Math.min(2.5, 0.5 + this.pos.y * 0.35), yawIn);
      }
    }
    st('idle', 5);
    return this.heliAssist(dt, 0, 0, -1, 0);
  }

  /** 헬기로 나를 팔레트 (축사 앞 · 출하장) */
  findCargo() {
    let best = null, bd = Infinity;
    for (const it of G.items) {
      if (it.kind !== 'pallet' || it.carriedBy || it.removed || it.falling || it.fly) continue;
      if (it.support.kind !== 'ground' && it.support.kind !== 'dock') continue;
      if (it.reservedBy && it.reservedBy !== this) continue;
      if (it.unreachable > G.now || nearMarket(it.pos, 2)) continue;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /** 비행기 자동: 활주로 정렬 → 이륙 → 유람 → 장주(다운윈드 → 베이스 선회) → 최종 접근 → 플레어 → 착륙 → 주기장 */
  autoPlane(dt) {
    const R = LAYOUT.airfield.runway, P = this.park;
    const west = R.x - R.len / 2;
    this.stateT += dt;
    const st = (n, w = 0) => { this.flyState = n; this.flyWait = w; this.stateT = 0; };
    const err = (tx, tz) => wrapAngle(Math.atan2(tx - this.pos.x, tz - this.pos.z) - this.heading);
    const lineErr = () => clamp(wrapAngle(Math.PI / 2 + clamp((this.pos.z - R.z) * 0.09, -0.5, 0.5) - this.heading), -1.5, 1.5);
    // 착륙 장주: 활주로 북쪽을 서쪽으로(다운윈드) → 왼쪽으로 돌아(베이스) → 서쪽 끝에서 긴 파이널
    const PAT = [[60, 40, 18], [-130, 40, 15], [-178, 50, 13], [-200, 76, 11.5], [west - 65, R.z, 10], [west, R.z, 3.5]];
    const bank = (e, m = 0.5) => clamp(-e * 1.4, -m, m);
    const spd = (Vt, max = 1) => { this.thrL = approach(this.thrL, clamp(0.45 + (Vt - this.V) * 0.15, 0, max), dt * 0.8); };
    const alt = (a, m = 0.12) => clamp((a - this.pos.y) * 0.03, -m, m);
    const law = (bankT, gamT, steer = 0, brake = false) => this.planeLaw({ bankT, gamT, steer, brake });
    switch (this.flyState) {
      case 'idle': {
        this.status = this.passenger ? '손님을 태우고 곧 출발해요!' : '주기장에서 출발 준비 중';
        this.thrL = 0;
        // 견인차(푸시백): 세워 둔 비행기를 다시 활주로 쪽으로 돌려 놓는다
        const dh = P.h != null && this.V < 0.3 ? wrapAngle(P.h - this.heading) : 0;
        if (Math.abs(dh) > 0.03) {
          this.heading += clamp(dh, -0.5 * dt, 0.5 * dt);
          this.status = '🚜 견인차가 방향을 돌려 놓는 중';
          this.flyWait = Math.max(this.flyWait, 1);
        }
        if (this.passenger) this.flyWait = Math.min(this.flyWait, 2.5);
        this.flyWait -= dt;
        if (this.flyWait <= 0) st('line');
        return law(0, 0, 0, true);
      }
      case 'line': {
        this.tilt = 0.5;
        // 주기장에서는 먼저 내 칸 앞으로 곧게 나와 활주로까지 (다른 비행기 칸을 가로지르지 않게)
        if (this.pos.z > R.z + R.w / 2 - 1.5) {
          this.status = '주기장에서 활주로로 나가는 중';
          const e = err(P.x + 3, R.z);
          this.thrL = this.V < 3 ? 0.3 : 0;
          return law(0, 0, clamp(e * 2, -1, 1), this.V > 4);
        }
        this.status = '활주로에 줄 맞추는 중';
        const e = lineErr();
        this.thrL = this.V < 3 ? 0.3 : 0;
        if (Math.abs(e) < 0.12 && this.rpm > 0.95) st('roll');
        return law(0, 0, clamp(e * 2, -1, 1), this.V > 4);
      }
      case 'roll': {
        this.status = '활주로 달리는 중 💨';
        this.thrL = approach(this.thrL, 1, dt);
        if (this.pos.y > 6) st('climb');
        return law(0, this.V > 12.5 ? 0.13 : 0, clamp(lineErr() * 2, -1, 1));
      }
      case 'climb': {
        this.status = '상승 중 ✈️';
        if (this.pos.y > 12) this.tilt = 0;
        spd(18);
        this.thrL = Math.max(this.thrL, 0.9);
        if (this.pos.y > 24) { st('tour'); this.tourT = 70; this.tourA = Math.atan2(this.pos.x, this.pos.z - 20); }
        return law(bank(lineErr(), 0.25), 0.1);
      }
      case 'tour': {
        this.status = '✈️ 하늘 유람 중';
        this.tourA += dt * 0.15;
        this.tourT -= dt;
        spd(17);
        if (this.tourT <= 0) st('dw1');
        return law(bank(err(Math.sin(this.tourA + 0.5) * 110, 20 + Math.cos(this.tourA + 0.5) * 110)), alt(30));
      }
      case 'dw1': {
        this.status = '착륙 장주로 들어가는 중';
        spd(16);
        if (Math.hypot(PAT[0][0] - this.pos.x, PAT[0][1] - this.pos.z) < 25) { st('pattern'); this.pathIdx = 0; }
        return law(bank(err(PAT[0][0], PAT[0][1])), alt(PAT[0][2]));
      }
      case 'pattern': {
        // 정해진 장주 경로를 따라간다 (앞쪽 25m 지점을 바라보며 비행)
        this.status = this.pathIdx < 1 ? '다운윈드 · 착륙 준비' : '활주로 쪽으로 선회 중';
        spd(this.pathIdx < 1 ? 15 : 13);
        this.tilt = this.pathIdx < 1 ? 0.5 : 1;
        let i = this.pathIdx;
        const seg = (k) => { const [ax, az] = PAT[k], [bx, bz] = PAT[k + 1]; const lx = bx - ax, lz = bz - az, L2 = lx * lx + lz * lz; return { ax, az, lx, lz, L: Math.sqrt(L2), t: ((this.pos.x - ax) * lx + (this.pos.z - az) * lz) / L2 }; };
        while (i < PAT.length - 2 && seg(i).t > 1) i++;
        this.pathIdx = i;
        let sg = seg(i), along = clamp(sg.t, 0, 1) * sg.L + 25, k = i;
        while (along > sg.L && k < PAT.length - 2) { along -= sg.L; k++; sg = seg(k); }
        const f = Math.min(1, along / sg.L);
        const cx = sg.ax + sg.lx * f, cz = sg.az + sg.lz * f;
        const altT = lerp(PAT[k][2], PAT[k + 1][2], f);
        if (i >= PAT.length - 2 && seg(i).t > 0) st('final');
        return law(bank(err(cx, cz), 0.55), alt(altT, 0.1));
      }
      case 'final': {
        this.status = '사뿐히 착륙하는 중 🛬';
        const td = west + 30;
        const altT = Math.max(0, (td - this.pos.x) * 0.125);
        if (this.pos.y < 1.3) { this.thrL = approach(this.thrL, 0, dt * 2); if (this.pos.y <= 0.001) st('rollout'); return law(bank(lineErr(), 0.15), -0.035); }
        spd(13, 0.55);
        if (this.pos.x > td + 60) { this.tilt = 0.5; st('climb'); }    // 너무 길면 다시 상승(복행)
        return law(bank(lineErr(), 0.3), clamp(-0.125 + (altT - this.pos.y) * 0.08, -0.3, 0.05));
      }
      case 'rollout':
        this.status = '착륙 완료! 속도 줄이는 중';
        this.thrL = 0;
        this.tilt = 0;
        if (this.V < 1) st('taxi');
        return law(0, 0, clamp(lineErr() * 2, -1, 1), true);
      case 'taxi': {
        this.status = '주기장으로 이동 중';
        // 활주로를 따라 내 칸 바로 앞까지 → 거기서 곧게 칸으로 (다른 비행기 사이를 가로지르지 않게)
        const entry = { x: P.x, z: R.z + 2 };
        if (!this.taxiIn && Math.hypot(entry.x - this.pos.x, entry.z - this.pos.z) < 4) this.taxiIn = true;
        const T = this.taxiIn ? P : entry;
        const e = err(T.x, T.z), d = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
        this.thrL = this.V < 3.5 && d > 3 ? 0.35 : 0;
        if (d < 3) { st('idle', 45); this.V = 0; this.taxiIn = false; }
        return law(0, 0, clamp(e * 2, -1, 1), this.V > 5 || d < 3);
      }
    }
    st('idle', 5);
    return law(0, 0, 0, true);
  }

  serialize() {
    const as = assignCode(this);
    return { as, grade: this.grade, skin: this.skin, custom: this.custom || {}, x: this.pos.x, z: this.pos.z, y: this.pos.y, h: this.heading, auto: this.auto, bulk: this.bulk, bulkKind: this.bulkKind, load: this.load, loadKind: this.loadKind, mix: this.mix, mixT: this.mixT, disp: this.dispensed };
  }
}

// ---------------- 담당 지정 (차량마다 맡을 축사·밭) ----------------
/** 차종별로 맡길 수 있는 곳: barn = 축사, field = 밭 */
export const ASSIGN_KINDS = { skid: ['barn'], forklift: ['barn'], mixer: ['barn'], balewagon: ['barn', 'field'], tractor: ['field'], baler: ['field'] };
const barnTag = (b) => `${b.icon} ${b.name}${G.barns.filter((x) => x.id === b.id).length > 1 ? ' ' + (G.barns.filter((x) => x.id === b.id).indexOf(b) + 1) + '동' : ''}`;
/** 'b<축사 번호>' | 'f<밭 id>' | '' */
export function assignCode(v) {
  const a = v.assign;
  if (a?.barn && G.barns.includes(a.barn)) return 'b' + G.barns.indexOf(a.barn);
  if (a?.field && G.fields.some((f) => f.id === a.field)) return 'f' + a.field;
  return '';
}
export function setAssignCode(v, code) {
  const kinds = ASSIGN_KINDS[v.type] || [];
  v.assign = null;
  if (typeof code !== 'string' || !code) return;
  if (code[0] === 'b' && kinds.includes('barn')) { const b = G.barns[Number(code.slice(1))]; if (b) v.assign = { barn: b }; }
  if (code[0] === 'f' && kinds.includes('field')) { const id = code.slice(1); if (G.fields.some((f) => f.id === id)) v.assign = { field: id }; }
  // 맡은 곳이 바뀌면 하던 일을 내려놓고 다시 고른다
  if (v.ai) { v.ai.sweep = null; v.ai.feedBarn = null; if (!v.seq && !v.carrying) { v.ai.task = null; v.ai.path = null; v.ai.think = 0; } }
}
/** 고를 수 있는 담당 목록 [{ code, label }] */
export function assignOptions(v) {
  const kinds = ASSIGN_KINDS[v.type];
  if (!kinds) return [];
  const out = [{ code: '', label: '📍 전체' }];
  if (kinds.includes('barn')) for (const b of G.barns) out.push({ code: 'b' + G.barns.indexOf(b), label: barnTag(b) });
  if (kinds.includes('field')) for (const f of G.fields) if (f.owned) out.push({ code: 'f' + f.id, label: `${CROPS[f.crop].icon} ${f.name}` });
  return out;
}
export function assignLabel(v) {
  const c = assignCode(v);
  return assignOptions(v).find((o) => o.code === c)?.label || '';
}

// 🧑‍🌾 처음 시작: 기계 없이 손수레 · 리어카로 손일부터 (돈을 모아 상점에서 트랙터·스키드로더 등을 산다)
export const START_FLEET = ['wheelbarrow', 'handcart', 'car'];
/** 예전 기본 장비 (손일 단계 전 저장본) */
export const OLD_FLEET = ['tractor', 'baler', 'forklift', 'skid', 'truck1', 'truck5', 'mixer', 'balewagon', 'car', 'heli', 'plane'];
export function createVehicles(types = START_FLEET) {
  G.vehicles = [];
  for (const t of types) addVehicle(t);
}
export function addVehicle(type) {
  const v = new Vehicle(type, G.vehicles.length);
  G.vehicles.push(v);
  return v;
}
