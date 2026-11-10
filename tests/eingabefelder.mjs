// v2.1.2: Eingabefelder ohne Anschnitt – Cursor, Text und Platzhalter (Chromium und WebKit, 320/390/1440 px, Hell/Dunkel).
// Gemessen per Bildvergleich (Bild mit Cursor bzw. Schrift minus Bild ohne):
//  · Haupt-Eingabe „Frag Gabi oder diktiere …“ (320/390/1440 px): Textanfang ≥ 16 px vom Rahmen, Innenabstand im Textfeld
//    links/rechts ≥ 18 px. Cursor am Zeilenanfang (leeres Feld ohne Platzhalter; vor Leerzeichen) so hoch wie ein freier
//    Cursor am Zeilenende und mindestens 85 % seiner Fläche – eine runde Schnittkante nimmt dem Cursor Fläche. „gyÄÖ“ so groß
//    wie frei gesetzt. Platzhalter einzeilig wie eine vom Browser sauber mit „…“ gekürzte Vergleichszeile, mit Fokus ohne
//    harte Kante rechts. 5 Zeilen ohne inneres Scrollen. Nirgends scrollWidth > clientWidth.
//  · Bei 390/1440 px außerdem Suche, Umbenennen, Zugangscode, Entwurf bearbeiten (erstes Feld), Neuer Test-Patient (beide
//    Felder): Cursor am Anfang wie oben, kein scrollWidth > clientWidth.
// Dazu Screenshots (leer, „gyÄÖ“, 5 Zeilen; mit Fokus und Cursor) für die Sichtprüfung.
// Allein: PLAYWRIGHT_MODUL=… node tests/eingabefelder.mjs [screenshot-ordner] [basis-url]   (lokaler Server wie bei v2.mjs)
// In tests/v2.mjs als Block 5 eingebunden. GABI_LIVE=1: ohne Zugangscode-Feld (keine Seite ohne Demo am Live-Worker).
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const ZEILEN5 = ["gyÄÖ Zeile eins", "gyÄÖ Zeile zwei", "gyÄÖ Zeile drei", "gyÄÖ Zeile vier", "gyÄÖ Zeile fünf"].join("\n");

/** Rahmen der Pixel, die sich zwischen zwei gleich großen PNGs unterscheiden – in CSS-Pixeln relativ zum Ausschnitt. */
async function unterschied(hilfe, a, b, dsf) {
  return hilfe.evaluate(async ({ a, b, dsf }) => {
    const bild = (b64) => new Promise((ok, f) => { const i = new Image(); i.onload = () => ok(i); i.onerror = f; i.src = `data:image/png;base64,${b64}`; });
    const [ia, ib] = await Promise.all([bild(a), bild(b)]);
    const w = ia.naturalWidth, h = ia.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, w, h).data;
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1, n = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 40) {
        n++; x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy);
      }
    }
    // n: Fläche in CSS-Pixeln² (eine runde Schnittkante nimmt dem 2 px breiten Safari-Cursor Fläche, nicht Höhe)
    return x1 < 0 ? null : { links: x0 / dsf, rechts: (x1 + 1) / dsf, oben: y0 / dsf, unten: (y1 + 1) / dsf, w: (x1 + 1 - x0) / dsf, h: (y1 + 1 - y0) / dsf, n: n / (dsf * dsf) };
  }, { a: a.toString("base64"), b: b.toString("base64"), dsf });
}
const verschoben = (k, clip) => k && { ...k, links: k.links + clip.x, rechts: k.rechts + clip.x, oben: k.oben + clip.y, unten: k.unten + clip.y };

