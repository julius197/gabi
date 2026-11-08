// Oberfläche v2 ohne Browser: Kern-Hilfen (sichere Formatierung, NDJSON, Verlauf, Datum), Demo-Assistent
// (Absichten, gleiche Werkzeuge und Texte wie der Worker, Praxiswissen nur aus der Wissensdatei), Bericht-PDF.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { neueApp } from "./hilfen.js";
import { WERKZEUGE, berichtBauen as workerBerichtBauen, erstelleWerkzeuge } from "../src/chat.js";
import { arbeitsspeicher } from "../src/speicher.js";
import { normalisieren } from "../src/notiz.js";
import { WISSEN } from "../src/wissen.js";

const require = createRequire(import.meta.url);
const K = require("../../kern.js");
const DEMO = require("../../demo.js");
const PDF = require("../../pdf.js");
const { jsPDF } = require("../../vendor/jspdf.umd.min.js");

const demoApi = () => DEMO.erstelleApi({ ablage: DEMO.speicherAblage(), verzoegerung: false });
const ereignisse = async (api, body) => { const e = []; await api.chatten(body, (x) => e.push(x)); return e; };
const text = (e) => e.filter((x) => x.t === "text").map((x) => x.d).join("");

describe("Kern: sicherer Text für Gabis Antworten", () => {
  it("escaped HTML, kann **fett**, Listen, Absätze und markiert (unklar)", () => {
    expect(K.formatierterText('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
    expect(K.formatierterText("Am **03.11.**:\n- Knie <b>\n- NRS 3 (unklar)\n\nFertig")).toBe(
      '<p>Am <strong>03.11.</strong>:</p><ul><li>Knie &lt;b&gt;</li><li>NRS 3 <mark class="unklar">(unklar)</mark></li></ul><p>Fertig</p>',
    );
    expect(K.formatierterText("1. eins\n2. zwei")).toBe("<ol><li>eins</li><li>zwei</li></ol>");
    expect(K.formatierterText("## Titel\nText")).toBe("<p>Titel<br>Text</p>");
    expect(K.formatierterText("**<script>**")).toBe("<p><strong>&lt;script&gt;</strong></p>");
    expect(K.ohneFormat("**TP-01**:\n- a\n- b")).toBe("TP-01:\na\nb");
  });

  it("NDJSON-Leser: Zeilen über Stückgrenzen hinweg, kaputte Zeilen überspringen", () => {
    const l = K.zeilenLeser();
    expect(l.schieben('{"t":"text","d":"Hal')).toEqual([]);
    expect(l.schieben('lo"}\n{"t":"sta')).toEqual([{ t: "text", d: "Hallo" }]);
    expect(l.schieben('tus","text":"x"}\nkaputt\n{"d":1}\n')).toEqual([{ t: "status", text: "x" }]);
    expect(l.ende()).toEqual([]);
    expect(l.schieben('{"t":"fertig"}')).toEqual([]);
    expect(l.ende()).toEqual([{ t: "fertig" }]);
  });

  it("Verlauf für den Server: ohne lokale Hinweise und Fehler, Karten als Text, gekürzt, beginnt mit der Nutzerin", () => {
    const v = K.verlaufFuerServer([
      { rolle: "gabi", text: "Für wen?", lokal: true },
      { rolle: "nutzer", text: "Theraband", senden: "Suche in meinen Notizen: Theraband" },
      { rolle: "gabi", text: "Gefunden.", karten: [{ typ: "entwurf", kuerzel: "TP-01", strukturiert: { befund: ["Flexion 90°"], massnahmen: [] }, gespeichert: "id" }] },
      { rolle: "nutzer", text: "Nochmal" },
      { rolle: "gabi", text: "Teil", fehler: true },
      { rolle: "gabi", text: "", abgebrochen: true },
      { rolle: "nutzer", text: "Bericht" },
      { rolle: "gabi", text: "", karten: [{ typ: "bericht", bericht: { titel: "Verlaufsbericht", kuerzel: "TP-02", zusammenfassung: ["NRS 4"] } }] },
    ]);
    expect(v).toEqual([
      { rolle: "nutzer", text: "Suche in meinen Notizen: Theraband" },
      { rolle: "gabi", text: "Gefunden.\n\n[App-Hinweis: Notiz-Entwurf für TP-01 angezeigt (gespeichert) – Befund: Flexion 90°]" },
      // „Nochmal“ fehlt: die Antwort darauf ist gescheitert – der ganze Wortwechsel fällt weg
      { rolle: "nutzer", text: "Bericht" },
      { rolle: "gabi", text: "[App-Hinweis: Verlaufsbericht für TP-02 angezeigt – NRS 4]" },
    ]);
    // altes Diktat nach Abbruch wandert nicht in die nächste Anfrage
    expect(K.verlaufFuerServer([
      { rolle: "nutzer", text: "Diktat für TP-01: Knie" }, { rolle: "gabi", text: "Abgebrochen.", abgebrochen: true },
      { rolle: "nutzer", text: "Diktat für TP-02: Schulter" },
    ])).toEqual([{ rolle: "nutzer", text: "Diktat für TP-02: Schulter" }]);
    const lang = Array.from({ length: 30 }, (_, i) => ({ rolle: i % 2 ? "gabi" : "nutzer", text: "x".repeat(5000) }));
    const kurz = K.verlaufFuerServer(lang);
    expect(kurz.length).toBeLessThanOrEqual(18);
    expect(kurz[0].rolle).toBe("nutzer");
    expect(kurz.reduce((s, n) => s + n.text.length, 0)).toBeLessThanOrEqual(90000);
  });

  it("Datum in deutscher Zeit, „Heute“ und „Gestern“", () => {
    expect(K.datumKurz("2026-11-07T23:30:00.000Z")).toBe("08.11.");
    expect(K.datum("2026-11-07T23:30:00.000Z")).toBe("08.11.2026");
    expect(K.datumLang("2026-11-03T09:30:00.000Z")).toBe("Di., 03.11.2026, 10:30");
    const jetzt = new Date("2026-11-08T12:00:00.000Z");
    expect(K.wann("2026-11-08T08:15:00.000Z", jetzt)).toBe("Heute, 09:15");
    expect(K.wann("2026-11-07T08:15:00.000Z", jetzt)).toBe("Gestern, 09:15");
    expect(K.wann("2026-11-01T08:15:00.000Z", jetzt)).toBe("01.11.2026");
    expect(K.datumKurz("kaputt")).toBe("");
  });
});

describe("Demo-Assistent", () => {
  const KUERZEL = ["TP-01", "TP-02", "TP-03"];

  it("erkennt Absichten und Kürzel in vielen Schreibweisen", () => {
    expect(DEMO.kuerzelFinden("was ist mit tp 1?", KUERZEL)).toBe("TP-01");
    expect(DEMO.kuerzelFinden("TP2 bitte", KUERZEL)).toBe("TP-02");
    expect(DEMO.kuerzelFinden("3 × 10 Wdh.", KUERZEL)).toBeNull();
    const art = (t) => DEMO.absichtErkennen(t, KUERZEL).art;
    expect(art("Was wollte TP-01?")).toBe("anliegen");
    expect(art("Hausaufgaben von TP-02")).toBe("hausaufgaben");
    expect(art("Letzte Notiz von tp 3")).toBe("letzte");
    expect(art("Was steht heute an?")).toBe("heute");
    expect(art("Erstelle eine Zusammenfassung für TP-01")).toBe("bericht");
    expect(DEMO.absichtErkennen("Zusammenfassung TP-01", KUERZEL).berichtArt).toBe("zusammenfassung");
    expect(art("Welche Übung empfiehlst du?")).toBe("rat");
    expect(art("Was ist die Diagnose von TP-02?")).toBe("rat");
    expect(art("Wo sind die Standorte?")).toBe("praxis");
    expect(art("Suche in meinen Notizen: Theraband")).toBe("suche");
    expect(DEMO.absichtErkennen("Suche in meinen Notizen: Theraband", KUERZEL).suchbegriff).toBe("theraband");
    expect(art("Notiz für TP-01: Knie rechts, Flexion 100 Grad, MT 20 Minuten.")).toBe("entwurf");
    expect(art("")).toBe("unbekannt");
  });

  it("Praxis-Antworten enthalten nur Zahlen und Namen aus knowledge/physioworks.md", () => {
    for (const { text: t } of DEMO.PRAXIS) {
      for (const zahl of t.match(/\d+(?::\d+)?/g) || []) expect(WISSEN, `„${zahl}“ aus: ${t}`).toContain(zahl);
      for (const name of ["Philipp Engelhardt", "Gabi Diem", "Rebecca Pohle", "Nürnberg Ice Tigers", "info@physio-works.de"]) if (t.includes(name)) expect(WISSEN).toContain(name);
    }
  });

  it("Werkzeuge: gleiche Namen und Ergebnisformen wie im Worker", async () => {
    expect(DEMO.WERKZEUG_NAMEN).toEqual(WERKZEUGE.map((w) => w.name));
    const api = demoApi();
    const demo = DEMO.demoWerkzeuge(api);
    // dieselben Daten im Worker-Speicher
    const speicher = arbeitsspeicher();
    const { patienten } = await api.anfrage("/api/patienten");
    const zuordnung = {};
    for (const p of patienten) zuordnung[p.id] = await speicher.neuerPatient({ kuerzel: p.kuerzel, pseudonym: p.pseudonym });
    const { notizen } = await api.anfrage("/api/notizen");
    for (const n of notizen) {
      const neu = await speicher.neueNotiz({ patient_id: zuordnung[n.patient_id].id, rohtext: "x", strukturiert: normalisieren(n.strukturiert), suchtext: JSON.stringify(n.strukturiert).toLowerCase() });
      await speicher.notizAendern(neu.id, { erstellt_am: n.erstellt_am });
    }
    const worker = erstelleWerkzeuge({ speicher, strukturieren: vi.fn(), berichten: async ({ notizen: l, art }) => DEMO.demoBerichtInhalt({ notizen: l, art }) });
    const ohneIds = (x) => JSON.parse(JSON.stringify(x).replace(/"(id|notiz_id)":"[^"]+"/g, '"$1":"…"').replace(/"erstellt_am":"[^"]+"/g, '"erstellt_am":"…"'));
    for (const [name, eingabe] of [["patienten_auflisten", {}], ["notizen_suchen", { kuerzel: "TP-02" }], ["notizen_suchen", { suchbegriff: "theraband" }], ["notizen_suchen", { kuerzel: "XX-9" }], ["bericht_erstellen", { kuerzel: "TP-01", art: "verlauf" }]]) {
      const a = await demo.ausfuehren(name, eingabe, {});
      const b = await worker.ausfuehren(name, eingabe, {});
      expect(ohneIds(a.ergebnis ?? a.meldung), `${name} ${JSON.stringify(eingabe)}`).toEqual(ohneIds(b.ergebnis ?? b.meldung));
    }
    const ba = DEMO.berichtBauen({ patient: { kuerzel: "TP-01" }, notizen: [{ id: "a", erstellt_am: "2026-11-01T10:00:00Z" }], art: "verlauf", inhalt: { verlauf: [{ nr: 1, punkte: ["x"] }, { nr: 2, punkte: ["y"] }] }, erstellt: new Date("2026-11-08T10:00:00Z") });
    const bb = workerBerichtBauen({ patient: { kuerzel: "TP-01" }, notizen: [{ id: "a", erstellt_am: "2026-11-01T10:00:00Z" }], art: "verlauf", inhalt: { verlauf: [{ nr: 1, punkte: ["x"] }, { nr: 2, punkte: ["y"] }] }, erstellt: new Date("2026-11-08T10:00:00Z") });
    expect(ba).toEqual(bb);
  });

  it("feste Abläufe: gleiche Ereignisse und Texte wie die Worker-Route", async () => {
    const api = demoApi();
    const { patienten } = await api.anfrage("/api/patienten");
    const tp01 = patienten.find((p) => p.kuerzel === "TP-01");
    const demoDiktat = await ereignisse(api, { nachrichten: [{ rolle: "nutzer", text: DEMO.DIKTATE[2].rohtext }], aktion: { typ: "diktat", patient_id: tp01.id } });
    expect(demoDiktat.map((e) => e.t)).toEqual(expect.arrayContaining(["status", "entwurf", "text", "fertig"]));
    // Worker mit derselben Strukturierung (eine unklare Stelle)
    const { rufe, speicher } = neueApp({ strukturieren: async () => DEMO.DIKTATE[2].strukturiert });
    const p = await speicher.neuerPatient({ kuerzel: "TP-01", pseudonym: "" });
    const r = await rufe("/api/chat", { methode: "POST", body: { nachrichten: [{ rolle: "nutzer", text: "x" }], aktion: { typ: "diktat", patient_id: p.id } } });
    const worker = (await r.text()).trim().split("\n").map((z) => JSON.parse(z));
    expect(text(demoDiktat)).toBe(worker.find((e) => e.t === "text").d);
    expect(text(demoDiktat)).toBe(DEMO.entwurfText("TP-01", 1));
    const bericht = await ereignisse(api, { nachrichten: [{ rolle: "nutzer", text: "Bericht" }], aktion: { typ: "bericht", patient_id: tp01.id, art: "verlauf" } });
    expect(bericht.find((e) => e.t === "bericht").bericht).toMatchObject({ art: "verlauf", kuerzel: "TP-01", anzahl: 2 });
    expect(text(bericht)).toBe(DEMO.berichtText("verlauf", "TP-01", 2));
    expect(DEMO.berichtText("verlauf", "TP-01", 2)).toMatch(/Du kannst ihn als PDF/);
    expect(DEMO.berichtText("zusammenfassung", "TP-01", 1)).toMatch(/aus einer Notiz\. Du kannst sie als PDF/);
    await expect(api.chatten({ nachrichten: [{ rolle: "nutzer", text: "x" }], aktion: { typ: "diktat", patient_id: "gibts-nicht" } }, () => {})).rejects.toThrow(/nicht gefunden/);
  });

  it("Gespräch: antwortet aus den Demo-Notizen, sonst „Dazu habe ich nichts gespeichert.“", async () => {
    const api = demoApi();
    const fall = async (frage) => text(await ereignisse(api, { nachrichten: [{ rolle: "nutzer", text: frage }] }));
    expect(await fall("Was wollte TP-01?")).toMatch(/^Am \d{2}\.\d{2}\. hat \*\*TP-01\*\* gesagt:\n- Treppensteigen geht besser/);
    expect(await fall("Hausaufgaben von TP-02")).toMatch(/Pendelübungen weiter/);
    expect(await fall("Suche Hüftprothese")).toBe("Dazu habe ich nichts gespeichert.");
    expect(await fall("Welche Übung empfiehlst du für TP-03?")).toBe(DEMO.ANTWORT.rat);
    expect(await fall("Was steht heute an?")).toMatch(/Termine und Kalender sind in der Testversion noch nicht angebunden\./);
    expect(await fall("Was steht heute an?")).not.toMatch(/kommen mit/); // keine Zusage an den Kunden
    const e = await ereignisse(api, { nachrichten: [{ rolle: "nutzer", text: "Letzte Notiz von TP-02" }] });
    expect(e.find((x) => x.t === "quellen").notizen[0]).toMatchObject({ kuerzel: "TP-02" });
  });

  it("Fake-Spracherkennung: Diktat passend zum Patienten, im Gespräch eine Beispielfrage", async () => {
    const api = demoApi();
    const a = await api.anfrage("/api/transkribieren?zweck=diktat&patient=TP-02", { methode: "POST", text: "A".repeat(300) });
    expect(a.text).toBe(DEMO.DIKTATE[1].rohtext);
    const f = await api.anfrage("/api/transkribieren?zweck=frage", { methode: "POST", text: "A".repeat(300) });
    expect(f.text).toBe(DEMO.FRAGEN[0]);
    expect((await api.beispielDiktat("TP-03")).text).toBe(DEMO.DIKTATE[3].rohtext); // LWS, nicht HWS
    expect(DEMO.DIKTATE[3].rohtext).toMatch(/^Lendenwirbelsäule\. Patientin/);
    // unbekanntes Pseudonym (neuer Test-Patient): neutrales Beispiel ohne Körperregion
    await api.anfrage("/api/patienten", { methode: "POST", body: { kuerzel: "TP-09", pseudonym: "Testfall Hüfte (fiktiv)" } });
    expect((await api.beispielDiktat("TP-09")).text).toBe(DEMO.DIKTATE.at(-1).rohtext);
    expect(DEMO.DIKTATE.at(-1).rohtext).not.toMatch(/knie|schulter|wirbel|nacken|hüfte/i);
  });

  it("Smalltalk, Praxisfragen und Formulierungen wie bei der echten Gabi", async () => {
    const api = demoApi();
    const fall = async (frage) => text(await ereignisse(api, { nachrichten: [{ rolle: "nutzer", text: frage }] }));
    for (const f of ["Danke!", "Super, danke dir", "Tschüss, bis morgen", "Wie geht's dir?"]) expect(await fall(f)).not.toMatch(/nichts gespeichert/);
    expect(await fall("Danke!")).toBe(DEMO.ANTWORT.danke);
    expect(await fall("Wer ist Gabi Diem?")).toMatch(/Praxismanagerin ist Gabi Diem/);
    expect(await fall("Wer ist Gabi?")).toBe(DEMO.ANTWORT.hilfe);
    expect(await fall("Brauche ich ein Rezept?")).toMatch(/^Ob du für eine Behandlung ein Rezept brauchst, steht nicht auf der Website/);
    expect(await fall("Wann kann man bei euch trainieren?")).toMatch(/Trainingszeiten: Mo–Do 7:00–19:00/);
    expect(await fall("Welche Vereine betreut ihr?")).toMatch(/^Laut Website behandelt PhysioWorks alle/);
    expect(DEMO.absichtErkennen("Fasse TP-02 kurz zusammen", KUERZEL)).toMatchObject({ art: "bericht", berichtArt: "zusammenfassung" });
    expect(DEMO.absichtErkennen("Fass TP-01 zusammen", KUERZEL).berichtArt).toBe("zusammenfassung");
    // lange Nachricht mit „super“ ist eine Frage, kein Smalltalk
    expect(DEMO.absichtErkennen("Super, kannst du mir alle Notizen mit Theraband zeigen?", KUERZEL).art).toBe("suche");
    // Suchbegriff in der Antwort so, wie getippt
    expect(await fall("Suche Knie")).toMatch(/zu „Knie“ gefunden/);
    // Satz nach dem Entwurf passt zu „Bitte prüfen“ (keine Ziffer am Satzanfang)
    expect(DEMO.entwurfText("TP-01", 1)).toMatch(/Schau dir bitte den Punkt unter „Bitte prüfen“ an\.$/);
    expect(DEMO.entwurfText("TP-01", 2)).toMatch(/Schau dir bitte die 2 Punkte unter „Bitte prüfen“ an\.$/);
    expect(DEMO.entwurfText("TP-01", 0)).not.toMatch(/Bitte prüfen|unklar/);
  });
});

describe("Bericht-PDF", () => {
  const seitenText = (doc, seite) => [...doc.internal.pages[seite].join("\n").matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((m) => m[1].replace(/\\([()\\])/g, "$1").replace(/\x96/g, "–").replace(/\x95/g, "•")).join("\n");
  const bericht = {
    art: "verlauf", titel: "Verlaufsbericht", kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)", erstellt_am: "2026-11-08T10:00:00.000Z",
    von: "2026-10-30T07:30:00.000Z", bis: "2026-11-06T15:10:00.000Z", anzahl: 2,
    zusammenfassung: ["Treppensteigen geht besser", "Flexion bis 110°"],
    verlauf: [{ notiz_id: "a", datum: "2026-10-30T07:30:00.000Z", punkte: ["Flexion bis 90°"] }, { notiz_id: "b", datum: "2026-11-06T15:10:00.000Z", punkte: ["Wandsitzen 3 × 15 (unklar)"] }],
    hausaufgaben: ["Bridging 3 × 15 Wdh., täglich"], offen: ["„dreimal fünfzehn“ unklar"],
  };

  it("Kopf, Zeitraum, Verlauf mit Datum, Hausaufgaben, offene Punkte, Fuß „Testversion – Testdaten“", () => {
    const doc = PDF.berichtErstellen(bericht, { jsPDF });
    expect(doc.getNumberOfPages()).toBe(1);
    const t = seitenText(doc, 1);
    for (const teil of ["PhysioWorks", "Verlaufsbericht", "TP-01", "30.10.2026 – 06.11.2026", "Zusammenfassung", "Verlauf", "Aktuelle Hausaufgaben", "Offene Punkte", "Gabi ergänzt keine eigenen Diagnosen", "Wandsitzen 3 × 15 (unklar)", "Testversion – Testdaten", "Seite 1 von 1"]) {
      expect(t).toContain(teil);
    }
    expect(PDF.berichtDateiname(bericht)).toBe("PhysioWorks_Bericht_TP-01_2026-11-08.pdf");
    const zus = PDF.berichtErstellen({ ...bericht, art: "zusammenfassung", titel: "Zusammenfassung", verlauf: [] }, { jsPDF });
    expect(seitenText(zus, 1)).not.toMatch(/^Verlauf$/m);
    expect(PDF.berichtDateiname({ ...bericht, art: "zusammenfassung" })).toBe("PhysioWorks_Zusammenfassung_TP-01_2026-11-08.pdf");
  });
});
