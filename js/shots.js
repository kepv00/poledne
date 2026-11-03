// Záložka „Jednotlivé záběry“: seznam (podle scénáře / podle dne), filtry, detail záběru.

import * as S from './store.js';
import { h, debounce, lsGet, lsSet, dayLabel, dayShort, matchesQuery, icon, isWide } from './util.js';
import { frame, chips, doneBox, field, lightChip, statusPill, litBlock } from './parts.js';
import { photoField } from './photos.js';

const MODE_KEY = 'poledne.mode';
const EMPTY_F = { char: '', obraz: '', day: '' };
const ui = {
  mode: lsGet(MODE_KEY) === 'day' ? 'day' : 'script',
  q: '',
  f: { ...EMPTY_F },
  sel: null,
  open: false,
  collapsed: new Set(),
  filtersOpen: null,
};

let els = {};
let visible = [];

export function mount(root, arg) {
  if (ui.filtersOpen == null) ui.filtersOpen = matchMedia('(min-width: 1200px)').matches;
  build(root);
  update(arg, { initial: true });
  return {
    update,
    keydown,
    onStore(kind) {
      if (kind === 'done') updateCount();
      else if (kind === 'structure' || kind === 'edit' || kind === 'props') refresh();
    },
  };
}

// ---------- kostra ----------
function build(root) {
  const D = S.get();
  const segBtn = (v, label, short) => h('button', {
    type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': String(ui.mode === v), 'data-mode': v,
    onclick: () => setMode(v),
  }, h('span', { class: 'lg' }, label), h('span', { class: 'sm' }, short));

  const opt = (v, l) => h('option', { value: v }, l);
  const sel = (key, label, options) => h('label', { class: 'flt' },
    h('span', { class: 'flt-l' }, label),
    h('select', {
      'data-f': key, onchange: e => { ui.f[key] = e.target.value; renderList(); syncFilterBadge(); },
    }, opt('', 'vše'), options.map(([v, l]) => opt(v, l))));


  els.seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Řazení záběrů' },
    segBtn('script', 'Podle scénáře', 'Scénář'), segBtn('day', 'Podle natáčecího dne', 'Den'));
  els.search = h('input', {
    type: 'search', class: 'search', placeholder: 'Hledat (popis, zvuk, poznámky, #)…', 'aria-label': 'Hledat v záběrech',
    value: ui.q, oninput: debounce(e => { ui.q = e.target.value.trim(); renderList(); }, 140),
  });
  els.fBadge = h('span', { class: 'badge' });
  els.fBtn = h('button', {
    type: 'button', class: 'btn btn-ghost', 'aria-expanded': String(ui.filtersOpen), 'aria-controls': 'shot-filters',
    onclick: () => { ui.filtersOpen = !ui.filtersOpen; els.filters.hidden = !ui.filtersOpen; els.fBtn.setAttribute('aria-expanded', String(ui.filtersOpen)); },
  }, icon('filter'), h('span', { class: 'btn-t' }, 'Filtry'), els.fBadge);
  els.count = h('span', { class: 'count', 'aria-live': 'polite' });
  els.filters = h('div', { class: 'filters', id: 'shot-filters', hidden: !ui.filtersOpen },
    sel('char', 'Postava', S.allChars().map(c => [c, c])),
    sel('obraz', 'Obraz / lokace', D.scenes.map(sc => [sc.n, `${sc.n} · ${sc.loc}`])),
    sel('day', 'Den', D.days.map(d => [d.date, dayLabel(d.date)])),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: clearFilters }, 'Zrušit filtry'));
  for (const s of els.filters.querySelectorAll('select')) s.value = ui.f[s.dataset.f];

  els.list = h('div', { class: 'shot-list', id: 'shot-list', role: 'region', 'aria-label': 'Seznam záběrů' });
  els.detail = h('aside', { class: 'detail', id: 'shot-detail', 'aria-label': 'Detail záběru', tabindex: '-1' });
  els.split = h('div', { class: 'split' }, els.list, els.detail);

  root.replaceChildren(h('section', { class: 'shots-view' },
    h('div', { class: 'toolbar' },
      h('div', { class: 'toolbar-row' }, els.seg, els.search, els.fBtn, els.count),
      els.filters),
    els.split));
  syncFilterBadge();
}

