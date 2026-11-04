// Ostatní záložky: natáčecí plán, literární a technický scénář, storyboard, světlo a rekvizity, Google Disk.

import * as S from './store.js';
import { h, debounce, dayLabel, dayShort, year, matchesQuery, highlight, icon } from './util.js';
import { frame, chips, doneBox, field, statusPill, litBlock, shotLink } from './parts.js';
import { printDays } from './print.js';
import { diagram, legend } from './diagram.js';

const pageHead = (title, sub, ...actions) => h('header', { class: 'page-head' },
  h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null),
  actions.length ? h('div', { class: 'page-actions' }, actions) : null);

function flash(el) {
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ================= Natáčecí plán =================
export function planView(root, arg) {
  function render() {
    const D = S.get();
    const first = D.days[0]?.date, last = D.days.at(-1)?.date;
    root.replaceChildren(h('div', { class: 'page' },
      pageHead('Natáčecí plán', first ? `${dayLabel(first)} – ${dayLabel(last)} ${year(last)} · ${D.days.length} natáčecí dny` : '',
        h('button', { type: 'button', class: 'btn', onclick: () => printDays(D.days.map(d => d.date)) }, icon('print'), 'Tisk všech dní')),
      h('nav', { class: 'day-jump', 'aria-label': 'Přejít na den' },
        D.days.map(d => h('a', { class: 'chip-link', href: '#/den/' + d.date }, dayShort(d.date)))),
      D.days.map((d, di) => dayCard(d, di))));
  }

  function dayCard(d, di) {
    const ed = S.isEditing();
    const nums = d.blocks.flatMap(b => b.shots);
    return h('section', { class: 'day-card', id: 'day-' + d.date, 'aria-labelledby': 'dh-' + d.date },
      h('header', { class: 'day-head' },
        h('div', { class: 'day-titles' },
          h('h2', { id: 'dh-' + d.date }, `${dayLabel(d.date)} ${year(d.date)}`),
          ed ? h('div', { class: 'edit-row' },
            h('label', null, 'Datum ', h('input', {
              type: 'date', value: d.date,
              onchange: e => { if (e.target.value) { S.editDays(days => { days[di].date = e.target.value; }); location.hash = '#/den/' + e.target.value; } },
            })),
            field(d.title, v => S.editDays(days => { days[di].title = v; }, { silent: true }), { multiline: false, label: 'Název dne' }))
            : h('p', { class: 'day-title' }, d.title.replace(/^[^–]*–\s*/, ''))),
        h('div', { class: 'day-meta' },
          progress(nums),
          h('button', { type: 'button', class: 'btn', onclick: () => printDays([d.date]) }, icon('print'), 'Tisk dne'))),
      h('ol', { class: 'blocks' }, d.blocks.map((b, bi) => blockItem(d, di, b, bi, ed))));
  }

  function progress(nums) {
    const done = nums.filter(n => S.shot(n)?.done).length;
    const pct = nums.length ? Math.round(done / nums.length * 100) : 0;
    return h('div', { class: 'progress', 'data-progress': nums.join(',') },
      h('span', { class: 'progress-t' }, `natočeno ${done}/${nums.length}`),
      h('span', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Natočeno' },
        h('span', { style: `width:${pct}%` })));
  }

  function blockItem(d, di, b, bi, ed) {
    const set = k => v => S.editDays(days => { days[di].blocks[bi][k] = v; }, { silent: true });
    return h('li', { class: 'block' + (b.shots.length ? '' : ' is-pause') },
      h('div', { class: 'block-time' }, ed ? field(b.time, set('time'), { multiline: false, label: 'Čas' }) : b.time),
      h('div', { class: 'block-body' },
        h('h3', null, ed ? field(b.title, set('title'), { multiline: false, label: 'Název bloku' }) : b.title),
        ed ? field(b.note, set('note'), { label: 'Poznámka', placeholder: 'poznámka k bloku' })
          : b.note ? h('p', { class: 'block-note' }, b.note) : null,
        b.shots.length ? h('ul', { class: 'pshots' }, b.shots.map(n => {
          const s = S.shot(n);
          return h('li', { class: 'pshot' + (s.done ? ' is-done' : ''), 'data-done-row': n },
            doneBox(s),
            h('a', { href: '#/zabery/' + n, class: 'pshot-link', title: s.action },
              frame(s, 'thumb'),
              h('span', { class: 'pshot-t' }, h('strong', null, n), ' ', s.size)));
        })) : null));
  }

  function syncProgress() {
    root.querySelectorAll('[data-progress]').forEach(el => {
      const nums = el.dataset.progress ? el.dataset.progress.split(',').map(Number) : [];
      el.replaceWith(progress(nums));
    });
  }

  function update(a) {
    if (a && /^\d{4}-\d{2}-\d{2}$/.test(a)) requestAnimationFrame(() => flash(document.getElementById('day-' + a)));
  }

  render();
  update(arg);
  return {
    update,
    onStore(kind) { if (kind === 'done') syncProgress(); else if (kind === 'structure' || kind === 'edit') render(); },
  };
}

// ================= Literární scénář =================
export function litView(root, arg) {
  let q = '';
  const D = S.get();
  const out = h('div', { class: 'lit-doc' });
  const count = h('span', { class: 'count', 'aria-live': 'polite' });
  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Hledat ve scénáři…', 'aria-label': 'Hledat ve scénáři',
    oninput: debounce(e => { q = e.target.value.trim(); render(); }, 150),
  });
  const jump = h('select', {
    'aria-label': 'Přejít na scénu',
    onchange: e => { if (e.target.value) flash(document.getElementById('lsc-' + e.target.value)); e.target.value = ''; },
  }, h('option', { value: '' }, 'Přejít na scénu…'), D.lit.scenes.map(sc => h('option', { value: sc.n }, `${sc.n}. ${sc.heading}`)));

  function render() {
    const blocks = S.get().lit.blocks;
    let hits = 0;
    const secs = S.get().lit.scenes.map(sc => {
      const bs = blocks.filter(b => b.scene === sc.n && (!q || matchesQuery((b.char || '') + ' ' + b.text, q)));
      hits += bs.length;
      if (q && !bs.length) return null;
      return h('section', { class: 'lit-scene', id: 'lsc-' + sc.n },
        h('h2', { class: 'lit-heading' }, `${sc.n}. `, q ? highlight(sc.heading, q) : sc.heading),
        bs.map(b => {
          const nums = S.shotsForLit(b.id);
          return h('div', { class: 'lit-row', id: 'lit-' + b.id },
            litBlock(b, { q }),
            h('div', { class: 'lit-shots' }, nums.length
              ? [h('span', { class: 'lit-shots-l' }, 'záběry '), nums.map(n => shotLink(n))]
              : null));
        }));
    });
    out.replaceChildren(...secs.filter(Boolean));
    if (q && !hits) out.append(h('p', { class: 'empty' }, 'Nic nenalezeno.'));
    count.textContent = q ? `${hits} bloků` : `${blocks.length} bloků · ${S.get().lit.scenes.length} scén`;
  }

  function update(a) {
    if (!a) return;
    if (q) { q = ''; search.value = ''; render(); }
    const el = /^\d+$/.test(a) ? document.getElementById('lsc-' + a) : document.getElementById('lit-' + a);
    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    });
  }

  root.replaceChildren(h('div', { class: 'page page-narrow' },
    pageHead('Literární scénář', 'Poledne · scénář Lukáš Jonáš',
      h('a', { class: 'btn', href: 'poledne_lit_sc.pdf', download: '' }, icon('download'), 'poledne_lit_sc.pdf (55 kB)')),
    h('div', { class: 'toolbar toolbar-page' }, h('div', { class: 'toolbar-row' }, search, jump, count)),
    out));
  render();
  update(arg);
  return { update, onStore(kind) { if (kind === 'structure' || kind === 'done') render(); } };
}

