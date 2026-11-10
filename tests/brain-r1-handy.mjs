// Browser-Checks zu den Korrekturen nach Prüfrunde 1 – Gebiet Handy, Layout, Barrierefreiheit, Fokusführung.
// Ohne Secrets, ohne Internet, nie gegen den Live-Worker (tests/ziel.mjs). Chromium und WebKit, headless und stumm.
//  Fund 1   lange Titel in Chips: Gespräch und Detail ohne seitlichen Überlauf (320, 390, 1024, 1440 px – alle Einträge)
//  Fund 2   Leiste aus Reitern, Suche, Werkzeugen: kein Überlauf, die Suche behält Platz (320 bis 1440 px, Demo und lokal)
//  Fund 3   Touch-Ziele ab 44 px bei Brain-Elementen im Gespräch und in der Fokus-Leiste (pointer: coarse)
//  Fund 6   Liste: Zeile aktivieren → Fokus im Detail, Schließen → zurück auf dieselbe Zeile
//  Fund 7   Fokus fällt nach Aktionen nicht mehr auf body, das Detail springt nicht an den Anfang, Ansage ohne Toast
//  Fund 8   Esc im Editor mit ungespeicherter Änderung: die Rückfrage bleibt offen
//  Fund 9   Platzhalter der Brain-Felder mit mindestens 4,5:1 (Hell und Dunkel)
//  Fund 10  Graph-Reiter: Trefferzahl und leere Zustände als Einblendung – die Zeichenfläche behält ihre Größe
//  Fund 11  Laden: die Bühne springt nicht; ein Tipp beim Laden geht nicht verloren; Fehlerzustand gesperrt und angesagt
// Gemessen wird an den betroffenen Elementen selbst (getBoundingClientRect, scrollWidth) – nicht nur an der Seite.
// „Wächter“ sind Prüfungen gegen Nebenwirkungen der Korrekturen (zum Beispiel: das Suchfeld überdeckt bei 320 px den
// Filter-Knopf nicht). Anders als die übrigen Prüfungen müssen sie am Stand vor der Korrektur nicht rot gewesen sein.
// Voraussetzung: `cd worker && npm run brain` (oder PORT=… GABI_BRAIN=1 node dev/lokal.mjs), Zugangscode „test“.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-r1-handy.mjs [basis-url]
// Auswahl: GABI_MOTOREN=chromium,webkit · GABI_FUNDE=1,2,3,6,7,8,9,10,11
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Diese Tests laufen nur lokal – nie gegen die Live-Seite oder den Live-Worker."); process.exit(2); }
await zielPruefen(basis, { live: false });

const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((m) => m.trim()).filter(Boolean);
const FUNDE = new Set((process.env.GABI_FUNDE || "1,2,3,6,7,8,9,10,11").split(",").map((t) => t.trim()));
const MOD = process.platform === "darwin" ? "Meta" : "Control";

const fehler = [];
let gezaehlt = 0;
const pruefe = (ok, text) => { gezaehlt++; if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const waechter = (ok, text) => pruefe(ok, `[Wächter] ${text}`);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Keine echte Sprachausgabe in Testbrowsern (macOS spielt sie sonst laut ab). */
async function stumm(ctx) {
  await ctx.addInitScript(() => {
    const attrappe = { speak(u) { setTimeout(() => u.onend && u.onend(), 50); }, cancel() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {}, speaking: false };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
  });
}
/** breite < 1024 = Touch-Gerät (pointer: coarse), sonst Maus. */
async function kontext(browser, { breite = 1440, hoehe = 0, schema = "light", touch = breite < 1024 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe || (breite >= 1024 ? 900 : 844) }, isMobile: touch, hasTouch: touch, colorScheme: schema });
  await stumm(ctx);
  return ctx;
}
const BEREIT = () => Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain);
async function demoSeite(ctx, hash = "#/brain") {
  const page = await ctx.newPage();
  const konsole = [];
  page.on("pageerror", (e) => konsole.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/.test(m.text())) konsole.push(m.text()); });
  await page.goto(`${basis}/?demo=1${hash}`);
  await page.waitForFunction(BEREIT, null, { timeout: 20000 });
  return { page, konsole };
}
const detailOffen = (page, titel) => page.waitForFunction((t) => { const h = document.querySelector("#brain-detail:not([hidden]) #brain-detail-titel"); return Boolean(h && h.textContent.trim() === t); }, titel, { timeout: 8000 });
const detailZu = (page) => page.waitForFunction(() => document.querySelector("#brain-detail").hidden, null, { timeout: 8000 });
const idVon = (page, titel) => page.evaluate((t) => window.GabiBrainAnsicht.aktuell.brain.findeTitel(t).id, titel);
const graphRuht = (page) => page.waitForFunction(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return Boolean(m && m.ruht); }, null, { timeout: 30000 });
/** Was den Fokus hat – kurz und lesbar. */
const aktiv = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "BODY";
  return `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ""}${typeof a.className === "string" && a.className ? `.${a.className.trim().split(/\s+/)[0]}` : ""} „${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 24)}“`;
});
const fokusAuf = (page, sel) => page.evaluate((s) => Boolean(document.activeElement && document.activeElement !== document.body && document.activeElement.matches(s)), sel);
const mitRing = (page) => page.evaluate(() => Boolean(document.activeElement && document.activeElement !== document.body && document.activeElement.matches(":focus-visible")));
const seitenBreite = (page) => page.evaluate(() => document.documentElement.scrollWidth);
const ansagen = (page) => page.evaluate(() => `${(document.querySelector("#brain-ansage") || {}).textContent || ""} ${(document.querySelector("#brain-meldung") || {}).textContent || ""}`.trim());
const toastTexte = (page) => page.evaluate(() => [...document.querySelectorAll(".toasts .toast .toast-text")].map((t) => t.textContent.trim()));
const toastsWeg = (page) => page.evaluate(() => { for (const t of document.querySelectorAll(".toasts .toast")) t.remove(); });
async function fragen(page, text) {
  await page.fill("#eingabe-text", text);
  await page.click("#senden");
}
const antwortFertig = (page) => page.waitForFunction(() => {
  const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop();
  return !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && n && n.innerText.trim().length > 0;
}, null, { timeout: 20000 });
/** Maße sichtbarer Elemente: [{ name, b, h }] */
const masse = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((k) => { const r = k.getBoundingClientRect(); return r.width && r.height && !k.closest("[hidden]"); }).map((k) => { const r = k.getBoundingClientRect(); return { name: (k.getAttribute("aria-label") || k.textContent || "").trim().slice(0, 24), b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }), sel);
const gross = (liste, min = 43.5) => liste.length > 0 && liste.every((m) => Math.min(m.b, m.h) >= min);
const zeig = (liste) => liste.map((m) => `${m.name} ${m.b}×${m.h}`).join(" | ") || "nichts gefunden";

