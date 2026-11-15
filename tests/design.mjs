// Design v2.3 – PhysioWorks-Stil mit Glas: Messungen und Screenshots (nur Demo- und Testdaten, keine Secrets).
//  A  Hauptansichten in Chromium und WebKit, Hell und Dunkel, 390 und 1440 px: Zugang, Gespräch (Start, Entwurf,
//     Gespeichert + Toast, Antwort + Quellen, Bericht, Glas über dem Verlauf), Schublade bzw. Seitenleiste,
//     Info-Dialog, Notizordner (Patienten, Neuer Test-Patient, Suche, Nichts gefunden, Patient, Notiz, Rückfrage),
//     Offline, Mikrofon-Hilfe. Je Ansicht:
//     · Screenshot nach <ordner>/<motor>-<hell|dunkel>-<breite>-<nr>-<ansicht>.jpg
//     · Kontrast jeder sichtbaren Textstelle gegen ihren echten Hintergrund ≥ 4,5:1: Bild mit unsichtbarem Text,
//       Pixel im Textrahmen gegen die Textfarbe (2-%-Perzentil, Deckkraft der Vorfahren eingerechnet). Zwei Durchgänge:
//       Inhalt (alles ohne Glas-Ebenen) und Glas-Ebenen (Kopfzeile/Seitenleiste, Eingabe-Band, Dialoge, Toasts) –
//       dort bleibt der Verlauf dahinter sichtbar, Text auf Glas wird also mit dem gemessen, was darunter liegt.
//       Platzhalter, Feldinhalte und Auswahllisten zählen mit. Ausnahmen (WCAG 1.4.3): deaktivierte Bedienelemente und
//       der Markenpunkt „.“ hinter „Gabi“ (Logo).
//     · kein seitliches Scrollen
//  B  Schriften wirklich geladen: document.fonts (DM Sans, Red Hat Display „loaded“), Text und Überschrift nutzen sie
//  C  kein Fremd-Request: jede Anfrage an die eigene Adresse (oder data:/blob:), kein CSP-Verstoß
//  D  kein seitliches Scrollen auch bei 320 und 768 px (alle Ansichten, Chromium + WebKit)
//  E  Glas wirkt: der Verlauf unter Kopfzeile und Eingabe-Band ist unscharf (Kantenstärke mit vs. ohne backdrop-filter),
//     dazu Bildausschnitte für die Sichtprüfung
//  F  deckend: „Bewegung reduzieren“ (Chromium + WebKit), „Transparenz reduzieren“ (Chromium per CDP) und ohne
//     backdrop-filter (der @supports-not-Block aus style.css eingespielt): Glas ohne Unschärfe, Fläche deckend,
//     ohne Übergänge
//  G  Grund ohne Kante: Verlauf und Lichtflächen allein (App ausgeblendet), Zeilen und Spalten über den ganzen Bildschirm.
//     Chromium dithert Verläufe mit einem feinen Muster (Nachbarpixel ±2–4 Stufen) – gemessen wird darum der Sprung
//     zwischen Mitteln aus 8×8 Pixeln (≤ 3 Stufen); eine eingebaute Kontrollkante von etwa 5 Stufen muss erkannt werden
// Voraussetzung: lokaler Server wie bei v2.mjs (`cd worker && npm run lokal` → http://localhost:8788, Code „test“).
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/design.mjs [screenshot-ordner] [basis-url]
//   Eingrenzen: GABI_MOTOREN=chromium,webkit  GABI_SCHEMEN=light,dark  GABI_BREITEN=390,1440  GABI_TEILE=A,D,E,F,G
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const WURZEL = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [, , aus = join(WURZEL, "screenshots", "design"), basis = "http://localhost:8788"] = process.argv;
await mkdir(aus, { recursive: true });
const liste = (name, standard) => (process.env[name] || standard).split(",").map((s) => s.trim()).filter(Boolean);
const MOTOREN = liste("GABI_MOTOREN", "chromium,webkit");
const SCHEMEN = liste("GABI_SCHEMEN", "light,dark");
const BREITEN = liste("GABI_BREITEN", "390,1440").map(Number);
const TEILE = liste("GABI_TEILE", "A,D,E,F,G");
const MIN_KONTRAST = 4.5;

