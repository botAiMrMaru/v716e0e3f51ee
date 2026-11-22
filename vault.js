/* VANTA vault: fetch the sealed blob, derive the key in-browser, decrypt in memory. No storage, ever. */
(() => {
  'use strict';
  const CFG = window.VANTA_CFG || {};
  const ITER = 600000, AAD = new TextEncoder().encode('VNT1'), CMD_AAD = new TextEncoder().encode('VCMD1');
  let key = null, saltB64 = null, etag = null, lastBlob = null;

  const b64u = (s) => {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4);
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const b64e = (u8) => {
    let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  async function fetchBlob() {
    if (CFG.blobUrl) { // local test mode only (never in the deployed config)
      const r = await fetch(CFG.blobUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('blob ' + r.status);
      return { blob: (await r.text()).trim(), changed: true };
    }
    const h = { Accept: 'application/vnd.github+json' };
    if (etag) h['If-None-Match'] = etag;
    let r;
    try { r = await fetch('https://api.github.com/gists/' + CFG.gist, { headers: h, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' }); }
    catch (e) { r = null; }
    if (r && r.status === 304 && lastBlob) return { blob: lastBlob, changed: false };
    if (r && r.ok) {
      etag = r.headers.get('ETag');
      const j = await r.json(); const f = j.files && j.files.v;
      if (!f) throw new Error('vault empty');
      let c = f.content;
      if (f.truncated) c = await (await fetch(f.raw_url, { cache: 'no-store', credentials: 'omit' })).text();
      lastBlob = c.trim(); return { blob: lastBlob, changed: true };
    }
    // rate-limited or offline: fall back to the raw CDN copy (may lag ~5 min)
    const raw = await fetch('https://gist.githubusercontent.com/' + CFG.user + '/' + CFG.gist + '/raw/v?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store', credentials: 'omit' });
    if (!raw.ok) throw new Error('vault unreachable (' + (r ? r.status : 'offline') + ')');
    lastBlob = (await raw.text()).trim(); return { blob: lastBlob, changed: true };
  }

  function split(blob) {
    if (!blob.startsWith('VNT1.')) throw new Error('not a VANTA vault');
    const b = b64u(blob.slice(5));
    return { salt: b.slice(0, 16), iv: b.slice(16, 28), ct: b.slice(28), saltB64: blob.slice(5, 27) };
  }

  async function derive(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    // encrypt is used only for Sobot key-admin commands (AAD VCMD1). The vault format is unchanged.
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt', 'encrypt']);
  }

  async function open(parts, k) {
    const body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: parts.iv, additionalData: AAD }, k, parts.ct));
    const n = (body[0] << 24 | body[1] << 16 | body[2] << 8 | body[3]) >>> 0;
    const ds = new Blob([body.subarray(4, 4 + n)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const txt = await new Response(ds).text();
    body.fill(0);
    return JSON.parse(txt);
  }

  const Vault = {
    get unlocked() { return !!key; },
    async unlock(pass) {
      const { blob } = await fetchBlob();
      const p = split(blob);
      const k = await derive(pass, p.salt);
      let data;
      try { data = await open(p, k); } catch (e) { const err = new Error('wrong passphrase'); err.code = 'BAD'; throw err; }
      key = k; saltB64 = p.saltB64; return data;
    },
    async refresh() {
      if (!key) throw new Error('locked');
      const { blob, changed } = await fetchBlob();
      if (!changed) return null;
      const p = split(blob);
      if (p.saltB64 !== saltB64) { Vault.lock(); const e = new Error('vault re-keyed'); e.code = 'REKEY'; throw e; }
      return open(p, key);
    },
    async sealCmd(obj) {
      if (!key) throw new Error('locked');
      const raw = new TextEncoder().encode(JSON.stringify(obj));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: CMD_AAD }, key, raw));
      const out = new Uint8Array(iv.length + ct.length); out.set(iv, 0); out.set(ct, iv.length);
      return 'VCMD1.' + b64e(out);
    },
    lock() { key = null; saltB64 = null; lastBlob = null; etag = null; },
  };
  Object.freeze(Vault);
  Object.defineProperty(window, 'Vault', { value: Vault, writable: false, configurable: false });
})();
