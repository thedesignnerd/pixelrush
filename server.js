// Pixel Rush Live: authoritative game server (HTTP static + WebSocket).
// Run: npm install && npm start   (PORT env var optional, default 3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { N, QUESTIONS, DECKS } = require('./questions');

const BOTS = ['Kerning Kofi', 'Grid Gloria', 'Ama Affordance', 'Wireframe Will', 'Pixel Priya', 'Hex Hassan', 'Figma Fatima', 'Lorem Lars', 'Padding Paula', 'Kwame Kanban', 'Serif Sena', 'Modal Mo', 'Vector Vicky', 'Dotgrid Dan'];
const SKILLS = [0.78, 0.72, 0.7, 0.55, 0.66, 0.6, 0.74, 0.5, 0.62, 0.58, 0.68, 0.52, 0.64, 0.56];
const rand = (a, b) => a + Math.random() * (b - a);

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const REVEAL_MS = 5500, BOARD_MS = 4500, COUNTDOWN_S = 3;
const MAX_PLAYERS = 100, ROOM_TTL_MS = 30 * 60 * 1000;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const ROUTES = { '/': 'index.html', '/host': 'host.html', '/solo': 'host.html', '/play': 'index.html' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/decks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(DECKS.map(d => ({ id: d.id, n: deckQuestions(d.id).length }))));
  }
  p = ROUTES[p] || p.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- helpers ----------
const rooms = new Map();
const uid = () => crypto.randomBytes(8).toString('hex');
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const newPin = () => { let p; do { p = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(p)); return p; };
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

function deckQuestions(deckId) {
  const d = DECKS.find(x => x.id === deckId) || DECKS.find(x => x.id === 'all');
  if (!d.topics) return QUESTIONS.map(q => ({ ...q }));
  const qs = QUESTIONS.filter(q => d.topics.includes(q.topic)).map(q => ({ ...q }));
  if (qs.length) qs[qs.length - 1].double = true;
  return qs;
}
const points = (t, secs, streakBefore, dbl) => (Math.round(1000 * (1 - Math.min(1, t / secs) / 2)) + Math.min(500, streakBefore * 100)) * (dbl ? 2 : 1);

