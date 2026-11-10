// Brain-Suche (brain-suche.js) ohne Browser: deutsche Normalisierung, Rangfolge, Filter, Kontext-Auswahl für Gabi und
// die Demo-Antwort rein aus dem Kontext („nichts dazuerfunden“). Zum Schluss ein Dutzend Fragen gegen den echten Seed.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const S = require("../../brain-suche.js");
const SEED = require("../../brain-seed.js");

const TAG = 86400000;
const k = (id, titel, inhalt = "", extra = {}) => ({ id, art: "praxiswissen", status: "bestaetigt", titel, inhalt, tags: [], ...extra });
const ids = (liste) => liste.map((x) => x.id);
const suche = (knoten, anfrage, opt) => S.suchen(S.erstelleIndex(knoten), anfrage, opt);

/** Seed als Kandidaten mit Kanten: „gehört zu“ aus dem Seed, Verweise aus dem Text. */
function seedGraph(mitDemo = false) {
  const knoten = [...SEED.knoten, ...(mitDemo ? SEED.demo.knoten : [])].map((x) => ({ ...x }));
  const nachTitel = new Map(knoten.map((x) => [S.normal(x.titel), x.id]));
  const kanten = SEED.kanten.map((x) => ({ ...x }));
  for (const x of knoten) for (const m of String(x.inhalt).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    const ziel = nachTitel.get(S.normal(m[1]));
    if (ziel && ziel !== x.id) kanten.push({ id: `a-${x.id}-${ziel}`, von: x.id, nach: ziel, art: "verweis", auto: true });
  }
  return { knoten, kanten };
}

/**
 * Steht jede Zeile der Antwort wörtlich in einem Kontext-Knoten (Titel oder Inhalt ohne [[ ]]) – abgesehen von den festen
 * Wendungen? Liefert die Zeilen, die NICHT belegt sind.
 */
function unbelegt(antwort, kontext) {
  const glatt = (t) => String(t).replace(/\s+/g, " ").trim();
  const titel = new Set(kontext.map((x) => glatt(x.titel)));
  const inhalt = kontext.map((x) => glatt(S.ohneVerweise(x.inhalt)));
  const belegt = (t) => { const g = glatt(t).replace(/ …$/, ""); return !g || inhalt.some((i) => i.includes(g)) || titel.has(g); };
  const fehlt = [];
  for (const roh of antwort.text.split("\n")) {
    let z = roh.trim().replace(/^- /, "");
    if (!z || z === S.NICHTS_IM_BRAIN) continue;
    z = z.replace(/^Laut Entwurf \(noch nicht bestätigt\) – /, "").replace(/^(?:Noch offen im Brain|Das ist im Brain noch offen): /, "");
    const fakt = /^\*\*(.+?):\*\*\s*(.*)$/.exec(z);
    const offen = /^\*\*(.+?)\*\*(?: – (.*))?$/.exec(z);
    if (fakt) { if (!titel.has(glatt(fakt[1])) || !belegt(fakt[2])) fehlt.push(roh); } else if (offen) { if (!titel.has(glatt(offen[1])) || !belegt(offen[2] || "")) fehlt.push(roh); } else if (!belegt(z)) fehlt.push(roh);
  }
  return fehlt;
}

describe("Normalisierung (deutsch)", () => {
  it("klein, Umlaute gefaltet, ß → ss, Akzente weg, Satzzeichen werden Leerzeichen, € wird ein Wort", () => {
    expect(S.normal("Öffnungszeiten")).toBe("oeffnungszeiten");
    expect(S.normal("ÄRGER über Größe")).toBe("aerger ueber groesse");
    expect(S.normal("GROSSE Straße")).toBe("grosse strasse");
    expect(S.normal("Café – Crème brûlée!")).toBe("cafe creme brulee");
    expect(S.normal("85 € pro Einheit")).toBe("85 euro pro einheit");
    expect(S.normal("  Mo–Fr:\t7:30–17:00\nUhr ")).toBe("mo fr 7 30 17 00 uhr");
    expect(S.normal("E-Mail: info@physio-works.de")).toBe("email info physio works de"); // „E-Mail“ ist ein Wort
    expect(S.normal("Eine E-Mail-Adresse oder Mailadresse")).toBe("eine email oder email"); // … samt „-Adresse“
    for (const leer of [null, undefined, "", "   ", "–?!"]) expect(S.normal(leer)).toBe("");
    expect(S.normal(42)).toBe("42");
  });

  it("zerlegte Umlaute (NFD, z. B. Dateinamen vom Mac) ergeben dieselbe Vergleichsform", () => {
    for (const wort of ["Öffnungszeiten", "Größe", "Übungen für Zuhause", "Bär"]) {
      expect(wort.normalize("NFD")).not.toBe(wort); // wirklich zerlegt
      expect(S.normal(wort.normalize("NFD"))).toBe(S.normal(wort));
    }
    expect(S.normal("Öffnungszeiten".normalize("NFD"))).toBe("oeffnungszeiten");
    // und die Suche findet damit, was vorgesetzt geschrieben wurde
    const knoten = [k("a", "Öffnungszeiten", "Mo–Fr 8–18 Uhr"), k("b", "Parken", "Hinter dem Haus")];
    expect(ids(suche(knoten, "öffnungszeiten".normalize("NFD")))).toEqual(["a"]);
  });

  it("unsichtbare Zeichen (weiches Trennzeichen, Leerzeichen ohne Breite, Richtungsmarken) trennen kein Wort", () => {
    const z = (code) => String.fromCharCode(code);
    for (const code of [0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0xfeff]) {
      expect(S.normal(`Öffnungs${z(code)}zeiten`), `U+${code.toString(16)}`).toBe("oeffnungszeiten");
    }
    expect(S.normal(`${z(0xfeff)}Park${z(0xad)}platz${z(0x200b)}`)).toBe("parkplatz");
    // sichtbare Trenner bleiben Trenner: geschütztes Leerzeichen, schmales Leerzeichen, Bindestrich, Gedankenstrich
    for (const code of [0xa0, 0x2009, 0x202f, 0x2d, 0x2011, 0x2013]) expect(S.normal(`Praxis${z(code)}Nord`), `U+${code.toString(16)}`).toBe("praxis nord");
    // aus einer Webseite kopiert (mit weichen Trennzeichen) – getippt gesucht: voller Treffer im Titel, nicht nur ein Wortteil
    const knoten = [k("a", `Öffnungs${z(0xad)}zeiten`, `Die Sprech${z(0xad)}stunde ist Mo–Fr.`), k("b", "Parken", "Hinter dem Haus")];
    const t = suche(knoten, "Öffnungszeiten");
    expect(ids(t)).toEqual(["a"]);
    expect(t[0]).toMatchObject({ stark: true, imTitel: 1, deckung: 1 });
    expect(ids(suche(knoten, "Sprechstunde"))).toEqual(["a"]);
    expect(ids(suche([k("c", "Öffnungszeiten")], `öffnungs${z(0x200b)}zeiten`))).toEqual(["c"]); // und umgekehrt
    expect(S.woerter(`Wann ist Sprech${z(0xad)}stunde?`)).toEqual(["sprechstund"]);
  });

  it("Stemming: eine Endung weg, Stamm mindestens 4 Zeichen, kurze Wörter und Zahlen bleiben", () => {
    expect(["standorte", "zeiten", "preise", "leistungen", "kindern", "kleines", "oeffnungszeiten"].map(S.stamm)).toEqual(["standort", "zeit", "preis", "leistung", "kind", "klein", "oeffnungszeit"]);
    expect(["haus", "uhr", "team", "mtt", "euro"].map(S.stamm)).toEqual(["haus", "uhr", "team", "mtt", "euro"]);
    expect(S.stamm("alten")).toBe("alte"); // „alt“ wäre zu kurz – also nur das „n“
    expect(S.stamm("alter")).toBe("alter"); // hier bliebe nach „er“ zu wenig, und „r“ ist keine Endung
    expect(["10er", "2011", "90491"].map(S.stamm)).toEqual(["10er", "2011", "90491"]);
    // Einzahl und Mehrzahl treffen sich
    expect(S.stamm("standort")).toBe(S.stamm("standorte"));
    expect(S.stamm("leistung")).toBe(S.stamm("leistungen"));
    // wo der Stamm selbst auf „s“ endet („Preis“ → „prei“, „Preise“ → „preis“), finden sich die Formen als Wortanfang
    expect(S.passung(S.stamm("preis"), S.stamm("preise"))).toBe(0.7);
    expect(S.passung(S.stamm("praxis"), S.stamm("praxen"))).toBe(0.7);
  });

  it("Suchwörter: ohne Füllwörter, als Stämme, jedes nur einmal – auch „Habt ihr …“ und „Seid ihr …“", () => {
    expect(S.woerter("Wann sind die Praxen geöffnet?")).toEqual(["prax", "geoeffnet"]);
    expect(S.woerter("Was kostet die Osteopathie bei euch?")).toEqual(["kostet", "osteopathi"]);
    expect(S.woerter("Standorte, Standorte und nochmal Standort")).toEqual(["standort"]);
    expect(S.woerter("Standorte, Standorte und Parken am Standort")).toEqual(["standort", "park"]);
    expect(S.woerter("Habt ihr eine E-Mail-Adresse?")).toEqual(["email"]); // nicht „Adresse“ – das suchte nach den Standorten
    expect(S.woerter("Seid ihr barrierefrei?")).toEqual(["barrierefrei"]);
    expect(S.woerter("Was ist das?")).toEqual([]);
    expect(S.woerter("Zimmer 5 im 2. Stock")).toEqual(["zimm", "5", "2", "stock"]);
  });

  it("Passung (Suchwort, Wort im Bestand): gleich 1 · Wortanfang, Endung, Grundwort 0,7 · Bestimmungswort, Wortteil, verwandt 0,45 · sonst 0 · Zahlen nur genau", () => {
    expect(S.passung("preis", "preis")).toBe(1);
    expect(S.passung("park", "parkplatz")).toBe(0.7); // getippter Wortanfang
    // umgekehrt nur schwach: Wer „Parkplatz“ sagt, fragt nicht nach dem „Park“ („Bewegungsbad“ nicht nach „Bewegung“)
    expect(S.passung("parkplatz", "park")).toBe(0.45);
    expect(S.passung("telefonisch", "telefon")).toBe(0.7); // … außer es fehlt nur eine Endung
    expect(S.passung("stund", "sprechstund")).toBe(0.7); // das Gefragte ist das Grundwort („Stunde“ ↔ „Sprechstunde“)
    expect(S.passung("trainier", "training")).toBe(0.45); // verwandt: langer gemeinsamer Anfang
    expect(S.passung("zeit", "trainingszeit")).toBe(0); // zu kurz für einen Wortteil
    expect(S.passung("abc", "abcd")).toBe(0); // zu kurz für einen Wortanfang
    expect(S.passung("schule", "schulter")).toBe(0);
    expect(S.passung("85", "850")).toBe(0);
    expect(S.passung("85", "85")).toBe(1);
    expect(S.passung("2011", "2011er")).toBe(0);
  });
});

