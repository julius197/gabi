// Strukturierung des Transkripts zur Physio-Notiz über die Anthropic API (Claude).
import Anthropic from "@anthropic-ai/sdk";
import { NOTIZ_SCHEMA, SYSTEM_PROMPT, normalisieren } from "./notiz.js";

/**
 * Fehler der Anthropic-API ohne Inhalte protokollieren (für `wrangler tail`): Status, Fehlerart, Request-ID.
 * Abbrüche (Stopp, Tab geschlossen) sind keine KI-Fehler und erscheinen nicht.
 */
export function kiFehlerLoggen(e, wo) {
  if (!(e instanceof Anthropic.APIError) || e instanceof Anthropic.APIUserAbortError) return;
  // Das SDK setzt keinen eigenen Fehlernamen; ohne Antwort (Zeitüberschreitung, Verbindung) fehlt auch `type`
  const art = e.error?.error?.type || e.type
    || (e instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : e instanceof Anthropic.APIConnectionError ? "verbindung" : "api_error");
  console.log(`KI-Fehler ${wo}: ${e.status ?? "-"} ${art} ${e.requestID ?? ""}`.trim());
}

export class StrukturFehler extends Error {}

/** JSON aus der Antwort lesen – auch wenn (z. B. beim Ersatzmodell) Code-Zäune oder Text drumherum stehen. */
export function jsonAusText(text) {
  const t = String(text || "").trim();
  const versuche = [t, t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) versuche.push(t.slice(a, b + 1));
  for (const v of versuche) {
    try {
      const d = JSON.parse(v);
      if (d && typeof d === "object" && !Array.isArray(d)) return d;
    } catch { /* nächster Versuch */ }
  }
  return null;
}

export function claudeStrukturierung(env) {
  if (!env.ANTHROPIC_API_KEY) {
    return async () => { throw new StrukturFehler("KI ist auf dem Server noch nicht eingerichtet. Notiz bitte von Hand ausfüllen."); };
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  const modell = env.ANTHROPIC_MODELL || "claude-opus-5-5";
  const effort = env.ANTHROPIC_EFFORT || "low";

  return async (rohtext) => {
    let antwort;
    try {
      antwort = await client.beta.messages.create({
        model: modell,
        max_tokens: 16000,
        // Lehnt das Modell eine Anfrage ab, übernimmt serverseitig das empfohlene Ersatzmodell.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, format: { type: "json_schema", schema: NOTIZ_SCHEMA } },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        // Transkript klar abgegrenzt; ein „</transkript>“ im Text kann die Grenze nicht verschieben
        messages: [{ role: "user", content: `<transkript>\n${rohtext.replace(/<\/?transkript>/gi, "")}\n</transkript>` }],
      });
    } catch (e) {
      // Nie Inhalte loggen – nur Art und Status des Fehlers
      kiFehlerLoggen(e, "struktur");
      if (e instanceof Anthropic.AuthenticationError) throw new StrukturFehler("Anthropic-Schlüssel ungültig.");
      if (e instanceof Anthropic.RateLimitError) throw new StrukturFehler("Ich bin gerade ausgelastet. Bitte gleich noch einmal versuchen.");
      if (e instanceof Anthropic.APIConnectionError) throw new StrukturFehler("KI-Dienst nicht erreichbar.");
      if (e instanceof Anthropic.APIError) throw new StrukturFehler(e.status ? `KI-Dienst antwortet nicht (${e.status}).` : "KI-Dienst antwortet nicht.");
      throw e;
    }
    if (antwort.stop_reason === "refusal") throw new StrukturFehler("Die KI hat diese Notiz nicht verarbeitet. Bitte Text prüfen.");
    if (antwort.stop_reason === "max_tokens") throw new StrukturFehler("Die Notiz ist zu lang für einen Durchgang.");
    const text = antwort.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const daten = jsonAusText(text);
    if (!daten) throw new StrukturFehler("Antwort der KI war nicht lesbar. Bitte noch einmal versuchen.");
    return normalisieren(daten);
  };
}
