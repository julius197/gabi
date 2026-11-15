// Design v2.3 – Leistung beim Scrollen mit Glas (Chromium): ein Gespräch mit mindestens 50 Nachrichten (Fragen mit
// Quellen, Diktate mit Entwurfskarten, Berichte mit Berichtskarten), dann der ganze Verlauf hinunter und wieder hinauf –
// einmal Bild für Bild per Skript (scrollBy je Frame, 1200 px/s) und einmal per Mausrad (Compositor). Gemessen wird der
// Abstand zwischen zwei Bildern (requestAnimationFrame) und lange Frames (long-animation-frame, ≥ 50 ms).
// Ziel: kein Frame über 33 ms. Zum Vergleich derselbe Lauf mit abgeschaltetem Glas (--glas-filter: none).
// Voraussetzung: lokaler Server wie bei v2.mjs (`cd worker && npm run lokal` → http://localhost:8788).
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/design-leistung.mjs [basis-url] [ergebnis.json]
//   GABI_BREITEN=390,1440  GABI_SCHEMEN=light,dark  GABI_CHROMIUM_SHELL=1 (alte Headless-Shell statt GPU)
import { writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8788", ergebnisDatei = ""] = process.argv;
const liste = (name, standard) => (process.env[name] || standard).split(",").map((s) => s.trim()).filter(Boolean);
const BREITEN = liste("GABI_BREITEN", "390,1440").map(Number);
const SCHEMEN = liste("GABI_SCHEMEN", "light,dark");
const GRENZE = 33.4; // ms – zwei Bilder bei 60 Hz
const CHROMIUM = process.env.GABI_CHROMIUM_SHELL === "1" ? {} : { channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] };

const fehler = [];
const pruefe = (ok, text) => { if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(v * 10) / 10;

const browser = await chromium.launch(CHROMIUM);
const ergebnisse = [];

async function stumm(ctx) {
  await ctx.addInitScript(() => {
    const attrappe = { speak(u) { setTimeout(() => u.onend && u.onend(), 300); }, cancel() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {}, speaking: false };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
  });
}
const ruhig = (page) => page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && !document.querySelector(".eingabe.erkennt"), null, { timeout: 20000 });
const anzahl = (page) => page.evaluate(() => document.querySelectorAll("#nachrichten .nachricht").length);

/** Gespräch mit mindestens 50 Nachrichten aufbauen (Demo-Assistent, echte Oberfläche). */
async function gespraechAufbauen(page) {
  const fragen = ["Was wollte TP-01?", "Wo sind die Standorte?", "Was kostet Osteopathie?", "Was hat TP-02 als Hausaufgabe?", "Wann hat die Praxis geöffnet?", "Was wollte TP-03?"];
  const patienten = ["TP-01", "TP-02", "TP-03"];
  for (let runde = 0; (await anzahl(page)) < 50 && runde < 60; runde++) {
    if (runde % 6 === 1) { // Diktat mit Beispiel → Entwurfskarte, gespeichert
      await page.click('#chips-leiste [data-schnell="diktat"]');
      await page.locator(`[data-aktion="waehle"]:has-text("${patienten[runde % 3]}")`).last().click();
      await page.waitForSelector("#modus-pill:not([hidden])");
      await page.locator('[data-aktion="beispiel"]').last().click();
      await page.waitForFunction((n) => document.querySelectorAll(".karte-entwurf:not(.erledigt)").length >= 1, null, { timeout: 20000 });
      await ruhig(page);
      await page.locator('.karte-entwurf:not(.erledigt) [data-aktion="entwurf-speichern"]').last().click();
      await page.waitForFunction(() => !document.querySelector(".karte-entwurf:not(.erledigt):not(.verworfen)"), null, { timeout: 15000 });
    } else if (runde % 6 === 4) { // Bericht → Berichtskarte
      await page.click('#chips-leiste [data-schnell="bericht"]');
      await page.locator(`[data-aktion="waehle"]:has-text("${patienten[(runde + 1) % 3]}")`).last().click();
      await page.locator('[data-aktion="waehle"][data-wert="verlauf"]').last().click();
      await ruhig(page);
    } else {
      await page.fill("#eingabe-text", fragen[runde % fragen.length]);
      await page.click("#senden");
      await ruhig(page);
    }
    if (runde === 0) await page.waitForSelector("#chips-leiste:not([hidden])");
  }
  return { nachrichten: await anzahl(page), karten: await page.evaluate(() => document.querySelectorAll("#nachrichten .gespraechs-karte").length) };
}

