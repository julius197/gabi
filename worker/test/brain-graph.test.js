// Brain-Graph ohne Browser: Barnes-Hut, Kraft-Layout, Kamera, Labels, Pfeiltasten-Richtung, Testdaten, Web-Worker-Protokoll.
// Die Zeichnung und die Bedienung prüfen die Browser-Tests (tests/brain.mjs).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const G = require("../../brain-graph.js");
const QUELLE = readFileSync(new URL("../../brain-graph.js", import.meta.url), "utf8");

/** Kleinster Abstand zweier Knoten und größte Überlappung (negativ = Luft) nach dem Layout. */
function abstaende(layout, radius) {
  const p = layout.lagen();
  const n = layout.anzahl;
  let kleinster = Infinity;
  let ueberlappung = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(p[2 * i] - p[2 * j], p[2 * i + 1] - p[2 * j + 1]);
      kleinster = Math.min(kleinster, d);
      ueberlappung = Math.max(ueberlappung, radius(i) + radius(j) - d);
    }
  }
  return { kleinster, ueberlappung };
}
const ring = (n, vorsatz = "k") => ({
  knoten: Array.from({ length: n }, (_, i) => ({ id: `${vorsatz}${String(i).padStart(3, "0")}` })),
  kanten: Array.from({ length: n }, (_, i) => ({ von: `${vorsatz}${String(i).padStart(3, "0")}`, nach: `${vorsatz}${String((i + 1) % n).padStart(3, "0")}` })),
});

describe("Barnes-Hut", () => {
  const punkte = (n, saat) => {
    const z = G.zufall(saat);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) { x[i] = (z() - 0.5) * 1600; y[i] = (z() - 0.5) * 1600; q[i] = -60 - z() * 240; }
    return { x, y, q };
  };
  const fehler = (a, b) => {
    let summe = 0;
    let groesster = 0;
    for (let i = 0; i < a.ax.length; i++) {
      const soll = Math.hypot(b.ax[i], b.ay[i]);
      const f = Math.hypot(a.ax[i] - b.ax[i], a.ay[i] - b.ay[i]) / Math.max(soll, 1e-9);
      summe += f;
      groesster = Math.max(groesster, f);
    }
    return { mittel: summe / a.ax.length, groesster };
  };

  it("weicht bei Theta 0,9 nur wenig von der direkten Summe über alle Paare ab", () => {
    const { x, y, q } = punkte(400, 7);
    const f = fehler(G.abstossung(x, y, q, { theta: 0.9 }), G.abstossungDirekt(x, y, q));
    expect(f.mittel).toBeLessThan(0.03);
    expect(f.groesster).toBeLessThan(0.3);
  });

  it("ist mit Theta 0 exakt (jede Zelle wird geöffnet) und mit kleinerem Theta genauer", () => {
    const { x, y, q } = punkte(200, 3);
    const direkt = G.abstossungDirekt(x, y, q);
    expect(fehler(G.abstossung(x, y, q, { theta: 1e-9 }), direkt).groesster).toBeLessThan(1e-6);
    expect(fehler(G.abstossung(x, y, q, { theta: 0.5 }), direkt).mittel).toBeLessThan(fehler(G.abstossung(x, y, q, { theta: 1.2 }), direkt).mittel);
  });

  it("kommt mit übereinanderliegenden Punkten, einem einzigen und gar keinem Punkt zurecht", () => {
    const x = new Float32Array([5, 5, 5, 5, 40]);
    const y = new Float32Array([9, 9, 9, 9, 9]);
    const q = new Float32Array(5).fill(-100);
    const r = G.abstossung(x, y, q);
    for (let i = 0; i < 5; i++) { expect(Number.isFinite(r.ax[i])).toBe(true); expect(Number.isFinite(r.ay[i])).toBe(true); }
    expect(r.ax[4]).toBeGreaterThan(0); // der rechte Punkt wird nach rechts gedrückt
    // die vier übereinander bekommen verschiedene Stöße (fester kleiner Versatz statt Zufall) – so trennen sie sich
    const stoesse = new Set([0, 1, 2, 3].map((i) => `${r.ax[i].toFixed(3)}/${r.ay[i].toFixed(3)}`));
    expect(stoesse.size).toBe(4);
    expect(Array.from(G.abstossung(x, y, q).ax)).toEqual(Array.from(r.ax)); // und jedes Mal dieselben
    expect(G.abstossung(new Float32Array([1]), new Float32Array([2]), new Float32Array([-50])).ax[0]).toBe(0);
    expect(G.abstossung(new Float32Array(0), new Float32Array(0), new Float32Array(0)).ax).toHaveLength(0);
  });

  it("stößt ab (Kraft zeigt vom Nachbarn weg) und beachtet Mindest- und Höchstabstand", () => {
    const x = new Float32Array([0, 10]);
    const y = new Float32Array([0, 0]);
    const q = new Float32Array([-100, -100]);
    const r = G.abstossung(x, y, q);
    expect(r.ax[0]).toBeLessThan(0);
    expect(r.ax[1]).toBeGreaterThan(0);
    expect(G.abstossung(x, y, q, { abstandMax: 5 }).ax[0]).toBe(0);
    const nah = G.abstossung(new Float32Array([0, 0.01]), y, q, { abstandMin: 4 });
    expect(Math.abs(nah.ax[0])).toBeLessThan(100); // ohne Mindestabstand wären es 10 000
  });
});

