// Zerlegung der Wissensdatei knowledge/physioworks.md in Seed-Knoten fürs Brain (Bauplan §8).
//   zerlegen(markdown) → { knoten, kanten, fehler }
// Die Wissensdatei wird wirklich gelesen (Abschnitte „##“, Aufzählungspunkte mit Folgezeilen). Der PLAN unten sagt,
// welcher Punkt in welchen Knoten gehört – die Inhalte selbst kommen wörtlich aus der Datei, nichts wird hinzuerfunden.
// Nichts fällt still weg: Ein Punkt ohne Plan-Eintrag, ein Plan-Eintrag ohne Punkt, ein neuer „TODO prüfen“-Satz ohne
// Frage, ein neuer Abschnitt oder eine geänderte Einleitung landen in `fehler` (der Test wird rot und nennt die Stelle).
//
// Regeln der Zerlegung:
// - Jeder Aufzählungspunkt steht wörtlich (Leerraum geglättet, ohne „TODO prüfen.“) in genau einem Knoten.
// - Der offene Satz eines „TODO prüfen“-Punkts steht NUR im zugehörigen Frage-Knoten (status zu_klaeren) – nicht auch
//   im Wissensknoten. So bleibt nach dem Brain-Interview kein veraltetes „nicht angegeben“ neben der Antwort stehen.
// - Sammelknoten (Standorte, Leistungen, …) zählen ihre Mitglieder aus den Knotentiteln auf („Dazu gehören: …“).
// - Zeilen „Siehe auch: [[…]]“ und „Betrifft: [[…]]“ sind Verweise fürs Brain, keine Aussagen der Website.
// Erzeugt wird daraus brain-seed.js: cd worker && node dev/brain_seed_erzeugen.mjs

export const ID_MUSTER = /^[A-Za-z0-9_-]{4,40}$/;
export const TODO = "TODO prüfen";
export const QUELLE_WEB = "physio-works.de";
/** Titel, auf die verwiesen werden darf, obwohl sie kein Seed-Knoten sind (abgeleiteter Knoten, Bauplan §2.1). */
export const FREMDE_TITEL = ["Kernregeln (im Code)"];
export const GRENZEN = { titelMin: 2, titelMax: 120, inhaltMax: 20000, tagsMax: 12, tagMax: 30, quelleMax: 80, persona: 600, regel: 300 };

const glatt = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
/** Vergleichsform für Titel (wie GabiBrain.schluessel): klein, Umlaute gefaltet, Leerraum glatt. */
export const titelSchluessel = (t) => glatt(t).toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "");
/** [[Titel]] bzw. [[Titel|Anzeige]] im Inhalt. */
export const verweiseAus = (inhalt) => [...String(inhalt ?? "").matchAll(/\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g)].map((m) => glatt(m[1]));

// ------------------------------------------------------------------
// PLAN – gepflegt von Hand. Bei einer Änderung der Wissensdatei sagt `fehler`, was hier nachzuziehen ist.
// ------------------------------------------------------------------

