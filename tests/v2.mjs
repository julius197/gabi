// Ende-zu-Ende-Tests für Gabi v2.1 (Gespräch + Gesprächsverlauf + Notizordner), ohne Secrets.
//  1  Demo-Modus komplett: Handy (390 px) und Laptop (1440 px), jeweils Hell und Dunkel – mit Screenshots
//     (auch Seitenleiste bzw. Schublade mit dem Gesprächsverlauf)
//  2  Robustheit: 320 px, automatisch Demo, Offline, Mikrofon verweigert, Stopp, Fehler + „Nochmal versuchen“, Vorlesen
//  2b v2.1: Schein ohne Kante (Pixelmessung, 390/768/1440, Hell/Dunkel), ruhige Wechsel (10 schnelle Runden, gezählt),
//     Gesprächsverlauf (Laptop), Schublade (Handy, 320 px), zwei Tabs, Übernahme aus v2.0
//  3  Echte lokale API (Worker-Logik, NDJSON-Strom, Spracherkennung, Speichern) – ohne KI-Schlüssel;
//     dazu: Platzhalter erst nach 150 ms, getrennte Demo-/Echt-Ablage, Abmelden mit „Gespräche auch löschen“
//  4  Safari-Engine (WebKit): Demo bis zum PDF, Gesprächsverlauf in IndexedDB
// Voraussetzung: `cd worker && npm run lokal` läuft (http://localhost:8788, Zugangscode „test“), Playwright mit Chromium + WebKit.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/v2.mjs [diktat.wav] [screenshot-ordner] [basis-url]
// Ohne diktat.wav wird auf dem Mac eine erfundene Test-Aufnahme mit `say` erzeugt (spielt nichts ab).
// GABI_LIVE=1 (basis-url = https://gabi.automatilabs.de): nur Demo- und Mock-Teile – keine Anfragen mit falschem Zugangscode
// an den Live-Worker (sonst zählt die Sperre für die eigene IP hoch) und ohne den Teil mit dem lokalen Server.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const WURZEL = resolve(fileURLToPath(new URL("..", import.meta.url)));
let [, , audio, aus = join(WURZEL, "screenshots"), basis = "http://localhost:8788"] = process.argv;
await mkdir(aus, { recursive: true });
const downloads = await mkdtemp(join(tmpdir(), "gabi-pdf-"));
if (!audio) {
  const ordner = await mkdtemp(join(tmpdir(), "gabi-audio-"));
  const aiff = join(ordner, "diktat.aiff");
  audio = join(ordner, "diktat.wav");
  execFileSync("say", ["-v", "Anna", "-o", aiff, "Knie rechts. Patientin berichtet weniger Schmerzen beim Treppensteigen, Schmerz bei drei. Flexion bis hundertfünfzehn Grad. Zwanzig Minuten Krankengymnastik am Gerät. Zu Hause weiter Bridging, dreimal fünfzehn, täglich."]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, audio]);
}

const LIVE = process.env.GABI_LIVE === "1";
const fehler = [];
const pruefe = (ok, text) => { if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function konsoleBeobachten(page) {
  const meldungen = [];
  page.on("console", (m) => {
    if (!["error", "warning"].includes(m.type())) return;
    const t = m.text();
    // WebKit blockiert unter style-src 'self' die eingebauten Stile von <select>/<input type=search> – harmlos (v1 geprüft)
    if (/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/.test(t)) return;
    if (/ERR_FAILED|net::|Failed to load resource|status of 401|status of 502/.test(t)) return; // absichtlich blockiert/abgelehnt
    meldungen.push(t);
  });
  page.on("pageerror", (e) => meldungen.push(`pageerror: ${e.message}`));
  return meldungen;
}

/** Keine echte Sprachausgabe in Testbrowsern (macOS spielt sie sonst laut ab) – nur zählen. Mit einer lokalen deutschen Stimme. */
async function stumm(ctx) {
  await ctx.addInitScript(() => {
    window.__gesprochen = 0;
    const stimmen = [{ name: "Test-Stimme", lang: "de-DE", localService: true, default: true }, { name: "Online-Stimme", lang: "de-DE", localService: false }];
    const attrappe = {
      speak(u) { window.__gesprochen++; window.__stimme = u.voice && u.voice.name; setTimeout(() => u.onend && u.onend(), 300); },
      cancel() {}, getVoices() { return stimmen; }, addEventListener() {}, removeEventListener() {}, speaking: false,
    };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.voice = null; this.lang = ""; this.rate = 1; } };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
  });
}

const letzteAntwort = (page) => page.evaluate(() => ([...document.querySelectorAll(".von-gabi .nachricht-text")].pop() || {}).textContent || "");
async function antwortAbwarten(page, muster, timeout = 20000) {
  await page.waitForFunction((m) => {
    const t = [...document.querySelectorAll(".von-gabi .nachricht-text")].pop();
    return !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && t && new RegExp(m).test(t.textContent);
  }, muster, { timeout });
}
async function fragen(page, text) {
  await page.fill("#eingabe-text", text);
  await page.click("#senden");
}
async function mikroHalten(page, ms, beimHalten) {
  const k = await page.locator("#mikro").boundingBox();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.waitForSelector(".eingabe.nimmt-auf", { timeout: 8000 });
  await warte(ms / 2);
  if (beimHalten) await beimHalten();
  await warte(ms / 2);
  await page.mouse.up();
}
async function pdfLaden(page, ausloeser, muster) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.click(ausloeser)]);
  const datei = join(downloads, d.suggestedFilename());
  await d.saveAs(datei);
  const inhalt = await readFile(datei);
  return { name: d.suggestedFilename(), ok: muster.test(d.suggestedFilename()) && inhalt.subarray(0, 4).toString() === "%PDF", kb: Math.round(inhalt.length / 1024) };
}
const breite = (page) => page.evaluate(() => document.documentElement.scrollWidth);
/** Titel in der Gesprächsliste (Laptop: Seitenleiste, Handy: Schublade). */
const listenTitel = (page, ort = "#seiten-gespraeche") => page.$$eval(`${ort} .gespraech-link`, (a) => a.map((x) => x.textContent.trim()));
const GESPRAECH_URL = /#\/gespraech\/[0-9a-f-]{36}$/;
/** Was in IndexedDB liegt (nur Titel): Datenbank „gabi“ bzw. „gabi-demo“. */
const ablageTitel = (page, db) => page.evaluate((name) => new Promise((ok) => {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => { r.transaction.abort(); };
  r.onerror = () => ok(null);
  r.onsuccess = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains("meta")) { d.close(); ok([]); return; }
    const q = d.transaction("meta").objectStore("meta").getAll();
    q.onsuccess = () => { d.close(); ok(q.result.map((m) => m.titel).sort()); };
    q.onerror = () => { d.close(); ok(null); };
  };
}), db);
const schubladeZu = (page) => page.waitForFunction(() => !document.querySelector("#schublade").open, null, { timeout: 5000 });
async function schubladeAuf(page) {
  await page.click("#kopf-menue");
  await page.waitForSelector("#schublade[open]");
  await warte(320); // Hereingleiten abwarten
}
/** Pixel eines Screenshots lesen (im Browser per Canvas – ohne Zusatzpakete). */
let pixelSeite = null;
async function pixelLesen(png) {
  if (!pixelSeite) pixelSeite = await (await chrome.newContext()).newPage();
  const px = await pixelSeite.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
  }, png.toString("base64"));
  return { ...px, at(x, y) { const i = (Math.round(y) * px.w + Math.round(x)) * 4; return [px.d[i], px.d[i + 1], px.d[i + 2]]; } };
}
const farbAbstand = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
/** Wechsel ist angekommen: das aktive Gespräch in der Liste ist das aus der Adresse (bei #/ keins). */
const angekommen = (page) => page.waitForFunction(() => {
  const id = (/^#\/gespraech\/(.+)$/.exec(location.hash) || [])[1] || "";
  const aktiv = document.querySelector("#seiten-gespraeche .gespraech-eintrag.aktiv");
  return id ? Boolean(aktiv && aktiv.dataset.gespraech === id && !document.querySelector("#ansicht-chat").hidden) : !aktiv;
}, null, { timeout: 8000 });
const ruhigWarten = (page) => page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && !document.querySelector(".eingabe.erkennt"), null, { timeout: 20000 });

const MIC = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${audio}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio"];
const chrome = await chromium.launch({ args: MIC });

