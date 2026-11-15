// Seed fürs Brain: Zerlegung der Wissensdatei (knowledge/brain_zerlegung.mjs), Generator und erzeugte brain-seed.js.
// Schlägt etwas fehl, weil sich knowledge/physioworks.md, die Kernregeln, das Register oder die Roadmap geändert haben:
//   cd worker && node dev/brain_seed_erzeugen.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { DEMO, FREMDE_TITEL, GRENZEN, ID_MUSTER, TODO, demoPruefen, lesen, pruefen, titelSchluessel, verweiseAus, zerlegen } from "../../knowledge/brain_zerlegung.mjs";
import { QUELLE, ROADMAP, ZIEL, phasenAus, seedDaten, seedJs } from "../dev/brain_seed_erzeugen.mjs";
import { KERNREGELN, KERNREGELN_HINWEIS } from "../src/kernregeln.js";
import { FAEHIGKEITEN, PHASEN, STUFEN, STUFEN_TEXT } from "../src/faehigkeiten.js";

const require = createRequire(import.meta.url);
const SEED = require("../../brain-seed.js");
const WISSEN = readFileSync(QUELLE, "utf8");
const glatt = (t) => String(t).replace(/\s+/g, " ").trim();
const WISSEN_GLATT = glatt(WISSEN);
const PUNKTE = lesen(WISSEN).abschnitte.flatMap((a) => a.punkte.map((p) => ({ ...p, abschnitt: a.titel })));
const { knoten: KNOTEN, kanten: KANTEN, fehler: FEHLER } = zerlegen(WISSEN);
const nach = (id) => KNOTEN.find((n) => n.id === id);
// D12: Der Preis der Osteopathie steht nur im Knoten „Osteopathie“; der Sammelknoten „Weitere Behandlungsmöglichkeiten“ verweist darauf.
const OSTEO_AUSZUG = "Osteopathie (soweit in der Physiotherapie erlaubt; Selbstzahlerleistung, 85 € pro Behandlungseinheit)";
const OSTEO_VERWEIS = "Osteopathie (siehe [[Osteopathie]])";
const imKnoten = (t) => String(t).split(OSTEO_AUSZUG).join(OSTEO_VERWEIS); // Wissensdatei-Text → so steht er im Sammelknoten
const ausDatei = (t) => String(t).split(OSTEO_VERWEIS).join(OSTEO_AUSZUG); // Knoten-Text → so steht er in der Wissensdatei
const mitInhalt = (stueck, arten) => KNOTEN.filter((n) => (!arten || arten.includes(n.art)) && glatt(n.inhalt).includes(stueck));
const ohneTodo = (text) => glatt(text.split(`${TODO}.`).join(" "));
/** Wissensdatei mit einer Änderung (muss wirklich etwas ändern – sonst prüft die Gegenprobe nichts). */
const geaendert = (alt, neu) => { expect(WISSEN.includes(alt), `Vorlage fehlt in der Wissensdatei: ${alt}`).toBe(true); return WISSEN.replace(alt, neu); };

