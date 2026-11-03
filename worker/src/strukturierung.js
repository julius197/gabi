// Strukturierung des Transkripts zur Physio-Notiz über die Anthropic API (Claude).
import Anthropic from "@anthropic-ai/sdk";
import { NOTIZ_SCHEMA, SYSTEM_PROMPT, normalisieren } from "./notiz.js";

export class StrukturFehler extends Error {}

export function claudeStrukturierung(env) {
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
        messages: [{ role: "user", content: `<transkript>\n${rohtext}\n</transkript>` }],
      });
    } catch (e) {
      // Nie Inhalte loggen – nur Art und Status des Fehlers
      if (e instanceof Anthropic.AuthenticationError) throw new StrukturFehler("Anthropic-Schlüssel ungültig.");
      if (e instanceof Anthropic.RateLimitError) throw new StrukturFehler("KI ist gerade ausgelastet. Bitte gleich noch einmal versuchen.");
      if (e instanceof Anthropic.APIConnectionError) throw new StrukturFehler("KI-Dienst nicht erreichbar.");
      if (e instanceof Anthropic.APIError) throw new StrukturFehler(`KI-Dienst antwortet nicht (${e.status ?? "?"}).`);
      throw e;
    }
    if (antwort.stop_reason === "refusal") throw new StrukturFehler("Die KI hat diese Notiz nicht verarbeitet. Bitte Text prüfen.");
    if (antwort.stop_reason === "max_tokens") throw new StrukturFehler("Die Notiz ist zu lang für einen Durchgang.");
    const text = antwort.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let daten;
    try {
      daten = JSON.parse(text);
    } catch {
      throw new StrukturFehler("Antwort der KI war nicht lesbar. Bitte „Neu strukturieren“.");
    }
    return normalisieren(daten);
  };
}