describe("Kraft-Layout", () => {
  it("gleiche Eingabe → gleiche Lagen, auch bei anderer Reihenfolge der Knoten und Kanten", () => {
    const d = G.testDaten(120, 5);
    const a = G.erstelleLayout(d);
    a.bisRuhe();
    const b = G.erstelleLayout(JSON.parse(JSON.stringify(d)));
    b.bisRuhe();
    expect(Array.from(b.lagen())).toEqual(Array.from(a.lagen()));
    const gemischt = { knoten: [...d.knoten].reverse(), kanten: [...d.kanten].reverse().map((k) => ({ von: k.nach, nach: k.von })) };
    const c = G.erstelleLayout(gemischt);
    c.bisRuhe();
    expect(c.ids).toEqual(a.ids);
    expect(Array.from(c.lagen())).toEqual(Array.from(a.lagen()));
  });

  it("kommt zur Ruhe: alpha fällt unter die Schwelle, danach bewegt sich nichts mehr", () => {
    const l = G.erstelleLayout(G.testDaten(150, 2));
    expect(l.ruht()).toBe(false);
    const ticks = l.bisRuhe(3000);
    expect(l.ruht()).toBe(true);
    expect(ticks).toBeGreaterThan(100);
    expect(ticks).toBeLessThan(400);
    const vorher = Array.from(l.lagen());
    l.schritt(20);
    expect(Array.from(l.lagen())).toEqual(vorher);
    expect(l.ticks).toBe(ticks);
    for (const w of vorher) expect(Number.isFinite(w)).toBe(true);
  });

  it("trennt Knoten, die übereinander starten", () => {
    const knoten = Array.from({ length: 40 }, (_, i) => ({ id: `u${String(i).padStart(2, "0")}`, x: 0, y: 0 }));
    const l = G.erstelleLayout({ knoten, kanten: [] });
    l.waermen(1);
    l.bisRuhe(3000);
    const r = G.knotenRadius(0);
    const { kleinster, ueberlappung } = abstaende(l, () => r);
    expect(kleinster).toBeGreaterThan(2 * r);
    expect(ueberlappung).toBeLessThan(0);
  });

  it("verbundene Knoten liegen näher beisammen als unverbundene Teile; Naben bekommen Platz", () => {
    const d = G.testDaten(200, 9);
    const l = G.erstelleLayout(d);
    l.bisRuhe();
    const p = l.lagen();
    const lage = (id) => { const i = l.index(id); return [p[2 * i], p[2 * i + 1]]; };
    let kantenSumme = 0;
    for (const k of d.kanten) { const [ax, ay] = lage(k.von); const [bx, by] = lage(k.nach); kantenSumme += Math.hypot(ax - bx, ay - by); }
    const mittelKante = kantenSumme / d.kanten.length;
    let alle = 0;
    let paare = 0;
    for (let i = 0; i < l.anzahl; i += 3) for (let j = i + 1; j < l.anzahl; j += 3) { alle += Math.hypot(p[2 * i] - p[2 * j], p[2 * i + 1] - p[2 * j + 1]); paare++; }
    expect(mittelKante).toBeLessThan(alle / paare / 2.5);
    const grad = new Map(d.knoten.map((k) => [k.id, k.grad]));
    const { ueberlappung } = abstaende(l, (i) => G.knotenRadius(grad.get(l.ids[i])));
    expect(ueberlappung).toBeLessThan(0.5); // keine zwei Scheiben überdecken sich
  });

  it("fixierte Knoten bleiben, wo sie sind – gezogene folgen dem Zeiger und bleiben danach fest", () => {
    const d = ring(12);
    d.knoten[0] = { ...d.knoten[0], x: 300, y: -200, fest: true };
    const l = G.erstelleLayout(d);
    l.waermen(1);
    l.bisRuhe();
    expect(l.lage("k000")).toEqual({ x: 300, y: -200, fest: true });
    l.ziehen("k005", 50, 60);
    expect(l.ruht()).toBe(false); // „lebendig“ gezogen: das Layout bleibt wach
    l.schritt(30);
    expect(l.lage("k005")).toMatchObject({ x: 50, y: 60, fest: true });
    l.loslassen("k005", true);
    l.bisRuhe();
    expect(l.lage("k005")).toMatchObject({ x: 50, y: 60, fest: true });
    expect(l.lage("k000")).toMatchObject({ x: 300, y: -200 });
    // lösen und anstoßen: nur dieser Knoten sucht sich wieder seinen Platz
    const vorher = new Map(l.ids.map((id) => [id, l.lage(id)]));
    l.fixieren("k005", false);
    l.anstossen(["k005"], 0.3);
    expect(l.lokal).toBe(1);
    l.bisRuhe();
    const frei = l.lage("k005");
    expect(frei.fest).toBe(false);
    expect(Math.hypot(frei.x - 50, frei.y - 60)).toBeGreaterThan(1);
    for (const [id, p] of vorher) if (id !== "k005") expect(l.lage(id)).toEqual(p);
  });

  it("„lebendig“ ziehen: nur der Knoten und seine Nachbarn reagieren – der Rest des Bildes steht exakt still", () => {
    const d = G.testDaten(200, 3);
    const l = G.erstelleLayout(d);
    l.bisRuhe();
    const nabe = "t-0001";
    const nachbarn = new Set();
    for (const k of d.kanten) { if (k.von === nabe) nachbarn.add(k.nach); if (k.nach === nabe) nachbarn.add(k.von); }
    const vorher = new Map(l.ids.map((id) => [id, l.lage(id)]));
    const p = l.lage(nabe);
    l.ziehen(nabe, p.x + 90, p.y - 40);
    expect(l.lokal).toBe(nachbarn.size + 1);
    l.schritt(120);
    l.loslassen(nabe, true);
    l.bisRuhe();
    let mitbewegt = 0;
    for (const [id, alt] of vorher) {
      const neu = l.lage(id);
      if (id === nabe) { expect(neu).toMatchObject({ x: p.x + 90, y: p.y - 40, fest: true }); continue; }
      if (nachbarn.has(id)) { if (Math.hypot(neu.x - alt.x, neu.y - alt.y) > 5) mitbewegt++; continue; }
      expect(neu, id).toEqual(alt); // nicht betroffen: Bit für Bit gleich
    }
    expect(mitbewegt).toBeGreaterThan(nachbarn.size / 2); // die Nachbarn kommen mit
  });

  it("ruhig ziehen (Standard der Oberfläche, auch bei „Bewegung reduzieren“): kein Aufwärmen – niemand sonst rührt sich", () => {
    const l = G.erstelleLayout(ring(10));
    l.bisRuhe();
    const vorher = Array.from(l.lagen());
    l.ziehen("k003", 500, 500, { ruhig: true });
    expect(l.ruht()).toBe(true);
    l.schritt(10);
    const danach = Array.from(l.lagen());
    const i = l.index("k003");
    expect([danach[2 * i], danach[2 * i + 1]]).toEqual([500, 500]);
    danach.splice(2 * i, 2);
    vorher.splice(2 * i, 2);
    expect(danach).toEqual(vorher);
    // mitgezogene Blätter setzt die Oberfläche von außen: ohne zu fixieren, ohne aufzuwärmen
    l.versetzen([["k004", 520, 510], ["gibt-es-nicht", 1, 1], ["k005", NaN, 3]]);
    expect(l.lage("k004")).toEqual({ x: 520, y: 510, fest: false });
    expect(l.ruht()).toBe(true);
    l.schritt(5);
    expect(l.lage("k004")).toEqual({ x: 520, y: 510, fest: false });
  });

  it("Was schon liegt, bleibt liegen: kommt ein Knoten dazu, rechnet nur er – und findet einen freien Platz bei seinem Nachbarn", () => {
    const d = G.testDaten(80, 4);
    const l = G.erstelleLayout(d);
    l.bisRuhe();
    const vorher = new Map(l.ids.map((id) => [id, l.lage(id)]));
    const anker = d.knoten[10].id;
    const mehr = { knoten: [...d.knoten, { id: "neu-1" }], kanten: [...d.kanten, { von: "neu-1", nach: anker }] };
    expect(l.aktualisieren(mehr)).toEqual({ neu: 1, geaendert: true });
    for (const [id, p] of vorher) expect(l.lage(id)).toEqual(p); // unverändert übernommen
    expect(l.lokal).toBe(1);
    expect(l.ruht()).toBe(false);
    l.bisRuhe();
    for (const [id, p] of vorher) expect(l.lage(id), id).toEqual(p); // auch nach dem Beruhigen: nichts ist gewandert
    const neu = l.lage("neu-1");
    expect(Math.hypot(neu.x - vorher.get(anker).x, neu.y - vorher.get(anker).y)).toBeLessThan(160);
    for (const [id, p] of vorher) expect(Math.hypot(neu.x - p.x, neu.y - p.y), id).toBeGreaterThan(2 * G.knotenRadius(1)); // liegt auf niemandem
    // derselbe Stand noch einmal: nichts wird aufgewärmt
    expect(l.aktualisieren(mehr)).toEqual({ neu: 0, geaendert: false });
    expect(l.ruht()).toBe(true);
    // neue Kante zwischen bekannten Knoten, ein Knoten fällt weg: nichts bewegt sich
    const ohne = d.knoten[20].id;
    const anders = { knoten: mehr.knoten.filter((k) => k.id !== ohne), kanten: [...mehr.kanten, { von: d.knoten[30].id, nach: d.knoten[40].id }] };
    expect(l.aktualisieren(anders)).toEqual({ neu: 0, geaendert: true });
    expect(l.ruht()).toBe(true);
    expect(l.anzahl).toBe(80);
    for (const [id, p] of vorher) if (id !== ohne) expect(l.lage(id)).toEqual(p);
    expect(l.lage(ohne)).toBeNull();
  });

  it("nach einem leeren Stand ordnet sich ein neuer Graph wieder ganz an (wie beim ersten Mal)", () => {
    const d = G.testDaten(50, 5);
    const erst = G.erstelleLayout(d);
    erst.bisRuhe();
    const l = G.erstelleLayout({ knoten: [], kanten: [] });
    expect(l.ruht()).toBe(true);
    expect(l.aktualisieren(d)).toEqual({ neu: 50, geaendert: true });
    expect(l.alpha).toBe(1);
    expect(l.lokal).toBe(0);
    l.bisRuhe();
    expect(Array.from(l.lagen())).toEqual(Array.from(erst.lagen())); // gleicher Graph, gleiches Bild
  });

  it("kommt ein Knoten dazu, während das ganze Layout noch läuft, rechnen weiter alle (kein Einfrieren mittendrin)", () => {
    const d = G.testDaten(60, 8);
    const l = G.erstelleLayout(d);
    l.schritt(40);
    expect(l.lokal).toBe(0);
    l.aktualisieren({ knoten: [...d.knoten, { id: "neu-1" }], kanten: [...d.kanten, { von: "neu-1", nach: d.knoten[3].id }] });
    expect(l.lokal).toBe(0);
    expect(l.alpha).toBeGreaterThanOrEqual(0.3);
    l.bisRuhe();
    expect(l.ruht()).toBe(true);
  });

  it("gespeicherte Lagen: das Bild steht sofort und exakt – nichts wird nachgewärmt", () => {
    const d = G.testDaten(100, 6);
    const erst = G.erstelleLayout(d);
    erst.bisRuhe();
    const mitLage = { knoten: d.knoten.map((k) => ({ ...k, ...erst.lage(k.id) })), kanten: d.kanten };
    const wieder = G.erstelleLayout(mitLage);
    expect(wieder.alpha).toBe(0);
    expect(wieder.ruht()).toBe(true);
    expect(wieder.bisRuhe()).toBe(0);
    for (const id of erst.ids) expect(wieder.lage(id)).toEqual(erst.lage(id));
    // einige ohne gespeicherte Lage (seit dem letzten Mal dazugekommen): nur sie rechnen
    const teils = { knoten: mitLage.knoten.map((k, i) => (i % 10 === 3 ? { id: k.id } : k)), kanten: d.kanten };
    const lokal = G.erstelleLayout(teils);
    expect(lokal.lokal).toBe(10);
    lokal.bisRuhe();
    teils.knoten.forEach((k) => { if ("x" in k) expect(lokal.lage(k.id)).toMatchObject({ x: Math.fround(k.x), y: Math.fround(k.y) }); });
    // kaum noch Lagen bekannt (veralteter Speicher): dann rechnet das Ganze, die alten Lagen sind nur der Anfang
    const kaum = { knoten: mitLage.knoten.map((k, i) => (i % 10 === 3 ? k : { id: k.id })), kanten: d.kanten };
    const ganz = G.erstelleLayout(kaum);
    expect(ganz.lokal).toBe(0);
    expect(ganz.alpha).toBe(0.5);
  });

  it("Hochformat (Handy): das Bild wächst in die Höhe, im Querformat in die Breite", () => {
    const masse = (seite) => {
      const l = G.erstelleLayout(G.testDaten(150, 2), { seite });
      l.bisRuhe();
      const p = l.lagen();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < p.length; i += 2) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]); }
      return (maxY - minY) / (maxX - minX);
    };
    const hoch = masse(2);
    const quer = masse(0.5);
    expect(hoch).toBeGreaterThan(1.3);
    expect(quer).toBeLessThan(0.8);
    expect(masse(1)).toBeGreaterThan(quer);
    expect(masse(1)).toBeLessThan(hoch);
    expect(masse(99)).toBeCloseTo(hoch, 5); // Unsinn wird begrenzt (0,5–2)
  });

  it("kleine Graphen sind luftiger (Platz für alle Labels), große kompakt", () => {
    const mittel = (n) => {
      const d = G.testDaten(n, 1);
      const l = G.erstelleLayout(d);
      l.bisRuhe();
      let summe = 0;
      for (const k of d.kanten) { const a = l.lage(k.von); const b = l.lage(k.nach); summe += Math.hypot(a.x - b.x, a.y - b.y); }
      return summe / d.kanten.length;
    };
    const klein = mittel(48);
    const gross = G.erstelleLayout(G.testDaten(48, 1), { weite: 1 });
    gross.bisRuhe();
    const d = G.testDaten(48, 1);
    let eng = 0;
    for (const k of d.kanten) { const a = gross.lage(k.von); const b = gross.lage(k.nach); eng += Math.hypot(a.x - b.x, a.y - b.y); }
    expect(klein).toBeGreaterThan(eng / d.kanten.length * 1.25); // derselbe Graph, einmal mit Faktor 1,5 und einmal mit 1
  });

  it("räumt die Eingabe auf: doppelte Knoten, Schleifen, doppelte und hängende Kanten", () => {
    const l = G.erstelleLayout({
      knoten: [{ id: "b" }, { id: "a" }, { id: "a" }, null, { id: "" }, { id: 7 }, { id: "c" }],
      kanten: [{ von: "a", nach: "b" }, { von: "b", nach: "a" }, { von: "a", nach: "a" }, { von: "a", nach: "gibt-es-nicht" }, null],
    });
    expect(l.ids).toEqual(["a", "b", "c"]);
    expect(l.kantenZahl).toBe(1);
    l.bisRuhe();
    expect(l.lage("zzz")).toBeNull();
    const leer = G.erstelleLayout({ knoten: [], kanten: [] });
    expect(leer.bisRuhe()).toBe(0);
    expect(leer.lagen()).toHaveLength(0);
  });

  it("Rechenzeit: 500 Knoten kommen in deutlich unter einer Sekunde zur Ruhe (Messwert im Protokoll)", () => {
    const zeilen = [];
    for (const n of [100, 300, 500]) {
      const d = G.testDaten(n, 1);
      const t0 = performance.now();
      const l = G.erstelleLayout(d);
      const ticks = l.bisRuhe(3000);
      const ms = performance.now() - t0;
      zeilen.push(`${n} Knoten / ${d.kanten.length} Kanten: ${ticks} Ticks in ${ms.toFixed(0)} ms (${(ticks / ms).toFixed(1)} Ticks/ms, ${(ms / ticks).toFixed(3)} ms/Tick)`);
      if (n === 500) {
        expect(ms).toBeLessThan(1500); // grobe Obergrenze – gemessen etwa 60 ms
        expect(ms / ticks).toBeLessThan(6); // ein Tick passt ins Zeitbudget eines Bildes
      }
    }
    console.log(`Layout-Rechenzeit (Node):\n  ${zeilen.join("\n  ")}`);
  });
});

