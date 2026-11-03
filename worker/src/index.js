// Cloudflare-Worker-Einstieg: echte Dienste (Workers AI, Anthropic, Supabase) aus den Worker-Secrets.
import { erstelleApp } from "./app.js";
import { erstelleBegrenzer } from "./begrenzer.js";
import { supabaseSpeicher } from "./speicher.js";
import { claudeStrukturierung } from "./strukturierung.js";
import { whisperTranskription } from "./transkription.js";

// Einmal je Worker-Instanz, damit das Rate-Limit über mehrere Anfragen zählt
const begrenzer = erstelleBegrenzer();

export default {
  async fetch(request, env) {
    const app = erstelleApp({
      speicher: supabaseSpeicher(env),
      transkribieren: whisperTranskription(env),
      strukturieren: claudeStrukturierung(env),
      begrenzer,
    });
    return app(request, env);
  },
};