const fehler = [];
const pruefe = (ok, text) => { if (!ok) { fehler.push(text); console.log(`✗ ${text}`); } else console.log(`✓ ${text}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const bericht = { kontrast: [], glas: [], deckend: [], schriften: [], anfragen: [], grund: [] };

// Chromium in der neuen Headless-Variante mit GPU: die alte Headless-Shell zeichnet backdrop-filter nach manchen
// Stil-Umschaltungen nicht mehr (Bild ohne Unschärfe, obwohl die Seite sie hat). GABI_CHROMIUM_SHELL=1: alte Shell.
const CHROMIUM = process.env.GABI_CHROMIUM_SHELL === "1" ? {} : { channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] };
const browser = {};
for (const m of new Set([...MOTOREN, "chromium"])) browser[m] = await (m === "webkit" ? webkit.launch() : chromium.launch(CHROMIUM));
const hilfe = await (await browser.chromium.newContext()).newPage(); // Pixel lesen (Canvas)

/** Keine echte Sprachausgabe in Testbrowsern – nur eine stumme Attrappe. */
async function stumm(ctx) {
  await ctx.addInitScript(() => {
    const attrappe = { speak(u) { setTimeout(() => u.onend && u.onend(), 300); }, cancel() {}, getVoices() { return [{ name: "Test", lang: "de-DE", localService: true, default: true }]; }, addEventListener() {}, removeEventListener() {}, speaking: false };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    try { Object.defineProperty(window, "speechSynthesis", { value: attrappe, configurable: true }); } catch { /* egal */ }
  });
}
/** Anfragen und CSP-Verstöße mitschreiben (C). */
function beobachten(ctx, page, name) {
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(basis) && !u.startsWith("data:") && !u.startsWith("blob:")) bericht.anfragen.push(`${name}: ${u}`);
  });
}
async function cspLesen(page) { return page.evaluate(() => window.__csp || []); }
async function kontext(motor, { breite, hoehe, schema, ...extra }) {
  const mobil = breite < 768;
  const ctx = await browser[motor].newContext({
    viewport: { width: breite, height: hoehe || (mobil ? 844 : 900) }, deviceScaleFactor: mobil ? 2 : 1, isMobile: mobil, hasTouch: breite < 1024,
    colorScheme: schema, acceptDownloads: false, ...extra,
  });
  await stumm(ctx);
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => {
    const t = e.target;
    // bekannt und harmlos (schon v2.1.2, siehe tests/v2.mjs): WebKit gibt einer per innerHTML eingesetzten <select> eigene
    // Inline-Stile, die style-src 'self' blockt (Ziel: die Auswahl selbst bzw. das Dokument im selben Moment)
    const auswahl = e.violatedDirective.startsWith("style-src-attr") && t && (t.nodeName === "SELECT" || t.nodeName === "#document");
    window[auswahl ? "__cspAuswahl" : "__csp"] = [...(window[auswahl ? "__cspAuswahl" : "__csp"] || []), `${e.violatedDirective} ${e.blockedURI} ${(e.sourceFile || "").split("/").pop()}:${e.lineNumber} ${t && t.nodeName}`];
  }, true); });
  return ctx;
}
const antwortAbwarten = (page, muster, timeout = 20000) => page.waitForFunction((m) => {
  const t = [...document.querySelectorAll(".von-gabi .nachricht-text")].pop();
  return !document.querySelector("#senden.stoppt") && !document.querySelector(".von-gabi .tippen") && t && new RegExp(m).test(t.textContent);
}, muster, { timeout });
async function fragen(page, text, muster) {
  await page.fill("#eingabe-text", text);
  await page.click("#senden");
  await antwortAbwarten(page, muster);
}
const breiteSeite = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);

// ---------------------------------------------------------------------------
// Kontrast: Textstellen sammeln, Text der Ebene unsichtbar machen, Hintergrund-Pixel auswerten
// ---------------------------------------------------------------------------
/** Regeln zum Messen in die eigene style.css einfügen (CSSOM statt <style>: die CSP bleibt unverändert streng). */
async function messregeln(page) {
  await page.evaluate(() => {
    if (window.__messregeln) return;
    const blatt = [...document.styleSheets].find((s) => (s.href || "").includes("style.css"));
    const unsichtbar = "color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; transition: none !important;";
    const regeln = [
      `html.km-ruhe *, html.km-ruhe *::before, html.km-ruhe *::after { transition: none !important; }`,
      `html.km-alles *, html.km-alles *::before, html.km-alles *::after { ${unsichtbar} }`,
      `html.km-alles ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }`,
      `html.km-ueber .kopf *, html.km-ueber .eingabe-bereich *, html.km-ueber dialog[open] *, html.km-ueber .toasts * { ${unsichtbar} }`,
      `html.km-ueber .kopf ::placeholder, html.km-ueber .eingabe-bereich ::placeholder, html.km-ueber dialog[open] ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }`,
      // Glasprobe (E): eigene Inhalte der Glasflächen ausblenden, Unschärfe abschalten
      `html.gp-leer .kopf > *, html.gp-leer .eingabe-innen, html.gp-leer .toasts { visibility: hidden !important; }`,
      `html.gp-scharf .kopf, html.gp-scharf .eingabe-bereich::before { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }`,
    ];
    for (const r of regeln) blatt.insertRule(r, blatt.cssRules.length);
    window.__messregeln = true;
  });
}

/** Sichtbare Textstellen einer Ebene („inhalt“ oder „ueber“) mit Rahmen, Farbe, Deckkraft. */
function textPostenSammeln(ebene) {
  const UEBER = ".kopf, .eingabe-bereich, dialog[open], .toasts";
  const modal = [...document.querySelectorAll("dialog[open]")].some((d) => d.matches(":modal"));
  if (ebene === "inhalt" && modal) return { posten: [], ausnahmen: [] }; // unter einem Dialog ist alles abgedunkelt und inaktiv
  const vw = innerWidth, vh = innerHeight;
  const schnitt = (a, b) => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), r: Math.min(a.r, b.r), u: Math.min(a.u, b.u) });
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, u: r.bottom }; };
  const leer = (b) => b.r - b.x < 1 || b.u - b.y < 1;
  // Glas-Ebenen, die Inhalt verdecken (Band ragt 22 px weich nach oben)
  const toastBoxen = [...document.querySelectorAll(".toast")].filter((e) => e.getClientRects().length).map(box);
  const decker = ebene === "inhalt" ? [...document.querySelectorAll(".kopf, .eingabe-bereich, .toast")].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility === "visible").map((e) => {
    const b = box(e); if (e.matches(".eingabe-bereich")) b.y -= 22; return b;
  }) : [];
  const deckkraft = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const sichtbar = (el) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : getComputedStyle(el).visibility === "visible");
  /** Sichtbarer Bereich: Ansicht ∩ alle Vorfahren mit overflow ≠ visible; Chips-Leiste ohne ihren weichen Rand. */
  const klammer = (el, b) => {
    let k = schnitt(b, { x: 0, y: 0, r: vw, u: vh });
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") k = schnitt(k, box(e));
      if (e.matches(".chips-leiste")) { const z = box(e); k = schnitt(k, { x: z.x + 18, y: z.y, r: z.r - 18, u: z.u }); }
    }
    return k;
  };
  const farbe = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const t = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: t.slice(0, 3), a: t.length > 3 ? t[3] : 1 }; };
  const posten = [];
  const ausnahmen = [];
  const pfad = (el) => { const t = []; for (let e = el; e && e !== document.body && t.length < 3; e = e.parentElement) t.unshift(e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${e.classList.length ? `.${[...e.classList].slice(0, 2).join(".")}` : ""}`); return t.join(" > "); };
  const gehoert = (el) => (ebene === "ueber") === Boolean(el.closest(UEBER));
  const aufnehmen = (el, rechtecke, text, c) => {
    if (!gehoert(el)) return;
    if (modal && ebene === "ueber" && !el.closest("dialog[open]")) return; // hinter dem Dialog: abgedunkelt
    if (el.closest("button:disabled, [aria-disabled='true'], input:disabled, textarea:disabled, select:disabled, fieldset:disabled")) { ausnahmen.push(`deaktiviert: ${text.slice(0, 30)}`); return; }
    if (el.matches(".marke-punkt, .gruss .akzent") && text.trim() === ".") { ausnahmen.push("Markenpunkt „.“ (Logo)"); return; }
    const o = deckkraft(el);
    if (!c || c.a * o < 0.05) return;
    for (const r0 of rechtecke) {
      let k = klammer(el, { x: r0.left + 0.5, y: r0.top + 0.5, r: r0.right - 0.5, u: r0.bottom - 0.5 });
      if (leer(k)) continue;
      if (decker.some((d) => !leer(schnitt(d, k)))) continue; // liegt unter Glas – dort nicht lesbar gedacht
      if (ebene === "ueber" && !el.closest(".toasts") && toastBoxen.some((d) => !leer(schnitt(d, k)))) continue; // unter einem Toast
      posten.push({ x: k.x, y: k.y, w: k.r - k.x, h: k.u - k.y, farbe: c.rgb, alpha: c.a * o, text: text.trim().slice(0, 40), wo: pfad(el) });
    }
  };
  // 1) Textknoten
  const gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = gang.nextNode(); n; n = gang.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("svg, script, style, template, .unsichtbar, .skelett, dialog:not([open]), option") || !sichtbar(el)) continue;
    const bereich = document.createRange();
    bereich.selectNodeContents(n);
    aufnehmen(el, [...bereich.getClientRects()], n.nodeValue, farbe(getComputedStyle(el).color));
  }
  // 2) Feldinhalte, Platzhalter, Auswahllisten (kein Textknoten im DOM)
  const messen = document.createElement("canvas").getContext("2d");
  for (const el of document.querySelectorAll("input:not([type=checkbox]):not([type=hidden]), textarea, select")) {
    if (!sichtbar(el) || el.closest("dialog:not([open])")) continue;
    const cs = getComputedStyle(el);
    const istAuswahl = el.tagName === "SELECT";
    const text = istAuswahl ? (el.selectedOptions[0] || {}).textContent || "" : el.value || el.placeholder || "";
    if (!text.trim() || (el.type === "password" && el.value)) continue;
    const platz = !istAuswahl && !el.value;
    let c = farbe(cs.color);
    if (platz) {
      let p = null;
      try { p = farbe(getComputedStyle(el, "::placeholder").color); } catch { /* WebKit */ }
      if (!p || (p.rgb.join() === c.rgb.join() && p.a === c.a)) p = farbe(getComputedStyle(document.documentElement).getPropertyValue("--text-4").trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
      c = p;
    }
    const b = el.getBoundingClientRect();
    messen.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop), pr = parseFloat(cs.paddingRight);
    const zeile = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const w = Math.min(messen.measureText(text).width, b.width - pl - pr);
    const y = el.tagName === "TEXTAREA" ? b.top + pt : b.top + (b.height - zeile) / 2;
    aufnehmen(el, [{ left: b.left + pl, top: y + zeile * 0.18, right: b.left + pl + w, bottom: y + zeile * 0.82 }], `${platz ? "Platzhalter: " : ""}${text}`, c);
  }
  return { posten, ausnahmen };
}