/** Wissensknoten: schluessel → Titel, Tags, Anker (Kante gehoert_zu), Verweise. Reihenfolge = Reihenfolge im Seed. */
const KNOTEN = {
  praxis: { titel: "PhysioWorks – die Praxis", tags: ["praxis"] },
  geschichte: { titel: "Geschichte der Praxis", tags: ["praxis", "geschichte"], anker: "praxis" },
  quelle: { titel: "Quelle des Praxiswissens", tags: ["quelle", "website"], anker: "praxis" },

  standorte: { titel: "Standorte", tags: ["standort", "übersicht"], anker: "praxis", sammelt: true },
  "standort-kieslingstrasse": { titel: "Praxis Kieslingstraße", tags: ["standort", "adresse"], anker: "standorte" },
  "standort-thumenberger-weg": { titel: "Praxis Thumenberger Weg", tags: ["standort", "adresse"], anker: "standorte" },

  "kontakt-und-zeiten": { titel: "Kontakt und Zeiten", tags: ["kontakt", "zeiten", "übersicht"], anker: "praxis", sammelt: true },
  kontakt: { titel: "Kontakt", tags: ["kontakt", "telefon", "e-mail"], anker: "kontakt-und-zeiten", sieheAuch: ["telefonzeiten"] },
  telefonzeiten: { titel: "Telefonzeiten", tags: ["kontakt", "zeiten", "telefon"], anker: "kontakt-und-zeiten", sieheAuch: ["kontakt"] },
  trainingszeiten: { titel: "Trainingszeiten", tags: ["zeiten", "training", "mtt"], anker: "kontakt-und-zeiten", sieheAuch: ["leistung-mtt"] },
  termine: { titel: "Termine", tags: ["kontakt", "termine"], anker: "kontakt-und-zeiten", sieheAuch: ["kontakt"] },

  leistungen: { titel: "Leistungen", tags: ["leistung", "übersicht"], anker: "praxis", sammelt: true },
  "leistung-sportphysiotherapie": { titel: "Sportphysiotherapie", tags: ["leistung", "sport"], anker: "leistungen" },
  "leistung-manuelle-therapie": { titel: "Manuelle Therapie", tags: ["leistung", "manuelle-therapie"], anker: "leistungen" },
  "leistung-mtt": { titel: "Medizinische Trainingstherapie (MTT)", tags: ["leistung", "training", "mtt"], anker: "leistungen", sieheAuch: ["trainingszeiten"] },
  "leistung-youngster-training": { titel: "Youngster Training", tags: ["leistung", "training", "kinder", "jugendliche"], anker: "leistungen", sieheAuch: ["standorte"] },
  "leistung-akupunktur": { titel: "Akupunktur", tags: ["leistung", "akupunktur", "schmerz"], anker: "leistungen", sieheAuch: ["team"] },
  "leistung-weitere": { titel: "Weitere Behandlungsmöglichkeiten", tags: ["leistung"], anker: "leistungen" },
  "leistung-osteopathie": { titel: "Osteopathie", tags: ["leistung", "osteopathie", "preis", "selbstzahler"], anker: "leistungen", sieheAuch: ["leistung-weitere"] },

  "partner-und-referenzen": { titel: "Partner und Referenzen", tags: ["partner", "übersicht"], anker: "praxis", sammelt: true },
  "partner-ice-tigers": { titel: "Nürnberg Ice Tigers", tags: ["partner", "eishockey", "profisport"], anker: "partner-und-referenzen", sieheAuch: ["leistung-sportphysiotherapie"] },
  "partner-hockey-bund": { titel: "Deutscher Hockey-Bund", tags: ["partner", "hockey", "profisport"], anker: "partner-und-referenzen" },
  "partner-goldener-ring": { titel: "Der Goldene Ring", tags: ["partner", "profisport"], anker: "partner-und-referenzen" },
  "partner-dasmediabc": { titel: "dasmediABC", tags: ["partner", "fortbildung"], anker: "partner-und-referenzen" },
  "partner-sensopro": { titel: "Sensopro", tags: ["partner", "training"], anker: "partner-und-referenzen" },
  referenzen: { titel: "Referenzen", tags: ["referenz", "profisport"], anker: "partner-und-referenzen", sieheAuch: ["partner-ice-tigers", "partner-goldener-ring"] },

  team: { titel: "Team", tags: ["team", "übersicht"], anker: "praxis", sammelt: true },
  "team-leitung-buero": { titel: "Team – Leitung und Büro", tags: ["team", "leitung", "büro"], anker: "team" },
  "team-physiotherapie": { titel: "Team – Physiotherapie und Manuelle Therapie", tags: ["team", "physiotherapie"], anker: "team" },
  "team-training": { titel: "Team – Training", tags: ["team", "training"], anker: "team" },
};

/**
 * Einleitung der Wissensdatei (Absatz vor dem ersten Abschnitt) → Knoten „Quelle des Praxiswissens“.
 * Der Satz über „TODO prüfen“ beschreibt die Schreibweise der Datei; im Brain heißt das „Zu klären“. Alles davor bleibt
 * wörtlich (auch ein neues Lesedatum fließt so durch).
 */
const EINLEITUNG = {
  knoten: "quelle",
  entfaellt: "Punkte mit „TODO prüfen“ sind auf der Website nicht eindeutig und müssen von der Praxis bestätigt werden – Gabi sagt das dann so.",
  dafuer: "Was dort nicht eindeutig steht, ist im Brain als „Zu klären“ markiert und muss von der Praxis bestätigt werden.",
};

/**
 * Jeder Aufzählungspunkt der Wissensdatei: Abschnitt + Anfang des Punkts → Knoten.
 * offen: der Satz vor „TODO prüfen.“ (wörtlich) und der Frage-Knoten dazu. Fehlt `knoten`, ist der ganze Punkt offen.
 * auszuege: wörtliche Ausschnitte desselben Punkts, die zusätzlich ein eigener Knoten werden.
 *   Mit `verweis` (Text vor dem Verweis): im Punkt-Knoten steht statt des Ausschnitts nur „<verweis> [[Titel des Auszug-Knotens]]“ –
 *   der Auszug-Knoten ist dann die EINZIGE Quelle dieser Angabe (so steht z. B. ein Preis nur einmal im Brain, D12).
 */