// ================= Technický scénář =================
// Podoba jako dokument poledne_tech_sc.docx na Disku: titulní strana, úvodní kapitoly,
// u každého obrazu „Tech look“ a tabulka záběrů. Tabulky se plní z data.json (editovatelné).
const TECH_COLS = [['#', 'c-num'], ['Typ záběru', 'c-size'], ['Úhel kamery', 'c-angle'], ['Pohyb kamery', 'c-move'], ['Zvuk', 'c-sound'], ['Poznámky', 'c-notes'], ['Popis akce', 'c-act']];

export function techView(root) {
  let q = '', ob = '';
  const D = S.get();
  const T = D.techDoc;
  const count = h('span', { class: 'count', 'aria-live': 'polite' });
  const paper = h('article', { class: 'doc', 'aria-label': 'Technický scénář' });
  const hl = v => (q ? highlight(v, q) : v);

  function cover() {
    if (!T) return null;
    const c = T.cover;
    return [
      h('header', { class: 'doc-cover' },
        h('p', { class: 'doc-school' }, c.school.map((l, i) => [i ? h('br') : null, l])),
        h('p', { class: 'doc-kicker' }, c.kicker),
        h('h1', { class: 'doc-title' }, c.title),
        h('p', { class: 'doc-genre' }, c.genre),
        h('p', { class: 'doc-motif' }, c.motif),
        h('p', { class: 'doc-credits' }, c.credits.map((l, i) => [i ? h('br') : null, l]))),
      T.sections.map(sec => h('section', { class: 'doc-sec' },
        h('h2', { class: 'doc-h1' }, sec.heading),
        groupItems(sec.items))),
    ];
  }

  // sousední odrážky spojí do jednoho <ul>
  function groupItems(items) {
    const out = [];
    let ul = null;
    for (const it of items) {
      if (it.li != null) { if (!ul) out.push(ul = h('ul', { class: 'doc-ul' })); ul.append(h('li', null, it.li)); continue; }
      ul = null;
      if (it.img) out.push(h('figure', { class: 'doc-fig' }, h('img', { src: it.img, alt: 'Půdorys bytu: lodžie, kuchyň, chodba, WC a koupelna', loading: 'lazy' })));
      else out.push(h('p', { class: 'doc-p' + (it.i ? ' is-i' : '') }, it.p));
    }
    return out;
  }

  function table(rows) {
    return h('table', { class: 'doc-table' },
      h('thead', null, h('tr', null, TECH_COLS.map(([t, c]) => h('th', { scope: 'col', class: c }, t)))),
      h('tbody', null, rows.map(s => h('tr', { class: s.done ? 'is-done' : '', 'data-done-row': s.num },
        h('td', { class: 'c-num', 'data-l': '#' }, h('a', { href: '#/zabery/' + s.num, title: 'Detail záběru' }, s.num)),
        h('td', { 'data-l': 'Typ záběru' }, hl(s.size)),
        h('td', { 'data-l': 'Úhel kamery' }, hl(s.angle)),
        h('td', { 'data-l': 'Pohyb kamery' }, hl(s.move)),
        h('td', { 'data-l': 'Zvuk' }, hl(s.sound)),
        h('td', { 'data-l': 'Poznámky' }, hl(s.notes)),
        h('td', { 'data-l': 'Popis akce' }, hl(s.action))))));
  }

  function sceneBlock(sc, shots) {
    const t = sc.tech || { heading: `${sc.title}  (${sc.format})`, lenses: sc.lenses, light: [sc.light], notes: [], parts: [] };
    const parts = t.parts.length ? t.parts : [{ title: null, from: sc.shots[0] }];
    const blocks = parts.map((p, i) => {
      const to = parts[i + 1]?.from ?? Infinity;
      const rows = shots.filter(s => s.num >= p.from && s.num < to);
      if (!rows.length) return null;
      return [p.title ? h('p', { class: 'doc-part' }, `— ${p.title} —`) : null, table(rows)];
    });
    return h('section', { class: 'doc-obraz', id: 'tobraz-' + sc.n },
      h('h2', { class: 'doc-h-obraz' }, `Obraz ${sc.n} — ${t.heading}`),
      q ? null : [
        h('p', { class: 'doc-look' }, 'Tech look:'),
        h('ul', { class: 'doc-ul' },
          h('li', null, `Objektivy: ${t.lenses}`),
          h('li', null, 'Světlo:', h('ul', { class: 'doc-ul2' }, t.light.map(l => h('li', null, l))))),
        t.notes.map(n => h('p', { class: 'doc-p' }, n)),
      ],
      blocks);
  }

  function render() {
    const D2 = S.get();
    let n = 0;
    const scenes = D2.scenes.filter(sc => !ob || sc.n === +ob).map(sc => {
      const shots = D2.shots.filter(s => s.obraz === sc.n && matchesQuery([s.num, s.size, s.angle, s.move, s.sound, s.notes, s.action].join(' '), q));
      n += shots.length;
      return shots.length ? sceneBlock(sc, shots) : null;
    }).filter(Boolean);
    paper.replaceChildren(...[q || ob ? null : cover(), scenes].flat(Infinity).filter(Boolean));
    if (!scenes.length) paper.append(h('p', { class: 'empty' }, 'Nic nenalezeno.'));
    count.textContent = `${n} záběrů`;
  }

  root.replaceChildren(h('div', { class: 'page page-wide' },
    pageHead('Technický scénář', `${D.shots.length} záběrů v ${D.scenes.length} obrazech · podle dokumentu na Disku`,
      T?.file ? h('a', { class: 'btn', href: T.file, download: '' }, icon('download'), `${T.file} (0,6 MB)`) : null),
    h('div', { class: 'toolbar toolbar-page' }, h('div', { class: 'toolbar-row' },
      h('input', { type: 'search', class: 'search', placeholder: 'Filtrovat záběry…', 'aria-label': 'Filtrovat technický scénář', oninput: debounce(e => { q = e.target.value.trim(); render(); }, 150) }),
      h('select', { 'aria-label': 'Obraz', onchange: e => { ob = e.target.value; render(); } },
        h('option', { value: '' }, 'Celý dokument'), D.scenes.map(sc => h('option', { value: sc.n }, `Obraz ${sc.n} · ${sc.loc}`))),
      count)),
    paper));
  render();
  return { onStore(kind) { if (kind === 'structure') render(); } };
}