function clearFilters() {
  ui.f = { ...EMPTY_F };
  ui.q = '';
  els.search.value = '';
  for (const s of els.filters.querySelectorAll('select')) s.value = '';
  syncFilterBadge();
  renderList();
}

function syncFilterBadge() {
  const n = Object.values(ui.f).filter(Boolean).length;
  els.fBadge.textContent = n ? String(n) : '';
  els.fBadge.hidden = !n;
}

function setMode(v) {
  if (ui.mode === v) return;
  ui.mode = v;
  lsSet(MODE_KEY, v);
  els.seg.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === v)));
  renderList();
  renderDetail();  // návaznost v aktuálním pořadí
  scrollToSel('center');
}

function refresh() {
  renderList();
  renderDetail();
}

// ---------- filtrování ----------
function anyFilter() { return !!ui.q || Object.values(ui.f).some(Boolean); }

function matches(s) {
  const f = ui.f;
  if (f.obraz && s.obraz !== +f.obraz) return false;
  if (f.day && s.day !== f.day) return false;
  if (f.char && !S.charsFor(s.num).includes(f.char)) return false;
  if (ui.q) {
    const q = ui.q.replace(/^#(\d+)$/, '$1');
    if (/^\d+$/.test(q)) return s.num === +q;
    return matchesQuery([s.size, s.angle, s.move, s.action, s.sound, s.notes, s.contNotes].join(' '), q);
  }
  return true;
}

// ---------- seznam ----------
function renderList() {
  const D = S.get();
  const st = els.list.scrollTop;
  const out = [];
  visible = [];
  const filtering = anyFilter();

  if (ui.mode === 'script') {
    for (const sc of D.scenes) {
      const items = D.shots.filter(s => s.obraz === sc.n && matches(s));
      if (!items.length) continue;
      items.forEach(s => visible.push(s.num));
      out.push(group('o' + sc.n, sceneHead(sc, items), null, h('ol', { class: 'rows' }, items.map(s => row(s)))));
    }
  } else {
    D.days.forEach((d, di) => {
      const blocks = d.blocks.map((b, bi) => ({ b, bi, items: b.shots.map(S.shot).filter(Boolean).filter(matches) }));
      const total = blocks.reduce((a, x) => a + x.items.length, 0);
      if (!total && filtering) return;
      const body = blocks.filter(x => x.items.length || !filtering).map(x => {
        x.items.forEach(s => visible.push(s.num));
        return h('div', { class: 'blk' + (x.b.shots.length ? '' : ' is-pause') },
          blockHead(d, di, x.b, x.bi),
          x.items.length ? h('ol', { class: 'rows' }, x.items.map(s => row(s, { len: x.b.shots.length, k: x.b.shots.indexOf(s.num) }))) : null);
      });
      out.push(group('d' + d.date, dayHead(d, total), dayEdit(d, di), body));
    });
  }
  if (!out.length) {
    out.push(h('div', { class: 'empty' }, h('p', null, 'Žádný záběr neodpovídá filtrům.'),
      h('button', { type: 'button', class: 'btn', onclick: clearFilters }, 'Zrušit filtry')));
  }
  els.list.replaceChildren(...out);
  els.list.scrollTop = st;
  updateCount();
}

function updateCount() {
  const D = S.get();
  const done = D.shots.filter(s => s.done).length;
  els.count.textContent = (anyFilter() ? `${visible.length} z ${D.shots.length}` : `${D.shots.length} záběrů`) + ` · natočeno ${done}`;
}

function group(key, head, extra, body) {
  const d = h('details', { class: 'grp', open: !ui.collapsed.has(key) || anyFilter() },
    h('summary', { class: 'grp-head' }, head), extra, body);
  d.addEventListener('toggle', () => { if (d.open) ui.collapsed.delete(key); else ui.collapsed.add(key); });
  return d;
}

function sceneHead(sc, items) {
  return [
    h('span', { class: 'gh-main' },
      h('span', { class: 'gh-num' }, sc.n),
      h('span', { class: 'gh-title' }, sc.title),
      h('span', { class: 'gh-count' }, `${items.length}`)),
    h('span', { class: 'gh-meta' }, `${sc.loc} · záběry ${sc.shots[0]}–${sc.shots[1]} · ${sc.format}`),
    h('span', { class: 'gh-light' }, sc.light),
  ];
}

function dayHead(d, total) {
  return [
    h('span', { class: 'gh-main' },
      h('span', { class: 'gh-num gh-day' }, dayShort(d.date).split(' ')[0]),
      h('span', { class: 'gh-title' }, `${dayLabel(d.date)} – ${d.title.replace(/^[^–]*–\s*/, '')}`),
      h('span', { class: 'gh-count' }, `${total}`)),
  ];
}

function dayEdit(d, di) {
  if (!S.isEditing()) return null;
  const date = h('input', {
    type: 'date', value: d.date, 'aria-label': 'Datum natáčecího dne',
    onchange: e => { if (e.target.value) S.editDays(days => { days[di].date = e.target.value; }); },
  });
  return h('div', { class: 'grp-edit' }, h('label', null, 'Datum ', date),
    h('label', { class: 'grow' }, 'Název ', field(d.title, v => S.editDays(days => { days[di].title = v; }, { silent: true }), { multiline: false, label: 'Název dne' })));
}

function blockHead(d, di, b, bi) {
  const ed = S.isEditing();
  return h('div', { class: 'blk-head' },
    ed ? field(b.time, v => S.editDays(days => { days[di].blocks[bi].time = v; }, { silent: true }), { multiline: false, label: 'Čas bloku', cls: 'blk-time' })
      : h('span', { class: 'blk-time' }, b.time),
    h('span', { class: 'blk-title' }, b.title),
    b.note || ed ? (ed
      ? field(b.note, v => S.editDays(days => { days[di].blocks[bi].note = v; }, { silent: true }), { multiline: false, label: 'Poznámka bloku', placeholder: 'poznámka' })
      : h('span', { class: 'blk-note' }, b.note)) : null);
}

function row(s, pos) {
  const ed = S.isEditing() && ui.mode === 'day' && pos;
  return h('li', {
    class: 'shot-row' + (s.num === ui.sel ? ' is-sel' : '') + (s.done ? ' is-done' : ''),
    id: 'row-' + s.num, 'data-num': s.num, 'data-done-row': s.num,
  },
  h('button', {
    type: 'button', class: 'row-main', 'aria-controls': 'shot-detail',
    'aria-current': s.num === ui.sel && ui.open ? 'true' : null,
    onclick: () => select(s.num, { open: true, push: true }),
  },
  h('span', { class: 'row-num' }, s.num),
  frame(s, 'thumb'),
  h('span', { class: 'row-body' },
    h('span', { class: 'row-title' }, s.size, h('span', { class: 'row-angle' }, s.angle && s.angle !== '—' ? ' · ' + s.angle : '')),
    h('span', { class: 'row-desc' }, s.action),
    h('span', { class: 'chips' }, chips(s, { day: ui.mode === 'script' })))),
  ed ? h('span', { class: 'order-btns' },
    h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Posunout záběr ${s.num} výš`, disabled: pos.k === 0, onclick: () => S.moveShot(s.num, -1) }, icon('up')),
    h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Posunout záběr ${s.num} níž`, disabled: pos.k === pos.len - 1, onclick: () => S.moveShot(s.num, 1) }, icon('down'))) : null,
  doneBox(s));
}

