// Brain – Physik beim Ziehen (Obsidian-artig): Ein Knoten wird mit der Maus gezogen. Muss gelten: die Nachbarn folgen,
// nach dem Loslassen schwingt es nach, der Graph kommt innerhalb von RUHE_MS zur Ruhe, danach werden 0 Bilder gezeichnet;
// kein Knoten verlässt das Bild, keine Überlagerung bleibt. „Bewegung reduzieren“: nur der gezogene Knoten bewegt sich.
// Chromium + WebKit, 1440 × 900, Hell und Dunkel.
// Voraussetzung: `cd worker && npm run brain` läuft. Nie gegen die Live-Seite.
// Aufruf: PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-physik.mjs [basis-url]
import { zielPruefen } from "./ziel.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Nur lokal."); process.exit(2); }
await zielPruefen(basis, { live: false });
const MOTOREN = (process.env.GABI_MOTOREN || "chromium,webkit").split(",").map((m) => m.trim()).filter(Boolean);
const RUHE_MS = 4000; // so lange darf das Nachschwingen nach dem Loslassen höchstens dauern
const NABE = "s-leistungen";
const ZUG = { x: 150, y: -80 };

const fehler = [];
let n = 0;
const pruefe = (ok, t) => { n++; if (!ok) { fehler.push(t); console.log(`✗ ${t}`); } else console.log(`✓ ${t}`); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const rund = (x) => Math.round(x * 10) / 10;

/** Alle Knoten im Bild: { id → { x, y, r } } in Seitenkoordinaten, dazu das Rechteck der Fläche. */
const lagen = (page) => page.evaluate(() => {
  const a = window.GabiBrainAnsicht.aktuell;
  const f = document.querySelector("canvas.brain-graph-flaeche").getBoundingClientRect();
  const aus = {};
  for (const k of a.brain.knoten()) { const o = a.ort(k.id); if (o) aus[k.id] = { x: o.x, y: o.y, r: o.r }; }
  return { lagen: aus, flaeche: { l: f.left, o: f.top, r: f.right, u: f.bottom } };
});
const messen = (page) => page.evaluate(() => window.GabiBrainAnsicht.aktuell.messen());
const innen = (p, f, rand = 2) => p.x - p.r >= f.l - rand && p.x + p.r <= f.r + rand && p.y - p.r >= f.o - rand && p.y + p.r <= f.u + rand;
/** Paare im Bild, deren Scheiben sich deutlich überdecken (mehr als 20 % der Radien). */
// ohne: diese Kennung zählt nicht (bei „Bewegung reduzieren“ darf nichts ausweichen – wo man den Knoten ablegt, liegt er)
function ueberlagert(l, f, ohne = "") {
  const ids = Object.keys(l).filter((id) => id !== ohne && innen(l[id], f, 0));
  let z = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = l[ids[i]], b = l[ids[j]];
    if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.8) z++;
  }
  return z;
}

