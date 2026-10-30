# Zadání pro Claude Code: webová aplikace „Poledne – produkční přehled"

Postav statickou webovou aplikaci (bez backendu, bez přihlášení, veřejná, nasaditelná na GitHub Pages / Netlify / Vercel) jako přehled studentského filmu **Poledne**. Všechna data jsou v `data.json`, obrázky v `img/`. Preferuj Vite + vanilla TS nebo Preact; žádné těžké frameworky. Jazyk rozhraní: čeština.

## Termíny natáčení
Natáčí se **čtvrtek 5. 11. – neděle 8. 11. 2026** (Čt 5.11. exteriéry a škola, Pá 6.11. chodba a kuchyň A, So 7.11. kuchyň eskalace a výpadek B1/B2, Ne 8.11. chodba a klimax). Data v `data.json` už tomu odpovídají; v aplikaci se dají editovat (viz režim úprav). Dny zobrazuj včetně názvu dne v týdnu odvozeného z data.

## Data (`data.json`)
- `shots[]` (103): `num, obraz, size, angle, move, sound, notes, action, light (H1|A|B1|B2|""), ratio, lit` (id hlavního literárního bloku), `props[]`, `flags[]`, `day` (ISO datum), `dayOrder` (pořadí v rámci dne), `img`, `thumb`.
- `scenes[]` (Obrazy 1–7): `n, title, loc, shots[od,do], format, lenses, light`.
- `props[]`: `name, obraz[], shots, note, status`.
- `days[]`: `date, title, blocks[{time,title,shots[],note}]` – pořadí záběrů v bloku je natáčecí pořadí.
- `lit`: `scenes[{n,heading}]`, `blocks[{id,scene,kind,char,text}]` (literární scénář po úsecích).
- Mapování záběr → literární blok je **automatické a hrubé**, proto musí jít ručně opravit v editačním režimu (viz níže).
- Extra soubory: `svetlo.html` (plán osvětlení, zobraz v iframe), `rekvizity.pdf`, `storyboard_v3.pdf`.