// ---------- výběr a navigace ----------
function select(num, { open, push = false, focusRow = false } = {}) {
  ui.sel = num;
  if (open != null) ui.open = open;
  els.list.querySelectorAll('.shot-row.is-sel').forEach(r => r.classList.remove('is-sel'));
  els.list.querySelectorAll('.row-main[aria-current]').forEach(b => b.removeAttribute('aria-current'));
  const r = document.getElementById('row-' + num);
  if (r) {
    r.classList.add('is-sel');
    if (ui.open) r.querySelector('.row-main').setAttribute('aria-current', 'true');
    const g = r.closest('details');
    if (g && !g.open) g.open = true;
    if (focusRow) r.querySelector('.row-main').focus({ preventScroll: true });
  }
  scrollToSel('nearest');
  renderDetail();
  const hash = ui.open ? '#/zabery/' + num : '#/zabery';
  if (location.hash !== hash) history[push ? 'pushState' : 'replaceState'](null, '', hash);
  if (ui.open && !isWide()) els.detail.focus({ preventScroll: true });
}

// Na širších obrazovkách se posouvá jen seznam (ne celá stránka), na telefonu okno.
function scrollToSel(block) {
  const r = ui.sel && document.getElementById('row-' + ui.sel);
  if (!r) return;
  const list = els.list;
  if (!isWide()) {
    const top = r.getBoundingClientRect().top;
    const toolbarBottom = list.closest('.shots-view').querySelector('.toolbar').getBoundingClientRect().bottom;
    if (block === 'center' || top < toolbarBottom || top + r.offsetHeight > innerHeight - 70) {
      window.scrollBy({ top: top - (block === 'center' ? innerHeight / 2 : toolbarBottom + 8) });
    }
    return;
  }
  const lr = list.getBoundingClientRect();
  const rr = r.getBoundingClientRect();
  const head = r.closest('details')?.querySelector('summary');
  const headH = head ? head.offsetHeight : 0;
  if (block === 'center') list.scrollTop += rr.top - lr.top - lr.height / 2 + rr.height / 2;
  else if (rr.top < lr.top + headH) list.scrollTop -= lr.top + headH - rr.top;
  else if (rr.bottom > lr.bottom) list.scrollTop += rr.bottom - lr.bottom;
}