/** Cursor an Stelle pos: Bild mit Cursor minus Bild mit caret-color: transparent. Blinken/Ausblenden: mehrmals, größtes Ergebnis. */
async function cursor(page, hilfe, dsf, sel, pos, clip) {
  let best = null;
  for (let v = 0, treffer = 0; v < 16 && treffer < 3; v++) {
    await page.evaluate(({ sel, pos }) => { const t = document.querySelector(sel); t.style.caretColor = ""; t.focus({ preventScroll: true }); t.setSelectionRange(pos, pos); }, { sel, pos });
    await warte(40); // Blinken beginnt neu – voll sichtbar
    const a = await page.screenshot({ clip, caret: "initial" });
    await page.evaluate((sel) => { document.querySelector(sel).style.caretColor = "transparent"; }, sel);
    const b = await page.screenshot({ clip, caret: "initial" });
    await page.evaluate((sel) => { document.querySelector(sel).style.caretColor = ""; }, sel);
    const k = verschoben(await unterschied(hilfe, a, b, dsf), clip);
    if (k && k.w <= 4 && k.h >= 6) { treffer++; if (!best || k.n > best.n) best = k; }
  }
  return best;
}
/** Bild für die Sichtprüfung – erst wenn Fokus-Ring fertig und der Cursor im Bild ist (Blinken: wiederholen). */
async function bildMitCursor(page, sel, pos, clip, pfad) {
  await page.focus(sel);
  await warte(400);
  let letztes = null;
  for (let v = 0; v < 16; v++) {
    await page.evaluate(({ sel, pos }) => { const t = document.querySelector(sel); t.style.caretColor = ""; t.focus({ preventScroll: true }); t.setSelectionRange(pos, pos); }, { sel, pos });
    await warte(40);
    const a = await page.screenshot({ clip, caret: "initial" });
    await page.evaluate((sel) => { document.querySelector(sel).style.caretColor = "transparent"; }, sel);
    const b = await page.screenshot({ clip, caret: "initial" });
    await page.evaluate((sel) => { document.querySelector(sel).style.caretColor = ""; }, sel);
    letztes = a;
    if (!a.equals(b)) break;
  }
  await writeFile(pfad, letztes);
}
/** Tinte der Schrift im Feld: Bild mit Schrift minus Bild mit durchsichtiger Schrift (ohne Cursor). */
async function tinte(page, hilfe, dsf, sel, clip) {
  const a = await page.screenshot({ clip, caret: "hide" });
  await page.evaluate((sel) => { const t = document.querySelector(sel); t.style.color = "transparent"; t.style.webkitTextFillColor = "transparent"; }, sel);
  const b = await page.screenshot({ clip, caret: "hide" });
  await page.evaluate((sel) => { const t = document.querySelector(sel); t.style.color = ""; t.style.webkitTextFillColor = ""; }, sel);
  return verschoben(await unterschied(hilfe, a, b, dsf), clip);
}
/** Platzhalter-Tinte: Bild mit Platzhalter minus Bild mit leerem Platzhalter (Feld leer, ohne Fokus-Cursor). */
async function platzhalterTinte(page, hilfe, dsf, sel, clip) {
  const a = await page.screenshot({ clip, caret: "hide" });
  const alt = await page.evaluate((sel) => { const t = document.querySelector(sel); const p = t.placeholder; t.placeholder = ""; return p; }, sel);
  const b = await page.screenshot({ clip, caret: "hide" });
  await page.evaluate(({ sel, alt }) => { document.querySelector(sel).placeholder = alt; }, { sel, alt });
  return verschoben(await unterschied(hilfe, a, b, dsf), clip);
}
/** Derselbe Text frei (ohne Feld, ohne Beschnitt) in der Schrift des Felds – Tintengröße als Vergleich.
 *  Mit breite: einzeilig in genau dieser Breite, zu Langes vom Browser mit „…“ gekürzt. Ergebnis relativ zum Textanfang. */
async function freieTinte(page, hilfe, dsf, sel, text, breite = 0) {
  const r = await page.evaluate(({ sel, text, breite }) => {
    const t = document.querySelector(sel), cs = getComputedStyle(t);
    const d = document.createElement("div"); d.id = "messprobe";
    for (const p of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "fontFeatureSettings", "fontVariationSettings", "fontKerning", "wordSpacing", "lineHeight", "color"]) d.style[p] = cs[p];
    Object.assign(d.style, { position: "fixed", left: "8px", top: "8px", padding: "16px", whiteSpace: "pre", zIndex: "99999", background: getComputedStyle(document.body).backgroundColor, boxSizing: "content-box" });
    if (breite) Object.assign(d.style, { width: `${breite}px`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    d.textContent = text; document.body.append(d);
    const b = d.getBoundingClientRect();
    return { x: b.left, y: b.top, w: Math.ceil(b.width), h: Math.ceil(b.height) };
  }, { sel, text, breite });
  const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
  const a = await page.screenshot({ clip });
  await page.evaluate(() => { document.querySelector("#messprobe").style.color = "transparent"; });
  const b = await page.screenshot({ clip });
  await page.evaluate(() => document.querySelector("#messprobe").remove());
  const k = await unterschied(hilfe, a, b, dsf);
  return k && { ...k, links: k.links - 16, rechts: k.rechts - 16, oben: k.oben - 16, unten: k.unten - 16 }; // ohne Innenabstand der Probe
}
const geometrie = (page, sel) => page.evaluate((sel) => {
  const t = document.querySelector(sel), r = t.getBoundingClientRect(), cs = getComputedStyle(t);
  return {
    links: r.left, oben: r.top, rechts: r.right, unten: r.bottom, hoehe: r.height,
    inhaltLinks: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
    inhaltOben: r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop),
    inhaltUnten: r.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom),
    pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), zeile: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
    sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight,
  };
}, sel);

