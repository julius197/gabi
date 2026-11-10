// Brain-Speicher (brain-speicher.js): dieselbe Testreihe gegen ALLE Ablagen – IndexedDB (nachgebaut), localStorage
// (nachgebaut), Arbeitsspeicher und die API-Ablage (Supabase über den Worker, Server im Speicher nachgebaut).
// Dazu je Ablage das Besondere, die Ersatzkette beim Öffnen, Demo/echt getrennt, Migration, Notfall-Kopie,
// „alles vom Gerät“ (resteLoeschen) und der Kanal zwischen Tabs. „Zwei Tabs“ = zwei Ablagen auf denselben Daten.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { falscheIndexedDB, falscherKanal, falscherSpeicher } from "./hilfen-idb.js";

const require = createRequire(import.meta.url);
const S = require("../../brain-speicher.js");
const QUELLE = readFileSync(new URL("../../brain-speicher.js", import.meta.url), "utf8");

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const knoten = (id, extra = {}) => ({ id, art: "praxiswissen", titel: `Eintrag ${id}`, inhalt: "Mo–Fr 8–18 Uhr", tags: ["zeiten"], status: "bestaetigt", quelle: "Test", erstellt: 1000, geaendert: 1000, geschuetzt: false, rev: 0, geloescht: 0, ...extra });
const version = (extra = {}) => ({ zeit: 2000, grund: "bearbeitet", art: "praxiswissen", titel: "vorher", inhalt: "vorher", tags: [], status: "entwurf", quelle: "Test", ...extra });
const kante = (id, extra = {}) => ({ id, von: "k-eins", nach: "k-zwei", art: "verweis", auto: false, ...extra });
const luecke = (id, extra = {}) => ({ id, frage: "Gibt es Parkplätze?", schluessel: "gibt es parkplaetze", erstmals: 1000, zuletzt: 1000, anzahl: 1, status: "offen", knoten: "", ...extra });
const LEER = { knoten: [], kanten: [], luecken: [], nutzung: [], meta: { schema: 1 } };

/** Die Routen /api/brain… im Speicher nachgebaut (dieselben Regeln wie lokal) – so, wie der Worker sie anbieten soll. */
function nachgebauterServer({ konfliktMitDaten = true } = {}) {
  const ablage = S.speicherAblage();
  let bereit = null;
  const rufe = [];
  const api = async (pfad, { methode = "GET", body } = {}) => {
    if (!bereit) bereit = ablage.bereit();
    await bereit;
    const b = body === undefined ? undefined : JSON.parse(JSON.stringify(body)); // wie über die Leitung
    rufe.push({ zeile: `${methode} ${pfad}`, body: b });
    const nichtGefunden = () => Object.assign(new Error("Nicht gefunden."), { status: 404 });
    let m;
    if (pfad === "/api/brain" && methode === "GET") return ablage.laden();
    if ((m = /^\/api\/brain\/knoten\/([^/]+)\/verlauf$/.exec(pfad)) && methode === "GET") return { versionen: await ablage.verlauf(decodeURIComponent(m[1])) };
    if ((m = /^\/api\/brain\/knoten\/([^/]+)$/.exec(pfad))) {
      const id = decodeURIComponent(m[1]);
      if (methode === "PUT") {
        const r = await ablage.knotenSchreiben({ ...b.knoten, id }, { erwartet: b.erwartet, version: b.version, neu: b.neu });
        if (r.konflikt) throw Object.assign(new Error("Der Eintrag wurde inzwischen geändert."), { status: 409 }, konfliktMitDaten ? { daten: { konflikt: true, aktuell: r.aktuell } } : {});
        return { knoten: r.knoten };
      }
      if (methode === "DELETE") {
        if (!(await ablage.laden()).knoten.some((k) => k.id === id)) throw nichtGefunden();
        await ablage.knotenEntfernen([id]);
        return null;
      }
    }
    if (pfad === "/api/brain/stapel" && methode === "POST") return ablage.stapel(b);
    if (pfad === "/api/brain/kanten" && methode === "PUT") { await ablage.kantenSchreiben(b.kanten); return null; }
    if (pfad === "/api/brain/kanten" && methode === "DELETE") { await ablage.kantenEntfernen(b.ids); return null; }
    if (pfad === "/api/brain/luecken" && methode === "PUT") { await ablage.lueckenSchreiben(b.luecken); return null; }
    if (pfad === "/api/brain/luecken" && methode === "DELETE") { await ablage.lueckenEntfernen(b.ids); return null; }
    if (pfad === "/api/brain/nutzung" && methode === "POST") return { nutzung: await ablage.nutzungZaehlen(b.ids, b.zeit) };
    if ((m = /^\/api\/brain\/meta\/([^/]+)$/.exec(pfad)) && methode === "PUT") { await ablage.metaSchreiben(decodeURIComponent(m[1]), b.wert); return null; }
    throw nichtGefunden();
  };
  return { api, rufe, ablage };
}

const VARIANTEN = [
  ["IndexedDB (Nachbau)", () => {
    const idb = falscheIndexedDB();
    return { art: "indexeddb", verlaufMax: 20, idb, tab: async () => { const a = S.idbAblage("gabi-brain", idb, { zeitlimit: 500 }); await a.bereit(); return a; } };
  }],
  ["localStorage (Nachbau)", () => {
    const ls = falscherSpeicher();
    return { art: "localstorage", verlaufMax: 5, ls, tab: async () => { const a = S.lsAblage("gabi.brain.", ls); await a.bereit(); return a; } };
  }],
  ["Arbeitsspeicher", () => {
    const dokument = S.neuesDokument();
    return { art: "speicher", verlaufMax: 20, tab: async () => { const a = S.speicherAblage(dokument); await a.bereit(); return a; } };
  }],
  ["API-Ablage (Supabase über den Worker, Server nachgebaut)", () => {
    const server = nachgebauterServer();
    return { art: "api", verlaufMax: 20, server, tab: async () => { const a = S.apiAblage(server.api); await a.bereit(); return a; } };
  }],
];

