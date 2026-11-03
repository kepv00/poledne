// Fotky k poznámkám: na mobilu tlačítko rovnou otevře fotoaparát, fotka se zmenší
// a uloží do IndexedDB v tomto zařízení. Sdílí se přes Export / Import fotek (✎).

import { h, icon, toast } from './util.js';

const DB = 'poledne-fotky';
const STORE = 'photos';
const MAX = 1600;
let dbp = null;

function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('key', 'key');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export const list = key => tx('readonly', s => s.index('key').getAll(key)).then(a => a.sort((x, y) => x.created - y.created));
const remove = id => tx('readwrite', s => s.delete(id));
const put = rec => tx('readwrite', s => s.put(rec));

// Zmenšení na max. 1600 px, JPEG – fotka z telefonu má pak ~200–400 kB místo několika MB
async function shrink(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = src.width, hh = src.height, k = Math.min(1, MAX / Math.max(w, hh));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(hh * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export async function add(key, file) {
  const blob = await shrink(file);
  await put({ id: newId(), key, created: Date.now(), blob });
  navigator.storage?.persist?.();
}

// ---------- prohlížeč fotky ----------
let dlg = null;
function viewer(rec, onDelete) {
  if (!dlg) { dlg = h('dialog', { class: 'photo-dlg', 'aria-label': 'Fotka' }); document.body.append(dlg); dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); }
  const url = URL.createObjectURL(rec.blob);
  dlg.replaceChildren(
    h('img', { src: url, alt: 'Fotka k poznámce' }),
    h('div', { class: 'photo-dlg-bar' },
      h('span', { class: 'muted small' }, new Date(rec.created).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })),
      h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: async () => {
        if (!confirm('Smazat tuto fotku?')) return;
        await remove(rec.id); dlg.close(); onDelete();
      } }, 'Smazat'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dlg.close() }, 'Zavřít')));
  dlg.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  dlg.showModal();
}

// ---------- pole s fotkami ----------
export function photoField(key, { compact = false } = {}) {
  const thumbs = h('div', { class: 'ph-thumbs' });
  const urls = [];
  const pick = capture => {
    const inp = h('input', { type: 'file', accept: 'image/*', capture: capture ? 'environment' : null, multiple: !capture, hidden: true });
    inp.addEventListener('change', async () => {
      const files = [...inp.files];
      inp.remove();
      if (!files.length) return;
      try {
        for (const f of files) await add(key, f);
        render();
      } catch (err) { toast('Fotku se nepodařilo uložit: ' + (err?.message || err)); }
    });
    document.body.append(inp);
    inp.click();
  };

  async function render() {
    urls.splice(0).forEach(URL.revokeObjectURL);
    let recs = [];
    try { recs = await list(key); } catch { /* IndexedDB nedostupná (soukromé okno) */ }
    thumbs.replaceChildren(...recs.map(r => {
      const u = URL.createObjectURL(r.blob); urls.push(u);
      return h('button', { type: 'button', class: 'ph-thumb', 'aria-label': 'Zobrazit fotku', onclick: () => viewer(r, render) },
        h('img', { src: u, alt: '', loading: 'lazy' }));
    }));
    box.classList.toggle('has-photos', recs.length > 0);
  }

  const box = h('div', { class: 'ph' + (compact ? ' compact' : '') },
    thumbs,
    h('div', { class: 'ph-actions' },
      h('button', { type: 'button', class: 'btn btn-sm ph-cam', onclick: () => pick(true), title: 'Vyfotit' }, icon('camera'), compact ? null : 'Vyfotit'),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost ph-gal', onclick: () => pick(false), title: 'Přidat z galerie / souboru' }, icon('image'), compact ? null : 'Z galerie')));
  render();
  return box;
}

// Počet fotek podle klíče (pro zálohu)
export async function countsByKey() {
  const all = await tx('readonly', st => st.getAll());
  const out = {};
  for (const r of all) out[r.key] = (out[r.key] || 0) + 1;
  return out;
}

// ---------- export / import ----------
const toB64 = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

export async function exportPhotos() {
  const all = await tx('readonly', s => s.getAll());
  if (!all.length) { toast('Žádné fotky k exportu.'); return; }
  const out = [];
  for (const r of all) out.push({ id: r.id, key: r.key, created: r.created, data: await toB64(r.blob) });
  const blob = new Blob([JSON.stringify({ app: 'poledne-fotky', v: 1, photos: out })], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `poledne-fotky-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`Exportováno ${out.length} fotek.`);
}

export async function importPhotos(obj) {
  if (obj?.app !== 'poledne-fotky' || !Array.isArray(obj.photos)) throw new Error('Soubor neobsahuje fotky z aplikace.');
  let n = 0;
  for (const p of obj.photos) {
    const blob = await (await fetch(p.data)).blob();
    await put({ id: p.id, key: p.key, created: p.created, blob });
    n++;
  }
  return n;
}