// ---------- room ----------
class Room {
  constructor(opts) {
    this.pin = newPin();
    this.hostToken = uid();
    this.hostWs = null;
    this.deck = DECKS.some(d => d.id === opts.deck) ? opts.deck : 'all';
    this.secsBase = [10, 20, 30].includes(Number(opts.secs)) ? Number(opts.secs) : 10;
    this.auto = !!opts.auto;
    this.players = new Map();
    this.timers = [];
    this.touched = Date.now();
    this.resetGame();
  }
  resetGame() {
    this.clear();
    this.qs = deckQuestions(this.deck);
    this.phase = 'lobby';
    this.i = 0;
    this.qStart = 0; this.qEnd = 0;
    this.reveal = null;
    this.version = 0;
    for (const p of this.players.values()) Object.assign(p, { score: 0, prevScore: 0, streak: 0, best: 0, correct: 0, rank: 1, prevRank: 1, answer: null, gain: 0, ok: false, log: [] });
  }
  clear() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, ms)); }
  get q() { return this.qs[this.i]; }
  secsFor(q) { return q.type === 'type' ? this.secsBase * 2 : this.secsBase; }
  connected() { return [...this.players.values()].filter(p => p.ws || p.bot); }

  // -- flow
  start() {
    if (this.phase !== 'lobby' && this.phase !== 'podium') return;
    if (this.phase === 'podium') this.resetGame();
    if (!this.players.size) return;
    this.clear();
    this.setPhase('countdown');
    this.cdEnds = Date.now() + COUNTDOWN_S * 1000;
    this.broadcast();
    this.later(COUNTDOWN_S * 1000, () => this.beginQ(0));
  }
  beginQ(i) {
    this.clear();
    this.i = i; this.reveal = null;
    for (const p of this.players.values()) { p.answer = null; p.gain = 0; p.ok = false; }
    const q = this.q, secs = this.secsFor(q);
    const lead = q.double ? 3800 : 3200;
    this.readyEnds = Date.now() + lead;
    this.setPhase('ready');
    this.broadcast();
    this.later(lead, () => {
      this.qStart = Date.now(); this.qEnd = this.qStart + secs * 1000;
      this.setPhase('question');
      this.broadcast();
      this.scheduleBots(q, secs);
      this.later(secs * 1000 + 150, () => this.doReveal());
    });
  }
  scheduleBots(q, secs) {
    for (const p of this.players.values()) {
      if (!p.bot || Math.random() < 0.06) continue;
      const ok = Math.random() < (q.type === 'type' ? p.skill * 0.85 : p.skill);
      const t = rand(1.3, secs * (q.type === 'type' ? 0.85 : 0.75));
      const msg = q.type === 'type' ? { text: ok ? q.answer : q.wrongs[Math.floor(Math.random() * q.wrongs.length)] } : { choice: ok ? q.a : 1 - q.a };
      this.later(t * 1000, () => this.answer(p, msg));
    }
  }
  answer(p, msg) {
    if (this.phase !== 'question' || p.answer) return;
    const q = this.q;
    const t = Math.min((Date.now() - this.qStart) / 1000, this.secsFor(q));
    if (q.type === 'type') {
      const text = String(msg.text || '').trim().slice(0, 40);
      if (!text) return;
      p.answer = { text, t };
    } else {
      const choice = Number(msg.choice);
      if (choice !== 0 && choice !== 1) return;
      p.answer = { choice, t };
    }
    send(p.ws, { t: 'locked', now: Date.now() });
    const live = this.connected();
    if (live.length && live.every(x => x.answer)) { this.clear(); this.doReveal(); } else this.broadcast();
  }
  doReveal() {
    if (this.phase !== 'question') return;
    this.clear();
    const q = this.q;
    const isOk = a => !a ? false : q.type === 'type' ? q.accept.includes(N(a.text)) : a.choice === q.a;
    const counts = [0, 0], tallyMap = {};
    let rightCount = 0, fastest = null;
    const secs = this.secsFor(q);
    for (const p of this.players.values()) {
      const a = p.answer, ok = isOk(a);
      if (a) {
        if (q.type === 'type') { const k = N(a.text); (tallyMap[k] = tallyMap[k] || { text: a.text, count: 0, ok: q.accept.includes(k) }).count++; }
        else counts[a.choice]++;
      }
      p.prevScore = p.score; p.prevRank = p.rank;
      p.ok = ok;
      p.gain = ok ? points(a.t, secs, p.streak, q.double) : 0;
      p.score += p.gain;
      p.streak = ok ? p.streak + 1 : 0;
      p.best = Math.max(p.best, p.streak);
      if (ok) { p.correct++; rightCount++; if (!fastest || a.t < fastest.t) fastest = { name: p.name, t: a.t }; }
      p.log.push({ type: q.type, topic: q.topic, ok, t: a ? a.t : null });
    }
    this.rank();
    this.reveal = {
      answer: q.type === 'type' ? q.answer : null, correct: q.type === 'type' ? null : q.a,
      fact: q.fact, counts, rightCount, fastest,
      tally: Object.values(tallyMap).sort((x, y) => y.count - x.count).slice(0, 6),
    };
    this.setPhase('reveal');
    this.broadcast();
    if (this.auto) this.later(REVEAL_MS, () => this.toBoard());
  }
  rank() {
    [...this.players.values()].sort((a, b) => b.score - a.score || a.joined - b.joined).forEach((p, r) => { p.rank = r + 1; });
  }
  toBoard() {
    if (this.phase !== 'reveal') return;
    this.clear();
    this.setPhase('board');
    this.broadcast();
    if (this.auto) this.later(BOARD_MS, () => this.next());
  }
  next() {
    if (this.phase !== 'board') return;
    this.clear();
    if (this.i + 1 < this.qs.length) return this.beginQ(this.i + 1);
    this.setPhase('podium');
    this.broadcast();
  }
  endRound() { if (this.phase === 'question') this.doReveal(); }
  setPhase(p) { this.phase = p; this.version++; }

  // -- snapshots
  achievements(p) {
    const log = p.log, okT = log.filter(l => l.ok);
    const all = f => { const xs = log.filter(f); return xs.length > 0 && xs.every(l => l.ok) && log.length === this.qs.length; };
    return {
      speed: okT.length >= 5 && okT.reduce((a, l) => a + l.t, 0) / okT.length < 4,
      streak: p.best >= 5, eye: all(l => l.type === 'ab'), words: all(l => l.type === 'type'),
      a11y: all(l => l.topic === 'Color & accessibility'), podium: this.phase === 'podium' && p.rank <= 3,
    };
  }
  publicQ() {
    const q = this.q;
    if (!q || ['lobby', 'countdown'].includes(this.phase)) return null;
    return { type: q.type, topic: q.topic, q: q.q, mock: q.mock || null, double: !!q.double, secs: this.secsFor(q) };
  }
  snapshot(player) {
    const sorted = [...this.players.values()].sort((a, b) => a.rank - b.rank);
    const s = {
      t: 'state', now: Date.now(), pin: this.pin, role: player ? 'player' : 'host',
      deck: this.deck, secsBase: this.secsBase, auto: this.auto, phase: this.phase, v: this.version,
      i: this.i, total: this.qs.length, q: this.publicQ(),
      cdEnds: this.cdEnds, readyEnds: this.readyEnds, qStart: this.qStart, qEnd: this.qEnd,
      nPlayers: this.players.size, answered: [...this.players.values()].filter(p => p.answer).length,
      nLive: this.connected().length,
      lobby: [...this.players.values()].map(p => ({ id: p.id, name: p.name })),
      hostOnline: !!this.hostWs, solo: !!this.solo,
    };
    if (['reveal', 'board', 'podium'].includes(this.phase)) {
      s.reveal = this.reveal;
      s.board = sorted.map(p => ({ id: p.id, name: p.name, rank: p.rank, prevRank: p.prevRank, score: p.score, prevScore: p.prevScore, gain: p.gain, streak: p.streak }));
    }
    if (player) {
      s.me = {
        id: player.id, name: player.name, score: player.score, rank: player.rank, prevRank: player.prevRank, streak: player.streak, best: player.best, correct: player.correct,
        answered: !!player.answer, mine: player.answer && this.phase !== 'ready' ? (player.answer.text ?? player.answer.choice) : null,
        myT: player.answer ? player.answer.t : null, ok: player.ok, gain: player.gain, prevScore: player.prevScore,
        ach: this.phase === 'podium' ? this.achievements(player) : null,
      };
    }
    return s;
  }
  broadcast() {
    this.touched = Date.now();
    send(this.hostWs, this.snapshot(null));
    for (const p of this.players.values()) send(p.ws, this.snapshot(p));
  }
  destroy(reason) {
    this.clear();
    send(this.hostWs, { t: 'closed', reason });
    for (const p of this.players.values()) send(p.ws, { t: 'closed', reason });
    rooms.delete(this.pin);
  }
}