/** Pixel im Rahmen jeder Textstelle: Kontrast der (mit Deckkraft gemischten) Textfarbe gegen jedes Hintergrund-Pixel. */
async function auswerten(png, posten, dsf) {
  return hilfe.evaluate(async ({ b64, posten, dsf }) => {
    const bild = new Image();
    bild.src = `data:image/png;base64,${b64}`;
    await bild.decode();
    const c = document.createElement("canvas");
    c.width = bild.width; c.height = bild.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bild, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    return posten.map((p) => {
      const x0 = Math.max(0, Math.floor(p.x * dsf)), y0 = Math.max(0, Math.floor(p.y * dsf));
      const x1 = Math.min(c.width, Math.ceil((p.x + p.w) * dsf)), y1 = Math.min(c.height, Math.ceil((p.y + p.h) * dsf));
      if (x1 - x0 < 1 || y1 - y0 < 1) return null;
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const [tr, tg, tb] = p.farbe;
      const a = Math.min(1, p.alpha);
      const werte = [];
      let sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < d.length; i += 4) {
        const br = d[i], bg = d[i + 1], bb = d[i + 2];
        sr += br; sg += bg; sb += bb;
        const lt = lum(a * tr + (1 - a) * br, a * tg + (1 - a) * bg, a * tb + (1 - a) * bb);
        const lb = lum(br, bg, bb);
        werte.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
      }
      werte.sort((u, v) => u - v);
      const n = d.length / 4;
      const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
      return { text: p.text, wo: p.wo, kontrast: werte[Math.floor(werte.length * 0.02)], kleinster: werte[0], text_farbe: `rgb(${p.farbe.join(",")})${a < 1 ? ` α${a.toFixed(2)}` : ""}`, grund: `#${hex(sr)}${hex(sg)}${hex(sb)}` };
    }).filter(Boolean);
  }, { b64: png.toString("base64"), posten, dsf });
}

