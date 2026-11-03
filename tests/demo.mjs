// Ende-zu-Ende-Test des Demo-Modus (ohne Backend, ohne Secrets): Aufnahme, Notiz, Ordner, PDF – Handy + Laptop,
// dazu: automatischer Demo-Modus bei fehlendem Backend, Mikrofon verweigert, Safari-Engine (WebKit) ohne Mikrofon.
// Voraussetzung: eine Oberfläche läuft (z. B. `npm run lokal` → http://localhost:8788), Playwright mit Chromium + WebKit.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright node tests/demo.mjs <diktat.wav> <ausgabe-ordner> [basis-url]
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , audio, aus, basis = "http://localhost:8788"] = process.argv;
if (!audio || !aus) throw new Error("Aufruf: node tests/demo.mjs <diktat.wav> <ausgabe-ordner> [basis-url]");
await mkdir(aus, { recursive: true });

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const ERSTES_DIKTAT = "Knie rechts. Patientin berichtet weniger Schmerzen beim Treppensteigen";

function konsoleBeobachten(page) {
  const meldungen = [];
  page.on("console", (m) => {
    if (!["error", "warning"].includes(m.type())) return;
    // WebKit blockiert unter style-src 'self' die eingebauten Stile von <select> und <input type=search>
    // (geprüft: ohne beide Elemente 0 Meldungen, unser style.css ist nicht betroffen) – harmlos
    if (/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/.test(m.text())) return;
    if (/ERR_FAILED|net::|Failed to load resource/.test(m.text())) return; // absichtlich blockierte Anfragen
    meldungen.push(m.text());
  });
  page.on("pageerror", (e) => meldungen.push(`pageerror: ${e.message}`));
  return meldungen;
}

const station = (page) => page.evaluate(() => [document.querySelector("#station").dataset.zustand, document.querySelector("#status-text").textContent]);
const demoNotizen = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("gabi.demo.v1") || "{}").notizen?.length ?? 0);

