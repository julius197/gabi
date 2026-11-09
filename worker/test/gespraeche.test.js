// Gesprächsverlauf v2.1 (gespraeche.js) ohne Browser: Titel, Gruppen, Limit 50, Aufbereiten, Übernahme aus v2.0,
// Ablagen (localStorage-Ersatz, Arbeitsspeicher) – IndexedDB selbst prüft der Ende-zu-Ende-Test im Browser.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const G = require("../../gespraeche.js");

const nutzer = (text, extra = {}) => ({ id: `n-${text.length}-${Math.random()}`, rolle: "nutzer", text, ...extra });
const gabi = (text, extra = {}) => ({ id: `g-${Math.random()}`, rolle: "gabi", text, karten: [], ...extra });

describe("Titel aus der ersten Nutzernachricht (lokal, ohne KI)", () => {
  it("nimmt die erste Nutzernachricht, eine Zeile, höchstens 40 Zeichen an einer Wortgrenze", () => {
    expect(G.titelAus([gabi("Für welchen Test-Patienten?"), nutzer("Was steht heute an?")])).toBe("Was steht heute an?");
    const t = G.titelAus([nutzer("Wie lange dauert   eine Behandlung\nbei Osteopathie normalerweise in der Praxis?")]);
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t).toBe("Wie lange dauert eine Behandlung bei…");
    expect(t).not.toMatch(/\n|\s{2}/);
  });
  it("Diktat und Suche bekommen einen Vorsatz; ohne Nutzernachricht zählt ein Entwurf", () => {
    expect(G.titelAus([nutzer("Knie rechts, Flexion 110 Grad, Beinpresse 30 kg", { art: "diktat", kuerzel: "TP-01" })])).toBe("Diktat TP-01: Knie rechts, Flexion 110…");
    expect(G.titelAus([nutzer("Theraband", { art: "suche" })])).toBe("Suche: Theraband");
    expect(G.titelAus([gabi("Aus der Vorversion …", { karten: [{ typ: "entwurf", kuerzel: "TP-02" }] })])).toBe("Entwurf TP-02");
    expect(G.titelAus([])).toBe("Neues Gespräch");
  });
  it("kürzt ein sehr langes Wort hart und ohne Satzzeichen am Ende", () => {
    expect(G.kuerzen("A".repeat(60), 40)).toBe(`${"A".repeat(39)}…`);
    expect(G.kuerzen("Hallo, wie geht es dir heute, liebe Gabi, sag mal", 30)).toBe("Hallo, wie geht es dir heute…");
    expect(G.titelSaeubern("  Mein   Titel \n ")).toBe("Mein Titel");
    expect(G.titelSaeubern("x".repeat(120))).toHaveLength(80);
  });
});

describe("Leere Gespräche werden nicht gespeichert", () => {
  it("nur Rückfragen von Gabi = leer; Nutzernachricht, Entwurf oder Bewahrtes = nicht leer", () => {
    expect(G.istLeer([])).toBe(true);
    expect(G.istLeer([gabi("Für welchen Test-Patienten möchtest du diktieren?", { lokal: true, karten: [{ typ: "auswahl" }] })])).toBe(true);
    expect(G.istLeer([nutzer("   ")])).toBe(true);
    expect(G.istLeer([nutzer("Hallo")])).toBe(false);
    expect(G.istLeer([gabi("", { karten: [{ typ: "entwurf", kuerzel: "TP-01" }] })])).toBe(false);
    expect(G.istLeer([gabi("Altes Diktat", { lokal: true, bewahren: true })])).toBe(false);
    // zurückgestellte Aufnahme (Gespräch gewechselt, bevor sie ankam) darf nicht verschwinden
    const geparkt = [gabi("Deine Aufnahme ist noch nicht gesendet.", { lokal: true, karten: [{ typ: "aufnahme", id: "a" }] })];
    expect(G.istLeer(geparkt)).toBe(false);
    expect(G.titelAus(geparkt)).toBe("Aufnahme – noch nicht gesendet");
  });
});