const PUNKTE = [
  { abschnitt: "Praxis", anfang: "Name:", knoten: "praxis" },
  { abschnitt: "Praxis", anfang: "Inhaber:", knoten: "praxis" },
  { abschnitt: "Praxis", anfang: "Gegründet", knoten: "geschichte" },
  { abschnitt: "Praxis", anfang: "Schwerpunkte", knoten: "praxis" },
  { abschnitt: "Praxis", anfang: "Für wen:", knoten: "praxis" },
  { abschnitt: "Praxis", anfang: "Philosophie:", knoten: "praxis" },
  { abschnitt: "Praxis", anfang: "Abrechnung:", knoten: "praxis",
    offen: { text: "Ob gesetzlich Versicherte behandelt werden und wie abgerechnet wird, steht nicht auf der Website.", frage: "frage-abrechnung" } },

  { abschnitt: "Standorte", anfang: "Praxis Kieslingstraße:", knoten: "standort-kieslingstrasse" },
  { abschnitt: "Standorte", anfang: "Praxis Thumenberger Weg:", knoten: "standort-thumenberger-weg" },
  { abschnitt: "Standorte", anfang: "Beide mit", knoten: "standorte",
    offen: { text: "Parken und Barrierefreiheit: nicht angegeben.", frage: "frage-parken" } },
  { abschnitt: "Standorte", anfang: "Welche Leistung",
    offen: { text: "Welche Leistung an welchem Standort angeboten wird: nicht angegeben.", frage: "frage-leistung-standort" } },

  { abschnitt: "Kontakt und Zeiten", anfang: "Telefon:", knoten: "kontakt" },
  { abschnitt: "Kontakt und Zeiten", anfang: "Telefonisch erreichbar:", knoten: "telefonzeiten" },
  { abschnitt: "Kontakt und Zeiten", anfang: "Öffnungszeiten der Praxen",
    offen: { text: "Öffnungszeiten der Praxen selbst: nicht angegeben (nur die Telefonzeiten).", frage: "frage-oeffnungszeiten" } },
  { abschnitt: "Kontakt und Zeiten", anfang: "Trainingszeiten", knoten: "trainingszeiten" },
  { abschnitt: "Kontakt und Zeiten", anfang: "Termine:", knoten: "termine" },

  { abschnitt: "Leistungen", anfang: "Sportphysiotherapie:", knoten: "leistung-sportphysiotherapie" },
  { abschnitt: "Leistungen", anfang: "Manuelle Therapie:", knoten: "leistung-manuelle-therapie" },
  { abschnitt: "Leistungen", anfang: "Medizinische Trainingstherapie (MTT):", knoten: "leistung-mtt" },
  { abschnitt: "Leistungen", anfang: "Youngster Training:", knoten: "leistung-youngster-training",
    offen: { text: "Preis und Standort: nicht angegeben.", frage: "frage-youngster" } },
  { abschnitt: "Leistungen", anfang: "Akupunktur:", knoten: "leistung-akupunktur",
    offen: { text: "Ob sie alle Behandlungen durchführt: nicht angegeben.", frage: "frage-akupunktur" } },
  { abschnitt: "Leistungen", anfang: "Weitere Behandlungsmöglichkeiten:", knoten: "leistung-weitere",
    auszuege: [{ text: "Osteopathie (soweit in der Physiotherapie erlaubt; Selbstzahlerleistung, 85 € pro Behandlungseinheit)", knoten: "leistung-osteopathie", verweis: "Osteopathie (siehe" }] },
  { abschnitt: "Leistungen", anfang: "Preise der übrigen Leistungen",
    offen: { text: "Preise der übrigen Leistungen und ob ein Rezept nötig ist: nicht angegeben.", frage: "frage-preise-rezept" } },

  { abschnitt: "Partner und Referenzen (laut Website)", anfang: "Nürnberg Ice Tigers", knoten: "partner-ice-tigers" },
  { abschnitt: "Partner und Referenzen (laut Website)", anfang: "Deutscher Hockey-Bund:", knoten: "partner-hockey-bund" },
  { abschnitt: "Partner und Referenzen (laut Website)", anfang: "Der Goldene Ring", knoten: "partner-goldener-ring" },
  { abschnitt: "Partner und Referenzen (laut Website)", anfang: "dasmediABC", knoten: "partner-dasmediabc" },
  { abschnitt: "Partner und Referenzen (laut Website)", anfang: "Sensopro", knoten: "partner-sensopro" },
  { abschnitt: "Partner und Referenzen (laut Website)", anfang: "Philipp Engelhardt hat laut Website", knoten: "referenzen" },

  { abschnitt: "Team (laut Website)", anfang: "Philipp Engelhardt – Inhaber", knoten: "team-leitung-buero" },
  { abschnitt: "Team (laut Website)", anfang: "Gabi Diem", knoten: "team-leitung-buero" },
  { abschnitt: "Team (laut Website)", anfang: "Büro:", knoten: "team-leitung-buero" },
  { abschnitt: "Team (laut Website)", anfang: "Physiotherapie und Manuelle Therapie:", knoten: "team-physiotherapie" },
  { abschnitt: "Team (laut Website)", anfang: "Training:", knoten: "team-training" },
];

/** Die offenen Punkte als Fragen an die Praxis – so, wie man sie Philipp stellen würde. betrifft: Knoten-Schlüssel. */
const FRAGEN = {
  "frage-abrechnung": { titel: "Behandelt ihr auch gesetzlich Versicherte – und wie rechnet ihr ab?", tags: ["zu-klaeren", "abrechnung", "krankenkasse"], betrifft: ["praxis"] },
  "frage-parken": { titel: "Gibt es an den Standorten Parkplätze – und sind die Praxen barrierefrei?", tags: ["zu-klaeren", "standort", "parken", "barrierefreiheit"], betrifft: ["standorte", "standort-kieslingstrasse", "standort-thumenberger-weg"] },
  "frage-leistung-standort": { titel: "Welche Leistung bietet ihr an welchem Standort an?", tags: ["zu-klaeren", "standort", "leistung"], betrifft: ["standorte", "leistungen"] },
  "frage-oeffnungszeiten": { titel: "Wann sind die Praxen selbst geöffnet?", tags: ["zu-klaeren", "zeiten", "öffnungszeiten"], betrifft: ["kontakt-und-zeiten", "telefonzeiten"] },
  "frage-youngster": { titel: "Was kostet das Youngster Training – und an welchem Standort findet es statt?", tags: ["zu-klaeren", "preis", "youngster-training"], betrifft: ["leistung-youngster-training"] },
  "frage-akupunktur": { titel: "Führt Dr. med. Rebecca Pohle alle Akupunktur-Behandlungen selbst durch?", tags: ["zu-klaeren", "akupunktur"], betrifft: ["leistung-akupunktur"] },
  "frage-preise-rezept": { titel: "Was kosten die übrigen Leistungen – und braucht man dafür ein Rezept?", tags: ["zu-klaeren", "preis", "rezept"], betrifft: ["leistungen"] },
};

