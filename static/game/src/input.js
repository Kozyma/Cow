import { G } from './state.js';
import { clamp } from './util.js';

const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.just = new Set();
    /** 모바일 조이스틱 아날로그 값 (-1~1, 화면 기준: x 오른쪽 +, y 아래 +). active=false면 키보드만 사용 */
    this.axis = { x: 0, y: 0, active: false };
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.just.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // 마우스: 3인칭은 드래그로 회전, 1인칭은 포인터 잠금(클릭) 또는 드래그로 둘러보기
    let drag = null;
    // 두 손가락 핀치 줌 (모바일)
    const touches = new Map();
    let pinch = 0;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    canvas.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) {
          const f = pinch / d;
          if (G.mode === 'build') G.buildDist = clamp(G.buildDist * f, 35, 140);
          else if (!G.cam.fp) G.cam.dist = clamp(G.cam.dist * f, 10, 75);
        }
        pinch = d;
        drag = null;
      }
    });
    const tEnd = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
    canvas.addEventListener('pointerup', tEnd);
    canvas.addEventListener('pointercancel', tEnd);
    const look = (dx, dy) => {
      if (G.mode !== 'farm' && G.mode !== 'plaza') return;
      const k = (G.settings?.sensitivity ?? 1);
      if (G.cam.fp) {
        if (G.driving) G.cam.fpOff = clamp(G.cam.fpOff - dx * 0.0028 * k, -2.6, 2.6);
        else G.cam.fpYaw -= dx * 0.0028 * k;
        G.cam.fpPitch = clamp(G.cam.fpPitch - dy * 0.0024 * k, -1.2, 1.0);
      } else {
        G.cam.yaw -= dx * 0.006 * k;
        G.cam.pitch = clamp(G.cam.pitch + dy * 0.004 * k, 0.4, 1.35);
        G.cam.dragT = 2.5;
      }
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (G.cam.fp && G.started && !G.paused && document.pointerLockElement !== canvas && e.pointerType === 'mouse') {
        canvas.requestPointerLock?.();
        return;
      }
      // 터치는 살짝 닿거나 탭할 때 화면이 돌아가지 않도록, 일정 거리 이상 끌어야 회전 시작
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', live: e.pointerType === 'mouse', sx: e.clientX, sy: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement === canvas) { look(e.movementX, e.movementY); return; }
      if (!drag || drag.id !== e.pointerId || touches.size > 1) return;
      if (!drag.live) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 12) return;
        drag.live = true;
        drag.x = e.clientX; drag.y = e.clientY;
        return;
      }
      const f = drag.touch ? 0.6 : 1;   // 터치는 손가락 이동량이 커서 감도를 낮춤
      const dx = (e.clientX - drag.x) * f, dy = (e.clientY - drag.y) * f;
      drag.x = e.clientX; drag.y = e.clientY;
      look(dx, dy);
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (G.cam.fp || (G.mode !== 'farm' && G.mode !== 'plaza')) return;
      G.cam.dist = clamp(G.cam.dist * (1 + Math.sign(e.deltaY) * 0.08), 10, 75);
    }, { passive: false });
  }
  /** blocked: 상점·설정 창이 열려 있으면 이동/운전 키를 무시 (게임은 계속 진행) */
  down(code) { return !this.blocked && this.keys.has(code); }
  pressed(code) { return this.just.has(code); }
  tap(code) { this.just.add(code); }
  hold(code, on) { if (on) this.keys.add(code); else this.keys.delete(code); }
  setAxis(x, y, active) { this.axis.x = x; this.axis.y = y; this.axis.active = active; }
  endFrame() { this.just.clear(); }
}
