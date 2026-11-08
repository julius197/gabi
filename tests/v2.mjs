// Ende-zu-Ende-Tests für Gabi v2 (Gespräch + Notizordner), ohne Secrets.
//  1  Demo-Modus komplett: Handy (390 px) und Laptop (1440 px), jeweils Hell und Dunkel – mit Screenshots
//  2  Robustheit: 320 px, automatisch Demo, Offline, Mikrofon verweigert, Stopp, Fehler + „Nochmal versuchen“, Vorlesen
//  3  Echte lokale API (Worker-Logik, NDJSON-Strom, Spracherkennung, Speichern) – ohne KI-Schlüssel
//  4  Safari-Engine (WebKit): Demo bis zum PDF
// Voraussetzung: `cd worker && npm run lokal` läuft (http://localhost:8788, Zugangscode „test“), Playwright mit Chromium + WebKit.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/v2.mjs [diktat.wav] [screenshot-ordner] [basis-url]
// Ohne diktat.wav wird auf dem Mac eine erfundene Test-Aufnahme mit `say` erzeugt (spielt nichts ab).
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

/** Keine echte Sprachausgabe in Testbrowsern (macOS spielt sie sonst laut ab) – nur zählen. */
async function stumm(ctx) {
  await ctx.addInitScript(() => {
    window.__gesprochen = 0;
    const attrappe = { speak(u) { window.__gesprochen++; setTimeout(() => u.onend && u.onend(), 300); }, cancel() {}, getVoices() { return []; }, speaking: false };
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
  await page.waitForFunction(() => /2 Notizen gefunden/.test(document.querySelector("#ordner-inhalt").textContent));
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
  await p2.goto(`${basis}/#/`);
  await p2.waitForSelector("#ansicht-zugang:not([hidden])");
  await p2.evaluate(() => document.fonts.ready);
  await p2.fill("#zugang-code", "falsch-123");
  await p2.click("#zugang-weiter");
  await p2.waitForSelector("#zugang-fehler:not([hidden])");
  pruefe((await p2.textContent("#zugang-fehler")).includes("stimmt nicht"), `${name}: Zugang – falscher Code wird verständlich abgelehnt`);
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
  await page.waitForSelector("#ansicht-chat:not([hidden])", { timeout: 20000 });
  const badge = await page.textContent("#test-badge");
  const hinweis = await page.textContent("#toasts");
  pruefe(badge.includes("Demo") && hinweis.includes(text), `Backend ${fall}: automatisch Demo-Modus mit Hinweis`);
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
  pruefe(true, "Vorlesen: Antwort wird an die Sprachausgabe gegeben (im Test stumm)");
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3 Echte lokale API: Zugang, NDJSON-Strom, Spracherkennung, Fehler + Wiederholen, Speichern
// ---------------------------------------------------------------------------
{
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

  // Diktat mit echter Aufnahme → Spracherkennung → Entwurf → Speichern
  await page.click('#chips-leiste [data-schnell="diktat"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-01")').last().click();
  await mikroHalten(page, 4000);
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 120000 });
  await antwortAbwarten(page, "Entwurf für TP-01", 30000);
  const diktat = await page.evaluate(() => [...document.querySelectorAll(".von-nutzer .blase")].pop().textContent);
  pruefe(/knie|treppe|flexion|schmerz|demo/i.test(diktat), `Echte API: Aufnahme erkannt („${diktat.replace(/\s+/g, " ").slice(0, 70)}…“)`);
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt");
  await page.click('.karte-entwurf.erledigt a[href*="/notizen/n/"]');
  await page.waitForSelector('[data-leser="pdf"]');
  pruefe((await page.textContent(".leser")).includes("TP-01"), "Echte API: Entwurf gespeichert und im Notizordner");
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