/**
 * Persona und zusätzliche Regeln – nicht aus der Wissensdatei, sondern von uns (quelle „Julius“).
 * Regeln hier dürfen Gabi nur zusätzlich einschränken oder den Ton ergänzen; die Kernregeln stehen im Worker-Code.
 */
const EIGENE = [
  {
    schluessel: "persona-gabi", art: "persona", titel: "Wer ist Gabi", status: "bestaetigt", tags: ["gabi", "persona"], anker: "praxis",
    inhalt: [
      "- Name: Gabi – die digitale Assistenz von PhysioWorks (nicht die Praxismanagerin Gabi Diem).",
      "- Ton: Deutsch, per Du, kurz und freundlich – wie eine erfahrene Kollegin.",
      "- Aufgabe: Behandlungen dokumentieren, Notizen wiederfinden, Berichte vorbereiten und Fragen zur Praxis aus dem Brain beantworten.",
      "- Grenzen: Gabi stellt keine Diagnosen, gibt keine Empfehlungen und erfindet nichts. Sie speichert, ändert und löscht nie selbst – sie schlägt vor, du entscheidest. Maßgeblich sind die [[Kernregeln (im Code)]].",
    ].join("\n"),
  },
  {
    schluessel: "regel-preise-zeiten", art: "regel", titel: "Preise und Zeiten genau wiedergeben", status: "bestaetigt", tags: ["regel", "preis", "zeiten"], anker: "persona-gabi",
    inhalt: "Preise, Öffnungs- und Trainingszeiten gibst du genau so wieder, wie sie im Brain stehen – nicht runden, nichts zusammenziehen. Steht dabei, von wann die Angabe ist, sag es dazu.",
  },
  {
    schluessel: "regel-kurz", art: "regel", titel: "Kurz antworten, dann nachfragen", status: "bestaetigt", tags: ["regel", "ton"], anker: "persona-gabi",
    inhalt: "Antworten zur Praxis: höchstens fünf Zeilen. Gibt es mehr zu sagen, biete an, ins Detail zu gehen.",
  },
  {
    schluessel: "regel-termine", art: "regel", titel: "Bei Terminwünschen auf Telefon und E-Mail verweisen", status: "entwurf", tags: ["regel", "termine"], anker: "persona-gabi",
    inhalt: "Fragt jemand nach einem Termin, nenne Telefon und E-Mail der Praxis. Termine vergibt Gabi nicht.",
  },
];

/**
 * Zusatz nur für den Demo-Modus – erfunden und als Beispiel erkennbar (quelle „Demo“). Zeiten als „Tage zurück“,
 * das Brain rechnet sie beim Einspielen in Zeitstempel um.
 */
export const DEMO = {
  knoten: [
    {
      id: "s-demo-hausbesuche", seed: "demo-hausbesuche", art: "praxiswissen", titel: "Hausbesuche (Beispiel-Entwurf)",
      inhalt: "Erfundenes Beispiel für die Demo – kein echtes Praxiswissen: Hausbesuche nach Absprache, Anfahrt bis 10 km.\n\nSiehe auch: [[Leistungen]]",
      tags: ["demo", "hausbesuch"], status: "entwurf", quelle: "Demo",
    },
    {
      id: "s-demo-vorlage-bericht", seed: "demo-vorlage-bericht", art: "vorlage", titel: "Aufbau Verlaufsbericht (Beispiel-Vorlage)",
      inhalt: "Erfundenes Beispiel für die Demo: Aufbau eines Verlaufsberichts.\n\n- Anlass der Behandlung\n- Verlauf je Termin\n- Aktueller Stand\n- Hausaufgaben\n- Offene Punkte\n\nSiehe auch: [[PhysioWorks – die Praxis]]",
      tags: ["demo", "bericht", "vorlage"], status: "entwurf", quelle: "Demo",
    },
  ],
  // Fragen, die Gabi in der Demo „nicht aus dem Brain beantworten konnte“
  luecken: [
    { frage: "Kann man bei euch mit Karte zahlen?", anzahl: 3, tageZurueck: 1, erstmalsTageZurueck: 6 },
    { frage: "Gibt es eine Warteliste für neue Termine?", anzahl: 2, tageZurueck: 2, erstmalsTageZurueck: 9 },
    { frage: "Bietet ihr auch Videotermine an?", anzahl: 1, tageZurueck: 4, erstmalsTageZurueck: 4 },
  ],
  // „von Gabi verwendet“: Knoten-ID → Anzahl und letzte Verwendung
  nutzung: {
    "s-kontakt": { anzahl: 9, tageZurueck: 0 },
    "s-telefonzeiten": { anzahl: 7, tageZurueck: 0 },
    "s-standort-kieslingstrasse": { anzahl: 6, tageZurueck: 1 },
    "s-standort-thumenberger-weg": { anzahl: 4, tageZurueck: 1 },
    "s-leistungen": { anzahl: 5, tageZurueck: 2 },
    "s-trainingszeiten": { anzahl: 5, tageZurueck: 2 },
    "s-leistung-mtt": { anzahl: 4, tageZurueck: 3 },
    "s-praxis": { anzahl: 3, tageZurueck: 6 },
    "s-leistung-osteopathie": { anzahl: 3, tageZurueck: 5 },
    "s-termine": { anzahl: 2, tageZurueck: 4 },
    "s-leistung-akupunktur": { anzahl: 2, tageZurueck: 8 },
  },
  // „veraltet (> 90 Tage)“: Knoten-ID → zuletzt geändert vor so vielen Tagen (so liest es brain.js beim Einspielen)
  veraltet: {
    "s-partner-sensopro": 140,
    "s-team-training": 120,
  },
};

