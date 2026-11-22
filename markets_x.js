/* Shared Markets extras (CHI-6 commodities). Renders from the sealed feed. No network. */
(() => {
  'use strict';
  const G = (name, grp) => (grp || []).filter(x => x.grp === name || x.kind === name);
  function commodities(D, u) {
    const C = (D && D.commodities) || {};
    if (C.error) return u.P(`<p class="lead">Commodities feed is unavailable (${u.esc(C.error)}).</p>`);
    const fut = C.futures || [], mandi = C.mandi || [], miss = C.missing || [], news = C.news || [], weekly = C.weekly || {}, cards = C.outlook || [];
    const dirCls = (d) => d > 0 ? 'up' : d < 0 ? 'dn' : 'mu';
    const futTbl = (grp) => {
      const rows = fut.filter(r => r.grp === grp);
      if (!rows.length) return '';
      return u.T(['Contract', 'Exchange', ['Last', 'r'], ['Day', 'r'], ['5d', 'r'], ['20d', 'r'], ''],
        rows.map(r => {
          if (r.error) return `<tr><td class="l">${u.esc(r.name)}</td><td>${u.esc(r.exch)}</td><td class="r mu" colspan="4">Delayed print unavailable</td><td></td></tr>`;
          const t = r.trend || {};
          return `<tr><td class="l n">${u.esc(r.name)}<div class="dim">${u.esc(r.sym)} · ${u.esc(r.ccy || '')}/${u.esc(r.unit || '')}</div></td><td>${u.esc(r.exch)}</td><td class="r num">${u.px(r.px)}</td><td class="r ${u.cls(r.cp)}">${u.pct(r.cp)}</td><td class="r ${u.cls(t.d5)}">${u.pct(t.d5)}</td><td class="r ${u.cls(t.d20)}">${u.pct(t.d20)}</td><td>${u.spark(t.spark)}</td></tr>`;
        }));
    };
    const mandiRows = mandi.map(r => {
      if (r.empty) return `<tr><td class="l">${u.esc(r.name)}</td><td class="mu" colspan="5">No print in this delayed feed</td></tr>`;
      const t = r.trend || {};
      return `<tr><td class="l n">${u.esc(r.name)}<div class="dim">${u.esc(r.kind)} · ${r.n || 0} yards</div></td><td class="r num">${u.nf(r.modal, 0)}</td><td class="r dim">${u.nf(r.lo, 0)}–${u.nf(r.hi, 0)}</td><td class="r ${u.cls(t.d5)}">${u.pct(t.d5)}</td><td class="r ${u.cls(t.d20)}">${u.pct(t.d20)}</td><td>${u.spark(t.spark)}</td></tr>`;
    });
    const missRows = miss.map(m => `<tr><td class="l">${u.esc(m.name)}</td><td class="mu l" colspan="5">${u.esc(m.note)}</td></tr>`);
    const week = (arr, title, c) => `<div><div class="h"><h2>${u.esc(title)}</h2></div>${(arr || []).map(x => `<div class="rowk"><div><div class="nm">${u.esc(x.name)}</div><div class="meta">${u.esc(x.why || '')}</div></div><span class="tag ${c}">${u.esc(x.label)}</span></div>`).join('')}</div>`;
    const outlook = cards.map(c => `<div class="rowk"><div><div class="nm">${u.esc(c.name)}</div><div class="meta">${u.esc(c.season || '')}</div></div><span class="tag ${dirCls(c.dir)}">${u.esc(c.label)}</span></div>`).join('');
    const newsH = news.length ? news.map(n => `<div class="news-row">${u.ext(n.link, `<div class="nm">${u.esc(n.title)}</div><div class="meta">${u.esc(n.source || '')} · ${u.ago(n.ts)}</div>`, 'nr')}${n.tilt ? `<span class="tag ${dirCls(n.tilt)}">${n.tilt > 0 ? 'firmer tone' : 'softer tone'}</span>` : ''}</div>`).join('') : u.empty('No recent commodity headlines in the desk news feed.');
    return `
      ${u.P(`<p class="lead">Delayed metals, energy and agri benchmarks, plus Indian mandi staples. Outlook is a plain rule (trend + season + headlines), not a tip. This is a data and news dashboard, not SEBI-regulated advice.</p>`)}
      ${u.head('Exchange futures', 'delayed global benchmarks · not live MCX')}
      ${u.P(u.head('Metals', '') + futTbl('metals') + u.head('Energy', '') + futTbl('energy') + u.head('Agri', '') + futTbl('agri'))}
      ${u.src('Yahoo Finance delayed futures (COMEX, NYMEX, CBOT, ICE). Indian MCX/NCDEX live prices were not reachable without a key-gated API.')}
      ${u.head('Mandi staples', C.mandi_asof ? ('modal ₹/quintal · as of ' + C.mandi_asof) : 'modal ₹/quintal')}
      ${u.P(u.T(['Commodity', ['Modal', 'r'], ['Range', 'r'], ['Near', 'r'], ['Trend', 'r'], ''], mandiRows.concat(missRows), 'No mandi prints in the delayed feed yet'))}
      ${u.src('Agmarknet-style daily prints via a keyless 5-state feed (Maharashtra, Uttar Pradesh, Punjab, Madhya Pradesh, Karnataka). Often delayed. DCA retail was not reachable.')}
      ${u.head('Supply & demand headlines', 'from the desk news wire')}
      ${u.P(newsH)}
      ${u.head('Rule-based outlook', 'trend + seasonality + news')}
      ${u.P(outlook || u.empty('Outlook needs at least one live or delayed print.'))}
      ${u.P(`${week(weekly.stock_up, 'This week — stock up looks reasonable', 'up')}${week(weekly.wait, 'This week — waiting looks reasonable', 'dn')}<p class="lead">${u.esc((weekly.blurb) || '')}</p>`)}
      ${u.src(C.disclaimer || 'Rule-based outlook only. Not SEBI-regulated tips.')}
    `;
  }
  window.MarketsX = Object.freeze({ commodities });
})();