function close() {
  ui.open = false;
  renderDetail();
  if (location.hash !== '#/zabery') history.replaceState(null, '', '#/zabery');
  const r = ui.sel && document.getElementById('row-' + ui.sel);
  r?.querySelector('.row-main').removeAttribute('aria-current');
  r?.querySelector('.row-main').focus({ preventScroll: true });
}

function update(arg, { initial = false } = {}) {
  const n = parseInt(arg, 10);
  if (n && S.shot(n)) {
    if (initial) { ui.sel = n; ui.open = true; renderList(); renderDetail(); scrollToSel('center'); return; }
    if (n !== ui.sel || !ui.open) select(n, { open: true });
  } else {
    if (initial) { ui.open = false; renderList(); renderDetail(); if (ui.sel) scrollToSel('center'); return; }
    if (ui.open) { ui.open = false; renderDetail(); }
  }
}

function step(d) {
  if (!visible.length) return;
  const i = visible.indexOf(ui.sel);
  const next = i < 0 ? visible[d > 0 ? 0 : visible.length - 1] : visible[Math.min(visible.length - 1, Math.max(0, i + d))];
  const inList = !!document.activeElement?.closest('.shot-list');
  select(next, { focusRow: inList || !ui.open });
}

function keydown(e) {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); step(1); }
  else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); step(-1); }
  else if (k === 'Enter' && ui.sel && !e.target.closest('button, a, summary, label')) { e.preventDefault(); select(ui.sel, { open: true, push: true }); }
  else if (k === 'Escape' && ui.open) { e.preventDefault(); close(); }
}