/** Kontrast aller Textstellen der aktuellen Ansicht – beide Ebenen. */
async function kontrastPruefen(page, name, dsf) {
  await messregeln(page);
  // Übergänge aus, bevor irgendetwas gemessen wird: sonst blendet die Schrift nach dem Ausblenden langsam zurück und die
  // zweite Ebene läse halbe Farben
  await page.evaluate(() => document.documentElement.classList.add("km-ruhe"));
  await warte(60);
  const ergebnis = [];
  const ausnahmen = new Set();
  const gesammelt = {};
  for (const ebene of ["inhalt", "ueber"]) gesammelt[ebene] = await page.evaluate(textPostenSammeln, ebene);
  for (const ebene of ["inhalt", "ueber"]) {
    const { posten, ausnahmen: a } = gesammelt[ebene];
    a.forEach((x) => ausnahmen.add(x));
    if (!posten.length) continue;
    await page.evaluate((k) => document.documentElement.classList.add(k), ebene === "inhalt" ? "km-alles" : "km-ueber");
    await warte(60);
    const png = await page.screenshot({ type: "png", caret: "initial" });
    await page.evaluate(() => document.documentElement.classList.remove("km-alles", "km-ueber"));
    await warte(30);
    for (const e of await auswerten(png, posten, dsf)) ergebnis.push({ ...e, ebene });
  }
  await page.evaluate(() => document.documentElement.classList.remove("km-ruhe"));
  const schlecht = ergebnis.filter((e) => e.kontrast < MIN_KONTRAST);
  const min = ergebnis.reduce((m, e) => Math.min(m, e.kontrast), Infinity);
  const schwaechste = [...ergebnis].sort((a, b) => a.kontrast - b.kontrast)[0];
  bericht.kontrast.push({ name, stellen: ergebnis.length, min: r2(min), schwaechste: schwaechste && `${schwaechste.text} (${schwaechste.wo}, ${schwaechste.text_farbe} auf ${schwaechste.grund})`, ausnahmen: [...ausnahmen] });
  pruefe(ergebnis.length > 0 && !schlecht.length,
    `${name}: Kontrast ${ergebnis.length} Textstellen, kleinster ${r2(min)}:1${schlecht.length ? ` – zu schwach: ${schlecht.slice(0, 6).map((e) => `„${e.text}“ ${r2(e.kontrast)} (${e.wo}, ${e.text_farbe} auf ${e.grund}, ${e.ebene})`).join(" | ")}` : ""}`);
  return ergebnis;
}

// ---------------------------------------------------------------------------
// E: Glas wirkt – Kantenstärke im Glasbereich mit und ohne backdrop-filter
// ---------------------------------------------------------------------------
async function kantenStaerke(png, bereiche, dsf) {
  return hilfe.evaluate(async ({ b64, bereiche, dsf }) => {
    const bild = new Image();
    bild.src = `data:image/png;base64,${b64}`;
    await bild.decode();
    const c = document.createElement("canvas");
    c.width = bild.width; c.height = bild.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bild, 0, 0);
    return bereiche.map((b) => {
      const x0 = Math.round(b.x * dsf), y0 = Math.round(b.y * dsf), w = Math.round(b.w * dsf), h = Math.round(b.h * dsf);
      const d = g.getImageData(x0, y0, w, h).data;
      const l = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let summe = 0, max = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) {
        const i = (y * w + x) * 4;
        const s = Math.abs(l(i) - l(i - 4));
        summe += s; max = Math.max(max, s); n++;
      }
      return { name: b.name, mittel: summe / n, max };
    });
  }, { b64: png.toString("base64"), bereiche, dsf });
}
/** Kontrollprobe je Motor: zeichnet dieser Testbrowser backdrop-filter überhaupt? (Playwright-WebKit tut es headless
 *  nicht – dann ist die Glasprobe dort nicht messbar, die Kontraste gelten dann für Glas ohne Unschärfe.) */