describe("Gruppen: Heute, Gestern, Letzte 7 Tage, Älter", () => {
  const jetzt = new Date(2026, 10, 8, 15, 0).getTime(); // So, 08.11.2026 15:00 (Ortszeit)
  const um = (tag, stunde) => new Date(2026, 10, tag, stunde, 0).getTime();
  it("ordnet nach letzter Aktivität, neueste zuerst, leere Gruppen fallen weg", () => {
    const liste = [
      { id: "a", geaendert: um(8, 9) }, { id: "b", geaendert: um(8, 14) }, { id: "c", geaendert: um(7, 23) },
      { id: "d", geaendert: um(1, 0) + 1 }, { id: "e", geaendert: um(31 - 31 + 1, 0) - 1 }, { id: "f", geaendert: um(2, 12) },
    ];
    const g = G.gruppieren(liste, jetzt);
    expect(g.map((x) => x.titel)).toEqual(["Heute", "Gestern", "Letzte 7 Tage", "Älter"]);
    expect(g[0].eintraege.map((x) => x.id)).toEqual(["b", "a"]);
    expect(g[1].eintraege.map((x) => x.id)).toEqual(["c"]);
    expect(g[2].eintraege.map((x) => x.id)).toEqual(["f", "d"]);
    expect(g[3].eintraege.map((x) => x.id)).toEqual(["e"]);
    expect(G.gruppieren([{ id: "z", geaendert: um(1, 12) }], jetzt).map((x) => x.titel)).toEqual(["Letzte 7 Tage"]);
    expect(G.gruppieren([], jetzt)).toEqual([]);
  });
  it("Zeitumstellung (25.10.2026) verschiebt nichts: gestern bleibt gestern", () => {
    const montag = new Date(2026, 9, 26, 8, 0).getTime();
    const g = G.gruppieren([{ id: "x", geaendert: new Date(2026, 9, 25, 0, 30).getTime() }, { id: "y", geaendert: new Date(2026, 9, 24, 23, 30).getTime() }], montag);
    expect(g.map((x) => [x.titel, x.eintraege.map((e) => e.id)])).toEqual([["Gestern", ["x"]], ["Letzte 7 Tage", ["y"]]]);
  });
  it("Uhr des Geräts nachgestellt (Zeit in der Zukunft) → Heute", () => {
    expect(G.gruppieren([{ id: "z", geaendert: jetzt + 86400000 }], jetzt)[0].titel).toBe("Heute");
  });
});

describe("Limit 50", () => {
  const liste = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, geaendert: 1000 + i, entwuerfe: 0, ...extra(i) }));
  it("bis 50 fliegt nichts raus, darüber die am längsten unbenutzten", () => {
    expect(G.ueberzaehlige(liste(50))).toEqual([]);
    expect(G.ueberzaehlige(liste(51))).toEqual(["g0"]);
    expect(G.ueberzaehlige(liste(53))).toEqual(["g0", "g1", "g2"]);
  });
  it("nie das offene Gespräch, Gespräche mit offenem Entwurf zuletzt", () => {
    expect(G.ueberzaehlige(liste(51), { aktiv: "g0" })).toEqual(["g1"]);
    expect(G.ueberzaehlige(liste(51, (i) => ({ entwuerfe: i === 0 ? 1 : 0 })))).toEqual(["g1"]);
    expect(G.ueberzaehlige(liste(3, () => ({ entwuerfe: 2 })), { max: 2 })).toEqual(["g0"]); // notfalls doch
  });
});

describe("Aufbereiten beim Öffnen und Speichern", () => {
  it("unterbrochene Antwort → Fehler mit „Nochmal versuchen“; leere Antwort → „Abgebrochen.“; Beispiel-Chip gesperrt", () => {
    const n = G.vorbereiten([
      nutzer("Frage"),
      gabi("", { unterwegs: true, body: { nachrichten: [] } }),
      gabi(""),
      gabi("Alles klar", { lokal: true, karten: [{ typ: "beispiel", id: "b" }, { typ: "entwurf", id: "e", bearbeitung: { befund: "x" } }] }),
      { rolle: "system", text: "x" }, null, "kaputt",
    ]);
    expect(n).toHaveLength(4);
    expect(n[1]).toMatchObject({ fehler: true, wiederholbar: true });
    expect(n[1].unterwegs).toBeUndefined();
    expect(n[2]).toMatchObject({ abgebrochen: true, text: "Abgebrochen." });
    expect(n[3].karten[0].benutzt).toBe(true);
    expect(n[3].karten[1].bearbeiten).toBe(true);
  });
  it("speichert keine flüchtigen Zustände", () => {
    const s = G.bereinigen([gabi("x", { laeuft: true, wartet: true, status: "Suche …", unterwegs: true, karten: [{ typ: "entwurf", speichert: true, sendet: true, id: "k" }] })]);
    expect(s[0]).not.toHaveProperty("laeuft");
    expect(s[0]).not.toHaveProperty("wartet");
    expect(s[0]).not.toHaveProperty("status");
    expect(s[0].unterwegs).toBe(true); // damit ein Neuladen mitten in der Antwort erkannt wird
    expect(s[0].karten[0]).toEqual({ typ: "entwurf", id: "k" });
  });
  it("Listeneintrag zählt offene Entwürfe (nicht gespeicherte, nicht verworfene)", () => {
    const m = G.meta({ id: "x", titel: "", nachrichten: [nutzer("Hallo"), gabi("", { karten: [{ typ: "entwurf" }, { typ: "entwurf", gespeichert: "n1" }, { typ: "entwurf", verworfen: true }] })], erstellt: 1, geaendert: 2 });
    expect(m).toEqual({ id: "x", titel: "Hallo", titelEigen: false, erstellt: 1, geaendert: 2, entwuerfe: 1 });
  });
});

