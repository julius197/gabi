// Cloudflare-Worker-Einstieg: echte Dienste (Workers AI, Anthropic, Supabase) aus den Worker-Secrets.
import { erstelleApp } from "./app.js";
import { supabaseSpeicher } from "./speicher.js";
import { claudeStrukturierung } from "./strukturierung.js";
import { whisperTranskription } from "./transkription.js";

export default {
  async fetch(request, env) {
    const app = erstelleApp({
      speicher: supabaseSpeicher(env),
      transkribieren: whisperTranskription(env),
      strukturieren: claudeStrukturierung(env),
    });
    return app(request, env);
  },
};