describe("Kamera", () => {
  const K = G.kamera;
  it("Welt ↔ Bild sind Umkehrungen", () => {
    const k = { x: 120, y: -40, zoom: 1.7 };
    const b = K.zuBild(k, 300, 55, 800, 600);
    const w = K.zuWelt(k, b.x, b.y, 800, 600);
    expect(w.x).toBeCloseTo(300, 6);
    expect(w.y).toBeCloseTo(55, 6);
    expect(K.zuBild({ x: 0, y: 0, zoom: 1 }, 0, 0, 800, 600)).toEqual({ x: 400, y: 300 });
  });

  it("Zoom um einen Punkt: der Weltpunkt unter dem Zeiger bleibt stehen; die Grenzen gelten", () => {
    const k = { x: 10, y: 20, zoom: 0.8 };
    const vorher = K.zuWelt(k, 650, 120, 1000, 700);
    const neu = K.zoomUmPunkt(k, 2.5, 650, 120, 1000, 700);
    expect(neu.zoom).toBeCloseTo(2, 6);
    const danach = K.zuWelt(neu, 650, 120, 1000, 700);
    expect(danach.x).toBeCloseTo(vorher.x, 6);
    expect(danach.y).toBeCloseTo(vorher.y, 6);
    expect(K.zoomUmPunkt(k, 1e6, 0, 0, 1000, 700).zoom).toBe(K.ZOOM_MAX);
    expect(K.zoomUmPunkt(k, 1e-6, 0, 0, 1000, 700).zoom).toBe(K.ZOOM_MIN);
  });

  it("Einpassen: alles liegt in der freien Fläche – auch neben einem Panel rechts und über einem Blatt unten", () => {
    const g = { minX: -400, minY: -150, maxX: 600, maxY: 350 };
    for (const verdeckt of [null, { rechts: 380 }, { unten: 300, oben: 60 }, { links: 120, rechts: 200, oben: 30, unten: 90 }]) {
      const k = K.einpassen(g, 1200, 800, { rand: 40, verdeckt });
      const v = { links: 0, rechts: 0, oben: 0, unten: 0, ...(verdeckt || {}) };
      const a = K.zuBild(k, g.minX, g.minY, 1200, 800);
      const b = K.zuBild(k, g.maxX, g.maxY, 1200, 800);
      expect(a.x).toBeGreaterThanOrEqual(v.links + 40 - 0.01);
      expect(a.y).toBeGreaterThanOrEqual(v.oben + 40 - 0.01);
      expect(b.x).toBeLessThanOrEqual(1200 - v.rechts - 40 + 0.01);
      expect(b.y).toBeLessThanOrEqual(800 - v.unten - 40 + 0.01);
      // mittig in der freien Fläche
      expect((a.x + b.x) / 2).toBeCloseTo(v.links + (1200 - v.links - v.rechts) / 2, 4);
      expect((a.y + b.y) / 2).toBeCloseTo(v.oben + (800 - v.oben - v.unten) / 2, 4);
    }
    // ein winziger Graph wird nicht riesig aufgeblasen
    expect(K.einpassen({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1200, 800).zoom).toBe(1.5);
  });
});

describe("Labels", () => {
  it("Titel werden an der Wortgrenze gekürzt", () => {
    expect(G.kuerzen("Praxis Kieslingstraße")).toBe("Praxis Kieslingstraße");
    expect(G.kuerzen("Medizinische Trainingstherapie mit Funktionsdiagnostik", 34)).toBe("Medizinische Trainingstherapie…");
    expect(G.kuerzen("Medizinische Trainingstherapie mit Funktionsdiagnostik", 30)).toHaveLength(30); // passt das Wort nicht mehr: harter Schnitt
    expect(G.kuerzen("  viele    Leerzeichen  ")).toBe("viele Leerzeichen");
    expect(G.kuerzen("Donaudampfschifffahrtsgesellschaftskapitänsmütze", 20)).toBe("Donaudampfschifffah…");
    expect(G.kuerzen(null)).toBe("");
    for (const t of ["a b c d e f g h i j k l m n o p q r s t u v w x y z", "Öffnungszeiten der Praxen selbst – noch zu klären?"]) expect(G.kuerzen(t, 24).length).toBeLessThanOrEqual(24);
  });

  it("Detailstufen: Naben immer, Mittelfeld ab der Übersicht, Blätter erst aus der Nähe", () => {
    const n = 300;
    expect(G.labelSchwelle(20, 0.01, n)).toBe(0);
    expect(G.labelSchwelle(5, 0.1, n)).toBeGreaterThan(0);
    expect(G.labelSchwelle(5, 0.1, n)).toBeLessThan(G.labelSchwelle(2, 0.4, n));
    expect(G.labelSchwelle(2, 0.4, n)).toBeLessThan(G.labelSchwelle(1, 0.9, n));
    // je weiter herausgezoomt, desto weniger Labels – nie mehr
    const d = G.testDaten(n, 3);
    const nachGrad = [...d.knoten].sort((a, b) => b.grad - a.grad);
    const zahl = (zoom) => nachGrad.filter((k, i) => zoom >= G.labelSchwelle(k.grad, i / n, n)).length;
    const reihe = [0.2, 0.6, 1, 1.4, 2].map(zahl);
    expect([...reihe].sort((a, b) => a - b)).toEqual(reihe);
    expect(reihe[0]).toBeGreaterThan(0);
    expect(reihe[0]).toBeLessThan(n / 4);
    expect(reihe[4]).toBe(n);
    // kleiner Graph: schon in der Übersicht alles beschriftet
    expect(G.labelSchwelle(1, 0.9, 20)).toBeLessThanOrEqual(0.5);
  });

  it("Auswahl ohne Überlappung, wichtige zuerst, höchstens so viele wie erlaubt", () => {
    const z = G.zufall(11);
    const kandidaten = Array.from({ length: 300 }, (_, i) => ({ id: `l${String(i).padStart(3, "0")}`, x: z() * 1000, y: z() * 700, r: 6, breite: 60 + z() * 60, vorrang: Math.floor(z() * 20), erzwungen: false }));
    const gesetzt = G.labelsWaehlen(kandidaten, { breite: 1000, hoehe: 700, max: 140 });
    expect(gesetzt.length).toBeGreaterThan(40);
    expect(gesetzt.length).toBeLessThanOrEqual(140);
    for (let i = 0; i < gesetzt.length; i++) {
      for (let j = i + 1; j < gesetzt.length; j++) {
        const a = gesetzt[i];
        const b = gesetzt[j];
        const ueberlappt = a.x < b.x + b.breite && b.x < a.x + a.breite && a.y < b.y + b.hoehe && b.y < a.y + a.hoehe;
        expect(ueberlappt, `${a.id} / ${b.id}`).toBe(false);
      }
    }
    const vorrang = new Map(kandidaten.map((k) => [k.id, k.vorrang]));
    const mittel = (liste) => liste.reduce((s, id) => s + vorrang.get(id), 0) / liste.length;
    const drin = new Set(gesetzt.map((g) => g.id));
    expect(mittel([...drin])).toBeGreaterThan(mittel(kandidaten.filter((k) => !drin.has(k.id)).map((k) => k.id)));
    expect(G.labelsWaehlen(kandidaten, { breite: 1000, hoehe: 700, max: 5 })).toHaveLength(5);
  });

  it("ein Label steht direkt bei seinem Knoten und nie auf einem fremden Knoten", () => {
    const k = { id: "a", x: 400, y: 300, r: 8, breite: 80, vorrang: 1 };
    const [l] = G.labelsWaehlen([k], { breite: 800, hoehe: 600, sperren: [{ x: 400, y: 300, r: 9 }] });
    expect(l.platz).toBe(0); // unten, mittig – der eigene Knoten sperrt es nicht
    expect(l.y).toBeGreaterThanOrEqual(300 + 8);
    expect(l.x + l.breite / 2).toBeCloseTo(400, 6);
    // ein fremder Knoten genau unter dem eigenen: das Label weicht aus
    const [m] = G.labelsWaehlen([k], { breite: 800, hoehe: 600, sperren: [{ x: 400, y: 300, r: 9 }, { x: 400, y: 326, r: 14 }] });
    expect(m.platz).not.toBe(0);
    const trifft = m.x < 414 && m.x + m.breite > 386 && m.y < 340 && m.y + m.hoehe > 312;
    expect(trifft).toBe(false);
  });

  it("Lage wird gemerkt: ein Label bleibt an seinem Platz, solange er frei ist – und Erzwungene kommen immer", () => {
    const merk = new Map([["a", 2]]);
    const k = { id: "a", x: 300, y: 300, r: 6, breite: 70, vorrang: 1 };
    const [oben] = G.labelsWaehlen([k], { breite: 800, hoehe: 600, merk });
    expect(oben.platz).toBe(2);
    expect(oben.y + oben.hoehe).toBeLessThanOrEqual(300 - 6);
    // zwei genau übereinander: der zweite muss woanders hin, merkt sich das und bleibt beim nächsten Bild dort
    const merk2 = new Map();
    const paar = [{ ...k, id: "a", vorrang: 5 }, { ...k, id: "b", vorrang: 1 }];
    const erst = G.labelsWaehlen(paar, { breite: 800, hoehe: 600, merk: merk2 });
    expect(erst.map((l) => l.id)).toEqual(["a", "b"]);
    expect(erst[0].platz).toBe(0);
    expect(erst[1].platz).toBeGreaterThan(0);
    const dann = G.labelsWaehlen([paar[1]], { breite: 800, hoehe: 600, merk: merk2 });
    expect(dann[0].platz).toBe(erst[1].platz); // allein hätte „b“ Platz 0 bekommen – es bleibt, wo es war
    // alles voll, aber erzwungen (Auswahl, Hover, Treffer): trotzdem da
    const voll = Array.from({ length: 12 }, (_, i) => ({ ...k, id: `v${i}`, vorrang: 9 }));
    const ergebnis = G.labelsWaehlen([...voll, { ...k, id: "wichtig", vorrang: 0, erzwungen: true }], { breite: 800, hoehe: 600 });
    expect(ergebnis[0].id).toBe("wichtig");
    expect(ergebnis.length).toBeLessThanOrEqual(7); // sechs Plätze rund um den Knoten
  });
});

describe("Tastatur: Nachbar in Pfeilrichtung", () => {
  const von = { x: 0, y: 0 };
  const rundum = [{ id: "rechts", x: 100, y: 5 }, { id: "links", x: -80, y: -10 }, { id: "oben", x: 10, y: -90 }, { id: "unten", x: -5, y: 120 }];
  it("wählt den Nachbarn in der Richtung (y wächst nach unten, wie im Bild)", () => {
    for (const r of ["rechts", "links", "oben", "unten"]) expect(G.nachbarInRichtung(von, rundum, r)).toBe(r);
  });
  it("bevorzugt nah und geradeaus; außerhalb des Kegels (±60°) zählt nichts", () => {
    expect(G.nachbarInRichtung(von, [{ id: "weit", x: 400, y: 0 }, { id: "nah", x: 90, y: 20 }], "rechts")).toBe("nah");
    expect(G.nachbarInRichtung(von, [{ id: "schraeg", x: 60, y: 55 }, { id: "gerade", x: 75, y: 0 }], "rechts")).toBe("gerade");
    expect(G.nachbarInRichtung(von, [{ id: "hinten", x: -50, y: 0 }, { id: "steil", x: 10, y: 100 }], "rechts")).toBeNull();
    expect(G.nachbarInRichtung(von, [], "rechts")).toBeNull();
    expect(G.nachbarInRichtung(von, rundum, "diagonal")).toBeNull();
    expect(G.nachbarInRichtung(von, [{ id: "selbst", x: 0, y: 0 }], "oben")).toBeNull();
  });
  it("jeder Nachbar ist über mindestens eine Pfeiltaste erreichbar", () => {
    for (let grad = 0; grad < 360; grad += 7) {
      const k = [{ id: "k", x: Math.cos(grad * Math.PI / 180) * 50, y: Math.sin(grad * Math.PI / 180) * 50 }];
      expect(["rechts", "links", "oben", "unten"].some((r) => G.nachbarInRichtung(von, k, r) === "k"), `${grad}°`).toBe(true);
    }
  });
});

describe("Testdaten und Hilfen", () => {
  it("testDaten ist deterministisch, zusammenhängend genug und kennt alle Arten und Zustände", () => {
    const a = G.testDaten(500, 1);
    expect(G.testDaten(500, 1)).toEqual(a);
    expect(G.testDaten(500, 2)).not.toEqual(a);
    expect(a.knoten).toHaveLength(500);
    expect(new Set(a.knoten.map((k) => k.id)).size).toBe(500);
    expect(a.kanten.length).toBeGreaterThan(500);
    const ids = new Set(a.knoten.map((k) => k.id));
    for (const k of a.kanten) { expect(ids.has(k.von) && ids.has(k.nach) && k.von !== k.nach).toBe(true); }
    expect(new Set(a.knoten.map((k) => k.art))).toEqual(new Set(["praxiswissen", "regel", "persona", "patient", "notiz", "bericht", "frage", "vorlage"]));
    expect(new Set(a.knoten.map((k) => k.status))).toEqual(new Set(["bestaetigt", "entwurf", "zu_klaeren"]));
    expect(new Set(a.kanten.map((k) => k.art))).toEqual(new Set(["gehoert_zu", "verweis", "notiz_von", "bericht_zu"]));
    for (const k of a.knoten) if (["patient", "notiz", "bericht"].includes(k.art)) expect(k.geschuetzt).toBe(true);
    const grad = new Map(a.knoten.map((k) => [k.id, 0]));
    for (const k of a.kanten) { grad.set(k.von, grad.get(k.von) + 1); grad.set(k.nach, grad.get(k.nach) + 1); }
    for (const k of a.knoten) expect(k.grad).toBe(grad.get(k.id));
    expect(a.knoten.filter((k) => k.grad === 0).length).toBeLessThan(5);
    for (const n of [1, 2, 100, 300]) expect(G.testDaten(n, 1).knoten).toHaveLength(n);
    // nur erfundene Namen: keine Klarnamen, Patienten nur als Kürzel
    for (const k of a.knoten) if (k.art === "patient") expect(k.titel).toMatch(/^TP-\d+$/);
  });

  it("Hash: stabil, verteilt, ähnliche IDs liegen weit auseinander", () => {
    expect(G.hash32("s-standort-kieslingstrasse")).toBe(G.hash32("s-standort-kieslingstrasse"));
    expect(G.hash32("a")).not.toBe(G.hash32("b"));
    const werte = Array.from({ length: 2000 }, (_, i) => G.einheit(`t-${i}`));
    const viertel = [0, 0, 0, 0];
    for (const w of werte) { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThan(1); viertel[Math.floor(w * 4)]++; }
    for (const v of viertel) expect(v).toBeGreaterThan(400);
  });

  it("Knotengröße wächst mit dem Grad und ist gedeckelt", () => {
    expect(G.knotenRadius(0)).toBe(G.LAYOUT_STANDARD.radiusBasis);
    expect(G.knotenRadius(4)).toBeGreaterThan(G.knotenRadius(1));
    expect(G.knotenRadius(10000)).toBe(G.LAYOUT_STANDARD.radiusMax);
    expect(G.knotenRadius(-3)).toBe(G.LAYOUT_STANDARD.radiusBasis);
  });
});

describe("Web Worker (dieselbe Datei rechnet dort nur das Layout)", () => {
  /** Nachgebauter Worker-Rahmen: postMessage sammelt, onmessage wird von Hand gefüttert. */
  function worker() {
    const post = [];
    const w = { postMessage: (d, uebertragen) => post.push({ d, uebertragen }) };
    G.workerStarten(w);
    return { w, post, sende: (d) => w.onmessage({ data: d }) };
  }

  it("Start: erst „bereit“ mit den IDs in Rechenreihenfolge, dann ein Bild – und danach Stille bis zum „ack“", () => {
    const { post, sende } = worker();
    const d = G.testDaten(60, 1);
    sende({ typ: "start", nr: 1, knoten: d.knoten.map((k) => ({ id: k.id })), kanten: d.kanten, optionen: null, sofort: false });
    expect(post.map((p) => p.d.typ)).toEqual(["bereit", "lagen"]);
    expect(post[0].d.ids).toEqual([...d.knoten.map((k) => k.id)].sort());
    const bild = post[1].d;
    expect(bild.nr).toBe(1);
    expect(bild.puffer).toBeInstanceOf(Float32Array);
    expect(bild.puffer).toHaveLength(120);
    expect(post[1].uebertragen).toEqual([bild.puffer.buffer]); // übertragen, nicht kopiert
    expect(bild.alpha).toBeLessThanOrEqual(0.36); // die unruhige erste Phase ist vorgerechnet
    expect(bild.ruht).toBe(false);
    // Rückstau-Schutz: ohne Quittung kommt nichts nach – egal, was sonst ankommt
    sende({ typ: "waerme", nr: 1, alpha: 0.5 });
    sende({ typ: "weiter", nr: 1 });
    expect(post).toHaveLength(2);
  });

  it("jedes „ack“ löst genau ein weiteres Bild aus, bis das Layout ruht; der zurückgegebene Puffer wird wiederverwendet", () => {
    const { post, sende } = worker();
    const d = G.testDaten(40, 2);
    sende({ typ: "start", nr: 7, knoten: d.knoten.map((k) => ({ id: k.id })), kanten: d.kanten });
    let runden = 0;
    let letzter = post[post.length - 1].d;
    const puffer = new Set();
    while (!letzter.ruht && runden < 2000) {
      const vorher = post.length;
      sende({ typ: "ack", nr: 7, puffer: letzter.puffer });
      expect(post.length).toBe(vorher + 1);
      letzter = post[post.length - 1].d;
      puffer.add(letzter.puffer);
      runden++;
    }
    expect(letzter.ruht).toBe(true);
    expect(runden).toBeGreaterThan(20);
    expect(runden).toBeLessThan(300);
    expect(puffer.size).toBeLessThanOrEqual(2);
    // in Ruhe: auch nach einer Quittung kein Bild mehr
    const stand = post.length;
    sende({ typ: "ack", nr: 7, puffer: letzter.puffer });
    expect(post.length).toBe(stand);
  });

  it("„sofort“ (Bewegung reduzieren): bis zur Ruhe rechnen und genau ein fertiges Bild schicken", () => {
    const { post, sende } = worker();
    const d = G.testDaten(80, 3);
    sende({ typ: "start", nr: 1, knoten: d.knoten.map((k) => ({ id: k.id })), kanten: d.kanten, sofort: true });
    expect(post.map((p) => p.d.typ)).toEqual(["bereit", "lagen"]);
    expect(post[1].d.ruht).toBe(true);
    sende({ typ: "ack", nr: 1, puffer: post[1].d.puffer });
    expect(post).toHaveLength(2);
  });

  it("Ziehen weckt das ruhende Layout, Loslassen lässt es wieder zur Ruhe kommen; alte Nachrichten zählen nicht", () => {
    const { post, sende } = worker();
    const d = G.testDaten(30, 4);
    sende({ typ: "start", nr: 3, knoten: d.knoten.map((k) => ({ id: k.id })), kanten: d.kanten, sofort: true });
    sende({ typ: "ack", nr: 3, puffer: post[1].d.puffer });
    const ids = post[0].d.ids;
    const stand = post.length;
    sende({ typ: "zieh", nr: 2, id: ids[5], x: 111, y: 222 }); // gehört zu einem älteren Datenstand
    expect(post.length).toBe(stand);
    sende({ typ: "zieh", nr: 3, id: ids[5], x: 111, y: 222 });
    expect(post.length).toBe(stand + 1);
    let bild = post[post.length - 1].d;
    expect([bild.puffer[10], bild.puffer[11]]).toEqual([111, 222]);
    expect(bild.ruht).toBe(false);
    sende({ typ: "los", nr: 3, id: ids[5], fest: true });
    for (let i = 0; i < 600 && !bild.ruht; i++) { sende({ typ: "ack", nr: 3, puffer: bild.puffer }); bild = post[post.length - 1].d; }
    expect(bild.ruht).toBe(true);
    expect([bild.puffer[10], bild.puffer[11]]).toEqual([111, 222]); // bleibt fixiert
    // „ruhig“ gezogen: kein Bild, kein Aufwärmen – erst das Loslassen meldet genau einen (ruhenden) Stand zurück
    sende({ typ: "ack", nr: 3, puffer: bild.puffer });
    const still = post.length;
    sende({ typ: "zieh", nr: 3, id: ids[6], x: 5, y: 5, ruhig: true });
    expect(post.length).toBe(still);
    sende({ typ: "los", nr: 3, id: ids[6], fest: true });
    expect(post.length).toBe(still + 1);
    bild = post[post.length - 1].d;
    expect(bild.ruht).toBe(true);
    expect([bild.puffer[12], bild.puffer[13]]).toEqual([5, 5]);
    sende({ typ: "ack", nr: 3, puffer: bild.puffer });
    expect(post.length).toBe(still + 1);
    const vorher = post.length;
    // Pause: nichts rechnen, bis es weitergeht
    sende({ typ: "pause", nr: 3 });
    sende({ typ: "waerme", nr: 3, alpha: 0.4 });
    expect(post.length).toBe(vorher);
    sende({ typ: "weiter", nr: 3 });
    expect(post.length).toBe(vorher + 1);
  });

  it("„neu“ (neuer Datenstand): der Worker behält seine Lagen, nur der neue Knoten rechnet; „lage“ setzt Lagen von außen", () => {
    const { post, sende } = worker();
    const d = G.testDaten(40, 5);
    sende({ typ: "start", nr: 1, knoten: d.knoten.map((k) => ({ id: k.id })), kanten: d.kanten, sofort: true });
    const ids = post[0].d.ids;
    const ruhe = Array.from(post[1].d.puffer);
    sende({ typ: "ack", nr: 1, puffer: post[1].d.puffer });
    sende({ typ: "neu", nr: 2, knoten: [...d.knoten.map((k) => ({ id: k.id })), { id: "zz-neu" }], kanten: [...d.kanten, { von: "zz-neu", nach: ids[4] }] });
    let bild = post[post.length - 1].d;
    expect(bild).toMatchObject({ typ: "lagen", nr: 2, ruht: false });
    expect(bild.puffer).toHaveLength(82);
    expect(Array.from(bild.puffer.slice(0, 80))).toEqual(ruhe); // „zz-neu“ sortiert sich hinten ein: die 40 alten stehen unverändert
    for (let i = 0; i < 600 && !bild.ruht; i++) { sende({ typ: "ack", nr: 2, puffer: bild.puffer }); bild = post[post.length - 1].d; }
    expect(bild.ruht).toBe(true);
    expect(Array.from(bild.puffer.slice(0, 80))).toEqual(ruhe);
    // alte Quittungen (nr 1) zählen nicht mehr
    const stand = post.length;
    sende({ typ: "ack", nr: 1 });
    expect(post.length).toBe(stand);
    // Lagen von außen (mitgezogene Blätter): kein Bild nötig, beim nächsten Stand sind sie drin
    sende({ typ: "ack", nr: 2, puffer: bild.puffer });
    sende({ typ: "lage", nr: 2, lagen: [[ids[0], 7, 9]] });
    expect(post.length).toBe(stand);
    const gleicherStand = { knoten: [...d.knoten.map((k) => ({ id: k.id })), { id: "zz-neu" }], kanten: [...d.kanten, { von: "zz-neu", nach: ids[4] }] };
    sende({ typ: "neu", nr: 3, ...gleicherStand });
    bild = post[post.length - 1].d;
    expect(bild).toMatchObject({ nr: 3, ruht: true }); // nichts Neues: das Bild steht
    expect([bild.puffer[0], bild.puffer[1]]).toEqual([7, 9]);
    expect(Array.from(bild.puffer.slice(2, 80))).toEqual(ruhe.slice(2));
  });
});

describe("Quelltext: läuft unter der strengen CSP und ohne Bibliothek", () => {
  it("kein eval, kein Inline-Stil in HTML-Strings, kein innerHTML, keine fremden Adressen, kein Netz", () => {
    expect(QUELLE).not.toMatch(/\beval\s*\(|new Function\s*\(/);
    expect(QUELLE).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    expect(QUELLE).not.toMatch(/style\s*=\s*["'`]/);
    expect(QUELLE).not.toMatch(/https?:\/\//);
    expect(QUELLE).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|importScripts\s*\(/);
    expect(QUELLE).not.toMatch(/\brequire\s*\(|\bimport\s+/);
    expect(QUELLE).not.toMatch(/alpha:\s*false/); // sonst werden runde Ecken bei doppelter Pixeldichte schwarz
    expect(QUELLE).not.toMatch(/console\.(log|info|debug)/); // nichts aus dem Brain landet in Logs
  });

  it("Worker-Modus: dieselbe Datei startet dort nur das Layout (kein Dokument nötig)", () => {
    expect(QUELLE).toMatch(/typeof document === "undefined" && typeof importScripts === "function"/);
    expect(typeof G.workerStarten).toBe("function");
    expect(typeof G.erstelle).toBe("function");
  });

  it("Farben für alle acht Arten, deutsche Namen für Hilfstechnik", () => {
    const arten = ["praxiswissen", "regel", "persona", "patient", "notiz", "bericht", "frage", "vorlage"];
    expect(Object.keys(G.FARBEN_STANDARD.arten).sort()).toEqual([...arten].sort());
    expect(Object.keys(G.ART_NAMEN).sort()).toEqual([...arten].sort());
    expect(G.STATUS_NAMEN).toEqual({ bestaetigt: "bestätigt", entwurf: "Entwurf", zu_klaeren: "zu klären" });
    // Kontrast der Ersatzfarben zum hellen Hintergrund ≥ 3 : 1 (Knoten sind Bedienelemente)
    const lum = (hex) => {
      const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const kontrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const a of arten) expect(kontrast(G.FARBEN_STANDARD.arten[a], G.FARBEN_STANDARD.hintergrund), a).toBeGreaterThanOrEqual(3);
  });
});