describe("Dasselbe Gespräch in zwei Tabs: zusammenführen statt überschreiben", () => {
  it("eigene Objekte bleiben, Änderungen und neue Nachrichten des anderen Tabs kommen dazu, Laufendes/Bearbeitetes bleibt", () => {
    const frage = nutzer("Frage", { id: "n1" });
    const antwort = gabi("Antwort", { id: "g1", karten: [{ typ: "entwurf", id: "e1" }] });
    const laeuft = gabi("", { id: "g2", laeuft: true });
    const eigene = [frage, antwort, laeuft];
    const fremde = [
      { ...frage },
      { ...antwort, karten: [{ typ: "entwurf", id: "e1", gespeichert: "notiz-7" }] }, // im anderen Tab gespeichert
      nutzer("Frage aus dem anderen Tab", { id: "n9" }),
      gabi("Antwort aus dem anderen Tab", { id: "g9" }),
      gabi("", { id: "g10", unterwegs: true }), // antwortet dort noch → später
    ];
    const r = G.zusammenfuehren(eigene, fremde, { inArbeit: (n) => n === laeuft });
    expect(r.nachrichten.map((n) => n.id)).toEqual(["n1", "g1", "n9", "g9", "g2"]);
    expect(r.nachrichten[1]).toBe(antwort); // dasselbe Objekt …
    expect(antwort.karten[0].gespeichert).toBe("notiz-7"); // … mit dem Stand des anderen Tabs (kein zweites Speichern)
    expect(r.geaendert).toEqual([antwort]);
    expect(r.neu.map((n) => n.id)).toEqual(["n9", "g9"]);
    expect(r.nachrichten[4]).toBe(laeuft);
    // in Arbeit: eigene Fassung bleibt
    const bearbeitet = gabi("x", { id: "g1", karten: [{ typ: "entwurf", id: "e1", bearbeiten: true, bearbeitung: { befund: "getippt" } }] });
    const r2 = G.zusammenfuehren([bearbeitet], [gabi("x", { id: "g1", karten: [{ typ: "entwurf", id: "e1" }] })], { inArbeit: (n) => n.karten.some((k) => k.bearbeiten) });
    expect(r2.geaendert).toEqual([]);
    expect(bearbeitet.karten[0].bearbeitung.befund).toBe("getippt");
    // nichts Neues: nichts zu tun
    expect(G.zusammenfuehren([frage], [{ ...frage }])).toMatchObject({ neu: [], geaendert: [] });
    // Bearbeiten-Zustand des anderen Tabs springt nicht über – und zählt nicht als Änderung
    const hier = gabi("x", { id: "g5", karten: [{ typ: "entwurf", id: "e5", strukturiert: { befund: ["a"] } }] });
    const dort = gabi("x", { id: "g5", karten: [{ typ: "entwurf", id: "e5", strukturiert: { befund: ["a"] }, bearbeiten: true, bearbeitung: { befund: "dort getippt" } }] });
    const r3 = G.zusammenfuehren([hier], [dort]);
    expect(r3.geaendert).toEqual([]);
    expect(hier.karten[0].bearbeiten).toBeUndefined();
    // echte Änderung im anderen Tab: übernehmen, eigenen Bearbeiten-Zustand behalten
    const hier2 = gabi("x", { id: "g6", karten: [{ typ: "entwurf", id: "e6", bearbeitung: { befund: "hier getippt" } }] });
    const r4 = G.zusammenfuehren([hier2], [gabi("x", { id: "g6", karten: [{ typ: "entwurf", id: "e6", gespeichert: "n-9", bearbeiten: true, bearbeitung: { befund: "dort" } }] })]);
    expect(r4.geaendert).toEqual([hier2]);
    expect(hier2.karten[0]).toMatchObject({ gespeichert: "n-9", bearbeitung: { befund: "hier getippt" } });
    expect(hier2.karten[0].bearbeiten).toBeUndefined();
  });
});

