// Záloha skriptovacího deníku do Google tabulky (Apps Script webová aplikace, viz docs/zaloha-apps-script.gs).
// Posílá se automaticky chvíli po změně, nejpozději jednou denně a po návratu připojení.
// Adresa a klíč se ukládají jen v tomto prohlížeči (ne do repozitáře).

import * as S from './store.js';
import { h, lsGet, lsSet, toast, debounce } from './util.js';
import { countsByKey } from './photos.js';

const CFG_KEY = 'poledne.backup';
const STATE_KEY = 'poledne.backupState';
const DAY = 24 * 3600 * 1000;
const subs = new Set();

const read = k => { try { return JSON.parse(lsGet(k, 'null')); } catch { return null; } };
export const config = () => read(CFG_KEY);
export const state = () => read(STATE_KEY) || {};
function setState(patch) { lsSet(STATE_KEY, JSON.stringify({ ...state(), ...patch })); subs.forEach(f => f()); }
export const onState = f => { subs.add(f); return () => subs.delete(f); };

async function payload(reason) {
  const SC = S.get().script;
  const photos = await countsByKey().catch(() => ({}));
  const rows = [];
  let filled = 0;
  for (const d of SC.days) for (const r of d.rows) {
    const key = `${d.id}:${r.num}`;
    const e = SC.entries?.[key] || {};
    if (e.klapka) filled++;
    rows.push([d.label, d.date, r.num, r.obraz, r.size, r.camera, r.action, e.klapka || '', S.shot(r.num)?.done ? 'ano' : '', e.note || '', photos['s:' + key] || 0]);
  }
  const done = S.get().shots.filter(s => s.done).map(s => s.num);
  return {
    klic: config().klic, device: config().device || '', reason, rows, filled, done: done.length, crew: SC.crew,
    snapshot: { entries: SC.entries, crew: SC.crew, done },
  };
}

let running = false;
export async function backupNow(reason = 'ručně') {
  const cfg = config();
  if (!cfg?.url || !cfg?.klic) { setState({ pending: false }); return { ok: false, error: 'Záloha není nastavená' }; }
  if (running) return { ok: false, error: 'Záloha už běží' };
  if (!navigator.onLine) { setState({ pending: true }); return { ok: false, error: 'Offline – odešle se po připojení' }; }
  running = true;
  setState({ busy: true });
  try {
    const res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(await payload(reason)) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'Neznámá chyba');
    setState({ busy: false, pending: false, lastOk: Date.now(), error: '' });
    return out;
  } catch (err) {
    setState({ busy: false, pending: true, error: err.message || String(err), lastTry: Date.now() });
    return { ok: false, error: err.message || String(err) };
  } finally { running = false; }
}

const auto = debounce(() => backupNow('automaticky po změně'), 20000);

// volá synchronizace při každé změně na tomto zařízení
export function noteLocalChange() {
  if (!config()) return;
  setState({ pending: true });
  auto();
}

export function initBackup() {
  addEventListener('online', () => { if (config() && state().pending) backupNow('po připojení'); });
  setTimeout(() => {
    const st = state();
    if (config() && (st.pending || !st.lastOk || Date.now() - st.lastOk > DAY)) backupNow('denní');
  }, 5000);
}

// ---------- UI pro záložku Script ----------
const fmt = t => new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export function backupBox() {
  const status = h('span', { class: 'bk-status' });
  const box = h('div', { class: 'bk' },
    h('strong', null, 'Záloha a synchronizace'), status,
    h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
      const r = await backupNow('ručně');
      import('./sync.js').then(m => m.syncNow());
      toast(r.ok ? 'Zálohováno a synchronizováno.' : 'Záloha selhala: ' + r.error);
    } }, 'Zálohovat teď'),
    h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: settings }, 'Nastavení'));
  const paint = () => {
    const cfg = config(), st = state();
    let t, cls = '';
    if (!cfg) { t = 'není nastavená'; cls = 'is-off'; }
    else if (st.busy) t = 'zálohuji…';
    else if (st.error && st.pending) { t = (navigator.onLine ? 'chyba: ' + st.error : 'offline – odešle se po připojení'); cls = 'is-warn'; }
    else if (st.pending) t = 'změny čekají na odeslání…';
    else if (st.lastOk) { t = 'naposledy ' + fmt(st.lastOk); cls = 'is-ok'; }
    else t = 'zatím neproběhla';
    status.textContent = t;
    status.className = 'bk-status ' + cls;
  };
  paint();
  const off = onState(paint);
  // odhlášení posluchače, až box zmizí ze stránky
  const mo = new MutationObserver(() => { if (!box.isConnected) { off(); mo.disconnect(); } });
  requestAnimationFrame(() => mo.observe(document.getElementById('main'), { childList: true, subtree: true }));
  return box;
}

function settings() {
  const cfg = config() || {};
  const url = h('input', { type: 'url', value: cfg.url || '', placeholder: 'https://script.google.com/macros/s/…/exec', 'aria-label': 'Adresa zálohy' });
  const klic = h('input', { type: 'password', value: cfg.klic || '', placeholder: 'klíč z Apps Scriptu', 'aria-label': 'Klíč', autocomplete: 'off' });
  const device = h('input', { type: 'text', value: cfg.device || '', placeholder: 'např. iPhone skriptky', 'aria-label': 'Název zařízení' });
  const dlg = h('dialog', { class: 'bk-dlg', 'aria-label': 'Nastavení zálohy' },
    h('h2', null, 'Záloha na Google Disk'),
    h('p', { class: 'muted small' }, 'Deník se zálohuje do Google tabulky ve složce Záloha a přes ni se synchronizuje se všemi zařízeními se stejnou adresou a klíčem. Adresa a klíč se uloží jen v tomto zařízení.'),
    h('label', null, h('span', null, 'Adresa webové aplikace'), url),
    h('label', null, h('span', null, 'Klíč'), klic),
    h('label', null, h('span', null, 'Název zařízení'), device),
    h('div', { class: 'bk-dlg-a' },
      cfg.url ? h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => { lsSet(CFG_KEY, 'null'); setState({ pending: false, error: '' }); dlg.close(); } }, 'Vypnout zálohu') : null,
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dlg.close() }, 'Zrušit'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: async () => {
        if (!device.value.trim()) { toast('Pojmenujte zařízení, ať je v synchronizaci poznat.'); return; }
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url.value.trim())) { toast('Adresa musí začínat https://script.google.com/'); return; }
        lsSet(CFG_KEY, JSON.stringify({ url: url.value.trim(), klic: klic.value.trim(), device: device.value.trim() }));
        dlg.close();
        localStorage.removeItem('poledne.syncSince');
        const r = await backupNow('první záloha');
        import('./sync.js').then(m => m.syncNow());
        toast(r.ok ? 'Záloha a synchronizace fungují.' : 'Záloha selhala: ' + r.error);
      } }, 'Uložit a zálohovat')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
