// Spracherkennung: Hinweistext (Fachbegriffe) für Whisper und Bereinigung der Antwort.
import { describe, expect, it, vi } from "vitest";
import { AUDIO } from "./hilfen.js";
import { WHISPER_PROMPT, bereinigen, whisperTranskription } from "../src/transkription.js";

// Begriffe, die Whisper ohne Hinweis verhört hat oder verhören könnte (Wunsch aus der Praxis, Worker 2.0.1)
const FACHBEGRIFFE = [
  "Theraband", "Lymphdrainage", "Manuelle Therapie", "Mobilisation", "Patella", "Kniegelenk", "Flexion", "Extension",
  "Beinpresse", "Hausaufgaben", "NRS", "Wdh.", "Sätze", "Oberschenkel", "Schulter", "LWS", "HWS", "Kompression", "Kühlung",
];

describe("Whisper-Hinweistext", () => {
  it("geht bei jedem Aufruf als initial_prompt an Workers AI – mit allen Fachbegriffen", async () => {
    const run = vi.fn(async () => ({ text: "Theraband am Kniegelenk", segments: [{ text: "Theraband am Kniegelenk" }] }));
    expect(await whisperTranskription({ AI: { run } })(AUDIO)).toBe("Theraband am Kniegelenk");
    expect(run).toHaveBeenCalledTimes(1);
    const [modell, eingabe] = run.mock.calls[0];
    expect(modell).toBe("@cf/openai/whisper-large-v3-turbo");
    expect(eingabe).toMatchObject({ audio: AUDIO, task: "transcribe", language: "de", initial_prompt: WHISPER_PROMPT });
    for (const begriff of FACHBEGRIFFE) expect(eingabe.initial_prompt).toContain(begriff);
    // Schreibweise zweier gemeldeter Hörfehler („Terra-Abend“, „mein Kniegelenk“); „A12“ fängt die Strukturierung ab
    for (const beispiel of ["Theraband", "am Kniegelenk"]) expect(eingabe.initial_prompt).toContain(beispiel);
  });

  it("enthält keine Ziffern – ein kurzes Echo des Endes (vom Filter nicht erkannt) bringt nie eine Dosierung ins Diktat", () => {
    expect(WHISPER_PROMPT).not.toMatch(/\d/);
    const ende = WHISPER_PROMPT.slice(-40);
    expect(bereinigen({ segments: [{ text: ` ${ende}` }] })).toBe(ende.trim()); // so kurz bleibt es stehen …
    expect(ende).not.toMatch(/\d|mal\s/); // … darf also keine Mengenangabe sein
  });

  it("bleibt kurz: Whisper liest nur die letzten ~224 Tokens", () => {
    // gemessen: 428 Zeichen = 150 Tokens; die 500-Zeichen-Grenze ist eine Näherung für diesen Stil (reine Kürzel brauchen mehr)
    expect(WHISPER_PROMPT.length).toBeLessThanOrEqual(500);
  });

  it("wiederholt Whisper den Hinweistext (bei Stille), fällt er heraus – ein echtes Diktat mit denselben Begriffen bleibt", () => {
    expect(bereinigen({ text: WHISPER_PROMPT })).toBe("");
    const saetze = WHISPER_PROMPT.split(/(?<=\.)\s+(?=[A-ZÄÖÜ])/);
    expect(saetze).toHaveLength(2);
    for (const satz of saetze) {
      expect(satz.length).toBeGreaterThan(40); // kürzere Sätze würde halluzination() nicht erkennen
      expect(bereinigen({ segments: [{ text: " Knie rechts." }, { text: ` ${satz}` }] })).toBe("Knie rechts.");
    }
    const diktat = [
      "Kräftigung mit Theraband, 3 mal 12 Wdh., 3 Sätze.",
      "Schmerz am Kniegelenk NRS 4, Patella frei beweglich.",
      "Manuelle Therapie, Lymphdrainage, Mobilisation.",
      "Hausaufgaben: Kühlung und Kompression am Oberschenkel.",
    ];
    expect(bereinigen({ segments: diktat.map((text) => ({ text: ` ${text}` })) })).toBe(diktat.join(" "));
  });
});
