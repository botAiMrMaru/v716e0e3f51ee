/* VANTA — a private command bridge. All data arrives sealed; this file renders it in memory only. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const TCFG = window.VANTA_CFG || {}; const IDLE_MS = TCFG.idleMsTest || 10 * 60 * 1000, POLL_MS = TCFG.pollMsTest || 75 * 1000;
  let D = null, section = 'home', sub = { desks: 'eq', pulse: 'markets', sports: 'home', news: 'all' }, lastAct = Date.now(), pollT = null, unsub = null;
  const prevScore = {};

  /* ── haptics ── */
  const NATIVE = window.VantaNative || null;
  const H = (k = 'light') => { try { if (NATIVE && NATIVE.haptic) return NATIVE.haptic(k); if (navigator.vibrate) navigator.vibrate({ light: 8, medium: 16, heavy: 28, success: [10, 40, 14], error: [30, 50, 30, 50, 30] }[k] || 8); } catch (e) {} };

  /* ── format ── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const inr = (n, d = 0) => (n == null || isNaN(n)) ? '—' : (n < 0 ? '−' : '') + '₹' + nf(Math.abs(n), d);
  const inrS = (n) => { if (n == null || isNaN(n)) return '—'; const a = Math.abs(n), s = n < 0 ? '−' : '';
    return a >= 1e7 ? s + '₹' + (a / 1e7).toFixed(2) + 'Cr' : a >= 1e5 ? s + '₹' + (a / 1e5).toFixed(2) + 'L' : a >= 1e3 ? s + '₹' + (a / 1e3).toFixed(1) + 'k' : s + '₹' + a.toFixed(0); };
  const sInr = (n) => (n == null || isNaN(n)) ? '—' : Math.abs(n) < 0.5 ? '₹0' : (n > 0 ? '+' : '') + inr(n);
  const usd = (n) => { if (n == null || isNaN(n)) return '—'; const a = Math.abs(n); return a >= 1e9 ? '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? '$' + (a / 1e3).toFixed(0) + 'k' : '$' + a.toFixed(0); };
  const pct = (n, d = 2) => (n == null || isNaN(n)) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d) + '%';
  const cls = (n) => n > 1e-9 ? 'up' : n < -1e-9 ? 'down' : 'flat';
  const px = (n) => n >= 1000 ? nf(n, 2) : n >= 1 ? Number(n).toFixed(2) : Number(n).toPrecision(4);
  const ago = (ts) => { if (!ts) return '—'; const s = Math.max(0, Date.now() / 1000 - ts); return s < 60 ? Math.floor(s) + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const ist = (ts, o = { hour: '2-digit', minute: '2-digit', hour12: false }) => ts ? new Date(ts * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...o }) : '—';
  const css = (o) => esc(Object.entries(o).map(([k, v]) => k + ':' + v).join('|'));
  const applyCss = (root) => $$('[data-css]', root).forEach(el => { el.dataset.css.split('|').forEach(p => { const i = p.indexOf(':'); if (i > 0) el.style.setProperty(p.slice(0, i), p.slice(i + 1)); }); el.removeAttribute('data-css'); });
  const tint = (v, max) => { const t = Math.min(1, Math.abs(v) / (max || 1)); const a = (0.08 + 0.4 * t).toFixed(3); return v >= 0 ? `rgba(184,255,60,${a})` : `rgba(255,77,109,${a})`; };
  const ext = (href, inner, c = '') => href ? `<a class="${c}" href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${inner}</a>` : `<div class="${c}">${inner}</div>`;
  const empty = (g, t) => `<div class="empty"><span class="glyph">${g}</span>${esc(t)}</div>`;
  const head = (t, s = '') => `<div class="h"><h2>${esc(t)}</h2><small>${s}</small></div>`;
  const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400); };

  /* ── derived ── */
  const fx = () => (D && D.fx && D.fx.usdinr) || 84.5;
  const desk = (k) => (D && D.desks && D.desks[k] && D.desks[k].state === 'ok') ? D.desks[k] : null;
  const memeInr = (v) => v * ((desk('meme') || {}).sol_usd || 0) * fx();
  function books() {
    const out = []; const e = desk('eq'), o = desk('opt'), m = desk('meme');
    if (e) out.push({ k: 'eq', name: 'Equity', tag: 'EQ', eq: e.equity, start: e.start, pnl: e.pnl, pct: e.pnl_pct, today: e.today, d: e });
    if (o) out.push({ k: 'opt', name: 'Options', tag: 'OPT', eq: o.equity, start: o.start, pnl: o.pnl, pct: o.pnl_pct, today: o.today, d: o });
    if (m) out.push({ k: 'meme', name: 'Meme · SOL', tag: 'MEME', eq: memeInr(m.equity), start: memeInr(m.start), pnl: memeInr(m.pnl), pct: m.pnl_pct, today: memeInr(m.today), d: m, sol: m.equity });
    return out;
  }

  /* ── chart ── */
  function chart(cv, pts, opts = {}) {
    if (!cv || !pts || pts.length < 2) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const base = opts.base; let lo = Math.min(...ys, base ?? Infinity), hi = Math.max(...ys, base ?? -Infinity); if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const N = pts.length - 1; const X = (x, i) => i / (N || 1) * (w - 12) + 4, Y = (y) => h - 10 - (y - lo) / (hi - lo) * (h - 24);
    const up = ys[ys.length - 1] >= (base ?? ys[0]); const c1 = opts.c1 || (up ? '#34f5a4' : '#ff4d7a'), c2 = opts.c2 || (up ? '#7cf3ff' : '#ff3dcb'); const col = hexRgb(c1);
    if (base != null) { g.setLineDash([3, 5]); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(base)); g.lineTo(w, Y(base)); g.stroke(); g.setLineDash([]); }
    const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0], i), Y(p[1])) : g.moveTo(X(p[0], i), Y(p[1]))); };
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, `rgba(${col},.42)`); grd.addColorStop(.6, `rgba(${hexRgb(c2)},.10)`); grd.addColorStop(1, `rgba(${col},0)`);
    path(); g.lineTo(X(0, N), h); g.lineTo(X(0, 0), h); g.closePath(); g.fillStyle = grd; g.fill();
    const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, c2); lg.addColorStop(1, c1); path(); g.strokeStyle = lg; g.lineWidth = opts.lw || 2.4; g.lineJoin = 'round'; g.lineCap = 'round'; g.shadowColor = `rgba(${col},.7)`; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
    const lx = X(0, N), ly = Y(ys[ys.length - 1]); g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(lx, ly, 3.5, 0, 7); g.fill();
    g.strokeStyle = `rgba(${col},.35)`; g.beginPath(); g.arc(lx, ly, 8, 0, 7); g.stroke();
    if (opts.spark) { cv.classList.add('drawn'); return; }
    const snap = g.getImageData(0, 0, cv.width, cv.height);
    // scrub
    const lab = opts.scrub; let lastI = -1;
    const move = (ev) => { const r = cv.getBoundingClientRect(); const x = (ev.clientX - r.left); let i = 0, best = 1e9;
      pts.forEach((p, j) => { const d = Math.abs(X(p[0], j) - x); if (d < best) { best = d; i = j; } });
      g.putImageData(snap, 0, 0); const px_ = X(pts[i][0], i), py = Y(pts[i][1]);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px_, 0); g.lineTo(px_, h); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(px_, py, 4, 0, 7); g.fill();
      if (lab) { lab.innerHTML = `<b class="num">${esc(opts.fmt ? opts.fmt(pts[i][1]) : nf(pts[i][1]))}</b><br>${esc(ist(pts[i][0], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }))} IST`; lab.classList.add('on'); }
      if (i !== lastI && i % 8 === 0) H('light'); lastI = i; };
    const end = () => { g.putImageData(snap, 0, 0); lab && lab.classList.remove('on'); };
    cv.onpointerdown = (e) => { move(e); }; cv.onpointermove = (e) => { if (e.pointerType === 'mouse' || e.buttons) move(e); }; cv.onpointerleave = end; cv.onpointerup = () => setTimeout(end, 900);
  }

  const hexRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); };
  const ACC = { eq: ['#3d8bff', '#7cc4ff'], opt: ['#ff3dcb', '#ff9bf0'], meme: ['#b8ff3c', '#9b5cff'], gold: ['#ffc53d', '#ff8a3d'] };
  const SPC = { cricket: '#19e3c4', soccer: '#2ee66b', nba: '#ff8a1f', nfl: '#ff3b3b', nhl: '#8fe3ff', tennis: '#ffe23d', f1: '#e10600', ncaaf: '#ff6b3d', ncaab: '#ff9f43', mma: '#ff2e63', golf: '#7bd88f', mlb: '#4fa3ff' };
  const spc = (k) => SPC[k] ? 'sp-' + k : 'sp-other';
  function confetti() { const cv = $('#confetti'); if (!cv || matchMedia('(prefers-reduced-motion:reduce)').matches) return; const dpr = devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#34f5a4', '#7cf3ff', '#8b7bff', '#ff6ad5', '#ffc53d', '#b8ff3c']; const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: 170, vx: (Math.random() - .5) * 11, vy: -Math.random() * 12 - 4, s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[(Math.random() * cols.length) | 0] }));
    let f = 0; const step = () => { g.clearRect(0, 0, innerWidth, innerHeight); P.forEach(p => { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - f / 140); g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }); if (++f < 150) requestAnimationFrame(step); else g.clearRect(0, 0, innerWidth, innerHeight); }; requestAnimationFrame(step); H('success'); }
  let celebrated = false;

  /* ── count-up ── */
  function countUp(el, to, fmt, ms = 900) {
    const from = +(el.dataset.v || 0); el.dataset.v = to; const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ════════ VIEWS ════════ */
  const V = {};

  V.home = () => {
    const B = books(); const net = B.reduce((a, b) => a + b.eq, 0), start = B.reduce((a, b) => a + b.start, 0);
    const today = B.reduce((a, b) => a + (b.today || 0), 0), pnl = net - start, ppct = start ? pnl / start * 100 : 0;
    const lm = D.live_money || {};
    const maxPct = Math.max(5, ...B.map(b => Math.abs(b.pct || 0)));
    let cells = B.map((b, i) => `<a class="cell tap h2 w2 book-tile acc-${b.k}" data-jump="desks:${b.k}" data-css="${css({ background: `linear-gradient(150deg,${ACC[b.k][0]}55,${tint(b.pct, maxPct)} 55%,rgba(255,255,255,.02))`, 'animation-delay': i * 60 + 'ms' })}"><b>${b.tag}</b><span class="${cls(b.pct)}">${pct(b.pct)}<br><small class="muted">${inrS(b.pnl)}</small></span><i class="bar2"></i></a>`);
    const und = [].concat(...['eq', 'opt'].map(k => (desk(k) || {}).per_underlying || [])).reduce((m, a) => { const x = m[a.u] || (m[a.u] = { u: a.u, pnl: 0, n: 0 }); x.pnl += a.pnl; x.n += a.n; return m; }, {});
    const U = Object.values(und).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 10); const mu = Math.max(1, ...U.map(u => Math.abs(u.pnl)));
    cells = cells.concat(U.map((u, i) => `<div class="cell ${i < 2 ? 'w2' : ''}" data-css="${css({ background: `linear-gradient(150deg,${tint(u.pnl, mu)},rgba(255,255,255,.02))`, 'animation-delay': (180 + i * 40) + 'ms' })}"><b>${esc(u.u)}</b><span class="${cls(u.pnl)}">${inrS(u.pnl)}</span></div>`));
    // daily strip
    const days = {}; B.forEach(b => (b.d.daily || []).forEach(x => { days[x.d] = (days[x.d] || 0) + (b.k === 'meme' ? memeInr(x.chg) : x.chg); }));
    const DK = Object.keys(days).sort().slice(-12); const md = Math.max(1, ...DK.map(k => Math.abs(days[k])));
    const strip = DK.map((k, i) => `<div><i class="${days[k] < 0 ? 'neg' : ''}" data-css="${css({ height: Math.max(3, Math.abs(days[k]) / md * 70) + 'px', opacity: days[k] ? 1 : .25, 'animation-delay': i * 40 + 'ms' })}"></i><span>${esc(k.slice(8))}</span></div>`).join('');
    const al = alerts();
    return `<div class="wide"><div>
      <section class="card glow hero acc-aur" id="hero">
        <span class="paper">PAPER</span>
        <div class="lbl">Net worth · all books</div>
        <div class="big num grad-aur" id="nw">${inr(net)}</div>
        <div class="chips">
          <span class="chip ${cls(Math.round(today))}">Today ${sInr(today)}</span>
          <span class="chip ${cls(pnl)}">All-time ${sInr(pnl)} · ${pct(ppct)}</span>
          <span class="chip gold">Live ₹${nf(lm.used_inr || 0)} / ₹${nf(lm.cap_inr || 2000)}</span>
        </div>
        <canvas class="spark" id="hspark"></canvas>
      </section>
      ${head('Heat', 'books + top names by P&L')}
      <div class="heat">${cells.join('') || '<div class="sk"></div>'}</div>
      ${head('Daily P&L', 'last ' + DK.length + ' days · INR')}
      <div class="card"><div class="days">${strip || empty('·', 'No history yet')}</div></div>
    </div><div>
      ${head('Alerts', al.length + ' now')}
      <div class="card alerts"><div class="list">${al.map(a => ext(a.href, `<i class="dot ${a.lvl}"></i><div class="t"><b>${esc(a.t)}</b><span>${esc(a.s || '')}</span></div>`, 'li tap' + (a.jump ? '" data-jump="' + a.jump : ''))).join('') || empty('✓', 'All quiet')}</div></div>
      ${head('Books')}
      <div class="booksx">${B.map(b => `<a class="card book tap acc-${b.k}" data-jump="desks:${b.k}"><span class="bt">${b.tag}</span><div><b>${b.name}</b><canvas data-spark="${b.k}"></canvas></div><div class="bv">${inrS(b.eq)}<small class="${cls(b.pct)}">${pct(b.pct)}</small></div></a>`).join('')}</div>
    </div></div>`;
  };
  V.home.after = (root) => { const B = books(); const el = $('#nw', root); if (el) { const v = B.reduce((a, b) => a + b.eq, 0); el.dataset.v = v * 0.96; countUp(el, v, (x) => inr(x)); }
    $$('canvas[data-spark]', root).forEach(cv => { const b = B.find(x => x.k === cv.dataset.spark); if (b) chart(cv, b.d.curve, { base: b.d.start, spark: 1, c1: ACC[b.k][0], c2: ACC[b.k][1], lw: 2 }); });
    const days = {}; B.forEach(b => (b.d.daily || []).forEach(x => { days[x.d] = (days[x.d] || 0) + (b.k === 'meme' ? memeInr(x.eq) : x.eq); }));
    const DK = Object.keys(days).sort(); const hs = $('#hspark', root); if (hs && DK.length > 1) chart(hs, DK.map((k, i) => [i, days[k]]), { spark: 1, c1: '#ff6ad5', c2: '#7cf3ff', lw: 2.6 });
    const today = B.reduce((a, b) => a + (b.today || 0), 0); if (today >= 1 && !celebrated) { celebrated = true; $('#hero', root).classList.add('celebrate'); setTimeout(confetti, 500); } };

  function alerts() {
    const A = [], m = D.markets || {}, f = D.fno || {}, n = D.news || {}, lm = D.live_money || {}, br = D.breakouts || {};
    const age = Date.now() / 1000 - (D.ts || 0);
    if (age > 900) A.push({ lvl: 'warm', t: 'Data is ' + ago(D.ts) + ' old', s: 'The box may be asleep. It publishes again when it wakes.' });
    const open = m.session && m.session.open;
    ['eq', 'opt'].forEach(k => { const d = desk(k); if (open && d && !d.running) A.push({ lvl: 'hot', t: (k === 'eq' ? 'Equity' : 'Options') + ' desk is not running', s: 'Market is open', jump: 'desks:' + k }); });
    const vix = m.indices && m.indices.VIX; if (vix && Math.abs(vix.change_pct) >= 5) A.push({ lvl: 'warm', t: 'India VIX ' + pct(vix.change_pct), s: 'at ' + nf(vix.ltp, 2), jump: 'pulse:markets' });
    if (f.preferred_expiry) { const dd = (Date.parse(f.preferred_expiry.replace(/-/g, ' ')) - Date.now()) / 864e5; if (dd > -1 && dd < 2) A.push({ lvl: 'warm', t: 'Nifty expiry ' + f.preferred_expiry, s: 'Max pain ' + nf(f.chain && f.chain.max_pain) + ' · PCR ' + ((f.chain && f.chain.pcr_oi) || 0).toFixed(2), jump: 'pulse:fno' }); }
    if ((br.breakouts || []).length) A.push({ lvl: 'cool', t: br.breakouts.length + ' breakouts in the Nifty 200', s: br.breakouts.slice(0, 4).map(b => b.symbol).join(' · '), jump: 'pulse:breakouts' });
    const mm = desk('meme'); if (mm && (mm.positions || []).length) A.push({ lvl: 'cool', t: 'Meme desk holds ' + mm.positions.map(p => p.symbol).join(', '), s: 'open paper position', jump: 'desks:meme' });
    (n.flagged || []).slice(0, 3).forEach(x => A.push({ lvl: 'warm', t: x.title, s: x.source + ' · ' + ago(x.ts) + ' ago', href: x.link }));
    A.push({ lvl: lm.armed ? 'hot' : 'ok', t: lm.armed ? 'LIVE MONEY ARMED' : 'Live Money disarmed', s: lm.armed ? 'real orders possible' : 'no real order can leave the box', jump: 'money' });
    return A;
  }

  V.desks = () => {
    const k = sub.desks, d = desk(k); const seg = segHtml('desks', [['eq', 'Equity'], ['opt', 'Options'], ['meme', 'Meme']]);
    if (!d) return seg + `<div class="card">${empty('○', 'This desk has not reported yet.')}</div>`;
    const meme = k === 'meme', f = meme ? (v) => nf(v, 3) + ' SOL' : (v) => inr(v), fS = meme ? (v) => (v > 0 ? '+' : '') + nf(v, 3) + ' SOL' : sInr;
    const m = d.metrics || {}; const ex = d.exits || {}; const exMax = Math.max(1, ...Object.values(ex).map(x => Math.abs(x.pnl)));
    const hb = Object.entries(d.heartbeat || {}).map(([n, h]) => { const a = Date.now() / 1000 - (h.ts || 0); const c = a < 180 ? 'var(--up)' : a < 3600 ? 'var(--amber)' : 'var(--dim)';
      return `<div class="agent"><i data-css="${css({ background: c })}"></i><b>${esc(n)}</b><em>${esc(h.status || '')}</em></div>`; }).join('');
    const tr = (t) => `<div class="li"><span class="side ${t.side === 'SHORT' ? 'S' : 'L'}">${t.side === 'SHORT' ? 'S' : 'L'}</span><div class="t"><b>${esc(t.symbol)}</b><span>${ist(t.entry_ts, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}${t.exit_ts ? ' → ' + ist(t.exit_ts) : ''} · ${esc((t.exit_kind || t.status || '').replace(/_/g, ' '))}</span></div><div class="v ${cls(t.pnl)}">${meme ? fS(t.pnl) : sInr(t.pnl)}<small class="${cls(t.pnl_pct)}">${pct(t.pnl_pct, 1)}</small></div></div>`;
    return seg + `<div class="wide"><div>
      <section class="card glow acc-${k}" id="dcard">
        <span class="paper">${esc(d.mode || 'PAPER')}</span>
        <div class="lbl">${k === 'eq' ? 'Equity book · NSE' : k === 'opt' ? 'Options book · NSE F&O' : 'Meme book · Solana'}</div>
        <div class="big num grad">${f(d.equity)}</div>
        <div class="row"><span class="chip ${cls(d.pnl)}">${fS(d.pnl)} · ${pct(d.pnl_pct)}</span><span class="chip ${cls(meme ? d.today : Math.round(d.today))}">Today ${fS(d.today)}</span>${meme ? `<span class="chip">${inrS(memeInr(d.equity))}</span>` : ''}</div>
        <div class="chartw"><div class="scrub" id="scrub"></div><canvas class="chart" id="cv"></canvas></div>
      </section>
      <div class="kv acc-${k}">
        <div><span class="lbl">Win rate</span><b>${nf(m.win_rate, 1)}%</b></div>
        <div><span class="lbl">Profit f.</span><b class="${(m.profit_factor || 0) >= 1 ? 'up' : 'down'}">${m.profit_factor == null ? '—' : (+m.profit_factor).toFixed(2)}</b></div>
        <div><span class="lbl">Max DD</span><b class="down">${pct(m.max_dd_pct, 1)}</b></div>
        <div><span class="lbl">Trades</span><b>${nf(m.trades)}</b></div>
        <div><span class="lbl">Expect.</span><b class="${cls(m.expectancy)}">${meme ? nf(m.expectancy, 3) : inrS(m.expectancy)}</b></div>
        <div><span class="lbl">Charges</span><b>${meme ? nf(m.charges, 3) : inrS(m.charges)}</b></div>
      </div>
      ${Object.keys(ex).length ? head('Exits', 'P&L by exit reason') + `<div class="card">${Object.entries(ex).sort((a, b) => b[1].pnl - a[1].pnl).map(([r, x]) => `<div class="lb"><span class="rk">${x.n}</span><div><b class="muted">${esc(r.replace(/_/g, ' ').toLowerCase())}</b><div class="bar ${x.pnl < 0 ? 'down' : ''}"><i data-css="${css({ width: (Math.abs(x.pnl) / exMax * 100).toFixed(1) + '%' })}"></i></div></div><span class="vol ${cls(x.pnl)}">${meme ? nf(x.pnl, 3) : inrS(x.pnl)}</span></div>`).join('')}</div>` : ''}
    </div><div>
      ${head('Agents', d.running ? 'running' : 'idle')}
      <div class="agents">${hb || empty('○', 'No heartbeat')}</div>
      ${head('Open', (d.positions || []).length + ' positions')}
      <div class="card"><div class="list">${(d.positions || []).map(p => `<div class="li"><span class="side L">${p.side === 'SHORT' ? 'S' : 'L'}</span><div class="t"><b>${esc(p.symbol)}</b><span>entry ${px(p.entry)} · last ${px(p.last)}</span></div><div class="v ${cls((p.last - p.entry) * (p.side === 'SHORT' ? -1 : 1))}">${pct((p.last / p.entry - 1) * 100 * (p.side === 'SHORT' ? -1 : 1), 1)}</div></div>`).join('') || empty('∅', 'Flat. No open positions.')}</div></div>
      ${head('Trades', 'latest ' + Math.min(25, (d.trades || []).length))}
      <div class="card"><div class="list">${(d.trades || []).slice(0, 25).map(tr).join('') || empty('∅', 'No trades yet')}</div></div>
    </div></div>`;
  };
  V.desks.after = (root) => { const d = desk(sub.desks); if (d) chart($('#cv', root), d.curve, { base: d.start, c1: ACC[sub.desks][0], c2: ACC[sub.desks][1], lw: 2.6, scrub: $('#scrub', root), fmt: sub.desks === 'meme' ? (v) => nf(v, 3) + ' SOL' : (v) => inr(v) }); };

  /* ── pulse ── */
  V.pulse = () => segHtml('pulse', [['markets', 'Markets'], ['fno', 'F&O'], ['breakouts', 'Breakouts'], ['crypto', 'Crypto'], ['news', 'News']]) + (P[sub.pulse] || P.markets)();
  V.pulse.after = (root) => { if (sub.pulse === 'crypto') paintCoins(); };
  const P = {};
  P.markets = () => {
    const m = D.markets || {}; const I = m.indices || {}; const s = m.session || {}; const b = m.breadth || {};
    const IDXC = { Nifty: 'acc-eq', BankNifty: 'acc-opt', FinNifty: 'sp-cricket', VIX: 'acc-gold' }; const idx = ['Nifty', 'BankNifty', 'FinNifty', 'VIX'].filter(k => I[k]).map(k => { const x = I[k]; const p = x.high > x.low ? (x.ltp - x.low) / (x.high - x.low) * 100 : 50;
      return `<div class="card idx tap ${IDXC[k]}"><div class="lbl">${esc(x.name)}</div><div class="mid num grad">${nf(x.ltp, 2)}</div><div class="row"><span class="chip ${cls(x.change)}">${pct(x.change_pct)}</span><span class="num muted">${x.change > 0 ? '+' : ''}${nf(x.change, 2)}</span></div>
      <div class="range"><i data-css="${css({ left: p.toFixed(1) + '%' })}"></i></div><div class="range-l"><span>${nf(x.low, 0)}</span><span>day</span><span>${nf(x.high, 0)}</span></div></div>`; }).join('');
    const tot = (b.advances || 0) + (b.declines || 0) + (b.unchanged || 0) || 1;
    const L = ((m.movers || {}).lists || {}); const pick = L.NIFTY || L.allSec || {}; const mv = (arr, up) => (arr || []).slice(0, 6).map(x => `<div class="li"><div class="t"><b>${esc(x.symbol)}</b><span>vol ${esc(x.volume || '')}</span></div><div class="v">${nf(x.ltp, 2)}<small class="${up ? 'up' : 'down'}">${pct(x.change_pct)}</small></div></div>`).join('');
    const rc = m.recap || {};
    return `<div class="row"><span class="chip ${s.open ? 'up' : ''}">${s.open ? '● Market open' : '○ Closed · ' + esc(s.reason || '')}</span><span class="sp"></span><small class="muted num">last ${esc(s.last_session || '')}</small></div>
      ${rc.headline ? `<div class="card" data-css="${css({ 'margin-top': '10px' })}"><div class="lbl">Session recap</div><div data-css="${css({ font: '600 15px/1.35 var(--sans)', 'margin-top': '6px' })}">${esc(rc.headline)}</div><div class="note" data-css="${css({ 'margin-top': '4px' })}">${esc(rc.summary || '')}</div></div>` : ''}
      ${head('Indices', m.ist ? 'as of ' + esc(m.ist.slice(11, 16)) + ' IST' : '')}<div class="grid g2">${idx || '<div class="sk" data-css="height:120px"></div>'}</div>
      ${head('Breadth', nf(b.advances) + ' up · ' + nf(b.declines) + ' down')}<div class="card"><div class="breadth"><i data-css="${css({ width: (b.advances / tot * 100) + '%', background: 'var(--up)' })}"></i><i data-css="${css({ width: (b.unchanged / tot * 100) + '%', background: 'var(--dim)' })}"></i><i data-css="${css({ width: (b.declines / tot * 100) + '%', background: 'var(--down)' })}"></i></div></div>
      ${head('Top gainers', 'Nifty 50')}<div class="card"><div class="list">${mv(pick.gainers, 1) || empty('·', '—')}</div></div>${head('Top losers', 'Nifty 50')}<div class="card"><div class="list">${mv(pick.losers, 0) || empty('·', '—')}</div></div>
      ${m.errors && m.errors.sensex ? `<p class="note">Sensex unavailable: BSE's free feed blocks the box.</p>` : ''}`;
  };
  P.fno = () => {
    const f = D.fno || {}, c = f.chain || {}; const rows = c.rows || [];
    if (!rows.length) return `<div class="card">${empty('∅', 'Option chain not available yet')}</div>`;
    const mx = Math.max(1, ...rows.map(r => Math.max(r.ce_oi || 0, r.pe_oi || 0)));
    const near = rows.filter(r => Math.abs(r.strike - c.atm) <= 1000);
    return `<div class="chips-x">${(f.expiries || []).slice(0, 6).map(e => `<span class="chip ${e === f.preferred_expiry ? 'up' : ''}">${esc(e)}</span>`).join('')}</div>
      <div class="grid g3" data-css="${css({ 'margin-top': '10px' })}">
        <div class="card acc-eq"><div class="lbl">Spot</div><div class="mid num">${nf(c.spot, 0)}</div></div>
        <div class="card acc-gold"><div class="lbl">Max pain</div><div class="mid num" data-css="color:var(--amber)">${nf(c.max_pain)}</div></div>
        <div class="card acc-opt"><div class="lbl">PCR · OI</div><div class="mid num ${(c.pcr_oi || 0) >= 1 ? 'up' : 'down'}">${(c.pcr_oi || 0).toFixed(2)}</div></div>
      </div>
      ${head('Open interest', esc(f.symbol || 'NIFTY') + ' · ' + esc(c.expiry || ''))}
      <div class="card acc-aur"><div class="oi-head"><span>CALLS</span><span>STRIKE</span><span>PUTS</span></div>
      <div class="oi">${near.map((r, i) => `<i class="ce" data-css="${css({ width: ((r.ce_oi || 0) / mx * 100).toFixed(1) + '%', 'animation-delay': i * 15 + 'ms' })}"></i><span class="k ${r.strike === c.atm ? 'atm' : r.strike === c.max_pain ? 'mp' : ''}">${nf(r.strike)}</span><i class="pe" data-css="${css({ width: ((r.pe_oi || 0) / mx * 100).toFixed(1) + '%', 'animation-delay': i * 15 + 'ms' })}"></i>`).join('')}</div>
      <p class="note" data-css="margin:12px 0 0">Blue = ATM · amber = max pain. ${esc(f.note || '')}</p></div>
      <div class="grid g2">
        <div><div class="h"><h2>Call wall</h2></div><div class="card"><div class="list">${(c.top_ce_oi || []).map(x => `<div class="li"><div class="t"><b>${nf(x.strike)} CE</b><span>chg ${nf(x.oi_chg)}</span></div><div class="v">${nf(x.oi)}</div></div>`).join('')}</div></div></div>
        <div><div class="h"><h2>Put wall</h2></div><div class="card"><div class="list">${(c.top_pe_oi || []).map(x => `<div class="li"><div class="t"><b>${nf(x.strike)} PE</b><span>chg ${nf(x.oi_chg)}</span></div><div class="v">${nf(x.oi)}</div></div>`).join('')}</div></div></div>
      </div>`;
  };
  P.breakouts = () => {
    const b = D.breakouts || {}; const L = b.breakouts || [], N = b.near || []; const mx = Math.max(1, ...L.map(x => x.volume_multiple || 0));
    return `<div class="card acc-meme"><div class="lbl">Rule</div><div class="note" data-css="margin-top:4px">${esc(b.rule || '')}</div><div class="row" data-css="margin-top:10px"><span class="chip up">${L.length} breakouts</span><span class="chip">${N.length} near</span><span class="sp"></span><small class="muted num">session ${esc(b.session_date || '')}</small></div></div>
      ${head('Breakouts', 'volume × 20-day avg')}
      <div class="card acc-meme"><div class="list">${L.map(x => `<div class="lb"><span class="rk">↗</span><div><b>${esc(x.symbol)}</b> <small class="muted num">₹${nf(x.close, 2)} · ${pct(x.pct_from_level, 1)} over ${nf(x.level, 1)}</small><div class="bar"><i data-css="${css({ width: (x.volume_multiple / mx * 100).toFixed(1) + '%' })}"></i></div></div><span class="vol up">${(x.volume_multiple || 0).toFixed(1)}×</span></div>`).join('') || empty('∅', 'No breakouts this session')}</div></div>
      ${head('Knocking', 'within 1% of the high')}
      <div class="card"><div class="list">${N.slice(0, 15).map(x => `<div class="li"><div class="t"><b>${esc(x.symbol)}</b><span>level ${nf(x.level, 1)} · vol ${(x.volume_multiple || 0).toFixed(2)}×</span></div><div class="v">₹${nf(x.close, 2)}<small class="flat">${pct(x.pct_from_level, 2)}</small></div></div>`).join('') || empty('∅', 'None')}</div></div>`;
  };
  P.crypto = () => {
    const c = D.crypto || {}; const p = c.prices || {};
    const coins = ['BTC', 'ETH', 'SOL'].map(s => { const x = Live.px[s] || p[s] || {}; return `<div class="card coin ${({ BTC: 'acc-gold', ETH: 'acc-eq', SOL: 'acc-meme' })[s]}" id="coin-${s}"><span class="cs">${s}</span><div class="cm"><div class="mid num grad" data-f="px">$${nf(x.price, s === 'BTC' ? 0 : 2)}</div><div class="num muted" data-f="inr">${inrS((x.price || 0) * fx())}</div></div><span class="chip num ${cls(x.change_pct)}" data-f="chg">${pct(x.change_pct)}</span></div>`; }).join('');
    const prints = (c.large_prints || []).slice(0, 10).map(t => `<div class="li"><span class="side ${t.side === 'sell' ? 'S' : 'L'}">${t.side === 'sell' ? 'SELL' : 'BUY'}</span><div class="t"><b>${nf(t.qty, 2)} ${esc(t.asset)}</b><span>@ $${nf(t.price, 2)} · ${ago(t.ts / (t.ts > 1e12 ? 1000 : 1))} ago</span></div><div class="v">${usd(t.usd)}</div></div>`).join('');
    const tx = (c.transfers || []).slice(0, 10).map(t => `<div class="li"><span class="side">⛓</span><div class="t"><b>${nf(t.qty, 2)} ${esc(t.asset)}</b><span>${esc(t.chain)} · ${esc((t.txid || '').slice(0, 10))}…</span></div><div class="v">${usd(t.usd)}</div></div>`).join('');
    const hl = (c.hl_watch && c.hl_watch.wallets) || [];
    return `<div class="grid coins">${coins}</div><p class="note">Prices stream live from Binance's public feed in your browser · INR at ${fx().toFixed(2)}</p>
      ${head('Whale prints', 'Binance, largest recent')}<div class="card"><div class="list">${prints || empty('∅', 'No large prints right now')}</div></div>
      ${head('On-chain', 'big transfers')}<div class="card"><div class="list">${tx || empty('∅', 'Quiet on-chain')}</div></div>
      ${hl.length ? head('Hyperliquid watch', hl.length + ' wallets') + `<div class="card"><div class="list">${hl.slice(0, 8).map(w => `<div class="li"><div class="t"><b>${esc(w.label || w.name || (w.address || '').slice(0, 10) + '…')}</b><span>${esc(w.note || w.coin || '')}</span></div><div class="v">${w.value != null ? usd(w.value) : ''}</div></div>`).join('')}</div></div>` : ''}`;
  };
  function paintCoins() { ['BTC', 'ETH', 'SOL'].forEach(s => { const el = $('#coin-' + s); const x = Live.px[s]; if (!el || !x) return;
    $('[data-f=px]', el).textContent = '$' + nf(x.price, s === 'BTC' ? 0 : 2); const ch = $('[data-f=chg]', el); ch.textContent = pct(x.change_pct); ch.className = 'chip num ' + cls(x.change_pct);
    $('[data-f=inr]', el).textContent = inrS(x.price * fx());
    if (x.dir) { el.classList.remove('tick-up', 'tick-down'); void el.offsetWidth; el.classList.add(x.dir > 0 ? 'tick-up' : 'tick-down'); } }); }
  P.news = () => {
    const n = D.news || {}; const cats = ['all', 'flagged', ...new Set((n.items || []).map(i => i.cat).filter(Boolean))];
    const items = sub.news === 'flagged' ? (n.flagged || []) : (n.items || []).filter(i => sub.news === 'all' || i.cat === sub.news);
    return `<div class="chips-x">${cats.map(c => `<button class="chip ${c === sub.news ? 'on' : ''}" data-news="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="card" data-css="margin-top:10px"><div class="list">${items.slice(0, 60).map(i => ext(i.link, `<div class="t"><b data-css="white-space:normal">${esc(i.title)}</b><span>${esc(i.source)} · ${ago(i.ts)} ago${(i.flags || []).length ? ' · ⚑ ' + esc(i.flags.join(', ')) : ''}</span></div>`, 'li tap' + ((i.flags || []).length ? ' news-flag' : ''))).join('') || empty('∅', 'Nothing here')}</div></div>`;
  };

  /* ── sports ── */
  const SPORT_ORDER = ['cricket', 'soccer', 'nba', 'nfl', 'nhl', 'ncaaf', 'ncaab', 'tennis', 'mma', 'golf', 'f1', 'mlb'];
  const sportData = (s) => Live.sports[s] || (D.sports && D.sports.sports && D.sports.sports[s]) || null;
  V.sports = () => {
    const tabs = [['home', 'Most bet']].concat(SPORT_ORDER.map(s => [s, Live.LABEL[s], (sportData(s) || {}).live || 0]));
    return segHtml('sports', tabs) + (sub.sports === 'home' ? sportsHome() : sportBoard(sub.sports));
  };
  V.sports.after = () => { if (sub.sports !== 'home') Live.watch(sub.sports); else Live.unwatch(); };
  function sportsHome() {
    const h = D.sports_home || {}; const R = (h.sports_rank || []).slice(0, 8); const mx = Math.max(1, ...R.map(r => r.volume24hr || 0));
    const ev = (h.top_events || []).slice(0, 14);
    const evHtml = ev.map((e, i) => { const mk = (e.markets || [])[0] || {}; const outs = (mk.outcomes || []).slice(0, 4); const fav = Math.max(...outs.map(o => o.implied_pct || 0));
      return ext(e.url, `<div class="row"><span class="rk num" data-css="color:var(--acc)">#${i + 1}</span><span class="lbl">${esc(Live.LABEL[e.sport] || e.sport || '')}</span><span class="sp"></span>${(e.sources || [e.source || (String(e.id).startsWith('kalshi') ? 'Kalshi' : 'Polymarket')]).map(s => `<span class="src">${esc(String(s).toUpperCase())}</span>`).join(' ')}</div>
        <div data-css="font:600 16px/1.3 var(--sans);margin-top:8px">${esc(e.title)}</div>
        <div class="note num">${usd(e.volume24hr)} in 24h · ${usd(e.volume)} total${mk.question ? ' · ' + esc(mk.question) : ''}</div>
        <div class="odds">${outs.map(o => `<span class="odd ${o.implied_pct === fav ? 'fav' : ''}"><span class="row"><b>${esc(o.name)}</b><span class="sp"></span><span>${nf(o.implied_pct, 0)}%</span></span>${o.implied_pct === fav ? '' : `<i class="ob" data-css="${css({ width: Math.max(4, o.implied_pct || 0) + '%' })}"></i>`}</span>`).join('')}</div>`, 'card tap game ' + spc(e.sport)); }).join('');
    return `${head('Money flow', '24h · Polymarket + Kalshi')}
      <div class="card acc-aur">${R.map((r, i) => `<div class="lb tap ${spc(r.sport)}" data-sport="${esc(r.sport)}"><span class="rk">${i + 1}</span><div><b>${esc(r.label)}</b> <small class="muted">${r.n_events} events</small><div class="bar"><i data-css="${css({ width: (r.volume24hr / mx * 100).toFixed(1) + '%', 'animation-delay': i * 60 + 'ms' })}"></i></div></div><span class="vol">${usd(r.volume24hr)}</span></div>`).join('') || empty('∅', 'No volume data yet')}</div>
      ${head('Most-bet events', '% = implied odds')}${evHtml || `<div class="card">${empty('∅', 'No events')}</div>`}
      <p class="note">${esc(h.disclaimer || '')}</p>`;
  }
  function gameCard(g) {
    const live = g.state === 'in'; const cs = g.competitors || [];
    const teams = cs.slice(0, g.sport === 'golf' || g.sport === 'f1' ? 6 : 2).map((c, i) => { const key = g.id + ':' + i; const bumped = prevScore[key] != null && prevScore[key] !== c.score && c.score !== ''; prevScore[key] = c.score;
      const col = c.color ? '#' + String(c.color).replace('#', '') : ''; return `<div class="team ${c.winner ? 'win' : ''} ${String(c.score || '').length > 9 ? 'long' : ''}"><span class="ab ${c.logo ? 'has-img' : ''}" ${col ? `data-css="${css({ '--tc': col })}"` : ''}>${esc((c.abbr || c.name || '?').slice(0, 4))}${c.logo && /^https:\/\/a\.espncdn\.com\//.test(c.logo) ? `<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(c.logo)}">` : ''}</span><span class="nm">${esc(c.name)}</span><span class="sc num ${bumped ? 'bump' : ''}">${esc(c.score || (g.state === 'pre' ? '' : '0'))}</span></div>`; }).join('');
    const when = g.state === 'pre' && g.start ? ist(g.start, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST' : '';
    return ext(g.link, `<div class="lg">${live ? '<span class="live-badge">LIVE</span>' : g.state === 'post' ? '<span class="src">FINAL</span>' : '<span class="src">' + esc(when || 'SOON') + '</span>'}<span>${esc(g.league || '')}</span></div>${teams}<div class="det">${esc([g.clock && live && !String(g.detail).includes(g.clock) ? g.clock : '', g.detail].filter(Boolean).join(' · '))}</div>`, 'card tap game ' + spc(g.sport) + (live ? ' live' : ''));
  }
  function sportBoard(s) {
    const d = sportData(s); if (!d) return `<div class="card"><div class="sk" data-css="height:90px"></div></div><div class="card"><div class="sk" data-css="height:90px"></div></div>`;
    const G = d.games || []; const live = G.filter(g => g.state === 'in'), pre = G.filter(g => g.state === 'pre').slice(0, 12), post = G.filter(g => g.state === 'post').slice(0, 8);
    return `${head(d.label || Live.LABEL[s], (Live.sports[s] ? 'live · ' + ago(Live.sports[s].ts / 1000) + ' ago' : 'via box · ' + ago(D.sports && D.sports.ts) + ' ago'))}
      ${live.length ? `<div class="grid" data-sec="live">${live.map(gameCard).join('')}</div>` : `<div class="card">${empty('○', 'Nothing live right now')}</div>`}
      ${pre.length ? head('Up next') + `<div class="grid">${pre.map(gameCard).join('')}</div>` : ''}
      ${post.length ? head('Final') + `<div class="grid">${post.map(gameCard).join('')}</div>` : ''}`;
  }

  /* ── money ── */
  V.money = () => {
    const L = D.live_money || {}; const cap = L.cap_inr || 2000, used = L.used_inr || 0; const frac = Math.min(1, used / cap);
    const armed = !!L.armed; const arc = 282.7;
    return `<section class="card glow acc-gold">
        <div class="reactor"><div class="gauge"><svg viewBox="0 0 220 124"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#ffc53d"/><stop offset=".6" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff3dcb"/></linearGradient></defs><path class="trk" d="M20 112a90 90 0 0 1 180 0"/><path class="val" id="gval" d="M20 112a90 90 0 0 1 180 0" data-css="${css({ 'stroke-dasharray': arc, 'stroke-dashoffset': arc, stroke: 'url(#gg)' })}" data-off="${(arc * (1 - frac)).toFixed(1)}"/></svg>
          <div class="ctr"><div class="lbl">Capital at risk</div><div class="mid num grad">${inr(used)} <span class="muted">/ ${inr(cap)}</span></div></div></div>
          <div class="state ${armed ? 'armed' : 'off'}">${armed ? 'ARMED' : 'DISARMED'}</div>
          <div class="note">${armed ? 'Real orders can be placed from the box.' : 'No real order can leave the box.'}</div></div>
        <div class="hazard"></div>
        <div class="grid g2" data-css="margin-top:14px">
          <div><div class="lbl">Hard cap</div><div class="mid num grad">${inr(cap)}</div></div>
          <div><div class="lbl">Max loss / trade</div><div class="mid num grad">${inr(L.per_trade_max_loss_inr)}</div></div>
        </div>
      </section>
      ${head('Kill switch', L.kill_switch ? 'ON' : 'off')}
      <div class="card acc-opt"><div class="row"><div class="sp"><b>${L.kill_switch ? 'Kill switch is ON' : 'Kill switch is off'}</b><div class="note">Flipping it stops all live trading and disarms. It runs on the box, so tell Chief "kill live money".</div></div><span class="switch ${L.kill_switch ? 'on' : ''}"><i></i></span></div></div>
      ${head('Gates', 'all must be green')}
      <div class="card acc-gold">${(L.gates || []).map(g => `<div class="gate-li"><span class="ck ${g.ok ? 'y' : 'n'}">${g.ok ? '✓' : '✕'}</span><span>${esc(g.gate)}</span></div>`).join('') || empty('?', 'Status unavailable')}</div>
      ${head('Brokers')}
      <div class="card"><div class="list">${(L.brokers || []).map(b => `<div class="li broker ${b.name === 'zerodha' ? 'acc-eq' : 'sp-cricket'}"><span class="logo">${esc(b.name === 'zerodha' ? 'Z' : b.name === 'groww' ? 'G' : b.name[0].toUpperCase())}</span><div class="t"><b>${esc(b.title)}</b><span>${esc(b.state)}</span></div><span class="ck ${b.connected ? 'y' : 'n'}">${b.connected ? '✓' : '✕'}</span></div>`).join('')}</div>
        <p class="note">To connect, sign in to the broker through Chief on the box. Keys stay on the box, never here.</p></div>
      ${head('Ledger', (L.ledger || []).length + ' events')}
      <div class="card"><div class="list">${(L.ledger || []).slice().reverse().map(e => `<div class="li"><div class="t"><b>${esc(e.kind)}</b><span>${esc(e.ist || '')} ${esc((e.reasons || []).join('; '))}</span></div></div>`).join('') || empty('∅', 'No live orders. Nothing real has ever left the box.')}</div></div>
      <p class="note">This screen is read-only by design. Orders run only from the box through <code>live_money.py</code>, behind every gate above.</p>`;
  };
  V.money.after = (root) => { const g = $('#gval', root); if (g) requestAnimationFrame(() => requestAnimationFrame(() => g.style.setProperty('stroke-dashoffset', g.dataset.off))); };

  function imgs(root) { $$('img', root).forEach(i => { const off = () => { const ab = i.parentElement; i.remove(); ab && ab.classList.remove('has-img'); }; if (i.complete && !i.naturalWidth) off(); else i.addEventListener('error', off, { once: true }); }); }

  /* ── segmented control ── */
  const SEGC = { eq: ACC.eq, opt: ACC.opt, meme: ACC.meme, markets: ACC.eq, fno: ACC.opt, breakouts: ['#b8ff3c', '#34f5a4'], crypto: ['#9b5cff', '#ffc53d'], news: ['#19e3c4', '#7cf3ff'], home: ['#ff6ad5', '#8b7bff'] };
  function segHtml(key, items) { const on = sub[key]; const c = SEGC[on] || (SPC[on] ? [SPC[on], SPC[on]] : ['#8b7bff', '#ff6ad5']);
    return `<div class="seg" data-seg="${key}" data-css="${css({ '--sa': c[0], '--sb': c[1] })}"><i class="seg-pill"></i>${items.map(([k, t, b]) => `<button data-sub="${k}" class="${sub[key] === k ? 'on' : ''} ${key === 'sports' && k !== 'home' ? spc(k) : ''}">${key === 'sports' && k !== 'home' ? '<i class="sd"></i>' : ''}${esc(t)}${b ? `<span class="badge">${b}</span>` : ''}</button>`).join('')}</div><div data-css="height:12px"></div>`; }
  function placeSeg(root, animate = true) { $$('.seg', root).forEach(s => { const on = $('button.on', s), pill = $('.seg-pill', s); if (!on || !pill) return; if (!animate) pill.style.setProperty('transition', 'none');
    pill.style.setProperty('width', on.offsetWidth + 'px'); pill.style.setProperty('transform', `translateX(${on.offsetLeft}px)`); if (!animate) requestAnimationFrame(() => pill.style.removeProperty('transition'));
    if (on.offsetLeft + on.offsetWidth > s.scrollLeft + s.clientWidth || on.offsetLeft < s.scrollLeft) s.scrollTo({ left: on.offsetLeft - 20, behavior: animate ? 'smooth' : 'auto' }); }); }

  /* ── render ── */
  function render(opts = {}) {
    if (!D) return; const main = $('#view'); const y = window.scrollY;
    main.innerHTML = `<div class="view${opts.quiet ? '' : ''}">${V[section]()}</div>`; if (opts.quiet) main.firstChild.style.setProperty('animation', 'none');
    applyCss(main); imgs(main); placeSeg(main, false); V[section].after && V[section].after(main);
    if (opts.keepScroll) window.scrollTo(0, y); placeDock(); tape();
  }
  function go(s, sb) { if (sb) { if (s === 'desks') sub.desks = sb; if (s === 'pulse') sub.pulse = sb; } if (section !== s || sb) { section = s; H('light'); window.scrollTo({ top: 0 }); render(); } }
  function placeDock() { const btns = $$('#dock button'); const i = btns.findIndex(b => b.dataset.go === section); btns.forEach((b, j) => b.classList.toggle('on', j === i)); const b = btns[i], pill = $('#pill'); const DC = { home: ['#7cf3ff', '#ff6ad5'], desks: ['#3d8bff', '#7cc4ff'], pulse: ['#19e3c4', '#8b7bff'], sports: ['#ff8a1f', '#ffc53d'], money: ['#ffc53d', '#ff8a3d'] }[section]; pill.style.setProperty('--pa', DC[0]); pill.style.setProperty('--pb', DC[1]);
    if (!b) return; const vertical = matchMedia('(min-width:900px)').matches;
    if (vertical) { pill.style.setProperty('height', b.offsetHeight + 'px'); pill.style.setProperty('transform', `translateY(${b.offsetTop - 8}px)`); }
    else { pill.style.setProperty('width', b.offsetWidth + 'px'); pill.style.removeProperty('height'); pill.style.setProperty('transform', `translateX(${b.offsetLeft - 7}px)`); } }

  /* ── ticker tape ── */
  function tape() {
    if (!D) return; const I = (D.markets || {}).indices || {}, p = (D.crypto || {}).prices || {}; const items = [];
    [['Nifty', 'NIFTY'], ['BankNifty', 'BANKNIFTY'], ['FinNifty', 'FINNIFTY'], ['VIX', 'VIX']].forEach(([k, n]) => { const x = I[k]; if (x) items.push(`<span class="tk"><b>${n}</b><span class="num">${nf(x.ltp, 2)}</span><span class="num ${cls(x.change_pct)}">${x.change_pct >= 0 ? '▲' : '▼'} ${pct(x.change_pct)}</span></span>`); });
    ['BTC', 'ETH', 'SOL'].forEach(s => { const x = Live.px[s] || p[s]; if (x) items.push(`<span class="tk" data-c="${s}"><b>${s}</b><span class="num">$${nf(x.price, s === 'BTC' ? 0 : 2)}</span><span class="num ${cls(x.change_pct)}">${pct(x.change_pct)}</span></span>`); });
    const B = books(); const net = B.reduce((a, b) => a + b.eq, 0), today = B.reduce((a, b) => a + (b.today || 0), 0);
    if (B.length) items.splice(0, 0, `<span class="tk"><b>BOOKS</b><span class="num">${inrS(net)}</span><span class="num ${cls(today)}">${sInr(today)}</span></span>`);
    const games = [].concat(...['cricket', 'nba', 'soccer', 'nhl', 'nfl'].map(s => ((sportData(s) || {}).games || []).filter(g => g.state === 'in').slice(0, 3)));
    games.slice(0, 8).forEach(g => items.push(`<span class="tk"><i class="lv"></i><b>${esc((g.competitors || []).map(c => c.abbr || c.name).join(' v '))}</b><span class="num">${esc((g.competitors || []).map(c => c.score).join(' · '))}</span></span>`));
    const track = $('#tape'); const html = items.join(''); if (track.dataset.h === html) return; track.dataset.h = html; track.innerHTML = html + html;
    track.style.setProperty('animation-duration', Math.max(30, items.length * 6) + 's');
  }

  /* ── data loop ── */
  async function poll() {
    clearTimeout(pollT); if (!Vault.unlocked) return;
    try { const d = await Vault.refresh(); if (d) { D = d; const fresh = section !== 'sports' || sub.sports === 'home'; if (fresh) render({ keepScroll: true, quiet: true }); else tape(); } }
    catch (e) { if (e.code === 'REKEY') { lock('Vault was re-keyed. Enter the new passphrase.'); return; } freshness(true); }
    pollT = setTimeout(poll, POLL_MS);
  }
  function freshness(err) { const b = $('#fresh'); if (!D) return; const a = Date.now() / 1000 - D.ts; b.classList.toggle('stale', a > 600 && a <= 3600); b.classList.toggle('dead', a > 3600 || !!err); $('span', b).textContent = 'sealed ' + ago(D.ts) + ' ago'; }

  /* ── idle lock ── */
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(ev => addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => { if (!Vault.unlocked) return; const idle = Date.now() - lastAct; const f = Math.min(1, idle / IDLE_MS);
    const c = $('.idle-ring circle'); c && c.style.setProperty('stroke-dashoffset', (100.5 * f).toFixed(1)); $('#lock').classList.toggle('warn', f > .8);
    freshness(); if (idle >= IDLE_MS) lock('Locked after 10 minutes idle.'); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Vault.unlocked && Date.now() - lastAct >= IDLE_MS) lock('Locked after 10 minutes idle.'); });

  function lock(msg) {
    Vault.lock(); Live.stop(); unsub && unsub(); celebrated = false; clearTimeout(pollT); D = null;
    $('#view').innerHTML = ''; $('#tape').innerHTML = ''; $('#tape').dataset.h = ''; for (const k in prevScore) delete prevScore[k];
    const app = $('#app'); app.classList.add('hidden'); app.classList.remove('reveal'); app.setAttribute('aria-hidden', 'true');
    const g = $('#gate'); g.classList.remove('hidden', 'leaving', 'working', 'bad'); $('#pass').value = ''; gateMsg(msg || ''); H('medium'); setupBio();
  }
  window.VANTA = Object.freeze({ lock: () => Vault.unlocked && lock('Locked.') });

  /* ── gate ── */
  const gateMsg = (t, err) => { const m = $('#gate-msg'); m.textContent = t; m.classList.toggle('err', !!err); };
  async function unlock(pass, viaBio) {
    const g = $('#gate'), btn = $('#go'); if (!pass) { gateMsg('Enter your passphrase', true); H('error'); g.querySelector('form').classList.add('shake'); setTimeout(() => g.querySelector('form').classList.remove('shake'), 450); return; }
    btn.disabled = true; g.classList.add('working'); g.classList.remove('bad'); gateMsg('fetching vault · deriving key (600k rounds)…'); H('light');
    try {
      const d = await Vault.unlock(pass);
      if (!viaBio && NATIVE && NATIVE.bioAvailable && NATIVE.bioAvailable() && !NATIVE.bioEnrolled() && $('#remember') && $('#remember').checked) { try { NATIVE.bioEnroll(pass); } catch (e) {} }
      pass = null; $('#pass').value = ''; D = d; lastAct = Date.now(); H('success'); gateMsg('');
      g.classList.add('leaving'); const app = $('#app'); app.classList.remove('hidden'); app.classList.add('reveal'); app.addEventListener('animationend', function rv(e) { if (e.target === app) { app.classList.remove('reveal'); app.removeEventListener('animationend', rv); } }); app.setAttribute('aria-hidden', 'false');
      setTimeout(() => g.classList.add('hidden'), 700);
      section = 'home'; render(); Live.start(); unsub = Live.sub(onLive); pollT = setTimeout(poll, POLL_MS);
    } catch (e) {
      g.classList.add('bad'); H('error'); const f = g.querySelector('form'); f.classList.add('shake'); setTimeout(() => f.classList.remove('shake'), 450);
      gateMsg(e.code === 'BAD' ? 'That passphrase does not open this vault.' : (e.message || 'Could not reach the vault'), true);
      if (viaBio && e.code === 'BAD' && NATIVE && NATIVE.bioForget) NATIVE.bioForget();
    } finally { btn.disabled = false; g.classList.remove('working'); }
  }
  function onLive(type, x) {
    if (!D) return;
    if (type === 'px') { if (section === 'pulse' && sub.pulse === 'crypto') paintCoins(); const tk = $$(`#tape [data-c="${x.sym}"]`); tk.forEach(t => { const n = t.children[1]; n.textContent = '$' + nf(x.d.price, x.sym === 'BTC' ? 0 : 2); if (x.d.dir) { t.classList.remove('flash-up', 'flash-down'); void t.offsetWidth; t.classList.add(x.d.dir > 0 ? 'flash-up' : 'flash-down'); } }); }
    if (type === 'sport') { if (section === 'sports' && sub.sports === x.sport) { const y = scrollY; const main = $('#view'); main.firstChild.innerHTML = V.sports(); applyCss(main); imgs(main); placeSeg(main, false); scrollTo(0, y); if ($('.bump', main)) H('light'); } else if (section === 'sports') { const s = $(`[data-sub="${x.sport}"]`); } tape(); }
  }
  function setupBio() {
    const b = $('#bio'); const ok = NATIVE && NATIVE.bioAvailable && NATIVE.bioAvailable();
    b.classList.toggle('hidden', !(ok && NATIVE.bioEnrolled())); const r = $('#remember-wrap'); if (r) r.classList.toggle('hidden', !(ok && !NATIVE.bioEnrolled()));
  }
  window.__vantaBio = (ok, val) => { if (ok) unlock(val, true); else { gateMsg(val || 'Biometric cancelled', !!val); } };

  /* ── events ── */
  $('#unlock').addEventListener('submit', (e) => { e.preventDefault(); unlock($('#pass').value); });
  $('#peek').addEventListener('click', () => { const i = $('#pass'); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; $('#peek').classList.toggle('on', on); H('light'); });
  $('#bio').addEventListener('click', () => { H('light'); NATIVE && NATIVE.bioUnlock(); });
  $('#lock').addEventListener('click', () => lock('Locked.'));
  $('#fresh').addEventListener('click', () => { H('light'); toast('Checking the vault…'); poll(); });
  $('#dock').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.go); });
  $('#view').addEventListener('click', (e) => {
    const s = e.target.closest('[data-sub]'); if (s) { const key = s.closest('[data-seg]').dataset.seg; if (sub[key] !== s.dataset.sub) { sub[key] = s.dataset.sub; H('light'); if (key === 'sports' && s.dataset.sub === 'home') Live.unwatch(); render(); } return; }
    const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); const [a, b] = j.dataset.jump.split(':'); go(a, b); return; }
    const sp = e.target.closest('[data-sport]'); if (sp && Live.LABEL[sp.dataset.sport]) { sub.sports = sp.dataset.sport; H('light'); render(); return; }
    const nw = e.target.closest('[data-news]'); if (nw) { sub.news = nw.dataset.news; H('light'); render({ keepScroll: true }); }
  });
  addEventListener('resize', () => { placeDock(); placeSeg(document, false); });

  // native-only "remember with biometrics" toggle
  if (NATIVE && NATIVE.bioAvailable && NATIVE.bioAvailable()) {
    const w = document.createElement('label'); w.id = 'remember-wrap'; w.className = 'gate-msg'; w.innerHTML = '<input id="remember" type="checkbox" checked> Unlock next time with fingerprint / PIN';
    $('#unlock').insertBefore(w, $('#gate-msg'));
  }
  setupBio();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !NATIVE) navigator.serviceWorker.register('sw.js').catch(() => {});
  setTimeout(() => $('#pass').focus(), 400);
})();