describe("Rangfolge der Suche", () => {
  it("Titel schlägt Tag schlägt Inhalt – bei sonst gleichem Text", () => {
    const fuell = "Die Praxis liegt zentral und ist gut erreichbar mit Bus und Bahn";
    const knoten = [
      k("inhalt", "Hinweise eins", `${fuell} parken`),
      k("tag", "Hinweise zwei", `${fuell} anfahrt`, { tags: ["parken"] }),
      k("titel", "Parken", `${fuell} anfahrt`),
    ];
    expect(ids(suche(knoten, "parken"))).toEqual(["titel", "tag", "inhalt"]);
    const t = suche(knoten, "parken");
    expect(t[0].punkte).toBeGreaterThan(t[1].punkte);
    expect(t[1].punkte).toBeGreaterThan(t[2].punkte);
    expect(t[0]).toMatchObject({ imTitel: 1, deckung: 1, stark: true });
    expect(t[0].woerter).toEqual(["park"]); // gefundene Wortstämme (zum Hervorheben)
  });

  it("mehr Suchwörter getroffen = weiter vorn; Groß/Klein, Umlaute und Endungen spielen keine Rolle", () => {
    const knoten = [
      k("a", "Telefonzeiten", "Telefonisch erreichbar: Mo 7:30–17:00 Uhr"),
      k("b", "Kontakt", "Telefon: +49 911 23 99 823 · E-Mail: info@physio-works.de"),
      k("c", "Standorte", "Kieslingstraße 82 und Thumenberger Weg 89"),
    ];
    expect(ids(suche(knoten, "TELEFON zeiten"))[0]).toBe("a");
    expect(ids(suche(knoten, "kieslingstrasse"))).toEqual(["c"]);
    expect(ids(suche(knoten, "Standort"))).toEqual(["c"]);
    expect(suche(knoten, "xylophon")).toEqual([]);
  });

  it("Wortfelder: „Kosten“ findet „Preis“ – aber schwächer als ein wörtlicher Treffer", () => {
    const knoten = [
      k("preis", "Osteopathie", "Preis: 85 € pro Behandlungseinheit"),
      k("kosten", "Youngster Training", "Die Kosten stehen noch nicht fest"),
      k("anderes", "Team", "Zwölf Therapeutinnen und Therapeuten"),
    ];
    const t = suche(knoten, "Was sind die Kosten?");
    expect(ids(t)).toEqual(["kosten", "preis"]);
    // über das Wortfeld gefunden: schwächer gewertet, aber das Suchwort gilt als gefunden – sonst käme der Knoten nie
    // in Gabis Kontext („Wer ist der Chef?“ fände den Inhaber nicht)
    expect(t[1].punkte).toBeLessThan(t[0].punkte * 0.6);
    expect(t[1].deckung).toBe(1);
    expect(t[1].stark).toBe(true);
    // das Wortfeld greift auch, wenn der Stamm anders aussieht als das Wort („Preis“ → „prei“, „Inhaber“ → „inhab“)
    expect(S.stamm("preis")).toBe("prei");
    expect(ids(suche(knoten, "Preis", { praefix: false }))).toEqual(["preis", "kosten"]);
    // („wer“ zeigt zusätzlich schwach auf das Team – der Eintrag mit dem Wortfeld-Treffer steht vorn)
    expect(ids(suche([k("c", "Leitung", "Der Chef ist Philipp"), k("t", "Team", "zwölf")], "Wer ist der Inhaber?"))).toEqual(["c", "t"]);
    expect(ids(suche([k("c", "Leitung", "Der Chef ist Philipp"), k("t", "Team", "zwölf")], "Inhaber"))).toEqual(["c"]);
    // Fragewörter sagen, wonach gesucht wird: „wo“ → Standort/Adresse, „wie viel“ → Preis
    expect(ids(suche([k("s", "Standorte", "zwei in Nürnberg"), k("x", "Team", "zwölf")], "Wo seid ihr?"))).toEqual(["s"]);
    // ohne jedes Inhaltswort ist das Fragewort die Frage: „Wie viel?“ sucht nach Preisen – samt Wortfeld („Kosten“)
    expect(ids(suche(knoten, "Wie viel?"))).toEqual(["preis", "kosten"]);
  });

  it("Suche beim Tippen: das letzte Wort zählt schon als Wortanfang (praefix) – ohne praefix nicht", () => {
    const knoten = [k("a", "Standorte", "zwei"), k("b", "Stammkunden", "viele"), k("c", "Kontakt", "Telefon")];
    expect(ids(suche(knoten, "Sta")).sort()).toEqual(["a", "b"]);
    expect(suche(knoten, "Sta", { praefix: false })).toEqual([]);
    expect(ids(suche(knoten, "ko"))).toEqual(["c"]);
    expect(suche(knoten, "k")).toEqual([]); // ein Buchstabe ist noch keine Suche
    expect(ids(suche(knoten, "Kontakt Sta")).sort()).toEqual(["a", "b", "c"]);
    expect(ids(suche(knoten, "Kontakt Sta"))[0]).toBe("c");
  });

  it("leere Anfrage, leerer Index, Limit, feste Reihenfolge bei Gleichstand, Zahlen nur genau", () => {
    const gleich = ["c", "a", "b"].map((id) => k(id, "Parken", "Hinter dem Haus"));
    expect(suche(gleich, "")).toEqual([]);
    expect(suche(gleich, "   ")).toEqual([]);
    expect(S.suchen(null, "parken")).toEqual([]);
    expect(suche([], "parken")).toEqual([]);
    expect(ids(suche(gleich, "parken"))).toEqual(["a", "b", "c"]);
    expect(suche(gleich, "parken", { limit: 2 })).toHaveLength(2);
    const zahlen = [k("x", "Preis", "850 Euro"), k("y", "Preis alt", "85 Euro")];
    expect(ids(suche(zahlen, "85", { praefix: false }))).toEqual(["y"]);
    expect(ids(suche(zahlen, "85")).sort()).toEqual(["x", "y"]); // beim Tippen zählt „85“ schon als Anfang von „850“
    // Knoten ohne id werden übergangen, [[Verweise]] zählen als Text
    expect(ids(suche([{ titel: "Parken" }, k("v", "Hinweis", "Siehe [[Praxis Kieslingstraße|unsere Hauptpraxis]]")], "hauptpraxis"))).toEqual(["v"]);
  });
});

