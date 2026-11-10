// Schutz der Browser-Tests vor dem falschen Ziel (tests/ziel.mjs): Sie probieren Zugangscodes aus und dürfen deshalb
// nie gegen eine Oberfläche laufen, die mit einem echten Worker spricht (Live-Seite, `npm run vorschau`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apiAdresse, istLokaleApi, zielPruefen } from "../../tests/ziel.mjs";

const antwort = (text, ok = true) => async () => ({ ok, text: async () => text });
const lauf = async (holen, optionen = {}) => {
  const enden = [];
  const meldungen = [];
  const ok = await zielPruefen("http://localhost:8788", { live: false, holen, ende: (c) => enden.push(c), melden: (t) => meldungen.push(t), ...optionen });
  return { ok, enden, meldungen };
};

describe("Tests – Schutz vor dem falschen Ziel", () => {
  it("lokaler Server (apiUrl leer oder localhost): der Lauf darf starten", async () => {
    for (const config of [
      'window.GABI_CONFIG = { apiUrl: "" }; // lokaler Modus',
      'window.GABI_CONFIG = { apiUrl: "", brain: true }; // lokaler Modus, Brain AN',
      'window.GABI_CONFIG = {\n  apiUrl: "http://localhost:8790",\n};',
      "window.GABI_CONFIG = { apiUrl: 'http://127.0.0.1:8791/' };",
    ]) {
      const r = await lauf(antwort(config));
      expect(r.ok, config).toBe(true);
      expect(r.enden).toEqual([]);
    }
  });

  it("die echte config.js des Repos (Live-Worker): Abbruch mit Code 2 und klarer Meldung", async () => {
    const echt = readFileSync(new URL("../../config.js", import.meta.url), "utf8");
    expect(await apiAdresse("http://localhost:8788", antwort(echt))).toMatch(/^https:\/\/.+workers\.dev$/);
    const r = await lauf(antwort(echt));
    expect(r.ok).toBe(false);
    expect(r.enden).toEqual([2]);
    expect(r.meldungen.join(" ")).toMatch(/echten Worker/);
    expect(r.meldungen.join(" ")).toMatch(/npm run lokal/);
  });

  it("jede fremde API-Adresse zählt als echter Worker – auch eine, die nur so aussieht wie localhost", async () => {
    for (const api of ["https://gabi-api-brain.beispiel.workers.dev", "https://localhost.beispiel.de", "http://localhost.evil.test:8788", "http://192.168.0.5:8788", "//gabi-api.beispiel.workers.dev"]) {
      expect(istLokaleApi(api), api).toBe(false);
      const r = await lauf(antwort(`window.GABI_CONFIG = { apiUrl: "${api}" };`));
      expect(r.enden, api).toEqual([2]);
    }
    for (const api of ["", "http://localhost:8788", "http://127.0.0.1:8790", "http://[::1]:8790", "https://localhost"]) expect(istLokaleApi(api), api).toBe(true);
    expect(istLokaleApi(null)).toBe(false);
    expect(istLokaleApi(undefined)).toBe(false);
  });

  it("kein Gabi-Server unter der Adresse (Fehler, 404 oder config.js ohne apiUrl): Abbruch statt Blindflug", async () => {
    const faelle = [async () => { throw new Error("ECONNREFUSED"); }, antwort("Not found", false), antwort("<html>etwas ganz anderes</html>")];
    for (const holen of faelle) {
      const r = await lauf(holen);
      expect(r.ok).toBe(false);
      expect(r.enden).toEqual([2]);
      expect(r.meldungen.join(" ")).toMatch(/kein Gabi-Server/);
    }
  });

  it("bewusster Live-Lauf (GABI_LIVE=1): keine Prüfung, keine Anfrage", async () => {
    let anfragen = 0;
    const r = await lauf(async () => { anfragen += 1; throw new Error("darf nicht passieren"); }, { live: true });
    expect(r.ok).toBe(true);
    expect(r.enden).toEqual([]);
    expect(anfragen).toBe(0);
  });

  it("gelesen wird nur /config.js – keine API-Adresse", async () => {
    const adressen = [];
    await lauf(async (url) => { adressen.push(url); return { ok: true, text: async () => 'window.GABI_CONFIG = { apiUrl: "" };' }; });
    expect(adressen).toEqual(["http://localhost:8788/config.js"]);
  });

  it("alle Browser-Tests rufen den Schutz auf, bevor sie einen Browser starten", () => {
    for (const datei of ["v2.mjs", "brain.mjs", "brain-leistung.mjs", "eingabefelder.mjs"]) {
      const text = readFileSync(new URL(`../../tests/${datei}`, import.meta.url), "utf8");
      const schutz = text.indexOf("await zielPruefen(basis");
      expect(schutz, datei).toBeGreaterThan(-1);
      const start = text.search(/\.launch\(/);
      if (datei !== "eingabefelder.mjs") expect(schutz, `${datei}: Schutz vor dem ersten launch()`).toBeLessThan(start);
    }
  });
});