// ---------- detail ----------
function renderDetail() {
  const box = els.detail;
  const prevScroll = box.dataset.num == ui.sel ? box.scrollTop : 0;
  els.split.classList.toggle('has-open', ui.open);
  document.body.classList.toggle('detail-open', ui.open);
  if (!ui.open || !ui.sel) {
    box.dataset.num = '';
    box.replaceChildren(h('div', { class: 'detail-empty' },
      icon('zabery', 'big'),
      h('p', null, 'Vyber záběr ze seznamu.'),
      h('p', { class: 'muted small' }, h('kbd', null, '↑'), ' ', h('kbd', null, '↓'), ' nebo ', h('kbd', null, 'J'), ' ', h('kbd', null, 'K'), ' pohyb · ', h('kbd', null, 'Enter'), ' otevřít · ', h('kbd', null, 'Esc'), ' zavřít')));
    return;
  }
  const s = S.shot(ui.sel);
  const sc = S.scene(s.obraz);
  const ed = S.isEditing();
  const loc = S.blockOf(s.num);
  const i = visible.indexOf(s.num);

  const head = h('header', { class: 'd-head' },
    h('button', { type: 'button', class: 'icon-btn d-close', 'aria-label': 'Zavřít detail', onclick: close }, icon(isWide() ? 'close' : 'back')),
    h('div', { class: 'd-title' },
      h('span', { class: 'd-num' }, s.num),
      h('div', null,
        h('h2', null, s.size),
        h('p', { class: 'd-sub' }, `Obraz ${sc.n} · ${sc.loc}`, loc ? ` · ${dayShort(loc.day.date)} ${loc.block.time}` : ''))),
    h('div', { class: 'd-nav' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Předchozí záběr', disabled: i <= 0, onclick: () => step(-1) }, icon('up')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Další záběr', disabled: i < 0 || i >= visible.length - 1, onclick: () => step(1) }, icon('down'))),
    doneBox(s, { big: true }));

  box.dataset.num = s.num;
  box.replaceChildren(head, h('div', { class: 'd-body' },
    secLit(s, ed),
    secBoard(s),
    secText(s, sc, ed),
    secLight(s, sc, ed),
    secProps(s),
    secSchedule(s, loc, ed),
    secNotes(s)));
  box.scrollTop = prevScroll;
}

const sec = (title, ...kids) => h('section', { class: 'd-sec' }, h('h3', null, title), ...kids);

function secLit(s, ed) {
  const D = S.get();
  const B = D.lit.blocks;
  const i = S.litIndex(s.lit);
  const nodes = [];
  if (i == null) {
    nodes.push(h('p', { class: 'muted' }, 'Záběr nemá přiřazený blok literárního scénáře.'));
  } else {
    let lastScene = null;
    for (let j = Math.max(0, i - 3); j <= Math.min(B.length - 1, i + 3); j++) {
      const b = B[j];
      if (b.scene !== lastScene) { nodes.push(h('p', { class: 'lit-heading sm' }, `${b.scene}. ${S.litHeading(b.scene)}`)); lastScene = b.scene; }
      nodes.push(litBlock(b, { hl: j === i }));
    }
  }
  let editor = null;
  if (ed) {
    const select = h('select', {
      'aria-label': 'Přiřazený blok literárního scénáře',
      onchange: e => S.setShot(s.num, { lit: e.target.value }),
    }, D.lit.scenes.map(ls => h('optgroup', { label: `${ls.n}. ${ls.heading}` },
      B.filter(b => b.scene === ls.n).map(b => h('option', { value: b.id, selected: b.id === s.lit },
        `${b.id} · ${b.char ? b.char + ': ' : ''}${b.text.slice(0, 60)}${b.text.length > 60 ? '…' : ''}`)))));
    const nudge = d => { const j = (i ?? 0) + d; if (B[j]) S.setShot(s.num, { lit: B[j].id }); };
    editor = h('div', { class: 'edit-row' },
      h('span', { class: 'edit-tag' }, 'Mapování'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => nudge(-1), 'aria-label': 'Přiřadit předchozí blok' }, '◀'),
      select,
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => nudge(1), 'aria-label': 'Přiřadit další blok' }, '▶'));
  }
  return sec('Literární scénář',
    editor,
    h('div', { class: 'lit-ctx' }, nodes),
    h('a', { class: 'more', href: '#/scenar/' + s.lit }, 'Celá scéna →'));
}

