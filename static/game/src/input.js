import { G } from './state.js';
import { clamp } from './util.js';

const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.just = new Set();
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
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement === canvas) { look(e.movementX, e.movementY); return; }
      if (!drag || drag.id !== e.pointerId || touches.size > 1) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
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
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.just.has(code); }
  tap(code) { this.just.add(code); }
  hold(code, on) { if (on) this.keys.add(code); else this.keys.delete(code); }
  endFrame() { this.just.clear(); }
}