/** Cursor am Zeilenanfang (leeres Feld; vor Leerzeichen) gegen einen freien Cursor am Zeilenende (nach Leerzeichen):
 *  gleich hoch und mindestens 85 % der Fläche – sonst ist er angeschnitten. Dazu scrollWidth. Für alle Felder gleich. */
async function cursorPruefen(page, hilfe, dsf, sel, text = "gyÄÖ") {
  await page.fill(sel, "");
  await page.focus(sel);
  await warte(350); // Fokus-Ring fertig einblenden
  const g0 = await geometrie(page, sel);
  const clip = (g) => ({ x: Math.max(0, g.inhaltLinks - 6), y: Math.max(0, g.oben), width: 100, height: Math.min(g.hoehe, 120) });
  // leeres Feld ohne Platzhalter messen: der Cursor liegt sonst zum Teil unter dessen erstem Buchstaben (so zeichnen es die Browser)
  const platzhalter = await page.evaluate((sel) => { const t = document.querySelector(sel); const p = t.getAttribute("placeholder"); t.removeAttribute("placeholder"); return p; }, sel);
  const leer = await cursor(page, hilfe, dsf, sel, 0, clip(g0));
  await page.evaluate(({ sel, platzhalter }) => { if (platzhalter !== null) document.querySelector(sel).setAttribute("placeholder", platzhalter); }, { sel, platzhalter });
  await page.fill(sel, `  ${text}  `);
  const g1 = await geometrie(page, sel);
  const anfang = await cursor(page, hilfe, dsf, sel, 0, clip(g1));
  const frei = await cursor(page, hilfe, dsf, sel, text.length + 4, clip(g1));
  await page.fill(sel, text);
  const g2 = await geometrie(page, sel);
  const ok = Boolean(leer && anfang && frei) && anfang.h >= frei.h - 1 && leer.h >= frei.h - 1.5 && anfang.n >= 0.85 * frei.n && leer.n >= 0.85 * frei.n;
  const f = (k) => (k ? `${r2(k.w)}×${r2(k.h)} px/${r2(k.n)} px²` : "–");
  return { ok, text: `Cursor vorn ${f(anfang)}, im leeren Feld ${f(leer)}, frei am Zeilenende ${f(frei)}`, g0, g1: g2, swOk: g0.sw <= g0.cw && g1.sw <= g1.cw && g2.sw <= g2.cw };
}

