// Oberfläche ohne Browser: Demo-Modus (Fake-API), PDF-Erzeugung, Seed-Datei, Gleichlauf mit dem Worker.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kuerzelPruefen, normalisieren, suchtext } from "../src/notiz.js";
import { RESET_DATEI, SEED_DATEI, resetSql, seedSql } from "../dev/seed_erzeugen.mjs";

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

describe("Hilfsdatei supabase/reset_test.sql (nur von Hand, nach Julius' OK)", () => {
  it("passt zum Stand von demo.js (sonst: cd worker && node dev/seed_erzeugen.mjs)", () => {
    expect(readFileSync(RESET_DATEI, "utf8")).toBe(resetSql());
  });
  it("warnt groß ganz oben, löscht in einer Transaktion alles und legt genau den Seed-Stand neu an", () => {
    const sql = resetSql();
    const zeilen = sql.split("\n");
    for (const z of zeilen.slice(0, 2)) expect(z).toBe("-- ⚠️ ACHTUNG: löscht ALLE Daten. Nur für Testumgebung. Vor Ausführen Bestätigung durch Julius.");
    const ohneKommentar = zeilen.filter((z) => !z.startsWith("--")).join("\n");
    const start = ohneKommentar.indexOf("begin;");
    const loeschen = [ohneKommentar.indexOf("delete from public.notes;"), ohneKommentar.indexOf("delete from public.patients_test;")];
    const einfuegen = ohneKommentar.indexOf("insert into");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(loeschen.every((i) => i > start && i < einfuegen)).toBe(true);
    expect(ohneKommentar.trim().endsWith("commit;")).toBe(true);
    expect(ohneKommentar.match(/\bdelete from\b/g)).toHaveLength(2); // sonst nichts
    expect(ohneKommentar).not.toMatch(/\b(drop|truncate|alter|grant|revoke)\b/i); // Tabellen und Rechte bleiben
    // derselbe Datenteil wie seed_test.sql
    const daten = (x) => x.slice(x.indexOf("-- Test-Patienten"), x.lastIndexOf("commit;"));
    expect(daten(sql)).toBe(daten(seedSql()));
  });
});

describe("Versionsstempel", () => {
  it("VERSION in app.js passt zu jedem ?v= in index.html (sonst lädt jeder Start einmal neu oder zeigt „aktualisiert“)", () => {
    const wurzel = new URL("../../", import.meta.url);
    const html = readFileSync(new URL("index.html", wurzel), "utf8");
    const version = /const VERSION = "([^"]+)"/.exec(readFileSync(new URL("app.js", wurzel), "utf8"))[1];
    const eigene = [...html.matchAll(/(?:src|href)="(style\.css|config\.js|kern\.js|pdf\.js|demo\.js|aufnahme\.js|gespraeche\.js|app\.js)\?v=([^"]+)"/g)];
    expect(eigene.map((m) => m[1]).sort()).toEqual(["app.js", "aufnahme.js", "config.js", "demo.js", "gespraeche.js", "kern.js", "pdf.js", "style.css"]);
    for (const m of eigene) expect(`${m[1]}?v=${m[2]}`).toBe(`${m[1]}?v=${version}`);
  });
});

