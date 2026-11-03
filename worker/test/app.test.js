import { describe, expect, it, vi, afterEach } from "vitest";
import { erstelleApp } from "../src/app.js";
import { arbeitsspeicher, supabaseSpeicher } from "../src/speicher.js";
import { claudeStrukturierung } from "../src/strukturierung.js";
import { bereinigen, whisperTranskription } from "../src/transkription.js";
import { kuerzelPruefen, normalisieren, suchwoerter } from "../src/notiz.js";

const CODE = "test-zugang-123";
const ENV = { GABI_ZUGANGSCODE: CODE, ERLAUBTE_ORIGINS: "https://gabi.automatilabs.de", AI: {} };
const AUDIO = "UklGR".padEnd(400, "A");

function neueApp(extra = {}) {
  const speicher = arbeitsspeicher();
  const transkribieren = vi.fn(async () => "Knie rechts Flexion bis 90 Grad");
  const strukturieren = vi.fn(async () => normalisieren({ befund: ["Flexion Knie rechts bis 90°"], massnahmen: ["MT 20 min"] }));
  const app = erstelleApp({ speicher, transkribieren, strukturieren, ...extra });
  const rufe = (pfad, { methode = "GET", body, code = CODE, origin, env = ENV, roh } = {}) => {
    const headers = {};
    if (code !== null) headers["X-Gabi-Zugang"] = code;
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return app(new Request(`https://api.test${pfad}`, { method: methode, headers, body: roh ?? (body === undefined ? undefined : JSON.stringify(body)) }), env);
  };
  return { app, rufe, speicher, transkribieren, strukturieren };
}

afterEach(() => vi.unstubAllGlobals());

describe("Zugang und CORS", () => {
  it("Status ohne Code, zeigt nur Ja/Nein", async () => {
    const { rufe } = neueApp();
    const r = await rufe("/api/status", { code: null });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.eingerichtet).toEqual({ zugang: true, anthropic: false, supabase: false, spracherkennung: true });
  });
  it("ohne oder mit falschem Code: 401", async () => {
    const { rufe } = neueApp();
    expect((await rufe("/api/patienten", { code: null })).status).toBe(401);
    expect((await rufe("/api/patienten", { code: "falsch" })).status).toBe(401);
    expect((await rufe("/api/pruefen")).status).toBe(200);
  });
  it("ohne eingerichteten Code: 503 (geschlossen)", async () => {
    const { rufe } = neueApp();
    const r = await rufe("/api/patienten", { env: { ...ENV, GABI_ZUGANGSCODE: "" } });
    expect(r.status).toBe(503);
  });
  it("CORS nur für erlaubte Origins", async () => {
    const { rufe } = neueApp();
    const gut = await rufe("/api/pruefen", { origin: "https://gabi.automatilabs.de" });
    expect(gut.headers.get("Access-Control-Allow-Origin")).toBe("https://gabi.automatilabs.de");
    const boese = await rufe("/api/pruefen", { origin: "https://boese.example" });
    expect(boese.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const vorab = await rufe("/api/notizen", { methode: "OPTIONS", origin: "https://gabi.automatilabs.de", code: null });
    expect(vorab.status).toBe(204);
    expect(vorab.headers.get("Access-Control-Allow-Headers")).toContain("X-Gabi-Zugang");
  });
});

describe("Patienten", () => {
  it("legt Test-Patienten an, lehnt Namen und Doppelte ab", async () => {
    const { rufe } = neueApp();
    const r = await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "tp 01", pseudonym: "Knie (fiktiv)" } });
    expect(r.status).toBe(201);
    expect((await r.json()).patient.kuerzel).toBe("TP-01");
    expect((await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "Mueller" } })).status).toBe(400);
    expect((await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "TP-01" } })).status).toBe(409);
    const liste = await (await rufe("/api/patienten")).json();
    expect(liste.patienten).toHaveLength(1);
    expect(liste.patienten[0].anzahl).toBe(0);
  });
  it("Kürzel-Regeln", () => {
    expect(kuerzelPruefen("ab-12").kuerzel).toBe("AB-12");
    expect(kuerzelPruefen("Anna").fehler).toBeTruthy();
    expect(kuerzelPruefen("A").fehler).toBeTruthy();
    expect(kuerzelPruefen("TP_01").fehler).toBeTruthy();
  });
});

