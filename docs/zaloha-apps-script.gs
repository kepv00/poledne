/** @OnlyCurrentDoc */
// Záloha a synchronizace skriptovacího deníku Poledne.
//
// Patří do tabulky „Skriptovací deník – záloha“ (Rozšíření → Apps Script), nasazuje se jako webová
// aplikace: Spustit jako = já, Přístup = kdokoli. Zapisovat smí jen ten, kdo zná KLIC.
//
// action 'sync'  – zařízení pošle své změny {k, v, t} a dostane změny ostatních od posledního dotazu.
//                  Hodnoty leží ve skrytém listu „Sync“ (klíč, hodnota JSON, čas změny, zařízení, čas serveru).
//                  Platí novější změna (čas změny na zařízení).
// bez action    – záloha: přepíše list „Deník“ celým deníkem a do „Historie“ přidá řádek.

const KLIC = 'SEM-VLOZTE-KLIC';

const HLAVICKA = ['Den', 'Datum', 'Záběr', 'Obr.', 'Typ záběru', 'Kamera / Úhel / Pohyb',
  'Popis akce a obsah záběru', 'Ostrá klapka', 'Hotovo', 'Poznámka skriptu', 'Fotek'];

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return odpoved({ ok: false, error: 'Neplatná data' }); }
  if (!data || data.klic !== KLIC) return odpoved({ ok: false, error: 'Neplatný klíč' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return odpoved(data.action === 'sync' ? sync(data) : zaloha(data));
  } finally {
    lock.releaseLock();
  }
}

function sync(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Sync');
  if (!sh) {
    sh = ss.insertSheet('Sync');
    sh.appendRow(['Klíč', 'Hodnota', 'Čas změny', 'Zařízení', 'Server']);
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
    sh.hideSheet();
  }
  const now = Date.now();
  const rows = sh.getDataRange().getValues().slice(1);
  const idx = {};
  rows.forEach((r, i) => { idx[r[0]] = i; });
  let changed = false;
  (data.changes || []).forEach(ch => {
    const i = idx[ch.k];
    if (i === undefined) {
      idx[ch.k] = rows.length;
      rows.push([ch.k, JSON.stringify(ch.v), ch.t, data.device || '', now]);
      changed = true;
    } else if (ch.t > Number(rows[i][2])) {
      rows[i] = [ch.k, JSON.stringify(ch.v), ch.t, data.device || '', now];
      changed = true;
    }
  });
  if (changed) sh.getRange(2, 1, rows.length, 5).setValues(rows);
  const since = Number(data.since) || 0;
  const out = rows.filter(r => Number(r[4]) > since).map(r => ({ k: r[0], v: JSON.parse(r[1]), t: Number(r[2]), d: r[3] }));
  const devices = {};
  rows.forEach(r => { if (r[3]) devices[r[3]] = Math.max(devices[r[3]] || 0, Number(r[4])); });
  return { ok: true, now: now, changes: out, devices: devices };
}

function zaloha(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const denik = ss.getSheetByName('Deník') || ss.insertSheet('Deník', 0);
  const radky = [HLAVICKA].concat(data.rows || []);
  denik.clearContents();
  denik.getRange(1, 1, radky.length, HLAVICKA.length).setValues(radky);
  denik.getRange(1, 1, 1, HLAVICKA.length).setFontWeight('bold').setBackground('#1d293b').setFontColor('#ffffff');
  denik.setFrozenRows(1);
  denik.getRange(2, 8, Math.max(1, radky.length - 1), 1).setBackground('#fffaeb');

  const info = ss.getSheetByName('Info') || ss.insertSheet('Info');
  info.clearContents();
  info.getRange(1, 1, 6, 2).setValues([
    ['Naposledy zálohováno', new Date()],
    ['Zařízení', data.device || ''],
    ['Důvod', data.reason || ''],
    ['Režie', (data.crew && data.crew.rezie) || ''],
    ['Skript', (data.crew && data.crew.skript) || ''],
    ['Kamera', (data.crew && data.crew.kamera) || ''],
  ]);

  const hist = ss.getSheetByName('Historie') || ss.insertSheet('Historie');
  if (hist.getLastRow() === 0) {
    hist.appendRow(['Čas', 'Zařízení', 'Důvod', 'Vyplněných klapek', 'Hotových záběrů', 'Data (JSON)']);
    hist.getRange(1, 1, 1, 6).setFontWeight('bold');
    hist.setFrozenRows(1);
  }
  const snap = JSON.stringify(data.snapshot || {});
  hist.appendRow([new Date(), data.device || '', data.reason || '', data.filled || 0, data.done || 0, snap.slice(0, 49000)]);
  return { ok: true, rows: radky.length - 1, at: new Date().toISOString() };
}

function doGet() {
  return odpoved({ ok: true, app: 'poledne-zaloha' });
}

function odpoved(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
