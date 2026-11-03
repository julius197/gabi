// Ende-zu-Ende-Test im lokalen Modus: Aufnahme (Fake-Mikrofon) → Notiz → Speichern → Ordner → Suche → Bearbeiten → PDF.
// Voraussetzung: `npm run lokal` läuft (Port 8788), Playwright mit Chromium ist installiert.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright node tests/ablauf.mjs <diktat.wav> <ausgabe-ordner> [basis-url]
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , audio, aus, basis = "http://localhost:8788"] = process.argv;
if (!audio || !aus) throw new Error("Aufruf: node tests/ablauf.mjs <diktat.wav> <ausgabe-ordner> [basis-url]");
await mkdir(aus, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${audio}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };

async function lauf(name, viewport, mobil) {
  const ctx = await browser.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 2, acceptDownloads: true, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const konsole = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !m.text().includes("401")) konsole.push(m.text()); }); // 401 = absichtlich falscher Code
  page.on("pageerror", (e) => konsole.push(`pageerror: ${e.message}`));
  const bild = (n) => page.screenshot({ path: join(aus, `${name}-${n}.png`), fullPage: true });

  await page.goto(basis);
  await page.fill("#zugang-code", "falsch");
  await page.click("#zugang-knopf");
  await page.waitForSelector("#zugang-fehler:not(:empty)");
  pruefe((await page.textContent("#zugang-fehler")).includes("falsch"), `${name}: falscher Code wird abgelehnt`);
  await page.fill("#zugang-code", "test");
  await page.click("#zugang-knopf");
  await page.waitForSelector("#ansicht-aufnahme:not([hidden])");
  await page.waitForFunction(() => document.querySelector("#patient-wahl").options.length > 1);
  pruefe(await page.isVisible(".testbanner"), `${name}: Testbanner sichtbar`);

  // Neuer Test-Patient (Klarname wird abgelehnt)
  const kuerzel = `T${name === "handy" ? "H" : "L"}-${String(Date.now()).slice(-4)}`;
  await page.click("#patient-neu");
  await page.fill("#patient-kuerzel", "Meier");
  await page.click("#patient-anlegen");
  pruefe((await page.textContent("#patient-fehler")).includes("Ziffer"), `${name}: Kürzel ohne Ziffer (Name) wird abgelehnt`);
  await page.fill("#patient-kuerzel", kuerzel);
  await page.fill("#patient-pseudonym", "Testfall Knie (fiktiv)");
  await page.click("#patient-anlegen");
  await page.waitForFunction((k) => document.querySelector("#patient-wahl").selectedOptions[0]?.textContent.startsWith(k), kuerzel);
  pruefe(true, `${name}: Test-Patient ${kuerzel} angelegt und gewählt`);
  await bild("1-aufnahme");

  // Push-to-Talk: gedrückt halten
  const knopf = await page.locator("#ptt").boundingBox();
  await page.mouse.move(knopf.x + knopf.width / 2, knopf.y + knopf.height / 2);
  await page.mouse.down();
  await page.waitForSelector('#station[data-zustand="aufnahme"]');
  await page.waitForTimeout(2500);
  await bild("2-aufnahme-laeuft");
  await page.waitForTimeout(23500);
  await page.mouse.up();
  await page.waitForSelector("#entwurf:not([hidden])");
  await page.waitForFunction(() => /fertig|nicht erstellt/.test(document.querySelector("#entwurf-status").textContent), null, { timeout: 120000 });
  const status = await page.textContent("#entwurf-status");
  pruefe(status.includes("fertig"), `${name}: Entwurf erstellt (${status})`);
  const roh = await page.inputValue("#entwurf-roh");
  console.log(`  Transkript: ${roh}`);
  pruefe(/Lymphdrainage/i.test(roh) && /Kreuzband/i.test(roh) && /90 Grad/.test(roh), `${name}: Transkript enthält Fachbegriffe und Zahlen`);
  await page.click("#entwurf-transkript summary");
  await bild("3-entwurf");

  // kurzer Druck → „Zu kurz“
  await page.locator("#ptt").scrollIntoViewIfNeeded();
  const knopf2 = await page.locator("#ptt").boundingBox();
  await page.mouse.move(knopf2.x + knopf2.width / 2, knopf2.y + knopf2.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(700);
  pruefe((await page.textContent("#toasts")).match(/Zu kurz|gedrückt halten/), `${name}: zu kurzer Druck wird abgefangen`);

  await page.click("#speichern");
  await page.waitForFunction((k) => document.querySelector("#toasts").textContent.includes(`Gespeichert bei ${k}`), kuerzel);
  pruefe(await page.isHidden("#entwurf"), `${name}: nach dem Speichern ist der Entwurf leer`);

  // Ordner
  await page.click('.ansicht[data-ansicht="ordner"]');
  await page.waitForSelector('#ordner-liste .eintrag');
  await bild("4-ordner");
  await page.click(`#ordner-liste .eintrag:has-text("${kuerzel}")`);
  await page.waitForSelector('#ordner-liste .eintrag[href*="/n/"]');
  pruefe((await page.locator('#ordner-liste .eintrag[href*="/n/"]').count()) === 1, `${name}: Ordner zeigt die Notiz des Patienten`);
  await page.click('#ordner-liste .eintrag[href*="/n/"]');
  await page.waitForSelector('[data-leser="pdf"]');
  await bild("5-notiz");

  // Suche (am Handy erst zurück zur Liste)
  await page.click('.ansicht[data-ansicht="ordner"]');
  await page.waitForSelector("#suche", { state: "visible" });
  await page.fill("#suche", "lymphdrainage");
  await page.waitForFunction(() => /gefunden/.test(document.querySelector("#ordner-kopf").textContent));
  pruefe((await page.textContent("#ordner-liste")).includes(kuerzel), `${name}: Suche findet die Notiz`);
  await page.fill("#suche", "hüftschmerz");
  await page.waitForFunction(() => /^0 Notizen/.test(document.querySelector("#ordner-kopf").textContent));
  pruefe(true, `${name}: Suche ohne Treffer zeigt 0`);
  await page.fill("#suche", `Kreuzband ${kuerzel}`);
  await page.waitForFunction(() => /^1 Notiz/.test(document.querySelector("#ordner-kopf").textContent));
  pruefe(true, `${name}: Suche mit zwei Wörtern (Begriff + Kürzel) findet genau 1`);
  await bild("6-suche");
  await page.click('#ordner-liste .eintrag[href*="/n/"]');
  await page.waitForSelector('[data-leser="bearbeiten"]', { state: "visible" });

  // Bearbeiten
  await page.click('[data-leser="bearbeiten"]');
  const verlauf = page.locator('#bearbeiten-abschnitte textarea[data-abschnitt="verlauf"]');
  await verlauf.fill(`${await verlauf.inputValue()}\nTest: bearbeitet`.trim());
  await page.click('[data-leser="sichern"]');
  await page.waitForFunction(() => /bearbeitet/.test(document.querySelector(".leser-zeit")?.textContent || ""));
  pruefe((await page.textContent("#leser")).includes("Test: bearbeitet"), `${name}: Bearbeiten wird gespeichert`);

  // PDF
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-leser="pdf"]')]);
  const pdf = join(aus, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(pdf);
  await bild("7-bearbeitet");
  pruefe(new RegExp(`^PhysioWorks_${kuerzel}_\\d{4}-\\d{2}-\\d{2}\\.pdf$`).test(download.suggestedFilename()), `${name}: PDF-Datei ${download.suggestedFilename()}`);

  // Löschen
  await page.click('[data-leser="loeschen"]');
  await page.click("#frage-ja");
  await page.waitForFunction(() => /Notiz gelöscht/.test(document.querySelector("#toasts").textContent));
  await page.waitForSelector("#ordner-liste .ordner-nichts", { state: "attached" });
  pruefe(true, `${name}: Notiz gelöscht, Liste leer`);

  pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();
  return pdf;
}

await lauf("handy", { width: 390, height: 844 }, true);
await lauf("laptop", { width: 1366, height: 860 }, false);
await browser.close();
console.log(fehler.length ? `\n${fehler.length} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler.length ? 1 : 0);
