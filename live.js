/* VANTA live: public feeds fetched straight by the browser (they reveal nothing about you).
   ESPN scoreboards (<=8 s while a game is live), Binance market-data websocket for BTC/ETH/SOL. */
(() => {
  'use strict';
  const E = 'https://site.api.espn.com/apis/site/v2/sports/';
  const BOARDS = {
    cricket: [['Cricket', 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&lang=en&region=in']],
    soccer: [['EPL', 'soccer/eng.1'], ['La Liga', 'soccer/esp.1'], ['UCL', 'soccer/uefa.champions'], ['Serie A', 'soccer/ita.1'], ['Bundesliga', 'soccer/ger.1'], ['Ligue 1', 'soccer/fra.1'], ['ISL', 'soccer/ind.1'], ['MLS', 'soccer/usa.1']],
    nba: [['NBA', 'basketball/nba']], ncaab: [['NCAAB', 'basketball/mens-college-basketball']],
    nfl: [['NFL', 'football/nfl']], ncaaf: [['NCAAF', 'football/college-football']],
    nhl: [['NHL', 'hockey/nhl']], mlb: [['MLB', 'baseball/mlb']],
    tennis: [['ATP', 'tennis/atp'], ['WTA', 'tennis/wta']], mma: [['UFC', 'mma/ufc']], f1: [['F1', 'racing/f1']], golf: [['PGA', 'golf/pga']],
  };
  const LABEL = { cricket: 'Cricket', soccer: 'Football', nba: 'NBA', ncaab: 'NCAAB', nfl: 'NFL', ncaaf: 'NCAAF', nhl: 'NHL', mlb: 'MLB', tennis: 'Tennis', mma: 'UFC', f1: 'F1', golf: 'Golf' };
  const subs = new Set(); const emit = (t, d) => subs.forEach(f => { try { f(t, d); } catch (e) {} });

  const comp = (c) => { const t = c.team || {}, a = c.athlete || {};
    return { name: t.displayName || a.displayName || c.displayName || c.name || t.abbreviation || '', abbr: t.abbreviation || c.abbreviation || a.shortName || '',
      score: c.score != null ? (typeof c.score === 'object' ? (c.score.displayValue || '') : String(c.score)) : (c.displayScore || ''), home: c.homeAway === 'home', winner: !!c.winner, logo: t.logo || (a.flag && a.flag.href) || '', color: t.color || '' }; };

  function parseEspn(e, sport, league) {
    const st = (e.status && e.status.type) || {}; const state = (st.state || 'pre').toLowerCase();
    const cp = (e.competitions && e.competitions[0]) || {};
    let comps = (cp.competitors || []).map(comp);
    if ((sport === 'golf' || sport === 'f1') && comps.length > 10) comps = comps.slice(0, 10);
    return { id: sport + ':' + league + ':' + e.id, sport, league, name: e.shortName || e.name || league, state,
      detail: st.shortDetail || st.detail || '', clock: (e.status && e.status.displayClock) || '', start: e.date ? Date.parse(e.date) / 1000 : null,
      competitors: comps, link: ((e.links || []).find(l => l.href) || {}).href || '' };
  }
  function parseCricket(j) {
    const out = [];
    for (const s of j.sports || []) for (const lg of s.leagues || []) for (const e of lg.events || []) {
      const fs = e.fullStatus || {}, st = fs.type || {}; const low = String(e.status || st.state || '').toLowerCase();
      const det = fs.longSummary || st.shortDetail || st.detail || e.summary || '';
      let state = /scheduled to begin|starts at|yet to begin/i.test(det) ? 'pre' : (low === 'in' || low === 'live' || low.includes('progress')) ? 'in' : (['post', 'final', 'closed', 'result'].includes(low) ? 'post' : 'pre');
      out.push({ id: 'cricket:' + e.id, sport: 'cricket', league: lg.name || lg.shortName || 'Cricket', name: e.shortName || e.name || '', state, detail: det, clock: '',
        start: e.date ? Date.parse(e.date) / 1000 : null, link: e.link || '',
        competitors: (e.competitors || []).map(c => ({ name: c.displayName || c.name || c.abbreviation || '', abbr: c.abbreviation || '', score: c.score || '', home: c.homeAway === 'home', winner: !!c.winner, logo: c.logo || '', color: c.color || '' })) });
    }
    return out;
  }
  const rank = (g) => (g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2) * 1e12 + (/india/i.test(g.name + g.league + g.competitors.map(c => c.name).join(' ')) ? 0 : 5e11) + (g.start || 0);

  const sports = {}; let active = null, timer = null, tickerTimer = null;
  async function pull(sport) {
    const boards = BOARDS[sport]; if (!boards) return;
    const res = await Promise.allSettled(boards.map(async ([lg, path]) => {
      const url = path.startsWith('http') ? path : E + path + '/scoreboard';
      const r = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!r.ok) throw 0;
      const j = await r.json(); if (sport === 'cricket') return parseCricket(j);
      const name = (j.leagues && j.leagues[0] && (j.leagues[0].abbreviation || j.leagues[0].name)) || lg;
      return (j.events || []).map(e => parseEspn(e, sport, name));
    }));
    const games = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value).sort((a, b) => rank(a) - rank(b));
    if (!res.some(r => r.status === 'fulfilled')) throw new Error('espn');
    sports[sport] = { label: LABEL[sport], games, live: games.filter(g => g.state === 'in').length, ts: Date.now() };
    emit('sport', { sport, data: sports[sport] });
    return sports[sport];
  }
  async function loop() {
    clearTimeout(timer); if (!active || document.hidden) return;
    let live = 0; try { const d = await pull(active); live = d ? d.live : 0; } catch (e) { emit('sport-err', { sport: active }); }
    timer = setTimeout(loop, live ? 8000 : 60000);
  }
  // ticker: keep the two biggest live sports fresh for the tape
  async function tickerLoop() {
    clearTimeout(tickerTimer); if (document.hidden) return;
    await Promise.allSettled(['cricket', 'nba'].filter(s => s !== active).map(pull));
    tickerTimer = setTimeout(tickerLoop, 20000);
  }

  // Binance public market-data stream (no account, no key)
  let ws = null, wsTry = 0; const px = {};
  function wsOpen() {
    if (ws || document.hidden) return;
    try { ws = new WebSocket('wss://data-stream.binance.vision/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker/solusdt@miniTicker/xrpusdt@miniTicker/dogeusdt@miniTicker'); } catch (e) { return; }
    ws.onmessage = (m) => { try { const d = JSON.parse(m.data).data; const sym = d.s.replace('USDT', ''); const c = +d.c, o = +d.o;
      const prev = px[sym] && px[sym].price; px[sym] = { price: c, change_pct: (c - o) / o * 100, high: +d.h, low: +d.l, dir: prev == null ? 0 : Math.sign(c - prev), ts: Date.now() };
      emit('px', { sym, d: px[sym] }); } catch (e) {} };
    ws.onopen = () => { wsTry = 0; };
    ws.onclose = () => { ws = null; if (!document.hidden && Live.on) setTimeout(wsOpen, Math.min(30000, 1000 * 2 ** (wsTry++))); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function wsClose() { if (ws) { ws.onclose = null; ws.close(); ws = null; } }

  // Binance USD-M futures public endpoints (funding + open interest). Geo-restricted in some regions; vault (OKX) is the fallback.
  const fut = {}; let futAt = 0;
  async function pullFutures() {
    if (Date.now() - futAt < 50000) return fut; futAt = Date.now();
    const F = 'https://fapi.binance.com/fapi/v1/';
    await Promise.allSettled(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].map(async (c) => {
      const o = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };
      const [a, b] = await Promise.all([fetch(F + 'premiumIndex?symbol=' + c + 'USDT', o), fetch(F + 'openInterest?symbol=' + c + 'USDT', o)]);
      if (!a.ok || !b.ok) throw 0;
      const p = await a.json(), q = await b.json(); const mark = +p.markPrice;
      fut[c] = { c, funding: +p.lastFundingRate, funding_ann: +p.lastFundingRate * 3 * 365 * 100, next: +p.nextFundingTime, mark, basis: (mark - +p.indexPrice) / +p.indexPrice * 100, oi_ccy: +q.openInterest, oi_usd: +q.openInterest * mark, ts: Date.now() };
    }));
    if (Object.keys(fut).length) emit('fut', fut);
    return fut;
  }

  document.addEventListener('visibilitychange', () => { if (!Live.on) return; if (document.hidden) { wsClose(); clearTimeout(timer); clearTimeout(tickerTimer); } else { wsOpen(); loop(); tickerLoop(); } });

  const Live = {
    on: false, sports, px, fut, LABEL, SPORTS: Object.keys(BOARDS), pullFutures,
    start() { this.on = true; wsOpen(); tickerLoop(); },
    stop() { this.on = false; wsClose(); clearTimeout(timer); clearTimeout(tickerTimer); active = null; for (const k in sports) delete sports[k]; for (const k in px) delete px[k]; for (const k in fut) delete fut[k]; futAt = 0; },
    watch(sport) { active = sport; loop(); },
    unwatch() { active = null; clearTimeout(timer); },
    sub(f) { subs.add(f); return () => subs.delete(f); },
  };
  window.Live = Live;
})();
