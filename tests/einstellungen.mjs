// v2.4 – Einstellungen und Darstellung (Chromium + WebKit). Nur lokal, nur Demo- und Testdaten.
//  1  Öffnen: Laptop über „Einstellungen“ unten links in der Seitenleiste, Handy/Tablet über die Schublade (Eintrag unten,
//     im Bild); Abschnitte Darstellung, Transparenz, Konto und Gerät, Später (drei deaktivierte Zeilen „Folgt“); passt in
//     die Ansicht und nichts scrollt seitlich bei 320/390/768/1440 px
//  2  Hell / Dunkel / System: wirkt sofort ohne Neuladen (data-thema, Grundfarbe, meta theme-color), gespeichert in
//     localStorage, nach dem Neuladen wieder da; „System“ folgt dem Betriebssystem (auch während die Seite offen ist)
//  3  Kein Aufblitzen: Theme steht schon, bevor <body> existiert, und im ersten Bild (requestAnimationFrame vor dem ersten
//     Zeichnen) hat body die richtige Grundfarbe – gemessen für gespeichert „dunkel“ bei hellem System und umgekehrt
//  4  Glas-Effekt aus: Kopfzeile/Band/Dialog deckend ohne backdrop-filter; wieder an: Unschärfe; System „Bewegung
//     reduzieren“ bleibt vorrangig (Glas an, trotzdem deckend, Hinweis im Dialog)
//  5  Konto und Gerät: Version; Demo: „Mit Server verbinden“ statt „Abmelden“; echter Betrieb (lokaler Server, Code
//     „test“): „Abmelden“ öffnet die bestehende Rückfrage mit Häkchen, Abbrechen lässt angemeldet; „Alle Gespräche
//     löschen“ öffnet die bestehende Rückfrage und löscht
//  6  Tastatur: per Tastatur öffnen, Fokus bleibt im Dialog (Tab-Runde), Pfeiltasten wechseln das Schema, Escape schließt,
//     Fokus zurück auf den Öffner; am Handy schließt Escape nur die Einstellungen, die Schublade bleibt offen
// Aufruf: PLAYWRIGHT_MODUL=… node tests/einstellungen.mjs [basis-url]   (Server: cd worker && npm run lokal oder npm run brain)
//   GABI_MOTOREN=chromium,webkit
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8788"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Nur lokal."); process.exit(2); }
await zielPruefen(basis, { live: false });
const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((s) => s.trim()).filter(Boolean);
const fehler = []; let n = 0;
const pruefe = (ok, t) => { n++; if (!ok) { fehler.push(t); console.log(`✗ ${t}`); } else console.log(`✓ ${t}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const HELL = "rgb(237, 244, 250)", DUNKEL = "rgb(7, 45, 83)";

async function kontext(browser, { breite = 1440, schema = "light", ...extra } = {}) {
  const mobil = breite < 768;
  const ctx = await browser.newContext({ viewport: { width: breite, height: breite === 768 ? 1024 : mobil ? 844 : 900 }, isMobile: mobil, hasTouch: breite < 1024, colorScheme: schema, ...extra });
  await ctx.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} }, configurable: true }); } catch { /* egal */ } });
  return ctx;
}
const stand = (page) => page.evaluate(() => ({
  thema: document.documentElement.dataset.thema, wahl: document.documentElement.dataset.themaWahl, glas: document.documentElement.dataset.glas || "an",
  bg: getComputedStyle(document.body).backgroundColor, meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
  gespeichert: (() => { try { return localStorage.getItem("gabi.darstellung"); } catch { return "fehlt"; } })(),
}));
async function oeffnen(page, breite) {
  if (breite >= 1024) await page.click("#seite-einstellungen");
  else {
    await page.click("#kopf-menue");
    await page.waitForSelector("#schublade[open]");
    await warte(350);
    await page.click("#schublade-einstellungen");
  }
  await page.waitForSelector("#dialog-einstellungen[open]");
  await warte(300);
}
const zu = async (page) => { await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("#dialog-einstellungen").open); };
const wahlKlicken = (page, wert) => page.click(`#dialog-einstellungen label.segment-wahl:has(input[value="${wert}"])`);

for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();

  // 1 + 2 Öffnen, Breiten, Hell/Dunkel/System ohne Neuladen, Speichern
  for (const breite of [320, 390, 768, 1440]) {
    const ctx = await kontext(browser, { breite });
    const page = await ctx.newPage();
    const konsole = [];
    page.on("pageerror", (e) => konsole.push(e.message));
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
    const wo = `${motor} ${breite} px`;
    if (breite < 1024) {
      await page.click("#kopf-menue");
      await page.waitForSelector("#schublade[open]");
      await warte(350);
      const k = await page.evaluate(() => { const r = document.querySelector("#schublade-einstellungen").getBoundingClientRect(); return { sichtbar: r.top >= 0 && r.bottom <= innerHeight && r.height >= 40, text: document.querySelector("#schublade-einstellungen").textContent.trim() }; });
      pruefe(k.sichtbar && k.text === "Einstellungen", `${wo}: Schublade – „Einstellungen“ unten im Bild (${JSON.stringify(k)})`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#schublade").open);
      await warte(250);
    } else {
      const k = await page.evaluate(() => { const r = document.querySelector("#seite-einstellungen").getBoundingClientRect(); const s = document.querySelector("#kopf").getBoundingClientRect(); return { unten: r.bottom > s.bottom - 200, links: r.left < 280, sichtbar: r.height >= 36 }; });
      pruefe(k.unten && k.links && k.sichtbar, `${wo}: Seitenleiste – „Einstellungen“ unten links (${JSON.stringify(k)})`);
    }
    await oeffnen(page, breite);
    const d = await page.evaluate(() => {
      const dlg = document.querySelector("#dialog-einstellungen");
      const r = dlg.getBoundingClientRect();
      return {
        abschnitte: [...dlg.querySelectorAll(".einstellungen-abschnitt h3")].map((h) => h.textContent.trim()),
        spaeter: [...dlg.querySelectorAll(".einstellungen-spaeter .einstellungen-zeile")].map((z) => `${z.querySelector("strong").textContent}:${z.getAttribute("aria-disabled")}:${z.querySelector(".badge").textContent}`),
        inAnsicht: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5,
        seitlich: document.documentElement.scrollWidth - innerWidth, innenSeitlich: dlg.scrollWidth - dlg.clientWidth,
        wahl: [...dlg.querySelectorAll('input[name="thema"]')].find((x) => x.checked)?.value,
      };
    });
    pruefe(d.abschnitte.join("|") === "Darstellung|Transparenz|Konto und Gerät|Später" && d.spaeter.join("|") === "Benutzerkonto:true:Folgt|Praxis-Einstellungen:true:Folgt|Datenschutz:true:Folgt",
      `${wo}: Abschnitte und Platzhalter („Folgt“, deaktiviert)`);
    pruefe(d.inAnsicht && d.seitlich <= 0 && d.innenSeitlich <= 0, `${wo}: Dialog passt, nichts scrollt seitlich (${d.seitlich}/${d.innenSeitlich})`);
    pruefe(d.wahl === "system", `${wo}: Standard „System“`);
    await page.evaluate(() => { window.__ohneNeuladen = true; });
    await wahlKlicken(page, "dunkel");
    await warte(200);
    const s1 = await stand(page);
    await wahlKlicken(page, "hell");
    await warte(200);
    const s2 = await stand(page);
    const geblieben = await page.evaluate(() => window.__ohneNeuladen === true);
    pruefe(s1.thema === "dunkel" && s1.bg === DUNKEL && s1.meta.every((m) => m === "#072d53") && s2.thema === "hell" && s2.bg === HELL && s2.meta.every((m) => m === "#edf4fa") && geblieben,
      `${wo}: Hell/Dunkel wirkt sofort, ohne Neuladen (dunkel ${s1.bg}, hell ${s2.bg}, theme-color ${s1.meta[0]}/${s2.meta[0]})`);
    await wahlKlicken(page, "dunkel");
    await zu(page);
    await page.reload();
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    const s3 = await stand(page);
    pruefe(s3.thema === "dunkel" && s3.bg === DUNKEL && /"thema":"dunkel"/.test(s3.gespeichert || ""), `${wo}: „Dunkel“ übersteht das Neuladen (gespeichert ${s3.gespeichert})`);
    pruefe(!konsole.length, `${wo}: keine Skriptfehler${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
    await ctx.close();
  }

  // 2b „System“ folgt dem Betriebssystem, auch während die Seite offen ist
  {
    const ctx = await kontext(browser, { breite: 1440, schema: "light" });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    const a = await stand(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await warte(200);
    const b = await stand(page);
    await page.emulateMedia({ colorScheme: "light" });
    await warte(200);
    const c = await stand(page);
    pruefe(a.thema === "hell" && b.thema === "dunkel" && b.bg === DUNKEL && c.thema === "hell", `${motor}: „System“ folgt dem Betriebssystem live (${a.thema} → ${b.thema} → ${c.thema})`);
    await ctx.close();
  }

  // 3 Kein Aufblitzen: gespeicherte Wahl gegen das System
  for (const [gespeichert, system, erwartet] of [["dunkel", "light", DUNKEL], ["hell", "dark", HELL], ["system", "dark", DUNKEL]]) {
    const ctx = await kontext(browser, { breite: 390, schema: system });
    await ctx.addInitScript(([w]) => {
      try { if (!sessionStorage.getItem("test.gesetzt")) { localStorage.setItem("gabi.darstellung", JSON.stringify({ thema: w, glas: true })); sessionStorage.setItem("test.gesetzt", "1"); } } catch { /* egal */ }
      window.__frueh = [];
      // sobald <body> eingefügt wird: steht data-thema schon? (das Skript läuft, bevor es <html> gibt – darum am Dokument)
      new MutationObserver((_, b) => { if (document.body) { window.__frueh.push({ wann: "body", thema: (document.documentElement && document.documentElement.dataset.thema) || "" }); b.disconnect(); } }).observe(document, { childList: true, subtree: true });
      // erstes Bild: requestAnimationFrame läuft vor dem ersten Zeichnen
      requestAnimationFrame(() => { window.__frueh.push({ wann: "erstes Bild", thema: (document.documentElement && document.documentElement.dataset.thema) || "", bg: document.body ? getComputedStyle(document.body).backgroundColor : "", stile: document.styleSheets.length }); });
    }, [gespeichert]);
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    const f = await page.evaluate(() => window.__frueh);
    const koerper = f.find((x) => x.wann === "body");
    const bild = f.find((x) => x.wann === "erstes Bild");
    const soll = erwartet === DUNKEL ? "dunkel" : "hell";
    pruefe(koerper && koerper.thema === soll && bild && bild.thema === soll && (bild.bg === erwartet || !bild.stile),
      `${motor}: kein Aufblitzen – gespeichert „${gespeichert}“, System ${system}: Theme vor <body> „${koerper && koerper.thema}“, erstes Bild „${bild && bild.thema}“ ${bild && bild.bg}`);
    await ctx.close();
  }

  // 4 Glas an/aus, System vorrangig
  for (const reduziert of [false, true]) {
    const ctx = await kontext(browser, { breite: 390, schema: "light", reducedMotion: reduziert ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    const glas = () => page.evaluate(() => {
      const f = (el, p) => { const cs = getComputedStyle(el, p); const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); const t = m ? m[1].split(/[ ,/]+/).filter(Boolean).map(Number) : [0, 0, 0, 0]; return { filter: cs.backdropFilter || cs.webkitBackdropFilter || "none", alpha: t.length > 3 ? t[3] : 1 }; };
      return { kopf: f(document.querySelector(".kopf")), band: f(document.querySelector(".eingabe-bereich"), "::before"), dialog: f(document.querySelector("#dialog-einstellungen")) };
    });
    await oeffnen(page, 390);
    const vorher = await glas();
    const hinweis = await page.isVisible("#einstellungen-glas-system");
    await page.click("#einstellungen-glas");
    await warte(150);
    const aus = await glas();
    const gespeichert = await page.evaluate(() => localStorage.getItem("gabi.darstellung"));
    await page.click("#einstellungen-glas");
    await warte(150);
    const wieder = await glas();
    const deckend = (g) => Object.values(g).every((x) => x.filter === "none" && x.alpha === 1);
    const mitGlas = (g) => Object.values(g).every((x) => x.filter !== "none" && x.alpha < 1);
    if (!reduziert) {
      pruefe(mitGlas(vorher) && deckend(aus) && mitGlas(wieder) && /"glas":false/.test(gespeichert || "") && !hinweis,
        `${motor}: Glas-Effekt aus = deckend ohne Unschärfe, an = Glas (${JSON.stringify(aus.kopf)} / ${JSON.stringify(wieder.kopf)})`);
    } else {
      pruefe(deckend(vorher) && deckend(aus) && deckend(wieder) && hinweis, `${motor}: „Bewegung reduzieren“ bleibt vorrangig – Glas an, trotzdem deckend, Hinweis im Dialog`);
    }
    await ctx.close();
  }

  // 5 Konto und Gerät
  {
    // Demo
    const ctx = await kontext(browser, { breite: 1440 });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
    const version = await page.evaluate(() => document.querySelector('script[src^="app.js"]').src.split("?v=")[1]);
    await oeffnen(page, 1440);
    const d = await page.evaluate(() => ({ version: document.querySelector("#einstellungen-version").textContent, abmelden: !document.querySelector("#einstellungen-abmelden").hidden, verbinden: !document.querySelector("#einstellungen-verbinden").hidden, loeschenAus: document.querySelector("#einstellungen-alle-loeschen").disabled }));
    pruefe(d.version.includes(version) && !d.abmelden && d.verbinden && d.loeschenAus, `${motor} Demo: Version „${d.version}“, „Mit Server verbinden“ statt „Abmelden“, Löschen gesperrt ohne Gespräche`);
    await zu(page);
    // ein Gespräch anlegen, dann über die Einstellungen alle löschen (bestehende Rückfrage)
    await page.fill("#eingabe-text", "Wo sind die Standorte?");
    await page.click("#senden");
    await page.waitForFunction(() => document.querySelectorAll("#seiten-gespraeche .gespraech-eintrag").length === 1 && !document.querySelector("#senden.stoppt"), null, { timeout: 20000 });
    await oeffnen(page, 1440);
    pruefe(!(await page.isDisabled("#einstellungen-alle-loeschen")), `${motor} Demo: mit Gespräch ist „Alle Gespräche löschen“ bedienbar`);
    await page.click("#einstellungen-alle-loeschen");
    await page.waitForSelector("#dialog-frage[open]");
    const titel = await page.textContent("#frage-titel");
    const einstellungenZu = await page.evaluate(() => !document.querySelector("#dialog-einstellungen").open);
    await page.click("#frage-ja");
    await page.waitForFunction(() => /Alle Gespräche sind gelöscht/.test(document.querySelector("#toasts").textContent), null, { timeout: 10000 });
    const rest = await page.locator("#seiten-gespraeche .gespraech-eintrag").count();
    pruefe(titel === "Alle Gespräche löschen?" && einstellungenZu && rest === 0, `${motor} Demo: „Alle Gespräche löschen“ – bestehende Rückfrage („${titel}“), danach 0 Gespräche`);
    await ctx.close();
  }
  {
    // echter Betrieb gegen den lokalen Server (Zugangscode „test“, Demo-Assistent ohne KI)
    const ctx = await kontext(browser, { breite: 1440 });
    const page = await ctx.newPage();
    await page.goto(`${basis}/#/`);
    await page.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 20000 });
    await page.fill("#zugang-code", "test");
    await page.click("#zugang-weiter");
    await page.waitForSelector("#ansicht-chat:not([hidden])", { timeout: 20000 });
    await oeffnen(page, 1440);
    const sichtbar = await page.isVisible("#einstellungen-abmelden");
    await page.click("#einstellungen-abmelden");
    await page.waitForSelector("#dialog-frage[open]");
    const f = await page.evaluate(() => ({ titel: document.querySelector("#frage-titel").textContent, haken: !document.querySelector("#frage-haken-zeile").hidden, hakenText: document.querySelector("#frage-haken-text").textContent }));
    await page.click("#frage-nein");
    await page.waitForFunction(() => !document.querySelector("#dialog-frage").open);
    await warte(300);
    const nochDa = await page.evaluate(() => ({ chat: !document.querySelector("#ansicht-chat").hidden, code: Boolean(localStorage.getItem("gabi.zugang")), fokus: document.activeElement && document.activeElement.id }));
    pruefe(sichtbar && f.titel === "Abmelden?" && f.haken && /Gespräche auf diesem Gerät auch löschen/.test(f.hakenText) && nochDa.chat && nochDa.code,
      `${motor} angemeldet: „Abmelden“ öffnet die bestehende Rückfrage mit Häkchen („${f.hakenText}“), Abbrechen lässt angemeldet (Fokus auf ${nochDa.fokus})`);
    // wirklich abmelden über die Einstellungen
    await oeffnen(page, 1440);
    await page.click("#einstellungen-abmelden");
    await page.waitForSelector("#dialog-frage[open]");
    await page.click("#frage-ja");
    await page.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 20000 });
    pruefe(!(await page.evaluate(() => localStorage.getItem("gabi.zugang"))), `${motor} angemeldet: Abmelden über die Einstellungen – Zugangsseite, Code gelöscht`);
    await ctx.close();
  }

  // 6 Tastatur und Fokus
  {
    const ctx = await kontext(browser, { breite: 1440 });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
    await page.focus("#seite-einstellungen");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dialog-einstellungen[open]");
    await warte(200);
    const drin = [];
    for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); drin.push(await page.evaluate(() => document.querySelector("#dialog-einstellungen").contains(document.activeElement))); }
    // Pfeiltasten in der Gruppe „Darstellung“
    await page.focus('#dialog-einstellungen input[value="system"]');
    await page.keyboard.press("ArrowLeft");
    await warte(150);
    const nachPfeil = await stand(page);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#dialog-einstellungen").open);
    await warte(200);
    const fokus = await page.evaluate(() => document.activeElement && document.activeElement.id);
    pruefe(drin.every(Boolean), `${motor}: Fokus bleibt im Dialog (14× Tab)`);
    pruefe(nachPfeil.wahl === "dunkel" && nachPfeil.thema === "dunkel", `${motor}: Pfeiltaste wechselt das Schema (System → ${nachPfeil.wahl})`);
    pruefe(fokus === "seite-einstellungen", `${motor}: Escape schließt, Fokus zurück auf „Einstellungen“ (${fokus})`);
    await ctx.close();
  }
  {
    const ctx = await kontext(browser, { breite: 390 });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
    await oeffnen(page, 390);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#dialog-einstellungen").open);
    await warte(300);
    const s = await page.evaluate(() => ({ schublade: document.querySelector("#schublade").open, fokus: document.activeElement && document.activeElement.id }));
    pruefe(s.schublade && s.fokus === "schublade-einstellungen", `${motor} Handy: Escape schließt nur die Einstellungen, die Schublade bleibt offen (Fokus ${s.fokus})`);
    await ctx.close();
  }
  await browser.close();
}
console.log(`\n${n - fehler.length} von ${n} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot` : "."}`);
process.exit(fehler.length ? 1 : 0);
