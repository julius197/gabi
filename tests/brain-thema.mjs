// v2.4 – Brain im Theme-Wechsel und Kontrast im Graphen (Chromium + WebKit, 1440 und 390 px). Nur lokal, Brain-Schalter AN.
//  1  Hell → Dunkel → Hell über die Einstellungen (Laptop: Seitenleiste, Handy: Schublade): der Graph zeichnet sofort mit
//     den neuen Farben – Label-Platten im Canvas, Bühne, Kanten –, ohne Neuladen und ohne neues Layout (Knoten bleiben,
//     wo sie sind)
//  2  Kontrast der Labels im Graphen ≥ 4,5:1 in Hell UND Dunkel: je stehendem Label die Pixel der Platte (links neben dem
//     Text, ohne Schrift) aus dem Bild des Canvas gegen die Textfarbe des Graphen (--brain-g-text), 2-%-Perzentil
// Aufruf: PLAYWRIGHT_MODUL=… node tests/brain-thema.mjs [basis-url]   (Server: cd worker && npm run brain → 8790)
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Nur lokal."); process.exit(2); }
await zielPruefen(basis, { live: false });
const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((s) => s.trim()).filter(Boolean);
const fehler = []; let n = 0;
const pruefe = (ok, t) => { n++; if (!ok) { fehler.push(t); console.log(`✗ ${t}`); } else console.log(`✓ ${t}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const hilfeBrowser = await pw.chromium.launch();
const hilfe = await hilfeBrowser.newPage();

/** Label-Platten im Bild des Canvas: je Label die Pixel links neben dem Text (Platte ohne Schrift), Kontrast zur Textfarbe. */
async function labelMessen(page) {
  const canvas = page.locator("canvas.brain-graph-flaeche");
  const box = await canvas.boundingBox();
  const daten = await page.evaluate(() => {
    const m = window.GabiBrainAnsicht.aktuell.messen();
    const cs = getComputedStyle(document.documentElement);
    const textHex = cs.getPropertyValue("--brain-g-text").trim();
    return { labels: m.labelInfo.filter((l) => l.ziel === 1 && l.a >= 0.95 && l.x >= 2 && l.y >= 2 && l.x + l.w <= m.breite - 2 && l.y + l.h <= m.hoehe - 2), textHex, dpr: devicePixelRatio, platte: cs.getPropertyValue("--brain-g-platte").trim(), buehne: cs.getPropertyValue("--brain-g-hintergrund").trim() };
  });
  const png = await page.screenshot({ type: "png", clip: box, caret: "initial" });
  const erg = await hilfe.evaluate(async ({ b64, labels, textHex, dpr }) => {
    const bild = new Image(); bild.src = `data:image/png;base64,${b64}`; await bild.decode();
    const c = document.createElement("canvas"); c.width = bild.width; c.height = bild.height;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(bild, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    const t = [1, 3, 5].map((i) => parseInt(textHex.slice(i, i + 2), 16));
    const lt = lum(...t);
    let kleinster = 99, platteSumme = [0, 0, 0], platteN = 0;
    const je = [];
    for (const l of labels) {
      const x0 = Math.round((l.x + 1) * dpr), x1 = Math.round((l.x + 3.5) * dpr), y0 = Math.round((l.y + 2) * dpr), y1 = Math.round((l.y + l.h - 2) * dpr);
      if (x1 <= x0 || y1 <= y0) continue;
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const k = [];
      for (let i = 0; i < d.length; i += 4) { const lb = lum(d[i], d[i + 1], d[i + 2]); k.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05)); platteSumme[0] += d[i]; platteSumme[1] += d[i + 1]; platteSumme[2] += d[i + 2]; platteN++; }
      k.sort((a, b) => a - b);
      const w = k[Math.floor(k.length * 0.02)];
      je.push([l.text, Math.round(w * 100) / 100]);
      kleinster = Math.min(kleinster, w);
    }
    return { kleinster: Math.round(kleinster * 100) / 100, je, platte: platteSumme.map((v) => Math.round(v / Math.max(1, platteN))) };
  }, { b64: png.toString("base64"), labels: daten.labels, textHex: daten.textHex, dpr: daten.dpr });
  return { ...erg, n: daten.labels.length, text: daten.textHex, buehne: daten.buehne };
}
const lage = (page) => page.evaluate(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return m.labelInfo.filter((l) => l.ziel === 1).map((l) => `${l.id}@${Math.round(l.x)},${Math.round(l.y)}`).sort().join("|"); });
async function themaWaehlen(page, breite, wert) {
  if (breite >= 1024) await page.click("#seite-einstellungen");
  else { await page.click("#kopf-menue"); await page.waitForSelector("#schublade[open]"); await warte(350); await page.click("#schublade-einstellungen"); }
  await page.waitForSelector("#dialog-einstellungen[open]");
  await page.click(`#dialog-einstellungen label.segment-wahl:has(input[value="${wert}"])`);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#dialog-einstellungen").open);
  if (breite < 1024) { await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("#schublade").open); }
  await warte(450);
}

