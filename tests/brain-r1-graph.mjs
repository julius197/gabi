// Prüfrunde 1 – Gebiet Graph, Kamera, Bedienung am Handy: Fehlertests zu den Funden 1, 2, 3, 4, 5 und 7.
// Jeder Abschnitt schlägt gegen den Stand vor der Korrektur (893abf8) an und ist danach grün.
//  1  Handy: Tipp auf einen Knoten – das Blatt verdeckt den Graphen nicht mehr ganz, der Knoten steht im freien Streifen,
//     nichts springt (Bild für Bild gemessen), nach dem Schließen steht alles wie vorher; Deep-Link, Sprung vom
//     Quellen-Chip, 320 px, „Bewegung reduzieren“; Laptop: Knoten rechts außen
//  2  Doppeltipp/Doppelklick zentriert den Knoten des ersten Tipps und löst im aufgehenden Detail nichts aus
//  3  Handy: Wisch neben einem Knoten verschiebt den Ausschnitt; Tippen trifft weiter großzügig; Halten greift
//  4  Neuzeichnen (Suche, Filter, Änderung) bewegt die Kamera nicht; Fokus-Modus behält den eigenen Zoom; Auswahlring
//  5  „Alles zeigen“: kein Knoten unter Minimap, Legende, Knöpfen; Legende auf kleiner Fläche geschlossen
//  7  Schloss an geschützten Knoten in der Standardansicht (hängt nicht am Zoom)
// Voraussetzung: lokaler Brain-Server (cd worker && PORT=… GABI_BRAIN=1 node dev/lokal.mjs). Nie gegen die Live-Seite.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-r1-graph.mjs [basis-url]
// Auswahl: GABI_MOTOREN=chromium,webkit · GABI_FUNDE=1,2,3,4,5,7
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Diese Tests laufen nur lokal – nie gegen die Live-Seite oder den Live-Worker."); process.exit(2); }

// Auch nicht gegen eine Vorschau, die mit einem echten Worker spricht – siehe tests/ziel.mjs.
await zielPruefen(basis, { live: false });
const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((m) => m.trim()).filter(Boolean);
const FUNDE = new Set((process.env.GABI_FUNDE || "1,2,3,4,5,7").split(",").map((t) => t.trim()));

