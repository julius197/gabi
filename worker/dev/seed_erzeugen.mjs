// Erzeugt supabase/seed_test.sql aus den erfundenen Demo-Testdaten (demo.js) – NUR TESTDATEN.
//   node dev/seed_erzeugen.mjs      (aus dem Ordner worker/)
// Der Test worker/test/oberflaeche.test.js prüft, dass die Datei zum Stand von demo.js passt.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalisieren, suchtext } from "../src/notiz.js";

const require = createRequire(import.meta.url);
const DEMO = require("../../demo.js");
export const SEED_DATEI = fileURLToPath(new URL("../../supabase/seed_test.sql", import.meta.url));

const text = (t) => `'${String(t).replace(/'/g, "''")}'`;
const zeitpunkt = (tage, uhr) => `((now() at time zone 'Europe/Berlin')::date - ${Number(tage)} + time '${uhr}') at time zone 'Europe/Berlin'`;

export function seedSql() {
  const nachKuerzel = Object.fromEntries(DEMO.PATIENTEN.map((p) => [p.kuerzel, p]));
  const zeilen = [
    "-- NUR TESTDATEN – alle Patienten, Kürzel und Notizen sind erfunden. Keine echten Patientendaten.",
    "-- Gabi (PhysioWorks) – Beispieldaten für Supabase: 3 Test-Patienten mit je 2 Notizen.",
    "-- Ausführen NACH schema.sql im Supabase-Dashboard unter „SQL Editor“. Kann mehrfach laufen (idempotent).",
    "-- Erzeugt mit: cd worker && node dev/seed_erzeugen.mjs (Quelle: demo.js) – bitte nicht von Hand ändern.",
    "",
    "begin;",
    "",
    "-- Test-Patienten (nur Kürzel und fiktive Beschreibung)",
    "insert into public.patients_test (kuerzel, pseudonym) values",
    DEMO.PATIENTEN.map((p) => `  (${text(p.kuerzel)}, ${text(p.pseudonym)})`).join(",\n"),
    "on conflict (kuerzel) do nothing;",
    "",
    "-- Je 2 Beispielnotizen (feste IDs, damit nichts doppelt angelegt wird)",
  ];
  for (const n of DEMO.NOTIZEN) {
    const p = nachKuerzel[n.kuerzel];
    const strukturiert = normalisieren(n.strukturiert);
    zeilen.push(
      "insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)",
      `select ${text(n.id)}::uuid, id, ${text(n.rohtext)},`,
      `  ${text(JSON.stringify(strukturiert))}::jsonb,`,
      `  ${text(suchtext(p.kuerzel, p.pseudonym, n.rohtext, strukturiert))},`,
      `  ${zeitpunkt(n.tageZurueck, n.uhrzeit)}`,
      `from public.patients_test where kuerzel = ${text(n.kuerzel)}`,
      "on conflict (id) do nothing;",
      "",
    );
  }
  zeilen.push("commit;", "");
  return zeilen.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeFile(SEED_DATEI, seedSql());
  console.log(`geschrieben: ${SEED_DATEI}`);
}