for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  for (const breite of [1440, 390]) {
    const mobil = breite < 768;
    const ctx = await browser.newContext({ viewport: { width: breite, height: mobil ? 844 : 900 }, deviceScaleFactor: mobil ? 2 : 1, isMobile: mobil, hasTouch: mobil, colorScheme: "light" });
    await ctx.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} }, configurable: true }); } catch { /* egal */ } });
    const page = await ctx.newPage();
    const konsole = [];
    page.on("pageerror", (e) => konsole.push(e.message));
    await page.goto(`${basis}/?demo=1#/brain`);
    await page.waitForFunction(() => { const m = window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.messen(); return m && m.ruht && m.labelInfo && m.labelInfo.filter((l) => l.ziel === 1 && l.a >= 0.95).length >= 2; }, null, { timeout: 30000 });
    await warte(400);
    await page.evaluate(() => { window.__ohneNeuladen = true; });
    const wo = `${motor} ${breite} px`;
    const hell = await labelMessen(page);
    const lageVorher = await lage(page);
    await themaWaehlen(page, breite, "dunkel");
    const dunkel = await labelMessen(page);
    const lageNachher = await lage(page);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".brain-graph")).backgroundColor);
    await themaWaehlen(page, breite, "hell");
    const wieder = await labelMessen(page);
    const ohneNeuladen = await page.evaluate(() => window.__ohneNeuladen === true);
    const hellig = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    pruefe(hellig(hell.platte) > 200 && hellig(dunkel.platte) < 70 && hellig(wieder.platte) > 200 && bg === "rgb(5, 31, 59)" && ohneNeuladen,
      `${wo}: Canvas wechselt live – Label-Platten hell rgb(${hell.platte}) → dunkel rgb(${dunkel.platte}) → hell rgb(${wieder.platte}), Bühne ${bg}, ohne Neuladen`);
    pruefe(lageVorher === lageNachher, `${wo}: der Wechsel ordnet nichts neu an (gleiche Labels an gleicher Stelle)`);
    pruefe(hell.n >= 2 && hell.kleinster >= 4.5, `${wo} Hell: Kontrast der Labels ≥ 4,5:1 – ${hell.n} Labels, kleinster ${hell.kleinster}:1 (Text ${hell.text})`);
    pruefe(dunkel.n >= 2 && dunkel.kleinster >= 4.5, `${wo} Dunkel: Kontrast der Labels ≥ 4,5:1 – ${dunkel.n} Labels, kleinster ${dunkel.kleinster}:1 (Text ${dunkel.text})`);
    pruefe(!konsole.length, `${wo}: keine Skriptfehler${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
    await ctx.close();
  }
  await browser.close();
}
await hilfeBrowser.close();
console.log(`\n${n - fehler.length} von ${n} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot` : "."}`);
process.exit(fehler.length ? 1 : 0);
