/* Gabi Brain – Interview und Chat-Befehle: reine Hilfen ohne Browser (auch in Node testbar).
   Gabi stellt die „Zu klären“-Fragen nacheinander, formuliert aus der Antwort einen VORSCHLAG und speichert nie selbst –
   übernommen wird erst nach Tipp auf „Übernehmen“. Dazu: Brain-Befehle im Gespräch erkennen („Merke dir: …“,
   „Ändere …“, „Was weißt du über …?“, „Wie vollständig ist mein Brain?“) und Vorschläge ohne KI (Demo, lokal). */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else wurzel.GabiBrainInterview = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TITEL_MAX = 120;
  const INHALT_MAX = 2000;

  const glatt = (t) => String(t == null ? "" : t).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  /** Kürzel wie „TP-01“ oder das Wort „Notiz“: Dann geht es um Behandlungsnotizen – kein Brain-Befehl. */
  const NOTIZ_BEZUG = /\b[A-Za-zÄÖÜäöü]{1,4}-\d{1,4}\b|\b[A-ZÄÖÜ]{2,4}\d{1,4}\b|\b[Nn]otiz(en)?\b|\b[Dd]iktat\b|\b[Bb]ericht\b|\b[Pp]atient(in|en)?\b/;

  /** Auf höchstens max Zeichen kürzen – an der Wortgrenze, mit „…“. */
  function kuerzen(text, max) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const stueck = t.slice(0, max - 1);
    const anWort = stueck.replace(/\s+\S*$/, "");
    return `${(anWort.length >= max * 0.6 ? anWort : stueck).replace(/[\s,.;:–-]+$/u, "")}…`;
  }

  /** Gesprochene oder getippte Antwort als Satz: Füllwörter am Anfang weg, großer Anfang, Punkt am Ende. */
  function alsSatz(text) {
    // „ja“, „okay“, „gut“ nur mit Satzzeichen danach: „Gut erreichbar mit der U-Bahn“ ist Inhalt, „Gut, also montags …“ nicht
    let t = glatt(text).replace(/^(?:(?:(?:also|naja|na ja|ähm|äh|hm)\b[,.!]?|(?:ja|okay|ok|gut)[,.!])\s+)+(?=\S)/i, "");
    if (!t) t = glatt(text);
    if (!t) return "";
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!/[.!?…)"“]$/.test(t)) t += ".";
    return t.slice(0, INHALT_MAX);
  }

  // ---------- Befehle im Gespräch ----------
  const MERKEN = /^\s*(?:gabi[,:]?\s+)?(?:bitte\s+)?merk(?:e)?\s+dir(?:\s+bitte)?\s*[:,–-]?\s*(?:dass\s+)?(\S[\s\S]{2,})$/i;
  // „Kannst du dir merken, dass …?“ · „Schreib ins Brain: …“ · „Trag bitte ins Brain ein, dass …“
  const MERKEN_FRAGE = /^\s*(?:gabi[,:]?\s+)?(?:kannst|könntest|koenntest|würdest|wuerdest)\s+du\s+dir\s+(?:bitte\s+)?merken\s*[:,–-]?\s*(?:dass\s+)?(\S[\s\S]{2,}?)\s*\??\s*$/i;
  const MERKEN_BRAIN = /^\s*(?:gabi[,:]?\s+)?(?:bitte\s+)?(?:schreib(?:e)?|trag(?:e)?|nimm|speicher(?:e)?|notier(?:e)?)\s+(?:das\s+|dir\s+)?(?:bitte\s+)?(?:ins|in\s+das|im)\s+brain(?:\s+ein|\s+auf)?\s*[:,–-]?\s*(?:dass\s+)?(\S[\s\S]{2,})$/i;
  const AENDERN = /^\s*(?:gabi[,:]?\s+)?(?:bitte\s+)?(?:änder(?:e|n)?|aender(?:e|n)?|korrigier(?:e|en)?|aktualisier(?:e|en)?|berichtig(?:e|en)?)\s+(\S[\s\S]{2,})$/i;
  const WISSEN = /^\s*(?:gabi[,:]?\s+)?was\s+wei(?:ß|ss)t\s+du\s+(?:über|ueber|zum|zur|zu|von|vom)\s+(\S[\s\S]*?)\s*\??\s*$/i;
  const GESUNDHEIT = /wie\s+(?:vollständig|vollstaendig|gut|aktuell|gesund|voll)\s+ist\s+(?:mein|das|unser|dein)\s+brain|brain[- ]?(?:stand|status|gesundheit)\b|was\s+fehlt\s+(?:noch\s+)?im\s+brain|wie\s+steht\s+es\s+um\s+(?:mein|das|unser)\s+brain/i;
  const INTERVIEW = /^\s*(?:gabi[,:]?\s+)?(?:brain\s+f(?:ü|ue)llen|interview\s+(?:starten|beginnen)|frag\s+mich\s+(?:die\s+)?(?:offenen\s+)?(?:fragen|punkte)(?:\s+ab)?|stell\s+mir\s+die\s+offenen\s+fragen)\s*[.!]?\s*$/i;

  /**
   * Erkennt Brain-Befehle im Gespräch. Ergebnis: { art: "merken" | "aendern" | "wissen" | "gesundheit" | "interview", text }
   * oder null (normale Frage). Alles mit Notiz-Bezug (Kürzel, „Notiz“) ist kein Brain-Befehl.
   */
  function befehlErkennen(text) {
    const t = String(text || "").trim();
    if (!t || t.length > 4000) return null;
    if (INTERVIEW.test(t)) return { art: "interview", text: "" };
    if (GESUNDHEIT.test(t) && t.length <= 120) return { art: "gesundheit", text: "" };
    let m = MERKEN.exec(t) || MERKEN_FRAGE.exec(t) || MERKEN_BRAIN.exec(t);
    if (m && !NOTIZ_BEZUG.test(m[1])) {
      // bei sehr kurzem Inhalt („Merke dir: ab“) rutscht das Trennzeichen sonst mit in den Text
      const inhalt = glatt(m[1]).replace(/^[:,–-]+\s*/, "");
      if (inhalt.length >= 3) return { art: "merken", text: inhalt };
    }
    m = AENDERN.exec(t);
    if (m && !NOTIZ_BEZUG.test(m[1])) return { art: "aendern", text: glatt(m[1]) };
    m = WISSEN.exec(t);
    if (m && !NOTIZ_BEZUG.test(m[1])) return { art: "wissen", text: glatt(m[1]).replace(/[?.!]+$/, "") };
    return null;
  }

  /**
   * Bei „Ändere X: Y“ der Teil, der sagt, WAS geändert werden soll (X). Daran wird der Eintrag gesucht – nicht am neuen
   * Inhalt: „Ändere die Telefonzeiten: samstags geschlossen“ meint die Telefonzeiten, nicht den Eintrag zu Öffnungszeiten.
   */
  function aendernZiel(text) {
    const t = glatt(text);
    const m = /^(.{3,80}?)\s*(?::|–|—|\s-\s|,\s*dass\b|\s(?:auf|so,?\s*dass)\s)/i.exec(t);
    return m && m[1].trim().length >= 3 ? m[1].trim() : t;
  }

  // ---------- Vorschläge ohne KI ----------
  /** Zeilen wie „Betrifft: [[Praxis Kieslingstraße]]“ bleiben beim Ersetzen erhalten (die Verbindung soll nicht verloren gehen). */
  const bezugZeilen = (inhalt) => String(inhalt || "").split("\n").filter((z) => /^\s*(?:betrifft|siehe(?: auch)?|gehört zu)\s*:/i.test(z)).map((z) => z.trim());

  /** Interview: aus der Antwort wird der neue Inhalt des Knotens – ohne KI nur geglättet, nichts dazuerfunden. */
  function vorschlagOhneKi({ knoten, antwort }) {
    const k = knoten || {};
    const satz = alsSatz(antwort);
    const bezug = bezugZeilen(k.inhalt);
    return {
      typ: "aendern",
      id: String(k.id || ""),
      titel: String(k.titel || "").slice(0, TITEL_MAX),
      inhalt: [satz, ...bezug].filter(Boolean).join("\n\n").slice(0, INHALT_MAX),
      grund: "interview",
    };
  }

  /** „Merke dir: …“ → neuer Eintrag. „Thema: Inhalt“ wird getrennt, sonst ist der Anfang der Titel. */
  function merkenOhneKi(text) {
    const t = glatt(text);
    const mitThema = /^([^:\n]{2,60}):\s+(\S[\s\S]*)$/.exec(t);
    const titel = mitThema ? mitThema[1].trim() : kuerzen(t.split(/(?<=[.!?])\s|\n/)[0].replace(/[.!?]+$/, ""), 60);
    return {
      typ: "neu",
      titel: titel.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim().slice(0, TITEL_MAX),
      inhalt: alsSatz(mitThema ? mitThema[2] : t),
      grund: "merken",
    };
  }

  /** Der neue Inhalt in „Ändere X: Y“ (Y). Ohne Doppelpunkt oder Gedankenstrich bleibt der ganze Wunsch stehen. */
  function aendernInhalt(text) {
    const t = glatt(text);
    const m = /^.{3,80}?\s*(?::|–|—|\s-\s)\s*(\S[\s\S]*)$/.exec(t);
    return m ? m[1].trim() : t;
  }

  /**
   * „Ändere …“ ohne KI: der Wunsch wird an den Eintrag angehängt – zum Anpassen vor dem Übernehmen. Bei einem offenen Punkt
   * („… nicht angegeben“) IST der Wunsch die Antwort: er ersetzt den Platzhalter, die Bezüge („Betrifft: …“) bleiben.
   */
  function aendernOhneKi({ knoten, wunsch }) {
    const k = knoten || {};
    const alt = String(k.inhalt || "").trim();
    const neu = alsSatz(aendernInhalt(wunsch));
    const inhalt = k.status === "zu_klaeren" ? [neu, ...bezugZeilen(alt)] : [alt, neu];
    return {
      typ: "aendern",
      id: String(k.id || ""),
      titel: String(k.titel || "").slice(0, TITEL_MAX),
      inhalt: inhalt.filter(Boolean).join("\n\n").slice(0, INHALT_MAX),
      grund: "aenderung",
      ohneKi: true,
    };
  }

  // ---------- Interview ----------
  /** Reihenfolge der offenen Fragen: zuerst die Fragen aus dem Seed/der Wissensdatei (älteste zuerst), dann der Rest. */
  function reihenfolge(knoten) {
    return (Array.isArray(knoten) ? knoten : [])
      .filter((k) => k && !k.geloescht && !k.abgeleitet && !k.geschuetzt && k.status === "zu_klaeren")
      .sort((a, b) => (Number(a.erstellt) || 0) - (Number(b.erstellt) || 0) || String(a.titel).localeCompare(String(b.titel), "de"))
      .map((k) => k.id);
  }

  /** Was Gabi zu einer offenen Frage sagt: ein Punkt pro Nachricht. */
  function frageText(knoten, nr, gesamt) {
    const k = knoten || {};
    const bisher = String(k.inhalt || "").split("\n").map((z) => z.trim()).filter((z) => z && !/^\s*(?:betrifft|siehe(?: auch)?|gehört zu)\s*:/i.test(z));
    const frage = /[?]$/.test(String(k.titel || "").trim()) ? String(k.titel).trim() : `${String(k.titel || "").trim()} – was gilt hier?`;
    const teile = [`Frage ${nr} von ${gesamt}: **${frage}**`];
    if (bisher.length) teile.push(`Bisher steht im Brain: ${kuerzen(bisher.join(" ").replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1"), 260)}`);
    teile.push("Antworte einfach per Sprache oder Text – ich mache daraus einen Vorschlag.");
    return teile.join("\n\n");
  }

  const prozent = (teil, ganz) => (ganz > 0 ? Math.round((teil / ganz) * 100) : 0);

  /** Antwort auf „Wie vollständig ist mein Brain?“ – nur Zahlen aus dem Brain. */
  function gesundheitText(g) {
    const s = g || {};
    const n = Number(s.knoten) || 0;
    if (!n) return "Dein Brain ist noch leer. Leg im Bereich **Brain** den ersten Eintrag an oder sag „Merke dir: …“.";
    const punkte = [];
    const zeile = (zahl, eins, viele) => { if (zahl > 0) punkte.push(`- ${zahl === 1 ? eins : viele.replace("#", String(zahl))}`); };
    zeile(Number(s.zuKlaeren) || 0, "1 Punkt ist noch zu klären", "# Punkte sind noch zu klären");
    zeile(Number(s.entwurf) || 0, "1 Entwurf wartet auf deine Bestätigung", "# Entwürfe warten auf deine Bestätigung");
    zeile(Number(s.veraltet) || 0, "1 Eintrag ist älter als 90 Tage", "# Einträge sind älter als 90 Tage");
    zeile(Number(s.nieVerwendet) || 0, "1 bestätigten Eintrag habe ich noch nie gebraucht", "# bestätigte Einträge habe ich noch nie gebraucht");
    zeile(Number(s.luecken) || 0, "1 Frage konnte ich nicht aus dem Brain beantworten", "# Fragen konnte ich nicht aus dem Brain beantworten");
    const kopf = `Dein Brain hat ${n === 1 ? "einen Eintrag" : `${n} Einträge`}, ${Number(s.bestaetigt) || 0} davon bestätigt (**${prozent(Number(s.bestaetigt) || 0, n)} %**).`;
    const schluss = (Number(s.zuKlaeren) || 0) > 0 ? "Am schnellsten geht es mit „Brain füllen“ – ich stelle dir die offenen Fragen nacheinander." : punkte.length ? "" : "Alles bestätigt und aktuell.";
    return [kopf, punkte.join("\n"), schluss].filter(Boolean).join("\n\n");
  }

  /** Beispielantwort im Demo-Modus (statt der echten Aufnahme) – erfindet nichts über die Praxis. */
  const DEMO_ANTWORT = "Beispielantwort aus dem Demo-Modus – hier stünde, was du gesagt hast.";

  return {
    TITEL_MAX, INHALT_MAX, DEMO_ANTWORT,
    befehlErkennen, aendernZiel, aendernInhalt, vorschlagOhneKi, merkenOhneKi, aendernOhneKi, reihenfolge, frageText, gesundheitText, alsSatz, kuerzen,
  };
});
