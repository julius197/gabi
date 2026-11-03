// Spracherkennung über Cloudflare Workers AI (Whisper large v3 turbo) – kein zusätzlicher Schlüssel nötig.

export const WHISPER_MODELL = "@cf/openai/whisper-large-v3-turbo";

// Fachvokabular als Hinweis für Whisper (kurz halten: Whisper nutzt nur ~224 Tokens Prompt)
export const WHISPER_PROMPT =
  "Physiotherapeutische Behandlungsnotiz auf Deutsch. Fachbegriffe: Krankengymnastik, manuelle Therapie, " +
  "Lymphdrainage, Mobilisation, Triggerpunkt, Faszien, HWS, BWS, LWS, ISG, NRS, Flexion, Extension, Abduktion, " +
  "Außenrotation, Innenrotation, Rotatorenmanschette, Kreuzband, Bandscheibenvorfall, Wiederholungen.";

// Typische Whisper-Halluzinationen bei Stille (aus Notara kern.py übernommen)
const HALLUZINATIONEN = [
  "untertitel im auftrag des zdf",
  "untertitelung im auftrag des zdf",
  "untertitel der amara.org-community",
  "untertitelung aufgrund der amara.org-community",
  "vielen dank fürs zuschauen",
  "vielen dank für's zuschauen",
  "copyright wdr",
];

function halluzination(text) {
  const klein = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!klein) return true;
  if (HALLUZINATIONEN.some((h) => klein.includes(h))) return true;
  return klein.length > 40 && WHISPER_PROMPT.toLowerCase().includes(klein); // Whisper gibt bei Stille manchmal den Prompt wieder
}

/** Bereinigt die Whisper-Antwort: Halluzinations-Segmente raus, Leerraum glätten. */
export function bereinigen(antwort) {
  const segmente = Array.isArray(antwort?.segments) ? antwort.segments : null;
  let text;
  if (segmente && segmente.length) {
    text = segmente.map((s) => String(s?.text || "").trim()).filter((t) => t && !halluzination(t)).join(" ");
  } else {
    text = String(antwort?.text || "").trim();
    if (halluzination(text)) text = "";
  }
  return text.replace(/\s+/g, " ").trim();
}

export function whisperTranskription(env) {
  return async (audioBase64) => {
    if (!env.AI) throw new Error("Workers-AI-Bindung fehlt");
    const antwort = await env.AI.run(WHISPER_MODELL, {
      audio: audioBase64,
      task: "transcribe",
      language: "de",
      initial_prompt: WHISPER_PROMPT,
      vad_filter: true,
      condition_on_previous_text: false,
    });
    return bereinigen(antwort);
  };
}
