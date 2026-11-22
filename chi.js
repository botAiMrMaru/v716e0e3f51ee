/* CHI-7 extras: TV wall, weather, morning brief, price-move alerts, language, war-commodity links. */
(() => {
  'use strict';
  const I18N = {
    en: {
      home: 'Home', markets: 'Markets', world: 'World', sports: 'Sports', books: 'Books', live: 'Live',
      commodities: 'Commodities', tv: 'Live TV', weather: 'Weather', keys: 'Keys', play: 'Play',
      brief: 'Morning brief', alerts: 'Price alerts on', alertsOff: 'Enable price alerts',
      lang: 'हिन्दी', fun: 'For fun only', notTips: 'Data and news only — not SEBI-regulated tips.',
      tvHint: 'Muted autoplay · tap a stream for sound. Official YouTube live only.',
      weatherHint: '7-day rain for major Indian crop regions. Free Open-Meteo data, not a farm advisory.',
      wait: 'Waiting for the next sealed feed.',
    },
    hi: {
      home: 'होम', markets: 'बाज़ार', world: 'विश्व', sports: 'खेल', books: 'बही', live: 'लाइव',
      commodities: 'कमोडिटी', tv: 'लाइव टीवी', weather: 'मौसम', keys: 'कुंजी', play: 'खेल',
      brief: 'सुबह की ब्रीफ', alerts: 'मूल्य अलर्ट चालू', alertsOff: 'मूल्य अलर्ट चालू करें',
      lang: 'English', fun: 'केवल मनोरंजन', notTips: 'केवल डेटा और समाचार — SEBI-नियंत्रित सलाह नहीं।',
      tvHint: 'म्यूट ऑटोप्ले · आवाज़ के लिए एक स्ट्रीम दबाएँ। केवल आधिकारिक YouTube लाइव।',
      weatherHint: 'मुख्य फसल क्षेत्रों का 7-दिन का बारिश विवरण। Open-Meteo, कृषि सलाह नहीं।',
      wait: 'अगले सील फीड की प्रतीक्षा।',
    }
  };
  let lang = 'en', alertOn = false, lastPx = {}, subFun = null;

  const t = (k) => (I18N[lang] && I18N[lang][k]) || (I18N.en[k] || k);

  const yt = (id, mute, play) => id
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=${play ? 1 : 0}&mute=${mute ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`
    : '';

  function liveList(D, group) {
    const C = (D && D.chi && D.chi.tv) || {};
    return (C[group] || []).filter(v => v && v.v && v.live !== false);
  }

  function liveGrid(D, u, group, opts) {
    const list = liveList(D, group);
    if (!list.length) return '';
    const asof = ((D && D.chi && D.chi.tv) || {}).ist || '';
    const tiles = list.map((v, i) => {
      const eager = i < 6;
      const src = yt(v.v, true, eager);
      return `<div class="live-tile" data-live-id="${u.esc(v.v)}">
        <div class="live-frame">${eager ? `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${u.esc(v.name || 'Live')}"></iframe>` : `<button type="button" class="live-ph" data-live-load="${u.esc(v.v)}" aria-label="Load ${u.esc(v.name || 'live stream')}"></button>`}</div>
        <div class="live-bar"><span class="live-pip" aria-hidden="true"></span><span class="nm">${u.esc(v.name || '')}</span>
          <button type="button" class="live-mute on" data-live-toggle="${u.esc(v.v)}" aria-label="Sound for ${u.esc(v.name || '')}">Sound</button></div>
      </div>`;
    }).join('');
    const title = (opts && opts.title) || 'Live now';
    return `${u.head(title, asof ? ('verified ' + asof) : 'muted autoplay')}
      ${u.P(`<p class="lead">${t('tvHint')}</p><div class="live-grid" data-live-group="${u.esc(group)}">${tiles}</div>`)}
      ${u.src('Official YouTube live broadcasts, checked every few minutes. Streams that are not live are dropped. Autoplay is muted; tap one tile for sound.')}`;
  }

  function afterLive(root) {
    if (!root) return;
    const load = (tile, id, mute) => {
      if (!tile || !id) return;
      const frame = tile.querySelector('.live-frame');
      if (!frame) return;
      frame.innerHTML = `<iframe src="${yt(id, mute, true)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Live"></iframe>`;
      const btn = tile.querySelector('[data-live-toggle]');
      if (btn) { btn.classList.toggle('on', !!mute); btn.textContent = mute ? 'Sound' : 'On'; }
    };
    root.querySelectorAll('[data-live-load]').forEach(ph => {
      const tile = ph.closest('.live-tile');
      if (!tile) return;
      const io = new IntersectionObserver((ents) => {
        ents.forEach(en => { if (en.isIntersecting) { load(tile, ph.dataset.liveLoad, true); io.disconnect(); } });
      }, { rootMargin: '120px' });
      io.observe(ph);
    });
    if (root.dataset.liveBound) return;
    root.dataset.liveBound = '1';
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-live-toggle], [data-live-load]');
      if (!btn) return;
      e.preventDefault();
      const tile = btn.closest('.live-tile');
      const id = btn.dataset.liveToggle || btn.dataset.liveLoad;
      if (btn.dataset.liveLoad) { load(tile, id, true); return; }
      const turnOn = btn.classList.contains('on');
      root.querySelectorAll('.live-tile').forEach(t => {
        const tid = t.dataset.liveId;
        if (!tid || !t.querySelector('iframe')) return;
        load(t, tid, !(turnOn && tid === id));
      });
    });
  }

  function tv(D, u) {
    const C = (D && D.chi && D.chi.tv) || {};
    const news = liveGrid(D, u, 'news', { title: 'News' });
    const war = liveGrid(D, u, 'war', { title: 'World & war' });
    const sports = liveGrid(D, u, 'sports', { title: 'Sports' });
    if (!news && !war && !sports) return u.P(`<p class="lead">${t('wait')}</p>`);
    return news + war + sports + u.src('Public official YouTube live channels only.');
  }

    function weather(D, u) {
    const rows = (D && D.chi && D.chi.weather) || [];
    if (!rows.length) return u.P(`<p class="lead">${t('wait')}</p>`);
    const card = rows.map(r => {
      if (r.error) return `<div class="rowk"><div class="nm">${u.esc(r.name)}</div><span class="meta">unavailable</span></div>`;
      const days = (r.days || []).slice(0, 7).map(d => `<span class="wx"><b>${u.esc((d.d || '').slice(5))}</b>${d.rain == null ? '—' : Number(d.rain).toFixed(1) + ' mm'}</span>`).join('');
      return `<div class="wx-card"><div class="rowk"><div><div class="nm">${u.esc(r.name)}</div><div class="meta">${u.esc(r.crop)} · 3d ${r.rain3} mm · 7d ${r.rain7} mm</div></div><span class="tag">${u.esc(r.tone)}</span></div><div class="wx-row">${days}</div></div>`;
    }).join('');
    const links = ((D.chi || {}).links || []).map(l => `<div class="rowk"><div><div class="nm">${u.esc(l.trigger)}</div><div class="meta">${u.esc(l.why)}</div></div><span class="meta">${u.esc((l.commodities || []).join(' · '))}</span></div>`).join('');
    return `${u.P(`<p class="lead">${t('weatherHint')}</p>`)}${u.P(card)}${u.head('War & weather, linked staples', '')}${u.P(links)}${u.src('Open-Meteo forecast · generic crop-region list, not a farm or shop advisory.')}`;
  }

  function brief(D, u) {
    const b = (D && D.chi && D.chi.brief) || null;
    if (!b) return '';
    return u.P(`<div class="h"><h2>${u.esc(t('brief'))}</h2><small>${u.esc(b.for || '')}</small></div>
      ${(b.lines || []).map(l => `<p class="lead">${u.esc(l)}</p>`).join('')}
      <span class="src">${u.esc(b.disclaimer || t('notTips'))}</span>`);
  }

  function meter(D, u) {
    const oi = D && D.oi && D.oi.summary && D.oi.summary.NIFTY;
    if (!oi) return '';
    const pcr = oi.pcr, pain = oi.maxPain, atm = oi.atm;
    let label = 'Mixed', cls = 'mu', n = 50;
    if (pcr >= 1.2) { label = 'Bullish tilt (high PCR)'; cls = 'up'; n = 70; }
    else if (pcr <= 0.8) { label = 'Bearish tilt (low PCR)'; cls = 'dn'; n = 30; }
    return u.P(`<div class="h"><h2>Options pulse</h2><small>Nifty · ${u.esc(oi.expiry || '')}</small></div>
      <div class="kpis"><div class="kpi"><div class="lbl">PCR OI</div><div class="v ${cls}">${pcr == null ? '—' : Number(pcr).toFixed(2)}</div></div>
      <div class="kpi"><div class="lbl">Max pain</div><div class="v gold">${u.nf(pain)}</div></div>
      <div class="kpi"><div class="lbl">ATM</div><div class="v">${u.nf(atm)}</div></div>
      <div class="kpi"><div class="lbl">Meter</div><div class="v ${cls}">${u.esc(label)}</div></div></div>
      <span class="bar ${cls}"><i style="width:${n}%"></i></span>
      <span class="src">NSE option chain via the desk. A simple PCR reading, not a trading tip.</span>`);
  }

  function applyLang(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  }

  function watchPrices(D, toast) {
    if (!alertOn || !D) return;
    const hits = [];
    const I = (D.markets || {}).indices || {};
    [['Nifty', 1], ['BankNifty', 1], ['VIX', 5]].forEach(([k, th]) => {
      const x = I[k]; if (!x || x.change_pct == null) return;
      const key = 'ix-' + k; const prev = lastPx[key]; lastPx[key] = x.ltp;
      if (Math.abs(x.change_pct) >= th && (prev == null || prev !== x.ltp)) hits.push(`${k} ${x.change_pct > 0 ? '+' : ''}${Number(x.change_pct).toFixed(2)}%`);
    });
    (D.commodities && D.commodities.futures || []).forEach(f => {
      if (f.cp == null) return;
      const th = /Gold|Silver/.test(f.name) ? 1.5 : 2;
      const key = 'c-' + f.sym; const prev = lastPx[key]; lastPx[key] = f.px;
      if (Math.abs(f.cp) >= th && (prev == null || prev !== f.px)) hits.push(`${f.name} ${f.cp > 0 ? '+' : ''}${Number(f.cp).toFixed(2)}%`);
    });
    if (!hits.length) return;
    const msg = 'Move: ' + hits.slice(0, 4).join(' · ');
    toast && toast(msg);
    try { if (Notification.permission === 'granted') new Notification('Desk', { body: msg, silent: false }); } catch (e) {}
  }

  async function enableAlerts(toast) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') await Notification.requestPermission();
      alertOn = true; toast && toast(t('alerts'));
    } catch (e) { alertOn = true; toast && toast(t('alerts')); }
    return alertOn;
  }

  function toggleLang() { lang = lang === 'en' ? 'hi' : 'en'; applyLang(document); const m=document.querySelector('.lang-mark'); if(m) m.textContent = lang==='en' ? 'अ' : 'A'; return lang; }

  window.Chi = Object.freeze({ tv, liveGrid, afterLive, weather, brief, meter, t, applyLang, watchPrices, enableAlerts, toggleLang, get lang() { return lang; }, get alerts() { return alertOn; } });
})();
