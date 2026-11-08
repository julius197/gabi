// Erzeugt supabase/seed_test.sql und supabase/reset_test.sql aus den erfundenen Demo-Testdaten (demo.js) – NUR TESTDATEN.
//   node dev/seed_erzeugen.mjs      (aus dem Ordner worker/)
// Der Test worker/test/oberflaeche.test.js prüft, dass beide Dateien zum Stand von demo.js passen.
// reset_test.sql wird NIE automatisch ausgeführt – nur von Hand im Supabase-Dashboard, nach Julius' OK.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalisieren, suchtext } from "../src/notiz.js";

const require = createRequire(import.meta.url);
const DEMO = require("../../demo.js");
export const SEED_DATEI = fileURLToPath(new URL("../../supabase/seed_test.sql", import.meta.url));
export const RESET_DATEI = fileURLToPath(new URL("../../supabase/reset_test.sql", import.meta.url));

const text = (t) => `'${String(t).replace(/'/g, "''")}'`;
const zeitpunkt = (tage, uhr) => `((now() at time zone 'Europe/Berlin')::date - ${Number(tage)} + time '${uhr}') at time zone 'Europe/Berlin'`;

/** Die 3 Test-Patienten mit je 2 Beispielnotizen (gleicher Stand für seed_test.sql und reset_test.sql). */
function einfuegen() {
  const nachKuerzel = Object.fromEntries(DEMO.PATIENTEN.map((p) => [p.kuerzel, p]));
  const zeilen = [
    "-- Test-Patienten (nur Kürzel und fiktive Beschreibung; feste IDs wie in demo.js – so bleiben offene Entwürfe",
    "-- nach einem Zurücksetzen speicherbar; gibt es das Kürzel schon, bleibt der vorhandene Eintrag)",
    "insert into public.patients_test (id, kuerzel, pseudonym) values",
    DEMO.PATIENTEN.map((p) => `  (${text(p.id)}::uuid, ${text(p.kuerzel)}, ${text(p.pseudonym)})`).join(",\n"),
    "on conflict do nothing;",
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
  return zeilen;
}

export function seedSql() {
  return [
    "-- NUR TESTDATEN – alle Patienten, Kürzel und Notizen sind erfunden. Keine echten Patientendaten.",
    "-- Gabi (PhysioWorks) – Beispieldaten für Supabase: 3 Test-Patienten mit je 2 Notizen.",
    "-- Ausführen NACH schema.sql im Supabase-Dashboard unter „SQL Editor“. Kann mehrfach laufen (idempotent).",
    "-- Erzeugt mit: cd worker && node dev/seed_erzeugen.mjs (Quelle: demo.js) – bitte nicht von Hand ändern.",
    "",
    "begin;",
    "",
    ...einfuegen(),
    "commit;",
    "",
  ].join("\n");
}

/** Testdaten zurücksetzen: ALLES löschen, dann der Stand von seed_test.sql – in einer Transaktion. */
export function resetSql() {
  const warnung = "-- ⚠️ ACHTUNG: löscht ALLE Daten. Nur für Testumgebung. Vor Ausführen Bestätigung durch Julius.";
  return [
    warnung,
    warnung,
    "-- ==========================================================================================",
    "-- Gabi (PhysioWorks) – Testdaten zurücksetzen:",
    "--   1. löscht ALLE Notizen (public.notes) und ALLE Test-Patienten (public.patients_test),",
    "--   2. legt danach die 3 Seed-Patienten TP-01, TP-02, TP-03 mit je 2 Beispielnotizen neu an –",
    "--      genau der Stand von seed_test.sql.",
    "-- NUR TESTDATEN. Nie automatisch ausführen – nur von Hand im Supabase-Dashboard („SQL Editor“), nach Julius' OK.",
    "-- Supabase fragt bei „delete“ ohne „where“ nach („destructive operation“) – dann „Run this query“ bestätigen.",
    "-- Alles in einer Transaktion: Schlägt ein Schritt fehl, bleibt der alte Stand vollständig erhalten.",
    "-- Gespräche in den Browsern bleiben. Die Test-Patienten bekommen feste IDs (wie in demo.js): offene Entwürfe zu",
    "--   TP-01 bis TP-03 lassen sich danach weiter speichern – außer beim ersten Zurücksetzen nach v2.1 (vorher hatten die",
    "--   Patienten zufällige IDs). Entwürfe zu anderen, jetzt gelöschten Test-Patienten nicht. Links auf gelöschte Notizen",
    "--   zeigen „Notiz nicht gefunden“.",
    "-- Erzeugt mit: cd worker && node dev/seed_erzeugen.mjs (Quelle: demo.js) – bitte nicht von Hand ändern.",
    "-- ==========================================================================================",
    "",
    "begin;",
    "",
    "-- 1. Alles löschen (Notizen zuerst – über „on delete cascade“ gingen sie auch mit den Patienten)",
    "delete from public.notes;",
    "delete from public.patients_test;",
    "",
    "-- 2. Seed-Stand neu anlegen",
    ...einfuegen(),
    "commit;",
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeFile(SEED_DATEI, seedSql());
  await writeFile(RESET_DATEI, resetSql());
  console.log(`geschrieben: ${SEED_DATEI}\ngeschrieben: ${RESET_DATEI}`);
}
