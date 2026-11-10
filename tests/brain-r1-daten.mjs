// Brain – Prüfrunde 1, Gebiet „Datenmodell, Speicher, zwei Tabs“: Browser-Checks zu den Funden 1 bis 6.
// Ohne Secrets, ohne Internet, nie gegen den Live-Worker. Jeder Check schlägt am Stand vor der Korrektur (893abf8) an.
//  Fund 1  Eintrag im anderen Fenster gelöscht, während hier die Bearbeitung offen ist: Hinweis mit Ausweg
//          („Wiederherstellen und speichern“), das Getippte bleibt – auch über ein Neuladen (Notfall-Kopie); 390 und 320 px
//  Fund 2  Rückgängig in Tab A überschreibt eine spätere Änderung aus Tab B nicht
//  Fund 3  Export → neues Gerät → Import: Verbindungen von Hand (in der Vorschau sichtbar) und „zuletzt geändert“ kommen mit
//  Fund 4  IndexedDB hängt oder meldet einen Fehler: kein zweites Brain in localStorage – Fehlerzustand, „Nochmal versuchen“
//  Fund 5  Speicher voll: der Satz der Ablage steht im Formular und im Hinweis; das Brain geht trotzdem auf (auch mit
//          fälligem Papierkorb); ist wieder Platz, verschwindet der Hinweis
//  Fund 6  „Brain-Wissen löschen“ beim Abmelden in Tab A: Tab B (und ein Demo-Tab) erklären es und laden erst auf Tipp neu;
//          ein Tab ohne Nachricht, der danach etwas anlegt, verhindert den Seed nicht
// Voraussetzung: lokaler Server mit Brain (`cd worker && PORT=<port> GABI_BRAIN=1 node dev/lokal.mjs`, Zugangscode „test“),
// Playwright mit Chromium + WebKit.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-r1-daten.mjs [basis-url]
// Auswahl: GABI_MOTOREN=chromium,webkit · GABI_FUNDE=1,2,3,4,5,6 · GABI_BILDER=/ordner (Bilder nur dann, nie ins Repo)
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Diese Tests laufen nur lokal – nie gegen die Live-Seite oder den Live-Worker."); process.exit(2); }

// Auch nicht gegen eine Vorschau, die mit einem echten Worker spricht – siehe tests/ziel.mjs.
await zielPruefen(basis, { live: false });
const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((m) => m.trim()).filter(Boolean);
const FUNDE = new Set((process.env.GABI_FUNDE || "1,2,3,4,5,6").split(",").map((t) => t.trim()));
const BILDER = process.env.GABI_BILDER || "";
if (BILDER) await mkdir(BILDER, { recursive: true });
const ablage = await mkdtemp(join(tmpdir(), "gabi-brain-r1-"));

const fehler = [];
let gezaehlt = 0;
const pruefe = (ok, text) => { gezaehlt++; if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
/** Ein Ablauf darf am alten Stand scheitern, ohne den Lauf abzubrechen: Das zählt als ✗. */
async function ablauf(name, tun) {
  try { await tun(); } catch (e) { pruefe(false, `${name}: Ablauf abgebrochen (${String((e && e.message) || e).split("\n")[0].slice(0, 160)})`); }
}

function konsoleBeobachten(page) {
  const meldungen = [];
  page.on("console", (m) => {
    if (!["error", "warning"].includes(m.type())) return;
    const t = m.text();
    // WebKit blockiert unter style-src 'self' die eingebauten Stile von <select>/<input type=search> – harmlos (seit v1 geprüft)
    if (/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/.test(t)) return;
    meldungen.push(t);
  });
  page.on("pageerror", (e) => meldungen.push(`pageerror: ${e.message}`));
  return meldungen;
}
/** Keine echte Sprachausgabe in Testbrowsern (macOS spielt sie sonst laut ab). Dazu: jeden Toast mitschreiben. */
async function stumm(ctx) {
  await ctx.addInitScript(() => {
    const attrappe = { speak(u) { setTimeout(() => u.onend && u.onend(), 50); }, cancel() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {}, speaking: false };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
    // Toasts verschwinden nach Sekunden – für die Prüfung alle festhalten, sobald sie entstehen
    window.__toasts = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains("toast")) window.__toasts.push(n.textContent.trim().replace(/\s+/g, " "));
    }).observe(document, { childList: true, subtree: true });
  });
}
/** Störungen des Speichers, über localStorage geschaltet (eigene Schlüssel außerhalb von „gabi.…“). */
const STOERUNGEN = () => {
  try {
    // 1) Speicher voll: Schreiben in die Brain-Datenbanken wirft QuotaExceededError, solange __probe_voll = "1"
    const voll = () => { try { return localStorage.getItem("__probe_voll") === "1"; } catch { return false; } };
    for (const name of ["put", "delete", "clear", "add"]) {
      const echt = IDBObjectStore.prototype[name];
      IDBObjectStore.prototype[name] = function (...args) {
        let db = "";
        try { db = this.transaction.db.name; } catch { db = ""; }
        if (/^gabi-brain/.test(db) && voll()) throw new DOMException("Probe: Speicher voll", "QuotaExceededError");
        return echt.apply(this, args);
      };
    }
    // 2) IndexedDB hängt („haengt“) oder meldet einen Fehler („fehler“): beim Laden mit __probe_idb – bis window.__probe_aus
    const wie = localStorage.getItem("__probe_idb");
    if (wie) {
      localStorage.removeItem("__probe_idb");
      const echt = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...rest) {
        if (window.__probe_aus || !/^gabi-brain/.test(String(name))) return echt.call(this, name, ...rest);
        window.__probe_getroffen = (window.__probe_getroffen || 0) + 1;
        const anfrage = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, addEventListener() {}, removeEventListener() {} };
        if (wie === "fehler") setTimeout(() => { anfrage.error = new DOMException("Probe: Datenbank lässt sich nicht öffnen", "UnknownError"); if (anfrage.onerror) anfrage.onerror({ target: anfrage, preventDefault() {} }); }, 30);
        return anfrage; // „haengt“: meldet sich nie
      };
    }
  } catch { /* egal */ }
};
async function kontext(browser, { breite = 1440, hoehe = 900, mobil = false, stoerungen = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe }, isMobile: mobil, hasTouch: mobil, acceptDownloads: true });
  await stumm(ctx);
  if (stoerungen) await ctx.addInitScript(STOERUNGEN);
  return ctx;
}
const BEREIT = () => Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain);
async function demoSeite(ctx, hash = "#/brain/liste") {
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  await page.goto(`${basis}/?demo=1${hash}`);
  await page.waitForFunction(BEREIT, null, { timeout: 20000 });
  return { page, konsole };
}
/** Lokaler Betrieb (echte lokale API): anmelden, falls die Zugangsseite kommt – ein zweiter Tab ist schon angemeldet. */
async function lokalSeite(ctx, hash = "#/brain/liste", vorher = null) {
  const page = await ctx.newPage();
  const konsole = konsoleBeobachten(page);
  if (vorher) await page.addInitScript(vorher);
  await page.goto(`${basis}/${hash}`);
  await anmelden(page);
  return { page, konsole };
}
async function anmelden(page) {
  await page.waitForFunction(() => (document.querySelector("#ansicht-zugang") && !document.querySelector("#ansicht-zugang").hidden) || Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain), null, { timeout: 20000 });
  if (await page.evaluate(() => !document.querySelector("#ansicht-zugang").hidden)) {
    await page.fill("#zugang-code", "test");
    await page.click("#zugang-weiter");
  }
  await page.waitForFunction(BEREIT, null, { timeout: 20000 });
}
const bild = async (page, name) => { if (BILDER) { await warte(300); await page.screenshot({ path: join(BILDER, `${name}.png`) }); } };
const knoten = (page, titel) => page.evaluate((t) => { const b = window.GabiBrainAnsicht.aktuell.brain; const k = b && b.findeTitel(t); return k ? { id: k.id, inhalt: k.inhalt, rev: k.rev, tags: k.tags, status: k.status, geaendert: k.geaendert, erstellt: k.erstellt } : null; }, titel);
const imKorb = (page, titel) => page.evaluate((t) => { const b = window.GabiBrainAnsicht.aktuell.brain; return Boolean(b) && b.papierkorb().some((p) => p.knoten.titel === t); }, titel);
const toasts = (page) => page.evaluate(() => (window.__toasts || []).slice());
const toastKommt = (page, muster, timeout = 5000) => page.waitForFunction((m) => (window.__toasts || []).some((t) => new RegExp(m).test(t)), muster, { timeout }).then(() => true, () => false);
const detailOffen = (page, titel) => page.waitForFunction((t) => { const d = document.querySelector("#brain-detail"); const h = d && !d.hidden ? d.querySelector("#brain-detail-titel") : null; return Boolean(h && h.textContent.trim() === t); }, titel, { timeout: 8000 });
const breiteOk = async (page) => (await page.evaluate(() => document.documentElement.scrollWidth)) <= page.viewportSize().width;
const hinweisText = (page) => page.evaluate(() => { const h = document.querySelector("#brain-form-hinweis"); return h && !h.hidden ? h.textContent.trim().replace(/\s+/g, " ") : ""; });
const formFehler = (page) => page.evaluate(() => [...document.querySelectorAll(".brain-form [data-fehler]")].filter((p) => !p.hidden).map((p) => p.textContent.trim()).join(" | "));
const zustand = (page) => page.evaluate(() => {
  const z = document.querySelector("#brain-zustand");
  const sichtbar = Boolean(z && !z.hidden && z.querySelector("h2"));
  return { sichtbar, titel: sichtbar ? z.querySelector("h2").textContent.trim() : "", text: sichtbar ? z.querySelector("p").textContent.trim() : "", knopf: sichtbar && z.querySelector("button") ? z.querySelector("button").textContent.trim() : "", brain: Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain) };
});
/** Zeile der Liste mit genau diesem Titel (nicht „enthält“ – „Kontakt“ steckt auch in „Kontakt und Zeiten“ und in Tags). */
const zeile = (titel) => `.brain-zeile:has(strong:text-is("${titel}"))`;
async function bearbeiten(page, titel, inhalt) {
  await page.click(zeile(titel));
  await detailOffen(page, titel);
  await page.click('[data-brain="bearbeiten"]');
  await page.waitForSelector(".brain-form");
  await page.fill("#brain-inhalt", inhalt);
}
const loeschenIn = (page, titel) => page.evaluate(async (t) => { const b = window.GabiBrainAnsicht.aktuell.brain; return (await b.loeschen(b.findeTitel(t).id)).ok === true; }, titel);

