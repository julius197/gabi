// Demo-Assistent mit Brain (demo.js): Kommt der Brain-Kontext mit, beantwortet Gabi Praxisfragen NUR daraus – mit den
// Ereignissen „quellen“ (Knoten) und „luecke“ – und erfindet nichts aus dem fest eingebauten Wissen dazu. Notiz-Fragen
// laufen weiter über die Werkzeuge. „Merke dir“/„Ändere“/Interview liefern Vorschläge, nie gespeicherte Änderungen.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { erstelleWerkzeuge } from "../src/chat.js";
import { arbeitsspeicher } from "../src/speicher.js";

const require = createRequire(import.meta.url);
const DEMO = require("../../demo.js");
const B = require("../../brain.js");
const SP = require("../../brain-speicher.js");
const S = require("../../brain-suche.js");
const IV = require("../../brain-interview.js");
const SEED = require("../../brain-seed.js");

const NICHTS = "Dazu steht noch nichts im Brain.";
const VORSCHLAG = "Passt das so? Gespeichert wird erst, wenn du auf „Übernehmen“ tippst.";
const LEER = { v: 1, knoten: [] };
const demoApi = () => DEMO.erstelleApi({ ablage: DEMO.speicherAblage(), verzoegerung: false });
const text = (e) => e.filter((x) => x.t === "text").map((x) => x.d).join("");
const von = (e, t) => e.filter((x) => x.t === t);
/** Ein Gesprächsschritt über die Demo-API (wie die Oberfläche): brainKontext undefined = Brain aus. */
async function frag(frage, brainKontext, extra = {}) {
  const e = [];
  await demoApi().chatten({ nachrichten: [{ rolle: "nutzer", text: frage }], ...(brainKontext === undefined ? {} : { brainKontext }), ...extra }, (x) => e.push(x));
  return e;
}
async function seedBrain(demo = false) {
  const ablage = SP.speicherAblage();
  await ablage.bereit();
  const brain = B.erstelle({ ablage, seed: SEED, demo, jetzt: () => Date.UTC(2026, 10, 10, 9) });
  await brain.laden();
  return brain;
}

// Je eingebauter Praxis-Antwort (DEMO.PRAXIS, in dieser Reihenfolge) eine Frage, die genau sie auslöst
const PRAXIS_FRAGEN = [
  "Wo sind die Standorte?", "Seit wann gibt es PhysioWorks?", "Wie ist die Telefonnummer?", "Behandelt ihr auch Profisportler?", "Brauche ich ein Rezept?",
  "Was kostet Osteopathie?", "Macht ihr Akupunktur?", "Was ist das Youngster Training?", "Wann sind die Trainingszeiten?", "Wer gehört zum Team?", "Welche Leistungen gibt es?",
];

describe("Ohne Brain-Kontext bleibt der Demo-Assistent, wie er war", () => {
  it("die Beispiel-Fragen lösen wirklich jede eingebaute Praxis-Antwort aus (Vollständigkeit der Liste)", () => {
    expect(PRAXIS_FRAGEN).toHaveLength(DEMO.PRAXIS.length);
    PRAXIS_FRAGEN.forEach((frage, i) => expect(DEMO.absichtErkennen(frage, ["TP-01"]), frage).toEqual({ art: "praxis", text: DEMO.PRAXIS[i].text }));
  });

  it("Praxisfragen kommen aus den eingebauten Texten – ohne „quellen“ mit Knoten, ohne „luecke“", async () => {
    for (const [i, frage] of PRAXIS_FRAGEN.entries()) {
      const e = await frag(frage);
      expect(text(e), frage).toBe(DEMO.PRAXIS[i].text);
      expect(von(e, "luecke")).toEqual([]);
      expect(von(e, "quellen").filter((q) => q.knoten)).toEqual([]);
      expect(e[e.length - 1]).toEqual({ t: "fertig" });
    }
    // auch „Merke dir“ ist ohne Brain kein Befehl
    expect(von(await frag("Merke dir: Parken: Hinter dem Haus sind 5 Plätze"), "brain_vorschlag")).toEqual([]);
  });
});