// ---------------------------------------------------------------------------
// 1 Demo-Modus komplett – Handy und Laptop, Hell und Dunkel
// ---------------------------------------------------------------------------
async function demoAblauf(geraet, schema) {
  const mobil = geraet === "handy";
  const name = `${geraet}-${schema === "dark" ? "dunkel" : "hell"}`;
  const viewport = mobil ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await chrome.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 2, acceptDownloads: true, permissions: ["microphone"], colorScheme: schema });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  let serverAnfragen = 0;
  page.on("request", (r) => { if (r.url().includes("/api/")) serverAnfragen++; });
  const bild = async (nr, was, ganz = false) => {
    await warte(450); // Einblenden abwarten
    return page.screenshot({ path: join(aus, `${name}-${nr}-${was}.jpg`), type: "jpeg", quality: 88, fullPage: ganz });
  };

  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
  await page.evaluate(() => document.fonts.ready);
  pruefe((await page.textContent("#test-badge")).includes("Demo"), `${name}: Demo-Modus, Badge statt Banner`);
  pruefe((await page.locator(".vorschlag").count()) === 4, `${name}: Begrüßung mit 4 Schnellaktionen`);
  const dunkel = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  pruefe(schema === "dark" ? dunkel === "rgb(12, 18, 19)" : dunkel === "rgb(243, 243, 240)", `${name}: Farben folgen dem System (${dunkel})`);
  await bild("01", "start");

  // Diktat per Push-to-Talk
  await page.click('.vorschlag[data-schnell="diktat"]');
  await page.waitForSelector('[data-aktion="waehle"]');
  await page.click('[data-aktion="waehle"]:has-text("TP-01")');
  await page.waitForSelector("#modus-pill:not([hidden])");
  pruefe((await page.textContent("#modus-text")).startsWith("Diktat für TP-01"), `${name}: Diktat-Modus für TP-01`);
  let breiteBeiAufnahme = 0;
  await mikroHalten(page, 3000, async () => {
    breiteBeiAufnahme = await breite(page);
    await page.screenshot({ path: join(aus, `${name}-02-aufnahme.jpg`), type: "jpeg", quality: 88 });
  });
  pruefe(breiteBeiAufnahme <= viewport.width, `${name}: Aufnahme-Anzeige passt in die Breite (${breiteBeiAufnahme} px)`);
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 20000 });
  await antwortAbwarten(page, "Entwurf für TP-01");
  pruefe((await page.textContent(".karte-entwurf")).includes("Beinpresse 35 kg"), `${name}: Aufnahme → Entwurf mit Abschnitten`);
  await bild("03", "entwurf");
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt");
  await page.waitForFunction(() => /Gespeichert bei TP-01/.test(document.querySelector("#toasts").textContent));
  pruefe(await page.isHidden("#modus-pill"), `${name}: Speichern nach Bestätigung, Diktat-Modus endet`);
  await warte(350); // Hinweis eingeblendet
  const verdeckt = await page.evaluate(() => [...document.querySelectorAll("#mikro, #senden")].filter((b) => {
    const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !e || !b.contains(e);
  }).map((b) => b.id));
  pruefe(!verdeckt.length, `${name}: Hinweise verdecken weder Mikrofon noch Senden${verdeckt.length ? ` (verdeckt: ${verdeckt.join(", ")})` : ""}`);

  // Frage tippen
  await fragen(page, "Was wollte TP-01?");
  await antwortAbwarten(page, "TP-01.*gesagt");
  pruefe((await page.locator(".von-gabi").last().locator(".quelle").count()) >= 1, `${name}: Antwort aus den Notizen, mit Quellen`);
  await bild("04", "antwort");

  // Bericht über die Schnellaktion
  await page.click('#chips-leiste [data-schnell="bericht"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-02")').last().click();
  await page.locator('[data-aktion="waehle"][data-wert="verlauf"]').last().click();
  await page.waitForSelector(".karte-bericht", { timeout: 15000 });
  await antwortAbwarten(page, "Verlaufsbericht für TP-02");
  pruefe((await page.locator(".karte-bericht .zeitpunkt").count()) === 2, `${name}: Verlaufsbericht mit 2 Einträgen`);
  await page.locator(".karte-bericht").scrollIntoViewIfNeeded();
  await bild("05", "bericht");
  const pdf = await pdfLaden(page, '[data-aktion="bericht-pdf"]', /^PhysioWorks_Bericht_TP-02_\d{4}-\d{2}-\d{2}\.pdf$/);
  pruefe(pdf.ok, `${name}: Bericht als PDF (${pdf.name}, ${pdf.kb} KB)`);

  // Heute, Praxis, keine Ratschläge
  await page.click('#chips-leiste [data-schnell="heute"]');
  await antwortAbwarten(page, "Heute ist");
  await fragen(page, "Wo sind die Standorte?");
  await antwortAbwarten(page, "Kieslingstraße 82");
  await fragen(page, "Welche Übung empfiehlst du für TP-01?");
  await antwortAbwarten(page, "Diagnosen und Empfehlungen gebe ich nicht");
  pruefe(true, `${name}: Heute-Überblick, Praxiswissen, keine Empfehlungen`);
  await bild("06", "gespraech", true);

  // Gesprächsverlauf: eigene Adresse, zweites Gespräch, Liste, Umbenennen – Screenshot der Seitenleiste bzw. Schublade
  const ersteAdresse = page.url();
  pruefe(GESPRAECH_URL.test(ersteAdresse) && (await page.title()) === "Gabi – PhysioWorks (Testversion)", `${name}: Gespräch hat eine eigene Adresse (nur die ID, kein Inhalt in Adresse oder Titel)`);
  const liste = mobil ? "#schublade-liste" : "#seiten-gespraeche";
  if (mobil) { await schubladeAuf(page); await page.click("#schublade [data-gespraech-neu]"); await schubladeZu(page); }
  else await page.click("#seite-neu");
  await page.waitForFunction(() => location.hash === "#/" && !document.querySelector("#willkommen").hidden);
  await fragen(page, "Was kostet Osteopathie?");
  await antwortAbwarten(page, "85 €");
  await fragen(page, "Wo sind die Standorte?");
  await antwortAbwarten(page, "Kieslingstraße 82");
  if (mobil) await schubladeAuf(page);
  const titel = await listenTitel(page, liste);
  pruefe(titel.length === 2 && titel[0] === "Was kostet Osteopathie?" && titel[1].startsWith("Diktat TP-01"), `${name}: „Neues Gespräch“ legt ein neues an, das alte bleibt – neuestes oben (${titel.join(" | ")})`);
  const zweiter = page.locator(`${liste} .gespraech-eintrag`).nth(1);
  if (!mobil) await zweiter.hover();
  await zweiter.locator('[data-gespraech-aktion="umbenennen"]').click();
  await page.fill(`${liste} .gespraech-feld`, "Knie TP-01 · Bericht TP-02");
  await page.press(`${liste} .gespraech-feld`, "Enter");
  await page.waitForFunction((l) => [...document.querySelectorAll(`${l} .gespraech-link`)].some((a) => a.textContent.includes("Knie TP-01 · Bericht TP-02")), liste);
  pruefe(true, `${name}: Umbenennen per Stift`);
  await page.mouse.move(5, 5);
  await bild("12", mobil ? "schublade" : "seitenleiste");
  await page.click(`${liste} .gespraech-link:has-text("Knie TP-01")`);
  if (mobil) await schubladeZu(page);
  await page.waitForFunction((a) => location.href === a, ersteAdresse);
  await angekommen(page);
  pruefe((await page.locator(".karte-bericht").count()) >= 1 && !(await page.textContent("#nachrichten")).includes("Was kostet Osteopathie"), `${name}: Wechsel zurück zeigt genau das erste Gespräch (mit Bericht, ohne die Fragen des zweiten)`);

  // Notizordner
  if (mobil) await page.click("#kopf-wechsel");
  else await page.click('.navi a[data-navi="notizen"]');
  await page.waitForSelector(".patient-karte");
  await bild("07", "notizen");
  await page.fill("#suche", "theraband");
  await page.waitForFunction(() => /2 Notizen zu „[^“]+“ gefunden/.test(document.querySelector("#ordner-inhalt").textContent));
  await page.fill("#suche", "xyzabc");
  await page.waitForSelector('#ordner-inhalt [data-ordner="suche-loeschen"]');
  await page.click('#ordner-inhalt [data-ordner="suche-loeschen"]');
  pruefe(true, `${name}: Suche mit Treffern und leerem Zustand`);
  await page.click('.patient-karte:has-text("TP-01")');
  await page.waitForSelector(".notiz-karte");
  pruefe((await page.locator(".notiz-karte").count()) === 3, `${name}: TP-01 hat jetzt 3 Notizen`);
  await page.locator(".notiz-karte").first().click();
  await page.waitForSelector('[data-leser="pdf"]');
  await bild("08", "notiz", true);
  const npdf = await pdfLaden(page, '[data-leser="pdf"]', /^PhysioWorks_TP-01_\d{4}-\d{2}-\d{2}\.pdf$/);
  pruefe(npdf.ok, `${name}: Notiz als PDF (${npdf.name})`);
  await page.click('[data-leser="bearbeiten"]');
  const feld = page.locator('textarea[data-abschnitt="verlauf"]');
  await feld.fill(`${await feld.inputValue()}\nTest: bearbeitet`);
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-nein");
  pruefe(await page.isVisible('textarea[data-abschnitt="verlauf"]'), `${name}: Wegnavigieren mit Änderungen fragt nach`);
  await page.click('[data-leser="sichern"]');
  await page.waitForFunction(() => /Test: bearbeitet/.test(document.querySelector(".leser").textContent));
  await page.click('[data-leser="loeschen"]');
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-ja");
  await page.waitForFunction(() => /Notiz gelöscht/.test(document.querySelector("#toasts").textContent));
  await page.waitForSelector(".notiz-karte");
  pruefe((await page.locator(".notiz-karte").count()) === 2, `${name}: Bearbeiten und Löschen mit Bestätigung`);
  pruefe((await breite(page)) <= viewport.width, `${name}: kein seitliches Scrollen`);
  pruefe(serverAnfragen === 0, `${name}: keine einzige Server-Anfrage im Demo-Modus`);
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();

  // Zugangsbildschirm im neuen Design (echter Server, falscher Code)
  const ctx2 = await chrome.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 2, colorScheme: schema });
  const p2 = await ctx2.newPage();
  const k2 = konsoleBeobachten(p2);
  await p2.goto(`${basis}/#/`);
  await p2.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 20000 });
  await p2.evaluate(() => document.fonts.ready);
  if (LIVE) {
    pruefe(await p2.isVisible("#zugang-code") && k2.length === 0, `${name}: Zugang – Bildschirm erscheint (echter Server bereit), keine Konsolenfehler`);
  } else {
    await p2.fill("#zugang-code", "falsch-123");
    await p2.click("#zugang-weiter");
    await p2.waitForSelector("#zugang-fehler:not([hidden])");
    pruefe((await p2.textContent("#zugang-fehler")).includes("stimmt nicht"), `${name}: Zugang – falscher Code wird verständlich abgelehnt`);
  }
  await warte(450);
  await p2.screenshot({ path: join(aus, `${name}-09-zugang.jpg`), type: "jpeg", quality: 88 });
  await ctx2.close();
}

for (const geraet of ["handy", "laptop"]) for (const schema of ["light", "dark"]) await demoAblauf(geraet, schema);

// ---------------------------------------------------------------------------
// 2 Robustheit
// ---------------------------------------------------------------------------
{ // 320 px: nirgends seitliches Scrollen, auch mit Karten
  const ctx = await chrome.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  await stumm(ctx);
  const page = await ctx.newPage();
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  const messungen = [["Start", await breite(page)]];
  await page.click('.vorschlag[data-schnell="diktat"]');
  await page.click('[data-aktion="waehle"]:has-text("TP-02")');
  await page.click('[data-aktion="beispiel"]');
  await page.waitForSelector(".karte-entwurf");
  await antwortAbwarten(page, "Entwurf für TP-02");
  messungen.push(["Entwurf", await breite(page)]);
  await page.click('#chips-leiste [data-schnell="bericht"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-03")').last().click();
  await page.locator('[data-aktion="waehle"][data-wert="zusammenfassung"]').last().click();
  await page.waitForSelector(".karte-bericht");
  await antwortAbwarten(page, "Zusammenfassung");
  messungen.push(["Bericht", await breite(page)]);
  for (const h of ["#/notizen", "#/notizen/p/7e3c1a52-0002-4000-8000-000000000002", "#/notizen/n/7e3c1a52-0202-4000-8000-000000000202"]) {
    await page.evaluate((x) => { location.hash = x; }, h);
    await warte(500);
    messungen.push([h, await breite(page)]);
  }
  pruefe(await page.isVisible("#test-badge"), "320 px: Knopf „Demo“/„Testversion“ bleibt sichtbar (Info, Abmelden)");
  const zuBreit = messungen.filter(([, b]) => b > 320);
  pruefe(!zuBreit.length, `320 px: kein seitliches Scrollen${zuBreit.length ? ` (${zuBreit.map(([w, b]) => `${w}=${b}px`).join(", ")})` : ""}`);
  await page.screenshot({ path: join(aus, "handy-320-notiz.jpg"), type: "jpeg", quality: 85, fullPage: true });
  await ctx.close();
}

for (const [fall, antwort, text] of [
  ["nicht erreichbar", (route) => route.abort("connectionrefused"), "Server nicht erreichbar"],
  ["nicht eingerichtet", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, bereit: false }) }), "noch nicht eingerichtet"],
]) {
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/api/status", antwort);
  await page.goto(`${basis}/#/`);
  if (LIVE) {
    // auf der echten Adresse nie still in die Demo: Hinweisseite mit „Demo ansehen“
    await page.waitForSelector("#ansicht-offline:not([hidden])", { timeout: 20000 });
    const titel = await page.textContent("#offline-titel");
    pruefe(await page.isVisible('#ansicht-offline a[href*="demo=1"]') && (fall === "nicht erreichbar" ? /nicht erreichbar/.test(titel) : /nicht bereit/.test(titel)),
      `Backend ${fall} (echte Adresse): Hinweisseite statt stiller Demo, mit „Demo ansehen“ („${titel}“)`);
    await ctx.close();
    continue;
  }
  await page.waitForSelector("#ansicht-chat:not([hidden])", { timeout: 20000 });
  const badge = await page.textContent("#test-badge");
  const hinweis = await page.textContent("#toasts");
  pruefe(badge.includes("Demo") && hinweis.includes(text), `Backend ${fall}: automatisch Demo-Modus mit Hinweis`);
  await ctx.close();
}

{ // Gerät mit gespeichertem Code + Server nicht eingerichtet → Hinweisseite; „Demo ansehen“ ohne Internet → Demo im selben Tab
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 } });
  await stumm(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem("gabi.zugang", "test"); } catch { /* egal */ } });
  const page = await ctx.newPage();
  await page.route("**/api/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, bereit: false }) }));
  await page.goto(`${basis}/#/`);
  await page.waitForSelector("#ansicht-offline:not([hidden])", { timeout: 20000 });
  pruefe((await page.textContent("#offline-titel")).includes("nicht bereit") && !(await page.textContent("#test-badge")).includes("Demo"),
    "Server nicht eingerichtet + gespeicherter Code: Hinweisseite statt stiller Demo");
  await ctx.setOffline(true);
  await page.click('#ansicht-offline a[href*="demo=1"]');
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag", { timeout: 10000 });
  pruefe((await page.textContent("#test-badge")).includes("Demo") && page.url().includes("demo=1"), "Ohne Internet: „Demo ansehen“ startet die Demo im selben Tab (keine Fehlerseite)");
  await ctx.setOffline(false);
  await ctx.close();
}

{ // Gerät mit gespeichertem Code + Server weg → Offline-Seite statt still Demo
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("gabi.zugang", "test"); } catch { /* egal */ } });
  const page = await ctx.newPage();
  await page.route("**/api/status", (route) => route.abort("connectionrefused"));
  await page.goto(`${basis}/#/`);
  await page.waitForSelector("#ansicht-offline:not([hidden])", { timeout: 20000 });
  pruefe((await page.textContent("#offline-titel")).includes("nicht erreichbar") && (await page.textContent("#test-badge")).includes("Testversion"), "Server weg + gespeicherter Code: Offline-Seite, kein Demo-Modus");
  await page.screenshot({ path: join(aus, "handy-hell-10-offline.jpg"), type: "jpeg", quality: 85 });
  await ctx.close();
}

