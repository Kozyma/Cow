// 전역 게임 상태와 밸런스 상수

export const G = {
  scene: null,
  camera: null,
  renderer: null,
  input: null,
  now: 0,                 // 실제 경과 시간(초)
  coins: 1000,
  skinsOwned: ["base"],   // 🎨 차고: 사 둔 페인트
  day: 1,
  time: 6.5 * 60,         // 하루 중 분 (0~1440)
  timeScale: 4,           // 실제 1초 = 게임 4분 → 하루 6분
  barns: [],
  vehicles: [],
  items: [],
  muck: [],               // 바닥에 쏟아진 분뇨 더미
  field: null,
  player: null,
  colliders: [],
  driving: null,
  riding: null,           // 옆자리에 동승 중인 비행기·헬기
  viewTarget: null,       // 관전 중인 차량
  cam: { yaw: 0, pitch: 0.92, dist: 28, dragT: 0, fp: false, fpYaw: Math.PI, fpPitch: -0.08, fpOff: 0 },
  upgrades: { autoSpeed: 0 },
  fertileTimer: 0,
  compostLevel: 0,
  night: 0,
  started: false,
  paused: false,
  stats: { earned: 0, shipped: 0, bales: 0 },
  mode: 'farm',            // farm | house | build
  prices: { milk: 1, truffle: 1, egg: 1, beef: 1 },  // 오늘의 시세 배수
  snackT: 0,               // 새참 버프 남은 시간
  house: null,             // 집 꾸미기 상태
};

// 장비 상점 (추가 구매 가능)
export const VEHICLE_SHOP = {
  tractor: 2600, baler: 3200, forklift: 2200, skid: 2400, truck1: 2000, truck5: 3800, mixer: 3400, balewagon: 3000, heli: 5200, plane: 7800, liner: 16000, jet: 22000,
};
export const MAX_VEHICLES = 16;

export const LAYOUT = {
  bound: 230,
  // ✈️ 남쪽 비행장: 활주로(동서 방향) · 비행기 주기장 · 헬기장
  // 비행기 세 대는 활주로 옆 주기장에 활주로를 바라보고 선다 (활주로는 늘 비워 둔다)
  airfield: { runway: { x: 0, z: 104, len: 220, w: 14 }, heli: { x: -40, z: 84, h: Math.PI }, hangar: { x: -70, z: 121 },
    apron: { x: -96, z: 121, w: 32, d: 18 },
    plane: { x: -106, z: 120, h: Math.PI }, liner: { x: -95, z: 121, h: Math.PI }, jet: { x: -85, z: 120, h: Math.PI } },
  roadZ: -6,
  dock: { x: 6, z: 3.5, w: 10, d: 6, bay: { x: 6, z: 12 } },      // 출하장 (팔레트 보관)
  market: { x: 54, z: 5, r: 5 },                                    // 판매소
  yard: { x: -16, z: 6, cols: 4, rows: 3, gap: 1.9 },
  field: { x0: 16, z0: 18, cols: 22, rows: 20, tile: 2 },          // x 16..60, z 18..58
  parking: Array.from({ length: 16 }, (_, i) => ({ x: -28 + (i % 8) * 5.5, z: 24 + Math.floor(i / 8) * 9 })),
  station: { x: -32, z: 5, w: 11, d: 6, bay: { x: -32, z: 12.5 } },  // 배합장 (원료 보관)
  store: { x: -54, z: 5, r: 4.5 },                                   // 사료 가게
  spawn: { x: -38, z: 34 },
  farmhouse: { x: -44, z: 28 },
  pond: { x: -50, z: 47, r: 6 },
};

