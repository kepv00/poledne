// Synchronizace mezi zařízeními přes Google tabulku (stejná adresa a klíč jako záloha).
// Každá lokální změna (klapka, poznámka, hotovo, návaznost, štáb, stav rekvizity) dostane čas
// a odešle se; zároveň se stáhnou změny ostatních od posledního dotazu. Platí novější změna.

import * as S from './store.js';
import { h, lsGet, lsSet, debounce } from './util.js';
import { config, noteLocalChange } from './backup.js';
import { paintDone } from './parts.js';

const META = 'poledne.syncMeta';     // { klíč: { t: čas změny, v: hodnota, p: 1 = čeká na odeslání } }
const SINCE = 'poledne.syncSince';   // čas serveru poslední úspěšné synchronizace
const STATE = 'poledne.syncState';
const INTERVAL = 20000;

const read = (k, d) => { try { return JSON.parse(lsGet(k, 'null')) ?? d; } catch { return d; } };
let meta = read(META, {});
const saveMeta = () => lsSet(META, JSON.stringify(meta));
const subs = new Set();
export const syncState = () => read(STATE, {});
function setState(patch) { lsSet(STATE, JSON.stringify({ ...syncState(), ...patch })); subs.forEach(f => f()); }
export const onSyncState = f => { subs.add(f); return () => subs.delete(f); };
const pendingCount = () => Object.values(meta).filter(m => m.p).length;

const soon = debounce(() => syncNow(), 2500);
let busy = false, again = false;

export async function syncNow() {
  const cfg = config();
  if (!cfg?.url || !cfg?.klic) return;
  if (busy) { again = true; return; }
  if (!navigator.onLine) { setState({ offline: true, pending: pendingCount() }); return; }
  busy = true;
  // první synchronizace zařízení: nahrát i hodnoty vzniklé dřív (t = 1 → nepřepíšou novější data na serveru)
  if (!lsGet(SINCE)) {
    for (const [k, v] of Object.entries(S.syncSnapshot())) if (!meta[k]) meta[k] = { t: 1, v, p: 1 };
  }
  const changes = Object.entries(meta).filter(([, m]) => m.p).map(([k, m]) => ({ k, v: m.v, t: m.t }));
  try {
    const res = await fetch(cfg.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sync', klic: cfg.klic, device: cfg.device || '', since: +lsGet(SINCE, 0), changes }),
    }).then(r => r.json());
    if (!res.ok) throw new Error(res.error || 'Neznámá chyba');
    for (const c of changes) if (meta[c.k]?.t === c.t) meta[c.k].p = 0;
    let applied = 0;
    for (const c of res.changes || []) {
      const m = meta[c.k];
      if (m && (m.t > c.t || (m.p && m.t >= c.t))) continue;   // místní změna je novější
      if (m && m.t === c.t && JSON.stringify(m.v) === JSON.stringify(c.v)) continue;   // vlastní změna se vrátila
      S.applyRemote(c.k, c.v);
      meta[c.k] = { t: c.t, v: c.v, p: 0 };
      paint(c.k, c.v);
      applied++;
    }
    saveMeta();
    lsSet(SINCE, String(res.now));
    setState({ lastOk: Date.now(), error: '', offline: false, devices: res.devices || {}, pending: pendingCount(), lastApplied: applied });
  } catch (err) {
    setState({ error: err.message || String(err), pending: pendingCount() });
  } finally {
    busy = false;
    if (again) { again = false; soon(); }
  }
}

// Změnu z jiného zařízení dokreslí do otevřené stránky (pole, do kterého se právě píše, nechá být)
function paint(k, v) {
  if (k.startsWith('done:')) { paintDone(+k.slice(5), !!v); return; }
  document.querySelectorAll(`[data-sync="${CSS.escape(k)}"]`).forEach(el => {
    if (el === document.activeElement) return;
    el.value = v ?? '';
    if (k.endsWith(':k')) el.closest('tr')?.classList.toggle('has-klap', !!v);
  });
}

export function initSync() {
  S.setTracker((k, v) => {
    meta[k] = { t: Date.now(), v, p: 1 };
    saveMeta();
    setState({ pending: pendingCount() });
    noteLocalChange();
    soon();
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, INTERVAL);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  addEventListener('online', () => syncNow());
  addEventListener('offline', () => setState({ offline: true }));
  setTimeout(syncNow, 1500);

  // tečka v hlavičce: zelená = synchronizováno, oranžová = čeká / chyba, šedá = vypnuto
  const dot = h('span', { class: 'sync-dot', id: 'sync-dot', role: 'status' });
  document.getElementById('theme-btn')?.before(dot);
  const paintDot = () => {
    const cfg = config(), st = syncState();
    let cls = 'off', t = 'Synchronizace vypnutá – nastavíte ji v záložce Script';
    if (cfg) {
      if (st.error) { cls = 'warn'; t = 'Synchronizace: chyba – ' + st.error; }
      else if (st.offline || st.pending) { cls = 'warn'; t = st.offline ? 'Offline – změny se odešlou po připojení' : 'Odesílám změny…'; }
      else if (st.lastOk) { cls = 'ok'; t = 'Synchronizováno ' + new Date(st.lastOk).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }); }
    }
    dot.className = 'sync-dot ' + cls;
    dot.title = t;
    dot.setAttribute('aria-label', t);
  };
  paintDot();
  onSyncState(paintDot);
}

export function syncLine() {
  const el = h('span', { class: 'bk-status sync-line' });
  const paintLine = () => {
    const st = syncState();
    if (!config()) { el.textContent = ''; return; }
    const devs = Object.keys(st.devices || {}).filter(Boolean);
    const when = st.lastOk ? new Date(st.lastOk).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
    el.textContent = st.error ? `Synchronizace: chyba – ${st.error}`
      : `Synchronizace ${st.offline ? 'offline' : when}${st.pending ? ` · čeká ${st.pending}` : ''}${devs.length ? ` · zařízení: ${devs.join(', ')}` : ''}`;
    el.className = 'bk-status sync-line ' + (st.error || st.offline ? 'is-warn' : 'is-ok');
  };
  paintLine();
  const off = onSyncState(paintLine);
  const mo = new MutationObserver(() => { if (!el.isConnected) { off(); mo.disconnect(); } });
  requestAnimationFrame(() => mo.observe(document.getElementById('main'), { childList: true, subtree: true }));
  return el;
}
