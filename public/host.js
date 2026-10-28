/* Pixel Rush Live: host (big screen) */
(function () {
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), barRight = $('#barRight');
  $('#logo').innerHTML = PR.logo();
  const SOLO = location.pathname === '/solo';
  const SAVE = SOLO ? 'pixelrush.live.solo' : 'pixelrush.live.host';
  let myName = ''; try { myName = localStorage.getItem('pixelrush.live.name') || ''; } catch (e) {}
  const PBK = 'pixelrush.live.best'; let newPB = false, prevPB = 0;
  let qCount = 20; try { qCount = Number(localStorage.getItem('pixelrush.live.count')) || 20; } catch (e) {}
  let S = null, pin = null, token = null, conn, viewKey = '', seen = new Set(), deckSel = 'all', secs = 10, auto = false, sound = true;
  let timerRaf = 0, cdTimer = 0, anim = 0, tos = [];
  const later = (ms, fn) => tos.push(setTimeout(fn, ms));
  const clearAll = () => { tos.forEach(clearTimeout); tos = []; cancelAnimationFrame(timerRaf); clearInterval(cdTimer); cancelAnimationFrame(anim); };
  const REVEAL_MS = 5500, BOARD_MS = 4500;
  const cmd = (c, extra) => {
    if (SOLO) { if (c === 'restart') { newPB = false; return conn.send({ t: 'solo:restart' }); } if (c === 'quit') return quitSolo(); return conn.send({ t: 'solo:cmd', cmd: c }); }
    conn.send(Object.assign({ t: 'host:cmd', cmd: c }, extra || {}));
  };
  function quitSolo() { conn.send({ t: 'solo:quit' }); try { localStorage.removeItem(SAVE); } catch (e) {} S = null; viewKey = 'setup'; clearAll(); setup(); }
  const joinUrl = () => location.origin + '/';

  // ---------- connection ----------
  conn = PR.connect({
    open() {
      document.getElementById('conn').hidden = true;
      let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE)); } catch (e) {}
      if (saved && saved.pin) conn.send(SOLO ? { t: 'join', pin: saved.pin, token: saved.token } : { t: 'host:resume', pin: saved.pin, token: saved.token });
    },
    close() { document.getElementById('conn').hidden = false; },
    message(m) {
      if (m.t === 'joined' && SOLO) { pin = m.pin || pin; token = m.token; try { localStorage.setItem(SAVE, JSON.stringify({ pin, token })); } catch (e) {} }
      else if (m.t === 'hosting') { pin = m.pin; token = m.token; try { localStorage.setItem(SAVE, JSON.stringify({ pin, token })); } catch (e) {} }
      else if (m.t === 'state') onState(m);
      else if (m.t === 'error') { try { localStorage.removeItem(SAVE); } catch (e) {} S = null; render(true); }
      else if (m.t === 'closed') { try { localStorage.removeItem(SAVE); } catch (e) {} S = null; pin = null; render(true); }
    },
  });
  PR.onTheme = () => render(true);
  document.addEventListener('keydown', e => {
    if (!S || e.target.tagName === 'INPUT') return;
    if (SOLO && S.phase === 'question' && S.q.type !== 'type' && !S.me.answered) { const k = e.key.toLowerCase(); if ('1ta'.includes(k) && k) return pickC(0); if ('2fb'.includes(k) && k) return pickC(1); }
    if (e.key !== 'Enter') return;
    if (S.phase === 'lobby') cmd('start'); else if (S.phase === 'reveal') cmd('toBoard'); else if (S.phase === 'board') cmd('next');
  });

  fetch('/api/decks').then(r => r.json()).then(list => { list.forEach(d => { const x = PR.DECKS.find(y => y.id === d.id); if (x) x.n = d.n; }); if (!S) render(true); }).catch(() => {});

  // ---------- state ----------
  function onState(m) {
    const prev = S; S = m;
    const key = m.phase + ':' + m.i;
    if (key !== viewKey) { viewKey = key; clearAll(); enter(prev); }
    else update(prev);
  }
  function render(force) { if (force) { viewKey = S ? S.phase + ':' + S.i : 'setup'; clearAll(); } S ? enter(null, true) : setup(); }

  // ---------- chrome ----------
  function bar() {
    let h = '';
    if (S) {
      if (!SOLO) h += `<span class="pr-chip" style="font-size:14px;color:var(--ink2)">Room PIN <strong style="color:var(--ink)">${pin6()}</strong></span>`;
      if (S.phase !== 'lobby') h += `<button class="pr-btn pr-btn-outline pr-btn-sm" id="b-restart">Restart</button>`;
      h += `<button class="pr-btn pr-btn-outline pr-btn-sm" id="b-quit">Quit</button>`;
    }
    h += `<button class="pr-btn pr-btn-ghost pr-btn-sm" id="b-sound" aria-pressed="${sound}">Sound ${sound ? 'on' : 'off'}</button>` + PR.themeButton();
    barRight.innerHTML = h;
    PR.bindTheme(barRight);
    $('#b-sound').onclick = () => { sound = !sound; PR.sound = sound; bar(); };
    const q = $('#b-quit'); if (q) q.onclick = () => confirmBox('Quit this game?', SOLO ? 'Your progress in this run will be lost.' : 'This ends the game for everyone.', 'Quit game', () => { cmd('quit'); });
    const r = $('#b-restart'); if (r) r.onclick = () => confirmBox('Restart the game?', 'Scores reset and everyone goes back to the lobby.', 'Restart', () => cmd('restart'));
  }
  const pin6 = () => S ? S.pin.slice(0, 3) + ' ' + S.pin.slice(3) : '';
  function confirmBox(title, body, cta, fn) {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(8,40,59,.55);display:grid;place-items:center;z-index:90;padding:16px';
    o.innerHTML = `<div role="dialog" aria-modal="true" style="background:var(--surface);border-radius:20px;padding:28px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow)"><h3 style="font-size:24px">${title}</h3><p style="margin:0;color:var(--ink2)">${body}</p><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px"><button class="pr-btn pr-btn-outline pr-btn-lg" id="c-no">Keep playing</button><button class="pr-btn pr-btn-lg" id="c-yes" style="background:var(--neg);border-color:var(--neg)">${cta}</button></div></div>`;
    document.body.appendChild(o);
    o.querySelector('#c-no').onclick = () => o.remove();
    o.querySelector('#c-yes').onclick = () => { o.remove(); fn(); };
    o.querySelector('#c-no').focus();
  }
  const topBar = () => {
    const long = S.total > 30;
    const segs = long ? `<span style="flex:1;height:8px;border-radius:4px;background:var(--track);overflow:hidden;min-width:0"><i style="display:block;height:100%;width:${(S.i + 1) / S.total * 100}%;background:var(--hot);border-radius:4px;transition:width 300ms"></i></span>` : Array.from({ length: S.total }, (_, k) => `<span style="background:${k < S.i ? 'var(--hot)' : k === S.i ? 'var(--ink)' : 'var(--track)'}"></span>`).join('');
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><div class="segs">${segs}</div><div style="display:flex;align-items:center;gap:14px;font-size:14px;color:var(--ink2)"><span>Round <strong style="color:var(--ink)">${S.i + 1}</strong>/${S.total}</span>${SOLO ? `<span class="pr-chip poppins" style="font-size:14px;font-weight:700;color:var(--ink)">${PR.fmt(S.me.score)} pts</span><span class="pr-chip" style="font-size:14px;font-weight:600;color:var(--ink)">#${S.me.rank} of ${S.nPlayers}</span>${S.me.streak >= 2 ? `<span class="pr-chip" style="background:var(--hot);color:#fff;font-weight:700;font-size:14px">×${S.me.streak}</span>` : ''}` : `<span class="pr-chip" style="font-size:14px">${S.nLive}/${S.nPlayers} online</span>`}</div></div>`;
  };

  // ---------- setup (create room) ----------
  function setup() {
    bar();
    const selIdx = PR.DECKS.findIndex(d => d.id === deckSel), dark = PR.isDark();
    const decks = PR.DECKS.map((d, k) => {
      const o = k - 2, sel = k === selIdx, col = d.color || 'var(--hot2)';
      return `<button class="deck" data-deck="${d.id}" role="radio" aria-checked="${sel}" style="background:${col};border-color:${sel ? 'var(--ink)' : 'transparent'};z-index:${sel ? 20 : 10 - Math.abs(o)};transform:translateY(${Math.abs(o) * 26 - (sel ? 22 : 0)}px) rotate(${o * 7}deg) scale(${sel ? 1.06 : 1 - Math.abs(o) * .04});box-shadow:${dark ? `0 24px 60px ${d.color || '#7E3AF2'}${sel ? '99' : '55'}` : `0 18px 40px rgba(8,40,59,${sel ? .28 : .16})`}"><span class="cnt">${d.n} questions</span><span class="nm">${d.name}</span><span class="sub">${d.sub}</span><span class="gl">${d.glyph}</span></button>`;
    }).join('');
    const deckName = PR.DECKS[selIdx].name, deckN = PR.DECKS[selIdx].n;
    const presets = [...new Set([5, 10, 20, 30, 50, 100].filter(v => v < deckN).concat([deckN]))];
    stage.innerHTML = `<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;gap:clamp(18px,2.6vw,28px);text-align:center;padding-top:clamp(4px,2vw,20px)">
      <div class="pr-grid-bg"></div><div class="pr-glow"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2vw,20px);max-width:860px">
        <span class="pr-chip" style="font-size:14px;color:var(--ink2)">${SOLO ? '<strong style="color:var(--ink)">Solo run</strong> · you vs 11 bots' : '<strong style="color:var(--ink)">Live multiplayer</strong> · phones join with a PIN'}</span>
        <h1 style="font-size:clamp(40px,7vw,88px);line-height:1;letter-spacing:-.035em;font-weight:700;text-wrap:balance">Think fast.<br>Design <span style="color:var(--brand);font-style:italic">smarter.</span></h1>
        <p style="margin:0;font-size:clamp(15px,1.6vw,18px);line-height:1.55;color:var(--ink2);max-width:560px">${SOLO ? 'Pick a deck, answer fast, build streaks and climb the leaderboard against the bots.' : 'Pick a deck, project this screen, and let your team join from their phones. Speed scores, streaks stack.'}</p>
        <div style="display:flex;gap:18px;flex-wrap:wrap;justify-content:center;align-items:center;font-size:15px;color:var(--ink2)">
          <label style="display:flex;align-items:center;gap:8px">Questions
            <input type="number" id="s-count" min="1" max="${deckN}" value="${Math.min(qCount, deckN)}" inputmode="numeric" style="width:76px;height:36px;border-radius:8px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);padding:0 8px;font-size:15px;text-align:center"></label>
          <span id="s-presets" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">${presets.map(v => `<button type="button" class="pr-btn pr-btn-ghost pr-btn-sm" data-n="${v}" style="padding:0 12px">${v === deckN ? 'All ' + v : v}</button>`).join('')}</span>
          <label style="display:flex;align-items:center;gap:8px">Seconds per question
            <select id="s-secs" style="height:36px;border-radius:8px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);padding:0 8px;font-size:15px">${[10, 20, 30].map(v => `<option ${v === secs ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          ${SOLO ? '' : `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="s-auto" ${auto ? 'checked' : ''} style="width:18px;height:18px"> Auto-advance screens</label>`}
        </div>
        ${SOLO ? `<input class="pr-input" id="s-name" maxlength="16" placeholder="Your nickname" aria-label="Nickname" value="${PR.esc(myName)}" style="max-width:260px">` : ''}
        <button class="pr-btn" id="s-create" style="height:56px">${SOLO ? 'Play ' + (deckSel === 'all' ? 'now' : deckName) : 'Host ' + (deckSel === 'all' ? 'a room' : deckName)} →</button>
        <a href="${SOLO ? '/host' : '/solo'}" style="color:var(--accent);font-size:15px">${SOLO ? 'Hosting for a group? Host a room' : 'Playing alone? Play solo'}</a>
      </div>
      <div style="position:relative;z-index:1;width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:auto">
        <span style="font-size:13px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.1em">Pick a deck</span>
        <div class="fan" role="radiogroup" aria-label="Question deck">${decks}</div>
      </div></div>`;
    stage.querySelectorAll('[data-deck]').forEach(b => b.onclick = () => { deckSel = b.dataset.deck; PR.sfx('blip'); setup(); });
    $('#s-secs').onchange = e => { secs = Number(e.target.value); };
    const cInput = $('#s-count');
    const setCount = v => { qCount = Math.max(1, Math.min(deckN, Math.floor(Number(v)) || 1)); cInput.value = qCount; try { localStorage.setItem('pixelrush.live.count', String(qCount)); } catch (e) {} };
    cInput.onchange = () => setCount(cInput.value);
    stage.querySelectorAll('[data-n]').forEach(b => b.onclick = () => setCount(b.dataset.n));
    const sa = $('#s-auto'); if (sa) sa.onchange = e => { auto = e.target.checked; };
    $('#s-create').onclick = () => {
      PR.sfx('join');
      if (SOLO) {
        myName = ($('#s-name').value || '').trim(); try { localStorage.setItem('pixelrush.live.name', myName); } catch (e) {}
        newPB = false; try { prevPB = Number(localStorage.getItem(PBK)) || 0; } catch (e) {}
        setCount(cInput.value); conn.send({ t: 'solo:create', deck: deckSel, secs, count: qCount, name: myName });
      } else { setCount(cInput.value); conn.send({ t: 'host:create', deck: deckSel, secs, auto, count: qCount }); }
    };
    const nm = $('#s-name'); if (nm) nm.onkeydown = e => { if (e.key === 'Enter') $('#s-create').click(); };
  }

  // ---------- phase views ----------
  function enter(prev) {
    bar();
    pickedLocal = null;
    const p = S.phase;
    const fn = { lobby, countdown, ready, question, reveal, board, podium }[p];
    stage.innerHTML = '';
    fn && fn(prev);
  }
  function update(prev) {
    bar();
    if (S.phase === 'lobby') lobbyArcs();
    if (S.phase === 'question' || S.phase === 'reveal') {
      const a = $('#h-answered'); if (a) a.textContent = S.answered;
      const t = $('#h-total'); if (t) t.textContent = S.nPlayers;
      if (prev && S.answered > prev.answered && !SOLO) PR.sfx('blip');
      if (SOLO && S.phase === 'question' && S.me.answered && !pickedLocal) { pickedLocal = S.me.mine; applyPicked(); }
    }
    if (S.phase === 'board' || S.phase === 'podium') { /* nothing live */ }
    const c = $('#h-count'); if (c) c.textContent = S.nPlayers;
  }

  // lobby
  function lobby() {
    seen = new Set();
    stage.innerHTML = `<div style="position:relative;flex:1;min-height:clamp(440px,54vw,600px)">
      <div class="pr-grid-bg"></div><div class="pr-glow"></div><div id="arcs"></div>
      <div style="position:absolute;z-index:2;left:50%;top:64%;transform:translate(-50%,-50%);width:min(620px,92%);display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
        <span style="font-size:clamp(14px,1.6vw,17px);color:var(--ink2)">Join at <strong style="color:var(--ink)">${PR.esc(location.host)}</strong> with PIN</span>
        <span class="poppins" style="font-size:clamp(52px,8vw,104px);font-weight:700;letter-spacing:.03em;line-height:1">${pin6()}</span>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;justify-content:center"><span class="poppins" id="h-count" style="font-size:24px;font-weight:700">${S.nPlayers}</span><span style="font-size:16px;color:var(--ink2)">players ready</span><span style="font-size:14px;color:var(--ink3);animation:pr-breathe 1.6s ease-in-out infinite">· waiting for more</span></div>
        <label style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink2)"><input type="checkbox" id="l-auto" ${S.auto ? 'checked' : ''} style="width:18px;height:18px"> Auto-advance screens</label>
        <button class="pr-btn" id="l-start">Start game →</button>
      </div></div>`;
    $('#l-start').onclick = () => { PR.sfx('go'); cmd('start'); };
    $('#l-auto').onchange = e => cmd('auto', { on: e.target.checked });
    lobbyArcs();
  }
  function lobbyArcs() {
    const el = $('#arcs'); if (!el) return;
    const list = S.lobby, M = Math.max(12, list.length), order = [];
    for (let k = 0; k < M; k++) order.push(Math.floor(M / 2) + (k % 2 ? -1 : 1) * Math.ceil(k / 2));
    const dark = PR.isDark(); let fresh = false;
    el.innerHTML = list.map((p, k) => {
      const slot = Math.max(0, Math.min(M - 1, order[k])), a = Math.PI + (slot + .5) * Math.PI / M, col = PR.ARC_COLORS[k % PR.ARC_COLORS.length];
      const isNew = !seen.has(p.id); if (isNew) { seen.add(p.id); fresh = true; }
      return `<span class="arc" title="${PR.esc(p.name)}" style="left:${50 + 44 * Math.cos(a)}%;top:${60 + 48 * Math.sin(a)}%;background:${col};transform:rotate(${(slot - (M - 1) / 2) * 3}deg);box-shadow:${dark ? `0 0 28px ${col}AA` : '0 10px 24px rgba(8,40,59,.18)'};${isNew ? '' : 'animation:none'}">${PR.esc(PR.initials(p.name))}</span>`;
    }).join('');
    if (fresh && PR.ac) PR.sfx('blip');
  }

  // countdown
  function countdown() {
    stage.innerHTML = `<div class="fullc"><span class="pr-eyebrow" style="font-size:20px;letter-spacing:.12em">Get ready</span><div id="cd" style="width:min(300px,70vw);height:min(300px,70vw);display:grid;place-items:center"></div><span style="font-size:18px;color:var(--ink2)">${S.nPlayers} players · eyes on this screen</span></div>`;
    let last = 0;
    const tick = () => {
      const n = Math.max(1, Math.ceil((S.cdEnds - PR.serverNow()) / 1000));
      if (n !== last) { last = n; $('#cd').innerHTML = `<span style="grid-area:1/1;width:300px;max-width:100%;aspect-ratio:1;border-radius:50%;border:6px solid var(--hot);animation:pr-ring 1s ease-out both"></span><span class="poppins" style="grid-area:1/1;font-size:min(200px,40vw);font-weight:700;line-height:1;animation:pr-zoom 1s cubic-bezier(.4,0,.2,1) both">${n}</span>`; PR.sfx('beep'); }
    };
    tick(); cdTimer = setInterval(tick, 100);
  }

  // ready
  function ready() {
    const q = S.q, ms = Math.max(1, S.readyEnds - PR.serverNow());
    if (q.double) PR.sfx('streak'); else PR.sfx('go');
    stage.innerHTML = topBar() + `<div class="fullc" style="gap:22px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><span class="pr-chip" style="font-weight:600">${PR.TYPE_LABEL[q.type]}</span><span class="pr-chip" style="color:var(--ink2)">${PR.esc(q.topic)}</span></div>
      ${q.double ? `<span class="poppins" style="padding:10px 22px;border-radius:12px;background:#FEBE00;color:#08283B;font-size:clamp(20px,2.6vw,30px);font-weight:700;animation:pr-pop 500ms cubic-bezier(.34,1.56,.64,1) both,pr-pulse 1s 500ms ease-in-out infinite">Double points round</span>` : ''}
      <h2 style="font-size:clamp(28px,4.4vw,60px);line-height:1.12;letter-spacing:-.025em;max-width:1100px;text-wrap:balance;animation:pr-rise 450ms cubic-bezier(.4,0,.2,1) both">${PR.esc(q.q)}</h2>
      <div style="width:min(460px,80%);height:8px;border-radius:4px;background:var(--track);overflow:hidden"><div style="height:100%;background:var(--hot);border-radius:4px;animation:pr-shrink ${ms}ms linear forwards"></div></div></div>`;
  }

  // question + reveal share a layout
  function questionHead(rev) {
    const q = S.q;
    return topBar() + `<div style="display:flex;flex-direction:column;gap:clamp(16px,2.2vw,24px)"><div class="qhead" style="display:flex;align-items:center;gap:clamp(12px,2vw,24px)">
      <div style="flex:none;position:relative;width:clamp(64px,8vw,100px);aspect-ratio:1"><svg viewBox="0 0 112 112" style="position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)"><circle cx="56" cy="56" r="48" fill="none" stroke="var(--track)" stroke-width="10"/><circle id="ring" cx="56" cy="56" r="48" fill="none" stroke="var(--hot)" stroke-width="10" stroke-linecap="round" stroke-dasharray="301.6" stroke-dashoffset="${rev ? 301.6 : 0}"/></svg><span id="tnum" class="poppins" style="position:absolute;inset:0;display:grid;place-items:center;font-size:clamp(22px,3vw,38px);font-weight:700">${rev ? '0' : S.q.secs}</span></div>
      <div class="qtitle" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="pr-eyebrow">${PR.TYPE_LABEL[q.type]} · ${PR.esc(q.topic)}</span>${q.double ? '<span style="padding:2px 8px;border-radius:6px;background:#FEBE00;color:#08283B;font-size:13px;font-weight:700">2× points</span>' : ''}</div>
      <h2 style="font-size:clamp(20px,2.8vw,36px);line-height:1.22;letter-spacing:-.015em;text-wrap:pretty">${PR.esc(q.q)}</h2></div>
      <div class="qcount" style="flex:none;display:flex;flex-direction:column;align-items:center;padding:10px 14px;border-radius:12px;background:var(--surface2)"><span class="poppins" id="h-answered" style="font-size:clamp(22px,3vw,36px);font-weight:700;line-height:1">${S.answered}</span><span style="font-size:13px;color:var(--ink2);white-space:nowrap">of <span id="h-total">${S.nPlayers}</span> in</span></div></div>`;
  }
  const TILE_BG = ['var(--hot2)', 'var(--tile2)'];
  const canPick = () => SOLO && S.phase === 'question' && !S.me.answered && !pickedLocal;
  let pickedLocal = null;
  function pickC(k) { if (!canPick()) return; pickedLocal = k; conn.send({ t: 'answer', choice: k }); PR.sfx('pick'); PR.buzz(25); applyPicked(); }
  function applyPicked() {
    stage.querySelectorAll('[data-c]').forEach(el => { const on = Number(el.dataset.c) === pickedLocal; el.style.opacity = on ? 1 : .35; el.style.cursor = 'default'; el.disabled = true; });
    const l = $('#locked'); if (l) l.style.display = 'block';
  }
  const mineTag = (k, txt) => SOLO && S.reveal && S.me.mine === k ? `<span style="position:absolute;top:-13px;right:18px;padding:3px 10px;border-radius:6px;background:var(--ink);color:var(--surface);font-size:12px;font-weight:700">${txt}</span>` : '';
  function answerArea(rev) {
    const q = S.q, r = S.reveal, pk = canPick();
    if (q.type === 'tf') {
      const c = r ? r.counts : [0, 0], tot = Math.max(1, c[0] + c[1]);
      return `<div class="tiles">${['True', 'False'].map((t, k) => {
        const ok = rev && r.correct === k;
        return `<${pk ? 'button' : 'div'} ${pk ? `data-c="${k}"` : ''} class="tile" style="${pk ? 'cursor:pointer;' : ''}background:${TILE_BG[k]};opacity:${rev ? (ok ? 1 : .3) : 1};transform:scale(${rev ? (ok ? 1.03 : .95) : 1});border-color:${ok ? 'var(--ink)' : 'transparent'};box-shadow:${PR.isDark() ? `0 16px 44px ${k ? '#0E7490' : '#6C2BD9'}66` : '0 10px 28px rgba(8,40,59,.18)'}">${pk ? `<span style="position:absolute;left:16px;top:14px;width:30px;height:30px;border-radius:6px;background:rgba(255,255,255,.22);display:grid;place-items:center;font-family:Inter,sans-serif;font-size:14px;font-weight:700">${'TF'[k]}</span>` : ''}${mineTag(k, 'Your answer')}<span class="big">${t}</span>${rev ? `<div class="votes"><div class="vbar"><div style="width:${Math.round(c[k] / tot * 100)}%"></div></div><span>${ok ? '✓ ' : ''}${c[k]} votes</span></div>` : ''}</${pk ? 'button' : 'div'}>`;
      }).join('')}</div>`;
    }
    if (q.type === 'ab') {
      const c = r ? r.counts : [0, 0], tot = Math.max(1, c[0] + c[1]);
      return `<div class="panels">${[0, 1].map(k => {
        const ok = rev && r.correct === k;
        return `<${pk ? 'button' : 'div'} ${pk ? `data-c="${k}"` : ''} class="panel" style="${pk ? 'cursor:pointer;' : ''}opacity:${rev ? (ok ? 1 : .4) : 1};transform:scale(${rev ? (ok ? 1.02 : .96) : 1});border-color:${ok ? '#0E9F6E' : 'transparent'}"><div class="head"><span class="let" style="background:${TILE_BG[k]}">${'AB'[k]}</span>${rev ? `<div style="flex:1;display:flex;align-items:center;gap:12px;min-width:0"><div class="pbar"><div style="width:${Math.round(c[k] / tot * 100)}%;background:${ok ? '#0E9F6E' : '#8394A0'}"></div></div><span style="font-size:16px;font-weight:600;white-space:nowrap">${ok ? '✓ Better' : 'Weaker'} · ${c[k]}</span></div>` : ''}${mineTag(k, 'Your pick')}</div><div class="mockbox">${PR.mock((q.mock || 'contrast') + (k ? '-b' : '-a'))}</div></${pk ? 'button' : 'div'}>`;
      }).join('')}</div>`;
    }
    if (!rev && SOLO) return `<form id="tf" style="min-height:240px;border-radius:20px;background:var(--surface2);display:flex;flex-direction:column;justify-content:center;gap:14px;padding:clamp(18px,3vw,36px)"><span style="font-size:15px;color:var(--ink2)">Spelling is forgiving. Press Enter to lock it in.</span><div style="display:flex;gap:12px;flex-wrap:wrap"><input class="pr-input" id="ans" maxlength="40" autocomplete="off" autocapitalize="off" placeholder="Type your answer" aria-label="Your answer" ${S.me.answered || pickedLocal ? 'disabled' : ''} style="flex:1 1 260px;border-radius:10px;height:60px;text-align:left;font-family:Poppins,sans-serif;font-size:22px;font-weight:600"><button class="pr-btn pr-btn-lg" type="submit" ${S.me.answered || pickedLocal ? 'disabled' : ''} style="height:60px">Lock it in</button></div></form>`;
    if (!rev) return `<div style="min-height:260px;border-radius:20px;background:var(--surface2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px"><div style="display:flex;gap:8px">${[0, 200, 400].map(d => `<span style="display:block;width:52px;height:9px;border-radius:5px;background:var(--hot);transform-origin:left;animation:pr-bar 1.2s ${d}ms ease-in-out infinite"></span>`).join('')}</div><span class="poppins" style="font-size:clamp(26px,3.6vw,44px);font-weight:700;letter-spacing:-.02em">Type it on your phone</span><span style="font-size:18px;color:var(--ink2)">Spelling is forgiving. Speed still counts.</span></div>`;
    return `<div style="position:relative;min-height:240px;border-radius:20px;background:var(--surface2);display:flex;flex-direction:column;justify-content:center;gap:20px;padding:clamp(18px,3vw,36px)"><div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:14px;font-weight:600;color:var(--pos);text-transform:uppercase;letter-spacing:.1em">The answer</span><span class="poppins" style="font-size:clamp(40px,6vw,72px);font-weight:700;letter-spacing:-.03em;line-height:1;animation:pr-pop 500ms cubic-bezier(.34,1.56,.64,1) both">${PR.esc(r.answer)}</span></div><div style="display:flex;flex-wrap:wrap;gap:10px">${r.tally.map((a, k) => `<span style="white-space:nowrap;display:flex;gap:10px;padding:8px 16px;border-radius:999px;background:${a.ok ? 'var(--pos)' : 'var(--track)'};color:${a.ok ? (PR.isDark() ? '#08283B' : '#fff') : 'var(--ink)'};font-size:17px;font-weight:600;animation:pr-rise 400ms ${k * 120}ms both">“${PR.esc(a.text)}” <span style="opacity:.8">×${a.count}</span></span>`).join('') || '<span style="color:var(--ink2)">Nobody answered.</span>'}</div></div>`;
  }
  function runTimer() {
    const ring = $('#ring'), num = $('#tnum'); if (!ring) return;
    const total = (S.qEnd - S.qStart) / 1000;
    let lastWhole = Math.ceil(total);
    const loop = () => {
      const left = Math.max(0, (S.qEnd - PR.serverNow()) / 1000), whole = Math.ceil(left);
      ring.setAttribute('stroke-dashoffset', String(301.6 * (1 - left / total)));
      ring.setAttribute('stroke', left <= 3 ? 'var(--neg)' : 'var(--hot)');
      num.textContent = whole;
      if (whole !== lastWhole) { lastWhole = whole; if (whole <= 3 && whole > 0) PR.sfx('tick'); }
      if (left > 0 && S.phase === 'question') timerRaf = requestAnimationFrame(loop);
    };
    loop();
  }
  function question() {
    stage.innerHTML = questionHead(false) + answerArea(false) + (SOLO
      ? `<span id="locked" style="display:none;text-align:center;font-size:16px;color:var(--ink2);animation:pr-breathe 1.2s ease-in-out infinite">Locked in. Waiting for the others…</span></div>`
      : `<div style="display:flex;justify-content:center"><button class="pr-btn pr-btn-outline pr-btn-lg" id="q-end">End round now</button></div></div>`);
    const qe = $('#q-end'); if (qe) qe.onclick = () => cmd('endRound');
    if (SOLO) {
      stage.querySelectorAll('[data-c]').forEach(el => { el.onclick = () => pickC(Number(el.dataset.c)); });
      const tf = $('#tf');
      if (tf) { if (!S.me.answered) $('#ans').focus(); tf.onsubmit = e => { e.preventDefault(); const v = $('#ans').value.trim(); if (!v || pickedLocal || S.me.answered) return; pickedLocal = v; conn.send({ t: 'answer', text: v }); PR.sfx('pick'); PR.buzz(25); $('#ans').disabled = true; tf.querySelector('button').disabled = true; const l = $('#locked'); if (l) l.style.display = 'block'; }; }
      if (S.me.answered) { pickedLocal = S.me.mine; applyPicked(); }
    }
    runTimer();
  }
  function reveal() {
    const r = S.reveal, total = Math.max(1, S.nPlayers), good = r.rightCount / total >= .5;
    const me = S.me, ok = SOLO ? me.ok : good;
    const milestone = SOLO && me.ok && [3, 5, 8, 12].includes(me.streak);
    PR.sfx(ok ? (milestone ? 'streak' : 'right') : 'wrong'); if (SOLO) PR.buzz(ok ? [20, 40, 20] : [80, 50, 80]);
    const res = !SOLO ? null : me.ok ? { bg: '#057A55', anim: 'pr-pop 450ms cubic-bezier(.34,1.56,.64,1) both', title: 'Correct!', sub: (S.q.double ? 'Double points! ' : '') + (me.streak >= 2 ? 'Streak bonus applied.' : 'Quick thinking. Keep it going.') }
      : me.answered ? { bg: '#C81E1E', anim: 'pr-shake 450ms', title: 'Not this time', sub: me.best >= 2 ? 'Streak reset. Build it back up.' : 'Shake it off. Next one’s yours.' }
        : { bg: 'var(--hotDeep)', anim: 'pr-shake 450ms', title: "Time's up", sub: 'Trust your gut. Speed pays.' };
    const mlText = { 3: 'Hat-trick! 3 in a row', 5: 'Unstoppable: 5 in a row', 8: 'On fire: 8 in a row', 12: 'Legendary: 12 in a row' }[me.streak];
    const banner = res ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 24px;border-radius:16px;background:${res.bg};color:#fff;animation:${res.anim}"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><span class="poppins" style="font-size:clamp(24px,3vw,32px);font-weight:700;letter-spacing:-.02em">${res.title}</span><span style="font-size:15px">${res.sub}</span></div>${milestone && mlText ? `<span style="padding:6px 12px;border-radius:8px;background:#FEBE00;color:#08283B;font-weight:700;font-size:15px;animation:pr-pop 500ms 300ms both">${mlText}</span>` : ''}<span class="poppins" style="font-size:clamp(30px,4vw,44px);font-weight:700">+${PR.fmt(me.gain)}</span></div>` : '';
    const f = r.fastest ? { name: r.fastest.name, sub: r.fastest.t.toFixed(1) + 's' } : { name: 'Nobody yet', sub: 'Tough one' };
    stage.innerHTML = questionHead(true) + answerArea(true) + `
      <div style="display:flex;flex-direction:column;gap:16px;animation:pr-rise 380ms 200ms cubic-bezier(.4,0,.2,1) both">
        ${banner}
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:stretch">
          <div class="card" style="flex:2 1 320px;padding:18px 22px"><span class="lab" style="color:var(--eyebrow)">Why it matters</span><p style="margin:0;font-size:17px;line-height:1.5;text-wrap:pretty">${PR.esc(r.fact)}</p></div>
          <div class="card" style="flex:1 1 220px;justify-content:center;gap:4px"><span class="lab" style="color:var(--gold)">Fastest finger</span><span class="poppins" style="font-size:22px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${PR.esc(f.name)}</span><span style="font-size:15px;color:var(--ink2)">${f.sub} · ${r.rightCount}/${S.nPlayers} got it</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:flex-end">
          ${S.auto ? `<div style="flex:1 1 200px;display:flex;flex-direction:column;gap:6px"><span style="font-size:14px;color:var(--ink2)">Leaderboard coming up…</span><div class="autobar"><div style="animation-duration:${REVEAL_MS}ms"></div></div></div>` : ''}
          <button class="pr-btn pr-btn-lg ${S.auto ? 'pr-btn-outline' : ''}" id="r-next">Leaderboard →</button>
        </div></div>
      <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;background:${good ? 'rgba(14,159,110,.16)' : 'var(--hotSoft)'};animation:pr-flash 900ms ease-out forwards"></div>`;
    $('#r-next').onclick = () => cmd('toBoard');
    if (milestone || (SOLO && me.ok && S.q.double)) PR.confetti(130); else if (!SOLO && r.rightCount === total && total > 1) PR.confetti(60);
    const ringEl = $('#ring'); ringEl && ringEl.setAttribute('stroke-dashoffset', '301.6');
  }

  // leaderboard
  function board() {
    const ROW = 74, b = S.board, last = S.i + 1 >= S.total;
    let climber = null;
    b.forEach(p => { const d = p.prevRank - p.rank; if (d > 0 && (!climber || d > climber.by)) climber = { by: d, name: p.name }; });
    const isMe = p => SOLO && p.id === S.me.id;
    const me = S.me || {}, dMe = SOLO ? me.prevRank - me.rank : 0;
    const myMoveText = dMe > 0 ? `▲ Up ${dMe} place${dMe > 1 ? 's' : ''}` : dMe < 0 ? `▼ Down ${-dMe}` : `Holding #${me.rank}`, myMoveColor = dMe > 0 ? 'var(--pos)' : dMe < 0 ? 'var(--neg)' : 'var(--ink)';
    const ahead = SOLO && b.find(p => p.rank === me.rank - 1), behind = SOLO && b.find(p => p.rank === me.rank + 1);
    const gapText = !SOLO ? '' : me.rank === 1 ? (behind ? `You lead by ${PR.fmt(me.score - behind.score)} pts. Hold on!` : 'You lead the pack!') : ahead ? `${PR.fmt(ahead.score - me.score)} pts behind ${PR.esc(ahead.name)}. One fast answer could do it.` : '';
    const lbl = p => isMe(p) && p.name !== 'You' ? p.name + ' (you)' : p.name;
    const rows = b.filter(p => p.rank <= 5 || p.prevRank <= 5 || isMe(p));
    stage.innerHTML = `<div style="display:flex;flex-direction:column;gap:20px;flex:1">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap"><div style="display:flex;flex-direction:column;gap:4px"><span class="pr-eyebrow">After round ${S.i + 1} of ${S.total}</span><h2 style="font-size:clamp(32px,4.4vw,54px);letter-spacing:-.025em;line-height:1">Leaderboard</h2></div>
      ${climber ? `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:12px;background:var(--surface2);animation:pr-pop 500ms 900ms cubic-bezier(.34,1.56,.64,1) both"><span class="poppins" style="font-size:24px;font-weight:700;color:var(--pos)">▲${climber.by}</span><div style="display:flex;flex-direction:column;min-width:0"><span style="font-size:12px;color:var(--pos);font-weight:700;text-transform:uppercase;letter-spacing:.08em">Biggest climber</span><span style="font-size:17px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${PR.esc(climber.name)}</span></div></div>` : ''}</div>
      <div class="board" style="height:${ROW * (SOLO ? 6 : 5) - 10}px" id="rows">${rows.map(p => `<div class="row" data-id="${p.id}" style="background:${isMe(p) ? 'var(--you)' : 'var(--rowBg)'}"></div>`).join('')}</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:flex-end;margin-top:auto">
        ${SOLO ? `<span style="flex:1 1 260px;font-size:16px;color:var(--ink2)"><strong style="color:${myMoveColor}">${myMoveText}</strong> · ${gapText}</span>` : ''}
        ${S.auto ? `<div style="flex:0 1 200px" class="autobar"><div style="animation-duration:${BOARD_MS}ms"></div></div>` : ''}
        <button class="pr-btn pr-btn-lg ${S.auto ? 'pr-btn-outline' : ''}" id="b-next">${last ? 'Final results' : 'Next round'} →</button></div></div>`;
    $('#b-next').onclick = () => cmd('next');
    const el = {}; stage.querySelectorAll('.row').forEach(e => { el[e.dataset.id] = e; });
    const paint = (step, e) => rows.forEach(p => {
      const rank = step ? p.rank : p.prevRank, visible = rank <= 5 || isMe(p), shown = step ? p.prevScore + (p.score - p.prevScore) * e : p.prevScore;
      const medal = rank === 1 ? '#FEBE00' : rank === 2 ? '#CDD4D8' : rank === 3 ? '#E0A877' : 'var(--medalOff)';
      const d = p.prevRank - p.rank;
      el[p.id].style.top = (isMe(p) && rank > 5 ? 5 * ROW + 8 : Math.min(rank - 1, 5) * ROW) + 'px'; el[p.id].style.opacity = visible ? 1 : 0;
      el[p.id].innerHTML = `<span class="medal" style="background:${medal};color:${rank <= 3 ? '#08283B' : 'var(--medalOffInk)'}">${rank}</span><span class="nm">${PR.esc(lbl(p))}</span>${p.streak >= 3 ? `<span class="hotb">×${p.streak}</span>` : ''}<span class="g-move" style="flex:none;width:40px;text-align:right;font-size:15px;font-weight:700;color:${d > 0 ? 'var(--pos)' : 'var(--neg)'}">${step && d > 0 ? '▲' + d : step && d < 0 ? '▼' + -d : ''}</span><span class="g-gain" style="flex:none;width:64px;text-align:right;font-size:15px;color:var(--pos)">${p.gain ? '+' + PR.fmt(p.gain) : ''}</span><span class="poppins g-score" style="flex:none;width:84px;text-align:right;font-size:clamp(18px,2.2vw,26px);font-weight:700">${PR.fmt(shown)}</span>`;
    });
    document.documentElement.style.setProperty('--rowBg', PR.isDark() ? 'rgba(255,255,255,.05)' : '#F6F6F6');
    document.documentElement.style.setProperty('--medalOff', PR.isDark() ? '#3A3A3C' : '#E1E9EA');
    document.documentElement.style.setProperty('--medalOffInk', PR.isDark() ? '#F5F5F7' : '#08283B');
    paint(0, 0);
    later(450, () => {
      PR.sfx('whoosh'); const t0 = performance.now();
      const loop = now => { const p = Math.min(1, (now - t0) / 1000); paint(1, PR.ease(p)); if (p < 1) anim = requestAnimationFrame(loop); };
      anim = requestAnimationFrame(loop);
    });
  }

  // podium
  function soloSummary() {
    const me = S.me, ach = me.ach || {};
    try { const key = PBK + '.' + S.deck + '.' + S.total, pb = Number(localStorage.getItem(key)) || 0; newPB = me.score > pb; if (newPB) localStorage.setItem(key, String(me.score)); prevPB = pb; } catch (e) { newPB = false; }
    return `<div id="p-solo" style="width:100%;display:none;flex-direction:column;gap:16px;text-align:left;padding-top:20px;border-top:1px solid var(--line);animation:pr-rise 400ms both">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap"><div style="display:flex;flex-direction:column"><span style="font-size:13px;color:var(--eyebrow);font-weight:600;text-transform:uppercase;letter-spacing:.08em">You placed</span><span class="poppins" style="font-size:52px;font-weight:700;line-height:1">#${me.rank}</span></div>
      <span class="pr-chip poppins" style="font-weight:700;font-size:18px">${PR.fmt(me.score)} pts</span><span class="pr-chip">${me.correct}/${S.total} correct</span><span class="pr-chip">Best streak ×${me.best}</span>
      ${newPB ? `<span style="padding:6px 12px;border-radius:8px;background:#FEBE00;color:#08283B;font-weight:700;font-size:14px;animation:pr-pop 500ms both">New personal best!${prevPB ? ' Previous: ' + PR.fmt(prevPB) : ''}</span>` : ''}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${PR.ACH.map((a, k) => `<div style="display:flex;gap:10px;align-items:center;padding:10px;border-radius:12px;background:${ach[a.id] ? 'var(--you)' : 'var(--surface2)'};opacity:${ach[a.id] ? 1 : .5};animation:pr-rise 400ms ${300 + k * 120}ms both"><span class="poppins" style="flex:none;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;font-size:13px;font-weight:700;background:${ach[a.id] ? '#FEBE00' : 'var(--track)'};color:${ach[a.id] ? '#08283B' : 'var(--ink2)'}">${a.mark}</span><span style="font-size:14px;line-height:1.25"><strong>${a.name}</strong><br><span style="color:var(--ink2)">${a.hint}</span></span></div>`).join('')}</div></div>`;
  }
  function podium() {
    const b = S.board, pos = k => b[k] ? { name: (SOLO && b[k].id === S.me.id && b[k].name !== 'You' ? b[k].name + ' (you)' : b[k].name), score: PR.fmt(b[k].score) + ' pts' } : { name: '', score: '' };
    const p1 = pos(0), p2 = pos(1), p3 = pos(2);
    const col = (p, cls, at, h, bg, n, fs, champ) => `<div class="pcol" data-at="${at}" style="display:flex;flex-direction:column;gap:8px;align-items:center;min-width:0;opacity:0;transform:translateY(80px);transition:opacity 500ms,transform 750ms cubic-bezier(.34,1.56,.64,1)">${champ ? '<span style="padding:3px 10px;border-radius:6px;background:#FEBE00;color:#08283B;font-size:13px;font-weight:700">Champion</span>' : ''}<span class="poppins" style="font-weight:${champ ? 700 : 600};font-size:clamp(14px,2vw,${champ ? 30 : 24}px);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${PR.esc(p.name)}</span><span style="font-size:15px;color:var(--ink2)">${p.score}</span><div class="poppins" style="width:100%;height:${h};border-radius:14px 14px 0 0;background:${bg};color:#fff;display:grid;place-items:center;font-size:${fs};font-weight:700">${n}</div></div>`;
    stage.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center">
      <div style="display:flex;flex-direction:column;gap:6px;align-items:center"><span class="pr-eyebrow" style="font-size:15px;letter-spacing:.12em">Final results</span><h2 style="font-size:clamp(30px,4.4vw,56px);letter-spacing:-.025em;line-height:1.05">${SOLO ? (S.me.rank === 1 ? 'You won!' : S.me.rank <= 3 ? 'Podium finish!' : 'Nice run!') : p1.name ? PR.esc(p1.name) + ' takes it!' : 'Game over'}</h2></div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,240px));gap:clamp(8px,1.6vw,18px);align-items:end;width:100%;justify-content:center">
        ${col(p2, '', 1, 'clamp(110px,16vw,200px)', '#336087', 2, 'clamp(40px,6vw,80px)')}${col(p1, '', 3, 'clamp(150px,22vw,280px)', 'var(--hot2)', 1, 'clamp(52px,8vw,104px)', true)}${col(p3, '', 0, 'clamp(80px,11vw,140px)', '#5A6F7C', 3, 'clamp(36px,5vw,68px)')}</div>
      ${SOLO ? soloSummary() : ''}
      <div id="p-rest" style="width:100%;max-width:640px;display:none;flex-direction:column;gap:8px;text-align:left;animation:pr-rise 400ms both">${b.slice(3, 8).map(p => `<div style="display:flex;gap:12px;align-items:center;padding:8px 14px;border-radius:10px;background:var(--surface2)"><span class="poppins" style="width:28px;font-weight:700;color:var(--ink2)">${p.rank}</span><span style="flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${PR.esc(p.name)}</span><span class="poppins" style="font-weight:700">${PR.fmt(p.score)}</span></div>`).join('')}</div>
      <div id="p-actions" class="p-actions" style="display:none;gap:12px;flex-wrap:wrap;justify-content:center"><button class="pr-btn pr-btn-lg" id="p-again">${SOLO ? 'Play again' : 'Play again (same room)'}</button><button class="pr-btn pr-btn-lg pr-btn-outline" id="p-quit">${SOLO ? 'Back to decks' : 'End game'}</button></div></div>`;
    const show = (at, sfx, extra) => { stage.querySelectorAll('.pcol').forEach(c => { if (Number(c.dataset.at) === at) { c.style.opacity = 1; c.style.transform = 'none'; } }); sfx && PR.sfx(sfx); extra && extra(); };
    later(900, () => show(0, 'pop'));
    later(2300, () => show(1, 'pop'));
    later(3200, () => PR.sfx('drum'));
    later(4600, () => show(3, 'win', () => { PR.confetti(130); PR.buzz([40, 60, 40]); }));
    if (SOLO) later(5000, () => { const el = $('#p-solo'); if (el) el.style.display = 'flex'; });
    later(6200, () => { $('#p-rest').style.display = 'flex'; $('#p-actions').style.display = 'flex'; });
    $('#p-again').onclick = () => cmd('restart');
    $('#p-quit').onclick = () => cmd('quit');
  }

  setup();
})();