describe("Endzustände sind einbahnig (gespeichert, verworfen, nachgeschickt, gewählt)", () => {
  const entwurf = (extra = {}) => ({ typ: "entwurf", id: "e1", kuerzel: "TP-03", strukturiert: { befund: ["alt"] }, ...extra });

  it("überträgt „gespeichert“ samt gespeichertem Inhalt und beendet das Bearbeiten – zurück geht es nie", () => {
    const hier = [gabi("x", { id: "g1", karten: [entwurf({ bearbeiten: true, bearbeitung: { befund: "B tippt" }, strukturiert: { befund: ["B übernommen"] } })] })];
    const dort = [gabi("x", { id: "g1", karten: [entwurf({ gespeichert: "notiz-1", strukturiert: { befund: ["A gespeichert"] } })] })];
    expect(G.endzustaendeUebernehmen(hier, dort)).toEqual([hier[0]]);
    expect(hier[0].karten[0]).toEqual(entwurf({ gespeichert: "notiz-1", strukturiert: { befund: ["A gespeichert"] } }));
    // ein älterer Stand ohne Endzustand nimmt nichts zurück …
    expect(G.endzustaendeUebernehmen(hier, [gabi("x", { id: "g1", karten: [entwurf()] })])).toEqual([]);
    expect(hier[0].karten[0].gespeichert).toBe("notiz-1");
    // … und eine gespeicherte Karte behält ihre Notiz-ID
    expect(G.endzustaendeUebernehmen(hier, [gabi("x", { karten: [entwurf({ gespeichert: "notiz-2" })] })])).toEqual([]);
    expect(hier[0].karten[0].gespeichert).toBe("notiz-1");
  });

  it("„verworfen“ wird übernommen; „gespeichert“ schlägt „verworfen“ (die Notiz gibt es)", () => {
    const a = [gabi("x", { karten: [entwurf({ bearbeiten: true })] })];
    expect(G.endzustaendeUebernehmen(a, [gabi("x", { karten: [entwurf({ verworfen: true })] })])).toHaveLength(1);
    expect(a[0].karten[0].verworfen).toBe(true);
    expect(a[0].karten[0].bearbeiten).toBeUndefined();
    expect(G.endzustaendeUebernehmen(a, [gabi("x", { karten: [entwurf({ gespeichert: "n-1" })] })])).toHaveLength(1);
    expect(a[0].karten[0].gespeichert).toBe("n-1");
    expect(a[0].karten[0].verworfen).toBeUndefined();
    const b = [gabi("x", { karten: [entwurf({ gespeichert: "n-1" })] })];
    expect(G.endzustaendeUebernehmen(b, [gabi("x", { karten: [entwurf({ verworfen: true })] })])).toEqual([]);
    expect(b[0].karten[0].verworfen).toBeUndefined();
  });

  it("auch Aufnahme und Auswahl; Beispiel, andere Kartentypen und Unsinn bleiben unberührt", () => {
    const hier = [gabi("x", { karten: [{ typ: "aufnahme", id: "a1" }, { typ: "auswahl", id: "w1" }, { typ: "beispiel", id: "b1" }, { typ: "bericht", id: "r1" }] })];
    const dort = [gabi("x", { karten: [{ typ: "aufnahme", id: "a1", erledigt: true }, { typ: "auswahl", id: "w1", gewaehlt: "p-2" }, { typ: "beispiel", id: "b1", benutzt: true }, { typ: "entwurf", id: "r1", gespeichert: "x" }] })];
    expect(G.endzustaendeUebernehmen(hier, dort)).toHaveLength(1);
    expect(hier[0].karten).toEqual([{ typ: "aufnahme", id: "a1", erledigt: true }, { typ: "auswahl", id: "w1", gewaehlt: "p-2" }, { typ: "beispiel", id: "b1" }, { typ: "bericht", id: "r1" }]);
    expect(G.endzustaendeUebernehmen(null, dort)).toEqual([]);
    expect(G.endzustaendeUebernehmen(hier, null)).toEqual([]);
    expect(G.endzustaendeUebernehmen([null, { karten: null }], [{ karten: [null, { id: "a1", erledigt: true }] }])).toEqual([]);
  });

  it("zwei Tabs: dort gespeichert, hier gerade in Bearbeitung → hier auch gespeichert, Bearbeiten endet (sonst doppelte Notiz)", () => {
    const hier = gabi("Hier ist dein Entwurf", { id: "g1", karten: [entwurf({ bearbeiten: true, bearbeitung: { befund: "x" } })] });
    const fremd = [gabi("Hier ist dein Entwurf", { id: "g1", karten: [entwurf({ gespeichert: "notiz-7", strukturiert: { befund: ["A"] } })] }), gabi("neu", { id: "g2" })];
    const r = G.zusammenfuehren([hier], fremd, { inArbeit: (n) => (n.karten || []).some((k) => k.bearbeiten) });
    expect(r.geaendert).toEqual([hier]);
    expect(hier.karten[0]).toEqual(entwurf({ gespeichert: "notiz-7", strukturiert: { befund: ["A"] } }));
    expect(r.neu.map((n) => n.id)).toEqual(["g2"]);
    // dort verworfen: ebenso
    const hier2 = gabi("x", { id: "g4", karten: [entwurf({ bearbeiten: true })] });
    G.zusammenfuehren([hier2], [gabi("x", { id: "g4", karten: [entwurf({ verworfen: true })] })], { inArbeit: () => true });
    expect(hier2.karten[0]).toMatchObject({ verworfen: true });
    // alles andere an einer Nachricht in Arbeit bleibt die eigene Fassung
    const laeuft = gabi("hier", { id: "g3" });
    expect(G.zusammenfuehren([laeuft], [gabi("dort", { id: "g3" })], { inArbeit: () => true }).geaendert).toEqual([]);
    expect(laeuft.text).toBe("hier");
  });

  it("zwei Tabs: ein älterer Stand des anderen Tabs nimmt eigenes „gespeichert“/„verworfen“ nicht zurück", () => {
    const hier = gabi("x", { id: "g1", karten: [entwurf({ gespeichert: "notiz-7", strukturiert: { befund: ["gespeichert"] } }), entwurf({ id: "e2", verworfen: true })] });
    const r = G.zusammenfuehren([hier], [gabi("x neu", { id: "g1", karten: [entwurf({ strukturiert: { befund: ["dort übernommen"] } }), entwurf({ id: "e2" })] })]);
    expect(r.geaendert).toEqual([hier]);
    expect(hier.text).toBe("x neu"); // übrige Änderungen kommen an
    expect(hier.karten[0]).toMatchObject({ gespeichert: "notiz-7", strukturiert: { befund: ["gespeichert"] } });
    expect(hier.karten[1].verworfen).toBe(true);
    // dem gespeicherten Stand (anderer Tab, Vorversion) fehlen eigene Endzustände: zurückschreiben
    expect(r.veraltet).toBe(true);
  });

  it("„veraltet“ nur, wenn dem fremden Stand eigene Endzustände fehlen – auch bei Nachrichten in Arbeit", () => {
    // gleicher Stand: nichts zurückzuschreiben
    const a = gabi("x", { id: "g1", karten: [entwurf({ gespeichert: "n-1" })] });
    expect(G.zusammenfuehren([a], [gabi("x", { id: "g1", karten: [entwurf({ gespeichert: "n-1" })] })]).veraltet).toBe(false);
    // dort neuer (dort gespeichert, hier noch offen): übernehmen, nichts zurückschreiben
    const b = gabi("x", { id: "g1", karten: [entwurf()] });
    expect(G.zusammenfuehren([b], [gabi("x", { id: "g1", karten: [entwurf({ gespeichert: "n-2" })] })]).veraltet).toBe(false);
    expect(b.karten[0].gespeichert).toBe("n-2");
    // hier in Arbeit (zweiter Entwurf wird bearbeitet), dort fehlt das eigene „gespeichert“ des ersten
    const c = gabi("x", { id: "g1", karten: [entwurf({ gespeichert: "n-3" }), entwurf({ id: "e2", bearbeiten: true })] });
    const r = G.zusammenfuehren([c], [gabi("x", { id: "g1", karten: [entwurf(), entwurf({ id: "e2" })] })], { inArbeit: () => true });
    expect(r).toMatchObject({ geaendert: [], veraltet: true });
    expect(c.karten[0].gespeichert).toBe("n-3");
    expect(c.karten[1].bearbeiten).toBe(true);
    // ohne gemeinsame Nachrichten nie
    expect(G.zusammenfuehren([], [gabi("y", { id: "g9" })]).veraltet).toBe(false);
  });
});

