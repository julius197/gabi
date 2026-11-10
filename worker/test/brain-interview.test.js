// Brain-Interview und Chat-Befehle (brain-interview.js) ohne Browser: Befehle erkennen, Vorschläge ohne KI (nichts
// dazuerfunden, Verbindungen bleiben), Reihenfolge und Wortlaut der Interview-Fragen, Antwort auf „Wie vollständig …?“.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const IV = require("../../brain-interview.js");
const S = require("../../brain-suche.js");
const SEED = require("../../brain-seed.js");

const art = (text) => { const b = IV.befehlErkennen(text); return b ? b.art : null; };

describe("Brain-Befehle im Gespräch erkennen", () => {
  it("„Merke dir …“ in mehreren Formulierungen – der Inhalt kommt ohne Vorsatz zurück", () => {
    expect(IV.befehlErkennen("Merke dir: Parken hinter dem Haus")).toEqual({ art: "merken", text: "Parken hinter dem Haus" });
    expect(IV.befehlErkennen("merk dir, dass wir samstags geschlossen haben")).toEqual({ art: "merken", text: "wir samstags geschlossen haben" });
    expect(IV.befehlErkennen("Gabi, merke dir bitte: ab 10 Uhr ist die Rezeption besetzt")).toEqual({ art: "merken", text: "ab 10 Uhr ist die Rezeption besetzt" });
    expect(IV.befehlErkennen("Bitte merk dir – Handtuch mitbringen")).toEqual({ art: "merken", text: "Handtuch mitbringen" });
    expect(IV.befehlErkennen("  MERKE DIR Osteopathie kostet 85 Euro  ")).toEqual({ art: "merken", text: "Osteopathie kostet 85 Euro" });
    expect(IV.befehlErkennen("Merke dir:\n\nMo–Fr 8–18 Uhr\nSa geschlossen").text).toBe("Mo–Fr 8–18 Uhr\nSa geschlossen");
  });

  it("Ziel eines Änderungswunschs: der Teil, der sagt, WAS geändert wird – nicht der neue Inhalt", () => {
    expect(IV.aendernZiel("die Telefonzeiten: samstags geschlossen")).toBe("die Telefonzeiten");
    expect(IV.aendernZiel("die Öffnungszeiten auf 8 bis 18 Uhr")).toBe("die Öffnungszeiten");
    expect(IV.aendernZiel("die Telefonzeiten – freitags bis 15 Uhr")).toBe("die Telefonzeiten");
    expect(IV.aendernZiel("die Hausordnung, dass Hunde erlaubt sind")).toBe("die Hausordnung");
    // ohne Trennung bleibt der ganze Text das Ziel
    expect(IV.aendernZiel("Parken")).toBe("Parken");
    expect(IV.aendernZiel("den Eintrag zum Parken hinter dem Haus")).toBe("den Eintrag zum Parken hinter dem Haus");
    // der Befehl selbst liefert den Text nach dem Verb
    expect(IV.aendernZiel(IV.befehlErkennen("Ändere die Telefonzeiten: samstags geschlossen").text)).toBe("die Telefonzeiten");
  });

  it("auch als Frage („Kannst du dir merken, dass …?“) und mit „ins Brain“ („Schreib ins Brain: …“)", () => {
    expect(IV.befehlErkennen("Kannst du dir merken, dass wir montags erst um 9 öffnen?")).toEqual({ art: "merken", text: "wir montags erst um 9 öffnen" });
    expect(IV.befehlErkennen("Könntest du dir bitte merken: Handtuch mitbringen")).toEqual({ art: "merken", text: "Handtuch mitbringen" });
    expect(IV.befehlErkennen("Schreib ins Brain: Parken hinter dem Haus")).toEqual({ art: "merken", text: "Parken hinter dem Haus" });
    expect(IV.befehlErkennen("Bitte trag ins Brain ein, dass die Rezeption ab 8 besetzt ist")).toEqual({ art: "merken", text: "die Rezeption ab 8 besetzt ist" });
    expect(IV.befehlErkennen("Gabi, speichere im Brain: Osteopathie kostet 85 Euro")).toEqual({ art: "merken", text: "Osteopathie kostet 85 Euro" });
    // alles mit Notiz-Bezug bleibt ausgenommen, eine bloße Frage nach dem Brain ist kein Befehl
    expect(IV.befehlErkennen("Kannst du dir merken, dass TP-01 Knieschmerzen hat?")).toBeNull();
    expect(IV.befehlErkennen("Was steht im Brain über Parken?")).toBeNull();
    expect(IV.befehlErkennen("Kannst du dir Dinge merken?")).toBeNull();
  });

  it("„Ändere …“, „Korrigiere …“, „Aktualisiere …“, „Berichtige …“", () => {
    expect(IV.befehlErkennen("Ändere die Öffnungszeiten auf 8 bis 18 Uhr")).toEqual({ art: "aendern", text: "die Öffnungszeiten auf 8 bis 18 Uhr" });
    for (const t of ["ändere die Telefonzeiten: freitags nur bis 15 Uhr", "Aendere die Telefonzeiten", "Bitte korrigiere den Preis für Osteopathie", "Gabi, aktualisiere die Trainingszeiten", "Berichtige die Adresse am Thumenberger Weg", "ändern die Zeiten bitte"]) {
      expect(art(t), t).toBe("aendern");
    }
    // kein Befehl: das Wort steht nur irgendwo im Satz
    for (const t of ["Kannst du die Zeiten ändern?", "Die Änderung der Öffnungszeiten ist wichtig", "Änderungen gab es keine"]) expect(art(t), t).toBeNull();
  });

  it("„Was weißt du über …?“ (Suche) – das Thema ohne Fragezeichen", () => {
    expect(IV.befehlErkennen("Was weißt du über die Trainingszeiten?")).toEqual({ art: "wissen", text: "die Trainingszeiten" });
    expect(IV.befehlErkennen("was weisst du zum Parken")).toEqual({ art: "wissen", text: "Parken" });
    expect(IV.befehlErkennen("Gabi, was weißt du von den Ice Tigers?!")).toEqual({ art: "wissen", text: "den Ice Tigers" });
    expect(art("Was weißt du zur Osteopathie?")).toBe("wissen");
    expect(art("Was weißt du?")).toBeNull();
  });

  it("„Wie vollständig ist mein Brain?“ (Gesundheit) und „Brain füllen“ (Interview)", () => {
    for (const t of ["Wie vollständig ist mein Brain?", "wie vollstaendig ist das brain", "Wie gut ist unser Brain?", "Brain-Status", "Brain Stand", "Was fehlt noch im Brain?", "Was fehlt im Brain", "Wie steht es um mein Brain?"]) {
      expect(IV.befehlErkennen(t), t).toEqual({ art: "gesundheit", text: "" });
    }
    for (const t of ["Brain füllen", "brain fuellen", "Gabi, Brain füllen!", "Interview starten", "Frag mich die offenen Fragen", "frag mich die offenen punkte ab", "Stell mir die offenen Fragen."]) {
      expect(IV.befehlErkennen(t), t).toEqual({ art: "interview", text: "" });
    }
    expect(art("Wie füllt man das Brain?")).toBeNull();
    expect(art("Brain")).toBeNull();
  });

  it("alles mit Notiz-Bezug ist KEIN Brain-Befehl: Kürzel, „Notiz“, „Diktat“, „Bericht“, „Patient“", () => {
    for (const t of [
      "Ändere die Notiz von TP-01", "Korrigiere TP-01", "Merke dir: TP-02 kommt immer zu spät", "Merke dir: tp-03 hat Knieschmerzen", "Aktualisiere die Notiz von gestern",
      "Ändere das Diktat", "Korrigiere den Bericht", "Merke dir: die Patientin hat Schmerzen", "Merke dir: der Patient kommt mittwochs", "Was weißt du über TP-01?",
      "Was weißt du über AB12?", "Merke dir: KN7 übt zu Hause",
    ]) expect(art(t), t).toBeNull();
    // „ab 10 Uhr“, Uhrzeiten, Preise und Zusammensetzungen sind kein Kürzel
    for (const t of ["Merke dir: ab 10 Uhr ist offen", "Merke dir: Mo–Fr 8-18 Uhr", "Merke dir: Osteopathie kostet 85 €", "Merke dir: Raum 3 ist der Trainingsraum", "Merke dir: Patientenparkplatz hinter dem Haus"]) {
      expect(art(t), t).toBe("merken");
    }
  });

  it("normale Fragen, Leeres und Überlanges sind kein Befehl", () => {
    for (const t of ["", "   ", null, undefined, "Wo sind die Standorte?", "Was wollte TP-01?", "Merke", "Merke dir", "Merke dir: ab", "Ändere", "Hallo Gabi"]) expect(art(t), String(t)).toBeNull();
    expect(art(`Merke dir: ${"x".repeat(4000)}`)).toBeNull();
    expect(art(`Wie vollständig ist mein Brain? ${"und ".repeat(40)}`)).toBeNull(); // lange Sätze sind keine Kurzfrage
  });
});

