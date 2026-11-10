// Brain – Labels beim Zoomen: 40 Schritte hinein, 40 heraus; je Label werden die Zustandswechsel (sichtbar ↔ unsichtbar)
// gezählt. Soll: höchstens ein Wechsel pro Richtung. Chromium + WebKit, 1440 px, Hell und Dunkel.
// Aufruf: PLAYWRIGHT_MODUL=… node tests/brain-labels-zoom.mjs [basis-url]   (Server: cd worker && npm run brain)
import { zielPruefen } from "./ziel.mjs";
const pw = await import(process.env.PLAYWRIGHT_MODUL || "playwright");
const [, , basis = "http://localhost:8790"] = process.argv;
if (/gabi\.automatilabs\.de|workers\.dev/.test(basis)) { console.error("Nur lokal."); process.exit(2); }
await zielPruefen(basis, { live: false });
const fehler = []; let n = 0;
const pruefe = (ok, t) => { n++; if (!ok) { fehler.push(t); console.log(`✗ ${t}`); } else console.log(`✓ ${t}`); };
for (const motor of ["chromium", "webkit"]) {
  const browser = await pw[motor].launch();
  for (const schema of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: schema });
    await ctx.addInitScript(() => { try { Object.defineProperty(window, "speechSynthesis", { value: { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} }, configurable: true }); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${basis}/?demo=1#/brain`);
    await page.waitForFunction(() => { const m = window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.messen(); return m && m.ruht; }, null, { timeout: 30000 });
    const f = await page.locator("canvas.brain-graph-flaeche").boundingBox();
    // zoomen um einen Punkt mit vielen Knoten (leicht links der Mitte)
    await page.mouse.move(f.x + f.width * 0.45, f.y + f.height * 0.5);
    // je Schritt: welche Labels stehen, und welche Knoten liegen im Bild (Labels von Knoten, die beim Zoomen aus dem Bild
    // laufen oder hereinkommen, zählen nicht – das ist kein Flackern)
    const stand = () => page.evaluate(() => {
      const a = window.GabiBrainAnsicht.aktuell, r = document.querySelector("#brain-graph-rahmen").getBoundingClientRect();
      const im = a.brain.knoten().map((k) => k.id).filter((id) => { const o = a.ort(id); return o && o.sichtbar && o.x > r.left + 24 && o.x < r.right - 24 && o.y > r.top + 24 && o.y < r.bottom - 24; });
      return { labels: a.messen().labelIds || [], im };
    });
    const verlauf = [], imBild = [];
    const merken = async () => { const x = await stand(); verlauf.push(new Set(x.labels)); imBild.push(new Set(x.im)); };
    const schritt = async (dy) => { await page.mouse.wheel(0, dy); await page.waitForTimeout(40); await merken(); };
    await merken();
    for (let i = 0; i < 40; i++) await schritt(-60);   // hinein
    const wende = verlauf.length - 1;
    for (let i = 0; i < 40; i++) await schritt(60);    // heraus
    const alle = new Set(verlauf.flatMap((s) => [...s]));
    let schlecht = 0; const bsp = [];
    for (const id of alle) {
      let hin = 0, her = 0;
      for (let i = 1; i < verlauf.length; i++) if (imBild[i].has(id) && imBild[i - 1].has(id) && verlauf[i].has(id) !== verlauf[i - 1].has(id)) (i <= wende ? hin++ : her++);
      if (hin > 1 || her > 1) { schlecht++; if (bsp.length < 3) bsp.push(`${id}: ${hin}/${her}`); }
    }
    pruefe(alle.size > 5 && schlecht === 0, `${motor} ${schema}: ${alle.size} Labels, höchstens ein Wechsel pro Richtung (${schlecht} Labels mit mehr${bsp.length ? ": " + bsp.join(", ") : ""})`);
    await ctx.close();
  }
  await browser.close();
}
console.log(`\n${n - fehler.length} von ${n} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot` : "."}`);
process.exit(fehler.length ? 1 : 0);