async function pdfPruefen(name, page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-leser="pdf"]')]);
  const datei = join(aus, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(datei);
  const inhalt = await readFile(datei);
  const seiten = (inhalt.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
  pruefe(/^PhysioWorks_TP-01_\d{4}-\d{2}-\d{2}\.pdf$/.test(download.suggestedFilename()) && inhalt.subarray(0, 4).toString() === "%PDF" && seiten >= 1,
    `${name}: PDF ${download.suggestedFilename()} (${seiten} Seite${seiten === 1 ? "" : "n"}, ${Math.round(inhalt.length / 1024)} KB)`);
}

// ---------- 1 Kompletter Demo-Ablauf mit Fake-Mikrofon (Chromium) ----------
const chrome = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${audio}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

async function ablauf(name, viewport, mobil) {
  const ctx = await chrome.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 2, acceptDownloads: true, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  let serverAnfragen = 0;
  page.on("request", (r) => { if (r.url().includes("/api/")) serverAnfragen++; });
  const bild = (n) => page.screenshot({ path: join(aus, `${name}-${n}.png`), fullPage: true });

  await page.goto(`${basis}/?demo=1#/aufnahme`);
  await page.waitForSelector("#demobanner:not([hidden])");
  pruefe(await page.isHidden("#ansicht-zugang"), `${name}: Demo-Modus ohne Zugangscode, Banner sichtbar`);
  await page.waitForFunction(() => document.querySelector("#patient-wahl").options.length === 4);
  await page.selectOption("#patient-wahl", { label: "TP-01 · Testfall Knie rechts (fiktiv)" });
  pruefe((await station(page))[0] === "bereit", `${name}: Zustand „Bereit“`);
  await bild("1-bereit");

  // Push-to-Talk: gedrückt halten → nimmt auf → loslassen → verarbeitet → fertig
  await page.locator("#ptt").scrollIntoViewIfNeeded();
  const k = await page.locator("#ptt").boundingBox();
  pruefe(k.width >= 184 && k.height >= 184, `${name}: Aufnahmeknopf groß genug (${Math.round(k.width)} px)`);
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.waitForSelector('#station[data-zustand="aufnahme"]');
  pruefe((await station(page))[1] === "Nimmt auf", `${name}: Zustand „Nimmt auf“`);
  await page.waitForTimeout(3000);
  await bild("2-nimmt-auf");
  await page.mouse.up();
  await page.waitForSelector('#station[data-zustand="verarbeitet"]', { timeout: 5000 });
  pruefe(true, `${name}: Zustand „Verarbeitet“`);
  await page.waitForSelector('#station[data-zustand="fertig"]', { timeout: 15000 });
  pruefe((await page.inputValue("#entwurf-roh")).startsWith(ERSTES_DIKTAT), `${name}: Fake-Transkript nach echter Aufnahme`);
  pruefe((await page.inputValue('#entwurf-abschnitte textarea[data-abschnitt="massnahmen"]')).includes("Beinpresse 35 kg"), `${name}: Fake-Notiz mit Abschnitten, Zustand „Fertig“`);
  await bild("3-fertig");

  // Speichern – Doppelklick legt nur eine Notiz an
  const vorher = await demoNotizen(page);
  await page.locator("#speichern").dblclick();
  await page.waitForFunction(() => /Gespeichert bei TP-01/.test(document.querySelector("#toasts").textContent));
  await page.waitForTimeout(400);
  pruefe((await demoNotizen(page)) === vorher + 1, `${name}: Speichern (Doppelklick = nur 1 Notiz)`);

  // Beispieldiktat ohne Mikrofon, dann verwerfen
  await page.click("#demo-diktat");
  await page.waitForSelector('#station[data-zustand="fertig"]', { timeout: 15000 });
  await page.click("#verwerfen");
  await page.click("#frage-ja");
  pruefe(await page.isHidden("#entwurf"), `${name}: Beispieldiktat ohne Mikrofon + Verwerfen`);

  // Notizordner: Patienten → TP-01 → Sortierung
  await page.click('.ansicht[data-ansicht="ordner"]');
  await page.waitForFunction(() => /Test-Patienten \(3\)/.test(document.querySelector("#ordner-kopf").textContent));
  await page.click('#ordner-liste .eintrag:has-text("TP-01")');
  await page.waitForSelector('#ordner-liste .eintrag[href*="/n/"]');
  const zeiten = () => page.$$eval('#ordner-liste .eintrag[href*="/n/"]', (a) => a.map((x) => x.getAttribute("href")));
  const neu = await zeiten();
  await page.selectOption("#sortierung", "alt");
  const alt = await zeiten();
  pruefe(neu.length === 3 && JSON.stringify([...neu].reverse()) === JSON.stringify(alt), `${name}: Ordner TP-01 mit 3 Notizen, Sortierung umkehrbar`);
  await page.selectOption("#sortierung", "neu");
  await bild("4-ordner");

  // Suche + leerer Zustand
  if (mobil) { await page.click('.ansicht[data-ansicht="ordner"]'); await page.waitForSelector("#suche", { state: "visible" }); }
  await page.fill("#suche", "theraband");
  await page.waitForFunction(() => /^2 Notizen gefunden/.test(document.querySelector("#ordner-kopf").textContent));
  await page.fill("#suche", "xyzabc");
  await page.waitForSelector('[data-ordner="suche-loeschen"]');
  pruefe(true, `${name}: Suche (2 Treffer) und leerer Zustand mit „Suche löschen“`);
  await page.click('[data-ordner="suche-loeschen"]');

  // Notiz öffnen → PDF → Bearbeiten (mit Nachfrage) → Löschen
  await page.click('.ansicht[data-ansicht="ordner"]');
  await page.click('#ordner-liste .eintrag:has-text("TP-01")');
  await page.click('#ordner-liste .eintrag[href*="/n/"] >> nth=0');
  await page.waitForSelector('[data-leser="pdf"]');
  await bild("5-notiz");
  await pdfPruefen(name, page);
  await page.click('[data-leser="bearbeiten"]');
  const feld = page.locator('#bearbeiten-abschnitte textarea[data-abschnitt="verlauf"]');
  await feld.fill(`${await feld.inputValue()}\nTest: bearbeitet`);
  await page.evaluate(() => { location.hash = "#/ordner"; });
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#frage-nein");
  pruefe(await page.isVisible("#bearbeiten-abschnitte"), `${name}: Wegnavigieren mit Änderungen fragt nach`);
  await page.click('[data-leser="sichern"]');
  await page.waitForFunction(() => /bearbeitet/.test(document.querySelector(".leser-zeit")?.textContent || ""));
  pruefe((await page.textContent("#leser")).includes("Test: bearbeitet"), `${name}: Bearbeiten gespeichert`);
  await page.click('[data-leser="loeschen"]');
  await page.click("#frage-ja");
  await page.waitForFunction(() => /Notiz gelöscht/.test(document.querySelector("#toasts").textContent));
  pruefe((await demoNotizen(page)) === vorher, `${name}: Löschen mit Bestätigung`);

  pruefe(serverAnfragen === 0, `${name}: keine einzige Server-Anfrage im Demo-Modus`);
  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}

await ablauf("handy", { width: 390, height: 844 }, true);
await ablauf("laptop", { width: 1366, height: 860 }, false);

// ---------- 2 Automatisch Demo, wenn das Backend fehlt ----------
for (const [fall, antwort, text] of [
  ["nicht erreichbar", (route) => route.abort("connectionrefused"), "Server nicht erreichbar"],
  ["nicht eingerichtet", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, bereit: false, eingerichtet: { zugang: false, supabase: false } }) }), "noch nicht eingerichtet"],
]) {
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/api/status", antwort);
  await page.goto(`${basis}/#/aufnahme`);
  await page.waitForSelector("#demobanner:not([hidden])");
  pruefe((await page.textContent("#demo-text")).includes(text) && (await page.isVisible("#demo-verbinden")), `Backend ${fall}: automatisch Demo-Modus mit Hinweis und „Erneut verbinden“`);
  await ctx.close();
}

