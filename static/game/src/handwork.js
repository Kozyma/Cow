// 🧑‍🌾 손으로 하는 농사일: 🖐️ 손(풀 모으기·짐 들기) · 🪏 삽(분뇨 푸기) · 🌾 낫(풀 베기)
// + 🛞 손수레(분뇨·퇴비) · 🛒 리어카(건초·팔레트·포대 2개)
// 처음 시작하면 기계 없이 이 도구들로 농장을 꾸리고, 돈을 모아 트랙터·스키드로더 등을 산다
import { G, LAYOUT, BALE_FEED, TRUCK_BULK_CAP, MAX_BALES, baleKind } from './state.js';
import { fieldAt, CROPS } from './field.js';
import {
  spawnBale, takeBulk, depositBulk, spreadCompost, sellCompost, addMuck, barnAlleyAt, nearMarket, sellItems, inYard, freeYardSlot,
  freeDockSlot, setOnDock, setOnTruck, truckCargo, freeTruckSlot, detachFromBarn,
} from './items.js';
import { inStation, freeStationSlot, setOnStation } from './feed.js';
import { shedAt } from './compost.js';
import { toast, floatText } from './ui.js';
import { sfx } from './audio.js';
import { spawn, burst } from './particles.js';
import { rand } from './util.js';

export const TOOLS = {
  hand: { icon: '🖐️', name: '손', act: '줍기' },
  shovel: { icon: '🪏', name: '삽', act: '푸기' },
  sickle: { icon: '🌾', name: '낫', act: '베기' },
};
export const TOOL_ORDER = ['hand', 'shovel', 'sickle'];
export const SHOVEL_CAP = 3;     // 삽 한 번에 뜨는 양
export const GATHER_N = 4;       // 벤 풀 4칸 = 건초 한 단
const REACH = 1.05;              // 손·도구가 닿는 앞쪽 거리

const isLocal = (p) => p === G.player;
const say = (p, x, z, txt, cls = 'good') => floatText(x, 2.3, z, txt, cls);
const front = (p, d = REACH) => ({ x: p.pos.x + Math.sin(p.heading) * d, z: p.pos.z + Math.cos(p.heading) * d });

export function initTools(p) {
  p.tool ||= 'hand';
  p.scoop ||= 0; p.scoopKind ||= null;
  p.armful ||= 0; p.armCrop ||= 'grass';
  p.held ||= null;
  p.swingN ||= 0;
  p.toolCD ||= 0;
}

export function setTool(p, t) {
  if (!TOOLS[t]) return;
  initTools(p);
  if (p.tool === t) return;
  // (삽에 뜬 분뇨·퇴비는 도구를 바꿔도 그대로 — 다시 삽을 들면 이어서 쏟는다)
  p.tool = t;
  if (isLocal(p)) { sfx('click'); floatText(p.pos.x, 2.6, p.pos.z, `${TOOLS[t].icon} ${TOOLS[t].name}`, ''); }
}
export function cycleTool(p) {
  initTools(p);
  setTool(p, TOOL_ORDER[(TOOL_ORDER.indexOf(p.tool) + 1) % TOOL_ORDER.length]);
}

