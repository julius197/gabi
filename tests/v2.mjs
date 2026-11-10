// Ende-zu-Ende-Tests für Gabi v2.1 (Gespräch + Gesprächsverlauf + Notizordner), ohne Secrets.
//  1  Demo-Modus komplett: Handy (390 px) und Laptop (1440 px), jeweils Hell und Dunkel – mit Screenshots
//     (auch Seitenleiste bzw. Schublade mit dem Gesprächsverlauf)
//  2  Robustheit: 320 px, automatisch Demo, Offline, Mikrofon verweigert, Stopp, Fehler + „Nochmal versuchen“, Vorlesen
//  2b v2.1: Schein ohne Kante (Pixelmessung, 390/768/1440, Hell/Dunkel), ruhige Wechsel (10 schnelle Runden, gezählt),
//     v2.1.1: Häkchen „Gespeichert“ zeichnet nur einmal (nie bei Rückkehr, Wechsel, Neuladen; reduziert: gar nicht),
//     Gesprächsverlauf (Laptop), Schublade (Handy, 320 px), zwei Tabs, Übernahme aus v2.0
//     v2.1.1: Übernahme aus dem Notizordner und mit zwei Tabs, derselbe Entwurf in zwei Tabs (speichern/verwerfen/zu spät),
//     „Neues Gespräch“ bei bearbeiteter Notiz (4 Wege), Beispiel-Chip gehört zu seinem Diktat-Modus
//  3  Echte lokale API (Worker-Logik, NDJSON-Strom, Spracherkennung, Speichern) – ohne KI-Schlüssel;
//     dazu: Platzhalter erst nach 150 ms, getrennte Demo-/Echt-Ablage, Abmelden mit „Gespräche auch löschen“
//     v2.1.1: nie eine Anfrage ohne Code, Entwurf + Abbruch ohne „Nochmal versuchen“, zwei Entwürfe in zwei Tabs (Fokus
//     bleibt), Such-Platzhalter mit Kopfzeile (kein Sprung), Patienten-Auswahl lädt nach ohne alten Fehler, Abmelden in
//     fester Reihenfolge (Speichern abwarten, Fehler bleiben, „Abgebrochen.“, Notiz-Warnung, Reste leer, 401 → „Jetzt senden“)
//  3b v2.1.1: Neuladen mitten in der Antwort → „unterbrochen“ (Chromium und WebKit), echter Netzfehler bleibt, zwei Tabs
//  3c v2.1.1 Nachprüfung: Netzfehler + zweiter Tab, Karte übersteht Neuladen im Strom, Speicher-Sperre mit Hinweis/Frist,
//     Abmelden mit Häkchen löscht sofort (Tab zu im Wartefenster), zweiter Tab wartet auf die Sperre, Frist je Anfrage,
//     401 beim Abmelden wird genannt, Ladetext für Screenreader, Korrektur am Entwurf nach Netzfehler in zwei Tabs;
//     dazu in 3: langer Suchbegriff, Fokus nach dem Umsortieren;
//     in 4b: Safari mit „Bewegung reduzieren“ (☰ ohne Ring), Info-Dialog → Fokus zurück aufs Badge
//  4  Safari-Engine (WebKit): Demo bis zum PDF, Gesprächsverlauf in IndexedDB, zwei Tabs mit demselben Entwurf
//  4b v2.1.1: Fokus rund um die Schublade und nach Rückfragen (WebKit und Chromium, Tippen/Tastatur, Laptop mit Maus)
//  5  v2.1.2: Eingabefelder ohne Anschnitt – Cursor am Zeilenanfang, „gyÄÖ“, Platzhalter, 5 Zeilen, scrollWidth
//     (Chromium und WebKit, 320/390/1440 px, Hell/Dunkel; dazu bei 390/1440 px Suche, Umbenennen, Zugangscode, Entwurf,
//     Neuer Test-Patient)
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

  // v2.1.1: v2.0 → v2.1, Tab stand im Notizordner: das übernommene Gespräch bleibt offen, „Gespräch“ führt hin (Fund 7)
  for (const [ort, w, knopf] of [["#/notizen", 1440, '.navi a[data-navi="chat"]'], ["#/notizen/n/7e3c1a52-0101-4000-8000-000000000101", 390, "#kopf-wechsel"]]) {
    const c = await chrome.newContext({ viewport: { width: w, height: w > 1000 ? 900 : 844 } });
    await stumm(c);
    await c.addInitScript(() => {
      if (sessionStorage.getItem("test.v20-gesetzt")) return;
      sessionStorage.setItem("test.v20-gesetzt", "1");
      sessionStorage.setItem("gabi.demo.gespraech.v2", JSON.stringify({ nachrichten: [
        { id: "b1", rolle: "nutzer", text: "Frage aus Version 2.0 im Notizordner" },
        { id: "b2", rolle: "gabi", text: "Antwort aus Version 2.0.", karten: [], quellen: [] },
      ] }));
    });
    const p = await c.newPage();
    const k = konsoleBeobachten(p);
    await p.goto(`${basis}/?demo=1${ort}`);
    await p.waitForSelector("#ansicht-notizen:not([hidden])");
    await warte(300);
    const href = await p.getAttribute(knopf, "href");
    const aktiv = await p.evaluate(() => document.querySelectorAll('.gespraech-link[aria-current="true"]').length);
    await p.click(knopf);
    await p.waitForFunction(() => /Antwort aus Version 2\.0/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 5000 }).catch(() => {});
    const s = await p.evaluate(() => ({ hash: location.hash, n: document.querySelectorAll("#nachrichten .nachricht").length }));
    pruefe(GESPRAECH_URL.test(href) && s.hash === href && s.n === 2 && aktiv >= 1 && k.length === 0,
      `Übergang v2.0 aus dem Notizordner (${w} px): „Gespräch“ öffnet das übernommene Gespräch (${s.hash.slice(0, 22)}, ${s.n} Nachrichten)`);
    await c.close();
  }

  // v2.1.1: zwei Tabs – B läuft schon mit v2.1, A übernimmt beim Start sein v2.0-Gespräch mit offenem Entwurf → B erfährt es (Fund 8)
  const c8 = await chrome.newContext({ viewport: { width: 1440, height: 900 } });
  await stumm(c8);
  const B8 = await c8.newPage();
  const kB8 = konsoleBeobachten(B8);
  await B8.goto(`${basis}/?demo=1#/`);
  await B8.waitForSelector("#ansicht-chat:not([hidden])");
  await fragen(B8, "Frage aus Tab B");
  await ruhigWarten(B8);
  const A8 = await c8.newPage();
  await A8.addInitScript(() => {
    if (sessionStorage.getItem("test.v20-gesetzt")) return;
    sessionStorage.setItem("test.v20-gesetzt", "1");
    sessionStorage.setItem("gabi.demo.gespraech.v2", JSON.stringify({ nachrichten: [
      { id: "c1", rolle: "nutzer", text: "Knie rechts, Flexion 100 Grad", art: "diktat", kuerzel: "TP-01" },
      { id: "c2", rolle: "gabi", text: "Hier ist dein Entwurf für **TP-01**.", quellen: [], karten: [{ typ: "entwurf", id: "c3", patient_id: "7e3c1a52-0001-4000-8000-000000000001", kuerzel: "TP-01", pseudonym: "", rohtext: "Knie rechts, Flexion 100 Grad",
        strukturiert: { befund: ["Flexion 100°"], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] } }] },
    ] }));
  });
  await A8.goto(`${basis}/?demo=1#/`);
  await A8.waitForSelector(".karte-entwurf");
  await B8.bringToFront();
  const inB = await B8.waitForFunction(() => document.querySelectorAll("#seiten-gespraeche .gespraech-link").length === 2, null, { timeout: 5000 }).then(() => true).catch(() => false);
  await B8.click('#seiten-gespraeche [data-gespraeche="alle-loeschen"]');
  await B8.waitForSelector("#dialog-frage[open]");
  const text8 = await B8.textContent("#frage-text");
  await B8.click("#frage-nein");
  pruefe(inB && /^Alle 2 Gespräche/.test(text8) && /Ein Entwurf ist noch nicht gespeichert/.test(text8) && kB8.length === 0,
    `Übergang v2.0, zwei Tabs: das übernommene Gespräch erscheint im anderen Tab, „Alle löschen“ zählt dort richtig (${text8.slice(0, 60)}…)`);
  await c8.close();

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
    // alle einmaligen Animationen (nur Endlosschleifen wie Schimmern oder Tipp-Punkte ausgenommen)
    if (/^(drehen|schimmern|blinken|denken|locken|pulsieren|welle)$/.test(e.animationName) || !t.closest || !t.closest("#haupt")) return;
    r.animationen.push(`${e.animationName}: ${t.getAttribute("class") || t.tagName}`); // in den Runden kommt nichts Neues dazu – jede Animation ist ein Neustart
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