describe("Aufnahme → Notiz → Ordner", () => {
  it("Transkription und Strukturierung", async () => {
    const { rufe, transkribieren } = neueApp();
    const t = await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO });
    expect(t.status).toBe(200);
    expect((await t.json()).text).toContain("Flexion");
    expect(transkribieren).toHaveBeenCalledWith(AUDIO);
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: "kurz" })).status).toBe(400);
    const s = await rufe("/api/strukturieren", { methode: "POST", body: { rohtext: "Knie rechts" } });
    expect((await s.json()).strukturiert.befund).toEqual(["Flexion Knie rechts bis 90°"]);
    expect((await rufe("/api/strukturieren", { methode: "POST", body: { rohtext: "  " } })).status).toBe(400);
  });

  it("Speichern, Liste, Suche, Ansehen, Bearbeiten, Löschen", async () => {
    const { rufe } = neueApp();
    const p = (await (await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "TP-01" } })).json()).patient;
    const roh = "Schmerz in der Schulter, Übungen für zu Hause";
    const neu = await rufe("/api/notizen", {
      methode: "POST",
      body: { patient_id: p.id, rohtext: roh, strukturiert: { befund: ["Schulter Schmerz NRS 5"], hausaufgaben: ["Pendelübungen 3 × täglich"], fremd: ["x"] } },
    });
    expect(neu.status).toBe(201);
    const notiz = (await neu.json()).notiz;
    expect(notiz.kuerzel).toBe("TP-01");
    expect(notiz.strukturiert).toEqual({ befund: ["Schulter Schmerz NRS 5"], massnahmen: [], verlauf: [], hausaufgaben: ["Pendelübungen 3 × täglich"], unklar: [] });
    expect(notiz.suchtext).toBeUndefined();

    const liste = await (await rufe(`/api/notizen?patient_id=${p.id}`)).json();
    expect(liste.notizen).toHaveLength(1);
    expect((await (await rufe("/api/notizen?q=ÜBUNGEN")).json()).notizen).toHaveLength(1); // Umlaut, Großschreibung
    expect((await (await rufe("/api/notizen?q=tp-01 schulter")).json()).notizen).toHaveLength(1);
    expect((await (await rufe("/api/notizen?q=hüfte")).json()).notizen).toHaveLength(0);
    expect((await rufe("/api/notizen?patient_id=kaputt")).status).toBe(400);

    const geladen = await (await rufe(`/api/notizen/${notiz.id}`)).json();
    expect(geladen.notiz.rohtext).toBe(roh);

    const geaendert = await rufe(`/api/notizen/${notiz.id}`, { methode: "PATCH", body: { strukturiert: { ...notiz.strukturiert, verlauf: ["Besser als letzte Woche"] } } });
    const g = (await geaendert.json()).notiz;
    expect(g.strukturiert.verlauf).toEqual(["Besser als letzte Woche"]);
    expect(g.geaendert_am).toBeTruthy();
    expect((await (await rufe("/api/notizen?q=letzte woche")).json()).notizen).toHaveLength(1);

    expect((await rufe(`/api/notizen/${notiz.id}`, { methode: "DELETE" })).status).toBe(204);
    expect((await rufe(`/api/notizen/${notiz.id}`)).status).toBe(404);
  });

  it("lehnt leere Notiz und fremden Patienten ab", async () => {
    const { rufe } = neueApp();
    const p = (await (await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "TP-02" } })).json()).patient;
    expect((await rufe("/api/notizen", { methode: "POST", body: { patient_id: p.id, rohtext: "", strukturiert: {} } })).status).toBe(400);
    expect((await rufe("/api/notizen", { methode: "POST", body: { patient_id: crypto.randomUUID(), rohtext: "x" } })).status).toBe(404);
    expect((await rufe("/api/notizen", { methode: "POST", body: { rohtext: "x" } })).status).toBe(400);
  });
});

describe("Normalisieren und Suche", () => {
  it("bereinigt Listen", () => {
    const n = normalisieren({ Befund: ["- Knie ", "knie.", "", 5, { a: 1 }], Maßnahmen: "MT\nKG" });
    expect(n.befund).toEqual(["Knie", "5"]);
    expect(n.massnahmen).toEqual(["MT", "KG"]);
    expect(normalisieren(null)).toEqual({ befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] });
  });
  it("Suchwörter ohne Sonderzeichen", () => {
    expect(suchwoerter("Knie*,(rechts) a")).toEqual(["knie", "rechts"]);
    expect(suchwoerter("x".repeat(3) + " 1 2 3 4 5 6 7")).toEqual(["xxx"]);
  });
});

