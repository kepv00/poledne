/**
 * Záloha skriptovacího deníku Poledne do Google tabulky.
 *
 * Patří do tabulky „Skriptovací deník – záloha“ (Rozšíření → Apps Script), nasazuje se jako
 * webová aplikace: Spustit jako = já, Přístup = kdokoli. Aplikace Poledne sem posílá celý deník
 * (POST, JSON) a skript přepíše list „Deník“ aktuálním stavem a do listu „Historie“ přidá řádek.
 * Zapisovat smí jen ten, kdo zná KLIC (zadává se v aplikaci v nastavení zálohy).
 *
 * @OnlyCurrentDoc
 */

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

    return odpoved({ ok: true, rows: radky.length - 1, at: new Date().toISOString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return odpoved({ ok: true, app: 'poledne-zaloha' });
}

function odpoved(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
