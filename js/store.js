// Datová vrstva: data.json + overlay úprav v localStorage (originál se nepřepisuje).

import { parseRange, lsGet, lsSet } from './util.js';

const KEY = 'poledne.overlay.v1';
const clone = o => JSON.parse(JSON.stringify(o));

let base = null;      // data.json tak, jak přišel ze serveru
let data = null;      // base + overlay
let ov = {};          // { shots:{num:{}}, scenes:{n:{}}, props:{i:{}}, days:[...], config:{} }
let editing = false;
const subs = new Set();

let byNum, litIdx, litHead, where, byLit, propsCache, charsCache, dayOrder;

// Postavy odvozené z textu záběru (data nemají explicitní obsazení)
const CHARS = [
  ['Eliška', /elišk|eliš/],
  ['Matka', /matk/],
  ['Filípek (miminko)', /filíp|miminko|dítě|postýlk/],
  ['Spolužačka', /spolužač/],
  ['Učitelka', /učitel/],
  ['Sociální pracovnice', /pracovnic/],
  ['Moderátor', /moderátor/],
];

export const LIGHT = {
  H1: { label: 'H1', name: 'Chodba – přítmí', desc: 'Přítmí chodby, chladné světlo přes matné sklo dveří / studené mlžné světlo z kuchyně.' },
  A: { label: 'A', name: 'Kuchyň – zatažené závěsy', desc: 'Zatažené závěsy, žárovkové světlo a svit TV; přetopeno, dusno. Praktikábly lampa a TV, negativ fill.' },
  B1: { label: 'B1', name: 'Výpadek – šero', desc: 'Po výpadku proudu kalné šero, praktikábly zhasnuté.' },
  B2: { label: 'B2', name: 'Závěsy strženy – záře', desc: 'Oslepivě bílá mlžná záře za oknem, studená a plochá.' },
  '': { label: '—', name: 'Bez stavu', desc: 'Světlo podle obrazu (denní / zářivky).' },
};

export const PROP_STATUS = ['Nemáme', 'Sehnáno', 'Máme'];

export async function load() {
  const res = await fetch('data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Nepodařilo se načíst data.json (' + res.status + ')');
  base = await res.json();
  try { ov = JSON.parse(lsGet(KEY, '{}')) || {}; } catch { ov = {}; }
  rebuild();
}

function rebuild() {
  data = clone(base);
  data.config = Object.assign({ driveUrl: '' }, base.config, ov.config);
  for (const s of data.shots) {
    s.done = !!s.done;
    s.contNotes = s.contNotes || '';
    Object.assign(s, ov.shots?.[s.num]);
  }
  for (const sc of data.scenes) Object.assign(sc, ov.scenes?.[sc.n]);
  data.props.forEach((p, i) => Object.assign(p, ov.props?.[i]));
  if (ov.days) data.days = clone(ov.days);
  derive();
}

function derive() {
  byNum = new Map(data.shots.map(s => [s.num, s]));
  litIdx = new Map(data.lit.blocks.map((b, i) => [b.id, i]));
  litHead = new Map(data.lit.scenes.map(s => [s.n, s.heading]));
  data.days.sort((a, b) => a.date.localeCompare(b.date));
  where = new Map();
  dayOrder = [];
  data.days.forEach((d, di) => {
    let o = 0;
    d.blocks.forEach((b, bi) => b.shots.forEach((n, k) => {
      const s = byNum.get(n);
      if (!s) return;
      s.day = d.date;
      s.dayOrder = ++o;
      where.set(n, { di, bi, k });
      dayOrder.push(n);
    }));
  });
  byLit = new Map();
  for (const s of data.shots) {
    if (!byLit.has(s.lit)) byLit.set(s.lit, []);
    byLit.get(s.lit).push(s.num);
  }
  const ranges = data.props.map(p => parseRange(p.shots));
  propsCache = new Map();
  charsCache = new Map();
  for (const s of data.shots) {
    const names = new Set(s.props);
    data.props.forEach((p, i) => {
      if (ranges[i].has(s.num) || (p.shots === 'POV' && /POV/i.test(s.size))) names.add(p.name);
    });
    propsCache.set(s.num, [...names]);
    const txt = [s.action, s.angle, s.notes, s.sound, ...s.flags].join(' ').toLowerCase();
    charsCache.set(s.num, CHARS.filter(([, re]) => re.test(txt)).map(([n]) => n));
  }
}

