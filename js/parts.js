// Sdílené stavební kousky UI: rámeček záběru, štítky, editovatelná pole, bloky literárního scénáře.

import * as S from './store.js';
import { h, debounce, dayShort, highlight } from './util.js';

// Obrázek v 16:9 slotu; vnitřní rámeček má skutečný poměr stran záběru (4:3 je opravdu 4:3).
export function frame(s, kind = 'thumb', { eager = false } = {}) {
  const src = kind === 'thumb' ? s.thumb : s.img;
  const ratio = (s.ratio || '16:9').replace(':', ' / ');
  return h('span', { class: `frame frame-${kind}` },
    h('span', { class: 'frame-in', style: `aspect-ratio:${ratio}` },
      src
        ? h('img', { src, alt: kind === 'img' ? `Storyboard záběru ${s.num}: ${s.action}` : '', loading: eager ? 'eager' : 'lazy', decoding: 'async' })
        : h('span', { class: 'frame-black' }, 'černý záběr')));
}

const FLAG_SHORT = { 'Eliška (7 let)': 'Eliška 7', 'panenka': 'panenka', 'dítě (Filípek)': 'dítě' };

export function lightChip(state) {
  const L = S.LIGHT[state || ''];
  return h('span', { class: `chip chip-l l-${state || 'none'}`, title: `Světelný stav: ${L.name}` }, L.label);
}

export function chips(s, { day = true } = {}) {
  return [
    s.light ? lightChip(s.light) : null,
    h('span', { class: 'chip chip-r' + (s.ratio !== '16:9' ? ' is-alt' : ''), title: 'Poměr stran' }, s.ratio),
    s.flags.map(f => h('span', { class: 'chip chip-f f-' + (f.startsWith('Eli') ? 'e' : f.startsWith('pan') ? 'p' : 'd'), title: f }, FLAG_SHORT[f] || f)),
    day && s.day ? h('span', { class: 'chip chip-d', title: 'Natáčecí den' }, dayShort(s.day)) : null,
  ];
}

// Checkbox „natočeno“ – funguje i mimo režim úprav a synchronizuje všechny výskyty.
export function doneBox(s, { big = false } = {}) {
  const cb = h('input', {
    type: 'checkbox', checked: s.done, 'data-done-cb': s.num,
    'aria-label': `Záběr ${s.num} natočeno`,
    onchange: e => setDone(s.num, e.target.checked),
  });
  return h('label', { class: 'done-box' + (big ? ' big' : ''), title: 'Natočeno' }, cb,
    h('span', { class: 'done-mark', 'aria-hidden': 'true' }), big ? h('span', { class: 'done-label' }, 'natočeno') : null);
}

export function setDone(num, val) {
  S.setShot(num, { done: val }, { silent: true });
  paintDone(num, val);
}

export function paintDone(num, val) {
  document.querySelectorAll(`[data-done-cb="${num}"]`).forEach(cb => { cb.checked = val; });
  document.querySelectorAll(`[data-done-row="${num}"]`).forEach(r => r.classList.toggle('is-done', val));
}

// V náhledu text, v režimu úprav textarea/input; ukládá průběžně.
export function field(value, onSave, { multiline = true, label = '', cls = 'val', placeholder = '' } = {}) {
  if (!S.isEditing()) {
    return h(multiline ? 'p' : 'span', { class: cls + (value && value !== '—' ? '' : ' is-empty') }, value || '—');
  }
  const el = h(multiline ? 'textarea' : 'input', {
    class: 'edit-field' + (multiline ? '' : ' single'), 'aria-label': label, placeholder,
    rows: multiline ? Math.max(2, Math.ceil(String(value || '').length / 70)) : null,
    type: multiline ? null : 'text',
  });
  el.value = value || '';
  const commit = debounce(() => onSave(el.value), 350);
  el.addEventListener('input', commit);
  el.addEventListener('change', () => onSave(el.value));
  return el;
}

export function statusPill(st) {
  const cls = st === 'Máme' ? 'ok' : st === 'Sehnáno' ? 'warn' : 'bad';
  return h('span', { class: 'pill pill-' + cls }, st || '—');
}

export function litBlock(b, { hl = false, q = '' } = {}) {
  const txt = q ? highlight(b.text, q) : b.text;
  if (b.kind === 'dialogue') {
    return h('div', { class: 'lit-b lit-dlg' + (hl ? ' is-hl' : ''), 'data-id': b.id },
      h('span', { class: 'lit-char' }, q ? highlight(b.char, q) : b.char),
      h('p', { class: 'lit-line' }, txt));
  }
  return h('div', { class: 'lit-b lit-act' + (hl ? ' is-hl' : ''), 'data-id': b.id }, h('p', null, txt));
}

export function shotLink(n, { label } = {}) {
  const s = S.shot(n);
  return h('a', { class: 'shot-link' + (s?.done ? ' is-done' : ''), href: '#/zabery/' + n, 'data-done-row': n, title: s ? `${s.size} – ${s.action}` : '' }, label ?? n);
}