// ------------------------------------------------------------------
// Wissensdatei lesen
// ------------------------------------------------------------------

/** Markdown der Wissensdatei → Einleitung und Abschnitte mit Aufzählungspunkten (Folgezeilen angehängt, Leerraum glatt). */
export function lesen(markdown) {
  const fehler = [];
  const abschnitte = [];
  const einleitung = [];
  let titel = "";
  let abschnitt = null;
  let punkt = null; // letzter Aufzählungspunkt – nimmt eingerückte Folgezeilen auf
  String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n").forEach((roh, i) => {
    const nr = i + 1;
    const zeile = roh.replace(/\s+$/, "");
    if (!zeile.trim()) { punkt = null; return; }
    if (/^# /.test(zeile)) {
      if (titel || abschnitt) fehler.push(`Zeile ${nr}: zweite Hauptüberschrift „${glatt(zeile.slice(2))}“ – der Plan kennt nur eine.`);
      else titel = glatt(zeile.slice(2));
      punkt = null;
      return;
    }
    if (/^## /.test(zeile)) {
      abschnitt = { titel: glatt(zeile.slice(3)), zeile: nr, punkte: [] };
      abschnitte.push(abschnitt);
      punkt = null;
      return;
    }
    if (/^#{3,}/.test(zeile)) { fehler.push(`Zeile ${nr}: Unterüberschrift „${glatt(zeile)}“ – der Plan kennt nur Abschnitte mit „##“.`); punkt = null; return; }
    if (/^- /.test(zeile)) {
      if (!abschnitt) { fehler.push(`Zeile ${nr}: Aufzählungspunkt vor dem ersten Abschnitt: „${glatt(zeile.slice(2))}“.`); return; }
      punkt = { text: glatt(zeile.slice(2)), zeile: nr };
      abschnitt.punkte.push(punkt);
      return;
    }
    if (/^\s+[-*] /.test(zeile)) { fehler.push(`Zeile ${nr}: eingerückter Unterpunkt „${glatt(zeile)}“ – der Plan kennt nur eine Ebene.`); return; }
    if (/^\s/.test(zeile) && punkt) { punkt.text = glatt(`${punkt.text} ${zeile}`); return; } // Folgezeile
    if (!abschnitt) { einleitung.push(glatt(zeile)); return; }
    fehler.push(`Zeile ${nr}: Text außerhalb eines Aufzählungspunkts im Abschnitt „${abschnitt.titel}“: „${glatt(zeile)}“.`);
  });
  return { titel, einleitung: glatt(einleitung.join(" ")), abschnitte, fehler };
}

const anzahl = (text, stueck) => String(text).split(stueck).length - 1;
const ohneTodo = (text) => glatt(String(text).split(TODO).map((s, i) => (i ? s.replace(/^\./, "") : s)).join(" "));

// ------------------------------------------------------------------
// Zerlegen
// ------------------------------------------------------------------

/**
 * Wissensdatei → Seed-Knoten und -Kanten.
 * knoten: { id, seed, art, titel, inhalt, tags, status, quelle } · kanten: { id, von, nach, art } · fehler: deutsche Sätze.
 */
