// v2.5 – (A) „Bitte prüfen“ erledigbar, (B) Notiz per Gespräch ändern.
// Status-Logik (Häkchen, automatisch erledigt, wieder offen), Zusammenführen bei zwei Tabs, Änderungsvorschlag (prüfen,
// anwenden, Konflikt), Worker-Routen und -Werkzeug, Claude-Weg gegen die nachgebaute API, Prompt-Regeln, Demo-Modus.
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { neueApp } from "./hilfen.js";
import { BRAIN_PROMPT, CHAT_PROMPT, WERKZEUGE, claudeChat, erstelleWerkzeuge } from "../src/chat.js";
import { normalisieren } from "../src/notiz.js";
import { arbeitsspeicher } from "../src/speicher.js";

const require = createRequire(import.meta.url);
const NL = require("../../notizlogik.js");
const DEMO = require("../../demo.js");
const K = require("../../kern.js");
const G = require("../../gespraeche.js");

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TP03 = {
  befund: ["ISG links oder rechts (unklar) etwas blockiert"],
  massnahmen: ["Mobilisation ISG", "Rumpfstabilisation, Unterarmstütz 3 × 20 s"],
  verlauf: [], hausaufgaben: ["Unterarmstütz täglich (ergänzend)"],
  unklar: ["Widerspruch: ISG links oder rechts blockiert", "„Isg“ als „ISG“ gelesen"],
};
const TP01 = {
  befund: ["Flexion Knie rechts bis 110°, Extension 0°"],
  massnahmen: ["Gangschule ohne Unterarmgehstützen", "Beinpresse 30 kg, 3 × 12 Wdh."],
  verlauf: ["Pat.: Treppensteigen geht besser"],
  hausaufgaben: ["Bridging 3 × 15 Wdh., täglich", "Wandsitzen 3 × 15 (unklar), täglich"],
  unklar: ["„dreimal fünfzehn“ beim Wandsitzen unklar (Sekunden oder Wiederholungen)"],
};
const zaehler = (s) => { const st = NL.status(s); return `${st.erledigt}/${st.gesamt}`; };
const ersetze = (s, ab, i, text) => ({ ...s, [ab]: s[ab].map((z, j) => (j === i ? text : z)) });

