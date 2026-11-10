// 게임 설정 (localStorage 보관)
import { G } from './state.js';

const KEY = 'monggle-farm-settings-v1';

export const DEFAULT_SETTINGS = {
  mode: 'sim',          // 'sim' 시뮬레이션 | 'easy' 간편
  camFollow: true,      // 운전 시 카메라가 차량 뒤를 따라감
  fpDefault: false,     // 시작 시점 1인칭
  sensitivity: 1,       // 마우스 감도
  shadows: 'high',      // high | low | off
  curve: true,          // 둥근 지평선 효과
  music: 0.6,
  sfx: 0.8,
  dayLength: 6,         // 하루 길이 (분)
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* 무시 */ }
  G.settings = { ...DEFAULT_SETTINGS, ...s };
  return G.settings;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(G.settings)); } catch { /* 무시 */ }
}