describe("Seed: erzeugte Datei brain-seed.js", () => {
  it("passt zum Generator (sonst: cd worker && node dev/brain_seed_erzeugen.mjs)", () => {
    expect(readFileSync(ZIEL, "utf8")).toBe(seedJs());
  });

  it("sagt oben, dass sie erzeugt ist und wie man sie neu erzeugt", () => {
    const kopf = readFileSync(ZIEL, "utf8").slice(0, 600);
    expect(kopf).toMatch(/ERZEUGT – nicht von Hand ändern/);
    expect(kopf).toMatch(/cd worker && node dev\/brain_seed_erzeugen\.mjs/);
  });

  it("lädt in Node (module.exports) und im Browser (self.GabiBrainSeed) mit demselben Inhalt", () => {
    const fenster = {};
    vm.runInNewContext(readFileSync(ZIEL, "utf8"), { self: fenster });
    expect(JSON.parse(JSON.stringify(fenster.GabiBrainSeed))).toEqual(SEED);
    expect(Object.keys(SEED)).toEqual(["version", "knoten", "kanten", "kernregeln", "kernregelnHinweis", "faehigkeiten", "stufen", "phasen", "demo"]);
    expect(JSON.parse(JSON.stringify(SEED))).toEqual(SEED); // nur Daten – keine Funktionen, keine Muster
  });

  it("Knoten und Kanten sind genau die der Zerlegung, in den Formen des Bauplans", () => {
    expect(SEED.knoten).toEqual(KNOTEN);
    expect(SEED.kanten).toEqual(KANTEN);
    for (const n of SEED.knoten) expect(Object.keys(n)).toEqual(["id", "seed", "art", "titel", "inhalt", "tags", "status", "quelle"]);
    for (const k of SEED.kanten) expect(Object.keys(k)).toEqual(["id", "von", "nach", "art"]);
    for (const n of SEED.knoten) expect(n.id).toBe(`s-${n.seed}`);
  });

  it("Version: kurzer Hash über den Inhalt – ändert sich mit der Wissensdatei", () => {
    expect(SEED.version).toMatch(/^[0-9a-f]{12}$/);
    expect(seedDaten().version).toBe(SEED.version);
    expect(seedDaten({ wissen: geaendert("Kieslingstraße 82", "Kieslingstraße 84") }).version).not.toBe(SEED.version);
  });

  it("Kernregeln und Fähigkeiten kommen aus dem Worker-Code, Phasen aus der Roadmap", () => {
    expect(SEED.kernregeln).toEqual(KERNREGELN.map((r) => ({ id: r.id, titel: r.titel, text: r.text })));
    expect(SEED.kernregeln.length).toBeGreaterThan(3);
    for (const r of SEED.kernregeln) expect(Object.keys(r)).toEqual(["id", "titel", "text"]); // der Prompt-Beleg bleibt im Worker
    expect(SEED.kernregelnHinweis).toBe(KERNREGELN_HINWEIS);
    expect(SEED.kernregelnHinweis).toMatch(/nicht ändern/);
    expect(SEED.faehigkeiten).toEqual(JSON.parse(JSON.stringify(FAEHIGKEITEN))); // das ganze Register, nur Daten
    expect(SEED.faehigkeiten.length).toBeGreaterThan(8);
    for (const f of SEED.faehigkeiten) {
      expect(typeof f.name).toBe("string");
      expect(SEED.phasen.map((p) => p.nr), `Phase von ${f.id}`).toContain(f.phase); // jede Fähigkeit zeigt auf eine Phase der Roadmap
      expect(SEED.stufen.map((x) => x.id), `Stufe von ${f.id}`).toContain(f.stufe);
    }
    expect(SEED.stufen).toEqual(STUFEN.map((id) => ({ id, text: STUFEN_TEXT[id] })));
    expect(SEED.stufen.map((x) => x.id)).toEqual(["lesen", "vorschlagen", "mit_bestaetigung_ausfuehren"]);
    for (const x of SEED.stufen) expect(x.text.length, x.id).toBeGreaterThan(10);
    expect(SEED.phasen).toEqual(phasenAus(readFileSync(ROADMAP, "utf8")));
    expect(SEED.phasen).toEqual(PHASEN); // Roadmap-Überschriften und Register nennen dieselben Phasen
    expect(SEED.phasen).toEqual([
      { nr: 1, titel: "Aufnahme-Tool" }, { nr: 2, titel: "Gespräch" }, { nr: 3, titel: "Gedächtnis (Brain)" }, { nr: 4, titel: "Handeln mit Bestätigung" },
      { nr: 5, titel: "Praxis-Interlink" }, { nr: 6, titel: "Patientenportal" }, { nr: 7, titel: "Telefon-Rezeptionistin" }, { nr: 8, titel: "Automationen" },
    ]);
  });

  it("der Generator schreibt nie eine Datei mit Lücken: bei Fehlern wirft er mit einer deutschen Liste", () => {
    expect(() => seedDaten({ wissen: `${WISSEN}\n## Neues\n- Sauna: im Keller.\n` })).toThrow(/Seed nicht erzeugt[\s\S]*Abschnitt „Neues“/);
    expect(() => seedDaten({ roadmap: "## Phase 1 – Aufnahme-Tool\n" })).toThrow(/ASSISTENT-ROADMAP\.md/);
    expect(() => seedDaten({ kernregeln: [] })).toThrow(/KERNREGELN/);
    expect(() => seedDaten({ faehigkeiten: [{ name: "ohne id" }] })).toThrow(/FAEHIGKEITEN/);
  });
});