// ---------- sockets ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.ctx = null;
  ws.rate = { n: 0, t: Date.now() };
  ws.on('message', raw => {
    const now = Date.now();
    if (now - ws.rate.t > 2000) ws.rate = { n: 0, t: now };
    if (++ws.rate.n > 30) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    try { handle(ws, m); } catch (e) { console.error(e); }
  });
  ws.on('close', () => {
    const c = ws.ctx; if (!c) return;
    const room = rooms.get(c.pin); if (!room) return;
    if (c.role === 'host' && room.hostWs === ws) { room.hostWs = null; room.broadcast(); }
    if (c.role === 'player') {
      const p = room.players.get(c.id);
      if (p && p.ws === ws) {
        p.ws = null;
        if (room.solo) setTimeout(() => { const q = room.players.get(c.id); if (q && !q.ws && rooms.get(room.pin) === room) { room.clear(); rooms.delete(room.pin); } }, 60000);
        if (room.phase === 'lobby') setTimeout(() => { const q = room.players.get(c.id); if (q && !q.ws && room.phase === 'lobby') { room.players.delete(c.id); room.broadcast(); } }, 8000);
        room.broadcast();
      }
    }
  });
});

function handle(ws, m) {
  switch (m.t) {
    case 'ping': return send(ws, { t: 'pong', now: Date.now(), c: m.c });
    case 'host:create': {
      const room = new Room(m);
      room.hostWs = ws; rooms.set(room.pin, room);
      ws.ctx = { role: 'host', pin: room.pin };
      send(ws, { t: 'hosting', pin: room.pin, token: room.hostToken });
      return room.broadcast();
    }
    case 'solo:create': {
      const room = new Room({ deck: m.deck, secs: m.secs, auto: true });
      room.solo = true;
      const name = cleanName(m.name) || 'You';
      const mk = (id, nm, extra) => Object.assign({ id, token: uid(), name: nm, ws: null, joined: Date.now(), score: 0, prevScore: 0, streak: 0, best: 0, correct: 0, rank: 1, prevRank: 1, answer: null, gain: 0, ok: false, log: [] }, extra);
      const me = mk(uid(), name, { ws, joined: 0 });
      room.players.set(me.id, me);
      const n = Math.max(3, Math.min(BOTS.length, Number(m.bots) || 11));
      BOTS.slice(0, n).forEach((bn, k) => room.players.set('bot' + k, mk('bot' + k, bn === name ? bn + ' Jr' : bn, { bot: true, skill: SKILLS[k], joined: k + 1, rank: k + 2, prevRank: k + 2 })));
      rooms.set(room.pin, room);
      ws.ctx = { role: 'player', pin: room.pin, id: me.id };
      send(ws, { t: 'joined', token: me.token, id: me.id, pin: room.pin });
      room.start();
      return;
    }
    case 'solo:cmd': {
      const c = ws.ctx; if (!c || c.role !== 'player') return;
      const room = rooms.get(c.pin); if (!room || !room.solo) return;
      if (m.cmd === 'toBoard') room.toBoard(); else if (m.cmd === 'next') room.next();
      return;
    }
    case 'solo:restart': case 'solo:quit': {
      const c = ws.ctx; if (!c || c.role !== 'player') return;
      const room = rooms.get(c.pin); if (!room || !room.solo) return;
      if (m.t === 'solo:quit') { room.clear(); rooms.delete(room.pin); ws.ctx = null; return; }
      room.resetGame(); room.start(); return;
    }
    case 'host:resume': {
      const room = rooms.get(String(m.pin));
      if (!room || room.hostToken !== m.token) return send(ws, { t: 'error', code: 'no-room', msg: 'That room has ended.' });
      if (room.hostWs && room.hostWs !== ws) try { room.hostWs.close(); } catch {}
      room.hostWs = ws; ws.ctx = { role: 'host', pin: room.pin };
      send(ws, { t: 'hosting', pin: room.pin, token: room.hostToken });
      return room.broadcast();
    }
    case 'join': {
      const room = rooms.get(String(m.pin || '').replace(/\D/g, ''));
      if (!room) return send(ws, { t: 'error', code: 'no-room', msg: 'No game with that PIN.' });
      // reconnect
      if (m.token) {
        const p = [...room.players.values()].find(x => x.token === m.token);
        if (p) {
          if (p.ws && p.ws !== ws) try { p.ws.close(); } catch {}
          p.ws = ws; ws.ctx = { role: 'player', pin: room.pin, id: p.id };
          send(ws, { t: 'joined', token: p.token, id: p.id });
          return room.broadcast();
        }
      }
      if (room.solo || room.phase !== 'lobby') return send(ws, { t: 'error', code: 'started', msg: 'That game has already started.' });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', code: 'full', msg: 'That room is full.' });
      let name = cleanName(m.name);
      if (!name) return send(ws, { t: 'error', code: 'name', msg: 'Pick a nickname first.' });
      const taken = new Set([...room.players.values()].map(p => p.name.toLowerCase()));
      if (taken.has(name.toLowerCase())) { let k = 2; while (taken.has((name + ' ' + k).toLowerCase())) k++; name = (name + ' ' + k).slice(0, 18); }
      const p = { id: uid(), token: uid(), name, ws, joined: Date.now(), score: 0, prevScore: 0, streak: 0, best: 0, correct: 0, rank: room.players.size + 1, prevRank: room.players.size + 1, answer: null, gain: 0, ok: false, log: [] };
      room.players.set(p.id, p); ws.ctx = { role: 'player', pin: room.pin, id: p.id };
      send(ws, { t: 'joined', token: p.token, id: p.id });
      return room.broadcast();
    }
    case 'answer': {
      const c = ws.ctx; if (!c || c.role !== 'player') return;
      const room = rooms.get(c.pin), p = room && room.players.get(c.id);
      if (p) room.answer(p, m);
      return;
    }
    case 'host:cmd': {
      const c = ws.ctx; if (!c || c.role !== 'host') return;
      const room = rooms.get(c.pin); if (!room || room.hostWs !== ws) return;
      switch (m.cmd) {
        case 'start': return room.start();
        case 'toBoard': return room.toBoard();
        case 'next': return room.next();
        case 'endRound': return room.endRound();
        case 'auto': room.auto = !!m.on; room.broadcast(); return;
        case 'restart': room.resetGame(); room.broadcast(); return;
        case 'kick': { const p = room.players.get(m.id); if (p && room.phase === 'lobby') { send(p.ws, { t: 'closed', reason: 'You were removed by the host.' }); room.players.delete(p.id); room.broadcast(); } return; }
        case 'quit': return room.destroy('The host ended the game.');
      }
    }
  }
}

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
  const now = Date.now();
  for (const r of rooms.values()) if (!r.hostWs && now - r.touched > ROOM_TTL_MS) r.destroy('Room expired.');
}, 20000);

server.listen(PORT, () => {
  console.log(`Pixel Rush Live running on http://localhost:${PORT}`);
  console.log(`Host screen: http://localhost:${PORT}/host   Players: http://localhost:${PORT}/`);
});
