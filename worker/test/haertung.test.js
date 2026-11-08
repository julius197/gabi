// Worker-Härtung: Herkunft, Header, Methoden, Typen, Größen, Aufnahme-Prüfung, Rate-Limit, Fehlversuche, Logs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO, CODE, ENV, neueApp, wavBase64 } from "./hilfen.js";
import { GRENZEN, erstelleBegrenzer } from "../src/begrenzer.js";
import { MAX_AUDIO_BASE64 } from "../src/app.js";
import { claudeStrukturierung } from "../src/strukturierung.js";

afterEach(() => vi.restoreAllMocks());

describe("Herkunft und Header", () => {
  it("fremde Herkunft: 403, auch beim Vorab-Check – erlaubte bekommt CORS", async () => {
    const { rufe } = neueApp();
    const boese = await rufe("/api/patienten", { origin: "https://boese.example" });
    expect(boese.status).toBe(403);
    expect(boese.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await rufe("/api/patienten", { methode: "OPTIONS", origin: "https://boese.example", code: null })).status).toBe(403);
    const gut = await rufe("/api/patienten", { origin: "https://gabi.automatilabs.de" });
    expect(gut.status).toBe(200);
    expect(gut.headers.get("Access-Control-Allow-Origin")).toBe("https://gabi.automatilabs.de");
    const lokal = await rufe("/api/pruefen", { origin: "http://localhost:8788", env: { ...ENV, ERLAUBTE_ORIGINS: "https://gabi.automatilabs.de,http://localhost:8788" } });
    expect(lokal.status).toBe(200);
  });

  it("Sicherheits-Header auf jeder Antwort, auch bei Fehlern", async () => {
    const { rufe } = neueApp();
    for (const r of [await rufe("/api/status", { code: null }), await rufe("/api/gibtsnicht"), await rufe("/api/patienten", { code: "falsch" })]) {
      expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
      expect(r.headers.get("Content-Type")).toContain("application/json");
    }
  });

  it("unbekannter Pfad 404, falsche Methode 405 mit Allow", async () => {
    const { rufe } = neueApp();
    expect((await rufe("/api/gibtsnicht")).status).toBe(404);
    expect((await rufe("/geheim")).status).toBe(404);
    const r = await rufe("/api/patienten", { methode: "DELETE" });
    expect(r.status).toBe(405);
    expect(r.headers.get("Allow")).toBe("GET, POST");
    expect((await r.json()).fehler).toMatch(/Methode/);
  });
});

describe("Eingaben prüfen", () => {
  it("JSON-Routen verlangen JSON, Aufnahme verlangt Text", async () => {
    const { rufe } = neueApp();
    expect((await rufe("/api/strukturieren", { methode: "POST", roh: '{"rohtext":"x"}', typ: "text/plain" })).status).toBe(415);
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO, typ: "application/json" })).status).toBe(415);
  });

  it("Typen werden geprüft statt still umgewandelt", async () => {
    const { rufe } = neueApp();
    expect((await rufe("/api/patienten", { methode: "POST", body: { kuerzel: 123 } })).status).toBe(400);
    const p = (await (await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "TP-77" } })).json()).patient;
    expect((await rufe("/api/notizen", { methode: "POST", body: { patient_id: p.id, rohtext: { a: 1 } } })).status).toBe(400);
    expect((await rufe("/api/notizen", { methode: "POST", body: { patient_id: p.id, rohtext: "x", strukturiert: ["a"] } })).status).toBe(400);
    expect((await rufe("/api/notizen", { methode: "POST", body: { patient_id: "kein-uuid", rohtext: "x" } })).status).toBe(400);
    expect((await rufe(`/api/notizen?q=${"a".repeat(201)}`)).status).toBe(400);
    expect((await rufe("/api/notizen/123")).status).toBe(400);
    expect((await rufe("/api/notizen", { methode: "POST", roh: "{kaputt", typ: "application/json" })).status).toBe(400);
  });

  it("Größenlimits: JSON und Aufnahme", async () => {
    const { rufe, app } = neueApp();
    const gross = await app(new Request("https://api.test/api/strukturieren", {
      method: "POST", headers: { "X-Gabi-Zugang": CODE, "Content-Type": "application/json", "Content-Length": "400000" }, body: "{}",
    }), ENV);
    expect(gross.status).toBe(413);
    const lang = wavBase64(30).padEnd(MAX_AUDIO_BASE64 + 4, "A");
    const r = await rufe("/api/transkribieren", { methode: "POST", roh: lang });
    expect(r.status).toBe(413);
    expect((await r.json()).fehler).toMatch(/5 Minuten/);
  });

  it("Aufnahme muss gültiges Base64 einer WAV-Datei sein", async () => {
    const { rufe, transkribieren } = neueApp();
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: "A".repeat(400) })).status).toBe(400); // kein WAV
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: `${AUDIO.slice(0, 300)}<script>` })).status).toBe(400);
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: "UklGR" })).status).toBe(400); // zu kurz
    const lang = wavBase64(20_000); // > 8 KB: geprüft werden Anfang und Ende (spart CPU im Worker)
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: `${lang.slice(0, -8)}<script>` })).status).toBe(400); // Unsinn am Ende
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: `${lang}A` })).status).toBe(400); // Länge kein Vielfaches von 4
    expect(transkribieren).not.toHaveBeenCalled();
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO })).status).toBe(200);
  });
});