const glasKoennen = {};
async function kannGlas(motor) {
  if (motor in glasKoennen) return glasKoennen[motor];
  const ctx = await browser[motor].newContext({ viewport: { width: 390, height: 200 } });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;font:16px sans-serif"><div style="position:fixed;top:0;left:0;right:0;height:80px;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)"></div>${"<p style='margin:4px 8px'>Kontrollprobe Glas – Text hinter der Fläche</p>".repeat(12)}</body>`);
  await warte(200);
  const [k] = await kantenStaerke(await p.screenshot({ type: "png", caret: "initial" }), [{ name: "Probe", x: 4, y: 4, w: 380, h: 70 }], 1);
  await ctx.close();
  glasKoennen[motor] = k.max < 25;
  return glasKoennen[motor];
}
async function glasProbe(page, name, dsf, motor) {
  if (!(await kannGlas(motor))) {
    bericht.glas.push({ name, hinweis: "Testbrowser zeichnet backdrop-filter nicht (Kontrollprobe) – nicht messbar" });
    console.log(`⚠ ${name}: Glasprobe nicht messbar – dieser Testbrowser zeichnet backdrop-filter nicht (Kontrollprobe ohne App: Text bleibt scharf)`);
    return;
  }
  await messregeln(page);
  const bereiche = await page.evaluate(() => {
    const r = [];
    const band = document.querySelector(".eingabe-bereich");
    if (band && band.getClientRects().length) { const b = band.getBoundingClientRect(); r.push({ name: "Eingabe-Band", x: b.left + 4, y: b.top + 12, w: b.width - 8, h: b.height - 16 }); }
    const kopf = document.querySelector(".kopf");
    if (kopf && innerWidth < 1024) { const b = kopf.getBoundingClientRect(); r.push({ name: "Kopfzeile", x: b.left + 4, y: b.top + 4, w: b.width - 8, h: b.height - 8 }); }
    return r;
  });
  await page.evaluate(() => document.documentElement.classList.add("gp-leer"));
  await warte(80);
  const mit = await kantenStaerke(await page.screenshot({ type: "png", caret: "initial" }), bereiche, dsf);
  await page.evaluate(() => document.documentElement.classList.add("gp-scharf"));
  await warte(80);
  const ohne = await kantenStaerke(await page.screenshot({ type: "png", caret: "initial" }), bereiche, dsf);
  await page.evaluate(() => document.documentElement.classList.remove("gp-leer", "gp-scharf"));
  for (let i = 0; i < bereiche.length; i++) {
    const a = mit[i], b = ohne[i];
    const zeile = { name: `${name} ${a.name}`, mit: { mittel: r2(a.mittel), max: r2(a.max) }, ohne: { mittel: r2(b.mittel), max: r2(b.max) } };
    bericht.glas.push(zeile);
    // ohne Unschärfe: harte Schriftkanten (Inhalt liegt wirklich darunter); mit: weich, deutlich weniger Kanten
    pruefe(b.max >= 25 && a.max <= b.max * 0.5 && a.mittel <= b.mittel * 0.6,
      `${name}: ${a.name} – Verlauf darunter unscharf (Kanten mit Glas ⌀ ${r2(a.mittel)} / max ${r2(a.max)}, ohne ⌀ ${r2(b.mittel)} / max ${r2(b.max)})`);
  }
}

