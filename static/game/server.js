// 몽글몽글 목장 서버: 게임 파일 제공 + 멀티플레이 중계(WebSocket)
//  - 방을 만든 사람(호스트)의 브라우저가 농장 전체를 계산하고
//  - 참가자(게스트)는 입력을 보내고 호스트가 보내는 상태를 받아 그린다.
//  외부 패키지 없이 Node.js(18+) 기본 모듈만 사용한다.
//  실행: node server.js  (기본 포트 8931, PORT 환경변수로 변경)
//  운영 서버에서는 Caddy가 '…/ws' 경로만 이 서버로 넘기고, 게임 파일은 웹앱이 제공한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8931;
const MAX_GUESTS = 7;
const MAX_FRAME = 4 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const PUBLIC = new Set(['index.html', 'style.css']);

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const rel = path.normalize(p).replace(/^[/\\]+/, '');
  // 게임 파일만 제공 (서버 코드 등은 막음)
  if (!(PUBLIC.has(rel) || rel.startsWith('src' + path.sep) || rel.startsWith('src/'))) { res.writeHead(404); res.end(); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------- 아주 작은 WebSocket (RFC 6455, 텍스트 메시지만) ----------------
class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.open = true;
    this.alive = true;
    this.onmessage = null;
    this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.feed(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }
  feed(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME || !masked) { this.close(1009); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this.frame(0xa, payload); continue; }
      if (op === 0xa) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x0) {
        this.frags.push(payload);
        if (this.frags.reduce((s, f) => s + f.length, 0) > MAX_FRAME) { this.close(1009); return; }
        if (fin) {
          const text = Buffer.concat(this.frags).toString('utf8');
          this.frags = [];
          this.onmessage?.(text);
        }
      }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(text) { this.frame(0x1, Buffer.from(text, 'utf8')); }
  ping() { this.frame(0x9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
    this.frame(0x8, p);
    this.open = false;
    this.socket.end();
    this.closed();
  }
  closed() {
    if (this.done) return;
    this.done = true;
    this.open = false;
    this.socket.destroy();
    this.onclose?.();
  }
}

const conns = new Set();
server.on('upgrade', (req, socket) => {
  const url = (req.url || '').split('?')[0];
  const key = req.headers['sec-websocket-key'];
  // 단독 실행은 /ws, 운영 서버는 /static/game/ws 처럼 '…/ws'로 끝나면 받는다
  if (!url.endsWith('/ws') || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const ws = new Conn(socket);
  conns.add(ws);
  ws.onmessage = (text) => onMessage(ws, text);
  ws.onclose = () => { conns.delete(ws); leave(ws); };
});

// ---------------- 방 ----------------
/** code → { host, guests: Map<id, conn>, nextId } */
const rooms = new Map();
const clean = (s, n) => String(s ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, n);
const send = (ws, m) => { if (ws?.open) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };

function onMessage(ws, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (ws.plaza) { onPlaza(ws, m); return; }
  if (!ws.room) { handshake(ws, m); return; }
  const room = rooms.get(ws.room);
  if (!room) return;
  if (ws.isHost) {
    // 호스트 → 특정 게스트 또는 전체
    if (m.t === 'to') {
      const data = JSON.stringify(m.m);
      if (m.id === 'all') for (const g of room.guests.values()) send(g, data);
      else send(room.guests.get(m.id), data);
    } else if (m.t === 'kick') {
      room.guests.get(m.id)?.close(4000);
    } else if (m.t === 'public') {
      // 농장 문 열기: 광장 게시판에 올리기
      room.public = !!m.on;
      room.title = clean(m.title, 24) || `${ws.name}의 농장`;
      farmsChanged();
    }
  } else {
    // 게스트 → 호스트 (보낸 사람 id를 붙여서)
    send(room.host, { t: 'g', from: ws.id, m });
  }
}

function handshake(ws, m) {
  if (m.t === 'plaza') { enterPlaza(ws, m); return; }
  const code = clean(m.room, 12).toUpperCase();
  const name = clean(m.name, 12) || '농부';
  if (!/^[A-Z0-9]{3,12}$/.test(code)) return send(ws, { t: 'error', msg: '방 코드는 영문/숫자 3~12자예요' });
  if (m.t === 'host') {
    if (rooms.has(code)) return send(ws, { t: 'error', msg: '이미 있는 방 코드예요. 다른 코드를 써 주세요' });
    rooms.set(code, { host: ws, guests: new Map(), nextId: 1 });
    Object.assign(ws, { room: code, isHost: true, id: 0, name });
    send(ws, { t: 'hosted', room: code, id: 0 });
    console.log(`[방 ${code}] ${name} 님이 방을 열었어요 (방 ${rooms.size}개)`);
  } else if (m.t === 'join') {
    const room = rooms.get(code);
    if (!room) return send(ws, { t: 'error', msg: '그런 방이 없어요. 방 코드를 확인해 주세요' });
    if (room.guests.size >= MAX_GUESTS) return send(ws, { t: 'error', msg: `방이 가득 찼어요 (최대 ${MAX_GUESTS + 1}명)` });
    const id = room.nextId++;
    Object.assign(ws, { room: code, isHost: false, id, name });
    room.guests.set(id, ws);
    send(ws, { t: 'joined', room: code, id });
    send(room.host, { t: 'join', id, name });
    if (room.public) farmsChanged();
    console.log(`[방 ${code}] ${name} 님 입장 (${room.guests.size + 1}명)`);
  }
}

function leave(ws) {
  if (ws.plaza) { leavePlaza(ws); return; }
  const room = rooms.get(ws.room);
  if (!room) return;
  if (ws.isHost) {
    if (room.host !== ws) return;
    for (const g of room.guests.values()) { send(g, { t: 'hostgone' }); g.close(); }
    rooms.delete(ws.room);
    if (room.public) farmsChanged();
    console.log(`[방 ${ws.room}] 호스트가 나가서 방이 닫혔어요`);
  } else if (room.guests.get(ws.id) === ws) {
    room.guests.delete(ws.id);
    send(room.host, { t: 'leave', id: ws.id });
    if (room.public) farmsChanged();
    console.log(`[방 ${ws.room}] ${ws.name} 님 퇴장`);
  }
}

// ---------------- 마을 광장 ----------------
// 광장은 농장 계산이 없으니 서버가 직접 운영한다: 위치 · 채팅 · 이모티콘 · 초대/방문 요청 중계 · 열린 농장 게시판
const PLAZA_MAX = 60;
const EMOTES = new Set(['👋', '❤️', '😂', '🎉', '👍', '😮', '🐮', '🌾']);
const plaza = new Map();   // pid → conn
let plazaNext = 1;
const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : 0);

