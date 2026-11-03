// Oberfläche ohne Browser: Demo-Modus (Fake-API), PDF-Erzeugung, Seed-Datei, Gleichlauf mit dem Worker.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kuerzelPruefen, normalisieren, suchtext } from "../src/notiz.js";
import { SEED_DATEI, seedSql } from "../dev/seed_erzeugen.mjs";

const require = createRequire(import.meta.url);
const DEMO = require("../../demo.js");
const PDF = require("../../pdf.js");
const { jsPDF } = require("../../vendor/jspdf.umd.min.js");

const demoApi = () => DEMO.erstelleApi({ ablage: DEMO.speicherAblage(), verzoegerung: false });

/** Sichtbarer Text einer PDF-Seite (aus den Text-Befehlen, WinAnsi zurückübersetzt). */
function seitenText(doc, seite) {
  const roh = doc.internal.pages[seite].join("\n");
  return [...roh.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, "$1").replace(/\x96/g, "–").replace(/\x95/g, "•").replace(/\x84/g, "„").replace(/\x93/g, "“"))
    .join("\n");
}

describe("Demo-Modus: Fake-API", () => {
  it("startet mit 3 erfundenen Test-Patienten und je 2 Notizen", async () => {
    const api = demoApi();
    const { patienten } = await api.anfrage("/api/patienten");
    expect(patienten.map((p) => [p.kuerzel, p.anzahl])).toEqual([["TP-01", 2], ["TP-02", 2], ["TP-03", 2]]);
    for (const p of patienten) expect(p.kuerzel).toMatch(/^[A-Z0-9-]+$/); // nur Kürzel
    const { notizen } = await api.anfrage(`/api/notizen?patient_id=${patienten[0].id}`);
    expect(notizen).toHaveLength(2);
    expect(notizen[0].erstellt_am > notizen[1].erstellt_am).toBe(true); // neueste zuerst
    expect(notizen[0].rohtext).toBeUndefined(); // Liste ohne Rohtext, wie der Worker
  });

  it("Aufnahme → Fake-Transkript → Notiz → Speichern → Ordner → Suche → Bearbeiten → Löschen", async () => {
    const api = demoApi();
    const t1 = await api.anfrage("/api/transkribieren", { methode: "POST", text: "A".repeat(300) });
    const t2 = await api.beispielDiktat();
    expect(t1.text).toBe(DEMO.DIKTATE[0].rohtext);
    expect(t2.text).toBe(DEMO.DIKTATE[1].rohtext); // der Reihe nach
    const { strukturiert } = await api.anfrage("/api/strukturieren", { methode: "POST", body: { rohtext: `${t1.text}\n${t2.text}` } });
    expect(strukturiert.befund).toEqual([...DEMO.DIKTATE[0].strukturiert.befund, ...DEMO.DIKTATE[1].strukturiert.befund]);
    expect(strukturiert.unklar).not.toContain(DEMO.DEMO_HINWEIS);

    const { patient } = await api.anfrage("/api/patienten", { methode: "POST", body: { kuerzel: "tp 09", pseudonym: "Testfall Hand (fiktiv)" } });
    expect(patient.kuerzel).toBe("TP-09");
    const { notiz } = await api.anfrage("/api/notizen", { methode: "POST", body: { patient_id: patient.id, rohtext: t1.text, strukturiert } });
    expect(notiz.kuerzel).toBe("TP-09");

    const suche = await api.anfrage(`/api/notizen?q=${encodeURIComponent("Beinpresse tp-09")}`);
    expect(suche.notizen.map((n) => n.id)).toEqual([notiz.id]);
    expect((await api.anfrage(`/api/notizen?q=${encodeURIComponent("überkopfarbeit")}`)).notizen).toHaveLength(2); // Umlaut
    const geaendert = await api.anfrage(`/api/notizen/${notiz.id}`, { methode: "PATCH", body: { strukturiert: { ...strukturiert, verlauf: ["Test: bearbeitet"] } } });
    expect(geaendert.notiz.geaendert_am).toBeTruthy();
    expect((await api.anfrage(`/api/notizen?q=bearbeitet`)).notizen).toHaveLength(1);
    await api.anfrage(`/api/notizen/${notiz.id}`, { methode: "DELETE" });
    await expect(api.anfrage(`/api/notizen/${notiz.id}`)).rejects.toThrow(/nicht gefunden/);
  });

  it("unbekannter Text: Stichwort-Zuordnung mit Demo-Hinweis", () => {
    const n = DEMO.demoStrukturieren("Schulter frei. Zwanzig Minuten Massage. Zu Hause Pendeln. Nächster Termin Freitag.");
    expect(n.befund).toEqual(["Schulter frei."]);
    expect(n.massnahmen).toEqual(["Zwanzig Minuten Massage."]);
    expect(n.hausaufgaben).toEqual(["Zu Hause Pendeln."]);
    expect(n.verlauf).toEqual(["Nächster Termin Freitag."]);
    expect(n.unklar).toEqual([DEMO.DEMO_HINWEIS]);
  });

  it("gleiche Regeln und Fehlertexte wie der Worker", async () => {
    const api = demoApi();
    for (const k of ["TP-01", "tp 02", "Meier", "A", "AB-123456789012", "X-1", "Ä-1"]) {
      expect(DEMO.kuerzelPruefen(k)).toEqual(kuerzelPruefen(k));
    }
    await expect(api.anfrage("/api/patienten", { methode: "POST", body: { kuerzel: "Meier" } })).rejects.toThrow(/Ziffer/);
    await expect(api.anfrage("/api/patienten", { methode: "POST", body: { kuerzel: "TP-01" } })).rejects.toThrow(/gibt es schon/);
    await expect(api.anfrage("/api/strukturieren", { methode: "POST", body: { rohtext: "  " } })).rejects.toThrow(/Kein Text/);
    await expect(api.anfrage("/api/notizen", { methode: "POST", body: { patient_id: "x", rohtext: "a" } })).rejects.toThrow(/Test-Patienten wählen/);
    const roh = { befund: ["- Flexion 90° [Unklar]", "Flexion 90° (unklar)"], maßnahmen: "MT 20 min" };
    expect(DEMO.normalisieren({ ...roh, massnahmen: roh.maßnahmen })).toEqual(normalisieren(roh));
    for (const n of DEMO.NOTIZEN) {
      const p = DEMO.PATIENTEN.find((x) => x.kuerzel === n.kuerzel);
      expect(DEMO.suchtext(p, n.rohtext, normalisieren(n.strukturiert))).toBe(suchtext(p.kuerzel, p.pseudonym, n.rohtext, normalisieren(n.strukturiert)));
    }
  });

  it("Zurücksetzen stellt die Beispieldaten wieder her", async () => {
    const api = demoApi();
    const { patienten } = await api.anfrage("/api/patienten");
    const { notizen } = await api.anfrage(`/api/notizen?patient_id=${patienten[0].id}`);
    await api.anfrage(`/api/notizen/${notizen[0].id}`, { methode: "DELETE" });
    expect((await api.anfrage("/api/patienten")).patienten[0].anzahl).toBe(1);
    api.zuruecksetzen();
    expect((await api.anfrage("/api/patienten")).patienten[0].anzahl).toBe(2);
  });
});

