// localStorage 저장/불러오기
import { G, LAYOUT, BARN_DEFS } from './state.js';
import { Item, setOnDock, setOnTruck, dockSlots, addMuck } from './items.js';
import { stationSlots, setOnStation, relocateStation, stationFootprint } from './feed.js';
import { addBarn, Barn } from './barns.js';
import { createVehicles } from './vehicles.js';
import { relocateDock, dockFootprint } from './world.js';
import { clearSite } from './layout.js';
import { buildGrid } from './pathfinding.js';
import { reloadHouse } from './house.js';

const KEY = 'monggle-farm-save-v4';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

function itemData(it) {
  const s = it.support;
  const base = { k: it.kind, p: it.product };
  if (s.kind === 'dock') return { ...base, s: 'd', i: s.slot };
  if (s.kind === 'station') return { ...base, s: 's', i: s.slot };
  if (s.kind === 'truck') return { ...base, s: 't', v: G.vehicles.indexOf(s.truck), i: s.slot };
  return { ...base, s: 'g', x: +it.pos.x.toFixed(2), z: +it.pos.z.toFixed(2), h: +it.heading.toFixed(2) };
}

export function saveGame() {
  if (!G.started) return;
  const data = {
    v: 4,
    coins: G.coins, day: G.day, time: G.time, prices: G.prices,
    upgrades: G.upgrades, fertileTimer: G.fertileTimer, stats: G.stats,
    barns: G.barns.map((b) => ({
      id: b.id, cx: b.cx, front: b.front, n: b.animals.length, cap: b.capacity, exp: b.expansions,
      feed: b.feed, happy: b.happiness, buf: b.buffer, pallets: b.pallets.length, boost: Math.round(b.boostT),
      cells: b.cells.map((c) => +c.amt.toFixed(2)), raw: +b.shed.raw.toFixed(2), compost: +b.shed.compost.toFixed(2),
    })),
    station: { x: LAYOUT.station.x, z: LAYOUT.station.z },
    dock: { x: LAYOUT.dock.x, z: LAYOUT.dock.z },
    field: G.field.serialize(),
    items: G.items.filter((i) => !i.barn && !i.carriedBy && !i.removed && !i.fly).map(itemData),
    muck: G.muck.map((m) => [+m.x.toFixed(2), +m.z.toFixed(2), +m.amount.toFixed(2)]),
    vehicles: G.vehicles.map((v) => ({ type: v.type, ...v.serialize() })),
    house: G.house,
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 저장 실패 무시 */ }
}

export function loadGame() {
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch { return false; }
  if (!d || d.v !== 4) return false;
  G.coins = d.coins; G.day = d.day; G.time = d.time;
  Object.assign(G.prices, d.prices || {});
  Object.assign(G.upgrades, d.upgrades || {});
  G.fertileTimer = d.fertileTimer || 0;
  Object.assign(G.stats, d.stats || {});
  for (const it of [...G.items]) it.remove();

  // 시설 위치
  if (d.station && (d.station.x !== LAYOUT.station.x || d.station.z !== LAYOUT.station.z)) {
    clearSite(stationFootprint(d.station.x, d.station.z));
    relocateStation(d.station.x, d.station.z);
  }
  if (d.dock && (d.dock.x !== LAYOUT.dock.x || d.dock.z !== LAYOUT.dock.z)) {
    clearSite(dockFootprint(d.dock.x, d.dock.z));
    relocateDock(d.dock.x, d.dock.z);
  }
  // 축사 다시 짓기
  for (const b of G.barns) {
    for (const a of b.animals) G.scene.remove(a.group);
    b.destroy();
  }
  G.barns = [];
  for (const bd of d.barns || []) {
    const def = BARN_DEFS.find((x) => x.id === bd.id);
    if (!def) continue;
    clearSite(Barn.footprint(def, bd.cx, bd.front));
    const b = addBarn(bd.id, bd.cx, bd.front, { animals: 0, manure: false });
    b.capacity = bd.cap; b.expansions = bd.exp;
    for (let i = 0; i < bd.n; i++) b.addAnimal(false);
    b.feed = bd.feed; b.happiness = bd.happy; b.buffer = bd.buf; b.boostT = bd.boost || 0;
    if (bd.cells?.length === b.cells.length) bd.cells.forEach((a, i) => { b.cells[i].amt = a; });
    b.dirtyManure = true;
    b.shed.raw = bd.raw || 0; b.shed.compost = bd.compost || 0;
    for (let i = 0; i < Math.min(3, bd.pallets); i++) b.spawnPallet(true);
    b.updateVisuals();
  }
  G.field.deserialize(d.field);
  // 차량
  for (const v of G.vehicles) G.scene.remove(v.group);
  createVehicles((d.vehicles || []).map((v) => v.type));
  (d.vehicles || []).forEach((s, i) => {
    const v = G.vehicles[i];
    if (!v) return;
    v.pos.set(s.x, 0, s.z); v.heading = s.h; v.auto = s.auto;
    v.bulk = s.bulk || 0; v.bulkKind = s.bulkKind || null; v.load = s.load || 0; v.loadKind = s.loadKind || null;
    if (s.mix) { v.mix = s.mix; v.mixT = s.mixT || 0; v.dispensed = s.disp || 0; }
    v.syncVisual();
  });
  const dslots = dockSlots(), sslots = stationSlots();
  for (const o of d.items || []) {
    const it = new Item(o.k, o.p);
    if (o.s === 'd' && dslots[o.i]) setOnDock(it, dslots[o.i]);
    else if (o.s === 't' && G.vehicles[o.v]?.m.slots) setOnTruck(it, G.vehicles[o.v], o.i);
    else if (o.s === 's' && sslots[o.i]) setOnStation(it, sslots[o.i]);
    else it.placeAt(o.x ?? 0, o.z ?? 0, o.h ?? 0);
  }
  for (const [x, z, a] of d.muck || []) addMuck(x, z, a);
  if (d.house) { G.house = d.house; reloadHouse(); }
  buildGrid(1.75);
  return true;
}