/** 근처(손 닿는 곳)의 수레 */
function nearCart(p, type, r = 3.2) {
  let best = null, bd = r;
  for (const v of G.vehicles) {
    if (v.type !== type || v.driver) continue;
    const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

/** 손에 든 짐이 플레이어를 따라다니게 (매 프레임, 호스트) */
export function updateHeld(p) {
  const it = p.held;
  if (!it) return;
  if (it.removed || it.carriedBy !== p) { p.held = null; return; }
  const f = front(p, 0.6);
  it.pos.set(f.x, 0, f.z);
}

function holdItem(p, it) {
  detachFromBarn(it);
  it.reservedBy = null;
  it.fly = null;
  it.carriedBy = p;
  it.support = { kind: 'carried' };
  p.held = it;
  p.group.add(it.mesh);
  it.mesh.position.set(0, 0.62, 0.62);
  it.mesh.rotation.set(0, Math.PI / 2, 0);
  it.mesh.scale.setScalar(0.8);
  sfx('pickup');
}
function release(p) {
  const it = p.held;
  p.held = null;
  if (!it) return null;
  it.carriedBy = null;
  it.mesh.scale.setScalar(1);
  return it;
}

/** 들고 있던 짐 내려놓기: 자리에 따라 리어카 싣기 · 축사 사료 · 판매 · 배합장 · 출하장 · 보관소 · 바닥 */
function placeHeld(p) {
  const it = p.held;
  const f = front(p, 0.9);
  const local = isLocal(p);
  const cart = nearCart(p, 'handcart');
  if (cart && freeTruckSlot(cart) >= 0) {
    release(p);
    it.mesh.getWorldPosition(it.pos);
    setOnTruck(it, cart, freeTruckSlot(cart), true);
    sfx('drop');
    say(p, cart.pos.x, cart.pos.z, `리어카에 실었어요 ${truckCargo(cart).length}/${cart.m.slots.length}`);
    return;
  }
  const barn = it.kind === 'bale' && (barnAlleyAt(f.x, f.z) || barnAlleyAt(p.pos.x, p.pos.z));
  if (barn) {
    if (barn.feed > 100 - BALE_FEED * 0.6) { if (local) toast(`${barn.name} 사료가 이미 넉넉해요`, '🌾'); return; }
    release(p);
    const bk = baleKind(it);
    barn.addFeed(bk.feed, null);
    it.remove();
    burst('hay', f.x, 0.8, f.z, 16, { vy: 3.5 });
    say(p, f.x, f.z, `+사료 ${bk.icon}`);
    sfx('pop');
    return;
  }
  if (nearMarket(p.pos, 1) || nearMarket(f, 1)) { release(p); sellItems([it], LAYOUT.market); return; }
  if ((it.kind === 'sack' || it.kind === 'bale') && (inStation(f.x, f.z, 1) || inStation(p.pos.x, p.pos.z, 1))) {
    const s = freeStationSlot(null, f.x, f.z);
    if (s) { release(p); setOnStation(it, s); it.pop = 0.4; sfx('drop'); say(p, s.x, s.z, '배합장에 놓았어요'); return; }
  }
  const D = LAYOUT.dock;
  if (it.kind === 'pallet' && Math.hypot(f.x - D.x, f.z - D.z) < 6) {
    const s = freeDockSlot(null, f.x, f.z);
    if (s) { release(p); setOnDock(it, s); it.pop = 0.4; sfx('drop'); say(p, s.x, s.z, '출하장에 놓았어요 📦'); return; }
  }
  const Y = LAYOUT.yard;
  if (it.kind === 'bale' && (inYard(f.x, f.z) || Math.hypot(p.pos.x - Y.x, p.pos.z - Y.z) < 5.5)) {
    const s = freeYardSlot();
    if (s) { release(p); it.placeAt(s.x, s.z, Math.PI / 2); it.pop = 0.4; sfx('drop'); say(p, s.x, s.z, '건초 보관소에 놓았어요'); return; }
  }
  release(p);
  it.placeAt(f.x, f.z, p.heading + Math.PI / 2);
  it.pop = 0.5;
  sfx('drop');
}

/** 들고 있던 짐을 발밑에 내려놓기 (차를 타거나 집에 들어갈 때) */
export function dropHeld(p) {
  if (!p?.held) return;
  const it = release(p);
  const f = front(p, 0.8);
  it.placeAt(f.x, f.z, p.heading);
}

/** 손 닿는 곳의 짐 (건초·포대·팔레트) */
function itemNear(p) {
  const f = front(p, 0.9);
  let best = null, bd = 1.5;
  for (const it of G.items) {
    if (it.carriedBy || it.fly || it.removed) continue;
    if (it.support.kind === 'truck' && it.support.truck.driver) continue;
    const d = Math.hypot(it.pos.x - f.x, it.pos.z - f.z);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

/**
 * 도구 쓰기 (Space · 모바일 행동 버튼). 호스트에서만 계산한다.
 * @returns 처리했으면 true (손으로 할 게 없으면 false → 점프)
 */
export function useTool(p) {
  initTools(p);
  if (G.now < p.toolCD) return true;
  const local = isLocal(p);
  const f = front(p);
  if (p.tool === 'sickle') {
    p.toolCD = G.now + 0.32; p.swingN++;
    const fld = fieldAt(f.x, f.z, 0.8);
    if (!fld) { if (local) toast('낫은 밭에서 써요. 다 자란 풀 앞에서 Space!', '🌾', 1800); return true; }
    const cut = fld.cutAt(f.x, f.z, 1.55);
    if (cut.length) {
      sfx('cut');
      for (const t of cut) for (let i = 0; i < 3; i++) spawn('clip', t.x + rand(-0.6, 0.6), 0.5, t.z + rand(-0.6, 0.6), { vy: rand(2, 4), vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), grav: 9, life: 0.7, spin: rand(-12, 12) });
    } else if (local) say(p, f.x, f.z, fld.counts.tall ? '다 자란 풀 앞에서 베요' : '아직 다 자라지 않았어요', '');
    return true;
  }
  if (p.tool === 'shovel') {
    p.toolCD = G.now + 0.42; p.swingN++;
    const barrow = nearCart(p, 'wheelbarrow', 4.2);
    if (p.scoop < SHOVEL_CAP - 0.05) {
      const r = takeBulk(f.x, f.z, 1.9, SHOVEL_CAP - p.scoop, p.scoop > 0.05 ? p.scoopKind : null);
      if (r.got > 0.01) {
        p.scoop += r.got; p.scoopKind = r.kind;
        sfx('scoop');
        burst('muck', f.x, 0.5, f.z, 5, { vy: 2 });
        // 손수레가 바로 옆에 있으면 삽으로 뜬 걸 바로 손수레에 담는다
        if (barrow && intoBarrow(p, barrow)) return true;
        if (local) say(p, f.x, f.z, `${p.scoopKind === 'compost' ? '🟫 퇴비' : '💩 분뇨'} ${p.scoop.toFixed(1)}/${SHOVEL_CAP}`);
        return true;
      }
    }
    if (p.scoop > 0.05) {
      if (barrow && intoBarrow(p, barrow)) return true;
      if (p.scoopKind === 'compost' && !shedAt(f.x, f.z, 1.0) && !fieldAt(f.x, f.z, 1)) { if (local) toast('퇴비는 밭에 뿌리거나 🛞 손수레에 담아요', '🪏', 2000); return true; }
      depositBulk(p.scoopKind || 'manure', p.scoop, f.x, f.z, { manual: local, pad: 1.0 });
      burst('muck', f.x, 0.6, f.z, 8, { vy: 2.5 });
      p.scoop = 0;
      return true;
    }
    if (local) toast('축사 우리 바닥이나 쏟아진 분뇨 앞에서 삽으로 퍼요 (옆에 🛞 손수레를 두면 바로 담겨요)', '🪏', 2400);
    return true;
  }
  // 🖐️ 손
  if (p.held) { placeHeld(p); return true; }
  const fld = fieldAt(f.x, f.z, 0.8);
  if (fld && fld.counts.cut > 0 && (p.armful < 0.5 || fld.crop === p.armCrop)) {
    if (G.items.filter((i) => i.kind === 'bale').length >= MAX_BALES) { if (local) toast('건초가 너무 많아요! 먼저 옮기거나 팔아 주세요', '🌾'); return true; }
    const got = fld.collectAt(f.x, f.z, 1.5);
    if (got.length) {
      if (p.armful < 0.5) p.armCrop = fld.crop;
      p.armful += got.length;
      p.swingN++;
      sfx('cut');
      for (const t of got) for (let i = 0; i < 3; i++) spawn('hay', t.x + rand(-0.5, 0.5), 0.4, t.z + rand(-0.5, 0.5), { vy: rand(2, 3.5), grav: 9, life: 0.7, spin: rand(-10, 10) });
      if (p.armful >= GATHER_N) {
        const c = CROPS[p.armCrop] || CROPS.grass;
        let k = 0;
        while (p.armful >= GATHER_N) {
          p.armful -= GATHER_N;
          const side = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.3;
          const b = spawnBale(f.x + Math.cos(p.heading) * side, f.z - Math.sin(p.heading) * side, p.heading + Math.PI / 2, c.bale);
          b.pop = 0.001;
          k++;
        }
        sfx('bale');
        say(p, f.x, f.z, `${c.baleName} ${k > 1 ? k + '단' : '한 단'} 완성! ${c.icon}`);
      } else if (local) say(p, f.x, f.z, `풀 모으는 중 ${Math.floor(p.armful)}/${GATHER_N}`, '');
      return true;
    }
  }
  const it = itemNear(p);
  if (it) {
    if (it.support.kind === 'station' || it.support.kind === 'dock' || it.support.kind === 'truck' || it.support.kind === 'ground') { holdItem(p, it); return true; }
  }
  return false;
}

function intoBarrow(p, b) {
  const cap = TRUCK_BULK_CAP.wheelbarrow;
  if (b.bulk > 0.05 && b.bulkKind !== p.scoopKind) { if (isLocal(p)) toast('손수레에 다른 게 담겨 있어요 (분뇨와 퇴비는 섞지 않아요)', '🛞', 2000); return false; }
  if (b.bulk >= cap - 0.05) { if (isLocal(p)) toast('손수레가 가득 찼어요! 퇴비사 분뇨칸으로 밀고 가서 Space로 쏟아요', '🛞', 2400); return false; }
  const add = Math.min(p.scoop, cap - b.bulk);
  b.bulk += add; b.bulkKind = p.scoopKind;
  p.scoop -= add;
  if (p.scoop < 0.05) p.scoop = 0;
  sfx('dump');
  say(p, b.pos.x, b.pos.z, `🛞 ${b.bulkKind === 'compost' ? '퇴비' : '분뇨'} ${Math.round(b.bulk)}/${cap}`);
  return true;
}

// ---------------- 수레 (운전 중 Space) ----------------
/** 🛞 손수레: 퇴비사 분뇨칸에 쏟기 · 퇴비칸에서 퇴비 담기 · 밭에 퇴비 뿌리기 · 트럭 적재함에 붓기 */
export function barrowAction(v, local) {
  const fp = v.workPoint();
  const cap = TRUCK_BULK_CAP.wheelbarrow;
  if (v.bulk > 0.05) {
    const kind = v.bulkKind || 'manure';
    const sa = shedAt(fp.x, fp.z, 1.2) || shedAt(v.pos.x, v.pos.z, 1.5);
    if (sa) {
      const tx = kind === 'manure' ? sa.shed.rawPos : sa.shed.compostPos;
      depositBulk(kind, v.bulk, tx.x, tx.z, { manual: local, pad: 0.6 });
    } else if (kind === 'compost' && fieldAt(fp.x, fp.z, 1)) {
      spreadCompost(v.bulk, fp.x, fp.z);
    } else if (kind === 'compost' && (nearMarket(v.pos, 4) || nearMarket(fp, 3))) {
      sellCompost(v.bulk, LAYOUT.market);
    } else if (kind === 'compost' && !G.vehicles.some((t) => (t.type === 'truck1' || t.type === 'truck5') && Math.hypot(t.pos.x - fp.x, t.pos.z - fp.z) < 4.5)) {
      // 퇴비는 아무 데나 쏟지 않는다 (분뇨 더미가 되어 버리므로)
      if (local) toast('퇴비는 밭에 뿌리거나(밭에서 Space) 판매소에서 팔아요', '🛞', 2400);
      return;
    } else {
      const truck = G.vehicles.find((t) => (t.type === 'truck1' || t.type === 'truck5') && Math.hypot(t.pos.x - fp.x, t.pos.z - fp.z) < 4.5);
      if (truck) depositBulk(kind, v.bulk, truck.pos.x, truck.pos.z, { manual: local, truck, y: 1.6 });
      else {
        addMuck(fp.x, fp.z, v.bulk);
        if (local) toast(kind === 'compost' ? '퇴비는 밭에 뿌리거나 판매소에 가져가요' : '분뇨는 축사 뒤 퇴비사 분뇨칸에 쏟아 주세요', '🛞', 2400);
      }
    }
    burst('muck', fp.x, 0.7, fp.z, 10, { vy: 2.5 });
    sfx('dump');
    v.bulk = 0; v.bulkKind = null;
    return;
  }
  const sa = shedAt(fp.x, fp.z, 1.2);
  if (sa?.zone === 'compost' && sa.shed.compost > 0.5) {
    const r = takeBulk(sa.shed.compostPos.x, sa.shed.compostPos.z, 1, cap, 'compost');
    v.bulk = r.got; v.bulkKind = 'compost';
    sfx('scoop');
    if (local) floatText(fp.x, 2, fp.z, `🟫 퇴비 ${Math.round(v.bulk)}/${cap}`, 'good');
    return;
  }
  if (local) toast('손수레는 E로 내려서 🪏 삽으로 분뇨를 퍼 담아요. 가득 차면 퇴비사 분뇨칸 앞에서 Space로 쏟아요', '🛞', 3200);
}

/** 🛒 리어카: 자리에 맞게 내리기(축사 통로 사료 · 판매소 · 출하장 · 배합장 · 보관소) 또는 가까운 짐 싣기 */
export function cartAction(v, local) {
  const cargo = truckCargo(v).filter((it) => !it.fly);
  const back = { x: v.pos.x - Math.sin(v.heading) * 0.6, z: v.pos.z - Math.cos(v.heading) * 0.6 };
  const done = (txt) => { sfx('drop'); if (local) floatText(v.pos.x, 2.4, v.pos.z, txt, 'good'); };
  if (cargo.length) {
    const barn = barnAlleyAt(back.x, back.z) || barnAlleyAt(v.pos.x, v.pos.z);
    const bales = cargo.filter((it) => it.kind === 'bale');
    if (barn && bales.length) {
      let n = 0;
      for (const it of bales) { if (barn.feed > 100 - BALE_FEED * 0.6) break; barn.addFeed(baleKind(it).feed, null); it.remove(); n++; }
      if (n) { burst('hay', back.x, 1, back.z, 12 + n * 5, { vy: 3.5 }); sfx('pop'); if (local) floatText(back.x, 2.4, back.z, `+사료 🌾 ×${n}`, 'good'); }
      else if (local) toast(`${barn.name} 사료가 이미 넉넉해요`, '🌾');
      return;
    }
    if (nearMarket(v.pos, 5) || nearMarket(back, 3) || nearMarket(v.workPoint(), 3)) { sellItems(cargo, LAYOUT.market); return; }
    const D = LAYOUT.dock;
    const pallets = cargo.filter((it) => it.kind === 'pallet');
    if (pallets.length && Math.hypot(back.x - D.x, back.z - D.z) < 8) {
      let n = 0;
      for (const it of pallets) { const s = freeDockSlot(null, back.x, back.z); if (!s) break; setOnDock(it, s); it.pop = 0.4; n++; }
      if (n) { done(`출하장에 팔레트 ×${n} 📦`); return; }
    }
    const goods = cargo.filter((it) => it.kind === 'sack' || it.kind === 'bale');
    if (goods.length && (inStation(back.x, back.z, 3) || inStation(v.pos.x, v.pos.z, 3))) {
      let n = 0;
      for (const it of goods) { const s = freeStationSlot(null, back.x, back.z); if (!s) break; setOnStation(it, s); it.pop = 0.4; n++; }
      if (n) { done(`배합장에 ×${n} 🥣`); return; }
    }
    const Y = LAYOUT.yard;
    if (bales.length && Math.hypot(back.x - Y.x, back.z - Y.z) < 8) {
      let n = 0;
      for (const it of bales) { const s = freeYardSlot(); if (!s) break; it.placeAt(s.x, s.z, Math.PI / 2); it.pop = 0.4; n++; }
      if (n) { done(`건초 보관소에 ×${n}`); return; }
    }
  }
  // 싣기: 리어카 둘레의 짐 (건초·포대·팔레트)
  if (freeTruckSlot(v) >= 0) {
    let best = null, bd = 3.4;
    for (const it of G.items) {
      if (it.carriedBy || it.fly || it.removed || it.support.kind === 'truck' || it.support.kind === 'carried') continue;
      const d = Math.hypot(it.pos.x - v.pos.x, it.pos.z - v.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    if (best) {
      detachFromBarn(best);
      setOnTruck(best, v, freeTruckSlot(v), true);
      sfx('pickup');
      if (local) floatText(v.pos.x, 2.4, v.pos.z, `리어카에 실었어요 ${truckCargo(v).length}/${v.m.slots.length}`, 'good');
      return;
    }
  }
  if (cargo.length) {
    // 아무 데나: 뒤에 내려놓기
    const it = cargo[cargo.length - 1];
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    it.placeAt(v.pos.x - fx * 2.4, v.pos.z - fz * 2.4, v.heading + Math.PI / 2);
    it.pop = 0.4;
    done('내려놓았어요');
    return;
  }
  if (local) toast('리어카 옆 짐에서 Space로 실어요. 축사 통로·출하장·배합장·보관소·판매소에서 Space로 내려요', '🛒', 3000);
}

/** 화면 안내 (내 플레이어) → { prompt, label } */
export function toolHint(p) {
  initTools(p);
  const f = front(p);
  const t = TOOLS[p.tool];
  if (p.tool === 'hand') {
    const held = p.held || (p.heldKind ? { kind: p.heldKind } : null);   // (친구 화면: 방장이 알려 준 들고 있는 짐 종류)
    if (held) {
      const cart = nearCart(p, 'handcart');
      const where = cart && freeTruckSlot(cart) >= 0 ? '리어카에 싣기' : held.kind === 'bale' && (barnAlleyAt(f.x, f.z) || barnAlleyAt(p.pos.x, p.pos.z)) ? '축사에 사료로 주기' : nearMarket(p.pos, 1) ? '팔기' : '내려놓기';
      return { prompt: `<kbd>Space</kbd> 🖐️ ${where}`, label: `🖐️ ${where.replace('축사에 사료로 주기', '사료 주기')}` };
    }
    const fld = fieldAt(f.x, f.z, 0.8);
    if (fld && fld.counts.cut > 0) return { prompt: `<kbd>Space</kbd> 🖐️ 벤 풀 모으기 ${Math.floor(p.armful)}/${GATHER_N} (다 모으면 건초 한 단)`, label: '🖐️ 풀 모으기' };
    const it = itemNear(p);
    if (it) return { prompt: `<kbd>Space</kbd> 🖐️ ${it.kind === 'bale' ? '건초' : it.kind === 'sack' ? '포대' : '팔레트'} 들기`, label: '🖐️ 들기' };
    return null;
  }
  if (p.tool === 'shovel') {
    if (p.scoop > 0.05) return { prompt: `<kbd>Space</kbd> 🪏 쏟기 (${p.scoopKind === 'compost' ? '퇴비' : '분뇨'} ${p.scoop.toFixed(1)}) · 퇴비사 분뇨칸 · 🛞 손수레에`, label: '🪏 쏟기' };
    const barrow = nearCart(p, 'wheelbarrow', 4.2);
    return { prompt: `<kbd>Space</kbd> 🪏 분뇨 푸기${barrow ? ` → 🛞 손수레 ${Math.round(barrow.bulk)}/${TRUCK_BULK_CAP.wheelbarrow}` : ' (🛞 손수레를 옆에 두면 바로 담겨요)'}`, label: `${t.icon} ${t.act}` };
  }
  const fld = fieldAt(f.x, f.z, 0.8);
  if (fld) return { prompt: `<kbd>Space</kbd> 🌾 ${CROPS[fld.crop].name} 베기 · 벤 풀은 🖐️ 손으로 모아 건초 한 단`, label: '🌾 베기' };
  return null;
}