describe("Seed: Zerlegung der Wissensdatei", () => {
  it("läuft ohne Fehler und liest die Datei wirklich (6 Abschnitte, Punkte mit Folgezeilen)", () => {
    expect(FEHLER).toEqual([]);
    const gelesen = lesen(WISSEN);
    expect(gelesen.fehler).toEqual([]);
    expect(gelesen.abschnitte.map((a) => a.titel)).toEqual(["Praxis", "Standorte", "Kontakt und Zeiten", "Leistungen", "Partner und Referenzen (laut Website)", "Team (laut Website)"]);
    expect(PUNKTE.length).toBe((WISSEN.match(/^- /gm) || []).length);
    expect(PUNKTE.find((p) => p.text.startsWith("Praxis Kieslingstraße:")).text).toBe("Praxis Kieslingstraße: Kieslingstraße 82, 90491 Nürnberg. Mehr als neun Behandlungsräume, Trainingsbereich mit rund 150 m².");
  });

  it("JEDER Aufzählungspunkt steckt wörtlich in genau einem Knoten – der offene Satz eines „TODO prüfen“-Punkts im Frage-Knoten, der Rest im Wissensknoten", () => {
    expect(PUNKTE.length).toBeGreaterThan(30);
    for (const p of PUNKTE) {
      if (!p.text.includes(TODO)) {
        expect(mitInhalt(imKnoten(p.text)).map((n) => n.id), `Punkt Zeile ${p.zeile}: ${p.text}`).toHaveLength(1);
        expect(mitInhalt(imKnoten(p.text))[0].art).toBe("praxiswissen");
        continue;
      }
      // offener Punkt: genau ein Frage-Knoten trägt den Satz vor „TODO prüfen.“ …
      const text = ohneTodo(p.text);
      const fragen = KNOTEN.filter((n) => n.art === "frage" && p.text.includes(`${glatt(n.inhalt.split("\n\n")[0])} ${TODO}.`));
      expect(fragen.map((n) => n.id), `Frage zu Zeile ${p.zeile}: ${p.text}`).toHaveLength(1);
      const offen = glatt(fragen[0].inhalt.split("\n\n")[0]);
      expect(mitInhalt(offen).map((n) => n.id), `offener Satz nur im Frage-Knoten: ${offen}`).toEqual([fragen[0].id]);
      // … und der Rest (falls es einen gibt) steht in genau einem Wissensknoten; zusammen ergeben beide den ganzen Punkt
      const rest = glatt(text.replace(offen, " "));
      expect(glatt(`${rest} ${offen}`), `Zeile ${p.zeile} lückenlos`).toBe(text);
      if (rest) expect(mitInhalt(rest, ["praxiswissen"]).map((n) => n.id), `Rest von Zeile ${p.zeile}: ${rest}`).toHaveLength(1);
    }
  });

  it("genau ein Zu-klären-Knoten je „TODO prüfen“-Punkt (7), als Frage an die Praxis formuliert", () => {
    const offenePunkte = PUNKTE.filter((p) => p.text.includes(TODO));
    const fragen = KNOTEN.filter((n) => n.status === "zu_klaeren");
    expect(offenePunkte).toHaveLength(7);
    expect(fragen).toHaveLength(7);
    expect(PUNKTE.reduce((s, p) => s + p.text.split(TODO).length - 1, 0)).toBe(7); // kein Punkt mit zwei offenen Sätzen
    for (const n of fragen) {
      expect(n.art).toBe("frage");
      expect(n.id).toMatch(/^s-frage-/);
      expect(n.titel, n.id).toMatch(/^[A-ZÄÖÜ].{15,}\?$/); // ein ganzer Fragesatz
      expect(n.tags[0]).toBe("zu-klaeren");
      expect(n.quelle).toBe("physio-works.de");
      expect(n.inhalt, n.id).toMatch(/\n\nBetrifft: \[\[[^\]]+\]\](, \[\[[^\]]+\]\])*$/);
    }
    expect(KNOTEN.filter((n) => n.art === "frage").every((n) => n.status === "zu_klaeren")).toBe(true);
    expect(JSON.stringify(KNOTEN)).not.toContain("TODO"); // im Brain heißt das „Zu klären“ – der Marker selbst wandert nicht mit
  });

  it("die Einleitung (Quelle, Lesedatum) steht wörtlich im Knoten „Quelle des Praxiswissens“", () => {
    const quelle = nach("s-quelle");
    expect(quelle.titel).toBe("Quelle des Praxiswissens");
    const einleitung = lesen(WISSEN).einleitung;
    const bleibt = glatt(einleitung.slice(0, einleitung.indexOf("Punkte mit „TODO prüfen“")));
    expect(bleibt).toMatch(/^Quelle: öffentliche Website https:\/\/physio-works\.de .*gelesen am 08\.11\.2026\. Nur was dort steht\.$/);
    expect(quelle.inhalt.split("\n\n")[0]).toBe(bleibt);
    expect(quelle.inhalt.split("\n\n")[1]).toMatch(/im Brain als „Zu klären“ markiert/);
  });

  it("jede Zahl der Wissensdatei steht im Seed", () => {
    const zahlen = [...new Set(WISSEN.match(/\d+(?:[.:,]\d+)*/g))];
    expect(zahlen.length).toBeGreaterThanOrEqual(20);
    const seed = KNOTEN.map((n) => n.inhalt).join("\n");
    for (const z of zahlen) expect(new RegExp(`(?<![\\d.:,])${z.replace(/[.]/g, "\\.")}(?![\\d])`).test(seed), `Zahl ${z}`).toBe(true);
  });

  it("nichts hinzuerfunden: Wissens- und Frage-Knoten bestehen nur aus Sätzen der Datei, Mitgliederlisten und Verweisen", () => {
    for (const n of KNOTEN.filter((x) => x.art === "praxiswissen" || x.art === "frage")) {
      for (const absatz of n.inhalt.split("\n\n")) {
        if (/^(Siehe auch|Betrifft): (\[\[[^\]]+\]\](, )?)+$/.test(absatz)) continue; // Verweise fürs Brain
        if (/^Dazu gehören: /.test(absatz)) continue; // Mitglieder eines Sammelknotens – eigener Test
        if (n.id === "s-quelle" && /im Brain als „Zu klären“ markiert/.test(absatz)) continue; // ersetzt den „TODO prüfen“-Satz der Einleitung
        for (const zeile of absatz.split("\n")) {
          expect(WISSEN_GLATT.includes(glatt(ausDatei(zeile.replace(/^- /, "")))), `${n.id}: „${zeile}“ steht nicht in der Wissensdatei`).toBe(true);
        }
      }
    }
  });

  it("D12: der Osteopathie-Preis steht in genau einem Knoten (Quelle „Osteopathie“), der Sammelknoten verweist per Verknüpfung darauf", () => {
    // kein Preis zweimal: jede Euro-Angabe des Seeds steht in genau einem Knoten
    const preise = (n) => (n.inhalt.match(/\d[\d.,]*\s*(€|Euro)/g) || []);
    expect(KNOTEN.filter((n) => /85\s*€/.test(n.inhalt)).map((n) => n.id)).toEqual(["s-leistung-osteopathie"]);
    const alle = KNOTEN.flatMap((n) => preise(n).map((p) => `${glatt(p)}`));
    expect(new Set(alle).size, `doppelte Preise im Seed: ${alle.join(", ")}`).toBe(alle.length);
    expect(JSON.stringify(SEED)).toMatch(/85 €/);
    expect(JSON.stringify(SEED).match(/85 €/g)).toHaveLength(1);
    // der Verweis-Eintrag: kein Preis, aber ein [[Osteopathie]]-Link auf die Quelle (Titel = Linkziel)
    const sammel = nach("s-leistung-weitere");
    expect(sammel.inhalt).not.toMatch(/€|Euro|\d+\s*(EUR)/);
    expect(sammel.inhalt).toContain(OSTEO_VERWEIS);
    expect(verweiseAus(sammel.inhalt)).toContain("Osteopathie");
    expect(nach("s-leistung-osteopathie").titel).toBe("Osteopathie");
    // Verbindungen bleiben: beide hängen an „Leistungen“, die Quelle verweist weiter zurück auf den Sammelknoten
    for (const id of ["s-leistung-weitere", "s-leistung-osteopathie"]) {
      expect(KANTEN.some((k) => k.von === id && k.nach === "s-leistungen" && k.art === "gehoert_zu"), id).toBe(true);
    }
    expect(verweiseAus(nach("s-leistung-osteopathie").inhalt)).toContain("Weitere Behandlungsmöglichkeiten");
  });

  it("Sammelknoten zählen genau ihre Mitglieder auf (Kanten gehoert_zu) und hängen am Praxis-Knoten", () => {
    const sammler = KNOTEN.filter((n) => n.inhalt.startsWith("Dazu gehören: "));
    expect(sammler.map((n) => n.titel)).toEqual(["Standorte", "Kontakt und Zeiten", "Leistungen", "Partner und Referenzen", "Team"]);
    for (const s of sammler) {
      const mitglieder = KANTEN.filter((k) => k.nach === s.id && k.art === "gehoert_zu").map((k) => nach(k.von).titel);
      expect(s.inhalt.split("\n\n")[0]).toBe(`Dazu gehören: ${mitglieder.join(", ")}.`);
      expect(mitglieder.length).toBeGreaterThan(1);
      expect(KANTEN.some((k) => k.von === s.id && k.nach === "s-praxis" && k.art === "gehoert_zu"), s.id).toBe(true);
    }
  });

  it("Knoten laut Auftrag: je Standort, je Leistung (Osteopathie mit Preis), Team, Partner, Geschichte, Praxis, Kontakt, Zeiten, Termine", () => {
    const titel = KNOTEN.map((n) => n.titel);
    for (const t of ["PhysioWorks – die Praxis", "Geschichte der Praxis", "Quelle des Praxiswissens", "Praxis Kieslingstraße", "Praxis Thumenberger Weg",
      "Kontakt", "Telefonzeiten", "Trainingszeiten", "Termine", "Sportphysiotherapie", "Manuelle Therapie", "Medizinische Trainingstherapie (MTT)",
      "Youngster Training", "Akupunktur", "Weitere Behandlungsmöglichkeiten", "Osteopathie", "Nürnberg Ice Tigers", "Deutscher Hockey-Bund", "Der Goldene Ring",
      "dasmediABC", "Sensopro", "Referenzen", "Team – Leitung und Büro", "Team – Physiotherapie und Manuelle Therapie", "Team – Training", "Wer ist Gabi"]) {
      expect(titel, t).toContain(t);
    }
    expect(nach("s-leistung-osteopathie").inhalt).toMatch(/Selbstzahlerleistung, 85 € pro Behandlungseinheit/);
    expect(nach("s-leistung-osteopathie").inhalt).toContain(OSTEO_AUSZUG);
    expect(nach("s-geschichte").inhalt).toMatch(/Gegründet 2011/);
    expect(nach("s-praxis").inhalt).not.toMatch(/Gegründet/); // die Geschichte ist ein eigener Knoten
    for (const n of KNOTEN.filter((x) => x.art === "praxiswissen")) {
      expect(n.status, n.id).toBe("bestaetigt");
      expect(n.quelle, n.id).toBe("physio-works.de");
    }
    // sinnvolle Verweise: MTT ↔ Trainingszeiten, Akupunktur → Team, Ice Tigers → Sportphysiotherapie
    expect(verweiseAus(nach("s-leistung-mtt").inhalt)).toContain("Trainingszeiten");
    expect(verweiseAus(nach("s-trainingszeiten").inhalt)).toContain("Medizinische Trainingstherapie (MTT)");
    expect(verweiseAus(nach("s-leistung-akupunktur").inhalt)).toContain("Team");
    expect(verweiseAus(nach("s-partner-ice-tigers").inhalt)).toContain("Sportphysiotherapie");
  });

  it("IDs und Titel: eindeutig, im Muster, stabil; Tags klein; alle Formprüfungen bestehen", () => {
    expect(pruefen(KNOTEN, KANTEN)).toEqual([]);
    expect(new Set(KNOTEN.map((n) => n.id)).size).toBe(KNOTEN.length);
    expect(new Set(KNOTEN.map((n) => titelSchluessel(n.titel))).size).toBe(KNOTEN.length);
    for (const n of KNOTEN) {
      expect(n.id, n.id).toMatch(ID_MUSTER);
      expect(n.id, n.id).toMatch(/^s-[a-z0-9-]+$/);
      expect(n.titel.length, n.titel).toBeGreaterThanOrEqual(GRENZEN.titelMin);
      expect(n.titel.length, n.titel).toBeLessThanOrEqual(GRENZEN.titelMax);
      expect(n.titel, n.titel).not.toMatch(/[[\]|]/);
      expect(n.tags.length, n.id).toBeGreaterThan(0);
      for (const tag of n.tags) expect(tag, `${n.id}: ${tag}`).toMatch(/^[a-z0-9äöüß-]{1,30}$/);
      expect(n.inhalt, n.id).not.toMatch(/<\/?[a-z][^>]*>/i);
    }
    expect(new Set(KANTEN.map((k) => k.id)).size).toBe(KANTEN.length);
    for (const k of KANTEN) {
      expect(k.id, k.id).toMatch(ID_MUSTER);
      expect(k.id, k.id).toMatch(/^sk-/);
      expect(k.art).toBe("gehoert_zu");
    }
    // stabile IDs: gleiche Datei → gleiche IDs; ein geänderter Inhalt ändert keine ID
    expect(zerlegen(WISSEN).knoten.map((n) => n.id)).toEqual(KNOTEN.map((n) => n.id));
    expect(zerlegen(geaendert("Kieslingstraße 82", "Kieslingstraße 84")).knoten.map((n) => n.id)).toEqual(KNOTEN.map((n) => n.id));
  });

  it("jeder [[Verweis]] zeigt auf einen vorhandenen Titel, jede Kante auf vorhandene Knoten", () => {
    const titel = new Set([...KNOTEN.map((n) => titelSchluessel(n.titel)), ...FREMDE_TITEL.map(titelSchluessel)]);
    let verweise = 0;
    for (const n of KNOTEN) for (const ziel of verweiseAus(n.inhalt)) { verweise++; expect(titel.has(titelSchluessel(ziel)), `${n.id} → [[${ziel}]]`).toBe(true); }
    expect(verweise).toBeGreaterThan(15);
    const ids = new Set(KNOTEN.map((n) => n.id));
    for (const k of KANTEN) expect(ids.has(k.von) && ids.has(k.nach) && k.von !== k.nach, k.id).toBe(true);
    expect(FREMDE_TITEL).toEqual(["Kernregeln (im Code)"]); // der einzige Verweis nach außen: der abgeleitete Kernregeln-Knoten
  });

  it("der Graph hängt zusammen: jeder Wissens- und Frage-Knoten ist vom Praxis-Knoten aus erreichbar", () => {
    const idVon = new Map(KNOTEN.map((n) => [titelSchluessel(n.titel), n.id]));
    const nachbarn = new Map(KNOTEN.map((n) => [n.id, new Set()]));
    const verbinde = (a, b) => { if (a && b && nachbarn.has(a) && nachbarn.has(b)) { nachbarn.get(a).add(b); nachbarn.get(b).add(a); } };
    for (const k of KANTEN) verbinde(k.von, k.nach);
    for (const n of KNOTEN) for (const ziel of verweiseAus(n.inhalt)) verbinde(n.id, idVon.get(titelSchluessel(ziel)));
    const erreicht = new Set(["s-praxis"]);
    const offen = ["s-praxis"];
    while (offen.length) for (const x of nachbarn.get(offen.pop())) if (!erreicht.has(x)) { erreicht.add(x); offen.push(x); }
    for (const n of KNOTEN.filter((x) => x.art !== "persona" && x.art !== "regel")) expect(erreicht.has(n.id), `${n.id} hängt in der Luft`).toBe(true);
    // Persona und Regeln bilden ihr eigenes Büschel (Regeln → Persona)
    for (const r of KNOTEN.filter((x) => x.art === "regel")) expect(KANTEN.some((k) => k.von === r.id && k.nach === "s-persona-gabi"), r.id).toBe(true);
  });

  it("Persona und Regeln: von uns (quelle „Julius“), kurz, nur Ton und zusätzliche Einschränkungen", () => {
    const persona = KNOTEN.filter((n) => n.art === "persona");
    const regeln = KNOTEN.filter((n) => n.art === "regel");
    expect(persona).toHaveLength(1);
    expect(persona[0]).toMatchObject({ titel: "Wer ist Gabi", status: "bestaetigt", quelle: "Julius" });
    expect(persona[0].inhalt.length).toBeLessThanOrEqual(600);
    expect(persona[0].inhalt).toMatch(/nicht die Praxismanagerin Gabi Diem/);
    expect(persona[0].inhalt).toMatch(/Deutsch, per Du, kurz und freundlich/);
    expect(persona[0].inhalt).toMatch(/\[\[Kernregeln \(im Code\)\]\]/);
    expect(regeln.map((r) => r.status)).toEqual(["bestaetigt", "bestaetigt", "entwurf"]);
    for (const r of regeln) {
      expect(r.quelle).toBe("Julius");
      expect(r.inhalt.length, r.id).toBeLessThanOrEqual(300);
      expect(r.inhalt, r.id).not.toMatch(/\[\[/); // der Text geht als Regel an Gabi – ohne Verweis-Zeichen
      // nichts, was eine Kernregel lockern könnte
      expect(r.inhalt, r.id).not.toMatch(/ignorier|vergiss|egal was|darfst du (jetzt|ab|auch)|ist erlaubt|Diagnose|empfiehl|Empfehlung/i);
    }
  });

  it("keine Patientendaten: keine Kürzel, kein Patient im Seed", () => {
    const alles = JSON.stringify({ knoten: SEED.knoten, kanten: SEED.kanten, demo: SEED.demo });
    expect(alles).not.toMatch(/\bTP-?\d/);
    expect(SEED.knoten.some((n) => ["patient", "notiz", "bericht"].includes(n.art))).toBe(false);
  });
});

