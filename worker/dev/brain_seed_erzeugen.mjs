// Erzeugt brain-seed.js – der Seed fürs Brain (Bauplan §8):
//   - Knoten und Kanten aus knowledge/physioworks.md (Zerlegungsplan: knowledge/brain_zerlegung.mjs)
//   - Kernregeln samt Hinweis aus worker/src/kernregeln.js (nur zum Anzeigen: Knoten „Kernregeln (im Code)“)
//   - Fähigkeiten-Register und Berechtigungsstufen aus worker/src/faehigkeiten.js (für die Ansicht „Fähigkeiten“)
//   - Phasen aus ASSISTENT-ROADMAP.md (Überschriften „## Phase N – Titel“)
//   - Demo-Zusatz (erfunden, nur im Demo-Modus)
//   node dev/brain_seed_erzeugen.mjs      (aus dem Ordner worker/)
// Der Test worker/test/brain-seed.test.js prüft, dass Datei und Quellen zusammenpassen.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO, demoPruefen, zerlegen } from "../../knowledge/brain_zerlegung.mjs";
import * as REGELN from "../src/kernregeln.js";
import * as REGISTER from "../src/faehigkeiten.js";

export const QUELLE = fileURLToPath(new URL("../../knowledge/physioworks.md", import.meta.url));
export const ROADMAP = fileURLToPath(new URL("../../ASSISTENT-ROADMAP.md", import.meta.url));
export const ZIEL = fileURLToPath(new URL("../../brain-seed.js", import.meta.url));
export const PHASEN_ANZAHL = 8;

/** Phasen der Roadmap: Überschriften „## Phase N – Titel“ → [{ nr, titel }]. */
export function phasenAus(roadmap) {
  return [...String(roadmap ?? "").matchAll(/^## Phase (\d+) – (.+?)[ \t]*$/gm)].map((m) => ({ nr: Number(m[1]), titel: m[2] }));
}

/** Nur Daten: Zeichenketten, Zahlen, Wahrheitswerte, Listen, einfache Objekte – Funktionen, Muster u. Ä. fallen weg. */
function nurDaten(wert) {
  if (wert === null || ["string", "number", "boolean"].includes(typeof wert)) return wert;
  if (Array.isArray(wert)) return wert.map(nurDaten).filter((x) => x !== undefined);
  if (typeof wert === "object" && Object.getPrototypeOf(wert) === Object.prototype) {
    return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, nurDaten(v)]).filter(([, v]) => v !== undefined));
  }
  return undefined;
}

/**
 * Alle Daten des Seeds. Wirft mit einer deutschen Liste, wenn etwas nicht zusammenpasst – eine Seed-Datei mit Lücken
 * wird nie geschrieben.
 */
export function seedDaten({ wissen = readFileSync(QUELLE, "utf8"), roadmap = readFileSync(ROADMAP, "utf8"), kernregeln = REGELN.KERNREGELN, kernregelnHinweis = REGELN.KERNREGELN_HINWEIS, faehigkeiten = REGISTER.FAEHIGKEITEN, stufen = REGISTER.STUFEN, stufenText = REGISTER.STUFEN_TEXT, demo = DEMO } = {}) {
  const { knoten, kanten, fehler } = zerlegen(wissen);
  const alle = [...fehler];
  if (!fehler.length) alle.push(...demoPruefen(knoten, demo));
  const phasen = phasenAus(roadmap);
  if (phasen.length !== PHASEN_ANZAHL || phasen.some((p, i) => p.nr !== i + 1 || !p.titel)) {
    alle.push(`ASSISTENT-ROADMAP.md: erwartet werden genau die Überschriften „## Phase 1 – …“ bis „## Phase ${PHASEN_ANZAHL} – …“ (gefunden: ${phasen.map((p) => p.nr).join(", ") || "keine"}).`);
  }
  const text = (x) => typeof x === "string" && x.trim().length > 0;
  if (!Array.isArray(kernregeln) || !kernregeln.length || kernregeln.some((r) => !r || !text(r.id) || !text(r.titel) || !text(r.text))) {
    alle.push("worker/src/kernregeln.js: KERNREGELN muss eine Liste aus { id, titel, text } sein.");
  }
  if (!Array.isArray(faehigkeiten) || !faehigkeiten.length || faehigkeiten.some((f) => !f || !text(f.id) || !text(f.name))) {
    alle.push("worker/src/faehigkeiten.js: FAEHIGKEITEN muss eine Liste mit { id, name, … } sein.");
  }
  if (alle.length) throw new Error(`Seed nicht erzeugt – bitte zuerst beheben:\n- ${alle.join("\n- ")}`);
  const daten = {
    knoten,
    kanten,
    kernregeln: kernregeln.map((r) => ({ id: r.id, titel: r.titel, text: r.text })),
    kernregelnHinweis: typeof kernregelnHinweis === "string" ? kernregelnHinweis : "", // Satz unter dem Knoten „Kernregeln (im Code)“
    faehigkeiten: nurDaten(faehigkeiten),
    // Berechtigungsstufen in der Reihenfolge des Registers, mit dem Satz in einfacher Sprache
    stufen: (Array.isArray(stufen) ? stufen : []).filter(text).map((id) => ({ id, text: stufenText && text(stufenText[id]) ? stufenText[id] : "" })),
    phasen,
    demo: nurDaten(demo),
  };
  // kurzer Hash über den Inhalt: ändert sich die Wissensdatei (oder Plan, Regeln, Register), ändert sich die Version
  const version = createHash("sha256").update(JSON.stringify(daten)).digest("hex").slice(0, 12);
  return { version, ...daten };
}

/** Inhalt von brain-seed.js (UMD wie kern.js: im Browser self.GabiBrainSeed, in Node module.exports). */
export function seedJs(optionen) {
  const daten = seedDaten(optionen);
  return [
    "/* Gabi Brain – Seed. ERZEUGT – nicht von Hand ändern.",
    "   Quellen: knowledge/physioworks.md (Plan: knowledge/brain_zerlegung.mjs), worker/src/kernregeln.js,",
    "   worker/src/faehigkeiten.js, ASSISTENT-ROADMAP.md. Neu erzeugen: cd worker && node dev/brain_seed_erzeugen.mjs",
    "   knoten/kanten: Praxiswissen als Startbestand · kernregeln: nur zum Anzeigen (gelten im Worker-Code) ·",
    "   faehigkeiten/stufen/phasen: für die Ansicht „Fähigkeiten“ · demo: erfundene Zusätze, nur im Demo-Modus. */",
    "(function (wurzel, fabrik) {",
    '  if (typeof module === "object" && module.exports) module.exports = fabrik();',
    "  else wurzel.GabiBrainSeed = fabrik();",
    '})(typeof self !== "undefined" ? self : this, function () {',
    '  "use strict";',
    `  return ${JSON.stringify(daten, null, 2).replace(/\n/g, "\n  ")};`,
    "});",
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(ZIEL, seedJs());
  console.log(`geschrieben: ${ZIEL}`);
}