describe("Whisper", () => {
  it("entfernt Halluzinationen", () => {
    expect(bereinigen({ segments: [{ text: " Knie rechts." }, { text: "Untertitel im Auftrag des ZDF, 2021" }] })).toBe("Knie rechts.");
    expect(bereinigen({ text: "Vielen Dank fürs Zuschauen!" })).toBe("");
    expect(bereinigen({ text: "  LWS  frei " })).toBe("LWS frei");
  });
  it("ruft Workers AI mit Deutsch und Fachvokabular", async () => {
    const run = vi.fn(async () => ({ text: "Hallo", segments: [{ text: "Hallo" }] }));
    const t = await whisperTranskription({ AI: { run } })(AUDIO);
    expect(t).toBe("Hallo");
    const [modell, eingabe] = run.mock.calls[0];
    expect(modell).toBe("@cf/openai/whisper-large-v3-turbo");
    expect(eingabe).toMatchObject({ audio: AUDIO, language: "de", vad_filter: true });
    expect(eingabe.initial_prompt).toContain("Physiotherap");
  });
});

describe("Claude-Strukturierung", () => {
  function anthropicAntwort(inhalt, stop = "end_turn") {
    return new Response(
      JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: stop, content: [{ type: "text", text: inhalt }], usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("sendet Schema, Fallback und Effort – nimmt JSON an", async () => {
    const fetchMock = vi.fn(async () => anthropicAntwort(JSON.stringify({ befund: ["Knie frei"], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: ["„Mobi“ unklar"] })));
    vi.stubGlobal("fetch", fetchMock);
    const ergebnis = await claudeStrukturierung({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_EFFORT: "low" })("Knie frei, Mobi");
    expect(ergebnis.befund).toEqual(["Knie frei"]);
    expect(ergebnis.unklar).toEqual(["„Mobi“ unklar"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/messages");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.messages[0].content).toContain("<transkript>");
    expect(body.thinking).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(headers.get("authorization")).toBe("Bearer sk-test"); // SDK 1.x sendet den Schlüssel als Bearer
  });

  it("Ablehnung und unlesbare Antwort werden zu verständlichen Fehlern", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicAntwort("", "refusal")));
    await expect(claudeStrukturierung({ ANTHROPIC_API_KEY: "k" })("x")).rejects.toThrow(/nicht verarbeitet/);
    vi.stubGlobal("fetch", vi.fn(async () => anthropicAntwort("kein json")));
    await expect(claudeStrukturierung({ ANTHROPIC_API_KEY: "k" })("x")).rejects.toThrow(/nicht lesbar/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x" } }), { status: 401 })));
    await expect(claudeStrukturierung({ ANTHROPIC_API_KEY: "k" })("x")).rejects.toThrow(/Schlüssel ungültig/);
  });
});

describe("Supabase-Anfragen", () => {
  it("neuer Schlüssel nur im apikey-Header, Suche als like-Filter", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const s = supabaseSpeicher({ SUPABASE_URL: "https://abc.supabase.co/", SUPABASE_SECRET_KEY: "sb_secret_x" });
    await s.notizen({ patientId: "11111111-1111-1111-1111-111111111111", woerter: ["knie", "übung"] });
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://abc.supabase.co/rest/v1/notes");
    expect(u.searchParams.get("patient_id")).toBe("eq.11111111-1111-1111-1111-111111111111");
    expect(u.searchParams.get("and")).toBe("(suchtext.like.*knie*,suchtext.like.*übung*)");
    expect(init.headers.apikey).toBe("sb_secret_x");
    expect(init.headers.Authorization).toBeUndefined();
  });
  it("alter service_role-Schlüssel zusätzlich als Bearer; 409 bei doppeltem Kürzel", async () => {
    const fetchMock = vi.fn(async () => new Response('{"code":"23505"}', { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const s = supabaseSpeicher({ SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SECRET_KEY: "eyJabc" });
    await expect(s.neuerPatient({ kuerzel: "TP-01", pseudonym: "" })).rejects.toMatchObject({ status: 409 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJabc");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
  it("ohne Einrichtung: 503", async () => {
    await expect(supabaseSpeicher({}).patienten()).rejects.toMatchObject({ status: 503 });
  });
});
