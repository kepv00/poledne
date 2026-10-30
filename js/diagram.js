// Půdorysná schémata svícení kreslená z dat (data.json → lighting.setups[].diagrams[].items).
// Souřadnice v rámci viewBoxu 600 × výška; úhly ve stupních, 0 = doprava, 90 = dolů.

const R = Math.PI / 180;
const f = n => Math.round(n * 10) / 10;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function beam(x, y, a, len, sp, cls) {
  const a1 = (a - sp / 2) * R, a2 = (a + sp / 2) * R;
  return `<path class="dg-beam ${cls}" d="M${f(x)},${f(y)} L${f(x + len * Math.cos(a1))},${f(y + len * Math.sin(a1))} A${len},${len} 0 0 1 ${f(x + len * Math.cos(a2))},${f(y + len * Math.sin(a2))} Z"/>`;
}

let pts = null;
const pt = (x, y, r = 0) => { if (pts) pts.push([x - r, y - r], [x + r, y + r]); };

function badge(x, y, txt, cls) {
  pt(x, y, 13);
  return `<g class="dg-badge ${cls}"><circle cx="${f(x)}" cy="${f(y)}" r="11"/><text x="${f(x)}" y="${f(y)}">${esc(txt)}</text></g>`;
}

function seg(x, y, a, len) {
  const dx = Math.cos(a * R) * len / 2, dy = Math.sin(a * R) * len / 2;
  return [x - dx, y - dy, x + dx, y + dy].map(f);
}

