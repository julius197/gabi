/* Gabi Brain – Suche: deutsche Normalisierung, Rangfolge (BM25 über Titel, Tags, Inhalt), Filter und die Auswahl
   des Kontexts, den Gabi für eine Praxisfrage bekommt. Reine Funktionen ohne Browser – auch in Node und im Worker
   nutzbar. Der Demo-Assistent antwortet mit antwortAusKontext() rein aus den übergebenen Knoten (nichts dazuerfunden). */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else wurzel.GabiBrainSuche = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TAG_MS = 86400000;
  const VERALTET_TAGE = 90;
  /** Nur diese Arten bekommt Gabi als Praxiswissen – nie Patienten, Notizen oder Berichte. */
  const KONTEXT_ARTEN = ["praxiswissen", "frage", "vorlage"];
  const NICHTS_IM_BRAIN = "Dazu steht noch nichts im Brain.";

  // ---------- Normalisierung ----------
  /** Vergleichsform: klein, Umlaute gefaltet (ä → ae), Akzente weg, alles außer Buchstaben/Ziffern wird Leerzeichen. */
  function normal(text) {
    return String(text == null ? "" : text)
      .normalize("NFC") // zerlegte Umlaute (z. B. Dateinamen vom Mac) erst zusammensetzen – sonst würde „ö“ zu „o“ statt „oe“
      .toLowerCase()
      .replace(/€/g, " euro ")
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const FUELLWOERTER = new Set((
    "der die das den dem des ein eine einer eines einem einen und oder aber auch nicht kein keine keinen ist sind war waren wird werden wurde " +
    "hat haben habe hast habt hatte seid kann kannst koennen koennt man ich du er sie es wir ihr mir mich dir dich uns euch ihm ihn ihnen mein meine dein deine " +
    "sein seine unser unsere euer eure von vom zu zum zur mit bei beim fuer auf aus an am im in ins um ueber unter nach vor bis durch als wie was wer " +
    "wo wann warum wieso weshalb welche welcher welches welchen dass ob wenn dann denn noch schon nur sehr mal bitte gibt gib geht gabi sich so da hier " +
    "dort dazu davon diese dieser dieses diesen heute etwas alle alles mehr viel viele gern gerne eigentlich doch ja nein sag sage sagen weisst weiss " +
    "wissen bietet bieten biete anbieten macht machen mach tun tut soll sollen muss muessen darf duerfen will wollen moechte genau denn eure eurer " +
    "euren bitte danke hallo steht stehen laut zb bzw usw etc pro je"
  ).split(" "));

  /** Leichtes deutsches Stemming: eine Endung weg, der Stamm bleibt mindestens 4 Zeichen lang. Zahlen bleiben. */
  function stamm(wort) {
    if (wort.length < 5 || /\d/.test(wort)) return wort;
    for (const endung of ["ern", "em", "en", "er", "es", "e", "n", "s"]) {
      if (wort.endsWith(endung) && wort.length - endung.length >= 4) return wort.slice(0, -endung.length);
    }
    return wort;
  }

  /** Alle Wortstämme eines Texts (mit Wiederholungen, in Reihenfolge). */
  function stammListe(text) {
    const liste = [];
    for (const w of normal(text).split(" ")) {
      if (!w || (w.length < 2 && !/\d/.test(w))) continue;
      liste.push(stamm(w));
    }
    return liste;
  }

  /** Suchwörter einer Anfrage: Wortstämme ohne Füllwörter, jedes nur einmal. */
  function woerter(text) {
    const gesehen = new Set();
    for (const w of normal(text).split(" ")) {
      if (!w || FUELLWOERTER.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
      gesehen.add(stamm(w));
    }
    return [...gesehen];
  }

  // Wortfelder: wer nach „Kosten“ fragt, meint auch „Preis“. Bewusst klein gehalten (Wortstämme in Vergleichsform).
  const WORTFELDER = [
    ["preis", "kost", "kostet", "teuer", "gebuehr", "tarif", "euro", "bezahl", "selbstzahl"],
    ["standort", "adress", "anfahrt", "anschrift", "strass"],
    ["oeffnungszeit", "geoeffnet", "sprechzeit", "sprechstund"],
    ["telefon", "anruf", "anrufen", "nummer", "erreich", "erreichbar"],
    ["email", "mail"],
    ["termin", "terminbuchung", "buchen", "anmeld", "anmeldung", "vereinbar"],
    ["kass", "krankenkass", "gesetzlich", "versichert", "privat", "privatpraxis", "abrechn", "abrechnung"],
    ["rezept", "verordnung", "ueberweisung"],
    ["park", "parkplatz", "parkplaetz", "barrierefrei", "barrierefreiheit", "rollstuhl", "aufzug"],
    ["kind", "jugend", "jugendlich", "youngster"],
    ["team", "mitarbeit", "mitarbeiter", "kolleg", "personal"],
    ["inhaber", "chef", "gruender", "besitzer"],
    ["gegruendet", "gruendung", "geschicht", "entstehung"],
    ["leistung", "angebot", "behandlung", "therapi"],
    ["training", "trainier", "trainingszeit", "geraetetraining", "trainingstherapi"],
    ["partner", "kooperation", "kooperationspartner", "referenz"],
  ];
  const FELD_ZU_WORT = new Map();
  // unter dem Wort und unter seinem Stamm: gesucht wird immer mit Stämmen („Preis“ → „prei“, „Inhaber“ → „inhab“)
  for (const feld of WORTFELDER) for (const w of feld) { FELD_ZU_WORT.set(w, feld); FELD_ZU_WORT.set(stamm(w), feld); }
  // Fragewörter sind Füllwörter, sagen aber, wonach gesucht wird
  const FRAGEWORT = { wo: ["standort", "adress"], wann: ["zeit", "uhr"], wieviel: ["preis"] };

  /** Wie gut passt ein Suchwort zu einem Wort aus dem Bestand? 1 = gleich, 0,7 = Wortanfang, 0,45 = Teil eines Kompositums oder verwandt. */
  function passung(suchwort, wort) {
    if (suchwort === wort) return 1;
    if (/^\d+$/.test(suchwort) || /^\d+$/.test(wort)) return 0; // Zahlen nur genau
    const kurz = suchwort.length <= wort.length ? suchwort : wort;
    const lang = suchwort.length <= wort.length ? wort : suchwort;
    if (kurz.length >= 4 && lang.startsWith(kurz)) return 0.7;
    if (kurz.length >= 5 && lang.includes(kurz)) return 0.45;
    // verwandt: langer gemeinsamer Wortanfang („trainieren“ ↔ „Training“)
    let gleich = 0;
    while (gleich < kurz.length && kurz[gleich] === lang[gleich]) gleich++;
    if (gleich >= 6 && gleich >= kurz.length * 0.7) return 0.45;
    return 0;
  }

  // ---------- Index ----------
  const GEWICHT = { titel: 3, tags: 2, inhalt: 1 };
  const ohneVerweise = (text) => String(text == null ? "" : text).replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");

  /**
   * Index über Knoten: je Knoten die gewichteten Häufigkeiten der Wortstämme (Titel ×3, Tags ×2, Inhalt ×1).
   * Für ein paar hundert Knoten in wenigen Millisekunden gebaut – deshalb einfach bei jeder Änderung neu.
   */
  function erstelleIndex(knoten) {
    const docs = [];
    const vokabular = new Map(); // Wortstamm → Liste der Dokument-Nummern
    let summe = 0;
    for (const k of Array.isArray(knoten) ? knoten : []) {
      if (!k || !k.id) continue;
      const haeufig = new Map();
      let laenge = 0;
      const zaehlen = (text, gewicht) => {
        for (const w of stammListe(text)) {
          if (FUELLWOERTER.has(w)) continue;
          haeufig.set(w, (haeufig.get(w) || 0) + gewicht);
          laenge += gewicht;
        }
      };
      zaehlen(k.titel, GEWICHT.titel);
      zaehlen((Array.isArray(k.tags) ? k.tags : []).join(" "), GEWICHT.tags);
      zaehlen(ohneVerweise(k.inhalt), GEWICHT.inhalt);
      const nr = docs.length;
      docs.push({ id: k.id, haeufig, laenge: laenge || 1, titel: new Set(stammListe(k.titel)) });
      summe += laenge || 1;
      for (const w of haeufig.keys()) {
        if (!vokabular.has(w)) vokabular.set(w, []);
        vokabular.get(w).push(nr);
      }
    }
    return { docs, vokabular, mittel: docs.length ? summe / docs.length : 1 };
  }

  const K1 = 1.2;
  const B = 0.75;

  /**
   * Suche mit Rangfolge. praefix: das letzte getippte Wort zählt schon als Wortanfang (Suche beim Tippen).
   * Ergebnis: [{ id, punkte, woerter, deckung, stark }] – deckung = Anteil der Suchwörter, die direkt vorkommen;
   * stark = mindestens ein Suchwort steht im Knoten (wörtlich, als Wortanfang, als Wortteil oder verwandt).
   */
  function suchen(index, anfrage, { limit = 20, praefix = true } = {}) {
    if (!index || !index.docs.length) return [];
    const roh = normal(anfrage).split(" ").filter(Boolean);
    const such = woerter(anfrage);
    const zusatz = []; // Wortfelder und Fragewörter – zählen schwächer
    for (const w of roh) if (FRAGEWORT[w]) zusatz.push(...FRAGEWORT[w]);
    if (roh.includes("wie") && roh.includes("viel")) zusatz.push(...FRAGEWORT.wieviel);
    const letztes = praefix && roh.length ? roh[roh.length - 1] : "";
    if (!such.length && !zusatz.length && !(letztes && letztes.length >= 2)) return [];

    const N = index.docs.length;
    const punkte = new Float64Array(N);
    const direkt = new Float64Array(N); // Zahl der Suchwörter mit direktem Treffer
    const staerke = new Float64Array(N);
    const gefunden = Array.from({ length: N }, () => null);

    /** tf je Dokument für ein Suchwort (über alle passenden Wörter des Bestands). */
    const treffer = (suchwort, { mindest = 0.45, alsAnfang = false } = {}) => {
      const tf = new Map();
      for (const [wort, nummern] of index.vokabular) {
        let p = passung(suchwort, wort);
        if (alsAnfang && suchwort.length >= 2 && wort.startsWith(suchwort)) p = Math.max(p, 0.8);
        if (p < mindest) continue;
        for (const nr of nummern) {
          const alt = tf.get(nr) || { tf: 0, p: 0, wort: "" };
          alt.tf += (p >= 1 ? 1 : p * p) * index.docs[nr].haeufig.get(wort); // ungenaue Treffer zählen deutlich schwächer
          if (p > alt.p) { alt.p = p; alt.wort = wort; }
          tf.set(nr, alt);
        }
      }
      return tf;
    };
    const werten = (tf, faktor, zaehlt) => {
      if (!tf.size) return;
      const idf = Math.log(1 + (N - tf.size + 0.5) / (tf.size + 0.5));
      for (const [nr, t] of tf) {
        const d = index.docs[nr];
        punkte[nr] += faktor * idf * ((t.tf * (K1 + 1)) / (t.tf + K1 * (1 - B + B * (d.laenge / index.mittel))));
        if (zaehlt) {
          direkt[nr] += 1;
          if (t.p > staerke[nr]) staerke[nr] = t.p;
          (gefunden[nr] || (gefunden[nr] = new Set())).add(t.wort);
        }
      }
    };

    such.forEach((w, i) => {
      const letzter = praefix && i === such.length - 1 && stamm(letztes) === w;
      werten(treffer(w, { alsAnfang: letzter }), 1, true);
      // Wortfeld: nur genaue Treffer und Wortanfänge, deutlich schwächer
      for (const verwandt of FELD_ZU_WORT.get(w) || []) if (verwandt !== w) werten(treffer(verwandt, { mindest: 0.7 }), 0.35, false);
    });
    // noch kein Wort zu Ende getippt (z. B. „ko“): als Wortanfang suchen
    if (praefix && letztes.length >= 2 && !such.includes(stamm(letztes)) && !FUELLWOERTER.has(letztes)) werten(treffer(letztes, { mindest: 0.8, alsAnfang: true }), 1, true);
    for (const w of new Set(zusatz)) werten(treffer(w, { mindest: 0.7 }), 0.3, false);

    const anzahl = Math.max(1, such.length);
    const ergebnis = [];
    for (let nr = 0; nr < N; nr++) {
      if (!(punkte[nr] > 0)) continue;
      const d = index.docs[nr];
      const deckung = Math.min(1, direkt[nr] / anzahl);
      // Titel trägt die Frage ganz: deutlich nach vorn
      const imTitel = such.length ? such.filter((w) => [...d.titel].some((t) => passung(w, t) >= 0.7)).length / such.length : 0;
      // steht ein Suchwort genau so im Titel („Trainingszeiten“), schlägt das jeden bloßen Wortanfang („Training“)
      const genauImTitel = such.length ? such.filter((w) => d.titel.has(w)).length / such.length : 0;
      const wert = punkte[nr] * (0.6 + 0.4 * deckung) * (1 + 0.5 * imTitel + 0.6 * genauImTitel);
      ergebnis.push({ id: d.id, punkte: wert, woerter: gefunden[nr] ? [...gefunden[nr]] : [], deckung, stark: staerke[nr] >= 0.45, imTitel });
    }
    ergebnis.sort((a, b) => b.punkte - a.punkte || (a.id < b.id ? -1 : 1));
    return ergebnis.slice(0, limit);
  }

  // ---------- Filter ----------
  const anzahlVon = (nutzung, id) => {
    const n = nutzung instanceof Map ? nutzung.get(id) : nutzung && nutzung[id];
    return n ? Number(n.anzahl) || 0 : 0;
  };
  /** Gespeicherter Knoten, seit über 90 Tagen nicht geändert (offene Fragen sind „zu klären“, nicht „veraltet“). */
  function istVeraltet(k, jetzt = Date.now()) {
    return Boolean(k && !k.abgeleitet && !k.geloescht && k.status !== "zu_klaeren" && Number(k.geaendert) > 0 && jetzt - Number(k.geaendert) > VERALTET_TAGE * TAG_MS);
  }
  /** Bestätigtes Praxiswissen, das Gabi noch nie für eine Antwort verwendet hat. */
  function istNieVerwendet(k, nutzung) {
    return Boolean(k && !k.abgeleitet && !k.geloescht && KONTEXT_ARTEN.includes(k.art) && k.status === "bestaetigt" && anzahlVon(nutzung, k.id) === 0);
  }

  /** Knoten filtern: { arten, status, tag, zuKlaeren, veraltet, nieVerwendet, verwendet } – leere Angaben filtern nicht. */
  function filtern(knoten, filter = {}, { nutzung = null, jetzt = Date.now() } = {}) {
    const arten = filter.arten && filter.arten.length ? new Set(filter.arten) : null;
    const status = filter.status && filter.status.length ? new Set(filter.status) : null;
    const tag = filter.tag ? normal(filter.tag) : "";
    return (Array.isArray(knoten) ? knoten : []).filter((k) => {
      if (!k) return false;
      if (arten && !arten.has(k.art)) return false;
      if (status && !status.has(k.status)) return false;
      if (tag && !(Array.isArray(k.tags) ? k.tags : []).some((t) => normal(t) === tag)) return false;
      if (filter.zuKlaeren && k.status !== "zu_klaeren") return false;
      if (filter.veraltet && !istVeraltet(k, jetzt)) return false;
      if (filter.nieVerwendet && !istNieVerwendet(k, nutzung)) return false;
      if (filter.verwendet && !(anzahlVon(nutzung, k.id) > 0)) return false;
      return true;
    });
  }

  // ---------- Kontext für Gabi ----------
  /** Text auf höchstens max Zeichen kürzen – möglichst am Zeilen- oder Satzende, mit „…“. */
  function kuerzen(text, max) {
    const t = String(text == null ? "" : text).trim();
    if (t.length <= max) return t;
    const stueck = t.slice(0, Math.max(1, max - 2));
    const grenze = Math.max(stueck.lastIndexOf("\n"), stueck.lastIndexOf(". "), stueck.lastIndexOf("; "));
    return `${(grenze > max * 0.5 ? stueck.slice(0, grenze + 1) : stueck).trimEnd()} …`;
  }

  /**
   * Die besten Knoten für eine Praxisfrage: Rangfolge über Titel/Tags/Inhalt, dazu Nachbarn über Verweise (ein Sprung),
   * höchstens maxKnoten und rund maxZeichen. Nur Praxiswissen, Fragen und Vorlagen – nie Patienten, Notizen, Berichte,
   * nie der Papierkorb. Der Status geht mit (Entwürfe und „zu klären“ kennzeichnet Gabi in der Antwort).
   */
  function kontextWaehlen({ frage, knoten, kanten = [], maxKnoten = 8, maxZeichen = 6000, proKnoten = 1500, index = null } = {}) {
    const kandidaten = (Array.isArray(knoten) ? knoten : []).filter((k) => k && k.id && !k.geloescht && !k.abgeleitet && KONTEXT_ARTEN.includes(k.art));
    if (!kandidaten.length || !String(frage || "").trim()) return [];
    const nachId = new Map(kandidaten.map((k) => [k.id, k]));
    const treffer = suchen(index || erstelleIndex(kandidaten), frage, { limit: 24, praefix: false }).filter((t) => nachId.has(t.id));
    if (!treffer.length) return [];
    const bester = treffer[0].punkte;
    // nur was wirklich zur Frage gehört: ein Suchwort steht da und der Abstand zum besten Treffer ist nicht zu groß
    const direkt = treffer.filter((t) => t.stark && t.punkte >= bester * 0.25).slice(0, Math.max(1, maxKnoten - 2));
    if (!direkt.length) return [];
    const reihe = direkt.map((t) => t.id);
    const drin = new Set(reihe);
    // Nachbarn der zwei besten: ausdrückliche Verweise immer, „gehört zu“ nur, wenn der Nachbar selbst zur Frage passt
    const punkteVon = new Map(treffer.map((t) => [t.id, t.punkte]));
    const nachbarn = [];
    for (const id of reihe.slice(0, 2)) {
      for (const kante of Array.isArray(kanten) ? kanten : []) {
        if (!kante || (kante.von !== id && kante.nach !== id)) continue;
        const anderer = kante.von === id ? kante.nach : kante.von;
        if (drin.has(anderer) || !nachId.has(anderer)) continue;
        const p = punkteVon.get(anderer) || 0;
        if (kante.art === "verweis" || p > 0) nachbarn.push({ id: anderer, p: p + (kante.art === "verweis" ? bester * 0.1 : 0) });
      }
    }
    nachbarn.sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1));
    for (const n of nachbarn) {
      if (reihe.length >= maxKnoten) break;
      if (!drin.has(n.id)) { drin.add(n.id); reihe.push(n.id); }
    }
    const ergebnis = [];
    let rest = maxZeichen;
    for (const id of reihe) {
      const k = nachId.get(id);
      const titel = String(k.titel || "").trim();
      const platz = Math.min(proKnoten, rest - titel.length);
      if (platz < 80 && ergebnis.length) continue; // passt nicht mehr sinnvoll hinein
      // [[Verweise]] bleiben stehen: ein Änderungsvorschlag, der auf dem Kontext aufbaut, löschte sonst die Verbindungen
      const inhalt = kuerzen(k.inhalt, Math.max(80, platz));
      rest -= titel.length + inhalt.length;
      ergebnis.push({ id: k.id, art: k.art, status: k.status, titel, inhalt, tags: (Array.isArray(k.tags) ? k.tags : []).slice(0, 8) });
      if (rest <= 0) break;
    }
    return ergebnis;
  }

  // ---------- Antwort ohne KI (Demo-Assistent) ----------
  const einzeilig = (text, max = 200) => kuerzen(String(text || "").replace(/\s+/g, " ").trim(), max);
  /** Zeilen eines Inhalts ohne Listenzeichen, Überschriften-Rauten und [[ ]]; wiederholt die erste Zeile den Titel, fällt er dort weg. */
  function zeilenVon(inhalt, titel = "") {
    const zeilen = ohneVerweise(inhalt).split("\n").map((z) => z.replace(/^\s*(?:[-•*–]|\d{1,2}[.)])\s+/, "").replace(/^#{1,6}\s+/, "").trim())
      .filter((z) => z && !/^(?:siehe auch|betrifft)\s*:/i.test(z)); // reine Verweis-Zeilen gehören nicht in die Antwort
    const t = String(titel || "").trim();
    if (t && zeilen.length && zeilen[0].toLowerCase().startsWith(`${t.toLowerCase()}:`)) {
      zeilen[0] = zeilen[0].slice(t.length + 1).trim();
      if (!zeilen[0]) zeilen.shift();
    }
    return zeilen;
  }
  /** Steht ein Wort aus dem Wortfeld des Suchworts in dieser Wortliste? */
  const imWortfeld = (suchwort, wortliste) => (FELD_ZU_WORT.get(suchwort) || []).some((v) => v !== suchwort && wortliste.some((x) => passung(v, x) >= 0.7));
  /** Steht das Suchwort (oder ein Wort aus seinem Wortfeld) in dieser Wortliste? */
  const kommtVor = (suchwort, wortliste) => wortliste.some((x) => passung(suchwort, x) >= 0.45) || imWortfeld(suchwort, wortliste);
  /** … und zwar deutlich: wörtlich, als Wortanfang oder über das Wortfeld – nicht nur als Teil eines längeren Worts. */
  const kommtDeutlichVor = (suchwort, wortliste) => wortliste.some((x) => passung(suchwort, x) >= 0.7) || imWortfeld(suchwort, wortliste);

  /**
   * Antwort rein aus den übergebenen Kontext-Knoten (Demo-Modus und lokaler Betrieb ohne KI): passende Zeilen wörtlich,
   * Entwürfe und offene Punkte gekennzeichnet. Passt nichts wirklich zur Frage: „Dazu steht noch nichts im Brain.“ und
   * die Frage als Lücke. Es steht nie etwas in der Antwort, das nicht in einem der Knoten steht.
   */
  function antwortAusKontext(frage, kontextKnoten) {
    const such = woerter(frage);
    const liste = (Array.isArray(kontextKnoten) ? kontextKnoten : []).filter((k) => k && k.id && k.titel);
    const luecke = { text: NICHTS_IM_BRAIN, quellen: [], luecke: einzeilig(frage) };
    if (!liste.length || !such.length) return luecke;

    const bewertet = liste.map((k, rang) => {
      const kopf = [...stammListe(k.titel), ...stammListe((k.tags || []).join(" "))];
      const zeilen = zeilenVon(k.inhalt, k.titel).map((text) => {
        const w = stammListe(text);
        return { text, treffer: such.filter((s) => kommtVor(s, w)).length };
      });
      const alle = [...kopf, ...zeilen.flatMap((z) => stammListe(z.text))];
      const getroffen = such.filter((s) => kommtVor(s, alle)).length;
      const deutlich = such.some((s) => kommtDeutlichVor(s, alle));
      const imTitel = such.filter((s) => kopf.some((x) => passung(s, x) >= 0.7)).length;
      return { k, rang, zeilen, getroffen, deutlich, imTitel, staerke: getroffen / such.length + imTitel * 0.25 };
    });
    // passt wirklich: mindestens die halbe Frage – und bei mehreren Suchwörtern zwei davon oder eines im Titel/Tag.
    // Ein bloßer Wortteil reicht nie („Videotermine“ ist keine Frage nach „Termine“) – das bleibt eine Lücke.
    const passend = bewertet
      .filter((b) => b.deutlich && b.getroffen / such.length >= 0.5 && (such.length === 1 || b.getroffen >= 2 || b.imTitel >= 1))
      .sort((a, b) => b.staerke - a.staerke || a.rang - b.rang);
    if (!passend.length) return luecke;

    const nah = passend.filter((b) => b.staerke >= passend[0].staerke * 0.75);
    const fakten = nah.filter((b) => b.k.status !== "zu_klaeren").slice(0, 3);
    const offen = nah.filter((b) => b.k.status === "zu_klaeren").slice(0, 2);
    const teile = [];
    let laenge = 0;
    for (const b of fakten) {
      const { k } = b;
      let zeilen = b.zeilen.map((z) => z.text);
      if (zeilen.join(" ").length > 420) {
        const gute = b.zeilen.filter((z) => z.treffer > 0).slice(0, 4).map((z) => z.text);
        zeilen = gute.length ? gute : zeilen.slice(0, 3);
      }
      const vorsatz = k.status === "entwurf" ? "Laut Entwurf (noch nicht bestätigt) – " : "";
      const text = zeilen.length <= 1 ? `${vorsatz}**${k.titel}:** ${zeilen[0] || ""}`.trim() : `${vorsatz}**${k.titel}:**\n${zeilen.map((z) => `- ${z}`).join("\n")}`;
      if (teile.length && laenge + text.length > 900) break;
      teile.push({ text, id: k.id });
      laenge += text.length;
    }
    for (const b of offen) {
      const erste = b.zeilen.length ? ` – ${einzeilig(b.zeilen[0].text, 220)}` : "";
      teile.push({ text: `${fakten.length ? "Noch offen im Brain" : "Das ist im Brain noch offen"}: **${b.k.titel}**${erste}`, id: b.k.id });
    }
    return { text: teile.map((t) => t.text).join("\n\n"), quellen: teile.map((t) => t.id), luecke: "" };
  }

  return {
    KONTEXT_ARTEN, NICHTS_IM_BRAIN, VERALTET_TAGE,
    normal, stamm, woerter, passung, erstelleIndex, suchen, filtern, istVeraltet, istNieVerwendet, kuerzen, ohneVerweise,
    kontextWaehlen, antwortAusKontext,
  };
});
