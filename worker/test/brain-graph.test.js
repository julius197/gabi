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

  it("„lebendig“ ziehen: Knoten bis zwei Kanten weit reagieren – der Rest des Bildes steht exakt still", () => {
    const d = G.testDaten(200, 3);
    const l = G.erstelleLayout(d);
    l.bisRuhe();
    const nabe = "t-0001";
    const nachbarnVon = (id) => { const m = new Set(); for (const k of d.kanten) { if (k.von === id) m.add(k.nach); if (k.nach === id) m.add(k.von); } return m; };
    const nah = nachbarnVon(nabe);
    const reichweite = new Set([nabe, ...nah]);
    for (const id of nah) for (const j of nachbarnVon(id)) reichweite.add(j);
    const vorher = new Map(l.ids.map((id) => [id, l.lage(id)]));
    const p = l.lage(nabe);
    l.ziehen(nabe, p.x + 90, p.y - 40);
    expect(l.lokal).toBe(reichweite.size);
    l.schritt(120);
    l.loslassen(nabe, true);
    l.bisRuhe();
    let mitbewegt = 0;
    for (const [id, alt] of vorher) {
      const neu = l.lage(id);
      if (id === nabe) { expect(neu).toMatchObject({ x: p.x + 90, y: p.y - 40, fest: true }); continue; }
      if (reichweite.has(id)) { if (nah.has(id) && Math.hypot(neu.x - alt.x, neu.y - alt.y) > 5) mitbewegt++; continue; }
      expect(neu, id).toEqual(alt); // nicht betroffen: Bit für Bit gleich
    }
    expect(mitbewegt).toBeGreaterThan(nah.size / 2); // die Nachbarn kommen mit
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

  // Prüfrunde 1, Fund 1: Am Handy deckt das Blatt die Fläche zu – „verdeckt“ war größer als die Fläche selbst
  it("verdeckte Ränder zählen nur, wenn daneben genug frei bleibt – sonst fiele das Bild auf den kleinsten Zoom zusammen", () => {
    const null4 = { links: 0, rechts: 0, oben: 0, unten: 0, einpassen: true };
    // Handy 390 × 844: Fläche 358 × 380, das Blatt meldete 460 px (mehr als die Fläche hoch ist)
    expect(K.freieRaender({ unten: 460 }, 358, 380)).toEqual(null4);
    expect(K.freieRaender({ unten: 300 }, 358, 380)).toEqual(null4); // nur 80 px frei: zu wenig
    expect(K.freieRaender({ rechts: 300, links: 20 }, 420, 600)).toEqual(null4); // auch in der Breite
    expect(K.FREI_MIN).toBe(120);
    // genug frei: Die Ränder gelten – am Laptop neben dem Panel, am Handy über dem Blatt (dort nur für den Blick auf einen Knoten)
    expect(K.freieRaender({ rechts: 420 }, 1104, 673)).toEqual({ links: 0, rechts: 420, oben: 0, unten: 0, einpassen: true });
    expect(K.freieRaender({ oben: 0, unten: 129, einpassen: false }, 358, 380)).toEqual({ links: 0, rechts: 0, oben: 0, unten: 129, einpassen: false });
    // kaputte Angaben schaden nicht
    expect(K.freieRaender(null, 800, 600)).toEqual(null4);
    expect(K.freieRaender({ links: -5, rechts: NaN, oben: "x", unten: Infinity }, 800, 600)).toEqual(null4);
    // die Folge fürs Einpassen: mit dem rohen Wert fällt das Bild auf den kleinsten Zoom zusammen und liegt über dem oberen
    // Rand (Mitte der „freien“ Fläche bei −40 px) – mit den geprüften Rändern füllt es die Fläche
    const g = { minX: -300, minY: -480, maxX: 300, maxY: 480 };
    const roh = K.einpassen(g, 358, 380, { rand: 28, verdeckt: { unten: 460 } });
    const gut = K.einpassen(g, 358, 380, { rand: 28, verdeckt: K.freieRaender({ unten: 460 }, 358, 380) });
    expect(roh.zoom).toBe(K.ZOOM_MIN);
    expect(K.zuBild(roh, 0, 0, 358, 380).y).toBeCloseTo(-40, 6);
    expect(gut.zoom).toBeCloseTo((380 - 56) / 960, 6);
    expect(gut.zoom).toBeGreaterThan(roh.zoom * 3);
    const oben = K.zuBild(gut, 0, -480, 358, 380);
    const unten = K.zuBild(gut, 0, 480, 358, 380);
    expect(oben.y).toBeGreaterThanOrEqual(28 - 0.01); // alles in der Fläche – nichts fliegt über den oberen Rand hinaus
    expect(unten.y).toBeLessThanOrEqual(380 - 28 + 0.01);
  });

  it("im Freien: innerhalb der freien Fläche mit Abstand zum Rand – in einem schmalen Streifen mit weniger", () => {
    const frei = K.freieRaender({ rechts: 420 }, 1104, 673);
    expect(K.imFreien({ x: 300, y: 300 }, 1104, 673, frei)).toBe(true);
    expect(K.imFreien({ x: 700, y: 300 }, 1104, 673, frei)).toBe(false); // unter dem Panel (ab 684)
    expect(K.imFreien({ x: 650, y: 300 }, 1104, 673, frei)).toBe(false); // sichtbar, aber näher als 56 px am Panel
    expect(K.imFreien({ x: 650, y: 300 }, 1104, 673, frei, 12)).toBe(true); // … mit kleinem Abstand zählt er als sichtbar
    expect(K.imFreien({ x: 20, y: 300 }, 1104, 673, frei)).toBe(false);
    // Streifen über dem Blatt am Handy: 251 px hoch – der Abstand ist höchstens ein Viertel davon
    const streifen = K.freieRaender({ unten: 129, einpassen: false }, 358, 380);
    expect(K.imFreien({ x: 179, y: 125 }, 358, 380, streifen)).toBe(true);
    expect(K.imFreien({ x: 179, y: 245 }, 358, 380, streifen, 12)).toBe(false); // 6 px über dem Blatt: zu knapp
    expect(K.imFreien({ x: 179, y: 300 }, 358, 380, streifen, 12)).toBe(false); // unter dem Blatt
    const niedrig = K.freieRaender({ unten: 250, einpassen: false }, 358, 380); // 130 px Streifen
    expect(K.imFreien({ x: 179, y: 65 }, 358, 380, niedrig)).toBe(true); // 56 px Abstand wären hier nie zu erfüllen
  });

  it("gleiche Kamera: Unterschiede unter einem Zwanzigstel Pixel zählen nicht", () => {
    const k = { x: 12, y: -7, zoom: 0.8 };
    expect(K.gleich(k, { ...k })).toBe(true);
    expect(K.gleich(k, { x: 12.01, y: -7, zoom: 0.8 })).toBe(true);
    expect(K.gleich(k, { x: 13, y: -7, zoom: 0.8 })).toBe(false);
    expect(K.gleich(k, { x: 12, y: -7, zoom: 0.81 })).toBe(false);
    expect(K.gleich(k, null)).toBe(false);
  });
});