describe("PDF", () => {
  const notiz = (strukturiert, extra = {}) => ({
    id: "x", kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)", erstellt_am: "2026-11-03T14:05:00.000Z", geaendert_am: null, strukturiert, ...extra,
  });

  it("Kopf mit PhysioWorks, Datum, Kürzel – Abschnitte – Fuß „Testversion – Testdaten“", () => {
    const doc = PDF.erstellen(notiz(DEMO.NOTIZEN[1].strukturiert), { jsPDF });
    expect(doc.getNumberOfPages()).toBe(1);
    const t = seitenText(doc, 1);
    for (const teil of ["PhysioWorks", "Behandlungsnotiz", "TP-01", "03.11.2026", "Befund", "Maßnahmen", "Verlauf", "Hausaufgaben", "Bitte prüfen (unklare Stellen)", "Testversion – Testdaten", "Seite 1 von 1"]) {
      expect(t).toContain(teil);
    }
    expect(t).toContain("Wandsitzen 3 × 15 (unklar), täglich");
    expect(PDF.dateiname(notiz({}))).toBe("PhysioWorks_TP-01_2026-11-03.pdf");
  });

  it("lange Notiz: mehrere Seiten, Kopfzeile ab Seite 2, Fuß auf jeder Seite", () => {
    const lang = { befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: ["„x“ unklar"] };
    for (const k of ["befund", "massnahmen", "verlauf", "hausaufgaben"]) {
      for (let i = 0; i < 12; i++) lang[k].push(`Punkt ${i + 1} ${k}: Flexion Knie rechts bis 110°, Extension 0°, Schmerz NRS 3, Beinpresse 30 kg 3 × 12 Wdh. und noch mehr Text zum Umbrechen`);
    }
    const doc = PDF.erstellen(notiz(lang, { geaendert_am: "2026-11-04T08:00:00.000Z" }), { jsPDF });
    const seiten = doc.getNumberOfPages();
    expect(seiten).toBeGreaterThanOrEqual(3);
    for (let i = 1; i <= seiten; i++) {
      const t = seitenText(doc, i);
      expect(t).toContain("Testversion – Testdaten");
      expect(t).toContain(`Seite ${i} von ${seiten}`);
      if (i > 1) expect(t).toContain("PhysioWorks · Behandlungsnotiz · TP-01 · 03.11.2026");
    }
    expect(seitenText(doc, 1)).toContain("Zuletzt bearbeitet: 04.11.2026");
    const alles = Array.from({ length: seiten }, (_, i) => seitenText(doc, i + 1)).join("\n");
    expect(alles).toContain("Punkt 12 hausaufgaben"); // nichts abgeschnitten
  });

  it("leere Abschnitte und Sonderzeichen", () => {
    const doc = PDF.erstellen(notiz({ befund: ["Schmerz ≤ 3 → besser ✓ 😀"] }, { pseudonym: "" }), { jsPDF });
    const t = seitenText(doc, 1);
    expect(t).toContain("Schmerz <= 3 -> besser ok");
    expect(t).not.toContain("😀");
    expect(t.match(/– nichts notiert –/g)).toHaveLength(3);
    expect(t).not.toContain("Bitte prüfen");
  });
});

describe("Seed-Datei supabase/seed_test.sql", () => {
  it("passt zum Stand von demo.js (sonst: cd worker && node dev/seed_erzeugen.mjs)", () => {
    expect(readFileSync(SEED_DATEI, "utf8")).toBe(seedSql());
  });
  it("beginnt mit NUR TESTDATEN, 3 Patienten, 6 Notizen, idempotent", () => {
    const sql = seedSql();
    expect(sql.split("\n")[0]).toMatch(/^-- NUR TESTDATEN/);
    expect(DEMO.PATIENTEN).toHaveLength(3);
    expect(sql.match(/insert into public\.notes/g)).toHaveLength(6);
    expect(sql.match(/on conflict/g)).toHaveLength(7);
    for (const p of DEMO.PATIENTEN) expect(DEMO.NOTIZEN.filter((n) => n.kuerzel === p.kuerzel)).toHaveLength(2);
  });
});
