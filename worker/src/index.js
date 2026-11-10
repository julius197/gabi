// Cloudflare-Worker-Einstieg: echte Dienste (Workers AI, Anthropic, Supabase) aus den Worker-Secrets.
import { erstelleApp } from "./app.js";
import { erstelleBegrenzer } from "./begrenzer.js";
import { arbeitsspeicherMitTestdaten, supabaseSpeicher } from "./speicher.js";
import { claudeStrukturierung } from "./strukturierung.js";
import { claudeBericht, claudeChat } from "./chat.js";
import { whisperTranskription } from "./transkription.js";
import { claudeBrainVorschlag } from "./brain_vorschlag.js";
import { brainKontextAusSpeicher, supabaseBrain } from "./brain_abruf.js";
// dieselbe Suche wie im Browser (Datei im Wurzelordner, läuft in Browser, Node und Worker)
import BRAIN_SUCHE from "../../brain-suche.js";

// Einmal je Worker-Instanz, damit das Rate-Limit über mehrere Anfragen zählt
const begrenzer = erstelleBegrenzer();

// Staging ohne Datenbank (wrangler.brain.toml: GABI_SPEICHER = "arbeitsspeicher"): drei Test-Patienten im
// Arbeitsspeicher, einmal je Worker-Instanz – die echte Datenbank wird so nie berührt. Standard bleibt Supabase.
let probeSpeicher = null;
function speicherFuer(env) {
  if (env.GABI_SPEICHER !== "arbeitsspeicher") return supabaseSpeicher(env);
  if (!probeSpeicher) probeSpeicher = arbeitsspeicherMitTestdaten();
  return probeSpeicher;
}

export default {
  async fetch(request, env) {
    // Brain in Supabase – Entwurf hinter zwei Schaltern, beide Standard AUS (siehe brain_abruf.js):
    // BRAIN_SPEICHER = "supabase" → Routen /api/brain… · BRAIN_QUELLE = "supabase" → Gabi holt den Kontext selbst
    const brainSpeicher = env.BRAIN_SPEICHER === "supabase" || env.BRAIN_QUELLE === "supabase" ? supabaseBrain(env) : null;
    const app = erstelleApp({
      speicher: speicherFuer(env),
      transkribieren: whisperTranskription(env),
      strukturieren: claudeStrukturierung(env),
      chatten: claudeChat(env),
      berichten: claudeBericht(env),
      brainVorschlagen: claudeBrainVorschlag(env),
      brainSpeicher,
      brainAbruf: env.BRAIN_QUELLE === "supabase" ? (frage) => brainKontextAusSpeicher({ brainSpeicher, kontextWaehlen: BRAIN_SUCHE.kontextWaehlen, frage }) : null,
      begrenzer,
    });
    return app(request, env);
  },
};