// ---------------------------------------------------------------------------
// Fund 1: lange Titel in Chips
// ---------------------------------------------------------------------------
async function fund1(browser, motor) {
  for (const breite of [320, 390, 1024, 1440]) {
    const name = `${motor} Fund 1 · ${breite} px`;
    const touch = breite < 1024;
    const ctx = await kontext(browser, { breite });
    const { page, konsole } = await demoSeite(ctx, "#/");
    await page.waitForSelector("#eingabe-text");
    if (touch) {
      // Gespräch: die Antwort auf eine offene Frage trägt die ganze Frage als Quellen-Chip (72 Zeichen)
      await fragen(page, "Gibt es Parkplätze an den Standorten?");
      await antwortFertig(page);
      await page.waitForSelector(".nachricht:last-child .quelle.brain-quelle");
      await warte(450);
      const g = await page.evaluate(() => {
        const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop();
        const spalte = (n.querySelector(".nachricht-inhalt") || n).getBoundingClientRect();
        const chip = n.querySelector(".quelle.brain-quelle");
        const c = chip.getBoundingClientRect();
        return { text: chip.textContent.trim().length, chipRechts: Math.round(c.right), chipB: Math.round(c.width), chipH: Math.round(c.height), spalteRechts: Math.round(spalte.right) };
      });
      const seite = await seitenBreite(page);
      pruefe(g.text > 60 && g.chipRechts <= g.spalteRechts + 0.5 && seite <= breite, `${name}: Gespräch – der Quellen-Chip mit langer Frage (${g.text} Zeichen, ${g.chipB}×${g.chipH}) bleibt in der Spalte (rechts ${g.chipRechts} ≤ ${g.spalteRechts}), die Seite scrollt nicht seitlich (${seite})`);
      pruefe(g.chipH >= 43.5, `${name}: der Quellen-Chip ist dabei ein Touch-Ziel (${g.chipH} px hoch)`);
    }
    // Detail: jeden Eintrag öffnen und den Rumpf selbst messen (die Seite scrollt dabei nie – das sah der alte Test)
    await page.evaluate(() => { location.hash = "#/brain/liste"; });
    await page.waitForSelector("#brain-liste:not([hidden]) .brain-zeile");
    const alle = await page.evaluate(() => window.GabiBrainAnsicht.aktuell.brain.knoten().map((k) => ({ id: k.id, titel: k.titel })));
    const ueber = [];
    let kleinsterChip = Infinity;
    for (const k of alle) {
      await page.evaluate((id) => { location.hash = `#/brain/${id}`; }, k.id);
      await detailOffen(page, k.titel);
      const m = await page.evaluate(() => {
        const r = document.querySelector("#brain-detail .brain-detail-rumpf");
        const rr = r.getBoundingClientRect();
        let raus = 0;
        for (const x of r.querySelectorAll("*")) { const b = x.getBoundingClientRect(); if (b.width && b.right > rr.right + 0.5) raus++; }
        const hoehen = [...r.querySelectorAll(".quelle")].map((c) => c.getBoundingClientRect().height);
        return { scrollW: r.scrollWidth, clientW: r.clientWidth, raus, minH: hoehen.length ? Math.min(...hoehen) : null };
      });
      if (m.scrollW > m.clientW + 1 || m.raus) ueber.push(`${k.titel} ${m.scrollW}/${m.clientW}`);
      if (m.minH !== null) kleinsterChip = Math.min(kleinsterChip, m.minH);
    }
    pruefe(alle.length >= 53 && ueber.length === 0, `${name}: Detail – kein Eintrag läuft seitlich über (${alle.length} geöffnet, darunter „Leistungen“ und „Team“ mit Verbindungen von Hand; übergelaufen: ${ueber.length}${ueber.length ? ` – ${ueber.slice(0, 3).join(", ")}` : ""})`);
    if (touch) {
      waechter(kleinsterChip >= 43.5, `${name}: Chips im Detail bleiben am Touch-Gerät mindestens 44 px hoch (kleinster ${Math.round(kleinsterChip * 10) / 10} px – die Chip-Regel steht vor dem Touch-Block)`);
      // „Team“: ein langer Titel in „Verbindungen von Hand“ wird gekürzt – mit „…“, nicht hart abgeschnitten
      await page.evaluate((id) => { location.hash = `#/brain/${id}`; }, alle.find((k) => k.titel === "Team").id);
      await detailOffen(page, "Team");
      const v = await page.evaluate(() => [...document.querySelectorAll("#brain-detail .brain-verbindungen a")].map((a) => { const s = getComputedStyle(a); return { gekuerzt: a.scrollWidth > a.clientWidth + 1, punkte: s.textOverflow === "ellipsis" && s.display === "block" && s.overflowX === "hidden", h: a.getBoundingClientRect().height }; }));
      const lang = v.filter((x) => x.gekuerzt);
      if (breite === 390) pruefe(lang.length >= 1 && lang.every((x) => x.punkte) && v.every((x) => x.h >= 43.5), `${name}: „Team“ – der lange Titel einer Verbindung von Hand endet mit „…“ und bleibt 44 px hoch (${lang.length} von ${v.length} gekürzt)`);
    }
    waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 2: Leiste aus Reitern, Suche und Werkzeugen
// ---------------------------------------------------------------------------
const LEISTE = () => {
  const q = (s) => document.querySelector(s);
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, o: b.top, u: b.bottom, b: b.width }; };
  const feld = q("#brain-suche");
  const st = getComputedStyle(feld);
  return { seite: document.documentElement.scrollWidth, leiste: r(q(".brain-leiste")), reiter: r(q("#brain-reiter")), suche: r(feld), text: feld.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), werkzeuge: r(q(".brain-werkzeuge")), filter: r(q("#brain-filter-knopf")), mehr: r(q("#brain-mehr")) };
};
async function fund2(browser, motor) {
  const eineZeile = (m) => Math.abs((m.reiter.o + m.reiter.u) / 2 - (m.suche.o + m.suche.u) / 2) < 8;
  const drin = (m, breite) => m.seite <= breite && m.mehr.r <= m.leiste.r + 0.5 && m.reiter.l >= m.leiste.l - 0.5 && m.mehr.r <= breite;
  const sucheFrei = (m) => m.suche.r <= m.filter.l + 0.5; // das Feld liegt nicht über dem Filter-Knopf
  const reihenfolge = (m) => (eineZeile(m) ? m.reiter.r <= m.suche.l + 0.5 : m.reiter.u <= m.suche.o + 0.5) && m.suche.r <= m.werkzeuge.l + 0.5; // fürs Auge wie im Dokument: Reiter, Suche, Werkzeuge
  for (const breite of [320, 390, 640, 667, 692, 768, 900, 1024, 1064, 1180, 1280, 1440]) {
    const name = `${motor} Fund 2 · ${breite} px`;
    const ctx = await kontext(browser, { breite, hoehe: breite === 667 ? 375 : 0 });
    const { page } = await demoSeite(ctx, "#/brain/graph");
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    await warte(150);
    const m = await page.evaluate(LEISTE);
    const zeilen = eineZeile(m) ? "eine Zeile" : "Reiter in eigener Zeile";
    if ([640, 667, 692].includes(breite)) pruefe(drin(m, breite), `${name}: die Leiste bleibt im Fenster (Seite ${m.seite}, „Mehr“ endet bei ${Math.round(m.mehr.r)}, ${zeilen})`);
    else waechter(drin(m, breite), `${name}: die Leiste bleibt im Fenster (Seite ${m.seite}, ${zeilen})`);
    if ([640, 667, 692, 768, 1024, 1064].includes(breite)) pruefe(m.suche.b >= 160 && m.text >= 100 && sucheFrei(m), `${name}: das Suchfeld hat Platz (${Math.round(m.suche.b)} px breit, ${Math.round(m.text)} px für Text) und überdeckt den Filter-Knopf nicht`);
    else waechter(m.suche.b >= (breite >= 640 ? 160 : 130) && sucheFrei(m), `${name}: das Suchfeld hat Platz (${Math.round(m.suche.b)} px) und überdeckt den Filter-Knopf nicht – keine pauschale Mindestbreite`);
    waechter(reihenfolge(m), `${name}: Reihenfolge fürs Auge wie im Dokument (Reiter, Suche, Werkzeuge – ${zeilen})`);
    if (breite === 1440) {
      waechter(eineZeile(m) && Math.abs(m.reiter.b - 436) < 30, `${name}: am Laptop steht alles in einer Zeile, die Reiter so breit wie ihr Inhalt (${Math.round(m.reiter.b)} px)`);
      if (motor === "chromium") { // Safari überspringt Knöpfe beim Tabben (Systemeinstellung) – die Tab-Folge nur hier
        await page.focus('.brain-reiter-knopf[aria-selected="true"]');
        await page.keyboard.press("Tab");
        const eins = await aktiv(page);
        await page.keyboard.press("Tab");
        const zwei = await aktiv(page);
        waechter(/#brain-suche/.test(eins) && /#brain-filter-knopf/.test(zwei), `${name}: Tab-Folge Reiter → Suche → Filter (${eins} → ${zwei})`);
      }
    }
    await ctx.close();
  }
  // lokaler Modus (Zugangscode „test“): ohne Lücken-Zähler sind die Reiter schmaler – der Umbruch richtet sich nach dem Platz
  for (const breite of [640, 1024]) {
    const name = `${motor} Fund 2 · ${breite} px lokal`;
    const ctx = await kontext(browser, { breite });
    const page = await ctx.newPage();
    await page.goto(`${basis}/#/`);
    await page.waitForSelector("#ansicht-zugang:not([hidden]) #zugang-code");
    await page.fill("#zugang-code", "test");
    await page.click("#zugang-weiter");
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    await page.waitForFunction(BEREIT, null, { timeout: 20000 });
    await page.evaluate(() => { location.hash = "#/brain/graph"; });
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    await warte(150);
    const m = await page.evaluate(LEISTE);
    pruefe(drin(m, breite) && m.suche.b >= 160 && sucheFrei(m), `${name}: ohne Lücken-Zähler – Leiste im Fenster (Seite ${m.seite}), Suchfeld ${Math.round(m.suche.b)} px`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 3: Touch-Ziele
// ---------------------------------------------------------------------------
async function fund3(browser, motor) {
  for (const breite of [390, 320]) {
    const name = `${motor} Fund 3 · ${breite} px`;
    const ctx = await kontext(browser, { breite });
    const { page, konsole } = await demoSeite(ctx, "#/");
    await page.waitForSelector("#eingabe-text");
    await warte(450);
    waechter(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), `${name}: der Testbrowser meldet ein Touch-Gerät (pointer: coarse)`);
    let m = await masse(page, '.brain-start-hinweis [data-brain-start="zu"]');
    pruefe(gross(m), `${name}: „Hinweis ausblenden“ am Start-Hinweis (${zeig(m)})`);
    await fragen(page, "Wann seid ihr telefonisch erreichbar?");
    await antwortFertig(page);
    await page.waitForSelector(".nachricht:last-child .brain-quelle");
    await warte(450);
    m = await masse(page, "#nachrichten .quelle.brain-quelle");
    pruefe(gross(m), `${name}: Quellen-Chips unter der Antwort (${zeig(m)})`);
    m = await masse(page, "#chips-leiste .chip");
    pruefe(m.length === 5 && gross(m), `${name}: die Leiste über dem Eingabefeld – alle fünf Chips, auch „Brain füllen“ (${zeig(m.slice(-2))})`);
    await fragen(page, "Habt ihr einen Wickeltisch?");
    await antwortFertig(page);
    await page.waitForSelector('.nachricht:last-child [data-aktion="brain-luecke-eintragen"]');
    await page.click('.nachricht:last-child [data-aktion="brain-luecke-eintragen"]');
    await page.waitForSelector(".nachricht:last-child .karte-zustand a.knopf");
    await warte(450);
    m = await masse(page, "#nachrichten .nachricht:last-child .karte-zustand a");
    pruefe(gross(m), `${name}: „Ansehen“ nach „Ins Brain eintragen“ (${zeig(m)})`);
    await page.evaluate(() => document.querySelector('#chips-leiste [data-brain-start="interview"]').click());
    await page.waitForFunction(() => /Frage 1 von/.test(document.querySelector("#modus-text").textContent));
    await warte(450);
    m = await masse(page, "#nachrichten .nachricht:last-child .chip-gruppe .chip");
    pruefe(m.length === 2 && gross(m), `${name}: Interview-Chips „Überspringen“ und „Später“ (${zeig(m)})`);
    m = await masse(page, "#modus-weg");
    const pille = await page.evaluate(() => Math.round(document.querySelector("#modus-pill").getBoundingClientRect().height));
    pruefe(gross(m), `${name}: „Modus beenden“ an der Interview-Pille (${zeig(m)})`);
    waechter(pille === 34, `${name}: die Pille selbst bleibt so hoch wie bisher (${pille} px)`);
    await fragen(page, "nur privat und selbstzahler");
    await page.waitForSelector('.nachricht:last-child .brain-karte [data-aktion="brain-uebernehmen"]');
    await page.click('.nachricht:last-child .brain-karte [data-aktion="brain-spaeter"]');
    await page.waitForSelector("#modus-pill", { state: "hidden" });
    // Brain-Ansicht: Fokus-Leiste und Hinweis mit Knopf („Rückgängig“)
    await page.evaluate(() => { location.hash = "#/brain/s-telefonzeiten"; });
    await detailOffen(page, "Telefonzeiten");
    await page.evaluate(() => document.querySelector('#brain-detail [data-brain="fokus-an"]').click());
    await page.waitForSelector("#brain-fokus:not([hidden])");
    await warte(300);
    m = await masse(page, "#brain-fokus button");
    pruefe(m.length === 4 && gross(m), `${name}: Fokus-Leiste – Tiefe 1/2/3 und „Fokus beenden“ (${zeig(m)})`);
    await page.evaluate(() => document.querySelector('#brain-detail [data-brain="status"][data-wert="entwurf"]').click());
    await page.waitForSelector(".toasts .toast .knopf");
    await warte(450);
    m = await masse(page, ".toasts .toast .knopf");
    const hinweis = await page.evaluate(() => Math.round(document.querySelector(".toasts .toast").getBoundingClientRect().height));
    pruefe(gross(m), `${name}: Knopf im Hinweis („Rückgängig“ – ${zeig(m)})`);
    waechter(hinweis <= 56, `${name}: der Hinweis selbst bleibt so hoch wie bisher (${hinweis} px)`);
    await page.evaluate(() => document.querySelector(".toasts .toast .knopf").click());
    await page.evaluate(() => document.querySelector('#brain-detail [data-brain="detail-zu"]').click());
    await detailZu(page);
    await warte(400);
    const f = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const fo = r("#brain-fokus"); const g = r("#brain-graph"); const k = r(".brain-graph-knoepfe"); return { raus: fo.right > g.right + 0.5 || fo.left < g.left - 0.5, abstand: Math.round(fo.left - k.right), b: Math.round(fo.width) }; });
    waechter(!f.raus && f.abstand >= 4 && (await seitenBreite(page)) <= breite, `${name}: die Fokus-Leiste mit 44-px-Chips passt in die Fläche (${f.b} px breit, ${f.abstand} px neben den Zoom-Knöpfen)`);
    const klein = await page.evaluate(() => {
      const zu = [];
      for (const k of document.querySelectorAll("#ansicht-brain button, #ansicht-brain a[href], #ansicht-brain select, #ansicht-brain input:not([type=file]), #ansicht-brain summary")) {
        const r = k.getBoundingClientRect();
        if (!r.width || !r.height || k.closest("[hidden]") || k.closest("canvas")) continue;
        if (Math.min(r.width, r.height) < 43.5) zu.push(`${(k.getAttribute("aria-label") || k.textContent || "").trim().slice(0, 16)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return zu;
    });
    pruefe(klein.length === 0, `${name}: im Brain mit Fokus-Leiste kein Touch-Ziel unter 44 px${klein.length ? ` (${klein.slice(0, 4).join(" | ")})` : ""}`);
    waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 6: Liste – Fokus ins Detail und zurück
// ---------------------------------------------------------------------------
async function fund6(browser, motor) {
  {
    const name = `${motor} Fund 6 · 1440 px`;
    const ctx = await kontext(browser, { breite: 1440 });
    const { page, konsole } = await demoSeite(ctx, "#/brain/liste");
    await page.waitForSelector("#brain-liste:not([hidden]) .brain-zeile");
    const zeile = (titel) => page.evaluate((t) => { [...document.querySelectorAll("#brain-liste .brain-zeile")].find((x) => x.querySelector("strong").textContent === t).focus(); }, titel);
    await zeile("Akupunktur");
    await page.keyboard.press("Enter");
    await detailOffen(page, "Akupunktur");
    await warte(200);
    pruefe(await fokusAuf(page, "#brain-detail-titel"), `${name}: Enter auf einer Zeile öffnet das Detail, der Fokus steht auf dem Titel (${await aktiv(page)})`);
    // der Fokus steht im Detail (hier bewusst auf „Fokus“ gesetzt): Esc führt zurück auf dieselbe Zeile
    await page.focus('#brain-detail [data-brain="fokus-an"]');
    await page.keyboard.press("Escape");
    await detailZu(page);
    await warte(200);
    pruefe(await page.evaluate(() => { const a = document.activeElement; return Boolean(a && a.matches("#brain-liste a.brain-zeile") && a.querySelector("strong").textContent === "Akupunktur"); }), `${name}: Esc im Detail schließt es, der Fokus steht wieder auf der Zeile „Akupunktur“ (${await aktiv(page)})`);
    await zeile("Akupunktur");
    await page.keyboard.press("Enter");
    await detailOffen(page, "Akupunktur");
    await page.focus('#brain-detail [data-brain="detail-zu"]');
    await page.keyboard.press("Enter");
    await detailZu(page);
    await warte(200);
    pruefe(await page.evaluate(() => { const a = document.activeElement; return Boolean(a && a.matches("#brain-liste a.brain-zeile") && a.querySelector("strong").textContent === "Akupunktur"); }), `${name}: „Details schließen“ per Tastatur führt ebenfalls auf die Zeile zurück (${await aktiv(page)})`);
    // Screenreader (VoiceOver, TalkBack) lösen click aus, kein Enter
    await page.evaluate(() => { [...document.querySelectorAll("#brain-liste .brain-zeile")].find((x) => x.querySelector("strong").textContent === "Osteopathie").click(); });
    await detailOffen(page, "Osteopathie");
    await warte(200);
    pruefe(await fokusAuf(page, "#brain-detail-titel"), `${name}: auch ein click ohne Tastatur (Screenreader) setzt den Fokus auf den Titel (${await aktiv(page)})`);
    await page.click('#brain-liste .brain-zeile:has-text("Sensopro")');
    await detailOffen(page, "Sensopro");
    await warte(200);
    pruefe((await fokusAuf(page, "#brain-detail-titel")) && !(await mitRing(page)), `${name}: Mausklick – Fokus auf dem Titel, ohne Fokusring (${await aktiv(page)})`);
    waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    const name = `${motor} Fund 6 · 390 px`;
    const ctx = await kontext(browser, { breite: 390 });
    const { page } = await demoSeite(ctx, "#/brain/liste");
    await page.waitForSelector("#brain-liste:not([hidden]) .brain-zeile");
    await page.tap('#brain-liste .brain-zeile:has-text("Akupunktur")');
    await detailOffen(page, "Akupunktur");
    await warte(400);
    const drin = await fokusAuf(page, "#brain-detail-titel");
    await page.tap('#brain-detail [data-brain="detail-zu"]');
    await detailZu(page);
    await warte(300);
    const zurueck = await page.evaluate(() => { const a = document.activeElement; return Boolean(a && a.matches("#brain-liste a.brain-zeile") && a.querySelector("strong").textContent === "Akupunktur"); });
    pruefe(drin && zurueck && !(await mitRing(page)), `${name}: Tipp auf eine Zeile – Fokus im Blatt (Titel: ${drin}); Schließen – zurück auf der Zeile (${zurueck}), ohne Fokusring`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 7: Fokus nach Aktionen, Leseposition im Detail, Ansagen
// ---------------------------------------------------------------------------
async function fund7(browser, motor) {
  const rumpf = (page) => page.evaluate(() => { const r = document.querySelector("#brain-detail .brain-detail-rumpf"); return { top: Math.round(r.scrollTop), max: Math.round(r.scrollHeight - r.clientHeight) }; });
  const nachUnten = (page) => page.evaluate(() => { const r = document.querySelector("#brain-detail .brain-detail-rumpf"); r.scrollTop = r.scrollHeight; });
  const probeEintrag = (page, titel) => page.evaluate(async (t) => {
    const b = window.GabiBrainAnsicht.aktuell.brain;
    const r = await b.anlegen({ art: "praxiswissen", titel: t, inhalt: Array.from({ length: 14 }, (_, i) => `Absatz ${i + 1}: Text zum Scrollen in der Detailansicht.`).join("\n\n"), tags: [], status: "entwurf", quelle: "Test" });
    await b.aendern(r.knoten.id, { quelle: "Test 2" }); // eine frühere Fassung für den Verlauf
    return r.knoten.id;
  }, titel);
  {
    const name = `${motor} Fund 7 · 1440 px`;
    const ctx = await kontext(browser, { breite: 1440 });
    const { page, konsole } = await demoSeite(ctx, "#/brain/liste");
    await page.waitForSelector("#brain-liste:not([hidden]) .brain-zeile");
    const menue = async (aktion) => {
      await page.focus("#brain-mehr");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#brain-menue:not([hidden])");
      await page.evaluate((a) => document.querySelector(`#brain-menue [data-brain="${a}"]`).focus(), aktion);
      await page.keyboard.press("Enter");
    };
    // --- Menü „Mehr“: der Menüpunkt ist beim Schließen des Dialogs versteckt – der Fokus geht auf „Mehr“ ---
    await menue("tasten");
    await page.waitForSelector("dialog.brain-tasten[open]");
    await warte(300);
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog.brain-tasten", { state: "hidden" });
    await warte(300);
    pruefe((await fokusAuf(page, "#brain-mehr")) && (await mitRing(page)), `${name}: Menü → Tastenkürzel, Esc – der Fokus steht auf „Mehr“, per Tastatur mit Ring (${await aktiv(page)})`);
    await menue("papierkorb");
    await page.waitForSelector("dialog.brain-papierkorb[open]");
    await warte(300);
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog.brain-papierkorb", { state: "hidden" });
    await warte(300);
    pruefe(await fokusAuf(page, "#brain-mehr"), `${name}: Menü → Papierkorb, Esc – Fokus auf „Mehr“ (${await aktiv(page)})`);
    const id = await probeEintrag(page, "Probe Fokus");
    await warte(250);
    await menue("rueckgaengig");
    await page.waitForFunction(() => [...document.querySelectorAll(".toasts .toast-text")].some((t) => /Rückgängig/.test(t.textContent)));
    await warte(250);
    pruefe(await fokusAuf(page, "#brain-mehr"), `${name}: Menü → Rückgängig – Fokus auf „Mehr“ (${await aktiv(page)})`);
    await menue("wiederholen");
    await page.waitForFunction(() => [...document.querySelectorAll(".toasts .toast-text")].some((t) => /Wiederholt/.test(t.textContent)));
    await toastsWeg(page);
    // nach Klicken mit der Maus: Fokus zurück auf „Mehr“, aber ohne Ring (Safari gäbe ihn sonst mit Ring zurück)
    await page.click("#brain-mehr");
    await page.waitForSelector("#brain-menue:not([hidden])");
    await page.click('#brain-menue [data-brain="tasten"]');
    await page.waitForSelector("dialog.brain-tasten[open]");
    await warte(300);
    await page.click('dialog.brain-tasten button[value="ok"]');
    await page.waitForSelector("dialog.brain-tasten", { state: "hidden" });
    await warte(350);
    pruefe((await fokusAuf(page, "#brain-mehr")) && !(await mitRing(page)), `${name}: dasselbe mit der Maus – Fokus auf „Mehr“, ohne Fokusring (${await aktiv(page)})`);

    // --- Detail: Leseposition und Fokus bleiben, wenn derselbe Eintrag neu gezeichnet wird ---
    await page.evaluate((i) => { location.hash = `#/brain/${i}`; }, id);
    await detailOffen(page, "Probe Fokus");
    await warte(350);
    // Verbindung anlegen (Enter im Feld bzw. auf „Verbinden“)
    await page.fill("#brain-kante-ziel", "Leistungen");
    await nachUnten(page);
    let vor = await rumpf(page);
    await page.focus(motor === "webkit" ? '.brain-kante-form button[type="submit"]' : "#brain-kante-ziel");
    await page.keyboard.press("Enter");
    await page.waitForSelector('#brain-detail [data-brain="kante-weg"]');
    await warte(250);
    let nach = await rumpf(page);
    pruefe((await fokusAuf(page, "#brain-kante-ziel")) && vor.top > 100 && nach.top >= vor.top - 2 && /Leistungen/.test(await ansagen(page)) && (await toastTexte(page)).length === 0,
      `${name}: „Verbinden“ – Fokus zurück im Feld (${await aktiv(page)}), das Detail bleibt an seiner Stelle (scrollTop ${vor.top} → ${nach.top}), angesagt ohne Toast („${await ansagen(page)}“)`);
    await page.fill("#brain-kante-ziel", "Team");
    await page.focus('.brain-kante-form button[type="submit"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll('#brain-detail [data-brain="kante-weg"]').length === 2);
    await warte(200);
    // Verbindung entfernen: Fokus auf die Verbindung, die jetzt an ihrer Stelle steht
    await nachUnten(page);
    vor = await rumpf(page);
    await page.focus('#brain-detail [data-brain="kante-weg"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll('#brain-detail [data-brain="kante-weg"]').length === 1);
    await warte(250);
    nach = await rumpf(page);
    pruefe((await fokusAuf(page, "#brain-detail .brain-verbindungen a")) && nach.top >= Math.min(vor.top, nach.max) - 2 && nach.top > 100 && /entfernt/.test(await ansagen(page)),
      `${name}: Verbindung entfernen – Fokus auf der nächsten Verbindung (${await aktiv(page)}), Leseposition bleibt (${vor.top} → ${nach.top}), angesagt („${await ansagen(page)}“)`);
    await page.focus('#brain-detail [data-brain="kante-weg"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector('#brain-detail [data-brain="kante-weg"]'));
    await warte(250);
    pruefe(await fokusAuf(page, "#brain-kante-ziel"), `${name}: letzte Verbindung entfernt – Fokus im Feld für eine neue (${await aktiv(page)})`);
    // Fassung wiederherstellen
    await page.evaluate(() => { document.querySelector("#brain-verlauf summary").click(); });
    await page.waitForSelector('#brain-verlauf [data-brain="version-holen"]');
    const fassungen = await page.$$eval(".brain-versionen li", (l) => l.length);
    await nachUnten(page);
    vor = await rumpf(page);
    await page.focus('#brain-verlauf [data-brain="version-holen"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dialog-frage[open]");
    await warte(150);
    await page.evaluate(() => document.querySelector("#frage-ja").focus());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll(".toasts .toast-text")].some((t) => /wiederhergestellt/.test(t.textContent)));
    await page.waitForFunction((n) => document.querySelectorAll(".brain-versionen li").length === n + 1, fassungen); // die bisherige Fassung liegt jetzt im Verlauf
    await warte(300);
    nach = await rumpf(page);
    pruefe((await fokusAuf(page, '#brain-verlauf [data-brain="version-holen"]')) && vor.top > 100 && nach.top >= vor.top - 2 && (await page.$$eval("#brain-verlauf .skelett", (s) => s.length)) === 0,
      `${name}: Fassung wiederherstellen – Fokus bleibt auf „Wiederherstellen“ (${await aktiv(page)}), Leseposition bleibt (${vor.top} → ${nach.top})`);
    await toastsWeg(page);
    // Status ändern (von unten): das Detail springt nicht an den Anfang
    await nachUnten(page);
    vor = await rumpf(page);
    await page.evaluate(() => document.querySelector('#brain-detail [data-brain="status"][data-wert="bestaetigt"]').click());
    await page.waitForFunction(() => document.querySelector('#brain-detail [data-brain="status"][data-wert="bestaetigt"]').getAttribute("aria-checked") === "true");
    await warte(200);
    nach = await rumpf(page);
    pruefe(vor.top > 100 && nach.top >= vor.top - 2, `${name}: Status ändern – das Detail springt nicht an den Anfang (scrollTop ${vor.top} → ${nach.top})`);
    await toastsWeg(page);
    // ein anderer Eintrag beginnt oben; ein Verweis-Chip im Detail nimmt den Fokus mit auf den neuen Titel
    await page.evaluate(() => { location.hash = "#/brain/s-telefonzeiten"; });
    await detailOffen(page, "Telefonzeiten");
    await warte(200);
    waechter((await rumpf(page)).top === 0, `${name}: ein anderer Eintrag beginnt oben (scrollTop ${(await rumpf(page)).top})`);
    await page.focus("#brain-detail .brain-teil a.quelle");
    const ziel = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press("Enter");
    await detailOffen(page, ziel);
    await warte(200);
    pruefe(await fokusAuf(page, "#brain-detail-titel"), `${name}: ein Verweis-Chip im Detail öffnet „${ziel}“ – der Fokus steht auf dem neuen Titel (${await aktiv(page)})`);

    // --- Löschen: in der Liste auf die Zeile, die jetzt an der Stelle steht ---
    await page.evaluate((i) => { location.hash = `#/brain/${i}`; }, id);
    await detailOffen(page, "Probe Fokus");
    const danach = await page.evaluate((i) => { const z = [...document.querySelectorAll("#brain-liste a.brain-zeile")]; const n = z.findIndex((a) => a.getAttribute("href") === `#/brain/${i}`); return z[n + 1] ? z[n + 1].querySelector("strong").textContent : ""; }, id);
    await page.focus('#brain-detail [data-brain="loeschen"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dialog-frage[open]");
    await warte(150);
    await page.evaluate(() => document.querySelector("#frage-ja").focus());
    await page.keyboard.press("Enter");
    await detailZu(page);
    await warte(350);
    pruefe(Boolean(danach) && (await page.evaluate((t) => { const a = document.activeElement; return Boolean(a && a.matches("#brain-liste a.brain-zeile") && a.querySelector("strong").textContent === t); }, danach)),
      `${name}: Löschen (bestätigt) in der Liste – Fokus auf der Zeile, die jetzt an der Stelle steht („${danach}“; ist: ${await aktiv(page)})`);
    await toastsWeg(page);
    // --- Filter zurücksetzen: Fokus auf „Filter“, der neue Stand wird angesagt ---
    await page.focus('#brain-filter [data-brain="filter-art"][data-wert="frage"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector('#brain-filter [data-brain="filter-weg"]');
    await page.focus('#brain-filter [data-brain="filter-weg"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector('#brain-filter [data-brain="filter-weg"]'));
    await warte(200);
    pruefe((await fokusAuf(page, "#brain-filter-knopf")) && /\d+ Einträge$/.test(await ansagen(page)) && (await toastTexte(page)).length === 0, `${name}: „Filter zurücksetzen“ – Fokus auf „Filter“ (${await aktiv(page)}), angesagt ohne Toast („${await ansagen(page)}“)`);
    // --- Lücke verwerfen: Fokus auf die Karte, die jetzt an der Stelle steht ---
    await page.evaluate(() => { location.hash = "#/brain/luecken"; });
    await page.waitForSelector('#brain-luecken [data-brain="luecke-verwerfen"]');
    const vorher = await page.$$eval("#brain-luecken .brain-luecke", (l) => l.length);
    await page.focus('#brain-luecken [data-brain="luecke-verwerfen"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll("#brain-luecken .brain-luecke").length < n, vorher);
    await warte(250);
    pruefe((await fokusAuf(page, "#brain-luecken .brain-luecke")) && /Lücke verworfen/.test(await ansagen(page)) && (await toastTexte(page)).length === 0, `${name}: Lücke verwerfen (${vorher} → ${vorher - 1}) – Fokus auf der nächsten Karte (${await aktiv(page)}), angesagt ohne Toast („${await ansagen(page)}“)`);
    // --- Löschen im Graphen: Fokus in die Zeichenfläche ---
    const id2 = await probeEintrag(page, "Probe Graph");
    await page.evaluate(() => { location.hash = "#/brain/graph"; });
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    await page.evaluate((i) => { location.hash = `#/brain/${i}`; }, id2);
    await detailOffen(page, "Probe Graph");
    await page.focus('#brain-detail [data-brain="loeschen"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dialog-frage[open]");
    await warte(150);
    await page.evaluate(() => document.querySelector("#frage-ja").focus());
    await page.keyboard.press("Enter");
    await detailZu(page);
    await warte(350);
    pruefe(await fokusAuf(page, "canvas.brain-graph-flaeche"), `${name}: Löschen (bestätigt) im Graphen – Fokus in der Zeichenfläche (${await aktiv(page)})`);
    waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    // Touch-Gerät: nach „Verbinden“ nicht ins Eingabefeld (klappte die Tastatur auf) – auf die neue Zeile
    const name = `${motor} Fund 7 · 390 px`;
    const ctx = await kontext(browser, { breite: 390 });
    const { page } = await demoSeite(ctx, "#/brain/liste");
    await page.waitForSelector("#brain-liste:not([hidden]) .brain-zeile");
    const id = await probeEintrag(page, "Probe Handy");
    await page.evaluate((i) => { location.hash = `#/brain/${i}`; }, id);
    await detailOffen(page, "Probe Handy");
    await warte(450);
    await page.fill("#brain-kante-ziel", "Leistungen");
    await nachUnten(page);
    const vor = await rumpf(page);
    await page.tap('.brain-kante-form button[type="submit"]');
    await page.waitForSelector('#brain-detail [data-brain="kante-weg"]');
    await warte(300);
    const nach = await rumpf(page);
    pruefe((await fokusAuf(page, "#brain-detail .brain-verbindungen a")) && vor.top > 100 && nach.top >= vor.top - 2, `${name}: „Verbinden“ am Touch-Gerät – Fokus auf der neuen Zeile, nicht im Eingabefeld (${await aktiv(page)}); das Blatt zeigt weiter die Verbindungen (scrollTop ${vor.top} → ${nach.top})`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 8: Esc im Editor
// ---------------------------------------------------------------------------
async function fund8(browser, motor) {
  const name = `${motor} Fund 8 · 1440 px`;
  const ctx = await kontext(browser, { breite: 1440 });
  const { page, konsole } = await demoSeite(ctx, "#/brain/s-telefonzeiten");
  await page.waitForSelector('#brain-detail:not([hidden]) [data-brain="bearbeiten"]');
  const frageOffen = () => page.evaluate(() => document.querySelector("#dialog-frage").open);
  const formDa = () => page.evaluate(() => Boolean(document.querySelector("#brain-detail:not([hidden]) .brain-form")));
  // ohne Änderung: Esc beendet das Bearbeiten, der Fokus steht auf dem Titel
  await page.click('#brain-detail [data-brain="bearbeiten"]');
  await page.waitForSelector("#brain-inhalt");
  await page.focus("#brain-inhalt");
  await page.keyboard.press("Escape");
  await warte(400);
  pruefe(!(await formDa()) && (await fokusAuf(page, "#brain-detail-titel")), `${name}: Esc ohne Änderung beendet das Bearbeiten, der Fokus steht auf dem Titel (${await aktiv(page)})`);
  // mit Änderung: die Rückfrage bleibt offen
  await page.click('#brain-detail [data-brain="bearbeiten"]');
  await page.waitForSelector("#brain-inhalt");
  await page.focus("#brain-inhalt");
  await page.keyboard.press("End");
  await page.keyboard.type(" Zusatz zum Testen.");
  await warte(150);
  await page.keyboard.press("Escape");
  await warte(600); // der alte Stand schloss die Rückfrage nach 1–12 ms wieder
  const offen = await frageOffen();
  pruefe(offen && (await page.textContent("#frage-titel")) === "Änderungen verwerfen?" && (await fokusAuf(page, "#frage-nein")), `${name}: Esc mit ungespeicherter Änderung – die Rückfrage „Änderungen verwerfen?“ bleibt offen (offen: ${offen}, Fokus ${await aktiv(page)})`);
  if (offen) {
    await page.keyboard.press("Escape");
    await warte(400);
    waechter(!(await frageOffen()) && (await formDa()) && (await fokusAuf(page, "#brain-inhalt")) && (await page.inputValue("#brain-inhalt")).includes(" Zusatz zum Testen."), `${name}: ein zweites Esc heißt „Weiter bearbeiten“ – zurück im Textfeld, das Getippte bleibt (${await aktiv(page)})`);
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dialog-frage[open]");
    await page.click("#frage-ja");
  } else {
    await page.click('.brain-form-knoepfe [data-brain="bearbeiten-abbrechen"]');
    await page.waitForSelector("#dialog-frage[open]");
    await page.click("#frage-ja");
  }
  await warte(450);
  pruefe(offen && !(await formDa()) && (await fokusAuf(page, "#brain-detail-titel")), `${name}: Esc → „Verwerfen“ – das Formular ist weg, der Fokus steht auf dem Titel (${await aktiv(page)})`);
  // neuer Eintrag ohne offenes Detail: Esc führt zurück auf „Neu“
  await page.evaluate(() => { location.hash = "#/brain/liste"; });
  await page.waitForSelector("#brain-liste:not([hidden]) .brain-zeile");
  await page.focus('.brain-werkzeuge [data-brain="neu"]');
  await page.keyboard.press("Enter");
  await page.waitForSelector('.brain-form [name="titel"]');
  await warte(150);
  await page.keyboard.press("Escape");
  await warte(400);
  pruefe(!(await formDa()) && (await fokusAuf(page, '.brain-werkzeuge [data-brain="neu"]')), `${name}: „Neu“ → Esc – das Formular ist weg, der Fokus steht wieder auf „Neu“ (${await aktiv(page)})`);
  // die [[-Vorschläge fangen Esc weiter selbst ab (kein Verlassen des Editors)
  await page.focus('.brain-werkzeuge [data-brain="neu"]');
  await page.keyboard.press("Enter");
  await page.waitForSelector("#brain-inhalt");
  await page.fill('.brain-form [name="titel"]', "Probe Esc");
  await page.focus("#brain-inhalt");
  await page.keyboard.type("Siehe [[Leist");
  await page.waitForSelector("#brain-vorschlaege:not([hidden]) .brain-vorschlag");
  await page.keyboard.press("Escape");
  await warte(300);
  waechter((await formDa()) && !(await frageOffen()) && (await page.evaluate(() => document.querySelector("#brain-vorschlaege").hidden)), `${name}: Esc in den [[-Vorschlägen schließt nur die Vorschläge – der Editor bleibt, keine Rückfrage`);
  await page.click('.brain-form-knoepfe [data-brain="bearbeiten-abbrechen"]');
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-ja");
  waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Fund 9: Kontrast der Platzhalter
// ---------------------------------------------------------------------------
const KONTRAST = () => {
  const zahl = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); const [r, g, b, a = "1"] = m[1].split(/[,\s/]+/).filter(Boolean); return { r: +r, g: +g, b: +b, a: +a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ueber = (o, u) => ({ r: o.r * o.a + u.r * (1 - o.a), g: o.g * o.a + u.g * (1 - o.a), b: o.b * o.a + u.b * (1 - o.a), a: 1 });
  const grund = (el) => { const kette = []; for (let e = el; e; e = e.parentElement) kette.push(zahl(getComputedStyle(e).backgroundColor)); let u = { r: 255, g: 255, b: 255, a: 1 }; for (const k of kette.reverse()) u = ueber(k, u); return u; };
  const aus = [];
  for (const f of document.querySelectorAll("#ansicht-brain input[placeholder], #ansicht-brain textarea[placeholder], dialog[open] input[placeholder]")) {
    if (!f.getClientRects().length || f.type === "file" || f.disabled) continue;
    const st = getComputedStyle(f, "::placeholder");
    const hinten = grund(f);
    const vorn = ueber({ ...zahl(st.color), a: zahl(st.color).a * parseFloat(st.opacity || "1") }, hinten);
    const [x, y] = [lum(vorn), lum(hinten)].sort((p, q) => q - p);
    aus.push({ feld: f.placeholder, k: Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 });
  }
  return aus;
};
async function fund9(browser, motor) {
  for (const schema of ["light", "dark"]) {
    const name = `${motor} Fund 9 · ${schema === "dark" ? "Dunkel" : "Hell"}`;
    const ctx = await kontext(browser, { breite: 1440, schema });
    const { page } = await demoSeite(ctx, "#/brain/s-telefonzeiten");
    await page.waitForSelector("#brain-detail:not([hidden]) #brain-kante-ziel");
    await warte(350);
    const felder = await page.evaluate(KONTRAST);
    await page.click('#brain-detail [data-brain="bearbeiten"]');
    await page.waitForSelector('.brain-form [name="tags"]');
    await page.fill('.brain-form [name="tags"]', "");
    await page.fill('.brain-form [name="quelle"]', "");
    felder.push(...(await page.evaluate(KONTRAST)));
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForSelector("dialog.brain-palette[open]");
    await warte(350);
    felder.push(...(await page.evaluate(KONTRAST)).filter((f) => /Befehl/.test(f.feld)));
    const je = [...new Map(felder.map((f) => [f.feld, f.k])).entries()];
    pruefe(je.length === 5 && je.every(([, k]) => k >= 4.5), `${name}: Platzhalter der fünf Brain-Felder mit mindestens 4,5:1 (${je.map(([f, k]) => `„${f}“ ${k}`).join(" · ")})`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 10: Trefferzahl und leere Zustände im Graphen
// ---------------------------------------------------------------------------
const GRAPH_STAND = () => {
  const q = (s) => document.querySelector(s);
  const sichtbar = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const r = (el) => { if (!sichtbar(el)) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, o: b.top, u: b.bottom }; };
  const ueber = (a, b) => Boolean(a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.o < b.u - 0.5 && b.o < a.u - 0.5);
  const graph = r(q("#brain-graph"));
  const c = q("canvas.brain-graph-flaeche");
  const st = q("#brain-graph-stand");
  const stand = r(st);
  const teile = { "Zoom-Knöpfe": r(q(".brain-graph-knoepfe")), "Fokus-Leiste": r(q("#brain-fokus")), Legende: r(q("#brain-legende")), Minimap: r(q(".brain-graph-karte")) };
  // Text, der in der Fläche zu lesen ist (ohne Legende, Knöpfe, Fokus-Leiste und den Ersatzinhalt des Canvas)
  const text = [...q("#brain-graph").querySelectorAll("*")].filter((x) => x.children.length === 0 && sichtbar(x) && !x.closest("canvas, .brain-legende, .brain-graph-knoepfe, .brain-fokus, .unsichtbar") && x.textContent.trim()).map((x) => x.textContent.trim()).join(" | ");
  const knopf = st ? st.querySelector('[data-brain="filter-weg"]') : null;
  const k = r(knopf);
  const detail = r(q("#brain-detail"));
  return {
    text, ansage: q("#brain-ansage").textContent, flaeche: `${c.clientWidth}×${c.clientHeight}`, graphOben: Math.round(graph.o), graphH: Math.round(graph.u - graph.o),
    inDerFlaeche: Boolean(stand && stand.l >= graph.l - 0.5 && stand.r <= graph.r + 0.5 && stand.o >= graph.o - 0.5 && stand.u <= graph.u + 0.5),
    ueberdeckt: stand ? Object.entries(teile).filter(([, x]) => ueber(stand, x)).map(([n]) => n) : [],
    unterDetail: Boolean(stand && detail && innerWidth >= 1024 && ueber(stand, detail)),
    knopf: k ? { imBild: k.l >= 0 && k.r <= innerWidth && k.o >= 0 && k.u <= innerHeight, h: Math.round(k.u - k.o) } : null,
    sichtbareKnoten: window.GabiBrainAnsicht.aktuell.brain.knoten().filter((x) => { const o = window.GabiBrainAnsicht.aktuell.ort(x.id); return o && o.sichtbar; }).length,
  };
};
async function fund10(browser, motor) {
  for (const breite of [390, 1440]) {
    const name = `${motor} Fund 10 · ${breite} px`;
    const touch = breite < 1024;
    const ctx = await kontext(browser, { breite });
    const { page, konsole } = await demoSeite(ctx, "#/brain/graph");
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    await graphRuht(page);
    const ruhe = await page.evaluate(GRAPH_STAND);
    const suchen = async (begriff) => { await page.fill("#brain-suche", begriff); await warte(450); };
    // Suche mit Treffern
    await suchen("zeiten");
    const n = await page.evaluate(() => window.GabiBrainAnsicht.aktuell.brain.suchen("zeiten", { limit: 80 }).length);
    let s = await page.evaluate(GRAPH_STAND);
    const zahl = `${n} Treffer für „zeiten“`;
    pruefe(n > 1 && s.text === zahl && s.ansage === zahl, `${name}: Suche mit Treffern – die Zahl steht im Graphen („${s.text}“) und wird angesagt („${s.ansage}“)`);
    pruefe(s.inDerFlaeche && s.ueberdeckt.length === 0, `${name}: die Einblendung liegt in der Fläche und überdeckt nichts${s.ueberdeckt.length ? ` (überdeckt: ${s.ueberdeckt.join(", ")})` : ""}`);
    waechter(s.flaeche === ruhe.flaeche && s.graphOben === ruhe.graphOben && s.graphH === ruhe.graphH, `${name}: die Zeichenfläche behält dabei Größe und Lage (${ruhe.flaeche} → ${s.flaeche}, oben ${ruhe.graphOben} → ${s.graphOben}) – kein Ruck beim Suchen`);
    // dieselben Texte wie in der Liste
    await page.evaluate(() => { location.hash = "#/brain/liste"; });
    await page.waitForSelector("#brain-liste:not([hidden]) .brain-liste-kopf .suche-hinweis");
    const inListe = (await page.textContent(".brain-liste-kopf .suche-hinweis")).trim();
    await page.evaluate(() => { location.hash = "#/brain/graph"; });
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    await warte(200);
    pruefe(inListe === zahl && (await page.evaluate(GRAPH_STAND)).text === inListe, `${name}: derselbe Text wie in der Kopfzeile der Liste („${inListe}“)`);
    // Suche ohne Treffer
    await suchen("qqqxyz");
    s = await page.evaluate(GRAPH_STAND);
    pruefe(/Nichts gefunden/.test(s.text) && /Dazu steht nichts im Brain\./.test(s.text) && /Nichts gefunden/.test(s.ansage), `${name}: Suche ohne Treffer – leerer Zustand im Graphen („${s.text}“), angesagt („${s.ansage}“)`);
    pruefe(s.inDerFlaeche && s.ueberdeckt.length === 0 && s.flaeche === ruhe.flaeche, `${name}: die Karte liegt in der Fläche und überdeckt weder Zoom-Knöpfe noch Legende oder Minimap${s.ueberdeckt.length ? ` (überdeckt: ${s.ueberdeckt.join(", ")})` : ""}`);
    await suchen("");
    s = await page.evaluate(GRAPH_STAND);
    pruefe(s.text === "" && /\d+ Einträge$/.test(s.ansage), `${name}: Suche geleert – die Einblendung ist weg, der Stand wird angesagt („${s.ansage}“)`);
    // Filter ohne Einträge: Persona + Veraltet
    await page.evaluate(() => document.querySelector('#brain-filter [data-brain="filter-art"][data-wert="persona"]').click());
    await page.evaluate(() => document.querySelector("#brain-filter-knopf").click());
    await page.waitForSelector('#brain-filter-mehr [data-brain="filter-sonder"][data-wert="veraltet"]');
    await page.evaluate(() => document.querySelector('#brain-filter-mehr [data-brain="filter-sonder"][data-wert="veraltet"]').click());
    await warte(500);
    s = await page.evaluate(GRAPH_STAND);
    pruefe(s.sichtbareKnoten === 0 && /Kein Eintrag passt zu diesen Filtern\./.test(s.text) && /Filter zurücksetzen/.test(s.text), `${name}: Filter ohne Einträge – statt einer leeren Fläche steht dort „${s.text}“`);
    pruefe(Boolean(s.knopf) && s.knopf.imBild && s.knopf.h >= (touch ? 43.5 : 36), `${name}: „Filter zurücksetzen“ steht im leeren Zustand selbst${touch ? " – am Handy im Bild, 44 px hoch" : ""} (${JSON.stringify(s.knopf)})`);
    if (s.knopf) { if (touch) await page.tap('#brain-graph-stand [data-brain="filter-weg"]'); else await page.click('#brain-graph-stand [data-brain="filter-weg"]'); } else await page.evaluate(() => document.querySelector('[data-brain="filter-weg"]').click());
    await warte(350);
    s = await page.evaluate(GRAPH_STAND);
    pruefe(Boolean(s.sichtbareKnoten >= 53) && s.text === "" && (await fokusAuf(page, "#brain-filter-knopf")), `${name}: der Knopf setzt die Filter zurück – alle ${s.sichtbareKnoten} Knoten wieder da, Fokus auf „Filter“ (${await aktiv(page)})`);
    await page.evaluate(() => { if (document.querySelector("#brain-filter-mehr")) document.querySelector("#brain-filter-knopf").click(); });
    // Fokus-Modus und Suche zugleich: Leiste und Trefferzahl stehen untereinander
    const id = await idVon(page, "Gibt es an den Standorten Parkplätze – und sind die Praxen barrierefrei?");
    await page.evaluate((i) => { location.hash = `#/brain/${i}`; }, id);
    await page.waitForSelector('#brain-detail:not([hidden]) [data-brain="fokus-an"]');
    await page.evaluate(() => document.querySelector('#brain-detail [data-brain="fokus-an"]').click());
    await page.waitForSelector("#brain-fokus:not([hidden])");
    await suchen("praxis");
    s = await page.evaluate(GRAPH_STAND);
    if (!touch) pruefe(/Treffer für „praxis“/.test(s.text) && s.ueberdeckt.length === 0 && !s.unterDetail, `${name}: Fokus-Modus, Suche und offenes Detail – Trefferzahl unter der Fokus-Leiste, links neben der Detail-Spalte${s.ueberdeckt.length ? ` (überdeckt: ${s.ueberdeckt.join(", ")})` : ""}`);
    await page.evaluate(() => document.querySelector('#brain-detail [data-brain="detail-zu"]').click());
    await detailZu(page);
    await warte(400);
    s = await page.evaluate(GRAPH_STAND);
    pruefe(/Treffer für „praxis“/.test(s.text) && s.inDerFlaeche && s.ueberdeckt.length === 0, `${name}: Fokus-Modus und Suche – Fokus-Leiste und Trefferzahl stehen untereinander, nichts überdeckt sich${s.ueberdeckt.length ? ` (überdeckt: ${s.ueberdeckt.join(", ")})` : ""}`);
    waechter((await seitenBreite(page)) <= breite, `${name}: kein seitliches Scrollen`);
    waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    // 1024 px: die Detail-Spalte ist hier am schmalsten – Fokus-Leiste und Trefferzahl bleiben daneben erreichbar
    const name = `${motor} Fund 10 · 1024 px`;
    const ctx = await kontext(browser, { breite: 1024, hoehe: 768 });
    const { page } = await demoSeite(ctx, "#/brain/graph");
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    const id = await idVon(page, "Gibt es an den Standorten Parkplätze – und sind die Praxen barrierefrei?");
    await page.evaluate((i) => { location.hash = `#/brain/${i}`; }, id);
    await page.waitForSelector('#brain-detail:not([hidden]) [data-brain="fokus-an"]');
    await page.click('#brain-detail [data-brain="fokus-an"]');
    await page.waitForSelector("#brain-fokus:not([hidden])");
    await page.fill("#brain-suche", "praxis");
    await warte(600);
    const s = await page.evaluate(GRAPH_STAND);
    const x = await page.evaluate(() => { const k = document.querySelector('[data-brain="fokus-aus"]'); const r = k.getBoundingClientRect(); const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(oben && (oben === k || k.contains(oben))); });
    pruefe(x && /Treffer für „praxis“/.test(s.text) && !s.unterDetail && s.ueberdeckt.length === 0, `${name}: mit offenem Detail bleibt „Fokus beenden“ erreichbar (${x}), die Trefferzahl steht daneben${s.ueberdeckt.length ? ` (überdeckt: ${s.ueberdeckt.join(", ")})` : ""}`);
    const legende = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const l = r("#brain-legende"); const k = r(".brain-graph-knoepfe"); return { frei: l.top >= k.bottom - 0.5 || l.left >= k.right - 0.5, offen: document.querySelector("#brain-legende").open }; });
    waechter(legende.frei, `${name}: die Legende reicht nicht in die Zoom-Knöpfe (bei dieser Höhe ${legende.offen ? "offen" : "zugeklappt"})`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 11: Laden und Fehlerzustand
// ---------------------------------------------------------------------------
/** Die Ablage öffnet erst nach `ms` – und scheitert, solange window.__kaputt gesetzt ist. */
const BREMSE = (ms) => {
  let modul;
  Object.defineProperty(window, "GabiBrainSpeicher", {
    configurable: true,
    get() { return modul; },
    set(v) {
      const echt = v.oeffnen;
      modul = { ...v, oeffnen: (...a) => new Promise((ok, nein) => setTimeout(() => { if (window.__kaputt) nein(new Error("Probe: Ablage gesperrt")); else echt(...a).then(ok, nein); }, ms)) };
    },
  });
};
/** Je Bild: wo die Bühne beginnt, wie hoch Kopf, Reiter und Arten-Zeile sind, ob der Platzhalter steht. */
const LADEN_MESSEN = () => {
  window.__bilder = [];
  const bild = () => {
    const q = (s) => document.querySelector(s);
    const h = (el) => (el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().height) : 0);
    const ansicht = q("#ansicht-brain");
    if (ansicht && !ansicht.hidden && q("#brain-buehne")) {
      const neu = q('.brain-werkzeuge [data-brain="neu"]');
      const skelett = q("#brain-zustand .brain-skelett");
      window.__bilder.push({ buehne: Math.round(q("#brain-buehne").getBoundingClientRect().top), kopf: h(q("#brain-gesundheit")), reiter: h(q("#brain-reiter")), filter: h(q("#brain-filter")), laedt: Boolean(skelett && skelett.getClientRects().length), neuBlass: neu.disabled || Number(getComputedStyle(neu).opacity) < 1 });
    }
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
};
async function fund11(browser, motor) {
  for (const breite of [390, 320, 1440]) {
    const name = `${motor} Fund 11 · ${breite} px`;
    const ctx = await kontext(browser, { breite, hoehe: breite === 320 ? 568 : 0 });
    await ctx.addInitScript(BREMSE, 700);
    await ctx.addInitScript(LADEN_MESSEN);
    const page = await ctx.newPage();
    const konsole = [];
    page.on("pageerror", (e) => konsole.push(e.message));
    await page.goto(`${basis}/?demo=1#/brain/graph`);
    await page.waitForFunction(BEREIT, null, { timeout: 30000 });
    await page.waitForSelector("#brain-graph:not([hidden]) canvas.brain-graph-flaeche");
    await warte(400);
    const b = await page.evaluate(() => window.__bilder);
    const laedt = b.filter((x) => x.laedt);
    const fertig = b[b.length - 1];
    const letzter = laedt[laedt.length - 1] || {};
    const lagen = [...new Set(b.map((x) => x.buehne))];
    pruefe(laedt.length >= 10 && lagen.length === 1 && letzter.kopf === fertig.kopf && letzter.reiter === fertig.reiter && letzter.filter === fertig.filter,
      `${name}: der Platzhalter steht in Echt-Höhe (${laedt.length} Bilder lang zu sehen) – die Bühne beginnt immer bei y ${lagen.join(" → ")}; Kopf ${letzter.kopf} → ${fertig.kopf}, Reiter ${letzter.reiter} → ${fertig.reiter}, Arten-Zeile ${letzter.filter} → ${fertig.filter}`);
    waechter(!laedt.some((x) => x.neuBlass), `${name}: beim Laden wird nichts ausgegraut („Neu“ sieht in jedem Bild aus wie immer – kein Aufblitzen)`);
    waechter(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    // ein Tipp, während das Brain lädt, geht nicht verloren
    const name = `${motor} Fund 11 · Tipp beim Laden`;
    const ctx = await kontext(browser, { breite: 390 });
    await ctx.addInitScript(BREMSE, 1500);
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/brain/graph`);
    await page.waitForSelector("#brain-zustand .brain-skelett");
    await warte(200);
    await page.tap('.brain-werkzeuge [data-brain="neu"]');
    const waehrend = await page.evaluate(() => ({ geladen: Boolean(window.GabiBrainAnsicht.aktuell.brain), form: Boolean(document.querySelector("#brain-detail:not([hidden]) .brain-form")) }));
    await page.waitForFunction(BEREIT, null, { timeout: 30000 });
    await warte(500);
    pruefe(!waehrend.geladen && !waehrend.form && (await page.evaluate(() => Boolean(document.querySelector("#brain-detail:not([hidden]) .brain-form")))), `${name}: „Neu“ beim Laden angetippt – sobald das Brain da ist, geht der Editor auf`);
    await ctx.close();
    const ctx2 = await kontext(browser, { breite: 1440 });
    await ctx2.addInitScript(BREMSE, 1500);
    const page2 = await ctx2.newPage();
    await page2.goto(`${basis}/?demo=1#/brain/graph`);
    await page2.waitForSelector("#brain-zustand .brain-skelett");
    await warte(200);
    const reiter = await page2.$$eval("#brain-reiter .brain-reiter-knopf", (r) => r.length);
    if (reiter) await page2.click('#brain-reiter [data-wert="liste"]');
    await page2.waitForFunction(BEREIT, null, { timeout: 30000 });
    await warte(500);
    pruefe(reiter === 4 && (await page2.evaluate(() => location.hash === "#/brain/liste" && !document.querySelector("#brain-liste").hidden)), `${name}: die Reiter stehen schon beim Laden da (${reiter}); „Liste“ angeklickt – nach dem Laden ist die Liste offen`);
    await ctx2.close();
  }
  {
    // Fehlerzustand: angesagt, Werkzeuge sichtbar gesperrt, Platzhalter stehen still; „Nochmal versuchen“ führt den Fokus
    const name = `${motor} Fund 11 · Fehlerzustand`;
    const ctx = await kontext(browser, { breite: 390 });
    await ctx.addInitScript(BREMSE, 150);
    await ctx.addInitScript(() => { window.__kaputt = true; });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/brain/graph`);
    await page.waitForSelector("#brain-zustand .leer");
    await warte(400);
    const f = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const z = q("#brain-zustand .leer");
      const sk = q("#brain-gesundheit .skelett");
      const nach = sk ? getComputedStyle(sk, "::after") : null;
      return {
        alert: Boolean(z.closest('[role="alert"]')), text: z.innerText.replace(/\n+/g, " "),
        gesperrt: [q("#brain-suche"), q("#brain-filter-knopf"), q('.brain-werkzeuge [data-brain="neu"]'), q("#brain-mehr"), ...document.querySelectorAll(".brain-reiter-knopf")].map((k) => Boolean(k.disabled)),
        schimmert: Boolean(nach && nach.content !== "none" && nach.animationName !== "none"),
      };
    });
    pruefe(f.alert && /ließ sich nicht laden/.test(f.text), `${name}: die Meldung wird angesagt (role=alert: ${f.alert})`);
    pruefe(f.gesperrt.length === 8 && f.gesperrt.every(Boolean) && !f.schimmert, `${name}: Suche, Filter, „Neu“, „Mehr“ und die Reiter sind sichtbar gesperrt (${f.gesperrt.filter(Boolean).length} von ${f.gesperrt.length}), der Kopf-Platzhalter schimmert nicht weiter (${!f.schimmert})`);
    await page.focus('[data-brain="neu-laden"]');
    await page.keyboard.press("Enter");
    await warte(60);
    const dazwischen = await fokusAuf(page, '.brain-reiter-knopf[aria-selected="true"]');
    await page.waitForSelector("#brain-zustand .leer");
    await warte(350);
    pruefe(dazwischen && (await fokusAuf(page, '[data-brain="neu-laden"]')), `${name}: „Nochmal versuchen“ – beim Laden steht der Fokus auf dem Reiter (${dazwischen}); scheitert es wieder, zurück auf dem Knopf (${await aktiv(page)})`);
    await page.evaluate(() => { window.__kaputt = false; });
    await page.focus('[data-brain="neu-laden"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(BEREIT, null, { timeout: 15000 });
    await warte(400);
    pruefe((await fokusAuf(page, '.brain-reiter-knopf[aria-selected="true"]')) && (await page.evaluate(() => !document.querySelector('.brain-werkzeuge [data-brain="neu"]').disabled && !document.querySelector("#brain-mehr").disabled && !document.querySelector("#brain-suche").disabled)),
      `${name}: klappt es, ist das Brain da – Fokus auf dem gewählten Reiter (${await aktiv(page)}), die Werkzeuge sind wieder frei`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
const ABLAUF = [["1", fund1], ["2", fund2], ["3", fund3], ["6", fund6], ["7", fund7], ["8", fund8], ["9", fund9], ["10", fund10], ["11", fund11]];
for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  try {
    for (const [nr, lauf] of ABLAUF) {
      if (!FUNDE.has(nr)) continue;
      // bricht ein Ablauf ab (ein Element kommt nicht), zählt das als rot – die übrigen Funde laufen weiter
      try { await lauf(browser, motor); } catch (e) { pruefe(false, `${motor} Fund ${nr}: Ablauf abgebrochen – ${String((e && e.message) || e).split("\n")[0]}`); }
    }
  } finally {
    await browser.close();
  }
}

console.log(`\n${gezaehlt - fehler.length} von ${gezaehlt} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot:` : "."}`);
for (const f of fehler) console.log(`  ✗ ${f}`);
if (!gezaehlt) { console.error("Keine Prüfung gelaufen."); process.exit(2); }
process.exit(fehler.length ? 1 : 0);