describe("Rate-Limit und Fehlversuche", () => {
  it("zu viele Anfragen je IP: 429 mit Retry-After, andere IP unberührt", async () => {
    const { rufe } = neueApp({ grenzen: { ...GRENZEN, api: [3, 60_000] } });
    for (let i = 0; i < 3; i++) expect((await rufe("/api/pruefen", { ip: "1.1.1.1" })).status).toBe(200);
    const r = await rufe("/api/pruefen", { ip: "1.1.1.1" });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await r.json()).fehler).toMatch(/Zu viele Anfragen/);
    expect((await rufe("/api/pruefen", { ip: "2.2.2.2" })).status).toBe(200);
  });

  it("Spracherkennung und KI haben eigene, engere Grenzen", async () => {
    const { rufe, transkribieren } = neueApp({ grenzen: { ...GRENZEN, transkribieren: [2, 600_000], strukturieren: [1, 600_000] } });
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO, ip: "3.3.3.3" })).status).toBe(200);
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO, ip: "3.3.3.3" })).status).toBe(200);
    expect((await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO, ip: "3.3.3.3" })).status).toBe(429);
    expect(transkribieren).toHaveBeenCalledTimes(2);
    expect((await rufe("/api/strukturieren", { methode: "POST", body: { rohtext: "a" }, ip: "3.3.3.3" })).status).toBe(200);
    expect((await rufe("/api/strukturieren", { methode: "POST", body: { rohtext: "b" }, ip: "3.3.3.3" })).status).toBe(429);
  });

  it("nach zu vielen falschen Codes gesperrt – auch mit richtigem Code – bis das Fenster abläuft", async () => {
    let jetzt = 1_000_000;
    const begrenzer = erstelleBegrenzer({ jetzt: () => jetzt });
    const { rufe } = neueApp({ begrenzer, grenzen: { ...GRENZEN, fehlversuch: [3, 15 * 60_000] } });
    for (let i = 0; i < 3; i++) expect((await rufe("/api/pruefen", { code: "falsch", ip: "6.6.6.6" })).status).toBe(401);
    const gesperrt = await rufe("/api/pruefen", { ip: "6.6.6.6" });
    expect(gesperrt.status).toBe(429);
    expect((await gesperrt.json()).fehler).toMatch(/falsche Zugangscodes.*Minuten/);
    expect((await rufe("/api/pruefen", { ip: "7.7.7.7" })).status).toBe(200);
    jetzt += 15 * 60_000 + 1;
    expect((await rufe("/api/pruefen", { ip: "6.6.6.6" })).status).toBe(200);
  });

  it("Begrenzer räumt alte Einträge auf", () => {
    let jetzt = 0;
    const b = erstelleBegrenzer({ jetzt: () => jetzt, maxEintraege: 5 });
    for (let i = 0; i < 5; i++) b.treffer(`k${i}`, [1, 1000]);
    jetzt = 2000;
    expect(b.treffer("neu", [1, 1000]).erlaubt).toBe(true);
    expect(b.gesperrt("k0", [1])).toBe(0);
  });
});

describe("Fehler und Logs", () => {
  it("Spracherkennung fällt aus: 502 mit deutscher Meldung, Log nur mit Fehlerart", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { rufe } = neueApp({ transkribieren: async () => { throw new TypeError("Inhalt: Knie rechts Patient geheim"); } });
    const r = await rufe("/api/transkribieren", { methode: "POST", roh: AUDIO });
    expect(r.status).toBe(502);
    expect((await r.json()).fehler).toMatch(/Spracherkennung gerade nicht erreichbar/);
    expect(log.mock.calls.flat().join(" ")).toBe("Spracherkennung: TypeError");
  });

  it("kompletter Ablauf: keine Inhalte, Codes oder Schlüssel in den Logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { ...ENV, ANTHROPIC_API_KEY: "sk-ant-GEHEIM", SUPABASE_SECRET_KEY: "sb_secret_GEHEIM" };
    const { rufe } = neueApp({ strukturieren: async () => { throw new Error("sk-ant-GEHEIM Inhalt"); } });
    const p = (await (await rufe("/api/patienten", { methode: "POST", body: { kuerzel: "TP-55", pseudonym: "Testfall Hüfte (fiktiv)" }, env })).json()).patient;
    await rufe("/api/notizen", { methode: "POST", body: { patient_id: p.id, rohtext: "Hüfte links Schmerz NRS 7", strukturiert: { befund: ["Hüfte links NRS 7"] } }, env });
    await rufe("/api/notizen?q=hüfte", { env });
    await rufe("/api/strukturieren", { methode: "POST", body: { rohtext: "Hüfte links" }, env });
    await rufe("/api/pruefen", { code: "falscher-code-123", env });
    const alles = [...log.mock.calls, ...err.mock.calls].flat().map(String).join("\n");
    for (const verboten of ["GEHEIM", "Hüfte", "hüfte", "NRS", "TP-55", CODE, "falscher-code-123"]) expect(alles).not.toContain(verboten);
  });

  it("ohne Anthropic-Schlüssel: verständliche Meldung, kein Absturz", async () => {
    const { rufe } = neueApp({ strukturieren: claudeStrukturierung({}) });
    const r = await rufe("/api/strukturieren", { methode: "POST", body: { rohtext: "Knie" } });
    expect(r.status).toBe(502);
    expect((await r.json()).fehler).toMatch(/noch nicht eingerichtet/);
  });
});
