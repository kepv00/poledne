# Poledne – produkční přehled

Statická webová aplikace pro natáčení studentského filmu **Poledne** (čt 5. 11. – ne 8. 11. 2026).
Bez backendu a bez přihlášení, funguje offline jako PWA. Všechna data jsou v `data.json`.

## Struktura

```
index.html              kostra stránky (hlavička, navigace, místo pro tisk)
manifest.webmanifest    PWA manifest
sw.js                   service worker (offline cache)
css/app.css             veškeré styly – tokeny světlého/tmavého tématu, responzivita, tisk
js/main.js              router (#/…), téma, režim úprav, export/import, klávesnice
js/store.js             načtení data.json + overlay úprav v localStorage, odvozené údaje
js/shots.js             záložka „Jednotlivé záběry“ (seznam, přepínač pořadí, filtry, detail)
js/script.js            záložka Script (skriptovací deník)
js/views.js             ostatní záložky (plán, scénáře, storyboard, světlo + rekvizity, Disk)
js/parts.js             sdílené kousky UI (rámeček záběru, štítky, editovatelná pole)
js/print.js             tisk natáčecího dne
data.json               data filmu (záběry, obrazy, rekvizity, dny, literární scénář)
img/                    storyboard: NNN.jpg (detail) a NNN_t.jpg (miniatura)
js/diagram.js           kreslení schémat svícení (SVG) z dat
rekvizity.pdf, storyboard_v3.pdf, poledne_tech_sc.docx, poledne_lit_sc.pdf, skriptovaci-denik-poledne.xlsx
icons/                  ikony aplikace
docs/ZADANI.md          původní zadání
```

Nejsou tu žádné závislosti ani build krok – čisté ES moduly, které prohlížeč načte přímo.
Na nasazení stačí nahrát složku tak, jak je.

## Spuštění lokálně

Aplikace se musí servírovat přes HTTP (kvůli `fetch('data.json')` a service workeru), ne otevřít jako soubor:

```bash
cd poledne
python3 -m http.server 8000
```

Pak otevři <http://localhost:8000>.

## Nasazení na GitHub Pages

1. Vytvoř na GitHubu repozitář (např. `poledne`) a nahraj do něj obsah této složky:
   ```bash
   cd poledne
   git init
   git add .
   git commit -m "Poledne – produkční přehled"
   git branch -M main
   git remote add origin https://github.com/<uzivatel>/poledne.git
   git push -u origin main
   ```
2. Na GitHubu: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, větev `main`, složka `/ (root)`.
3. Za minutu je aplikace na `https://<uzivatel>.github.io/poledne/`. Všechny cesty jsou relativní, takže funguje i v podsložce.

Netlify / Vercel: přetáhni složku do „Deploy manually“ (Netlify Drop), build příkaz žádný, publish directory `.`.

> Repozitář i stránka jsou veřejné. Pokud nechceš mít scénář veřejně dohledatelný, použij soukromý repozitář s Netlify, nebo aspoň nesdílej odkaz mimo štáb.

## Jak se aplikace používá

- **Jednotlivé záběry** – přepínač *Podle scénáře / Podle natáčecího dne* (pamatuje se), filtry a fulltext, detail záběru s literárním scénářem, storyboardem a návazností, kamerou, zvukem, světlem, rekvizitami a poznámkami k návaznosti.
  Klávesnice: `↑`/`↓` nebo `J`/`K` pohyb, `Enter` otevřít, `Esc` zavřít.
- **Natáčecí plán** – 4 dny s časovými bloky, „natočeno“ u každého záběru, **Tisk dne** / **Tisk všech dní**.
- **Literární scénář**, **Technický scénář**, **Storyboard** (lightbox, `←`/`→`), **Světlo a rekvizity**, **Google Disk**.
- Odkazy lze sdílet: `#/zabery/42`, `#/den/2026-11-07`, `#/scenar/L044`, `#/storyboard/80`, `#/technicky`, `#/svetlo`, `#/disk`.
- Na telefonu: *Sdílet → Přidat na plochu* (iOS) nebo *Nainstalovat aplikaci* (Android/Chrome). Po prvním otevření funguje offline; velké obrázky se uloží, jakmile je jednou zobrazíš.

## Režim úprav a aktualizace `data.json`

Výchozí je jen náhled. Malé tlačítko ✎ (vpravo dole, na telefonu v hlavičce) zapne **režim úprav**:
texty záběrů (akce, zvuk, poznámky, typ, úhel, pohyb), světelný stav, světlo obrazu, časy/názvy/poznámky bloků,
datum dne, pořadí záběrů v bloku a přesun do jiného bloku, mapování záběr → blok literárního scénáře,
stav rekvizit a odkaz na Google Disk.