export function diagram(d) {
  const items = d.items || [];
  const under = [], over = [];
  pts = [];
  for (const it of items) {
    if (it.x != null) pt(it.x, it.y, 14);
    if (it.w) pt(it.x + it.w, it.y + (it.h || 0));
    if (it.x1 != null) { pt(it.x1, it.y1, 18); pt(it.x2, it.y2, 18); }
    if (it.t === 'light') { const a = it.a * R, l = it.len || 120; pt(it.x + Math.cos(a) * l, it.y + Math.sin(a) * l); }
    switch (it.t) {
      case 'room':
        under.push(`<rect class="dg-room${it.out ? ' is-out' : ''}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}"/>`);
        if (it.l) over.push(`<text class="dg-room-l" x="${it.lx ?? it.x + 10}" y="${it.ly ?? it.y + 18}">${esc(it.l)}</text>`);
        break;
      case 'win': {
        const vert = it.x1 === it.x2;
        under.push(`<line class="dg-win" x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}"/>`);
        const mx = (it.x1 + it.x2) / 2, my = (it.y1 + it.y2) / 2;
        if (it.l) over.push(vert
          ? `<text class="dg-win-l" transform="translate(${mx + 16} ${my}) rotate(90)" text-anchor="middle">${esc(it.l)}</text>`
          : `<text class="dg-win-l" x="${mx}" y="${my - 7}" text-anchor="middle">${esc(it.l)}</text>`);
        break;
      }
      case 'glass': {
        const vert = it.x1 === it.x2;
        under.push(`<line class="dg-gap" x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}"/><line class="dg-glass" x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}"/>`);
        const mx = (it.x1 + it.x2) / 2, my = (it.y1 + it.y2) / 2;
        if (it.l) over.push(vert
          ? `<text class="dg-win-l" transform="translate(${mx - 9} ${my}) rotate(-90)" text-anchor="middle">${esc(it.l)}</text>`
          : `<text class="dg-win-l" x="${mx}" y="${my - 7}" text-anchor="middle">${esc(it.l)}</text>`);
        break;
      }
      case 'door':
        under.push(`<line class="dg-gap" x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}"/><line class="dg-door" x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}"/>`);
        break;
      case 'furn':
        under.push(`<rect class="dg-furn" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="2"/>`);
        if (it.l) {
          const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
          under.push(it.v
            ? `<text class="dg-furn-l" transform="translate(${cx} ${cy}) rotate(-90)">${esc(it.l)}</text>`
            : `<text class="dg-furn-l" x="${cx}" y="${cy}">${esc(it.l)}</text>`);
        }
        break;
      case 'tube':
        under.push(`<rect class="dg-tube" x="${it.x}" y="${it.y}" width="${it.w}" height="6" rx="3"/>`);
        break;
      case 'light': {
        const cls = 't-' + (it.temp || 'neutral');
        under.push(beam(it.x, it.y, it.a, it.len || 120, it.sp || 40, cls));
        over.push(`<g transform="translate(${it.x} ${it.y}) rotate(${it.a})"><rect class="dg-lamp ${cls}" x="-6" y="-12" width="12" height="24" rx="2"/></g>`);
        const bx = it.x - Math.cos(it.a * R) * 22, by = it.y - Math.sin(it.a * R) * 22;
        over.push(badge(bx, by, it.n, 'b-light ' + cls));
        break;
      }
      case 'bounce': {
        const [x1, y1, x2, y2] = seg(it.x, it.y, it.a, it.len || 56);
        if (it.to) under.push(`<line class="dg-bounce-ray" x1="${it.x}" y1="${it.y}" x2="${it.to[0]}" y2="${it.to[1]}" marker-end="url(#dg-arrow)"/>`);
        over.push(`<line class="dg-bounce" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
        over.push(badge(it.x + 16, it.y - 16, 'P', 'b-bounce'));
        break;
      }
      case 'flag': {
        const [x1, y1, x2, y2] = seg(it.x, it.y, it.a, it.len || 44);
        over.push(`<line class="dg-flag" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
        over.push(badge(it.x + 15, it.y + 15, 'F', 'b-flag'));
        break;
      }
      case 'prac':
        over.push(`<circle class="dg-prac${it.off ? ' is-off' : ''}" cx="${it.x}" cy="${it.y}" r="9"/><text class="dg-prac-l" x="${it.x}" y="${it.y + 22}">${esc(it.l)}${it.off ? ' (vyp.)' : ''}</text>`);
        break;
      case 'actor':
        over.push(`<g class="dg-actor"><circle cx="${it.x}" cy="${it.y}" r="12"/><text x="${it.x}" y="${it.y}">${esc(it.l)}</text></g>`);
        break;
      case 'cam':
        over.push(`<g transform="translate(${it.x} ${it.y}) rotate(${it.a})"><path class="dg-cam-fov" d="M0,0 L60,-26 L60,26 Z"/><rect class="dg-cam" x="-14" y="-9" width="20" height="18" rx="3"/><path class="dg-cam" d="M6,-6 L16,-10 L16,10 L6,6 Z"/></g>`);
        over.push(`<text class="dg-cam-l" x="${it.x}" y="${it.y + 26}">K</text>`);
        break;
      default:
    }
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  pts = null;
  const x0 = Math.min(...xs) - 6, y0 = Math.min(...ys) - 6, x1 = Math.max(...xs) + 6, y1 = Math.max(...ys) + 6;
  return `<svg class="dg" viewBox="${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}" role="img" aria-label="${esc(d.title || 'Schéma svícení')}">
<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-arrow"/></marker></defs>
${under.join('')}${over.join('')}</svg>`;
}

export function legend() {
  return `<svg class="dg dg-legend" viewBox="0 0 600 34" role="img" aria-label="Legenda">
${badge(14, 17, '1', 'b-light t-neutral')}<text class="dg-leg" x="30" y="17">hlavní</text>
${badge(92, 17, '2', 'b-light t-neutral')}<text class="dg-leg" x="108" y="17">měkčení</text>
${badge(182, 17, '3', 'b-light t-cool')}<text class="dg-leg" x="198" y="17">kontra</text>
${badge(254, 17, 'P', 'b-bounce')}<text class="dg-leg" x="270" y="17">polystyren</text>
${badge(350, 17, 'F', 'b-flag')}<text class="dg-leg" x="366" y="17">flag</text>
<g class="dg-actor"><circle cx="420" cy="17" r="11"/><text x="420" y="17">M</text></g><text class="dg-leg" x="436" y="17">herec</text>
<g transform="translate(500 17)"><rect class="dg-cam" x="-10" y="-8" width="16" height="16" rx="3"/><path class="dg-cam" d="M6,-5 L14,-9 L14,9 L6,5 Z"/></g><text class="dg-leg" x="520" y="17">kamera</text>
</svg>`;
}