async function lauf(browser, motor, schema, reduziert) {
  const name = `${motor} ${schema}${reduziert ? " · Bewegung reduziert" : ""}`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: schema, reducedMotion: reduziert ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} }, configurable: true }); } catch { /* egal */ } });
  const page = await ctx.newPage();
  const konsole = [];
  page.on("pageerror", (e) => konsole.push(e.message));
  await page.goto(`${basis}/?demo=1#/brain`);
  await page.waitForFunction(() => { const m = window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.messen(); return m && m.ruht; }, null, { timeout: 30000 });
  // erst ziehen, wenn alles still ist: Nach dem ersten Ordnen pulsieren die „Zu klären“-Knoten 6 s lang
  await warte(6500);
  const r1 = (await messen(page)).bilder;
  await warte(500);
  pruefe((await messen(page)).bilder === r1, `${name}: vor dem Ziehen ist der Graph still (0 Bilder)`);
  const nachbarn = await page.evaluate((id) => {
    const b = window.GabiBrainAnsicht.aktuell.brain;
    const m = new Set();
    for (const k of b.kanten()) { if (k.von === id) m.add(k.nach); if (k.nach === id) m.add(k.von); }
    return [...m].filter((x) => { const k = b.hol(x); return k && !k.geschuetzt; });
  }, NABE);
  const vor = await lagen(page);
  const ueberVor = ueberlagert(vor.lagen, vor.flaeche);
  const imBildVor = Object.keys(vor.lagen).filter((id) => innen(vor.lagen[id], vor.flaeche));
  const s = vor.lagen[NABE];
  pruefe(Boolean(s) && nachbarn.length >= 4, `${name}: Nabe „${NABE}“ mit ${nachbarn.length} Nachbarn im Bild`);

  // ziehen: 24 Schritte, dann kurz halten
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) { await page.mouse.move(s.x + (ZUG.x * i) / 24, s.y + (ZUG.y * i) / 24); await warte(16); }
  await warte(250);
  const imZug = await lagen(page);
  const mit = nachbarn.filter((id) => vor.lagen[id] && imZug.lagen[id] && Math.hypot(imZug.lagen[id].x - vor.lagen[id].x, imZug.lagen[id].y - vor.lagen[id].y) > 8);
  const gezogen = imZug.lagen[NABE];
  await page.mouse.up();
  const t0 = Date.now();
  // Nachschwingen: kurz nach dem Loslassen bewegen sich Nachbarn noch
  const los = await lagen(page);
  await warte(120);
  const spaeter = await lagen(page);
  const schwingt = nachbarn.some((id) => los.lagen[id] && spaeter.lagen[id] && Math.hypot(spaeter.lagen[id].x - los.lagen[id].x, spaeter.lagen[id].y - los.lagen[id].y) > 0.5);
  // während des Ausschwingens: kein Knoten verlässt das Bild
  let raus = new Set();
  let ruhe = -1;
  while (Date.now() - t0 < RUHE_MS + 1500) {
    const l = await lagen(page);
    for (const id of imBildVor) if (l.lagen[id] && !innen(l.lagen[id], l.flaeche)) raus.add(id);
    if ((await messen(page)).ruht) { ruhe = Date.now() - t0; break; }
    await warte(60);
  }
  await warte(400); // Labels entscheiden 150 ms nach der letzten Bewegung – danach muss es still sein
  const b1 = (await messen(page)).bilder;
  await warte(1500);
  const b2 = (await messen(page)).bilder;
  const nach = await lagen(page);
  for (const id of imBildVor) if (nach.lagen[id] && !innen(nach.lagen[id], nach.flaeche)) raus.add(id);
  const ueberNach = ueberlagert(nach.lagen, nach.flaeche, reduziert ? NABE : "");

  const amZeiger = gezogen && Math.hypot(gezogen.x - (s.x + ZUG.x), gezogen.y - (s.y + ZUG.y)) < 3;
  pruefe(amZeiger, `${name}: der gezogene Knoten hängt am Zeiger (Abweichung ${gezogen ? rund(Math.hypot(gezogen.x - (s.x + ZUG.x), gezogen.y - (s.y + ZUG.y))) : "?"} px)`);
  const fest = nach.lagen[NABE] && Math.hypot(nach.lagen[NABE].x - (s.x + ZUG.x), nach.lagen[NABE].y - (s.y + ZUG.y)) < 3;
  pruefe(fest, `${name}: losgelassen bleibt er, wo er ist`);
  if (reduziert) {
    const andere = Object.keys(vor.lagen).filter((id) => id !== NABE && nach.lagen[id]);
    const bewegt = andere.filter((id) => Math.hypot(nach.lagen[id].x - vor.lagen[id].x, nach.lagen[id].y - vor.lagen[id].y) > 0.5);
    pruefe(mit.length === 0 && bewegt.length === 0, `${name}: keine Federung – kein anderer Knoten bewegt sich (${mit.length} im Zug, ${bewegt.length} danach)`);
  } else {
    pruefe(mit.length >= Math.ceil(nachbarn.length / 2), `${name}: die Nachbarn folgen mit Federung (${mit.length} von ${nachbarn.length} um mehr als 8 px)`);
    pruefe(schwingt, `${name}: nach dem Loslassen schwingt es sanft nach`);
  }
  pruefe(ruhe >= 0 && ruhe <= RUHE_MS, `${name}: kommt nach dem Loslassen zur Ruhe (nach ${ruhe < 0 ? "–" : ruhe} ms, höchstens ${RUHE_MS})`);
  pruefe(b2 === b1, `${name}: in Ruhe 0 gezeichnete Bilder (${b2 - b1} in 1,5 s)`);
  pruefe(raus.size === 0, `${name}: kein Knoten verlässt das Bild (${raus.size}${raus.size ? ": " + [...raus].slice(0, 3).join(", ") : ""})`);
  pruefe(ueberNach <= ueberVor, `${name}: keine Überlagerung bleibt (${ueberNach} Paare, vorher ${ueberVor}${reduziert ? "; ohne den abgelegten Knoten" : ""})`);
  pruefe(konsole.length === 0, `${name}: keine Fehler (${konsole.slice(0, 2).join(" | ")})`);
  await ctx.close();
}

for (const motor of MOTOREN) {
  const browser = await pw[motor].launch();
  try {
    for (const schema of ["light", "dark"]) await lauf(browser, motor, schema, false);
    await lauf(browser, motor, "light", true);
  } finally {
    await browser.close();
  }
}
console.log(`\n${n - fehler.length} von ${n} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot` : "."}`);
for (const f of fehler) console.log(`  ✗ ${f}`);
process.exit(fehler.length ? 1 : 0);