// ---------------------------------------------------------------------------
// Fund 1: Eintrag im anderen Fenster gelöscht, während hier die Bearbeitung offen ist
// ---------------------------------------------------------------------------
async function fund1(browser, motor) {
  const name = `${motor} Fund 1`;
  const ctx = await kontext(browser);
  const a = await demoSeite(ctx);
  const b = await demoSeite(ctx);
  await a.page.waitForSelector(".brain-zeile");
  await ablauf(`${name} (offen)`, async () => {
    // A bearbeitet „Sensopro“, B legt den Eintrag in den Papierkorb
    await bearbeiten(a.page, "Sensopro", "Meine Fassung aus Tab A – mühsam getippt.");
    pruefe(await loeschenIn(b.page, "Sensopro"), `${name}: Tab B legt den Eintrag in den Papierkorb, während Tab A ihn bearbeitet`);
    await a.page.waitForSelector("#brain-form-hinweis:not([hidden])", { timeout: 5000 }).catch(() => {});
    const h1 = await hinweisText(a.page);
    pruefe(/in einem anderen Fenster gelöscht/.test(h1) && /Papierkorb/.test(h1) && !/fragt Gabi nach/.test(h1), `${name}: die Bearbeitung sagt sofort, was passiert ist und wo der Eintrag liegt („${h1.slice(0, 90)}“)`);
    pruefe((await a.page.$$('#brain-form-hinweis [data-brain="korb-meine"]')).length === 1 && /Wiederherstellen und speichern/.test(h1), `${name}: der Hinweis bietet den Ausweg an („Wiederherstellen und speichern“)`);
    pruefe((await a.page.inputValue("#brain-inhalt")) === "Meine Fassung aus Tab A – mühsam getippt.", `${name}: das Getippte bleibt stehen`);
    await bild(a.page, `${motor}-f1-hinweis-papierkorb`);
    // „Speichern“ holt nichts still zurück und endet nicht in „gibt es nicht mehr“
    await a.page.click('.brain-form button[type="submit"]');
    await warte(400);
    const f = await formFehler(a.page);
    pruefe(!/gibt es nicht mehr/.test(f) && (await imKorb(a.page, "Sensopro")) && Boolean(await a.page.$(".brain-form")), `${name}: „Speichern“ endet nicht in der Sackgasse „Diesen Eintrag gibt es nicht mehr.“ – es fragt nach (Fehlertext: „${f || "–"}“)`);
    pruefe(await a.page.evaluate(() => { const k = document.querySelector('[data-brain="korb-meine"]'); return Boolean(k) && document.activeElement === k; }), `${name}: nach „Speichern“ steht der Fokus auf dem Ausweg`);
    // der Ausweg: wiederherstellen und die eigene Fassung speichern
    if (await a.page.$('[data-brain="korb-meine"]')) await a.page.click('[data-brain="korb-meine"]');
    await a.page.waitForSelector("#brain-detail .brain-md", { timeout: 5000 }).catch(() => {});
    const nachher = await knoten(a.page, "Sensopro");
    pruefe(Boolean(nachher) && nachher.inhalt === "Meine Fassung aus Tab A – mühsam getippt." && !(await imKorb(a.page, "Sensopro")), `${name}: „Wiederherstellen und speichern“ holt den Eintrag zurück – mit der eigenen Fassung`);
    pruefe(await toastKommt(a.page, "Wiederhergestellt und gespeichert"), `${name}: Rückmeldung „Wiederhergestellt und gespeichert.“`);
    await b.page.waitForFunction(() => { const k = window.GabiBrainAnsicht.aktuell.brain.findeTitel("Sensopro"); return Boolean(k) && /Tab A/.test(k.inhalt); }, null, { timeout: 5000 }).catch(() => {});
    pruefe(((await knoten(b.page, "Sensopro")) || {}).inhalt === "Meine Fassung aus Tab A – mühsam getippt.", `${name}: Tab B sieht den wiederhergestellten Eintrag mit der Fassung aus Tab A`);
    // genau EIN Rückgängig-Schritt: die Änderung (der Eintrag bleibt wiederhergestellt)
    const undo = await a.page.evaluate(async () => { const br = window.GabiBrainAnsicht.aktuell.brain; const eins = await br.rueckgaengig(); const zwei = await br.rueckgaengig(); const k = br.findeTitel("Sensopro"); return { eins: eins.ok ? eins.name : eins.fehler.allgemein, zwei: zwei.ok ? zwei.name : zwei.fehler.allgemein, da: Boolean(k), tabA: Boolean(k) && /Tab A/.test(k.inhalt) }; });
    pruefe(/Änderung an „Sensopro“/.test(undo.eins) && /Nichts zum Rückgängigmachen/.test(undo.zwei) && undo.da && !undo.tabA, `${name}: ein Rückgängig-Schritt – er nimmt die Änderung zurück, der Eintrag bleibt da (${undo.eins} · ${undo.zwei})`);
  });

  await ablauf(`${name} (Titel inzwischen vergeben)`, async () => {
    // der Titel ist inzwischen neu vergeben: der wiederhergestellte Eintrag kommt mit Zusatz zurück – das Formular geht mit
    await a.page.evaluate(() => { location.hash = "#/brain/liste"; });
    await a.page.waitForSelector("#brain-detail", { state: "hidden" });
    await bearbeiten(a.page, "Der Goldene Ring", "Der Goldene Ring – Fassung aus Tab A.");
    await b.page.evaluate(async () => { const br = window.GabiBrainAnsicht.aktuell.brain; await br.loeschen(br.findeTitel("Der Goldene Ring").id); await br.anlegen({ art: "praxiswissen", titel: "Der Goldene Ring", inhalt: "Neu angelegt in Tab B.", tags: [], status: "entwurf", quelle: "Test" }); });
    await a.page.waitForSelector('#brain-form-hinweis [data-brain="korb-meine"]', { timeout: 5000 });
    await a.page.click('[data-brain="korb-meine"]');
    await a.page.waitForSelector("#brain-detail .brain-md", { timeout: 5000 }).catch(() => {});
    const alt = await knoten(a.page, "Der Goldene Ring (wiederhergestellt)");
    const neu = await knoten(a.page, "Der Goldene Ring");
    pruefe(Boolean(alt) && alt.inhalt === "Der Goldene Ring – Fassung aus Tab A." && Boolean(neu) && neu.inhalt === "Neu angelegt in Tab B.", `${name}: ist der Titel inzwischen neu vergeben, kommt der Eintrag als „… (wiederhergestellt)“ zurück – mit der eigenen Fassung, der neue bleibt`);
  });

  await ablauf(`${name} (Neuladen)`, async () => {
    // Notfall-Kopie: A tippt, B löscht, A lädt neu → die Bearbeitung ist wieder da, mit dem Hinweis
    await a.page.evaluate(() => { location.hash = "#/brain/liste"; });
    await a.page.waitForSelector("#brain-detail", { state: "hidden" });
    await bearbeiten(a.page, "dasmediABC", "Notfall: vor dem Neuladen getippt.");
    await warte(600); // die Notfall-Kopie entsteht kurz nach dem Tippen
    pruefe(await a.page.evaluate(() => /vor dem Neuladen getippt/.test(sessionStorage.getItem("gabi.demo.brain.notfall") || "")), `${name}: die ungespeicherte Bearbeitung liegt als Notfall-Kopie im Tab`);
    await loeschenIn(b.page, "dasmediABC");
    await warte(300);
    await a.page.reload();
    await a.page.waitForFunction(BEREIT, null, { timeout: 20000 });
    await a.page.waitForSelector(".brain-form", { timeout: 6000 }).catch(() => {});
    const form = Boolean(await a.page.$(".brain-form"));
    const text = form ? await a.page.inputValue("#brain-inhalt") : "";
    const h = await hinweisText(a.page);
    pruefe(form && text === "Notfall: vor dem Neuladen getippt.", `${name}: nach dem Neuladen ist das Getippte wieder da – obwohl der Eintrag inzwischen im Papierkorb liegt (Formular: ${form})`);
    pruefe(/gelöscht/.test(h) && /Papierkorb/.test(h) && Boolean(await a.page.$('[data-brain="korb-meine"]')), `${name}: mit dem Hinweis, dass der Eintrag im Papierkorb liegt, und dem Ausweg („${h.slice(0, 80)}“)`);
    pruefe(await toastKommt(a.page, "ungespeicherte Änderung ist wieder da"), `${name}: Rückmeldung „Deine ungespeicherte Änderung ist wieder da.“`);
    pruefe(await a.page.evaluate(() => /vor dem Neuladen getippt/.test(sessionStorage.getItem("gabi.demo.brain.notfall") || "")), `${name}: die Notfall-Kopie ist nicht wortlos weggeworfen`);
    if (await a.page.$('[data-brain="korb-meine"]')) await a.page.click('[data-brain="korb-meine"]');
    await a.page.waitForSelector("#brain-detail .brain-md", { timeout: 5000 }).catch(() => {});
    const k = await knoten(a.page, "dasmediABC");
    pruefe(Boolean(k) && k.inhalt === "Notfall: vor dem Neuladen getippt." && (await a.page.evaluate(() => sessionStorage.getItem("gabi.demo.brain.notfall") === null)), `${name}: gespeichert – danach ist die Notfall-Kopie erledigt`);
  });
  await ablauf(`${name} (selbes Fenster)`, async () => {
    // derselbe Ausweg ohne zweites Fenster: „Rückgängig“ nimmt das Anlegen zurück, während der Eintrag bearbeitet wird
    await a.page.evaluate(async () => { location.hash = "#/brain/liste"; await window.GabiBrainAnsicht.aktuell.brain.anlegen({ art: "praxiswissen", titel: "Eben angelegt", inhalt: "Erste Fassung.", tags: [], status: "entwurf", quelle: "Test" }); });
    await a.page.waitForSelector("#brain-detail", { state: "hidden" });
    await a.page.waitForSelector(zeile("Eben angelegt"));
    await bearbeiten(a.page, "Eben angelegt", "Zweite Fassung – getippt.");
    await a.page.click("#brain-mehr");
    await a.page.click('#brain-menue [data-brain="rueckgaengig"]');
    await a.page.waitForFunction(() => window.GabiBrainAnsicht.aktuell.brain.papierkorb().some((p) => p.knoten.titel === "Eben angelegt"), null, { timeout: 5000 });
    await a.page.click('.brain-form button[type="submit"]');
    await warte(400);
    const h = await hinweisText(a.page);
    const f = await formFehler(a.page);
    pruefe(/inzwischen gelöscht/.test(h) && /Papierkorb/.test(h) && !/anderen Fenster/.test(h) && !/gibt es nicht mehr/.test(f), `${name}: liegt der Eintrag durch „Rückgängig“ im selben Fenster im Papierkorb, sagt „Speichern“ das ebenso – ohne „in einem anderen Fenster“ („${(h || f).slice(0, 70)}“)`);
    if (await a.page.$('[data-brain="korb-meine"]')) await a.page.click('[data-brain="korb-meine"]');
    await a.page.waitForSelector("#brain-detail .brain-md", { timeout: 5000 }).catch(() => {});
    pruefe(((await knoten(a.page, "Eben angelegt")) || {}).inhalt === "Zweite Fassung – getippt.", `${name}: und der Ausweg speichert die getippte Fassung`);
  });
  pruefe(a.konsole.length === 0 && b.konsole.length === 0, `${name}: keine Fehler in der Konsole${a.konsole.concat(b.konsole).length ? ` (${a.konsole.concat(b.konsole).slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();

  // Handy: der Hinweis mit dem Knopf passt in 390 und 320 px (kein seitliches Scrollen, Knopf im Bild, Touch-Ziel ≥ 44 px)
  for (const [breite, hoehe] of [[390, 844], [320, 640]]) {
    await ablauf(`${name} (${breite} px)`, async () => {
      const mctx = await kontext(browser, { breite, hoehe, mobil: true });
      const ma = await demoSeite(mctx);
      const mb = await demoSeite(mctx);
      await ma.page.waitForSelector(".brain-zeile");
      await ma.page.tap(zeile("Sensopro"));
      await detailOffen(ma.page, "Sensopro");
      await ma.page.tap('[data-brain="bearbeiten"]');
      await ma.page.waitForSelector(".brain-form");
      await ma.page.fill("#brain-inhalt", "Am Handy getippt.");
      await loeschenIn(mb.page, "Sensopro");
      await ma.page.waitForSelector('#brain-form-hinweis [data-brain="korb-meine"]', { timeout: 5000 });
      const lage = await ma.page.evaluate(() => { const k = document.querySelector('[data-brain="korb-meine"]'); k.scrollIntoView({ block: "center" }); const r = k.getBoundingClientRect(); return { links: r.left, rechts: r.right, hoehe: r.height, b: document.documentElement.clientWidth }; });
      pruefe((await breiteOk(ma.page)) && lage.links >= 0 && lage.rechts <= lage.b + 0.5 && lage.hoehe >= 43.5, `${name}: bei ${breite} px passt der Hinweis samt Knopf ins Bild (Knopf ${Math.round(lage.links)}–${Math.round(lage.rechts)} von ${lage.b} px, ${Math.round(lage.hoehe)} px hoch), kein seitliches Scrollen`);
      await bild(ma.page, `${motor}-f1-hinweis-${breite}`);
      await ma.page.tap('[data-brain="korb-meine"]');
      await ma.page.waitForSelector("#brain-detail .brain-md", { timeout: 5000 }).catch(() => {});
      pruefe(((await knoten(ma.page, "Sensopro")) || {}).inhalt === "Am Handy getippt.", `${name}: bei ${breite} px führt der Tipp auf den Knopf zum gespeicherten Eintrag`);
      await mctx.close();
    });
  }
}

// ---------------------------------------------------------------------------
// Fund 2: Rückgängig in Tab A überschreibt eine spätere Änderung aus Tab B nicht
// ---------------------------------------------------------------------------
async function fund2(browser, motor) {
  const name = `${motor} Fund 2`;
  const ctx = await kontext(browser);
  const a = await demoSeite(ctx);
  const b = await demoSeite(ctx);
  await ablauf(name, async () => {
    await a.page.waitForSelector(".brain-zeile");
    // A speichert über das Formular, B ändert danach Inhalt und Tags
    await bearbeiten(a.page, "Termine", "A: Termine per Telefon und E-Mail.");
    await a.page.click('.brain-form button[type="submit"]');
    await a.page.waitForSelector("#brain-detail .brain-md");
    await b.page.waitForFunction(() => /^A: /.test(window.GabiBrainAnsicht.aktuell.brain.findeTitel("Termine").inhalt), null, { timeout: 5000 });
    await b.page.evaluate(async () => { const br = window.GabiBrainAnsicht.aktuell.brain; const k = br.findeTitel("Termine"); await br.aendern(k.id, { inhalt: "B: Termine per Telefon, E-Mail und neu auch online.", tags: [...k.tags, "online"] }); });
    const revB = (await knoten(b.page, "Termine")).rev;
    await a.page.waitForFunction((r) => window.GabiBrainAnsicht.aktuell.brain.findeTitel("Termine").rev === r, revB, { timeout: 5000 });
    pruefe((await knoten(a.page, "Termine")).inhalt.startsWith("B: "), `${name}: Tab A kennt die spätere Änderung aus Tab B (rev ${revB})`);
    // A: Rückgängig über das Menü „Mehr“
    await a.page.click("#brain-mehr");
    await a.page.click('#brain-menue [data-brain="rueckgaengig"]');
    const gesagt = await toastKommt(a.page, "ließ sich nicht rückgängig machen");
    await warte(600);
    const inA = await knoten(a.page, "Termine");
    const inB = await knoten(b.page, "Termine");
    pruefe(inA.inhalt === "B: Termine per Telefon, E-Mail und neu auch online." && inA.tags.includes("online") && inA.rev === revB && inB.inhalt === inA.inhalt && inB.rev === revB, `${name}: Rückgängig in Tab A lässt die Fassung aus Tab B stehen – in beiden Tabs (rev ${inA.rev}/${inB.rev}, Tags ${inA.tags.join(",")})`);
    pruefe(gesagt && !(await toasts(a.page)).some((t) => /^Rückgängig: Änderung an/.test(t)), `${name}: Tab A sagt, warum („… der Eintrag wurde inzwischen geändert“) – kein „Rückgängig: Änderung an …“`);
    const verlauf = await a.page.evaluate(async () => { const br = window.GabiBrainAnsicht.aktuell.brain; return (await br.verlauf(br.findeTitel("Termine").id)).map((v) => v.grund); });
    pruefe(!verlauf.includes("rueckgaengig"), `${name}: im Versionsverlauf steht kein „Rückgängig gemacht“ über der Fassung von Tab B (${verlauf.join(", ")})`);
  });
  pruefe(a.konsole.length === 0 && b.konsole.length === 0, `${name}: keine Fehler in der Konsole${a.konsole.concat(b.konsole).length ? ` (${a.konsole.concat(b.konsole).slice(0, 3).join(" | ")})` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Fund 3: Export → neues Gerät → Import bringt Verbindungen von Hand und „zuletzt geändert“ zurück
// ---------------------------------------------------------------------------
async function fund3(browser, motor) {
  const name = `${motor} Fund 3`;
  const zip = join(ablage, `${motor}-export.zip`);
  let quelle = null;
  await ablauf(`${name} (Export)`, async () => {
    const ctx = await kontext(browser);
    const { page, konsole } = await demoSeite(ctx);
    await page.waitForSelector(".brain-zeile");
    // zwei eigene Einträge; eine Verbindung über das Formular im Detail, eine zweite zu einem Seed-Eintrag
    quelle = await page.evaluate(async () => {
      const br = window.GabiBrainAnsicht.aktuell.brain;
      const wlan = (await br.anlegen({ art: "praxiswissen", titel: "WLAN für Patienten", inhalt: "Netz: Gast.", tags: ["wlan"], status: "bestaetigt", quelle: "Test" })).knoten;
      const gast = (await br.anlegen({ art: "praxiswissen", titel: "Gastzugang", inhalt: "Kennwort am Empfang.", tags: [], status: "entwurf", quelle: "Test" })).knoten;
      return { wlan: wlan.id, gast: gast.id, kontakt: br.findeTitel("Kontakt").id };
    });
    await page.evaluate((id) => { location.hash = `#/brain/${id}`; }, quelle.gast);
    await detailOffen(page, "Gastzugang");
    await page.fill("#brain-kante-ziel", "WLAN für Patienten");
    await page.selectOption('.brain-kante-form [name="art"]', "gehoert_zu");
    await page.click('.brain-kante-form button[type="submit"]');
    await page.waitForSelector(".brain-verbindungen li");
    await page.evaluate(async (q) => { await window.GabiBrainAnsicht.aktuell.brain.kanteAnlegen(q.wlan, q.kontakt, "verweis"); }, quelle);
    await warte(1100); // „zuletzt geändert“ soll sich klar vom Zeitpunkt des Imports unterscheiden
    Object.assign(quelle, await page.evaluate((q) => { const br = window.GabiBrainAnsicht.aktuell.brain; return { geaendertWlan: br.hol(q.wlan).geaendert, geaendertGast: br.hol(q.gast).geaendert, vonHand: br.kanten().filter((k) => !k.auto).map((k) => `${k.von}>${k.nach}>${k.art}`).sort() }; }, quelle));
    await page.evaluate(() => { location.hash = "#/brain/liste"; });
    await page.click("#brain-mehr");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-brain="export-zip"]')]);
    await download.saveAs(zip);
    const eine = await page.evaluate(() => window.GabiBrainAnsicht.aktuell.brain.exportEineDatei());
    pruefe(eine.includes(`verbindungen: [gehoert_zu:${quelle.wlan}]`) && eine.includes(`verbindungen: [verweis:${quelle.kontakt}]`), `${name}: der Export nennt die Verbindungen von Hand im Kopf des Ausgangsknotens`);
    pruefe(konsole.length === 0, `${name}: Export ohne Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  });
  await ablauf(`${name} (Import)`, async () => {
    // neues Gerät: frischer Browser-Speicher, frisches Demo-Brain
    const ctx = await kontext(browser);
    const { page, konsole } = await demoSeite(ctx);
    await page.waitForSelector(".brain-zeile");
    await warte(300);
    await page.setInputFiles("#brain-datei", zip);
    await page.waitForSelector("dialog.brain-import[open]");
    const kopf = await page.textContent("dialog.brain-import p");
    pruefe(/^2 neu · 0 geändert · 43 unverändert/.test(kopf), `${name}: Import-Vorschau am neuen Gerät: ${kopf.split(".")[0]}`);
    const vorschau = await page.evaluate(() => [...document.querySelectorAll("dialog.brain-import .brain-import-zeile")].filter((z) => /Gastzugang|WLAN für Patienten/.test(z.textContent)).map((z) => z.textContent.replace(/\s+/g, " ").trim()));
    pruefe(vorschau.length === 2 && vorschau.some((t) => /1 Verbindung/.test(t) && /Gehört zu → WLAN für Patienten/.test(t)) && vorschau.some((t) => /Verweis → Kontakt/.test(t)), `${name}: die Vorschau zeigt die neuen Verbindungen („Gehört zu → WLAN für Patienten“, „Verweis → Kontakt“)`);
    await page.evaluate(() => { for (const d of document.querySelectorAll("dialog.brain-import .brain-import-liste > li details")) d.open = true; });
    await bild(page, `${motor}-f3-import-vorschau`);
    pruefe(await breiteOk(page), `${name}: Vorschau ohne seitliches Scrollen`);
    await page.click("#brain-import-ja");
    pruefe(await toastKommt(page, "2 Einträge und 2 Verbindungen übernommen"), `${name}: Rückmeldung „2 Einträge und 2 Verbindungen übernommen.“`);
    await page.waitForFunction(() => Boolean(window.GabiBrainAnsicht.aktuell.brain.findeTitel("Gastzugang")), null, { timeout: 5000 }).catch(() => {});
    const stand = await page.evaluate(() => { const br = window.GabiBrainAnsicht.aktuell.brain; const w = br.findeTitel("WLAN für Patienten"); const g = br.findeTitel("Gastzugang"); return { vonHand: br.kanten().filter((k) => !k.auto).map((k) => `${k.von}>${k.nach}>${k.art}`).sort(), geaendertWlan: w ? w.geaendert : 0, geaendertGast: g ? g.geaendert : 0, gast: g ? g.id : "" }; });
    pruefe(JSON.stringify(stand.vonHand) === JSON.stringify(quelle.vonHand), `${name}: nach dem Import sind die Verbindungen von Hand dieselben wie vor dem Export (${stand.vonHand.length} von ${quelle.vonHand.length})`);
    pruefe(stand.geaendertWlan === quelle.geaendertWlan && stand.geaendertGast === quelle.geaendertGast, `${name}: „zuletzt geändert“ der importierten Einträge stammt aus der Datei, nicht vom Zeitpunkt des Imports`);
    await page.evaluate((id) => { location.hash = `#/brain/${id}`; }, stand.gast);
    await detailOffen(page, "Gastzugang").catch(() => {});
    pruefe(/Gehört zu/.test((await page.textContent("#brain-detail .brain-verbindungen").catch(() => "")) || "") && /WLAN für Patienten/.test((await page.textContent("#brain-detail .brain-verbindungen").catch(() => "")) || ""), `${name}: im Detail steht die Verbindung wieder unter „Verbindungen von Hand“`);
    // ein Schritt zurück: Einträge und Verbindungen sind wieder weg
    const zurueck = await page.evaluate(async () => { const br = window.GabiBrainAnsicht.aktuell.brain; const r = await br.rueckgaengig(); return { name: r.ok ? r.name : r.fehler.allgemein, vonHand: br.kanten().filter((k) => !k.auto).length, gast: Boolean(br.findeTitel("Gastzugang")) }; });
    pruefe(/Import \(2 Einträge\)/.test(zurueck.name) && !zurueck.gast && zurueck.vonHand === quelle.vonHand.length - 2, `${name}: EIN Rückgängig-Schritt nimmt Einträge und Verbindungen zurück (${zurueck.name}, ${zurueck.vonHand} Verbindungen von Hand)`);
    pruefe(konsole.length === 0, `${name}: Import ohne Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------
// Fund 4: IndexedDB hängt oder meldet einen Fehler – kein zweites Brain in localStorage
// ---------------------------------------------------------------------------
async function fund4(browser, motor) {
  for (const art of ["haengt", "fehler"]) {
    const name = `${motor} Fund 4 (IndexedDB ${art === "haengt" ? "hängt" : "meldet einen Fehler"})`;
    const ctx = await kontext(browser, { stoerungen: true });
    const { page, konsole } = await demoSeite(ctx);
    await ablauf(name, async () => {
      await page.evaluate(async () => {
        const br = window.GabiBrainAnsicht.aktuell.brain;
        await br.anlegen({ art: "praxiswissen", titel: "Mein eigener Eintrag", inhalt: "Das habe ich selbst eingetragen.", tags: [], status: "bestaetigt", quelle: "Test" });
        const k = br.findeTitel("Kontakt");
        await br.aendern(k.id, { inhalt: `${k.inhalt}\n\nMEINE KORREKTUR: neue Telefonnummer.` });
      });
      pruefe(await page.evaluate(() => localStorage.getItem("gabi.demo.brain.ablage") === "indexeddb"), `${name}: nach dem ersten Start merkt sich der Browser, dass das Brain in IndexedDB liegt`);
      // Neuladen – IndexedDB antwortet für die Brain-Datenbank nicht
      await page.evaluate((wie) => localStorage.setItem("__probe_idb", wie), art);
      await page.reload();
      await page.waitForFunction(() => { const z = document.querySelector("#brain-zustand"); return (z && !z.hidden && z.querySelector("h2")) || Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain); }, null, { timeout: 12000 });
      await warte(300);
      const z1 = await zustand(page);
      const ersatz = await page.evaluate(() => ({ dokument: localStorage.getItem("gabi.demo.brain.v1") !== null, getroffen: window.__probe_getroffen || 0, art: window.GabiBrainAnsicht.aktuell.brain ? window.GabiBrainAnsicht.aktuell.brain.art : "" }));
      pruefe(ersatz.getroffen >= 1 && !z1.brain && !ersatz.dokument, `${name}: Gabi weicht NICHT auf ein frisch eingespieltes Brain in localStorage aus (Ablage: ${ersatz.art || "keine"}, Ersatz-Dokument: ${ersatz.dokument})`);
      pruefe(z1.sichtbar && z1.titel === "Das Brain ließ sich gerade nicht öffnen." && /nichts verloren/.test(z1.text) && /eingebauten Wissen/.test(z1.text) && z1.knopf === "Nochmal versuchen", `${name}: stattdessen der Fehlerzustand mit Erklärung („${z1.titel}“ – „${z1.text.slice(0, 70)}…“)`);
      await bild(page, `${motor}-f4-${art}`);
      pruefe(await breiteOk(page), `${name}: Fehlerzustand ohne seitliches Scrollen`);
      // „Nochmal versuchen“, sobald IndexedDB wieder antwortet: alles ist noch da
      await page.evaluate(() => { window.__probe_aus = true; });
      if (await page.$('[data-brain="neu-laden"]')) await page.click('[data-brain="neu-laden"]');
      await page.waitForFunction(BEREIT, null, { timeout: 12000 }).catch(() => {});
      const danach = await page.evaluate(() => { const br = window.GabiBrainAnsicht.aktuell.brain; return br ? { art: br.art, eigener: Boolean(br.findeTitel("Mein eigener Eintrag")), korrektur: /MEINE KORREKTUR/.test(br.findeTitel("Kontakt").inhalt), anzahl: br.eigene().length } : null; });
      pruefe(Boolean(danach) && danach.art === "indexeddb" && danach.eigener && danach.korrektur && danach.anzahl === 44, `${name}: „Nochmal versuchen“ bringt das Brain mit dem eigenen Eintrag und der Korrektur zurück (${danach ? `${danach.anzahl} Einträge, ${danach.art}` : "nicht geladen"})`);
      // Start im Gespräch: Hinweis, und Gabi antwortet ohne Brain aus dem eingebauten Wissen (keine Brain-Chips)
      await page.evaluate((wie) => { localStorage.setItem("__probe_idb", wie); location.hash = "#/"; }, art);
      await page.reload();
      await page.waitForSelector("#ansicht-chat:not([hidden])");
      pruefe(await toastKommt(page, "Das Brain ließ sich nicht laden – Gabi antwortet solange aus dem eingebauten Wissen", 9000), `${name}: wer gerade im Gespräch ist, bekommt einen Hinweis`);
      await page.fill("#eingabe-text", "Wo sind die Standorte?");
      await page.click("#senden");
      await page.waitForFunction(() => { const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop(); return !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && n && /Kieslingstraße 82/.test(n.innerText); }, null, { timeout: 20000 }).catch(() => {});
      pruefe(await page.evaluate(() => { const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop(); return Boolean(n) && /Kieslingstraße 82/.test(n.innerText) && !n.querySelector(".brain-quelle") && localStorage.getItem("gabi.demo.brain.v1") === null; }), `${name}: Gabi antwortet solange aus dem eingebauten Wissen (ohne Brain-Chips) – und legt weiter kein Ersatz-Brain an`);
    });
    pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 5: Speicher voll – der Grund erreicht die Oberfläche, das Brain geht trotzdem auf
// ---------------------------------------------------------------------------
async function fund5(browser, motor) {
  const name = `${motor} Fund 5`;
  const VOLL = /Der Speicher dieses Browsers ist voll/;
  {
    const ctx = await kontext(browser, { stoerungen: true });
    const { page, konsole } = await demoSeite(ctx);
    await ablauf(`${name} (während der Arbeit)`, async () => {
      await page.waitForSelector(".brain-zeile");
      await bearbeiten(page, "Kontakt", "Neue Telefonnummer – bei vollem Speicher getippt.");
      await page.evaluate(() => localStorage.setItem("__probe_voll", "1"));
      await page.click('.brain-form button[type="submit"]');
      await page.waitForSelector('.brain-form [data-fehler="allgemein"]:not([hidden])', { timeout: 5000 }).catch(() => {});
      const f = await formFehler(page);
      pruefe(VOLL.test(f) && /Exportier dein Brain/.test(f) && !/noch einmal versuchen/.test(f), `${name}: Speichern bei vollem Speicher nennt den Grund im Formular („${f.slice(0, 80)}…“)`);
      pruefe((await page.inputValue("#brain-inhalt")) === "Neue Telefonnummer – bei vollem Speicher getippt.", `${name}: das Getippte bleibt im Formular stehen`);
      await bild(page, `${motor}-f5-formular-voll`);
      await page.click('.brain-form [data-brain="bearbeiten-abbrechen"]');
      await page.waitForSelector("#dialog-frage[open]");
      await page.click("#frage-ja");
      await page.waitForSelector(".brain-status");
      await page.click('.brain-status [data-wert="entwurf"]');
      pruefe(await toastKommt(page, "Der Speicher dieses Browsers ist voll"), `${name}: auch der Status-Schalter nennt den Grund (Toast)`);
      // Neustart bei vollem Speicher: das Brain ist da – mit Hinweis
      await page.reload();
      await page.waitForFunction(BEREIT, null, { timeout: 20000 });
      await page.waitForSelector(".brain-zeile");
      const h = await page.evaluate(() => { const x = document.querySelector("#brain-hinweis"); return { sichtbar: Boolean(x) && !x.hidden, text: x ? x.textContent.trim() : "", eintraege: window.GabiBrainAnsicht.aktuell.brain.eigene().length }; });
      pruefe(h.eintraege === 43 && h.sichtbar && /nur ansehen/.test(h.text) && /Exportier dein Brain/.test(h.text), `${name}: Start bei vollem Speicher zeigt das Brain (${h.eintraege} Einträge) MIT Hinweis („${h.text.slice(0, 70)}…“)`);
      await bild(page, `${motor}-f5-start-voll`);
      pruefe(await breiteOk(page), `${name}: Hinweis ohne seitliches Scrollen`);
      // wieder Platz: die nächste gespeicherte Änderung lässt den Hinweis verschwinden – ohne Neuladen
      await page.evaluate(() => localStorage.removeItem("__probe_voll"));
      await page.click(zeile("Kontakt"));
      await detailOffen(page, "Kontakt");
      await page.click('.brain-status [data-wert="entwurf"]');
      await page.waitForFunction(() => window.GabiBrainAnsicht.aktuell.brain.findeTitel("Kontakt").status === "entwurf", null, { timeout: 5000 }).catch(() => {});
      await warte(300);
      pruefe(((await knoten(page, "Kontakt")) || {}).status === "entwurf" && (await page.evaluate(() => document.querySelector("#brain-hinweis").hidden)), `${name}: ist wieder Platz, klappt das Speichern und der Hinweis verschwindet`);
    });
    pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    const ctx = await kontext(browser, { stoerungen: true });
    const { page, konsole } = await demoSeite(ctx);
    await ablauf(`${name} (fälliger Papierkorb)`, async () => {
      // ein Eintrag liegt seit 31 Tagen im Papierkorb (Löschdatum direkt in der Datenbank zurückgesetzt), dann: Gerät voll
      await page.evaluate(async () => {
        const br = window.GabiBrainAnsicht.aktuell.brain;
        const k = br.findeTitel("Sensopro");
        await br.loeschen(k.id);
        await new Promise((ok, nein) => {
          const r = indexedDB.open("gabi-brain-demo", 1);
          r.onerror = () => nein(r.error);
          r.onsuccess = () => {
            const t = r.result.transaction(["knoten"], "readwrite");
            const s = t.objectStore("knoten");
            const g = s.get(k.id);
            g.onsuccess = () => { const v = g.result; v.geloescht = Date.now() - 31 * 86400000; s.put(v); };
            t.oncomplete = () => { r.result.close(); ok(); };
            t.onerror = () => nein(t.error);
          };
        });
        localStorage.setItem("__probe_voll", "1");
      });
      await page.reload();
      await page.waitForFunction(() => { const z = document.querySelector("#brain-zustand"); return (z && !z.hidden && z.querySelector("h2")) || Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain); }, null, { timeout: 20000 });
      await warte(400);
      const z1 = await zustand(page);
      pruefe(z1.brain && !z1.sichtbar, `${name}: Start bei vollem Speicher MIT fälligem Papierkorb: das Brain geht auf${z1.sichtbar ? ` (stattdessen: „${z1.titel}“)` : ""}`);
      const kann = z1.brain ? await page.evaluate(() => { const br = window.GabiBrainAnsicht.aktuell.brain; return { eintraege: br.eigene().length, korb: br.papierkorb().map((p) => `${p.knoten.titel}:${p.tageRest}`).join(), datei: br.exportEineDatei().length }; }) : { eintraege: 0, korb: "", datei: 0 };
      pruefe(kann.eintraege === 42 && kann.korb === "Sensopro:0" && kann.datei > 8000, `${name}: lesbar und exportierbar (${kann.eintraege} Einträge, Export ${Math.round(kann.datei / 1024)} KB); das Aufräumen wartet auf den nächsten Start (Papierkorb: ${kann.korb || "–"})`);
      if (z1.brain) {
        await page.click("#brain-mehr");
        pruefe(await page.evaluate(() => { const p = document.querySelector('#brain-menue [data-brain="export-zip"]'); return Boolean(p) && !p.disabled; }), `${name}: „Exportieren“ ist im Menü bedienbar`);
        await page.keyboard.press("Escape");
      } else pruefe(false, `${name}: „Exportieren“ ist im Menü bedienbar`);
      // Speicher wieder frei: der nächste Start räumt den Papierkorb auf
      await page.evaluate(() => localStorage.removeItem("__probe_voll"));
      await page.reload();
      await page.waitForFunction(BEREIT, null, { timeout: 20000 });
      pruefe(await page.evaluate(() => { const br = window.GabiBrainAnsicht.aktuell.brain; return br.papierkorb().length === 0 && br.eigene().length === 42 && document.querySelector("#brain-hinweis").hidden; }), `${name}: ist wieder Platz, räumt der nächste Start auf – ohne Hinweis`);
    });
    pruefe(konsole.length === 0, `${name}: keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    // Stand von einer neueren Gabi (höhere Schema-Nummer): lesbar, mit Hinweis – Speichern nennt den Grund
    const ctx = await kontext(browser);
    const { page, konsole } = await demoSeite(ctx);
    await ablauf(`${name} (neuere Fassung)`, async () => {
      const schemaSetzen = (wert) => page.evaluate((w) => new Promise((ok, nein) => {
        const r = indexedDB.open("gabi-brain-demo", 1);
        r.onerror = () => nein(r.error);
        r.onsuccess = () => { const t = r.result.transaction(["meta"], "readwrite"); t.objectStore("meta").put({ schluessel: "schema", wert: w }); t.oncomplete = () => { r.result.close(); ok(); }; t.onerror = () => nein(t.error); };
      }), wert);
      await schemaSetzen(2);
      await page.reload();
      await page.waitForFunction(BEREIT, null, { timeout: 20000 });
      await page.waitForSelector(".brain-zeile");
      const h = await page.evaluate(() => { const x = document.querySelector("#brain-hinweis"); return { sichtbar: Boolean(x) && !x.hidden, text: x ? x.textContent.trim() : "", eintraege: window.GabiBrainAnsicht.aktuell.brain.eigene().length }; });
      pruefe(h.eintraege === 43 && h.sichtbar && /neueren Gabi/.test(h.text) && /nur ansehen/.test(h.text), `${name}: ein Stand von einer neueren Gabi ist lesbar (${h.eintraege} Einträge) – mit Hinweis („${h.text.slice(0, 70)}…“)`);
      await bearbeiten(page, "Kontakt", "Mit alter Seite getippt.");
      await page.click('.brain-form button[type="submit"]');
      await page.waitForSelector('.brain-form [data-fehler="allgemein"]:not([hidden])', { timeout: 5000 }).catch(() => {});
      const f = await formFehler(page);
      pruefe(/mit einer neueren Gabi angelegt/.test(f) && /lade die Seite neu/.test(f), `${name}: Speichern nennt dort den Grund („${f.slice(0, 80)}“) – nicht „noch einmal versuchen“`);
      // und eine Datenbank in neuerer Version (lässt sich mit dieser Seite gar nicht öffnen): der Fehlerzustand sagt es
      await page.click('.brain-form [data-brain="bearbeiten-abbrechen"]');
      await page.waitForSelector("#dialog-frage[open]");
      await page.click("#frage-ja");
      await schemaSetzen(1);
      await page.evaluate(() => { location.hash = "#/"; }); // die Seite gibt die Datenbank frei, sobald das Brain nach dem Neuladen neu öffnet
      await page.evaluate(() => new Promise((ok) => {
        const r = indexedDB.open("gabi-brain-demo", 2); // wie eine neuere Gabi: hebt die Datenbank auf Version 2
        r.onupgradeneeded = () => {};
        r.onsuccess = () => { r.result.close(); ok(true); };
        r.onerror = () => ok(false);
        r.onblocked = () => {};
      }));
      await page.evaluate(() => { location.hash = "#/brain/liste"; });
      await page.reload();
      await page.waitForFunction(() => { const z = document.querySelector("#brain-zustand"); return (z && !z.hidden && z.querySelector("h2")) || Boolean(window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.brain); }, null, { timeout: 20000 });
      await warte(300);
      const z1 = await zustand(page);
      pruefe(z1.sichtbar && !z1.brain && /mit einer neueren Gabi angelegt/.test(z1.titel) && /lade die Seite neu/.test(z1.titel) && (await page.evaluate(() => localStorage.getItem("gabi.demo.brain.v1") === null)), `${name}: eine Datenbank in neuerer Version: der Fehlerzustand nennt den Grund („${z1.titel}“), kein Ersatz-Brain`);
    });
    pruefe(konsole.length === 0, `${name} (neuere Fassung): keine Fehler in der Konsole${konsole.length ? ` (${konsole.slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Fund 6: „Brain-Wissen löschen“ beim Abmelden in Tab A – Tab B, ein Demo-Tab und ein Tab ohne Nachricht
// ---------------------------------------------------------------------------
async function fund6(browser, motor) {
  const name = `${motor} Fund 6`;
  const abmeldenMitBrain = async (page) => {
    await page.click("#test-badge");
    await page.click("#info-abmelden");
    await page.waitForSelector("#dialog-frage[open]");
    await page.check("#frage-haken2");
    await page.click("#frage-ja");
    await page.waitForSelector("#ansicht-zugang:not([hidden])");
  };
  const rohKnoten = (page, db = "gabi-brain") => page.evaluate((n) => new Promise((ok) => { const r = indexedDB.open(n); r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains("knoten")) { d.close(); ok(0); return; } const q = d.transaction("knoten").objectStore("knoten").count(); q.onsuccess = () => { d.close(); ok(q.result); }; q.onerror = () => { d.close(); ok(-1); }; }; r.onerror = () => ok(-1); }), db);
  {
    const ctx = await kontext(browser);
    const a = await lokalSeite(ctx);
    const b = await lokalSeite(ctx);
    const demo = await demoSeite(ctx);
    await ablauf(name, async () => {
      await b.page.waitForSelector(".brain-zeile");
      pruefe((await a.page.evaluate(() => window.GabiBrainAnsicht.aktuell.brain.eigene().length)) === 41 && (await b.page.evaluate(() => window.GabiBrainAnsicht.aktuell.brain.eigene().length)) === 41, `${name}: Tab A und Tab B sind angemeldet (je 41 Einträge), daneben ein Demo-Tab`);
      await bearbeiten(b.page, "Sensopro", "Ungespeichert in Tab B.");
      await warte(600);
      // Tab A: Abmelden mit Häkchen „Brain-Wissen auf diesem Gerät auch löschen“
      await abmeldenMitBrain(a.page);
      await b.page.waitForFunction(() => { const z = document.querySelector("#brain-zustand"); return Boolean(z && !z.hidden && z.querySelector("h2")); }, null, { timeout: 6000 }).catch(() => {});
      const zb = await zustand(b.page);
      pruefe(zb.sichtbar && !zb.brain && zb.titel === "Das Brain wurde in einem anderen Fenster gelöscht." && /Abmelden/.test(zb.text) && zb.knopf === "Neu laden", `${name}: Tab B steht nicht ohne Erklärung mit einem leeren Brain da („${zb.titel || "kein Hinweis"}“, Knopf „${zb.knopf}“)`);
      pruefe(!(await b.page.$(".brain-form")) && (await toastKommt(b.page, "in einem anderen Fenster gelöscht.*ungespeicherte Änderung ist damit verworfen")), `${name}: die offene Bearbeitung in Tab B ist beendet – mit Rückmeldung, nicht mit „… gerade geändert. Beim Speichern fragt Gabi nach.“`);
      pruefe(await b.page.evaluate(() => sessionStorage.getItem("gabi.brain.notfall") === null), `${name}: auch die Notfall-Kopie der Bearbeitung ist gelöscht (sie wäre Brain-Wissen)`);
      await bild(b.page, `${motor}-f6-tab-b-geloescht`);
      pruefe(await breiteOk(b.page), `${name}: Hinweis ohne seitliches Scrollen (1440 px)`);
      await b.page.setViewportSize({ width: 320, height: 640 });
      await warte(250);
      pruefe(await breiteOk(b.page), `${name}: Hinweis ohne seitliches Scrollen (320 px)`);
      await bild(b.page, `${motor}-f6-tab-b-geloescht-320`);
      await b.page.setViewportSize({ width: 1440, height: 900 });
      const reste = await b.page.evaluate(() => Object.keys(localStorage).filter((s) => /brain/.test(s)));
      pruefe((await rohKnoten(b.page)) === 0 && reste.length === 0, `${name}: Tab B spielt von selbst nichts wieder ein – das Brain-Wissen bleibt gelöscht (Datenbank leer, localStorage ${reste.join(",") || "leer"})`);
      // der Demo-Tab erfährt es auch (das Demo-Brain wird mit gelöscht)
      await demo.page.waitForFunction(() => { const z = document.querySelector("#brain-zustand"); return Boolean(z && !z.hidden && z.querySelector("h2")); }, null, { timeout: 4000 }).catch(() => {});
      const zd = await zustand(demo.page);
      pruefe(zd.sichtbar && !zd.brain && /in einem anderen Fenster gelöscht/.test(zd.titel), `${name}: auch der offene Demo-Tab sagt es (sein Brain wurde mit gelöscht) – er zeigt nicht weiter 43 Einträge, die es nicht mehr gibt`);
      // Tab B: „Neu laden“ beginnt mit dem Ausgangsstand, Gabi antwortet wieder aus dem Brain
      if (await b.page.$('[data-brain="neu-laden"]')) await b.page.click('[data-brain="neu-laden"]');
      await b.page.waitForFunction(BEREIT, null, { timeout: 12000 }).catch(() => {});
      await warte(300);
      const neuB = await b.page.evaluate(() => { const br = window.GabiBrainAnsicht.aktuell.brain; return br ? { anzahl: br.eigene().length, sensopro: /Ungespeichert/.test((br.findeTitel("Sensopro") || {}).inhalt || ""), form: Boolean(document.querySelector(".brain-form")), undo: br.kannRueckgaengig } : null; });
      pruefe(Boolean(neuB) && neuB.anzahl === 41 && !neuB.sensopro && !neuB.form && !neuB.undo, `${name}: „Neu laden“ in Tab B beginnt mit dem Ausgangsstand (${neuB ? neuB.anzahl : 0} Einträge), ohne alte Bearbeitung und ohne alte Rückgängig-Schritte`);
      await b.page.evaluate(() => { location.hash = "#/"; });
      await b.page.waitForSelector("#ansicht-chat:not([hidden])");
      await b.page.fill("#eingabe-text", "Wie erreiche ich euch telefonisch?");
      await b.page.click("#senden");
      await b.page.waitForSelector(".nachricht:last-child .brain-quelle", { timeout: 20000 }).catch(() => {});
      pruefe((await b.page.$$eval(".nachricht:last-child .brain-quelle", (c) => c.map((x) => x.textContent.trim()))).includes("Telefonzeiten"), `${name}: danach antwortet Gabi in Tab B wieder aus dem Brain (Quelle „Telefonzeiten“)`);
    });
    pruefe(a.konsole.length === 0 && b.konsole.length === 0 && demo.konsole.length === 0, `${name}: keine Fehler in der Konsole${[...a.konsole, ...b.konsole, ...demo.konsole].length ? ` (${[...a.konsole, ...b.konsole, ...demo.konsole].slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
  {
    // Sicherheitsnetz: ein Tab, den die Nachricht nicht erreicht (hier: ohne BroadcastChannel), legt nach dem Löschen etwas an
    const ctx = await kontext(browser);
    const a = await lokalSeite(ctx);
    const b = await lokalSeite(ctx, "#/brain/liste", () => { try { delete window.BroadcastChannel; } catch { /* egal */ } window.BroadcastChannel = undefined; });
    await ablauf(`${name} (Tab ohne Nachricht)`, async () => {
      await b.page.waitForSelector(".brain-zeile");
      await abmeldenMitBrain(a.page);
      await warte(600);
      await b.page.click('[data-brain="neu"]');
      await b.page.waitForSelector(".brain-form");
      await b.page.fill('.brain-form [name="titel"]', "Nach dem Löschen angelegt");
      await b.page.fill("#brain-inhalt", "Im noch offenen Tab getippt.");
      await b.page.click('.brain-form button[type="submit"]');
      await b.page.waitForFunction(() => Boolean(window.GabiBrainAnsicht.aktuell.brain.findeTitel("Nach dem Löschen angelegt")), null, { timeout: 5000 });
      pruefe((await rohKnoten(b.page)) === 1, `${name}: ein Tab ohne Nachricht legt nach dem Löschen einen Eintrag an – in der Datenbank steht nur er`);
      // Tab A meldet sich neu an: das Brain hat wieder das Praxiswissen
      await anmelden(a.page);
      await a.page.evaluate(() => { location.hash = "#/brain/liste"; });
      await a.page.waitForSelector(".brain-zeile");
      const anzahl = await a.page.evaluate(() => window.GabiBrainAnsicht.aktuell.brain.eigene().length);
      pruefe(anzahl === 42 && Boolean(await knoten(a.page, "Nach dem Löschen angelegt")), `${name}: nach neuem Anmelden hat das Brain wieder den Seed – plus den einen Eintrag (${anzahl} Einträge, nicht 1)`);
      await a.page.evaluate(() => { location.hash = "#/"; });
      await a.page.waitForSelector("#ansicht-chat:not([hidden])");
      await a.page.fill("#eingabe-text", "Wie erreiche ich euch telefonisch?");
      await a.page.click("#senden");
      await a.page.waitForFunction(() => { const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop(); return !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && n && n.innerText.trim().length > 10; }, null, { timeout: 20000 }).catch(() => {});
      const antwort = await a.page.evaluate(() => { const n = [...document.querySelectorAll("#nachrichten .von-gabi")].pop(); return n ? n.innerText : ""; });
      pruefe(/7:30/.test(antwort) && !/Dazu steht noch nichts im Brain/.test(antwort), `${name}: Gabi antwortet wieder auf Praxisfragen – nicht „Dazu steht noch nichts im Brain.“`);
    });
    pruefe(a.konsole.length === 0 && b.konsole.length === 0, `${name} (Tab ohne Nachricht): keine Fehler in der Konsole${[...a.konsole, ...b.konsole].length ? ` (${[...a.konsole, ...b.konsole].slice(0, 3).join(" | ")})` : ""}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  try {
    if (FUNDE.has("1")) await fund1(browser, motor);
    if (FUNDE.has("2")) await fund2(browser, motor);
    if (FUNDE.has("3")) await fund3(browser, motor);
    if (FUNDE.has("4")) await fund4(browser, motor);
    if (FUNDE.has("5")) await fund5(browser, motor);
    if (FUNDE.has("6")) await fund6(browser, motor);
  } finally {
    await browser.close();
  }
}

console.log(`\n${gezaehlt - fehler.length} von ${gezaehlt} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot:` : "."}`);
for (const f of fehler) console.log(`  ✗ ${f}`);
if (!gezaehlt) { console.error("Keine Prüfung gelaufen."); process.exit(2); }
process.exit(fehler.length ? 1 : 0);