// 2b v2.1.1: Häkchen „Gespeichert bei …“ zeichnet sich genau einmal (mit „Bewegung reduzieren“ gar nicht) – nie bei Rückkehr
// ins Gespräch, Gesprächswechsel oder Neuladen (v2.1.0: bei jeder Rückkehr ~80 ms leerer Kreis, dann neu gezeichnet).
// Eigene Messung mit Verweilzeit: Die schnellen Runden oben sind kürzer als die 80 ms Verzögerung und sähen den Neustart nicht.
const HAKEN_MESSEN = () => {
  const r = { starts: [], bilder: [] };
  window.__haken = r;
  document.addEventListener("animationstart", (e) => { if (e.animationName === "zeichnen") r.starts.push(performance.now()); }, true);
  const bild = () => {
    const p = document.querySelector("#ansicht-chat:not([hidden]) .karte-entwurf.erledigt .haken path");
    if (p) r.bilder.push([performance.now(), parseFloat(getComputedStyle(p).strokeDashoffset)]);
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
};
const hakenSeit = (page, t) => page.evaluate((t0) => {
  const r = window.__haken;
  return { starts: r.starts.filter((x) => x >= t0).length, luecken: r.bilder.filter(([x, off]) => x >= t0 && off > 0.5).length };
}, t);
async function hakenRuhe(geraet, { wenigBewegung = false } = {}) {
  const mobil = geraet === "handy";
  const name = `Häkchen ${geraet}${wenigBewegung ? " (Bewegung reduziert)" : ""}`;
  const ctx = await chrome.newContext({ viewport: mobil ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobil, hasTouch: mobil, reducedMotion: wenigBewegung ? "reduce" : "no-preference" });
  await stumm(ctx);
  await ctx.addInitScript(HAKEN_MESSEN);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  await page.click('.vorschlag[data-schnell="diktat"]');
  await page.click('[data-aktion="waehle"]:has-text("TP-01")');
  await page.click('[data-aktion="beispiel"]');
  await antwortAbwarten(page, "Entwurf für TP-01");
  const jetzt = () => page.evaluate(() => performance.now());
  let t = await jetzt();
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt .haken");
  await warte(700);
  const speichern = await hakenSeit(page, t);
  const zuNotizen = () => (mobil ? page.click("#kopf-wechsel") : page.click('.navi a[data-navi="notizen"]'));
  const zumGespraech = () => (mobil ? page.click("#kopf-wechsel") : page.click('.navi a[data-navi="chat"]'));
  t = await jetzt();
  for (let i = 0; i < 4; i++) {
    await zuNotizen(); await page.waitForSelector("#ansicht-notizen:not([hidden]) .patient-karte");
    await zumGespraech(); await page.waitForSelector("#ansicht-chat:not([hidden]) .karte-entwurf.erledigt");
    await warte(500); // länger als die 80 ms Verzögerung der Animation
  }
  const rueckkehr = await hakenSeit(page, t);
  const adresse = await page.evaluate(() => location.hash);
  await page.click(mobil ? "#kopf-neu" : "#seite-neu");
  await page.waitForFunction(() => !document.querySelector("#nachrichten .karte-entwurf"));
  t = await jetzt();
  await page.evaluate((a) => { location.hash = a; }, adresse);
  await page.waitForSelector("#nachrichten .karte-entwurf.erledigt .haken");
  await warte(500);
  const wechsel = await hakenSeit(page, t);
  await page.reload();
  await page.waitForSelector("#nachrichten .karte-entwurf.erledigt .haken");
  await warte(500);
  const neuladen = await hakenSeit(page, 0);
  await ctx.close();
  pruefe(wenigBewegung ? speichern.starts === 0 && speichern.luecken === 0 : speichern.starts === 1,
    `${name}: nach „Speichern“ ${wenigBewegung ? "gleich fertig, ohne Zeichnen" : "genau einmal gezeichnet"} (${speichern.starts} Starts, ${speichern.luecken} Bilder mit Lücke)`);
  pruefe(rueckkehr.starts === 0 && rueckkehr.luecken === 0, `${name}: 4 Rückkehren ins Gespräch – nichts zeichnet sich neu (${rueckkehr.starts} Starts, ${rueckkehr.luecken} Bilder mit Lücke)`);
  pruefe(wechsel.starts + neuladen.starts === 0 && wechsel.luecken + neuladen.luecken === 0,
    `${name}: Gesprächswechsel und Neuladen – Häkchen steht fertig da (${wechsel.starts + neuladen.starts} Starts, ${wechsel.luecken + neuladen.luecken} Bilder mit Lücke)`);
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
}
for (const [geraet, wenigBewegung] of [["handy", false], ["laptop", false], ["laptop", true]]) await hakenRuhe(geraet, { wenigBewegung });

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
// 2b v2.1.1: zwei Tabs und derselbe Entwurf · „Neues Gespräch“ bei bearbeiteter Notiz · Beispiel-Chip (nur Demo)
// ---------------------------------------------------------------------------
/**
 * Zwei Tabs, derselbe Entwurf: B hat ihn zum Bearbeiten offen, A speichert oder verwirft ihn. B übernimmt den
 * Endzustand (Bearbeiten endet, Hinweis), nichts öffnet den Entwurf wieder, es entsteht keine zweite Notiz.
 * verzoegert: B erfährt es 2,5 s zu spät (BroadcastChannel verzögert) und schreibt in der Zeit selbst – die Ablage
 * behält „gespeichert“/„verworfen“ trotzdem (Lesen und Schreiben in einem IndexedDB-Vorgang).
 */
async function entwurfZweiTabs(browser, name, { art = "speichern", verzoegert = false } = {}) {
  const cx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await stumm(cx);
  const a = await cx.newPage();
  const b = await cx.newPage();
  if (verzoegert) {
    await b.addInitScript(() => {
      const Kanal = window.BroadcastChannel;
      window.BroadcastChannel = class extends Kanal {
        set onmessage(f) { super.onmessage = f ? (e) => setTimeout(() => f(e), 2500) : null; }
        get onmessage() { return super.onmessage; }
      };
    });
  }
  const ka = konsoleBeobachten(a);
  const kb = konsoleBeobachten(b);
  for (const p of [a, b]) { await p.goto(`${basis}/?demo=1#/`); await p.waitForSelector("#ansicht-chat:not([hidden])"); }
  const notizenTP03 = () => a.evaluate(() => { const d = JSON.parse(localStorage.getItem("gabi.demo.v1")); const id = d.patienten.find((x) => x.kuerzel === "TP-03").id; return d.notizen.filter((n) => n.patient_id === id).length; });
  const ablageKarte = () => a.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open("gabi-demo", 1);
    r.onsuccess = () => { const q = r.result.transaction("inhalt").objectStore("inhalt").getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.flatMap((x) => x.nachrichten).flatMap((n) => n.karten || []).find((k) => k.typ === "entwurf") || {}); }; };
  }));
  await a.bringToFront();
  await a.click('.vorschlag[data-schnell="diktat"]');
  await a.locator('[data-aktion="waehle"]:has-text("TP-03")').last().click();
  await a.locator('[data-aktion="beispiel"]:not([disabled])').last().click();
  await a.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
  await antwortAbwarten(a, "Entwurf für TP-03");
  const n0 = await notizenTP03();
  await b.bringToFront();
  await b.waitForFunction(() => [...document.querySelectorAll("#seiten-gespraeche .gespraech-link")].some((x) => /Diktat TP-03/.test(x.textContent)), null, { timeout: 8000 });
  await b.click('#seiten-gespraeche .gespraech-link:has-text("Diktat TP-03")');
  await b.click(".karte-entwurf [data-aktion='entwurf-bearbeiten']");
  await b.locator(".karte-entwurf textarea").first().click();
  await b.keyboard.type(" B");
  await warte(verzoegert ? 3000 : 700);
  await a.bringToFront();
  if (art === "verwerfen") {
    await a.click(".karte-entwurf [data-aktion='entwurf-verwerfen']");
    await a.click("#frage-ja");
    await a.waitForSelector(".karte-entwurf.verworfen");
  } else {
    await a.click(".karte-entwurf [data-aktion='entwurf-speichern']");
    await a.waitForSelector(".karte-entwurf.erledigt");
  }
  await b.bringToFront();
  if (verzoegert) { await warte(150); await b.keyboard.type("x"); } // B schreibt, bevor es davon weiß
  const ziel = art === "verwerfen" ? ".karte-entwurf.verworfen" : ".karte-entwurf.erledigt:not(.verworfen)";
  const bUebernimmt = await b.waitForSelector(ziel, { timeout: 6000 }).then(() => true).catch(() => false);
  await warte(verzoegert ? 3500 : 800);
  const hinweis = await b.textContent("#toasts");
  const fokusB = await b.evaluate(() => (document.activeElement === document.body ? "body" : document.activeElement.tagName));
  const ablage = await ablageKarte();
  const nochOffen = (await a.locator(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']").count())
    + (await b.locator(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern'], .karte-entwurf textarea").count());
  const endzustand = art === "verwerfen" ? ablage.verworfen && !ablage.gespeichert : Boolean(ablage.gespeichert);
  pruefe(bUebernimmt && nochOffen === 0 && endzustand && /anderen Fenster (gespeichert|verworfen)/.test(hinweis) && fokusB !== "body"
    && (await notizenTP03()) === n0 + (art === "verwerfen" ? 0 : 1) && !ka.length && !kb.length,
  `${name}: zwei Tabs – A ${art === "verwerfen" ? "verwirft" : "speichert"} den Entwurf, den B gerade bearbeitet${verzoegert ? " (B erfährt es zu spät und schreibt selbst)" : ""} → B übernimmt es mit Hinweis (Fokus ${fokusB}), nichts öffnet ihn wieder, keine zweite Notiz`);
  await cx.close();
}
for (const o of [{ art: "speichern" }, { art: "verwerfen" }, { art: "speichern", verzoegert: true }]) await entwurfZweiTabs(chrome, "Verlauf", o);

{ // „Neues Gespräch“ bei bearbeiteter Notiz – erst fragen; „Weiter bearbeiten“ lässt alles beim Alten (alle Wege)
  const NOTIZ = "#/notizen/n/7e3c1a52-0102-4000-8000-000000000102";
  for (const weg of ["seitenleiste", "tastatur", "kopf", "schublade"]) {
    const handy = weg === "kopf" || weg === "schublade";
    const ctx = await chrome.newContext({ viewport: handy ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: handy, hasTouch: handy });
    await stumm(ctx);
    const page = await ctx.newPage();
    const konsole = konsoleBeobachten(page);
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector(".vorschlag");
    await fragen(page, "Was wollte TP-01?");
    await antwortAbwarten(page, "TP-01");
    const a = page.url();
    await page.evaluate((h) => { location.hash = h; }, NOTIZ);
    await page.waitForSelector('[data-leser="bearbeiten"]');
    await page.click('[data-leser="bearbeiten"]');
    await page.locator("#ansicht-notizen textarea").first().fill("Test: weiter bearbeiten");
    const links = () => page.evaluate(() => [document.querySelector('.navi a[data-navi="chat"]').getAttribute("href"), document.querySelector("#kopf-wechsel").getAttribute("href"), document.querySelector('#seiten-gespraeche [aria-current="true"]')?.getAttribute("href") || ""].join(" "));
    const vorher = await links();
    const neu = async () => {
      if (weg === "seitenleiste") await page.click("#seite-neu");
      else if (weg === "tastatur") { await page.focus("#seite-neu"); await page.keyboard.press("Enter"); }
      else if (weg === "kopf") await page.click("#kopf-neu");
      else { await schubladeAuf(page); await page.click("#schublade [data-gespraech-neu]"); }
      await page.waitForSelector("#dialog-frage[open]");
    };
    await neu();
    const frage = `${await page.textContent("#frage-titel")} [${await page.textContent("#frage-nein")}]`;
    await page.click("#frage-nein");
    await warte(400);
    const nachher = await links();
    const text = await page.locator("#ansicht-notizen textarea").first().inputValue();
    // Schublade: ist vor der Rückfrage zugegangen – „Weiter bearbeiten“ führt direkt in die Notiz, Fokus auf ☰ (nicht auf body)
    const lage = await page.evaluate(() => {
      const t = document.querySelector("#ansicht-notizen textarea").getBoundingClientRect();
      const oben = document.elementFromPoint(t.left + t.width / 2, t.top + Math.min(20, t.height / 2));
      return { schublade: document.querySelector("#schublade").open, frei: Boolean(oben && oben.closest("#ansicht-notizen")), fokus: document.activeElement.id || document.activeElement.tagName };
    });
    pruefe(frage === "Änderungen verwerfen? [Weiter bearbeiten]" && nachher === vorher && text === "Test: weiter bearbeiten" && page.url().endsWith(NOTIZ)
      && !lage.schublade && lage.frei && (weg !== "schublade" || lage.fokus === "kopf-menue"),
    `Neues Gespräch (${weg}) bei bearbeiteter Notiz → „Weiter bearbeiten“: Notiz und Getipptes bleiben, offenes Gespräch und Links unverändert (${JSON.stringify(lage)})`);
    await neu(); // jetzt „Verwerfen“: neues leeres Gespräch, das alte bleibt in der Liste
    await page.click("#frage-ja");
    await page.waitForFunction(() => location.hash === "#/" && !document.querySelector("#willkommen").hidden && !document.querySelector("#ansicht-chat").hidden);
    if (handy) await schubladeZu(page);
    const liste = await page.$$eval(`${handy ? "#schublade-liste" : "#seiten-gespraeche"} .gespraech-link`, (x) => x.map((l) => l.getAttribute("href")));
    pruefe(liste.includes(`#${a.split("#")[1]}`), `Neues Gespräch (${weg}) → „Verwerfen“: neues leeres Gespräch, das alte bleibt in der Liste`);
    pruefe(konsole.length === 0, `Neues Gespräch (${weg}): keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
    await ctx.close();
  }
}

{ // Beispiel-Chip gehört zu seinem Diktat-Modus – gesperrt nach Wechsel/Rückkehr, ✕, neuem Patienten, im zweiten Tab;
  // Klick + schneller Wechsel → Hinweis statt stillem Verlust, nie im falschen Gespräch oder beim falschen Patienten
  const ctx = await chrome.newContext({ viewport: { width: 1440, height: 900 } });
  await stumm(ctx);
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector(".vorschlag");
  const oeffnen = async (t) => { await page.click(`#seiten-gespraeche .gespraech-link:has-text("${t}")`); await page.waitForFunction((x) => document.querySelector('#seiten-gespraeche [aria-current="true"]')?.textContent.includes(x), t); };
  const diktat = async (k) => { await page.click('#chips-leiste [data-schnell="diktat"]'); await page.locator(`[data-aktion="waehle"]:has-text("${k}")`).last().click(); await page.waitForSelector("#modus-pill:not([hidden])"); };
  const chips = () => page.$$eval('#nachrichten [data-aktion="beispiel"]', (c) => c.map((x) => !x.disabled));
  await fragen(page, "Was steht heute an?");
  await antwortAbwarten(page, "Heute");
  await page.click("#seite-neu");
  await page.waitForFunction(() => location.hash === "#/");
  await fragen(page, "Wo sind die Standorte?");
  await antwortAbwarten(page, "Kieslingstraße");
  // a) Wechsel und Rückkehr
  await diktat("TP-01");
  const an = (await chips()).at(-1);
  await oeffnen("Was steht heute an");
  await oeffnen("Wo sind die Standorte");
  pruefe(an && (await chips()).at(-1) === false && await page.isHidden("#modus-pill"), "Beispiel-Chip: nach Wechsel und Rückkehr gesperrt wie nach dem Neuladen (kein „Wähle zuerst …“)");
  // b) zweiter Tab mit demselben Gespräch (VOR dem Diktat geöffnet), dann Diktat hier: dort gesperrt
  const tab2 = await ctx.newPage();
  await tab2.goto(page.url());
  await tab2.waitForSelector("#seiten-gespraeche .gespraech-link");
  await diktat("TP-01");
  await tab2.waitForFunction(() => document.querySelectorAll('#nachrichten [data-aktion="beispiel"]').length === 2, null, { timeout: 5000 });
  pruefe(await tab2.locator('[data-aktion="beispiel"]').last().isDisabled() && (await chips()).at(-1), "Beispiel-Chip: im zweiten Tab gesperrt, im eigenen aktiv");
  await tab2.close();
  // c) ✕ beendet den Modus → gesperrt; d) neuer Patient → alter gesperrt, neuer aktiv
  await page.click("#modus-weg");
  const nachKreuz = (await chips()).at(-1);
  await diktat("TP-01");
  await diktat("TP-02");
  const zwei = (await chips()).slice(-2);
  pruefe(nachKreuz === false && zwei[0] === false && zwei[1] === true, `Beispiel-Chip: ✕ sperrt ihn, ein neues Diktat sperrt den alten (${JSON.stringify(zwei)})`);
  // e) Klick und sofort ein anderes Gespräch: Hinweis, nirgends ein Diktat
  await page.locator('#nachrichten [data-aktion="beispiel"]:not([disabled])').last().click();
  await oeffnen("Was steht heute an");
  await page.waitForFunction(() => /Beispieldiktat wurde nicht gesendet/.test(document.querySelector("#toasts").textContent), null, { timeout: 3000 }).catch(() => {});
  const hinweis = /Beispieldiktat wurde nicht gesendet/.test(await page.textContent("#toasts"));
  await warte(1500);
  const inX = await page.textContent("#nachrichten");
  await oeffnen("Wo sind die Standorte");
  await ruhigWarten(page);
  const inB = await page.textContent("#nachrichten");
  pruefe(hinweis && !/Diktat · TP-0/.test(inX) && !/Diktat · TP-0/.test(inB), "Beispiel-Chip + schneller Wechsel: Hinweis „… wurde nicht gesendet“, kein Diktat im fremden oder eigenen Gespräch");
  // f) Klick, dann sofort ein Diktat für einen anderen Patienten: das Beispiel geht nicht raus, der neue Modus bleibt
  await diktat("TP-01");
  await page.locator('#nachrichten [data-aktion="beispiel"]:not([disabled])').last().click();
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-03")').last().click();
  await page.waitForFunction(() => /Beispieldiktat wurde nicht gesendet/.test(document.querySelector("#toasts").textContent), null, { timeout: 3000 }).catch(() => {});
  await warte(1200);
  pruefe(/Diktat für TP-03/.test(await page.textContent("#modus-pill")) && !/Diktat · TP-0/.test(await page.textContent("#nachrichten")) && (await page.locator(".karte-entwurf").count()) === 0,
    "Beispiel-Chip + sofort Diktat für einen anderen Patienten: kein Beispiel beim falschen Patienten, der neue Diktat-Modus bleibt");
  // g) normaler Ablauf bleibt
  await page.locator('#nachrichten [data-aktion="beispiel"]:not([disabled])').last().click();
  await page.waitForSelector(".karte-entwurf");
  await antwortAbwarten(page, "Entwurf für TP-03");
  pruefe(/Diktat · TP-03 · Beispiel/.test(await page.textContent("#nachrichten")) && (await chips()).at(-1) === false, "Beispiel-Chip: normaler Ablauf → Entwurf für TP-03, Chip verbraucht");
  pruefe(konsole.length === 0, `Beispiel-Chip: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3 Echte lokale API: Zugang, NDJSON-Strom, Spracherkennung, Fehler + Wiederholen, Speichern
// ---------------------------------------------------------------------------
if (!LIVE) {
  const ctx = await chrome.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"], acceptDownloads: true });
  await stumm(ctx);
  // v2.1.1: nie eine Worker-Anfrage ohne Zugangscode (der Worker zählte sie als Fehlversuch) – außer /api/status
  const ohneCode = [];
  ctx.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && u.pathname !== "/api/status" && !r.headers()["x-gabi-zugang"]) ohneCode.push(`${r.method()} ${u.pathname}`);
  });
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

  // v2.1.1: Entwurf kam an, danach scheitert die Antwort (zweite KI-Runde → {t:"fehler"}) oder reißt ab: Die Karte ist
  // vollständig. Kein „Nochmal versuchen“ – es ersetzte die (evtl. schon gespeicherte/korrigierte) Karte durch eine neu
  // strukturierte mit neuer ID (doppelte Notiz). Dazu: zwei Entwürfe in einer Antwort, zwei Tabs. Eigene Seiten (die
  // folgenden Prüfungen laufen im Ausgangsgespräch weiter); eigene Test-Notizen werden am Ende wieder gelöscht.
  {
    const pA = await ctx.newPage();
    const kA = konsoleBeobachten(pA);
    const eigeneNotizen = [];
    const merken = (p) => p.on("response", async (r) => { if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notizen" && r.status() === 201) { try { eigeneNotizen.push((await r.json()).notiz.id); } catch { /* egal */ } } });
    merken(pA);
    await pA.goto(`${basis}/#/`);
    await pA.waitForSelector("#ansicht-chat:not([hidden])");
    const tp01 = (await (await pA.request.get(`${basis}/api/patienten`, { headers: { "X-Gabi-Zugang": "test" } })).json()).patienten.find((p) => p.kuerzel === "TP-01");
    let notizPosts = 0;
    pA.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/notizen") notizPosts++; });
    const entwurfEreignis = (rohtext, befund) => ({ t: "entwurf", entwurf: { patient_id: tp01.id, kuerzel: "TP-01", pseudonym: tp01.pseudonym || "", rohtext, strukturiert: { befund: [befund], massnahmen: ["MLD 20 min"], verlauf: [], hausaufgaben: [], unklar: [] } } });
    const strom = (ereignisse) => ({ status: 200, contentType: "application/x-ndjson", body: ereignisse.map((e) => `${JSON.stringify(e)}\n`).join("") });
    for (const ende of ["fehler", "abriss"]) {
      const ereignisse = [{ t: "status", text: "Strukturiere das Diktat …" }, entwurfEreignis(`Knie rechts, MLD (${ende})`, `Flexion 95° (${ende})`),
        ...(ende === "fehler" ? [{ t: "fehler", text: "Gabi ist gerade überlastet. Bitte gleich nochmal versuchen." }] : [])];
      await pA.route("**/api/chat", (route) => route.fulfill(strom(ereignisse)), { times: 1 });
      await pA.click("#seite-neu");
      await fragen(pA, `Notiz für TP-01: Knie rechts, MLD (${ende})`);
      await pA.waitForSelector(".nachricht.von-gabi:last-child .karte-entwurf");
      await pA.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen"));
      const box = await pA.textContent(".nachricht.von-gabi:last-child .hinweis-box");
      const nochmal = await pA.locator(".nachricht.von-gabi:last-child [data-aktion='wiederholen']").count();
      const vorher = notizPosts;
      await pA.click(".nachricht.von-gabi:last-child [data-aktion='entwurf-speichern']");
      await pA.waitForSelector(".nachricht.von-gabi:last-child .karte-entwurf.erledigt");
      await warte(300);
      pruefe(/Entwurf ist vollständig angekommen/.test(box) && nochmal === 0 && notizPosts === vorher + 1 && (await pA.locator(".nachricht.von-gabi:last-child .karte-entwurf.erledigt").count()) === 1,
        `Echte API: Entwurf kam, dann ${ende === "fehler" ? "Fehler im Strom" : "Abriss"} → Karte bleibt vollständig und speicherbar, kein „Nochmal versuchen“ (keine zweite Notiz)`);
    }
    // zwei Entwürfe in einer Antwort, zwei Tabs: B tippt in Entwurf 1, A speichert Entwurf 2 → B tippt ungestört weiter
    await pA.route("**/api/chat", (route) => route.fulfill(strom([entwurfEreignis("Eins", "Befund eins"), entwurfEreignis("Zwei", "Befund zwei"), { t: "text", d: "Hier sind zwei Entwürfe." }, { t: "fertig" }])), { times: 1 });
    await pA.click("#seite-neu");
    await fragen(pA, "Zwei Notizen für TP-01");
    await pA.waitForFunction(() => document.querySelectorAll(".karte-entwurf").length === 2 && !document.querySelector("#senden.stoppt") && /^#\/gespraech\//.test(location.hash));
    const pB = await ctx.newPage();
    const kB = konsoleBeobachten(pB);
    merken(pB);
    await pB.goto(`${basis}/${await pA.evaluate(() => location.hash)}`);
    await pB.waitForFunction(() => document.querySelectorAll(".karte-entwurf").length === 2);
    await pB.locator('.karte-entwurf [data-aktion="entwurf-bearbeiten"]').first().click();
    await pB.locator('.karte-entwurf textarea[data-abschnitt="befund"]').first().click();
    await pB.keyboard.press("End");
    await pB.keyboard.type(" vorher");
    await warte(500);
    await pA.bringToFront();
    await pA.locator('.karte-entwurf [data-aktion="entwurf-speichern"]').last().click();
    await pA.waitForSelector(".karte-entwurf.erledigt");
    await pB.bringToFront();
    await pB.waitForSelector(".karte-entwurf.erledigt", { timeout: 6000 });
    await pB.keyboard.type(" NACHHER");
    await warte(400);
    const b2 = await pB.evaluate(() => ({ fokus: document.activeElement.dataset?.abschnitt || document.activeElement.tagName, wert: (document.querySelector('.karte-entwurf textarea[data-abschnitt="befund"]') || {}).value || "" }));
    pruefe(b2.fokus === "befund" && /Befund eins vorher NACHHER$/.test(b2.wert),
      `Echte API: zwei Entwürfe in einer Antwort, zwei Tabs – A speichert Entwurf 2, B tippt in Entwurf 1 ungestört weiter (${JSON.stringify(b2)})`);
    await warte(300);
    for (const id of eigeneNotizen) await pA.request.delete(`${basis}/api/notizen/${id}`, { headers: { "X-Gabi-Zugang": "test" } });
    pruefe(!kA.length && !kB.length, `Echte API: Entwurf nach Abbruch, zwei Entwürfe – keine Fehler in der Konsole${kA.length || kB.length ? ` (${[...kA, ...kB].join(" | ")})` : ""}`);
    await pB.close();
    await pA.close();
    await page.bringToFront();
  }

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

  // v2.1.1: Antwort läuft, Notiz wird bearbeitet → „Neues Gespräch“ → „Weiter bearbeiten“: nichts bricht ab, kein Wechsel
  {
    const eigeneNotiz = await page.evaluate(() => location.hash);
    let freigeben = null;
    const halten = async (route) => { await new Promise((ok) => { freigeben = ok; }); await route.fallback().catch(() => {}); };
    await page.evaluate(() => { location.hash = "#/"; }); // „#/“ zeigt das offene Gespräch
    await page.waitForSelector("#ansicht-chat:not([hidden])");
    await page.route("**/api/chat", halten);
    await fragen(page, "Was wollte TP-01?");
    const bis = Date.now() + 10000;
    while (!freigeben && Date.now() < bis) await warte(50); // Anfrage hängt fest → Antwort läuft
    if (!freigeben) pruefe(false, "Echte API: die festgehaltene Anfrage an /api/chat kam nicht an");
    else {
      const offen = await page.evaluate(() => location.hash);
      await page.evaluate((h) => { location.hash = h; }, eigeneNotiz);
      await page.waitForSelector('[data-leser="bearbeiten"]');
      await page.click('[data-leser="bearbeiten"]');
      await page.locator("#ansicht-notizen textarea").first().fill("Test: Antwort läuft weiter");
      await page.click("#seite-neu");
      await page.waitForSelector("#dialog-frage[open]");
      await page.click("#frage-nein");
      await warte(300);
      const laeuftNoch = await page.evaluate(() => document.querySelector("#senden").classList.contains("stoppt"));
      const linkGleich = (await page.getAttribute('.navi a[data-navi="chat"]', "href")) === offen;
      freigeben();
      await page.click('.navi a[data-navi="chat"]');
      await page.waitForSelector("#dialog-frage[open]");
      await page.click("#frage-ja"); // Notiz-Änderung jetzt verwerfen
      await antwortAbwarten(page, "TP-01|Abgebrochen", 8000).catch(() => {});
      pruefe(laeuftNoch && linkGleich && (await page.evaluate(() => location.hash)) === offen && !/Abgebrochen\./.test(await letzteAntwort(page)),
        "Echte API: „Neues Gespräch“ bei bearbeiteter Notiz → „Weiter bearbeiten“ – die laufende Antwort läuft weiter und bleibt im offenen Gespräch");
    }
    await page.unroute("**/api/chat", halten);
  }

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

  // v2.1.1: erste Suche bei langsamer Leitung – der Platzhalter hat die Kopfzeile des Ergebnisses (Text + Sortierung, schmal
  // zweizeilig), die Treffer erscheinen an derselben Stelle (v2.1.0: Platzhalter ohne Kopfzeile, Sprung 54 px, schmal 88 px)
  const suchTreffer = Array.from({ length: 12 }, (_, i) => ({ id: `e2e-suche-${i}`, patient_id: "e2e", kuerzel: `TP-0${(i % 3) + 1}`, pseudonym: "Testfall Suche (fiktiv)", erstellt_am: new Date(Date.UTC(2026, 10, 9 - i, 9)).toISOString(), geaendert_am: null, strukturiert: { befund: [`Befund ${i}`], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] } }));
  let trefferZahl = 3;
  await page.route("**/api/notizen?q=*", async (route) => { await warte(400); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notizen: suchTreffer.slice(0, trefferZahl) }) }); });
  // auch 1 Treffer (Sortierung steht trotzdem da) und zweistellig am Handy (schmal immer zweizeilig): gleiche Höhe
  for (const [w, zahl] of [[1440, 3], [390, 3], [390, 1], [412, 12], [1440, 1]]) {
    trefferZahl = zahl;
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => { location.hash = "#/notizen"; });
    await page.waitForSelector("#ordner-inhalt .patient-karte");
    await page.evaluate(() => {
      window.__lage = [];
      const bild = () => {
        const k = document.querySelector("#ordner-inhalt [data-skelett-notiz], #ordner-inhalt .notiz-karte");
        if (k) window.__lage.push([k.classList.contains("notiz-karte"), k.offsetTop]); // offsetTop: Layout-Lage, ohne Hover/Scrollen
        if (!k || !k.classList.contains("notiz-karte")) requestAnimationFrame(bild);
      };
      requestAnimationFrame(bild);
    });
    await page.fill("#suche", "Platzhalter");
    await page.waitForSelector("#ordner-inhalt .notiz-karte");
    await warte(100);
    const lage = await page.evaluate(() => window.__lage);
    const platzhalter = [...new Set(lage.filter(([treffer]) => !treffer).map(([, top]) => top))];
    const treffer = (lage.find(([t]) => t) || [])[1];
    pruefe(platzhalter.length === 1 && platzhalter[0] === treffer,
      `Echte API: erste Suche bei langsamer Leitung (${w} px, ${zahl} Treffer) – Platzhalter mit Kopfzeile, Treffer an derselben Stelle (Platzhalter ${platzhalter.join("/") || "–"} → Treffer ${treffer} px)`);
    await page.fill("#suche", ""); // zurück zur Übersicht
    await page.waitForSelector("#ordner-inhalt .patient-karte");
  }
  // v2.1.1 Nachprüfung: langer Suchbegriff genau an der Umbruchkante – „1 Notiz“/„12 Notizen“ ist kürzer/länger als der
  // Platzhalter („2 Notizen“). Die Ergebniszeile bricht nie um (… am Ende), also springt nichts, bei keiner Länge
  const satz = "Theraband Übungen Knie rechts Schmerz beim Treppensteigen und Laufen";
  const springt = [];
  for (const [w, laengen] of [[390, [20, 40]], [700, [34, 58]]]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (let n = laengen[0]; n <= laengen[1]; n += 1) {
      for (const zahl of [1, 12]) {
        trefferZahl = zahl;
        await page.evaluate(() => { location.hash = "#/notizen"; });
        await page.waitForSelector("#ordner-inhalt .patient-karte");
        await page.evaluate(() => {
          window.__lage = [];
          const bild = () => {
            const k = document.querySelector("#ordner-inhalt [data-skelett-notiz], #ordner-inhalt .notiz-karte");
            if (k) window.__lage.push([k.classList.contains("notiz-karte"), k.offsetTop]);
            if (!k || !k.classList.contains("notiz-karte")) requestAnimationFrame(bild);
          };
          requestAnimationFrame(bild);
        });
        await page.fill("#suche", satz.slice(0, n));
        await page.waitForSelector("#ordner-inhalt .notiz-karte");
        await warte(50);
        const lage = await page.evaluate(() => window.__lage);
        const platz = [...new Set(lage.filter(([t]) => !t).map(([, top]) => top))];
        const treffer = (lage.find(([t]) => t) || [])[1];
        if (platz.length !== 1 || platz[0] !== treffer) springt.push(`${w}px/${n}Z/${zahl}: ${platz.join("/")}→${treffer}`);
        await page.fill("#suche", "");
        await page.waitForSelector("#ordner-inhalt .patient-karte");
      }
    }
  }
  pruefe(!springt.length, `Echte API: langer Suchbegriff an der Umbruchkante (390/700 px, 1 und 12 Treffer, ${21 + 25} Längen) – kein Sprung${springt.length ? ` (${springt.slice(0, 6).join(", ")})` : ""}`);
  pruefe(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Echte API: langer Suchbegriff – kein seitliches Scrollen");

  // v2.1.1 Nachprüfung: Sortierung per Tastatur umstellen – der Fokus bleibt auf der neuen Auswahl (Suche und Patientenseite)
  await page.setViewportSize({ width: 1440, height: 900 });
  trefferZahl = 3;
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#ordner-inhalt .patient-karte");
  await page.fill("#suche", "Sortierfokus");
  await page.waitForSelector("#ordner-inhalt .notiz-karte");
  await page.focus("#sortierung");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.selectOption("#sortierung", "alt");
  await warte(900); // Suche neu (400 ms Leitung) – die Kopfzeile wird neu gebaut
  const sucheFokus = await page.evaluate(() => ({ id: document.activeElement.id, wert: document.activeElement.value }));
  await page.selectOption("#sortierung", "neu");
  await warte(900);
  await page.fill("#suche", "");
  await page.waitForSelector("#ordner-inhalt .patient-karte");
  const tp01Id = (await (await page.request.get(`${basis}/api/patienten`, { headers: { "X-Gabi-Zugang": "test" } })).json()).patienten.find((x) => x.kuerzel === "TP-01").id;
  await page.route("**/api/notizen?patient_id=*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notizen: suchTreffer.slice(0, 3).map((n) => ({ ...n, patient_id: tp01Id, kuerzel: "TP-01" })) }) }));
  await page.evaluate((id) => { location.hash = `#/notizen/p/${id}`; }, tp01Id);
  await page.waitForFunction(() => document.querySelectorAll("#ordner-inhalt .notiz-karte").length === 3 && document.querySelector("#sortierung"));
  await page.focus("#sortierung");
  await page.selectOption("#sortierung", "alt");
  await warte(300);
  const patientFokus = await page.evaluate(() => ({ id: document.activeElement.id, wert: document.activeElement.value }));
  await page.selectOption("#sortierung", "neu");
  await page.unroute("**/api/notizen?patient_id=*");
  pruefe(sucheFokus.id === "sortierung" && sucheFokus.wert === "alt" && patientFokus.id === "sortierung" && patientFokus.wert === "alt",
    `Echte API: Sortierung umstellen – der Fokus bleibt auf der Auswahl, nicht auf body (Suche: ${JSON.stringify(sucheFokus)}, Patient: ${JSON.stringify(patientFokus)})`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.unroute("**/api/notizen?q=*");
  await page.evaluate(() => { location.hash = "#/"; });

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
  // v2.1.1: Patientenliste beim Start nicht geladen → „Behandlung diktieren“ lädt nach: Platzhalter statt des alten Fehlers
  let patientenAus = true;
  await page.route("**/api/patienten", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (patientenAus) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ fehler: "Datenbank-Fehler (502)." }) });
    await warte(800);
    return route.continue();
  });
  await page.reload();
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await warte(500);
  patientenAus = false;
  await page.evaluate(() => {
    window.__auswahl = [];
    new MutationObserver(() => {
      const k = [...document.querySelectorAll("#nachrichten [data-karte]")].pop();
      const z = !k ? "" : k.querySelector(".chip strong") ? "Chips" : k.querySelector(".chip-skelett") ? "Platzhalter" : /konnten nicht geladen/.test(k.textContent) ? "Fehler" : "?";
      if (z && window.__auswahl.at(-1) !== z) window.__auswahl.push(z);
    }).observe(document.querySelector("#nachrichten"), { childList: true, subtree: true });
  });
  await page.locator('[data-schnell="diktat"]:visible').first().click();
  await page.waitForSelector('#nachrichten [data-aktion="waehle"]', { timeout: 5000 });
  const auswahl = await page.evaluate(() => window.__auswahl);
  pruefe(auswahl.join(" → ") === "Platzhalter → Chips",
    `Echte API: Patientenliste beim Start nicht geladen – „Behandlung diktieren“ zeigt beim Nachladen Platzhalter, nicht den alten Fehler (${auswahl.join(" → ")})`);
  await page.unroute("**/api/patienten");

  // v2.1.1: Abmelden in fester Reihenfolge – Code sofort vom Gerät, Laufendes wird abgewartet, Fehler bleiben sichtbar.
  // Fund 13: Abmelden, während ein Entwurf gespeichert wird → keine Folgeanfrage ohne Code, keine falsche Meldung,
  // und der Entwurf steht danach als gespeichert da (sonst böte die Karte ein zweites Speichern an: doppelte Notiz)
  await page.locator('[data-schnell="diktat"]:visible').first().click();
  await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click();
  await fragen(page, "Knie rechts Flexion 95 Grad. 20 Minuten Lymphdrainage.");
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 30000 });
  await antwortAbwarten(page, "Entwurf für TP-01");
  const entwurfAdresse = await page.evaluate(() => location.hash);
  let speichernFrei = null;
  await page.route("**/api/notizen", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => { speichernFrei = r; });
    await route.continue();
  });
  await page.click('.karte-entwurf:not(.erledigt) [data-aktion="entwurf-speichern"]');
  await page.waitForFunction(() => /Speichere/.test(document.querySelector('.karte-entwurf:not(.erledigt) [data-aktion="entwurf-speichern"]')?.textContent || ""));
  await abmelden();
  const rueckfrage13 = await page.textContent("#frage-text");
  await page.uncheck("#frage-haken");
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-laden:not([hidden])", { timeout: 3000 }).catch(() => {}); // Ladekreis mit Text, bis gespeichert ist
  const waehrend = await page.evaluate(() => ({ laden: !document.querySelector("#ansicht-laden").hidden, code: localStorage.getItem("gabi.zugang"), text: document.querySelector("#laden-text").textContent }));
  speichernFrei();
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  await warte(800);
  const nachSpeichern = await page.evaluate(() => ({ meldung: document.querySelector("#zugang-fehler").hidden ? "" : document.querySelector("#zugang-fehler").textContent, toasts: document.querySelector("#toasts").textContent }));
  await page.unroute("**/api/notizen");
  await anmelden();
  await page.evaluate((h) => { location.hash = h; }, entwurfAdresse);
  await page.waitForSelector(".karte-entwurf");
  const karte = await page.evaluate(() => { const k = [...document.querySelectorAll(".karte-entwurf")].pop(); return { gespeichert: k.classList.contains("erledigt"), nochmal: Boolean(k.querySelector('[data-aktion="entwurf-speichern"]')) }; });
  pruefe(waehrend.laden && waehrend.code === null && /speichert noch/.test(waehrend.text) && /wird gerade gespeichert/.test(rueckfrage13),
    `Echte API: Abmelden, während ein Entwurf gespeichert wird – Rückfrage „wird gerade gespeichert“, Code sofort vom Gerät, Ladekreis mit Text (${JSON.stringify(waehrend)})`);
  pruefe(!nachSpeichern.meldung && !/Gespeichert bei/.test(nachSpeichern.toasts) && karte.gespeichert && !karte.nochmal,
    `Echte API: … danach keine falsche Meldung, der Entwurf ist als gespeichert vermerkt (${JSON.stringify({ ...nachSpeichern, ...karte })})`);

  // Speichern scheitert während des Abmeldens: „Nicht gespeichert: …“ bleibt auf der Zugangsseite stehen (nichts verschwiegen)
  await page.locator('[data-schnell="diktat"]:visible').first().click();
  await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click(); // der lokale Worker kennt nur TP-01 (+ TP-11 aus diesem Test)
  await fragen(page, "Schulter links Abduktion 90 Grad. Zehn Minuten Mobilisation.");
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 30000 });
  await antwortAbwarten(page, "Entwurf für TP-01");
  let scheitern = null;
  await page.route("**/api/notizen", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => { scheitern = r; });
    return route.abort("failed");
  });
  await page.click('.karte-entwurf:not(.erledigt) [data-aktion="entwurf-speichern"]');
  await page.waitForFunction(() => /Speichere/.test(document.querySelector('.karte-entwurf:not(.erledigt) [data-aktion="entwurf-speichern"]')?.textContent || ""));
  await abmelden();
  await page.uncheck("#frage-haken");
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-laden:not([hidden])", { timeout: 3000 }).catch(() => {});
  scheitern();
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  const fehlerToast = await page.textContent("#toasts");
  await page.unroute("**/api/notizen");
  await anmelden();
  pruefe(/Nicht gespeichert/.test(fehlerToast), `Echte API: Speichern scheitert während des Abmeldens – „Nicht gespeichert: …“ bleibt auf der Zugangsseite stehen (${fehlerToast.slice(0, 80)})`);

  // Fund 16: Abmelden ohne Häkchen während einer Antwort → später „Abgebrochen.“, nicht „… neu geladen“
  let antwortFrei = null;
  await page.route("**/api/chat", async (route) => { await new Promise((r) => { antwortFrei = r; }); await route.continue().catch(() => {}); });
  await page.click("#seite-neu");
  await fragen(page, "Frage beim Abmelden");
  await page.waitForSelector("#senden.stoppt");
  await page.waitForFunction(() => /^#\/gespraech\//.test(location.hash));
  const frageAdresse = await page.evaluate(() => location.hash);
  await abmelden();
  await page.uncheck("#frage-haken");
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  if (antwortFrei) antwortFrei();
  await page.unroute("**/api/chat");
  await anmelden();
  await page.click(`#seiten-gespraeche a.gespraech-link[href="${frageAdresse}"]`);
  await page.waitForFunction((h) => location.hash === h && /Abgebrochen|unterbrochen/.test(document.querySelector("#nachrichten").textContent), frageAdresse);
  const unterbrochen = await page.textContent("#nachrichten");
  pruefe(/Abgebrochen\./.test(unterbrochen) && !/neu geladen/.test(unterbrochen), "Echte API: Abmelden ohne Häkchen während einer Antwort – danach „Abgebrochen.“, nicht „… neu geladen“");

  // Netzfehler, gleich danach Abmelden ohne Häkchen: nach dem Anmelden steht der Verbindungsfehler da – nicht „… neu geladen“
  await page.click("#seite-neu");
  await page.route("**/api/chat", (route) => route.abort("failed"));
  await fragen(page, "Frage mit Netzfehler vor dem Abmelden");
  await page.waitForSelector('.nachricht.von-gabi:last-child [data-aktion="wiederholen"]');
  const netzAdresse = await page.evaluate(() => location.hash);
  await page.unroute("**/api/chat");
  await abmelden();
  await page.uncheck("#frage-haken");
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  await anmelden();
  await page.click(`#seiten-gespraeche a.gespraech-link[href="${netzAdresse}"]`);
  await page.waitForFunction((h) => location.hash === h && Boolean(document.querySelector(".nachricht.von-gabi .hinweis-box")), netzAdresse);
  const netzText = await page.textContent("#nachrichten");
  pruefe(/Keine Verbindung zum Server/.test(netzText) && !/neu geladen/.test(netzText), "Echte API: Netzfehler und gleich danach Abmelden ohne Häkchen – nach dem Anmelden steht der Verbindungsfehler da, nicht „… neu geladen“");

  // Fund 14: ungespeicherte Notiz-Bearbeitung → die Rückfrage warnt (rot); „Abbrechen“ lässt die Bearbeitung stehen
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.click('.patient-karte:has-text("TP-01")');
  await page.locator(".notiz-karte").first().click();
  await page.click('[data-leser="bearbeiten"]');
  await page.fill('textarea[data-abschnitt="befund"]', "Geändert, nicht gespeichert");
  await abmelden();
  const rueckfrage = await page.evaluate(() => ({ text: document.querySelector("#frage-text").textContent, gefahr: document.querySelector("#frage-ja").classList.contains("gefahr") }));
  await page.click("#frage-nein");
  pruefe(/Änderungen an der Notiz/.test(rueckfrage.text) && rueckfrage.gefahr && (await page.inputValue('textarea[data-abschnitt="befund"]')) === "Geändert, nicht gespeichert",
    `Echte API: Abmelden warnt vor einer ungespeicherten Notiz-Bearbeitung („${rueckfrage.text}“), „Abbrechen“ lässt sie stehen`);
  await page.click('[data-leser="abbrechen"]');
  await page.click("#frage-ja"); // „Änderungen verwerfen?“
  await page.waitForFunction(() => !document.querySelector("#ansicht-notizen textarea"));

  // Fund 12: Abmelden (mit Häkchen) – kein getippter Text, kein Suchbegriff, kein Notizordner bleibt im Tab; weiter bei #/
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#ansicht-notizen:not([hidden]) #suche");
  await page.fill("#suche", "knie");
  await page.waitForSelector("#ordner-inhalt .notiz-liste, #ordner-inhalt .leer");
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForSelector("#ansicht-chat:not([hidden])");
  await page.fill("#eingabe-text", "Getippt, nicht gesendet");
  await page.evaluate(() => { location.hash = "#/notizen"; });
  await page.waitForSelector("#ansicht-notizen:not([hidden])");
  await abmelden();
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  const reste12 = await page.evaluate(() => ({ text: document.querySelector("#eingabe-text").value, suche: document.querySelector("#suche") ? document.querySelector("#suche").value : "", notizen: document.querySelector("#ansicht-notizen").textContent.trim(), hash: location.hash }));
  await anmelden();
  pruefe(!reste12.text && !reste12.suche && !reste12.notizen && reste12.hash === "#/" && (await page.inputValue("#eingabe-text")) === "",
    `Echte API: nach dem Abmelden bleiben kein getippter Text, kein Suchbegriff und kein Notizordner im Tab, weiter bei #/ (${JSON.stringify(reste12).slice(0, 160)})`);

  // Fund 11: 401 bei der Spracherkennung (Code am Worker geändert) → nach neuem Anmelden „Jetzt senden“
  await page.route("**/api/transkribieren", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ fehler: "Zugangscode falsch." }) }));
  await mikroHalten(page, 2000);
  await page.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 30000 });
  const meldung401 = await page.textContent("#zugang-fehler");
  await page.unroute("**/api/transkribieren");
  await anmelden();
  const jetztSenden = await page.waitForSelector('[data-aktion="aufnahme-senden"]:has-text("Jetzt senden")', { timeout: 8000 }).then(() => true, () => false);
  if (jetztSenden) {
    await page.click('[data-aktion="aufnahme-senden"]');
    await page.waitForFunction(() => /Nachgeschickt/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen"), null, { timeout: 30000 });
  }
  pruefe(jetztSenden && /gilt nicht mehr/.test(meldung401), "Echte API: 401 bei der Spracherkennung – Aufnahme bleibt, nach neuem Anmelden „Jetzt senden“ (ohne neu zu sprechen)");

  // Mikrofon: eine per Tastatur gehaltene Aufnahme endet beim Abmelden und schickt danach nichts
  await page.click("#seite-neu");
  await page.focus("#mikro");
  await page.keyboard.down(" ");
  await page.waitForSelector(".eingabe.nimmt-auf", { timeout: 8000 });
  await warte(1200);
  await abmelden();
  await page.click("#frage-ja");
  await page.waitForSelector("#ansicht-zugang:not([hidden])");
  await warte(600);
  const nimmtAuf = await page.evaluate(() => document.querySelector("#eingabe").classList.contains("nimmt-auf"));
  await page.keyboard.up(" ");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await warte(1500);
  pruefe(!nimmtAuf && !(await page.isVisible("#zugang-fehler")), "Echte API: Abmelden beendet eine laufende Aufnahme (Mikrofon aus), danach keine Meldung „Code gilt nicht mehr“");
  await anmelden();
  pruefe(!ohneCode.length, `Echte API: keine Anfrage ohne Zugangscode (außer /api/status)${ohneCode.length ? `: ${ohneCode.join(", ")}` : ""}`);
  pruefe(konsole.length === 0, `Echte API: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}
await chrome.close();

// ---------------------------------------------------------------------------
// 3b v2.1.1: echte lokale API in Chromium UND WebKit – Neuladen mitten in der Antwort → „unterbrochen“ (WebKit bricht den
//    Strom schon vor pagehide ab); ein echter Verbindungsfehler bleibt sichtbar und wird gespeichert; zwei Tabs: die
//    verzögerte Bestätigung überschreibt nichts, was ein anderer Tab inzwischen geschrieben hat (Fund 9)
// ---------------------------------------------------------------------------
if (!LIVE) {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const b = await engine.launch();
    const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await stumm(c);
    await c.addInitScript(() => { if (!sessionStorage.getItem("test.zugang")) { sessionStorage.setItem("test.zugang", "1"); localStorage.setItem("gabi.zugang", "test"); } });
    const p = await c.newPage();
    const k = konsoleBeobachten(p);
    const hinweis = () => p.evaluate(() => ([...document.querySelectorAll(".von-gabi .hinweis-box")].pop() || {}).textContent || "");
    await p.goto(`${basis}/#/`);
    await p.waitForSelector("#ansicht-chat:not([hidden])");
    // a) Antwort strömt (erster Text da) → Neuladen
    await fragen(p, "Was kannst du?");
    await p.waitForFunction(() => document.querySelector("#senden.stoppt") && /\S/.test(([...document.querySelectorAll(".von-gabi .nachricht-text")].pop() || {}).textContent || ""));
    await p.reload();
    await p.waitForSelector('[data-aktion="wiederholen"]', { timeout: 8000 });
    const a = await hinweis();
    // b) Antwort angefragt, noch kein Text (Gabi denkt) → Neuladen
    await p.click("#seite-neu");
    await fragen(p, "Was kannst du?");
    await p.waitForSelector("#senden.stoppt");
    await p.reload();
    await p.waitForSelector('[data-aktion="wiederholen"]', { timeout: 8000 });
    const bb = await hinweis();
    pruefe(/unterbrochen, weil die Seite neu geladen wurde/.test(a) && /unterbrochen, weil die Seite neu geladen wurde/.test(bb),
      `${name}: Neuladen mitten in der Antwort (echte API) → „unterbrochen“, nicht „Keine Verbindung“ (${a.slice(0, 45)} · ${bb.slice(0, 45)})`);
    // c) echter Verbindungsfehler (Seite bleibt) → sofort sichtbar, nach 6 s gespeichert, nach dem Neuladen weiter da
    await p.click("#seite-neu");
    await p.route("**/api/chat", (route) => route.abort("failed"));
    await fragen(p, "Was kannst du?");
    await p.waitForSelector('[data-aktion="wiederholen"]');
    const sofort = await hinweis();
    await warte(6000);
    await p.unroute("**/api/chat");
    await p.reload();
    await p.waitForSelector('[data-aktion="wiederholen"]', { timeout: 8000 });
    const gespeichert = await hinweis();
    await p.click('[data-aktion="wiederholen"]');
    const weiter = await p.waitForFunction(() => /Ich bin Gabi/.test(([...document.querySelectorAll(".von-gabi .nachricht-text")].pop() || {}).textContent || "") && !document.querySelector("#senden.stoppt"), null, { timeout: 15000 }).then(() => true).catch(() => false);
    pruefe(/Keine Verbindung zum Server/.test(sofort) && /Keine Verbindung zum Server/.test(gespeichert) && weiter,
      `${name}: echter Verbindungsfehler wird gezeigt, bleibt nach dem Neuladen und „Nochmal versuchen“ klappt`);
    // d) zwei Tabs: Netzfehler in A, A verlässt das Gespräch gleich, B schreibt darin weiter → nach der Frist ist B's
    //    Frage noch da (der Wechsel bestätigt den Fehler sofort; danach schreibt A nie eine veraltete Kopie)
    await p.click("#seite-neu");
    await fragen(p, "Erste Frage in X");
    await p.waitForFunction(() => !document.querySelector("#senden.stoppt") && /^#\/gespraech\//.test(location.hash));
    const x = await p.evaluate(() => location.hash);
    await p.route("**/api/chat", (route) => route.abort("failed"));
    await fragen(p, "Zweite Frage in X");
    await p.waitForSelector('.nachricht.von-gabi:last-child [data-aktion="wiederholen"]');
    await p.unroute("**/api/chat");
    await p.click("#seite-neu"); // A verlässt X innerhalb der 5 s
    const q = await c.newPage();
    await q.goto(`${basis}/${x}`);
    await q.waitForFunction(() => /Zweite Frage in X/.test(document.querySelector("#nachrichten").textContent));
    await fragen(q, "Dritte Frage aus Tab B");
    await q.waitForFunction(() => !document.querySelector("#senden.stoppt") && /Dritte Frage aus Tab B/.test(document.querySelector("#nachrichten").textContent));
    await warte(6500);
    await q.reload();
    const bleibt = await q.waitForFunction(() => /Dritte Frage aus Tab B/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 8000 }).then(() => true).catch(() => false);
    pruefe(bleibt, `${name}: Netzfehler in Tab A, A wechselt, B schreibt weiter → nach der Frist ist B's Frage noch da (A überschreibt nichts)`);
    pruefe(k.length === 0, `${name} 3b: keine Fehler in der Konsole${k.length ? ` (${k.join(" | ")})` : ""}`);
    await b.close();
  }
}