describe("Filter", () => {
  const JETZT = Date.UTC(2026, 10, 10);
  const knoten = [
    k("a", "Standorte", "x", { tags: ["standort", "Übersicht"], geaendert: JETZT - 10 * TAG }),
    k("b", "Parken?", "", { art: "frage", status: "zu_klaeren", tags: ["zu-klaeren"], geaendert: JETZT - 200 * TAG }),
    k("c", "Hausbesuche", "x", { status: "entwurf", geaendert: JETZT - 91 * TAG }),
    k("d", "Ton", "x", { art: "regel", geaendert: JETZT - 90 * TAG }),
    k("e", "Alt", "x", { geaendert: JETZT - 365 * TAG }),
    k("f", "TP-01", "", { art: "patient", abgeleitet: true, geschuetzt: true, geaendert: JETZT - 365 * TAG }),
    k("g", "Weg", "x", { geloescht: JETZT - TAG, geaendert: JETZT - 365 * TAG }),
    k("h", "Ohne Zeit", "x", { geaendert: 0 }),
  ];
  const nutzung = new Map([["a", { id: "a", anzahl: 3, zuletzt: JETZT }], ["c", { id: "c", anzahl: 1, zuletzt: JETZT }]]);
  const f = (filter, opt = { nutzung, jetzt: JETZT }) => ids(S.filtern(knoten, filter, opt));

  it("ohne Angaben kommt alles durch; Art, Status und Tag schränken ein (auch kombiniert)", () => {
    expect(f({})).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(f({ arten: [], status: [], tag: "" })).toHaveLength(8);
    expect(f({ arten: ["frage", "regel"] })).toEqual(["b", "d"]);
    expect(f({ status: ["entwurf"] })).toEqual(["c"]);
    expect(f({ status: ["entwurf", "zu_klaeren"] })).toEqual(["b", "c"]);
    expect(f({ tag: "standort" })).toEqual(["a"]);
    expect(f({ tag: "übersicht" })).toEqual(["a"]); // Tags über die Vergleichsform
    expect(f({ tag: "UEBERSICHT" })).toEqual(["a"]);
    expect(f({ arten: ["praxiswissen"], status: ["bestaetigt"], tag: "standort" })).toEqual(["a"]);
    expect(f({ arten: ["regel"], tag: "standort" })).toEqual([]);
    expect(S.filtern(null, {})).toEqual([]);
    expect(S.filtern([null, undefined, knoten[0]], {})).toEqual([knoten[0]]);
  });

  it("„Zu klären“, „veraltet“ (über 90 Tage, nie offene Fragen, nie Abgeleitetes oder Gelöschtes)", () => {
    expect(f({ zuKlaeren: true })).toEqual(["b"]);
    expect(f({ veraltet: true })).toEqual(["c", "e"]);
    expect(S.istVeraltet(knoten[3], JETZT)).toBe(false); // genau 90 Tage: noch nicht
    expect(S.istVeraltet({ ...knoten[3], geaendert: JETZT - 90 * TAG - 1 }, JETZT)).toBe(true);
    expect(S.istVeraltet(knoten[1], JETZT)).toBe(false); // offene Frage: „zu klären“, nicht „veraltet“
    expect(S.istVeraltet(knoten[5], JETZT)).toBe(false);
    expect(S.istVeraltet(knoten[6], JETZT)).toBe(false);
    expect(S.istVeraltet(knoten[7], JETZT)).toBe(false);
    expect(S.istVeraltet(null, JETZT)).toBe(false);
    expect(S.VERALTET_TAGE).toBe(90);
  });

  it("„nie verwendet“ = bestätigtes Praxiswissen ohne Nutzung; „verwendet“ = Zähler über null (Map oder Objekt)", () => {
    expect(f({ nieVerwendet: true })).toEqual(["e", "h"]);
    expect(f({ verwendet: true })).toEqual(["a", "c"]);
    expect(ids(S.filtern(knoten, { verwendet: true }, { nutzung: { a: { anzahl: 2 } }, jetzt: JETZT }))).toEqual(["a"]);
    expect(ids(S.filtern(knoten, { nieVerwendet: true }, { nutzung: null, jetzt: JETZT }))).toEqual(["a", "e", "h"]);
    expect(S.istNieVerwendet(knoten[3], nutzung)).toBe(false); // Regeln gehören nicht zum Kontext
    expect(S.istNieVerwendet(knoten[2], new Map())).toBe(false); // Entwurf zählt nicht
    expect(S.istNieVerwendet({ ...knoten[0], id: "neu" }, nutzung)).toBe(true);
    expect(f({ veraltet: true, nieVerwendet: true })).toEqual(["e"]);
  });
});