describe("Ruhe: Häkchen „Gespeichert“", () => {
  it("steht ohne „zeichnet“ fertig da, zeichnet nur auf Zuruf und mit „Bewegung reduzieren“ gar nicht", () => {
    const wurzel = new URL("../../", import.meta.url);
    const css = readFileSync(new URL("style.css", wurzel), "utf8");
    const app = readFileSync(new URL("app.js", wurzel), "utf8");
    /** Inhalt der ersten Regel mit genau diesem Selektor (am Zeilenanfang) */
    const regel = (quelle, selektor) => (new RegExp(`(?:^|\\n)\\s*${selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(quelle) || [])[1] || "";
    const reduziert = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    // CSS-Animationen starten bei jedem Neuaufbau und bei jedem hidden → sichtbar neu – der Grundzustand darf keine haben
    expect(regel(css, ".haken path")).toMatch(/stroke-dashoffset:\s*0\b/);
    expect(regel(css, ".haken path")).not.toMatch(/animation/);
    expect(regel(css, ".haken.zeichnet path")).toMatch(/animation:\s*zeichnen\b/);
    expect(regel(reduziert, ".haken.zeichnet path")).toMatch(/animation:\s*none/);
    expect(regel(reduziert, ".haken.zeichnet path")).toMatch(/stroke-dashoffset:\s*0\b/); // sonst bliebe der Haken unsichtbar (Grundwert 20)
    expect(app).toMatch(/function beruhigen\(wurzel\) \{[^}]*"zeichnet"/); // beruhigen() nimmt „zeichnet“ beim Verlassen wieder weg
  });
});

describe("Ruhe: Kopfzeile der Suche springt nicht (v2.1.1)", () => {
  const css = readFileSync(new URL("../../style.css", import.meta.url), "utf8");
  it("Ergebniszeile einzeilig mit „…“ – Höhe unabhängig von Trefferzahl und Begriffslänge, ohne die Seite zu verbreitern", () => {
    expect(css).toMatch(/\n\.ergebnis-kopf \{ min-width: 0; \}/);
    expect(css).toMatch(/\n\.ergebnis-kopf \.suche-hinweis \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;[^}]*\}/);
    expect(css).toMatch(/@media \(min-width: 640px\) \{ \.ergebnis-kopf \{ flex-wrap: nowrap; \} \}/);
  });
});

describe("Fokus rund um die Schublade und nach Rückfragen (Safari fokussiert Knöpfe beim Tippen nicht, v2.1.1)", () => {
  const wurzel = new URL("../../", import.meta.url);
  const css = readFileSync(new URL("style.css", wurzel), "utf8");
  const app = readFileSync(new URL("app.js", wurzel), "utf8");
  it("ein Dialog selbst zeigt keinen Fokusring (Safari fokussiert ihn nach einer Rückfrage und beim Tab-Umlauf)", () => {
    expect(css).toMatch(/(^|\n)dialog:focus-visible\s*\{\s*outline:\s*none;?\s*\}/);
  });
  it("Fokus aus dem Skript: nach Tippen/Klicken ohne Ring, per Tastatur mit (FocusOptions.focusVisible)", () => {
    expect(app).toMatch(/addEventListener\("pointerdown", \(e\) => \{\s*perZeiger = true;/);
    expect(app).toMatch(/addEventListener\("keydown", \(\) => \{ perZeiger = false; \}, true\)/);
    expect(app).toMatch(/\.focus\(\{ preventScroll: true, focusVisible: !perZeiger \}\)/);
  });
  it("die Schublade gibt den Fokus gleich nach close() zurück – nicht erst im close-Ereignis (Safari: dann schon body)", () => {
    const schliessen = app.slice(app.indexOf("function schubladeSchliessen("), app.indexOf("el.kopfMenue.addEventListener("));
    expect(schliessen).toMatch(/const zumachen = \(\) => \{ d\.close\(\); fokusNachSchublade\(\); \};/);
    expect(schliessen.match(/\.close\(\)/g)).toHaveLength(1); // sofort, „Bewegung reduzieren“ und nach der Animation: alles über zumachen()
  });
  it("nach Tippen/Klicken merkt sich der Dialog den Knopf nicht (Safari gäbe ihn mit Ring zurück); Knöpfe im geschlossenen Dialog zählen nicht", () => {
    const frage = app.slice(app.indexOf("function frage("), app.indexOf("// 2 API"));
    expect(frage).toMatch(/if \(perZeiger && ausloeser && document\.activeElement === ausloeser && !ausloeser\.matches\("input, textarea, select"\)\) ausloeser\.blur\(\);/);
    expect(frage.indexOf("ausloeser.blur()")).toBeLessThan(frage.indexOf("showModal()"));
    expect(app).toMatch(/!\(a instanceof HTMLDialogElement\) && !a\.closest\("dialog:not\(\[open\]\)"\)\) return a;/);
    // Rückfragen aus dem Info-Dialog („Beispieldaten zurücksetzen?“, „Abmelden?“): zurück aufs Badge
    expect(app).toMatch(/const ausInfoDialog = \(\) => \{ el\.dialogInfo\.close\(\); zuletztBedient = \{ knopf: el\.testBadge, zeit: performance\.now\(\) \}; \};/);
    expect(app.match(/el\.dialogInfo\.close\(\)/g)).toHaveLength(1);
  });
  it("Sortierung umstellen: der Fokus bleibt auf der neuen Auswahl (Suche und Patientenseite)", () => {
    expect(app).toMatch(/ersetzenSortierungBleibt\(inhalt, notizen\.length/);
    expect(app).toMatch(/ersetzenSortierungBleibt\(el\.notizen, patientHtml\(p, notizen\)\)/);
  });
  it("Löschen/„Alle löschen“ geben den bedienten Knopf als Anker weiter; jede Rückfrage gibt den Fokus danach zurück", () => {
    expect(app).toMatch(/gespraechLoeschenFragen\(eintrag\.dataset\.gespraech, knopf\)/);
    expect(app).toMatch(/alleGespraecheLoeschenFragen\(alle\)/);
    expect(app).toMatch(/gespraecheZeigen\(knopf\)/);
    expect(app).toMatch(/gespraecheLeeren\(knopf\)/);
    const frage = app.slice(app.indexOf("function frage("), app.indexOf("// 2 API"));
    expect(frage).toMatch(/const ausloeser = bedienterKnopf\(\);/);
    expect(frage).toMatch(/gegenstueck\(ausloeser\)/); // auch wenn die Liste inzwischen neu gebaut wurde
  });
});

describe("Zugang: nie eine Worker-Anfrage ohne Code, Abmelden in fester Reihenfolge (v2.1.1)", () => {
  const quelle = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  /** Rumpf einer Funktion der obersten Ebene im IIFE (zwei Leerzeichen eingerückt) – bis zu ihrer schließenden Klammer. */
  const rumpf = (name) => {
    const start = quelle.search(new RegExp(`\\n  (?:async )?function ${name}\\(`));
    expect(start, `${name}() fehlt`).toBeGreaterThan(-1);
    return quelle.slice(start, quelle.indexOf("\n  }\n", start));
  };
  const zaehle = (t) => (t.match(/\bfetch\(/g) || []).length;

  it("Netz nur über api(), chatStrom() und statusHolen() – je genau ein fetch()", () => {
    expect(zaehle(quelle)).toBe(3);
    expect(["api", "chatStrom", "statusHolen"].map((n) => zaehle(rumpf(n)))).toEqual([1, 1, 1]);
  });

  it("api() und chatStrom() prüfen den Code nach dem Demo-Zweig und vor dem fetch() (sonst Fehlversuch am Worker)", () => {
    for (const n of ["api", "chatStrom"]) {
      const r = rumpf(n);
      const pruefung = r.indexOf("if (!code) throw ohneZugang()");
      expect(pruefung, n).toBeGreaterThan(r.indexOf("if (modus.demo)"));
      expect(pruefung, n).toBeLessThan(r.indexOf("fetch("));
    }
  });

  it("Abmelden: Code sofort vom Gerät, Hinweise weg, Laufendes beenden, mit Häkchen SOFORT löschen, dann warten, Sitzung beenden, Reste leeren, zuletzt Code im Tab vergessen", () => {
    const r = rumpf("abmelden");
    const reihe = ['speicher.loeschen("lokal", "gabi.zugang")', 'if (!t.classList.contains("fehler")) t.remove()', "aufnahme.abbrechen()", "chat.laeuft.abbruch.abort()",
      "gespraecheLeeren()", "Promise.allSettled([...laufend])", 'if (t.classList.contains("erfolg")) t.remove()', "neuesLeeresZeigen()",
      "verlauf.abgemeldet = true", "aufnahmen.clear()", "ordnerLeeren()", 'el.text.value = ""', "zugangVergessen()", "zugangZeigen("];
    const stellen = reihe.map((s) => r.indexOf(s));
    expect(stellen.filter((x) => x < 0), JSON.stringify(Object.fromEntries(reihe.map((s, i) => [s, stellen[i]])))).toEqual([]);
    expect([...stellen].sort((a, b) => a - b)).toEqual(stellen);
    // Hinweise der alten Sitzung (außerhalb von #app, z. B. „Rückgängig“) gleich weg – Fehler bleiben auf der Zugangsseite
    expect(r).not.toMatch(/el\.toasts\.replaceChildren\(\)/);
    // Frist je Anfrage: ein Entwurf, der erst auf einen anderen Tab warten musste, verlängert das Warten (speichernBis)
    expect(r).toMatch(/const frist = \(\) => Math\.max\(beginn \+ 20000, speichernBis\);/);
    expect(r).toMatch(/while \(laufend\.size && Date\.now\(\) < frist\(\)\)/);
    // Ladekreis mit Text: dann ist nur er zu sehen – #app nicht mehr inert (sonst hörten Screenreader nichts), Fokus auf den Text
    expect(r).toMatch(/ansichtZeigen\("laden"\);\s*el\.app\.inert = false;\s*el\.ladenText\.focus\(\{ preventScroll: true \}\);/);
  });

  it("während des Abmeldens: kein Zugangs-Wechsel mittendrin, kein neues Anmelden, kein „Rückgängig“, Fehler werden genannt", () => {
    for (const n of ["api", "chatStrom"]) expect(rumpf(n), n).toMatch(/if \(!abmeldenLaeuft\) zugangZeigen\("Der Zugangscode gilt nicht mehr/);
    expect(quelle).toMatch(/e\.preventDefault\(\);\s*if \(abmeldenLaeuft\) return;/); // Anmelde-Formular
    expect(quelle).toMatch(/text: "Rückgängig", tun: \(\) => \{\s*if \(verwaist\(g\) \|\| abmeldenLaeuft\) \{ aufnahmeVerwaist\(null\); return; \}/);
    const speichern = rumpf("entwurfSpeichern");
    expect(speichern).toMatch(/else if \(f instanceof Abbruch && f\.zugang\) toast\(`Nicht gespeichert \(\$\{k\.kuerzel\}\): Der Zugangscode galt nicht mehr\.`/);
    expect(quelle).toMatch(/if \(f\.zugang\) toast\("Änderungen an der Notiz nicht gespeichert: Der Zugangscode galt nicht mehr\."/);
    expect(quelle).toMatch(/if \(f\.zugang\) toast\("Notiz nicht gelöscht: Der Zugangscode galt nicht mehr\."/);
    // abmeldenLaeuft steht vor api() (sonst Zugriff vor der Deklaration beim Start)
    expect(quelle.indexOf("let abmeldenLaeuft = false;")).toBeLessThan(quelle.indexOf("async function api("));
  });

  it("Entwurf speichern: Sperre mit Frist, vor dem Senden prüfen, ob das Gespräch noch da ist, Frist fürs Abmelden verlängern", () => {
    const sperre = rumpf("mitSperre");
    expect(sperre).toMatch(/navigator\.locks\.request\(name, \{ ifAvailable: true \}/);
    expect(sperre).toMatch(/navigator\.locks\.request\(name, \{ signal: ab\.signal \}/);
    expect(sperre).toMatch(/setTimeout\(\(\) => ab\.abort\(\), 25000\)/);
    expect(sperre).toMatch(/if \(!bekommen && ab\.signal\.aborted\) throw Object\.assign\(new Abbruch\(\), \{ gesperrt: true \}\);/);
    const r = rumpf("entwurfSpeichern");
    const reihe = ["if (verwaist(g)) return gespraechWeg();", "await entwurfInAblage(g.id, k.id)", "stand.fehlt && g.abgelegt", "speichernBis = Math.max(speichernBis, Date.now() + 20500);", 'api("/api/notizen", { methode: "POST"', "await gespraechMerken(g); // erst auf dem Gerät"];
    const stellen = reihe.map((s) => r.indexOf(s));
    expect(stellen.filter((x) => x < 0), JSON.stringify(Object.fromEntries(reihe.map((s, i) => [s, stellen[i]])))).toEqual([]);
    expect([...stellen].sort((a, b) => a - b)).toEqual(stellen);
    // ein abgelegtes Gespräch wird beim Schreiben nie wieder angelegt (nurVorhanden), auch nicht beim Umbenennen
    expect(rumpf("gespraechSchreiben")).toMatch(/\{ nurVorhanden: Boolean\(g\.abgelegt\) \}/);
    expect(rumpf("gespraechSchreiben")).toMatch(/if \(nachgezogen && nachgezogen\.fehlt\) \{ anderswoGeloescht\(g\); return; \}/);
    expect(rumpf("umbenennen")).toMatch(/ablageSpeichern\(\{ \.\.\.e \}, null, \{ nurVorhanden: true \}\)/);
  });

  it("zwei Tabs: eine übernommene vorläufige Antwort gilt hier, sobald an ihrer Karte gearbeitet wird (nicht beim PDF)", () => {
    const klick = quelle.slice(quelle.indexOf('el.nachrichten.addEventListener("click"'));
    const regel = 'if (n.unterwegs && aktion.startsWith("entwurf-") && aktion !== "entwurf-pdf" && !netzVorlaeufig.has(n) && !(chat.laeuft && chat.laeuft.gabi === n)) delete n.unterwegs;';
    expect(klick.indexOf(regel)).toBeGreaterThan(klick.indexOf("if (!k) return;"));
    expect(klick.indexOf(regel)).toBeLessThan(klick.indexOf('aktion === "entwurf-bearbeiten"'));
    expect(quelle.indexOf("const netzVorlaeufig = new Map();")).toBeLessThan(quelle.indexOf('el.nachrichten.addEventListener("click"'));
  });
});
