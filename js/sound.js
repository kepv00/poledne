// Záložka „Zvukový plán“ podle ZVUKOVEJ PLÁN.pdf: po scénách prostor, dialogy, ruchy a hrozby.
// Zobrazení „Popořadě“ (všechny scény 1→7) nebo „Podle scén“ (jedna vybraná scéna).

import * as S from './store.js';
import { h, lsGet, lsSet, dayShort, icon } from './util.js';
import { shotLink } from './parts.js';

const MODE_KEY = 'poledne.soundMode';
const SCENE_KEY = 'poledne.soundScene';

export function soundView(root, arg) {
  const SP = S.get().sound;
  const scenes = [...SP.scenes].sort((a, b) => a.n - b.n);
  let mode = lsGet(MODE_KEY) === 'scene' ? 'scene' : 'all';
  let cur = +lsGet(SCENE_KEY) || scenes[0].n;
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Zobrazení' });
  const chipsBox = h('nav', { class: 'day-jump zv-scenes', 'aria-label': 'Scény' });
  const body = h('div', { class: 'zv-body' });

  function setMode(m) {
    mode = m; lsSet(MODE_KEY, m);
    if (m === 'all') history.replaceState(null, '', '#/zvuk');
    else history.replaceState(null, '', '#/zvuk/' + cur);
    render();
  }

  function pick(n) {
    cur = n; lsSet(SCENE_KEY, String(n));
    if (mode === 'all') {
      history.replaceState(null, '', '#/zvuk/' + n);
      const el = document.getElementById('zv-' + n);
      if (el) { el.scrollIntoView({ block: 'start' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      renderChips();
    } else setMode('scene');
  }

  function renderSeg() {
    const b = (v, l) => h('button', { type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': String(mode === v), onclick: () => setMode(v) }, l);
    seg.replaceChildren(b('all', 'Popořadě'), b('scene', 'Podle scén'));
  }

  function renderChips() {
    chipsBox.replaceChildren(...scenes.map(sc => h('button', {
      type: 'button', class: 'chip-link' + (mode === 'scene' && sc.n === cur ? ' is-on' : ''), 'aria-pressed': String(mode === 'scene' && sc.n === cur),
      onclick: () => pick(sc.n),
    }, h('strong', null, sc.n), ' ', sc.place)));
  }

  function card(sc) {
    const D = S.get();
    const tech = D.scenes.find(x => x.n === sc.n);
    const nums = D.shots.filter(s => s.obraz === sc.n).map(s => s.num);
    const days = [...new Set(nums.map(n => S.shot(n).day))].sort();
    const chars = [...new Set(sc.dialog.map(x => x.char))];
    return h('article', { class: 'zv-card', id: 'zv-' + sc.n, 'aria-labelledby': 'zvh-' + sc.n },
      h('div', { class: 'zv-top' },
        h('div', { class: 'zv-labels' },
          h('p', { class: 'zv-bar zv-bar-scene' }, 'Scéna:'),
          h('p', { class: 'zv-val zv-num', id: 'zvh-' + sc.n }, sc.n),
          h('p', { class: 'zv-bar zv-bar-place' }, 'Prostor:'),
          h('p', { class: 'zv-val' }, sc.place, tech ? h('span', { class: 'muted small' }, ` · ${tech.title}`) : null),
          h('p', { class: 'zv-meta muted small' },
            `Záběry ${tech ? tech.shots.join('–') : ''}`, days.length ? ' · ' + days.map(dayShort).join(', ') : '')),
        sc.img ? h('a', { class: 'zv-img', href: '#/storyboard/' + sc.img.match(/(\d+)\.jpg/)[1].replace(/^0+/, ''), title: 'Otevřít ve storyboardu' },
          h('img', { src: sc.img, alt: `Storyboard – ${sc.place}`, loading: 'lazy' })) : null),
      h('p', { class: 'zv-bar zv-bar-dialog' }, 'Dialogy:', chars.length ? h('span', { class: 'zv-count' }, `${sc.dialog.length} replik · ${chars.join(', ')}`) : null),
      sc.dialog.length
        ? h('table', { class: 'zv-dialog' }, h('tbody', null, sc.dialog.map(x => h('tr', { class: 'c-' + x.char.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') },
          h('th', { scope: 'row' }, x.char + ':'), h('td', null, x.text)))))
        : h('p', { class: 'zv-empty muted' }, 'Bez dialogů – jen ruchy a atmosféra.'),
      h('p', { class: 'zv-bar zv-bar-foley' }, 'Ruchy:'),
      h('ul', { class: 'zv-tags' }, sc.foley.map(t => h('li', null, t))),
      h('p', { class: 'zv-bar zv-bar-threat' }, 'Hrozby:'),
      h('ul', { class: 'zv-tags zv-threats' }, sc.threats.map(t => h('li', null, t))),
      h('details', { class: 'lp-shots zv-shots' },
        h('summary', null, `Záběry obrazu ${sc.n} (${nums.length})`),
        h('div', { class: 'lp-shot-links' }, nums.map(n => shotLink(n)))));
  }

  function render() {
    renderSeg();
    renderChips();
    const list = mode === 'all' ? scenes : scenes.filter(s => s.n === cur);
    body.replaceChildren(...list.map(card));
  }

  root.replaceChildren(h('div', { class: 'page zv' },
    h('header', { class: 'page-head' },
      h('div', null, h('h1', null, SP.title), h('p', { class: 'muted' }, 'Dialogy, ruchy a hrozby (rušivé zvuky prostoru) po scénách')),
      h('div', { class: 'page-actions' }, h('a', { class: 'btn', href: SP.file, download: '' }, icon('download'), 'zvukovy-plan.pdf'))),
    h('div', { class: 'toolbar toolbar-page' }, h('div', { class: 'toolbar-row' }, seg, chipsBox)),
    body));

  function update(a) {
    const n = parseInt(a, 10);
    if (n && scenes.some(s => s.n === n)) {
      cur = n; lsSet(SCENE_KEY, String(n));
      if (mode === 'all') { render(); requestAnimationFrame(() => pick(n)); }
      else render();
    } else render();
  }
  update(arg);
  return { update, onStore(kind) { if (kind === 'structure') render(); } };
}