// ================= Storyboard =================
export function boardView(root, arg) {
  let ob = '';
  const D = S.get();
  const grid = h('div', { class: 'board' });
  const dlg = h('dialog', { class: 'lightbox', 'aria-label': 'Storyboard – zvětšený záběr' });
  let cur = null;
  let list = [];

  function render() {
    list = S.get().shots.filter(s => !ob || s.obraz === +ob);
    grid.replaceChildren(...list.map(s => h('button', {
      type: 'button', class: 'board-item' + (s.done ? ' is-done' : ''), 'data-done-row': s.num,
      onclick: () => { history.pushState(null, '', '#/storyboard/' + s.num); open(s.num); },
      'aria-label': `Záběr ${s.num}: ${s.size}`,
    }, frame(s, 'thumb'), h('span', { class: 'board-cap' }, h('strong', null, s.num), ' ', s.size))));
  }

  function open(n) {
    const s = S.shot(n);
    if (!s) return;
    cur = n;
    const k = list.findIndex(x => x.num === n);
    const prev = list[k - 1], next = list[k + 1];
    dlg.replaceChildren(
      h('div', { class: 'lb-top' },
        h('p', { class: 'lb-title' }, h('strong', null, `#${s.num}`), ` ${s.size} · ${s.angle}`, h('span', { class: 'chips' }, chips(s))),
        h('a', { class: 'btn btn-sm', href: '#/zabery/' + s.num }, 'Detail záběru'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zavřít', onclick: closeLb }, icon('close'))),
      h('div', { class: 'lb-stage' },
        h('button', { type: 'button', class: 'lb-arrow l', 'aria-label': 'Předchozí', disabled: !prev, onclick: () => go(-1) }, icon('left')),
        frame(s, 'img', { eager: true }),
        h('button', { type: 'button', class: 'lb-arrow r', 'aria-label': 'Další', disabled: !next, onclick: () => go(1) }, icon('right'))),
      h('p', { class: 'lb-cap' }, s.action));
    if (!dlg.open) dlg.showModal();
    // přednačti sousedy
    [prev, next].forEach(x => { if (x?.img) new Image().src = x.img; });
  }

  function go(d) {
    const k = list.findIndex(x => x.num === cur);
    const t = list[k + d];
    if (t) { history.replaceState(null, '', '#/storyboard/' + t.num); open(t.num); }
  }

  function closeLb() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    if (location.hash.startsWith('#/storyboard/')) history.replaceState(null, '', '#/storyboard');
    document.querySelector(`.board-item[data-done-row="${cur}"]`)?.focus();
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) closeLb(); });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });

  root.replaceChildren(h('div', { class: 'page page-wide' },
    pageHead('Storyboard', `${D.shots.filter(s => s.img).length} kreseb · verze 3`,
      h('a', { class: 'btn', href: 'storyboard_v3.pdf', download: '' }, icon('download'), 'storyboard_v3.pdf (15 MB)')),
    h('div', { class: 'toolbar toolbar-page' }, h('div', { class: 'toolbar-row' },
      h('select', { 'aria-label': 'Obraz', onchange: e => { ob = e.target.value; render(); } },
        h('option', { value: '' }, 'Všechny obrazy'), D.scenes.map(sc => h('option', { value: sc.n }, `Obraz ${sc.n} · ${sc.loc}`))))),
    grid, dlg));
  render();

  function update(a) {
    const n = parseInt(a, 10);
    if (n) open(n); else closeLb();
  }
  update(arg);
  return { update, unmount: closeLb };
}

