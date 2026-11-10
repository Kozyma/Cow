// WebAudio로 만든 귀여운 효과음과 잔잔한 배경음악
import { G } from './state.js';

let ctx = null, master, sfxGain, musicGain;
let musicOn = true;
let musicVol = 0.6, sfxVol = 0.8;
let engine = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.7 * sfxVol; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.27 * musicVol; musicGain.connect(master);
  startEngine();
  startMusic();
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = null, when = 0, attack = 0.005, out = sfxGain, vibrato = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  if (vibrato) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 6; lg.gain.value = vibrato;
    l.connect(lg); lg.connect(o.frequency);
    l.start(t); l.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 1, when = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t);
}

export function sfx(name) {
  if (!ctx) return;
  switch (name) {
    case 'pop': tone(520, 0.12, { slide: 880, vol: 0.25 }); break;
    case 'click': tone(700, 0.06, { type: 'square', vol: 0.08 }); break;
    case 'hop': tone(380, 0.15, { slide: 640, vol: 0.12, type: 'triangle' }); break;
    case 'pickup': tone(330, 0.1, { vol: 0.2 }); tone(495, 0.12, { vol: 0.2, when: 0.07 }); break;
    case 'drop': tone(300, 0.14, { slide: 180, vol: 0.18, type: 'triangle' }); break;
    case 'coin':
      tone(988, 0.1, { type: 'square', vol: 0.09 });
      tone(1319, 0.3, { type: 'square', vol: 0.09, when: 0.08 });
      break;
    case 'ding': tone(1046, 0.4, { vol: 0.18 }); tone(1568, 0.5, { vol: 0.1, when: 0.05 }); break;
    case 'buy': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.18, when: i * 0.07 })); break;
    case 'error': tone(220, 0.15, { type: 'square', vol: 0.06 }); tone(196, 0.2, { type: 'square', vol: 0.06, when: 0.1 }); break;
    case 'alert': tone(660, 0.12, { vol: 0.15, type: 'triangle' }); tone(660, 0.12, { vol: 0.15, type: 'triangle', when: 0.18 }); break;
    case 'cut': noise(0.08, { vol: 0.12, freq: 3000, q: 0.8 }); break;
    case 'bale': tone(200, 0.25, { slide: 120, type: 'triangle', vol: 0.3 }); noise(0.2, { vol: 0.15, freq: 800 }); tone(784, 0.15, { vol: 0.12, when: 0.2 }); break;
    case 'scoop': noise(0.3, { vol: 0.25, freq: 400, q: 0.7 }); break;
    case 'dump': noise(0.4, { vol: 0.3, freq: 300, q: 0.6 }); tone(392, 0.15, { vol: 0.12, when: 0.3 }); tone(523, 0.2, { vol: 0.12, when: 0.42 }); break;
    case 'board': tone(262, 0.1, { type: 'triangle', vol: 0.2 }); tone(392, 0.15, { type: 'triangle', vol: 0.2, when: 0.08 }); break;
    case 'unboard': tone(392, 0.1, { type: 'triangle', vol: 0.2 }); tone(262, 0.15, { type: 'triangle', vol: 0.2, when: 0.08 }); break;
    case 'moo': tone(210, 0.75, { type: 'sawtooth', vol: 0.09, slide: 150, attack: 0.08, vibrato: 4 }); tone(105, 0.75, { type: 'sine', vol: 0.12, slide: 80, attack: 0.08 }); break;
    case 'oink': tone(330, 0.12, { type: 'square', vol: 0.06, slide: 260 }); tone(360, 0.14, { type: 'square', vol: 0.06, slide: 240, when: 0.15 }); break;
    case 'cluck': for (let i = 0; i < 3; i++) tone(900 - i * 60, 0.06, { type: 'square', vol: 0.05, slide: 600, when: i * 0.09 }); break;
    case 'meow': tone(700, 0.35, { type: 'triangle', vol: 0.12, slide: 520, attack: 0.04, vibrato: 10 }); break;
    case 'sleep': [392, 330, 262].forEach((f, i) => tone(f, 0.5, { vol: 0.14, when: i * 0.25 })); break;
    case 'cook': noise(0.6, { vol: 0.12, freq: 2500, q: 0.5 }); tone(880, 0.2, { vol: 0.1, when: 0.5 }); tone(1175, 0.3, { vol: 0.1, when: 0.62 }); break;
    case 'day': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, { vol: 0.14, when: i * 0.12 })); break;
  }
}

// ---------------- 엔진 소리 ----------------
function startEngine() {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 50;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
  const g = ctx.createGain(); g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(sfxGain);
  o.start();
  engine = { o, f, g };
}

export function updateEngine() {
  if (!engine) return;
  const v = G.driving;
  const t = ctx.currentTime;
  if (!v) { engine.g.gain.setTargetAtTime(0, t, 0.1); return; }
  const s = Math.min(1.5, Math.abs(v.speed) / v.def.maxSpeed);
  engine.o.frequency.setTargetAtTime(45 + s * 55 + (v.boosting ? 20 : 0), t, 0.1);
  engine.f.frequency.setTargetAtTime(250 + s * 400, t, 0.1);
  engine.g.gain.setTargetAtTime(0.06 + s * 0.06, t, 0.1);
}

// ---------------- 배경 음악 ----------------
const CHORDS = [
  [261.63, 329.63, 392.0],   // C
  [220.0, 261.63, 329.63],   // Am
  [174.61, 220.0, 261.63],   // F
  [196.0, 246.94, 293.66],   // G
];
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
let beat = 0, nextT = 0, timer = null;

function startMusic() {
  nextT = ctx.currentTime + 0.2;
  timer = setInterval(schedule, 100);
}

function schedule() {
  if (!ctx || !musicOn || musicVol <= 0.001) { if (ctx) nextT = ctx.currentTime + 0.1; return; }
  const spb = 60 / 92 / 2; // 8분음표
  while (nextT < ctx.currentTime + 0.4) {
    const bar = Math.floor(beat / 8) % 4;
    const chord = CHORDS[bar];
    const step = beat % 8;
    const night = G.night > 0.5;
    if (step === 0) tone(chord[0] / 2, spb * 7, { type: 'sine', vol: 0.5, out: musicGain, when: nextT - ctx.currentTime, attack: 0.02 });
    if (step % 2 === 0) tone(chord[(step / 2) % 3], spb * 1.8, { type: 'triangle', vol: 0.18, out: musicGain, when: nextT - ctx.currentTime, attack: 0.01 });
    if (Math.random() < (night ? 0.25 : 0.42)) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)] * (night ? 0.5 : 1);
      tone(n, spb * 1.6, { type: 'sine', vol: 0.22, out: musicGain, when: nextT - ctx.currentTime, attack: 0.01 });
    }
    nextT += spb;
    beat++;
  }
}

export function setVolumes(m, s) {
  musicVol = m; sfxVol = s;
  if (musicGain) musicGain.gain.value = 0.27 * m;
  if (sfxGain) sfxGain.gain.value = 0.7 * s;
}

/** 피아노 한 음 */
export function playNote(freq) {
  if (!ctx) return;
  tone(freq, 0.9, { type: 'triangle', vol: 0.25, attack: 0.005 });
  tone(freq * 2, 0.5, { type: 'sine', vol: 0.06, attack: 0.005 });
}