describe("Seed: Gegenprobe – eine geänderte Wissensdatei fällt auf (nichts fällt still weg)", () => {
  const fehlerBei = (wissen) => zerlegen(wissen).fehler;

  it("neuer Punkt ohne Plan-Eintrag", () => {
    const f = fehlerBei(geaendert("- Termine: per Telefon", "- Notfall: Sauna im Keller.\n- Termine: per Telefon"));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/Punkt ohne Plan-Eintrag im Abschnitt „Kontakt und Zeiten“: „Notfall: Sauna im Keller\.“/);
  });

  it("neuer „TODO prüfen“-Satz ohne Frage", () => {
    const f = fehlerBei(geaendert("intensive Einzelbegleitung.", "intensive Einzelbegleitung. Dauer: nicht angegeben. TODO prüfen."));
    expect(f.join("\n")).toMatch(/neuer „TODO prüfen“-Satz ohne Frage im Plan: „Sportphysiotherapie:/);
  });

  it("zweiter „TODO prüfen“-Satz in einem Punkt, der schon eine Frage hat", () => {
    const f = fehlerBei(geaendert("Preis und Standort: nicht angegeben. TODO prüfen.", "Dauer der Karte: nicht angegeben. TODO prüfen. Preis und Standort: nicht angegeben. TODO prüfen."));
    expect(f.join("\n")).toMatch(/erwartet hier genau einen „TODO prüfen“-Satz, die Wissensdatei hat 2/);
  });

  it("gelöschter Punkt", () => {
    const f = fehlerBei(geaendert("- Gabi Diem – Praxismanagerin.\n", ""));
    expect(f).toEqual(["Plan-Eintrag ohne Punkt in der Wissensdatei: Abschnitt „Team (laut Website)“, Anfang „Gabi Diem“."]);
  });

  it("offener Satz umformuliert", () => {
    const f = fehlerBei(geaendert("Parken und Barrierefreiheit: nicht angegeben.", "Parkplätze: nicht angegeben."));
    expect(f.join("\n")).toMatch(/Der offene Satz hat sich geändert – erwartet vor „TODO prüfen“: „Parken und Barrierefreiheit: nicht angegeben\.“/);
  });

  it("offener Punkt in der Datei erledigt (Marker entfernt), Plan nennt ihn noch", () => {
    const f = fehlerBei(geaendert("Öffnungszeiten der Praxen selbst: nicht angegeben (nur die Telefonzeiten). TODO prüfen.", "Öffnungszeiten der Praxen selbst: Mo–Fr 7:00–20:00 Uhr."));
    expect(f.join("\n")).toMatch(/Der Plan erwartet hier genau einen „TODO prüfen“-Satz, die Wissensdatei hat 0/);
  });

  it("neuer Abschnitt, Unterüberschrift, Unterpunkt, freier Text", () => {
    expect(fehlerBei(`${WISSEN}\n## Parken\n- Tiefgarage: 20 Plätze.\n`).join("\n")).toMatch(/Abschnitt „Parken“ kennt der Plan nicht \(1 Punkt ohne Knoten\)/);
    expect(fehlerBei(geaendert("## Leistungen\n", "## Leistungen\n### Kasse\n")).join("\n")).toMatch(/Unterüberschrift „### Kasse“/);
    expect(fehlerBei(geaendert("- Inhaber: Philipp Engelhardt (Physiotherapeut).\n", "- Inhaber: Philipp Engelhardt (Physiotherapeut).\n  - seit 2011\n")).join("\n")).toMatch(/eingerückter Unterpunkt/);
    expect(fehlerBei(geaendert("## Standorte\n", "## Standorte\nZwei Häuser in Nürnberg.\n")).join("\n")).toMatch(/Text außerhalb eines Aufzählungspunkts im Abschnitt „Standorte“: „Zwei Häuser in Nürnberg\.“/);
  });

  it("Auszug (Osteopathie mit Preis) passt nicht mehr zum Punkt", () => {
    const f = fehlerBei(geaendert("85 € pro Behandlungseinheit", "90 € pro Behandlungseinheit"));
    expect(f.join("\n")).toMatch(/Der Auszug „Osteopathie \(soweit in der Physiotherapie erlaubt; Selbstzahlerleistung, 85 € pro Behandlungseinheit\)“ steht nicht mehr/);
  });

  it("Einleitung: der Satz über „TODO prüfen“ ist anders – ein neues Lesedatum fließt dagegen einfach durch", () => {
    expect(fehlerBei(geaendert("– Gabi sagt das dann so.", "– Gabi fragt dann nach.")).join("\n")).toMatch(/Die Einleitung hat sich geändert/);
    const neu = zerlegen(geaendert("gelesen am 08.11.2026", "gelesen am 15.12.2026"));
    expect(neu.fehler).toEqual([]);
    expect(neu.knoten.find((n) => n.id === "s-quelle").inhalt).toMatch(/gelesen am 15\.12\.2026/);
  });

  it("eine geänderte Angabe in einem bekannten Punkt landet ohne Fehler im Knoten (der Seed folgt der Datei)", () => {
    const neu = zerlegen(geaendert("+49 911 23 99 823", "+49 911 00 00 000"));
    expect(neu.fehler).toEqual([]);
    expect(neu.knoten.find((n) => n.id === "s-kontakt").inhalt).toMatch(/^Telefon: \+49 911 00 00 000 · E-Mail: info@physio-works\.de/);
    expect(JSON.stringify(neu.knoten)).not.toContain("23 99 823");
  });

  it("Formfehler werden benannt (doppelter Titel, Verweis ins Leere, Kante ins Leere, zu lange Regel)", () => {
    const kopie = () => JSON.parse(JSON.stringify(KNOTEN));
    const doppelt = kopie(); doppelt[1].titel = "physioworks  –  die PRAXIS";
    expect(pruefen(doppelt, KANTEN).join("\n")).toMatch(/hat nicht 2–120 Zeichen|kommt doppelt vor/);
    const doppelt2 = kopie(); doppelt2[1].titel = "Physioworks – die Praxis";
    expect(pruefen(doppelt2, KANTEN).join("\n")).toMatch(/Titel „Physioworks – die Praxis“ kommt doppelt vor/);
    const leer = kopie(); leer[0].inhalt += "\n\nSiehe auch: [[Gibt es nicht]]";
    expect(pruefen(leer, KANTEN).join("\n")).toMatch(/Verweis \[\[Gibt es nicht\]\] in „s-praxis“ zeigt auf keinen Knoten/);
    expect(pruefen(KNOTEN, [...KANTEN, { id: "sk-neu", von: "s-praxis", nach: "s-fehlt", art: "gehoert_zu" }]).join("\n")).toMatch(/Kante „sk-neu“ zeigt auf einen unbekannten Knoten/);
    const lang = kopie(); lang.find((n) => n.art === "regel").inhalt = "x".repeat(301);
    expect(pruefen(lang, KANTEN).join("\n")).toMatch(/ist länger als 300 Zeichen/);
    const html = kopie(); html[0].inhalt += " <b>fett</b>";
    expect(pruefen(html, KANTEN).join("\n")).toMatch(/enthält HTML/);
  });
});