// ---------- 3 Mikrofon verweigert → klare Anleitung ----------
{
  const ctx = await chrome.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("verweigert", "NotAllowedError"));
    if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: "prompt", onchange: null });
  });
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/aufnahme`);
  await page.waitForSelector("#demobanner:not([hidden])");
  const k = await page.locator("#ptt").boundingBox();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.waitForSelector('#station[data-zustand="fehler"]');
  await page.mouse.up();
  const hilfe = await page.textContent("#mikro-hilfe");
  pruefe(await page.isVisible("#mikro-hilfe"), "Mikrofon verweigert: Zustand „Fehler“ + Anleitung sichtbar");
  pruefe(/Website-Einstellungen/.test(hilfe) && /Safari/.test(hilfe), "Mikrofon verweigert: iPhone-Anleitung (Safari, Website-Einstellungen)");
  await page.screenshot({ path: join(aus, "mikrofon-verweigert.png"), fullPage: true });
  pruefe(konsole.length === 0, `Mikrofon verweigert: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
}
await chrome.close();

// ---------- 4 Safari-Engine (WebKit): Demo ohne Mikrofon bis zum PDF ----------
{
  const safari = await webkit.launch();
  const ctx = await safari.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1#/aufnahme`);
  await page.waitForFunction(() => document.querySelector("#patient-wahl").options.length === 4);
  await page.selectOption("#patient-wahl", { label: "TP-01 · Testfall Knie rechts (fiktiv)" });
  await page.click("#demo-diktat");
  await page.waitForSelector('#station[data-zustand="fertig"]', { timeout: 15000 });
  await page.click("#speichern");
  await page.waitForFunction(() => /Gespeichert bei TP-01/.test(document.querySelector("#toasts").textContent));
  await page.click('#toasts button:has-text("Ansehen")');
  await page.waitForSelector('[data-leser="pdf"]');
  await pdfPruefen("safari", page);
  pruefe(konsole.length === 0, `safari: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await safari.close();
}

console.log(fehler.length ? `\n${fehler.length} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler.length ? 1 : 0);