function enterPlaza(ws, m) {
  if (plaza.size >= PLAZA_MAX) { send(ws, { t: 'error', msg: '광장이 가득 찼어요. 잠시 후 다시 와 주세요' }); return; }
  const pid = plazaNext++;
  Object.assign(ws, { plaza: true, pid, name: clean(m.name, 12) || '농부', look: num(m.look, 0, 31) | 0, pos: [num(m.x, -40, 40), num(m.z, -40, 40), 0, 0] });
  plaza.set(pid, ws);
  send(ws, { t: 'welcome', id: pid, farms: farmList() });
  plazaAll({ t: 'hello', id: pid, name: ws.name }, ws);
  console.log(`[광장] ${ws.name} 님 입장 (${plaza.size}명)`);
}
function leavePlaza(ws) {
  if (plaza.get(ws.pid) !== ws) return;
  plaza.delete(ws.pid);
  plazaAll({ t: 'bye', id: ws.pid });
  console.log(`[광장] ${ws.name} 님 퇴장 (${plaza.size}명)`);
}
function plazaAll(m, except = null) {
  const data = JSON.stringify(m);
  for (const c of plaza.values()) if (c !== except) send(c, data);
}
function onPlaza(ws, m) {
  const to = plaza.get(m.to);
  switch (m.t) {
    case 'p': ws.pos = [num(m.p?.[0], -45, 45), num(m.p?.[1], -45, 45), num(m.p?.[2], -7, 7), num(m.p?.[3], 0, 10)]; break;
    case 'chat': { const msg = clean(m.msg, 80); if (msg) plazaAll({ t: 'chat', id: ws.pid, msg }); break; }
    case 'emote': if (EMOTES.has(m.e)) plazaAll({ t: 'emote', id: ws.pid, e: m.e }); break;
    case 'hop': plazaAll({ t: 'hop', id: ws.pid }, ws); break;
    // 초대 · 방문 요청 · 답장은 상대에게만 전달 (방 코드는 형식만 확인)
    case 'invite': if (to && /^[A-Z0-9]{3,12}$/.test(m.room)) send(to, { t: 'invite', from: ws.pid, name: ws.name, room: m.room }); break;
    case 'visit': if (to) send(to, { t: 'visit', from: ws.pid, name: ws.name }); break;
    case 'reply': if (to) send(to, { t: 'reply', from: ws.pid, name: ws.name, kind: m.kind === 'visit' ? 'visit' : 'invite', ok: !!m.ok, room: /^[A-Z0-9]{3,12}$/.test(m.room) ? m.room : null }); break;
  }
}
function farmList() {
  const out = [];
  for (const [code, r] of rooms) if (r.public) out.push({ room: code, title: r.title, owner: r.host.name, n: r.guests.size + 1 });
  return out;
}
let farmsDirty = false;
function farmsChanged() { farmsDirty = true; }
// 광장 위치 10회/초, 게시판은 바뀔 때만
setInterval(() => {
  if (!plaza.size) return;
  const p = [];
  for (const c of plaza.values()) p.push([c.pid, c.name, c.look, ...c.pos]);
  plazaAll({ t: 'ps', p });
  if (farmsDirty) { farmsDirty = false; plazaAll({ t: 'farms', list: farmList() }); }
}, 100);

// 끊긴 연결 정리 (응답 없는 연결은 30초 안에 정리)
setInterval(() => {
  for (const ws of conns) {
    if (!ws.alive) { ws.closed(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`몽글몽글 목장 서버 실행 중 → http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  같은 와이파이의 친구는 → http://${ip}:${PORT}`);
});