describe("Übernahme aus v2.0 (ein Gespräch pro Tab)", () => {
  it("übernimmt nur, was sich zu behalten lohnt", () => {
    const alt = JSON.stringify({ nachrichten: [nutzer("Was wollte TP-01?"), gabi("Am 03.11. …")] });
    expect(G.ausVersion20(alt)).toHaveLength(2);
    expect(G.ausVersion20(JSON.stringify({ nachrichten: [gabi("Wonach soll ich suchen?", { lokal: true })] }))).toBeNull();
    expect(G.ausVersion20("{kaputt")).toBeNull();
    expect(G.ausVersion20(null)).toBeNull();
  });
  it("ein dort aus v1 übernommenes, nie gespeichertes Diktat ist die einzige Kopie – es bleibt", () => {
    const n = G.ausVersion20(JSON.stringify({ nachrichten: [gabi("Aus der Vorversion war noch ein Diktat offen, das nicht gespeichert wurde:\n\nKnie rechts …", { lokal: true })] }));
    expect(n).toHaveLength(1);
    expect(n[0].bewahren).toBe(true);
    expect(G.titelAus(n)).toBe("Diktat aus der Vorversion");
  });
});

describe("Ablagen", () => {
  function lsAttrappe({ voll = false } = {}) {
    const m = new Map();
    return {
      m,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { if (voll && !k.endsWith("probe")) throw new DOMException("voll", "QuotaExceededError"); m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
    };
  }
  const nachrichten = [nutzer("Hallo"), gabi("Hallo!")];

  it("localStorage-Ersatz: speichern, Liste, laden, Titel ohne Inhalt ändern, löschen, leeren", async () => {
    const ls = lsAttrappe();
    const a = G.lsAblage("gabi.", ls);
    await a.bereit();
    await a.speichern({ id: "a", titel: "Hallo", geaendert: 1 }, nachrichten);
    await a.speichern({ id: "b", titel: "Zweites", geaendert: 2 }, nachrichten);
    await a.speichern({ id: "a", titel: "Neu benannt", titelEigen: true, geaendert: 1 }, null); // nur Titel
    expect((await a.liste()).map((x) => [x.id, x.titel]).sort()).toEqual([["a", "Neu benannt"], ["b", "Zweites"]]);
    expect(await a.laden("a")).toEqual(nachrichten);
    await a.loeschen(["a"]);
    expect(await a.laden("a")).toBeNull();
    expect((await a.liste()).map((x) => x.id)).toEqual(["b"]);
    await a.leeren();
    expect(await a.liste()).toEqual([]);
    expect([...ls.m.keys()]).toEqual([]);
  });

  it("Demo und echter Betrieb bleiben getrennt", async () => {
    const ls = lsAttrappe();
    const umgebung = { localStorage: ls }; // ohne IndexedDB → localStorage
    const echt = await G.ablageOeffnen({ demo: false, umgebung });
    const demo = await G.ablageOeffnen({ demo: true, umgebung });
    expect(echt.art).toBe("localstorage");
    await echt.speichern({ id: "e", titel: "Echt" }, nachrichten);
    await demo.speichern({ id: "d", titel: "Demo" }, nachrichten);
    expect((await echt.liste()).map((x) => x.id)).toEqual(["e"]);
    expect((await demo.liste()).map((x) => x.id)).toEqual(["d"]);
    await demo.leeren();
    expect((await echt.liste()).map((x) => x.id)).toEqual(["e"]);
  });

  it("Speicher voll → Fehler kommt an (die Oberfläche zeigt einen Hinweis)", async () => {
    const a = G.lsAblage("gabi.", lsAttrappe({ voll: true }));
    await a.bereit();
    await expect(a.speichern({ id: "a" }, nachrichten)).rejects.toThrow();
  });

  it("weder IndexedDB noch localStorage → Arbeitsspeicher (nur dieser Tab), Kopien statt Verweise", async () => {
    const gesperrt = { get localStorage() { throw new Error("gesperrt"); } };
    const a = await G.ablageOeffnen({ umgebung: gesperrt });
    expect(a.art).toBe("speicher");
    const n = [nutzer("x")];
    await a.speichern({ id: "a", titel: "x" }, n);
    n[0].text = "verändert";
    expect((await a.laden("a"))[0].text).toBe("x");
  });

  it("Reste löschen: nur Gesprächs-Schlüssel dieses Modus, sonst nichts (Zugangscode, Demo-Daten bleiben)", async () => {
    const ls = lsAttrappe();
    for (const k of ["gabi.gespraeche.v1", "gabi.gespraech.v1.a", "gabi.gespraech.v1.b", "gabi.zugang", "gabi.sortierung", "gabi.demo.gespraeche.v1", "gabi.demo.v1"]) ls.setItem(k, "x");
    ls.length = 0; // Attrappe: key()/length nachrüsten
    Object.defineProperty(ls, "length", { get: () => ls.m.size });
    ls.key = (i) => [...ls.m.keys()][i] ?? null;
    await G.resteLoeschen({ demo: false, art: "indexeddb", umgebung: { localStorage: ls } });
    expect([...ls.m.keys()].sort()).toEqual(["gabi.demo.gespraeche.v1", "gabi.demo.v1", "gabi.sortierung", "gabi.zugang"]);
    await G.resteLoeschen({ demo: true, art: "indexeddb", umgebung: { localStorage: ls } });
    expect([...ls.m.keys()].sort()).toEqual(["gabi.demo.v1", "gabi.sortierung", "gabi.zugang"]);
  });

  it("IndexedDB lässt sich beim Löschen nicht leeren → Marke bleibt, damit der nächste Start mit IndexedDB zuerst leert", async () => {
    const ls = lsAttrappe();
    const blockiert = { open() { const r = {}; setTimeout(() => r.onblocked && r.onblocked(), 0); return r; } };
    expect(await G.resteLoeschen({ demo: false, art: "localstorage", umgebung: { localStorage: ls, indexedDB: blockiert } })).toBe(false);
    expect(ls.getItem("gabi.gespraeche.leeren-offen")).toBe("1");
    expect(await G.resteLoeschen({ demo: false, art: "localstorage", umgebung: { localStorage: ls } })).toBe(true); // ohne IndexedDB nichts zu tun
    expect(ls.getItem("gabi.gespraeche.leeren-offen")).toBeNull();
  });

  it("Speichern nimmt Endzustände der Ablage nie zurück: ein älterer Stand (anderer Tab) wird nachgezogen", async () => {
    for (const a of [G.lsAblage("gabi.", lsAttrappe()), G.speicherAblage()]) {
      await a.bereit();
      const karte = { typ: "entwurf", id: "e1", kuerzel: "TP-03", strukturiert: { befund: ["A"] } };
      expect(await a.speichern({ id: "g", entwuerfe: 0 }, [gabi("x", { id: "m1", karten: [{ ...karte, gespeichert: "notiz-1" }] })])).toBeNull();
      // der andere Tab schreibt seinen alten Stand (Karte noch offen und in Bearbeitung) samt einer neuen Nachricht
      const alt = [gabi("x", { id: "m1", karten: [{ ...karte, strukturiert: { befund: ["B"] }, bearbeitung: { befund: "B tippt" } }] }), nutzer("neu", { id: "m2" })];
      const nachgezogen = await a.speichern({ id: "g", entwuerfe: 1 }, alt);
      expect(nachgezogen[0].karten[0]).toEqual({ ...karte, gespeichert: "notiz-1" }); // für den Tab zum Nachziehen
      const da = await a.laden("g");
      expect(da[0].karten[0]).toEqual({ ...karte, gespeichert: "notiz-1" });
      expect(da[1].text).toBe("neu"); // das Übrige des neueren Stands bleibt
      expect((await a.liste()).find((m) => m.id === "g").entwuerfe).toBe(0);
      expect(await a.speichern({ id: "g", titel: "Nur der Titel" }, null)).toBeNull();
      expect((await a.laden("g"))[0].karten[0].gespeichert).toBe("notiz-1");
    }
  });

  it("nurVorhanden: ein schon abgelegtes Gespräch, das ein anderer Tab gelöscht hat, wird nicht wieder angelegt", async () => {
    for (const a of [G.lsAblage("gabi.", lsAttrappe()), G.speicherAblage()]) {
      await a.bereit();
      await a.speichern({ id: "g", titel: "x" }, nachrichten);
      expect(await a.speichern({ id: "g", titel: "x" }, nachrichten, { nurVorhanden: true })).toBeNull(); // noch da: normal
      await a.leeren(); // der andere Tab: „Abmelden + Gespräche löschen“
      expect(await a.speichern({ id: "g", titel: "x" }, nachrichten, { nurVorhanden: true })).toEqual({ fehlt: true });
      expect(await a.speichern({ id: "g", titel: "Neuer Name" }, null, { nurVorhanden: true })).toEqual({ fehlt: true }); // Umbenennen
      expect(await a.liste()).toEqual([]);
      expect(await a.laden("g")).toBeNull();
      expect(await a.speichern({ id: "neu", titel: "y" }, nachrichten)).toBeNull(); // ohne die Vorgabe: neu anlegen wie bisher
      expect((await a.liste()).map((m) => m.id)).toEqual(["neu"]);
    }
  });

  it("kaputte IndexedDB (open wirft) → nächste Möglichkeit", async () => {
    const umgebung = { indexedDB: { open() { throw new Error("SecurityError"); } }, localStorage: lsAttrappe() };
    expect((await G.ablageOeffnen({ umgebung })).art).toBe("localstorage");
  });
});

describe("Netzfehler beim Neuladen (Safari bricht die Antwort schon vor pagehide ab)", () => {
  // So legt app.js eine Antwort mit Netzfehler ab, solange nicht klar ist, ob die Seite bleibt: Fehler fürs Auge,
  // „unterwegs“ für den nächsten Start. Bleibt die Seite, wird ohne „unterwegs“ nachgespeichert.
  const vorlaeufig = () => gabi("Erster Teil der Antwort", {
    id: "g1", unterwegs: true, fehler: true, fehlerText: "Keine Verbindung zum Server. Bitte nochmal versuchen.", wiederholbar: true,
    body: { nachrichten: [{ rolle: "nutzer", text: "Frage" }] }, laeuft: false, status: "",
    karten: [{ typ: "entwurf", id: "e1", kuerzel: "TP-01", strukturiert: { befund: ["Flexion 100°"] } }],
  });

  it("gespeichert wird „unterwegs“ zusammen mit dem Fehler und dem Teilinhalt", () => {
    const [n] = G.bereinigen([vorlaeufig()]);
    expect(n).toMatchObject({ unterwegs: true, fehler: true, wiederholbar: true, text: "Erster Teil der Antwort" });
    expect(n.karten).toHaveLength(1);
    expect(n).not.toHaveProperty("laeuft");
  });

  it("nach dem Neuladen: „unterbrochen“ statt „Keine Verbindung“ – Teilinhalt und „Nochmal versuchen“ bleiben", () => {
    const [frage, antwort] = G.vorbereiten(JSON.parse(JSON.stringify(G.bereinigen([nutzer("Frage", { id: "n1" }), vorlaeufig()]))));
    expect(frage.text).toBe("Frage");
    expect(antwort.fehlerText).toBe("Die Antwort wurde unterbrochen, weil die Seite neu geladen wurde.");
    expect(antwort).toMatchObject({ fehler: true, wiederholbar: true, text: "Erster Teil der Antwort" });
    expect(antwort.unterwegs).toBeUndefined();
    expect(antwort.karten.map((k) => k.id)).toEqual(["e1"]);
  });

  it("bestätigter Netzfehler (Seite blieb) bleibt nach dem Neuladen ein Verbindungsfehler", () => {
    const { unterwegs: _u, ...bestaetigt } = vorlaeufig();
    const [n] = G.vorbereiten(G.bereinigen([bestaetigt]));
    expect(n.fehlerText).toBe("Keine Verbindung zum Server. Bitte nochmal versuchen.");
    expect(n.wiederholbar).toBe(true);
  });

  it("ein anderer Tab übernimmt einen vorläufigen Netzfehler gleich – sonst schriebe er ihn beim nächsten Speichern weg", () => {
    const frage = nutzer("Frage", { id: "n1" });
    const fremd = () => G.vorbereiten(G.bereinigen([{ ...frage }, vorlaeufig(), nutzer("Frage zwei", { id: "n2" })]), { fremd: true });
    const r = G.zusammenfuehren([frage], fremd());
    expect(r.nachrichten.map((n) => n.id)).toEqual(["n1", "g1", "n2"]); // an seiner Stelle, vor der späteren Frage
    expect(r.neu[0]).toMatchObject({ id: "g1", unterwegs: true, fehler: true, fehlerText: "Keine Verbindung zum Server. Bitte nochmal versuchen." });
    expect(r.neu[0].karten.map((k) => k.id)).toEqual(["e1"]); // samt ungespeichertem Entwurf
    // eine noch laufende Antwort (unterwegs ohne Fehler) kommt wie bisher erst nach ihrem Ende
    const laeuft = G.zusammenfuehren([frage], G.vorbereiten(G.bereinigen([{ ...frage }, gabi("Teil", { id: "g7", unterwegs: true })]), { fremd: true }));
    expect(laeuft).toMatchObject({ neu: [], geaendert: [] });
  });

  it("ein „unterwegs“ des anderen Tabs überschreibt nie die eigene Fassung – es merkt nur die Stelle", () => {
    const frage = nutzer("Frage", { id: "n1" });
    // der Tab mit dem Netzfehler nach dem Neuladen: „unterbrochen“ – der andere Tab schreibt noch den vorläufigen Stand
    const [eigen] = G.vorbereiten(G.bereinigen([vorlaeufig()]));
    const r = G.zusammenfuehren([frage, eigen], G.vorbereiten(G.bereinigen([{ ...frage }, vorlaeufig(), nutzer("dazu", { id: "n3" })]), { fremd: true }));
    expect(r.geaendert).toEqual([]);
    expect(eigen.fehlerText).toBe("Die Antwort wurde unterbrochen, weil die Seite neu geladen wurde.");
    expect(r.nachrichten.map((n) => n.id)).toEqual(["n1", "g1", "n3"]);
    // bestätigt (ohne „unterwegs“): das gilt – auch das „unterwegs“ der übernommenen Kopie fällt weg
    const kopie = G.vorbereiten(G.bereinigen([vorlaeufig()]), { fremd: true })[0];
    const { unterwegs: _u, ...bestaetigt } = vorlaeufig();
    const r2 = G.zusammenfuehren([frage, kopie], G.vorbereiten(G.bereinigen([{ ...frage }, bestaetigt]), { fremd: true }));
    expect(r2.geaendert).toEqual([kopie]);
    expect(kopie.unterwegs).toBeUndefined();
    expect(kopie.fehlerText).toBe("Keine Verbindung zum Server. Bitte nochmal versuchen.");
  });

  it("… bringt aber dort Gespeichertes/Verworfenes gleich mit (sonst böte dieser Tab weiter „Speichern“ an)", () => {
    const frage = nutzer("Frage", { id: "n1" });
    const mitKarte = (extra) => { const n = vorlaeufig(); n.karten = [{ ...n.karten[0], ...extra }]; return n; };
    // hier nach dem Neuladen („unterbrochen“, Entwurf offen); der andere Tab hat den Entwurf seiner Kopie gespeichert
    const [eigen] = G.vorbereiten(G.bereinigen([vorlaeufig()]));
    const r = G.zusammenfuehren([frage, eigen], G.vorbereiten(G.bereinigen([{ ...frage }, mitKarte({ gespeichert: "notiz-3", strukturiert: { befund: ["Flexion 110°"] } })]), { fremd: true }));
    expect(r.geaendert).toEqual([eigen]);
    expect(eigen.karten[0]).toMatchObject({ gespeichert: "notiz-3", strukturiert: { befund: ["Flexion 110°"] } }); // dieser Inhalt ging zum Server
    expect(eigen.fehlerText).toBe("Die Antwort wurde unterbrochen, weil die Seite neu geladen wurde."); // sonst bleibt die eigene Fassung
    expect(r.nachrichten.map((n) => n.id)).toEqual(["n1", "g1"]);
    // verworfen ebenso
    const [eigen2] = G.vorbereiten(G.bereinigen([vorlaeufig()]));
    const r2 = G.zusammenfuehren([frage, eigen2], G.vorbereiten(G.bereinigen([{ ...frage }, mitKarte({ verworfen: true })]), { fremd: true }));
    expect(r2.geaendert).toEqual([eigen2]);
    expect(eigen2.karten[0].verworfen).toBe(true);
  });
});

describe("Übernahme aus v2.0: was andere Tabs aus der Liste lesen", () => {
  it("offener Entwurf im übernommenen Gespräch steht im Listeneintrag (für „Alle löschen“/„Abmelden“ in anderen Tabs)", () => {
    const alt = JSON.stringify({ nachrichten: [
      nutzer("Knie rechts, Flexion 100 Grad", { id: "c1", art: "diktat", kuerzel: "TP-01" }),
      gabi("Hier ist dein Entwurf.", { id: "c2", karten: [{ typ: "entwurf", id: "c3", kuerzel: "TP-01", strukturiert: {} }] }),
    ] });
    const nachrichten = G.vorbereiten(G.ausVersion20(alt));
    const m = G.meta({ id: "x", nachrichten, erstellt: 1, geaendert: 2 });
    expect(m).toMatchObject({ titel: "Diktat TP-01: Knie rechts, Flexion 100…", entwuerfe: 1 });
  });
});