// ---------------------------------------------------------------------------
// A + B + C + D: Ansichten durchgehen
// ---------------------------------------------------------------------------
async function ansichten(motor, schema, breite, { bilder = true, kontrast = true }) {
  const mobil = breite < 768;
  const name = `${motor} ${schema === "dark" ? "dunkel" : "hell"} ${breite}`;
  const datei = (nr, was) => join(aus, `${motor}-${schema === "dark" ? "dunkel" : "hell"}-${breite}-${nr}-${was}.jpg`);
  const dsf = mobil ? 2 : 1;
  const ergebnisse = [];
  const ansicht = async (page, nr, was, { ganz = false } = {}) => {
    await warte(450); // Einblenden abwarten
    if (bilder) await page.screenshot({ path: datei(nr, was), type: "jpeg", quality: 82, fullPage: ganz, caret: "initial" });
    if (kontrast) await kontrastPruefen(page, `${name} ${nr}-${was}`, dsf);
    const ueber = await breiteSeite(page);
    pruefe(ueber <= 0, `${name} ${nr}-${was}: kein seitliches Scrollen${ueber > 0 ? ` (${ueber} px zu breit)` : ""}`);
  };

  // Zugang (echter lokaler Server, ohne Code)
  {
    const ctx = await kontext(motor, { breite, schema });
    const page = await ctx.newPage();
    beobachten(ctx, page, name);
    await page.goto(`${basis}/#/`);
    await page.waitForSelector("#ansicht-zugang:not([hidden])", { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await ansicht(page, "01", "zugang");
    if (!bilder && !kontrast) {
      const csp = await cspLesen(page);
      pruefe(!csp.length, `${name} Zugang: kein CSP-Verstoß${csp.length ? ` (${csp.join(" | ")})` : ""}`);
    }
    await ctx.close();
  }

  // Demo: Gespräch, Schublade/Seitenleiste, Dialoge, Notizordner
  const ctx = await kontext(motor, { breite, schema });
  const page = await ctx.newPage();
  beobachten(ctx, page, name);
  const konsole = [];
  page.on("pageerror", (e) => konsole.push(e.message));
  await page.goto(`${basis}/?demo=1#/`);
  await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
  // B: Schriften
  const s = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ""), status: f.status, weight: String(f.weight) }));
    const res = performance.getEntriesByType("resource").filter((r) => /\.woff2/.test(r.name)).map((r) => r.name.split("/").pop());
    return {
      dm: faces.filter((f) => f.family === "DM Sans").map((f) => f.status), rh: faces.filter((f) => f.family === "Red Hat Display").map((f) => f.status),
      inter: faces.some((f) => /Inter/.test(f.family)),
      checkDm: document.fonts.check('400 15px "DM Sans"'), checkRh: document.fonts.check('700 26px "Red Hat Display"'),
      text: getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      titel: getComputedStyle(document.querySelector("#gruss")).fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      titelGewicht: getComputedStyle(document.querySelector("#gruss")).fontWeight, res,
    };
  });
  bericht.schriften.push({ name, ...s });
  pruefe(s.dm.includes("loaded") && s.rh.includes("loaded") && s.checkDm && s.checkRh && s.text === "DM Sans" && s.titel === "Red Hat Display" && s.titelGewicht === "700" && !s.inter,
    `${name}: Schriften geladen – DM Sans ${s.dm.join("/")}, Red Hat Display ${s.rh.join("/")}; Text „${s.text}“, Überschrift „${s.titel}“ ${s.titelGewicht}; Dateien: ${s.res.join(", ") || "(Speicher)"}`);
  await ansicht(page, "02", "start");

  // Diktat mit Beispiel → Entwurfskarte
  await page.click('.vorschlag[data-schnell="diktat"]');
  await page.waitForSelector('[data-aktion="waehle"]');
  await page.click('[data-aktion="waehle"]:has-text("TP-01")');
  await page.waitForSelector("#modus-pill:not([hidden])");
  await page.click('[data-aktion="beispiel"]');
  await page.waitForSelector(".karte-entwurf:not(.erledigt)", { timeout: 20000 });
  await antwortAbwarten(page, "Entwurf für TP-01");
  await page.locator(".karte-entwurf").scrollIntoViewIfNeeded();
  await page.evaluate(() => { const k = document.querySelector(".karte-entwurf"); window.scrollBy(0, k.getBoundingClientRect().top - (innerWidth < 1024 ? 76 : 24)); });
  await ansicht(page, "03", "entwurf");
  await page.click('[data-aktion="entwurf-speichern"]');
  await page.waitForSelector(".karte-entwurf.erledigt");
  await page.waitForFunction(() => /Gespeichert bei TP-01/.test(document.querySelector("#toasts").textContent));
  await ansicht(page, "04", "gespeichert-toast");
  await page.waitForFunction(() => !document.querySelector("#toasts .toast"), null, { timeout: 15000 }).catch(() => {});

  // Antwort mit Quellen
  await fragen(page, "Was wollte TP-01?", "TP-01.*gesagt");
  await ansicht(page, "05", "antwort-quellen");

  // Bericht über die Schnellaktion
  await page.click('#chips-leiste [data-schnell="bericht"]');
  await page.locator('[data-aktion="waehle"]:has-text("TP-02")').last().click();
  await page.locator('[data-aktion="waehle"][data-wert="verlauf"]').last().click();
  await page.waitForSelector(".karte-bericht", { timeout: 15000 });
  await antwortAbwarten(page, "Verlaufsbericht für TP-02");
  await page.evaluate(() => { const k = document.querySelector(".karte-bericht"); window.scrollBy(0, k.getBoundingClientRect().top - (innerWidth < 1024 ? 76 : 24)); });
  await ansicht(page, "06", "bericht");

  // Glas über dem Verlauf: mehr Text, dann in die Mitte scrollen – Text läuft unter Kopfzeile und Band
  await fragen(page, "Wo sind die Standorte?", "Kieslingstraße 82");
  await fragen(page, "Welche Übung empfiehlst du für TP-01?", "Diagnosen und Empfehlungen gebe ich nicht");
  await page.evaluate(() => {
    const band = document.querySelector(".eingabe-bereich").getBoundingClientRect();
    // eine Textzeile einer Gabi-Antwort genau unter das Band (und am Handy weiteren Text unter die Kopfzeile) legen
    const t = [...document.querySelectorAll(".von-gabi .nachricht-text p, .von-gabi .nachricht-text li, .blase")].find((x) => x.getBoundingClientRect().height > 18);
    const ziele = [...document.querySelectorAll(".von-gabi .nachricht-text p, .von-gabi .nachricht-text li")];
    const mitte = ziele[Math.floor(ziele.length / 2)] || t;
    window.scrollBy(0, mitte.getBoundingClientRect().top - (band.top + 28));
  });
  await warte(300);
  if (TEILE.includes("E")) await glasProbe(page, name, dsf, motor);
  await ansicht(page, "07", "glas-ueber-verlauf");
  if (bilder) {
    const kopf = await page.locator(".kopf").boundingBox();
    const band = await page.evaluate(() => { const b = document.querySelector(".eingabe-bereich").getBoundingClientRect(); return { x: b.left, y: b.top - 22, width: b.width, height: b.height + 22 }; });
    if (mobil) await page.screenshot({ path: datei("07", "glas-kopf-ausschnitt").replace(".jpg", ".png"), clip: { x: 0, y: 0, width: breite, height: Math.min(kopf.height + 40, 140) }, caret: "initial" });
    await page.screenshot({ path: datei("07", "glas-band-ausschnitt").replace(".jpg", ".png"), clip: { x: Math.max(0, band.x), y: Math.max(0, band.y - 30), width: Math.min(band.width, breite), height: band.height + 30 }, caret: "initial" });
  }

  // Schublade (Handy) bzw. Seitenleiste mit Zeigen (Laptop)
  if (breite < 1024) {
    await page.click("#kopf-menue");
    await page.waitForSelector("#schublade[open]");
    await warte(320);
    await ansicht(page, "08", "schublade");
    await page.click("#schublade-zu");
    await page.waitForFunction(() => !document.querySelector("#schublade").open);
  } else {
    await page.locator("#seiten-gespraeche .gespraech-eintrag").first().hover();
    await ansicht(page, "08", "seitenleiste");
    await page.mouse.move(breite - 10, 10);
  }

  // Info-Dialog
  await page.click("#test-badge");
  await page.waitForSelector("#dialog-info[open]");
  await ansicht(page, "09", "dialog-info");
  await page.click('#dialog-info button[value="ok"]');
  await page.waitForFunction(() => !document.querySelector("#dialog-info").open);

  // Notizordner
  if (breite < 1024) await page.click("#kopf-wechsel");
  else await page.click('.navi a[data-navi="notizen"]');
  await page.waitForSelector(".patient-karte");
  await ansicht(page, "10", "notizen");
  await page.click('[data-ordner="patient-neu"]');
  await page.waitForSelector("#dialog-patient[open]");
  await page.fill("#patient-pseudonym", "");
  await ansicht(page, "11", "dialog-neuer-patient");
  await page.click("#patient-abbrechen");
  await page.waitForFunction(() => !document.querySelector("#dialog-patient").open);
  await page.fill("#suche", "Knie");
  await page.waitForFunction(() => /Notiz(en)? zu „Knie“ gefunden/.test(document.querySelector("#ordner-inhalt").textContent));
  await ansicht(page, "12", "suche");
  await page.fill("#suche", "xyzabc");
  await page.waitForSelector("#ordner-inhalt .leer");
  await ansicht(page, "13", "suche-leer");
  await page.click('#ordner-inhalt [data-ordner="suche-loeschen"]');
  await page.waitForSelector(".patient-karte");
  await page.click('.patient-karte:has-text("TP-01")');
  await page.waitForSelector(".notiz-karte");
  await ansicht(page, "14", "patient");
  await page.locator(".notiz-karte").first().click();
  await page.waitForSelector('[data-leser="pdf"]');
  await ansicht(page, "15", "notiz");
  await page.click('[data-leser="loeschen"]');
  await page.waitForSelector("#dialog-frage[open]");
  await ansicht(page, "16", "dialog-rueckfrage");
  await page.click("#frage-nein");
  if (!bilder && !kontrast) { // (siehe Zugang)
    const csp = await cspLesen(page);
    const auswahl = await page.evaluate(() => (window.__cspAuswahl || []).length);
    pruefe(!csp.length, `${name} Demo: kein CSP-Verstoß${csp.length ? ` (${csp.join(" | ")})` : ""}${auswahl ? ` – bekannt/harmlos: ${auswahl}× WebKit-Auswahlliste (eingebaute Stile)` : ""}`);
  }
  pruefe(!konsole.length, `${name} Demo: keine Skriptfehler${konsole.length ? ` (${konsole.join(" | ")})` : ""}`);
  await ctx.close();

  // Offline (gespeicherter Code, Server nicht erreichbar)
  {
    const c2 = await kontext(motor, { breite, schema });
    await c2.addInitScript(() => { try { localStorage.setItem("gabi.zugang", "test"); } catch { /* egal */ } });
    const p2 = await c2.newPage();
    beobachten(c2, p2, name);
    await p2.route("**/api/status", (route) => route.abort("connectionrefused"));
    await p2.goto(`${basis}/#/`);
    await p2.waitForSelector("#ansicht-offline:not([hidden])", { timeout: 20000 });
    await ansicht(p2, "17", "offline");
    await c2.close();
  }
  // Mikrofon-Hilfe (Zugriff verweigert)
  {
    const c3 = await kontext(motor, { breite, schema });
    await c3.addInitScript(() => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("verweigert", "NotAllowedError"));
      if (navigator.permissions) navigator.permissions.query = () => Promise.resolve({ state: "prompt", onchange: null });
    });
    const p3 = await c3.newPage();
    beobachten(c3, p3, name);
    await p3.goto(`${basis}/?demo=1#/`);
    await p3.waitForSelector(".vorschlag");
    const k = await p3.locator("#mikro").boundingBox();
    await p3.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
    await p3.mouse.down();
    await p3.waitForSelector(".hinweis-box.warn", { timeout: 10000 });
    await p3.mouse.up();
    await ansicht(p3, "18", "mikrofon-hilfe");
    await c3.close();
  }
  return ergebnisse;
}