// ================= Světlo a rekvizity =================
export function lightView(root, arg) {
  const D = S.get();
  const L = D.lighting;
  const TEMP = { warm: 'teplé', neutral: 'neutrální', cool: 'studené' };

  function equipment() {
    return h('section', { class: 'lp-card lp-gear', id: 'lp-technika' },
      h('h2', null, 'Technika'),
      h('div', { class: 'gear-grid' }, L.equipment.map(g => h('div', { class: 'gear-g' },
        h('h3', null, g.group),
        h('ul', null, g.items.map(it => h('li', null,
          h('span', { class: 'gear-qty' }, it.qty ? `${it.qty}×` : ''),
          h('span', { class: 'gear-name' }, it.name, it.note ? h('span', { class: 'gear-note' }, it.note) : null),
          h('span', { class: 'gear-src s-' + (it.src === 'pronájem' ? 'rent' : 'own') }, it.src))))))),
      L.questions?.length ? h('div', { class: 'subs lp-q', role: 'note' },
        h('p', { class: 'subs-h' }, 'K vyřešení před natáčením'),
        h('ul', null, L.questions.map(q => h('li', null, q)))) : null);
  }

  function badgeFor(n) {
    const cls = /^\d$/.test(n) ? 'b-num' : n === 'P' ? 'b-bounce' : n === 'F' ? 'b-flag' : 'b-misc';
    return h('span', { class: 'lp-badge ' + cls }, n);
  }

  function setupCard(st) {
    const nums = S.shotsForSetup(st.id);
    const days = [...new Set(nums.map(n => S.shot(n).day))].sort();
    return h('section', { class: 'lp-card lp-setup', id: 'lp-' + st.id, 'aria-labelledby': 'lph-' + st.id },
      h('header', { class: 'lp-head' },
        h('div', null,
          h('h2', { id: 'lph-' + st.id }, st.title, st.state ? h('span', { class: `chip chip-l l-${st.state}` }, st.state) : null),
          h('p', { class: 'lp-meta' }, `${nums.length} záběrů`, days.length ? ' · ' + days.map(dayShort).join(', ') : '')),
        h('p', { class: 'lp-mood' }, st.mood)),
      h('div', { class: 'lp-body' + (st.diagrams.length ? '' : ' no-dg') },
        st.diagrams.length ? h('div', { class: 'lp-dgs' }, st.diagrams.map(dg => h('figure', { class: 'lp-dg' },
          h('div', { class: 'lp-svg', html: diagram(dg) }),
          h('figcaption', null, dg.title)))) : null,
        h('div', { class: 'lp-side' },
          h('table', { class: 'lp-table' },
            h('thead', null, h('tr', null, ['', 'Co', 'Světlo / prvek', 'Kde', 'Nastavení'].map(t => h('th', { scope: 'col' }, t)))),
            h('tbody', null, st.lights.map(l => h('tr', null,
              h('td', { class: 'c-b' }, badgeFor(l.n)),
              h('td', { 'data-l': 'Co' }, h('strong', null, l.role)),
              h('td', { 'data-l': 'Světlo' }, l.fixture),
              h('td', { 'data-l': 'Kde' }, l.where),
              h('td', { 'data-l': 'Nastavení' }, l.set))))),
          st.tips?.length ? h('ul', { class: 'lp-tips' }, st.tips.map(t => h('li', null, t))) : null,
          nums.length ? h('details', { class: 'lp-shots' },
            h('summary', null, `Záběry v tomto setupu (${nums.length})`),
            h('div', { class: 'lp-shot-links' }, nums.map(n => shotLink(n)))) : null)));
  }

  const propsBox = h('div');
  function renderProps() {
    const D2 = S.get();
    const ed = S.isEditing();
    const cnt = st => D2.props.filter(p => (p.status || 'Nemáme') === st).length;
    propsBox.replaceChildren(
      h('div', { class: 'props-head' },
        h('h2', null, 'Rekvizity'),
        h('p', { class: 'props-sum' }, S.PROP_STATUS.map(st => h('span', null, statusPill(st), ' ', cnt(st)))),
        h('a', { class: 'btn', href: 'rekvizity.pdf', target: '_blank', rel: 'noopener' }, icon('external'), 'rekvizity.pdf')),
      ed ? null : h('p', { class: 'muted small' }, 'Stav rekvizit se mění v režimu úprav (✎).'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'props' },
        h('thead', null, h('tr', null, ['Rekvizita', 'Obraz', 'Záběry', 'Poznámka', 'Stav'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, D2.props.map((p, i) => h('tr', { class: /náhrada/i.test(p.note) ? 'is-risky' : '' },
          h('td', { 'data-l': 'Rekvizita' }, h('strong', null, p.name)),
          h('td', { 'data-l': 'Obraz' }, p.obraz.join(', ')),
          h('td', { 'data-l': 'Záběry' }, p.shots),
          h('td', { 'data-l': 'Poznámka', class: 'muted' }, p.note || '—'),
          h('td', { 'data-l': 'Stav' }, ed
            ? h('select', { 'aria-label': `Stav: ${p.name}`, 'data-sync': 'prop:' + i, onchange: e => S.setProp(i, { status: e.target.value }) },
              S.PROP_STATUS.map(st => h('option', { value: st, selected: (p.status || 'Nemáme') === st }, st)))
            : statusPill(p.status || 'Nemáme'))))))));
  }

  const go = id => { const el = document.getElementById(id); if (el) { history.replaceState(null, '', '#/svetlo/' + id.replace(/^lp-/, '')); flash(el); } };
  root.replaceChildren(h('div', { class: 'page page-wide lp' },
    pageHead('Světlo a rekvizity', 'Setupy svícení po lokacích, technika a rekvizity'),
    h('nav', { class: 'day-jump lp-nav', 'aria-label': 'Přejít na' },
      h('button', { type: 'button', class: 'chip-link', onclick: () => go('lp-technika') }, 'Technika'),
      L.setups.map(st => h('button', { type: 'button', class: 'chip-link', onclick: () => go('lp-' + st.id) }, st.title)),
      h('button', { type: 'button', class: 'chip-link', onclick: () => go('props') }, 'Rekvizity')),
    h('section', { class: 'lp-card lp-intro' },
      h('p', { class: 'lp-principle' }, L.intro),
      h('div', { class: 'lp-legend', html: legend() }),
      h('p', { class: 'muted small' }, 'Barva kužele: ', h('span', { class: 'lp-temp t-warm' }, TEMP.warm), ' ', h('span', { class: 'lp-temp t-neutral' }, TEMP.neutral), ' ', h('span', { class: 'lp-temp t-cool' }, TEMP.cool), '. ', L.sketchNote)),
    equipment(),
    L.setups.map(setupCard),
    h('section', { class: 'props-wrap', id: 'props' }, propsBox)));
  renderProps();

  function update(a) {
    if (!a) return;
    const id = a === 'rekvizity' ? 'props' : a === 'technika' ? 'lp-technika' : 'lp-' + a;
    requestAnimationFrame(() => flash(document.getElementById(id)));
  }
  update(arg);
  return {
    update,
    onStore(kind) { if (kind === 'structure' || kind === 'edit' || kind === 'props') renderProps(); },
  };
}