describe("Vorschläge ohne KI: nur glätten, nichts dazuerfinden", () => {
  it("Antwort als Satz: Füllwörter am Anfang weg, großer Anfang, Punkt am Ende – der Inhalt bleibt", () => {
    expect(IV.alsSatz("also, montags bis freitags von 8 bis 18 uhr")).toBe("Montags bis freitags von 8 bis 18 uhr.");
    expect(IV.alsSatz("ähm, also naja nur privat")).toBe("Nur privat.");
    expect(IV.alsSatz("Ja, das stimmt so")).toBe("Das stimmt so.");
    expect(IV.alsSatz("Okay. Montags ab 8")).toBe("Montags ab 8.");
    expect(IV.alsSatz("  nur   nach\tAbsprache  ")).toBe("Nur nach Absprache.");
    expect(IV.alsSatz("Nein, nur privat!")).toBe("Nein, nur privat!");
    expect(IV.alsSatz("Gibt es das?")).toBe("Gibt es das?");
    // „gut“, „ja“, „okay“ ohne Satzzeichen sind Inhalt, kein Füllwort
    expect(IV.alsSatz("Gut erreichbar mit der U-Bahn")).toBe("Gut erreichbar mit der U-Bahn.");
    expect(IV.alsSatz("ja klar, immer mittwochs")).toBe("Ja klar, immer mittwochs.");
    expect(IV.alsSatz("ok")).toBe("Ok.");
    expect(IV.alsSatz("Ja!")).toBe("Ja!");
    expect(IV.alsSatz("also")).toBe("Also.");
    for (const leer of ["", "   ", null, undefined]) expect(IV.alsSatz(leer)).toBe("");
    expect(IV.alsSatz("x".repeat(5000)).length).toBe(2000);
  });

  it("Interview: die Antwort ersetzt den Inhalt, „Betrifft:“ und „Siehe auch:“ bleiben (mit [[Verweisen]])", () => {
    const knoten = { id: "s-frage-oeffnungszeiten", titel: "Wann sind die Praxen selbst geöffnet?", inhalt: "Öffnungszeiten der Praxen selbst: nicht angegeben (nur die Telefonzeiten).\n\nBetrifft: [[Kontakt und Zeiten]]\nSiehe auch: [[Telefonzeiten]]" };
    const v = IV.vorschlagOhneKi({ knoten, antwort: "also, montags bis freitags von 8 bis 18 Uhr" });
    expect(v).toEqual({
      typ: "aendern", id: "s-frage-oeffnungszeiten", titel: "Wann sind die Praxen selbst geöffnet?", grund: "interview",
      inhalt: "Montags bis freitags von 8 bis 18 Uhr.\n\nBetrifft: [[Kontakt und Zeiten]]\n\nSiehe auch: [[Telefonzeiten]]",
    });
    // nichts dazuerfunden: jedes Wort der ersten Zeile stammt aus der Antwort
    const antwort = "ja, auch gesetzlich Versicherte, mit Rezept vom Arzt";
    const erste = IV.vorschlagOhneKi({ knoten: { id: "k", titel: "T", inhalt: "" }, antwort }).inhalt.split("\n")[0];
    for (const wort of S.normal(erste).split(" ")) expect(S.normal(antwort).split(" "), wort).toContain(wort);
    // der alte „nicht angegeben“-Satz ist weg, sonst stünde er neben der Antwort
    expect(v.inhalt).not.toMatch(/nicht angegeben/);
    // robuste Eingaben
    expect(IV.vorschlagOhneKi({ knoten: null, antwort: "x" })).toEqual({ typ: "aendern", id: "", titel: "", inhalt: "X.", grund: "interview" });
    expect(IV.vorschlagOhneKi({ knoten: { id: "k", titel: "t".repeat(300), inhalt: "" }, antwort: "a".repeat(5000) })).toMatchObject({ titel: "t".repeat(120) });
    expect(IV.vorschlagOhneKi({ knoten: { id: "k", titel: "T", inhalt: "" }, antwort: "a".repeat(5000) }).inhalt.length).toBeLessThanOrEqual(2000);
  });

  it("gegen den echten Seed: jede offene Frage behält nach dem Interview ihre „Betrifft“-Verbindung", () => {
    const fragen = SEED.knoten.filter((x) => x.status === "zu_klaeren");
    expect(fragen).toHaveLength(7);
    for (const knoten of fragen) {
      const v = IV.vorschlagOhneKi({ knoten, antwort: "Das klären wir noch" });
      const vorher = [...knoten.inhalt.matchAll(/\[\[[^\]]+\]\]/g)].map((m) => m[0]).filter((roh) => knoten.inhalt.split("\n").some((z) => /^(?:Betrifft|Siehe auch):/.test(z) && z.includes(roh)));
      expect(vorher.length, knoten.titel).toBeGreaterThan(0);
      for (const roh of vorher) expect(v.inhalt, knoten.titel).toContain(roh);
      expect(v.inhalt.startsWith("Das klären wir noch.")).toBe(true);
      expect(v).toMatchObject({ typ: "aendern", id: knoten.id, titel: knoten.titel });
    }
  });

  it("„Merke dir“: „Thema: Inhalt“ wird getrennt, sonst ist der erste Satz der Titel (höchstens 60 Zeichen, ohne [ ] |)", () => {
    expect(IV.merkenOhneKi("Parken: Hinter dem Haus sind 5 Plätze")).toEqual({ typ: "neu", titel: "Parken", inhalt: "Hinter dem Haus sind 5 Plätze.", grund: "merken" });
    expect(IV.merkenOhneKi("Bitte bringt ein Handtuch mit. Und Sportschuhe! Danke")).toEqual({ typ: "neu", titel: "Bitte bringt ein Handtuch mit", inhalt: "Bitte bringt ein Handtuch mit. Und Sportschuhe! Danke.", grund: "merken" });
    // eine Uhrzeit ist kein „Thema:“
    expect(IV.merkenOhneKi("Wir haben bis 18:00 Uhr offen")).toMatchObject({ titel: "Wir haben bis 18:00 Uhr offen", inhalt: "Wir haben bis 18:00 Uhr offen." });
    const lang = IV.merkenOhneKi(`Die Praxis ${"hat sehr viele verschiedene Angebote und ".repeat(5)}mehr`);
    expect(lang.titel.length).toBeLessThanOrEqual(60);
    expect(lang.titel.endsWith("…")).toBe(true);
    expect(IV.merkenOhneKi("Preise [neu] | 2027: steigen").titel).toBe("Preise neu 2027");
    expect(IV.merkenOhneKi("x".repeat(5000)).inhalt.length).toBeLessThanOrEqual(2000);
  });

  it("„Ändere …“ ohne KI: der Wunsch wird angehängt, der alte Inhalt samt [[Verweisen]] bleibt – als „ohne KI“ gekennzeichnet", () => {
    const knoten = { id: "s-telefonzeiten", titel: "Telefonzeiten", inhalt: "Telefonisch erreichbar: Mo 7:30–17:00 Uhr.\n\nSiehe auch: [[Kontakt]] und [[Praxis Kieslingstraße|die Hauptpraxis]]" };
    expect(IV.aendernOhneKi({ knoten, wunsch: "freitags nur bis 15 Uhr" })).toEqual({
      typ: "aendern", id: "s-telefonzeiten", titel: "Telefonzeiten", grund: "aenderung", ohneKi: true,
      inhalt: "Telefonisch erreichbar: Mo 7:30–17:00 Uhr.\n\nSiehe auch: [[Kontakt]] und [[Praxis Kieslingstraße|die Hauptpraxis]]\n\nFreitags nur bis 15 Uhr.",
    });
    expect(IV.aendernOhneKi({ knoten: { id: "k", titel: "T", inhalt: "" }, wunsch: "neu" }).inhalt).toBe("Neu.");
    expect(IV.aendernOhneKi({ knoten: null, wunsch: "neu" })).toMatchObject({ id: "", titel: "", inhalt: "Neu." });
  });

  it("auf einem Kontext-Knoten (wie Gabi ihn bekommt) bleiben vorhandene Verweise erhalten", () => {
    const [kontext] = S.kontextWaehlen({ frage: "Telefonnummer Kontakt", knoten: SEED.knoten });
    expect(kontext.id).toBe("s-kontakt");
    expect(kontext.inhalt).toContain("[[Telefonzeiten]]"); // der Kontext entfernt die Klammern nicht
    expect(IV.aendernOhneKi({ knoten: kontext, wunsch: "Fax gibt es nicht mehr" }).inhalt).toContain("Siehe auch: [[Telefonzeiten]]");
    expect(IV.vorschlagOhneKi({ knoten: kontext, antwort: "Die Nummer bleibt gleich" }).inhalt).toBe("Die Nummer bleibt gleich.\n\nSiehe auch: [[Telefonzeiten]]");
  });
});