{ // Mikrofon verweigert → Anleitung im Gespräch (iPhone)
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("verweigert", "NotAllowedError"));
    if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: "prompt", onchange: null });
  });
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  const k = await page.locator("#mikro").boundingBox();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.waitForSelector(".hinweis-box.warn");
  await page.mouse.up();
  const hilfe = await page.textContent(".hinweis-box.warn");
  pruefe(/Website-Einstellungen/.test(hilfe) && /Safari/.test(hilfe), "Mikrofon verweigert: iPhone-Anleitung im Gespräch");
  pruefe(konsole.length === 0, `Mikrofon verweigert: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await warte(450);
  await page.screenshot({ path: join(aus, "handy-hell-11-mikrofon-hilfe.jpg"), type: "jpeg", quality: 85 });
  await ctx.close();
}

{ // Stopp während Gabi antwortet + Vorlesen (stumm)
  const ctx = await chrome.newContext({ viewport: { width: 1440, height: 900 } });
  await stumm(ctx);
  const page = await ctx.newPage();
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  await fragen(page, "Was kann Gabi?");
  await page.waitForSelector("#senden.stoppt");
  await page.click("#senden");
  await page.waitForFunction(() => !document.querySelector("#senden.stoppt"));
  pruefe(/Abgebrochen|Gabi/.test(await letzteAntwort(page)) && !(await page.isDisabled("#mikro")), "Stopp: Antwort lässt sich abbrechen, Eingabe wieder frei");
  // „Neues Gespräch“ mitten in einer Antwort: alte Antwort taucht nicht wieder auf
  await fragen(page, "Was steht heute an?");
  await page.waitForSelector("#senden.stoppt");
  await page.click("#seite-neu");
  await page.waitForFunction(() => !document.querySelector("#senden.stoppt"));
  await warte(1500);
  pruefe((await page.locator("#nachrichten .nachricht").count()) === 0 && (await page.isVisible("#willkommen")), "Neues Gespräch während einer Antwort: leeres Gespräch, keine Reste");
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Was kann Gabi?")'); // Titel = erste Frage des Gesprächs
  await page.waitForFunction(() => /Was steht heute an\?/.test(document.querySelector("#nachrichten").textContent));
  const alt = await page.evaluate(() => ({ text: [...document.querySelectorAll(".von-gabi .nachricht-text")].pop()?.textContent || "", tippt: Boolean(document.querySelector(".von-gabi .tippen")) }));
  pruefe(!alt.tippt && alt.text.length > 0, `Abgebrochene Antwort bleibt im alten Gespräch („${alt.text.slice(0, 40)}“), ohne „Gabi schreibt“`);
  await page.click("#seite-neu");
  await page.waitForFunction(() => location.hash === "#/");
  await fragen(page, "Was kostet Osteopathie?");
  await antwortAbwarten(page, "85 €");
  await page.locator(".von-gabi").last().locator('[data-aktion="vorlesen"]').click();
  await page.waitForFunction(() => window.__gesprochen === 1);
  pruefe((await page.evaluate(() => window.__stimme)) === "Test-Stimme", "Vorlesen: nur mit lokaler deutscher Stimme (keine Online-Stimme), im Test stumm");
  await ctx.close();
}

{ // Push-to-Talk-Kanten und Neuladen (Demo, Handy)
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ["microphone"] });
  await stumm(ctx);
  await ctx.addInitScript(() => {
    // nachgebauter visualViewport: Chromium hat keine iPhone-Tastatur, die den sichtbaren Ausschnitt verschiebt
    const vv = { offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, width: innerWidth, height: innerHeight, addEventListener() {}, removeEventListener() {} };
    window.__vv = vv;
    try { Object.defineProperty(window, "visualViewport", { value: vv, configurable: true }); } catch { /* egal */ }
  });
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  const m = await page.locator("#mikro").boundingBox();
  const mx = m.x + m.width / 2;
  const my = m.y + m.height / 2;
  const zustand = () => page.evaluate(() => ({ text: document.querySelector("#aufnahme-text").textContent, verwirft: document.querySelector(".eingabe").classList.contains("verwirft") }));
  const nutzerZahl = () => page.locator(".von-nutzer").count();
  const ruhig = () => page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && !document.querySelector(".eingabe.erkennt"), null, { timeout: 20000 });

  // a) Tastatur war offen (Ausschnitt um 300 px verschoben) und schließt beim Halten: Finger bleibt, clientY wird 300 kleiner
  await page.evaluate(() => { window.__vv.offsetTop = 300; });
  const vorher = await nutzerZahl();
  await page.mouse.move(mx, my);
  await page.mouse.down();
  await page.waitForSelector(".eingabe.nimmt-auf", { timeout: 8000 });
  await page.evaluate(() => { window.__vv.offsetTop = 0; });
  await page.mouse.move(mx, my - 300, { steps: 5 });
  await warte(900);
  const z1 = await zustand();
  await page.mouse.up();
  pruefe(z1.text === "Loslassen zum Senden" && !z1.verwirft, `Push-to-Talk: schließende iPhone-Tastatur zählt nicht als Wegziehen (${z1.text})`);
  await page.waitForFunction((n) => document.querySelectorAll(".von-nutzer").length > n, vorher, { timeout: 15000 });
  await ruhig();
  pruefe(true, "Push-to-Talk: Aufnahme trotz schließender Tastatur gesendet");

  // b) echtes Wegziehen nach oben verwirft – mit „Rückgängig“
  await page.mouse.move(mx, my);
  await page.mouse.down();
  await page.waitForSelector(".eingabe.nimmt-auf", { timeout: 8000 });
  await warte(500);
  await page.mouse.move(mx, my - 200, { steps: 5 });
  await warte(500);
  const z2 = await zustand();
  await page.mouse.up();
  pruefe(z2.text === "Loslassen zum Verwerfen" && z2.verwirft, `Push-to-Talk: Wegziehen nach oben zeigt „Loslassen zum Verwerfen“ (${z2.text})`);
  await page.waitForSelector('#toasts .toast button:has-text("Rückgängig")');

  // c) „Rückgängig“, während Gabi antwortet → nicht parallel schicken, sondern als Karte parken
  await fragen(page, "Was kostet Osteopathie?");
  await page.click('#toasts .toast button:has-text("Rückgängig")');
  await page.waitForSelector('[data-aktion="aufnahme-senden"]:has-text("Jetzt senden")', { timeout: 8000 });
  pruefe(true, "Rückgängig während einer Antwort: Aufnahme wartet als Karte mit „Jetzt senden“");

  // d) nach der Antwort: „Neues Gespräch“ fragt nicht mehr (nichts geht verloren) – die Aufnahme wartet im alten Gespräch
  await page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen")
    && [...document.querySelectorAll(".von-gabi .nachricht-text")].some((t) => /85 €/.test(t.textContent)), null, { timeout: 20000 });
  const mitAufnahme = page.url();
  await page.click("#kopf-neu");
  const fragtDoch = await page.waitForSelector("#dialog-frage[open]", { timeout: 800 }).then(() => true).catch(() => false);
  if (fragtDoch) await page.click("#frage-nein");
  await page.waitForFunction(() => location.hash === "#/" && !document.querySelector("#willkommen").hidden);
  pruefe(!fragtDoch, "Neues Gespräch: keine Warnung mehr – das alte Gespräch samt Aufnahme bleibt in der Liste");
  await schubladeAuf(page);
  await page.click("#schublade-liste .gespraech-link");
  await page.waitForFunction((a) => location.href === a, mitAufnahme);
  await page.waitForSelector('[data-aktion="aufnahme-senden"]:has-text("Jetzt senden")');

  // e) „Jetzt senden“ schickt die geparkte Aufnahme (die Park-Karte steht unter der Antwort)
  const vorSenden = await nutzerZahl();
  await page.click('[data-aktion="aufnahme-senden"]:has-text("Jetzt senden")');
  await page.waitForFunction(() => /Nachgeschickt/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 15000 });
  await page.waitForFunction((n) => document.querySelectorAll(".von-nutzer").length > n, vorSenden, { timeout: 15000 });
  await ruhig();
  pruefe(true, "Geparkte Aufnahme: „Jetzt senden“ schickt sie nach");

  // f) Neuladen: Beispiel-Chip ohne Diktat-Modus gesperrt; begonnene Bearbeitung bleibt, „Abbrechen“ auch
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-02")').last().click();
  await page.waitForSelector('[data-aktion="beispiel"]:not([disabled])');
  await warte(400);
  await page.reload();
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  pruefe(await page.locator('[data-aktion="beispiel"]').last().isDisabled(), "Neuladen: Beispiel-Chip ohne Diktat-Modus gesperrt (keine Sackgasse)");
  await warte(800);
  pruefe((await page.locator(".chip-skelett").count()) === 0, "Neuladen: beantwortete Patienten-Auswahlen zeigen die Patienten, keine Platzhalter");
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-02")').last().click();
  await page.locator('[data-aktion="beispiel"]:not([disabled])').last().click();
  await page.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion=\"entwurf-bearbeiten\"]");
  await antwortAbwarten(page, "Entwurf für TP-02");
  await page.locator('[data-aktion="entwurf-bearbeiten"]').last().click();
  const feld = page.locator(".karte-entwurf textarea[data-abschnitt]").first();
  await feld.fill(`${await feld.inputValue()}\nTest: getippt vor dem Neuladen`);
  await warte(400);
  await page.reload();
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  const nachLaden = await page.locator(".karte-entwurf textarea[data-abschnitt]").first().inputValue().catch(() => "");
  pruefe(nachLaden.includes("Test: getippt vor dem Neuladen"), "Neuladen: begonnene Bearbeitung einer Entwurfskarte bleibt erhalten");
  await page.locator('[data-aktion="entwurf-abbrechen"]').last().click();
  await warte(400);
  await page.reload();
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  pruefe((await page.locator(".karte-entwurf textarea").count()) === 0 && (await page.locator('[data-aktion="entwurf-speichern"]').count()) === 1, "Neuladen: abgebrochene Bearbeitung kommt nicht zurück");
  pruefe(konsole.length === 0, `Push-to-Talk-Kanten: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

{ // Handy-Kanten (390 px): Bericht aus dem Ordner beendet den Diktat-Modus, Notiz öffnet oben, leere Zustände, „Bitte prüfen“, Info-Fokus
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  // a) Diktat-Modus für TP-01 offen, dann im Ordner „Bericht“ für TP-02 → Modus endet, nächste Frage ist kein Diktat
  await page.click('.vorschlag[data-schnell="diktat"]');
  await page.click('[data-aktion="waehle"]:has-text("TP-01")');
  await page.waitForSelector("#modus-pill:not([hidden])");
  await page.evaluate(() => { location.hash = "#/notizen/p/7e3c1a52-0002-4000-8000-000000000002"; });
  await page.click('[data-ordner="bericht"]');
  await page.waitForSelector('[data-aktion="waehle"][data-wert="verlauf"]');
  pruefe(await page.isHidden("#modus-pill"), "Handy: „Bericht“ im Notizordner beendet einen offenen Diktat-Modus (kein Entwurf beim falschen Patienten)");
  // b) Bericht-Auswahl bietet keinen neuen Test-Patienten an (ohne Notiz kein Bericht)
  await page.click('#chips-leiste [data-schnell="bericht"]');
  await page.waitForSelector('.auswahl-karte [data-aktion="waehle"]');
  pruefe((await page.locator(".auswahl-karte").last().locator('[data-aktion="neuer-patient"]').count()) === 0, "Handy: Bericht-Auswahl ohne „Neuer Test-Patient“ (keine Sackgasse)");
  // c) Notiz aus dem Gespräch öffnet oben (Datum und Patient sichtbar)
  for (const f of ["Was steht heute an?", "Hausaufgaben von TP-03", "Was wollte TP-02?"]) { await fragen(page, f); await page.waitForFunction(() => !document.querySelector("#senden.stoppt"), null, { timeout: 20000 }); }
  await page.locator(".von-gabi .quelle").last().click();
  await page.waitForSelector(".leser-kopf h1");
  await warte(300);
  const kopf = await page.evaluate(() => ({ titel: document.querySelector(".leser-kopf h1").getBoundingClientRect().top, kopf: document.querySelector("#kopf").getBoundingClientRect().bottom }));
  pruefe(kopf.titel >= kopf.kopf, `Handy: Notiz aus dem Gespräch öffnet oben (Titel ${Math.round(kopf.titel)} px, Kopf bis ${Math.round(kopf.kopf)} px)`);
  // d) leerer Zustand ohne seitliches Scrollen; „Suche löschen“ blendet auch das × aus
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#suche");
  await page.fill("#suche", "Ultraschall");
  await page.waitForSelector(".leer");
  await warte(300);
  pruefe((await breite(page)) <= 390, `Handy: „Nichts gefunden“ ohne seitliches Scrollen (${await breite(page)} px)`);
  await page.click('.leer [data-ordner="suche-loeschen"]');
  await warte(300);
  pruefe(await page.isHidden('label.suche [data-ordner="suche-loeschen"]'), "Handy: „Suche löschen“ blendet auch das × im Feld aus");
  // e) „Bitte prüfen“ lässt sich beim Bearbeiten erledigen
  await page.evaluate(() => { location.hash = "#/notizen/n/7e3c1a52-0102-4000-8000-000000000102"; });
  await page.waitForSelector('[data-leser="bearbeiten"]');
  await page.click('[data-leser="bearbeiten"]');
  await page.fill('textarea[data-abschnitt="unklar"]', "");
  await page.click('[data-leser="sichern"]');
  await page.waitForSelector('[data-leser="bearbeiten"]');
  await warte(300);
  pruefe((await page.locator(".leser .pruefen").count()) === 0, "Handy: geklärter Prüfpunkt lässt sich beim Bearbeiten löschen – „Bitte prüfen“ verschwindet");
  // f) Info-Dialog: Fokus auf „Verstanden“, nicht auf einem zerstörerischen Knopf
  await page.click("#test-badge");
  await page.waitForSelector("#dialog-info[open]");
  const fokus = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
  await page.keyboard.press("Escape");
  pruefe(fokus === "Verstanden", `Handy: Info-Dialog öffnet mit Fokus auf „Verstanden“ („${fokus}“)`);
  pruefe(konsole.length === 0, `Handy-Kanten: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

{ // Laptop-Kanten (1280 × 600): Enter während einer Antwort, Karte von oben, Mikrofon-Klick, Kopieren, Seitenleiste, Suche
  const ctx = await chrome.newContext({ viewport: { width: 1280, height: 600 }, permissions: ["microphone"] });
  await stumm(ctx);
  await ctx.addInitScript(() => {
    window.__kopiert = [];
    try { Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__kopiert.push(t); } }, configurable: true }); } catch { /* egal */ }
  });
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");

  // a) Doppel-Enter: das zweite Enter während der Antwort bricht nicht ab
  await page.fill("#eingabe-text", "Was steht heute an?");
  await page.press("#eingabe-text", "Enter");
  await warte(300);
  await page.press("#eingabe-text", "Enter");
  await antwortAbwarten(page, "Heute ist");
  pruefe(!/Abgebrochen/.test(await letzteAntwort(page)), "Laptop: zweites Enter während der Antwort bricht nicht ab");

  // b) Vorausschreiben während eines Diktats: Entwurf kommt, die Frage wartet im Feld und geht danach als normale Frage raus
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-03")').last().click();
  await page.fill("#eingabe-text", "LWS. Finger-Boden-Abstand 8 Zentimeter. Zu Hause Unterarmstütz täglich.");
  await page.press("#eingabe-text", "Enter");
  await warte(400);
  await page.fill("#eingabe-text", "Was wollte TP-02?");
  await page.press("#eingabe-text", "Enter");
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 20000 });
  await antwortAbwarten(page, "Entwurf für TP-03");
  const wartet = await page.inputValue("#eingabe-text");
  pruefe(wartet === "Was wollte TP-02?" && (await page.isHidden("#modus-pill")), `Laptop: Enter beim Diktat bricht nicht ab, die Frage wartet im Feld („${wartet}“)`);
  const kopfEntwurf = await page.evaluate(() => document.querySelector(".karte-entwurf:not(.erledigt) .karte-kopf").getBoundingClientRect().top);
  pruefe(kopfEntwurf >= 0 && kopfEntwurf < 560, `Laptop 1280 × 600: neuer Entwurf ist von oben zu sehen (Kopf bei ${Math.round(kopfEntwurf)} px)`);
  await page.locator(".von-gabi:has(.karte-entwurf) [data-aktion='kopieren']").last().click();
  const kopiert = await page.evaluate(() => window.__kopiert.at(-1) || "");
  pruefe(/Notiz-Entwurf · TP-03/.test(kopiert) && /Befund|Hausaufgaben/.test(kopiert), "Laptop: Kopieren unter einem Entwurf kopiert den Entwurf mit");
  await page.press("#eingabe-text", "Enter");
  await antwortAbwarten(page, "TP-02");
  const letzteFrage = await page.locator(".von-nutzer").last().textContent();
  pruefe(letzteFrage.includes("Was wollte TP-02?") && !letzteFrage.includes("Diktat"), "Laptop: die gewartete Frage geht als normale Frage raus, nicht als Diktat");

  // c) Bericht auf niedrigem Bildschirm: Kopf der Karte sichtbar
  await page.click('#chips-leiste [data-schnell="bericht"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-02")').last().click();
  await page.locator('[data-aktion="waehle"][data-wert="verlauf"]').last().click();
  await page.waitForSelector(".karte-bericht");
  await antwortAbwarten(page, "Verlaufsbericht");
  const kopfBericht = await page.evaluate(() => [...document.querySelectorAll(".karte-bericht .karte-kopf")].pop().getBoundingClientRect().top);
  pruefe(kopfBericht >= 0 && kopfBericht < 560, `Laptop 1280 × 600: neuer Bericht ist von oben zu sehen (Kopf bei ${Math.round(kopfBericht)} px)`);

  // d) Mikrofon nur angeklickt: Hinweis direkt unter der Eingabezeile
  const mb = await page.locator("#mikro").boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.down();
  await warte(150);
  await page.mouse.up();
  await page.waitForFunction(() => /gedrückt/.test(document.querySelector(".eingabe-fuss").textContent), null, { timeout: 8000 });
  pruefe(await page.isVisible(".eingabe-fuss.hinweis"), "Laptop: Klick aufs Mikrofon → Hinweis „gedrückt halten“ direkt unter der Eingabezeile");

  // e) Seitenleiste mit langer Beschreibung, Suchtreffer, schnelles Wegklicken nach dem Leeren der Suche
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.click('[data-ordner="patient-neu"]');
  await page.fill("#patient-kuerzel", "TP-07");
  await page.fill("#patient-pseudonym", "Testfall Knie rechts nach Kreuzband-OP (fiktiv)");
  await page.click("#patient-anlegen");
  await page.waitForFunction(() => /TP-07/.test(document.querySelector("#seiten-patienten").textContent));
  await page.waitForFunction(() => location.hash.startsWith("#/notizen/p/")); // die App öffnet den neuen Patienten
  const seite = await page.evaluate(() => { const x = document.querySelector("#seiten-patienten"); return { c: x.clientWidth, s: x.scrollWidth }; });
  pruefe(seite.s <= seite.c + 1, `Laptop: lange Beschreibung verbreitert die Seitenleiste nicht (${seite.s}/${seite.c} px)`);
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#suche");
  await page.fill("#suche", "theraband");
  await page.waitForSelector("#ordner-inhalt .notiz-karte");
  await warte(400);
  const versatz = await page.evaluate(() => [...document.querySelectorAll("#ordner-inhalt .notiz-karte")].map((k) => k.querySelector(".badge.akzent").getBoundingClientRect().left - k.getBoundingClientRect().left));
  pruefe(versatz.length > 0 && versatz.every((x) => x < 40), `Laptop: Suchtreffer – Kürzel steht links (${versatz.map(Math.round).join(", ")} px)`);
  await page.fill("#suche", "");
  await page.click('#seiten-patienten a:has-text("TP-01")');
  await warte(700);
  pruefe(await page.isVisible('a.zurueck:has-text("Alle Test-Patienten")'), "Laptop: Suche leeren und gleich einen Patienten anklicken → Patientenseite bleibt");
  pruefe(konsole.length === 0, `Laptop-Kanten: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

{ // Übergang: offener v1-Entwurf → Karte; Versionsstempel: andere Version → einmal neu laden, dann Hinweis statt leerer Seite
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 } });
  await stumm(ctx);
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("test.v1-gesetzt")) return;
    sessionStorage.setItem("test.v1-gesetzt", "1");
    sessionStorage.setItem("gabi.entwurf.demo", JSON.stringify({ patientId: "7e3c1a52-0001-4000-8000-000000000001", rohtext: "Knie rechts, Flexion 100 Grad.",
      strukturiert: { befund: ["Flexion Knie rechts bis 100°"], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] }, manuell: false }));
  });
  const page = await ctx.newPage();
  await page.goto(`${basis}/?demo=1#/aufnahme`);
  await page.waitForSelector(".karte-entwurf", { timeout: 15000 });
  const text = await page.textContent("#nachrichten");
  const rest = await page.evaluate(() => sessionStorage.getItem("gabi.entwurf.demo"));
  pruefe(/Aus der Vorversion/.test(text) && /Flexion Knie rechts bis 100°/.test(text) && rest === null && GESPRAECH_URL.test(page.url()),
    "Übergang: offener v1-Entwurf wird als Entwurfskarte übernommen (einmal), v1-Adresse #/aufnahme → eigenes Gespräch");
  await page.reload();
  await page.waitForSelector(".karte-entwurf", { timeout: 15000 });
  pruefe((await listenTitel(page)).includes("Entwurf TP-01") || (await page.textContent("#nachrichten")).includes("Flexion Knie rechts bis 100°"), "Übergang: der übernommene v1-Entwurf übersteht das Neuladen");
  await ctx.close();

  // v2.0 → v2.1: das eine Gespräch des Tabs (sessionStorage) wird erster Eintrag der Liste und bleibt offen – kein Datenverlust
  const ctx20 = await chrome.newContext({ viewport: { width: 1440, height: 900 } });
  await stumm(ctx20);
  await ctx20.addInitScript(() => {
    if (sessionStorage.getItem("test.v20-gesetzt")) return;
    sessionStorage.setItem("test.v20-gesetzt", "1");
    sessionStorage.setItem("gabi.demo.gespraech.v2", JSON.stringify({ nachrichten: [
      { id: "a1", rolle: "nutzer", text: "Alte Frage aus Version 2.0" },
      { id: "a2", rolle: "gabi", text: "Alte Antwort aus Version 2.0.", karten: [], quellen: [] },
      { id: "a3", rolle: "nutzer", text: "Noch eine Frage" },
      { id: "a4", rolle: "gabi", text: "", karten: [], unterwegs: true, body: { nachrichten: [{ rolle: "nutzer", text: "Noch eine Frage" }] } },
    ] }));
  });
  const p20 = await ctx20.newPage();
  const k20 = konsoleBeobachten(p20);
  await p20.goto(`${basis}/?demo=1#/`);
  await p20.waitForFunction(() => /Alte Antwort aus Version 2\.0/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 15000 });
  const u20 = await p20.evaluate(() => ({ rest: sessionStorage.getItem("gabi.demo.gespraech.v2"), url: location.hash, unterbrochen: /unterbrochen/.test(document.querySelector("#nachrichten").textContent), nochmal: Boolean(document.querySelector('[data-aktion="wiederholen"]')) }));
  pruefe(u20.rest === null && /^#\/gespraech\//.test(u20.url) && (await listenTitel(p20))[0] === "Alte Frage aus Version 2.0",
    `Übergang v2.0: bisheriges Gespräch ist erster Eintrag der Liste und bleibt offen (${u20.url})`);
  pruefe(u20.unterbrochen && u20.nochmal, "Übergang v2.0: unterbrochene Antwort zeigt „Nochmal versuchen“");
  await p20.reload();
  await p20.waitForFunction(() => /Alte Antwort aus Version 2\.0/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 15000 });
  pruefe((await listenTitel(p20)).length === 1 && k20.length === 0, `Übergang v2.0: nach dem Neuladen genau einmal da (aus IndexedDB), keine Konsolenfehler${k20.length ? ` (${k20.join(" | ")})` : ""}`);
  await ctx20.close();

  const ctx2 = await chrome.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  let dokumente = 0;
  p2.on("framenavigated", (f) => { if (f === p2.mainFrame()) dokumente++; });
  await p2.route("**/app.js*", async (route) => {
    const antwort = await route.fetch();
    await route.fulfill({ response: antwort, body: (await antwort.text()).replace(/const VERSION = "[^"]+"/, 'const VERSION = "9.9.9"') });
  });
  await p2.goto(`${basis}/?demo=1#/`);
  await p2.waitForSelector(".veraltet button", { timeout: 15000 });
  await warte(800);
  pruefe(dokumente === 2, `Versionsstempel: Seite und Skript passen nicht → genau einmal neu geladen, dann „Neu laden“ statt leerer Seite (${dokumente} Ladevorgänge)`);
  await ctx2.close();
}

// ---------------------------------------------------------------------------
// 2b v2.1 A: Schein hinter leeren Zuständen – weich in alle Richtungen, keine Kante (Pixelmessung über die ganze Breite)
// ---------------------------------------------------------------------------
/** Größter Helligkeitsschritt zwischen Nachbarpixeln: Zeile durch die Mitte (ohne Text/Knöpfe) und Spalte über/unter dem Inhalt. */
async function scheinMessen(page, auswahl) {
  const r = await page.evaluate((sel) => {
    const leer = document.querySelector(sel);
    const lr = leer.getBoundingClientRect();
    const haupt = (leer.closest("#haupt") || document.body).getBoundingClientRect();
    const inhalt = [...leer.children].map((k) => k.getBoundingClientRect()).map((x) => ({ l: x.left, r: x.right, t: x.top, b: x.bottom }));
    return { l: lr.left, r: lr.right, t: lr.top, b: lr.bottom, hl: Math.max(0, haupt.left), inhalt, ueberlauf: getComputedStyle(leer).overflow, verlauf: getComputedStyle(leer, "::before").backgroundImage };
  }, auswahl);
  const px = await pixelLesen(await page.screenshot());
  const y = (r.t + r.b) / 2;
  const frei = (x, yy) => !r.inhalt.some((t) => yy >= t.t - 6 && yy <= t.b + 6 && x >= t.l - 10 && x <= t.r + 10);
  let zeile = 0;
  for (let x = Math.ceil(r.hl) + 2; x < px.w; x++) if (frei(x, y) && frei(x - 1, y)) zeile = Math.max(zeile, farbAbstand(px.at(x, y), px.at(x - 1, y)));
  const xm = (r.l + r.r) / 2;
  const oben = Math.min(...r.inhalt.map((t) => t.t)) - 6;
  const unten = Math.max(...r.inhalt.map((t) => t.b)) + 6;
  let spalte = 0;
  let staerke = 0;
  const grund = px.at(Math.ceil(r.hl) + 3, Math.min(px.h - 3, Math.max(r.b + 60, 3)));
  for (let yy = Math.max(1, Math.ceil(r.t)); yy < Math.min(px.h, r.b + 26); yy++) {
    if (yy >= oben && yy <= unten) continue;
    spalte = Math.max(spalte, farbAbstand(px.at(xm, yy), px.at(xm, yy - 1)));
    staerke = Math.max(staerke, farbAbstand(px.at(xm, yy), grund));
  }
  return { zeile, spalte, staerke, ...r };
}
for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) for (const schema of ["light", "dark"]) {
  const name = `Schein ${w} px ${schema === "dark" ? "dunkel" : "hell"}`;
  const ctx = await chrome.newContext({ viewport: { width: w, height: h }, colorScheme: schema, isMobile: w < 768, hasTouch: w < 1024 });
  await stumm(ctx);
  const page = await ctx.newPage();
  await page.goto(`${basis}/?demo=1#/notizen`);
  await page.waitForSelector(".patient-karte");
  await page.click('[data-ordner="patient-neu"]');
  await page.fill("#patient-kuerzel", "TP-04");
  await page.click("#patient-anlegen");
  await page.waitForSelector(".leer h2");
  await warte(600);
  const m = await scheinMessen(page, ".leer");
  pruefe(m.zeile <= 2 && m.spalte <= 2 && m.staerke >= 2 && m.ueberlauf === "visible" && /radial-gradient/.test(m.verlauf) && (await breite(page)) <= w,
    `${name}: „Noch keine Notizen“ – Schein läuft weich aus, keine Kante (größter Schritt ${m.zeile}/${m.spalte}, Schein ${m.staerke}, overflow ${m.ueberlauf})`);
  await page.screenshot({ path: join(aus, `glow-${w}-${schema === "dark" ? "dunkel" : "hell"}.png`), clip: { x: 0, y: Math.max(0, m.t - 90), width: w, height: Math.min(h - Math.max(0, m.t - 90), m.b - m.t + 180) } });
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#suche");
  await page.fill("#suche", "xyzabc");
  await page.waitForSelector("#ordner-inhalt .leer");
  await warte(500);
  const s2 = await scheinMessen(page, "#ordner-inhalt .leer");
  pruefe(s2.zeile <= 2 && s2.spalte <= 2 && s2.staerke >= 2 && (await breite(page)) <= w, `${name}: „Nichts gefunden“ ebenso (${s2.zeile}/${s2.spalte}, Schein ${s2.staerke})`);
  await ctx.close();
  if (LIVE && w !== 390) continue; // Zugangsseite auf der echten Adresse nur einmal pro Schema (nur /api/status)
  const ctxZ = await chrome.newContext({ viewport: { width: w, height: h }, colorScheme: schema, isMobile: w < 768, hasTouch: w < 1024 });
  const pz = await ctxZ.newPage();
  await pz.goto(`${basis}/#/`);
  await pz.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 20000 });
  await warte(500);
  const z = await scheinMessen(pz, ".zugang");
  pruefe(z.zeile <= 2 && z.spalte <= 2 && (await breite(pz)) <= w, `${name}: Zugangsseite – Schein ohne Kante (${z.zeile}/${z.spalte})`);
  await ctxZ.close();
}

