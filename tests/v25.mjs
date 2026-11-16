// v2.5 – (A) „Bitte prüfen“ erledigbar, (B) Notiz per Gespräch ändern. Browser-Tests in Chromium und WebKit.
// Nur lokal, nur Demo- und Testdaten (erfundene Test-Patienten mit eigenem Kürzel je Lauf).
//  1  Matrix (Demo) je Motor × 320/390/1440 px × Hell/Dunkel: Prüfliste mit Häkchen und Zähler, erledigt durchgestrichen,
//     Änderungskarte (nur die geänderte Zeile hervorgehoben), Übernehmen ändert die Notiz, das Original-Diktat bleibt;
//     kein seitliches Scrollen; Screenshots nach <ordner>
//  2  Demo, tiefer (1440 und 390): Tastatur (Leertaste), Neuladen, automatisch erledigt durch Korrektur im Text und wieder
//     offen, Häkchen im Entwurf (bleibt nach Neuladen, wird mit der Notiz gespeichert), mehrdeutig → Nachfrage, vage →
//     freundliche Absage, Verwerfen, Kartenzustand nach Neuladen
//  3  Echter Betrieb gegen den lokalen Server (Code „test“, Demo-Assistent ohne KI, echte Worker-Routen): zwei Tabs
//     (Häkchen, Bearbeiten mit altem Stand, zweimal Übernehmen), gelöschte Notiz, inzwischen geänderte Notiz,
//     Abmelden während des Speicherns (Übernehmen und Häkchen)
// Aufruf: PLAYWRIGHT_MODUL=… node tests/v25.mjs [basis-url] [screenshot-ordner]   (Server: cd worker && npm run lokal)
//   Eingrenzen: GABI_MOTOREN=chromium,webkit  GABI_TEILE=1,2,3
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const WURZEL = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [, , basis = "http://localhost:8788", aus = join(WURZEL, "screenshots", "v25")] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Nur lokal."); process.exit(2); }
await zielPruefen(basis, { live: false });
await mkdir(aus, { recursive: true });
const liste = (name, standard) => (process.env[name] || standard).split(",").map((s) => s.trim()).filter(Boolean);
const MOTOREN = liste("GABI_MOTOREN", "chromium,webkit");
const TEILE = liste("GABI_TEILE", "1,2,3");
const CODE = "test";
const fehler = []; let n = 0;
const pruefe = (ok, t) => { n++; if (!ok) { fehler.push(t); console.log(`✗ ${t}`); } else console.log(`✓ ${t}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Hilfen ----------
async function kontext(browser, { breite, schema = "light" }) {
  const mobil = breite < 768;
  const ctx = await browser.newContext({ viewport: { width: breite, height: mobil ? 844 : 900 }, deviceScaleFactor: mobil ? 2 : 1, isMobile: mobil, hasTouch: breite < 1024, colorScheme: schema });
  await ctx.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} }, configurable: true }); } catch { /* egal */ } });
  return ctx;
}
function beobachten(page) {
  const f = [];
  page.on("pageerror", (e) => f.push(e.message));
  return f;
}
const zuBreit = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const zaehler = (page) => page.textContent(".pruefen-zaehler").then((t) => (t || "").trim());
async function antwortAbwarten(page, muster, timeout = 25000) {
  await page.waitForFunction((m) => {
    const t = [...document.querySelectorAll(".von-gabi .nachricht-text")].pop();
    return !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && t && new RegExp(m).test(t.textContent);
  }, muster, { timeout });
}
async function fragen(page, text, muster) {
  await page.fill("#eingabe-text", text);
  await page.click("#senden");
  await antwortAbwarten(page, muster);
  await warte(250);
}
async function neuesGespraech(page) {
  const laptop = page.viewportSize().width >= 1024;
  await page.click(laptop ? "#seite-neu" : "#kopf-neu");
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag", { timeout: 10000 });
}
/** Ein Abschnitt, der hängen bleibt (z. B. ein Stand ohne Prüfliste – Gegenprobe), zählt als rot; die anderen laufen weiter. */
async function sicher(name, f) { try { await f(); } catch (e) { pruefe(false, `${name}: abgebrochen – ${String(e.message || e).split("\n")[0]}`); } }
const hakenKlicken = (page, i) => page.locator(".pruef-haken").nth(i).click();
async function bearbeiten(page, abschnitt, text) {
  await page.click('[data-leser="bearbeiten"]');
  await page.fill(`textarea[data-abschnitt="${abschnitt}"]`, text);
  await page.click('[data-leser="sichern"]');
  await page.waitForSelector("[data-pruefliste]", { timeout: 10000 });
  await warte(300);
}

// echter Server: Test-Patient und Notizen direkt über die API anlegen (nur Testdaten)
async function api(pfad, { methode = "GET", body } = {}) {
  const r = await fetch(`${basis}${pfad}`, { method: methode, headers: { "X-Gabi-Zugang": CODE, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error((d && d.fehler) || `HTTP ${r.status}`), { status: r.status });
  return d;
}
let lauf = 0;
async function testNotiz() {
  // Kürzel wie „TV-4821“ (Buchstaben, Bindestrich, vier Ziffern – so erkennt es auch der Demo-Assistent); vergeben → neu
  let kuerzel, patient;
  for (let versuch = 0; !patient && versuch < 20; versuch++) {
    lauf++;
    kuerzel = `TV-${String(1000 + Math.floor(Math.random() * 9000))}`;
    try { ({ patient } = await api("/api/patienten", { methode: "POST", body: { kuerzel, pseudonym: "Testfall v2.5 (fiktiv)" } })); } catch (e) { if (e.status !== 409) throw e; }
  }
  const { notiz } = await api("/api/notizen", { methode: "POST", body: { patient_id: patient.id, rohtext: "LWS. ISG links etwas blockiert, ähm, oder rechts. Beinpresse mit dreißig Kilo.", strukturiert: {
    befund: ["ISG links oder rechts (unklar) etwas blockiert"],
    massnahmen: ["Mobilisation ISG", "Beinpresse 30 kg, 3 × 12 Wdh."],
    verlauf: ["Pat.: deutlich weniger Schmerz, NRS 2"],
    hausaufgaben: ["Unterarmstütz täglich"],
    unklar: ["Widerspruch: ISG links oder rechts blockiert", "„Isg“ als „ISG“ gelesen"],
  } } });
  return { kuerzel, patient, notiz };
}
async function anmelden(page) {
  await page.goto(`${basis}/#/`);
  await page.waitForSelector("#ansicht-zugang:not([hidden]), #ansicht-chat:not([hidden])", { timeout: 20000 });
  if (await page.isVisible("#ansicht-zugang")) {
    await page.fill("#zugang-code", CODE);
    await page.click("#zugang-weiter");
  }
  await page.waitForSelector("#ansicht-chat:not([hidden])", { timeout: 20000 });
}
async function abmelden(page, { gespraecheLoeschen = true } = {}) {
  const laptop = page.viewportSize().width >= 1024;
  if (laptop) await page.click("#seite-einstellungen");
  else { await page.click("#kopf-menue"); await page.waitForSelector("#schublade[open]"); await warte(350); await page.click("#schublade-einstellungen"); }
  await page.waitForSelector("#dialog-einstellungen[open]");
  await page.click("#einstellungen-abmelden");
  await page.waitForSelector("#dialog-frage[open]");
  if (gespraecheLoeschen) await page.check("#frage-haken");
  await page.click("#frage-ja");
}

const NOTIZ_TP03 = "7e3c1a52-0302-4000-8000-000000000302"; // Demo: ISG-Widerspruch + Korrekturmeldung
const NOTIZ_TP01 = "7e3c1a52-0102-4000-8000-000000000102"; // Demo: Beinpresse 30 kg

// ---------------------------------------------------------------------------------------------------------------
// 1 Matrix
// ---------------------------------------------------------------------------------------------------------------
async function matrix(browser, motor, breite, schema) {
  const wo = `${motor} ${schema === "dark" ? "dunkel" : "hell"} ${breite}`;
  const ctx = await kontext(browser, { breite, schema });
  const page = await ctx.newPage();
  const f = beobachten(page);
  await sicher(`${wo}: Prüfliste`, async () => {
  await page.goto(`${basis}/?demo=1#/notizen/n/${NOTIZ_TP03}`);
  await page.waitForSelector("[data-pruefliste]", { timeout: 20000 });
  await warte(350);
  const vorher = await zaehler(page);
  const zeilen = await page.locator(".pruefpunkt").count();
  await hakenKlicken(page, 1);
  await page.waitForFunction(() => /1 von 2/.test(document.querySelector(".pruefen-zaehler").textContent));
  const st = await page.evaluate(() => {
    const li = document.querySelectorAll(".pruefpunkt")[1];
    const label = li.querySelector(".pruef-haken").getBoundingClientRect();
    return { erledigt: li.classList.contains("erledigt"), strich: getComputedStyle(li.querySelector(".pruef-text")).textDecorationLine, haken: li.querySelector("input").checked, hoehe: Math.round(label.height) };
  });
  const minHoehe = breite < 1024 ? 44 : 24;
  pruefe(vorher === "0 von 2 erledigt" && zeilen === 2 && st.erledigt && st.haken && /line-through/.test(st.strich) && st.hoehe >= minHoehe,
    `${wo}: Prüfliste – „${vorher}“ → „1 von 2 erledigt“, Punkt durchgestrichen (${st.strich}), Häkchen gesetzt, Zielfläche ${st.hoehe} px (≥ ${minHoehe})`);
  pruefe((await zuBreit(page)) <= 0, `${wo}: Notiz mit Prüfliste ohne seitliches Scrollen`);
  await page.screenshot({ path: join(aus, `${motor}-${schema === "dark" ? "dunkel" : "hell"}-${breite}-pruefliste.jpg`), type: "jpeg", quality: 82 });
  });

  await sicher(`${wo}: Änderungsvorschlag`, async () => {
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
  await fragen(page, "Ändere bei TP-01 die Beinpresse auf 35 kg", "Übernehmen");
  await page.waitForSelector(".karte-aenderung");
  const karte = await page.evaluate(() => {
    const k = document.querySelector(".karte-aenderung");
    return { geaendert: k.querySelectorAll(".diff-zeile.geaendert").length, gleich: k.querySelectorAll(".diff-zeile.gleich").length, teile: [...k.querySelectorAll("mark.diff-teil")].map((m) => m.textContent), knoepfe: [...k.querySelectorAll(".karte-fuss button")].map((b) => b.textContent.trim()), hinweis: (k.querySelector(".karte-hinweis") || {}).textContent };
  });
  pruefe(karte.geaendert === 1 && karte.gleich === 1 && karte.teile.join("|") === "30|35" && karte.knoepfe.join("|") === "Übernehmen|Verwerfen" && /Original-Diktat bleibt unverändert/.test(karte.hinweis || ""),
    `${wo}: Änderungskarte – nur die geänderte Zeile hervorgehoben (${karte.teile.join(" → ")}), unveränderte leise daneben, Knöpfe ${karte.knoepfe.join(" / ")}`);
  await page.locator(".karte-aenderung").scrollIntoViewIfNeeded();
  await page.evaluate(() => { const k = document.querySelector(".karte-aenderung"); window.scrollBy(0, k.getBoundingClientRect().top - (innerWidth < 1024 ? 76 : 24)); });
  await warte(300);
  pruefe((await zuBreit(page)) <= 0, `${wo}: Gespräch mit Änderungskarte ohne seitliches Scrollen`);
  await page.screenshot({ path: join(aus, `${motor}-${schema === "dark" ? "dunkel" : "hell"}-${breite}-vorschlag.jpg`), type: "jpeg", quality: 82 });
  await page.click('[data-aktion="aenderung-uebernehmen"]');
  await page.waitForSelector(".karte-aenderung.erledigt", { timeout: 10000 });
  await page.goto(`${basis}/?demo=1#/notizen/n/${NOTIZ_TP01}`);
  await page.waitForSelector(".leser .abschnitte");
  const notiz = await page.evaluate(() => ({ text: document.querySelector(".leser .abschnitte").textContent, diktat: (document.querySelector(".leser .original p") || {}).textContent || "" }));
  pruefe(notiz.text.includes("Beinpresse 35 kg, 3 × 12 Wdh.") && !notiz.text.includes("Beinpresse 30 kg") && /Beinpresse mit 30 Kilo/.test(notiz.diktat),
    `${wo}: Übernehmen ändert genau die Zeile, das Original-Diktat bleibt („…Beinpresse mit 30 Kilo…“)`);
  });
  pruefe(!f.length, `${wo}: keine Skriptfehler${f.length ? ` (${f.join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------
// 2 Demo, tiefer
// ---------------------------------------------------------------------------------------------------------------
async function demoTief(browser, motor, breite) {
  const wo = `${motor} ${breite} Demo`;
  const ctx = await kontext(browser, { breite });
  const page = await ctx.newPage();
  const f = beobachten(page);
  await sicher(`${wo}: Prüfliste`, async () => {
  await page.goto(`${basis}/?demo=1#/notizen/n/${NOTIZ_TP03}`);
  await page.waitForSelector("[data-pruefliste]", { timeout: 20000 });
  // Tastatur: Fokus auf das zweite Häkchen, Leertaste
  if (breite >= 1024) {
    await page.focus('input[data-pruefpunkt="„Isg“ als „ISG“ gelesen"]');
    await page.keyboard.press("Space");
    await page.waitForFunction(() => /1 von 2/.test(document.querySelector(".pruefen-zaehler").textContent));
    const fokus = await page.evaluate(() => document.activeElement && document.activeElement.dataset.pruefpunkt);
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement.nextElementSibling).outlineStyle);
    pruefe(fokus === "„Isg“ als „ISG“ gelesen" && ring !== "none", `${wo}: Tastatur – Leertaste hakt ab, Fokus bleibt auf dem Häkchen (Ring ${ring})`);
  } else {
    await hakenKlicken(page, 1);
    await page.waitForFunction(() => /1 von 2/.test(document.querySelector(".pruefen-zaehler").textContent));
  }
  await warte(400);
  await page.reload();
  await page.waitForSelector("[data-pruefliste]");
  await warte(300);
  pruefe((await zaehler(page)) === "1 von 2 erledigt" && await page.isChecked('input[data-pruefpunkt="„Isg“ als „ISG“ gelesen"]'), `${wo}: Häkchen bleibt nach Neuladen`);
  // automatisch erledigt und wieder offen
  await bearbeiten(page, "befund", "ISG links etwas blockiert");
  const auto = await page.evaluate(() => { const li = document.querySelector(".pruefpunkt.auto"); return li ? { text: li.textContent, an: li.querySelector("input").checked, aus: li.querySelector("input").disabled } : null; });
  pruefe((await zaehler(page)) === "2 von 2 erledigt" && auto && auto.an && auto.aus && /im Text korrigiert/.test(auto.text) && await page.isVisible(".abschnitt.pruefen.alles-erledigt"),
    `${wo}: „(unklar)“ im Text entfernt → Widerspruch von selbst erledigt („im Text korrigiert“), 2 von 2`);
  await bearbeiten(page, "befund", "ISG links oder rechts (unklar) etwas blockiert");
  pruefe((await zaehler(page)) === "1 von 2 erledigt" && !(await page.locator(".pruefpunkt.auto").count()), `${wo}: wieder mit „(unklar)“ markiert → wieder offen (1 von 2)`);
  pruefe((await zuBreit(page)) <= 0, `${wo}: Notiz ohne seitliches Scrollen`);

  });
  await sicher(`${wo}: Prüfliste im Entwurf`, async () => {
  // Häkchen im Entwurf: bleibt nach Neuladen, wird mit der Notiz gespeichert
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
  await fragen(page, "Notiz für TP-02: Schulter links, Abduktion bis 140 Grad, Außenrotation mit Theraband, zu Hause weiter pendeln.", "Speichern");
  await page.waitForSelector(".karte-entwurf [data-pruefliste]");
  await page.locator(".karte-entwurf .pruef-haken").first().click();
  await page.waitForFunction(() => /1 von 1/.test(document.querySelector(".karte-entwurf .pruefen-zaehler").textContent));
  await warte(500);
  await page.reload();
  await page.waitForSelector(".karte-entwurf [data-pruefliste]", { timeout: 15000 });
  const nachLaden = await page.textContent(".karte-entwurf .pruefen-zaehler");
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt", { timeout: 10000 });
  const id = await page.getAttribute('.karte-entwurf.erledigt a[href^="#/notizen/n/"]', "href");
  await page.goto(`${basis}/?demo=1${id}`);
  await page.waitForSelector("[data-pruefliste]");
  pruefe(/1 von 1/.test(nachLaden) && (await zaehler(page)) === "1 von 1 erledigt", `${wo}: Häkchen im Entwurf bleibt nach Neuladen (${nachLaden.trim()}) und wird mit der Notiz gespeichert`);

  });
  await sicher(`${wo}: Änderungsvorschläge`, async () => {
  // Vorschläge: mehrdeutig, vage, Verwerfen, Neuladen – in einem neuen Gespräch
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await neuesGespraech(page);
  await fragen(page, "Ändere bei TP-01 die Flexion auf 110 Grad.", "Welche meinst du");
  const t1 = await page.evaluate(() => [...document.querySelectorAll(".von-gabi .nachricht-text")].pop().textContent);
  pruefe(!(await page.locator(".karte-aenderung").count()) && /in 2 Notizen/.test(t1) && /Vorbereitete Antwort ohne KI \(Demo-Modus\)/.test(t1), `${wo}: mehrdeutig (zwei Notizen) → Nachfrage mit Datum und Zeile, keine Karte, als vorbereitete Antwort gekennzeichnet`);
  await fragen(page, "Mach es besser", "Das ändere ich so nicht");
  pruefe(!(await page.locator(".karte-aenderung").count()), `${wo}: „Mach es besser“ → freundliche Absage mit Nachfrage, keine Karte`);
  await fragen(page, "Ändere bei TP-01 in der letzten Notiz die Flexion auf 115 Grad", "Übernehmen");
  await page.click('[data-aktion="aenderung-verwerfen"]');
  await page.waitForSelector(".karte-aenderung.verworfen");
  await warte(400);
  await page.reload();
  await page.waitForSelector(".karte-aenderung.verworfen", { timeout: 15000 });
  await page.goto(`${basis}/?demo=1#/notizen/n/${NOTIZ_TP01}`);
  await page.waitForSelector(".leser .abschnitte");
  pruefe((await page.textContent(".leser .abschnitte")).includes("Flexion Knie rechts bis 110°"), `${wo}: Verwerfen – Notiz unverändert, „verworfen“ bleibt nach Neuladen`);
  });
  pruefe(!f.length, `${wo}: keine Skriptfehler${f.length ? ` (${f.join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------
// 3 Echter Betrieb (lokaler Server)
// ---------------------------------------------------------------------------------------------------------------
async function echt(browser, motor) {
  const wo = `${motor} echt`;
  // a) zwei Tabs: Häkchen
  await sicher(`${wo}: zwei Tabs Häkchen`, async () => {
    const { notiz } = await testNotiz();
    const ctx = await kontext(browser, { breite: 1440 });
    const a = await ctx.newPage(); const fa = beobachten(a);
    await anmelden(a);
    const b = await ctx.newPage(); const fb = beobachten(b);
    for (const p of [a, b]) { await p.goto(`${basis}/#/notizen/n/${notiz.id}`); await p.waitForSelector("[data-pruefliste]", { timeout: 20000 }); }
    await hakenKlicken(a, 0);
    await a.waitForFunction(() => /1 von 2/.test(document.querySelector(".pruefen-zaehler").textContent));
    await warte(600);
    await hakenKlicken(b, 1); // b zeigt noch den alten Stand
    await warte(800);
    for (const p of [a, b]) { await p.reload(); await p.waitForSelector("[data-pruefliste]"); }
    const server = (await api(`/api/notizen/${notiz.id}`)).notiz.strukturiert.pruefung || [];
    pruefe((await zaehler(a)) === "2 von 2 erledigt" && (await zaehler(b)) === "2 von 2 erledigt" && server.filter((e) => e.erledigt).length === 2,
      `${wo}: zwei Tabs haken verschiedene Punkte ab – beide bleiben (Server: ${server.filter((e) => e.erledigt).length} erledigt)`);
    // b) Bearbeiten mit altem Stand behält ein Häkchen aus dem anderen Tab
    await hakenKlicken(a, 1); // A nimmt Punkt 2 zurück …
    await a.waitForFunction(() => /1 von 2/.test(document.querySelector(".pruefen-zaehler").textContent));
    await warte(500);
    await b.click('[data-leser="bearbeiten"]'); // … B bearbeitet mit dem Stand „2 von 2“ und ändert nur den Verlauf
    await b.fill('textarea[data-abschnitt="verlauf"]', "Pat.: deutlich weniger Schmerz, NRS 1");
    await b.click('[data-leser="sichern"]');
    await b.waitForSelector("[data-pruefliste]");
    await warte(400);
    const nachher = (await api(`/api/notizen/${notiz.id}`)).notiz;
    const st = (nachher.strukturiert.pruefung || []).filter((e) => e.erledigt).map((e) => e.punkt);
    pruefe(nachher.strukturiert.verlauf[0] === "Pat.: deutlich weniger Schmerz, NRS 1" && st.length === 1 && st[0].startsWith("Widerspruch") && nachher.rohtext.startsWith("LWS."),
      `${wo}: Bearbeiten in Tab B mit altem Stand – die zurückgenommene Markierung aus Tab A bleibt zurückgenommen, Diktat unverändert`);
    pruefe(!fa.length && !fb.length, `${wo}: zwei Tabs (Häkchen) ohne Skriptfehler${[...fa, ...fb].length ? ` (${[...fa, ...fb].join(" | ")})` : ""}`);
    await ctx.close();
  });
  // c) zwei Tabs: zweimal Übernehmen = eine Änderung
  await sicher(`${wo}: zwei Tabs Übernehmen`, async () => {
    const { kuerzel, notiz } = await testNotiz();
    const ctx = await kontext(browser, { breite: 1440 });
    const a = await ctx.newPage(); const fa = beobachten(a);
    await anmelden(a);
    await fragen(a, `Ändere bei ${kuerzel} die Beinpresse auf 35 kg`, "Übernehmen");
    await a.waitForFunction(() => /^#\/gespraech\//.test(location.hash));
    await warte(500);
    const hash = await a.evaluate(() => location.hash);
    const b = await ctx.newPage(); const fb = beobachten(b);
    await b.goto(`${basis}/${hash}`);
    await b.waitForSelector(".karte-aenderung", { timeout: 20000 });
    await a.click('[data-aktion="aenderung-uebernehmen"]');
    await a.waitForSelector(".karte-aenderung.erledigt", { timeout: 10000 });
    await warte(400);
    if (await b.isVisible('[data-aktion="aenderung-uebernehmen"]')) await b.click('[data-aktion="aenderung-uebernehmen"]').catch(() => {});
    await b.waitForSelector(".karte-aenderung.erledigt", { timeout: 10000 });
    const m = (await api(`/api/notizen/${notiz.id}`)).notiz.strukturiert.massnahmen;
    pruefe(m.join("|") === "Mobilisation ISG|Beinpresse 35 kg, 3 × 12 Wdh.", `${wo}: dieselbe Karte in zwei Tabs übernommen – genau eine Änderung (${m.join(" · ")}), beide zeigen „übernommen“`);
    pruefe(!fa.length && !fb.length, `${wo}: zwei Tabs (Übernehmen) ohne Skriptfehler${[...fa, ...fb].length ? ` (${[...fa, ...fb].join(" | ")})` : ""}`);
    await ctx.close();
  });
  // d) gelöschte Notiz und e) inzwischen geänderte Notiz
  await sicher(`${wo}: gelöschte/geänderte Notiz`, async () => {
    const ctx = await kontext(browser, { breite: 390 });
    const p = await ctx.newPage(); const fp = beobachten(p);
    await anmelden(p);
    const eins = await testNotiz();
    await fragen(p, `Ändere bei ${eins.kuerzel} die Beinpresse auf 35 kg`, "Übernehmen");
    await api(`/api/notizen/${eins.notiz.id}`, { methode: "DELETE" });
    await p.locator('.karte-aenderung [data-aktion="aenderung-uebernehmen"]').last().click();
    await p.waitForSelector(".karte-aenderung .hinweis-box", { timeout: 10000 });
    pruefe(/gibt es nicht mehr/.test(await p.textContent(".karte-aenderung .hinweis-box")) && !(await p.locator('[data-aktion="aenderung-uebernehmen"]').count()), `${wo}: Notiz inzwischen gelöscht → Hinweis auf der Karte, nichts gespeichert`);
    const zwei = await testNotiz();
    await fragen(p, `Ändere bei ${zwei.kuerzel} die Beinpresse auf 35 kg`, "Übernehmen");
    await api(`/api/notizen/${zwei.notiz.id}`, { methode: "PATCH", body: { strukturiert: { ...zwei.notiz.strukturiert, massnahmen: ["Mobilisation ISG", "Beinpresse 40 kg, 3 × 10 Wdh."] }, pruefung_basis: [] } });
    await p.locator('.karte-aenderung [data-aktion="aenderung-uebernehmen"]').last().click();
    await p.waitForFunction(() => [...document.querySelectorAll(".karte-aenderung .hinweis-box")].some((h) => /passt nicht mehr/.test(h.textContent)), null, { timeout: 10000 });
    const m = (await api(`/api/notizen/${zwei.notiz.id}`)).notiz.strukturiert.massnahmen;
    pruefe(m[1] === "Beinpresse 40 kg, 3 × 10 Wdh.", `${wo}: Notiz inzwischen geändert → „passt nicht mehr“, die neuere Fassung bleibt (${m[1]})`);
    pruefe((await zuBreit(p)) <= 0 && !fp.length, `${wo}: 390 px ohne seitliches Scrollen, keine Skriptfehler${fp.length ? ` (${fp.join(" | ")})` : ""}`);
    await ctx.close();
  });
  // f) Abmelden während des Speicherns: Übernehmen
  await sicher(`${wo}: Abmelden beim Übernehmen`, async () => {
    const { kuerzel, notiz } = await testNotiz();
    const ctx = await kontext(browser, { breite: 1440 });
    const p = await ctx.newPage(); const fp = beobachten(p);
    await anmelden(p);
    await fragen(p, `Ändere bei ${kuerzel} die Beinpresse auf 35 kg`, "Übernehmen");
    let patchStart = 0, patchEnde = 0;
    await p.route(`**/api/notizen/${notiz.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      patchStart = Date.now(); await warte(2500); await route.continue(); patchEnde = Date.now();
    });
    await p.click('[data-aktion="aenderung-uebernehmen"]');
    await p.waitForFunction(() => true);
    for (let i = 0; i < 40 && !patchStart; i++) await warte(50);
    await abmelden(p);
    await p.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 30000 });
    const zugangDa = Date.now();
    const m = (await api(`/api/notizen/${notiz.id}`)).notiz.strukturiert.massnahmen;
    pruefe(patchStart > 0 && zugangDa >= patchEnde && m[1] === "Beinpresse 35 kg, 3 × 12 Wdh.", `${wo}: Abmelden während „Übernehmen“ – wartet auf das Speichern (${patchEnde - patchStart} ms), die Änderung ist gespeichert`);
    pruefe(!(await p.evaluate(() => localStorage.getItem("gabi.zugang"))) && !fp.length, `${wo}: danach abgemeldet, Code weg, keine Skriptfehler${fp.length ? ` (${fp.join(" | ")})` : ""}`);
    await ctx.close();
  });
  // g) Abmelden während des Speicherns: Häkchen
  await sicher(`${wo}: Abmelden beim Häkchen`, async () => {
    const { notiz } = await testNotiz();
    const ctx = await kontext(browser, { breite: 1440 });
    const p = await ctx.newPage(); const fp = beobachten(p);
    await anmelden(p);
    await p.goto(`${basis}/#/notizen/n/${notiz.id}`);
    await p.waitForSelector("[data-pruefliste]", { timeout: 20000 });
    let start = 0, ende = 0;
    await p.route(`**/api/notizen/${notiz.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      start = Date.now(); await warte(2500); await route.continue(); ende = Date.now();
    });
    await hakenKlicken(p, 1);
    for (let i = 0; i < 40 && !start; i++) await warte(50);
    await abmelden(p);
    await p.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 30000 });
    const da = Date.now();
    const pr = (await api(`/api/notizen/${notiz.id}`)).notiz.strukturiert.pruefung || [];
    pruefe(start > 0 && da >= ende && pr.some((e) => e.punkt === "„Isg“ als „ISG“ gelesen" && e.erledigt), `${wo}: Abmelden während ein Häkchen gespeichert wird – wartet (${ende - start} ms), das Häkchen ist gespeichert`);
    pruefe(!fp.length, `${wo}: keine Skriptfehler${fp.length ? ` (${fp.join(" | ")})` : ""}`);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------------------------------------------
const start = Date.now();
for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  if (TEILE.includes("1")) for (const breite of [320, 390, 1440]) for (const schema of ["light", "dark"]) await sicher(`${motor} ${breite} ${schema} Matrix`, () => matrix(browser, motor, breite, schema));
  if (TEILE.includes("2")) for (const breite of [1440, 390]) await sicher(`${motor} ${breite} Demo`, () => demoTief(browser, motor, breite));
  if (TEILE.includes("3")) await sicher(`${motor} echt`, () => echt(browser, motor));
  await browser.close();
}
console.log(`\n${n - fehler.length} von ${n} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot` : "."} (${Math.round((Date.now() - start) / 1000)} s)`);
process.exit(fehler.length ? 1 : 0);