export const BARN_DEFS = [
  { id: 'cow', name: '젖소 축사', animal: 'cow', icon: '🐮', cx: -40, front: -12, len: 32, width: 26, cap: 10, start: 4, expand: 4, product: 'milk', roof: 0xec7d70, trim: 0xc9645a, curtain: 0xffd6de, bed: 0xe9d6a8 },
  { id: 'pig', name: '돼지 축사', animal: 'pig', icon: '🐷', cx: -6, front: -12, len: 30, width: 24, cap: 12, start: 4, expand: 4, product: 'truffle', roof: 0x84c46f, trim: 0x5fa64f, curtain: 0xd8f2c8, bed: 0xd8c09a },
  { id: 'hanwoo', name: '한우 축사', animal: 'hanwoo', icon: '🐂', cx: 0, front: -12, len: 32, width: 26, cap: 8, start: 3, expand: 4, product: 'beef', roof: 0xe39a5b, trim: 0xb8733a, curtain: 0xffe2c2, bed: 0xe6cfa0, optional: true, buildPrice: 6000 },
  { id: 'chicken', name: '닭 계사', animal: 'chicken', icon: '🐔', cx: 28, front: -12, len: 28, width: 22, cap: 24, start: 8, expand: 8, product: 'egg', roof: 0x7cb7f0, trim: 0x5a95d0, curtain: 0xfff0b3, bed: 0xf1e2b8 },
];

// 게임 1시간당 수치
/** 축사 하나에 키울 수 있는 최대 마릿수 (확장 5단계) */
export const MAX_ANIMALS = 50;
export const BARN_EXPAND_STEPS = 5;

export const ANIMAL_DEFS = {
  cow: { name: '젖소', eat: 2.0, manure: 1.3, rate: 1.0, speed: 1.0, price: 300 },
  pig: { name: '돼지', eat: 1.5, manure: 1.5, rate: 0.55, speed: 1.2, price: 250 },
  chicken: { name: '닭', eat: 0.5, manure: 0.4, rate: 1.0, speed: 1.5, price: 90 },
  hanwoo: { name: '한우', eat: 2.4, manure: 1.5, rate: 0.35, speed: 0.95, price: 450 },
};

export const PRODUCTS = {
  milk: { name: '우유', icon: '🥛', pallet: 8, price: 200 },
  truffle: { name: '트러플', icon: '🍄', pallet: 5, price: 220 },
  egg: { name: '달걀', icon: '🥚', pallet: 12, price: 160 },
  beef: { name: '한우 선물세트', icon: '🥩', pallet: 4, price: 520 },
};

export const BALE_FEED = 25;     // 건초 1개 = 사료 25
export const BALE_PRICE = 25;    // 건초 판매가
export const BUCKET_CAP = 25;    // 스키드로더 버킷 용량
export const TRUCK_BULK_CAP = { truck1: 30, truck5: 75 };
export const COMPOST = { cap: 150, rate: 9, price: 7 };   // 퇴비사 용량, 시간당 발효량, 퇴비 단가
export const GROW_TIME = 110;    // 목초 재성장 시간(초)
export const MAX_BALES = 48;

// ---------------- 사료 배합 ----------------
export const INGREDIENTS = {
  hay: { name: '건초', icon: '🌾', color: 0xf4d36b },
  corn: { name: '옥수수', icon: '🌽', color: 0xffc83d, price: 80 },
  soy: { name: '대두박', icon: '🫘', color: 0xd8b48a, price: 100 },
};
// 동물별 배합 비율 (단위: 원료 1개 = 팔레트/건초 1개)
export const RECIPES = {
  cow: { name: '젖소용 TMR', icon: '🐮', hay: 2, corn: 1, soy: 1 },
  pig: { name: '돼지 배합사료', icon: '🐷', hay: 0, corn: 2, soy: 1 },
  chicken: { name: '닭 배합사료', icon: '🐔', hay: 0, corn: 1, soy: 1 },
  hanwoo: { name: '한우 비육 TMR', icon: '🐂', hay: 3, corn: 2, soy: 1 },
};
export const MIX_UNIT_FEED = 22;   // 원료 1개당 사료량
export const MIXER_CAP = 6;        // 배합기 최대 원료 수
export const MIX_TIME = 6;         // 배합(오거 회전) 필요 시간(초)