// ---------------------------------------------------------------------------
// 1 Dieselbe Reihe für jede Ablage
// ---------------------------------------------------------------------------
describe.each(VARIANTEN)("Brain-Ablage: %s", (_name, bauen) => {
  it("meldet ihre Art und startet leer – nur die Schema-Nummer steht da", async () => {
    const u = bauen();
    const a = await u.tab();
    expect(a.art).toBe(u.art);
    expect(a.verlaufMax).toBe(u.verlaufMax);
    expect(await a.laden()).toEqual(LEER);
    expect(await a.verlauf("k-eins")).toEqual([]);
  });

  it("Schreiben und Laden: rev zählt bei jedem Schreiben hoch, ein zweiter Tab sieht denselben Stand", async () => {
    const u = bauen();
    const a = await u.tab();
    const r1 = await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    expect(r1).toEqual({ ok: true, knoten: { ...knoten("k-eins"), rev: 1 } });
    const r2 = await a.knotenSchreiben({ ...r1.knoten, inhalt: "Mo–Fr 7–19 Uhr", geaendert: 2000 }, { erwartet: 1 });
    expect(r2.knoten.rev).toBe(2);
    const r3 = await a.knotenSchreiben({ ...r2.knoten, status: "entwurf" }); // ohne erwartet: nicht geprüft, rev zählt trotzdem
    expect(r3.knoten.rev).toBe(3);
    const b = await u.tab();
    expect((await b.laden()).knoten).toEqual([{ ...knoten("k-eins"), inhalt: "Mo–Fr 7–19 Uhr", geaendert: 2000, status: "entwurf", rev: 3 }]);
  });

  it("gespeichert wird eine Kopie: spätere Änderungen am übergebenen oder zurückgegebenen Objekt wirken nicht", async () => {
    const u = bauen();
    const a = await u.tab();
    const mein = knoten("k-eins");
    const r = await a.knotenSchreiben(mein, { neu: true });
    mein.titel = "nachträglich geändert";
    mein.tags.push("fremd");
    r.knoten.inhalt = "auch geändert";
    expect((await a.laden()).knoten).toEqual([{ ...knoten("k-eins"), rev: 1 }]);
    expect(mein.rev).toBe(0); // das Objekt des Aufrufers bleibt, wie es war
    // auch Geladenes, der Verlauf und der Stand aus einem Konflikt sind Kopien
    await a.knotenSchreiben({ ...knoten("k-eins"), inhalt: "zweite Fassung" }, { erwartet: 1, version: version() });
    const geladen = await a.laden();
    geladen.knoten[0].titel = "im Speicher verändert?";
    geladen.meta.schema = 99;
    (await a.verlauf("k-eins"))[0].inhalt = "Verlauf verändert?";
    const konflikt = await a.knotenSchreiben(knoten("k-eins"), { erwartet: 1 });
    konflikt.aktuell.inhalt = "über den Konflikt verändert?";
    expect(await a.laden()).toMatchObject({ knoten: [{ ...knoten("k-eins"), inhalt: "zweite Fassung", rev: 2 }], meta: { schema: 1 } });
    expect((await a.verlauf("k-eins"))[0].inhalt).toBe("vorher");
  });

  it("zwei Tabs: wer mit veralteter rev schreibt, bekommt einen Konflikt – nichts wird überschrieben", async () => {
    const u = bauen();
    const [a, b] = [await u.tab(), await u.tab()];
    const start = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    const vonA = await a.knotenSchreiben({ ...start, inhalt: "Fassung A" }, { erwartet: start.rev, version: version() });
    expect(vonA).toMatchObject({ ok: true, knoten: { rev: 2, inhalt: "Fassung A" } });
    const vonB = await b.knotenSchreiben({ ...start, inhalt: "Fassung B" }, { erwartet: start.rev, version: version({ grund: "status" }) });
    expect(vonB).toEqual({ konflikt: true, aktuell: { ...knoten("k-eins"), inhalt: "Fassung A", rev: 2 } });
    expect((await b.laden()).knoten[0]).toMatchObject({ inhalt: "Fassung A", rev: 2 });
    expect(await b.verlauf("k-eins")).toHaveLength(1); // der abgelehnte Stand kam auch nicht in den Verlauf
    // mit dem aktuellen Stand geht es
    const nochmal = await b.knotenSchreiben({ ...vonB.aktuell, inhalt: "Fassung B" }, { erwartet: vonB.aktuell.rev });
    expect(nochmal).toMatchObject({ ok: true, knoten: { rev: 3, inhalt: "Fassung B" } });
  });

  it("zwei Tabs gleichzeitig: genau einer gewinnt", async () => {
    const u = bauen();
    const [a, b] = [await u.tab(), await u.tab()];
    const start = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    const [x, y] = await Promise.all([
      a.knotenSchreiben({ ...start, inhalt: "A" }, { erwartet: 1 }),
      b.knotenSchreiben({ ...start, inhalt: "B" }, { erwartet: 1 }),
    ]);
    expect([Boolean(x.ok), Boolean(y.ok)].sort()).toEqual([false, true]);
    expect([Boolean(x.konflikt), Boolean(y.konflikt)].sort()).toEqual([false, true]);
    expect((await a.laden()).knoten[0].rev).toBe(2);
  });

  it("neu: ein Knoten, den es schon gibt, wird nicht überschrieben (auch nicht im Papierkorb)", async () => {
    const u = bauen();
    const a = await u.tab();
    await a.knotenSchreiben(knoten("k-eins", { geloescht: 5000 }), { neu: true });
    const r = await a.knotenSchreiben(knoten("k-eins", { titel: "ein anderer" }), { neu: true });
    expect(r).toEqual({ konflikt: true, aktuell: { ...knoten("k-eins", { geloescht: 5000 }), rev: 1 } });
    expect((await a.laden()).knoten).toHaveLength(1);
    expect(await a.knotenSchreiben(knoten("k-zwei"), { neu: true })).toMatchObject({ ok: true, knoten: { rev: 1 } });
  });

  it("endgültig entfernt: mit erwartet wird der Knoten nicht wieder angelegt (aktuell: null)", async () => {
    const u = bauen();
    const [a, b] = [await u.tab(), await u.tab()];
    const start = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    await a.knotenEntfernen(["k-eins"]);
    const r = await b.knotenSchreiben({ ...start, inhalt: "noch schnell geändert" }, { erwartet: start.rev, version: version() });
    expect(r).toEqual({ konflikt: true, aktuell: null });
    expect((await b.laden()).knoten).toEqual([]);
    expect(await b.verlauf("k-eins")).toEqual([]);
  });

  it("Verlauf: die Nummer vergibt der Speicher, älteste zuerst, die ältesten fallen heraus", async () => {
    const u = bauen();
    const a = await u.tab();
    let k = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    expect(await a.verlauf("k-eins")).toEqual([]); // ohne version kein Eintrag
    for (let i = 1; i <= 25; i++) {
      k = (await a.knotenSchreiben({ ...k, inhalt: `Stand ${i}` }, { erwartet: k.rev, version: version({ inhalt: `Stand ${i - 1}`, zeit: 2000 + i, nr: 999 }) })).knoten;
    }
    const v = await a.verlauf("k-eins");
    const max = u.verlaufMax;
    expect(v).toHaveLength(max);
    expect(v.map((x) => x.nr)).toEqual(Array.from({ length: max }, (_, i) => 25 - max + 1 + i)); // fortlaufend, 999 zählt nicht
    expect(v[0].inhalt).toBe(`Stand ${25 - max}`);
    expect(v[max - 1]).toEqual({ ...version({ inhalt: "Stand 24", zeit: 2025 }), nr: 25 });
    expect(k.rev).toBe(26);
    expect(await a.verlauf("gibt-es-nicht")).toEqual([]);
    expect(await a.verlauf("")).toEqual([]);
  });

  it("Papierkorb: das Feld geloescht bleibt erhalten, laden() liefert auch Gelöschtes", async () => {
    const u = bauen();
    const a = await u.tab();
    const k = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    await a.knotenSchreiben({ ...k, geloescht: 5000 }, { erwartet: k.rev, version: version({ grund: "status" }) });
    expect((await a.laden()).knoten).toEqual([{ ...knoten("k-eins"), geloescht: 5000, rev: 2 }]);
  });

  it("endgültiges Entfernen nimmt Verlauf und Nutzung mit – andere Knoten bleiben unberührt", async () => {
    const u = bauen();
    const a = await u.tab();
    for (const id of ["k-eins", "k-zwei"]) {
      const k = (await a.knotenSchreiben(knoten(id), { neu: true })).knoten;
      await a.knotenSchreiben({ ...k, inhalt: "neu" }, { erwartet: 1, version: version() });
    }
    await a.nutzungZaehlen(["k-eins", "k-zwei"], 3000);
    await a.kantenSchreiben([kante("ka-1")]);
    await a.knotenEntfernen(["k-eins", "gibt-es-nicht", "", null]);
    const d = await a.laden();
    expect(d.knoten.map((k) => k.id)).toEqual(["k-zwei"]);
    expect(d.nutzung).toEqual([{ id: "k-zwei", anzahl: 1, zuletzt: 3000 }]);
    expect(await a.verlauf("k-eins")).toEqual([]);
    expect(await a.verlauf("k-zwei")).toHaveLength(1);
    expect(d.kanten).toHaveLength(1); // Kanten räumt das Modell selbst (kantenEntfernen)
  });

  it("Nutzung: zwei Tabs gleichzeitig – beide gezählt; doppelt genannt zählt einmal; Unbekanntes zählt nicht", async () => {
    const u = bauen();
    const [a, b] = [await u.tab(), await u.tab()];
    await a.stapel({ knoten: [knoten("k-eins"), knoten("k-zwei")] });
    await Promise.all([a.nutzungZaehlen(["k-eins"], 5000), b.nutzungZaehlen(["k-eins", "k-zwei"], 6000)]);
    expect((await a.laden()).nutzung).toEqual([{ id: "k-eins", anzahl: 2, zuletzt: 6000 }, { id: "k-zwei", anzahl: 1, zuletzt: 6000 }]);
    const r = await a.nutzungZaehlen(["k-eins", "k-eins", "gibt-es-nicht", "", null, "mit leerzeichen"], 100);
    expect(r).toEqual([{ id: "k-eins", anzahl: 3, zuletzt: 6000 }]); // zuletzt geht nie zurück
    expect(await a.nutzungZaehlen([], 1)).toEqual([]);
    const d = await b.laden();
    expect(d.nutzung).toEqual([{ id: "k-eins", anzahl: 3, zuletzt: 6000 }, { id: "k-zwei", anzahl: 1, zuletzt: 6000 }]);
    expect(d.knoten.map((k) => [k.rev, k.geaendert])).toEqual([[1, 1000], [1, 1000]]); // Nutzung ändert den Knoten nicht
  });

  it("Stapel: Knoten, Kanten und Verlauf in einem Vorgang; rev wie geliefert, aber immer über der gespeicherten", async () => {
    const u = bauen();
    const a = await u.tab();
    const r = await a.stapel({
      knoten: [knoten("s-eins", { rev: 1 }), knoten("s-zwei", { rev: 7 }), knoten("s-drei")],
      kanten: [kante("sk-1", { von: "s-eins", nach: "s-zwei", art: "gehoert_zu" })],
      versionen: { "s-eins": [version({ grund: "seed" })] },
    });
    expect(r.ok).toBe(true);
    expect(r.knoten.map((k) => [k.id, k.rev])).toEqual([["s-eins", 1], ["s-zwei", 7], ["s-drei", 1]]);
    const r2 = await a.stapel({ knoten: [knoten("s-eins", { rev: 1, inhalt: "aus dem Import" }), knoten("s-zwei", { rev: 3 })], versionen: { "s-eins": [version({ grund: "import" }), version({ grund: "import" })] } });
    expect(r2.knoten.map((k) => k.rev)).toEqual([2, 8]);
    const d = await a.laden();
    expect(d.knoten.map((k) => [k.id, k.rev])).toEqual([["s-drei", 1], ["s-eins", 2], ["s-zwei", 8]]);
    expect(d.knoten.find((k) => k.id === "s-eins").inhalt).toBe("aus dem Import");
    expect(d.kanten).toEqual([kante("sk-1", { von: "s-eins", nach: "s-zwei", art: "gehoert_zu" })]);
    expect((await a.verlauf("s-eins")).map((v) => [v.nr, v.grund])).toEqual([[1, "seed"], [2, "import"], [3, "import"]]);
    expect(await a.stapel({})).toEqual({ ok: true, knoten: [] });
  });

  it("Stapel prüft erst alles: ein ungültiger Eintrag, und nichts wird geschrieben", async () => {
    const u = bauen();
    const a = await u.tab();
    await expect(a.stapel({ knoten: [knoten("s-eins"), { titel: "ohne Kennung" }] })).rejects.toThrow(/keine gültige Kennung/);
    await expect(a.stapel({ knoten: [knoten("s-eins"), knoten("p-123", { art: "patient", abgeleitet: true })] })).rejects.toThrow(/nicht im Brain gespeichert/);
    await expect(a.stapel({ knoten: [knoten("s-eins")], kanten: [{ von: "s-eins", nach: "s-zwei" }] })).rejects.toThrow(/Verbindung/);
    await expect(a.stapel({ knoten: [knoten("s-eins")], versionen: { "mit leerzeichen": [version()] } })).rejects.toThrow(/Kennung/);
    await expect(a.stapel({ knoten: [knoten("s-eins")], meta: { schema: 99 } })).rejects.toThrow(/Schema-Nummer/);
    expect(await a.laden()).toEqual(LEER);
  });

  it("Stapel mit Bedingung: zwei Tabs spielen den Seed nicht doppelt ein; Lücken, Nutzung und Einstellungen gehen mit", async () => {
    const u = bauen();
    const [a, b] = [await u.tab(), await u.tab()];
    const seed = { knoten: [knoten("s-eins")], luecken: [luecke("l-1")], nutzung: [{ id: "s-eins", anzahl: 4, zuletzt: 9000 }], meta: { seed: "abc" }, nurWennMeta: { schluessel: "seed" } };
    const [x, y] = await Promise.all([a.stapel(seed), b.stapel(seed)]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect([x, y].find((r) => !r.ok)).toEqual({ ok: false, uebersprungen: true });
    const d = await a.laden();
    expect(d.knoten).toEqual([{ ...knoten("s-eins"), rev: 1 }]); // nur einmal geschrieben
    expect(d.luecken).toEqual([luecke("l-1")]);
    expect(d.nutzung).toEqual([{ id: "s-eins", anzahl: 4, zuletzt: 9000 }]);
    expect(d.meta).toEqual({ schema: 1, seed: "abc" });
    // passt der Wert, läuft der Stapel (z. B. neuer Seed-Stand)
    expect(await a.stapel({ knoten: [knoten("s-zwei")], meta: { seed: "def" }, nurWennMeta: { schluessel: "seed", wert: "abc" } })).toMatchObject({ ok: true });
    expect(await a.stapel({ knoten: [knoten("s-drei")], nurWennMeta: { schluessel: "seed", wert: "abc" } })).toEqual({ ok: false, uebersprungen: true });
    expect((await a.laden()).knoten.map((k) => k.id)).toEqual(["s-eins", "s-zwei"]);
  });

  it("Kanten, Lücken und Einstellungen: schreiben, überschreiben, entfernen", async () => {
    const u = bauen();
    const a = await u.tab();
    await a.kantenSchreiben([kante("ka-1"), kante("ka-2", { art: "gehoert_zu" })]);
    await a.kantenSchreiben([kante("ka-1", { art: "gehoert_zu" })]);
    await a.kantenEntfernen(["ka-2", "gibt-es-nicht"]);
    await a.lueckenSchreiben([luecke("l-1"), luecke("l-2", { frage: "Hausbesuche?" })]);
    await a.lueckenSchreiben([luecke("l-1", { anzahl: 3, zuletzt: 4000 })]);
    await a.lueckenEntfernen(["l-2"]);
    await a.metaSchreiben("seed", "abc");
    await a.metaSchreiben("audit", [{ zeit: 1, faehigkeit: "praxisfragen" }]);
    await a.metaSchreiben("weg", { a: 1 });
    await a.metaSchreiben("weg", undefined); // undefined = entfernen
    await a.kantenSchreiben([]);
    await a.lueckenEntfernen([]);
    const d = await (await u.tab()).laden();
    expect(d.kanten).toEqual([kante("ka-1", { art: "gehoert_zu" })]);
    expect(d.luecken).toEqual([luecke("l-1", { anzahl: 3, zuletzt: 4000 })]);
    expect(d.meta).toEqual({ schema: 1, seed: "abc", audit: [{ zeit: 1, faehigkeit: "praxisfragen" }] });
  });

  it("Ungültiges wird mit einem deutschen Satz abgelehnt – und nichts geschrieben", async () => {
    const u = bauen();
    const a = await u.tab();
    for (const schlecht of [null, "text", {}, { id: "" }, { id: "mit leerzeichen" }, { id: "__proto__" }, { id: 7 }, { id: "x".repeat(81) }]) {
      await expect(a.knotenSchreiben(schlecht)).rejects.toThrow(/keine gültige Kennung/);
    }
    await expect(a.knotenSchreiben(knoten("p-abc", { art: "patient", abgeleitet: true }))).rejects.toThrow(/nicht im Brain gespeichert/);
    await expect(a.knotenSchreiben(knoten("k-eins"), { version: "kein Objekt" })).rejects.toThrow(/Verlauf/);
    await expect(a.kantenSchreiben([{ von: "a", nach: "b" }])).rejects.toThrow(/Verbindung/);
    await expect(a.lueckenSchreiben([{ frage: "?" }])).rejects.toThrow(/Wissenslücke/);
    await expect(a.metaSchreiben("schema", 99)).rejects.toThrow(/Schema-Nummer/);
    await expect(a.metaSchreiben("mit leerzeichen", 1)).rejects.toThrow(/Ungültiger Schlüssel/);
    await expect(a.metaSchreiben("__proto__", 1)).rejects.toThrow(/Ungültiger Schlüssel/);
    expect(await a.laden()).toEqual(LEER);
  });

  it("Leeren nimmt alles – die Schema-Nummer bleibt (das gemeinsame Brain lässt sich nicht leeren)", async () => {
    const u = bauen();
    const a = await u.tab();
    const k = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    await a.knotenSchreiben({ ...k, inhalt: "neu" }, { erwartet: 1, version: version() });
    await a.kantenSchreiben([kante("ka-1")]);
    await a.lueckenSchreiben([luecke("l-1")]);
    await a.nutzungZaehlen(["k-eins"], 3000);
    await a.metaSchreiben("seed", "abc");
    if (u.art === "api") {
      await expect(a.leeren()).rejects.toThrow(/nicht leeren/);
      expect((await a.laden()).knoten).toHaveLength(1);
      return;
    }
    await a.leeren();
    expect(await a.laden()).toEqual(LEER);
    expect(await a.verlauf("k-eins")).toEqual([]);
    // danach geht es normal weiter
    expect(await a.knotenSchreiben(knoten("k-eins"), { neu: true })).toMatchObject({ ok: true, knoten: { rev: 1 } });
  });
});

// ---------------------------------------------------------------------------
// 2 IndexedDB im Besonderen
// ---------------------------------------------------------------------------
describe("IndexedDB-Ablage", () => {
  const neu = async (idb = falscheIndexedDB(), name = "gabi-brain") => {
    const a = S.idbAblage(name, idb, { zeitlimit: 500 });
    await a.bereit();
    return { a, idb };
  };

  it("legt genau die Stores aus dem Bauplan an; die Schreibprobe hinterlässt nichts", async () => {
    const { idb } = await neu();
    expect(idb.namen()).toEqual(["gabi-brain"]);
    expect(S.STORES).toEqual(["knoten", "versionen", "kanten", "luecken", "nutzung", "meta"]);
    for (const s of S.STORES) expect(idb.inhalt("gabi-brain", s), s).not.toBeNull();
    expect(idb.inhalt("gabi-brain", "meta")).toEqual([{ schluessel: "schema", wert: 1 }]);
    // bereit() ein zweites Mal: keine zweite Verbindung, nichts doppelt
    const { a, idb: idb2 } = await neu();
    await a.bereit();
    expect(idb2.verbindungen("gabi-brain")).toBe(1);
    expect(idb2.zaehler.geoeffnet).toBe(1);
  });

  it("ein Vorgang = genau eine Transaktion (Lesen, Prüfen und Schreiben lassen sich nicht auseinanderreißen)", async () => {
    const { a, idb } = await neu();
    const zaehle = async (tun) => { const vorher = idb.zaehler.transaktionen; await tun(); return idb.zaehler.transaktionen - vorher; };
    expect(await zaehle(() => a.knotenSchreiben(knoten("k-eins"), { neu: true }))).toBe(1);
    expect(await zaehle(() => a.knotenSchreiben(knoten("k-eins", { inhalt: "neu" }), { erwartet: 1, version: version() }))).toBe(1);
    expect(await zaehle(() => a.nutzungZaehlen(["k-eins"], 1))).toBe(1);
    expect(await zaehle(() => a.stapel({ knoten: [knoten("s-eins"), knoten("s-zwei")], kanten: [kante("sk-1")], versionen: { "s-eins": [version()] }, meta: { seed: "x" }, nurWennMeta: { schluessel: "seed" } }))).toBe(1);
    expect(await zaehle(() => a.knotenEntfernen(["k-eins", "s-eins"]))).toBe(1);
    expect(await zaehle(() => a.laden())).toBe(1);
    expect(await zaehle(() => a.leeren())).toBe(1);
  });

  it("Stapel: scheitert ein Schreiben mittendrin, ist nichts geschrieben", async () => {
    const { a, idb } = await neu();
    await a.knotenSchreiben(knoten("k-alt"), { neu: true });
    idb.fehlerBeimSchreiben = 4;
    await expect(a.stapel({ knoten: [knoten("s-eins"), knoten("s-zwei"), knoten("s-drei"), knoten("k-alt", { inhalt: "überschrieben" })], kanten: [kante("sk-1")], versionen: { "s-eins": [version()] } }))
      .rejects.toThrow(/konnte nicht gespeichert werden/);
    const d = await a.laden();
    expect(d.knoten).toEqual([{ ...knoten("k-alt"), rev: 1 }]);
    expect(d.kanten).toEqual([]);
    expect(await a.verlauf("s-eins")).toEqual([]);
    // der nächste Versuch klappt
    expect((await a.stapel({ knoten: [knoten("s-eins")] })).ok).toBe(true);
  });

  it("Knoten und Verlauf gehören zusammen: scheitert der Verlauf, bleibt auch der Knoten beim alten Stand", async () => {
    const { a, idb } = await neu();
    const k = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    idb.fehlerBeimSchreiben = 2; // 1 = Knoten, 2 = Verlauf
    await expect(a.knotenSchreiben({ ...k, inhalt: "neu" }, { erwartet: 1, version: version() })).rejects.toThrow(/konnte nicht gespeichert werden/);
    expect((await a.laden()).knoten).toEqual([{ ...knoten("k-eins"), rev: 1 }]);
    expect(await a.verlauf("k-eins")).toEqual([]);
  });

  it("wirft ein Schreibbefehl mitten im Vorgang, wird die ganze Transaktion abgebrochen – auch das schon Abgeschickte bleibt nicht stehen", async () => {
    const { a, idb } = await neu();
    idb.wurfBeimSchreiben = 3; // der dritte put() wirft sofort – die ersten beiden sind schon abgeschickt
    await expect(a.stapel({ knoten: [knoten("s-eins"), knoten("s-zwei"), knoten("s-drei"), knoten("s-vier")] })).rejects.toThrow(/konnte nicht gespeichert werden/);
    expect((await a.laden()).knoten).toEqual([]);
    expect((await a.stapel({ knoten: [knoten("s-eins")] })).ok).toBe(true);
  });

  it("lässt die Datenbank nicht schreiben (privates Fenster): bereit() scheitert und lässt keine Verbindung offen", async () => {
    const idb = falscheIndexedDB();
    idb.schreibenScheitert = true;
    await expect(S.idbAblage("gabi-brain", idb, { zeitlimit: 500 }).bereit()).rejects.toThrow();
    expect(idb.verbindungen("gabi-brain")).toBe(0);
    // auch eine schon gestempelte, leere Datenbank: die Schreibprobe läuft bei jedem Öffnen
    const idb2 = falscheIndexedDB();
    (await neu(idb2)).a.schliessen();
    idb2.schreibenScheitert = true;
    await expect(S.idbAblage("gabi-brain", idb2, { zeitlimit: 500 }).bereit()).rejects.toThrow();
    expect(idb2.verbindungen("gabi-brain")).toBe(0);
  });

  it("liegt schon ein Brain in der Datenbank und sie lässt gerade nicht schreiben (Gerät voll): bleibt sichtbar – nur lesen, Speichern nennt den Grund", async () => {
    const { a, idb } = await neu();
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    a.schliessen();
    idb.schreibenScheitert = true;
    const b = S.idbAblage("gabi-brain", idb, { zeitlimit: 500 });
    await b.bereit();
    expect(b.nurLesen).toBe(true);
    expect((await b.laden()).knoten).toEqual([{ ...knoten("k-eins"), rev: 1 }]);
    const f = await b.knotenSchreiben(knoten("k-eins", { inhalt: "neu" }), { erwartet: 1 }).catch((e) => e);
    expect(f.message).toMatch(/Speicher dieses Browsers ist voll/);
    expect(f.voll).toBe(true);
    idb.schreibenScheitert = false; // wieder Platz: es geht ohne Neuladen weiter
    expect(await b.knotenSchreiben(knoten("k-eins", { inhalt: "neu" }), { erwartet: 1 })).toMatchObject({ ok: true, knoten: { rev: 2 } });
  });

  it("hängt das Öffnen: bereit() gibt nach dem Zeitlimit auf; kommt die Datenbank später doch, wird sie wieder geschlossen", async () => {
    const haengt = falscheIndexedDB();
    haengt.oeffnenHaengt = true;
    await expect(S.idbAblage("gabi-brain", haengt, { zeitlimit: 20 }).bereit()).rejects.toThrow(/antwortet nicht/);
    // langsam statt nie: meldet sich erst nach 80 ms
    const echt = falscheIndexedDB();
    const langsam = {
      open(name, version) {
        const r = {};
        setTimeout(() => {
          const q = echt.open(name, version);
          q.onupgradeneeded = () => { r.result = q.result; if (r.onupgradeneeded) r.onupgradeneeded(); };
          q.onsuccess = () => { r.result = q.result; if (r.onsuccess) r.onsuccess(); };
        }, 80);
        return r;
      },
    };
    await expect(S.idbAblage("gabi-brain", langsam, { zeitlimit: 20 }).bereit()).rejects.toThrow(/antwortet nicht/);
    await warte(160);
    expect(echt.namen()).toEqual(["gabi-brain"]);
    expect(echt.verbindungen("gabi-brain")).toBe(0);
  });

  it("geschlossen (von Hand oder weil ein anderer Tab die Datenbank abräumt): verständlicher Fehler statt Neuanlage", async () => {
    const { a, idb } = await neu();
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    idb.deleteDatabase("gabi-brain"); // ruft onversionchange → die Ablage macht Platz
    await warte(20);
    expect(idb.namen()).toEqual([]);
    const f = await a.knotenSchreiben(knoten("k-zwei"), { neu: true }).catch((e) => e);
    expect(f.message).toMatch(/nicht mehr geöffnet/);
    expect(f.geschlossen).toBe(true);
    await expect(a.laden()).rejects.toThrow(/nicht mehr geöffnet/);
    expect(idb.namen()).toEqual([]); // nichts wieder angelegt
    const { a: b } = await neu();
    b.schliessen();
    await expect(b.laden()).rejects.toThrow(/nicht mehr geöffnet/);
  });
});

// ---------------------------------------------------------------------------
// 3 localStorage im Besonderen
// ---------------------------------------------------------------------------
describe("localStorage-Ablage", () => {
  it("ein Dokument „gabi.brain.v1“ (Demo: „gabi.demo.brain.v1“) – die Schreibprobe hinterlässt nichts", async () => {
    const ls = falscherSpeicher();
    const a = S.lsAblage("gabi.brain.", ls);
    await a.bereit();
    const demo = S.lsAblage("gabi.demo.brain.", ls);
    await demo.bereit();
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    expect(ls.schluessel()).toEqual(["gabi.brain.v1", "gabi.demo.brain.v1"]);
    expect(JSON.parse(ls.getItem("gabi.brain.v1")).knoten["k-eins"].rev).toBe(1);
    expect((await demo.laden()).knoten).toEqual([]);
    expect(S.VERLAUF_MAX_LS).toBe(5);
    expect(a.verlaufMax).toBe(5);
  });

  it("voller Speicher: verständlicher Fehler, der alte Stand bleibt stehen (kein stiller Verlust)", async () => {
    const ls = falscherSpeicher({ grenze: 2500 });
    const a = S.lsAblage("gabi.brain.", ls);
    await a.bereit();
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    const vorher = ls.getItem("gabi.brain.v1");
    const f = await a.knotenSchreiben(knoten("k-zwei", { inhalt: "x".repeat(5000) }), { neu: true }).catch((e) => e);
    expect(f.message).toMatch(/Speicher dieses Browsers ist voll/);
    expect(f.voll).toBe(true);
    expect(ls.getItem("gabi.brain.v1")).toBe(vorher);
    expect((await a.laden()).knoten).toEqual([{ ...knoten("k-eins"), rev: 1 }]);
    await expect(a.knotenSchreiben(knoten("k-eins", { inhalt: "y".repeat(5000) }), { erwartet: 1, version: version() })).rejects.toThrow(/voll/);
    expect((await a.laden()).knoten[0].rev).toBe(1);
  });

  it("unlesbares Dokument: wird beiseitegelegt, nicht still weggeworfen – die Ablage beginnt leer", async () => {
    const ls = falscherSpeicher();
    ls.setItem("gabi.brain.v1", "{kaputt");
    const a = S.lsAblage("gabi.brain.", ls);
    await a.bereit();
    expect(await a.laden()).toEqual(LEER);
    expect(ls.getItem("gabi.brain.v1.defekt")).toBe("{kaputt");
    // auch ein Dokument in falscher Form (Liste statt Objekt) zählt als unlesbar
    const ls2 = falscherSpeicher();
    ls2.setItem("gabi.brain.v1", "[1,2]");
    const b = S.lsAblage("gabi.brain.", ls2);
    await b.bereit();
    expect((await b.laden()).knoten).toEqual([]);
  });

  it("gesperrter Speicher: bereit() scheitert (dann nimmt oeffnen() die nächste Ablage)", async () => {
    const ls = falscherSpeicher();
    ls.gesperrt = true;
    await expect(S.lsAblage("gabi.brain.", ls).bereit()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4 API-Ablage im Besonderen (Entwurf für Supabase über den Worker)
// ---------------------------------------------------------------------------
describe("API-Ablage", () => {
  it("nutzt genau die vereinbarten Routen, Methoden und Bodies", async () => {
    const server = nachgebauterServer();
    const a = S.apiAblage(server.api);
    await a.laden();
    const k = (await a.knotenSchreiben(knoten("k-eins"), { neu: true })).knoten;
    await a.knotenSchreiben({ ...k, inhalt: "neu" }, { erwartet: 1, version: version() });
    await a.verlauf("k-eins");
    await a.stapel({ knoten: [knoten("s-eins")], kanten: [kante("sk-1")], versionen: { "s-eins": [version()] } });
    await a.kantenSchreiben([kante("ka-1")]);
    await a.kantenEntfernen(["ka-1"]);
    await a.lueckenSchreiben([luecke("l-1")]);
    await a.lueckenEntfernen(["l-1"]);
    await a.nutzungZaehlen(["k-eins"], 4000);
    await a.metaSchreiben("seed.stand", "abc");
    await a.knotenEntfernen(["k-eins"]);
    expect(server.rufe.map((r) => r.zeile)).toEqual([
      "GET /api/brain",
      "PUT /api/brain/knoten/k-eins",
      "PUT /api/brain/knoten/k-eins",
      "GET /api/brain/knoten/k-eins/verlauf",
      "POST /api/brain/stapel",
      "PUT /api/brain/kanten",
      "DELETE /api/brain/kanten",
      "PUT /api/brain/luecken",
      "DELETE /api/brain/luecken",
      "POST /api/brain/nutzung",
      "PUT /api/brain/meta/seed.stand",
      "DELETE /api/brain/knoten/k-eins",
    ]);
    expect(server.rufe[1].body).toEqual({ knoten: knoten("k-eins"), version: null, neu: true });
    expect(server.rufe[2].body).toEqual({ knoten: { ...knoten("k-eins"), rev: 1, inhalt: "neu" }, erwartet: 1, version: version(), neu: false });
    expect(server.rufe[4].body).toEqual({ knoten: [knoten("s-eins")], kanten: [kante("sk-1")], versionen: { "s-eins": [version()] } }); // ohne Erweiterungen: nur der Grundvertrag
    expect(server.rufe[6].body).toEqual({ ids: ["ka-1"] });
    expect(server.rufe[9].body).toEqual({ ids: ["k-eins"], zeit: 4000 });
    expect(server.rufe[10].body).toEqual({ wert: "abc" });
    expect(server.rufe[0].body).toBeUndefined();
  });

  it("409 ist ein Konflikt, kein Fehler – auch wenn api() den Antworttext nicht durchreicht (dann holt die Ablage den Stand selbst)", async () => {
    const server = nachgebauterServer({ konfliktMitDaten: false });
    const a = S.apiAblage(server.api);
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    await a.knotenSchreiben(knoten("k-eins", { inhalt: "A" }), { erwartet: 1 });
    const r = await a.knotenSchreiben(knoten("k-eins", { inhalt: "B" }), { erwartet: 1 });
    expect(r).toEqual({ konflikt: true, aktuell: { ...knoten("k-eins"), inhalt: "A", rev: 2 } });
    expect(server.rufe.map((x) => x.zeile).slice(-2)).toEqual(["PUT /api/brain/knoten/k-eins", "GET /api/brain"]);
    // endgültig entfernt: aktuell null
    await a.knotenEntfernen(["k-eins"]);
    expect(await a.knotenSchreiben(knoten("k-eins", { inhalt: "C" }), { erwartet: 2 })).toEqual({ konflikt: true, aktuell: null });
  });

  it("andere Fehler gehen mit Status und Text unverändert an die Oberfläche; ein schon entfernter Knoten ist kein Fehler", async () => {
    const kaputt = async () => { throw Object.assign(new Error("Server-Fehler (500). Bitte nochmal versuchen."), { status: 500 }); };
    const a = S.apiAblage(kaputt);
    for (const tun of [() => a.laden(), () => a.knotenSchreiben(knoten("k-eins")), () => a.knotenEntfernen(["k-eins"]), () => a.verlauf("k-eins"), () => a.stapel({ knoten: [knoten("k-eins")] }), () => a.nutzungZaehlen(["k-eins"], 1), () => a.metaSchreiben("seed", 1)]) {
      const f = await tun().catch((e) => e);
      expect(f.status).toBe(500);
      expect(f.message).toMatch(/Server-Fehler/);
    }
    const server = nachgebauterServer();
    const b = S.apiAblage(server.api);
    await expect(b.knotenEntfernen(["gibt-es-nicht"])).resolves.toBeUndefined(); // 404 = schon weg
    // ohne Arbeit keine Anfrage
    const vorher = server.rufe.length;
    await b.kantenSchreiben([]); await b.kantenEntfernen([]); await b.lueckenSchreiben([]); await b.lueckenEntfernen(["", null]); await b.knotenEntfernen([]);
    expect(await b.nutzungZaehlen([], 1)).toEqual([]);
    expect(await b.verlauf("mit leerzeichen")).toEqual([]);
    expect(server.rufe.length).toBe(vorher);
  });

  it("kein eigenes fetch in der Datei – jede Anfrage läuft über api() der App (Zugangscode, Zeitlimit, Fehlertexte)", () => {
    expect(QUELLE).not.toMatch(/\bfetch\s*\(/);
    expect(QUELLE).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket/);
  });
});

// ---------------------------------------------------------------------------
// 5 Öffnen: Ersatzkette, Demo und echt getrennt, offenes Löschen nachholen
// ---------------------------------------------------------------------------
describe("oeffnen(): beste verfügbare Ablage", () => {
  const umgebung = (extra = {}) => ({ indexedDB: falscheIndexedDB(), localStorage: falscherSpeicher(), sessionStorage: falscherSpeicher(), ...extra });

  it("nimmt IndexedDB, wenn sie da ist und schreiben lässt", async () => {
    const u = umgebung();
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(a.art).toBe("indexeddb");
    expect(a.schema).toBe(1);
    expect(u.indexedDB.namen()).toEqual(["gabi-brain"]);
    expect(u.localStorage.schluessel()).toEqual([]); // kein Ersatz-Dokument angelegt
  });

  it("IndexedDB hängt → localStorage", async () => {
    const u = umgebung();
    u.indexedDB.oeffnenHaengt = true;
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 20 });
    expect(a.art).toBe("localstorage");
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    expect(u.localStorage.schluessel()).toEqual(["gabi.brain.v1"]);
  });

  it("IndexedDB öffnet, lässt aber nicht schreiben → localStorage (und keine offene Verbindung bleibt zurück)", async () => {
    const u = umgebung();
    u.indexedDB.schreibenScheitert = true;
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(a.art).toBe("localstorage");
    expect(u.indexedDB.verbindungen("gabi-brain")).toBe(0);
  });

  it("IndexedDB mit vorhandenem Brain lässt gerade nicht schreiben → KEIN Ausweichen in ein leeres Ersatz-Brain (nur lesen)", async () => {
    const u = umgebung();
    const vorher = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    await vorher.knotenSchreiben(knoten("k-eins"), { neu: true });
    vorher.schliessen();
    u.indexedDB.schreibenScheitert = true;
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(a.art).toBe("indexeddb");
    expect(a.nurLesen).toBe(true);
    expect((await a.laden()).knoten.map((k) => k.id)).toEqual(["k-eins"]);
    expect(u.localStorage.schluessel()).toEqual([]);
    // soll aber gelöscht werden (offene Marke) und es geht nicht: Marke bleibt, weiter im Ersatz – das alte Brain wird nicht gezeigt
    a.schliessen();
    u.localStorage.setItem("gabi.brain.leeren-offen", "1");
    const b = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(b.art).toBe("localstorage");
    expect((await b.laden()).knoten).toEqual([]);
    expect(u.localStorage.getItem("gabi.brain.leeren-offen")).toBe("1");
    expect(u.indexedDB.verbindungen("gabi-brain")).toBe(0);
  });

  it("IndexedDB meldet einen Fehler → localStorage", async () => {
    const u = umgebung();
    u.indexedDB.oeffnenScheitert = true;
    expect((await S.oeffnen({ umgebung: u, zeitlimit: 500 })).art).toBe("localstorage");
  });

  it("weder IndexedDB noch localStorage (fehlt, gesperrt oder schon der Zugriff wirft) → nur dieser Tab", async () => {
    expect((await S.oeffnen({ umgebung: {} })).art).toBe("speicher");
    const gesperrt = umgebung({ indexedDB: undefined });
    gesperrt.localStorage.gesperrt = true;
    expect((await S.oeffnen({ umgebung: gesperrt })).art).toBe("speicher");
    const wirft = {};
    Object.defineProperty(wirft, "indexedDB", { get() { throw new Error("SecurityError"); } });
    Object.defineProperty(wirft, "localStorage", { get() { throw new Error("SecurityError"); } });
    const a = await S.oeffnen({ umgebung: wirft });
    expect(a.art).toBe("speicher");
    expect(await a.knotenSchreiben(knoten("k-eins"), { neu: true })).toMatchObject({ ok: true }); // arbeitet trotzdem
  });

  it("Demo und echt sind getrennt: eigene Datenbanken, nichts sickert durch – die Gespräche („gabi“) bleiben unberührt", async () => {
    const u = umgebung();
    const echt = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    const demo = await S.oeffnen({ demo: true, umgebung: u, zeitlimit: 500 });
    await echt.knotenSchreiben(knoten("k-echt"), { neu: true });
    await echt.metaSchreiben("seed", "echt");
    await demo.knotenSchreiben(knoten("k-demo"), { neu: true });
    await demo.nutzungZaehlen(["k-demo"], 1);
    expect(u.indexedDB.namen()).toEqual(["gabi-brain", "gabi-brain-demo"]);
    expect((await echt.laden()).knoten.map((k) => k.id)).toEqual(["k-echt"]);
    expect((await echt.laden()).nutzung).toEqual([]);
    expect((await demo.laden()).knoten.map((k) => k.id)).toEqual(["k-demo"]);
    expect((await demo.laden()).meta).toEqual({ schema: 1 });
    await demo.leeren();
    expect((await echt.laden()).knoten.map((k) => k.id)).toEqual(["k-echt"]);
  });

  it("Demo und echt sind auch im Ersatz getrennt (localStorage-Schlüssel)", async () => {
    const u = umgebung({ indexedDB: undefined });
    const echt = await S.oeffnen({ umgebung: u });
    const demo = await S.oeffnen({ demo: true, umgebung: u });
    await echt.knotenSchreiben(knoten("k-echt"), { neu: true });
    await demo.knotenSchreiben(knoten("k-demo"), { neu: true });
    expect(u.localStorage.schluessel()).toEqual(["gabi.brain.v1", "gabi.demo.brain.v1"]);
    expect((await echt.laden()).knoten.map((k) => k.id)).toEqual(["k-echt"]);
    expect((await demo.laden()).knoten.map((k) => k.id)).toEqual(["k-demo"]);
    expect(S.namen(false)).toEqual({ db: "gabi-brain", vorsatz: "gabi.brain.", kanal: "gabi-brain", marke: "gabi.brain.leeren-offen", notfall: "gabi.brain.notfall" });
    expect(S.namen(true)).toEqual({ db: "gabi-brain-demo", vorsatz: "gabi.demo.brain.", kanal: "gabi-brain-demo", marke: "gabi.demo.brain.leeren-offen", notfall: "gabi.demo.brain.notfall" });
  });

  it("offenes Löschen von einem früheren Abmelden wird beim Öffnen zuerst nachgeholt (je Betrieb eigene Marke)", async () => {
    const u = umgebung();
    const vorher = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    await vorher.knotenSchreiben(knoten("k-eins"), { neu: true });
    const demo = await S.oeffnen({ demo: true, umgebung: u, zeitlimit: 500 });
    await demo.knotenSchreiben(knoten("k-demo"), { neu: true });
    u.localStorage.setItem("gabi.brain.leeren-offen", "1");
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(a.nachgeholt).toBe(true);
    expect(await a.laden()).toEqual(LEER);
    expect(u.localStorage.getItem("gabi.brain.leeren-offen")).toBeNull();
    const d2 = await S.oeffnen({ demo: true, umgebung: u, zeitlimit: 500 });
    expect(d2.nachgeholt).toBeUndefined();
    expect((await d2.laden()).knoten.map((k) => k.id)).toEqual(["k-demo"]); // die Demo-Daten gehörten nicht dazu
  });

  it("Datenbank von einer neueren Gabi (höhere Version): kein Ausweichen in ein leeres Ersatz-Brain – nur dieser Tab, mit Kennzeichen", async () => {
    const u = umgebung();
    await new Promise((ok) => { const r = u.indexedDB.open("gabi-brain", 2); r.onupgradeneeded = () => {}; r.onsuccess = () => { r.result.close(); ok(); }; });
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(a.art).toBe("speicher");
    expect(a.schemaFremd).toBe(true);
    expect(u.localStorage.schluessel()).toEqual([]);
    await expect(a.stapel({ knoten: [knoten("s-eins")] })).rejects.toThrow(/neueren Gabi/); // kein Seed in ein Ersatz-Brain
    expect(await a.laden()).toEqual(LEER);
  });
});

// ---------------------------------------------------------------------------
// 6 Migration
// ---------------------------------------------------------------------------
describe("Migration auf das aktuelle Schema", () => {
  const ALT = {
    knoten: [
      { id: "k-offen", art: "frage", titel: "Parken?", inhalt: "", tags: ["standort"], status: "offen", quelle: "Julius", erstellt: 10, geaendert: 20 },
      { id: "k-fest", art: "praxiswissen", titel: "Kontakt", inhalt: "…", status: "bestaetigt", quelle: "physio-works.de", erstellt: 10, geaendert: 20, rev: 4, geloescht: 99, geschuetzt: 1 },
      { titel: "ohne Kennung" },
    ],
    versionen: { "k-offen": [{ nr: 1, zeit: 5, grund: "bearbeitet", status: "offen", titel: "Parken", inhalt: "" }], "mit leerzeichen": [{ nr: 1 }] },
    kanten: [{ id: "ka-1", von: "k-offen", nach: "k-fest", art: "verweis", auto: false }],
    luecken: [{ id: "l-1", frage: "Hausbesuche?" }],
    nutzung: [{ id: "k-fest", anzahl: 2, zuletzt: 30 }],
    meta: { seed: "abc" },
  };

  it("migrieren() ist rein: Schema 0 → 1 (Status „offen“ → „zu_klaeren“, rev und geloescht ergänzt), Eingabe bleibt unverändert", () => {
    const vorher = JSON.stringify(ALT);
    const neu = S.migrieren(ALT, 0);
    expect(JSON.stringify(ALT)).toBe(vorher);
    expect(neu.knoten).toEqual([
      { ...ALT.knoten[0], status: "zu_klaeren", rev: 1, geloescht: 0, geschuetzt: false },
      { ...ALT.knoten[1], tags: [], geschuetzt: true }, // rev 4 und geloescht 99 bleiben
    ]);
    expect(neu.versionen).toEqual({ "k-offen": [{ ...ALT.versionen["k-offen"][0], status: "zu_klaeren" }] });
    expect(neu.kanten).toEqual(ALT.kanten);
    expect(neu.luecken).toEqual(ALT.luecken);
    expect(neu.nutzung).toEqual(ALT.nutzung);
    expect(neu.meta).toEqual({ seed: "abc", schema: 1 });
    expect(S.SCHEMA).toBe(1);
  });

  it("migrieren() lässt einen aktuellen Stand, wie er ist, und verträgt Unsinn", () => {
    const aktuell = S.migrieren(ALT, 0);
    expect(S.migrieren(aktuell, 1)).toEqual(aktuell);
    expect(S.migrieren(null)).toEqual({ knoten: [], versionen: {}, kanten: [], luecken: [], nutzung: [], meta: { schema: 1 } });
    expect(S.migrieren({ knoten: "x", versionen: [], meta: [] }, "abc").knoten).toEqual([]);
    // ein „offen“ im aktuellen Schema wird nicht umgedeutet (dort gibt es den Status nicht – das Modell lehnt ihn ab)
    expect(S.migrieren({ knoten: [{ id: "k-eins", status: "offen", rev: 2, geloescht: 0, tags: [] }] }, 1).knoten[0].status).toBe("offen");
  });

  it("IndexedDB: ein Altbestand ohne Schema-Nummer wird beim Öffnen gehoben – in einem Zug, auch mit zwei Tabs gleichzeitig", async () => {
    const idb = falscheIndexedDB();
    await new Promise((ok, nein) => {
      const r = idb.open("gabi-brain", 1);
      r.onupgradeneeded = () => { for (const s of S.STORES) r.result.createObjectStore(s, { keyPath: s === "meta" ? "schluessel" : "id" }); };
      r.onerror = nein;
      r.onsuccess = () => {
        const d = r.result;
        const t = d.transaction(S.STORES, "readwrite");
        for (const k of ALT.knoten.slice(0, 2)) t.objectStore("knoten").put(k);
        t.objectStore("versionen").put({ id: "k-offen", liste: ALT.versionen["k-offen"] });
        t.objectStore("kanten").put(ALT.kanten[0]);
        t.objectStore("nutzung").put(ALT.nutzung[0]);
        t.objectStore("meta").put({ schluessel: "seed", wert: "abc" });
        t.oncomplete = () => { d.close(); ok(); };
      };
    });
    const u = { indexedDB: idb, localStorage: falscherSpeicher(), sessionStorage: falscherSpeicher() };
    const [a, b] = await Promise.all([S.oeffnen({ umgebung: u, zeitlimit: 500 }), S.oeffnen({ umgebung: u, zeitlimit: 500 })]);
    expect([a.migriert, b.migriert].filter(Boolean)).toEqual([{ von: 0, nach: 1 }]); // genau einer hat gehoben
    const d = await b.laden();
    expect(d.knoten.map((k) => [k.id, k.status, k.rev, k.geloescht])).toEqual([["k-fest", "bestaetigt", 4, 99], ["k-offen", "zu_klaeren", 1, 0]]);
    expect(d.meta).toEqual({ schema: 1, seed: "abc" });
    expect(d.kanten).toEqual(ALT.kanten);
    expect(d.nutzung).toEqual(ALT.nutzung);
    expect((await a.verlauf("k-offen"))[0].status).toBe("zu_klaeren");
  });

  it("localStorage: ein Altbestand wird beim Öffnen gehoben", async () => {
    const ls = falscherSpeicher();
    ls.setItem("gabi.brain.v1", JSON.stringify({ knoten: { "k-offen": ALT.knoten[0] }, versionen: { "k-offen": { id: "k-offen", liste: ALT.versionen["k-offen"] } }, kanten: {}, luecken: {}, nutzung: {}, meta: {} }));
    const a = await S.oeffnen({ umgebung: { localStorage: ls } });
    expect(a.art).toBe("localstorage");
    expect(a.migriert).toEqual({ von: 0, nach: 1 });
    expect((await a.laden()).knoten[0]).toMatchObject({ id: "k-offen", status: "zu_klaeren", rev: 1, geloescht: 0 });
    expect((await a.verlauf("k-offen"))[0].status).toBe("zu_klaeren");
    expect((await S.oeffnen({ umgebung: { localStorage: ls } })).migriert).toBeUndefined(); // beim nächsten Start nichts mehr zu tun
  });

  it("ein Stand von einer neueren Gabi (höhere Schema-Nummer) wird nicht angefasst", async () => {
    const ls = falscherSpeicher();
    const dok = JSON.stringify({ knoten: { "k-neu": { id: "k-neu", status: "offen", zukunft: true } }, versionen: {}, kanten: {}, luecken: {}, nutzung: {}, meta: { schema: { schluessel: "schema", wert: 99 } } });
    ls.setItem("gabi.brain.v1", dok);
    const a = await S.oeffnen({ umgebung: { localStorage: ls } });
    expect(a.schemaFremd).toBe(true);
    expect(a.schema).toBe(99);
    expect(ls.getItem("gabi.brain.v1")).toBe(dok);
    // lesen geht, schreiben nicht – alter Code verbiegt keine neueren Daten
    expect((await a.laden()).knoten.map((k) => k.id)).toEqual(["k-neu"]);
    const schreibversuche = [() => a.knotenSchreiben(knoten("k-eins"), { neu: true }), () => a.knotenEntfernen(["k-neu"]), () => a.kantenSchreiben([kante("ka-1")]), () => a.lueckenEntfernen(["l-1"]),
      () => a.nutzungZaehlen(["k-neu"], 1), () => a.metaSchreiben("seed", "x"), () => a.stapel({ knoten: [knoten("k-eins")] }), () => a.leeren()];
    for (const tun of schreibversuche) {
      const f = await tun().catch((e) => e);
      expect(f.message).toBe("Dieses Brain wurde mit einer neueren Gabi angelegt. Bitte lade die Seite neu.");
      expect(f.schemaFremd).toBe(true);
    }
    expect(ls.getItem("gabi.brain.v1")).toBe(dok);
  });
});

// ---------------------------------------------------------------------------
// 7 Notfall-Kopie (ungespeicherte Bearbeitung, synchron in sessionStorage)
// ---------------------------------------------------------------------------
describe("Notfall-Kopie", () => {
  it("merken, lesen, löschen – mit Zeitstempel, Demo und echt getrennt", () => {
    const ss = falscherSpeicher();
    const n = S.notfall({ umgebung: { sessionStorage: ss }, jetzt: () => 4711 });
    const demo = S.notfall({ demo: true, umgebung: { sessionStorage: ss }, jetzt: () => 4712 });
    expect(n.lesen()).toBeNull();
    expect(n.merken({ id: "k-eins", titel: "Kontakt", inhalt: "noch nicht gespeichert", rev: 3 })).toBe(true);
    expect(n.lesen()).toEqual({ zeit: 4711, daten: { id: "k-eins", titel: "Kontakt", inhalt: "noch nicht gespeichert", rev: 3 } });
    expect(demo.lesen()).toBeNull();
    demo.merken({ id: "k-demo" });
    expect(ss.schluessel()).toEqual(["gabi.brain.notfall", "gabi.demo.brain.notfall"]);
    n.loeschen();
    expect(n.lesen()).toBeNull();
    expect(demo.lesen()).toEqual({ zeit: 4712, daten: { id: "k-demo" } });
  });

  it("zu groß: nur der Hinweis, welcher Eintrag betroffen war (gekürzt)", () => {
    const ss = falscherSpeicher();
    const n = S.notfall({ umgebung: { sessionStorage: ss }, jetzt: () => 1 });
    expect(n.merken({ id: "k-eins", titel: "T".repeat(500), inhalt: "x".repeat(S.NOTFALL_MAX + 10) })).toBe(true);
    expect(n.lesen()).toEqual({ zeit: 1, zuGross: true, id: "k-eins", titel: "T".repeat(200) });
    expect(ss.getItem("gabi.brain.notfall").length).toBeLessThan(1000);
  });

  it("wirft nie: gesperrter oder voller Speicher, fehlender Speicher, kaputter Inhalt, nicht speicherbare Daten", () => {
    const ss = falscherSpeicher();
    ss.gesperrt = true;
    const n = S.notfall({ umgebung: { sessionStorage: ss } });
    expect(n.merken({ id: "k-eins" })).toBe(false);
    expect(n.lesen()).toBeNull();
    expect(() => n.loeschen()).not.toThrow();
    const ohne = S.notfall({ umgebung: {} });
    expect(ohne.merken({ id: "k-eins" })).toBe(false);
    expect(ohne.lesen()).toBeNull();
    expect(() => ohne.loeschen()).not.toThrow();
    const voll = S.notfall({ umgebung: { sessionStorage: falscherSpeicher({ grenze: 30 }) } });
    expect(voll.merken({ id: "k-eins", inhalt: "x".repeat(100) })).toBe(false);
    const kaputt = falscherSpeicher();
    kaputt.setItem("gabi.brain.notfall", "{kein json");
    expect(S.notfall({ umgebung: { sessionStorage: kaputt } }).lesen()).toBeNull();
    kaputt.setItem("gabi.brain.notfall", "[1]");
    expect(S.notfall({ umgebung: { sessionStorage: kaputt } }).lesen()).toBeNull();
    const kreis = {};
    kreis.selbst = kreis;
    expect(S.notfall({ umgebung: { sessionStorage: falscherSpeicher() } }).merken(kreis)).toBe(false);
    expect(S.notfall({ umgebung: { sessionStorage: falscherSpeicher() } }).merken(undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8 Alles vom Gerät (Abmelden mit Häkchen)
// ---------------------------------------------------------------------------
describe("resteLoeschen(): alles vom Gerät", () => {
  const gefuellt = async () => {
    const u = { indexedDB: falscheIndexedDB(), localStorage: falscherSpeicher(), sessionStorage: falscherSpeicher() };
    const echt = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    const demo = await S.oeffnen({ demo: true, umgebung: u, zeitlimit: 500 });
    for (const [a, id] of [[echt, "k-echt"], [demo, "k-demo"]]) {
      const k = (await a.knotenSchreiben(knoten(id), { neu: true })).knoten;
      await a.knotenSchreiben({ ...k, inhalt: "neu" }, { erwartet: 1, version: version() });
      await a.kantenSchreiben([kante("ka-1")]);
      await a.lueckenSchreiben([luecke("l-1")]);
      await a.nutzungZaehlen([id], 1);
      await a.metaSchreiben("seed", "abc");
    }
    for (const k of ["gabi.brain.positionen", "gabi.brain.ansicht", "gabi.brain.hinweis", "gabi.brain.v1", "gabi.brain.v1.defekt", "gabi.demo.brain.positionen", "gabi.demo.brain.v1", "gabi.zugang", "gabi.gespraeche.v1", "gabi.demo.v1"]) u.localStorage.setItem(k, "x");
    u.sessionStorage.setItem("gabi.brain.notfall", "x");
    u.sessionStorage.setItem("gabi.demo.brain.notfall", "x");
    u.sessionStorage.setItem("gabi.gespraeche.notfall", "x");
    return { u, echt, demo };
  };

  it("nimmt Datenbank-Inhalt, localStorage-Schlüssel (Dokument, Positionen, Ansicht, Hinweise) und Notfall-Kopie – nur vom gewählten Betrieb", async () => {
    const { u, echt, demo } = await gefuellt();
    expect(await S.resteLoeschen({ umgebung: u, zeitlimit: 500 })).toBe(true);
    for (const s of S.STORES) expect(u.indexedDB.inhalt("gabi-brain", s), s).toEqual([]);
    expect(u.localStorage.schluessel()).toEqual(["gabi.demo.brain.positionen", "gabi.demo.brain.v1", "gabi.demo.v1", "gabi.gespraeche.v1", "gabi.zugang"]);
    expect(u.sessionStorage.schluessel()).toEqual(["gabi.demo.brain.notfall", "gabi.gespraeche.notfall"]);
    expect((await demo.laden()).knoten.map((k) => k.id)).toEqual(["k-demo"]);
    expect(await demo.verlauf("k-demo")).toHaveLength(1);
    // ein noch offener Tab arbeitet auf der geleerten Datenbank – und legt seinen Knoten nicht wieder an
    expect(await echt.knotenSchreiben(knoten("k-echt", { inhalt: "noch schnell" }), { erwartet: 2, version: version() })).toEqual({ konflikt: true, aktuell: null });
    expect((await echt.laden()).knoten).toEqual([]);
    // der nächste Start beginnt leer und stempelt das Schema neu
    expect(await (await S.oeffnen({ umgebung: u, zeitlimit: 500 })).laden()).toEqual(LEER);
    // und die Demo für sich
    expect(await S.resteLoeschen({ demo: true, umgebung: u, zeitlimit: 500 })).toBe(true);
    expect(u.localStorage.schluessel()).toEqual(["gabi.demo.v1", "gabi.gespraeche.v1", "gabi.zugang"]);
    expect(u.sessionStorage.schluessel()).toEqual(["gabi.gespraeche.notfall"]);
    for (const s of S.STORES) expect(u.indexedDB.inhalt("gabi-brain-demo", s), s).toEqual([]);
  });

  it("legt keine Datenbank an, wenn es keine gab", async () => {
    const u = { indexedDB: falscheIndexedDB(), localStorage: falscherSpeicher(), sessionStorage: falscherSpeicher() };
    expect(await S.resteLoeschen({ umgebung: u, zeitlimit: 500 })).toBe(true);
    expect(await S.resteLoeschen({ demo: true, umgebung: u, zeitlimit: 500 })).toBe(true);
    expect(u.indexedDB.namen()).toEqual([]);
    expect(u.localStorage.schluessel()).toEqual([]);
  });

  it("ohne IndexedDB liegt dort nichts: true; gesperrte Speicher bringen es nicht zum Absturz", async () => {
    const ls = falscherSpeicher();
    ls.setItem("gabi.brain.v1", "x");
    expect(await S.resteLoeschen({ umgebung: { localStorage: ls, sessionStorage: falscherSpeicher() } })).toBe(true);
    expect(ls.schluessel()).toEqual([]);
    const gesperrt = falscherSpeicher();
    gesperrt.gesperrt = true;
    expect(await S.resteLoeschen({ umgebung: { localStorage: gesperrt, sessionStorage: gesperrt } })).toBe(true);
    expect(await S.resteLoeschen({ umgebung: {} })).toBe(true);
  });

  it("IndexedDB hängt oder scheitert: Marke setzen, false melden – der nächste Start mit IndexedDB leert zuerst", async () => {
    const { u } = await gefuellt();
    u.indexedDB.oeffnenHaengt = true;
    expect(await S.resteLoeschen({ umgebung: u, zeitlimit: 20 })).toBe(false);
    expect(u.localStorage.getItem("gabi.brain.leeren-offen")).toBe("1");
    expect(u.localStorage.getItem("gabi.demo.brain.leeren-offen")).toBeNull();
    expect(u.indexedDB.inhalt("gabi-brain", "knoten")).toHaveLength(1); // liegt noch da
    u.indexedDB.oeffnenHaengt = false;
    const a = await S.oeffnen({ umgebung: u, zeitlimit: 500 });
    expect(a.nachgeholt).toBe(true);
    expect(await a.laden()).toEqual(LEER);
    expect(u.localStorage.getItem("gabi.brain.leeren-offen")).toBeNull();
    // Schreiben scheitert beim Leeren: ebenfalls false + Marke; ein späterer erfolgreicher Lauf nimmt die Marke weg
    await a.knotenSchreiben(knoten("k-eins"), { neu: true });
    u.indexedDB.schreibenScheitert = true;
    expect(await S.resteLoeschen({ umgebung: u, zeitlimit: 500 })).toBe(false);
    expect(u.localStorage.getItem("gabi.brain.leeren-offen")).toBe("1");
    u.indexedDB.schreibenScheitert = false;
    expect(await S.resteLoeschen({ umgebung: u, zeitlimit: 500 })).toBe(true);
    expect(u.localStorage.getItem("gabi.brain.leeren-offen")).toBeNull();
    expect(u.indexedDB.inhalt("gabi-brain", "knoten")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9 Kanal zwischen Tabs
// ---------------------------------------------------------------------------
describe("Kanal zwischen Tabs", () => {
  it("Nachrichten gehen an die anderen Tabs desselben Betriebs – Demo und echt getrennt", () => {
    const Kanal = falscherKanal();
    const bekommen = { a: [], b: [], demo: [] };
    const a = S.kanal(false, (d) => bekommen.a.push(d), { Kanal });
    const b = S.kanal(false, (d) => bekommen.b.push(d), { Kanal });
    const demo = S.kanal(true, (d) => bekommen.demo.push(d), { Kanal });
    a.senden({ art: "geaendert", ids: ["k-eins"] });
    demo.senden({ art: "geleert" });
    expect(bekommen).toEqual({ a: [], b: [{ art: "geaendert", ids: ["k-eins"] }], demo: [] });
    b.schliessen();
    a.senden({ art: "geaendert", ids: ["k-zwei"] });
    expect(bekommen.b).toHaveLength(1);
    expect(() => b.senden({ art: "zu spät" })).not.toThrow(); // geschlossen: still
    a.schliessen(); demo.schliessen();
    expect(Kanal.anzahl()).toBe(0);
  });

  it("ein Fehler im Empfänger oder ein fehlender BroadcastChannel stört nichts (stiller Ersatz)", () => {
    const Kanal = falscherKanal();
    const a = S.kanal(false, () => { throw new Error("kaputt"); }, { Kanal });
    const b = S.kanal(false, () => {}, { Kanal });
    expect(() => b.senden({ art: "geaendert" })).not.toThrow();
    a.schliessen(); b.schliessen();
    const ohne = S.kanal(false, () => {}, { Kanal: function Kaputt() { throw new Error("nicht erlaubt"); } });
    expect(() => { ohne.senden({ a: 1 }); ohne.schliessen(); }).not.toThrow();
  });

  it("nimmt ohne Angabe den BroadcastChannel der Umgebung, mit den Namen „gabi-brain“ und „gabi-brain-demo“", async () => {
    const namen = [];
    vi.stubGlobal("BroadcastChannel", class { constructor(name) { namen.push(name); } postMessage() {} close() {} });
    S.kanal(false, () => {}).schliessen();
    S.kanal(true, () => {}).schliessen();
    vi.unstubAllGlobals();
    expect(namen).toEqual(["gabi-brain", "gabi-brain-demo"]);
  });
});

// ---------------------------------------------------------------------------
// 10 Datenschutz: nichts in Logs
// ---------------------------------------------------------------------------
describe("Brain-Daten gehören nie in Logs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("die Datei ruft console nirgends auf; auch Fehlerwege schreiben nichts hinaus", async () => {
    expect(QUELLE).not.toMatch(/console\s*\./);
    const spione = ["log", "info", "warn", "error", "debug"].map((n) => vi.spyOn(console, n).mockImplementation(() => {}));
    const idb = falscheIndexedDB();
    const a = S.idbAblage("gabi-brain", idb, { zeitlimit: 500 });
    await a.bereit();
    await a.knotenSchreiben(knoten("k-eins", { inhalt: "GEHEIMER-INHALT" }), { neu: true });
    await a.knotenSchreiben(knoten("k-eins", { inhalt: "GEHEIMER-INHALT 2" }), { erwartet: 7 }); // Konflikt
    idb.fehlerBeimSchreiben = 1;
    await a.knotenSchreiben(knoten("k-zwei", { inhalt: "GEHEIMER-INHALT 3" }), { neu: true }).catch(() => {});
    await a.knotenSchreiben({ inhalt: "GEHEIMER-INHALT 4" }).catch(() => {});
    const ls = falscherSpeicher({ grenze: 200 });
    const b = S.lsAblage("gabi.brain.", ls);
    await b.bereit().catch(() => {});
    await b.knotenSchreiben(knoten("k-eins", { inhalt: "GEHEIMER-INHALT".repeat(50) }), { neu: true }).catch(() => {});
    for (const s of spione) expect(s).not.toHaveBeenCalled();
  });

  it("Fehlermeldungen nennen keine Inhalte – nur den deutschen Satz (und die Art des Fehlers)", async () => {
    const idb = falscheIndexedDB();
    const a = S.idbAblage("gabi-brain", idb, { zeitlimit: 500 });
    await a.bereit();
    idb.fehlerBeimSchreiben = 1;
    const f = await a.knotenSchreiben(knoten("k-eins", { titel: "GEHEIMER-TITEL", inhalt: "GEHEIMER-INHALT" }), { neu: true }).catch((e) => e);
    expect(f.message).toBe("Das Brain konnte nicht gespeichert werden. Bitte versuch es noch einmal.");
    expect(JSON.stringify({ ...f })).not.toMatch(/GEHEIM/);
    expect(f.ursache).toBe("UnknownError");
  });
});