function save() { lsSet(KEY, JSON.stringify(ov)); }
function emit(kind) { subs.forEach(f => f(kind)); }
export function on(fn) { subs.add(fn); return () => subs.delete(fn); }

// ---------- čtení ----------
export const get = () => data;
export const shot = n => byNum.get(+n);
export const scene = n => data.scenes.find(s => s.n === +n);
export const litIndex = id => litIdx.get(id);
export const litHeading = n => litHead.get(n) || '';
export const shotsForLit = id => byLit.get(id) || [];
export const whereIs = n => where.get(+n);
export const dayOrderList = () => dayOrder;
export const scriptOrderList = () => data.shots.map(s => s.num).sort((a, b) => a - b);
export const charsFor = n => charsCache.get(+n) || [];
export const allChars = () => CHARS.map(([n]) => n).filter(n => data.shots.some(s => charsFor(s.num).includes(n)));

export function blockOf(n) {
  const w = where.get(+n);
  if (!w) return null;
  return { ...w, day: data.days[w.di], block: data.days[w.di].blocks[w.bi] };
}

const RISKY = /náhrada/i;
export function propsFor(n) {
  return (propsCache.get(+n) || []).map(name => {
    const i = data.props.findIndex(p => p.name === name);
    const p = data.props[i];
    return {
      name, i,
      status: p?.status || '',
      note: p?.note || '',
      risky: !!p && RISKY.test(p.note),
    };
  });
}

// Náhrady za rizikové věci (víno, léky, hrnec, miminko)
export function substitutesFor(n) {
  const s = shot(n);
  const out = propsFor(n).filter(p => p.risky).map(p => ({ what: p.name, how: p.note.replace(/^.*?náhrada:\s*/i, '') }));
  if (s.flags.includes('panenka')) {
    const doll = data.props.find(p => /panenka s hmotností/i.test(p.name)) || data.props.find(p => /panenka/i.test(p.name));
    out.push({ what: 'Miminko', how: 'panenka (model s hmotností miminka)' + (doll?.note ? ' – ' + doll.note : '') });
  }
  if (s.flags.includes('dítě (Filípek)')) {
    const crib = data.props.find(p => /postýlce/i.test(p.name));
    out.push({ what: 'Skutečné dítě', how: 'bezpečný záběr, krátce, s dohledem rodiče' + (crib?.note ? ' – ' + crib.note : '') });
  }
  return out;
}

// Setup svícení (lighting.setups[].match: obraz[] nebo obrazLight[[obraz, stav]])
export function setupFor(n) {
  const s = shot(n);
  if (!s || !data.lighting) return null;
  return data.lighting.setups.find(st =>
    st.match.obrazLight?.some(([o, l]) => o === s.obraz && l === s.light) || st.match.obraz?.includes(s.obraz)) || null;
}
export const shotsForSetup = id => data.shots.filter(s => s.img && setupFor(s.num)?.id === id).map(s => s.num);

// Objektiv z popisu obrazu podle typu záběru
export function lensFor(s) {
  const sc = scene(s.obraz);
  if (!sc?.lenses) return '';
  const size = s.size.toLowerCase();
  let best = null, score = 0;
  for (const entry of sc.lenses.split(',').map(x => x.trim()).filter(Boolean)) {
    const label = entry.replace(/\d.*$/, '').trim().toLowerCase();
    let sc2 = 0;
    if (label && size.startsWith(label)) sc2 = label.length + 10;
    else if (label.split(/[\s/]+/).some(w => w.length > 3 && size.includes(w))) sc2 = 5;
    else if (label.split(' ')[0] === size.split(' ')[0]) sc2 = 1;
    if (sc2 > score) { score = sc2; best = entry; }
  }
  return best || sc.lenses;
}

