// Fähigkeiten-Register: jedes Werkzeug, jede feste Aktion und jeder lokale Befehl gehört zu genau einer Fähigkeit;
// kein Werkzeug speichert, ändert oder löscht (jedes läuft hier mit einem Spion-Speicher durch); was etwas ausführt
// oder zum Speichern vorschlägt, nennt den Knopf, mit dem die Therapeutin bestätigt.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CODE, ENV } from "./hilfen.js";
import { chatAnfrage, erstelleApp } from "../src/app.js";
import { BRAIN_WERKZEUGE, brainKontextPruefen } from "../src/brain.js";
import { WERKZEUGE, WERKZEUGE_MIT_BRAIN, erstelleWerkzeuge } from "../src/chat.js";
import { FAEHIGKEITEN, PHASEN, STATUS_WERTE, STUFEN, STUFEN_TEXT, faehigkeitZu } from "../src/faehigkeiten.js";
import { normalisieren } from "../src/notiz.js";
import { arbeitsspeicher } from "../src/speicher.js";

const SCHREIBEND = ["neueNotiz", "notizAendern", "notizLoeschen", "neuerPatient"];
const LESEND = ["patienten", "patient", "notizen", "notiz"];
const FESTE_AKTIONEN = ["diktat", "bericht", "brain_antwort"];

const BRAIN = brainKontextPruefen({ v: 1, knoten: [{ id: "s-kontakt", art: "praxiswissen", status: "bestaetigt", titel: "Kontakt", inhalt: "Telefon: +49 911 23 99 823" }] });