„Natočeno“ a poznámky k návaznosti fungují i bez režimu úprav.

Úpravy se ukládají **jen v daném prohlížeči** (localStorage) jako vrstva nad `data.json` – originál se nemění.
Aby je viděli všichni:

1. V režimu úprav klikni na **Export JSON** – stáhne se kompletní `data-RRRR-MM-DD.json` (včetně „natočeno“ a poznámek).
2. Přejmenuj ho na `data.json` a nahraď jím soubor v repozitáři (na GitHubu: *Add file → Upload files*, nebo `git commit`).
3. Po nasazení stačí ostatním obnovit stránku. Kdo má v prohlížeči vlastní úpravy, uvidí je dál navrch –
   **Obnovit původní** je smaže a načte čistý `data.json`.

**Import JSON** načte exportovaný soubor jako místní úpravy (např. předání mezi notebookem a iPadem bez commitu).

### Ruční úpravy `data.json`

- `shots[]` – `num`, `obraz`, `size`, `angle`, `move`, `sound`, `notes`, `action`, `light` (`H1`/`A`/`B1`/`B2`/`""`),
  `ratio`, `lit` (id bloku v `lit.blocks`), `props[]`, `flags[]`, `img`, `thumb`.
  `day` a `dayOrder` se při načtení **přepočítávají z `days[].blocks[].shots`** – pořadí měň tam.
- `days[]` – `date` (ISO), `title`, `blocks[{time, title, shots[], note}]`. Den v týdnu se odvozuje z data.
- `props[]` – `name`, `obraz[]`, `shots` (text typu `"30–79"` nebo `"30, 41, 55"`; podle něj se rekvizita přiřadí záběrům),
  `note` (obsahuje-li „náhrada:“, rekvizita se označí jako riziková), `status` (`Nemáme` / `Sehnáno` / `Máme`).
- `config.driveUrl` – odkaz na sdílenou složku Google Disku.
- `techDoc` – titulní strana a úvodní kapitoly technického scénáře (anotace, postavy, lokace, půdorys, poznámka)
  převzaté z `poledne_tech_sc.docx`; `scenes[].tech` – nadpis obrazu, objektivy, odrážky „Světlo“, poznámky
  a podčásti tabulek (`parts[{title, from}]` – od kterého záběru začíná). Řádky tabulek se berou ze `shots[]`,
  takže úpravy záběrů se v záložce Technický scénář projeví hned. Když se změní docx na Disku, nahraď
  `poledne_tech_sc.docx` (ke stažení v aplikaci) a případně uprav tyto texty.
- `lighting` – plán svícení: `intro`, `equipment` (technika po skupinách, `src` = pronájem / máme), `questions`
  (co vyřešit před natáčením) a `setups[]` – každý setup má `match` (které záběry k němu patří: `obraz` nebo
  `obrazLight` [[obraz, světelný stav]]), `mood`, `lights[]` (tabulka: `n`, `role`, `fixture`, `where`, `set`),
  `tips` a `diagrams[]` se schématy (místnosti, okna, nábytek, herci `actor`, kamera `cam`, světla `light`
  s úhlem `a` ve stupních, polystyren `bounce`, flag `flag`, praktikábly `prac`). Původní `svetlo.html` je archivované v `docs/`.
- `script` – skriptovací deník převzatý ze `skriptovaci-denik-poledne.xlsx`: `days[]` (0.–4. den, `title`, `time`,
  `place`, `cast`, `rows[]` se záběrem, obrazem, typem, kamerou a popisem akce), `crew` (režie, skript, kamera)
  a `entries` – vyplněné ostré klapky a poznámky skriptu podle klíče `"<den>:<záběr>"`. Sloupec Hotovo je napojený
  na „natočeno“ u záběru. Klapky a poznámky se na place ukládají v prohlížeči; do sdíleného `data.json` se dostanou
  přes Export JSON. Tlačítko Export CSV stáhne celý deník pro Excel.
- `img/banner.jpg` – banner filmu (záložka Google Disk), `img/pudorys.png` – půdorys bytu z technického scénáře.

Nové obrázky: `img/NNN.jpg` (cca 1200 px) a `img/NNN_t.jpg` (cca 320 px). Záběry 4:3 apod. mají kresbu uprostřed
16:9 plátna – aplikace je ořízne na skutečný poměr podle `ratio`.

### Po změně kódu

Service worker jde nejdřív na síť, takže nové verze se projeví po obnovení stránky. Při větších změnách
zvyš `VERSION` v `sw.js` – stará cache se tím smaže.
