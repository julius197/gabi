/* Gabi – Demo-Modus: die App läuft komplett im Browser mit erfundenen Testdaten. Nichts wird an einen Server gesendet.
   Aktiv mit ?demo=1 oder automatisch, wenn kein Backend erreichbar oder eingerichtet ist.
   Enthält auch einen Demo-Assistenten (ohne KI): erkennt einfache Absichten, nutzt dieselben Werkzeuge wie der Worker
   und antwortet live – im Browser und im lokalen Server ohne KI-Schlüssel (worker/dev/lokal.mjs).
   Dieselben Testdaten nutzt worker/dev/seed_erzeugen.mjs für supabase/seed_test.sql.
   NUR TESTDATEN: alle Patienten, Kürzel und Notizen sind erfunden. */
(function (wurzel, fabrik) {
  const modul = fabrik();
  if (typeof module === "object" && module.exports) module.exports = modul;
  else wurzel.GabiDemo = modul;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAG_MS = 86400000;
  const ABSCHNITTE = ["befund", "massnahmen", "verlauf", "hausaufgaben"];
  const MAX_ROHTEXT = 50000;
  const DEMO_HINWEIS = "Demo-Modus: Beispiel-Zuordnung ohne KI – bitte prüfen";

  // ------------------------------------------------------------------
  // Erfundene Test-Patienten und Notizen (nur Kürzel/Pseudonyme)
  // ------------------------------------------------------------------
  const PATIENTEN = [
    { id: "7e3c1a52-0001-4000-8000-000000000001", kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)" },
    { id: "7e3c1a52-0002-4000-8000-000000000002", kuerzel: "TP-02", pseudonym: "Testfall Schulter links (fiktiv)" },
    { id: "7e3c1a52-0003-4000-8000-000000000003", kuerzel: "TP-03", pseudonym: "Testfall LWS (fiktiv)" },
  ];

  const NOTIZEN = [
    {
      id: "7e3c1a52-0101-4000-8000-000000000101", kuerzel: "TP-01", tageZurueck: 9, uhrzeit: "08:30",
      rohtext: "Patientin kommt zur dritten Behandlung nach vorderer Kreuzbandplastik rechts. Schmerz in Ruhe bei zwei, bei Belastung bei fünf. Flexion aktiv bis 90 Grad, Extension minus 5 Grad. Leichte Schwellung am medialen Gelenkspalt. Wir haben 20 Minuten Lymphdrainage gemacht, dann Patellamobilisation und Quadrizepsaktivierung im Sitzen. Für zu Hause Quadrizeps anspannen, dreimal zehn Wiederholungen, zweimal täglich. Nächstes Mal Gangschule.",
      strukturiert: {
        befund: ["Diagnose laut Verordnung: Z. n. vorderer Kreuzbandplastik rechts", "3. Behandlung", "Pat.: Schmerz NRS 2 in Ruhe, NRS 5 bei Belastung", "Flexion Knie rechts aktiv bis 90°, Extension -5°", "Leichte Schwellung medialer Gelenkspalt"],
        massnahmen: ["Manuelle Lymphdrainage, 20 min", "Patellamobilisation", "Quadrizepsaktivierung im Sitzen"],
        verlauf: ["Nächster Termin: Gangschule"],
        hausaufgaben: ["Quadrizeps anspannen 3 × 10 Wdh., 2 × täglich"],
        unklar: [],
      },
    },
    {
      id: "7e3c1a52-0102-4000-8000-000000000102", kuerzel: "TP-01", tageZurueck: 2, uhrzeit: "16:10",
      rohtext: "Knie rechts, fünfte Behandlung. Patientin berichtet, Treppensteigen geht besser. Flexion jetzt bis 110 Grad, Extension null. Schwellung deutlich weniger. Gangschule ohne Unterarmgehstützen, dann Beinpresse mit 30 Kilo, dreimal zwölf. Zu Hause Bridging und Wandsitzen, jeweils dreimal fünfzehn, täglich. In zwei Wochen Kontrolle beim Operateur.",
      strukturiert: {
        befund: ["Flexion Knie rechts bis 110°, Extension 0°"],
        massnahmen: ["Gangschule ohne Unterarmgehstützen", "Beinpresse 30 kg, 3 × 12 Wdh."],
        verlauf: ["Pat.: Treppensteigen geht besser", "Schwellung deutlich weniger", "Kontrolle beim Operateur in 2 Wochen"],
        hausaufgaben: ["Bridging 3 × 15 Wdh., täglich", "Wandsitzen 3 × 15 (unklar), täglich"],
        unklar: ["„dreimal fünfzehn“ beim Wandsitzen unklar (Sekunden oder Wiederholungen)"],
      },
    },
    {
      id: "7e3c1a52-0201-4000-8000-000000000201", kuerzel: "TP-02", tageZurueck: 12, uhrzeit: "10:15",
      rohtext: "Schulter links, Erstbefund. Ärztliche Diagnose Impingement-Syndrom. Patient klagt über Schmerzen beim Überkopfarbeiten, NRS sechs. Abduktion aktiv bis 100 Grad, schmerzhafter Bogen zwischen 70 und 110 Grad. Außenrotation kraftgemindert. Manuelle Therapie am Glenohumeralgelenk, 15 Minuten, danach Skapulastabilisation mit Theraband. Hausaufgabe Pendelübungen dreimal täglich.",
      strukturiert: {
        befund: ["Diagnose laut Verordnung: Impingement-Syndrom Schulter links", "Pat.: Schmerz bei Überkopfarbeit, NRS 6", "Abduktion aktiv bis 100°, schmerzhafter Bogen 70–110°", "Außenrotation kraftgemindert"],
        massnahmen: ["Manuelle Therapie Glenohumeralgelenk, 15 min", "Skapulastabilisation mit Theraband"],
        verlauf: ["Erstbefund"],
        hausaufgaben: ["Pendelübungen 3 × täglich"],
        unklar: [],
      },
    },
    {
      id: "7e3c1a52-0202-4000-8000-000000000202", kuerzel: "TP-02", tageZurueck: 5, uhrzeit: "11:40",
      rohtext: "Schulter links. Schmerz beim Überkopfarbeiten jetzt bei vier. Abduktion bis 130 Grad. Triggerpunktbehandlung am Supraspinatus, ähm, Infraspinatus und Mobilisation. Theraband rot, Außenrotation dreimal fünfzehn. Patient soll zu Hause weiter pendeln und neu Außenrotation mit Theraband machen. Nächster Termin Kraft der Rotatorenmanschette testen.",
      strukturiert: {
        befund: ["Abduktion bis 130°"],
        massnahmen: ["Triggerpunktbehandlung Supraspinatus/Infraspinatus (unklar)", "Mobilisation", "Außenrotation mit Theraband rot, 3 × 15 Wdh."],
        verlauf: ["Pat.: Schmerz bei Überkopfarbeit jetzt NRS 4", "Nächster Termin: Kraft Rotatorenmanschette testen"],
        hausaufgaben: ["Pendelübungen weiter", "Neu: Außenrotation mit Theraband"],
        unklar: ["„Supraspinatus, ähm, Infraspinatus“ unklar – welcher Muskel behandelt wurde"],
      },
    },
    {
      id: "7e3c1a52-0301-4000-8000-000000000301", kuerzel: "TP-03", tageZurueck: 20, uhrzeit: "09:00",
      rohtext: "Lendenwirbelsäule, Patientin mit Lumbalgie seit drei Wochen, keine Ausstrahlung ins Bein. Finger-Boden-Abstand 25 Zentimeter. Lasègue negativ beidseits. Muskulärer Hartspann paravertebral lumbal. Wärme zehn Minuten, dann Weichteiltechniken und Mobilisation der LWS in Seitlage. Hausaufgabe Katzenbuckel und Pferderücken, zehn Wiederholungen morgens und abends.",
      strukturiert: {
        befund: ["Pat.: Lumbalgie seit 3 Wochen, keine Ausstrahlung ins Bein", "Finger-Boden-Abstand 25 cm", "Lasègue beidseits negativ", "Muskulärer Hartspann paravertebral lumbal"],
        massnahmen: ["Wärme, 10 min", "Weichteiltechniken", "Mobilisation LWS in Seitlage"],
        verlauf: [],
        hausaufgaben: ["Katzenbuckel/Pferderücken 10 Wdh., morgens und abends"],
        unklar: [],
      },
    },
    {
      id: "7e3c1a52-0302-4000-8000-000000000302", kuerzel: "TP-03", tageZurueck: 6, uhrzeit: "14:20",
      rohtext: "LWS. Patientin berichtet deutlich weniger Schmerzen, NRS zwei. Finger-Boden-Abstand jetzt zehn Zentimeter. Isg links etwas blockiert, ähm, oder rechts, muss ich nochmal schauen. Mobilisation ISG, Stabilisationsübungen für den Rumpf, Unterarmstütz dreimal zwanzig Sekunden. Zu Hause Unterarmstütz täglich ergänzen.",
      strukturiert: {
        befund: ["ISG links oder rechts (unklar) etwas blockiert"],
        massnahmen: ["Mobilisation ISG", "Rumpfstabilisation, Unterarmstütz 3 × 20 s"],
        verlauf: ["Pat.: deutlich weniger Schmerz, NRS 2", "Finger-Boden-Abstand jetzt 10 cm"],
        hausaufgaben: ["Unterarmstütz täglich (ergänzend)"],
        unklar: ["Widerspruch: ISG links oder rechts blockiert", "„Isg“ als „ISG“ gelesen"],
      },
    },
  ];

  // Beispieldiktate für die Fake-Spracherkennung (der Reihe nach) – mit einer Notiz, wie die KI sie schreiben soll
  const DIKTATE = [
    {
      rohtext: "Knie rechts. Patientin berichtet weniger Schmerzen beim Treppensteigen, NRS drei. Flexion bis 115 Grad. 20 Minuten Krankengymnastik am Gerät, Beinpresse 35 Kilo dreimal zwölf. Zu Hause weiter Bridging, dreimal fünfzehn, täglich. Nächstes Mal Stabilisation auf dem Kreisel.",
      strukturiert: {
        befund: ["Flexion Knie rechts bis 115°"],
        massnahmen: ["KG am Gerät, 20 min", "Beinpresse 35 kg, 3 × 12 Wdh."],
        verlauf: ["Pat.: weniger Schmerz beim Treppensteigen, NRS 3", "Nächster Termin: Stabilisation auf dem Kreisel"],
        hausaufgaben: ["Bridging 3 × 15 Wdh., täglich (weiter)"],
        unklar: [],
      },
    },
    {
      rohtext: "Schulter links, Abduktion jetzt 140 Grad, kaum noch schmerzhafter Bogen. Manuelle Therapie 15 Minuten, Kräftigung Rotatorenmanschette mit Theraband grün. Für zu Hause Theraband grün, Außenrotation dreimal fünfzehn, jeden zweiten Tag.",
      strukturiert: {
        befund: ["Abduktion Schulter links bis 140°"],
        massnahmen: ["Manuelle Therapie, 15 min", "Kräftigung Rotatorenmanschette mit Theraband grün"],
        verlauf: ["Kaum noch schmerzhafter Bogen"],
        hausaufgaben: ["Außenrotation mit Theraband grün 3 × 15 Wdh., jeden 2. Tag"],
        unklar: [],
      },
    },
    {
      rohtext: "Halswirbelsäule, Patient mit Nackenschmerzen nach langer Bildschirmarbeit, NRS fünf. Rotation nach links eingeschränkt, nach rechts frei. Triggerpunkt am Trapezius Pass descendens links. Fünfzehn Minuten Massage, danach Dehnung. Hausaufgabe Dehnung Trapezius dreimal täglich, je dreißig Sekunden. Arbeitsplatz ergonomisch überprüfen wurde besprochen.",
      strukturiert: {
        befund: ["Pat.: Nackenschmerz nach langer Bildschirmarbeit, NRS 5", "HWS-Rotation links eingeschränkt, rechts frei", "Triggerpunkt M. trapezius pars descendens links"],
        massnahmen: ["Massage, 15 min", "Dehnung"],
        verlauf: ["Besprochen: Arbeitsplatz ergonomisch überprüfen"],
        hausaufgaben: ["Dehnung M. trapezius 3 × täglich, je 30 s"],
        unklar: ["„Pass descendens“ als „pars descendens“ gelesen"],
      },
    },
    {
      rohtext: "Lendenwirbelsäule. Patientin berichtet, dass das Sitzen im Büro besser geht, NRS drei. Finger-Boden-Abstand fünfzehn Zentimeter. ISG links mobilisiert, danach zwanzig Minuten Rumpfstabilisation auf der Matte. Für zu Hause Beckenkippen und Vierfüßlerstand, dreimal zehn, täglich.",
      strukturiert: {
        befund: ["Pat.: Sitzen im Büro geht besser, NRS 3", "FBA 15 cm"],
        massnahmen: ["Mobilisation ISG links", "Rumpfstabilisation auf der Matte, 20 min"],
        verlauf: [],
        hausaufgaben: ["Beckenkippen und Vierfüßlerstand 3 × 10 Wdh., täglich"],
        unklar: [],
      },
    },
    {
      rohtext: "Patientin berichtet, dass die Übungen zu Hause gut klappen, NRS zwei. Zwanzig Minuten Krankengymnastik mit Kräftigung und Koordination. Hausaufgaben wie besprochen weiter, dreimal pro Woche.",
      strukturiert: {
        befund: ["Pat.: Übungen zu Hause klappen gut, NRS 2"],
        massnahmen: ["KG mit Kräftigung und Koordination, 20 min"],
        verlauf: [],
        hausaufgaben: ["Übungen wie besprochen weiter, 3 × pro Woche"],
        unklar: [],
      },
    },
  ];
  // welches Beispieldiktat zu welchem Pseudonym passt (Index in DIKTATE); sonst das neutrale (letztes)
  const DIKTAT_MUSTER = [/knie/i, /schulter/i, /hws|nacken|halswirbel/i, /lws|lenden|rücken|ruecken|\bisg\b/i];

  // Beispielfragen für die Fake-Spracherkennung im Gespräch (ohne Diktat-Modus)
  const FRAGEN = [
    "Was wollte TP-01 beim letzten Mal?",
    "Welche Hausaufgaben hat TP-02 gerade?",
    "Wo sind die beiden Standorte der Praxis?",
  ];

  // Antworten zur Praxis im Demo-Modus – nur Fakten aus knowledge/physioworks.md (ein Test prüft jede Zahl)
  const PRAXIS = [
    { muster: /standort|adresse|anfahrt|kieslingstra|thumenberger|\bwo\b.*(praxis|ihr|seid)/, text: "PhysioWorks hat zwei Standorte in Nürnberg:\n- Kieslingstraße 82, 90491 Nürnberg\n- Thumenberger Weg 89, 90491 Nürnberg" },
    { muster: /gegründet|seit wann|gründung|inhaber|wem gehört/, text: "PhysioWorks wurde 2011 von Philipp Engelhardt gegründet – er ist bis heute Inhaber der Praxis." },
    { muster: /telefon|erreich|öffnungszeit|geöffnet|anrufen|nummer|e-?mail/, text: "Telefonisch erreichst du die Praxis unter +49 911 23 99 823 (Mo, Di und Do 7:30–17:00, Mi 7:30–15:00, Fr 7:30–16:00 Uhr) oder per E-Mail an info@physio-works.de. Die Öffnungszeiten der Praxen selbst stehen nicht auf der Website." },
    { muster: /profi|sportler|athlet|ice tigers|hockey|olymp|verein/, text: "Laut Website behandelt PhysioWorks alle – vom Schmerzpatienten bis zum Olympia-Athleten. Die Praxis ist offizieller Partner der Nürnberg Ice Tigers und Kooperationspartner des Deutschen Hockey-Bunds." },
    { muster: /rezept|verordnung/, text: "Ob du für eine Behandlung ein Rezept brauchst, steht nicht auf der Website – das muss die Praxis noch bestätigen. Bekannt ist nur: Osteopathie ist eine Selbstzahlerleistung (85 € pro Behandlungseinheit)." },
    { muster: /preis|kosten|kostet|krankenkasse|\bkasse|privat|selbstzahl|osteopath/, text: "Auf der Website steht nur ein Preis: Osteopathie kostet 85 € pro Behandlungseinheit (Selbstzahlerleistung). PhysioWorks nennt sich Privatpraxis – wie sonst abgerechnet wird, muss die Praxis noch bestätigen." },
    { muster: /akupunktur|nadel|dry needling/, text: "Akupunktur gibt es laut Website u. a. bei akuten und chronischen Schmerzen, Arthrose, Kopfschmerz und Migräne – auch als Ohrakupunktur und Dry Needling. Genannt wird Dr. med. Rebecca Pohle." },
    { muster: /youngster|kinder|jugend/, text: "Das Youngster Training ist für Kinder und Jugendliche von 10 bis 16 Jahren: mittwochs je eine Stunde zwischen 14:00 und 19:00 Uhr, höchstens 4 pro Gruppe, mit 10er-Karten." },
    { muster: /trainingstherapie|\bmtt\b|trainingszeit|gerätetraining|trainier|\btraining\b/, text: "Die Medizinische Trainingstherapie beginnt mit einer Funktionsdiagnostik und läuft in Gruppen mit höchstens 4 Personen. Trainingszeiten: Mo–Do 7:00–19:00, Fr 7:00–18:00, Sa 9:00–14:00 Uhr." },
    { muster: /\bteam\b|mitarbeit|kolleg|praxismanag|wer arbeitet|\bdiem\b/, text: "Inhaber ist Philipp Engelhardt, Praxismanagerin ist Gabi Diem. Dazu kommen laut Website viele Kolleginnen und Kollegen aus Physiotherapie, Manueller Therapie, Training und Büro." },
    { muster: /leistung|angebot|bietet|therapien|was macht (die praxis|ihr|physioworks)/, text: "Laut Website bietet PhysioWorks:\n- Sportphysiotherapie\n- Manuelle Therapie\n- Medizinische Trainingstherapie\n- Youngster Training\n- Akupunktur\n\nDazu u. a. Lymphdrainage, Krankengymnastik nach Bobath und PNF, Kiefergelenkstherapie, Osteopathie und Kinesio-Tape." },
  ];

  // ------------------------------------------------------------------
  // Hilfen (wie im Worker: worker/src/notiz.js)
  // ------------------------------------------------------------------
  const glatt = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const leereNotiz = () => ({ befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] });

  function punkte(werte) {
    if (typeof werte === "string") werte = werte.split("\n");
    if (!Array.isArray(werte)) return [];
    const gesehen = new Set();
    const aus = [];
    for (const w of werte) {
      if (typeof w !== "string" && typeof w !== "number") continue;
      const t = glatt(w).replace(/^[-•*–]\s*/, "").replace(/[([]\s*unklar\s*[)\]]/gi, "(unklar)").trim().slice(0, 600);
      const k = t.toLowerCase().replace(/[.;,]+$/, "");
      if (!t || gesehen.has(k)) continue;
      gesehen.add(k);
      aus.push(t);
      if (aus.length >= 30) break;
    }
    return aus;
  }

  function normalisieren(d) {
    const q = d && typeof d === "object" && !Array.isArray(d) ? d : {};
    const n = {};
    for (const k of ABSCHNITTE) n[k] = punkte(q[k]);
    n.unklar = punkte(q.unklar);
    return n;
  }

  const istLeer = (n) => ABSCHNITTE.every((k) => !n[k].length);

  function suchtext(p, rohtext, n) {
    const teile = [p.kuerzel, p.pseudonym, rohtext];
    for (const k of ABSCHNITTE) teile.push(...(n[k] || []));
    teile.push(...(n.unklar || []));
    return teile.filter(Boolean).join("\n").toLowerCase();
  }

  function suchwoerter(q) {
    return String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/)
      .map((w) => w.replace(/^-+|-+$/g, "")).filter((w) => w.length >= 2).slice(0, 5);
  }

  function kuerzelPruefen(roh) {
    const k = String(roh || "").trim().toUpperCase().replace(/\s+/g, "-");
    if (!/^[A-Z0-9-]{2,12}$/.test(k)) return { fehler: "Kürzel: 2–12 Zeichen, nur A–Z, 0–9 und Bindestrich." };
    if (!/[0-9]/.test(k)) return { fehler: "Kürzel braucht mindestens eine Ziffer (z. B. TP-01) – bitte keine Namen." };
    return { kuerzel: k };
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }

  /** Datum einer Beispielnotiz: vor n Tagen um hh:mm (Ortszeit). */
  function datumVor(tage, uhrzeit, jetzt) {
    const d = new Date(jetzt - tage * TAG_MS);
    const [h, m] = uhrzeit.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  /** Einfache Zuordnung ohne KI (nur Demo): Sätze nach Stichwörtern in die Abschnitte. */
  function heuristik(rohtext) {
    const n = leereNotiz();
    // ohne Lookbehind-Regex: ältere iPhone-Safaris würden sonst das ganze Skript nicht laden
    for (const satz of rohtext.replace(/([.!?])\s+/g, "$1\n").split(/\n+/).map(glatt).filter(Boolean)) {
      const k = satz.toLowerCase();
      if (/zu ?hause|hausaufgabe|heimübung/.test(k)) n.hausaufgaben.push(satz);
      else if (/therapie|minuten|behandl|massage|lymph|mobilis|gemacht|übung|training|dehnung|theraband/.test(k)) n.massnahmen.push(satz);
      else if (/nächste|besser|schlechter|weniger|verlauf|termin|kontrolle/.test(k)) n.verlauf.push(satz);
      else n.befund.push(satz);
    }
    n.unklar.push(DEMO_HINWEIS);
    return normalisieren(n);
  }

  /** Notiz zum Transkript: bekannte Beispieldiktate (auch mehrere hintereinander) → passende Notiz, sonst Stichwort-Zuordnung. */
  function demoStrukturieren(rohtext) {
    const zeilen = String(rohtext).split("\n").map(glatt).filter(Boolean);
    const bekannt = zeilen.map((z) => DIKTATE.find((d) => glatt(d.rohtext) === z));
    if (zeilen.length && bekannt.every(Boolean)) {
      const n = leereNotiz();
      for (const d of bekannt) for (const k of Object.keys(n)) n[k].push(...d.strukturiert[k]);
      return normalisieren(n);
    }
    return heuristik(zeilen.join("\n"));
  }

  // ------------------------------------------------------------------
  // Demo-Assistent (ohne KI): gleiche Werkzeuge und Ergebnisformen wie der Worker (worker/src/chat.js)
  // ------------------------------------------------------------------
  const ZONE = "Europe/Berlin";
  const F_KURZ = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const F_LANG = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const F_TEILE = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const anzeigeZeit = (z) => F_KURZ.format(new Date(z));
  const tagBerlin = (z) => {
    const t = Object.fromEntries(F_TEILE.formatToParts(new Date(z)).map((x) => [x.type, x.value]));
    return `${t.year}-${t.month}-${t.day}`;
  };
  const ALLE = [...ABSCHNITTE, "unklar"];
  const TITEL = { befund: "Befund", massnahmen: "Maßnahmen", verlauf: "Verlauf", hausaufgaben: "Hausaufgaben", unklar: "Unklar" };

  const WERKZEUG_NAMEN = ["patienten_auflisten", "notizen_suchen", "notiz_lesen", "heute_ueberblick", "notiz_entwurf_erstellen", "bericht_erstellen"];
  const STATUS = {
    patienten_auflisten: "Schaue in die Patientenliste …",
    notizen_suchen: "Durchsuche die Notizen …",
    notiz_lesen: "Lese die Notiz …",
    heute_ueberblick: "Schaue, was heute anliegt …",
    notiz_entwurf_erstellen: "Strukturiere das Diktat …",
    bericht_erstellen: "Schreibe den Bericht …",
  };

  /** Texte der festen Abläufe – gleich wie im Worker (worker/src/app.js, Route /api/chat). */
  function entwurfText(kuerzel, anzahlUnklar) {
    const n = anzahlUnklar;
    return `Hier ist dein Entwurf für **${kuerzel}**. Prüf ihn kurz – gespeichert wird erst, wenn du auf „Speichern“ tippst.${n ? ` ${n === 1 ? "Schau dir bitte den Punkt unter „Bitte prüfen“ an." : `Schau dir bitte die ${n} Punkte unter „Bitte prüfen“ an.`}` : ""}`;
  }
  function berichtText(art, kuerzel, anzahl) {
    return `${art === "verlauf" ? "Hier ist der Verlaufsbericht" : "Hier ist die Zusammenfassung"} für **${kuerzel}** aus ${anzahl === 1 ? "einer Notiz" : `${anzahl} Notizen`}. Du kannst ${art === "verlauf" ? "ihn" : "sie"} als PDF speichern.`;
  }

  /** Bericht aus den Notizen ohne KI – in derselben Form, wie die Bericht-KI antwortet (Notizen alt → neu). */
  function demoBerichtInhalt({ notizen, art }) {
    const s = notizen.map((n) => normalisieren(n.strukturiert));
    const neueste = s[s.length - 1] || normalisieren({});
    const zusammenfassung = punkte([...neueste.verlauf.slice(0, 2), ...neueste.befund.slice(0, 2), ...neueste.massnahmen.slice(0, 1)]).slice(0, 5);
    const verlauf = art === "verlauf"
      ? s.map((x, i) => ({ nr: i + 1, punkte: punkte([x.befund[0], x.massnahmen[0], x.verlauf[0]].filter(Boolean)).slice(0, 3) })).filter((v) => v.punkte.length)
      : [];
    const mitAufgaben = [...s].reverse().find((x) => x.hausaufgaben.length);
    return { zusammenfassung, verlauf, hausaufgaben: mitAufgaben ? mitAufgaben.hausaufgaben : [], offen: punkte(s.flatMap((x) => x.unklar)).slice(0, 6) };
  }

  /** Wie berichtBauen im Worker: Daten kommen aus den Notizen, ungültige Nummern fallen weg. */
  function berichtBauen({ patient, notizen, art, inhalt, erstellt }) {
    const d = inhalt && typeof inhalt === "object" ? inhalt : {};
    const verlauf = [];
    if (art === "verlauf" && Array.isArray(d.verlauf)) {
      const gesehen = new Set();
      for (const v of d.verlauf) {
        const nr = v && Number.isInteger(v.nr) ? v.nr : NaN;
        if (!(nr >= 1 && nr <= notizen.length) || gesehen.has(nr)) continue;
        const liste = punkte(v.punkte).slice(0, 6);
        if (!liste.length) continue;
        gesehen.add(nr);
        verlauf.push({ nr, notiz_id: notizen[nr - 1].id, datum: notizen[nr - 1].erstellt_am, punkte: liste });
      }
      verlauf.sort((a, b) => a.nr - b.nr);
    }
    return {
      art,
      titel: art === "verlauf" ? "Verlaufsbericht" : "Zusammenfassung",
      kuerzel: patient.kuerzel,
      pseudonym: patient.pseudonym || "",
      erstellt_am: new Date(erstellt).toISOString(),
      von: notizen[0].erstellt_am,
      bis: notizen[notizen.length - 1].erstellt_am,
      anzahl: notizen.length,
      zusammenfassung: punkte(d.zusammenfassung).slice(0, 8),
      verlauf: verlauf.map(({ nr, ...rest }) => rest),
      hausaufgaben: punkte(d.hausaufgaben).slice(0, 10),
      offen: punkte(d.offen).slice(0, 10),
    };
  }

  class WerkzeugFehler extends Error {}

  /** Werkzeuge über die Fake-API – gleiche Namen, Eingaben, Fehlertexte und Ergebnisse wie im Worker. */
  function demoWerkzeuge(api, { jetzt = () => Date.now() } = {}) {
    const alleNotizen = async (patientId, q) => {
      const p = new URLSearchParams();
      if (patientId) p.set("patient_id", patientId);
      if (q) p.set("q", q);
      return (await api.anfrage(`/api/notizen${p.toString() ? `?${p}` : ""}`)).notizen;
    };
    async function patientSuchen(roh) {
      const eingabe = typeof roh === "string" ? roh.trim() : "";
      if (!eingabe) throw new WerkzeugFehler("Bitte das Kürzel des Test-Patienten angeben, z. B. TP-01.");
      const k = kuerzelPruefen(eingabe);
      const alle = (await api.anfrage("/api/patienten")).patienten;
      const p = !k.fehler && alle.find((x) => x.kuerzel === k.kuerzel);
      if (!p) throw new WerkzeugFehler(`Einen Test-Patienten „${eingabe}“ gibt es nicht. Vorhanden: ${alle.map((x) => x.kuerzel).join(", ") || "keine"}.`);
      return p;
    }
    function kompakt(n) {
      const s = normalisieren(n.strukturiert);
      const o = { id: n.id, kuerzel: n.kuerzel, datum: anzeigeZeit(n.erstellt_am) };
      if (n.geaendert_am) o.bearbeitet = anzeigeZeit(n.geaendert_am);
      for (const k of ALLE) if (s[k].length) o[k] = s[k];
      return o;
    }
    const quelle = (n) => ({ id: n.id, kuerzel: n.kuerzel, erstellt_am: n.erstellt_am });

    const AUS = {
      async patienten_auflisten() {
        const alle = (await api.anfrage("/api/patienten")).patienten;
        return { anzahl: alle.length, patienten: alle.map((p) => ({ kuerzel: p.kuerzel, beschreibung: p.pseudonym || "", notizen: p.anzahl || 0 })) };
      },
      async notizen_suchen(e, k) {
        const anzahl = Number.isInteger(e.anzahl) ? Math.min(10, Math.max(1, e.anzahl)) : 5;
        const patient = e.kuerzel ? await patientSuchen(e.kuerzel) : null;
        const alle = await alleNotizen(patient && patient.id, typeof e.suchbegriff === "string" ? e.suchbegriff : "");
        const liste = alle.slice(0, anzahl);
        if (liste.length && k.senden) k.senden({ t: "quellen", notizen: liste.map(quelle) });
        return { gefunden: alle.length, notizen: liste.map(kompakt), ...(alle.length ? {} : { hinweis: "Keine passende Notiz gespeichert." }) };
      },
      async notiz_lesen(e, k) {
        if (typeof e.id !== "string" || !e.id) throw new WerkzeugFehler("Ungültige Notiz-id.");
        let n;
        try { n = (await api.anfrage(`/api/notizen/${encodeURIComponent(e.id)}`)).notiz; } catch { throw new WerkzeugFehler("Diese Notiz gibt es nicht (mehr)."); }
        if (k.senden) k.senden({ t: "quellen", notizen: [quelle(n)] });
        return { ...kompakt(n), diktat: String(n.rohtext || "").slice(0, 6000) };
      },
      async heute_ueberblick(e, k) {
        const t = new Date(jetzt());
        const heute = tagBerlin(t);
        const seit = t.getTime() - 7 * TAG_MS;
        const alle = await alleNotizen();
        const vonHeute = alle.filter((n) => tagBerlin(n.erstellt_am) === heute);
        const offen = alle
          .filter((n) => new Date(n.erstellt_am).getTime() >= seit)
          .flatMap((n) => normalisieren(n.strukturiert).unklar.map((punkt) => ({ kuerzel: n.kuerzel, datum: anzeigeZeit(n.erstellt_am), punkt })))
          .slice(0, 12);
        if (vonHeute.length && k.senden) k.senden({ t: "quellen", notizen: vonHeute.slice(0, 6).map(quelle) });
        return {
          heute: F_LANG.format(t),
          termine: "Nicht verfügbar: Kalender und Praxissoftware sind in der Testversion nicht angebunden.",
          notizen_heute: vonHeute.slice(0, 10).map(kompakt),
          offene_unklare_stellen_letzte_7_tage: offen,
          zuletzt_dokumentiert: alle.slice(0, 3).map((n) => ({ kuerzel: n.kuerzel, datum: anzeigeZeit(n.erstellt_am) })),
        };
      },
      async notiz_entwurf_erstellen(e, k) {
        const patient = await patientSuchen(e.kuerzel);
        const diktat = (typeof e.diktat === "string" && e.diktat.trim()) || String(k.letzte || "").trim();
        if (!diktat) throw new WerkzeugFehler("Es gibt noch keinen Diktat-Text.");
        if (diktat.length > MAX_ROHTEXT) throw new WerkzeugFehler("Das Diktat ist zu lang.");
        const { strukturiert } = await api.anfrage("/api/strukturieren", { methode: "POST", body: { rohtext: diktat } });
        if (istLeer(strukturiert)) throw new WerkzeugFehler("Im Text steht nichts, was in eine Behandlungsnotiz gehört. Bitte die Behandlung diktieren.");
        if (k.senden) k.senden({ t: "entwurf", entwurf: { patient_id: patient.id, kuerzel: patient.kuerzel, pseudonym: patient.pseudonym || "", rohtext: diktat, strukturiert } });
        return {
          angezeigt: true, gespeichert: false, kuerzel: patient.kuerzel,
          stichpunkte: Object.fromEntries(ABSCHNITTE.map((x) => [x, strukturiert[x].length])),
          unklar: strukturiert.unklar,
          hinweis: "Der Entwurf wird als Karte angezeigt. Gespeichert wird erst, wenn die Therapeutin auf „Speichern“ tippt.",
        };
      },
      async bericht_erstellen(e, k) {
        const patient = await patientSuchen(e.kuerzel);
        const art = e.art === "zusammenfassung" ? "zusammenfassung" : "verlauf";
        const liste = (await alleNotizen(patient.id)).slice(0, 30).reverse();
        if (!liste.length) throw new WerkzeugFehler(`Für ${patient.kuerzel} ist noch keine Notiz gespeichert.`);
        const bericht = berichtBauen({ patient, notizen: liste, art, inhalt: demoBerichtInhalt({ notizen: liste, art }), erstellt: jetzt() });
        if (k.senden) k.senden({ t: "bericht", bericht });
        const tagText = (z) => anzeigeZeit(z).split(",").slice(0, 2).join(",");
        return { angezeigt: true, art, kuerzel: patient.kuerzel, notizen: liste.length, zeitraum: `${tagText(bericht.von)} bis ${tagText(bericht.bis)}`, zusammenfassung: bericht.zusammenfassung };
      },
    };

    return {
      definitionen: WERKZEUG_NAMEN.map((name) => ({ name })),
      async ausfuehren(name, eingabe, kontext = {}) {
        const f = Object.prototype.hasOwnProperty.call(AUS, name) ? AUS[name] : null;
        if (!f) return { inhalt: JSON.stringify({ fehler: `Unbekanntes Werkzeug: ${String(name).slice(0, 40)}` }), fehler: true, meldung: "Unbekanntes Werkzeug." };
        if (kontext.senden) kontext.senden({ t: "status", text: STATUS[name] });
        const e = eingabe && typeof eingabe === "object" && !Array.isArray(eingabe) ? eingabe : {};
        try {
          const ergebnis = await f(e, kontext);
          return { inhalt: JSON.stringify(ergebnis), fehler: false, ergebnis };
        } catch (err) {
          const meldung = (err && err.message) || "Technischer Fehler beim Lesen der Daten.";
          return { inhalt: JSON.stringify({ fehler: meldung }), fehler: true, meldung };
        }
      },
    };
  }

  /** Kürzel im Text finden („TP-01“, „tp 1“, „TP1“) – nur solche, die es gibt. */
  function kuerzelFinden(text, vorhandene = []) {
    const ohneNull = (k) => k.replace(/-0+(\d)/, "-$1");
    for (const m of String(text || "").matchAll(/\b([a-zäöü]{1,4})[\s-]?(\d{1,4})\b/gi)) {
      const roh = ohneNull(`${m[1]}-${m[2]}`.toUpperCase());
      const treffer = vorhandene.find((k) => ohneNull(k) === roh);
      if (treffer) return treffer;
    }
    return null;
  }

  const FUELLWOERTER = /\b(such(e|en|st)?|finde?n?|zeig(e|en)?|mir|notiz(en)?|meinen?|meiner|in|mit|nach|wo|steht|stand|den|der|die|das|dem|bitte|gabi|alle|über|zu|zum|zur|von|was|gibt|es|ich|du|hast|habe|eine?n?)\b/g;

  /** Einfache Absichtserkennung für den Demo-Modus (ohne KI). */
  function absichtErkennen(text, kuerzelListe = []) {
    const t = String(text || "").toLowerCase().trim();
    if (!t) return { art: "unbekannt" };
    const kuerzel = kuerzelFinden(text, kuerzelListe);
    const hat = (re) => re.test(t);
    if (hat(/diagnose|empfiehl|empfehl|welche übung(en)? soll|was soll (ich|er|sie)|therapievorschlag|prognose|ist das (schlimm|normal)|was fehlt (ihm|ihr)/)) return { art: "rat" };
    if (kuerzel && t.length > 40 && hat(/notiz für|diktat|dokumentier|schreib.*notiz|neue notiz|behandlung (heute|eben)/)) return { art: "entwurf", kuerzel };
    if (hat(/bericht|zusammenfass|verlauf (von|für)|fasse? .*zusammen/)) return { art: "bericht", kuerzel, berichtArt: hat(/zusammenfass|fasse? .*zusammen/) ? "zusammenfassung" : "verlauf" };
    if (hat(/\bheute\b|steht an|tagesüberblick|überblick|termin/)) return { art: "heute" };
    if (kuerzel && hat(/hausaufgabe|heimübung|zu ?hause/)) return { art: "hausaufgaben", kuerzel };
    if (kuerzel && hat(/wollte|anliegen|beschwerde|gesagt|berichtet|erzählt|wie geht/)) return { art: "anliegen", kuerzel };
    if (kuerzel) return { art: "letzte", kuerzel };
    const praxis = PRAXIS.find((x) => x.muster.test(t));
    if (praxis) return { art: "praxis", text: praxis.text };
    if (hat(/^(hallo|hi|hey|guten (morgen|tag|abend)|servus|moin|grüß)/)) return { art: "hallo" };
    const kurz = t.length <= 40; // Smalltalk nur bei kurzen Nachrichten – sonst ist es eine Frage
    if (kurz && hat(/\b(danke|dankeschön|merci|super|prima|klasse|perfekt|top)\b|vielen dank/)) return { art: "danke" };
    if (kurz && hat(/\b(tschüss|tschüs|ciao|bye)\b|bis (morgen|später|bald|dann)|schönen (abend|tag|feierabend)|gute nacht/)) return { art: "tschuess" };
    if (kurz && hat(/wie geht('?s| es) (dir|ihnen)|wie läuft('?s| es) bei dir/)) return { art: "befinden" };
    if (hat(/wer bist du|wer ist gabi(?!\s*diem)|was kannst du|wie funktionierst|\bhilfe\b/)) return { art: "hilfe" };
    const woerter = suchwoerter(t.replace(FUELLWOERTER, " "));
    if (woerter.length) {
      // für die Antwort so geschrieben, wie getippt (Suche selbst ist unabhängig von Groß-/Kleinschreibung)
      const roh = String(text || "");
      const anzeige = woerter.map((w) => { const i = roh.toLowerCase().indexOf(w); return i >= 0 ? roh.slice(i, i + w.length) : w; }).join(" ");
      return { art: "suche", suchbegriff: woerter.join(" "), anzeige };
    }
    return { art: "unbekannt" };
  }

  const datumAus = (n) => ((/(\d{2}\.\d{2}\.)\d{4}/.exec((n && n.datum) || "") || [])[1] || "");
  const liste = (punkteListe) => punkteListe.map((x) => `- ${x}`).join("\n");

  /** Text wie beim Streaming in kleinen Stücken ausgeben. */
  async function textStroemen(text, senden, warte) {
    const stuecke = String(text).match(/\S+\s*|\s+/g) || [];
    for (let i = 0; i < stuecke.length; i += 2) {
      senden({ t: "text", d: stuecke.slice(i, i + 2).join("") });
      await warte(18);
    }
  }

  const ANTWORT = {
    rat: "Das entscheidest du als Therapeutin oder Therapeut – Diagnosen und Empfehlungen gebe ich nicht. Ich kann dir aber zeigen, was in den Notizen steht, zum Beispiel mit „Letzte Notiz von TP-01“.",
    hallo: "Hallo! Ich bin Gabi. Ich bereite Behandlungsnotizen vor, suche in deinen Notizen, schreibe Berichte und beantworte Fragen zur Praxis. Womit fangen wir an?",
    hilfe: "Ich bin Gabi, die Assistenz für PhysioWorks. Ich kann:\n- eine Behandlung aus deinem Diktat als Notiz vorbereiten\n- Notizen durchsuchen, z. B. „Was wollte TP-01?“\n- Verlaufsberichte und Zusammenfassungen als PDF erstellen\n- Fragen zur Praxis beantworten, z. B. „Wo sind die Standorte?“",
    danke: "Gern! Sag Bescheid, wenn du noch etwas brauchst.",
    tschuess: "Bis bald!",
    befinden: "Danke der Nachfrage – mir geht's gut. Womit kann ich dir helfen?",
    unbekannt: "Dazu habe ich nichts gespeichert. Im Demo-Modus verstehe ich einfache Fragen – probier zum Beispiel „Was wollte TP-01?“, „Hausaufgaben von TP-02“ oder „Wo sind die Standorte?“.",
  };

  /** Ein Gesprächsschritt im Demo-Modus: Absicht erkennen, Werkzeug nutzen, kurz antworten. */
  async function demoGespraech({ letzte, werkzeuge, senden, warte = () => Promise.resolve() }) {
    const sag = (text) => textStroemen(text, senden, warte);
    const k = { letzte, senden };
    const nutze = async (name, eingabe) => {
      await warte(320);
      const r = await werkzeuge.ausfuehren(name, eingabe, k);
      await warte(420);
      return r;
    };
    const patienten = await werkzeuge.ausfuehren("patienten_auflisten", {}, {});
    const kuerzelListe = ((patienten.ergebnis && patienten.ergebnis.patienten) || []).map((p) => p.kuerzel);
    const a = absichtErkennen(letzte, kuerzelListe);

    if (["rat", "hallo", "hilfe", "danke", "tschuess", "befinden", "unbekannt"].includes(a.art)) { await warte(450); return sag(ANTWORT[a.art]); }
    if (a.art === "praxis") { await warte(450); return sag(a.text); }

    if (a.art === "heute") {
      const r = await nutze("heute_ueberblick", {});
      const e = r.ergebnis;
      const teile = [`Heute ist ${e.heute.split(" um ")[0]}. Termine und Kalender sind in der Testversion noch nicht angebunden.`];
      teile.push(e.notizen_heute.length
        ? `Heute gespeichert:\n${liste(e.notizen_heute.map((n) => `**${n.kuerzel}**, ${n.datum.split(", ").pop()} Uhr`))}`
        : "Heute ist noch keine Notiz gespeichert.");
      if (e.offene_unklare_stellen_letzte_7_tage.length) {
        teile.push(`Zum Prüfen (letzte 7 Tage):\n${liste(e.offene_unklare_stellen_letzte_7_tage.slice(0, 4).map((o) => `**${o.kuerzel}**, ${datumAus(o)}: ${o.punkt}`))}`);
      }
      return sag(teile.join("\n\n"));
    }

    if (a.art === "bericht") {
      if (!a.kuerzel) return sag(`Für welchen Test-Patienten soll ich den Bericht schreiben? Vorhanden: ${kuerzelListe.map((x) => `**${x}**`).join(", ")}.`);
      const r = await nutze("bericht_erstellen", { kuerzel: a.kuerzel, art: a.berichtArt });
      return sag(r.fehler ? r.meldung : berichtText(a.berichtArt, a.kuerzel, r.ergebnis.notizen));
    }

    if (a.art === "entwurf") {
      const r = await nutze("notiz_entwurf_erstellen", { kuerzel: a.kuerzel });
      return sag(r.fehler ? r.meldung : entwurfText(a.kuerzel, r.ergebnis.unklar.length));
    }

    if (a.art === "suche") {
      const r = await nutze("notizen_suchen", { suchbegriff: a.suchbegriff, anzahl: 5 });
      const e = r.ergebnis;
      if (r.fehler || !e.notizen.length) return sag("Dazu habe ich nichts gespeichert.");
      const wort = a.suchbegriff.split(" ")[0];
      const zeilen = e.notizen.map((n) => {
        const passend = ALLE.flatMap((x) => n[x] || []).find((p) => p.toLowerCase().includes(wort)) || ALLE.flatMap((x) => n[x] || [])[0] || "";
        return `**${n.kuerzel}**, ${datumAus(n)}: ${passend}`;
      });
      return sag(`Ich habe ${e.gefunden === 1 ? "eine Notiz" : `${e.gefunden} Notizen`} zu „${a.anzeige || a.suchbegriff}“ gefunden:\n${liste(zeilen)}`);
    }

    // anliegen, hausaufgaben, letzte: die neuesten Notizen des Patienten
    const r = await nutze("notizen_suchen", { kuerzel: a.kuerzel, anzahl: 5 });
    const notizen = (r.ergebnis && r.ergebnis.notizen) || [];
    if (r.fehler || !notizen.length) return sag(`Dazu habe ich nichts gespeichert. Für **${a.kuerzel}** gibt es noch keine Notiz.`);
    if (a.art === "anliegen") {
      for (const n of notizen) {
        const pat = [...(n.befund || []), ...(n.verlauf || [])].filter((p) => /^Pat\.:/.test(p)).map((p) => p.replace(/^Pat\.:\s*/, ""));
        if (pat.length) return sag(`Am ${datumAus(n)} hat **${a.kuerzel}** gesagt:\n${liste(pat)}`);
      }
      return sag(`Dazu habe ich nichts gespeichert. In den Notizen von **${a.kuerzel}** steht kein eigenes Anliegen.`);
    }
    if (a.art === "hausaufgaben") {
      const n = notizen.find((x) => (x.hausaufgaben || []).length);
      if (!n) return sag(`Dazu habe ich nichts gespeichert. In den Notizen von **${a.kuerzel}** stehen keine Hausaufgaben.`);
      return sag(`Zuletzt (am ${datumAus(n)}) hat **${a.kuerzel}** diese Hausaufgaben bekommen:\n${liste(n.hausaufgaben)}`);
    }
    const n = notizen[0];
    const zeilen = ABSCHNITTE.filter((x) => (n[x] || []).length).map((x) => `${TITEL[x]}: ${n[x].join("; ")}`);
    return sag(`Die letzte Notiz von **${a.kuerzel}** ist vom ${datumAus(n)}:\n${liste(zeilen)}`);
  }

  // ------------------------------------------------------------------
  // Ablage (Browser: localStorage, Tests: Arbeitsspeicher)
  // ------------------------------------------------------------------
  function startDaten(jetzt = Date.now()) {
    const nachKuerzel = Object.fromEntries(PATIENTEN.map((p) => [p.kuerzel, p]));
    return {
      version: 1,
      diktat: 0,
      frage: 0,
      patienten: PATIENTEN.map((p) => ({ ...p, erstellt_am: datumVor(30, "08:00", jetzt) })),
      notizen: NOTIZEN.map((n) => {
        const p = nachKuerzel[n.kuerzel];
        const strukturiert = normalisieren(n.strukturiert);
        return { id: n.id, patient_id: p.id, rohtext: n.rohtext, strukturiert, suchtext: suchtext(p, n.rohtext, strukturiert), erstellt_am: datumVor(n.tageZurueck, n.uhrzeit, jetzt), geaendert_am: null };
      }),
    };
  }

  function browserAblage(schluessel = "gabi.demo.v1") {
    let fluechtig = null; // falls localStorage gesperrt ist (privates Fenster)
    return {
      lesen() {
        try { const d = JSON.parse(localStorage.getItem(schluessel) || "null"); if (d && d.version === 1) return d; } catch { /* gesperrt */ }
        return fluechtig;
      },
      schreiben(d) { fluechtig = d; try { localStorage.setItem(schluessel, JSON.stringify(d)); } catch { /* gesperrt */ } },
      loeschen() { fluechtig = null; try { localStorage.removeItem(schluessel); } catch { /* gesperrt */ } },
    };
  }

  function speicherAblage() {
    let d = null;
    return { lesen: () => d, schreiben: (x) => { d = x; }, loeschen: () => { d = null; } };
  }

  // ------------------------------------------------------------------
  // Fake-API: dieselben Pfade, Antworten und Fehlertexte wie der Worker
  // ------------------------------------------------------------------
  class DemoFehler extends Error {
    constructor(status, meldung) { super(meldung); this.status = status; }
  }

  function erstelleApi({ ablage = browserAblage(), verzoegerung = true, jetzt = () => Date.now() } = {}) {
    const warte = (ms) => (verzoegerung ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
    const daten = () => {
      let d = ablage.lesen();
      if (!d) { d = startDaten(jetzt()); ablage.schreiben(d); }
      return d;
    };
    const merken = (d) => ablage.schreiben(d);
    const mitPatient = (d, n) => {
      const p = d.patienten.find((x) => x.id === n.patient_id) || {};
      const { suchtext: _s, ...rest } = n;
      return kopie({ ...rest, kuerzel: p.kuerzel || "", pseudonym: p.pseudonym || "" });
    };
    const ohneRohtext = (n) => { const { rohtext: _r, ...rest } = n; return rest; };
    const neuesteZuerst = (a, b) => (a.erstellt_am < b.erstellt_am ? 1 : a.erstellt_am > b.erstellt_am ? -1 : 0);

    async function anfrage(pfad, { methode = "GET", body, text } = {}) {
      const url = new URL(pfad, "https://demo.invalid");
      const p = url.pathname.replace(/\/+$/, "");
      const d = daten();

      if (p === "/api/pruefen" && methode === "GET") return { ok: true };

      if (p === "/api/transkribieren" && methode === "POST") {
        if (!text || String(text).length < 200) throw new DemoFehler(400, "Keine gültige Aufnahme.");
        await warte(700);
        const frisch = daten(); // nach dem Warten neu lesen – sonst überschreibt eine alte Kopie zwischenzeitliche Änderungen
        if (url.searchParams.get("zweck") === "frage") {
          const frage = FRAGEN[(frisch.frage || 0) % FRAGEN.length];
          frisch.frage = (frisch.frage || 0) + 1;
          merken(frisch);
          return { text: frage };
        }
        // passend zum Test-Patienten (Knie, Schulter, sonst HWS) – ohne Angabe der Reihe nach
        const fuer = frisch.patienten.find((x) => x.kuerzel === url.searchParams.get("patient"));
        const passend = fuer ? DIKTAT_MUSTER.findIndex((re) => re.test(fuer.pseudonym || "")) : -1;
        const diktat = DIKTATE[passend >= 0 ? passend : fuer ? DIKTATE.length - 1 : frisch.diktat % DIKTATE.length];
        frisch.diktat++;
        merken(frisch);
        return { text: diktat.rohtext };
      }

      if (p === "/api/strukturieren" && methode === "POST") {
        const t = glatt(body && body.rohtext) ? String(body.rohtext).replace(/\r\n?/g, "\n").trim() : "";
        if (!t) throw new DemoFehler(400, "Kein Text zum Strukturieren.");
        if (t.length > MAX_ROHTEXT) throw new DemoFehler(413, "Transkript zu lang.");
        await warte(900);
        return { strukturiert: demoStrukturieren(t) };
      }

      if (p === "/api/patienten" && methode === "GET") {
        const patienten = d.patienten.map((x) => ({ ...x, anzahl: d.notizen.filter((n) => n.patient_id === x.id).length }));
        patienten.sort((a, b) => a.kuerzel.localeCompare(b.kuerzel));
        return { patienten: kopie(patienten) };
      }

      if (p === "/api/patienten" && methode === "POST") {
        const k = kuerzelPruefen(body && body.kuerzel);
        if (k.fehler) throw new DemoFehler(400, k.fehler);
        const pseudonym = glatt(body && body.pseudonym);
        if (pseudonym.length > 60) throw new DemoFehler(400, "Beschreibung höchstens 60 Zeichen.");
        if (d.patienten.some((x) => x.kuerzel === k.kuerzel)) throw new DemoFehler(409, `Kürzel ${k.kuerzel} gibt es schon.`);
        const neu = { id: uuid(), kuerzel: k.kuerzel, pseudonym, erstellt_am: new Date(jetzt()).toISOString() };
        d.patienten.push(neu);
        merken(d);
        return { patient: { ...neu, anzahl: 0 } };
      }

      if (p === "/api/notizen" && methode === "GET") {
        const patientId = url.searchParams.get("patient_id") || "";
        const woerter = suchwoerter(url.searchParams.get("q"));
        const liste = d.notizen
          .filter((n) => !patientId || n.patient_id === patientId)
          .filter((n) => woerter.every((w) => n.suchtext.includes(w)))
          .sort(neuesteZuerst)
          .map((n) => ohneRohtext(mitPatient(d, n)));
        return { notizen: liste };
      }

      if (p === "/api/notizen" && methode === "POST") {
        const patient = d.patienten.find((x) => x.id === (body && body.patient_id));
        if (!patient) throw new DemoFehler(400, "Bitte einen Test-Patienten wählen.");
        const rohtext = String((body && body.rohtext) || "").replace(/\r\n?/g, "\n").trim();
        if (rohtext.length > MAX_ROHTEXT) throw new DemoFehler(413, "Transkript zu lang.");
        const strukturiert = normalisieren(body && body.strukturiert);
        if (istLeer(strukturiert) && !rohtext) throw new DemoFehler(400, "Die Notiz ist leer.");
        const n = { id: uuid(), patient_id: patient.id, rohtext, strukturiert, suchtext: suchtext(patient, rohtext, strukturiert), erstellt_am: new Date(jetzt()).toISOString(), geaendert_am: null };
        d.notizen.push(n);
        merken(d);
        const antwort = mitPatient(d, n);
        await warte(250);
        return { notiz: antwort };
      }

      const treffer = p.match(/^\/api\/notizen\/([^/]+)$/);
      if (treffer) {
        const n = d.notizen.find((x) => x.id === treffer[1]);
        if (!n) throw new DemoFehler(404, "Notiz nicht gefunden.");
        if (methode === "GET") return { notiz: mitPatient(d, n) };
        if (methode === "PATCH") {
          const rohtext = body && "rohtext" in body ? String(body.rohtext || "").replace(/\r\n?/g, "\n").trim() : n.rohtext;
          const strukturiert = body && "strukturiert" in body ? normalisieren(body.strukturiert) : n.strukturiert;
          if (istLeer(strukturiert) && !rohtext) throw new DemoFehler(400, "Die Notiz ist leer.");
          const patient = d.patienten.find((x) => x.id === n.patient_id) || {};
          Object.assign(n, { rohtext, strukturiert, suchtext: suchtext(patient, rohtext, strukturiert), geaendert_am: new Date(jetzt()).toISOString() });
          merken(d);
          return { notiz: mitPatient(d, n) };
        }
        if (methode === "DELETE") {
          d.notizen = d.notizen.filter((x) => x.id !== n.id);
          merken(d);
          return null;
        }
      }
      throw new DemoFehler(404, "Nicht gefunden.");
    }

    /**
     * Gespräch wie POST /api/chat im Worker, nur im Browser: Ereignisse (status, quellen, text, entwurf, bericht,
     * fertig, fehler) kommen nacheinander über senden() – mit kleinen Pausen, damit es wie live wirkt.
     */
    async function chatten(body, senden, { signal } = {}) {
      const weg = () => Boolean(signal && signal.aborted);
      const sicher = (e) => { if (!weg()) senden(e); };
      const pause = (ms) => (weg() ? Promise.reject(new DemoFehler(0, "Abgebrochen.")) : warte(ms));
      const nachrichten = Array.isArray(body && body.nachrichten) ? body.nachrichten : [];
      const letzteNachricht = nachrichten[nachrichten.length - 1];
      const letzte = letzteNachricht && letzteNachricht.rolle === "nutzer" ? String(letzteNachricht.text || "").trim() : "";
      if (!letzte) throw new DemoFehler(400, "Die letzte Nachricht fehlt.");
      const aktion = body && body.aktion;
      let patient = null;
      if (aktion) {
        patient = daten().patienten.find((x) => x.id === aktion.patient_id);
        if (!patient) throw new DemoFehler(404, "Test-Patient nicht gefunden.");
      }
      const werkzeuge = demoWerkzeuge({ anfrage }, { jetzt });
      try {
        await pause(350);
        if (aktion && aktion.typ === "diktat") {
          const r = await werkzeuge.ausfuehren("notiz_entwurf_erstellen", { kuerzel: patient.kuerzel }, { letzte: String(aktion.text || "").trim() || letzte, senden: sicher });
          if (r.fehler) { await textStroemen(r.meldung, sicher, pause); sicher({ t: "fertig" }); return; }
          await textStroemen(entwurfText(patient.kuerzel, r.ergebnis.unklar.length), sicher, pause);
        } else if (aktion && aktion.typ === "bericht") {
          const art = aktion.art === "zusammenfassung" ? "zusammenfassung" : "verlauf";
          await pause(500);
          const r = await werkzeuge.ausfuehren("bericht_erstellen", { kuerzel: patient.kuerzel, art }, { letzte, senden: sicher });
          if (r.fehler) { await textStroemen(r.meldung, sicher, pause); sicher({ t: "fertig" }); return; }
          await textStroemen(berichtText(art, patient.kuerzel, r.ergebnis.notizen), sicher, pause);
        } else {
          await demoGespraech({ letzte, werkzeuge, senden: sicher, warte: pause });
        }
        sicher({ t: "fertig" });
      } catch (e) {
        if (weg()) return;
        sicher({ t: "fehler", text: (e && e.message) || "Fehler im Demo-Modus." });
      }
    }

    return {
      anfrage,
      chatten,
      zuruecksetzen() { ablage.loeschen(); },
      /** Beispieldiktat ohne Aufnahme (für Tests ohne Mikrofon) – mit Kürzel passend zum Patienten. */
      async beispielDiktat(kuerzel) { return anfrage(`/api/transkribieren${kuerzel ? `?patient=${encodeURIComponent(kuerzel)}` : ""}`, { methode: "POST", text: "A".repeat(256) }); },
    };
  }

  return {
    PATIENTEN, NOTIZEN, DIKTATE, FRAGEN, PRAXIS, DEMO_HINWEIS, WERKZEUG_NAMEN, ANTWORT, DemoFehler,
    erstelleApi, browserAblage, speicherAblage, startDaten, demoStrukturieren, normalisieren, suchtext, kuerzelPruefen,
    absichtErkennen, kuerzelFinden, demoWerkzeuge, demoGespraech, demoBerichtInhalt, berichtBauen, entwurfText, berichtText,
  };
});