// Prüfrunde 1, Fund 5: „Alles zeigen“ ließ Knoten unter Minimap und Legende liegen
describe("Kamera weicht Bedienelementen aus (Minimap, Legende, Knöpfe)", () => {
  const K = G.kamera;
  const B = 1104;
  const H = 673;
  const radius = (r, zoom) => r * zoom;
  const karte = { x: 922, y: 547, breite: 168, hoehe: 112 };   // Minimap unten rechts
  const legende = { x: 14, y: 495, breite: 257, hoehe: 164 };  // offene Legende unten links
  const knoepfe = { x: 14, y: 14, breite: 44, hoehe: 164 };
  /** Liegt die Scheibe eines Punkts (plus Luft) über einem Bedienelement? */
  const darunter = (kamera, punkte, dinge, luft = 0) => punkte.filter((p) => {
    const b = K.zuBild(kamera, p.x, p.y, B, H);
    const r = radius(p.r, kamera.zoom) + luft;
    return dinge.some((d) => { const qx = Math.max(d.x, Math.min(b.x, d.x + d.breite)); const qy = Math.max(d.y, Math.min(b.y, d.y + d.hoehe)); return Math.hypot(b.x - qx, b.y - qy) < r; });
  }).length;
  const imRahmen = (kamera, punkte, rand) => punkte.every((p) => { const b = K.zuBild(kamera, p.x, p.y, B, H); const r = radius(p.r, kamera.zoom); return b.x - r >= rand - 0.01 && b.x + r <= B - rand + 0.01 && b.y - r >= rand - 0.01 && b.y + r <= H - rand + 0.01; });
  /** Punktwolke wie ein eingepasster Graph: eine Raute (die Ecken der Fläche bleiben frei), dazu lose Teile. */
  const wolke = (lose = []) => {
    const z = G.zufall(5);
    const punkte = [{ x: -460, y: 0, r: 7 }, { x: 460, y: 0, r: 7 }, { x: 0, y: -240, r: 7 }, { x: 0, y: 240, r: 7 }];
    while (punkte.length < 60) { const x = (z() * 2 - 1) * 460; const y = (z() * 2 - 1) * 240; if (Math.abs(x) / 460 + Math.abs(y) / 240 <= 1) punkte.push({ x, y, r: 7 }); }
    for (const e of lose) punkte.push({ ...e, r: 7 });
    return punkte;
  };
  const grenzen = (punkte) => ({ minX: Math.min(...punkte.map((p) => p.x - p.r)), minY: Math.min(...punkte.map((p) => p.y - p.r)), maxX: Math.max(...punkte.map((p) => p.x + p.r)), maxY: Math.max(...punkte.map((p) => p.y + p.r)) });

  it("liegt nichts darunter, bleibt die Kamera genau, wie sie ist", () => {
    const punkte = wolke();
    const start = K.einpassen(grenzen(punkte), B, H, { rand: 56 });
    expect(darunter(start, punkte, [karte, legende, knoepfe])).toBe(0);
    expect(K.ausweichen(start, punkte, B, H, { hindernisse: [karte, legende, knoepfe], radius })).toBe(start);
    expect(K.ausweichen(start, punkte, B, H, { hindernisse: [], radius })).toBe(start);
    expect(K.ausweichen(start, [], B, H, { hindernisse: [karte], radius })).toBe(start);
  });

  it("ein Knoten unter der Minimap: Das Bild rückt – der Zoom bleibt (lieber verschieben als verkleinern)", () => {
    const punkte = wolke([{ x: 356, y: 210 }]); // loses Teil unten rechts: im Bild bei (930, 560), also knapp unter der Minimap
    const start = K.einpassen(grenzen(punkte), B, H, { rand: 56 });
    expect(darunter(start, punkte, [karte])).toBeGreaterThan(0);
    const ziel = K.ausweichen(start, punkte, B, H, { hindernisse: [karte, legende, knoepfe], rand: 16, randUnten: 32, radius });
    expect(ziel.zoom).toBe(start.zoom);
    expect(K.gleich(ziel, start)).toBe(false);
    expect(darunter(ziel, punkte, [karte, legende, knoepfe], 4)).toBe(0); // mit Luft drumherum
    expect(imRahmen(ziel, punkte, 16)).toBe(true); // und nichts rutscht aus dem Bild
    // gleiches Bild → gleiches Ergebnis
    expect(K.ausweichen(start, punkte, B, H, { hindernisse: [karte, legende, knoepfe], rand: 16, randUnten: 32, radius })).toEqual(ziel);
    // die kleinste Verschiebung, die genügt – kein Sprung quer durchs Bild
    const a = K.zuBild(start, 0, 0, B, H);
    const b = K.zuBild(ziel, 0, 0, B, H);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(60);
  });

  it("reicht Verschieben nicht (Knoten unter Minimap UND Legende, kein Spielraum nach oben), wird schrittweise verkleinert – nie stark", () => {
    const punkte = wolke([{ x: 470, y: 250 }, { x: -470, y: 250 }, { x: 0, y: -245 }, { x: 0, y: 250 }]);
    const start = K.einpassen(grenzen(punkte), B, 560, { rand: 56 });
    const dinge = [{ ...karte, y: 434 }, { ...legende, y: 382 }];
    const unter = (kamera) => punkte.filter((p) => { const q = K.zuBild(kamera, p.x, p.y, B, 560); const r = radius(p.r, kamera.zoom) + 4; return dinge.some((d) => Math.hypot(q.x - Math.max(d.x, Math.min(q.x, d.x + d.breite)), q.y - Math.max(d.y, Math.min(q.y, d.y + d.hoehe))) < r); }).length;
    expect(unter(start)).toBeGreaterThan(0);
    const ziel = K.ausweichen(start, punkte, B, 560, { hindernisse: dinge, rand: 16, randUnten: 32, radius });
    expect(unter(ziel)).toBe(0);
    expect(ziel.zoom).toBeLessThan(start.zoom);
    expect(ziel.zoom).toBeGreaterThan(start.zoom * 0.5);
  });

  it("keine Lösung (ein Element über der ganzen Fläche): Die Kamera bleibt – nichts wird ins Winzige verkleinert", () => {
    const punkte = wolke();
    const start = K.einpassen(grenzen(punkte), B, H, { rand: 56 });
    expect(K.ausweichen(start, punkte, B, H, { hindernisse: [{ x: 0, y: 0, breite: B, hoehe: H }], radius })).toBe(start);
  });

  it("was selbst im Verdeckten liegt, zählt nicht – und der Rand der freien Fläche gilt (Panel rechts)", () => {
    const punkte = wolke([{ x: 356, y: 210 }]);
    const frei = { links: 0, oben: 0, rechts: B - 420, unten: H };
    const start = K.einpassen(grenzen(punkte), B, H, { rand: 56, verdeckt: { rechts: 420 } });
    // die Minimap an ihrem alten Platz liegt jetzt unter dem Panel: kein Grund zu rücken
    expect(K.ausweichen(start, punkte, B, H, { hindernisse: [karte], frei, radius })).toBe(start);
    // neben das Panel gerückt (wie in der Ansicht) liegt wieder ein Knoten darunter: Das Bild weicht aus und bleibt links vom Panel
    const karteNeu = { ...karte, x: 922 - 434 };
    const ziel = K.ausweichen(start, punkte, B, H, { hindernisse: [karteNeu], frei, rand: 16, randUnten: 32, radius });
    expect(darunter(ziel, punkte, [karteNeu], 4)).toBe(0);
    expect(punkte.every((p) => K.zuBild(ziel, p.x, p.y, B, H).x + radius(p.r, ziel.zoom) <= B - 420 - 16 + 0.01)).toBe(true);
  });

  it("500 Knoten: schnell genug, um beim Einpassen nicht zu stören", () => {
    const d = G.testDaten(500, 7);
    const layout = G.erstelleLayout(d);
    layout.bisRuhe(1500);
    const lagen = layout.lagen();
    const punkte = layout.ids.map((id, i) => ({ x: lagen[2 * i], y: lagen[2 * i + 1], r: 7 }));
    const start = K.einpassen(grenzen(punkte), B, H, { rand: 56 });
    const t0 = performance.now();
    const ziel = K.ausweichen(start, punkte, B, H, { hindernisse: [karte, legende, knoepfe], rand: 16, randUnten: 32, radius: (r, zoom) => Math.max(2.4, r * Math.pow(zoom, 0.85)) });
    const ms = performance.now() - t0;
    console.log(`Ausweichen mit 500 Knoten: ${ms.toFixed(1)} ms, Zoom ${start.zoom.toFixed(3)} → ${ziel.zoom.toFixed(3)}`);
    expect(ms).toBeLessThan(120);
    expect(ziel.zoom).toBeGreaterThan(start.zoom * 0.5);
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

describe("Zeichen am Knoten und Trefferflächen", () => {
  // Prüfrunde 1, Fund 7: Das Schloss hing am Zoom (≥ 0,95) – in der Standardansicht üblicher Fenster fehlte es an allen
  it("Schloss: hängt nicht am Zoom, wächst mit dem Knoten – klein in der Übersicht, voll ab 6 px, an den kleinsten Punkten gar nicht", () => {
    expect(G.schlossMass.length).toBe(1); // nur der Radius im Bild zählt
    expect(G.schlossMass(6)).toEqual({ groesse: 1, deckkraft: 1 });
    expect(G.schlossMass(9.5)).toEqual({ groesse: 1, deckkraft: 1 });
    // Standardansicht 1440 × 790 (Zoom 0,87): Radien 6,6–8,7 → volles Schloss; 1280 × 720 (Zoom 0,70): Notizen mit 5,4 px
    expect(G.schlossMass(6.6).groesse).toBe(1);
    const notiz = G.schlossMass(5.4);
    expect(notiz.deckkraft).toBe(1);
    expect(notiz.groesse).toBeGreaterThan(0.8);
    expect(notiz.groesse).toBeLessThan(1);
    // 1024 × 768 (Zoom 0,49): 4,1 px – verkleinert, aber da
    expect(G.schlossMass(4.1).deckkraft).toBe(1);
    expect(G.schlossMass(4.1).groesse).toBeGreaterThan(0.6);
    // je kleiner der Knoten, desto kleiner und zarter – nie größer als am größeren Knoten
    const reihe = [2.4, 2.8, 3.1, 3.5, 4.1, 5, 5.4, 6.2, 7.2, 12].map(G.schlossMass);
    for (let i = 1; i < reihe.length; i++) {
      expect(reihe[i].groesse).toBeGreaterThanOrEqual(reihe[i - 1].groesse);
      expect(reihe[i].deckkraft).toBeGreaterThanOrEqual(reihe[i - 1].deckkraft);
    }
    expect(G.schlossMass(2.4).deckkraft).toBe(0); // kleinster Punkt: kein Zeichen, das größer wäre als der Knoten
    expect(G.schlossMass(3.3).deckkraft).toBeGreaterThan(0.5); // Handy-Übersicht: schon gut zu sehen
    expect(Math.min(...reihe.map((m) => m.groesse))).toBeGreaterThanOrEqual(0.5);
    // im Zeichner steht keine Zoom-Schwelle mehr vor dem Schloss
    expect(QUELLE).not.toMatch(/geschuetzt\s*&&\s*z\s*>=/);
    expect(QUELLE).toMatch(/schlossZeichnen\(x \+ r \* 0\.74, y \+ r \* 0\.74, a \* m\.deckkraft, m\.groesse\)/);
  });

  // Prüfrunde 1, Fund 3: Am Handy startete jeder Wisch im 22-px-Umkreis eines Knotens das Ziehen (und setzte ihn fest)
  it("Trefferfläche: Finger tippen großzügig (44 px), ziehen sofort nur auf dem Knoten selbst – für die Maus bleibt alles", () => {
    // Maus: wie bisher Radius + 5, egal ob Klick oder Ziehen
    for (const r of [2.4, 3.3, 5.7, 12, 22]) {
      expect(G.trefferRadius(r, "mouse")).toBe(r + 5);
      expect(G.trefferRadius(r, "mouse", true)).toBe(r + 5);
    }
    // Finger (und Stift), Tipp: mindestens 22 px Radius, bei großen Knoten Radius + 8 – wie bisher
    expect(G.trefferRadius(3.3, "touch")).toBe(22);
    expect(G.trefferRadius(5.7, "touch")).toBe(22);
    expect(G.trefferRadius(20, "touch")).toBe(28);
    expect(G.trefferRadius(3.3, "pen")).toBe(22);
    // Finger, sofort ziehen: nur der sichtbare Knoten (2 px Rand) – 15 px neben „Leistungen“ (5,7 px) ist das kein Treffer mehr
    expect(G.trefferRadius(5.7, "touch", true)).toBeCloseTo(7.7, 6);
    expect(G.trefferRadius(5.7, "touch", true)).toBeLessThan(15);
    expect(G.trefferRadius(3.3, "touch", true)).toBeLessThan(6);
    expect(G.trefferRadius(20, "touch", true)).toBe(22);
    // Übersicht am Handy (Radien 3,3–5,7 px): Die Zieh-Fläche ist höchstens ein Achtel der Tipp-Fläche
    for (const r of [3.3, 4, 5.7]) expect((G.trefferRadius(r, "touch", true) / G.trefferRadius(r, "touch")) ** 2).toBeLessThan(0.125);
  });

  // Prüfrunde 1, Fund 4: Der Fokus-Modus passte bei jedem Neuzeichnen neu ein – verglichen wird jetzt der Inhalt der Menge
  it("gleiche Menge: der Inhalt zählt, nicht das Objekt", () => {
    expect(G.gleicheMenge(new Set([1, 2, 3]), new Set([3, 2, 1]))).toBe(true);
    expect(G.gleicheMenge(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false);
    expect(G.gleicheMenge(new Set([1, 2, 4]), new Set([1, 2, 3]))).toBe(false);
    expect(G.gleicheMenge(new Set(), new Set())).toBe(true);
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

// ---------- Physik beim Ziehen (Obsidian-artig) ----------
describe("Physik beim Ziehen: Federn, Dämpfung, Einschlafen", () => {
  // Kette a – b – c – d: a wird gezogen
  const kette = (extra = {}) => ({
    knoten: ["a", "b", "c", "d"].map((id, i) => ({ id, x: i * 60, y: 0, grad: i === 0 || i === 3 ? 1 : 2, ...(extra[id] || {}) })),
    kanten: [{ von: "a", nach: "b" }, { von: "b", nach: "c" }, { von: "c", nach: "d" }],
  });
  const P = G.LAYOUT_STANDARD;

  it("die Stellschrauben stehen gebündelt in LAYOUT_STANDARD und sind sinnvoll gesetzt", () => {
    expect(P.ziehTiefe).toBeGreaterThanOrEqual(2);
    expect(P.ziehReibung).toBeLessThan(P.reibung); // beim Ziehen weicher gedämpft als beim Ordnen – es schwingt
    expect(P.ziehReibung).toBeGreaterThan(0);
    expect(P.maxSchritt).toBeGreaterThan(0);
    expect(P.schlafSchritt).toBeGreaterThan(0);
    expect(P.schlafTicks).toBeGreaterThan(0);
  });

  it("Federn: wird a weggezogen, folgen b und c (b mehr als c); d liegt hinter der Reichweite und bleibt", () => {
    const l = G.erstelleLayout(kette());
    l.bisRuhe();
    const vor = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, l.lage(id)]));
    l.ziehen("a", vor.a.x - 200, vor.a.y);
    l.schritt(80);
    const weg = (id) => Math.hypot(l.lage(id).x - vor[id].x, l.lage(id).y - vor[id].y);
    expect(l.lage("a")).toMatchObject({ x: vor.a.x - 200, y: vor.a.y, fest: true });
    expect(weg("b")).toBeGreaterThan(20);
    expect(weg("c")).toBeGreaterThan(1);
    expect(weg("b")).toBeGreaterThan(weg("c"));
    expect(weg("d")).toBe(0); // drei Kanten weit: außerhalb von ziehTiefe 2
  });

  it("Abstoßung: zwei verbundene Knoten, übereinander gezogen, drücken sich wieder auseinander", () => {
    const l = G.erstelleLayout({ knoten: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 60, y: 0 }], kanten: [{ von: "a", nach: "b" }] });
    l.bisRuhe();
    l.ziehen("a", 61, 1);
    l.schritt(60);
    const a = l.lage("a");
    const b = l.lage("b");
    const r = G.knotenRadius(1) * 2;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(r * 0.9); // keine Überlagerung
  });

  it("Dämpfung: kein Schritt größer als maxSchritt, die Bewegung klingt nach dem Loslassen ab", () => {
    const d = G.testDaten(120, 5);
    const l = G.erstelleLayout(d);
    l.bisRuhe();
    const p = l.lage("t-0001");
    l.ziehen("t-0001", p.x + 600, p.y + 400); // weiter, ruckartiger Zug
    let alt = l.lagen();
    let groesster = 0;
    for (let s = 0; s < 40; s++) {
      l.schritt(1);
      const neu = l.lagen();
      for (let i = 0; i < l.anzahl; i++) {
        if (l.ids[i] === "t-0001") continue;
        groesster = Math.max(groesster, Math.hypot(neu[2 * i] - alt[2 * i], neu[2 * i + 1] - alt[2 * i + 1]));
      }
      alt = neu;
    }
    expect(groesster).toBeLessThanOrEqual(P.maxSchritt + 1e-3);
    l.loslassen("t-0001", true);
    // Bewegung je Schritt in drei Abschnitten nach dem Loslassen: sie nimmt ab
    const bewegung = () => { const a = l.lagen(); l.schritt(10); const b = l.lagen(); let s = 0; for (let i = 0; i < l.anzahl; i++) s += Math.hypot(b[2 * i] - a[2 * i], b[2 * i + 1] - a[2 * i + 1]); return s; };
    const b1 = bewegung();
    l.schritt(30);
    const b2 = bewegung();
    l.schritt(30);
    const b3 = bewegung();
    expect(b2).toBeLessThan(b1);
    expect(b3).toBeLessThanOrEqual(b2);
  });

  it("Nachschwingen: nach dem Loslassen bewegen sich die Nachbarn noch – dann schläft die Simulation ein", () => {
    const l = G.erstelleLayout(kette());
    l.bisRuhe();
    const vor = l.lage("a");
    l.ziehen("a", vor.x - 150, vor.y + 80);
    l.schritt(15); // mitten in der Bewegung loslassen
    l.loslassen("a", true);
    expect(l.schwingt).toBe(true);
    const b0 = l.lage("b");
    l.schritt(5);
    const b1 = l.lage("b");
    expect(Math.hypot(b1.x - b0.x, b1.y - b0.y)).toBeGreaterThan(0.5); // schwingt nach
    const ticks = l.bisRuhe(2000);
    expect(l.ruht()).toBe(true);
    expect(l.schwingt).toBe(false);
    expect(ticks).toBeLessThan(400); // eingeschlafen, lange bevor die Wärme allein abgeklungen wäre
  });

  it("Einschlafen: ist alles still, stoppt die Schleife ganz – weitere Schritte rechnen nichts", () => {
    const l = G.erstelleLayout(kette());
    l.bisRuhe();
    const p = l.lage("a");
    l.ziehen("a", p.x - 80, p.y);
    l.schritt(30);
    l.loslassen("a", true);
    l.bisRuhe(2000);
    expect(l.ruht()).toBe(true);
    expect(l.alpha).toBe(0);
    const t = l.ticks;
    const lagen = Array.from(l.lagen());
    l.schritt(50);
    expect(l.ticks).toBe(t); // keine Rechnung mehr
    expect(Array.from(l.lagen())).toEqual(lagen);
  });

  it("Anker: ein festgesetzter Knoten bleibt fest, zieht aber an seinen Nachbarn – hinter ihm endet die Reichweite", () => {
    const l = G.erstelleLayout(kette({ b: { fest: true } }));
    l.bisRuhe();
    const vor = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, l.lage(id)]));
    l.ziehen("a", vor.a.x - 120, vor.a.y + 60);
    l.schritt(60);
    expect(l.lage("b")).toEqual(vor.b); // fest bleibt fest
    expect(l.lage("c")).toEqual(vor.c); // hinter dem Anker rührt sich nichts
    expect(l.lokal).toBe(2); // a und der Anker b
    l.loslassen("a", false);
    l.bisRuhe(2000);
    // losgelassen (nicht fest): a federt zurück Richtung Anker b
    const a = l.lage("a");
    const abstand = Math.hypot(a.x - vor.b.x, a.y - vor.b.y);
    expect(abstand).toBeLessThan(Math.hypot(vor.a.x - 120 - vor.b.x, vor.a.y + 60 - vor.b.y));
  });

  it("was dem gezogenen Knoten in den Weg kommt, weicht aus – auch außerhalb der Reichweite (keine Überlagerung bleibt)", () => {
    // zwei getrennte Teile: a – b und c – d; a wird genau auf d gezogen
    const l = G.erstelleLayout({ knoten: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 60, y: 0 }, { id: "c", x: 400, y: 0 }, { id: "d", x: 460, y: 0 }], kanten: [{ von: "a", nach: "b" }, { von: "c", nach: "d" }] });
    l.bisRuhe();
    const d0 = l.lage("d");
    l.ziehen("a", d0.x, d0.y);
    l.schritt(60);
    l.loslassen("a", true);
    l.bisRuhe(2000);
    const a = l.lage("a");
    const d = l.lage("d");
    expect(Math.hypot(a.x - d.x, a.y - d.y)).toBeGreaterThan(G.knotenRadius(1) * 2 * 0.9);
    expect(l.ruht()).toBe(true);
  });

  it("ruhig (Bewegung reduzieren / Physik aus): keine Federung, niemand sonst bewegt sich, nichts läuft", () => {
    const l = G.erstelleLayout(kette());
    l.bisRuhe();
    const vor = Object.fromEntries(["b", "c", "d"].map((id) => [id, l.lage(id)]));
    l.ziehen("a", 500, 500, { ruhig: true });
    expect(l.ruht()).toBe(true);
    expect(l.schwingt).toBe(false);
    l.schritt(20);
    for (const id of ["b", "c", "d"]) expect(l.lage(id)).toEqual(vor[id]);
  });
});
