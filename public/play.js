/* Pixel Rush Live: player (phone) */
(function () {
  const $ = s => document.querySelector(s);
  const body = $('#body'), topRight = $('#top-right');
  $('#logo').innerHTML = PR.logo();
  const SAVE = 'pixelrush.live.player';
  let S = null, saved = null, conn, viewKey = '', joined = false, errMsg = '', tos = [], raf = 0, cd = 0, picked = null;
  const later = (ms, fn) => tos.push(setTimeout(fn, ms));
  const clearAll = () => { tos.forEach(clearTimeout); tos = []; cancelAnimationFrame(raf); clearInterval(cd); };
  try { saved = JSON.parse(localStorage.getItem(SAVE)); } catch (e) {}
  const params = new URLSearchParams(location.search);

  conn = PR.connect({
    open() {
      $('#conn').hidden = true;
      if (saved && saved.pin && saved.token) conn.send({ t: 'join', pin: saved.pin, token: saved.token });
      else joinForm();
    },
    close() { $('#conn').hidden = false; },
    message(m) {
      if (m.t === 'joined') { joined = true; saved = { pin: saved && saved.pin || m.pin, token: m.token, id: m.id }; if (pendingPin) saved.pin = pendingPin; try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch (e) {} PR.sfx('join'); PR.buzz(30); }
      else if (m.t === 'state') onState(m);
      else if (m.t === 'locked') { PR.sfx('pick'); PR.buzz(25); }
      else if (m.t === 'error') { errMsg = m.msg; if (saved && saved.token) { forget(); } joinForm(); }
      else if (m.t === 'closed') { forget(); errMsg = m.reason || 'The game ended.'; S = null; joined = false; joinForm(); }
    },
  });
  let pendingPin = null;
  function forget() { saved = null; viewKey = ''; try { localStorage.removeItem(SAVE); } catch (e) {} }
  PR.onTheme = () => { top(); };
  function top() {
    topRight.innerHTML = (S && S.me ? `<span class="pill">${PR.esc(S.me.name)}</span><span class="pill poppins">${PR.fmt(S.me.score)} pts</span>${S.me.streak >= 2 ? `<span class="pill" style="background:var(--hot);color:#fff">×${S.me.streak}</span>` : ''}` : '') + PR.themeButton();
    PR.bindTheme(topRight);
  }

  // ---------- join ----------
  function joinForm() {
    clearAll(); viewKey = 'join'; top();
    const pinVal = params.get('pin') || (saved && saved.pin) || '';
    body.innerHTML = `<div class="fullc" style="gap:18px;max-width:380px;width:100%;margin:0 auto">
      <h1 style="font-size:clamp(32px,9vw,44px);line-height:1.05;letter-spacing:-.03em">Join the <span style="color:var(--brand);font-style:italic">game</span></h1>
      <form id="jf" style="display:flex;flex-direction:column;gap:12px;width:100%">
        <input class="pr-input" id="j-pin" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="Game PIN" autocomplete="off" aria-label="Game PIN" value="${PR.esc(pinVal)}" style="font-family:'Poppins',sans-serif;font-size:24px;font-weight:600;letter-spacing:.08em">
        <input class="pr-input" id="j-name" maxlength="16" placeholder="Your nickname" autocomplete="nickname" aria-label="Nickname">
        <button class="pr-btn" type="submit" style="width:100%">Join →</button>
        <p style="margin:4px 0 0;font-size:15px;color:var(--ink2)"><a href="/solo" style="color:var(--accent)">Play solo</a> · <a href="/host" style="color:var(--accent)">Host a game</a></p>
        <p id="j-err" role="alert" style="margin:0;min-height:20px;color:var(--neg);font-weight:600;font-size:15px">${PR.esc(errMsg)}</p>
      </form></div>`;
    errMsg = '';
    const f = $('#jf'); (pinVal ? $('#j-name') : $('#j-pin')).focus();
    f.onsubmit = e => {
      e.preventDefault();
      pendingPin = $('#j-pin').value.replace(/\D/g, '');
      if (pendingPin.length !== 6) { $('#j-err').textContent = 'Enter the 6-digit PIN from the big screen.'; return; }
      if (!$('#j-name').value.trim()) { $('#j-err').textContent = 'Pick a nickname first.'; return; }
      saved = { pin: pendingPin };
      conn.send({ t: 'join', pin: pendingPin, name: $('#j-name').value });
    };
  }

  // ---------- state ----------
  function onState(m) {
    const prev = S; S = m; top();
    const key = m.phase + ':' + m.i + (m.phase === 'lobby' ? ':' + m.nPlayers : '');
    if (key !== viewKey) { viewKey = key; clearAll(); picked = null; view(prev); }
    else if (m.phase === 'question' && m.me.answered) locked();
  }
  function view(prev) {
    const fn = { lobby, countdown, ready, question, reveal, board, podium }[S.phase];
    fn && fn(prev);
  }
  const wrap = h => { body.innerHTML = h; };

  function lobby() {
    wrap(`<div class="fullc"><div class="arc" style="position:relative;margin:0;width:88px;background:var(--hot2);font-size:28px">${PR.esc(PR.initials(S.me.name))}</div><h2 style="font-size:clamp(28px,8vw,38px);letter-spacing:-.02em">You're in, ${PR.esc(S.me.name)}!</h2><p style="margin:0;color:var(--ink2);font-size:17px">See your name on the big screen.<br>${S.nPlayers} player${S.nPlayers === 1 ? '' : 's'} joined · waiting for the host to start.</p><span style="color:var(--ink3);animation:pr-breathe 1.6s ease-in-out infinite">Waiting…</span></div>`);
  }
  function countdown() {
    wrap(`<div class="fullc"><span class="pr-eyebrow" style="font-size:18px;letter-spacing:.12em">Get ready</span><div id="cd" style="display:grid;place-items:center;width:220px;height:220px"></div></div>`);
    let last = 0;
    const tick = () => {
      const n = Math.max(1, Math.ceil((S.cdEnds - PR.serverNow()) / 1000));
      if (n !== last) { last = n; $('#cd').innerHTML = `<span class="poppins" style="grid-area:1/1;font-size:150px;font-weight:700;line-height:1;animation:pr-zoom 1s cubic-bezier(.4,0,.2,1) both">${n}</span>`; PR.sfx('beep'); }
    };
    tick(); cd = setInterval(tick, 100);
  }
  function ready() {
    const q = S.q, ms = Math.max(1, S.readyEnds - PR.serverNow());
    wrap(`<div class="fullc" style="gap:18px"><span class="pr-chip" style="font-weight:600">${PR.TYPE_LABEL[q.type]}</span>${q.double ? `<span class="poppins" style="padding:8px 18px;border-radius:12px;background:#FEBE00;color:#08283B;font-size:22px;font-weight:700;animation:pr-pop 500ms both">Double points!</span>` : ''}<h2 style="font-size:clamp(26px,7vw,34px);line-height:1.15;text-wrap:balance;animation:pr-rise 450ms both">Round ${S.i + 1}</h2><p style="margin:0;color:var(--ink2);font-size:17px">Read the question on the big screen.</p><div class="timebar" style="width:70%"><div style="animation:pr-shrink ${ms}ms linear forwards"></div></div></div>`);
  }
  const TILE = ['var(--hot2)', 'var(--tile2)'];
  function question() {
    const q = S.q, total = (S.qEnd - S.qStart) / 1000;
    if (S.me.answered) return locked();
    let inner;
    if (q.type === 'tf') inner = `<div class="pstack">${['True', 'False'].map((t, k) => `<button class="pbtn" data-c="${k}" style="background:${TILE[k]};flex:1">${t}</button>`).join('')}</div>`;
    else if (q.type === 'ab') inner = `<p style="margin:0;text-align:center;color:var(--ink2)">Compare the two designs on the big screen.</p><div class="pstack">${['A', 'B'].map((t, k) => `<button class="pbtn" data-c="${k}" style="background:${TILE[k]};flex:1">${t}</button>`).join('')}</div>`;
    else inner = `<form id="tf" style="display:flex;flex-direction:column;gap:14px;flex:1;justify-content:center"><h2 style="font-size:22px;line-height:1.25;text-align:center">${PR.esc(q.q)}</h2><input class="pr-input" id="ans" maxlength="40" autocomplete="off" autocapitalize="off" placeholder="Type your answer" aria-label="Your answer" style="border-radius:12px;height:64px;font-family:'Poppins',sans-serif;font-size:22px;font-weight:600"><button class="pr-btn" style="width:100%;height:60px" type="submit">Lock it in</button></form>`;
    wrap(`<div class="timebar"><div id="tb" style="width:100%"></div></div>${inner}`);
    body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { picked = Number(b.dataset.c); conn.send({ t: 'answer', choice: picked }); lockedLocal(); });
    const f = $('#tf'); if (f) { $('#ans').focus(); f.onsubmit = e => { e.preventDefault(); const v = $('#ans').value.trim(); if (!v) return; picked = v; conn.send({ t: 'answer', text: v }); lockedLocal(); }; }
    const loop = () => {
      const left = Math.max(0, (S.qEnd - PR.serverNow()) / 1000), tb = $('#tb'); if (!tb) return;
      tb.style.width = (left / total * 100) + '%'; tb.style.background = left <= 3 ? 'var(--neg)' : 'var(--hot)';
      if (left > 0) raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function lockedLocal() { cancelAnimationFrame(raf); wrap(`<div class="fullc"><div class="arc" style="position:relative;margin:0;width:80px;background:var(--pos);font-size:34px;border-radius:50%">✓</div><h2 style="font-size:30px">Locked in!</h2><p style="margin:0;color:var(--ink2);font-size:17px;animation:pr-breathe 1.2s ease-in-out infinite">Waiting for the others…</p></div>`); }
  function locked() {
    const t = S.me.myT != null ? S.me.myT.toFixed(1) + 's' : '';
    wrap(`<div class="fullc"><div class="arc" style="position:relative;margin:0;width:80px;background:var(--pos);font-size:34px;border-radius:50%">✓</div><h2 style="font-size:30px">Locked in${t ? ' at ' + t : ''}!</h2><p style="margin:0;color:var(--ink2);font-size:17px;animation:pr-breathe 1.2s ease-in-out infinite">${S.answered} of ${S.nPlayers} answered…</p></div>`);
  }
  function reveal() {
    const me = S.me, r = S.reveal;
    const res = me.ok ? { bg: '#057A55', title: 'Correct!', anim: 'pr-pop 450ms cubic-bezier(.34,1.56,.64,1) both', sub: me.streak >= 2 ? `Streak ×${me.streak}, bonus points!` : 'Quick thinking. Keep it going.' }
      : me.answered ? { bg: '#C81E1E', title: 'Not this time', anim: 'pr-shake 450ms', sub: 'Shake it off. Next one’s yours.' }
        : { bg: 'var(--hotDeep)', title: "Time's up", anim: 'pr-shake 450ms', sub: 'Trust your gut. Speed pays.' };
    PR.sfx(me.ok ? 'right' : 'wrong'); PR.buzz(me.ok ? [20, 40, 20] : [80, 50, 80]);
    const correct = r.answer ? r.answer : S.q.type === 'tf' ? ['True', 'False'][r.correct] : 'ABCD'[r.correct];
    wrap(`<div class="fullc" style="position:relative;gap:16px"><div style="width:100%;padding:28px 20px;border-radius:20px;background:${res.bg};color:#fff;animation:${res.anim}"><div class="poppins" style="font-size:34px;font-weight:700;letter-spacing:-.02em">${res.title}</div><div style="margin-top:6px">${res.sub}</div><div class="poppins" style="font-size:44px;font-weight:700;margin-top:12px;position:relative">+${PR.fmt(me.gain)}${me.ok ? `<span style="position:absolute;left:50%;top:-8px;animation:pr-float 1.2s ease-out both">🎉</span>` : ''}</div></div>
      <div class="card" style="width:100%;text-align:left"><span class="lab" style="color:var(--pos)">Answer</span><span class="poppins" style="font-size:24px;font-weight:700">${PR.esc(correct)}</span></div>
      <p style="margin:0;color:var(--ink2)">You're <strong style="color:var(--ink)">#${me.rank}</strong> of ${S.nPlayers} · ${PR.fmt(me.score)} pts</p></div>`);
    if (me.ok) PR.confetti(40, body, .7);
  }
  function board() {
    const me = S.me, b = S.board, d = me.prevRank - me.rank;
    const ahead = b.find(p => p.rank === me.rank - 1), behind = b.find(p => p.rank === me.rank + 1);
    const gap = me.rank === 1 ? (behind ? `You lead by ${PR.fmt(me.score - behind.score)} pts. Hold on!` : 'You lead the pack!') : ahead ? `${PR.fmt(ahead.score - me.score)} pts behind ${PR.esc(ahead.name)}. One fast answer could do it.` : '';
    wrap(`<div class="fullc" style="gap:14px"><span class="pr-eyebrow">After round ${S.i + 1} of ${S.total}</span><div class="poppins" style="font-size:96px;font-weight:700;line-height:1;animation:pr-pop 500ms both">#${me.rank}</div><div class="poppins" style="font-size:26px;font-weight:700;color:${d > 0 ? 'var(--pos)' : d < 0 ? 'var(--neg)' : 'var(--ink)'}">${d > 0 ? `▲ Up ${d} place${d > 1 ? 's' : ''}` : d < 0 ? `▼ Down ${-d}` : `Holding #${me.rank}`}</div><p style="margin:0;color:var(--ink2);font-size:17px;max-width:320px">${gap}</p><span class="pill" style="font-size:18px">${PR.fmt(me.score)} pts</span></div>`);
  }
  function podium() {
    const me = S.me, ach = me.ach || {};
    PR.sfx('win'); if (me.rank <= 3) { PR.confetti(80); PR.buzz([40, 60, 40, 60, 120]); }
    wrap(`<div class="fullc" style="gap:14px;justify-content:flex-start;padding-top:10px"><span class="pr-eyebrow">Final results</span><div class="poppins" style="font-size:88px;font-weight:700;line-height:1;animation:pr-pop 600ms both">#${me.rank}</div><h2 style="font-size:24px">${me.rank === 1 ? 'You won!' : me.rank <= 3 ? 'Podium finish!' : 'Nice run!'}</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><span class="pill poppins" style="font-size:18px">${PR.fmt(me.score)} pts</span><span class="pill">${me.correct}/${S.total} correct</span><span class="pill">Best streak ×${me.best}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;text-align:left">${PR.ACH.map((a, k) => `<div style="display:flex;gap:8px;align-items:center;padding:8px;border-radius:10px;background:${ach[a.id] ? 'var(--you)' : 'var(--rowBg,var(--surface2))'};opacity:${ach[a.id] ? 1 : .5};animation:pr-rise 400ms ${300 + k * 120}ms both"><span class="poppins" style="flex:none;width:36px;height:36px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:700;background:${ach[a.id] ? '#FEBE00' : 'var(--track)'};color:${ach[a.id] ? '#08283B' : 'var(--ink2)'}">${a.mark}</span><span style="font-size:13px;line-height:1.2"><strong>${a.name}</strong><br><span style="color:var(--ink2)">${a.hint}</span></span></div>`).join('')}</div>
      <p style="margin:6px 0 0;color:var(--ink3);font-size:14px">Waiting for the host to play again…</p></div>`);
  }
})();