export function zerlegen(markdown) {
  const gelesen = lesen(markdown);
  const fehler = [...gelesen.fehler];
  const stuecke = Object.fromEntries(Object.keys(KNOTEN).map((k) => [k, []])); // Wissensknoten → wörtliche Stücke
  const offene = {}; // Frage-Schlüssel → offener Satz
  const benutzt = new Set(); // Plan-Einträge, die einen Punkt gefunden haben

  // --- Einleitung → „Quelle des Praxiswissens“
  if (!gelesen.einleitung) fehler.push("Die Einleitung (Absatz mit der Quelle vor dem ersten Abschnitt) fehlt.");
  else if (anzahl(gelesen.einleitung, EINLEITUNG.entfaellt) !== 1) {
    fehler.push(`Die Einleitung hat sich geändert: Der Satz „${EINLEITUNG.entfaellt}“ steht dort nicht mehr genau einmal – Plan (EINLEITUNG) anpassen.`);
  } else {
    const bleibt = glatt(gelesen.einleitung.replace(EINLEITUNG.entfaellt, " "));
    if (!bleibt) fehler.push("Die Einleitung nennt keine Quelle mehr.");
    else if (bleibt.includes(TODO)) fehler.push(`Die Einleitung nennt „${TODO}“ an einer Stelle, die der Plan nicht kennt: „${bleibt}“.`);
    else stuecke[EINLEITUNG.knoten].push(bleibt, EINLEITUNG.dafuer);
  }

  // --- Abschnitte und Punkte
  const bekannteAbschnitte = new Set(PUNKTE.map((p) => p.abschnitt));
  for (const a of gelesen.abschnitte) {
    if (!bekannteAbschnitte.has(a.titel)) {
      fehler.push(`Zeile ${a.zeile}: Abschnitt „${a.titel}“ kennt der Plan nicht (${a.punkte.length} ${a.punkte.length === 1 ? "Punkt" : "Punkte"} ohne Knoten).`);
      continue;
    }
    for (const punkt of a.punkte) {
      const treffer = PUNKTE.filter((p) => p.abschnitt === a.titel && punkt.text.startsWith(p.anfang));
      if (treffer.length !== 1) {
        fehler.push(treffer.length
          ? `Zeile ${punkt.zeile}: Punkt passt auf mehrere Plan-Einträge (${treffer.map((t) => `„${t.anfang}“`).join(", ")}): „${punkt.text}“.`
          : `Zeile ${punkt.zeile}: Punkt ohne Plan-Eintrag im Abschnitt „${a.titel}“: „${punkt.text}“.`);
        continue;
      }
      const plan = treffer[0];
      if (benutzt.has(plan)) { fehler.push(`Zeile ${punkt.zeile}: zweiter Punkt für den Plan-Eintrag „${plan.anfang}“ (${a.titel}): „${punkt.text}“.`); continue; }
      benutzt.add(plan);

      // „TODO prüfen“: genau so viele, wie der Plan Fragen dafür hat (0 oder 1)
      const todos = anzahl(punkt.text, TODO);
      if (todos !== (plan.offen ? 1 : 0)) {
        fehler.push(plan.offen
          ? `Zeile ${punkt.zeile}: Der Plan erwartet hier genau einen „${TODO}“-Satz, die Wissensdatei hat ${todos}: „${punkt.text}“.`
          : `Zeile ${punkt.zeile}: neuer „${TODO}“-Satz ohne Frage im Plan: „${punkt.text}“.`);
        continue;
      }
      let rest = ohneTodo(punkt.text);
      if (plan.offen) {
        if (anzahl(rest, plan.offen.text) !== 1 || !punkt.text.includes(`${plan.offen.text} ${TODO}`)) {
          fehler.push(`Zeile ${punkt.zeile}: Der offene Satz hat sich geändert – erwartet vor „${TODO}“: „${plan.offen.text}“, gefunden: „${punkt.text}“.`);
          continue;
        }
        if (!FRAGEN[plan.offen.frage]) { fehler.push(`Plan: Frage „${plan.offen.frage}“ fehlt in FRAGEN.`); continue; }
        if (offene[plan.offen.frage]) { fehler.push(`Plan: Frage „${plan.offen.frage}“ ist zwei Punkten zugeordnet.`); continue; }
        offene[plan.offen.frage] = plan.offen.text;
        rest = glatt(rest.replace(plan.offen.text, " "));
      }
      // Auszüge mit Verweis: im Punkt-Knoten steht nur der Verweis, die Angabe selbst nur im Auszug-Knoten (eine Quelle)
      let restKnoten = rest;
      for (const auszug of plan.auszuege || []) {
        if (auszug.verweis && anzahl(rest, auszug.text) === 1 && KNOTEN[auszug.knoten]) restKnoten = restKnoten.replace(auszug.text, `${auszug.verweis} [[${KNOTEN[auszug.knoten].titel}]])`);
      }
      if (rest) {
        if (!plan.knoten || !stuecke[plan.knoten]) { fehler.push(`Zeile ${punkt.zeile}: Text ohne Knoten im Plan (Eintrag „${plan.anfang}“): „${rest}“.`); continue; }
        stuecke[plan.knoten].push(restKnoten);
      } else if (plan.knoten) {
        fehler.push(`Zeile ${punkt.zeile}: Der Plan nennt den Knoten „${plan.knoten}“, vom Punkt bleibt aber nichts übrig: „${punkt.text}“.`);
      }
      for (const auszug of plan.auszuege || []) {
        if (!stuecke[auszug.knoten]) fehler.push(`Plan: Auszug-Knoten „${auszug.knoten}“ fehlt in KNOTEN.`);
        else if (anzahl(rest, auszug.text) !== 1) fehler.push(`Zeile ${punkt.zeile}: Der Auszug „${auszug.text}“ steht nicht mehr (genau einmal) im Punkt: „${punkt.text}“.`);
        else stuecke[auszug.knoten].push(auszug.text);
      }
    }
  }
  for (const plan of PUNKTE) if (!benutzt.has(plan)) fehler.push(`Plan-Eintrag ohne Punkt in der Wissensdatei: Abschnitt „${plan.abschnitt}“, Anfang „${plan.anfang}“.`);
  for (const k of Object.keys(FRAGEN)) if (!offene[k] && !fehler.length) fehler.push(`Frage „${k}“ hat keinen offenen Punkt in der Wissensdatei.`);

  // --- Knoten bauen
  const titelVon = (k) => (KNOTEN[k] || FRAGEN[k] || EIGENE.find((e) => e.schluessel === k) || {}).titel || "";
  const verweis = (k) => { if (!titelVon(k)) fehler.push(`Plan: Verweis auf unbekannten Knoten „${k}“.`); return `[[${titelVon(k)}]]`; };
  const knoten = [];
  const kanten = [];
  const kante = (von, nach) => kanten.push({ id: `sk-${von}`, von: `s-${von}`, nach: `s-${nach}`, art: "gehoert_zu" });

  for (const [k, plan] of Object.entries(KNOTEN)) {
    const teile = [];
    if (plan.sammelt) {
      const mitglieder = Object.entries(KNOTEN).filter(([, p]) => p.anker === k).map(([, p]) => p.titel);
      if (mitglieder.length) teile.push(`Dazu gehören: ${mitglieder.join(", ")}.`);
      else fehler.push(`Plan: Sammelknoten „${k}“ hat keine Mitglieder.`);
    }
    const eigene = stuecke[k];
    if (eigene.length === 1) teile.push(eigene[0]);
    else if (eigene.length > 1 && k === EINLEITUNG.knoten) teile.push(eigene.join("\n\n"));
    else if (eigene.length > 1) teile.push(eigene.map((s) => `- ${s}`).join("\n"));
    if (!eigene.length && !plan.sammelt && !fehler.length) fehler.push(`Knoten „${k}“ bekommt keinen Inhalt aus der Wissensdatei.`);
    if (plan.sieheAuch && plan.sieheAuch.length) teile.push(`Siehe auch: ${plan.sieheAuch.map(verweis).join(", ")}`);
    knoten.push({ id: `s-${k}`, seed: k, art: "praxiswissen", titel: plan.titel, inhalt: teile.join("\n\n"), tags: [...plan.tags], status: "bestaetigt", quelle: QUELLE_WEB });
    if (plan.anker) kante(k, plan.anker);
  }
  for (const [k, plan] of Object.entries(FRAGEN)) {
    if (!offene[k]) continue; // schon als Fehler gemeldet
    knoten.push({
      id: `s-${k}`, seed: k, art: "frage", titel: plan.titel,
      inhalt: `${offene[k]}\n\nBetrifft: ${plan.betrifft.map(verweis).join(", ")}`,
      tags: [...plan.tags], status: "zu_klaeren", quelle: QUELLE_WEB,
    });
  }
  for (const e of EIGENE) {
    knoten.push({ id: `s-${e.schluessel}`, seed: e.schluessel, art: e.art, titel: e.titel, inhalt: e.inhalt, tags: [...e.tags], status: e.status, quelle: "Julius" });
    if (e.anker) kante(e.schluessel, e.anker);
  }

  // Formprüfung nur für eine saubere Zerlegung – sonst kämen zu jedem Fehler oben noch Folgefehler dazu
  if (!fehler.length) fehler.push(...pruefen(knoten, kanten));
  return { knoten, kanten, fehler };
}