/** Arbeitsspeicher mit einem Test-Patienten und einer Notiz – dahinter ein Spion, der jeden Aufruf mitschreibt. */
async function spionSpeicher() {
  const echt = arbeitsspeicher();
  const patient = await echt.neuerPatient({ kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)" });
  const notiz = await echt.neueNotiz({ patient_id: patient.id, rohtext: "Knie rechts, Flexion 95 Grad", strukturiert: normalisieren({ befund: ["Flexion Knie rechts 95°"], hausaufgaben: ["Bridging 3 × 10 Wdh."] }), suchtext: "tp-01 knie flexion" });
  const aufrufe = [];
  const speicher = new Proxy(echt, {
    get(ziel, name) {
      const wert = ziel[name];
      if (typeof wert !== "function") return wert;
      return (...args) => { aufrufe.push(String(name)); return wert.apply(ziel, args); };
    },
  });
  return { speicher, aufrufe, patient, notiz };
}

describe("Register: Form und Vollständigkeit", () => {
  it("jede Fähigkeit: eindeutige Kennung, Name, Beschreibung, „Was darf Gabi damit?“, Stufe, Status, Daten, Voraussetzungen, Phase", () => {
    expect(STUFEN).toEqual(["lesen", "vorschlagen", "mit_bestaetigung_ausfuehren"]);
    expect(STATUS_WERTE).toEqual(["aktiv", "entwurf", "geplant"]);
    expect(Object.keys(STUFEN_TEXT)).toEqual(STUFEN);
    expect(PHASEN.map((p) => p.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(PHASEN.map((p) => p.titel)).toEqual(["Aufnahme-Tool", "Gespräch", "Gedächtnis (Brain)", "Handeln mit Bestätigung", "Praxis-Interlink", "Patientenportal", "Telefon-Rezeptionistin", "Automationen"]);
    const ids = FAEHIGKEITEN.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FAEHIGKEITEN) {
      expect(f.id, f.id).toMatch(/^[a-z0-9-]{3,40}$/);
      expect(Object.keys(f).sort(), f.id).toEqual(["aktionen", "befehle", "beschreibung", "bestaetigung", "darf", "daten", "id", "name", "phase", "status", "stufe", "voraussetzungen", "werkzeuge"]);
      for (const feld of ["name", "beschreibung", "darf"]) expect(f[feld].length, `${f.id}.${feld}`).toBeGreaterThan(8);
      expect(STUFEN, f.id).toContain(f.stufe);
      expect(STATUS_WERTE, f.id).toContain(f.status);
      expect(PHASEN.map((p) => p.nr), f.id).toContain(f.phase);
      for (const feld of ["daten", "voraussetzungen", "werkzeuge", "aktionen", "befehle"]) expect(Array.isArray(f[feld]), `${f.id}.${feld}`).toBe(true);
      expect(f.daten.length, f.id).toBeGreaterThan(0);
      expect(f.voraussetzungen.length, f.id).toBeGreaterThan(0);
      expect(typeof f.bestaetigung, f.id).toBe("string");
      // einfache Sprache, du-Form: keine Anrede mit „Sie“, keine Fachwörter aus dem Code
      expect(`${f.name} ${f.beschreibung} ${f.darf}`, f.id).not.toMatch(/\bSie\b|\bIhre?n?\b|NDJSON|Endpoint|Prompt\b|JSON/);
    }
    // jede Phase der Roadmap ist vertreten
    expect([...new Set(FAEHIGKEITEN.map((f) => f.phase))].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("jedes Werkzeug (auch die Brain-Werkzeuge) ist genau einmal registriert – und das Register nennt kein Werkzeug, das es nicht gibt", () => {
    const alle = [...WERKZEUGE, ...BRAIN_WERKZEUGE].map((w) => w.name);
    expect(WERKZEUGE_MIT_BRAIN.map((w) => w.name)).toEqual(alle);
    for (const name of alle) {
      expect(FAEHIGKEITEN.filter((f) => f.werkzeuge.includes(name)).map((f) => f.id), name).toHaveLength(1);
      expect(faehigkeitZu(name), name).not.toBeNull();
    }
    const registriert = FAEHIGKEITEN.flatMap((f) => f.werkzeuge);
    expect(new Set(registriert).size).toBe(registriert.length);
    expect([...registriert].sort()).toEqual([...alle].sort());
    // die Zuordnung, wie sie die Oberfläche zeigt
    expect(Object.fromEntries(alle.map((n) => [n, faehigkeitZu(n).id]))).toEqual({
      patienten_auflisten: "patienten-liste", notizen_suchen: "notizen-suchen", notiz_lesen: "notizen-suchen", heute_ueberblick: "heute-ueberblick",
      notiz_entwurf_erstellen: "diktat-entwurf", notiz_aenderung_vorschlagen: "notiz-per-gespraech-aendern", bericht_erstellen: "bericht", brain_eintrag_vorschlagen: "brain-merken", brain_aenderung_vorschlagen: "brain-aendern",
    });
  });

  it("jede feste Aktion von /api/chat ist genau einmal registriert; unbekannte Aktionen lehnt die Route ab", () => {
    const registriert = FAEHIGKEITEN.flatMap((f) => f.aktionen);
    expect([...registriert].sort()).toEqual([...FESTE_AKTIONEN].sort());
    for (const typ of FESTE_AKTIONEN) expect(FAEHIGKEITEN.filter((f) => f.aktionen.includes(typ)), typ).toHaveLength(1);
    const status = (aktion) => { try { chatAnfrage({ nachrichten: [{ rolle: "nutzer", text: "x" }], aktion }); return 200; } catch (e) { return e.status; } };
    const id = crypto.randomUUID();
    expect(status({ typ: "diktat", patient_id: id, text: "Knie" })).toBe(200);
    expect(status({ typ: "bericht", patient_id: id, art: "verlauf" })).toBe(200);
    expect(status({ typ: "brain_antwort", knoten: { id: "s-kontakt", titel: "Kontakt" }, antwort: "0911" })).toBe(200);
    for (const typ of ["speichern", "loeschen", "notiz_aendern", "brain_speichern", "brain_loeschen", "patient_anlegen"]) expect(status({ typ, patient_id: id }), typ).toBe(400);
  });

  it("lokale Befehle der Oberfläche sind eindeutig; faehigkeitZu findet Werkzeug, Aktion und Befehl – Unbekanntes nicht", () => {
    const befehle = FAEHIGKEITEN.flatMap((f) => f.befehle);
    expect(new Set(befehle).size).toBe(befehle.length);
    expect([...befehle].sort()).toEqual(["brain_aendern", "brain_gesundheit", "brain_interview", "brain_kontext", "brain_merken", "brain_suche"]);
    expect(faehigkeitZu("notiz_lesen").id).toBe("notizen-suchen");
    expect(faehigkeitZu("brain_antwort").id).toBe("brain-interview");
    expect(faehigkeitZu("brain_gesundheit").id).toBe("brain-gesundheit");
    expect(faehigkeitZu("brain_kontext").id).toBe("praxisfragen");
    for (const name of ["notiz_loeschen", "", "__proto__", "constructor", undefined]) expect(faehigkeitZu(name)).toBeNull();
  });
});

describe("Register: Stufen und Status", () => {
  it("kein aktives Werkzeug ohne Fähigkeit: Bestehendes ist „aktiv“, der Brain-Prototyp „entwurf“ (Phase 3), Geplantes hat noch keine Werkzeuge", () => {
    for (const w of WERKZEUGE) expect(faehigkeitZu(w.name).status, w.name).toBe("aktiv");
    for (const w of BRAIN_WERKZEUGE) expect(faehigkeitZu(w.name), w.name).toMatchObject({ status: "entwurf", phase: 3, stufe: "vorschlagen" });
    for (const f of FAEHIGKEITEN.filter((x) => x.id.startsWith("brain-") || x.id === "praxisfragen")) expect(f, f.id).toMatchObject({ status: "entwurf", phase: 3 });
    const geplant = FAEHIGKEITEN.filter((f) => f.status === "geplant");
    expect(geplant.map((f) => f.id)).toEqual(["bitte-pruefen-erledigen", "praxis-interlink", "patientenportal", "telefon-rezeptionistin", "automationen"]);
    for (const f of geplant) {
      expect([...f.werkzeuge, ...f.aktionen, ...f.befehle], f.id).toEqual([]);
      expect(f.phase, f.id).toBeGreaterThanOrEqual(4);
    }
    for (const f of FAEHIGKEITEN.filter((x) => x.status !== "geplant")) expect(f.phase, f.id).toBeLessThanOrEqual(3);
    // nichts Aktives oder Gebautes führt selbst etwas aus: höchstens „vorschlagen“
    for (const f of FAEHIGKEITEN.filter((x) => x.status !== "geplant")) expect(["lesen", "vorschlagen"], f.id).toContain(f.stufe);
  });

  it("wer ausführt oder zum Speichern vorschlägt, nennt den Knopf – reines Lesen braucht keinen", () => {
    for (const f of FAEHIGKEITEN) {
      if (f.stufe === "mit_bestaetigung_ausfuehren") expect(f.bestaetigung, f.id).toMatch(/Knopf|Bestätigung|Freigabe/);
      if (f.stufe === "vorschlagen") expect(Boolean(f.bestaetigung) || /nicht gespeichert/.test(f.darf), f.id).toBe(true);
      if (f.stufe === "lesen") expect(f.bestaetigung, f.id).toBe("");
      if (f.bestaetigung) expect(f.darf, f.id).toMatch(/erst|nur, was|einzeln freigegeben/); // „… erst, wenn du auf … tippst“
    }
    expect(faehigkeitZu("notiz_entwurf_erstellen").bestaetigung).toBe("Knopf „Speichern“ auf der Entwurfskarte");
    for (const name of ["brain_eintrag_vorschlagen", "brain_aenderung_vorschlagen", "brain_antwort"]) expect(faehigkeitZu(name).bestaetigung, name).toBe("Knopf „Übernehmen“ auf der Vorschlagskarte");
    // geplante Schreib-Fähigkeiten setzen Benutzerkonten voraus (wer hat bestätigt?)
    for (const f of FAEHIGKEITEN.filter((x) => x.stufe === "mit_bestaetigung_ausfuehren")) expect(f.voraussetzungen.join(" "), f.id).toMatch(/Benutzerkonten|AV-Vertr/);
    // echte Patientendaten erst mit AV-Verträgen
    for (const f of FAEHIGKEITEN.filter((x) => x.daten.join(" ").includes("echte Patientendaten"))) expect(f.voraussetzungen.join(" "), f.id).toMatch(/AV-Verträge/);
  });
});

describe("Kein Werkzeug speichert, ändert oder löscht", () => {
  it("jedes Werkzeug läuft mit dem Spion-Speicher durch: es liest höchstens – nie neueNotiz, notizAendern, notizLoeschen, neuerPatient", async () => {
    const { speicher, aufrufe, notiz } = await spionSpeicher();
    const strukturieren = vi.fn(async () => ({ befund: ["Flexion 95°"] }));
    const berichten = vi.fn(async () => ({ zusammenfassung: ["Flexion 95°"], verlauf: [{ nr: 1, punkte: ["Flexion 95°"] }], hausaufgaben: [], offen: [] }));
    const eingaben = {
      patienten_auflisten: {},
      notizen_suchen: { kuerzel: "TP-01", suchbegriff: "knie" },
      notiz_lesen: { id: notiz.id },
      heute_ueberblick: {},
      notiz_entwurf_erstellen: { kuerzel: "TP-01", diktat: "Knie rechts, Flexion 95 Grad" },
      bericht_erstellen: { kuerzel: "TP-01", art: "verlauf" },
      notiz_aenderung_vorschlagen: { id: notiz.id, aenderungen: [{ abschnitt: "befund", vorher: "Flexion Knie rechts 95°", nachher: "Flexion Knie rechts 110°" }] },
      brain_eintrag_vorschlagen: { titel: "Parken", inhalt: "Drei Parkplätze im Hof." },
      brain_aenderung_vorschlagen: { eintrag: "K1", inhalt: "Telefon: 0911 111" },
    };
    expect(Object.keys(eingaben).sort()).toEqual(WERKZEUGE_MIT_BRAIN.map((w) => w.name).sort()); // kein Werkzeug vergessen
    const ereignisse = [];
    for (const w of WERKZEUGE_MIT_BRAIN) {
      const vorher = aufrufe.length;
      const werkzeuge = erstelleWerkzeuge({ speicher, strukturieren, berichten, brain: BRAIN });
      const r = await werkzeuge.ausfuehren(w.name, eingaben[w.name], { letzte: "Knie rechts", senden: (e) => ereignisse.push(e) });
      expect(r.fehler, `${w.name}: ${r.meldung || ""}`).toBe(false); // wirklich ausgeführt, nicht an der Eingabe gescheitert
      const genutzt = aufrufe.slice(vorher);
      for (const name of genutzt) expect(LESEND, `${w.name} ruft ${name}`).toContain(name);
      for (const name of SCHREIBEND) expect(genutzt, w.name).not.toContain(name);
    }
    expect(aufrufe.length).toBeGreaterThan(5); // der Spion hat wirklich mitgeschrieben
    expect(ereignisse.map((e) => e.t)).toEqual(expect.arrayContaining(["quellen", "entwurf", "bericht", "brain_vorschlag"]));
    // danach ist alles wie vorher: ein Test-Patient, eine Notiz
    expect((await speicher.patienten()).map((p) => [p.kuerzel, p.anzahl])).toEqual([["TP-01", 1]]);
  });

  it("auch die festen Aktionen (Diktat, Bericht, Brain-Interview) über die echte Route speichern nichts", async () => {
    const { speicher, aufrufe, patient } = await spionSpeicher();
    const app = erstelleApp({
      speicher,
      transkribieren: vi.fn(),
      strukturieren: async () => normalisieren({ befund: ["Flexion 95°"] }),
      berichten: async () => ({ zusammenfassung: ["Flexion 95°"], verlauf: [], hausaufgaben: [], offen: [] }),
      brainVorschlagen: async () => ({ inhalt: "Drei Parkplätze im Hof." }),
    });
    const rufe = async (aktion) => {
      const r = await app(new Request("https://api.test/api/chat", { method: "POST", headers: { "X-Gabi-Zugang": CODE, "Content-Type": "application/json" }, body: JSON.stringify({ nachrichten: [{ rolle: "nutzer", text: "Knie rechts" }], aktion }) }), ENV);
      return (await r.text()).trim().split("\n").map((z) => JSON.parse(z).t);
    };
    expect(await rufe({ typ: "diktat", patient_id: patient.id, text: "Knie rechts" })).toEqual(["status", "entwurf", "text", "fertig"]);
    expect(await rufe({ typ: "bericht", patient_id: patient.id, art: "zusammenfassung" })).toEqual(["status", "bericht", "text", "fertig"]);
    expect(await rufe({ typ: "brain_antwort", knoten: { id: "s-frage-parken", titel: "Parken?" }, antwort: "Drei im Hof." })).toEqual(["status", "brain_vorschlag", "text", "fertig"]);
    for (const name of SCHREIBEND) expect(aufrufe, name).not.toContain(name);
    expect(aufrufe.length).toBeGreaterThan(2);
  });

  it("im Quelltext der Werkzeuge kommt kein schreibender Speicher-Aufruf vor; was etwas anlegt, sagt „Speichert NICHT“", () => {
    for (const datei of ["chat.js", "brain.js", "brain_vorschlag.js", "faehigkeiten.js"]) {
      const quelle = readFileSync(new URL(`../src/${datei}`, import.meta.url), "utf8");
      for (const name of SCHREIBEND) expect(quelle, `${datei}: ${name}`).not.toMatch(new RegExp(`\\b${name}\\s*\\(`));
    }
    for (const name of ["notiz_entwurf_erstellen", "brain_eintrag_vorschlagen", "brain_aenderung_vorschlagen"]) {
      expect(WERKZEUGE_MIT_BRAIN.find((w) => w.name === name).description, name).toContain("Speichert NICHT");
    }
    for (const w of WERKZEUGE_MIT_BRAIN) expect(w.name).not.toMatch(/speichern|loeschen|löschen|aendern$/);
  });
});