const fehler = [];
let gezaehlt = 0;
const pruefe = (ok, text) => { gezaehlt++; if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const rund = (w, n = 0) => (w == null ? w : Math.round(w * 10 ** n) / 10 ** n);

function konsoleBeobachten(page) {
  const meldungen = [];
  page.on("console", (m) => {
    if (!["error", "warning"].includes(m.type())) return;
    const t = m.text();
    if (/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/.test(t)) return; // WebKit, harmlos (wie tests/brain.mjs)
    if (/willReadFrequently/.test(t)) return; // Hinweis von Chromium auf die Pixelproben dieses Tests
    meldungen.push(t);
  });
  page.on("pageerror", (e) => meldungen.push(`pageerror: ${e.message}`));
  return meldungen;
}
/** Keine echte Sprachausgabe in Testbrowsern (macOS spielt sie sonst laut ab). */
async function stumm(ctx) {
  await ctx.addInitScript(() => {
    const attrappe = { speak(u) { setTimeout(() => u && u.onend && u.onend(), 50); }, cancel() {}, pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
  });
}
async function kontext(browser, { geraet = "laptop", wenigBewegung = false, breite = 0, hoehe = 0, dichte = 0 } = {}) {
  const mobil = geraet === "handy";
  const o = { viewport: { width: breite || (mobil ? 390 : 1440), height: hoehe || (mobil ? 844 : 900) }, isMobile: mobil, hasTouch: mobil, reducedMotion: wenigBewegung ? "reduce" : "no-preference" };
  if (dichte) o.deviceScaleFactor = dichte;
  const ctx = await browser.newContext(o);
  await stumm(ctx);
  return ctx;
}
const BEREIT = () => Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain);
async function demoSeite(ctx, hash = "#/brain") {
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1${hash}`);
  await page.waitForFunction(BEREIT, null, { timeout: 20000 });
  return { page, konsole };
}
const messen = (page) => page.evaluate(() => window.GabiBrainAnsicht.aktuell.messen());
const ort = (page, id) => page.evaluate((i) => window.GabiBrainAnsicht.aktuell.ort(i), id);
const idVon = (page, titel) => page.evaluate((t) => { const k = window.GabiBrainAnsicht.aktuell.brain.findeTitel(t); return k ? k.id : null; }, titel);
const graphRuht = (page) => page.waitForFunction(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return Boolean(m && m.ruht); }, null, { timeout: 30000 });
/** Graph vollständig da (53 Knoten im Demo), Layout in Ruhe, Einpass-Flug vorbei. */
async function graphFertig(page) {
  await page.waitForSelector("canvas.brain-graph-flaeche");
  await page.waitForFunction(() => { const a = window.GabiBrainAnsicht.aktuell; const m = a.messen(); return a.brain.knoten().length === 53 && m && m.knoten === 53; }, null, { timeout: 20000 });
  await graphRuht(page);
  await warte(700);
}
const alleOrte = (page) => page.evaluate(() => {
  const a = window.GabiBrainAnsicht.aktuell;
  return a.brain.knoten().map((k) => ({ id: k.id, titel: k.titel, art: k.art, status: k.status, geschuetzt: Boolean(k.geschuetzt), ...(a.ort(k.id) || { x: null, y: null, r: null }) }));
});
const rechteck = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, b: r.width, h: r.height, rechts: r.right, unten: r.bottom, versteckt: e.hidden }; }, sel);
const detailOffen = (page) => page.waitForFunction(() => { const d = document.querySelector("#brain-detail"); return Boolean(d && !d.hidden); }, null, { timeout: 6000 });
const detailZu = (page) => page.waitForFunction(() => document.querySelector("#brain-detail").hidden, null, { timeout: 6000 });
const detailTitel = (page) => page.evaluate(() => { const d = document.querySelector("#brain-detail"); const t = d && !d.hidden ? d.querySelector("#brain-detail-titel") : null; return t ? t.textContent.trim() : ""; });
const rollY = (page) => page.evaluate(() => Math.round(window.scrollY));
/** Wie viele Knoten liegen in der Graphfläche? */
async function imBild(page) {
  const f = await rechteck(page, "#brain-graph-rahmen");
  const o = (await alleOrte(page)).filter((k) => k.x != null);
  return { zahl: o.filter((k) => k.x >= f.x && k.x <= f.rechts && k.y >= f.y && k.y <= f.unten).length, von: o.length };
}
/** Der sichtbare Streifen des Graphen: unter dem Kopf, über dem Blatt (Handy) bzw. links vom Panel (Laptop). */
async function freierBereich(page) {
  return page.evaluate(() => {
    const g = document.querySelector("#brain-graph-rahmen").getBoundingClientRect();
    const d = document.querySelector("#brain-detail");
    const k = document.querySelector("#kopf");
    const laptop = matchMedia("(min-width: 1024px)").matches;
    const r = d && !d.hidden ? d.getBoundingClientRect() : null;
    const oben = Math.max(g.top, !laptop && k && !k.hidden ? k.getBoundingClientRect().bottom : 0, 0);
    const unten = Math.min(g.bottom, innerHeight, r && !laptop ? r.top : Infinity);
    const rechts = Math.min(g.right, r && laptop ? r.left : Infinity);
    return { links: g.left, oben, rechts, unten, hoehe: unten - oben, breite: rechts - g.left };
  });
}
const imBereich = (o, f, rand = 0) => Boolean(o) && o.x >= f.links + rand && o.x <= f.rechts - rand && o.y >= f.oben + rand && o.y <= f.unten - rand;

/**
 * Bild für Bild mitschreiben, wo ein Knoten im Fenster liegt (dazu Rollstand, Blatt, Zoom). Gelesen wird genau der Stand,
 * der gemalt wird: in einem ResizeObserver – der läuft in jedem Bild NACH allen requestAnimationFrame-Rückrufen und nach
 * dem Layout, direkt vor dem Malen (ein unsichtbares Hilfselement wechselt dafür in jedem Bild seine Breite).
 */
async function spurStart(page, id) {
  await page.evaluate((i) => {
    const a = window.GabiBrainAnsicht.aktuell;
    const s = { daten: [], an: true };
    const hilfe = document.createElement("div");
    hilfe.style.position = "fixed";
    hilfe.style.left = "-50px";
    hilfe.style.top = "0";
    hilfe.style.height = "1px";
    hilfe.style.width = "1px";
    hilfe.style.pointerEvents = "none";
    document.body.append(hilfe);
    const beobachter = new ResizeObserver(() => {
      if (!s.an) return;
      const brain = !document.querySelector("#ansicht-brain").hidden;
      const kennung = i || (brain ? location.hash.split("/")[2] : "");
      const o = brain && kennung ? a.ort(kennung) : null;
      const d = document.querySelector("#brain-detail");
      const m = a.messen();
      s.daten.push({ t: performance.now(), x: o ? o.x : null, y: o ? o.y : null, roll: window.scrollY, blatt: d && !d.hidden ? d.getBoundingClientRect().top : null, zoom: m ? m.zoom : null, brain });
    });
    beobachter.observe(hilfe);
    let n = 0;
    const bild = () => {
      if (!s.an) { beobachter.disconnect(); hilfe.remove(); return; }
      hilfe.style.width = `${1 + (++n % 2)}px`;
      requestAnimationFrame(bild);
    };
    requestAnimationFrame(bild);
    window.__spur = s;
  }, id);
}
const spurEnde = (page) => page.evaluate(() => { window.__spur.an = false; return window.__spur.daten; });
/** Bewegung auswerten: die Bilder, in denen sich die Lage ändert – Schritte, Richtungswechsel, Dauer. */
function bewegung(spur, feld = "y") {
  const p = spur.filter((e) => e[feld] != null);
  const schritte = [];
  for (let i = 1; i < p.length; i++) { const d = p[i][feld] - p[i - 1][feld]; if (Math.abs(d) > 0.5) schritte.push({ d, t: p[i].t }); }
  let wechsel = 0;
  for (let i = 1; i < schritte.length; i++) if (Math.sign(schritte[i].d) !== Math.sign(schritte[i - 1].d)) wechsel++;
  const weg = p.length ? p[p.length - 1][feld] - p[0][feld] : 0;
  return { bilder: schritte.length, wechsel, weg, groesster: schritte.reduce((m, s) => Math.max(m, Math.abs(s.d)), 0), dauer: schritte.length ? schritte[schritte.length - 1].t - schritte[0].t : 0 };
}

/** Finger auf der Graphfläche: Folge aus [art, x, y, pauseDanachMs] als Zeiger-Ereignisse (pointerType "touch"). */
const finger = (page, folge, zeigerId = 51) => page.evaluate(async ({ folge: liste, zeigerId: nr }) => {
  const c = document.querySelector("canvas.brain-graph-flaeche");
  for (const [art, x, y, pause] of liste) {
    c.dispatchEvent(new PointerEvent(art, { pointerId: nr, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: art === "pointerup" ? 0 : 1 }));
    if (pause) await new Promise((r) => setTimeout(r, pause));
  }
}, { folge, zeigerId });
/** Wisch von (x, y) um (dx, dy) in acht Schritten; halten = so lange liegt der Finger vorher still. */
const wisch = (page, x, y, dx, dy, halten = 0) => finger(page, [["pointerdown", x, y, halten], ...Array.from({ length: 8 }, (_, i) => ["pointermove", x + (dx * (i + 1)) / 8, y + (dy * (i + 1)) / 8, 12]), ["pointerup", x + dx, y + dy, 0]]);
const einpassen = async (page) => { await page.evaluate(() => document.querySelector('[data-brain="einpassen"]').click()); await warte(450); };
/** Liegt an der Stelle wirklich die Graphfläche (kein Bedienelement darüber)? */
const aufFlaeche = (page, p) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector("canvas.brain-graph-flaeche"), p);
const zustand = (page) => page.evaluate(() => {
  const a = window.GabiBrainAnsicht.aktuell;
  return {
    hash: location.hash, status: Object.fromEntries(a.brain.knoten().map((k) => [k.id, k.status])), dialog: Boolean(document.querySelector("dialog[open]")),
    fokus: !document.querySelector("#brain-fokus").hidden, filter: Boolean(document.querySelector("#brain-filter [aria-pressed='true']")), zuKlaeren: a.brain.gesundheit().zuKlaeren,
    bearbeitet: Boolean(document.querySelector("#brain-detail form[data-brain-form='knoten']")),
  };
});
/** Auswahlring um einen Knoten: acht Punkte auf dem Ring prüfen (Akzentgrün, deckend). */
const ringPunkte = (page, id) => page.evaluate((i) => {
  const a = window.GabiBrainAnsicht.aktuell;
  const c = document.querySelector("canvas.brain-graph-flaeche");
  const f = c.getBoundingClientRect();
  const p = a.ort(i);
  const s = c.width / f.width;
  const g = c.getContext("2d");
  let treffer = 0;
  for (let w = 0; w < 8; w++) {
    const x = Math.round((p.x - f.left + Math.cos((w * Math.PI) / 4 + 0.3) * (p.r + 4.4)) * s);
    const y = Math.round((p.y - f.top + Math.sin((w * Math.PI) / 4 + 0.3) * (p.r + 4.4)) * s);
    const d = g.getImageData(x, y, 1, 1).data;
    if (d[3] > 150 && d[1] > d[0] + 30 && d[1] > d[2] + 30) treffer++;
  }
  return treffer;
}, id);

// ---------------------------------------------------------------------------
// Fund 1 – Handy: Blatt, Knoten, Kamera nach dem Schließen
// ---------------------------------------------------------------------------
async function fund1Handy(browser, motor, { breite = 390, hoehe = 844, wenigBewegung = false } = {}) {
  const name = `Fund 1 · ${motor} Handy ${breite}×${hoehe}${wenigBewegung ? " (Bewegung reduziert)" : ""}`;
  const ctx = await kontext(browser, { geraet: "handy", breite, hoehe, wenigBewegung });
  const { page, konsole } = await demoSeite(ctx);
  await graphFertig(page);

  // --- a) Tipp auf einen Knoten tief im Graphen (dort läge er nach dem Öffnen unter dem Blatt) ---
  const alle = (await alleOrte(page)).filter((k) => k.x != null).sort((a, b) => b.y - a.y);
  let ziel = null;
  for (const k of alle) {
    if (k.y > hoehe - 30 || !(await aufFlaeche(page, k))) continue;
    if (k.art === "praxiswissen" || k.art === "frage") { ziel = k; break; } // Einträge mit Inhalt: Das Blatt wird hoch
  }
  const vorher = { ...(await ort(page, ziel.id)), zoom: (await messen(page)).zoom, roll: await rollY(page), imBild: await imBild(page) };
  await spurStart(page, ziel.id);
  await warte(120);
  await page.touchscreen.tap(vorher.x, vorher.y);
  await detailOffen(page);
  await warte(wenigBewegung ? 400 : 900);
  const auf = await spurEnde(page);
  const frei = await freierBereich(page);
  const offen = await ort(page, ziel.id);
  pruefe((await detailTitel(page)) === ziel.titel, `${name}: Tipp auf „${ziel.titel.slice(0, 30)}“ öffnet sein Detail`);
  pruefe(frei.hoehe >= (hoehe < 600 ? 120 : 150), `${name}: über dem Blatt bleibt Graph zu sehen (${rund(frei.hoehe)} px zwischen Kopf und Blatt – vorher 0)`);
  pruefe(imBereich(offen, frei, 8), `${name}: der getippte Knoten steht im freien Streifen über dem Blatt (y ${rund(offen.y)}, Streifen ${rund(frei.oben)}–${rund(frei.unten)})`);
  const bw = bewegung(auf);
  if (wenigBewegung) {
    pruefe(bw.bilder <= 1, `${name}: nichts fliegt – der Knoten steht nach einem einzigen Bild an seinem Platz (${bw.bilder} Bild${bw.bilder === 1 ? "" : "er"} mit Bewegung)`);
  } else {
    pruefe(bw.wechsel === 0 && bw.bilder >= (motor === "webkit" ? 3 : 6) && bw.groesster <= Math.abs(bw.weg) * 0.5 + 2,
      `${name}: der Knoten gleitet in einem Zug an seinen Platz – kein Sprung, kein Hin und Her (Bild für Bild: ${bw.bilder} Schritte in ${rund(bw.dauer)} ms, Weg ${rund(bw.weg)} px, größter Schritt ${rund(bw.groesster)} px, Richtungswechsel ${bw.wechsel})`);
    const rollBilder = bewegung(auf, "roll");
    pruefe(rollBilder.wechsel === 0 && (rollBilder.bilder === 0 || rollBilder.bilder >= (motor === "webkit" ? 3 : 6)), `${name}: die Seite rückt weich nach (kein Scroll-Sprung: ${rollBilder.bilder} Schritte, Weg ${rund(rollBilder.weg)} px)`);
  }

  // --- b) schließen: alles wie vorher (die Kamera wurde nie von Hand bewegt) ---
  await spurStart(page, ziel.id);
  await warte(120);
  await page.tap('[data-brain="detail-zu"]');
  await detailZu(page);
  await warte(wenigBewegung ? 300 : 700);
  const zu = await spurEnde(page);
  const nachher = { ...(await ort(page, ziel.id)), zoom: (await messen(page)).zoom, roll: await rollY(page), imBild: await imBild(page) };
  pruefe(Math.hypot(nachher.x - vorher.x, nachher.y - vorher.y) < 2 && nachher.zoom === vorher.zoom && nachher.roll === vorher.roll,
    `${name}: nach dem Schließen steht der Graph wieder wie vorher (Knoten (${rund(vorher.x)}, ${rund(vorher.y)}) → (${rund(nachher.x)}, ${rund(nachher.y)}), Zoom ${vorher.zoom} → ${nachher.zoom}, Rollstand ${vorher.roll} → ${nachher.roll})`);
  pruefe(nachher.imBild.zahl === nachher.imBild.von, `${name}: nach dem Schließen sind alle Knoten im Bild (${nachher.imBild.zahl} von ${nachher.imBild.von})`);
  const bz = bewegung(zu);
  pruefe(bz.wechsel === 0 && bz.bilder <= 1, `${name}: beim Schließen springt nichts nach – ein Bild, dann Ruhe (${bz.bilder} Bild${bz.bilder === 1 ? "" : "er"} mit Bewegung)`);

  if (breite === 390 && !wenigBewegung) {
    // --- c) eigener Ausschnitt: hineingezoomt und verschoben, dann getippt – nach dem Schließen genau dorthin zurück ---
    await page.tap('[data-brain="zoom"][data-wert="rein"]');
    await warte(350);
    const f0 = await rechteck(page, "#brain-graph-rahmen");
    const o0 = await ort(page, ziel.id);
    // so verschieben, dass der Knoten im unteren Drittel der Fläche steht
    const leer = await page.evaluate(({ f }) => {
      const a = window.GabiBrainAnsicht.aktuell;
      const orte = a.brain.knoten().map((k) => a.ort(k.id)).filter(Boolean);
      for (let y = f.y + 70; y < Math.min(innerHeight, f.unten) - 110; y += 12) for (let x = f.x + 80; x < f.rechts - 60; x += 12) {
        if (document.elementFromPoint(x, y) !== document.querySelector("canvas.brain-graph-flaeche")) continue;
        if (orte.every((o) => Math.hypot(o.x - x, o.y - y) > 40)) return { x, y };
      }
      return null;
    }, { f: f0 });
    if (leer) await wisch(page, leer.x, leer.y, Math.max(-40, Math.min(40, f0.x + f0.b / 2 - o0.x)), Math.max(-60, Math.min(60, f0.y + f0.h * 0.72 - o0.y)));
    await warte(250);
    const eigen = { ...(await ort(page, ziel.id)), zoom: (await messen(page)).zoom };
    const tippbar = eigen.y < hoehe - 30 && (await aufFlaeche(page, eigen));
    if (tippbar) {
      await page.touchscreen.tap(eigen.x, eigen.y);
      await detailOffen(page);
      await warte(900);
      const frei2 = await freierBereich(page);
      const offen2 = await ort(page, ziel.id);
      pruefe(imBereich(offen2, frei2, 8) && (await messen(page)).zoom === eigen.zoom, `${name}: eigener Ausschnitt – der getippte Knoten kommt in den freien Streifen, der Zoom bleibt (${eigen.zoom})`);
      await page.tap('[data-brain="detail-zu"]');
      await detailZu(page);
      await warte(700);
      const zurueck = { ...(await ort(page, ziel.id)), zoom: (await messen(page)).zoom };
      pruefe(Math.hypot(zurueck.x - eigen.x, zurueck.y - eigen.y) < 2 && zurueck.zoom === eigen.zoom, `${name}: … und nach dem Schließen steht der eigene Ausschnitt wieder genau so da (Knoten (${rund(eigen.x)}, ${rund(eigen.y)}) → (${rund(zurueck.x)}, ${rund(zurueck.y)}))`);

      // --- d) bei offenem Blatt von Hand verschoben: Dann bleibt die Kamera, wo die Hand sie hingestellt hat ---
      await page.touchscreen.tap(zurueck.x, zurueck.y);
      await detailOffen(page);
      await warte(900);
      const frei3 = await freierBereich(page);
      const vorWisch = await ort(page, ziel.id);
      const stelle = await page.evaluate(({ f }) => {
        const a = window.GabiBrainAnsicht.aktuell;
        const orte = a.brain.knoten().map((k) => a.ort(k.id)).filter(Boolean);
        for (let y = f.oben + 30; y < f.unten - 50; y += 10) for (let x = f.links + 80; x < f.rechts - 70; x += 10) {
          if (document.elementFromPoint(x, y) !== document.querySelector("canvas.brain-graph-flaeche")) continue;
          if (orte.every((o) => Math.hypot(o.x - x, o.y - y) > 34)) return { x, y };
        }
        return null;
      }, { f: frei3 });
      if (stelle) await wisch(page, stelle.x, stelle.y, 44, 22);
      await warte(250);
      const nachWisch = await ort(page, ziel.id);
      const rollOffen = await rollY(page);
      await page.tap('[data-brain="detail-zu"]');
      await detailZu(page);
      await warte(700);
      const geblieben = await ort(page, ziel.id);
      const rollZu = await rollY(page);
      // im Fenster rückt nur die Seite zurück – die Kamera selbst bleibt: Lage relativ zur Fläche vergleichen
      const erwartet = { x: nachWisch.x, y: nachWisch.y + (rollOffen - rollZu) };
      pruefe(Boolean(stelle) && Math.hypot(nachWisch.x - vorWisch.x - 44, nachWisch.y - vorWisch.y - 22) < 4 && Math.hypot(geblieben.x - erwartet.x, geblieben.y - erwartet.y) < 3,
        `${name}: bei offenem Blatt von Hand verschoben → nach dem Schließen bleibt die Kamera dort (kein Zurückstellen gegen die Hand; Abweichung ${rund(Math.hypot(geblieben.x - erwartet.x, geblieben.y - erwartet.y), 1)} px)`);
    } else pruefe(false, `${name}: Knoten für den eigenen Ausschnitt nicht antippbar`);
    await einpassen(page);

    // --- e) Reihe: Knoten quer durch den Graphen antippen – keiner liegt danach unter dem Blatt oder außerhalb der Fläche ---
    const reihe = (await alleOrte(page)).filter((k) => k.x != null).sort((a, b) => a.y - b.y).filter((_, i) => i % 3 === 0);
    let getippt = 0;
    let draussen = 0;
    let unvollstaendig = 0;
    for (const k of reihe) {
      const o = await ort(page, k.id);
      if (!o || o.y > hoehe - 20 || !(await aufFlaeche(page, o))) continue;
      await page.touchscreen.tap(o.x, o.y);
      try { await detailOffen(page); } catch { continue; }
      await warte(650);
      const id = await page.evaluate(() => location.hash.split("/")[2]);
      const f = await freierBereich(page);
      getippt++;
      if (!imBereich(await ort(page, id), f, 4)) draussen++;
      await page.tap('[data-brain="detail-zu"]');
      await detailZu(page);
      await warte(250);
      const b = await imBild(page);
      if (b.zahl !== b.von) unvollstaendig++;
    }
    pruefe(getippt >= 12 && draussen === 0, `${name}: Reihe – ${getippt} Knoten angetippt, ${draussen} davon unter dem Blatt oder außerhalb der Fläche`);
    pruefe(unvollstaendig === 0, `${name}: Reihe – nach jedem Schließen alle Knoten im Bild (${unvollstaendig}× nicht)`);

    // --- f) Ruhe: Danach wird kein Bild mehr gezeichnet ---
    await warte(6600); // der Puls der „Zu klären“-Knoten läuft aus
    const b1 = (await messen(page)).bilder;
    await warte(900);
    pruefe((await messen(page)).bilder === b1, `${name}: in Ruhe wird kein einziges Bild gezeichnet (${(await messen(page)).bilder - b1} in 0,9 s)`);
  }
  if (wenigBewegung) {
    await warte(500);
    const b1 = (await messen(page)).bilder;
    await warte(900);
    pruefe((await messen(page)).bilder === b1, `${name}: keine dauerhafte Bewegung (${(await messen(page)).bilder - b1} Bilder in 0,9 s)`);
  }
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();
}

async function fund1Wege(browser, motor) {
  const name = `Fund 1 · ${motor} Handy 390×844`;
  // --- Deep-Link beim ersten Öffnen: Das Blatt ist schon beim ersten Einpassen offen ---
  {
    const ctx = await kontext(browser, { geraet: "handy" });
    const page = await ctx.newPage();
    const konsole = konsoleBeobachten(page);
    await page.goto(`${basis}/?demo=1#/brain/s-standorte`);
    await page.waitForFunction(BEREIT, null, { timeout: 20000 });
    await detailOffen(page);
    await page.waitForFunction(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return m && m.knoten === 53 && m.ruht; }, null, { timeout: 30000 });
    await warte(1000);
    const m = await messen(page);
    const frei = await freierBereich(page);
    const o = await ort(page, "s-standorte");
    pruefe(m.zoom > 0.25, `${name}: Deep-Link #/brain/<id> – der Graph fällt nicht auf den kleinsten Zoom zusammen (Zoom ${m.zoom}, vorher 0,1)`);
    pruefe(frei.hoehe >= 150 && imBereich(o, frei, 8), `${name}: Deep-Link – der Knoten steht im freien Streifen über dem Blatt (${rund(frei.hoehe)} px frei, Knoten y ${rund(o.y)})`);
    await page.tap('[data-brain="detail-zu"]');
    await detailZu(page);
    await warte(800);
    const b = await imBild(page);
    const m2 = await messen(page);
    pruefe(b.zahl === b.von && m2.zoom > 0.3 && (await rollY(page)) <= 2, `${name}: Deep-Link – nach dem Schließen alle Knoten im Bild, eingepasst in die ganze Fläche (${b.zahl} von ${b.von}, Zoom ${m2.zoom})`);
    pruefe(konsole.length === 0, `${name}: Deep-Link – keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
  // --- früher Tipp, solange das Layout noch läuft ---
  {
    const ctx = await kontext(browser, { geraet: "handy" });
    const { page } = await demoSeite(ctx);
    await page.waitForFunction(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return m && m.knoten === 53; }, null, { timeout: 20000 });
    await warte(350);
    const id = await idVon(page, "Leistungen");
    const o = await ort(page, id);
    const lief = !(await messen(page)).ruht;
    await page.touchscreen.tap(o.x, o.y);
    await detailOffen(page).catch(() => {});
    await graphRuht(page);
    await warte(1000);
    const offen = await detailTitel(page);
    const m = await messen(page);
    const frei = await freierBereich(page);
    const gewaehlt = await page.evaluate(() => location.hash.split("/")[2]);
    pruefe(Boolean(offen) && m.zoom > 0.25 && imBereich(await ort(page, gewaehlt), frei, 8), `${name}: früher Tipp (Layout lief noch: ${lief}) – nach der Ruhe steht der Knoten im freien Streifen, der Zoom bleibt vernünftig (${m.zoom}, vorher 0,1)`);
    if (offen) { await page.tap('[data-brain="detail-zu"]'); await detailZu(page); await warte(800); }
    const b = await imBild(page);
    pruefe(b.zahl === b.von, `${name}: früher Tipp – nach dem Schließen alle Knoten im Bild (${b.zahl} von ${b.von})`);
    await ctx.close();
  }
  // --- Sprung vom Quellen-Chip aus dem Gespräch ---
  {
    const ctx = await kontext(browser, { geraet: "handy" });
    const { page, konsole } = await demoSeite(ctx);
    await graphFertig(page);
    await page.evaluate(() => { location.hash = "#/"; });
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    await page.fill("#eingabe-text", "Wie erreiche ich euch telefonisch?");
    await page.click("#senden");
    await page.waitForFunction(() => { const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop(); return !document.querySelector("#senden.stoppt") && n && n.querySelector(".brain-quelle"); }, null, { timeout: 20000 });
    await warte(300);
    await spurStart(page, "");
    await warte(100);
    const chip = await page.evaluate(() => { const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop(); const c = [...n.querySelectorAll(".brain-quelle")].find((x) => /Telefonzeiten/.test(x.textContent)) || n.querySelector(".brain-quelle"); c.scrollIntoView({ block: "center" }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await warte(150);
    await page.touchscreen.tap(chip.x, chip.y);
    await detailOffen(page);
    await warte(1200);
    const spur = (await spurEnde(page)).filter((e) => e.brain);
    const id = await page.evaluate(() => location.hash.split("/")[2]);
    const frei = await freierBereich(page);
    const o = await ort(page, id);
    const m = await messen(page);
    pruefe(frei.hoehe >= 150 && imBereich(o, frei, 8), `${name}: Sprung vom Quellen-Chip – der Knoten steht im freien Streifen über dem Blatt (${rund(frei.hoehe)} px frei, Knoten bei (${rund(o.x)}, ${rund(o.y)}), Zoom ${m.zoom})`);
    pruefe(Math.abs(o.x - (frei.links + frei.rechts) / 2) < 12 && Math.abs(o.y - (frei.oben + frei.unten) / 2) < 12 && m.zoom >= 1.3, `${name}: Sprung vom Chip zentriert den Knoten im freien Streifen (Abstand zur Mitte ${rund(Math.hypot(o.x - (frei.links + frei.rechts) / 2, o.y - (frei.oben + frei.unten) / 2))} px)`);
    const rollStaende = [...new Set(spur.map((e) => Math.round(e.roll)))];
    pruefe(spur.length > 5 && rollStaende.length === 1 && rollStaende[0] > 100, `${name}: Sprung vom Chip – die Ansicht erscheint gleich an der richtigen Stelle, kein sichtbarer Scroll-Sprung (Rollstände im Bild: ${rollStaende.join(" → ")})`);
    await page.tap('[data-brain="detail-zu"]');
    await detailZu(page);
    await warte(800);
    const nach = await ort(page, id);
    const f = await rechteck(page, "#brain-graph-rahmen");
    pruefe(nach.x >= f.x && nach.x <= f.rechts && nach.y >= f.y && nach.y <= f.unten && (await rollY(page)) <= 2, `${name}: Sprung vom Chip – nach dem Schließen liegt der Knoten weiter im Bild (y ${rund(nach.y)}, Fläche ${rund(f.y)}–${rund(f.unten)})`);
    pruefe(konsole.length === 0, `${name}: Sprung vom Chip – keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

async function fund1Laptop(browser, motor) {
  const name = `Fund 1/4 · ${motor} Laptop 1440×900`;
  const ctx = await kontext(browser);
  const { page, konsole } = await demoSeite(ctx);
  await graphFertig(page);
  // Knoten rechts außen: Er läge unter dem Panel – beim Öffnen kommt er einmal daneben, beim Schließen steht alles wie vorher
  const f = await rechteck(page, "#brain-graph-rahmen");
  const rechts = (await alleOrte(page)).filter((k) => k.x != null).sort((a, b) => b.x - a.x);
  let ziel = null;
  for (const k of rechts) if (k.x > f.rechts - 380 && (await aufFlaeche(page, k))) { ziel = k; break; }
  const vorher = await ort(page, ziel.id);
  const zoomVorher = (await messen(page)).zoom;
  await spurStart(page, ziel.id);
  await warte(100);
  await page.mouse.click(vorher.x, vorher.y);
  await detailOffen(page);
  await warte(900);
  const spur = await spurEnde(page);
  const frei = await freierBereich(page);
  const offen = await ort(page, ziel.id);
  pruefe(imBereich(offen, frei, 8), `${name}: Klick auf „${ziel.titel.slice(0, 24)}“ rechts außen (x ${rund(vorher.x)}) – er kommt einmal neben das Panel (x ${rund(offen.x)}, Panel ab ${rund(frei.rechts)})`);
  const bw = bewegung(spur, "x");
  pruefe(bw.wechsel === 0 && bw.bilder >= (motor === "webkit" ? 3 : 6), `${name}: … in einem Zug (${bw.bilder} Schritte, Richtungswechsel ${bw.wechsel})`);
  await page.click('[data-brain="detail-zu"]');
  await detailZu(page);
  await warte(700);
  const nachher = await ort(page, ziel.id);
  pruefe(Math.hypot(nachher.x - vorher.x, nachher.y - vorher.y) < 2 && (await messen(page)).zoom === zoomVorher, `${name}: nach dem Schließen steht die Kamera wieder wie vorher (Knoten x ${rund(vorher.x)} → ${rund(nachher.x)})`);
  // Sprung per Adresse am Laptop (Deep-Link): eingepasst wird in den Bereich neben dem Panel
  const ctx2 = await kontext(browser);
  const page2 = await ctx2.newPage();
  await page2.goto(`${basis}/?demo=1#/brain/s-standorte`);
  await page2.waitForFunction(BEREIT, null, { timeout: 20000 });
  await detailOffen(page2);
  await page2.waitForFunction(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return m && m.knoten === 53 && m.ruht; }, null, { timeout: 30000 });
  await warte(1000);
  const frei2 = await freierBereich(page2);
  const orte = (await alleOrte(page2)).filter((k) => k.x != null);
  const drin = orte.filter((k) => imBereich(k, frei2)).length;
  pruefe(drin === orte.length, `${name}: Deep-Link – alle Knoten im freien Bereich neben dem Panel (${drin} von ${orte.length})`);
  await ctx2.close();
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Fund 2 – Doppeltipp/Doppelklick
// ---------------------------------------------------------------------------
async function fund2(browser, motor, geraet) {
  const mobil = geraet === "handy";
  const name = `Fund 2 · ${motor} ${mobil ? "Handy 390×844" : "Laptop 1440×900"}`;
  const ctx = await kontext(browser, { geraet });
  const { page, konsole } = await demoSeite(ctx);
  await graphFertig(page);
  const hoehe = page.viewportSize().height;
  const flaeche = await rechteck(page, "#brain-graph-rahmen");
  // Stichprobe quer über die Fläche; am Laptop vor allem die Knoten, über denen gleich das Panel liegt
  let kandidaten = (await alleOrte(page)).filter((k) => k.x != null && k.y < hoehe - 20);
  if (!mobil) kandidaten = kandidaten.filter((k) => k.x > flaeche.rechts - 440).concat(kandidaten.filter((k) => k.x <= flaeche.rechts - 440).slice(0, 3));
  kandidaten = kandidaten.sort((a, b) => a.y - b.y).filter((_, i, l) => i % Math.max(1, Math.floor(l.length / 12)) === 0).slice(0, 12);
  const zuKlaeren = (await alleOrte(page)).find((k) => k.status === "zu_klaeren" && k.y < hoehe - 20);
  if (zuKlaeren && !kandidaten.some((k) => k.id === zuKlaeren.id)) kandidaten.push(zuKlaeren);
  const aufraeumen = async (alt) => {
    for (let i = 0; i < 2; i++) if (await page.evaluate(() => Boolean(document.querySelector("dialog[open]")))) { await page.keyboard.press("Escape"); await warte(150); }
    await page.evaluate(async (status) => {
      const a = window.GabiBrainAnsicht.aktuell;
      for (const k of a.brain.knoten()) if (status[k.id] && status[k.id] !== k.status && !k.geschuetzt) await a.brain.statusSetzen(k.id, status[k.id]);
      const klick = (sel) => { const e = document.querySelector(sel); if (e) e.click(); };
      if (!document.querySelector("#brain-fokus").hidden) klick('[data-brain="fokus-aus"]');
      klick('[data-brain="filter-weg"]');
    }, alt.status);
    await warte(150);
    await page.evaluate(() => { const zu = document.querySelector('[data-brain="detail-zu"]'); if (zu && !document.querySelector("#brain-detail").hidden) zu.click(); });
    await warte(250);
    await einpassen(page);
  };
  for (const pause of mobil ? [180, 280] : [130]) {
    let zentriert = 0;
    let richtigesDetail = 0;
    let nebenwirkung = 0;
    let gezaehlte = 0;
    const faelle = [];
    for (const k of kandidaten) {
      const o = await ort(page, k.id);
      if (!o || o.y > hoehe - 20 || !(await aufFlaeche(page, o))) continue;
      const vorher = await zustand(page);
      const z0 = (await messen(page)).zoom;
      if (mobil) { await page.touchscreen.tap(o.x, o.y); await warte(pause); await page.touchscreen.tap(o.x, o.y); } else { await page.mouse.click(o.x, o.y); await warte(pause); await page.mouse.click(o.x, o.y); }
      await warte(800);
      const nachher = await zustand(page);
      const m = await messen(page);
      const frei = await freierBereich(page);
      const p = await ort(page, k.id);
      gezaehlte++;
      const mitte = Math.hypot(p.x - (frei.links + frei.rechts) / 2, p.y - (frei.oben + frei.unten) / 2);
      const istZentriert = m.zoom >= 1.3 && m.zoom > z0 * 1.2 && mitte < 30;
      if (istZentriert) zentriert++;
      if (nachher.hash === `#/brain/${k.id}`) richtigesDetail++;
      const geaendert = Object.keys(nachher.status).filter((id) => vorher.status[id] !== nachher.status[id]);
      const folge = geaendert.length ? `Status ${vorher.status[geaendert[0]]} → ${nachher.status[geaendert[0]]}` : nachher.dialog ? "Dialog offen" : nachher.fokus ? "Fokus-Modus an" : nachher.filter ? "Filter gesetzt" : nachher.bearbeitet ? "Bearbeiten offen" : "";
      if (folge) { nebenwirkung++; faelle.push(`${k.titel.slice(0, 22)}: ${folge}`); } else if (!istZentriert) faelle.push(`${k.titel.slice(0, 22)}: nicht zentriert (Zoom ${m.zoom}, ${rund(mitte)} px neben der Mitte)`);
      await aufraeumen(vorher);
    }
    pruefe(gezaehlte >= 8 && zentriert === gezaehlte, `${name}: ${mobil ? "Doppeltipp" : "Doppelklick"} (Pause ${pause} ms) zentriert den Knoten des ersten Tipps im freien Bereich (${zentriert} von ${gezaehlte}${faelle.length ? ` – ${faelle.slice(0, 3).join(" · ")}` : ""})`);
    pruefe(nebenwirkung === 0, `${name}: der zweite Tipp löst im aufgehenden Detail nichts aus – kein Statuswechsel, kein Dialog, kein Fokus-Modus, kein Filter (${nebenwirkung} Nebenwirkungen bei ${gezaehlte})`);
    pruefe(richtigesDetail === gezaehlte, `${name}: offen ist danach das Detail des doppelt getippten Knotens (${richtigesDetail} von ${gezaehlte})`);
  }
  // die Sperre ist reine CSS-Sache und kurz: gleich nach dem Öffnen nimmt das Detail keine Zeiger an, kurz darauf wieder
  const k = kandidaten[Math.floor(kandidaten.length / 2)];
  const o = await ort(page, k.id);
  if (mobil) await page.touchscreen.tap(o.x, o.y); else await page.mouse.click(o.x, o.y);
  await detailOffen(page);
  const gesperrt = await page.evaluate(() => { const d = document.querySelector("#brain-detail"); return getComputedStyle(d).pointerEvents === "none" && getComputedStyle(document.querySelector(".brain-graph-karte")).pointerEvents === "none"; });
  // ein Klick direkt nach dem Öffnen geht nicht verloren: Er wartet die Sperre ab (Playwright prüft das Trefferziel)
  if (mobil) await page.tap('[data-brain="detail-zu"]'); else await page.click('[data-brain="detail-zu"]');
  await detailZu(page).catch(() => {});
  const zu = await page.evaluate(() => document.querySelector("#brain-detail").hidden);
  await warte(450);
  const frei = await page.evaluate(() => getComputedStyle(document.querySelector("#brain-detail")).pointerEvents !== "none" && !document.querySelector("#ansicht-brain").classList.contains("tipp-sperre"));
  pruefe(gesperrt && zu && frei, `${name}: Sperre über CSS (pointer-events) für die Spanne des Doppeltipps – ein Klick gleich danach kommt an, 450 ms später ist sie weg (gesperrt ${gesperrt}, Schließen angekommen ${zu}, wieder frei ${frei})`);
  if (!mobil) {
    // Doppelklick ohne Pause (wie ein echter schneller Doppelklick)
    await einpassen(page);
    const z = kandidaten[0];
    const oz = await ort(page, z.id);
    await page.mouse.dblclick(oz.x, oz.y);
    await warte(900);
    const freiZ = await freierBereich(page);
    const pz = await ort(page, z.id);
    pruefe((await messen(page)).zoom >= 1.3 && Math.hypot(pz.x - (freiZ.links + freiZ.rechts) / 2, pz.y - (freiZ.oben + freiZ.unten) / 2) < 30 && (await page.evaluate(() => location.hash)) === `#/brain/${z.id}`, `${name}: schneller Doppelklick (ohne Pause) zentriert ebenfalls in der Mitte des freien Bereichs`);
    // Öffnen per Tastatur sperrt nichts
    await page.click('[data-brain="detail-zu"]');
    await detailZu(page);
    await warte(450);
    await page.focus("canvas.brain-graph-flaeche");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await detailOffen(page);
    pruefe(await page.evaluate(() => !document.querySelector("#ansicht-brain").classList.contains("tipp-sperre") && getComputedStyle(document.querySelector("#brain-detail")).pointerEvents !== "none"), `${name}: Öffnen mit der Eingabetaste sperrt nichts (nur Tipp und Klick aus dem Graphen)`);
  }
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Fund 3 – Handy: Wischen neben einem Knoten
// ---------------------------------------------------------------------------
async function fund3(browser, motor, { breite = 390, hoehe = 844 } = {}) {
  const name = `Fund 3 · ${motor} Handy ${breite}×${hoehe}`;
  const ctx = await kontext(browser, { geraet: "handy", breite, hoehe });
  const { page, konsole } = await demoSeite(ctx);
  await graphFertig(page);
  const zurueck = async () => { await page.evaluate(() => document.querySelector('[data-brain="anordnen"]').click()); await warte(300); await graphRuht(page); await warte(700); await einpassen(page); };
  // Ein Knoten mit Platz daneben: Start 15 px neben seiner Mitte, in der Richtung mit dem meisten Abstand zu anderen Knoten
  const stelleNeben = async () => {
    const alle = (await alleOrte(page)).filter((k) => k.x != null);
    let beste = null;
    for (const k of alle) {
      if (k.y > hoehe - 80 || k.y < 0) continue;
      for (const w of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const x = k.x + Math.cos((w * Math.PI) / 180) * 15;
        const y = k.y + Math.sin((w * Math.PI) / 180) * 15;
        const naechster = Math.min(...alle.filter((a) => a.id !== k.id).map((a) => Math.hypot(a.x - x, a.y - y)));
        if (naechster <= 26 || (beste && naechster <= beste.naechster)) continue;
        if (!(await aufFlaeche(page, { x, y })) || !(await aufFlaeche(page, { x: x + 64, y: y + 40 }))) continue;
        beste = { k, x, y, naechster };
      }
    }
    return beste;
  };
  const s = await stelleNeben();
  const fern = (await alleOrte(page)).filter((k) => k.x != null && k.id !== s.k.id).sort((a, b) => Math.hypot(b.x - s.k.x, b.y - s.k.y) - Math.hypot(a.x - s.k.x, a.y - s.k.y))[0];
  // --- a) Wisch 15 px neben dem Knoten: Der Ausschnitt wandert, nichts wird festgesetzt ---
  let fest0 = (await messen(page)).fest;
  let f0 = await ort(page, fern.id);
  let k0 = await ort(page, s.k.id);
  await wisch(page, s.x, s.y, 64, 40);
  await warte(300);
  let fest1 = (await messen(page)).fest;
  let f1 = await ort(page, fern.id);
  let k1 = await ort(page, s.k.id);
  pruefe(fest1 === fest0 && Math.hypot(f1.x - f0.x - 64, f1.y - f0.y - 40) < 6 && Math.hypot(k1.x - k0.x - 64, k1.y - k0.y - 40) < 6,
    `${name}: Wisch 15 px neben „${s.k.titel.slice(0, 22)}“ (${rund(15 - s.k.r, 1)} px neben seinem Rand) verschiebt den Ausschnitt und setzt nichts fest (fest ${fest0} → ${fest1}, ferner Knoten um (${rund(f1.x - f0.x)}, ${rund(f1.y - f0.y)}))`);
  if (fest1 !== fest0) await zurueck(); else await einpassen(page);
  // --- b) Tipp an derselben Stelle: öffnet weiter das Detail (das 44-px-Ziel bleibt) ---
  const s2 = await stelleNeben();
  await page.touchscreen.tap(s2.x, s2.y);
  await detailOffen(page).catch(() => {});
  await warte(500);
  pruefe((await detailTitel(page)) === s2.k.titel, `${name}: Tipp an derselben Stelle (15 px neben der Mitte) öffnet weiter das Detail – das 44-px-Ziel bleibt („${(await detailTitel(page)).slice(0, 26)}“)`);
  await page.evaluate(() => { const zu = document.querySelector('[data-brain="detail-zu"]'); if (zu && !document.querySelector("#brain-detail").hidden) zu.click(); });
  await warte(500);
  await einpassen(page);
  // --- c) kurz halten (300 ms), dann ziehen: Der Knoten ist gegriffen – auch 15 px neben seiner Mitte ---
  const s3 = await stelleNeben();
  const fern3 = (await alleOrte(page)).filter((k) => k.x != null && k.id !== s3.k.id && Math.hypot(k.x - s3.k.x, k.y - s3.k.y) > 90)[0];
  fest0 = (await messen(page)).fest;
  f0 = await ort(page, fern3.id);
  k0 = await ort(page, s3.k.id);
  await wisch(page, s3.x, s3.y, 50, -30, 300);
  await warte(300);
  fest1 = (await messen(page)).fest;
  f1 = await ort(page, fern3.id);
  k1 = await ort(page, s3.k.id);
  pruefe(fest1 === fest0 + 1 && Math.hypot(k1.x - k0.x - 50, k1.y - k0.y + 30) < 6 && Math.hypot(f1.x - f0.x, f1.y - f0.y) < 2,
    `${name}: kurz halten, dann ziehen greift den Knoten – er wandert mit (${rund(k1.x - k0.x)}, ${rund(k1.y - k0.y)}) und ist festgesetzt, der Ausschnitt steht (fest ${fest0} → ${fest1})`);
  await zurueck();
  // --- d) kürzer gehalten als die Greif-Zeit (120 ms): bleibt ein Wisch ---
  const s4 = await stelleNeben();
  fest0 = (await messen(page)).fest;
  f0 = await ort(page, fern.id);
  await wisch(page, s4.x, s4.y, 50, 30, 120);
  await warte(300);
  fest1 = (await messen(page)).fest;
  f1 = await ort(page, fern.id);
  pruefe(fest1 === fest0 && Math.hypot(f1.x - f0.x - 50, f1.y - f0.y - 30) < 6, `${name}: nur 120 ms gehalten – bleibt ein Wisch, der Ausschnitt wandert (fest ${fest0} → ${fest1})`);
  if (fest1 !== fest0) await zurueck(); else await einpassen(page);
  // --- e) direkt auf dem Knoten angesetzt: zieht ihn sofort (wie mit der Maus) ---
  const gross = (await alleOrte(page)).filter((k) => k.x != null && k.y < hoehe - 80).sort((a, b) => b.r - a.r);
  let direkt = null;
  for (const k of gross) if ((await aufFlaeche(page, k)) && (await aufFlaeche(page, { x: k.x + 50, y: k.y - 30 }))) { direkt = k; break; }
  fest0 = (await messen(page)).fest;
  k0 = await ort(page, direkt.id);
  await wisch(page, k0.x, k0.y, 50, -30);
  await warte(300);
  fest1 = (await messen(page)).fest;
  k1 = await ort(page, direkt.id);
  pruefe(fest1 === fest0 + 1 && Math.hypot(k1.x - k0.x - 50, k1.y - k0.y + 30) < 6, `${name}: genau auf dem Knoten angesetzt – er wird gezogen und festgesetzt (fest ${fest0} → ${fest1})`);
  await zurueck();
  // --- f) Stichprobe: Wischer im Raster über das Rechteck der Knoten ---
  const orte = (await alleOrte(page)).filter((k) => k.x != null);
  const minX = Math.min(...orte.map((k) => k.x));
  const maxX = Math.max(...orte.map((k) => k.x));
  const minY = Math.min(...orte.map((k) => k.y));
  const maxY = Math.min(hoehe - 60, Math.max(...orte.map((k) => k.y)));
  let gezogen = 0;
  let verschoben = 0;
  for (let zeile = 0; zeile < 6; zeile++) for (let spalte = 0; spalte < 4; spalte++) {
    const x = minX + ((spalte + 0.5) / 4) * (maxX - minX);
    const y = minY + ((zeile + 0.5) / 6) * (maxY - minY);
    if (!(await aufFlaeche(page, { x, y })) || !(await aufFlaeche(page, { x: x + 40, y: y + 20 }))) continue;
    const vor = (await messen(page)).fest;
    await wisch(page, x, y, 40, 20);
    await warte(120);
    if ((await messen(page)).fest > vor) { gezogen++; await zurueck(); } else { verschoben++; await einpassen(page); }
  }
  pruefe(gezogen + verschoben >= 14 && gezogen <= 2, `${name}: Stichprobe – ${gezogen + verschoben} Wischer im Raster über die Knoten: ${verschoben} verschieben den Ausschnitt, ${gezogen} ziehen einen Knoten (vorher etwa jeder zweite)`);
  pruefe(await page.evaluate(() => /kurz halten/.test(document.querySelector("#brain-legende").textContent)), `${name}: die Legende sagt, wie man am Handy greift („${await page.evaluate(() => [...document.querySelectorAll("#brain-legende li")].pop().textContent.trim())}“)`);
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();
}
async function fund3Maus(browser, motor) {
  const name = `Fund 3 · ${motor} Laptop (Maus)`;
  const ctx = await kontext(browser);
  const { page } = await demoSeite(ctx);
  await graphFertig(page);
  const id = await idVon(page, "Kontakt und Zeiten");
  const a = await ort(page, id);
  // am Rand ansetzen (4 px außerhalb des Kreises): für die Maus zieht das weiter den Knoten
  const start = { x: a.x + a.r + 4, y: a.y };
  const fest0 = (await messen(page)).fest;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y - 40, { steps: 8 });
  await page.mouse.up();
  await warte(300);
  const b = await ort(page, id);
  pruefe((await messen(page)).fest === fest0 + 1 && Math.hypot(b.x - a.x - 60, b.y - a.y + 40) < 6, `${name}: für die Maus bleibt alles – 4 px neben dem Rand angesetzt zieht den Knoten (${rund(b.x - a.x)}, ${rund(b.y - a.y)})`);
  pruefe(await page.evaluate(() => /\(gezogen\)/.test(document.querySelector("#brain-legende").textContent)), `${name}: Legende am Laptop wie bisher („Von dir festgesetzt (gezogen)“)`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Fund 4 – Kamera springt beim Neuzeichnen nicht zurück
// ---------------------------------------------------------------------------
async function fund4(browser, motor) {
  const name = `Fund 4 · ${motor} Laptop 1440×900`;
  const ctx = await kontext(browser);
  const { page, konsole } = await demoSeite(ctx);
  await graphFertig(page);
  const leereStelle = () => page.evaluate(() => {
    const a = window.GabiBrainAnsicht.aktuell;
    const c = document.querySelector("canvas.brain-graph-flaeche");
    const f = c.getBoundingClientRect();
    const orte = a.brain.knoten().map((k) => a.ort(k.id)).filter(Boolean);
    const d = document.querySelector("#brain-detail");
    const rechts = d && !d.hidden ? d.getBoundingClientRect().left : f.right;
    let beste = null;
    for (let y = f.top + 80; y < f.bottom - 140; y += 20) for (let x = f.left + 90; x < rechts - 60; x += 20) {
      if (document.elementFromPoint(x, y) !== c) continue;
      const n = Math.min(...orte.map((o) => Math.hypot(o.x - x, o.y - y) - o.r));
      if (!beste || n > beste.n) beste = { x, y, n };
    }
    return beste;
  });
  const schieben = async (dx, dy) => {
    const s = await leereStelle();
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x + dx / 2, s.y + dy / 2, { steps: 5 });
    await page.mouse.move(s.x + dx, s.y + dy, { steps: 5 });
    await page.mouse.up();
    await warte(250);
  };
  /** Lage relativ zur Mitte der Fläche: Ändert sich nur die Höhe der Fläche (Filterzeile), bleibt sie gleich. */
  const lage = async (id) => { const o = await ort(page, id); const f = await rechteck(page, "#brain-graph-rahmen"); return { x: o.x - (f.x + f.b / 2), y: o.y - (f.y + f.h / 2), fx: o.x, fy: o.y }; };
  const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hinaus = async (id) => {
    for (let i = 0; i < 4; i++) {
      const o = await ort(page, id);
      const frei = await freierBereich(page);
      if (!imBereich(o, frei)) return true;
      await schieben(o.x < (frei.links + frei.rechts) / 2 ? -420 : 420, o.y < (frei.oben + frei.unten) / 2 ? -380 : 380);
    }
    return !imBereich(await ort(page, id), await freierBereich(page));
  };

  // --- a) Auswahl außer Sicht geschoben: Suche, Filter-Chip, Filterzeile, Änderung von außen holen sie nicht zurück ---
  const standorte = await idVon(page, "Standorte");
  let o = await ort(page, standorte);
  await page.mouse.click(o.x, o.y);
  await detailOffen(page);
  await warte(700);
  const draussen = await hinaus(standorte);
  let v = await lage(standorte);
  await page.fill("#brain-suche", "Ring");
  await warte(700);
  let n = await lage(standorte);
  pruefe(draussen && abstand(v, n) < 2 && (await detailTitel(page)) === "Standorte", `${name}: Auswahl außer Sicht geschoben, dann gesucht – die Kamera bleibt (bewegt um ${rund(abstand(v, n), 1)} px, vorher über 500)`);
  v = await lage(standorte);
  await page.click('[data-brain="filter-art"][data-wert="praxiswissen"]');
  await warte(700);
  n = await lage(standorte);
  pruefe(abstand(v, n) < 2, `${name}: Arten-Chip geklickt – die Kamera bleibt (${rund(abstand(v, n), 1)} px)`);
  await page.click('[data-brain="filter-weg"]');
  await warte(400);
  v = await lage(standorte);
  await page.click('[data-brain="filter-auf"]');
  await warte(700);
  n = await lage(standorte);
  pruefe(abstand(v, n) < 2, `${name}: nur die Filterzeile aufgeklappt – die Kamera bleibt (${rund(abstand(v, n), 1)} px relativ zur Flächenmitte)`);
  await page.click('[data-brain="filter-auf"]');
  await warte(300);
  await page.fill("#brain-suche", "");
  await warte(500);
  v = await lage(standorte);
  await page.evaluate(async () => { const b = window.GabiBrainAnsicht.aktuell.brain; const k = b.findeTitel("Sensopro"); await b.statusSetzen(k.id, k.status === "entwurf" ? "bestaetigt" : "entwurf"); });
  await warte(700);
  n = await lage(standorte);
  pruefe(abstand(v, n) < 2, `${name}: Änderung an einem anderen Eintrag (neu gezeichnet) – die Kamera bleibt (${rund(abstand(v, n), 1)} px)`);
  await page.evaluate(async () => { const b = window.GabiBrainAnsicht.aktuell.brain; await b.rueckgaengig(); });
  await warte(400);

  // --- b) ein anderer Eintrag wird gewählt (Verweis im Detail): Der holt seinen Knoten weiter in den Blick ---
  await einpassen(page);
  await warte(300);
  const andere = await page.evaluate(() => { const a = document.querySelector('#brain-detail .brain-teil a.quelle[href^="#/brain/"]'); return a ? a.getAttribute("href").split("/")[2] : null; });
  if (andere) {
    await hinaus(andere);
    await page.evaluate((id) => { location.hash = `#/brain/${id}`; }, andere);
    await warte(900);
    pruefe(imBereich(await ort(page, andere), await freierBereich(page), 8), `${name}: Wechsel der Auswahl (Verweis im Detail) holt den neuen Knoten einmal in den Blick`);
  } else pruefe(false, `${name}: kein Verweis im Detail gefunden`);

  // --- c) Leerklick: Der Auswahlring bleibt beim Eintrag des offenen Details ---
  await einpassen(page);
  await warte(400);
  const gewaehlt = await page.evaluate(() => location.hash.split("/")[2]);
  const r0 = await ringPunkte(page, gewaehlt);
  const leer = await leereStelle();
  await page.mouse.click(leer.x, leer.y);
  await warte(400);
  const r1 = await ringPunkte(page, gewaehlt);
  await page.click('[data-brain="filter-auf"]');
  await warte(500);
  const r2 = await ringPunkte(page, gewaehlt);
  await page.click('[data-brain="filter-auf"]');
  await warte(300);
  pruefe(r0 >= 6 && r1 >= 6 && r2 >= 6 && (await page.evaluate(() => !document.querySelector("#brain-detail").hidden)), `${name}: Klick auf leere Fläche – der Auswahlring bleibt, solange das Detail offen ist (Ring-Punkte ${r0}/8 → ${r1}/8 → nach Neuzeichnen ${r2}/8; vorher 8 → 0 → 8)`);

  // --- d) Fokus-Modus: der eigene Zoom bleibt beim Neuzeichnen und beim Klick auf einen Nachbarn ---
  await page.evaluate((id) => { location.hash = `#/brain/${id}`; }, standorte);
  await warte(600);
  await page.click('#brain-detail [data-brain="fokus-an"]');
  await page.waitForSelector("#brain-fokus:not([hidden])");
  await warte(800);
  const zFokus = (await messen(page)).zoom;
  const frei = await freierBereich(page);
  const mitte = { x: (frei.links + frei.rechts) / 2, y: (frei.oben + frei.unten) / 2 };
  await page.mouse.move(mitte.x, mitte.y);
  await page.mouse.wheel(0, -240);
  await warte(300);
  const zSelbst = (await messen(page)).zoom;
  await page.fill("#brain-suche", "Nür");
  await warte(700);
  const zNachTippen = (await messen(page)).zoom;
  await page.fill("#brain-suche", "");
  await warte(700);
  const zNachLeeren = (await messen(page)).zoom;
  pruefe(zSelbst > zFokus * 1.1 && zNachTippen === zSelbst && zNachLeeren === zSelbst, `${name}: Fokus-Modus – der eigene Zoom bleibt beim Tippen und Leeren der Suche (${zFokus} → selbst ${zSelbst} → ${zNachTippen} → ${zNachLeeren}; vorher zurück auf ${zFokus})`);
  const nachbarn = (await alleOrte(page)).filter((k) => k.sichtbar !== false && k.id !== standorte);
  const sichtbar = [];
  for (const k of nachbarn) { const p = await ort(page, k.id); if (p && p.sichtbar && imBereich(p, frei, 40) && (await aufFlaeche(page, p))) sichtbar.push({ ...k, ...p }); }
  if (sichtbar.length) {
    await page.mouse.click(sichtbar[0].x, sichtbar[0].y);
    await warte(800);
    pruefe((await messen(page)).zoom === zSelbst && (await detailTitel(page)) === sichtbar[0].titel, `${name}: Fokus-Modus – Klick auf einen Nachbarn öffnet ihn, der eigene Zoom bleibt (${(await messen(page)).zoom})`);
  } else pruefe(false, `${name}: kein Nachbar im Fokus sichtbar`);
  // Tiefe ändern passt weiter neu ein (das ist ein Wechsel, kein Neuzeichnen)
  await page.click('[data-brain="fokus-tiefe"][data-wert="3"]');
  await warte(800);
  pruefe((await messen(page)).zoom !== zSelbst, `${name}: Fokus-Modus – eine andere Tiefe passt weiter neu ein (Zoom ${zSelbst} → ${(await messen(page)).zoom})`);
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Fund 5 und 7 – „Alles zeigen“ neben den Bedienelementen, Schloss in der Standardansicht
// ---------------------------------------------------------------------------
/** Knoten, deren Scheibe ein Bedienelement über der Fläche berührt; dazu Knoten außerhalb der Fläche. */
const ueberdeckt = (page) => page.evaluate(() => {
  const a = window.GabiBrainAnsicht.aktuell;
  const f = document.querySelector("#brain-graph-rahmen").getBoundingClientRect();
  const dinge = [[".brain-graph-karte", "Minimap"], ["#brain-legende", "Legende"], [".brain-graph-knoepfe", "Knöpfe"], ["#brain-fokus", "Fokus-Leiste"]]
    .map(([sel, name]) => ({ e: document.querySelector(sel), name })).filter((d) => d.e && !d.e.hidden).map((d) => ({ name: d.name, r: d.e.getBoundingClientRect() }));
  const unter = [];
  let aussen = 0;
  for (const k of a.brain.knoten()) {
    const o = a.ort(k.id);
    if (!o || !o.sichtbar) continue;
    if (o.x - o.r < f.left || o.x + o.r > f.right || o.y - o.r < f.top || o.y + o.r > f.bottom) aussen++;
    for (const d of dinge) {
      const qx = Math.max(d.r.left, Math.min(o.x, d.r.right));
      const qy = Math.max(d.r.top, Math.min(o.y, d.r.bottom));
      if (Math.hypot(o.x - qx, o.y - qy) < o.r) { unter.push(`${k.titel.slice(0, 18)} (${d.name})`); break; }
    }
  }
  return { unter, aussen, legendeOffen: document.querySelector("#brain-legende").open };
});
/** Schlösser: Zahl laut Graph und Pixelprobe am Schloss-Körper jedes geschützten Knotens (grau auf heller Platte). */
const schloesser = (page) => page.evaluate(() => {
  const a = window.GabiBrainAnsicht.aktuell;
  const c = document.querySelector("canvas.brain-graph-flaeche");
  const f = c.getBoundingClientRect();
  const s = c.width / f.width;
  const g = c.getContext("2d");
  let geschuetzt = 0;
  let zuSehen = 0;
  let kleinster = Infinity;
  for (const k of a.brain.knoten().filter((x) => x.geschuetzt)) {
    const o = a.ort(k.id);
    if (!o) continue;
    geschuetzt++;
    kleinster = Math.min(kleinster, o.r);
    const gr = Math.min(1, Math.max(0.5, o.r / 6));
    const bx = o.x + o.r * 0.74;
    const by = o.y + o.r * 0.74 + 1.2 * gr; // Mitte des Schloss-Körpers
    const d = g.getImageData(Math.round((bx - f.left) * s), Math.round((by - f.top) * s), 1, 1).data;
    if (d[3] > 150 && Math.abs(d[0] - 98) < 45 && Math.abs(d[1] - 110) < 45 && Math.abs(d[2] - 113) < 45) zuSehen++;
  }
  const m = a.messen();
  return { geschuetzt, zuSehen, gezeichnet: m.schloesser, zoom: m.zoom, kleinster: Math.round(kleinster * 10) / 10 };
});

async function fund5und7(browser, motor) {
  const groessen = [[1440, 900], [1440, 790], [1366, 768], [1280, 720], [1024, 768], [390, 844], [320, 568]];
  for (const [b, h] of groessen) {
    const mobil = b < 600;
    const name = `${motor} ${b}×${h}`;
    const ctx = await kontext(browser, { geraet: mobil ? "handy" : "laptop", breite: b, hoehe: h, dichte: 2 });
    const { page, konsole } = await demoSeite(ctx);
    await graphFertig(page);
    await warte(400);
    if (FUNDE.has("5")) {
      const start = await ueberdeckt(page);
      const m = await messen(page);
      pruefe(start.unter.length === 0 && start.aussen === 0, `Fund 5 · ${name}: nach dem Öffnen liegt kein Knoten unter Minimap, Legende oder Knöpfen (${start.unter.length}${start.unter.length ? `: ${start.unter.slice(0, 4).join(", ")}` : ""}; außerhalb der Fläche ${start.aussen}; Zoom ${m.zoom})`);
      await einpassen(page);
      await warte(300);
      const nach = await ueberdeckt(page);
      pruefe(nach.unter.length === 0 && nach.aussen === 0, `Fund 5 · ${name}: nach „Alles zeigen“ ebenso (${nach.unter.length}${nach.unter.length ? `: ${nach.unter.slice(0, 4).join(", ")}` : ""})`);
      if (b === 1440 && h === 900) pruefe(m.zoom >= 0.95 && start.legendeOffen, `Fund 5 · ${name}: verschoben statt verkleinert – der Zoom bleibt über 0,95 (${m.zoom}), die Legende ist offen`);
      if (b === 1024 || (b === 1280 && h === 720)) pruefe(!start.legendeOffen, `Fund 5 · ${name}: auf kleiner Fläche startet die Legende geschlossen (vorher deckte sie bis zu einem Viertel des Graphen zu)`);
      // 1024×768: seit der Leisten-Korrektur (Handy-Fund 2) steht die Reiter-Zeile über der Suche – die Fläche ist niedriger, daher 0,38 statt 0,44
      const mindest = { "1440×790": 0.82, "1366×768": 0.7, "1280×720": 0.62, "1024×768": 0.38, "390×844": 0.33, "320×568": 0.25 }[`${b}×${h}`];
      if (mindest) pruefe(m.zoom >= mindest, `Fund 5 · ${name}: das Bild wird dafür nicht winzig (Zoom ${m.zoom}, mindestens ${mindest})`);
      if (b === 1440 && h === 900) {
        // mit offenem Panel: Die Minimap rückt neben das Panel – auch dann liegt nach „Alles zeigen“ nichts darunter
        await page.evaluate(() => { location.hash = "#/brain/s-standorte"; });
        await detailOffen(page);
        await warte(700);
        await page.click('[data-brain="einpassen"]');
        await warte(700);
        const mitPanel = await ueberdeckt(page);
        const frei = await freierBereich(page);
        const orte = (await alleOrte(page)).filter((k) => k.x != null);
        pruefe(mitPanel.unter.length === 0 && orte.every((k) => k.x + k.r <= frei.rechts), `Fund 5 · ${name}: mit offenem Panel zeigt „Alles zeigen“ alles links davon, nichts unter der dorthin gerückten Minimap (${mitPanel.unter.length}${mitPanel.unter.length ? `: ${mitPanel.unter.slice(0, 3).join(", ")}` : ""})`);
        await page.click('[data-brain="detail-zu"]');
        await detailZu(page);
        await warte(700);
        const zurueck = await ueberdeckt(page);
        pruefe(zurueck.unter.length === 0 && zurueck.aussen === 0, `Fund 5 · ${name}: Panel wieder zu – das Bild füllt wieder die ganze Fläche, nichts liegt unter einem Bedienelement`);
      }
    }
    if (FUNDE.has("7")) {
      const s = await schloesser(page);
      if (mobil) {
        pruefe(s.gezeichnet >= (b === 390 ? 10 : 4), `Fund 7 · ${name}: auch in der Übersicht am Handy tragen geschützte Knoten ihr (kleines) Schloss (${s.gezeichnet} von ${s.geschuetzt} gezeichnet, kleinster Radius ${s.kleinster} px, Zoom ${s.zoom})`);
      } else {
        pruefe(s.gezeichnet === s.geschuetzt && s.geschuetzt === 10, `Fund 7 · ${name}: Standardansicht (Zoom ${s.zoom}) – alle geschützten Knoten tragen ihr Schloss (${s.gezeichnet} von ${s.geschuetzt}, kleinster Radius ${s.kleinster} px; vorher erst ab Zoom 0,95)`);
        pruefe(s.zuSehen >= s.geschuetzt - 1, `Fund 7 · ${name}: … und es ist im Bild zu sehen (Pixelprobe am Schloss-Körper: ${s.zuSehen} von ${s.geschuetzt})`);
      }
      if (b === 1440 && h === 790) pruefe(await page.evaluate(() => /Geschützt \(nur lesen\)/.test(document.querySelector("#brain-legende").textContent) && Boolean(document.querySelector("#brain-legende .brain-zeichen.schloss svg"))), `Fund 7 · ${name}: die Legende nennt das Schloss weiter („Geschützt (nur lesen)“)`);
    }
    pruefe(konsole.length === 0, `Fund 5/7 · ${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  try {
    if (FUNDE.has("1")) {
      await fund1Handy(browser, motor);
      await fund1Wege(browser, motor);
      await fund1Handy(browser, motor, { breite: 320, hoehe: 568 });
      await fund1Handy(browser, motor, { wenigBewegung: true });
      await fund1Laptop(browser, motor);
    }
    if (FUNDE.has("2")) { await fund2(browser, motor, "handy"); await fund2(browser, motor, "laptop"); }
    if (FUNDE.has("3")) { await fund3(browser, motor); await fund3(browser, motor, { breite: 320, hoehe: 568 }); await fund3Maus(browser, motor); }
    if (FUNDE.has("4")) await fund4(browser, motor);
    if (FUNDE.has("5") || FUNDE.has("7")) await fund5und7(browser, motor);
  } finally {
    await browser.close();
  }
}

console.log(`\n${gezaehlt - fehler.length} von ${gezaehlt} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot:` : "."}`);
for (const f of fehler) console.log(`  ✗ ${f}`);
if (!gezaehlt) { console.error("Keine Prüfung gelaufen."); process.exit(2); }
process.exit(fehler.length ? 1 : 0);
