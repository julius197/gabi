// Brain-Interview: aus einer Antwort der Praxis einen Vorschlag für einen Brain-Eintrag formulieren (Claude, JSON-Schema).
// Gabi speichert nie selbst – der Vorschlag geht als Karte an die Oberfläche, gespeichert wird erst nach „Übernehmen“.
// Eigene Datei, damit brain.js von keiner anderen Worker-Datei abhängt (chat.js baut auf brain.js auf).
import Anthropic from "@anthropic-ai/sdk";
import { BRAIN_VORSCHLAG_PROMPT, BRAIN_VORSCHLAG_SCHEMA, brainVorschlagInhalt, brainVorschlagNachricht } from "./brain.js";
import { ChatFehler, kiFehler } from "./chat.js";
import { StrukturFehler, jsonAusText } from "./strukturierung.js";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Liefert eine Funktion ({ knoten: { id, titel, inhalt }, antwort }) → { inhalt } – oder null ohne KI-Schlüssel.
 * Leerer inhalt heißt: Die Antwort beantwortet den offenen Punkt nicht (die Route sagt das dann freundlich).
 */
export function claudeBrainVorschlag(env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  const modell = env.ANTHROPIC_MODELL || "claude-opus-5-5";
  const effort = env.ANTHROPIC_EFFORT || "low";
  return async ({ knoten, antwort }) => {
    let ergebnis;
    try {
      ergebnis = await client.beta.messages.create({
        model: modell,
        max_tokens: 16000,
        // Lehnt das Modell ab, übernimmt serverseitig das empfohlene Ersatzmodell
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort, format: { type: "json_schema", schema: BRAIN_VORSCHLAG_SCHEMA } },
        system: [{ type: "text", text: BRAIN_VORSCHLAG_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: brainVorschlagNachricht({ knoten, antwort }) }],
      });
    } catch (e) {
      // Ausfall, Überlastung, Zeitüberschreitung: Wiederholen kann helfen → StrukturFehler („Nochmal versuchen“)
      const f = kiFehler(e, "brain");
      throw f instanceof ChatFehler ? new StrukturFehler(f.message) : f;
    }
    if (ergebnis.stop_reason === "refusal") throw new StrukturFehler("Die KI hat diesen Vorschlag nicht formuliert. Bitte die Antwort prüfen und noch einmal versuchen.");
    if (ergebnis.stop_reason === "max_tokens") throw new StrukturFehler("Die Antwort ist zu lang für einen Durchgang.");
    const daten = jsonAusText(ergebnis.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    if (!daten) throw new StrukturFehler("Die Antwort der KI war nicht lesbar. Bitte noch einmal versuchen.");
    return { inhalt: brainVorschlagInhalt(daten) };
  };
}