/** Bild für Bild scrollen (rAF + scrollBy) und Bildabstände messen. */
async function scrollMessen(page, art) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await warte(400);
  if (art === "skript") {
    return page.evaluate(() => new Promise((fertig) => {
      const abstaende = [];
      const lang = [];
      let beob = null;
      try { beob = new PerformanceObserver((l) => { for (const e of l.getEntries()) lang.push(e.duration); }); beob.observe({ type: "long-animation-frame", buffered: false }); } catch { /* nicht unterstützt */ }
      const ende = document.documentElement.scrollHeight - innerHeight;
      let richtung = 1, zuletzt = 0, runden = 0;
      const schritt = (t) => {
        if (zuletzt) abstaende.push(t - zuletzt);
        zuletzt = t;
        window.scrollBy(0, 20 * richtung); // 20 px je Bild ≈ 1200 px/s
        if (richtung > 0 && scrollY >= ende - 1) richtung = -1;
        else if (richtung < 0 && scrollY <= 0) { runden++; richtung = 1; }
        if (runden < 1) requestAnimationFrame(schritt);
        else { if (beob) beob.disconnect(); fertig({ abstaende, lang, hoehe: ende }); }
      };
      requestAnimationFrame(schritt);
    }));
  }
  // Mausrad: der Compositor scrollt, die Seite misst nebenher jedes Bild
  await page.evaluate(() => {
    window.__abstaende = []; window.__lang = [];
    try { window.__beob = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lang.push(e.duration); }); window.__beob.observe({ type: "long-animation-frame" }); } catch { /* egal */ }
    let zuletzt = 0;
    const f = (t) => { if (zuletzt) window.__abstaende.push(t - zuletzt); zuletzt = t; if (!window.__stopp) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const box = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2, ende: document.documentElement.scrollHeight - innerHeight }));
  await page.mouse.move(box.x, box.y);
  for (let i = 0; i < Math.ceil(box.ende / 60) + 4; i++) { await page.mouse.wheel(0, 60); await warte(16); }
  for (let i = 0; i < Math.ceil(box.ende / 60) + 4; i++) { await page.mouse.wheel(0, -60); await warte(16); }
  await warte(300);
  return page.evaluate(() => { window.__stopp = true; if (window.__beob) window.__beob.disconnect(); return { abstaende: window.__abstaende, lang: window.__lang, hoehe: document.documentElement.scrollHeight - innerHeight }; });
}
function auswerten(m) {
  const a = [...m.abstaende].sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { bilder: a.length, max: r1(a[a.length - 1] || 0), p95: r1(q(0.95) || 0), median: r1(q(0.5) || 0), ueber33: a.filter((x) => x > GRENZE).length, lang: m.lang.length, langMax: r1(Math.max(0, ...m.lang)), hoehe: Math.round(m.hoehe) };
}

for (const breite of BREITEN) for (const schema of SCHEMEN) {
  const mobil = breite < 768;
  const name = `${breite} px ${schema === "dark" ? "dunkel" : "hell"}`;
  const ctx = await browser.newContext({ viewport: { width: breite, height: mobil ? 844 : 900 }, deviceScaleFactor: mobil ? 3 : 2, isMobile: mobil, hasTouch: mobil, colorScheme: schema });
  await stumm(ctx);
  const page = await ctx.newPage();
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
  const g = await gespraechAufbauen(page);
  pruefe(g.nachrichten >= 50, `${name}: Gespräch mit ${g.nachrichten} Nachrichten, davon ${g.karten} Karten`);
  for (const glas of [true, false]) {
    if (!glas) await page.evaluate(() => { const b = [...document.styleSheets].find((s) => (s.href || "").includes("style.css")); b.insertRule(":root { --glas-filter: none !important; }", b.cssRules.length); });
    for (const art of ["skript", "mausrad"]) {
      const w = auswerten(await scrollMessen(page, art));
      ergebnisse.push({ name, glas, art, ...g, ...w });
      const text = `${name}, ${glas ? "mit Glas" : "Vergleich ohne Unschärfe"}, ${art === "skript" ? "Bild für Bild" : "Mausrad"}: ${w.bilder} Bilder über ${w.hoehe} px, längstes ${w.max} ms (p95 ${w.p95}, Median ${w.median}), über 33 ms: ${w.ueber33}, lange Frames ≥ 50 ms: ${w.lang}`;
      if (glas) pruefe(w.ueber33 === 0 && w.bilder > 30, text);
      else console.log(`· ${text}`);
    }
  }
  await ctx.close();
}
await browser.close();
if (ergebnisDatei) await writeFile(ergebnisDatei, `${JSON.stringify({ chromium: CHROMIUM.channel ? "neue Headless-Variante mit GPU (Metal)" : "Headless-Shell", ergebnisse }, null, 1)}\n`);
console.log(`\n${fehler.length ? `✗ ${fehler.length} Prüfungen fehlgeschlagen` : "✓ alle Prüfungen bestanden"}`);
process.exit(fehler.length ? 1 : 0);