describe("Interview: Reihenfolge und Wortlaut", () => {
  const knoten = (id, extra = {}) => ({ id, art: "frage", titel: `Frage ${id}?`, inhalt: "", status: "zu_klaeren", erstellt: 1000, ...extra });

  it("nur offene, eigene Fragen – älteste zuerst, bei gleichem Alter nach Titel", () => {
    const liste = [
      knoten("c", { erstellt: 3000 }), knoten("a", { erstellt: 1000, titel: "Zebra?" }), knoten("b", { erstellt: 1000, titel: "Ähre?" }),
      knoten("fertig", { status: "bestaetigt" }), knoten("entwurf", { status: "entwurf" }), knoten("weg", { geloescht: 5 }),
      knoten("abgeleitet", { abgeleitet: true }), knoten("geschuetzt", { geschuetzt: true }), null,
    ];
    expect(IV.reihenfolge(liste)).toEqual(["b", "a", "c"]);
    expect(IV.reihenfolge(null)).toEqual([]);
    expect(IV.reihenfolge(SEED.knoten.map((x) => ({ ...x, erstellt: 1 })))).toHaveLength(7);
  });

  it("eine Frage pro Nachricht: Nummer, Frage fett, was bisher im Brain steht (ohne Verweis-Zeilen und Klammern), Hinweis", () => {
    const k = { titel: "Wann sind die Praxen selbst geöffnet?", inhalt: "Öffnungszeiten der Praxen selbst: nicht angegeben (nur die [[Telefonzeiten]]).\n\nBetrifft: [[Kontakt und Zeiten]]" };
    expect(IV.frageText(k, 2, 7)).toBe(
      "Frage 2 von 7: **Wann sind die Praxen selbst geöffnet?**\n\nBisher steht im Brain: Öffnungszeiten der Praxen selbst: nicht angegeben (nur die Telefonzeiten).\n\nAntworte einfach per Sprache oder Text – ich mache daraus einen Vorschlag.",
    );
    // Titel ohne Fragezeichen wird zur Frage, ohne bisherigen Inhalt fehlt der mittlere Absatz
    expect(IV.frageText({ titel: "Parken und Barrierefreiheit", inhalt: "Betrifft: [[Standorte]]" }, 1, 1)).toBe(
      "Frage 1 von 1: **Parken und Barrierefreiheit – was gilt hier?**\n\nAntworte einfach per Sprache oder Text – ich mache daraus einen Vorschlag.",
    );
    const lang = IV.frageText({ titel: "Lang?", inhalt: "Satz. ".repeat(200) }, 1, 1);
    expect(lang.split("\n\n")[1].length).toBeLessThanOrEqual("Bisher steht im Brain: ".length + 260);
  });
});

