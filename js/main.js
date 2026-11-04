// Vstupní bod: navigace (hash router), téma, režim úprav, klávesnice, service worker.

import * as S from './store.js';
import { h, icon, lsGet, lsSet, toast } from './util.js';
import * as Shots from './shots.js';
import { planView, litView, techView, boardView, lightView, driveView } from './views.js';
import { scriptView } from './script.js';
import { soundView } from './sound.js';
import { initBackup } from './backup.js';
import { initSync } from './sync.js';
import { exportPhotos, importPhotos } from './photos.js';

const TABS = [
  { id: 'zabery', label: 'Jednotlivé záběry', short: 'Záběry', mount: Shots.mount, primary: true },
  { id: 'plan', label: 'Natáčecí plán', short: 'Plán', mount: planView, primary: true },
  { id: 'script', label: 'Script', short: 'Script', mount: scriptView },
  { id: 'scenar', label: 'Literární scénář', short: 'Scénář', mount: litView, primary: true },
  { id: 'technicky', label: 'Technický scénář', short: 'Technický', mount: techView },
  { id: 'zvuk', label: 'Zvukový plán', short: 'Zvuk', mount: soundView },
  { id: 'storyboard', label: 'Storyboard', short: 'Storyboard', mount: boardView, primary: true },
  { id: 'svetlo', label: 'Světlo a rekvizity', short: 'Světlo', mount: lightView },
  { id: 'disk', label: 'Google Disk', short: 'Disk', mount: driveView },
];

const main = document.getElementById('main');
let current = { tab: null, view: null };

// ---------- router ----------
function parseHash() {
  const [tab, arg] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (tab === 'den') return { tab: 'plan', arg };
  return { tab: TABS.some(t => t.id === tab) ? tab : 'zabery', arg };
}

function route() {
  const { tab, arg } = parseHash();
  if (tab === current.tab && current.view?.update) { current.view.update(arg); return; }
  current.view?.unmount?.();
  const def = TABS.find(t => t.id === tab);
  document.body.dataset.tab = tab;
  document.title = `${def.label} · Poledne`;
  main.replaceChildren();
  window.scrollTo(0, 0);
  current = { tab, view: def.mount(main, arg) };
  document.querySelectorAll('[data-tab-link]').forEach(a => {
    const on = a.dataset.tabLink === tab || (a.dataset.tabLink === 'vice' && !TABS.find(t => t.id === tab).primary);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  closeMore();
}

// ---------- hlavička a navigace ----------
function buildNav() {
  document.getElementById('tabs').replaceChildren(...TABS.map(t =>
    h('a', { href: '#/' + t.id, 'data-tab-link': t.id, class: 'tab' },
      h('span', { class: 'lg' }, t.label), h('span', { class: 'sm' }, t.short))));
  const bottom = document.getElementById('bottom-bar');
  bottom.replaceChildren(
    ...TABS.filter(t => t.primary).map(t => h('a', { href: '#/' + t.id, 'data-tab-link': t.id, class: 'bb-item' }, icon(t.id), h('span', null, t.short))),
    h('button', { type: 'button', class: 'bb-item', 'data-tab-link': 'vice', 'aria-haspopup': 'true', 'aria-expanded': 'false', id: 'more-btn', onclick: toggleMore },
      icon('vice'), h('span', null, 'Více')));
  const sheet = h('div', { class: 'more-sheet', id: 'more-sheet', hidden: true, role: 'menu' },
    TABS.filter(t => !t.primary).map(t => h('a', { href: '#/' + t.id, class: 'more-item', role: 'menuitem' }, icon(t.id), t.label)));
  document.body.append(sheet);
  document.addEventListener('click', e => {
    if (!e.target.closest('#more-sheet, #more-btn')) closeMore();
  });
}
function toggleMore() {
  const sh = document.getElementById('more-sheet');
  sh.hidden = !sh.hidden;
  document.getElementById('more-btn').setAttribute('aria-expanded', String(!sh.hidden));
}
function closeMore() {
  const sh = document.getElementById('more-sheet');
  if (sh) sh.hidden = true;
  document.getElementById('more-btn')?.setAttribute('aria-expanded', 'false');
}

// ---------- téma ----------
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Téma: podle systému', light: 'Téma: světlé', dark: 'Téma: tmavé' };
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const btn = document.getElementById('theme-btn');
  btn.replaceChildren(icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'auto'));
  btn.setAttribute('aria-label', THEME_LABEL[t] + ' (přepnout)');
  btn.title = THEME_LABEL[t];
  dispatchEvent(new Event('themechange'));
}
function initTheme() {
  let t = lsGet('poledne.theme', 'auto');
  if (!THEMES.includes(t)) t = 'auto';
  applyTheme(t);
  document.getElementById('theme-btn').addEventListener('click', () => {
    t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    lsSet('poledne.theme', t);
    applyTheme(t);
  });
}