## Záložky
1. **Jednotlivé záběry** (výchozí) – viz detail níže.
2. **Natáčecí plán** – 4 dny, časové bloky, u bloků klikací čísla záběrů (otevřou detail), checkbox „natočeno".
3. **Literární scénář** – vykreslený z `lit` (nadpisy scén, repliky, popisy), vyhledávání; u bloku odkaz „záběry k tomuto místu".
4. **Technický scénář** – tabulka všech záběrů (# | typ | úhel | pohyb | zvuk | poznámky | popis akce) seskupená po Obrazech, s hlavičkou Obrazu (objektivy, světlo, formát), filtr/vyhledávání, sticky hlavička.
5. **Storyboard** – mřížka miniatur (lazy loading), klik = lightbox s šipkami a klávesami ←/→; odkaz na stažení `storyboard_v3.pdf`.
6. **Světlo a rekvizity** – plán osvětlení (iframe `svetlo.html`) + tabulka rekvizit (stav nemáme/máme/sehnáno, editovatelný, odkaz na `rekvizity.pdf`).
7. **Google Disk** – velké tlačítko s odkazem (URL v konfiguraci / editovatelný v edit režimu).

## Záložka „Jednotlivé záběry"
- **Přepínač jedním kliknutím (segmented control nahoře, vždy viditelný): „Podle scénáře" ⇄ „Podle natáčecího dne".** Volba se pamatuje (localStorage).
  - Podle scénáře: skupiny podle Obrazu (#1–7, rozbalovací hlavička s názvem, lokací, formátem, světlem), uvnitř záběry 1→103.
  - Podle dne: skupiny Čtvrtek/Pátek/Sobota/Neděle → časové bloky → záběry v natáčecím pořadí (`dayOrder`). Hlavička bloku ukazuje čas a poznámku. Datum dne editovatelné.
- Řádek záběru: číslo, miniatura, typ záběru, krátký popis, štítky (světelný stav H1/A/B1/B2, poměr stran, flags panenka/dítě/Eliška-7, den), checkbox „natočeno".
- **Rozkliknutí (accordion nebo boční panel, na mobilu celá obrazovka)**:
  1. Literární scénář: hlavní blok zvýrazněný + 2–3 bloky před a po (z `lit.blocks`, podle `shot.lit`), odkaz „celá scéna".
  2. Storyboard: velký obrázek záběru; **návaznost** – vedle/pod malé náhledy předchozího a následujícího záběru (v aktuálně zvoleném pořadí i v pořadí scénáře), klik přeskočí.
  3. Popis akce, Scénář (technický – typ, úhel), Kamera (úhel, pohyb, objektiv z Obrazu), Zvuk, Poznámky.
  4. Nasvícení scény (z `scenes[].light` + světelný stav).
  5. Rekvizity pro tento záběr (`shot.props`) + náhrady za rizikové (víno, léky, hrnec, miminko).
  6. Pole „Poznámky k návaznosti" (uživatelské, ukládané).
- Filtry a hledání (sticky lišta): postava, lokace/Obraz, den, poměr stran, světelný stav, rekvizita, flagy; fulltext přes popis/zvuk/poznámky. Počet výsledků.
- Klávesnice: ↑/↓ (nebo J/K) mezi záběry, Enter rozbalit, Esc zavřít.

## Režim úprav
- Výchozí = **jen náhled**. V pravém horním/dolním rohu malé nenápadné tlačítko (✎) přepíná „režim úprav". V něm jsou texty (akce, zvuk, poznámky, světlo, čas bloků, datum dne, odkaz na Disk, stav rekvizit, mapování záběr→literární blok, pořadí v dnu) editovatelné inline.
- Úpravy se ukládají do `localStorage` jako *overlay* nad `data.json` (nepřepisují originál); tlačítka **Export JSON / Import JSON / Obnovit původní**. (Veřejná appka bez backendu → trvalé sdílené úpravy řeší export a commit nového `data.json`.)
- „Natočeno" a poznámky fungují i mimo režim úprav.

## Tisk / export
- Tlačítko „Tisk dne" u každého dne: čistý tisk (print CSS) – časový plán, u záběrů miniatura + akce + zvuk + rekvizity + světlo, jeden den = nové stránky. Použij `window.print()` s `@media print` (světlé téma, bez ovládacích prvků).

## UX / technika
- **Laptop first**, plně responzivní pro iPad (dvousloupcový layout, seznam + detail) a iPhone (jeden sloupec, spodní tab bar, velké cíle ≥44 px, detail jako celostránkový panel).
- Světlý a tmavý režim podle systému + ruční přepínač; tmavý ideální pro natáčení.
- **PWA**: manifest + service worker (precache `data.json`, miniatur, appky; velké obrázky cache při prvním zobrazení), funguje offline na place; ikona.
- Obrázky: `thumb` v seznamech, `img` v detailu, `loading="lazy"`, rezervované poměry stran (poměr stran záběru z `ratio`, 4:3 rámeček vykresli skutečně jako 4:3).
- Vizuální styl: věcný produkční nástroj, tlumené barvy odpovídající filmu (desaturovaná, chladná šeď + jeden teplý akcent), čitelná typografie (např. Inter / Public Sans), bez zbytečných ozdob.
- Přístupnost: sémantické HTML, fokus, kontrasty, klávesnice.
- Deep linky: `#/zabery/42`, `#/den/2026-11-07`, `#/storyboard` atd.; sdílitelné.

## Postup
1. Navrhni strukturu projektu a stručně ji popiš, pak implementuj.
2. Nejdřív záložka „Jednotlivé záběry" (včetně přepínače pořadí a detailu), potom ostatní záložky, režim úprav, tisk, PWA.
3. Otestuj ve třech šířkách (1440, 820, 390 px) a v obou tématech; ověř, že přepínač scénář/den zachová otevřený záběr.
4. Připrav README s nasazením (GitHub Pages) a popisem, jak aktualizovat `data.json`.