describe("Kontext-Auswahl für Gabi", () => {
  const lang = (wort, n) => Array.from({ length: n }, (_, i) => `${wort} Satz ${i + 1} mit etwas Text zum Auffüllen.`).join(" ");

  it("nur Praxiswissen, Fragen und Vorlagen – nie Patienten, Notizen, Berichte, Regeln, Persona, Papierkorb", () => {
    const knoten = [
      k("ok1", "Parken", "Parken hinter dem Haus"),
      k("ok2", "Wo kann man parken?", "", { art: "frage", status: "zu_klaeren" }),
      k("ok3", "Vorlage Parken", "Parken erklären", { art: "vorlage", status: "entwurf" }),
      k("r", "Regel Parken", "Parken nie erwähnen", { art: "regel" }),
      k("p", "Persona Parken", "parken", { art: "persona" }),
      k("pat", "TP-01 parken", "parken", { art: "patient" }),
      k("n", "08.11. · TP-01 parken", "parken", { art: "notiz" }),
      k("b", "Bericht parken", "parken", { art: "bericht" }),
      k("abg", "Parken abgeleitet", "parken", { abgeleitet: true }),
      k("weg", "Parken gelöscht", "parken", { geloescht: 5 }),
    ];
    const r = S.kontextWaehlen({ frage: "Wo kann ich parken?", knoten });
    expect(ids(r).sort()).toEqual(["ok1", "ok2", "ok3"]);
    expect(r.find((x) => x.id === "ok2").status).toBe("zu_klaeren"); // der Status geht mit
    expect(r.find((x) => x.id === "ok3").status).toBe("entwurf");
    for (const x of r) expect(Object.keys(x).sort()).toEqual(["art", "id", "inhalt", "status", "tags", "titel"]);
    expect(S.KONTEXT_ARTEN).toEqual(["praxiswissen", "frage", "vorlage"]);
  });

  it("leere Frage, leerer Bestand oder nichts Passendes → kein Kontext", () => {
    const knoten = [k("a", "Parken", "Hinter dem Haus")];
    for (const frage of ["", "   ", null, undefined]) expect(S.kontextWaehlen({ frage, knoten })).toEqual([]);
    expect(S.kontextWaehlen({ frage: "parken", knoten: [] })).toEqual([]);
    expect(S.kontextWaehlen({ frage: "parken" })).toEqual([]);
    expect(S.kontextWaehlen({ frage: "Wie wird das Wetter morgen?", knoten })).toEqual([]);
    expect(S.kontextWaehlen()).toEqual([]);
  });

  it("Schwelle und Auffüllen: die deutlich passenden zuerst; freie Plätze füllen Einträge, die ein Suchwort wörtlich tragen – bloße Wortteile bleiben draußen", () => {
    const knoten = [
      k("gut", "Osteopathie", "Osteopathie kostet 85 € pro Behandlungseinheit. Osteopathie ist Selbstzahlerleistung."),
      k("schwach", "Team", `${lang("Kollegin", 40)} Eine macht auch Osteopathie.`),
      k("teil", "Kurse", `${lang("Kurs", 40)} Auch ein Kinderosteopathiekurs.`),
      k("nichts", "Kontakt", "Telefon und E-Mail"),
    ];
    const index = S.erstelleIndex(knoten);
    const [erster, zweiter] = S.suchen(index, "Osteopathie", { praefix: false });
    expect(erster.id).toBe("gut");
    expect(zweiter.punkte).toBeLessThan(erster.punkte * 0.25); // der Testfall liegt wirklich unter der Schwelle
    // der abgeschlagene Eintrag kommt trotzdem mit (hinten): Die Auswahl ist nur eine Wortsuche – ob er etwas beiträgt,
    // entscheidet die Antwortlogik bzw. das Modell. Ein Wortteil („Kinderosteopathiekurs“) genügt dafür nicht.
    expect(ids(S.kontextWaehlen({ frage: "Osteopathie", knoten }))).toEqual(["gut", "schwach"]);
    // die Grenzen bleiben: nie mehr als maxKnoten, nie mehr als rund maxZeichen
    const viele = Array.from({ length: 20 }, (_, i) => k(`o${i}`, `Eintrag ${i}`, "Osteopathie am Rand."));
    expect(S.kontextWaehlen({ frage: "Osteopathie", knoten: [...knoten.slice(0, 1), ...viele] })).toHaveLength(8);
    expect(S.kontextWaehlen({ frage: "Osteopathie", knoten: [...knoten.slice(0, 1), ...viele], maxKnoten: 3 })).toHaveLength(3);
    const dicke = Array.from({ length: 20 }, (_, i) => k(`d${i}`, `Eintrag ${i}`, `${lang("Text", 30)} Osteopathie am Rand.`));
    const auswahl = S.kontextWaehlen({ frage: "Osteopathie", knoten: dicke });
    expect(auswahl.length).toBeLessThan(8);
    expect(auswahl.reduce((n, x) => n + x.titel.length + x.inhalt.length, 0)).toBeLessThanOrEqual(6000 + 80);
  });

  it("je Suchwort kommt der Eintrag mit, der es am besten trägt – auch wenn ein anderer insgesamt mehr Punkte hat", () => {
    // „Was kostet die Trainingstherapie?“: Preis-Einträge sammeln viele Punkte, der Eintrag zum Thema darf nicht fehlen
    const knoten = [
      k("p1", "Preise Osteopathie", "Osteopathie kostet 85 €. Kosten trägt der Patient. Preis pro Einheit. Was kostet es? Kosten, Kosten."),
      k("p2", "Preise Youngster", "Was kostet das Youngster Training? Kosten offen. Preis folgt. Kosten, Kosten."),
      k("mtt", "Medizinische Trainingstherapie", `${lang("Gerät", 60)} unter Anleitung.`),
    ];
    expect(ids(S.kontextWaehlen({ frage: "Was kostet die Trainingstherapie?", knoten }))).toContain("mtt");
  });

  it("Nachbarn (ein Sprung): ausdrückliche Verweise immer, „gehört zu“ nur wenn der Nachbar selbst zur Frage passt", () => {
    const knoten = [
      k("mtt", "Medizinische Trainingstherapie", "Gerätegestütztes Training. Siehe auch: [[Trainingszeiten]]"),
      k("zeiten", "Trainingszeiten", "Mo–Do 7:00–19:00 Uhr"),
      k("anker", "Leistungen", "Übersicht aller Angebote"),
      k("fern", "Kontakt", "Telefon"),
      k("zwei", "Geräte", "Sensopro", { tags: [] }),
    ];
    const verweis = { id: "v", von: "mtt", nach: "zeiten", art: "verweis", auto: true };
    const gehoert = { id: "g", von: "mtt", nach: "anker", art: "gehoert_zu" };
    const zweiSpruenge = { id: "z", von: "zeiten", nach: "zwei", art: "verweis" };
    expect(ids(S.kontextWaehlen({ frage: "Trainingstherapie", knoten }))).toEqual(["mtt"]);
    expect(ids(S.kontextWaehlen({ frage: "Trainingstherapie", knoten, kanten: [verweis, gehoert, zweiSpruenge] }))).toEqual(["mtt", "zeiten"]);
    // der Anker passt selbst (schwach) zur Frage → darf über „gehört zu“ mit
    const mitAnker = knoten.map((x) => (x.id === "anker" ? { ...x, inhalt: "Übersicht, auch Trainingstherapie" } : x));
    expect(ids(S.kontextWaehlen({ frage: "Trainingstherapie", knoten: mitAnker, kanten: [gehoert] })).sort()).toEqual(["anker", "mtt"]);
    // Kanten zu Unbekanntem oder Gelöschtem stören nicht
    expect(ids(S.kontextWaehlen({ frage: "Trainingstherapie", knoten, kanten: [{ von: "mtt", nach: "gibtsnicht", art: "verweis" }, null] }))).toEqual(["mtt"]);
  });

  it("Grenzen: höchstens 8 Knoten und höchstens 6000 Zeichen – auch bei 300 langen Knoten", () => {
    const knoten = Array.from({ length: 300 }, (_, i) => k(`k${String(i).padStart(3, "0")}`, `Parken Hinweis ${i}`, lang("Parken", 80)));
    const kanten = Array.from({ length: 299 }, (_, i) => ({ id: `e${i}`, von: "k000", nach: `k${String(i + 1).padStart(3, "0")}`, art: "verweis" }));
    const r = S.kontextWaehlen({ frage: "Wo kann man parken?", knoten, kanten });
    expect(r.length).toBeGreaterThan(1);
    expect(r.length).toBeLessThanOrEqual(8);
    expect(r.reduce((s, x) => s + x.titel.length + x.inhalt.length, 0)).toBeLessThanOrEqual(6000);
    for (const x of r) { expect(x.inhalt.length).toBeLessThanOrEqual(1500); expect(x.inhalt.endsWith(" …")).toBe(true); }
    // eigene Grenzen werden eingehalten
    const klein = S.kontextWaehlen({ frage: "parken", knoten, kanten, maxKnoten: 3, maxZeichen: 500, proKnoten: 200 });
    expect(klein.length).toBeLessThanOrEqual(3);
    expect(klein.reduce((s, x) => s + x.titel.length + x.inhalt.length, 0)).toBeLessThanOrEqual(500);
    for (const x of klein) expect(x.inhalt.length).toBeLessThanOrEqual(200);
    // kurze Inhalte bleiben ganz, Tags sind auf 8 begrenzt
    const kurz = S.kontextWaehlen({ frage: "parken", knoten: [k("a", "Parken", "Hinter dem Haus.", { tags: Array.from({ length: 12 }, (_, i) => `t${i}`) })] });
    expect(kurz[0]).toMatchObject({ inhalt: "Hinter dem Haus.", titel: "Parken" });
    expect(kurz[0].tags).toHaveLength(8);
  });

  it("[[Verweise]] bleiben im Kontext-Inhalt stehen (ein Änderungsvorschlag darauf löschte sonst die Verbindungen)", () => {
    const inhalt = "Gerätegestütztes Training unter Anleitung.\n\nSiehe auch: [[Trainingszeiten]] und [[Praxis Kieslingstraße|die Hauptpraxis]]";
    const r = S.kontextWaehlen({ frage: "Training", knoten: [k("mtt", "MTT Training", inhalt)] });
    expect(r[0].inhalt).toBe(inhalt);
    // gesucht wird trotzdem im Text der Verweise
    expect(ids(S.kontextWaehlen({ frage: "Hauptpraxis", knoten: [k("mtt", "MTT", inhalt)] }))).toEqual(["mtt"]);
  });

  it("ein vorbereiteter Index liefert dasselbe wie ohne", () => {
    const { knoten, kanten } = seedGraph();
    const kandidaten = knoten.filter((x) => S.KONTEXT_ARTEN.includes(x.art));
    const index = S.erstelleIndex(kandidaten);
    for (const frage of ["Wo sind die Standorte?", "Was kostet Osteopathie?", "Wetter"]) {
      expect(S.kontextWaehlen({ frage, knoten, kanten, index })).toEqual(S.kontextWaehlen({ frage, knoten, kanten }));
    }
  });
});