// ---------------------------------------------------------------------------
// F: deckend bei „Bewegung reduzieren“, „Transparenz reduzieren“ und ohne backdrop-filter
// ---------------------------------------------------------------------------
async function deckendPruefen(page, name) {
  await page.click("#test-badge");
  await page.waitForSelector("#dialog-info[open]");
  await warte(300);
  const r = await page.evaluate(() => {
    const alpha = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return s === "transparent" ? 0 : 1; const t = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return t.length > 3 ? t[3] : 1; };
    const filter = (cs) => cs.backdropFilter || cs.webkitBackdropFilter || "none";
    const flaechen = [[".kopf", null], [".eingabe-bereich", "::before"], [".eingabe", null], [".vorschlag", null], ["#dialog-info", null]];
    return {
      flaechen: flaechen.map(([sel, pseudo]) => { const el = document.querySelector(sel); const cs = getComputedStyle(el, pseudo); return { sel: sel + (pseudo || ""), filter: filter(cs), alpha: alpha(cs.backgroundColor) }; }),
      uebergang: getComputedStyle(document.querySelector(".knopf, .chip, .vorschlag")).transitionDuration,
    };
  });
  await page.click('#dialog-info button[value="ok"]');
  const schlecht = r.flaechen.filter((f) => f.filter !== "none" || f.alpha < 1);
  bericht.deckend.push({ name, ...r });
  pruefe(!schlecht.length && r.uebergang.split(",").every((d) => parseFloat(d) === 0),
    `${name}: Glas deckend und ohne Unschärfe (${r.flaechen.map((f) => `${f.sel} ${f.filter === "none" ? "ohne" : f.filter} α${f.alpha}`).join(", ")}), Übergänge ${r.uebergang}`);
}
async function deckend() {
  for (const motor of MOTOREN) for (const schema of SCHEMEN) {
    const ctx = await kontext(motor, { breite: 390, schema, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector(".vorschlag");
    await deckendPruefen(page, `${motor} ${schema === "dark" ? "dunkel" : "hell"}: „Bewegung reduzieren“`);
    await ctx.close();
  }
  if (MOTOREN.includes("chromium")) for (const schema of SCHEMEN) {
    const ctx = await kontext("chromium", { breite: 390, schema });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }, { name: "prefers-color-scheme", value: schema }] });
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector(".vorschlag");
    const greift = await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches);
    if (greift) await deckendPruefen(page, `chromium ${schema === "dark" ? "dunkel" : "hell"}: „Transparenz reduzieren“`);
    else pruefe(false, "Chromium: „Transparenz reduzieren“ lässt sich nicht nachstellen");
    await ctx.close();
  }
  // ohne backdrop-filter: den @supports-not-Block aus style.css unbedingt einspielen (wie ein Browser ohne Glas)
  const css = await readFile(join(WURZEL, "style.css"), "utf8");
  const m = /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*(:root \{[^}]*\})\s*\}/.exec(css);
  pruefe(Boolean(m), "style.css: Rückfall-Block für Browser ohne backdrop-filter vorhanden");
  if (m) for (const motor of MOTOREN) for (const schema of SCHEMEN) {
    const ctx = await kontext(motor, { breite: 390, schema });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector(".vorschlag");
    await page.evaluate((regel) => { const b = [...document.styleSheets].find((s) => (s.href || "").includes("style.css")); b.insertRule(regel, b.cssRules.length); b.insertRule("*, *::before, *::after { transition: none !important; }", b.cssRules.length); }, m[1]);
    await deckendPruefen(page, `${motor} ${schema === "dark" ? "dunkel" : "hell"}: ohne backdrop-filter (Rückfall)`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// G: Grund ohne Kante – Verlauf und Lichtflächen allein, Dither-Muster weggemittelt
// ---------------------------------------------------------------------------
async function grundMessen(page, dsf) {
  const png = await page.screenshot({ type: "png", caret: "initial" });
  return hilfe.evaluate(async ({ b64, dsf }) => {
    const bild = new Image();
    bild.src = `data:image/png;base64,${b64}`;
    await bild.decode();
    const c = document.createElement("canvas");
    c.width = bild.width; c.height = bild.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bild, 0, 0);
    const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
    const n = 8 * dsf; // 8 CSS-Pixel
    // Mittel eines n×n-Blocks ab (x, y)
    const block = (x, y) => { const s = [0, 0, 0]; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = ((y + j) * W + x + i) * 4; s[0] += D[k]; s[1] += D[k + 1]; s[2] += D[k + 2]; } return s.map((v) => v / (n * n)); };
    const ab = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    let sprung = 0, roh = 0;
    for (const f of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      const y = Math.round(H * f), x = Math.round(W * f);
      for (let xx = n; xx + n < W; xx += Math.max(1, dsf)) sprung = Math.max(sprung, ab(block(xx, y), block(xx - n, y)));
      for (let yy = n; yy + n < H; yy += Math.max(1, dsf)) sprung = Math.max(sprung, ab(block(x, yy), block(x, yy - n)));
      for (let xx = 1; xx < W; xx++) { const k = (y * W + xx) * 4; roh = Math.max(roh, Math.abs(D[k] - D[k - 4]), Math.abs(D[k + 1] - D[k - 3]), Math.abs(D[k + 2] - D[k - 2])); }
    }
    return { sprung, roh };
  }, { b64: png.toString("base64"), dsf });
}
async function grund() {
  for (const motor of MOTOREN) for (const schema of SCHEMEN) for (const breite of [390, 768, 1440]) {
    const name = `${motor} ${schema === "dark" ? "dunkel" : "hell"} ${breite}`;
    const ctx = await kontext(motor, { breite, hoehe: breite === 768 ? 1024 : undefined, schema });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/`);
    await page.waitForSelector("#ansicht-chat:not([hidden]) .vorschlag");
    await page.evaluate(() => { const b = [...document.styleSheets].find((s) => (s.href || "").includes("style.css")); b.insertRule("#app, .toasts { visibility: hidden !important; }", b.cssRules.length); });
    await warte(150);
    const dsf = breite < 768 ? 2 : 1;
    const m = await grundMessen(page, dsf);
    // Kontrollkante: rechte Hälfte um etwa 5 Stufen verschoben – muss als Sprung erkannt werden
    await page.evaluate((dunkel) => { const b = [...document.styleSheets].find((s) => (s.href || "").includes("style.css")); b.insertRule(`body::after { content: ""; position: fixed; top: 0; bottom: 0; left: 50%; right: 0; background: ${dunkel ? "rgba(255, 255, 255, 0.025)" : "rgba(0, 0, 0, 0.022)"}; }`, b.cssRules.length); }, schema === "dark");
    await warte(150);
    const k = await grundMessen(page, dsf);
    bericht.grund.push({ name, sprung: r2(m.sprung), roh: m.roh, kontrolle: r2(k.sprung) });
    pruefe(m.sprung <= 3 && k.sprung >= 4,
      `${name}: Grund ohne Kante – größter Sprung zwischen 8×8-Mitteln ${r2(m.sprung)} Stufen (Dither-Muster roh bis ${m.roh}); Kontrollkante erkannt mit ${r2(k.sprung)}`);
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
const start = Date.now();
if (TEILE.includes("A")) for (const motor of MOTOREN) for (const schema of SCHEMEN) for (const breite of BREITEN) await ansichten(motor, schema, breite, {});
if (TEILE.includes("D")) for (const motor of MOTOREN) for (const breite of [320, 768]) await ansichten(motor, "light", breite, { bilder: false, kontrast: false });
if (TEILE.includes("F")) await deckend();
if (TEILE.includes("G")) await grund();
pruefe(!bericht.anfragen.length, `kein Fremd-Request${bericht.anfragen.length ? `: ${[...new Set(bericht.anfragen)].slice(0, 8).join(" | ")}` : " (alle Anfragen an die eigene Adresse)"}`);
await writeFile(join(aus, "messwerte.json"), `${JSON.stringify(bericht, null, 1)}\n`);
for (const b of Object.values(browser)) await b.close();
console.log(`\n${fehler.length ? `✗ ${fehler.length} Prüfungen fehlgeschlagen` : "✓ alle Prüfungen bestanden"} (${Math.round((Date.now() - start) / 1000)} s)`);
process.exit(fehler.length ? 1 : 0);
