// Brain – Leistungsmessung des Graphen mit 100, 300 und 500 Knoten (erfundener Graph über ?brainknoten=N, das Brain
// selbst bleibt unberührt). Chromium und WebKit, Laptop 1440 × 900, dazu Handy 390 × 844 mit 500 Knoten.
// Gemessen wird: Layout-Zeit bis zur Ruhe, Bildrate während das Layout läuft, Bildrate beim Verschieben und Zoomen,
// Zeichenkosten je Bild (Median und 95 %), Bilder in Ruhe (muss 0 sein), Speicher (nur Chromium: JS-Heap nach GC).
// Voraussetzung: `cd worker && npm run brain` läuft (http://localhost:8790). Nie gegen die Live-Seite.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-leistung.mjs [basis-url]
// Ergebnis: Markdown-Tabelle (für GABI-BRAIN-LOG.md). Ende mit Fehler, wenn 500 Knoten am Laptop unter 50 Bildern/s liegen.
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Nur lokal messen."); process.exit(2); }

await zielPruefen(basis, { live: false }); // siehe tests/ziel.mjs
const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((m) => m.trim()).filter(Boolean);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const rund = (x, n = 1) => (x == null ? "–" : String(Math.round(x * 10 ** n) / 10 ** n).replace(".", ","));

/** Bildrate aus den Zeitstempeln von requestAnimationFrame zwischen zwei Zeitpunkten. */
function rate(zeiten, von, bis) {
  const t = zeiten.filter((x) => x >= von && x <= bis);
  if (t.length < 5) return { fps: null, lang: null, bilder: t.length };
  const abstaende = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  return { fps: ((t.length - 1) / (t[t.length - 1] - t[0])) * 1000, lang: abstaende[Math.floor(abstaende.length * 0.95)], bilder: t.length };
}

async function messung(browser, motor, knoten, { handy = false } = {}) {
  const ctx = await browser.newContext({ viewport: handy ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: handy, hasTouch: handy, deviceScaleFactor: handy ? 3 : 2 });
  await ctx.addInitScript(() => {
    // Test-Browser bleiben stumm: keine Sprachausgabe (macOS ignoriert dafür --mute-audio)
    const attrappe = { speak() {}, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {} };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
    window.__zeiten = [];
    const f = (t) => { window.__zeiten.push(t); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(`${basis}/?demo=1&brainknoten=${knoten}#/brain`);
  await page.waitForFunction(() => window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.messen() && window.GabiBrainAnsicht.aktuell.messen().knoten > 0, null, { timeout: 30000 });
  const start = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.GabiBrainAnsicht.aktuell.messen().ruht, null, { timeout: 60000 });
  const ruhe = await page.evaluate(() => performance.now());
  const nachLayout = await page.evaluate(() => window.GabiBrainAnsicht.aktuell.messen());
  const layoutRate = rate(await page.evaluate(() => window.__zeiten), start, ruhe);

  // Verschieben und Zoomen: 3 Sekunden ununterbrochen
  const f = await page.locator("canvas.brain-graph-flaeche").boundingBox();
  const mx = f.x + f.width / 2;
  const my = f.y + f.height / 2;
  const t0 = await page.evaluate(() => performance.now());
  if (handy) {
    await page.evaluate(async ({ x, y }) => {
      const c = document.querySelector("canvas.brain-graph-flaeche");
      const ev = (art, px, py) => c.dispatchEvent(new PointerEvent(art, { pointerId: 41, pointerType: "touch", isPrimary: true, clientX: px, clientY: py, bubbles: true, cancelable: true, buttons: art === "pointerup" ? 0 : 1 }));
      ev("pointerdown", x, y);
      const beginn = performance.now();
      await new Promise((ok) => {
        const schritt = (t) => {
          const w = (t - beginn) / 300;
          ev("pointermove", x + Math.cos(w) * 90, y + Math.sin(w) * 120);
          if (t - beginn < 3000) requestAnimationFrame(schritt); else ok();
        };
        requestAnimationFrame(schritt);
      });
      ev("pointerup", x, y);
    }, { x: mx, y: my });
  } else {
    await page.mouse.move(mx, my);
    await page.mouse.down();
    for (let i = 0; i < 90; i++) { const w = i / 7; await page.mouse.move(mx + Math.cos(w) * 160, my + Math.sin(w) * 110); }
    await page.mouse.up();
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, i % 8 < 4 ? -80 : 80); await warte(16); }
  }
  const t1 = await page.evaluate(() => performance.now());
  const bewegung = rate(await page.evaluate(() => window.__zeiten), t0, t1);
  const nachBewegung = await page.evaluate(() => window.GabiBrainAnsicht.aktuell.messen());

  // Knoten ziehen (Physik: die Nachbarn federn mit): die stärkste Nabe 3 Sekunden lang im Kreis führen
  let ziehen = { fps: null, lang: null };
  if (!handy) {
    await page.waitForFunction(() => window.GabiBrainAnsicht.aktuell.messen().ruht, null, { timeout: 60000 });
    const nabe = await page.evaluate(() => {
      const a = window.GabiBrainAnsicht.aktuell;
      const f = document.querySelector("canvas.brain-graph-flaeche").getBoundingClientRect();
      // die ersten Testknoten sind die Naben (testDaten: t-0001 …); die erste, die gut im Bild liegt
      for (let i = 1; i < 60; i++) {
        const id = `t-${String(i).padStart(4, "0")}`;
        const o = a.ort(id);
        if (o && o.x > f.left + 200 && o.x < f.right - 200 && o.y > f.top + 150 && o.y < f.bottom - 150) return { id, x: o.x, y: o.y };
      }
      return null;
    });
    if (nabe) {
      await page.mouse.move(nabe.x, nabe.y);
      await page.mouse.down();
      const z0 = await page.evaluate(() => performance.now());
      const beginn = Date.now();
      for (let i = 0; Date.now() - beginn < 3000; i++) { const w = i / 14; await page.mouse.move(nabe.x + Math.cos(w) * 70 - 70, nabe.y + Math.sin(w) * 50); await warte(16); }
      const z1 = await page.evaluate(() => performance.now());
      await page.mouse.up();
      ziehen = rate(await page.evaluate(() => window.__zeiten), z0, z1);
    }
  }

  // In Ruhe: kein Bild (der Puls der „Zu klären“-Knoten ist nach 6 s vorbei)
  await page.waitForFunction(() => window.GabiBrainAnsicht.aktuell.messen().ruht, null, { timeout: 60000 });
  await warte(6500);
  const b1 = (await page.evaluate(() => window.GabiBrainAnsicht.aktuell.messen())).bilder;
  await warte(1500);
  const b2 = (await page.evaluate(() => window.GabiBrainAnsicht.aktuell.messen())).bilder;

  let heap = null;
  if (motor === "chromium") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const wert = (metrics.find((x) => x.name === "JSHeapUsedSize") || {}).value;
    heap = Number.isFinite(wert) ? wert / 1048576 : null;
  }
  await ctx.close();
  return {
    motor, geraet: handy ? "Handy" : "Laptop", knoten: nachLayout.knoten, kanten: nachLayout.kanten, worker: nachLayout.worker,
    layoutMs: nachLayout.layoutMs, ticks: nachLayout.ticks, layoutFps: layoutRate.fps, bewegungFps: bewegung.fps, lang: bewegung.lang,
    p50: nachBewegung.zeichnenP50, p95: nachBewegung.zeichnenP95, ruheBilder: b2 - b1, heap, fehler, ziehFps: ziehen.fps, ziehLang: ziehen.lang,
  };
}