describe("Antwort ohne KI: nur aus dem Kontext, nichts dazuerfunden", () => {
  it("ohne Kontext oder ohne Suchwort: „Dazu steht noch nichts im Brain.“ und die Frage als Lücke (einzeilig, höchstens 200 Zeichen)", () => {
    expect(S.antwortAusKontext("Kann man mit Karte zahlen?", [])).toEqual({ text: "Dazu steht noch nichts im Brain.", quellen: [], luecke: "Kann man mit Karte zahlen?" });
    expect(S.antwortAusKontext("Kann man\n  mit Karte   zahlen?", null).luecke).toBe("Kann man mit Karte zahlen?");
    expect(S.antwortAusKontext("Was ist das?", [k("a", "Parken", "Hinter dem Haus")])).toMatchObject({ quellen: [], luecke: "Was ist das?" });
    const lang = S.antwortAusKontext(`Frage ${"sehr ".repeat(80)}lang?`, []);
    expect(lang.luecke.length).toBeLessThanOrEqual(200);
    expect(S.NICHTS_IM_BRAIN).toBe("Dazu steht noch nichts im Brain.");
  });

  it("passt der Kontext nicht wirklich zur Frage, bleibt es eine Lücke (ein gemeinsames Nebenwort reicht nicht)", () => {
    const youngster = k("y", "Youngster Training", "Für Kinder und Jugendliche; 10er-Karten. Anmeldung per E-Mail.", { tags: ["leistung", "kinder"] });
    expect(S.antwortAusKontext("Kann man bei euch mit Karte zahlen?", [youngster])).toMatchObject({ text: S.NICHTS_IM_BRAIN, quellen: [], luecke: "Kann man bei euch mit Karte zahlen?" });
    expect(S.antwortAusKontext("Bietet ihr Videotermine an?", [youngster]).luecke).toBe("Bietet ihr Videotermine an?");
    // ein bloßer Wortteil ist kein Beleg: „Videotermine“ ist keine Frage nach „Termine“ …
    const termine = k("t", "Termine", "per Telefon oder E-Mail. Online-Terminbuchung: nicht angegeben.", { tags: ["termin"] });
    expect(S.antwortAusKontext("Bietet ihr Videotermine an?", [termine])).toMatchObject({ text: S.NICHTS_IM_BRAIN, quellen: [], luecke: "Bietet ihr Videotermine an?" });
    // … der Wortanfang und das Wortfeld schon („Terminvergabe“, „trainieren“ ↔ „Training“)
    expect(S.antwortAusKontext("Wie läuft die Terminvergabe?", [termine]).quellen).toEqual(["t"]);
    expect(S.antwortAusKontext("Wann kann man trainieren?", [k("z", "Trainingszeiten", "Mo–Do 7:00–19:00 Uhr")]).quellen).toEqual(["z"]);
    // Knoten ohne id oder Titel zählen nicht
    expect(S.antwortAusKontext("Parken?", [{ titel: "Parken", inhalt: "x" }, { id: "a", inhalt: "parken" }]).quellen).toEqual([]);
  });

  it("Bestätigtes wörtlich mit Titel; die Quelle ist genau der zitierte Knoten", () => {
    const r = S.antwortAusKontext("Wo kann man parken?", [k("p", "Parken", "- Hinter dem Haus sind fünf Plätze.\n- Einfahrt über die Kieslingstraße."), k("x", "Team", "Zwölf Leute")]);
    expect(r).toEqual({ text: "**Parken:**\n- Hinter dem Haus sind fünf Plätze.\n- Einfahrt über die Kieslingstraße.", quellen: ["p"], luecke: "" });
    // einzeilig: Titel und Satz in einer Zeile; wiederholt die erste Zeile den Titel, steht er nicht doppelt da
    expect(S.antwortAusKontext("Osteopathie", [k("o", "Osteopathie", "Osteopathie: 85 € pro Behandlungseinheit")]).text).toBe("**Osteopathie:** 85 € pro Behandlungseinheit");
  });

  it("Entwürfe heißen „Laut Entwurf (noch nicht bestätigt)“, offene Punkte „noch offen“ – nie als Tatsache", () => {
    const entwurf = S.antwortAusKontext("Hausbesuche?", [k("h", "Hausbesuche", "Nach Absprache, Anfahrt bis 10 km.", { status: "entwurf" })]);
    expect(entwurf.text).toBe("Laut Entwurf (noch nicht bestätigt) – **Hausbesuche:** Nach Absprache, Anfahrt bis 10 km.");
    expect(entwurf.quellen).toEqual(["h"]);
    const offen = S.antwortAusKontext("Parkplätze?", [k("f", "Gibt es Parkplätze?", "Parken: nicht angegeben.\n\nBetrifft: [[Standorte]]", { art: "frage", status: "zu_klaeren" })]);
    expect(offen).toEqual({ text: "Das ist im Brain noch offen: **Gibt es Parkplätze?** – Parken: nicht angegeben.", quellen: ["f"], luecke: "" });
    // beides zusammen: erst die Fakten, dann „Noch offen im Brain“
    const beides = S.antwortAusKontext("Standorte?", [
      k("f", "Welche Leistung an welchem Standort?", "nicht angegeben", { art: "frage", status: "zu_klaeren" }),
      k("s", "Standorte", "Kieslingstraße 82 und Thumenberger Weg 89"),
    ]);
    expect(beides.text).toBe("**Standorte:** Kieslingstraße 82 und Thumenberger Weg 89\n\nNoch offen im Brain: **Welche Leistung an welchem Standort?** – nicht angegeben");
    expect(beides.quellen).toEqual(["s", "f"]);
  });

  it("die Antwort zeigt keine [[eckigen Klammern]] und keine reinen Verweis-Zeilen („Siehe auch“, „Betrifft“)", () => {
    const r = S.antwortAusKontext("Trainingstherapie", [k("mtt", "Medizinische Trainingstherapie", "Training in [[Praxis Kieslingstraße|der Hauptpraxis]] und nach [[Trainingszeiten]].\n\nSiehe auch: [[Trainingszeiten]]\nBetrifft: [[Leistungen]]")]);
    expect(r.text).toBe("**Medizinische Trainingstherapie:** Training in der Hauptpraxis und nach Trainingszeiten.");
    expect(r.text).not.toMatch(/[[\]]/);
  });

  it("lange Knoten: nur die passenden Zeilen (höchstens vier); höchstens drei Knoten; offene Punkte nur, wo sie etwas beitragen", () => {
    const zeilen = Array.from({ length: 12 }, (_, i) => `- Zeile ${i + 1}: ${i % 3 === 0 ? "Parken" : "Anderes"} ${"und noch mehr Text ".repeat(3)}`).join("\n");
    const r = S.antwortAusKontext("parken", [k("p", "Hinweise Parken", zeilen)]);
    const punkte = r.text.split("\n").filter((z) => z.startsWith("- "));
    expect(punkte).toHaveLength(4);
    for (const p of punkte) expect(p).toMatch(/Parken/);
    const viele = Array.from({ length: 6 }, (_, i) => k(`p${i}`, `Parken ${i}`, "Parken erlaubt"));
    const offene = Array.from({ length: 4 }, (_, i) => k(`f${i}`, `Parken offen ${i}?`, "", { art: "frage", status: "zu_klaeren" }));
    // drei Wissens-Einträge beantworten die Frage schon: kein offener Punkt obendrauf (die Antwort bleibt kurz)
    const alle = S.antwortAusKontext("parken", [...viele, ...offene]);
    expect(alle.quellen).toEqual(["p0", "p1", "p2"]);
    expect(unbelegt(alle, [...viele, ...offene])).toEqual([]);
    // bei ein oder zwei Einträgen kommt der offene Punkt zum selben Wort dazu (einer)
    expect(S.antwortAusKontext("parken", [...viele.slice(0, 2), ...offene]).quellen).toEqual(["p0", "p1", "f0"]);
    // gibt es gar kein Wissen dazu: die offenen Punkte, höchstens zwei
    const nurOffen = S.antwortAusKontext("parken", offene);
    expect(nurOffen.quellen).toEqual(["f0", "f1"]);
    expect(nurOffen.text.startsWith("Das ist im Brain noch offen: ")).toBe(true);
  });

  it("mit dem echten Seed: jede Zeile jeder Antwort steht wörtlich in einem Kontext-Knoten", () => {
    const { knoten, kanten } = seedGraph(true);
    const fragen = [
      "Wo sind die Standorte?", "Was kostet Osteopathie?", "Wie erreiche ich euch telefonisch?", "Wie sind die Öffnungszeiten?", "Wann kann man trainieren?",
      "Seit wann gibt es die Praxis?", "Gibt es Parkplätze?", "Wer macht Akupunktur?", "Was ist das Youngster Training?", "Welche Leistungen bietet ihr an?",
      "Behandelt ihr Kassenpatienten?", "Wer ist der Inhaber?", "Wie lautet die Telefonnummer?", "Habt ihr eine E-Mail-Adresse?", "Bietet ihr Hausbesuche an?",
      "Wer gehört zum Team?", "Mit welchen Vereinen arbeitet ihr zusammen?", "Braucht man ein Rezept?", "Was ist Sensopro?", "Wie buche ich einen Termin?",
      "Kann man bei euch mit Karte zahlen?", "Wie wird das Wetter morgen?", "Lymphdrainage", "Manuelle Therapie", "Ice Tigers",
    ];
    let beantwortet = 0;
    for (const frage of fragen) {
      const kontext = S.kontextWaehlen({ frage, knoten, kanten });
      const r = S.antwortAusKontext(frage, kontext);
      expect(unbelegt(r, kontext), frage).toEqual([]);
      expect(r.text, frage).not.toMatch(/[[\]]|TODO|undefined|null/);
      for (const id of r.quellen) expect(kontext.some((x) => x.id === id), `${frage}: ${id}`).toBe(true); // Quellen nur aus dem Kontext
      expect(new Set(r.quellen).size).toBe(r.quellen.length);
      expect(Boolean(r.luecke)).toBe(r.quellen.length === 0); // entweder Quellen oder eine Lücke
      if (r.luecke) expect(r.text).toBe(S.NICHTS_IM_BRAIN); else beantwortet++;
    }
    expect(beantwortet).toBeGreaterThanOrEqual(20);
  });
});