describe("Seed: Demo-Zusatz (erfunden, nur im Demo-Modus)", () => {
  it("besteht die Prüfung und ist als Beispiel erkennbar", () => {
    expect(demoPruefen(KNOTEN)).toEqual([]);
    expect(SEED.demo).toEqual(JSON.parse(JSON.stringify(DEMO)));
    expect(Object.keys(SEED.demo).sort()).toEqual(["knoten", "luecken", "nutzung", "veraltet"]);
    expect(SEED.demo.knoten.length).toBeGreaterThanOrEqual(1);
    expect(SEED.demo.knoten.length).toBeLessThanOrEqual(2);
    for (const n of SEED.demo.knoten) {
      expect(n).toMatchObject({ status: "entwurf", quelle: "Demo" });
      expect(n.titel).toMatch(/Beispiel/);
      expect(n.inhalt).toMatch(/^Erfundenes Beispiel für die Demo/);
      expect(n.tags).toContain("demo");
      expect(Object.keys(n)).toEqual(["id", "seed", "art", "titel", "inhalt", "tags", "status", "quelle"]);
    }
  });

  it("Gegenprobe: unbekannte ID, zu frischer „veralteter“ Knoten, Knoten ohne Beispiel-Hinweis fallen auf", () => {
    const kopie = () => JSON.parse(JSON.stringify(DEMO));
    const a = kopie(); a.nutzung["s-gibt-es-nicht"] = { anzahl: 1, tageZurueck: 0 };
    expect(demoPruefen(KNOTEN, a).join("\n")).toMatch(/unbekannten Knoten „s-gibt-es-nicht“/);
    const b = kopie(); b.veraltet["s-team"] = 30;
    expect(demoPruefen(KNOTEN, b).join("\n")).toMatch(/„s-team“ soll veraltet sein/);
    const c = kopie(); c.knoten[0].titel = "Hausbesuche"; c.knoten[0].quelle = "Philipp";
    expect(demoPruefen(KNOTEN, c).join("\n")).toMatch(/braucht die Quelle „Demo“[\s\S]*nicht als Beispiel erkennbar/);
    const d = kopie(); d.luecken[0].frage = "Kartenzahlung";
    expect(demoPruefen(KNOTEN, d).join("\n")).toMatch(/ist keine kurze Frage/);
  });

  it("3 Beispiel-Lücken, Nutzung für rund 10 Knoten, 2 veraltete Knoten – alle IDs gibt es", () => {
    const ids = new Set(KNOTEN.map((n) => n.id));
    expect(SEED.demo.luecken).toHaveLength(3);
    for (const l of SEED.demo.luecken) {
      expect(l.frage).toMatch(/\?$/);
      expect(l.anzahl).toBeGreaterThan(0);
      expect(l.erstmalsTageZurueck).toBeGreaterThanOrEqual(l.tageZurueck);
      // eine Lücke ist nur eine, wenn im Seed wirklich nichts dazu steht: mindestens ein tragendes Wort der Frage fehlt dort
      const seedText = KNOTEN.map((n) => `${n.titel} ${n.inhalt}`).join(" ").toLowerCase();
      const woerter = l.frage.toLowerCase().match(/[a-zäöüß]{5,}/g) || [];
      expect(woerter.some((w) => !seedText.includes(w)), `Lücke „${l.frage}“ ließe sich aus dem Seed beantworten`).toBe(true);
    }
    const nutzung = Object.entries(SEED.demo.nutzung);
    expect(nutzung.length).toBeGreaterThanOrEqual(8);
    expect(nutzung.length).toBeLessThanOrEqual(12);
    for (const [id, n] of nutzung) { expect(ids.has(id), id).toBe(true); expect(n.anzahl).toBeGreaterThan(0); expect(nach(id).status).toBe("bestaetigt"); }
    // veraltet: Knoten-ID → Tage zurück (so liest brain.js es: seed.demo.veraltet[id])
    expect(Object.keys(SEED.demo.veraltet)).toHaveLength(2);
    for (const [id, tage] of Object.entries(SEED.demo.veraltet)) {
      expect(ids.has(id), id).toBe(true);
      expect(tage).toBeGreaterThan(90);
      expect(nach(id).status).toBe("bestaetigt"); // „veraltet“ zählt nur bei Bestätigtem
      expect(SEED.demo.nutzung[id], `${id}: veraltet und zugleich oft verwendet wäre unglaubwürdig`).toBeUndefined();
    }
    // „nie verwendet“ und „veraltet“ zeigen in der Demo etwas: nicht jeder bestätigte Knoten hat Nutzung
    expect(KNOTEN.filter((n) => n.status === "bestaetigt").length).toBeGreaterThan(nutzung.length + 5);
  });

  it("nennt keine Person aus der Wissensdatei und erfindet keine Patienten", () => {
    // „Vorname Nachname“ aus Team, Partnern und Leistungen (dort stehen auch Begriffe wie „Manuelle Therapie“ – schadet nicht)
    const paare = [...new Set(PUNKTE.flatMap((p) => p.text.match(/[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)? [A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?/g) || []))];
    for (const name of ["Gabi Diem", "Philipp Engelhardt", "Rebecca Pohle", "Max Müller", "Sandra Kiriasis", "Christiane Heller-Müller"]) expect(paare, name).toContain(name);
    const demo = JSON.stringify(SEED.demo);
    for (const name of paare) expect(demo, name).not.toContain(name);
    for (const nachname of ["Engelhardt", "Diem", "Pohle", "Kiriasis", "Müller", "Särchinger"]) expect(demo, nachname).not.toContain(nachname);
    expect(demo).not.toMatch(/\bTP-?\d|Patient(in)? [A-Z]/);
  });
});
