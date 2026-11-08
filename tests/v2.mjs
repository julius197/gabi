// Ende-zu-Ende-Tests für Gabi v2 (Gespräch + Notizordner), ohne Secrets.
//  1  Demo-Modus komplett: Handy (390 px) und Laptop (1440 px), jeweils Hell und Dunkel – mit Screenshots
//  2  Robustheit: 320 px, automatisch Demo, Offline, Mikrofon verweigert, Stopp, Fehler + „Nochmal versuchen“, Vorlesen
//  3  Echte lokale API (Worker-Logik, NDJSON-Strom, Spracherkennung, Speichern) – ohne KI-Schlüssel
//  4  Safari-Engine (WebKit): Demo bis zum PDF
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

  // d) Neues Gespräch warnt vor der nicht gesendeten Aufnahme
  await page.click("#kopf-neu");
  await page.waitForSelector("#dialog-frage[open]");
  const warnung = await page.textContent("#frage-text");
  await page.click("#frage-nein");
  pruefe(warnung === "Eine Aufnahme ist noch nicht gesendet und geht verloren.", `Neues Gespräch: Warnung nennt die nicht gesendete Aufnahme („${warnung}“)`);

  // e) nach der Antwort: „Jetzt senden“ schickt die geparkte Aufnahme (die Park-Karte steht unter der Antwort)
  await page.waitForFunction(() => !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen")
    && [...document.querySelectorAll(".von-gabi .nachricht-text")].some((t) => /85 €/.test(t.textContent)), null, { timeout: 20000 });
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
  pruefe(/Aus der Vorversion/.test(text) && /Flexion Knie rechts bis 100°/.test(text) && rest === null && page.url().endsWith("#/"),
    "Übergang: offener v1-Entwurf wird als Entwurfskarte übernommen (einmal), v1-Adresse #/aufnahme → #/");
  await ctx.close();

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
  pruefe(!/Aufnahme/.test(nachLeer), `Echte API: leere Aufnahme zählt nicht als „nicht gesendet“${nachLeer ? ` („${nachLeer}“)` : ""}`);
  await page.unroute("**/api/transkribieren");
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
  pruefe(konsole.length === 0, `safari: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await safari.close();
}

console.log(fehler.length ? `\n${fehler.length} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler.length ? 1 : 0);