// ---------------------------------------------------------------------------
// 3c v2.1.1 Nachprüfung (Funde der Gegenprüfung): echte lokale API in Chromium UND WebKit –
//    Netzfehler + zweiter Tab (die Antwort bleibt an ihrer Stelle, auch nach Neuladen innerhalb der Frist), Karte übersteht
//    ein Neuladen mitten im Strom, Speicher-Sperre mit Hinweis (und Frist), Abmelden mit Häkchen löscht sofort (Tab zu im
//    Wartefenster), zweiter Tab wartet auf die Sperre (nichts kommt zurück, keine zweite Notiz), Frist je Anfrage,
//    401 beim Abmelden wird genannt, Ladetext für Screenreader (Fokus, #app nicht inert), Korrektur am Entwurf nach einem
//    Netzfehler in zwei Tabs (gilt in beiden, geht so zum Server). Notizen beantwortet der Browser.
// ---------------------------------------------------------------------------
if (!LIVE) {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const b = await engine.launch();
    const ohneCode = [];
    const kontext = async () => {
      const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
      await stumm(c);
      c.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && u.pathname !== "/api/status" && !r.headers()["x-gabi-zugang"]) ohneCode.push(`${r.method()} ${u.pathname}`); });
      return c;
    };
    const anmelden = async (p) => {
      await p.goto(`${basis}/#/`);
      await p.waitForSelector("#ansicht-zugang:not([hidden]), #ansicht-chat:not([hidden])");
      if (await p.isVisible("#ansicht-zugang")) { await p.fill("#zugang-code", "test"); await p.click("#zugang-weiter"); }
      await p.waitForSelector("#ansicht-chat:not([hidden])");
    };
    const notizAntwort = (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ notiz: { id: crypto.randomUUID(), patient_id: body.patient_id, kuerzel: "TP-01", pseudonym: "", erstellt_am: new Date().toISOString(), geaendert_am: null, rohtext: body.rohtext || "", strukturiert: body.strukturiert || {} } }) }).catch(() => {});
    };
    /** Freie Frage mit Entwurf (der lokale Worker strukturiert „Notiz für TP-01: …“), bis die Antwort fertig ist. */
    const entwurfHolen = async (p, text) => {
      await fragen(p, `Notiz für TP-01: ${text}`);
      await p.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']", { timeout: 20000 });
      await p.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && /^#\/gespraech\//.test(location.hash), null, { timeout: 20000 });
      return p.evaluate(() => location.hash);
    };
    const speichernTippen = async (p) => {
      await p.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
      await p.waitForFunction(() => /Speichere/.test(document.querySelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']")?.textContent || ""));
    };
    const abmeldenBestaetigen = async (p, { haken }) => {
      await p.click("#test-badge");
      await p.waitForSelector("#dialog-info[open]");
      await p.click("#info-abmelden");
      await p.waitForSelector("#dialog-frage[open]");
      if (!haken) await p.uncheck("#frage-haken");
      await p.click("#frage-ja");
    };
    const toastText = (p) => p.evaluate(() => document.querySelector("#toasts").textContent);
    const reihe = (p) => p.evaluate(() => [...document.querySelectorAll("#nachrichten .nachricht")].map((n) => (n.classList.contains("von-gabi")
      ? (n.querySelector(".hinweis-box") ? "fehler" : "gabi") : ((n.textContent.match(/Erste Frage in X|Zweite Frage aus A|Dritte Frage aus B/) || ["?"])[0]))));

    // a) Neuladen, während Gabi nach dem Entwurf noch schreibt: Die Karte bleibt (Chromium meldet den Abbruch erst nach pagehide)
    {
      const c = await kontext();
      const p = await c.newPage();
      const k = konsoleBeobachten(p);
      await anmelden(p);
      await fragen(p, "Notiz für TP-01: Knie rechts, Flexion 100 Grad, MLD 20 Minuten, Hausaufgabe Theraband.");
      await p.waitForFunction(() => document.querySelector("#senden.stoppt") && document.querySelector("#nachrichten .karte-entwurf"), null, { timeout: 20000 });
      await p.reload();
      await p.waitForSelector("#ansicht-chat:not([hidden])");
      await p.waitForFunction(() => document.querySelectorAll("#nachrichten .nachricht").length >= 2, null, { timeout: 15000 });
      await warte(500);
      const nach = await p.evaluate(() => { const g = [...document.querySelectorAll(".nachricht.von-gabi")].pop(); return { karte: Boolean(g && g.querySelector(".karte-entwurf [data-aktion='entwurf-speichern']")), nochmal: Boolean(g && g.querySelector("[data-aktion='wiederholen']")), box: ((g && g.querySelector(".hinweis-box")) || { textContent: "" }).textContent.trim().slice(0, 60) }; });
      pruefe(nach.karte && !nach.nochmal, `${name}: Neuladen, während Gabi nach einem Entwurf noch schreibt – die Karte bleibt, kein „Nochmal versuchen“ (${JSON.stringify(nach)})`);
      pruefe(k.length === 0, `${name} 3c a: keine Fehler in der Konsole${k.length ? ` (${k.join(" | ")})` : ""}`);
      await c.close();
    }

    // b) zwei Tabs im selben Gespräch, Netzfehler in A, B schreibt, A lädt innerhalb der 5 s neu: A's Antwort ist noch da,
    //    an ihrer Stelle (vor B's Frage) – in A nach dem Neuladen und in B nach der Frist
    {
      const c = await kontext();
      const a = await c.newPage();
      const k = konsoleBeobachten(a);
      await anmelden(a);
      await fragen(a, "Erste Frage in X");
      await a.waitForFunction(() => !document.querySelector("#senden.stoppt") && /^#\/gespraech\//.test(location.hash));
      const x = await a.evaluate(() => location.hash);
      const bt = await c.newPage();
      await bt.goto(`${basis}/${x}`);
      await bt.waitForFunction(() => /Erste Frage in X/.test(document.querySelector("#nachrichten").textContent));
      await a.route("**/api/chat", (route) => route.abort("failed"));
      await fragen(a, "Zweite Frage aus A");
      await a.waitForSelector('.nachricht.von-gabi:last-child [data-aktion="wiederholen"]');
      await a.unroute("**/api/chat");
      const bKennt = await bt.waitForFunction(() => /Keine Verbindung/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 4000 }).then(() => true).catch(() => false);
      await fragen(bt, "Dritte Frage aus B");
      await bt.waitForFunction(() => /Dritte Frage aus B/.test(document.querySelector("#nachrichten").textContent));
      await warte(300);
      await a.reload(); // innerhalb der Frist
      await a.waitForFunction(() => /Dritte Frage aus B/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 10000 }).catch(() => {});
      const inA = (await reihe(a)).slice(0, 5);
      await bt.waitForFunction(() => !document.querySelector("#senden.stoppt"), null, { timeout: 20000 });
      await warte(6000);
      await bt.reload();
      await bt.waitForFunction(() => /Dritte Frage aus B/.test(document.querySelector("#nachrichten").textContent), null, { timeout: 10000 }).catch(() => {});
      const inB = (await reihe(bt)).slice(0, 5);
      const soll = ["Erste Frage in X", "gabi", "Zweite Frage aus A", "fehler", "Dritte Frage aus B"].join(" · ");
      pruefe(bKennt && inA.join(" · ") === soll && inB.join(" · ") === soll,
        `${name}: Netzfehler in Tab A, B schreibt, A lädt innerhalb der Frist neu → A's Antwort bleibt an ihrer Stelle (A: ${inA.join(" · ")} | B: ${inB.join(" · ")})`);
      pruefe(k.length === 0, `${name} 3c b: keine Fehler in der Konsole${k.length ? ` (${k.join(" | ")})` : ""}`);
      await c.close();
    }

    // c) Speicher-Sperre: hält ein anderes Fenster die Sperre, sagt Gabi, worauf sie wartet; danach genau eine Notiz.
    //    Chromium zusätzlich: hält es sie über 25 s fest, gibt Gabi auf („bitte dort nachsehen“), ohne zu senden
    {
      const c = await kontext();
      let posts = 0;
      await c.route("**/api/notizen", (route) => { if (route.request().method() !== "POST") return route.continue(); posts++; return notizAntwort(route); });
      const p = await c.newPage();
      const k = konsoleBeobachten(p);
      await anmelden(p);
      await entwurfHolen(p, "Schulter links, Abduktion 90 Grad.");
      const halter = await c.newPage();
      await halter.goto(`${basis}/style.css`);
      const sperreHalten = async () => {
        const id = await p.getAttribute(".karte-entwurf:not(.erledigt)", "data-karte");
        await halter.evaluate((n) => new Promise((ok) => { navigator.locks.request(n, () => new Promise((frei) => { window.__frei = frei; ok(); })); }), `gabi-entwurf-${id}`);
      };
      await sperreHalten();
      await p.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
      const wartet = await p.waitForFunction(() => /in einem anderen Fenster gespeichert – Gabi wartet darauf/.test(document.querySelector("#toasts").textContent), null, { timeout: 3000 }).then(() => true).catch(() => false);
      const vorher = posts;
      await halter.evaluate(() => window.__frei());
      await p.waitForSelector(".karte-entwurf.erledigt", { timeout: 10000 }).catch(() => {});
      pruefe(wartet && posts === vorher + 1 && (await p.locator(".karte-entwurf.erledigt").count()) === 1,
        `${name}: Speichern, während ein anderes Fenster die Sperre hält – Hinweis „Gabi wartet darauf“, danach genau eine Notiz (${posts - vorher})`);
      if (name === "chromium") {
        await p.click("#seite-neu");
        await entwurfHolen(p, "Hüfte rechts, Extension 10 Grad.");
        await sperreHalten();
        const vor2 = posts;
        await p.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
        const aufgegeben = await p.waitForFunction(() => /bitte dort nachsehen/.test(document.querySelector("#toasts").textContent), null, { timeout: 32000 }).then(() => true).catch(() => false);
        const knopf = await p.evaluate(() => { const k = document.querySelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']"); return k ? { an: !k.disabled, text: k.textContent.trim() } : null; });
        pruefe(aufgegeben && posts === vor2 && knopf && knopf.an && knopf.text === "Speichern",
          `${name}: hält ein Fenster die Sperre über 25 s fest, gibt Gabi auf („bitte dort nachsehen“), ohne zu senden – „Speichern“ geht wieder (${JSON.stringify(knopf)})`);
        await halter.evaluate(() => window.__frei());
      }
      pruefe(k.length === 0, `${name} 3c c: keine Fehler in der Konsole${k.length ? ` (${k.join(" | ")})` : ""}`);
      await c.close();
    }

    // d) Abmelden mit Häkchen, während gespeichert wird, Tab im Wartefenster zu: Die Gespräche sind trotzdem vom Gerät;
    //    im Wartefenster: Ladetext hat den Fokus, #app ist nicht inert (Screenreader hören ihn)
    {
      const c = await kontext();
      let halten = true;
      await c.route("**/api/notizen", async (route) => { if (route.request().method() !== "POST") return route.continue(); while (halten) await warte(100); return notizAntwort(route); });
      const p = await c.newPage();
      await anmelden(p);
      await entwurfHolen(p, "Knie links, Flexion 110 Grad.");
      await speichernTippen(p);
      await abmeldenBestaetigen(p, { haken: true });
      await p.waitForSelector("#ansicht-laden:not([hidden])", { timeout: 3000 }).catch(() => {});
      await warte(400);
      const waehrend = await p.evaluate(() => ({ fokus: document.activeElement.id, inert: document.querySelector("#app").inert, text: document.querySelector("#laden-text").textContent, code: localStorage.getItem("gabi.zugang") }));
      const ablageWaehrend = (await ablageTitel(p, "gabi")) || ["?"];
      await p.close(); // Tab im Wartefenster zu (iPhone: weggewischt)
      halten = false;
      const q = await c.newPage();
      await q.goto(`${basis}/#/`);
      await q.waitForSelector("#ansicht-zugang:not([hidden])");
      const nachher = (await ablageTitel(q, "gabi")) || ["?"];
      await anmelden(q);
      await warte(300);
      const liste = await listenTitel(q);
      pruefe(!ablageWaehrend.length && !nachher.length && !liste.length && waehrend.code === null,
        `${name}: Abmelden mit Häkchen, während gespeichert wird – Gespräche sofort vom Gerät, auch wenn der Tab im Wartefenster zugeht (Ablage ${ablageWaehrend.length}/${nachher.length}, Liste ${liste.length})`);
      pruefe(waehrend.fokus === "laden-text" && !waehrend.inert && /speichert noch/.test(waehrend.text),
        `${name}: Ladetext beim Abmelden ist für Screenreader da – Fokus darauf, #app nicht inert (${JSON.stringify(waehrend)})`);
      await c.close();
    }

    // e) zwei Tabs, derselbe Entwurf: A speichert (hängt), B wartet auf die Sperre, A meldet sich mit Häkchen ab →
    //    nichts kommt aufs Gerät zurück, keine zweite Notiz, B sagt, warum nicht gespeichert
    {
      const c = await kontext();
      let posts = 0;
      let freiA = null;
      await c.route("**/api/notizen", async (route) => { if (route.request().method() !== "POST") return route.continue(); posts++; if (posts === 1) await new Promise((r) => { freiA = r; }); return notizAntwort(route); });
      const a = await c.newPage();
      await anmelden(a);
      const x = await entwurfHolen(a, "Ellenbogen rechts, Streckung frei.");
      const bt = await c.newPage();
      const kb = konsoleBeobachten(bt);
      await bt.goto(`${basis}/${x}`);
      await bt.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
      await speichernTippen(a);
      await bt.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
      const bWartet = await bt.waitForFunction(() => /Gabi wartet darauf/.test(document.querySelector("#toasts").textContent), null, { timeout: 3000 }).then(() => true).catch(() => false);
      await abmeldenBestaetigen(a, { haken: true });
      await a.waitForSelector("#ansicht-laden:not([hidden])", { timeout: 3000 }).catch(() => {});
      await warte(300);
      freiA();
      await a.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 30000 });
      const bSagt = await bt.waitForFunction(() => /Nicht gespeichert – das Gespräch wurde inzwischen gelöscht/.test(document.querySelector("#toasts").textContent), null, { timeout: 10000 }).then(() => true).catch(() => false);
      await warte(800);
      const ablage = (await ablageTitel(bt, "gabi")) || ["?"];
      pruefe(bWartet && bSagt && posts === 1 && !ablage.length,
        `${name}: A speichert, B wartet auf die Sperre, A meldet sich mit Häkchen ab – nichts kommt aufs Gerät zurück, eine Notiz, B sagt warum (${JSON.stringify({ bWartet, bSagt, posts, ablage })})`);
      pruefe(kb.length === 0, `${name} 3c e: keine Fehler in der Konsole (Tab B)${kb.length ? ` (${kb.join(" | ")})` : ""}`);
      await c.close();
    }

    // f) 401 während des Wartens beim Abmelden: „Nicht gespeichert (TP-01): Der Zugangscode galt nicht mehr.“ bleibt stehen
    //    (die 401 kommt vom Browser selbst, nie ein falscher Code an einen Worker)
    {
      const c = await kontext();
      let frei = null;
      await c.route("**/api/notizen", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await new Promise((r) => { frei = r; });
        return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ fehler: "Zugangscode falsch." }) }).catch(() => {});
      });
      const p = await c.newPage();
      await anmelden(p);
      await entwurfHolen(p, "Sprunggelenk links, Dorsalextension 15 Grad.");
      await speichernTippen(p);
      await abmeldenBestaetigen(p, { haken: false });
      await p.waitForSelector("#ansicht-laden:not([hidden])", { timeout: 3000 }).catch(() => {});
      frei();
      await p.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 30000 });
      await warte(300);
      const t = await toastText(p);
      pruefe(/Nicht gespeichert \(TP-01\): Der Zugangscode galt nicht mehr/.test(t), `${name}: 401 beim Speichern während des Abmeldens – der Fehler steht auf der Zugangsseite (${t.slice(0, 90)})`);
      await c.close();
    }

    // g) Chromium: Frist je Anfrage – B's Speichern hängt und scheitert, A wartet auf die Sperre und meldet sich ohne Häkchen
    //    ab; A schickt erst danach los und braucht länger als die 20 s ab dem Abmelden → Abmelden wartet, Karte gespeichert
    if (name === "chromium") {
      const c = await kontext();
      let posts = 0;
      await c.route("**/api/notizen", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts++;
        if (posts === 1) { await warte(12000); return route.abort("failed").catch(() => {}); }
        await warte(10000);
        return notizAntwort(route);
      });
      const a = await c.newPage();
      await anmelden(a);
      const x = await entwurfHolen(a, "Halswirbelsäule, Rotation frei.");
      const bt = await c.newPage();
      await bt.goto(`${basis}/${x}`);
      await bt.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
      await speichernTippen(bt);
      await a.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
      await a.waitForFunction(() => /Gabi wartet darauf/.test(document.querySelector("#toasts").textContent), null, { timeout: 3000 }).catch(() => {});
      const start = Date.now();
      await abmeldenBestaetigen(a, { haken: false });
      await a.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 45000 });
      const dauer = Date.now() - start;
      await anmelden(a);
      await a.evaluate((h) => { location.hash = h; }, x);
      await a.waitForSelector(".karte-entwurf", { timeout: 10000 });
      const erledigt = await a.evaluate(() => document.querySelector(".karte-entwurf").classList.contains("erledigt"));
      pruefe(posts === 2 && erledigt && dauer > 20000,
        `${name}: Frist je Anfrage – A schickt erst nach B's Fehlschlag, Abmelden wartet auf A's Antwort (${Math.round(dauer / 100) / 10} s), die Karte ist gespeichert (${posts} Anfragen)`);
      await c.close();
    }

    // h) zwei Tabs, Netzfehler in A gleich nach dem Entwurf: B übernimmt die vorläufige Antwort samt Karte (5-s-Frist).
    //    neuladen   – A lädt in der Frist neu, B korrigiert danach den Befund → die Korrektur gilt auch in A und geht zum Server
    //    bearbeiten – B tippt in der Frist auf „Bearbeiten“, korrigiert danach → ebenso
    //    aFenster   – A korrigiert selbst in der Frist, B schreibt danach → A's Korrektur bleibt
    //    aSpeichert – A speichert in der Frist → B zeigt den Entwurf sofort als gespeichert (nicht erst nach der Frist)
    //    (A's Strom liefert der Browser selbst: Entwurf, nach 300 ms Netzfehler; Notizen beantwortet der Browser)
    for (const variante of ["neuladen", "bearbeiten", "aFenster", "aSpeichert"]) {
      const c = await kontext();
      const posts = [];
      await c.route("**/api/notizen", (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const body = JSON.parse(route.request().postData() || "{}");
        posts.push(((body.strukturiert && body.strukturiert.befund) || []).join(" "));
        return notizAntwort(route);
      });
      const a = await c.newPage();
      const ka = konsoleBeobachten(a);
      await a.addInitScript((zeile) => {
        const echt = window.fetch.bind(window);
        window.fetch = async (url, opt) => {
          let letzte = "";
          try { const l = (JSON.parse(String((opt && opt.body) || "{}")).nachrichten || []).slice(-1)[0]; letzte = String((l && l.text) || ""); } catch { /* keine JSON-Anfrage */ }
          if (!String(url).endsWith("/api/chat") || !letzte.includes("NETZKARTE")) return echt(url, opt);
          const enc = new TextEncoder();
          return new Response(new ReadableStream({ start(s) { s.enqueue(enc.encode(zeile)); setTimeout(() => s.error(new TypeError("Load failed")), 300); } }),
            { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
        };
      }, `${JSON.stringify({ t: "entwurf", entwurf: { patient_id: "7e3c1a52-0001-4000-8000-000000000001", kuerzel: "TP-01", pseudonym: "", rohtext: "Diktat 3c h",
        strukturiert: { befund: ["Befund ORIGINAL"], massnahmen: ["MLD 20 Minuten"], verlauf: [], hausaufgaben: [], unklar: [] } } })}\n`);
      const fragenUndWarten = async (p, text) => {
        const vorher = await p.locator("#nachrichten .nachricht.von-gabi").count();
        await fragen(p, text);
        await p.waitForFunction((v) => document.querySelectorAll("#nachrichten .nachricht.von-gabi").length > v && !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen"), vorher, { timeout: 20000 });
      };
      const korrigieren = async (p, text, { offen = false } = {}) => {
        if (!offen) await p.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-bearbeiten']");
        await p.fill(".karte-entwurf textarea[data-abschnitt='befund']", text);
        await p.click(".karte-entwurf [data-aktion='entwurf-uebernehmen']");
      };
      await anmelden(a);
      await fragen(a, "Erste Frage in H");
      await a.waitForFunction(() => !document.querySelector("#senden.stoppt") && /^#\/gespraech\//.test(location.hash));
      const x = await a.evaluate(() => location.hash);
      const bt = await c.newPage();
      const kb = konsoleBeobachten(bt);
      await bt.goto(`${basis}/${x}`);
      await bt.waitForFunction(() => /Erste Frage in H/.test(document.querySelector("#nachrichten").textContent));
      await fragen(a, "Notiz NETZKARTE");
      await a.waitForSelector(".von-gabi .hinweis-box", { timeout: 10000 });
      const t0 = Date.now();
      const bis = (ms) => warte(Math.max(0, ms - (Date.now() - t0)));
      const bHatKarte = await bt.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']", { timeout: 3000 }).then(() => true).catch(() => false);
      let erwartet = "Befund KORRIGIERT in B";
      let extra = {};
      if (variante === "neuladen") {
        await bis(1000);
        await a.reload();
        await a.waitForSelector(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']", { timeout: 15000 });
        await bis(6000);
        await korrigieren(bt, erwartet);
      } else if (variante === "bearbeiten") {
        await bis(1500);
        await bt.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-bearbeiten']");
        await bis(6500); // A hat den Netzfehler nach 5 s bestätigt
        await korrigieren(bt, erwartet, { offen: true });
      } else if (variante === "aFenster") {
        erwartet = "Befund KORRIGIERT in A";
        await bis(500);
        await korrigieren(a, erwartet);
        await bis(2500);
        await fragenUndWarten(bt, "Frage aus B in H");
        await bis(7000);
      } else {
        await bis(500);
        await a.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
        await a.waitForSelector(".karte-entwurf.erledigt", { timeout: 4000 }).catch(() => {});
        const sofort = await bt.waitForSelector(".karte-entwurf.erledigt", { timeout: Math.max(300, 4500 - (Date.now() - t0)) }).then(() => true).catch(() => false);
        extra = { sofort, nachS: Math.round((Date.now() - t0) / 100) / 10 };
        erwartet = "Befund ORIGINAL";
      }
      if (variante !== "aSpeichert") {
        await warte(1500);
        await fragenUndWarten(a, "Frage aus A in H"); // A schreibt das Gespräch – nimmt dabei nichts zurück
        await warte(1500);
        await a.click(".karte-entwurf:not(.erledigt) [data-aktion='entwurf-speichern']");
        await a.waitForSelector(".karte-entwurf.erledigt", { timeout: 15000 }).catch(() => {});
      }
      await warte(800);
      const ok = bHatKarte && posts.length === 1 && posts[0] === erwartet && (variante !== "aSpeichert" || extra.sofort);
      pruefe(ok, `${name}: Netzfehler nach dem Entwurf, zwei Tabs (${variante}) – ${variante === "aSpeichert" ? "B zeigt A's Speichern sofort" : variante === "aFenster" ? "A's eigene Korrektur bleibt" : "B's Korrektur gilt auch in A"}, eine Notiz mit „${erwartet}“ (${JSON.stringify({ bHatKarte, posts, ...extra })})`);
      pruefe(ka.length === 0 && kb.length === 0, `${name} 3c h ${variante}: keine Fehler in der Konsole${ka.length || kb.length ? ` (${[...ka, ...kb].join(" | ")})` : ""}`);
      await c.close();
    }
    pruefe(!ohneCode.length, `${name} 3c: keine Anfrage ohne Zugangscode${ohneCode.length ? `: ${ohneCode.join(", ")}` : ""}`);
    await b.close();
  }
}

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
  await ctx.addInitScript(() => { window.__zeichnen = 0; document.addEventListener("animationstart", (e) => { if (e.animationName === "zeichnen") window.__zeichnen++; }, true); });
  await page.reload();
  await page.waitForSelector(".karte-bericht", { timeout: 15000 });
  await warte(500);
  const zeichnen = await page.evaluate(() => window.__zeichnen);
  pruefe(zeichnen === 0, `safari: nach dem Neuladen steht das Häkchen „Gespeichert“ fertig da, nichts zeichnet sich neu (${zeichnen})`);
  await schubladeAuf(page);
  pruefe(GESPRAECH_URL.test(adresse) && page.url() === adresse && (await listenTitel(page, "#schublade-liste")).length === 1,
    "safari: Gespräch mit eigener Adresse übersteht das Neuladen (IndexedDB in WebKit), Schublade zeigt es");
  pruefe(konsole.length === 0, `safari: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  // v2.1.1: zwei Tabs, derselbe Entwurf – auch in WebKit (IndexedDB-Vorgang, Kanal)
  await entwurfZweiTabs(safari, "safari", { art: "speichern", verzoegert: true });
  await entwurfZweiTabs(safari, "safari", { art: "verwerfen" });
  await safari.close();
}

// ---------------------------------------------------------------------------
// 4b v2.1.1: Fokus rund um die Schublade – Safari fokussiert Knöpfe beim Tippen und Klicken nicht (Fund 4).
//    Soll wie Chromium: zurück auf ☰ bzw. ein sinnvolles Ziel; nach Tippen ohne Ring, per Tastatur mit Ring;
//    nie ein Ring um die ganze Schublade. WebKit und Chromium, Tippen und Tastatur; dazu Safari am Laptop (Maus).
// ---------------------------------------------------------------------------
for (const [name, typ] of [["safari", webkit], ["chromium", chromium]]) {
  const browser = await typ.launch();
  for (const art of ["tippen", "tastatur"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(art === "tippen" ? { isMobile: true, hasTouch: true } : {}) });
    await stumm(ctx);
    const page = await ctx.newPage();
    const konsole = konsoleBeobachten(page);
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector(".vorschlag");
    const TAB = name === "safari" ? "Alt+Tab" : "Tab"; // Safari: erst Wahl+Tab erreicht auch Knöpfe und Links
    const hin = async (sel) => { for (let i = 0; i < 60 && !(await page.evaluate((s) => document.activeElement.matches(s), sel)); i++) await page.keyboard.press(TAB); };
    const tun = async (sel) => { if (art === "tippen") await page.tap(sel); else { await hin(sel); await page.keyboard.press("Enter"); } };
    /** Wartet, bis der Fokus auf sel liegt (und optional den Text hat); liefert, ob ein Ring zu sehen ist – sonst null. */
    const fokus = (sel, text = null) => page.waitForFunction(([s, t]) => { const a = document.activeElement; return a && a.matches(s) && (!t || a.textContent.trim() === t); }, [sel, text], { timeout: 3000 })
      .then(() => page.evaluate(() => document.activeElement.matches(":focus-visible"))).catch(() => null);
    const soll = (ring, text, mitRing = art === "tastatur") => pruefe(ring === mitRing, `${name}/${art}: ${text} (${mitRing ? "mit" : "ohne"} Ring)`);
    for (const t of ["Was steht heute an?", "Wo sind die Standorte?", "Was wollte TP-01?"]) {
      await page.fill("#eingabe-text", t);
      if (art === "tippen") await page.tap("#senden"); else { await page.focus("#eingabe-text"); await page.keyboard.press("Enter"); }
      await page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && document.querySelector(".von-gabi"));
      await warte(200);
      if (t !== "Was wollte TP-01?") await tun("#kopf-neu");
    }
    const auf = async () => { await tun("#kopf-menue"); await page.waitForSelector("#schublade[open]"); await warte(350); };
    await auf();
    soll(await fokus('#schublade-liste [aria-current="true"]'), "☰ öffnet die Schublade, Fokus auf dem offenen Gespräch");
    await tun("#schublade-zu");
    await schubladeZu(page);
    const sofort = await page.evaluate(() => document.activeElement.id); // gleich beim Schließen, nicht erst später
    soll(await fokus("#kopf-menue"), `✕ schließt die Schublade, Fokus sofort zurück auf ☰ (${sofort || "body"})`);
    pruefe(sofort === "kopf-menue", `${name}/${art}: der Fokus ist schon beim Schließen auf ☰ (${sofort || "body"})`);
    await auf();
    await page.keyboard.press("Escape");
    await schubladeZu(page);
    soll(await fokus("#kopf-menue"), "Esc schließt die Schublade, Fokus sofort zurück auf ☰", true);
    if (art === "tippen") {
      await auf();
      await page.touchscreen.tap(375, 420);
      await schubladeZu(page);
      soll(await fokus("#kopf-menue"), "Tipp daneben schließt die Schublade, Fokus zurück auf ☰");
    }
    await auf();
    const papierkorb = '#schublade-liste [data-gespraech]:not(.aktiv) [data-gespraech-aktion="loeschen"]';
    await tun(papierkorb);
    await page.waitForSelector("#dialog-frage[open]");
    await tun("#frage-nein");
    soll(await fokus(papierkorb), "Löschen → Abbrechen: Fokus zurück auf den Papierkorb");
    await warte(150); // die Rückfrage ist erst nach ihrem close-Ereignis wieder frei (frageOffen)
    await tun(papierkorb); // „Wo sind die Standorte?“ (erster Eintrag, der nicht offen ist)
    await page.waitForSelector("#dialog-frage[open]");
    await tun("#frage-ja");
    soll(await fokus("#schublade-liste .gespraech-link", "Was steht heute an?"), "Löschen → Ja: Fokus auf dem Nachbarn, Schublade bleibt offen");
    pruefe(await page.evaluate(() => document.querySelector("#schublade").open), `${name}/${art}: Schublade bleibt nach dem Löschen offen`);
    await warte(150);
    const aktivKorb = '#schublade-liste [data-gespraech].aktiv [data-gespraech-aktion="loeschen"]';
    await tun(aktivKorb); // das offene Gespräch „Was wollte TP-01?“
    await page.waitForSelector("#dialog-frage[open]");
    await tun("#frage-ja");
    soll(await fokus("#schublade-liste .gespraech-link", "Was steht heute an?"), "offenes Gespräch löschen → Fokus auf dem Nachbarn (nicht auf der Schublade)");
    await warte(150);
    await tun('#schublade-liste [data-gespraeche="alle-loeschen"]');
    await page.waitForSelector("#dialog-frage[open]");
    await tun("#frage-ja");
    soll(await fokus("#schublade [data-gespraech-neu]"), "Alle löschen → Ja: Fokus auf „Neues Gespräch“");
    pruefe(await page.evaluate(() => { const d = document.querySelector("#schublade"); d.focus({ focusVisible: true }); const o = getComputedStyle(d).outlineStyle; document.querySelector("#schublade [data-gespraech-neu]").focus(); return o === "none"; }),
      `${name}/${art}: kein Fokusring um die ganze Schublade (Safari fokussiert sie nach einer Rückfrage selbst)`);
    await page.setViewportSize({ width: 1100, height: 844 });
    soll(await fokus("#seite-neu"), "Breitziehen über 1024 px schließt die Schublade, Fokus in der Seitenleiste");
    if (art === "tippen") {
      // Notiz bearbeitet → ☰ → „Neues Gespräch“ → „Weiter bearbeiten“: Schublade ist zu, Fokus auf ☰ (nicht body, nicht der Dialog)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { location.hash = "#/notizen/n/7e3c1a52-0102-4000-8000-000000000102"; });
      await page.waitForSelector('[data-leser="bearbeiten"]');
      await page.tap('[data-leser="bearbeiten"]');
      await page.locator("#ansicht-notizen textarea").first().fill("Test: Fokus nach der Rückfrage");
      await auf();
      await page.tap("#schublade [data-gespraech-neu]");
      await page.waitForSelector("#dialog-frage[open]");
      await page.tap("#frage-nein");
      await schubladeZu(page);
      soll(await fokus("#kopf-menue"), "Notiz bearbeitet → Neues Gespräch → „Weiter bearbeiten“: Fokus auf ☰");
    }
    pruefe(konsole.length === 0, `${name}/${art} Schublade-Fokus: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
    await ctx.close();
  }
  if (name === "safari") {
    // Safari am Laptop (Maus): Seitenleiste – Papierkorb → Abbrechen → zurück auf den Papierkorb; Löschen → Nachbar; ohne Ring
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await stumm(ctx);
    const page = await ctx.newPage();
    const konsole = konsoleBeobachten(page);
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector(".vorschlag");
    for (const t of ["Was steht heute an?", "Wo sind die Standorte?", "Was wollte TP-01?"]) {
      await fragen(page, t);
      await ruhigWarten(page);
      if (t !== "Was wollte TP-01?") { await page.click("#seite-neu"); await page.waitForFunction(() => location.hash === "#/"); }
    }
    const eintragSel = (t) => `#seiten-gespraeche .gespraech-eintrag:has-text("${t}")`;
    const fokusInfo = () => page.evaluate(() => { const a = document.activeElement; return { text: (a.closest(".gespraech-eintrag") || a).textContent.trim().slice(0, 40), was: a.dataset.gespraechAktion || a.className || a.tagName, ring: a.matches(":focus-visible") }; });
    await page.hover(eintragSel("Wo sind die Standorte?"));
    await page.click(`${eintragSel("Wo sind die Standorte?")} [data-gespraech-aktion="loeschen"]`);
    await page.waitForSelector("#dialog-frage[open]");
    await page.click("#frage-nein");
    await warte(200);
    const f1 = await fokusInfo();
    await warte(150);
    await page.hover(eintragSel("Wo sind die Standorte?"));
    await page.click(`${eintragSel("Wo sind die Standorte?")} [data-gespraech-aktion="loeschen"]`);
    await page.waitForSelector("#dialog-frage[open]");
    await page.click("#frage-ja");
    await warte(200);
    const f2 = await fokusInfo();
    pruefe(f1.was === "loeschen" && /Wo sind die Standorte/.test(f1.text) && !f1.ring && /gespraech-link/.test(f2.was) && /Was steht heute an/.test(f2.text) && !f2.ring && konsole.length === 0,
      `safari/laptop: Seitenleiste – Löschen → Abbrechen: Fokus auf dem Papierkorb, Löschen → Ja: auf dem Nachbarn, beides ohne Ring (${JSON.stringify([f1, f2])})`);
    await ctx.close();
    // v2.1.1 Nachprüfung, Safari mit „Bewegung reduzieren“ (Tippen): Notiz bearbeitet → ☰ → „Neues Gespräch“ → „Weiter
    // bearbeiten“: Fokus auf ☰ ohne Ring (die Schublade schließt dann sofort, Safari gab ☰ mit Ring zurück).
    // Info-Dialog → „Beispieldaten zurücksetzen“ → „Abbrechen“: Fokus zurück aufs Badge (nicht body), ohne Ring
    for (const [w, h, touch] of [[390, 844, true], [768, 1024, false]]) {
      const c2 = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", ...(touch ? { isMobile: true, hasTouch: true } : {}) });
      await stumm(c2);
      const p2 = await c2.newPage();
      const k2 = konsoleBeobachten(p2);
      const tun = (sel) => (touch ? p2.tap(sel) : p2.click(sel));
      const fokus = (sel) => p2.waitForFunction((s) => document.activeElement && document.activeElement.matches(s), sel, { timeout: 3000 })
        .then(() => p2.evaluate(() => document.activeElement.matches(":focus-visible"))).catch(() => null);
      await p2.goto(`${basis}/?demo=1#/notizen/n/7e3c1a52-0102-4000-8000-000000000102`);
      await p2.waitForSelector('[data-leser="bearbeiten"]');
      await tun('[data-leser="bearbeiten"]');
      await p2.locator("#ansicht-notizen textarea").first().fill("Test: Fokus nach der Rückfrage (reduziert)");
      await tun("#kopf-menue");
      await p2.waitForSelector("#schublade[open]");
      await tun("#schublade [data-gespraech-neu]");
      await p2.waitForSelector("#dialog-frage[open]");
      await tun("#frage-nein");
      await schubladeZu(p2);
      await warte(300);
      const ring1 = await fokus("#kopf-menue");
      pruefe(ring1 === false, `safari/reduziert ${w}px: Notiz bearbeitet → ☰ → Neues Gespräch → „Weiter bearbeiten“: Fokus auf ☰ ohne Ring (${ring1})`);
      await tun("#test-badge");
      await p2.waitForSelector("#dialog-info[open]");
      await tun("#info-zuruecksetzen");
      await p2.waitForSelector("#dialog-frage[open]");
      await tun("#frage-nein");
      await warte(300);
      const ring2 = await fokus("#test-badge");
      pruefe(ring2 === false, `safari/reduziert ${w}px: Info → „Beispieldaten zurücksetzen“ → „Abbrechen“: Fokus zurück aufs Badge, ohne Ring (${ring2})`);
      pruefe(k2.length === 0, `safari/reduziert ${w}px: keine Fehler in der Konsole${k2.length ? ` (${k2.join(" | ")})` : ""}`);
      await c2.close();
    }
  }
  await browser.close();
}

// ---------------------------------------------------------------------------
// 5 v2.1.2: Eingabefelder ohne Anschnitt – Messung per Bildvergleich (tests/eingabefelder.mjs, auch allein startbar)
// ---------------------------------------------------------------------------
{
  const { eingabefelderPruefen } = await import("./eingabefelder.mjs");
  await eingabefelderPruefen({ chromium, webkit, basis, aus: join(aus, "eingabefelder"), pruefe, live: LIVE });
}

console.log(fehler.length ? `\n${fehler.length} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler.length ? 1 : 0);