// ================= Google Disk =================
export function driveView(root) {
  function render() {
    const url = S.get().config.driveUrl;
    const ok = /^https?:\/\//.test(url || '');
    root.replaceChildren(h('div', { class: 'page page-narrow drive' },
      pageHead('Google Disk', 'Sdílená složka produkce Poledne // AV2 – casting, fotky, plán, rozpočty, scénáře'),
      h('img', { class: 'drive-banner', src: 'img/banner.jpg', alt: 'Banner filmu Poledne', width: 1800, height: 1121 }),
      ok
        ? h('a', { class: 'drive-btn', href: url, target: '_blank', rel: 'noopener' }, icon('disk', 'big'), h('span', null, 'Otevřít složku na Google Disku'), icon('external'))
        : h('div', { class: 'drive-btn is-off', 'aria-disabled': 'true' }, icon('disk', 'big'), h('span', null, 'Odkaz zatím není nastaven')),
      S.isEditing()
        ? h('label', { class: 'drive-edit' }, h('span', null, 'URL složky'),
          field(url, v => { S.setConfig({ driveUrl: v.trim() }); }, { multiline: false, label: 'URL Google Disku', placeholder: 'https://drive.google.com/drive/folders/…' }),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: render }, 'Použít'))
        : (!ok ? h('p', { class: 'muted' }, 'Odkaz se nastaví v režimu úprav (✎ vpravo dole), trvale pak exportem do data.json → config.driveUrl.') : null)));
  }
  render();
  return { onStore(kind) { if (kind === 'edit' || kind === 'structure') render(); } };
}
