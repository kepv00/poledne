// Záložka „Script“: skriptovací deník podle tabulky Skriptovací deník – POLEDNE.xlsx.
// Ostrá klapka a poznámka se ukládají po řádcích (den:záběr), Hotovo = „natočeno“ u záběru.

import * as S from './store.js';
import { h, debounce, lsGet, lsSet, dayShort, icon, toast } from './util.js';
import { doneBox } from './parts.js';
import { photoField } from './photos.js';
import { backupBox } from './backup.js';

const DAY_KEY = 'poledne.scriptDay';
const COLS = [
  ['Záběr', 'c-num'], ['Obr.', 'c-ob'], ['Typ záběru', 'c-size'], ['Kamera / Úhel / Pohyb', 'c-cam'],
  ['Popis akce a obsah záběru', 'c-act'], ['Ostrá klapka', 'c-klap'], ['Hotovo', 'c-done'], ['Poznámka skriptu (zvuk, chyby, akce)', 'c-note'],
];

export function scriptView(root, arg) {
  const SC = S.get().script;
  let sel = pickDay(arg);
  const body = h('div', { class: 'sd-body' });
  const tabs = h('nav', { class: 'sd-tabs', 'aria-label': 'Natáčecí dny' });

  function pickDay(a) {
    const ids = SC.days.map(d => d.id).concat('vse');
    if (ids.includes(a)) return a;
    const saved = lsGet(DAY_KEY);
    if (ids.includes(saved)) return saved;
    const today = new Date().toISOString().slice(0, 10);
    return (SC.days.find(d => d.date === today) || SC.days[0]).id;
  }

  const progress = d => {
    const done = d.rows.filter(r => S.shot(r.num)?.done).length;
    return `${done}/${d.rows.length}`;
  };

  function renderTabs() {
    tabs.replaceChildren(...SC.days.map(d => h('button', {
      type: 'button', class: 'sd-tab', 'aria-pressed': String(sel === d.id), onclick: () => select(d.id),
    }, h('strong', null, d.label), h('span', null, dayShort(d.date)), h('span', { class: 'sd-prog' }, progress(d)))),
    h('button', { type: 'button', class: 'sd-tab', 'aria-pressed': String(sel === 'vse'), onclick: () => select('vse') }, h('strong', null, 'Vše')));
  }

  function select(id) {
    sel = id;
    lsSet(DAY_KEY, id);
    history.replaceState(null, '', '#/script/' + id);
    renderTabs();
    renderBody();
  }

  function row(d, r, i) {
    const key = `${d.id}:${r.num}`;
    const e = S.scriptEntry(key);
    const s = S.shot(r.num);
    const klap = h('input', {
      type: 'text', class: 'sd-klap', value: e.klapka || '', inputmode: 'text', 'aria-label': `Ostrá klapka, záběr ${r.num}`,
      'data-klap': '1',
      onkeydown: ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const all = [...body.querySelectorAll('[data-klap]')];
        all[all.indexOf(ev.target) + 1]?.focus();
      },
    });
    const note = h('textarea', { class: 'sd-note', rows: 1, 'aria-label': `Poznámka skriptu, záběr ${r.num}` });
    note.value = e.note || '';
    const saveRow = debounce(() => {
      S.setScriptEntry(key, { klapka: klap.value.trim(), note: note.value });
      tr.classList.toggle('has-klap', !!klap.value.trim());
    }, 300);
    klap.addEventListener('input', saveRow);
    note.addEventListener('input', saveRow);
    const tr = h('tr', { class: (i % 2 ? 'is-odd' : '') + (s?.done ? ' is-done' : '') + (e.klapka ? ' has-klap' : ''), 'data-done-row': r.num },
      h('td', { class: 'c-num', 'data-l': 'Záběr' }, h('a', { href: '#/zabery/' + r.num, title: s ? s.action : '' }, r.num)),
      h('td', { class: 'c-ob', 'data-l': 'Obr.' }, r.obraz),
      h('td', { class: 'c-size', 'data-l': 'Typ' }, r.size),
      h('td', { class: 'c-cam', 'data-l': 'Kamera' }, r.camera),
      h('td', { class: 'c-act', 'data-l': 'Akce' }, r.action),
      h('td', { class: 'c-klap', 'data-l': 'Klapka' }, klap),
      h('td', { class: 'c-done', 'data-l': 'Hotovo' }, s ? doneBox(s) : null),
      h('td', { class: 'c-note', 'data-l': 'Poznámka' }, note, photoField('s:' + key, { compact: true })));
    return tr;
  }

  function daySection(d) {
    return h('section', { class: 'sd-day', id: 'sd-' + d.id },
      h('div', { class: 'sd-banner' },
        h('p', { class: 'sd-banner-t' }, `${d.label.toUpperCase()}: ${d.title}`),
        h('p', { class: 'sd-banner-i' }, [d.time, d.place, d.cast].filter(Boolean).join(' | '))),
      h('table', { class: 'sd-table' },
        h('colgroup', null, COLS.map(([, c]) => h('col', { class: c }))),
        h('thead', null, h('tr', null, COLS.map(([t, c]) => h('th', { scope: 'col', class: c }, t)))),
        h('tbody', null, d.rows.map((r, i) => row(d, r, i)))));
  }

  function renderBody() {
    const days = sel === 'vse' ? SC.days : SC.days.filter(d => d.id === sel);
    body.replaceChildren(...days.map(daySection));
  }

  function crewField(key, label) {
    const inp = h('input', { type: 'text', value: SC.crew?.[key] || '', 'aria-label': label, placeholder: '…' });
    inp.addEventListener('input', debounce(() => S.setScriptCrew({ [key]: inp.value.trim() }), 300));
    return h('label', { class: 'sd-crew-f' }, h('span', null, label), inp);
  }

  function exportCsv() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Den', 'Datum', 'Záběr', 'Obr.', 'Typ záběru', 'Kamera / Úhel / Pohyb', 'Popis akce a obsah záběru', 'Ostrá klapka', 'Hotovo', 'Poznámka skriptu'].map(q).join(';')];
    for (const d of SC.days) for (const r of d.rows) {
      const e = S.scriptEntry(`${d.id}:${r.num}`);
      lines.push([d.label, d.date, r.num, r.obraz, r.size, r.camera, r.action, e.klapka, S.shot(r.num)?.done ? 'ano' : '', e.note].map(q).join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `skriptovaci-denik-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Deník stažen jako CSV (otevře se v Excelu).');
  }

  function printDiary() {
    document.body.classList.add('print-script');
    addEventListener('afterprint', () => document.body.classList.remove('print-script'), { once: true });
    window.print();
  }

  root.replaceChildren(h('div', { class: 'page page-wide sd' },
    h('header', { class: 'sd-head' },
      h('div', null,
        h('h1', null, SC.title.toUpperCase()),
        h('p', { class: 'muted' }, SC.subtitle)),
      h('div', { class: 'page-actions' },
        h('button', { type: 'button', class: 'btn', onclick: exportCsv }, icon('download'), 'Export CSV'),
        h('button', { type: 'button', class: 'btn', onclick: printDiary }, icon('print'), 'Tisk'),
        h('a', { class: 'btn btn-ghost', href: SC.file, download: '' }, icon('download'), 'Původní .xlsx'))),
    h('div', { class: 'sd-crew' },
      h('label', { class: 'sd-crew-f' }, h('span', null, 'Režie'), h('strong', null, SC.crew?.rezie || '—')),
      crewField('skript', 'Skript'), crewField('kamera', 'Kamera'),
      backupBox(),
      h('p', { class: 'muted small' }, 'Klapky a poznámky se ukládají v tomto prohlížeči, sdílí se přes Export JSON (✎). Hotovo = natočeno u záběru.')),
    tabs, body));
  renderTabs();
  renderBody();

  return {
    update(a) { const id = pickDay(a); if (id !== sel) select(id); },
    onStore(kind) {
      if (kind === 'done') renderTabs();
      else if (kind === 'structure') { renderTabs(); renderBody(); }
    },
  };
}