// ------------------------------------------------------------------
// Prüfen (Formen laut Bauplan §2)
// ------------------------------------------------------------------

/** Formale Prüfung der Seed-Knoten und -Kanten → Liste deutscher Fehlersätze (leer = in Ordnung). */
export function pruefen(knoten, kanten, { fremdeTitel = FREMDE_TITEL } = {}) {
  const fehler = [];
  const ids = new Set();
  const titel = new Map();
  for (const n of knoten) {
    if (!ID_MUSTER.test(n.id)) fehler.push(`Knoten-ID „${n.id}“ passt nicht ins Muster ${ID_MUSTER}.`);
    if (ids.has(n.id)) fehler.push(`Knoten-ID „${n.id}“ kommt doppelt vor.`);
    ids.add(n.id);
    const t = String(n.titel ?? "");
    if (t !== glatt(t) || t.length < GRENZEN.titelMin || t.length > GRENZEN.titelMax) fehler.push(`Titel von „${n.id}“ hat nicht ${GRENZEN.titelMin}–${GRENZEN.titelMax} Zeichen: „${t}“.`);
    if (/[[\]|\u0000-\u001f]/.test(t)) fehler.push(`Titel von „${n.id}“ enthält [ ] | oder Steuerzeichen: „${t}“.`);
    const ts = titelSchluessel(t);
    if (titel.has(ts)) fehler.push(`Titel „${t}“ kommt doppelt vor (${titel.get(ts)} und ${n.id}).`);
    titel.set(ts, n.id);
    if (!String(n.inhalt ?? "").trim()) fehler.push(`Knoten „${n.id}“ hat keinen Inhalt.`);
    if (String(n.inhalt ?? "").length > GRENZEN.inhaltMax) fehler.push(`Inhalt von „${n.id}“ ist länger als ${GRENZEN.inhaltMax} Zeichen.`);
    if (/<\/?[a-z][^>]*>/i.test(String(n.inhalt ?? ""))) fehler.push(`Inhalt von „${n.id}“ enthält HTML.`);
    if (!Array.isArray(n.tags) || n.tags.length > GRENZEN.tagsMax || new Set(n.tags).size !== n.tags.length) fehler.push(`Tags von „${n.id}“: höchstens ${GRENZEN.tagsMax}, keine doppelten.`);
    for (const tag of Array.isArray(n.tags) ? n.tags : []) {
      if (!/^[a-z0-9äöüß-]{1,30}$/.test(tag)) fehler.push(`Tag „${tag}“ von „${n.id}“: nur klein, a–z 0–9 ä ö ü ß und Bindestrich, höchstens ${GRENZEN.tagMax} Zeichen.`);
    }
    if (!["praxiswissen", "regel", "persona", "frage", "vorlage"].includes(n.art)) fehler.push(`Art von „${n.id}“ unbekannt: „${n.art}“.`);
    if (!["bestaetigt", "entwurf", "zu_klaeren"].includes(n.status)) fehler.push(`Status von „${n.id}“ unbekannt: „${n.status}“.`);
    if (!n.quelle || String(n.quelle).length > GRENZEN.quelleMax) fehler.push(`Quelle von „${n.id}“ fehlt oder ist zu lang.`);
    if (n.art === "persona" && n.inhalt.length > GRENZEN.persona) fehler.push(`Persona „${n.id}“ ist länger als ${GRENZEN.persona} Zeichen (${n.inhalt.length}).`);
    if (n.art === "regel" && n.inhalt.length > GRENZEN.regel) fehler.push(`Regel „${n.id}“ ist länger als ${GRENZEN.regel} Zeichen (${n.inhalt.length}).`);
  }
  const fremd = new Set(fremdeTitel.map(titelSchluessel));
  for (const n of knoten) {
    for (const ziel of verweiseAus(n.inhalt)) {
      const ts = titelSchluessel(ziel);
      if (!titel.has(ts) && !fremd.has(ts)) fehler.push(`Verweis [[${ziel}]] in „${n.id}“ zeigt auf keinen Knoten.`);
      if (titel.get(ts) === n.id) fehler.push(`Knoten „${n.id}“ verweist auf sich selbst.`);
    }
  }
  const kantenIds = new Set();
  for (const k of kanten) {
    if (!ID_MUSTER.test(k.id)) fehler.push(`Kanten-ID „${k.id}“ passt nicht ins Muster ${ID_MUSTER}.`);
    if (kantenIds.has(k.id)) fehler.push(`Kanten-ID „${k.id}“ kommt doppelt vor.`);
    kantenIds.add(k.id);
    if (!ids.has(k.von) || !ids.has(k.nach)) fehler.push(`Kante „${k.id}“ zeigt auf einen unbekannten Knoten (${k.von} → ${k.nach}).`);
    if (k.von === k.nach) fehler.push(`Kante „${k.id}“ zeigt auf sich selbst.`);
    if (!["verweis", "gehoert_zu", "notiz_von", "bericht_zu"].includes(k.art)) fehler.push(`Kante „${k.id}“: Art „${k.art}“ unbekannt.`);
  }
  return fehler;
}

