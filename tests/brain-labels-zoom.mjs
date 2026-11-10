// Brain – Labels beim Zoomen: 40 schnelle Zoomschritte (Mausrad) hinein und 40 heraus. Pro Schritt wird für jedes Label
// Seite, Text, Deckkraft und Rechteck gelesen. Muss gelten: 0 Seitenwechsel, 0 Textwechsel, 0 überlappende Labels (die
// stehen sollen), 0 Labels, die über den Rand ragen, kein Label länger als 300 ms halbtransparent.
// Chromium + WebKit, 1440 px, Hell und Dunkel.
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
    await page.waitForFunction(() => { const m = window.GabiBrainAnsicht && window.GabiBrainAnsicht.aktuell && window.GabiBrainAnsicht.aktuell.messen(); return m && m.ruht && m.labelInfo && m.labelInfo.length > 5; }, null, { timeout: 30000 });
    const f = await page.locator("canvas.brain-graph-flaeche").boundingBox();
    await page.mouse.move(f.x + f.width * 0.45, f.y + f.height * 0.5);
    const proben = [];
    const messen = async () => proben.push(await page.evaluate(() => { const m = window.GabiBrainAnsicht.aktuell.messen(); return { t: performance.now(), b: m.breite, h: m.hoehe, l: m.labelInfo }; }));
    await messen();
    for (let i = 0; i < 80; i++) { await page.mouse.wheel(0, i < 40 ? -60 : 60); await page.waitForTimeout(30); await messen(); }
    const info = { seite: [], text: [], ueber: 0, rand: 0, halb: [] };
    const letzte = new Map(); const halbSeit = new Map(); let halbMax = 0;
    for (const p of proben) {
      const steht = p.l.filter((x) => x.ziel === 1 && x.a > 0.5);
      for (const x of p.l) {
        const v = letzte.get(x.id);
        if (v && x.ziel === 1 && v.ziel === 1) { if (v.platz !== x.platz) info.seite.push(x.id); if (v.text !== x.text) info.text.push(x.id); }
        letzte.set(x.id, x);
        if (x.a > 0.05 && x.a < 0.95) { if (!halbSeit.has(x.id)) halbSeit.set(x.id, p.t); halbMax = Math.max(halbMax, p.t - halbSeit.get(x.id)); } else halbSeit.delete(x.id);
      }
      for (const x of steht) if (x.x < -0.5 || x.y < -0.5 || x.x + x.w > p.b + 0.5 || x.y + x.h > p.h + 0.5) info.rand++;
      for (let i = 0; i < steht.length; i++) for (let j = i + 1; j < steht.length; j++) {
        const a = steht[i], c = steht[j];
        if (a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y) info.ueber++;
      }
    }
    const ids = new Set(proben.flatMap((p) => p.l.map((x) => x.id)));
    const wo = `${motor} ${schema} (${ids.size} Labels)`;
    pruefe(ids.size > 5, `${wo}: Labels da`);
    pruefe(info.seite.length === 0, `${wo}: 0 Seitenwechsel (${info.seite.length}${info.seite.length ? ": " + [...new Set(info.seite)].slice(0, 3).join(", ") : ""})`);
    pruefe(info.text.length === 0, `${wo}: 0 Textwechsel (${info.text.length})`);
    pruefe(info.ueber === 0, `${wo}: 0 überlappende Label-Rechtecke in jedem Bild (${info.ueber})`);
    pruefe(info.rand === 0, `${wo}: 0 Labels über dem Rand (${info.rand})`);
    pruefe(halbMax <= 300, `${wo}: kein Label länger als 300 ms halbtransparent (längstens ${Math.round(halbMax)} ms)`);
    await ctx.close();
  }
  await browser.close();
}
console.log(`\n${n - fehler.length} von ${n} Prüfungen grün${fehler.length ? ` – ${fehler.length} rot` : "."}`);
process.exit(fehler.length ? 1 : 0);