describe("„Wie vollständig ist mein Brain?“ – nur Zahlen aus dem Brain", () => {
  it("Einträge, Prozent und je eine Zeile für das, was zu tun ist", () => {
    const t = IV.gesundheitText({ knoten: 43, bestaetigt: 33, entwurf: 3, zuKlaeren: 7, veraltet: 2, nieVerwendet: 19, luecken: 3 });
    expect(t).toBe([
      "Dein Brain hat 43 Einträge, 33 davon bestätigt (**77 %**).",
      "- 7 Punkte sind noch zu klären\n- 3 Entwürfe warten auf deine Bestätigung\n- 2 Einträge sind älter als 90 Tage\n- 19 bestätigte Einträge habe ich noch nie gebraucht\n- 3 Fragen konnte ich nicht aus dem Brain beantworten",
      "Am schnellsten geht es mit „Brain füllen“ – ich stelle dir die offenen Fragen nacheinander.",
    ].join("\n\n"));
  });

  it("Einzahl, nichts offen, leeres Brain", () => {
    const eins = IV.gesundheitText({ knoten: 4, bestaetigt: 1, entwurf: 1, zuKlaeren: 1, veraltet: 1, nieVerwendet: 1, luecken: 1 });
    expect(eins).toContain("(**25 %**)");
    for (const zeile of ["- 1 Punkt ist noch zu klären", "- 1 Entwurf wartet auf deine Bestätigung", "- 1 Eintrag ist älter als 90 Tage", "- 1 bestätigten Eintrag habe ich noch nie gebraucht", "- 1 Frage konnte ich nicht aus dem Brain beantworten"]) expect(eins).toContain(zeile);
    expect(IV.gesundheitText({ knoten: 5, bestaetigt: 5 })).toBe("Dein Brain hat 5 Einträge, 5 davon bestätigt (**100 %**).\n\nAlles bestätigt und aktuell.");
    expect(IV.gesundheitText({ knoten: 1, bestaetigt: 1 })).toMatch(/^Dein Brain hat einen Eintrag/);
    // ohne offene Fragen kein Hinweis aufs Interview, mit Entwürfen kein „alles bestätigt“
    const ohneFragen = IV.gesundheitText({ knoten: 5, bestaetigt: 4, entwurf: 1 });
    expect(ohneFragen).not.toMatch(/Brain füllen|Alles bestätigt/);
    for (const leer of [{ knoten: 0 }, {}, null, undefined]) expect(IV.gesundheitText(leer)).toMatch(/^Dein Brain ist noch leer\./);
    expect(IV.gesundheitText({ knoten: 3, bestaetigt: 1 })).toContain("**33 %**");
  });

  it("die Beispielantwort der Demo erfindet nichts über die Praxis", () => {
    expect(IV.DEMO_ANTWORT).toBe("Beispielantwort aus dem Demo-Modus – hier stünde, was du gesagt hast.");
    expect(IV.TITEL_MAX).toBe(120);
    expect(IV.INHALT_MAX).toBe(2000);
  });
});