function contRow(label, order, num, current) {
  const k = order.indexOf(num);
  const cell = (n, dir) => {
    if (n == null) return h('span', { class: 'cont-cell is-none' }, dir === 'prev' ? 'začátek' : 'konec');
    const t = S.shot(n);
    return h('button', { type: 'button', class: 'cont-cell', onclick: () => select(n, { push: true }), 'aria-label': `${dir === 'prev' ? 'Předchozí' : 'Následující'} záběr ${n}` },
      frame(t, 'thumb'), h('span', { class: 'cont-n' }, dir === 'prev' ? `← ${n}` : `${n} →`));
  };
  return h('div', { class: 'cont-row' + (current ? ' is-current' : '') },
    h('span', { class: 'cont-l' }, label, current ? h('span', { class: 'muted' }, ' (aktuální)') : null),
    cell(order[k - 1], 'prev'), cell(order[k + 1], 'next'));
}

function secBoard(s) {
  const rows = [
    contRow('Natáčecí pořadí', S.dayOrderList(), s.num, ui.mode === 'day'),
    contRow('Pořadí ve scénáři', S.scriptOrderList(), s.num, ui.mode === 'script'),
  ];
  if (ui.mode === 'script') rows.reverse();
  return sec('Storyboard',
    h('a', { class: 'd-frame', href: '#/storyboard/' + s.num, title: 'Otevřít ve storyboardu' }, frame(s, 'img', { eager: true })),
    h('div', { class: 'cont' }, h('p', { class: 'cont-h' }, 'Návaznost'), rows));
}