// ---------- režim úprav ----------
function initEdit() {
  const toggle = document.getElementById('edit-toggle');
  const bar = document.getElementById('edit-bar');
  const fileIn = document.getElementById('import-file');
  toggle.replaceChildren(icon('pencil'));
  const set = on => {
    S.setEditing(on);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.title = on ? 'Ukončit režim úprav' : 'Režim úprav';
    toggle.setAttribute('aria-label', toggle.title);
    bar.hidden = !on;
  };
  set(false);
  toggle.addEventListener('click', () => set(!S.isEditing()));
  bar.replaceChildren(
    h('span', { class: 'edit-bar-t' }, icon('pencil'), 'Režim úprav', h('span', { class: 'muted' }, ' – změny se ukládají jen v tomto prohlížeči')),
    h('div', { class: 'edit-bar-a' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: doExport }, 'Export JSON'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => fileIn.click() }, 'Import JSON'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => exportPhotos() }, 'Export fotek'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: importPhotosPick }, 'Import fotek'),
      h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: doReset }, 'Obnovit původní'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => set(false) }, 'Hotovo')));
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try {
      S.importData(JSON.parse(await f.text()));
      toast('Data importována.');
    } catch (err) {
      toast('Import selhal: ' + err.message);
    }
  });
}

function importPhotosPick() {
  const inp = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    inp.remove();
    if (!f) return;
    try {
      const n = await importPhotos(JSON.parse(await f.text()));
      toast(`Importováno ${n} fotek.`);
      current.tab = null;
      route();
    } catch (err) { toast('Import fotek selhal: ' + err.message); }
  });
  document.body.append(inp);
  inp.click();
}

function doExport() {
  const blob = new Blob([JSON.stringify(S.exportData(), null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `data-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Staženo. Pro trvalou změnu nahraď v repozitáři data.json.');
}

function doReset() {
  if (!confirm('Smazat všechny místní úpravy včetně „natočeno“ a poznámek k návaznosti a vrátit se k data.json?')) return;
  S.resetAll();
  toast('Obnoveno z data.json.');
}

// ---------- výška hlavičky (pro sticky prvky) ----------
function trackHeader() {
  const hd = document.getElementById('header');
  const setH = () => document.documentElement.style.setProperty('--header-h', hd.offsetHeight + 'px');
  new ResizeObserver(setH).observe(hd);
  setH();
}

// ---------- start ----------
async function start() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  buildNav();
  initTheme();
  trackHeader();
  try {
    await S.load();
  } catch (err) {
    main.replaceChildren(h('div', { class: 'page' }, h('h1', null, 'Data se nepodařilo načíst'), h('p', null, err.message)));
    return;
  }
  initEdit();
  initBackup();
  initSync();
  S.on(kind => current.view?.onStore?.(kind));
  addEventListener('hashchange', route);
  addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMore();
    current.view?.keydown?.(e);
  });
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline režim nebude */ });
  }
}

start();
