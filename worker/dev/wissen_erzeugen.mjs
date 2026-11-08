// Erzeugt worker/src/wissen.js aus knowledge/physioworks.md (Praxiswissen für Gabi).
//   node dev/wissen_erzeugen.mjs      (aus dem Ordner worker/)
// Der Test worker/test/chat.test.js prüft, dass beide Dateien zusammenpassen.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const QUELLE = fileURLToPath(new URL("../../knowledge/physioworks.md", import.meta.url));
export const ZIEL = fileURLToPath(new URL("../src/wissen.js", import.meta.url));

export function wissenJs(text = readFileSync(QUELLE, "utf8")) {
  return [
    "// Praxiswissen für Gabi – erzeugt aus knowledge/physioworks.md mit: cd worker && node dev/wissen_erzeugen.mjs",
    "// Bitte nicht von Hand ändern, sondern die Markdown-Datei bearbeiten und neu erzeugen.",
    `export const WISSEN = ${JSON.stringify(text.trim())};`,
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(ZIEL, wissenJs());
  console.log(`geschrieben: ${ZIEL}`);
}