// ---------- režim úprav ----------
export const isEditing = () => editing;
export function setEditing(b) {
  editing = !!b;
  document.body.classList.toggle('editing', editing);
  emit('edit');
}

// ---------- zápis ----------
export function setShot(n, patch, { silent = false } = {}) {
  ov.shots ??= {};
  ov.shots[n] = { ...ov.shots[n], ...patch };
  Object.assign(byNum.get(+n), patch);
  if ('lit' in patch) derive();
  save();
  emit(silent ? ('done' in patch ? 'done' : 'field') : 'structure');
}

export function setScene(n, patch) {
  ov.scenes ??= {};
  ov.scenes[n] = { ...ov.scenes[n], ...patch };
  Object.assign(scene(n), patch);
  save();
  emit('field');
}

export function setProp(i, patch) {
  ov.props ??= {};
  ov.props[i] = { ...ov.props[i], ...patch };
  Object.assign(data.props[i], patch);
  save();
  emit('props');
}

export function setConfig(patch) {
  ov.config = { ...ov.config, ...patch };
  Object.assign(data.config, patch);
  save();
  emit('field');
}

export function editDays(fn, { silent = false } = {}) {
  fn(data.days);
  ov.days = clone(data.days);
  derive();
  save();
  emit(silent ? 'field' : 'structure');
}

export function moveShot(n, delta) {
  const w = where.get(+n);
  if (!w) return;
  editDays(days => {
    const arr = days[w.di].blocks[w.bi].shots;
    const j = w.k + delta;
    if (j < 0 || j >= arr.length) return;
    [arr[w.k], arr[j]] = [arr[j], arr[w.k]];
  });
}

export function moveShotTo(n, di, bi) {
  const w = where.get(+n);
  editDays(days => {
    if (w) days[w.di].blocks[w.bi].shots.splice(w.k, 1);
    days[di].blocks[bi].shots.push(+n);
  });
}

// ---------- export / import / reset ----------
export function exportData() {
  const out = clone(data);
  out.shots.forEach(s => { if (!s.contNotes) delete s.contNotes; if (!s.done) delete s.done; });
  return out;
}

export function importData(obj) {
  if (!obj || !Array.isArray(obj.shots) || !Array.isArray(obj.days)) {
    throw new Error('Soubor nevypadá jako data aplikace (chybí shots / days).');
  }
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const next = { shots: {}, scenes: {}, props: {}, config: {} };
  for (const s of obj.shots) {
    const b = base.shots.find(x => x.num === s.num);
    if (!b) continue;
    const p = {};
    for (const k of Object.keys(s)) {
      if (k === 'day' || k === 'dayOrder') continue;
      const bv = k === 'done' ? !!b.done : k === 'contNotes' ? (b.contNotes || '') : b[k];
      if (!same(s[k], bv)) p[k] = s[k];
    }
    if (Object.keys(p).length) next.shots[s.num] = p;
  }
  for (const sc of obj.scenes || []) {
    const b = base.scenes.find(x => x.n === sc.n);
    if (!b) continue;
    const p = {};
    for (const k of Object.keys(sc)) if (!same(sc[k], b[k])) p[k] = sc[k];
    if (Object.keys(p).length) next.scenes[sc.n] = p;
  }
  (obj.props || []).forEach((pr, i) => {
    const b = base.props[i];
    if (b && b.name === pr.name && !same(pr.status, b.status)) next.props[i] = { status: pr.status };
  });
  if (!same(obj.days, base.days)) next.days = obj.days;
  if (obj.config && !same(obj.config.driveUrl, base.config?.driveUrl)) next.config.driveUrl = obj.config.driveUrl;
  ov = next;
  save();
  rebuild();
  emit('structure');
}

export function hasChanges() {
  return !!(ov.days || ['shots', 'scenes', 'props', 'config'].some(k => ov[k] && Object.keys(ov[k]).length));
}

export function resetAll() {
  ov = {};
  save();
  rebuild();
  emit('structure');
}