function secText(s, sc, ed) {
  const set = k => v => S.setShot(s.num, { [k]: v }, { silent: true });
  const dl = (...pairs) => h('dl', { class: 'kv' }, pairs.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  return [
    sec('Popis akce', field(s.action, set('action'), { label: 'Popis akce', cls: 'val lead' })),
    h('div', { class: 'd-grid' },
      sec('Scénář (technický)', dl(
        ['Typ záběru', field(s.size, set('size'), { multiline: false, label: 'Typ záběru' })],
        ['Úhel', field(s.angle, set('angle'), { multiline: false, label: 'Úhel' })],
        ['Formát', h('span', null, s.ratio, sc.format !== s.ratio ? h('span', { class: 'muted' }, ` (obraz ${sc.format})`) : '')])),
      sec('Kamera', dl(
        ['Úhel', h('span', null, s.angle)],
        ['Pohyb', field(s.move, set('move'), { multiline: false, label: 'Pohyb kamery' })],
        ['Objektiv', h('span', null, S.lensFor(s) || '—')]))),
    sec('Zvuk', field(s.sound, set('sound'), { label: 'Zvuk' })),
    sec('Poznámky', field(s.notes, set('notes'), { label: 'Poznámky' })),
  ];
}

function secLight(s, sc, ed) {
  const L = S.LIGHT[s.light || ''];
  const state = ed
    ? h('select', { 'aria-label': 'Světelný stav', onchange: e => S.setShot(s.num, { light: e.target.value }) },
      ['', 'H1', 'A', 'B1', 'B2'].map(v => h('option', { value: v, selected: s.light === v }, v ? `${v} – ${S.LIGHT[v].name}` : 'bez stavu')))
    : lightChip(s.light);
  return sec('Nasvícení',
    h('div', { class: 'light-state' }, state, h('div', null, h('strong', null, L.name), h('p', { class: 'muted small' }, L.desc))),
    h('p', { class: 'kv-l' }, `Obraz ${sc.n} – světlo scény`),
    field(sc.light, v => S.setScene(sc.n, { light: v }), { label: 'Světlo scény' }),
    setupLink(s));
}

function setupLink(s) {
  const st = S.setupFor(s.num);
  if (!st) return h('a', { class: 'more', href: '#/svetlo' }, 'Plán svícení →');
  return h('div', { class: 'd-setup' },
    h('p', { class: 'kv-l' }, 'Setup svícení'),
    h('ul', { class: 'd-setup-list' }, st.lights.map(l => h('li', null, h('b', null, l.n), ` ${l.role} – ${l.fixture}`))),
    h('a', { class: 'more', href: '#/svetlo/' + st.id }, `${st.title}: schéma a nastavení →`));
}

function secProps(s) {
  const props = S.propsFor(s.num);
  const subs = S.substitutesFor(s.num);
  return sec('Rekvizity',
    props.length
      ? h('ul', { class: 'prop-list' }, props.map(p => h('li', { class: p.risky ? 'is-risky' : '' },
        h('span', { class: 'prop-name' }, p.name), p.status ? statusPill(p.status) : null)))
      : h('p', { class: 'muted' }, 'Bez rekvizit.'),
    subs.length ? h('div', { class: 'subs', role: 'note' },
      h('p', { class: 'subs-h' }, '⚠ Náhrady za rizikové'),
      h('ul', null, subs.map(x => h('li', null, h('strong', null, x.what), ' → ', x.how)))) : null);
}

function secSchedule(s, loc, ed) {
  const D = S.get();
  if (!loc && !ed) return null;
  let editor = null;
  if (ed) {
    const select = h('select', {
      'aria-label': 'Přesunout do bloku',
      onchange: e => { const [di, bi] = e.target.value.split(':').map(Number); S.moveShotTo(s.num, di, bi); },
    }, D.days.map((d, di) => h('optgroup', { label: dayLabel(d.date) },
      d.blocks.map((b, bi) => h('option', { value: `${di}:${bi}`, selected: loc && loc.di === di && loc.bi === bi }, `${b.time} ${b.title}`)))));
    editor = h('div', { class: 'edit-row' },
      h('span', { class: 'edit-tag' }, 'Blok'), select,
      h('button', { type: 'button', class: 'btn btn-sm', disabled: !loc || loc.k === 0, onclick: () => S.moveShot(s.num, -1), 'aria-label': 'Natáčet dřív' }, icon('up')),
      h('button', { type: 'button', class: 'btn btn-sm', disabled: !loc || loc.k === loc.block.shots.length - 1, onclick: () => S.moveShot(s.num, 1), 'aria-label': 'Natáčet později' }, icon('down')));
  }
  return sec('Natáčení',
    loc ? h('p', null, h('a', { href: '#/den/' + loc.day.date }, dayLabel(loc.day.date)), ` · ${loc.block.time} · ${loc.block.title}`,
      h('span', { class: 'muted' }, ` · ${loc.k + 1}. z ${loc.block.shots.length} v bloku, ${s.dayOrder}. ve dni`)) : null,
    loc?.block.note ? h('p', { class: 'muted small' }, loc.block.note) : null,
    editor);
}

function secNotes(s) {
  const ta = h('textarea', { class: 'edit-field notes', id: 'cont-notes', rows: 3, placeholder: 'Pozice rekvizit, kostým, směr pohledu, co se změnilo mezi takty…' });
  ta.value = s.contNotes || '';
  ta.addEventListener('input', debounce(() => S.setShot(s.num, { contNotes: ta.value }, { silent: true }), 300));
  return sec('Poznámky k návaznosti', h('label', { class: 'sr-only', for: 'cont-notes' }, 'Poznámky k návaznosti'), ta,
    photoField('c:' + s.num),
    h('p', { class: 'muted small' }, 'Text se sdílí přes Export JSON, fotky přes Export fotek (✎).'));
}
