/* Shared client helpers: theme, socket with auto-reconnect + clock sync, sound, confetti. */
(function () {
  const THEMES = {
    light: { bg: '#F6F6F6', surface: '#FFFFFF', surface2: '#EEF2F3', ink: '#08283B', ink2: '#395362', ink3: '#5A6F7C', line: '#E1E9EA', track: 'rgba(8,40,59,0.1)', pos: '#046C4E', neg: '#C81E1E', gold: '#8C6900', shadow: '0 4px 24px rgba(8,40,59,0.06)', rowBg: '#F6F6F6', medalOff: '#E1E9EA', medalOffInk: '#08283B',
      hot: '#7E3AF2', hot2: '#6C2BD9', hotDeep: '#4A1D96', hotSoft: 'rgba(126,58,242,0.28)', brand: '#6C2BD9', eyebrow: '#6C2BD9', you: 'rgba(126,58,242,0.12)', accent: '#6C2BD9', tile2: '#0E7490', tile2Deep: '#164E63' },
    dark: { bg: '#0F0F10', surface: '#1C1C1E', surface2: '#2C2C2E', ink: '#F5F5F7', ink2: '#AEAEB2', ink3: '#8E8E93', line: 'rgba(255,255,255,0.1)', track: 'rgba(255,255,255,0.14)', pos: '#6EE7B7', neg: '#FCA5A5', gold: '#FCD34D', shadow: '0 24px 60px rgba(0,0,0,0.5)', rowBg: 'rgba(255,255,255,0.05)', medalOff: '#3A3A3C', medalOffInk: '#F5F5F7',
      hot: '#9061F9', hot2: '#7E3AF2', hotDeep: '#4A1D96', hotSoft: 'rgba(144,97,249,0.3)', brand: '#AC94FA', eyebrow: '#CABFFD', you: 'rgba(144,97,249,0.22)', accent: '#AC94FA', tile2: '#0E7490', tile2Deep: '#164E63' },
  };
  const KEY = 'pixelrush.live.theme';
  const PR = (window.PR = {});
  PR.isDark = () => document.documentElement.dataset.theme === 'dark';
  PR.applyTheme = function (mode) {
    const dark = mode === 'dark';
    const th = THEMES[dark ? 'dark' : 'light'];
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    for (const k in th) document.documentElement.style.setProperty('--' + k, th[k]);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  };
  PR.toggleTheme = function () {
    const next = PR.isDark() ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    PR.applyTheme(next);
    PR.onTheme && PR.onTheme(next);
  };
  (function init() {
    let t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    PR.applyTheme(t);
  })();

  PR.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  PR.fmt = n => Math.round(n).toLocaleString('en-US');
  PR.initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  PR.ease = t => 1 - Math.pow(1 - t, 3);
  PR.TYPE_LABEL = { tf: 'True or false', ab: 'Pick the better design', type: 'Type the answer' };
  PR.ARC_COLORS = ['#0E7490', '#C81E1E', '#1E429F', '#B45309', '#057A55', '#BF125D', '#6C2BD9'];
  PR.DECKS = [
    { id: 'ux', name: 'UX laws', sub: 'Laws, heuristics & bad UI', glyph: '7±2', color: '#0E7490', n: 7 },
    { id: 'visual', name: 'Color & type', sub: 'Contrast, hierarchy, type', glyph: 'Aa', color: '#C81E1E', n: 8 },
    { id: 'all', name: 'Everything', sub: 'The full 20-round run', glyph: '20', color: null, n: 20 },
    { id: 'research', name: 'Research', sub: 'Testing, personas & tokens', glyph: '5×', color: '#1E429F', n: 5 },
    { id: 'trivia', name: 'Trivia', sub: 'Famous products & people', glyph: '2007', color: '#B45309', n: 4 },
  ];
  PR.ACH = [
    { id: 'speed', name: 'Speed demon', hint: 'Avg under 4s when right', mark: '4s' },
    { id: 'streak', name: 'Unstoppable', hint: '5 right in a row', mark: '×5' },
    { id: 'eye', name: 'Eagle eye', hint: 'Every design pick right', mark: 'A/B' },
    { id: 'words', name: 'Wordsmith', hint: 'Every typed answer right', mark: 'Aa' },
    { id: 'a11y', name: 'Access ally', hint: 'All accessibility rounds', mark: '4.5' },
    { id: 'podium', name: 'Podium finish', hint: 'Finish in the top 3', mark: 'Top3' },
  ];

  // ---- socket with reconnect + server clock offset ----
  PR.connect = function (handlers) {
    let ws, closedByUs = false, retry = 0, pingTimer;
    PR.offset = 0; // serverNow - clientNow
    PR.serverNow = () => Date.now() + PR.offset;
    function open() {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
      ws.onopen = () => {
        retry = 0;
        const samples = [];
        const probe = () => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'ping', c: Date.now() }));
        PR._samples = samples; probe();
        clearInterval(pingTimer); pingTimer = setInterval(probe, 15000);
        handlers.open && handlers.open();
      };
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.t === 'pong') {
          const rtt = Date.now() - m.c;
          PR._samples.push({ rtt, off: m.now + rtt / 2 - Date.now() });
          const best = PR._samples.sort((a, b) => a.rtt - b.rtt)[0];
          PR.offset = best.off; if (PR._samples.length > 5) PR._samples.length = 5;
          return;
        }
        if (m.now) { const o = m.now - Date.now(); if (!PR._samples || !PR._samples.length) PR.offset = o; }
        handlers.message && handlers.message(m);
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        handlers.close && handlers.close();
        if (!closedByUs) setTimeout(open, Math.min(4000, 500 * ++retry));
      };
    }
    open();
    return {
      send: obj => ws && ws.readyState === 1 && ws.send(JSON.stringify(obj)),
      close: () => { closedByUs = true; try { ws.close(); } catch (e) {} },
      get ready() { return ws && ws.readyState === 1; },
    };
  };

  // ---- sound (host: all; phones: light) ----
  PR.sound = true;
  PR.sfx = function (type) {
    if (!PR.sound) return;
    try {
      const C = PR.ac || (PR.ac = new (window.AudioContext || window.webkitAudioContext)());
      if (C.state === 'suspended') C.resume();
      const drum = Array.from({ length: 18 }, (_, k) => [110 + k * 4, 0.075, 'square', 0.05 + k * 0.004]);
      const seq = {
        blip: [[880, .05, 'sine', .05]], tick: [[880, .05]], pick: [[520, .06], [780, .08]],
        join: [[660, .06], [990, .1]], beep: [[660, .14]], go: [[990, .1], [1320, .3]],
        right: [[660, .09], [880, .09], [1320, .22]], wrong: [[300, .14, 'sawtooth', .08], [190, .3, 'sawtooth', .08]],
        streak: [[784, .07], [988, .07], [1175, .07], [1568, .25]],
        whoosh: [[260, .06], [420, .06], [700, .08], [1040, .12]], pop: [[520, .06], [1040, .12]], drum,
        win: [[523, .12], [659, .12], [784, .12], [1047, .18], [784, .1], [1047, .45]],
      }[type];
      if (!seq) return;
      let t = C.currentTime;
      seq.forEach(([f, d, w, v]) => {
        const o = C.createOscillator(), g = C.createGain();
        o.type = w || 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(v || 0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g).connect(C.destination); o.start(t); o.stop(t + d); t += d * 0.9;
      });
    } catch (e) {}
  };
  PR.buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---- confetti ----
  const CC = ['var(--hot)', '#5DAFF6', '#31C48D', '#FEBE00', '#08283B', '#AC94FA'];
  PR.confetti = function (n, host, scale) {
    scale = scale || 1;
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = `position:${host ? 'absolute' : 'fixed'};inset:0;pointer-events:none;overflow:hidden;z-index:50`;
    let html = '';
    for (let k = 0; k < n; k++) {
      const w = (6 + Math.random() * 7) * scale, h = (8 + Math.random() * 10) * scale, dur = (2.4 + Math.random() * 1.8) * scale, delay = Math.random() * 1.2 * scale;
      html += `<span style="position:absolute;top:0;left:${Math.random() * 100}%;width:${w}px;height:${h}px;background:${CC[k % CC.length]};border-radius:2px;transform:translateY(-10vh);animation:pr-fall ${dur}s ${delay}s cubic-bezier(.3,.6,.6,1) forwards"></span>`;
    }
    wrap.innerHTML = html;
    (host || document.body).appendChild(wrap);
    setTimeout(() => wrap.remove(), 6500 * scale);
  };

  // theme toggle button markup
  PR.themeButton = () => `<button class="pr-btn pr-btn-ghost pr-btn-sm" id="pr-theme" aria-label="Toggle dark mode">${PR.isDark() ? 'Light' : 'Dark'} mode</button>`;
  PR.bindTheme = root => {
    const b = (root || document).querySelector('#pr-theme');
    if (b) b.onclick = () => { PR.toggleTheme(); b.textContent = (PR.isDark() ? 'Light' : 'Dark') + ' mode'; };
  };
  PR.logo = () => `<span class="pr-logo"><span class="pr-logo-mark"><i></i><i></i><i class="hot"></i><i class="hot2"></i><i></i><b></b><i></i><b></b><i></i><i></i><i></i><b></b><i></i><b></b><b></b><b></b></span><span class="pr-logo-word">Pixel<em>Rush</em></span></span>`;
  PR.mock = kind => (window.MOCKS && MOCKS[kind]) || '';
})();
