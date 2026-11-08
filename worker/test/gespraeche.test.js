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

  it("kaputte IndexedDB (open wirft) → nächste Möglichkeit", async () => {
    const umgebung = { indexedDB: { open() { throw new Error("SecurityError"); } }, localStorage: lsAttrappe() };
    expect((await G.ablageOeffnen({ umgebung })).art).toBe("localstorage");
  });
});