describe("Ein Dutzend Fragen gegen den echten Seed", () => {
  const { knoten, kanten } = seedGraph();
  const frag = (frage) => { const kontext = S.kontextWaehlen({ frage, knoten, kanten }); return { kontext, ...S.antwortAusKontext(frage, kontext) }; };
  const faelle = [
    ["Wo sind die Standorte?", ["s-standorte", "s-standort-kieslingstrasse", "s-standort-thumenberger-weg"], /Kieslingstraße 82, 90491 Nürnberg[\s\S]*Thumenberger Weg 89, 90491 Nürnberg/],
    ["Was kostet Osteopathie?", ["s-leistung-osteopathie"], /85 € pro Behandlungseinheit/],
    ["Wie erreiche ich euch telefonisch?", ["s-telefonzeiten", "s-kontakt"], /Mo 7:30–17:00[\s\S]*\+49 911 23 99 823/],
    ["Wie lautet die Telefonnummer?", ["s-kontakt"], /\+49 911 23 99 823/],
    ["Wann kann man trainieren?", ["s-trainingszeiten"], /Mo–Do 7:00–19:00, Fr 7:00–18:00, Sa 9:00–14:00 Uhr/],
    ["Seit wann gibt es die Praxis?", ["s-geschichte"], /Gegründet 2011/],
    ["Wer ist der Inhaber?", ["s-team-leitung-buero", "s-praxis"], /Philipp Engelhardt/],
    ["Was ist das Youngster Training?", ["s-leistung-youngster-training"], /Kinder und Jugendliche von 10 bis 16 Jahren/],
    ["Welche Leistungen bietet ihr an?", ["s-leistungen"], /Sportphysiotherapie, Manuelle Therapie/],
    ["Wer macht Akupunktur?", ["s-leistung-akupunktur"], /Ohrakupunktur und Dry Needling/],
  ];
  it.each(faelle)("%s → Antwort aus den erwarteten Einträgen", (frage, quellen, muster) => {
    const r = frag(frage);
    expect(r.luecke).toBe("");
    for (const id of quellen) expect(r.quellen, `${frage}: ${r.quellen.join(" ")}`).toContain(id);
    expect(r.quellen[0]).toBe(quellen[0]);
    expect(r.text).toMatch(muster);
    expect(unbelegt(r, r.kontext)).toEqual([]);
  });

  it("„Habt ihr eine E-Mail-Adresse?“ → die Adresse steht in der Antwort („habt“ ist kein Suchwort)", () => {
    const r = frag("Habt ihr eine E-Mail-Adresse?");
    expect(r.luecke).toBe("");
    expect(r.quellen).toContain("s-kontakt");
    expect(r.text).toMatch(/E-Mail: info@physio-works\.de/);
    expect(unbelegt(r, r.kontext)).toEqual([]);
  });

  it.each([
    ["Wie sind die Öffnungszeiten?", "s-frage-oeffnungszeiten", "Wann sind die Praxen selbst geöffnet?"],
    ["Gibt es Parkplätze?", "s-frage-parken", "Gibt es an den Standorten Parkplätze – und sind die Praxen barrierefrei?"],
  ])("%s → noch offen (kein Fakt, keine Lücke)", (frage, id, titel) => {
    const r = frag(frage);
    expect(r.quellen).toEqual([id]);
    expect(r.luecke).toBe("");
    expect(r.text.startsWith(`Das ist im Brain noch offen: **${titel}**`)).toBe(true);
  });

  it("„Behandelt ihr Kassenpatienten?“ → was dasteht (Privatpraxis), dann der offene Punkt zur Abrechnung", () => {
    const r = frag("Behandelt ihr Kassenpatienten?");
    expect(r.quellen).toEqual(["s-praxis", "s-frage-abrechnung"]);
    expect(r.luecke).toBe("");
    expect(r.text).toMatch(/Privatpraxis/);
    expect(r.text).toContain("Noch offen im Brain: **Behandelt ihr auch gesetzlich Versicherte – und wie rechnet ihr ab?**");
  });

  it.each(["Kann man bei euch mit Karte zahlen?", "Wie wird das Wetter morgen?", "Bietet ihr Videotermine an?", "Gibt es eine Warteliste für neue Termine?"])("%s → Lücke", (frage) => {
    const r = frag(frage);
    expect(r).toMatchObject({ text: "Dazu steht noch nichts im Brain.", quellen: [], luecke: frage });
  });

  it("die drei Beispiel-Lücken der Demo sind wirklich Lücken, der Beispiel-Entwurf kommt gekennzeichnet", () => {
    const demo = seedGraph(true);
    for (const l of SEED.demo.luecken) {
      const kontext = S.kontextWaehlen({ frage: l.frage, knoten: demo.knoten, kanten: demo.kanten });
      expect(S.antwortAusKontext(l.frage, kontext).luecke, l.frage).toBe(l.frage);
    }
    const kontext = S.kontextWaehlen({ frage: "Bietet ihr Hausbesuche an?", knoten: demo.knoten, kanten: demo.kanten });
    const r = S.antwortAusKontext("Bietet ihr Hausbesuche an?", kontext);
    expect(r.quellen).toEqual(["s-demo-hausbesuche"]);
    expect(r.text.startsWith("Laut Entwurf (noch nicht bestätigt) – **Hausbesuche (Beispiel-Entwurf):**")).toBe(true);
  });
});

