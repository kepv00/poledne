// Drobné pomocné funkce: tvorba DOM, data, vyhledávání, localStorage.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'open') el[k] = !!v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function lsGet(k, d = null) {
  try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; }
}
export function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* soukromé okno apod. */ }
}

// "30–79", "30, 41, 55", "96–98" → Set čísel záběrů
export function parseRange(str) {
  const out = new Set();
  for (const part of String(str || '').split(',')) {
    const p = part.trim();
    const m = p.match(/^(\d+)\s*[–-]\s*(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.add(i);
    else if (/^\d+$/.test(p)) out.add(+p);
  }
  return out;
}

const WD = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const WD_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const weekday = s => WD[parseISO(s).getDay()];
export const wdShort = s => WD_SHORT[parseISO(s).getDay()];
export function dmy(s) { const d = parseISO(s); return `${d.getDate()}. ${d.getMonth() + 1}.`; }
export const dayLabel = s => `${cap(weekday(s))} ${dmy(s)}`;
export const dayShort = s => `${wdShort(s)} ${dmy(s).replace(/ /g, '')}`;
export const year = s => parseISO(s).getFullYear();

// Vyhledávání bez ohledu na diakritiku a velikost písmen
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function matchesQuery(hay, q) {
  if (!q) return true;
  const n = norm(hay);
  return norm(q).split(/\s+/).filter(Boolean).every(t => n.includes(t));
}

// Vrátí fragment s <mark> kolem nalezených výrazů
export function highlight(text, q) {
  const frag = document.createDocumentFragment();
  text = String(text ?? '');
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) { frag.append(text); return frag; }
  const nt = norm(text.normalize('NFC'));
  if (nt.length !== text.length) { frag.append(text); return frag; }
  const hits = [];
  for (const t of terms) {
    let i = nt.indexOf(t);
    while (i >= 0) { hits.push([i, i + t.length]); i = nt.indexOf(t, i + t.length); }
  }
  hits.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [a, b] of hits) {
    if (a < pos) continue;
    frag.append(text.slice(pos, a), h('mark', null, text.slice(a, b)));
    pos = b;
  }
  frag.append(text.slice(pos));
  return frag;
}

export function toast(msg) {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('show'), 2600);
}

export const isWide = () => matchMedia('(min-width: 760px)').matches;

const ICONS = {
  zabery: '<rect x="3" y="4.5" width="7" height="5" rx="1"/><rect x="3" y="14.5" width="7" height="5" rx="1"/><path d="M13 6h8M13 8.5h5M13 16h8M13 18.5h5"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4M7 17h7"/>',
  scenar: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h4"/>',
  script: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 10l1.5 1.5L13 8.5M8.5 16l1.5 1.5 3-3M15 11h2M15 17h2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  zvuk: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  technicky: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  storyboard: '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>',
  svetlo: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  disk: '<path d="M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.2 9.6 4.2 4.2 0 0 0 7 18z"/>',
  vice: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
};
export function icon(name, cls = '') {
  return h('span', {
    class: 'ico ' + cls, 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  });
}
