// Spracherkennung über Cloudflare Workers AI (Whisper large v3 turbo) – kein zusätzlicher Schlüssel nötig.

export const WHISPER_MODELL = "@cf/openai/whisper-large-v3-turbo";

// Fachbegriffe als Hinweis für Whisper (gegen Hörfehler wie „Terra-Abend“ statt „Theraband“).
// Kurz halten: Whisper nutzt nur die letzten ~224 Tokens – dieser Text hat 150 (mit dem Whisper-Tokenizer gezählt).
// Nur eine Liste – keine Sätze und keine Ziffern: Bei Stille gibt Whisper manchmal das Ende des Hinweises wieder.
// Ein Echo über 40 Zeichen fängt halluzination() ab, ein kürzeres nicht – es darf deshalb nie eine Dosierung
// („3 mal 12“) sein, die dann erfunden im Entwurf stünde. Der Text endet wie früher mit einem harmlosen Wort.
// Grenze: Mit condition_on_previous_text: false wirkt der Hinweis nur im ersten 30-s-Fenster einer Aufnahme.
export const WHISPER_PROMPT =
  "Physiotherapeutische Behandlungsnotiz auf Deutsch. Fachbegriffe: Krankengymnastik, Manuelle Therapie, " +
  "Lymphdrainage, Mobilisation, Triggerpunkt, Faszien, Theraband, Beinpresse, Kompression, Kühlung, Hausaufgaben, " +
  "Patella, am Kniegelenk, Oberschenkel, Schulter, Rotatorenmanschette, Kreuzband, Bandscheibenvorfall, HWS, BWS, LWS, " +
  "ISG, NRS, Flexion, Extension, Abduktion, Außenrotation, Innenrotation, Sätze, Wdh., Wiederholungen.";

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