/** Demo-Zusatz gegen die Seed-Knoten prüfen (IDs vorhanden, alles als Demo erkennbar) → Fehlerliste. */
export function demoPruefen(knoten, demo = DEMO) {
  const fehler = pruefen([...knoten, ...demo.knoten], []);
  const ids = new Set(knoten.map((n) => n.id));
  for (const n of demo.knoten) {
    if (n.quelle !== "Demo") fehler.push(`Demo-Knoten „${n.id}“ braucht die Quelle „Demo“.`);
    if (!/Beispiel/.test(n.titel) || !/Erfundenes Beispiel/.test(n.inhalt)) fehler.push(`Demo-Knoten „${n.id}“ ist nicht als Beispiel erkennbar.`);
    if (n.status !== "entwurf") fehler.push(`Demo-Knoten „${n.id}“ muss ein Entwurf sein.`);
    if (ids.has(n.id)) fehler.push(`Demo-Knoten „${n.id}“ gibt es schon im Seed.`);
  }
  for (const id of [...Object.keys(demo.nutzung), ...Object.keys(demo.veraltet)]) if (!ids.has(id)) fehler.push(`Demo-Zusatz nennt den unbekannten Knoten „${id}“.`);
  for (const [id, n] of Object.entries(demo.nutzung)) if (!(Number.isInteger(n.anzahl) && n.anzahl > 0 && Number.isInteger(n.tageZurueck) && n.tageZurueck >= 0)) fehler.push(`Demo-Nutzung von „${id}“ ist ungültig.`);
  for (const [id, tage] of Object.entries(demo.veraltet)) if (!(Number.isInteger(tage) && tage > 90)) fehler.push(`Demo: „${id}“ soll veraltet sein, also mehr als 90 Tage zurück.`);
  for (const l of demo.luecken) {
    if (!glatt(l.frage) || l.frage.length > 200 || !/\?$/.test(l.frage)) fehler.push(`Demo-Lücke ist keine kurze Frage: „${l.frage}“.`);
    if (!(Number.isInteger(l.anzahl) && l.anzahl > 0 && Number.isInteger(l.tageZurueck) && l.tageZurueck >= 0 && Number.isInteger(l.erstmalsTageZurueck) && l.erstmalsTageZurueck >= l.tageZurueck)) fehler.push(`Demo-Lücke „${l.frage}“: Zahlen ungültig.`);
  }
  return fehler;
}