describe("Mit Brain-Kontext: Praxisfragen nur aus dem Brain", () => {
  it("LEERER Kontext: für JEDE eingebaute Praxis-Antwort kommt „Dazu steht noch nichts im Brain.“ und eine Lücke – nie der eingebaute Text", async () => {
    for (const [i, frage] of PRAXIS_FRAGEN.entries()) {
      const e = await frag(frage, LEER);
      expect(text(e), frage).toBe(NICHTS);
      expect(von(e, "luecke"), frage).toEqual([{ t: "luecke", frage }]);
      expect(von(e, "quellen"), frage).toEqual([]);
      expect(text(e)).not.toContain(DEMO.PRAXIS[i].text.slice(0, 40));
      expect(e[e.length - 1]).toEqual({ t: "fertig" });
    }
  });

  it("Kontext, der nicht zur Frage passt: ebenfalls Lücke – kein Rückgriff auf das eingebaute Wissen", async () => {
    const fremd = { v: 1, knoten: [{ id: "k-team", art: "praxiswissen", status: "bestaetigt", titel: "Mittagspause", inhalt: "Zwischen 12 und 13 Uhr ist die Rezeption nicht besetzt.", tags: [] }] };
    for (const [i, frage] of PRAXIS_FRAGEN.entries()) {
      const e = await frag(frage, fremd);
      expect(text(e), frage).toBe(NICHTS);
      expect(von(e, "luecke")).toHaveLength(1);
      for (const zahl of DEMO.PRAXIS[i].text.match(/\d{2,}/g) || []) expect(text(e), `${frage}: ${zahl}`).not.toContain(zahl);
    }
  });

  it("jede Zahl und jede Zeile der Antwort steht im Kontext – auch wenn das eingebaute Wissen etwas anderes sagt", async () => {
    // Das Brain widerspricht dem eingebauten Text (dort: Kieslingstraße 82 und Thumenberger Weg 89, gegründet 2011)
    const kontext = { v: 1, knoten: [
      { id: "k-ort", art: "praxiswissen", status: "bestaetigt", titel: "Standorte", inhalt: "Nur noch ein Standort: Musterweg 5, 90402 Nürnberg.", tags: ["standort"] },
      { id: "k-alt", art: "praxiswissen", status: "bestaetigt", titel: "Geschichte der Praxis", inhalt: "Gegründet 1999.", tags: ["geschichte"] },
    ] };
    const ort = await frag("Wo sind die Standorte?", kontext);
    expect(text(ort)).toBe("**Standorte:** Nur noch ein Standort: Musterweg 5, 90402 Nürnberg.");
    expect(text(ort)).not.toMatch(/Kieslingstraße|Thumenberger/);
    expect(von(ort, "quellen")).toEqual([{ t: "quellen", knoten: ["k-ort"] }]);
    expect(von(ort, "luecke")).toEqual([]);
    const alt = await frag("Seit wann gibt es PhysioWorks?", kontext);
    expect(text(alt)).not.toContain("2011");
    // die Quellen kommen vor dem Text (die Chips stehen, sobald die Antwort läuft)
    expect(ort.findIndex((x) => x.t === "quellen")).toBeLessThan(ort.findIndex((x) => x.t === "text"));
  });

  it("mit dem echten Seed: Quellen nur aus dem Kontext, Text nur aus dem Kontext, Entwürfe und Offenes gekennzeichnet", async () => {
    const brain = await seedBrain(true);
    const glatt = (t) => String(t).replace(/\s+/g, " ").trim();
    for (const frage of [...PRAXIS_FRAGEN, "Bietet ihr Hausbesuche an?", "Wie sind die Öffnungszeiten?", "Gibt es Parkplätze?"]) {
      const kontext = brain.kontextFuer(frage);
      const e = await frag(frage, kontext);
      const erlaubt = new Set(kontext.knoten.map((k) => k.id));
      const quellen = von(e, "quellen").flatMap((q) => q.knoten || []);
      for (const id of quellen) expect(erlaubt.has(id), `${frage}: ${id}`).toBe(true);
      expect(von(e, "quellen").every((q) => Array.isArray(q.knoten) && !q.notizen), frage).toBe(true);
      // jede Zeile: fester Vorsatz, Titel eines Kontext-Knotens oder wörtlich aus einem Kontext-Inhalt
      const inhalt = kontext.knoten.map((k) => glatt(S.ohneVerweise(k.inhalt)));
      const titel = new Set(kontext.knoten.map((k) => glatt(k.titel)));
      for (const roh of text(e).split("\n")) {
        let z = roh.trim().replace(/^- /, "").replace(/^Laut Entwurf \(noch nicht bestätigt\) – /, "").replace(/^(?:Noch offen im Brain|Das ist im Brain noch offen): /, "");
        if (!z || z === NICHTS) continue;
        const m = /^\*\*(.+?):?\*\*(?::)?(?: – |\s*)(.*)$/.exec(z);
        if (m) { expect(titel.has(glatt(m[1]).replace(/:$/, "")), `${frage}: Titel „${m[1]}“`).toBe(true); z = m[2]; }
        const g = glatt(z).replace(/ …$/, "");
        expect(!g || inhalt.some((i) => i.includes(g)), `${frage}: „${g}“ steht nicht im Kontext`).toBe(true);
      }
      expect(text(e)).not.toMatch(/[[\]]/); // keine eckigen Klammern in der Antwort
      expect(von(e, "luecke").length + (quellen.length ? 1 : 0), frage).toBe(1); // entweder Quellen oder genau eine Lücke
    }
    const haus = await frag("Bietet ihr Hausbesuche an?", brain.kontextFuer("Bietet ihr Hausbesuche an?"));
    expect(text(haus).startsWith("Laut Entwurf (noch nicht bestätigt) – ")).toBe(true);
    const offen = await frag("Gibt es Parkplätze?", brain.kontextFuer("Gibt es Parkplätze?"));
    expect(text(offen).startsWith("Das ist im Brain noch offen: ")).toBe(true);
    expect(von(offen, "quellen")).toEqual([{ t: "quellen", knoten: ["s-frage-parken"] }]);
  });

  it("auch direkt über demoGespraech mit den echten Worker-Werkzeugen (lokaler Betrieb ohne KI-Schlüssel)", async () => {
    const speicher = arbeitsspeicher();
    await speicher.neuerPatient({ kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)" });
    const werkzeuge = erstelleWerkzeuge({ speicher, strukturieren: async () => ({}) });
    const lauf = async (letzte, brain, extra = {}) => { const e = []; await DEMO.demoGespraech({ letzte, werkzeuge, senden: (x) => e.push(x), brain, ...extra }); return e; };
    const kontext = { v: 1, knoten: [{ id: "k-parken", art: "praxiswissen", status: "bestaetigt", titel: "Parken", inhalt: "Hinter dem Haus sind fünf Plätze.", tags: ["parken"] }] };
    const e = await lauf("Wo kann man parken?", kontext);
    expect(von(e, "quellen")).toEqual([{ t: "quellen", knoten: ["k-parken"] }]);
    expect(text(e)).toBe("**Parken:** Hinter dem Haus sind fünf Plätze.");
    // hereingereichte Hilfen haben Vorrang (so nutzt der lokale Server sie)
    const eigene = await lauf("Wo kann man parken?", kontext, { brainAntwort: () => ({ text: "Aus der Attrappe.", quellen: ["k-parken"], luecke: "" }) });
    expect(text(eigene)).toBe("Aus der Attrappe.");
    expect(text(await lauf("Wo sind die Standorte?", LEER))).toBe(NICHTS);
    expect(text(await lauf("Wo sind die Standorte?", null))).toBe(DEMO.PRAXIS[0].text); // ohne Kontext: eingebaut
  });
});

describe("Mit Brain-Kontext: alles andere bleibt", () => {
  it("Notiz-Fragen (Kürzel, „Suche in meinen Notizen“, Heute, Bericht) laufen weiter über die Werkzeuge", async () => {
    const brain = await seedBrain();
    for (const kontext of [LEER, brain.kontextFuer("Was wollte TP-01?")]) {
      const e = await frag("Was wollte TP-01?", kontext);
      expect(text(e)).toMatch(/hat \*\*TP-01\*\* gesagt/);
      expect(von(e, "quellen").every((q) => Array.isArray(q.notizen) && !q.knoten)).toBe(true);
      expect(von(e, "quellen").length).toBeGreaterThan(0);
      expect(von(e, "luecke")).toEqual([]);
    }
    expect(text(await frag("Hausaufgaben von TP-02", LEER))).toMatch(/\*\*TP-02\*\* diese Hausaufgaben/);
    const suche = await frag("Suche in meinen Notizen: Theraband", LEER);
    expect(text(suche)).toMatch(/2 Notizen zu „Theraband“ gefunden/);
    expect(von(suche, "luecke")).toEqual([]);
    // der ausdrückliche Notiz-Auftrag bleibt eine Notiz-Suche – auch wenn das Brain zum Suchwort etwas wüsste
    const mitTreffer = brain.kontextFuer("Akupunktur");
    expect(mitTreffer.knoten.map((k) => k.id)).toContain("s-leistung-akupunktur");
    for (const kontext of [undefined, LEER, mitTreffer]) {
      const e = await frag("Suche in meinen Notizen: Akupunktur", kontext);
      expect(text(e)).toBe("Dazu habe ich nichts gespeichert."); // in den Beispiel-Notizen steht nichts dazu
      expect(von(e, "quellen").filter((q) => q.knoten)).toEqual([]);
      expect(von(e, "luecke")).toEqual([]);
    }
    // … selbst wenn fast jedes Suchwort im Brain stünde
    const viele = "Akupunktur Arthrose Migräne Tennisarm";
    const kontextViele = brain.kontextFuer(viele);
    expect(S.antwortAusKontext(viele, kontextViele.knoten).quellen).toContain("s-leistung-akupunktur"); // als Frage hätte das Brain geantwortet
    const e2 = await frag(`Suche in meinen Notizen: ${viele}`, kontextViele);
    expect(von(e2, "quellen").filter((q) => q.knoten)).toEqual([]);
    expect(von(e2, "luecke")).toEqual([]);
    expect(text(e2)).toBe("Dazu habe ich nichts gespeichert.");
    // ohne den Auftrag ist dasselbe Wort eine Frage ans Brain
    expect(von(await frag("Akupunktur", mitTreffer), "quellen")[0].knoten).toContain("s-leistung-akupunktur");
    expect(text(await frag("Was steht heute an?", LEER))).toMatch(/^Heute ist /);
    const bericht = await frag("Verlaufsbericht für TP-01", LEER);
    expect(von(bericht, "bericht")).toHaveLength(1);
    // ein einzelnes Suchwort ohne Frageform bleibt eine Notiz-Suche, Unsinn wird keine Lücke
    expect(text(await frag("Theraband", LEER))).toMatch(/2 Notizen zu „Theraband“ gefunden/);
    const unsinn = await frag("asdf", LEER);
    expect(text(unsinn)).toBe("Dazu habe ich nichts gespeichert.");
    expect(von(unsinn, "luecke")).toEqual([]);
  });

  // Stichwörter („Theraband?“) sind auch mit Brain erst eine Suche in den Notizen – wie ohne Brain. Früher wurde daraus
  // sofort eine Praxisfrage: die Notizen blieben ungefragt und die Frage landete als Lücke im Brain.
  it("Stichwort mit Fragezeichen: erst die Notizen – nur wenn auch dort nichts steht, ist es eine Lücke", async () => {
    expect(text(await frag("Theraband?"))).toMatch(/2 Notizen zu „Theraband“ gefunden/); // ohne Brain
    const e = await frag("Theraband?", LEER);
    expect(text(e)).toMatch(/2 Notizen zu „Theraband“ gefunden/);
    expect(von(e, "luecke")).toEqual([]);
    expect(von(e, "quellen").filter((q) => q.knoten)).toEqual([]);
    // weder im Brain noch in den Notizen: Lücke (mit Fragezeichen) bzw. „nichts gespeichert“ (ohne)
    const wickel = await frag("Wickeltisch?", LEER);
    expect(text(wickel)).toBe(NICHTS);
    expect(von(wickel, "luecke")).toEqual([{ t: "luecke", frage: "Wickeltisch?" }]);
    const ohneFrage = await frag("Wickeltisch", LEER);
    expect(text(ohneFrage)).toBe("Dazu habe ich nichts gespeichert.");
    expect(von(ohneFrage, "luecke")).toEqual([]);
    // steht das Stichwort im Brain, kommt die Antwort von dort – ohne Umweg über die Notizen
    const brain = await seedBrain(true);
    const aku = await frag("Akupunktur?", brain.kontextFuer("Akupunktur?"));
    expect(von(aku, "quellen")[0].knoten).toContain("s-leistung-akupunktur");
  });

  it("ausformulierte Praxisfrage ohne Treffer: gleich die Lücke – die Notizen der Patienten werden dafür nicht durchsucht", async () => {
    const e = await frag("Habt ihr einen Wickeltisch?", LEER);
    expect(text(e)).toBe(NICHTS);
    expect(von(e, "luecke")).toEqual([{ t: "luecke", frage: "Habt ihr einen Wickeltisch?" }]);
    expect(von(e, "status")).toEqual([]); // kein Werkzeug gelaufen („Ich suche in den Notizen …“ erschiene als Status)
    expect(von(await frag("Theraband?", LEER), "status").length).toBeGreaterThan(0); // Gegenstück: hier lief die Notiz-Suche
    // ist ausdrücklich von Notizen die Rede, bleibt es eine Notiz-Suche – in jeder Formulierung
    for (const frage of ["Was steht in den Notizen zu Theraband?", "Suche in meinen Notizen: Theraband", "Gibt es eine Notiz mit Theraband?"]) {
      const n = await frag(frage, LEER);
      expect(text(n), frage).toMatch(/Notizen zu „Theraband“ gefunden/);
      expect(von(n, "luecke"), frage).toEqual([]);
    }
  });

  it("medizinischer Rat ist keine Wissenslücke: Gabi lehnt ab – auch wenn das Brain etwas dazu enthielte", async () => {
    const eintrag = { id: "k-ibu", art: "praxiswissen", status: "bestaetigt", titel: "Ibuprofen", inhalt: "Bei Schmerzen 400 mg Ibuprofen nehmen. Übungen bei Bandscheibenvorfall: Rückenstrecker.", tags: ["medikament"] };
    const mitWissen = { v: 1, knoten: [eintrag] };
    const absage = text(await frag("Welche Übungen soll ich empfehlen?")); // die bisherige Absage, wörtlich
    expect(absage).toMatch(/Diagnosen und Empfehlungen gebe ich nicht/);
    for (const frage of ["Soll ich Ibuprofen nehmen?", "Welche Übungen helfen bei einem Bandscheibenvorfall?", "Was hilft gegen Rückenschmerzen?", "Welches Schmerzmittel ist gut?", "Darf er die Tablette nehmen?"]) {
      for (const kontext of [LEER, mitWissen]) {
        const e = await frag(frage, kontext);
        expect(text(e), frage).toBe(absage);
        expect(von(e, "luecke"), frage).toEqual([]);
        expect(von(e, "quellen").filter((q) => q.knoten), frage).toEqual([]);
        expect(text(e)).not.toMatch(/400 mg|Rückenstrecker/);
      }
    }
    // Praxisfragen, die nur so ähnlich klingen, bleiben Praxisfragen
    const brain = await seedBrain(true);
    for (const frage of ["Bietet ihr Akupunktur bei Migräne an?", "Kann ich als Selbstzahler kommen?"]) {
      const e = await frag(frage, brain.kontextFuer(frage));
      expect(text(e), frage).not.toBe(absage);
      expect(von(e, "quellen").length, frage).toBe(1);
    }
    const mitbringen = await frag("Muss ich ein Handtuch mitbringen?", LEER);
    expect(text(mitbringen)).toBe(NICHTS);
    expect(von(mitbringen, "luecke")).toHaveLength(1);
  });

  it("„Merke dir“ geht vor: ein Satz mit „empfehlen“ ist Praxiswissen, keine Bitte um Rat", async () => {
    const e = await frag("Merke dir: Wir empfehlen, zehn Minuten früher da zu sein.", LEER);
    expect(von(e, "brain_vorschlag")).toHaveLength(1);
    expect(von(e, "brain_vorschlag")[0].vorschlag).toMatchObject({ typ: "neu", ohneKi: true });
    expect(von(e, "brain_vorschlag")[0].vorschlag.inhalt).toMatch(/zehn Minuten früher/);
    expect(text(e)).toBe(VORSCHLAG);
    // ohne Brain bleibt derselbe Satz, was er war (die Absage)
    expect(text(await frag("Merke dir: Wir empfehlen, zehn Minuten früher da zu sein."))).toMatch(/Empfehlungen gebe ich nicht/);
  });

  it("„Ändere X: Y“ trifft den Eintrag X – auch wenn Y nach einem anderen Eintrag klingt", async () => {
    const brain = await seedBrain(true);
    const bitte = "Ändere die Telefonzeiten: samstags geschlossen";
    const kontext = brain.kontextFuer(bitte);
    // die Suche über den ganzen Satz führt zum offenen Punkt über die Öffnungszeiten („samstags geschlossen“) …
    expect(kontext.knoten[0].titel).toBe("Wann sind die Praxen selbst geöffnet?");
    expect(kontext.knoten.map((k) => k.id)).toContain("s-telefonzeiten");
    // … der Vorschlag gilt trotzdem den Telefonzeiten
    const e = await frag(bitte, kontext);
    const v = von(e, "brain_vorschlag")[0].vorschlag;
    expect(v).toMatchObject({ typ: "aendern", id: "s-telefonzeiten", ohneKi: true });
    expect(v.inhalt).toMatch(/7:30–16:00/); // der bisherige Inhalt bleibt
    expect(v.inhalt).toMatch(/samstags geschlossen/);
    expect(text(e)).toMatch(/Änderung für \*\*Telefonzeiten\*\* vorbereitet/);
  });

  it("der Name der Praxis muss in der Antwort nicht vorkommen", async () => {
    const brain = await seedBrain(true);
    const frage = "Seit wann gibt es PhysioWorks?";
    const e = await frag(frage, brain.kontextFuer(frage));
    expect(von(e, "quellen")[0].knoten).toEqual(["s-geschichte"]);
    expect(text(e)).toMatch(/Gegründet 2011/);
  });

  it("Bedienung, Begrüßung, Dank und die Absage an Diagnosen/Empfehlungen bleiben wörtlich gleich", async () => {
    for (const frage of ["Wie kann ich mich abmelden?", "Wie verwerfe ich eine Aufnahme?", "Hallo", "Danke", "Was kannst du?", "Welche Übungen soll ich empfehlen?", "Ist das schlimm?"]) {
      const ohne = await frag(frage);
      const mit = await frag(frage, LEER);
      expect(text(mit), frage).toBe(text(ohne));
      expect(von(mit, "luecke"), frage).toEqual([]);
      expect(von(mit, "quellen"), frage).toEqual([]);
    }
    expect(text(await frag("Welche Übungen soll ich empfehlen?", LEER))).toBe(DEMO.ANTWORT.rat);
  });
});

describe("Mit Brain-Kontext: Vorschläge statt Speichern", () => {
  it("„Merke dir: …“ → Vorschlag für einen NEUEN Eintrag (ohne KI gekennzeichnet), nichts wird gespeichert", async () => {
    const e = await frag("Merke dir: Parken: Hinter dem Haus sind 5 Plätze", LEER);
    expect(von(e, "brain_vorschlag")).toEqual([{ t: "brain_vorschlag", vorschlag: { typ: "neu", titel: "Parken", inhalt: "Hinter dem Haus sind 5 Plätze.", grund: "merken", ohneKi: true } }]);
    expect(text(e)).toBe(VORSCHLAG);
    expect(von(e, "luecke")).toEqual([]);
    expect(von(e, "quellen")).toEqual([]);
    expect(e[e.length - 1]).toEqual({ t: "fertig" });
    // Notiz-Bezug ist kein Brain-Befehl
    expect(von(await frag("Merke dir: TP-01 kommt immer zu spät", LEER), "brain_vorschlag")).toEqual([]);
  });

  it("„Ändere …“ → Änderungsvorschlag für den ERSTEN Kontext-Knoten; alter Inhalt samt Verweisen bleibt", async () => {
    const brain = await seedBrain();
    const frage = "Ändere die Telefonzeiten: freitags nur bis 15 Uhr";
    const kontext = brain.kontextFuer(frage);
    expect(kontext.knoten[0].id).toBe("s-telefonzeiten");
    const e = await frag(frage, kontext);
    const [v] = von(e, "brain_vorschlag").map((x) => x.vorschlag);
    const alt = brain.hol("s-telefonzeiten");
    expect(v).toMatchObject({ typ: "aendern", id: "s-telefonzeiten", titel: "Telefonzeiten", grund: "aenderung", ohneKi: true });
    expect(v.inhalt).toBe(`${alt.inhalt}\n\nDie Telefonzeiten: freitags nur bis 15 Uhr.`);
    for (const verweis of alt.inhalt.match(/\[\[[^\]]+\]\]/g) || []) expect(v.inhalt).toContain(verweis); // Verbindungen bleiben
    expect(text(e)).toBe(`Ich habe eine Änderung für **Telefonzeiten** vorbereitet. ${VORSCHLAG}`);
    expect(brain.hol("s-telefonzeiten").inhalt).toBe(alt.inhalt); // das Brain selbst ist unverändert
    // ohne passenden Eintrag: kein Vorschlag, sondern der Hinweis auf „Merke dir“
    const leer = await frag(frage, LEER);
    expect(von(leer, "brain_vorschlag")).toEqual([]);
    expect(text(leer)).toMatch(/^Dazu steht noch nichts im Brain – ich weiß nicht, welchen Eintrag ich ändern soll\./);
    expect(von(leer, "luecke")).toEqual([]);
  });

  it("Interview (Aktion brain_antwort) → Vorschlag für genau diesen Knoten, ohne Test-Patienten", async () => {
    const knoten = { id: "s-frage-oeffnungszeiten", titel: "Wann sind die Praxen selbst geöffnet?", inhalt: "Nicht angegeben.\n\nBetrifft: [[Kontakt und Zeiten]]" };
    const e = await frag("also, montags bis freitags 8 bis 18 Uhr", undefined, { aktion: { typ: "brain_antwort", knoten, antwort: "also, montags bis freitags 8 bis 18 Uhr" } });
    expect(von(e, "brain_vorschlag")).toEqual([{ t: "brain_vorschlag", vorschlag: { typ: "aendern", id: knoten.id, titel: knoten.titel, inhalt: "Montags bis freitags 8 bis 18 Uhr.\n\nBetrifft: [[Kontakt und Zeiten]]", grund: "interview", ohneKi: true } }]);
    expect(text(e)).toBe(VORSCHLAG);
    expect(e[e.length - 1]).toEqual({ t: "fertig" });
    expect(von(e, "fehler")).toEqual([]);
    // fehlt die Antwort in der Aktion, zählt die letzte Nachricht
    const ohne = await frag("Nur privat", undefined, { aktion: { typ: "brain_antwort", knoten, antwort: "" } });
    expect(von(ohne, "brain_vorschlag")[0].vorschlag.inhalt.startsWith("Nur privat.")).toBe(true);
    // Diktat und Bericht brauchen weiter einen Test-Patienten
    const diktat = await frag("Knie rechts", undefined, { aktion: { typ: "diktat", patient_id: "gibt-es-nicht", text: "Knie rechts" } }).catch((f) => f);
    expect(diktat instanceof Error ? diktat.message : text(diktat)).toMatch(/Test-Patient nicht gefunden/);
  });

  it("die Demo-Spracherkennung liefert im Interview eine neutrale Beispielantwort (erfindet nichts über die Praxis)", async () => {
    const api = demoApi();
    const r = await api.anfrage("/api/transkribieren?zweck=antwort", { methode: "POST", text: "A".repeat(300) });
    expect(r).toEqual({ text: IV.DEMO_ANTWORT });
    expect(r.text).not.toMatch(/\d/);
    // die anderen Zwecke bleiben: Frage und Diktat
    expect((await api.anfrage("/api/transkribieren?zweck=frage", { methode: "POST", text: "A".repeat(300) })).text).toBe(DEMO.FRAGEN[0]);
    expect((await api.anfrage("/api/transkribieren", { methode: "POST", text: "A".repeat(300) })).text).toBe(DEMO.DIKTATE[0].rohtext);
  });

  it("ein kaputter brainKontext (kein Objekt) zählt wie keiner", async () => {
    for (const kaputt of ["knoten", 42, true]) expect(text(await frag("Wo sind die Standorte?", kaputt))).toBe(DEMO.PRAXIS[0].text);
    // Objekt ohne Knotenliste: Brain ist an, aber leer → Lücke statt eingebautem Text
    expect(text(await frag("Wo sind die Standorte?", { v: 1 }))).toBe(NICHTS);
    expect(text(await frag("Wo sind die Standorte?", { v: 1, knoten: "nein" }))).toBe(NICHTS);
  });
});