// ---------- Antwortregeln nach Prüfrunde 1 (10.11.2026) – an kleinen, erfundenen Einträgen ----------
describe("Antwort ohne KI: lieber eine Lücke als eine Antwort am Thema vorbei", () => {
  const offen = (id, titel, inhalt = "nicht angegeben", extra = {}) => k(id, titel, inhalt, { art: "frage", status: "zu_klaeren", ...extra });
  const antwort = (frage, knoten, opt) => S.antwortAusKontext(frage, knoten, opt);
  const istLuecke = (r, frage) => { expect(r.text, frage).toBe(S.NICHTS_IM_BRAIN); expect(r.quellen, frage).toEqual([]); expect(r.luecke, frage).toBe(frage); };

  it("eine Eigenschaft zählt nur beim Thema: der Preis in einer Aufzählung gilt nur für seinen Posten", () => {
    const liste = k("w", "Weitere Behandlungen", "Lymphdrainage, Atemtherapie, Krankengymnastik, Osteopathie (Selbstzahler, 85 € pro Einheit), Kinesio-Tape");
    const osteo = k("o", "Osteopathie", "Osteopathie: 85 € pro Einheit.", { tags: ["preis"] });
    // früher: „Was kostet Atemtherapie?“ → der Preis der Osteopathie
    istLuecke(antwort("Was kostet Atemtherapie?", [liste, osteo]), "Was kostet Atemtherapie?");
    expect(antwort("Was kostet Osteopathie?", [liste, osteo]).quellen).toEqual(["o"]);
    expect(antwort("Was kostet Osteopathie?", [liste]).quellen).toEqual(["w"]); // steht der Preis beim Posten selbst, zählt er
    expect(antwort("Bietet ihr Atemtherapie an?", [liste, osteo]).quellen).toEqual(["w"]); // ohne Eigenschaft genügt das Thema
    // mit einem offenen Punkt zur Eigenschaft: das Thema und „noch offen“ – nie der fremde Preis als Antwort
    const preise = offen("p", "Was kosten die übrigen Leistungen?", "Preise: nicht angegeben.", { tags: ["preis"] });
    const r = antwort("Was kostet Atemtherapie?", [liste, osteo, preise]);
    expect(r.quellen).toEqual(["w", "p"]);
    expect(r.text).toContain("Noch offen im Brain: **Was kosten die übrigen Leistungen?**");
  });

  it("ein großgeschriebenes Wort, das nirgends im Brain steht, macht die Frage zur Lücke – auch wenn der Rest passt", () => {
    const park = [k("p", "Parken", "Hinter dem Haus sind fünf Parkplätze.", { tags: ["parken"] }), k("s", "Standorte", "Kieslingstraße 82 und Thumenberger Weg 89, beide mit Aufzug.")];
    expect(antwort("Gibt es Parkplätze?", park).quellen).toEqual(["p"]);
    for (const frage of ["Gibt es Parkplätze mit Ladesäule?", "Habt ihr eine Sauna?", "Gibt es am Thumenberger Weg einen Aufzug und eine Sauna?"]) istLuecke(antwort(frage, park), frage);
    // was mitten im Satz großgeschrieben ist, meldet frageWoerter als Hauptwort
    expect(S.frageWoerter("Gibt es Parkplätze mit Ladesäule?").gross).toEqual(["parkplaetz", "ladesaeul"]);
    expect(S.frageWoerter("Parkplätze gibt es wo?").gross).toEqual([]); // am Satzanfang sagt die Großschreibung nichts
  });

  it("nur „Praxis“ und nichts, was sagt, worum es geht: keine geratene Antwort – außer ein Etikett ist wörtlich gefragt", () => {
    const praxis = [k("x", "Musterpraxis – die Praxis", "Name: Musterpraxis.\nFür wen: Sportler und Schmerzpatienten.\nInhaber: Max Beispiel.\nPhilosophie: Bewegung ist Medizin."), k("g", "Geschichte", "Gegründet 2011.")];
    // früher: „Für wen ist die Praxis?“ → irgendein Eintrag mit „Praxis“ im Titel
    expect(antwort("Für wen ist die Praxis?", praxis)).toEqual({ text: "**Musterpraxis – die Praxis:** Für wen: Sportler und Schmerzpatienten.", quellen: ["x"], luecke: "" });
    istLuecke(antwort("Wie ist die Praxis?", praxis), "Wie ist die Praxis?");
    expect(antwort("Praxis", praxis).quellen).toEqual(["x"]); // als bloßes Stichwort bleibt es eine Suche
    expect(antwort("Wer ist der Inhaber?", praxis).quellen).toEqual(["x"]);
    expect(antwort("Was ist eure Philosophie?", praxis).quellen).toEqual(["x"]);
  });

  it("„X und Y“: zwei Themen, je ein Eintrag – fehlt eines im Brain, ist es eine Lücke", () => {
    const zwei = [k("a", "Akupunktur", "Bei Schmerzen."), k("m", "Manuelle Therapie", "Mobilisierende Techniken."), k("z", "Zeiten", "Mo–Fr.")];
    expect(antwort("Bietet ihr Akupunktur und Manuelle Therapie an?", zwei).quellen).toEqual(["a", "m"]);
    istLuecke(antwort("Bietet ihr Akupunktur und Massage an?", zwei), "Bietet ihr Akupunktur und Massage an?");
  });

  it("Übersichts-Eintrag („Dazu gehören: …“): die genannten Einträge kommen mit – höchstens drei", () => {
    const zwei = [k("a", "Akupunktur", "Bei Schmerzen."), k("m", "Manuelle Therapie", "Mobilisierende Techniken."), k("l", "Leistungen", "Dazu gehören: Akupunktur, Manuelle Therapie.")];
    expect(antwort("Welche Leistungen bietet ihr an?", zwei).quellen).toEqual(["l", "a", "m"]);
    const viele = [k("l", "Leistungen", "Dazu gehören: A1, A2, A3, A4."), ...[1, 2, 3, 4].map((i) => k(`a${i}`, `A${i}`, "Text."))];
    expect(antwort("Welche Leistungen bietet ihr an?", viele).quellen).toEqual(["l"]);
  });

  it("Wochentage: Spannen („Mo–Do“) meinen die Tage dazwischen; „Wochenende“ und „Tag“ sind Oberbegriffe", () => {
    const zeiten = [k("t", "Trainingszeiten", "Mo–Do 7:00–19:00, Fr 7:00–18:00, Sa 9:00–14:00 Uhr."), k("tel", "Telefonzeiten", "Mo 7:30–17:00, Fr 7:30–16:00 Uhr.")];
    expect(S.inhaltsStaemme("Mo–Do 7:00–19:00")).toEqual(expect.arrayContaining(["mo", "di", "mi", "do"]));
    expect(S.mitgemeint("Mo–Do")).toBe("Mo–Do mo di mi do");
    expect(S.mitgemeint("Mo - Fr")).toBe("Mo - Fr mo di mi do fr");
    expect(S.mitgemeint("Montag")).toBe("Montag"); // nichts zu ergänzen
    // früher Lücke: „Mittwoch“ stand nicht wörtlich da
    expect(antwort("Kann ich am Mittwoch trainieren?", zeiten).quellen).toEqual(["t"]);
    expect(antwort("Wann kann ich am Wochenende trainieren?", zeiten).quellen).toEqual(["t"]);
    expect(antwort("An welchen Tagen kann ich trainieren?", zeiten).quellen).toEqual(["t"]);
    // Sonntag steht nirgends: Lücke – „Montag“ meint nicht „Sonntag“
    istLuecke(antwort("Kann ich am Sonntag trainieren?", zeiten), "Kann ich am Sonntag trainieren?");
  });

  it("Ergänzungsstriche und Bindestriche: „Rücken- und Schulterschmerzen“ enthält „Rückenschmerzen“, „Kinesio-Tape“ ist „Kinesiotape“", () => {
    const beschwerden = [k("ak", "Akupunktur", "u. a. bei Rücken- und Schulterschmerzen, Kopfschmerz und Migräne."), k("sp", "Sportphysiotherapie", "Bewegungsanalysen und -korrekturen, Kinesio-Tape.")];
    expect(S.inhaltsStaemme("Rücken- und Schulterschmerzen")).toContain("rueckenschmerz");
    expect(S.inhaltsStaemme("Bewegungsanalysen und -korrekturen")).toContain("bewegungskorrektur");
    expect(S.inhaltsStaemme("Kinesio-Tape")).toContain("kinesiotap");
    expect(antwort("Behandelt ihr Rückenschmerzen?", beschwerden).quellen).toEqual(["ak"]);
    expect(antwort("Macht ihr Bewegungskorrekturen?", beschwerden).quellen).toEqual(["sp"]);
    expect(antwort("Kinesiotape?", beschwerden).quellen).toEqual(["sp"]);
    istLuecke(antwort("Behandelt ihr Knieschmerzen?", beschwerden), "Behandelt ihr Knieschmerzen?");
    // die Anzeige bleibt wörtlich – das Mitgemeinte dient nur dem Vergleich
    expect(antwort("Behandelt ihr Rückenschmerzen?", beschwerden).text).toBe("**Akupunktur:** u. a. bei Rücken- und Schulterschmerzen, Kopfschmerz und Migräne.");
  });

  it("zusammengesetzte Wörter und falsche Freunde: „10er-Karte“ ≠ „Karte“, „Rezept“ ≠ „Rezeption“, „Bewegungsbad“ ≠ „Bewegung“", () => {
    expect(S.woerter("Gibt es 10er-Karten?")).toEqual(["10erkarten"]); // ein Wort (Wörter mit Ziffern bleiben ungekürzt)
    expect(S.woerter("Kann ich mit Karte zahlen?")).toEqual(["kart", "zahl"]);
    const karte = [k("y", "Youngster Training", "mittwochs; 10er-Karten.")];
    expect(antwort("Gibt es 10er-Karten?", karte).quellen).toEqual(["y"]);
    istLuecke(antwort("Kann ich mit Karte zahlen?", karte), "Kann ich mit Karte zahlen?");
    const rez = [k("r", "Rezeption", "Die Rezeption ist von 8 bis 12 Uhr besetzt."), k("b", "Bewegung", "Bewegung ist wichtig.")];
    istLuecke(antwort("Brauche ich ein Rezept?", rez), "Brauche ich ein Rezept?");
    istLuecke(antwort("Habt ihr ein Bewegungsbad?", rez), "Habt ihr ein Bewegungsbad?");
    expect(antwort("Wann ist die Rezeption besetzt?", rez).quellen).toEqual(["r"]);
  });

  it("gebeugte Füllwörter, Gruß und Anrede tragen nichts: „In welchem …“, „Guten Morgen Gabi, …“", () => {
    expect(S.woerter("In welchem Haus seid ihr?")).toEqual([]);
    expect(S.frageWoerter("Guten Morgen Gabi, habt ihr am Samstag auf?").such).toEqual(["samstag", "oeffnungszeit"]);
    expect(S.frageWoerter("Hey, wo seid ihr?").such).toEqual(["standort"]);
    expect(S.frageWoerter("Hallo").such).toEqual(["hallo"].filter((w) => S.woerter(w).length)); // „hallo“ ist selbst ein Füllwort
    expect(S.frageWoerter("Wann macht ihr zu?").such).toEqual(["oeffnungszeit"]);
    expect(S.frageWoerter("Wem gehört die Praxis?").such).toEqual(["praxi", "inhaber"]);
  });

  it("gefragt ist eine Nummer: der Eintrag mit der Nummer geht vor den mit den Telefonzeiten", () => {
    const tel = [k("tz", "Telefonzeiten", "Telefonisch erreichbar: Mo 7:30–17:00 Uhr."), k("kon", "Kontakt", "Telefon: +49 911 23 99 823 · E-Mail: info@example.org")];
    expect(antwort("Wie ist die Telefonnummer?", tel).quellen[0]).toBe("kon");
    expect(antwort("Tel nr?", tel).quellen[0]).toBe("kon");
    expect(antwort("Wann kann ich anrufen?", tel).quellen).toEqual(["tz"]);
  });

  it("offene Punkte: der beste zuerst; einer, der im Titel einen anderen Eintrag nennt, gehört zu jenem", () => {
    const eintraege = [
      k("aku", "Akupunktur", "Bei Schmerzen. Genannt wird Dr. Muster."),
      offen("o1", "Führt Dr. Muster alle Akupunktur-Behandlungen selbst durch?"),
      offen("o2", "Was kosten die Leistungen?", "Preise: nicht angegeben.", { tags: ["preis"] }),
    ];
    expect(antwort("Akupunktur", eintraege).quellen).toEqual(["aku", "o1"]);
    expect(antwort("Was kostet Akupunktur?", eintraege).quellen).toEqual(["aku", "o2"]);
    expect(antwort("Wer ist Dr. Muster?", eintraege).quellen).toEqual(["aku"]); // das Wissen geht vor, der offene Punkt trägt nichts bei
    // nur offene Punkte: die besten zwei, in ihrer Reihenfolge (früher rutschte der beste hinter die „verwandten“)
    const nurOffen = Array.from({ length: 4 }, (_, i) => offen(`f${i}`, `Parken offen ${i}?`, ""));
    expect(antwort("parken", nurOffen).quellen).toEqual(["f0", "f1"]);
  });

  it("fehlt die gefragte Eigenschaft überall: nur der eine Eintrag zum Thema – und nur zusammen mit einem offenen Punkt dazu", () => {
    const eintraege = [
      k("mtt", "Trainingstherapie", "Gerätegestütztes Training unter Anleitung."),
      k("zeit", "Trainingszeiten", "Zeiten der Trainingstherapie: Mo–Fr 7–19 Uhr."),
      k("team", "Team", "Anna Beispiel (Trainingstherapie)."),
    ];
    const preise = offen("p", "Was kosten die Leistungen?", "Preise: nicht angegeben.", { tags: ["preis"] });
    istLuecke(antwort("Was kostet die Trainingstherapie?", eintraege), "Was kostet die Trainingstherapie?");
    expect(antwort("Was kostet die Trainingstherapie?", [...eintraege, preise]).quellen).toEqual(["mtt", "p"]);
    // ohne Eigenschaft bleibt es bei allem, was das Thema trägt
    expect(antwort("Trainingstherapie", eintraege).quellen[0]).toBe("mtt");
  });

  it("führt der beste Eintrag das Thema im Titel, kommen keine Einträge dazu, die es nur im Text erwähnen – außer das Fragewort zeigt auf sie", () => {
    const eintraege = [
      k("ost", "Osteopathie", "Selbstzahlerleistung."),
      k("std", "Standorte", "Osteopathie gibt es nur in der Kieslingstraße."),
      k("team", "Team", "Nadja Beispiel (auch Osteopathie).", { tags: ["team"] }),
    ];
    expect(antwort("Osteopathie", eintraege).quellen).toEqual(["ost"]);
    expect(antwort("Wer macht Osteopathie?", eintraege).quellen).toEqual(["ost", "team"]); // „wer“ → Team
    expect(antwort("Wo gibt es Osteopathie?", eintraege).quellen).toEqual(["ost", "std"]); // „wo“ → Standorte
  });

  it("zielFinden: der Eintrag muss das Gemeinte in Titel oder Tags tragen; ein Titel nur aus den genannten Wörtern gewinnt", () => {
    const eintraege = [k("kon", "Kontakt und Zeiten", "Telefon 123"), k("tz", "Telefonzeiten", "Mo 8–12"), k("o", "Osteopathie", "85 €", { tags: ["preis"] })];
    expect(S.zielFinden("die Telefonzeiten", eintraege).id).toBe("tz");
    expect(S.zielFinden("den Preis der Osteopathie", eintraege).id).toBe("o");
    expect(S.zielFinden("die Mittagspause", eintraege)).toBeNull();
    expect(S.zielFinden("", eintraege)).toBeNull();
    expect(S.zielFinden("die Telefonzeiten", [])).toBeNull();
  });
});