// ---------------------------------------------------------------------------------------------------------------
describe("(A) Status-Logik der Prüfliste", () => {
  it("bestehende Notizen ohne Status bleiben gültig: alle Punkte offen", () => {
    expect(NL.status(TP03)).toEqual({ punkte: [
      { punkt: TP03.unklar[0], erledigt: false, manuell: false, auto: false },
      { punkt: TP03.unklar[1], erledigt: false, manuell: false, auto: false },
    ], erledigt: 0, gesamt: 2 });
    expect(NL.status({ befund: ["x"] })).toEqual({ punkte: [], erledigt: 0, gesamt: 0 });
    expect(normalisieren(TP03)).not.toHaveProperty("pruefung"); // ohne Status sieht die Notiz aus wie bisher
  });

  it("Stellen zuordnen: Widerspruch → markierte Zeile; Korrekturmeldung („… als … gelesen“) hat keine Stelle", () => {
    const s = NL.mitStellen(TP03);
    expect(s.pruefung).toEqual([{ punkt: TP03.unklar[0], erledigt: false, stelle: { abschnitt: "befund", ausschnitt: "links oder rechts (unklar)", woerter: ["isg", "links", "rechts", "blockiert"] } }]);
    expect(NL.istKorrekturMeldung(TP03.unklar[1])).toBe(true);
    const t = NL.mitStellen(TP01);
    expect(t.pruefung[0].stelle).toMatchObject({ abschnitt: "hausaufgaben", ausschnitt: "3 × 15 (unklar)" });
  });

  it("automatisch erledigt: Markierung entfernt oder Zeile umgeschrieben – wieder unklar gesetzt: wieder offen", () => {
    const s = NL.mitStellen(TP01);
    expect(zaehler(s)).toBe("0/1");
    const ohneMarke = ersetze(s, "hausaufgaben", 1, "Wandsitzen 3 × 15 s, täglich");
    expect(NL.status(ohneMarke).punkte[0]).toMatchObject({ erledigt: true, auto: true, manuell: false });
    const umgeschrieben = ersetze(s, "hausaufgaben", 1, "Wandsitz 45 s (unklar)"); // Schlüsselwort weg, Ausschnitt weg
    expect(NL.status(umgeschrieben).punkte[0].erledigt).toBe(true);
    const wieder = ersetze(ohneMarke, "hausaufgaben", 1, "Wandsitzen 3 × 15 (unklar), täglich");
    expect(NL.status(wieder).punkte[0]).toMatchObject({ erledigt: false, auto: false });
    const andersMarkiert = ersetze(ohneMarke, "hausaufgaben", 1, "Wandsitzen 3 × 15 s (unklar), täglich"); // Stelle wieder unklar
    expect(NL.status(andersMarkiert).punkte[0].erledigt).toBe(false);
    const andereStelle = ersetze(s, "hausaufgaben", 0, "Bridging 3 × 20 Wdh., täglich"); // andere Zeile geändert
    expect(NL.status(andereStelle).punkte[0].erledigt).toBe(false);
  });

  it("Häkchen von Hand: setzen, entfernen; zusammen mit automatisch zählt jeder Punkt einmal", () => {
    let s = NL.mitStellen(TP03);
    s = NL.setzen(s, TP03.unklar[1], true);
    expect(zaehler(s)).toBe("1/2");
    expect(NL.status(s).punkte[1]).toMatchObject({ erledigt: true, manuell: true, auto: false });
    s = ersetze(s, "befund", 0, "ISG links etwas blockiert");
    expect(zaehler(s)).toBe("2/2");
    s = NL.setzen(s, TP03.unklar[1], false);
    expect(zaehler(s)).toBe("1/2");
    expect(NL.offenePunkte(s)).toEqual([TP03.unklar[1]]);
    expect(NL.erledigtePunkte(s)).toEqual([TP03.unklar[0]]);
    expect(NL.setzen(s, "gibt es nicht", true).pruefung).toEqual(s.pruefung); // unbekannter Punkt: nichts
  });

  it("Bereinigen: nur Punkte aus unklar, je Punkt einmal, Stellen geprüft, leere Einträge weg; Worker normalisiert genauso", () => {
    const roh = [
      { punkt: TP03.unklar[1], erledigt: true },
      { punkt: TP03.unklar[1], erledigt: false },
      { punkt: "fremd", erledigt: true },
      { punkt: TP03.unklar[0], erledigt: "ja", stelle: { abschnitt: "unklar", ausschnitt: "x (unklar)" } },
      { punkt: TP03.unklar[0], erledigt: false },
      "Unsinn", null,
    ];
    expect(NL.pruefungNormalisieren(roh, TP03.unklar)).toEqual([{ punkt: TP03.unklar[1], erledigt: true }]);
    expect(normalisieren({ ...TP03, pruefung: roh }).pruefung).toEqual([{ punkt: TP03.unklar[1], erledigt: true }]);
    expect(DEMO.normalisieren({ ...TP03, pruefung: roh }).pruefung).toEqual([{ punkt: TP03.unklar[1], erledigt: true }]);
  });

  it("zwei Tabs: Häkchen dreiseitig zusammenführen – was dieser Tab geändert hat, gilt; sonst das Gespeicherte", () => {
    const basis = NL.mitStellen(TP03); // beide Tabs haben diesen Stand geladen
    const tabA = NL.setzen(basis, TP03.unklar[1], true); // A hakt Punkt 2 ab und hat gespeichert
    const tabB = { ...NL.setzen(basis, TP03.unklar[0], true) }; // B hakt Punkt 1 ab, kennt A nicht
    const ergebnis = NL.zusammenfuehren({ basis, lokal: tabB, server: tabA });
    expect(ergebnis.map((e) => [e.punkt, e.erledigt])).toEqual([[TP03.unklar[0], true], [TP03.unklar[1], true]]);
    // A entfernt ein Häkchen, B ändert daran nichts → bleibt entfernt
    const mitBeiden = { ...basis, pruefung: ergebnis };
    const aEntfernt = NL.setzen(mitBeiden, TP03.unklar[1], false);
    expect(NL.zusammenfuehren({ basis: mitBeiden, lokal: mitBeiden, server: aEntfernt }).find((e) => e.punkt === TP03.unklar[1])).toBeUndefined();
    // beide ändern denselben Punkt: dieser Tab gewinnt
    expect(NL.zusammenfuehren({ basis: mitBeiden, lokal: NL.setzen(mitBeiden, TP03.unklar[0], false), server: mitBeiden }).find((e) => e.punkt === TP03.unklar[0])).toMatchObject({ erledigt: false });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("(A) Worker-Routen: Häkchen speichern, zusammenführen, alte Oberfläche", () => {
  async function mitNotiz(strukturiert = TP03) {
    const w = neueApp();
    const p = await (await w.rufe("/api/patienten", { methode: "POST", body: { kuerzel: "TP-03", pseudonym: "Test" } })).json();
    const r = await w.rufe("/api/notizen", { methode: "POST", body: { patient_id: p.patient.id, rohtext: "LWS Diktat", strukturiert } });
    return { ...w, notiz: (await r.json()).notiz };
  }
  const patch = (w, id, body) => w.rufe(`/api/notizen/${id}`, { methode: "PATCH", body });

  it("neue Notiz: die markierten Stellen sind gleich zugeordnet", async () => {
    const { notiz } = await mitNotiz();
    expect(notiz.strukturiert.pruefung).toEqual([expect.objectContaining({ punkt: TP03.unklar[0], erledigt: false, stelle: expect.objectContaining({ abschnitt: "befund" }) })]);
  });

  it("Häkchen setzen: nur dieser Punkt, Inhalt, Diktat und „bearbeitet“ bleiben; unbekannter Punkt 409, fehlende Notiz 404, falsche Angabe 400", async () => {
    const w = await mitNotiz();
    const r = await patch(w, w.notiz.id, { pruefpunkt: { punkt: TP03.unklar[1], erledigt: true } });
    expect(r.status).toBe(200);
    const n = (await r.json()).notiz;
    expect(NL.status(n.strukturiert).erledigt).toBe(1);
    expect(n.rohtext).toBe("LWS Diktat");
    expect(n.geaendert_am).toBeNull();
    expect(n.strukturiert.befund).toEqual(TP03.befund);
    expect((await patch(w, w.notiz.id, { pruefpunkt: { punkt: "weg", erledigt: true } })).status).toBe(409);
    expect((await patch(w, "7e3c1a52-0000-4000-8000-000000000999", { pruefpunkt: { punkt: TP03.unklar[1], erledigt: true } })).status).toBe(404);
    expect((await patch(w, w.notiz.id, { pruefpunkt: { punkt: TP03.unklar[1], erledigt: "ja" } })).status).toBe(400);
  });

  it("zwei Tabs: A hakt ab (Häkchen-Route), B bearbeitet mit altem Stand – A's Häkchen bleibt, B's Korrektur erledigt den Widerspruch", async () => {
    const w = await mitNotiz();
    const geladen = w.notiz.strukturiert; // beide Tabs
    await patch(w, w.notiz.id, { pruefpunkt: { punkt: TP03.unklar[1], erledigt: true } }); // Tab A
    const b = { ...geladen, befund: ["ISG links etwas blockiert"] }; // Tab B korrigiert den Text
    const r = await patch(w, w.notiz.id, { strukturiert: b, pruefung_basis: geladen.pruefung || [] });
    const n = (await r.json()).notiz;
    expect(NL.status(n.strukturiert).punkte.map((p) => [p.erledigt, p.auto])).toEqual([[true, true], [true, false]]);
    expect(n.rohtext).toBe("LWS Diktat"); // das Original-Diktat bleibt
  });

  it("ältere Oberfläche (ohne pruefung und pruefung_basis) behält die gespeicherten Häkchen", async () => {
    const w = await mitNotiz();
    await patch(w, w.notiz.id, { pruefpunkt: { punkt: TP03.unklar[1], erledigt: true } });
    const { pruefung, ...alt } = w.notiz.strukturiert; // so schickt v2.4 die Notiz
    const n = (await (await patch(w, w.notiz.id, { strukturiert: { ...alt, verlauf: ["neu"] } })).json()).notiz;
    expect(NL.status(n.strukturiert).punkte[1]).toMatchObject({ erledigt: true, manuell: true });
    expect(n.strukturiert.verlauf).toEqual(["neu"]);
  });

  it("Demo-API (Browser) verhält sich wie der Worker", async () => {
    const api = DEMO.erstelleApi({ ablage: DEMO.speicherAblage(), verzoegerung: false });
    const id = DEMO.NOTIZEN.find((n) => n.kuerzel === "TP-03" && n.strukturiert.unklar.length).id;
    const { notiz: geladen } = await api.anfrage(`/api/notizen/${id}`);
    await api.anfrage(`/api/notizen/${id}`, { methode: "PATCH", body: { pruefpunkt: { punkt: TP03.unklar[1], erledigt: true } } });
    const { notiz } = await api.anfrage(`/api/notizen/${id}`, { methode: "PATCH", body: { strukturiert: { ...NL.mitStellen(geladen.strukturiert), befund: ["ISG links etwas blockiert"] }, pruefung_basis: geladen.strukturiert.pruefung || [] } });
    expect(NL.status(notiz.strukturiert).erledigt).toBe(2);
    await expect(api.anfrage(`/api/notizen/${id}`, { methode: "PATCH", body: { pruefpunkt: { punkt: "weg", erledigt: true } } })).rejects.toMatchObject({ status: 409 });
  });

  it("Claude sieht nur offene Prüfpunkte als „unklar“, erledigte getrennt – auch im Tagesüberblick", async () => {
    const speicher = arbeitsspeicher();
    const p = await speicher.neuerPatient({ kuerzel: "TP-03", pseudonym: "" });
    const s = NL.setzen(NL.mitStellen(normalisieren(TP03)), TP03.unklar[1], true);
    const n = await speicher.neueNotiz({ patient_id: p.id, rohtext: "", strukturiert: normalisieren(s), suchtext: "tp-03" });
    const w = erstelleWerkzeuge({ speicher, strukturieren: vi.fn() });
    const gelesen = JSON.parse((await w.ausfuehren("notiz_lesen", { id: n.id }, {})).inhalt);
    expect(gelesen.unklar).toEqual([TP03.unklar[0]]);
    expect(gelesen.unklar_erledigt).toEqual([TP03.unklar[1]]);
    const heute = JSON.parse((await w.ausfuehren("heute_ueberblick", {}, {})).inhalt);
    expect(heute.offene_unklare_stellen_letzte_7_tage.map((o) => o.punkt)).toEqual([TP03.unklar[0]]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("(B) Änderungsvorschlag: prüfen und anwenden", () => {
  it("nur Zeilen, die wörtlich in der Notiz stehen; nur die vier Abschnitte; höchstens 5; nichts Leeres oder Gleiches", () => {
    const gut = NL.aenderungPruefen(TP01, [{ abschnitt: "befund", vorher: "Flexion Knie rechts bis 110°, Extension 0°", nachher: "Flexion Knie rechts bis 115°, Extension 0°" }]);
    expect(gut.aenderungen).toHaveLength(1);
    expect(NL.aenderungPruefen(TP01, [{ abschnitt: "befund", vorher: "Flexion bis 110°", nachher: "x" }]).fehler).toMatch(/steht so nicht/);
    expect(NL.aenderungPruefen(TP01, [{ abschnitt: "unklar", vorher: TP01.unklar[0], nachher: "" }]).fehler).toMatch(/nicht „Bitte prüfen“ und nicht das Original-Diktat/);
    expect(NL.aenderungPruefen(TP01, [{ abschnitt: "rohtext", vorher: "", nachher: "x" }]).fehler).toBeTruthy();
    expect(NL.aenderungPruefen(TP01, Array(6).fill({ abschnitt: "verlauf", vorher: "", nachher: "x" })).fehler).toMatch(/Höchstens 5/);
    expect(NL.aenderungPruefen(TP01, [{ abschnitt: "verlauf", vorher: "", nachher: "" }]).fehler).toMatch(/Leer/);
    expect(NL.aenderungPruefen(TP01, [{ abschnitt: "verlauf", vorher: TP01.verlauf[0], nachher: TP01.verlauf[0] }]).fehler).toMatch(/gleich/);
    expect(NL.aenderungPruefen(TP01, [{ abschnitt: "verlauf", vorher: "", nachher: "a\nb" }]).fehler).toMatch(/genau eine Zeile/);
    expect(NL.aenderungPruefen(TP01, [])).toHaveProperty("fehler");
    expect(NL.aenderungPruefen(TP01, "Flexion 115")).toHaveProperty("fehler");
  });

  it("anwenden: ersetzen, neu, entfernen – alles andere bleibt genau so; Konflikt, wenn die Zeile inzwischen fehlt", () => {
    const s = NL.mitStellen(TP01);
    const a = [
      { abschnitt: "massnahmen", vorher: "Beinpresse 30 kg, 3 × 12 Wdh.", nachher: "Beinpresse 35 kg, 3 × 12 Wdh." },
      { abschnitt: "verlauf", vorher: "", nachher: "Nächster Termin: Kreisel" },
      { abschnitt: "massnahmen", vorher: "Gangschule ohne Unterarmgehstützen", nachher: "" },
    ];
    const { strukturiert } = NL.aenderungAnwenden(s, a);
    expect(strukturiert.massnahmen).toEqual(["Beinpresse 35 kg, 3 × 12 Wdh."]);
    expect(strukturiert.verlauf).toEqual(["Pat.: Treppensteigen geht besser", "Nächster Termin: Kreisel"]);
    for (const k of ["befund", "hausaufgaben", "unklar", "pruefung"]) expect(strukturiert[k]).toEqual(s[k]);
    expect(NL.aenderungAnwenden({ ...s, massnahmen: ["Beinpresse 40 kg"] }, a)).toEqual({ konflikt: "Beinpresse 30 kg, 3 × 12 Wdh." });
  });

  it("Vorher/Nachher für die Karte: unveränderte Zeilen „gleich“, geänderte mit wortweisem Unterschied", () => {
    const v = NL.vorherNachher(TP01, [{ abschnitt: "massnahmen", vorher: "Beinpresse 30 kg, 3 × 12 Wdh.", nachher: "Beinpresse 35 kg, 3 × 12 Wdh." }]);
    expect(v).toEqual([{ abschnitt: "massnahmen", zeilen: [
      { art: "gleich", text: "Gangschule ohne Unterarmgehstützen" },
      { art: "geaendert", vorher: "Beinpresse 30 kg, 3 × 12 Wdh.", nachher: "Beinpresse 35 kg, 3 × 12 Wdh.", diff: { vorn: "Beinpresse ", alt: "30", neu: "35", hinten: " kg, 3 × 12 Wdh." } },
    ] }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
function sse(bloecke, stop) {
  const ev = [{ type: "message_start", message: { id: `msg_${Math.random()}`, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }];
  bloecke.forEach((b, index) => {
    if (b.type === "text") {
      ev.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      ev.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } });
    } else {
      ev.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      ev.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    ev.push({ type: "content_block_stop", index });
  });
  ev.push({ type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } }, { type: "message_stop" });
  return new Response(ev.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("(B) Werkzeug notiz_aenderung_vorschlagen (Worker) und der Claude-Weg gegen die nachgebaute API", () => {
  async function daten() {
    const speicher = arbeitsspeicher();
    const p = await speicher.neuerPatient({ kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)" });
    const n = await speicher.neueNotiz({ patient_id: p.id, rohtext: "Knie rechts, Beinpresse dreißig Kilo", strukturiert: normalisieren(TP01), suchtext: "tp-01" });
    return { speicher, n };
  }

  it("zeigt Vorher/Nachher als Karte, liest nur, speichert nichts; falsche Angaben gehen als Fehler an Claude zurück", async () => {
    const { speicher, n } = await daten();
    const spion = vi.spyOn(speicher, "notizAendern");
    const w = erstelleWerkzeuge({ speicher, strukturieren: vi.fn() });
    const ereignisse = [];
    const r = await w.ausfuehren("notiz_aenderung_vorschlagen", { id: n.id, aenderungen: [{ abschnitt: "massnahmen", vorher: "Beinpresse 30 kg, 3 × 12 Wdh.", nachher: "Beinpresse 35 kg, 3 × 12 Wdh." }] }, { senden: (e) => ereignisse.push(e) });
    expect(r.fehler).toBe(false);
    expect(JSON.parse(r.inhalt)).toMatchObject({ angezeigt: true, gespeichert: false, kuerzel: "TP-01", aenderungen: 1 });
    const karte = ereignisse.find((e) => e.t === "aenderung").aenderung;
    expect(karte).toMatchObject({ notiz_id: n.id, kuerzel: "TP-01", abschnitte: { massnahmen: TP01.massnahmen }, aenderungen: [{ abschnitt: "massnahmen", vorher: "Beinpresse 30 kg, 3 × 12 Wdh.", nachher: "Beinpresse 35 kg, 3 × 12 Wdh." }] });
    expect(karte).not.toHaveProperty("rohtext");
    expect(spion).not.toHaveBeenCalled();
    expect((await speicher.notiz(n.id)).strukturiert.massnahmen).toEqual(TP01.massnahmen);
    for (const [eingabe, muster] of [
      [{ id: n.id, aenderungen: [{ abschnitt: "massnahmen", vorher: "Beinpresse 30", nachher: "Beinpresse 35" }] }, /steht so nicht/],
      [{ id: "7e3c1a52-0000-4000-8000-000000000999", aenderungen: [{ abschnitt: "befund", vorher: "", nachher: "x" }] }, /gibt es nicht/],
      [{ id: "keine", aenderungen: [] }, /Ungültige Notiz-id/],
      [{ id: n.id, aenderungen: [{ abschnitt: "unklar", vorher: TP01.unklar[0], nachher: "" }] }, /Bitte prüfen/],
    ]) {
      const f = await w.ausfuehren("notiz_aenderung_vorschlagen", eingabe, {});
      expect(f.fehler, JSON.stringify(eingabe)).toBe(true);
      expect(f.meldung).toMatch(muster);
    }
  });

  it("höchstens 3 Vorschläge je Nachricht", async () => {
    const { speicher, n } = await daten();
    const w = erstelleWerkzeuge({ speicher, strukturieren: vi.fn() });
    const e = { id: n.id, aenderungen: [{ abschnitt: "verlauf", vorher: "", nachher: "Neu" }] };
    for (let i = 0; i < 3; i++) expect((await w.ausfuehren("notiz_aenderung_vorschlagen", e, {})).fehler).toBe(false);
    expect((await w.ausfuehren("notiz_aenderung_vorschlagen", e, {})).meldung).toMatch(/höchstens 3/);
  });

  it("Claude-Weg (nachgebaut): Claude ruft das Werkzeug, die Karte kommt an, kein „Dazu habe ich nichts gespeichert“", async () => {
    const { speicher, n } = await daten();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sse([{ type: "tool_use", id: "toolu_1", name: "notiz_aenderung_vorschlagen", input: { id: n.id, aenderungen: [{ abschnitt: "befund", vorher: TP01.befund[0], nachher: "Flexion Knie rechts bis 115°, Extension 0°" }] } }], "tool_use"))
      .mockResolvedValueOnce(sse([], "end_turn"));
    vi.stubGlobal("fetch", fetchMock);
    const ereignisse = [];
    await claudeChat({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_MODELL: "claude-opus-5-5", ANTHROPIC_EFFORT: "low" })({
      verlauf: [{ role: "user", content: "Ändere bei TP-01 die Flexion auf 115 Grad." }], werkzeuge: erstelleWerkzeuge({ speicher, strukturieren: vi.fn() }),
      kontext: { letzte: "Ändere bei TP-01 die Flexion auf 115 Grad." }, senden: (e) => ereignisse.push(e), jetzt: new Date("2026-11-15T10:00:00Z"),
    });
    expect(ereignisse.map((e) => e.t)).toEqual(["status", "quellen", "aenderung"]);
    expect(ereignisse[2].aenderung.aenderungen[0].nachher).toBe("Flexion Knie rechts bis 115°, Extension 0°");
    const zweite = JSON.parse(fetchMock.mock.calls[1][1].body);
    const ergebnis = zweite.messages.at(-1).content.find((b) => b.type === "tool_result");
    expect(JSON.parse(ergebnis.content)).toMatchObject({ angezeigt: true, gespeichert: false });
    expect((await speicher.notiz(n.id)).strukturiert.befund).toEqual(TP01.befund); // nichts gespeichert
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("Prompt-Regeln: nur Gesagtes ändern, nachfragen, nichts erfinden, kein Geschlecht, nichts speichern oder löschen", () => {
  for (const [name, prompt] of [["CHAT_PROMPT", CHAT_PROMPT], ["BRAIN_PROMPT", BRAIN_PROMPT]]) {
    it(name, () => {
      const p = prompt.replace(/\s+/g, " ");
      for (const satz of [
        "Ändere nur genau das, was gesagt wurde.",
        "du ergänzt nichts, formulierst nichts um und änderst keine weiteren Zeilen. Kein Geschlecht, keine Werte, die nicht genannt wurden.",
        "frag nach, welche gemeint ist – mit Datum und der Zeile –, statt zu raten.",
        "(„mach es besser“, „korrigier das mal“), änderst du nichts",
        "Das Original-Diktat und „Bitte prüfen“ änderst du nie. Ein Vorschlag ist kein Speichern.",
        "Du speicherst nichts selbst. Du löschst auch nichts.",
        "Nie etwas erfinden: keine Werte, Daten, Termine, Namen, Übungen oder Inhalte.",
        "Also nie Geschlecht, Alter oder Beruf ergänzen",
        "Deutsch, du duzt, kurz und freundlich",
        "Keine Diagnosen",
      ]) expect(p, satz).toContain(satz);
    });
  }
  it("kein Werkzeug schreibt: nur lesen und vorschlagen", () => {
    for (const w of WERKZEUGE) expect(w.name).toMatch(/^(patienten_auflisten|notizen_suchen|notiz_lesen|heute_ueberblick|notiz_entwurf_erstellen|notiz_aenderung_vorschlagen|bericht_erstellen)$/);
    const t = WERKZEUGE.find((w) => w.name === "notiz_aenderung_vorschlagen");
    expect(t.description).toContain("Speichert NICHT");
    expect(t.input_schema.properties.aenderungen.items.properties.abschnitt.enum).toEqual(["befund", "massnahmen", "verlauf", "hausaufgaben"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("Demo-Modus: vorbereitete Antworten ohne KI", () => {
  const api = () => DEMO.erstelleApi({ ablage: DEMO.speicherAblage(), verzoegerung: false });
  async function frage(a, text) {
    const e = [];
    await a.chatten({ nachrichten: [{ rolle: "nutzer", text }] }, (x) => e.push(x));
    return { text: e.filter((x) => x.t === "text").map((x) => x.d).join(""), karte: (e.find((x) => x.t === "aenderung") || {}).aenderung };
  }

  it("Absicht erkennen: konkret, mit Datum, „letzte Notiz“, vage, ohne Kürzel – und keine Fehlalarme", () => {
    const k = ["TP-01", "TP-02", "TP-03"];
    expect(DEMO.absichtErkennen("Ändere bei TP-01 die Flexion auf 110 Grad.", k)).toMatchObject({ art: "aenderung", kuerzel: "TP-01", begriff: "Flexion", wert: "110", einheit: "grad" });
    expect(DEMO.absichtErkennen("Ändere bei TP-01 in der Notiz vom 6.11. die Flexion auf 100 Grad", k)).toMatchObject({ art: "aenderung", tag: "06.11." });
    expect(DEMO.absichtErkennen("Korrigier in der letzten Notiz von TP-03 den Finger-Boden-Abstand auf 12 cm", k)).toMatchObject({ art: "aenderung", neueste: true, begriff: "Finger-Boden-Abstand" });
    expect(DEMO.absichtErkennen("Mach es besser", k)).toMatchObject({ art: "aenderung_vage" });
    expect(DEMO.absichtErkennen("Kannst du die Notiz von TP-02 überarbeiten?", k)).toMatchObject({ art: "aenderung_vage", kuerzel: "TP-02" });
    expect(DEMO.absichtErkennen("Ändere die Flexion auf 110 Grad", k)).toMatchObject({ art: "aenderung", kuerzel: null });
    for (const t of ["Was wollte TP-01?", "Letzte Notiz von TP-01", "Wurde die Flexion auf 110 Grad gesteigert bei TP-01?", "Hausaufgaben von TP-02", "Was soll ich bei TP-01 ändern?"]) {
      expect(DEMO.absichtErkennen(t, k).art, t).not.toMatch(/^aenderung/);
    }
  });

  it("mehrdeutig (zwei Notizen mit „Flexion“): fragt mit Datum und Zeile nach, keine Karte", async () => {
    const r = await frage(api(), "Ändere bei TP-01 die Flexion auf 110 Grad.");
    expect(r.karte).toBeUndefined();
    expect(r.text).toMatch(/steht „Flexion“ in 2 Notizen/);
    expect(r.text).toMatch(/Welche meinst du\?/);
    expect(r.text).toContain(DEMO.VORBEREITET);
  });

  it("konkret und eindeutig: Karte mit genau der genannten Änderung – der Rest der Zeile bleibt wörtlich", async () => {
    const r = await frage(api(), "Ändere bei TP-01 in der letzten Notiz die Flexion auf 115 Grad");
    expect(r.karte.aenderungen).toEqual([{ abschnitt: "befund", vorher: "Flexion Knie rechts bis 110°, Extension 0°", nachher: "Flexion Knie rechts bis 115°, Extension 0°" }]);
    expect(r.text).toMatch(/Gespeichert wird erst, wenn du auf „Übernehmen“ tippst/);
    expect(r.text).toContain("Vorbereitete Antwort ohne KI (Demo-Modus).");
  });

  it("vage („mach es besser“): freundlich ablehnen und nachfragen; ohne Kürzel: nach dem Kürzel fragen; unbekannt: sagen", async () => {
    const a = api();
    const vage = await frage(a, "Mach es besser");
    expect(vage.karte).toBeUndefined();
    expect(vage.text).toMatch(/^Das ändere ich so nicht/);
    expect(vage.text).toMatch(/Was genau soll wie geändert werden\?/);
    expect((await frage(a, "Ändere die Flexion auf 110 Grad")).text).toMatch(/Bei welchem Test-Patienten\?/);
    expect((await frage(a, "Ändere bei TP-02 die Pronation auf 10 Grad")).text).toMatch(/finde ich „Pronation“ nicht/);
    expect((await frage(a, "Ändere bei TP-01 in der letzten Notiz die Flexion auf 110 Grad")).text).toMatch(/steht schon „Flexion Knie rechts bis 110°, Extension 0°“ – da ändere ich nichts/);
  });

  it("keine Angaben zum Geschlecht in den vorbereiteten Antworten", async () => {
    const a = api();
    for (const t of ["Ändere bei TP-01 die Flexion auf 110 Grad.", "Ändere bei TP-01 die Beinpresse auf 35 kg", "Mach es besser"]) {
      expect((await frage(a, t)).text).not.toMatch(/\b(Patientin|Patient|sie|er|ihr|ihm|seine?|ihre?)\b/);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("Gesprächsverlauf und zwei Tabs: Änderungskarte", () => {
  it("Gabi kennt die Karte im weiteren Gespräch (App-Hinweis mit Zustand)", () => {
    const karte = { typ: "aenderung", kuerzel: "TP-01", aenderungen: [{ abschnitt: "befund", vorher: "Flexion 110°", nachher: "Flexion 115°" }] };
    expect(K.karteAlsText(karte)).toBe("[App-Hinweis: Änderungsvorschlag für TP-01 angezeigt (noch nicht übernommen) – befund: „Flexion 110°“ → „Flexion 115°“]");
    expect(K.karteAlsText({ ...karte, uebernommen: "id" })).toContain("(übernommen)");
    expect(K.karteAlsText({ ...karte, verworfen: true })).toContain("(verworfen)");
  });
  it("Endzustände (übernommen/verworfen/gelöscht/veraltet) gehen beim Zusammenführen nicht verloren", () => {
    const ziel = [{ id: "n1", karten: [{ id: "k1", typ: "aenderung" }] }];
    const quelle = [{ id: "n1", karten: [{ id: "k1", typ: "aenderung", uebernommen: "notiz-1" }] }];
    expect(G.endzustaendeUebernehmen(ziel, quelle)).toHaveLength(1);
    expect(ziel[0].karten[0].uebernommen).toBe("notiz-1");
  });
});