const zeilen = [];
for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  try {
    for (const n of [100, 300, 500]) zeilen.push(await messung(browser, motor, n));
    zeilen.push(await messung(browser, motor, 500, { handy: true }));
  } finally {
    await browser.close();
  }
}

console.log("| Engine | Gerät | Knoten | Kanten | Layout bis zur Ruhe | Bilder/s im Layout | Bilder/s beim Verschieben und Zoomen | längstes Bild (95 %) | Bilder/s beim Ziehen (Physik) | Zeichnen je Bild (Median / 95 %) | Bilder in Ruhe | JS-Speicher |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const z of zeilen) {
  console.log(`| ${z.motor} | ${z.geraet} | ${z.knoten} | ${z.kanten} | ${z.layoutMs == null ? "–" : `${rund(z.layoutMs / 1000, 2)} s (${z.ticks} Schritte${z.worker ? ", Worker" : ", Hauptfaden"})`} | ${rund(z.layoutFps)} | ${rund(z.bewegungFps)} | ${rund(z.lang)} ms | ${z.ziehFps == null ? "–" : `${rund(z.ziehFps)} (95 %: ${rund(z.ziehLang)} ms)`} | ${rund(z.p50, 2)} / ${rund(z.p95, 2)} ms | ${z.ruheBilder} | ${z.heap == null ? "–" : `${rund(z.heap)} MB`} |`);
}
const schlecht = zeilen.filter((z) => z.fehler.length || z.ruheBilder !== 0 || (z.knoten >= 500 && z.geraet === "Laptop" && ((z.bewegungFps != null && z.bewegungFps < 50) || (z.ziehFps != null && z.ziehFps < 50))));
for (const z of schlecht) console.log(`✗ ${z.motor} ${z.geraet} ${z.knoten}: ${z.fehler.join(" | ") || (z.ruheBilder ? `${z.ruheBilder} Bilder in Ruhe` : `${rund(z.bewegungFps)} Bilder/s`)}`);
process.exit(schlecht.length ? 1 : 0);