export async function eingabefelderPruefen({ chromium, webkit, basis, aus, pruefe, live = false, breiten = [320, 390, 1440] }) { // eslint-disable-line max-statements
  await mkdir(aus, { recursive: true });
  // z. B. GABI_MOTOREN=chromium (schneller Einzellauf); „webkit“ und „safari“ meinen dasselbe
  const nur = process.env.GABI_MOTOREN ? process.env.GABI_MOTOREN.split(",").map((m) => (m.trim() === "webkit" ? "safari" : m.trim())) : null;
  if (process.env.GABI_BREITEN) breiten = process.env.GABI_BREITEN.split(",").map(Number);
  const motoren = [["chromium", chromium], ["safari", webkit]].filter(([m]) => !nur || nur.includes(m));
  pruefe(motoren.length > 0 && breiten.length > 0 && breiten.every((b) => b >= 300), `Eingabefelder: Auswahl ergibt Prüfungen (Browser ${motoren.map(([m]) => m).join(", ") || "keiner"}, Breiten ${breiten.join(", ") || "keine"})`);
  for (const [motor, typ] of motoren) {
    const browser = await typ.launch();
    const hilfe = await (await browser.newContext()).newPage();
    for (const breite of breiten) for (const schema of ["light", "dark"]) {
      const mobil = breite < 768, dsf = mobil ? 3 : 2;
      const name = `${motor} ${breite}px ${schema === "dark" ? "dunkel" : "hell"}`;
      const datei = `eingabe-${motor}-${breite}-${schema === "dark" ? "dunkel" : "hell"}`;
      const ctx = await browser.newContext({ viewport: { width: breite, height: mobil ? 844 : 900 }, deviceScaleFactor: dsf, isMobile: mobil, hasTouch: mobil, colorScheme: schema });
      await ctx.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); } catch { /* egal */ } });
      const page = await ctx.newPage();
      const fehlerImBrowser = [];
      page.on("pageerror", (e) => fehlerImBrowser.push(e.message));
      await page.goto(`${basis}/?demo=1#/`);
      await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
      await page.evaluate(() => document.fonts.ready);
      await warte(450);

      // --- Haupt-Eingabe -----------------------------------------------------------------------------------------
      const T = "#eingabe-text";
      await page.click(T);
      const rahmen = () => page.evaluate(() => { const r = document.querySelector("#eingabe").getBoundingClientRect(); return { links: r.left, oben: r.top, unten: r.bottom }; });
      const c = await cursorPruefen(page, hilfe, dsf, T);
      const f = await rahmen();
      // Ausschnitt fürs Messen: 3 px innerhalb der runden Kante (deren Kantenglättung bleibt draußen), aber nie rechts vom
      // Textfeld-Anfang – im alten Stand begann der Text direkt an der Feldkante
      const innen = (g, max = Infinity) => { const x = Math.max(g.links, f.links + 3); return { x, width: Math.floor(Math.min(max, g.rechts - 3 - x)) }; };
      pruefe(c.g1.inhaltLinks - f.links >= 16 && c.g1.pl >= 18 && c.g1.pr >= 18,
        `${name}: Eingabe – Textanfang ${r2(c.g1.inhaltLinks - f.links)} px vom Rahmen (≥ 16), Innenabstand im Textfeld links ${c.g1.pl} / rechts ${c.g1.pr} px (≥ 18)`);
      pruefe(c.ok, `${name}: Eingabe – Cursor am Zeilenanfang nicht angeschnitten (${c.text})`);
      // „gyÄÖ“: Tinte so groß wie frei gesetzt (Ober-/Unterlängen, Umlaute, erster Buchstabe vollständig)
      const g1 = c.g1;
      const t1 = await tinte(page, hilfe, dsf, T, { ...innen(g1, 160), y: g1.oben, height: g1.hoehe });
      const frei = await freieTinte(page, hilfe, dsf, T, "gyÄÖ");
      const tinteOk = Boolean(t1 && frei) && Math.abs(t1.w - frei.w) <= 1.01 && Math.abs(t1.h - frei.h) <= 1.01 && t1.oben >= g1.oben + 1 && t1.unten <= g1.unten - 1;
      pruefe(tinteOk, `${name}: Eingabe – „gyÄÖ“ vollständig (Tinte ${t1 ? `${r2(t1.w)}×${r2(t1.h)}` : "–"} px, frei ${frei ? `${r2(frei.w)}×${r2(frei.h)}` : "–"} px)`);
      await bildMitCursor(page, T, 4, { x: 0, y: Math.max(0, f.oben - 36), width: breite, height: f.unten - f.oben + 72 }, join(aus, `${datei}-2-gyAeOe.png`));
      // leer: Platzhalter in einer Zeile, nichts unten angeschnitten
      await page.fill(T, "");
      await page.evaluate(() => document.activeElement.blur());
      await warte(400); // Fokus-Ring des Rahmens fertig ausblenden
      const g0 = await geometrie(page, T);
      const ph = await platzhalterTinte(page, hilfe, dsf, T, { ...innen(g0), y: g0.oben, height: g0.hoehe });
      // Vergleich: derselbe Text frei in einer Zeile der Inhaltsbreite, vom Browser sauber mit „…“ gekürzt (falls zu lang)
      const soll = await freieTinte(page, hilfe, dsf, T, await page.$eval(T, (t) => t.placeholder), Math.floor(g0.rechts - g0.pr - g0.inhaltLinks));
      const phOk = Boolean(ph && soll) && ph.h <= g0.zeile + 0.5 && ph.unten <= g0.inhaltUnten + 0.5 && ph.rechts <= g0.rechts - g0.pr + 1
        && Math.abs((ph.links - g0.inhaltLinks) - soll.links) <= 1 && Math.abs(ph.w - soll.w) <= 1.5;
      pruefe(phOk, `${name}: Eingabe – Platzhalter einzeilig, ganz oder sauber mit „…“ gekürzt, nirgends angeschnitten (Tinte ${ph ? `${r2(ph.w)}×${r2(ph.h)}` : "–"} px, Vergleich ${soll ? `${r2(soll.w)}×${r2(soll.h)}` : "–"} px, Zeile ${g0.zeile} px)`);
      // mit Fokus: Chromium zeigt dann kein „…“ – nirgends darf eine harte Schnittkante rechts zu sehen sein
      await page.focus(T);
      await warte(400);
      const gF = await geometrie(page, T);
      const phF = await platzhalterTinte(page, hilfe, dsf, T, { ...innen(gF), y: gF.oben, height: gF.hoehe });
      const kante = gF.rechts - gF.pr;
      pruefe(Boolean(phF) && phF.h <= gF.zeile + 0.5 && phF.rechts <= kante - 1,
        `${name}: Eingabe – Platzhalter mit Fokus ohne harte Schnittkante rechts (Schrift endet ${phF ? r2(kante - phF.rechts) : "–"} px vor der Kante)`);
      await bildMitCursor(page, T, 0, { x: 0, y: Math.max(0, f.oben - 36), width: breite, height: f.unten - f.oben + 72 }, join(aus, `${datei}-1-leer.png`));
      // fünf Zeilen: wächst mit, keine Zeile unten abgeschnitten, nichts seitlich
      await page.fill(T, ZEILEN5);
      await warte(300);
      // das Feld wächst, schmale Handys scrollen dabei nach: messen, bis die Lage vor und nach dem Bild gleich ist
      let g5 = null, t5 = null;
      for (let v = 0; v < 4; v++) {
        g5 = await geometrie(page, T);
        t5 = await tinte(page, hilfe, dsf, T, { ...innen(g5, 200), y: g5.oben, height: g5.hoehe });
        if (Math.abs((await geometrie(page, T)).oben - g5.oben) < 0.5) break;
        await warte(300);
      }
      pruefe(g5.sh <= g5.ch + 1 && Boolean(t5) && t5.oben >= g5.oben + 1 && t5.unten <= g5.unten - 1 && c.swOk && g5.sw <= g5.cw,
        `${name}: Eingabe – 5 Zeilen ohne inneres Scrollen (scrollHeight ${g5.sh}/${g5.ch}), Schrift ${t5 ? `${r2(t5.oben - g5.oben)} px unter der Oberkante, ${r2(g5.unten - t5.unten)} px über der Unterkante` : "–"}, kein scrollWidth > clientWidth (${c.swOk ? "leer/1 Zeile ok" : "leer/1 Zeile zu breit"}, 5 Zeilen ${g5.sw}/${g5.cw})`);
      {
        const f5 = await rahmen();
        await bildMitCursor(page, T, ZEILEN5.length, { x: 0, y: Math.max(0, f5.oben - 36), width: breite, height: f5.unten - f5.oben + 72 }, join(aus, `${datei}-3-fuenf.png`));
      }
      await page.fill(T, "");

      // --- weitere Felder (Laptop und Handy, beide Schemata) -----------------------------------------------------
      if (breite !== 320) {
        const feld = async (bez, sel) => {
          const r = await cursorPruefen(page, hilfe, dsf, sel);
          pruefe(r.ok && r.swOk, `${name}: ${bez} – Cursor am Anfang nicht angeschnitten, kein scrollWidth > clientWidth (${r.text})`);
          if (schema === "dark") {
            const g = await geometrie(page, sel);
            await bildMitCursor(page, sel, 0, { x: Math.max(0, g.links - 12), y: Math.max(0, g.oben - 12), width: Math.min(breite - Math.max(0, g.links - 12), g.rechts - g.links + 24), height: g.hoehe + 24 }, join(aus, `${datei}-feld-${bez.toLowerCase().replace(/[^a-z]+/g, "-")}.png`));
          }
        };
        // Umbenennen: ein Gespräch anlegen, Stift in der Seitenleiste bzw. Schublade
        await page.fill(T, "Was kostet Osteopathie?");
        await page.click("#senden");
        await page.waitForFunction(() => /85 €/.test(([...document.querySelectorAll(".von-gabi .nachricht-text")].pop() || {}).textContent || "") && !document.querySelector("#senden.stoppt"), null, { timeout: 20000 });
        const seitenleiste = await page.isVisible("#seiten-gespraeche"); // erst ab 1024 px, sonst Schublade über ☰
        const liste = seitenleiste ? "#seiten-gespraeche" : "#schublade-liste";
        if (!seitenleiste) { await page.click("#kopf-menue"); await page.waitForSelector("#schublade[open]"); await warte(350); }
        const eintrag = page.locator(`${liste} .gespraech-eintrag`).first();
        if (seitenleiste) await eintrag.hover();
        await eintrag.locator('[data-gespraech-aktion="umbenennen"]').click();
        await page.waitForSelector(`${liste} .gespraech-feld`);
        await feld("Umbenennen", `${liste} .gespraech-feld`);
        await page.press(`${liste} .gespraech-feld`, "Escape");
        if (!seitenleiste) { await page.click("#schublade-zu"); await page.waitForFunction(() => !document.querySelector("#schublade").open); await warte(300); }
        // Entwurf bearbeiten
        await page.locator('#chips-leiste [data-schnell="diktat"]').click();
        await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click();
        await page.locator('[data-aktion="beispiel"]').last().click();
        await page.waitForSelector('.karte-entwurf [data-aktion="entwurf-bearbeiten"]', { timeout: 20000 });
        await page.waitForFunction(() => !document.querySelector("#senden.stoppt"), null, { timeout: 20000 });
        await page.locator('[data-aktion="entwurf-bearbeiten"]').last().click();
        await page.waitForSelector(".karte-entwurf textarea.eingabefeld");
        await feld("Entwurf bearbeiten", ".karte-entwurf textarea.eingabefeld");
        // Suche im Notizordner und Neuer Test-Patient
        await page.evaluate(() => { location.hash = "#/notizen"; });
        await page.waitForSelector("#suche");
        await warte(300);
        await feld("Suche", "#suche");
        await page.fill("#suche", "");
        await page.locator('[data-ordner="patient-neu"]:visible').first().click();
        await page.waitForSelector("#dialog-patient[open] #patient-kuerzel");
        await warte(300);
        await feld("Neuer Test-Patient Kürzel", "#patient-kuerzel");
        await feld("Neuer Test-Patient Beschreibung", "#patient-pseudonym");
        await page.click("#patient-abbrechen");
        // Zugangscode (Seite ohne Demo – nur am lokalen Server)
        if (!live) {
          const ctxZ = await browser.newContext({ viewport: { width: breite, height: mobil ? 844 : 900 }, deviceScaleFactor: dsf, isMobile: mobil, hasTouch: mobil, colorScheme: schema });
          await ctxZ.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); } catch { /* egal */ } });
          const seite = await ctxZ.newPage();
          seite.on("pageerror", (e) => fehlerImBrowser.push(e.message));
          await seite.goto(`${basis}/#/`);
          await seite.waitForSelector("#zugang-code");
          await seite.evaluate(() => document.fonts.ready);
          await warte(300);
          const r = await cursorPruefen(seite, hilfe, dsf, "#zugang-code");
          pruefe(r.ok && r.swOk, `${name}: Zugangscode – Cursor am Anfang nicht angeschnitten, kein scrollWidth > clientWidth (${r.text})`);
          if (schema === "dark") {
            const g = await geometrie(seite, "#zugang-code");
            await bildMitCursor(seite, "#zugang-code", 0, { x: Math.max(0, g.links - 12), y: Math.max(0, g.oben - 12), width: Math.min(breite - Math.max(0, g.links - 12), g.rechts - g.links + 24), height: g.hoehe + 24 }, join(aus, `${datei}-feld-zugangscode.png`));
          }
          await seite.fill("#zugang-code", ""); // nie absenden
          await ctxZ.close();
        }
      }
      pruefe(fehlerImBrowser.length === 0, `${name}: Eingabefelder – keine Fehler im Browser${fehlerImBrowser.length ? ` (${fehlerImBrowser.join(" | ")})` : ""}`);
      await ctx.close();
    }
    await browser.close();
  }
}

// allein gestartet
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
  const WURZEL = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const [, , aus = join(WURZEL, "screenshots", "eingabefelder"), basis = "http://localhost:8788"] = process.argv;
  const fehler = [];
  const pruefe = (ok, text) => { if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
  await eingabefelderPruefen({ chromium, webkit, basis, aus, pruefe, live: process.env.GABI_LIVE === "1" });
  console.log(fehler.length ? `\n${fehler.length} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
  process.exit(fehler.length ? 1 : 0);
}