// ---------------------------------------------------------------------------
// 2b v2.1 B: ruhige Wechsel – 10 schnelle Runden Gespräch → Notizen → Patient → zurück → Gespräch, gezählt pro Bild
// ---------------------------------------------------------------------------
const RUHE_MESSEN = () => {
  const r = { bilder: 0, durchsichtig: 0, platzhalter: 0, springen: 0, animationen: [], entfernt: { notizen: 0, nachrichten: 0, seitenleiste: 0 } };
  document.addEventListener("animationstart", (e) => {
    const t = e.target;
    if (!/auftauchen|einblenden/.test(e.animationName) || !t.closest || !t.closest("#haupt")) return;
    r.animationen.push(`${e.animationName}: ${t.className}`); // in den Runden kommt nichts Neues dazu – jede Animation ist ein erneutes Einblenden
  }, true);
  const beobachten = (sel, k) => {
    const w = document.querySelector(sel);
    if (w) new MutationObserver((ms) => { for (const m of ms) if ([...m.removedNodes].some((n) => n.nodeType === 1)) r.entfernt[k]++; }).observe(w, { childList: true, subtree: true });
  };
  beobachten("#ansicht-notizen", "notizen");
  beobachten("#nachrichten", "nachrichten");
  beobachten("#seiten-patienten", "seitenleiste");
  beobachten("#seiten-gespraeche", "seitenleiste");
  let vorher = null;
  const bild = () => {
    r.bilder++;
    const v = [...document.querySelectorAll(".ansicht")].find((a) => !a.hidden);
    if (v && parseFloat(getComputedStyle(v).opacity) < 0.995) r.durchsichtig++;
    if ([...document.querySelectorAll("#haupt .skelett")].some((x) => x.getClientRects().length && parseFloat(getComputedStyle(x).opacity) > 0.05)) r.platzhalter++;
    const k = document.querySelector("#ansicht-notizen:not([hidden]) .patient-karte, #ansicht-notizen:not([hidden]) .notiz-karte");
    const jetzt = k ? { k, top: k.offsetTop } : null; // offsetTop: Layout-Lage, unabhängig von Hover-Bewegung und Scrollen
    if (jetzt && vorher && jetzt.k === vorher.k && Math.abs(jetzt.top - vorher.top) > 1) r.springen++; // dieselbe Karte hat sich bewegt
    vorher = jetzt;
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
  window.__ruhe = r;
};
async function ruheRunden(geraet, schema, ziel = basis, { wenigBewegung = false } = {}) {
  const mobil = geraet === "handy";
  const name = `Ruhe ${geraet} ${schema === "dark" ? "dunkel" : "hell"}${wenigBewegung ? " (Bewegung reduziert)" : ""}`;
  const ctx = await chrome.newContext({ viewport: mobil ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobil, hasTouch: mobil, colorScheme: schema, reducedMotion: wenigBewegung ? "reduce" : "no-preference" });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${ziel}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  await fragen(page, "Was steht heute an?");
  await antwortAbwarten(page, "Heute ist");
  const zuNotizen = () => (mobil ? page.click("#kopf-wechsel") : page.click('.navi a[data-navi="notizen"]'));
  const zumGespraech = () => (mobil ? page.click("#kopf-wechsel") : page.click('.navi a[data-navi="chat"]'));
  const imGespraech = () => page.waitForSelector("#ansicht-chat:not([hidden]) .nachricht");
  const inUebersicht = () => page.waitForSelector('#ansicht-notizen:not([hidden]) .patient-karte:has-text("TP-01")');
  const beimPatienten = () => page.waitForSelector("#ansicht-notizen:not([hidden]) .notiz-karte");
  // Runde: Übersicht ↔ Gespräch direkt (stehengebliebener Inhalt), Patient, Gespräch, mit „Zurück“ wieder zum Patienten, zurück zur Übersicht
  const runde = async () => {
    await zuNotizen(); await inUebersicht();
    await zumGespraech(); await imGespraech();
    await zuNotizen(); await inUebersicht();
    await page.click('.patient-karte:has-text("TP-01")'); await beimPatienten();
    await zumGespraech(); await imGespraech();
    await page.goBack(); await beimPatienten();
    await page.click("a.zurueck"); await inUebersicht();
    await zumGespraech(); await imGespraech();
  };
  await runde(); // erster Besuch: darf einmal einblenden und laden
  await page.evaluate(RUHE_MESSEN);
  for (let i = 0; i < 10; i++) await runde();
  await warte(300);
  const m = await page.evaluate(() => window.__ruhe);
  // eine Antwort, während gemessen wird: neue Nachrichten blenden genau einmal ein – nicht bei jedem Bild des Stroms
  await page.evaluate(() => {
    window.__strom = 0;
    document.addEventListener("animationstart", (e) => { if (e.target.classList && e.target.classList.contains("nachricht")) window.__strom++; }, true);
  });
  await fragen(page, "Was kannst du?");
  await antwortAbwarten(page, "Ich bin Gabi");
  m.strom = await page.evaluate(() => window.__strom);
  await ctx.close();
  return { name, m, konsole };
}
for (const [geraet, schema, wenigBewegung] of [["handy", "light"], ["handy", "dark"], ["laptop", "light"], ["laptop", "dark"], ["laptop", "light", true], ["handy", "dark", true]]) {
  const { name, m, konsole } = await ruheRunden(geraet, schema, basis, { wenigBewegung });
  pruefe(m.durchsichtig === 0, `${name}: 10 schnelle Runden – nie eine halb durchsichtige Ansicht (${m.durchsichtig} von ${m.bilder} Bildern)`);
  pruefe(m.animationen.length === 0, `${name}: keine erneute Einblend-Animation bei späteren Besuchen (${m.animationen.length}${m.animationen.length ? `: ${m.animationen[0]}` : ""})`);
  pruefe(m.platzhalter === 0 && m.springen === 0, `${name}: kein Platzhalter-Blinken, kein Springen (Platzhalter ${m.platzhalter}, Sprünge ${m.springen})`);
  pruefe(m.entfernt.notizen <= 20 && m.entfernt.nachrichten === 0 && m.entfernt.seitenleiste === 0,
    `${name}: höchstens ein Aufbau pro neuer Ansicht – Notizen ${m.entfernt.notizen} (≤ 20 bei 80 Wechseln), Gespräch ${m.entfernt.nachrichten}, Seitenleiste ${m.entfernt.seitenleiste}`);
  pruefe(m.strom <= 2, `${name}: eine Antwort blendet ihre Nachrichten nur einmal ein, nicht bei jedem Bild (${m.strom} Einblendungen)`);
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
}

// ---------------------------------------------------------------------------
// 2b v2.1 C: Gesprächsverlauf am Laptop
// ---------------------------------------------------------------------------
{
  const ctx = await chrome.newContext({ viewport: { width: 1440, height: 900 } });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  const adressen = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) adressen.push(f.url()); });
  let anfragen = 0;
  page.on("request", (r) => { if (r.url().includes("/api/")) anfragen++; });
  const merkeAdresse = () => adressen.push(page.url());
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  pruefe(/Noch keine Gespräche/.test(await page.textContent("#seiten-gespraeche")), "Verlauf: am Anfang leer („Noch keine Gespräche“)");

  // a) nur Rückfragen von Gabi → kein Eintrag; b) erste Nachricht → eigene Adresse, „Heute“, aktiv, Titel aus der Nachricht
  await page.click('.vorschlag[data-schnell="suche"]');
  await page.waitForSelector(".von-gabi");
  pruefe((await listenTitel(page)).length === 0 && page.url().endsWith("#/"), "Verlauf: ohne eigene Nachricht wird nichts gespeichert (nur Gabis Rückfrage)");
  await fragen(page, "Theraband");
  await ruhigWarten(page);
  const a = page.url();
  merkeAdresse();
  const gruppe = await page.textContent("#seiten-gespraeche .gespraeche-gruppe-titel");
  const aktivMarke = await page.getAttribute("#seiten-gespraeche .gespraech-eintrag.aktiv .gespraech-link", "aria-current");
  pruefe(GESPRAECH_URL.test(a) && (await listenTitel(page))[0] === "Suche: Theraband" && gruppe === "Heute" && aktivMarke === "true" && (await page.locator('[aria-current="page"]').count()) === 1,
    `Verlauf: erste Nachricht → eigene Adresse, Eintrag unter „Heute“, aktiv hervorgehoben, Titel aus der Nachricht („${(await listenTitel(page))[0]}“)`);

  // c) Neues Gespräch, lange Frage → gekürzter Titel, neuestes oben
  await page.click("#seite-neu");
  await page.waitForFunction(() => location.hash === "#/");
  await fragen(page, "Wie lange dauert eine Behandlung bei Osteopathie normalerweise in der Praxis?");
  await ruhigWarten(page);
  const b = page.url();
  merkeAdresse();
  const t2 = await listenTitel(page);
  pruefe(t2.length === 2 && t2[0].length <= 41 && t2[0].endsWith("…") && t2[1] === "Suche: Theraband", `Verlauf: zweites Gespräch oben, Titel gekürzt auf ≤ 40 Zeichen („${t2[0]}“)`);

  // d) Wechsel über die Liste, Zurück, Vorwärts, Neuladen
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Suche: Theraband")');
  await page.waitForFunction((x) => location.href === x, a);
  await angekommen(page);
  const nurA = await page.textContent("#nachrichten");
  await page.goBack();
  await page.waitForFunction((x) => location.href === x, b);
  await angekommen(page);
  const nurB = await page.textContent("#nachrichten");
  await page.goForward();
  await page.waitForFunction((x) => location.href === x, a);
  await angekommen(page);
  await page.reload();
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await angekommen(page);
  pruefe(/Theraband/.test(nurA) && !/Osteopathie/.test(nurA) && /Osteopathie/.test(nurB) && !/Theraband/.test(nurB) && page.url() === a,
    "Verlauf: Liste, Zurück, Vorwärts und Neuladen öffnen jeweils das richtige Gespräch");

  // e) Umbenennen: Esc bricht ab, Enter übernimmt, bleibt nach dem Neuladen, Reihenfolge bleibt
  const eintrag = (text) => page.locator(`#seiten-gespraeche .gespraech-eintrag:has-text("${text}")`);
  await eintrag("Suche: Theraband").hover();
  await eintrag("Suche: Theraband").locator('[data-gespraech-aktion="umbenennen"]').click();
  await page.fill("#seiten-gespraeche .gespraech-feld", "Wird verworfen");
  await page.press("#seiten-gespraeche .gespraech-feld", "Escape");
  const nachEsc = await listenTitel(page);
  await eintrag("Suche: Theraband").hover();
  await eintrag("Suche: Theraband").locator('[data-gespraech-aktion="umbenennen"]').click();
  await page.fill("#seiten-gespraeche .gespraech-feld", "Theraband-Übungen TP-01");
  await page.press("#seiten-gespraeche .gespraech-feld", "Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("#seiten-gespraeche .gespraech-link")].some((x) => x.textContent === "Theraband-Übungen TP-01"));
  await page.reload(); // sofort – IndexedDB bricht laufendes Schreiben dabei ab, die Notfall-Kopie trägt es nach
  await page.waitForSelector("#seiten-gespraeche .gespraech-link");
  await angekommen(page);
  const nachLaden = await listenTitel(page);
  const inAblageUmbenannt = ((await ablageTitel(page, "gabi-demo")) || []).includes("Theraband-Übungen TP-01");
  pruefe(nachEsc.includes("Suche: Theraband") && !nachEsc.includes("Wird verworfen") && nachLaden.includes("Theraband-Übungen TP-01") && nachLaden[0] !== "Theraband-Übungen TP-01" && inAblageUmbenannt,
    `Verlauf: Umbenennen per Stift – Esc bricht ab, Enter speichert, übersteht sofortiges Neuladen (${nachLaden.join(" | ")})`);

  // f) Wechsel während einer laufenden Antwort: sauber abgebrochen, keine Geisternachricht im neuen Gespräch
  await fragen(page, "Was kannst du?");
  await page.waitForSelector("#senden.stoppt");
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Wie lange dauert")');
  await page.waitForFunction((x) => location.href === x, b);
  await angekommen(page);
  const vorher = await page.locator("#nachrichten .nachricht").count();
  await warte(2500);
  const nachher = await page.locator("#nachrichten .nachricht").count();
  pruefe(vorher === nachher && !(await page.isVisible("#senden.stoppt")) && !/Ich bin Gabi/.test(await page.textContent("#nachrichten")),
    `Verlauf: Wechsel während einer Antwort – abgebrochen, keine Geisternachricht im neuen Gespräch (${vorher} → ${nachher} Nachrichten)`);
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Theraband-Übungen")');
  await page.waitForFunction((x) => location.href === x, a);
  await angekommen(page);
  const abgebrochen = await letzteAntwort(page);
  pruefe(!(await page.locator(".von-gabi .tippen").count()) && abgebrochen.length > 0 && !/Standorte/.test(abgebrochen),
    `Verlauf: die abgebrochene Antwort bleibt im eigenen Gespräch („${abgebrochen.slice(0, 40)}“)`);

  // g) Diktat-Modus endet beim Wechsel – die nächste Frage ist kein Diktat
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click();
  await page.waitForSelector("#modus-pill:not([hidden])");
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Wie lange dauert")');
  await page.waitForFunction((x) => location.href === x, b);
  await angekommen(page);
  const pille = await page.isVisible("#modus-pill");
  await fragen(page, "Was wollte TP-02?");
  await antwortAbwarten(page, "TP-02");
  const blase = await page.locator(".von-nutzer").last().textContent();
  pruefe(!pille && !/Diktat/.test(blase), "Verlauf: Diktat-Modus endet beim Wechsel – die nächste Frage ist kein Diktat (kein Entwurf beim falschen Patienten)");

  // h) offener Entwurf übersteht den Wechsel und wird beim richtigen Patienten gespeichert
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-02")').last().click();
  await page.locator('[data-aktion="beispiel"]:not([disabled])').last().click();
  await page.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
  await antwortAbwarten(page, "Entwurf für TP-02");
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Theraband-Übungen")');
  await page.waitForFunction((x) => location.href === x, a);
  await angekommen(page);
  await page.click('#seiten-gespraeche .gespraech-link:has-text("Wie lange dauert")');
  await page.waitForFunction((x) => location.href === x, b);
  await angekommen(page);
  await page.locator(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']").last().click();
  await page.waitForFunction(() => /Gespeichert bei TP-02/.test(document.querySelector("#toasts").textContent));
  pruefe(true, "Verlauf: offener Entwurf übersteht den Wechsel und wird beim richtigen Patienten (TP-02) gespeichert");

  // i) Neuladen mitten in der Antwort → „unterbrochen“ mit „Nochmal versuchen“ im selben Gespräch
  await fragen(page, "Was kannst du?");
  await page.waitForSelector("#senden.stoppt");
  await page.reload();
  await page.waitForSelector('[data-aktion="wiederholen"]', { timeout: 8000 });
  const unterbrochen = /unterbrochen/.test(await page.textContent("#nachrichten")) && page.url() === b;
  await page.click('[data-aktion="wiederholen"]');
  await antwortAbwarten(page, "Ich bin Gabi");
  pruefe(unterbrochen, "Verlauf: Neuladen mitten in der Antwort → „unterbrochen“, „Nochmal versuchen“ klappt im selben Gespräch");

  // j) Löschen mit Bestätigung; offenes Gespräch löschen → neues leeres
  await eintrag("Theraband-Übungen").hover();
  await eintrag("Theraband-Übungen").locator('[data-gespraech-aktion="loeschen"]').click();
  await page.waitForSelector("#dialog-frage[open]");
  const frageText = await page.textContent("#frage-text");
  await page.click("#frage-nein");
  const nochDa = (await listenTitel(page)).includes("Theraband-Übungen TP-01");
  await eintrag("Theraband-Übungen").hover();
  await eintrag("Theraband-Übungen").locator('[data-gespraech-aktion="loeschen"]').click();
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-ja");
  await page.waitForFunction(() => /Gespräch gelöscht/.test(document.querySelector("#toasts").textContent));
  const direktWeg = !(await listenTitel(page)).includes("Theraband-Übungen TP-01");
  await page.reload(); // sofort – gelöscht muss gelöscht bleiben
  await page.waitForSelector("#seiten-gespraeche .gespraech-link");
  await angekommen(page);
  pruefe(/„Theraband-Übungen TP-01“ wird von diesem Gerät gelöscht/.test(frageText) && nochDa && direktWeg && !(await listenTitel(page)).includes("Theraband-Übungen TP-01") && !((await ablageTitel(page, "gabi-demo")) || []).includes("Theraband-Übungen TP-01"),
    "Verlauf: Löschen fragt nach – Abbrechen behält, Löschen entfernt (auch nach sofortigem Neuladen)");
  const aktiv = page.locator("#seiten-gespraeche .gespraech-eintrag.aktiv");
  await aktiv.hover();
  await aktiv.locator('[data-gespraech-aktion="loeschen"]').click();
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-ja");
  await page.waitForFunction(() => location.hash === "#/" && !document.querySelector("#willkommen").hidden);
  pruefe((await listenTitel(page)).length === 0, "Verlauf: offenes Gespräch löschen → neues leeres Gespräch (#/)");

  // k) „Alle Gespräche löschen“ mit Bestätigung – auch die Ablage ist leer
  for (const f of ["Was steht heute an?", "Wo sind die Standorte?"]) {
    await page.click("#seite-neu");
    await page.waitForFunction(() => location.hash === "#/");
    await fragen(page, f);
    await ruhigWarten(page);
    merkeAdresse();
  }
  await page.click('[data-gespraeche="alle-loeschen"]');
  await page.waitForSelector("#dialog-frage[open]");
  const alleText = await page.textContent("#frage-text");
  await page.click("#frage-ja");
  await page.waitForFunction(() => /Noch keine Gespräche/.test(document.querySelector("#seiten-gespraeche").textContent));
  await warte(200);
  pruefe(/Alle 2 Gespräche werden von diesem Gerät gelöscht/.test(alleText) && page.url().endsWith("#/") && ((await ablageTitel(page, "gabi-demo")) || []).length === 0,
    "Verlauf: „Alle Gespräche löschen“ fragt nach und leert auch die Ablage (IndexedDB)");

  // k2) Zurück auf einen alten „#/“-Eintrag während einer Antwort: zeigt das offene Gespräch, bricht nichts ab
  await page.click('.navi a[data-navi="notizen"]');
  await page.waitForSelector("#ansicht-notizen:not([hidden])");
  await page.click('.navi a[data-navi="chat"]'); // ungespeichertes Gespräch → Adresse #/
  await page.waitForFunction(() => location.hash === "#/" && !document.querySelector("#ansicht-chat").hidden);
  await fragen(page, "Was kannst du?");
  await page.waitForSelector("#senden.stoppt");
  const mitZurueck = page.url();
  await page.goBack(); // → #/notizen
  await page.waitForSelector("#ansicht-notizen:not([hidden])");
  await page.goBack(); // → der alte „#/“-Eintrag
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await antwortAbwarten(page, "Ich bin Gabi");
  pruefe(GESPRAECH_URL.test(mitZurueck) && page.url() === mitZurueck && /Standorte/.test(await letzteAntwort(page)),
    "Verlauf: Zurück auf einen alten „#/“-Eintrag zeigt das offene Gespräch – kein neues, die laufende Antwort läuft zu Ende");

  // l) unbekannte Adresse
  await page.evaluate(() => { location.hash = "#/gespraech/0000aaaa-gibt-es-nicht"; });
  await page.waitForFunction(() => /gibt es auf diesem Gerät nicht/.test(document.querySelector("#toasts").textContent));
  pruefe(page.url().endsWith("#/"), "Verlauf: unbekannte Gesprächsadresse → Hinweis und neues Gespräch");

  // m) Limit 50 und Gruppen (bis 50 alte Gespräche im Abstand von 5 Stunden direkt in die Ablage)
  const schonDa = (await listenTitel(page)).length;
  const alte = 50 - schonDa;
  await page.evaluate((anzahl) => new Promise((ok, nein) => {
    const r = indexedDB.open("gabi-demo", 1);
    r.onsuccess = () => {
      const d = r.result;
      const t = d.transaction(["meta", "inhalt"], "readwrite");
      const jetzt = Date.now();
      for (let i = 0; i < anzahl; i++) {
        const id = `test-gespraech-${String(i).padStart(2, "0")}`;
        const zeit = jetzt - (i + 1) * 5 * 3600000;
        t.objectStore("meta").put({ id, titel: `Altes Gespräch ${i}`, titelEigen: false, erstellt: zeit, geaendert: zeit, entwuerfe: 0 });
        t.objectStore("inhalt").put({ id, nachrichten: [{ id: `n${i}`, rolle: "nutzer", text: `Altes Gespräch ${i}` }, { id: `g${i}`, rolle: "gabi", text: "Ok.", karten: [] }] });
      }
      t.oncomplete = () => { d.close(); ok(); };
      t.onerror = () => nein(t.error);
    };
    r.onerror = () => nein(r.error);
  }), alte);
  await page.reload();
  await page.waitForSelector("#seiten-gespraeche .gespraech-link");
  const vorLimit = await listenTitel(page);
  const aeltestes = `Altes Gespräch ${alte - 1}`;
  const gruppen = await page.$$eval("#seiten-gespraeche .gespraeche-gruppe-titel", (x) => x.map((h) => h.textContent));
  await fragen(page, "Was steht heute an?");
  await page.waitForFunction(() => /höchstens 50/.test(document.querySelector("#toasts").textContent), null, { timeout: 8000 });
  await ruhigWarten(page);
  const nachLimit = await listenTitel(page);
  const inAblage = (await ablageTitel(page, "gabi-demo")) || [];
  pruefe(vorLimit.length === 50 && vorLimit.includes(aeltestes) && nachLimit.length === 50 && !nachLimit.includes(aeltestes) && nachLimit[0] === "Was steht heute an?" && inAblage.length === 50 && !inAblage.includes(aeltestes),
    `Verlauf: höchstens 50 – das älteste fliegt mit Hinweis raus, auch aus der Ablage (${vorLimit.length} → ${nachLimit.length})`);
  pruefe(gruppen.join(",") === "Heute,Gestern,Letzte 7 Tage,Älter" || gruppen.join(",") === "Gestern,Letzte 7 Tage,Älter", `Verlauf: Gruppen nach letzter Aktivität (${gruppen.join(", ")})`);

  // n) zwei Tabs: Liste bleibt aktuell; im anderen Tab gelöschtes Gespräch wird nicht wieder angelegt
  const tab2 = await ctx.newPage();
  const k2 = konsoleBeobachten(tab2);
  await tab2.goto(`${basis}/?demo=1#/`);
  await tab2.waitForSelector("#seiten-gespraeche .gespraech-link");
  await page.click("#seite-neu");
  await page.waitForFunction(() => location.hash === "#/");
  await fragen(page, "Hausaufgaben von TP-02");
  await ruhigWarten(page);
  await tab2.waitForFunction(() => [...document.querySelectorAll("#seiten-gespraeche .gespraech-link")].some((x) => x.textContent === "Hausaufgaben von TP-02"), null, { timeout: 5000 });
  await tab2.click('#seiten-gespraeche .gespraech-link:has-text("Hausaufgaben von TP-02")');
  await tab2.waitForFunction(() => /Hausaufgaben/.test(document.querySelector("#nachrichten").textContent));
  await fragen(page, "Was wollte TP-02?"); // Tab A schreibt weiter in dasselbe Gespräch
  await antwortAbwarten(page, "TP-02");
  const mitgezogen = await tab2.waitForFunction(() => /Was wollte TP-02\?/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 5000 }).then(() => true).catch(() => false);
  await warte(300);
  const beideTabs = await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open("gabi-demo", 1); r.onsuccess = () => { const q = r.result.transaction("inhalt").objectStore("inhalt").getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map((x) => x.nachrichten.map((n) => n.text).join(" | ")).filter((t) => /Hausaufgaben von TP-02/.test(t))); }; }; }));
  pruefe(mitgezogen && beideTabs.length === 1 && /Was wollte TP-02/.test(beideTabs[0]),
    "Verlauf: dasselbe Gespräch in zwei Tabs – neue Nachrichten erscheinen im anderen Tab, nichts wird überschrieben");
  await eintrag("Hausaufgaben von TP-02").hover();
  await eintrag("Hausaufgaben von TP-02").locator('[data-gespraech-aktion="loeschen"]').click();
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-ja");
  await tab2.waitForFunction(() => /anderen Fenster gelöscht/.test(document.querySelector("#toasts").textContent) && location.hash === "#/", null, { timeout: 5000 });
  await warte(600);
  pruefe(!((await ablageTitel(page, "gabi-demo")) || []).includes("Hausaufgaben von TP-02") && !(await listenTitel(tab2)).includes("Hausaufgaben von TP-02") && k2.length === 0,
    "Verlauf: zwei Tabs – neue Gespräche erscheinen im anderen Tab, dort gelöschte werden nicht wieder angelegt");
  await tab2.close();

  // o) Datenschutz: Hinweis im Info-Dialog, keine Inhalte in Adressen oder im Seitentitel, kein Server-Aufruf (Demo)
  await page.click("#test-badge");
  await page.waitForSelector("#dialog-info[open]");
  const info = await page.textContent("#info-liste");
  await page.keyboard.press("Escape");
  merkeAdresse();
  const verraeterisch = adressen.filter((u) => /Theraband|Osteopathie|Standorte|steht|Hausaufgaben/i.test(decodeURIComponent(u)));
  pruefe(/Gespräche werden nur auf diesem Gerät gespeichert\./.test(info) && !verraeterisch.length && anfragen === 0 && (await page.title()) === "Gabi – PhysioWorks (Testversion)",
    `Verlauf: nur auf diesem Gerät – Hinweis im Info-Dialog, keine Inhalte in Adressen (${adressen.length} geprüft) oder im Seitentitel, kein Server-Aufruf`);
  pruefe(konsole.length === 0, `Verlauf: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2b v2.1 C: Schublade am Handy (390 px) und bei 320 px
// ---------------------------------------------------------------------------
for (const w of [390, 320]) {
  const ctx = await chrome.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  pruefe((await breite(page)) <= w && (await page.isVisible("#kopf-menue")) && (await page.isVisible("#test-badge")) && (await page.getAttribute("#kopf-wechsel", "aria-label")) === "Notizen",
    `${w} px: Kopfzeile mit Menü-Knopf passt (Breite ${await breite(page)} px), Umschalter hat einen Namen`);
  await fragen(page, "Was steht heute an?");
  await antwortAbwarten(page, "Heute ist");
  await schubladeAuf(page);
  await page.click("#schublade [data-gespraech-neu]");
  await schubladeZu(page);
  await page.waitForFunction(() => location.hash === "#/" && !document.querySelector("#willkommen").hidden);
  await fragen(page, "Wo sind die Standorte?");
  await antwortAbwarten(page, "Kieslingstraße");
  await schubladeAuf(page);
  const box = await page.evaluate(() => {
    const d = document.querySelector("#schublade").getBoundingClientRect();
    const l = document.querySelector("#schublade-liste");
    const stift = l.querySelector("[data-gespraech-aktion='umbenennen']");
    return { l: d.left, r: d.right, sw: l.scrollWidth, cw: l.clientWidth, seite: document.documentElement.scrollWidth, fokus: document.querySelector("#schublade").contains(document.activeElement), stift: getComputedStyle(stift).opacity, ziel: stift.getBoundingClientRect().width };
  });
  pruefe(box.l === 0 && box.r <= w - 32 && box.sw <= box.cw + 1 && box.seite <= w && box.fokus && box.stift === "1" && box.ziel >= 40,
    `${w} px: Schublade von links, Platz zum Danebentippen, nichts zu breit, Fokus drin, Stift ohne Hover sichtbar und groß genug (${Math.round(box.r)} px breit, Ziel ${Math.round(box.ziel)} px)`);
  await page.keyboard.press("Escape");
  await schubladeZu(page);
  pruefe(await page.evaluate(() => document.activeElement && document.activeElement.id === "kopf-menue"), `${w} px: Esc schließt die Schublade, Fokus zurück auf den Menü-Knopf`);
  await schubladeAuf(page);
  await page.mouse.click(w - 10, 420);
  await schubladeZu(page);
  await schubladeAuf(page);
  await page.click('#schublade-liste .gespraech-link:has-text("Was steht heute an?")');
  await schubladeZu(page);
  await page.waitForFunction(() => /Heute ist/.test(document.querySelector("#nachrichten").textContent) && !/Kieslingstraße/.test(document.querySelector("#nachrichten").textContent));
  pruefe(true, `${w} px: Tipp neben die Schublade schließt sie; Eintrag antippen öffnet das Gespräch und schließt sie`);
  await schubladeAuf(page);
  await page.locator('#schublade-liste .gespraech-eintrag:has-text("Was steht heute an?") [data-gespraech-aktion="umbenennen"]').click();
  await page.fill("#schublade-liste .gespraech-feld", "Mein Überblick");
  await page.press("#schublade-liste .gespraech-feld", "Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("#schublade-liste .gespraech-link")].some((a) => a.textContent === "Mein Überblick"));
  pruefe(await page.isVisible("#schublade[open]"), `${w} px: Umbenennen in der Schublade (Enter übernimmt, Schublade bleibt offen)`);
  await warte(200);
  if (w === 320) await page.screenshot({ path: join(aus, "handy-320-schublade.jpg"), type: "jpeg", quality: 85 });
  await page.keyboard.press("Escape");
  await schubladeZu(page);
  pruefe(konsole.length === 0, `${w} px Schublade: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3 Echte lokale API: Zugang, NDJSON-Strom, Spracherkennung, Fehler + Wiederholen, Speichern
// ---------------------------------------------------------------------------
if (!LIVE) {
  const ctx = await chrome.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"], acceptDownloads: true });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  const typen = [];
  page.on("response", (r) => { if (r.url().endsWith("/api/chat")) typen.push(r.headers()["content-type"]); });
  await page.goto(`${basis}/#/`);
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  await page.fill("#zugang-code", "test");
  await page.click("#zugang-weiter");
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  pruefe((await page.textContent("#test-badge")).includes("Testversion"), "Echte API: Zugang mit Code, Testversion-Badge");

  // 1. Versuch: HTTP-Fehler, 2. Versuch: Fehler mitten im Strom, 3. Versuch: echte Antwort
  let versuch = 0;
  await page.route("**/api/chat", (route) => {
    versuch++;
    if (versuch === 1) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ fehler: "Gabi ist gerade ausgelastet. Bitte gleich noch einmal versuchen." }) });
    if (versuch === 2) return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${JSON.stringify({ t: "status", text: "Durchsuche die Notizen …" })}\n${JSON.stringify({ t: "fehler", text: "KI-Dienst antwortet nicht (529)." })}\n` });
    return route.continue();
  });
  await fragen(page, "Was steht heute an?");
  await page.waitForSelector('[data-aktion="wiederholen"]');
  pruefe((await page.textContent(".von-gabi .hinweis-box")).includes("ausgelastet"), "Echte API: Fehler wird verständlich angezeigt");
  await page.click('[data-aktion="wiederholen"]');
  await page.waitForFunction(() => /529/.test(document.querySelector(".von-gabi .hinweis-box")?.textContent || ""));
  await page.click('[data-aktion="wiederholen"]');
  await antwortAbwarten(page, "Heute ist");
  pruefe(versuch === 3, "Echte API: „Nochmal versuchen“ auch nach einem Fehler mitten im Strom");
  pruefe(typen.at(-1) === "application/x-ndjson; charset=utf-8", "Echte API: „Nochmal versuchen“ klappt, Antwort kommt als NDJSON-Strom");

  // Diktat mit echter Aufnahme → Spracherkennung fällt einmal aus → Karte „nicht angekommen“ → Nochmal senden → Entwurf
  let erkennungAus = true;
  await page.route("**/api/transkribieren", (route) => (erkennungAus
    ? route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ fehler: "Spracherkennung gerade nicht erreichbar. Bitte nochmal versuchen." }) })
    : route.continue()));
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click();
  await mikroHalten(page, 4000);
  await page.waitForSelector('[data-aktion="aufnahme-senden"]', { timeout: 30000 });
  pruefe((await page.textContent(".hinweis-box.warn")).includes("nicht erreichbar"), "Echte API: Spracherkennung fällt aus → bleibende Karte, Aufnahme bleibt erhalten");
  erkennungAus = false;
  await page.click('[data-aktion="aufnahme-senden"]');
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 120000 });
  pruefe(/Nachgeschickt/.test(await page.textContent("#nachrichten")), "Echte API: „Nochmal senden“ schickt dieselbe Aufnahme nach, ohne neu zu sprechen");
  await antwortAbwarten(page, "Entwurf für TP-01", 30000);
  const diktat = await page.evaluate(() => [...document.querySelectorAll(".von-nutzer .blase")].pop().textContent);
  pruefe(/knie|treppe|flexion|schmerz|demo/i.test(diktat), `Echte API: Aufnahme erkannt („${diktat.replace(/\s+/g, " ").slice(0, 70)}…“)`);
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt");
  await page.click('.karte-entwurf.erledigt a[href*="/notizen/n/"]');
  await page.waitForSelector('[data-leser="pdf"]');
  pruefe((await page.textContent(".leser")).includes("TP-01"), "Echte API: Entwurf gespeichert und im Notizordner");

  // Nachgeschickte Aufnahme kommt leer zurück → Karte hängt nicht auf „Sende …“, nur „Verwerfen“ bleibt
  let erkennung = "aus";
  await page.unroute("**/api/transkribieren");
  await page.route("**/api/transkribieren", (route) => (erkennung === "aus"
    ? route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ fehler: "Spracherkennung gerade nicht erreichbar. Bitte nochmal versuchen." }) })
    : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "" }) })));
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await mikroHalten(page, 2000);
  await page.waitForSelector('.hinweis-box.warn [data-aktion="aufnahme-senden"]', { timeout: 30000 });
  erkennung = "leer";
  await page.locator('[data-aktion="aufnahme-senden"]').last().click();
  await page.waitForFunction(() => /nichts verstanden/.test([...document.querySelectorAll(".hinweis-box.warn")].pop()?.textContent || ""), null, { timeout: 30000 });
  const leerKarte = page.locator(".hinweis-box.warn").last();
  pruefe((await leerKarte.locator("button").count()) === 0 && (await leerKarte.textContent()).includes("Bitte noch einmal aufnehmen"),
    "Echte API: nachgeschickte Aufnahme kommt leer zurück → kein Hängen auf „Sende …“, Hinweis „noch einmal aufnehmen“");
  await page.click("#seite-neu");
  const nachLeer = await page.waitForSelector("#dialog-frage[open]", { timeout: 1500 }).then(() => page.textContent("#frage-text")).catch(() => "");
  if (nachLeer) await page.click("#frage-nein");
  pruefe(!nachLeer, `Echte API: „Neues Gespräch“ fragt nicht – nichts geht verloren${nachLeer ? ` („${nachLeer}“)` : ""}`);
  await page.unroute("**/api/transkribieren");

  // v2.1 B: Platzhalter erst nach 150 ms (langsame Leitung) – zweiter Besuch sofort aus dem Zwischenspeicher
  await page.evaluate(() => fetch("/api/patienten", { method: "POST", headers: { "X-Gabi-Zugang": "test", "Content-Type": "application/json" }, body: JSON.stringify({ kuerzel: "TP-11", pseudonym: "Testfall Platzhalter (fiktiv)" }) }));
  await page.reload(); // Zwischenspeicher leer
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  let verzoegerung = 60;
  await page.route("**/api/notizen?patient_id=*", async (route) => { await warte(verzoegerung); await route.continue(); });
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector('.patient-karte:has-text("TP-11")');
  await page.evaluate(RUHE_MESSEN);
  await page.click('.patient-karte:has-text("TP-01")');
  await page.waitForSelector(".notiz-karte");
  const schnell = await page.evaluate(() => window.__ruhe.platzhalter);
  await page.click("a.zurueck");
  await page.waitForSelector('.patient-karte:has-text("TP-11")');
  verzoegerung = 700;
  await page.click('.patient-karte:has-text("TP-11")');
  await warte(80);
  const frueh = await page.evaluate(() => ({ skelett: Boolean(document.querySelector("#haupt .skelett")), alt: [...document.querySelectorAll(".patient-karte")].some((k) => /TP-11/.test(k.textContent)) }));
  await page.waitForSelector("#haupt .skelett", { timeout: 2000 });
  await page.waitForSelector('.leer h2:has-text("TP-11")', { timeout: 5000 });
  pruefe(schnell === 0, `Echte API: schnelle Antwort (60 ms) – kein Platzhalter, der alte Inhalt bleibt bis zum neuen (${schnell} Bilder)`);
  pruefe(frueh.alt && !frueh.skelett, "Echte API: langsame Leitung – in den ersten 150 ms bleibt der alte Inhalt stehen, erst dann der Platzhalter");
  await page.click("a.zurueck");
  await page.waitForSelector('.patient-karte:has-text("TP-11")');
  await page.evaluate(() => { window.__ruhe.platzhalter = 0; });
  await page.click('.patient-karte:has-text("TP-11")');
  await page.waitForSelector('.leer h2:has-text("TP-11")', { timeout: 300 }); // sofort aus dem Zwischenspeicher
  await warte(900); // im Hintergrund wird aufgefrischt (700 ms) – ohne Platzhalter
  const zweiter = await page.evaluate(() => window.__ruhe.platzhalter);
  pruefe(zweiter === 0, `Echte API: zweiter Besuch – sofort aus dem Zwischenspeicher, auch bei langsamer Leitung kein Platzhalter (${zweiter})`);
  await page.unroute("**/api/notizen?patient_id=*");

  // v2.1 C: Demo- und echte Gespräche getrennt
  const echteTitel = await listenTitel(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  const demoVorher = await listenTitel(page);
  await fragen(page, "Wo sind die Standorte?");
  await antwortAbwarten(page, "Kieslingstraße");
  await page.goto(`${basis}/#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await page.waitForSelector("#seiten-gespraeche .gespraech-link");
  const echtNachher = await listenTitel(page);
  pruefe(echteTitel.length > 0 && !demoVorher.some((t) => echteTitel.includes(t)) && echtNachher.join("|") === echteTitel.join("|") && !echtNachher.includes("Wo sind die Standorte?"),
    `Echte API: Demo- und echte Gespräche liegen getrennt (echt: ${echteTitel.join(", ")}; Demo vorher: ${demoVorher.length})`);

  // v2.1 C: Abmelden fragt „Gespräche auf diesem Gerät auch löschen?“ (Vorgabe: ja)
  const abmelden = async () => {
    await page.click("#test-badge");
    await page.waitForSelector("#dialog-info[open]");
    await page.click("#info-abmelden");
    await page.waitForSelector("#dialog-frage[open]");
  };
  const anmelden = async () => {
    await page.fill("#zugang-code", "test");
    await page.click("#zugang-weiter");
    await page.waitForSelector("#ansicht-chat:not([hidden])");
  };
  await abmelden();
  const haken = await page.evaluate(() => ({ sichtbar: !document.querySelector("#frage-haken-zeile").hidden, an: document.querySelector("#frage-haken").checked, text: document.querySelector("#frage-haken-text").textContent }));
  await page.uncheck("#frage-haken");
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  const bleiben = (await ablageTitel(page, "gabi")) || [];
  await anmelden();
  await page.waitForSelector("#seiten-gespraeche .gespraech-link");
  const nachAnmelden = await listenTitel(page);
  pruefe(haken.sichtbar && haken.an && /Gespräche auf diesem Gerät auch löschen/.test(haken.text) && bleiben.length === echteTitel.length && nachAnmelden.length === echteTitel.length,
    "Echte API: Abmelden fragt „Gespräche auf diesem Gerät auch löschen?“ (Häkchen vorbelegt) – ohne Häkchen bleiben sie");
  await abmelden();
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  await warte(200);
  const weg = (await ablageTitel(page, "gabi")) || [];
  const demoWeg = (await ablageTitel(page, "gabi-demo")) || [];
  // Reste mit Inhalt: Gesprächs-Schlüssel oder Gesprächstext in irgendeinem Wert (Marken wie „geleert-am“ oder die Liste
  // gelöschter IDs enthalten keinen Inhalt und dürfen bleiben)
  const reste = await page.evaluate((woerter) => {
    const inhaltSchluessel = /gespraeche\.v1|gespraech\.v1\.|gespraech\.v2|notfall|entwurf/;
    const funde = [];
    for (const [name, ablage] of [["local", localStorage], ["session", sessionStorage]]) {
      for (const k of Object.keys(ablage)) {
        const v = ablage.getItem(k) || "";
        if (inhaltSchluessel.test(k) || woerter.some((w) => v.includes(w))) funde.push(`${name}:${k}`);
      }
    }
    return funde;
  }, ["Was steht heute an", "Wo sind die Standorte", "Heute ist"]);
  await anmelden();
  const nachAbmelden = { weg, demoWeg, reste };
  // Abmelden + Löschen, während noch eine Spracherkennung läuft: das Ergebnis darf kein Gespräch zurückbringen
  await fragen(page, "Was steht heute an?");
  await antwortAbwarten(page, "Heute ist");
  let freigeben = null;
  await page.route("**/api/transkribieren", async (route) => { await new Promise((r) => { freigeben = r; }); await route.continue(); });
  await mikroHalten(page, 1500);
  await page.waitForFunction(() => Boolean(document.querySelector(".eingabe.erkennt")), null, { timeout: 8000 });
  await abmelden();
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  await anmelden();
  freigeben(); // jetzt erst kommt die Spracherkennung zurück
  await page.waitForFunction(() => /Aufnahme wurde verworfen/.test(document.querySelector("#toasts").textContent), null, { timeout: 30000 });
  await warte(500);
  const zurueck = (await ablageTitel(page, "gabi")) || [];
  await page.unroute("**/api/transkribieren");
  pruefe(!zurueck.length && /Noch keine Gespräche/.test(await page.textContent("#seiten-gespraeche")) && (await page.locator("#nachrichten .nachricht").count()) === 0,
    "Echte API: Spracherkennung, die erst nach „Abmelden + Gespräche löschen“ zurückkommt, bringt nichts zurück (Hinweis, Aufnahme verworfen)");
  pruefe(nachAbmelden.weg.length === 0 && nachAbmelden.demoWeg.length === 0 && !nachAbmelden.reste.length,
    `Echte API: Abmelden mit Häkchen löscht alle Gespräche auf diesem Gerät (IndexedDB echt und Demo, keine Reste in local-/sessionStorage${nachAbmelden.reste.length ? `: ${nachAbmelden.reste.join(", ")}` : ""})`);
  pruefe(konsole.length === 0, `Echte API: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}
await chrome.close();

// ---------------------------------------------------------------------------
// 4 Safari-Engine (WebKit): Demo ohne Mikrofon bis zum PDF
// ---------------------------------------------------------------------------
{
  const safari = await webkit.launch();
  const ctx = await safari.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  await page.click('.vorschlag[data-schnell="diktat"]');
  await page.click('[data-aktion="waehle"]:has-text("TP-01")');
  await page.click('[data-aktion="beispiel"]');
  await page.waitForSelector(".karte-entwurf");
  await antwortAbwarten(page, "Entwurf für TP-01");
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt");
  await page.click('#chips-leiste [data-schnell="bericht"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click();
  await page.locator('[data-aktion="waehle"][data-wert="verlauf"]').last().click();
  await page.waitForSelector(".karte-bericht");
  const pdf = await pdfLaden(page, '[data-aktion="bericht-pdf"]', /^PhysioWorks_Bericht_TP-01_/);
  pruefe(pdf.ok, `safari: Diktat → Entwurf → Speichern → Bericht als PDF (${pdf.name})`);
  const adresse = page.url();
  await page.reload();
  await page.waitForSelector(".karte-bericht", { timeout: 15000 });
  await schubladeAuf(page);
  pruefe(GESPRAECH_URL.test(adresse) && page.url() === adresse && (await listenTitel(page, "#schublade-liste")).length === 1,
    "safari: Gespräch mit eigener Adresse übersteht das Neuladen (IndexedDB in WebKit), Schublade zeigt es");
  pruefe(konsole.length === 0, `safari: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await safari.close();
}

console.log(fehler.length ? `\n${fehler.length} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler.length ? 1 : 0);
