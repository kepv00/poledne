// Tisk natáčecích dnů: připraví čistý obsah do #print-root a zavolá window.print().

import * as S from './store.js';
import { h, dayLabel, year } from './util.js';

function printDay(d, idx, total) {
  const shots = d.blocks.flatMap(b => b.shots);
  return h('article', { class: 'p-day' },
    h('header', { class: 'p-head' },
      h('p', { class: 'p-kicker' }, `Poledne · natáčecí den ${idx + 1}/${total}`),
      h('h1', null, `${dayLabel(d.date)} ${year(d.date)}`),
      h('p', { class: 'p-sub' }, `${d.title.replace(/^[^–]*–\s*/, '')} · ${shots.length} záběrů`)),
    h('table', { class: 'p-sched' },
      h('thead', null, h('tr', null, h('th', null, 'Čas'), h('th', null, 'Blok'), h('th', null, 'Záběry'), h('th', null, 'Poznámka'))),
      h('tbody', null, d.blocks.map(b => h('tr', { class: b.shots.length ? '' : 'p-pause' },
        h('td', { class: 'p-time' }, b.time), h('td', null, b.title),
        h('td', null, b.shots.join(', ') || '—'), h('td', null, b.note || ''))))),
    d.blocks.filter(b => b.shots.length).map(b => h('section', { class: 'p-block' },
      h('h2', null, h('span', { class: 'p-time' }, b.time), ' ', b.title),
      b.note ? h('p', { class: 'p-note' }, b.note) : null,
      b.shots.map(n => printShot(S.shot(n))))));
}

function printShot(s) {
  const sc = S.scene(s.obraz);
  const L = S.LIGHT[s.light || ''];
  const props = S.propsFor(s.num).map(p => p.name);
  const subs = S.substitutesFor(s.num);
  return h('div', { class: 'p-shot' },
    h('div', { class: 'p-img' }, s.thumb
      ? h('span', { class: 'frame-in', style: `aspect-ratio:${s.ratio.replace(':', ' / ')}` }, h('img', { src: s.thumb, alt: '' }))
      : h('span', { class: 'p-black' }, 'černý záběr')),
    h('div', { class: 'p-txt' },
      h('p', { class: 'p-title' },
        h('span', { class: 'p-check', 'aria-hidden': 'true' }, s.done ? '☑' : '☐'),
        h('strong', null, `#${s.num}`), ' ' + [s.size, s.angle, s.move, s.ratio, `obraz ${sc.n}`].filter(x => x && x !== '—').join(' · ')),
      h('p', null, s.action),
      h('p', null, h('b', null, 'Zvuk: '), s.sound),
      s.notes && s.notes !== '—' ? h('p', null, h('b', null, 'Pozn.: '), s.notes) : null,
      h('p', null, h('b', null, 'Světlo: '), s.light ? `${s.light} – ${L.name}` : L.name, ` · objektiv ${S.lensFor(s) || '—'}`),
      props.length ? h('p', null, h('b', null, 'Rekvizity: '), props.join(', ')) : null,
      subs.length ? h('p', { class: 'p-warn' }, h('b', null, 'Náhrady: '), subs.map(x => `${x.what} → ${x.how}`).join('; ')) : null,
      s.contNotes ? h('p', null, h('b', null, 'Návaznost: '), s.contNotes) : null));
}

export function printDays(dates) {
  const D = S.get();
  const days = D.days.filter(d => dates.includes(d.date));
  const root = document.getElementById('print-root');
  root.replaceChildren(...days.map(d => printDay(d, D.days.indexOf(d), D.days.length)));
  document.body.classList.add('printing');
  const imgs = [...root.querySelectorAll('img')];
  const loaded = Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  const cleanup = () => { document.body.classList.remove('printing'); root.replaceChildren(); };
  Promise.race([loaded, new Promise(r => setTimeout(r, 5000))]).then(() => {
    addEventListener('afterprint', cleanup, { once: true });
    window.print();
  });
}
